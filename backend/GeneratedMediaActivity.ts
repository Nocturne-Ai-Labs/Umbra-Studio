import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, extname, isAbsolute, resolve } from 'node:path';
import { writeUpdateJsonAtomic } from '../shared/updateStateFile';

const MEDIA = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.tif', '.tiff', '.gif', '.mp4', '.webm', '.mov', '.mkv', '.avi', '.m4v', '.wmv']);
const DUPLICATE_PUBLICATION_WINDOW_MS = 2000;
type FolderActivity = { path: string; count: number; updatedAt: number };

// Counts are updated only by successful output publishers, never by directory scans.
export class GeneratedMediaActivity {
  private folders = new Map<string, FolderActivity>();
  private seen = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private epoch = randomUUID();

  constructor(private root: string, private statePath?: string, private now = Date.now) {
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
      const now = this.now();
      for (const item of (Array.isArray(data.seen) ? data.seen : []).slice(-20_000)) {
        const id = typeof item === 'string' ? item : item?.[0];
        const timestamp = typeof item === 'string' ? now : item?.[1];
        if (typeof id === 'string' && /^[a-f0-9]{64}$/.test(id) && Number.isFinite(timestamp)
          && timestamp <= now && now - timestamp < DUPLICATE_PUBLICATION_WINDOW_MS) {
          this.seen.set(id, timestamp);
        }
      }
    } catch { /* A missing/corrupt notification cache must not affect generation. */ }
  }

  private resolvePath(path: string): string {
    const portable = path.replace(/\\/g, '/');
    const mapped = !isAbsolute(path) && (portable === 'User/Outputs' || portable.startsWith('User/Outputs/'))
      ? `Tools/ComfyUI/output${portable.slice('User/Outputs'.length)}`
      : path;
    return resolve(this.root, mapped);
  }

  private key(path: string): string {
    const full = this.resolvePath(path);
    return process.platform === 'win32' ? full.toLowerCase() : full;
  }

  record(paths: string[]): void {
    let changed = false;
    const now = this.now();
    for (const [id, timestamp] of this.seen) {
      if (timestamp > now || now - timestamp >= DUPLICATE_PUBLICATION_WINDOW_MS) this.seen.delete(id);
    }
    for (const path of paths) {
      if (!path || !MEDIA.has(extname(path).toLowerCase())) continue;
      const full = this.resolvePath(path);
      const id = createHash('sha256').update(this.key(full)).digest('hex');
      const now = this.now();
      const lastSeen = this.seen.get(id);
      if (lastSeen !== undefined && now >= lastSeen && now - lastSeen < DUPLICATE_PUBLICATION_WINDOW_MS) continue;
      this.seen.delete(id);
      this.seen.set(id, now);
      if (this.seen.size > 20_000) this.seen.delete(this.seen.keys().next().value!);
      const folder = dirname(full);
      const key = this.key(folder);
      this.folders.set(key, { path: folder, count: (this.folders.get(key)?.count || 0) + 1, updatedAt: now });
      changed = true;
    }
    if (changed && this.statePath && !this.timer) {
      this.timer = setTimeout(() => { void this.flush(); }, 1000);
      this.timer.unref?.();
    }
  }

  snapshot(paths: string[], allowed: (path: string) => boolean, clientPath: (path: string) => string) {
    const entries = [...this.folders.entries()].filter(([, entry]) => allowed(entry.path));
    const folders = paths.map(path => ({ path, entries: [] as Array<{ id: string; count: number }> }));
    const requestedByKey = new Map<string, typeof folders>();
    for (const folder of folders) {
      const key = this.key(folder.path);
      const matching = requestedByKey.get(key) || [];
      matching.push(folder);
      requestedByKey.set(key, matching);
    }
    for (const [key, entry] of entries) {
      let item: { id: string; count: number } | null = null;
      let ancestor = key;
      while (true) {
        const matching = requestedByKey.get(ancestor);
        if (matching) {
          item ||= { id: createHash('sha256').update(key).digest('hex'), count: entry.count };
          for (const folder of matching) folder.entries.push(item);
        }
        const parent = dirname(ancestor);
        if (parent === ancestor) break;
        ancestor = parent;
      }
    }
    return {
      epoch: this.epoch,
      folders,
      recentFolders: entries.sort((a, b) => b[1].updatedAt - a[1].updatedAt).slice(0, 8).map(([, entry]) => ({ path: clientPath(entry.path), updatedAt: entry.updatedAt })),
    };
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (!this.statePath) return;
    try {
      const now = this.now();
      for (const [id, timestamp] of this.seen) {
        if (timestamp > now || now - timestamp >= DUPLICATE_PUBLICATION_WINDOW_MS) this.seen.delete(id);
      }
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
