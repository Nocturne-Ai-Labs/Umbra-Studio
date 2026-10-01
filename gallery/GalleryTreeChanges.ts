import { watch } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';

type WatchHandle = { close(): void; on(event: 'error', handler: () => void): unknown };
type Entry = {
  signature?: string;
  revision: number;
  touchedAt: number;
  subscribers: number;
  watcher?: WatchHandle;
  identity?: string;
  check?: Promise<boolean>;
  retryAt: number;
  timer?: ReturnType<typeof setTimeout>;
  scan?: Promise<void>;
  rescan: boolean;
  dirty: boolean;
};
type Options = {
  capacity?: number;
  maxPendingWaits?: number;
  debounceMs?: number;
  now?: () => number;
  read?: (path: string) => Promise<string[]>;
  identity?: (path: string) => Promise<string>;
  watch?: (path: string, changed: (event: string) => void) => WatchHandle;
  changed: (path: string) => void;
};

export class GalleryTreeChanges {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly epoch = crypto.randomUUID();
  private revision = 0;
  private pendingWaits = 0;
  private disposed = false;
  private readonly now: () => number;
  private readonly read: (path: string) => Promise<string[]>;
  private readonly identity: (path: string) => Promise<string>;
  private readonly watchFolder: NonNullable<Options['watch']>;

  constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now;
    this.read = options.read ?? (async path => (await readdir(path, { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name));
    this.identity = options.identity ?? (async path => {
      const info = await stat(path);
      if (!info.isDirectory()) throw new Error('Watched path is not a directory');
      return `${info.dev}:${info.ino}:${info.birthtimeMs}`;
    });
    this.watchFolder = options.watch ?? ((path, changed) => watch(path, { persistent: false }, changed));
  }

  get size() { return this.entries.size; }

  private check(path: string, entry: Entry): Promise<boolean> {
    if (entry.check) return entry.check;
    entry.check = this.identity(path).then(identity => {
      if (this.disposed || this.entries.get(path) !== entry) return false;
      const replaced = entry.identity !== undefined && entry.identity !== identity;
      if (replaced) {
        entry.watcher?.close();
        entry.watcher = undefined;
        entry.retryAt = 0;
        entry.signature = undefined;
        entry.rescan = true;
        this.options.changed(path);
        entry.revision = ++this.revision;
        for (const listener of this.listeners) listener();
      }
      entry.identity = identity;
      if (!entry.watcher && this.now() >= entry.retryAt) {
        entry.retryAt = this.now() + 30_000;
        // Reconcile changes missed during a watch outage, even when reopening
        // the same directory rather than a replacement inode.
        entry.rescan = true;
        try {
          entry.watcher = this.watchFolder(path, event => {
            if (event === 'rename') this.schedule(path, entry);
          });
          entry.watcher.on('error', () => {
            entry.watcher?.close();
            entry.watcher = undefined;
            entry.retryAt = this.now() + 30_000;
          });
        } catch { /* The existing periodic refresh handles unsupported drives. */ }
      }
      return true;
    }).catch(() => {
      entry.watcher?.close();
      entry.watcher = undefined;
      entry.retryAt = this.now() + 30_000;
      return false;
    }).finally(() => { entry.check = undefined; });
    return entry.check;
  }

  private schedule(path: string, entry: Entry) {
    if (this.disposed || this.entries.get(path) !== entry) return;
    if (entry.scan) { entry.dirty = true; return; }
    if (entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      void this.scan(path, entry);
    }, this.options.debounceMs ?? 100);
  }

  private scan(path: string, entry: Entry, checked = false): Promise<void> {
    if (entry.scan) return entry.scan;
    entry.scan = (checked ? Promise.resolve(true) : this.check(path, entry)).then(async readable => {
      if (!readable) return;
      return this.read(path);
    }).then(names => {
      if (!names) return;
      if (this.disposed || this.entries.get(path) !== entry) return;
      entry.rescan = false;
      const signature = JSON.stringify(names.sort());
      if (entry.signature !== undefined && entry.signature !== signature) {
        this.options.changed(path);
        entry.revision = ++this.revision;
        for (const listener of this.listeners) listener();
      }
      entry.signature = signature;
    }).catch(() => {
      // An unavailable drive is not an empty folder. Periodic tree reads remain
      // the fallback if watching or a shallow directory scan fails.
    }).finally(() => {
      entry.scan = undefined;
      if (entry.dirty) {
        entry.dirty = false;
        this.schedule(path, entry);
      }
    });
    return entry.scan;
  }

  private acquire(path: string): Entry {
    if (this.disposed) throw new Error('Gallery folder watch closed');
    let entry = this.entries.get(path);
    if (!entry) {
      this.retireIdle();
      if (this.entries.size >= (this.options.capacity ?? 256)) {
        const idle = [...this.entries.entries()].filter(([, value]) => !value.subscribers)
          .sort((a, b) => a[1].touchedAt - b[1].touchedAt)[0];
        if (!idle) throw new Error('Gallery folder watch capacity reached');
        idle[1].watcher?.close();
        clearTimeout(idle[1].timer);
        this.entries.delete(idle[0]);
      }
      // A fresh subscription must reconcile a branch even if its previous
      // watch expired while the browser was hidden or watching other folders.
      this.options.changed(path);
      entry = { revision: ++this.revision, touchedAt: this.now(), subscribers: 0, retryAt: 0, dirty: false, rescan: false };
      this.entries.set(path, entry);
    }
    entry.touchedAt = this.now();
    entry.subscribers++;
    return entry;
  }

  async wait(paths: string[], cursor: string, signal?: AbortSignal, timeoutMs = 20_000): Promise<{ cursor: string; paths: string[] }> {
    signal?.throwIfAborted();
    if (this.pendingWaits >= (this.options.maxPendingWaits ?? 64)) throw new Error('Gallery folder wait capacity reached');
    this.pendingWaits++;
    const acquired: Entry[] = [];
    try {
      for (const path of paths) acquired.push(this.acquire(path));
      await new Promise<void>((resolve, reject) => {
        const abort = () => { signal?.removeEventListener('abort', abort); reject(signal?.reason); };
        signal?.addEventListener('abort', abort, { once: true });
        Promise.all(acquired.map((entry, index) => this.check(paths[index], entry).then(readable => {
          if (readable && (entry.signature === undefined || entry.rescan)) return this.scan(paths[index], entry, true);
          return entry.scan;
        }))).then(() => {
          signal?.removeEventListener('abort', abort); resolve();
        }, error => { signal?.removeEventListener('abort', abort); reject(error); });
        if (signal?.aborted) abort();
      });
      signal?.throwIfAborted();
      const prefix = `${this.epoch}:`;
      const since = cursor.startsWith(prefix) ? Number(cursor.slice(prefix.length)) : NaN;
      const changes = () => (!Number.isSafeInteger(since) || since < 0 || since > this.revision)
        ? paths : paths.filter(path => (this.entries.get(path)?.revision ?? 0) > since);
      if (!this.disposed && changes().length === 0) {
        await new Promise<void>((resolve, reject) => {
          const finish = () => {
            clearTimeout(timer);
            this.listeners.delete(changed);
            signal?.removeEventListener('abort', abort);
          };
          const changed = () => {
            if (!this.disposed && changes().length === 0) return;
            finish(); resolve();
          };
          const abort = () => { finish(); reject(signal?.reason); };
          const timer = setTimeout(() => { finish(); resolve(); }, timeoutMs);
          this.listeners.add(changed);
          signal?.addEventListener('abort', abort, { once: true });
          if (signal?.aborted) abort();
          else changed();
        });
      }
      return { cursor: `${this.epoch}:${this.revision}`, paths: changes() };
    } finally {
      this.pendingWaits--;
      for (const entry of acquired) {
        entry.subscribers--;
        entry.touchedAt = this.now();
      }
    }
  }

  retireIdle(maxIdleMs = 2 * 60_000) {
    for (const [path, entry] of this.entries) {
      if (entry.subscribers || entry.touchedAt > this.now() - maxIdleMs) continue;
      entry.watcher?.close();
      clearTimeout(entry.timer);
      this.entries.delete(path);
    }
  }

  close() {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      entry.watcher?.close();
      clearTimeout(entry.timer);
    }
    this.entries.clear();
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }
}
