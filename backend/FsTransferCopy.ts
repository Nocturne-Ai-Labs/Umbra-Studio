import * as fs from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

export type CopyProgress = (bytes: number, total: number, path: string) => void;
type TransferSnapshot = { path: string; stat: BigIntStats; children?: string[]; copied?: CopiedPath };
type CopiedPath = { path: string; stat: BigIntStats; preserveChanges?: boolean };

async function removeOwnedCopy(entry: CopiedPath): Promise<void> {
  const current = await fs.lstat(entry.path, { bigint: true }).catch(() => null);
  if (!current || current.dev !== entry.stat.dev || current.ino !== entry.stat.ino) return;
  if (entry.preserveChanges && (current.size !== entry.stat.size || current.mtimeNs !== entry.stat.mtimeNs)) return;
  if (current.isDirectory() && !current.isSymbolicLink()) {
    // Never recursively erase a destination: another process may have added files.
    await fs.rmdir(entry.path).catch(() => undefined);
  } else {
    await fs.unlink(entry.path).catch(() => undefined);
  }
}

// Own the destination exclusively; never replace a file created by another job.
export async function copyFileExclusive(source: string, target: string, onProgress?: CopyProgress, onCreated?: (stat: BigIntStats) => void | Promise<void>) {
  const input = await fs.open(source, 'r');
  let output: Awaited<ReturnType<typeof fs.open>> | undefined;
  let complete = false;
  let owned: CopiedPath | undefined;
  try {
    const before = await input.stat({ bigint: true });
    output = await fs.open(target, 'wx');
    owned = { path: target, stat: await output.stat({ bigint: true }) };
    await onCreated?.(owned.stat);
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let copied = 0;
    let lastReport = 0;
    onProgress?.(0, Number(before.size), source);
    while (true) {
      const { bytesRead } = await input.read(buffer, 0, buffer.length, null);
      if (!bytesRead) break;
      let written = 0;
      while (written < bytesRead) {
        const result = await output.write(buffer, written, bytesRead - written, null);
        if (!result.bytesWritten) throw new Error('Destination stopped accepting data');
        written += result.bytesWritten;
      }
      copied += bytesRead;
      if (Date.now() - lastReport >= 150) {
        onProgress?.(copied, Number(before.size), source);
        lastReport = Date.now();
      }
    }
    const after = await input.stat({ bigint: true });
    if (BigInt(copied) !== before.size || after.size !== before.size || after.mtimeNs !== before.mtimeNs) {
      throw new Error('Source changed during transfer; original retained');
    }
    await output.utimes(before.atime, before.mtime);
    await output.sync();
    const copiedStat = await output.stat({ bigint: true });
    onProgress?.(copied, Number(before.size), source);
    complete = true;
    return copiedStat;
  } finally {
    try { await input.close(); }
    finally {
      if (output) {
        try { await output.close(); }
        finally { if (!complete && owned) await removeOwnedCopy(owned); }
      }
    }
  }
}

export async function copyTreeExclusive(source: string, target: string, onProgress?: CopyProgress, onFileDone?: (path: string) => Promise<void> | void, snapshot?: TransferSnapshot[]): Promise<void> {
  const sourceInfo = await fs.lstat(source);
  if (sourceInfo.isDirectory() && !sourceInfo.isSymbolicLink()) {
    const sourceReal = await fs.realpath(source);
    const targetReal = join(await fs.realpath(dirname(target)), basename(target));
    const inside = relative(sourceReal, targetReal);
    if (!inside || (!isAbsolute(inside) && inside !== '..' && !inside.startsWith(`..${sep}`))) {
      throw new Error('Cannot copy a folder into itself, including through a linked directory');
    }
  }
  const owned: CopiedPath[] = [];
  try { await copyTree(source, target, owned, onProgress, onFileDone, snapshot); }
  catch (error) {
    for (const entry of owned.reverse()) await removeOwnedCopy(entry);
    throw error;
  }
}

async function copyTree(source: string, target: string, owned: CopiedPath[], onProgress?: CopyProgress, onFileDone?: (path: string) => Promise<void> | void, snapshot?: TransferSnapshot[]): Promise<void> {
  const stats = await fs.lstat(source, { bigint: true });
  onProgress?.(0, stats.isFile() ? Number(stats.size) : 0, source);
  const entrySnapshot: TransferSnapshot = { path: source, stat: stats };
  snapshot?.push(entrySnapshot);
  if (stats.isSymbolicLink()) {
    const link = await fs.readlink(source);
    let type: 'file' | 'dir' | 'junction' | undefined;
    if (process.platform === 'win32') {
      const linked = await fs.stat(source).catch((error) => {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
        throw error;
      });
      if (linked?.isDirectory()) type = isAbsolute(link) ? 'junction' : 'dir';
    }
    await fs.symlink(link, target, type);
    entrySnapshot.copied = { path: target, stat: await fs.lstat(target, { bigint: true }) };
    owned.push(entrySnapshot.copied);
    await onFileDone?.(target);
    return;
  }
  if (!stats.isDirectory()) {
    const copied = await copyFileExclusive(source, target, onProgress);
    entrySnapshot.copied = { path: target, stat: copied, preserveChanges: true };
    owned.push(entrySnapshot.copied);
    await onFileDone?.(target);
    return;
  }
  await fs.mkdir(target);
  entrySnapshot.copied = { path: target, stat: await fs.lstat(target, { bigint: true }) };
  owned.push(entrySnapshot.copied);
  const entries = await fs.readdir(source);
  entrySnapshot.children = entries;
  for (const entry of entries) {
    await copyTree(join(source, entry), join(target, entry), owned, onProgress, onFileDone, snapshot);
  }
}

async function verifyCopiedDestination(entry: TransferSnapshot): Promise<void> {
  const copied = entry.copied;
  const current = copied ? await fs.lstat(copied.path, { bigint: true }).catch(() => null) : null;
  if (!copied || !current || current.ino !== copied.stat.ino || current.dev !== copied.stat.dev
    || (!copied.stat.isDirectory() && (current.size !== copied.stat.size || current.mtimeNs !== copied.stat.mtimeNs))) {
    throw new Error('Destination changed during transfer; remaining source retained');
  }
}

export async function moveTreeExclusive(source: string, target: string, onProgress?: CopyProgress, onFileDone?: (path: string) => Promise<void> | void): Promise<void> {
  const snapshot: TransferSnapshot[] = [];
  await copyTreeExclusive(source, target, onProgress, onFileDone, snapshot);
  // Verify both trees before removing anything. Never recursively delete a
  // live source tree: rmdir must reject files arriving after this snapshot.
  for (const entry of snapshot) {
    const current = await fs.lstat(entry.path, { bigint: true });
    if (entry.children) {
      const names = new Set(await fs.readdir(entry.path));
      if (names.size !== entry.children.length || entry.children.some(name => !names.has(name))) {
        throw new Error('Source changed during transfer; source and copied destination retained');
      }
    }
    if (current.ino !== entry.stat.ino || current.dev !== entry.stat.dev
      || current.size !== entry.stat.size || current.mtimeNs !== entry.stat.mtimeNs) {
      throw new Error('Source changed during transfer; source and copied destination retained');
    }
    await verifyCopiedDestination(entry);
  }
  for (const entry of [...snapshot].reverse()) {
    const directory = entry.stat.isDirectory() && !entry.stat.isSymbolicLink();
    const current = await fs.lstat(entry.path, { bigint: true });
    if (current.ino !== entry.stat.ino || current.dev !== entry.stat.dev
      || (!directory && (current.size !== entry.stat.size || current.mtimeNs !== entry.stat.mtimeNs))) {
      throw new Error('Source changed during transfer; remaining source and copied destination retained');
    }
    await verifyCopiedDestination(entry);
    if (directory) await fs.rmdir(entry.path);
    else await fs.unlink(entry.path);
  }
}

export async function moveFileExclusive(
  source: string,
  target: string,
  onProgress?: CopyProgress,
  retry: (label: string, operation: () => Promise<void>) => Promise<void> = async (_label, operation) => operation(),
): Promise<void> {
  const before = await fs.lstat(source, { bigint: true });
  if (!before.isFile()) throw new Error('Media source changed before move; original retained');
  onProgress?.(0, Number(before.size), source);
  try {
    // Hard-link publication is exclusive and preserves same-volume move speed.
    await retry('link-move', () => fs.link(source, target));
  } catch (error: any) {
    if (!['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS', 'EMLINK'].includes(error?.code)) throw error;
    await moveTreeExclusive(source, target, onProgress);
    return;
  }
  // On unlink failure keep both paths rather than risk erasing the only copy.
  await retry('unlink-move', async () => {
    const current = await fs.lstat(source, { bigint: true });
    const published = await fs.lstat(target, { bigint: true });
    if (current.ino !== before.ino || current.dev !== before.dev
      || published.ino !== before.ino || published.dev !== before.dev) {
      throw new Error('Source or destination changed during move; files retained');
    }
    await fs.unlink(source);
  });
}
