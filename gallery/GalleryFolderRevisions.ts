import { watch } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { createHash, type Hash } from 'node:crypto';

type WatchHandle = { close(): void; on(event: 'error', handler: () => void): unknown };
type FileStat = { size: number; mtimeMs: number; ctimeMs: number };
type Entry = {
  signature: string; revision: number; cursor: number; digest: Hash; completedDigest: string;
  watcher?: WatchHandle; watchRetryAt: number; nextSample: number; sampling: boolean;
  observedAt: number;
};
type Options = {
  capacity?: number;
  sampleSize?: number;
  sampleInterval?: number;
  now?: () => number;
  stat?: (path: string) => Promise<FileStat>;
  watch?: (path: string, changed: () => void) => WatchHandle;
};

export class GalleryFolderRevisions {
  private readonly entries = new Map<string, Entry>();
  private readonly capacity: number;
  private readonly sampleSize: number;
  private readonly interval: number;
  private readonly now: () => number;
  private readonly stat: (path: string) => Promise<FileStat>;
  private readonly watchFolder: (path: string, changed: () => void) => WatchHandle;
  private activeSamples = 0;
  private disposed = false;
  private revision = -1;

  constructor(options: Options = {}) {
    this.capacity = Math.max(1, Math.floor(options.capacity ?? 64));
    this.sampleSize = Math.max(1, Math.floor(options.sampleSize ?? 64));
    this.interval = Math.max(1, Math.floor(options.sampleInterval ?? 5000));
    this.now = options.now ?? Date.now;
    this.stat = options.stat ?? lstat;
    this.watchFolder = options.watch ?? ((path, changed) => watch(path, { persistent: false }, changed));
  }

  peek(path: string): number { return this.entries.get(path)?.revision ?? 0; }

  observe(path: string, signature: string, files: string[]): number {
    if (this.disposed) return 0;
    let entry = this.entries.get(path);
    if (!entry) {
      while (this.entries.size >= this.capacity) {
        const oldest = this.entries.entries().next().value!;
        oldest[1].watcher?.close();
        this.entries.delete(oldest[0]);
      }
      entry = { signature, revision: ++this.revision, cursor: 0, digest: createHash('sha256'), completedDigest: '', watchRetryAt: 0, nextSample: 0, sampling: false, observedAt: this.now() };
    } else {
      this.entries.delete(path);
      if (entry.signature !== signature) {
        entry.signature = signature;
        entry.cursor = 0;
        entry.digest = createHash('sha256');
        entry.completedDigest = '';
        entry.nextSample = 0;
      }
    }
    entry.observedAt = this.now();
    this.entries.set(path, entry);
    const current = entry;
    if (!entry.watcher && this.now() >= entry.watchRetryAt) {
      try {
        entry.watcher = this.watchFolder(path, () => {
          if (this.entries.get(path) === current) current.revision = ++this.revision;
        });
        entry.watcher.on('error', () => {
          current.watcher?.close(); current.watcher = undefined;
          current.watchRetryAt = this.now() + 30000;
        });
      } catch { entry.watchRetryAt = this.now() + 30000; }
    }
    if (!entry.sampling && this.activeSamples < 2 && this.now() >= entry.nextSample) {
      entry.sampling = true;
      entry.nextSample = this.now() + this.interval;
      this.activeSamples++;
      void this.sample(path, entry, signature, files).finally(() => { entry!.sampling = false; this.activeSamples--; });
    }
    return entry.revision;
  }

  private async sample(path: string, entry: Entry, signature: string, files: string[]) {
    // Digest identity also distinguishes inventories that changed and then
    // returned to the same names while a stat batch was in flight.
    const digest = entry.digest;
    const isCurrent = () => this.entries.get(path) === entry
      && entry.signature === signature && entry.digest === digest;
    try {
      const page = files.slice(entry.cursor, entry.cursor + this.sampleSize);
      const stats: FileStat[] = [];
      for (let offset = 0; offset < page.length; offset += 8) {
        if (!isCurrent()) return;
        const batch = await Promise.allSettled(page.slice(offset, offset + 8).map(file => this.stat(file)));
        for (const result of batch) {
          if (result.status === 'rejected') throw result.reason;
          stats.push(result.value);
        }
      }
      if (!isCurrent()) return;
      for (let i = 0; i < page.length; i++) {
        const stat = stats[i];
        entry.digest.update(JSON.stringify([page[i], stat.size, stat.mtimeMs, stat.ctimeMs]));
      }
      entry.cursor += page.length;
      if (entry.cursor >= files.length) {
        const digest = entry.digest.digest('hex');
        if (entry.completedDigest && entry.completedDigest !== digest) entry.revision = ++this.revision;
        entry.completedDigest = digest;
        entry.cursor = 0;
        entry.digest = createHash('sha256');
      }
    } catch {
      // Keep the previous revision and retry later; never interpret an offline
      // cloud folder or a sharing violation as an empty/deleted directory.
      if (isCurrent()) entry.nextSample = this.now() + 30000;
    }
  }

  retireIdle(maxIdleMs = 5 * 60_000) {
    const cutoff = this.now() - maxIdleMs;
    for (const [path, entry] of this.entries) {
      if (entry.observedAt > cutoff) continue;
      entry.watcher?.close();
      this.entries.delete(path);
    }
  }

  close() {
    this.disposed = true;
    for (const entry of this.entries.values()) entry.watcher?.close();
    this.entries.clear();
  }
}
