import { Database } from 'bun:sqlite';
import { mkdirSync, type BigIntStats } from 'node:fs';
import * as fs from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import type { ModelDownloadJob } from './ModelDownloadWorkerService';

type Identity = { dev: string; ino: string; birth: string; size: string; mtime: string };
export type DownloadReceipt = {
  job: ModelDownloadJob;
  phase: 'downloading' | 'ready' | 'copying' | 'published';
  directory?: string;
  partial?: string;
  partialIdentity?: Identity;
  targetIdentity?: Identity;
  recoveryPending?: boolean;
};

export function downloadFileIdentity(stat: BigIntStats): Identity {
  if (!stat.isFile()) throw new Error('Download path is not a regular file');
  return { dev: String(stat.dev), ino: String(stat.ino), birth: String(stat.birthtimeNs), size: String(stat.size), mtime: String(stat.mtimeNs) };
}

async function identity(path: string): Promise<Identity | null> {
  try { return downloadFileIdentity(await fs.lstat(path, { bigint: true })); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
function sameFile(a: Identity | null | undefined, b: Identity | null | undefined) {
  return Boolean(a && b && a.ino !== '0' && a.dev === b.dev && a.ino === b.ino && a.birth === b.birth);
}
function unchanged(a: Identity | null | undefined, b: Identity | null | undefined) {
  return sameFile(a, b) && a!.size === b!.size && a!.mtime === b!.mtime;
}

// Recovery compares bounded buffers, never loads a model into memory.
async function isPrefix(source: string, target: string, length: bigint): Promise<boolean> {
  const input = await fs.open(source, 'r');
  let output: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    output = await fs.open(target, 'r');
    const a = Buffer.allocUnsafe(1024 * 1024);
    const b = Buffer.allocUnsafe(a.length);
    let remaining = length;
    while (remaining > 0n) {
      const count = Number(remaining > BigInt(a.length) ? BigInt(a.length) : remaining);
      for (const [file, buffer] of [[input, a], [output, b]] as const) {
        let offset = 0;
        while (offset < count) {
          const { bytesRead } = await file.read(buffer, offset, count - offset, null);
          if (!bytesRead) return false;
          offset += bytesRead;
        }
      }
      if (!a.subarray(0, count).equals(b.subarray(0, count))) return false;
      remaining -= BigInt(count);
    }
    return true;
  } finally { await input.close(); await output?.close(); }
}

export class ModelDownloadJournal {
  private readonly owner: Database;
  private readonly db: Database;

  constructor(runtimeRoot: string) {
    if (!runtimeRoot) throw new Error('Model download worker requires an explicit runtime root');
    const folder = join(resolve(runtimeRoot), 'User', 'Config', 'ModelManager', 'Downloads');
    mkdirSync(folder, { recursive: true });
    this.owner = new Database(join(folder, 'owner.sqlite'));
    try {
      // OS locks release on worker death; a replacement must not recover live downloads.
      this.owner.exec('PRAGMA busy_timeout=10000; BEGIN EXCLUSIVE');
      this.db = new Database(join(folder, 'jobs.sqlite'));
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, receipt TEXT NOT NULL)');
    } catch (error) { this.owner.close(); throw error; }
  }

  save(receipt: DownloadReceipt) {
    // Signed download URLs, tokens and model snapshots are never durable job data.
    const safe = { ...receipt, job: { ...receipt.job, downloadUrl: '' } };
    this.db.query('INSERT OR REPLACE INTO jobs (id, receipt) VALUES (?, ?)').run(receipt.job.jobId, JSON.stringify(safe));
  }

  list(): DownloadReceipt[] {
    return (this.db.query('SELECT receipt FROM jobs ORDER BY rowid').all() as { receipt: string }[]).map(row => {
      const value = JSON.parse(row.receipt) as DownloadReceipt;
      if (!value.job?.jobId || !['downloading', 'ready', 'copying', 'published'].includes(value.phase)) {
        throw new Error('Invalid download recovery record; records and files were retained');
      }
      return value;
    });
  }

  remove(jobId: string) { this.db.query('DELETE FROM jobs WHERE id = ?').run(jobId); }

  async cleanup(receipt: DownloadReceipt): Promise<void> {
    if (!receipt.partial) return;
    if (!receipt.directory || await fs.realpath(dirname(receipt.partial)) !== receipt.directory) {
      throw new Error(`Download directory changed; inspect retained partial: ${receipt.partial}`);
    }
    const current = await identity(receipt.partial);
    if (!current) return;
    if (!sameFile(current, receipt.partialIdentity)) throw new Error(`Unverified partial retained: ${receipt.partial}`);
    await fs.unlink(receipt.partial);
  }

  async recover(): Promise<DownloadReceipt[]> {
    const receipts = this.list();
    for (const receipt of receipts) {
      const active = ['queued', 'downloading'].includes(receipt.job.status);
      if (!active && !receipt.recoveryPending) continue;
      try {
        let published = receipt.phase === 'published';
        if (receipt.partial) {
          if (!receipt.directory || await fs.realpath(dirname(receipt.partial)) !== receipt.directory
            || dirname(receipt.job.destinationPath) !== dirname(receipt.partial)) throw new Error('Download directory changed; files retained');
          const partial = await identity(receipt.partial);
          const target = await identity(receipt.job.destinationPath);
          if (published && !unchanged(target, receipt.targetIdentity)) throw new Error('Published model changed or is missing; check the destination');
          if (receipt.phase === 'ready' && target && unchanged(target, receipt.partialIdentity)) published = true;
          if (receipt.phase === 'copying' && target) {
            if (!sameFile(target, receipt.targetIdentity) || !unchanged(partial, receipt.partialIdentity)
              || BigInt(target.size) > BigInt(partial!.size)
              || !await isPrefix(receipt.partial, receipt.job.destinationPath, BigInt(target.size))
              || !unchanged(await identity(receipt.job.destinationPath), target)
              || !unchanged(await identity(receipt.partial), partial)) throw new Error('Unverified destination retained; inspect it before retrying');
            if (target.size === partial!.size) published = true;
            else await fs.unlink(receipt.job.destinationPath);
          }
          if (published) {
            receipt.targetIdentity = target!;
            receipt.phase = 'published';
            receipt.job.status = 'completed';
            receipt.job.progress = 100;
            receipt.job.error = '';
            this.save(receipt);
          }
        }
        if (!published && active) {
          receipt.job.status = 'failed';
          receipt.job.error = 'Download interrupted. Partial data was discarded; retry the download from its model page.';
        }
        await this.cleanup(receipt);
        receipt.recoveryPending = false;
      } catch (error) {
        receipt.recoveryPending = true;
        receipt.job.status = 'failed';
        receipt.job.error = `Download recovery needs attention: ${(error as Error).message}`;
      }
      receipt.job.finishedAt ||= Date.now();
      this.save(receipt);
    }
    return receipts;
  }

  close() { this.db.close(); this.owner.close(); }
}
