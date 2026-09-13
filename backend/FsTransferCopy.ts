import * as fs from 'node:fs/promises';
import { join } from 'node:path';

export type CopyProgress = (bytes: number, total: number, path: string) => void;
type TransferSnapshot = { path: string; stat: Awaited<ReturnType<typeof fs.lstat>>; children?: string[] };

// Own the destination exclusively; never replace a file created by another job.
export async function copyFileExclusive(source: string, target: string, onProgress?: CopyProgress) {
  const input = await fs.open(source, 'r');
  let output: Awaited<ReturnType<typeof fs.open>> | undefined;
  let complete = false;
  try {
    const before = await input.stat();
    output = await fs.open(target, 'wx');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let copied = 0;
    let lastReport = 0;
    onProgress?.(0, before.size, source);
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
        onProgress?.(copied, before.size, source);
        lastReport = Date.now();
      }
    }
    const after = await input.stat();
    if (copied !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error('Source changed during transfer; original retained');
    }
    await output.utimes(before.atime, before.mtime);
    await output.sync();
    onProgress?.(copied, before.size, source);
    complete = true;
  } finally {
    await input.close();
    if (output) {
      await output.close();
      if (!complete) await fs.unlink(target).catch(() => undefined);
    }
  }
}

export async function copyTreeExclusive(source: string, target: string, onProgress?: CopyProgress, onFileDone?: (path: string) => Promise<void> | void, snapshot?: TransferSnapshot[]): Promise<void> {
  const stats = await fs.lstat(source);
  onProgress?.(0, stats.isFile() ? stats.size : 0, source);
  const entrySnapshot: TransferSnapshot = { path: source, stat: stats };
  snapshot?.push(entrySnapshot);
  if (stats.isSymbolicLink()) {
    await fs.symlink(await fs.readlink(source), target);
    await onFileDone?.(target);
    return;
  }
  if (!stats.isDirectory()) {
    await copyFileExclusive(source, target, onProgress);
    await onFileDone?.(target);
    return;
  }
  await fs.mkdir(target);
  try {
    const entries = await fs.readdir(source);
    entrySnapshot.children = entries;
    for (const entry of entries) {
      await copyTreeExclusive(join(source, entry), join(target, entry), onProgress, onFileDone, snapshot);
    }
  } catch (error) {
    // This directory was created exclusively by this copy; sources are untouched.
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3 });
    throw error;
  }
}

export async function moveTreeExclusive(source: string, target: string, onProgress?: CopyProgress, onFileDone?: (path: string) => Promise<void> | void): Promise<void> {
  const snapshot: TransferSnapshot[] = [];
  await copyTreeExclusive(source, target, onProgress, onFileDone, snapshot);
  // Verify the whole source before removing anything. Never recursively delete a
  // live source tree: rmdir must reject files arriving after this snapshot.
  for (const entry of snapshot) {
    const current = await fs.lstat(entry.path);
    if (entry.children) {
      const names = new Set(await fs.readdir(entry.path));
      if (names.size !== entry.children.length || entry.children.some(name => !names.has(name))) {
        throw new Error('Source changed during transfer; source and copied destination retained');
      }
    }
    if (current.ino !== entry.stat.ino || current.dev !== entry.stat.dev
      || current.size !== entry.stat.size || current.mtimeMs !== entry.stat.mtimeMs) {
      throw new Error('Source changed during transfer; source and copied destination retained');
    }
  }
  for (const entry of [...snapshot].reverse()) {
    if (entry.stat.isDirectory() && !entry.stat.isSymbolicLink()) {
      await fs.rmdir(entry.path);
    } else {
      const current = await fs.lstat(entry.path);
      if (current.ino !== entry.stat.ino || current.size !== entry.stat.size || current.mtimeMs !== entry.stat.mtimeMs) {
        throw new Error('Source changed during transfer; remaining source and copied destination retained');
      }
      await fs.unlink(entry.path);
    }
  }
}
