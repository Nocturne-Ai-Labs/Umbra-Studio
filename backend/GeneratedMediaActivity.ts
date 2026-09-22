import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { writeUpdateJsonAtomic } from '../shared/updateStateFile';

const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.tif', '.tiff', '.gif', '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.wmv']);
type FolderActivity = { path: string; count: number; updatedAt: number };

// Counts are updated only by successful output publishers, never by directory scans.
export class GeneratedMediaActivity {
  private folders = new Map<string, FolderActivity>();
  private seen = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private epoch = randomUUID();

  constructor(private root: string, private statePath?: string) {
    if (!statePath) return;
    try {
      const data = JSON.parse(readFileSync(statePath, 'utf8'));
      if (data.version !== 1 || typeof data.epoch !== 'string' || !Array.isArray(data.folders)) return;
      this.epoch = data.epoch;
      for (const entry of data.folders) {
        if (typeof entry.path === 'string' && Number.isSafeInteger(entry.count) && entry.count > 0 && Number.isFinite(entry.updatedAt)) {
          this.folders.set(this.key(entry.path), entry);
        }
      }
      this.seen = new Set((Array.isArray(data.seen) ? data.seen : []).filter((id: unknown) => typeof id === 'string').slice(-20_000));
    } catch { /* A missing/corrupt notification cache must not affect generation. */ }
  }

  private key(path: string): string {
    const full = resolve(this.root, path);
    return process.platform === 'win32' ? full.toLowerCase() : full;
  }

  record(paths: string[]): void {
    let changed = false;
    for (const path of paths) {
      if (!path || !MEDIA.has(extname(path).toLowerCase())) continue;
      const full = resolve(this.root, path);
      const id = createHash('sha256').update(this.key(full)).digest('hex');
      if (this.seen.has(id)) continue;
      this.seen.add(id);
      if (this.seen.size > 20_000) this.seen.delete(this.seen.values().next().value!);
      const folder = dirname(full);
      const key = this.key(folder);
      this.folders.set(key, { path: folder, count: (this.folders.get(key)?.count || 0) + 1, updatedAt: Date.now() });
      changed = true;
    }
    if (changed && this.statePath && !this.timer) {
      this.timer = setTimeout(() => { void this.flush(); }, 1000);
      this.timer.unref?.();
    }
  }

  snapshot(paths: string[], allowed: (path: string) => boolean, clientPath: (path: string) => string) {
    const entries = [...this.folders.values()].filter(entry => allowed(entry.path));
    const folders = paths.map(path => ({ path, entries: [] as Array<{ id: string; count: number }> }));
    const requestedByKey = new Map<string, typeof folders>();
    for (const folder of folders) {
      const key = this.key(folder.path);
      const matching = requestedByKey.get(key) || [];
      matching.push(folder);
      requestedByKey.set(key, matching);
    }
    for (const entry of entries) {
      const item = { id: createHash('sha256').update(this.key(entry.path)).digest('hex'), count: entry.count };
      let ancestor = this.key(entry.path);
      while (true) {
        for (const folder of requestedByKey.get(ancestor) || []) folder.entries.push(item);
        const parent = dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
    }
    return {
      epoch: this.epoch,
      folders,
      recentFolders: entries.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map(entry => ({ path: clientPath(entry.path), updatedAt: entry.updatedAt })),
    };
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.statePath) return;
    try {
      await writeUpdateJsonAtomic(this.statePath, { version: 1, epoch: this.epoch, folders: [...this.folders.values()], seen: [...this.seen] });
    } catch (error) { console.warn('[GeneratedMediaActivity] Could not save notification counts', error); }
  }
}

let activity: GeneratedMediaActivity | undefined;
let outputRoot: () => string = () => '';
export function configureGeneratedMediaActivity(root: string, statePath: string, getOutputRoot: () => string) {
  activity = new GeneratedMediaActivity(root, statePath);
  outputRoot = getOutputRoot;
  return activity;
}

export function recordGeneratedMediaOutputs(outputs: unknown[]) {
  if (!activity) return;
  const paths: string[] = [];
  for (const value of outputs) {
    if (!value || typeof value !== 'object') continue;
    const output = value as Record<string, unknown>;
    if (output.type && output.type !== 'output') continue;
    const path = [output.fullpath, output.fullPath, output.path].find(value => typeof value === 'string' && value.trim());
    if (typeof path === 'string') paths.push(path);
    else if (typeof output.filename === 'string' && output.filename) {
      paths.push(resolve(outputRoot(), typeof output.subfolder === 'string' ? output.subfolder : '', output.filename));
    }
  }
  activity.record(paths);
}
