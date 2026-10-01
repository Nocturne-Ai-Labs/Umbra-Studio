import { useCallback, useEffect, useRef } from 'react';
import { galleryBridgeFsUrl } from './galleryBridgeFs';
import { FOLDER_TREE_CHANGED_EVENT } from '../utils/folderTreeEvents';

const CHECK_INTERVAL_MS = 1_500;
const BRANCH_REFRESH_MS = 15_000;
const BACKGROUND_REFRESH_MS = 60_000;
const RETRY_MS = 60_000;
const keyOf = (path: string) => {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '');
  return /^[a-z]:($|\/)/i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized;
};

export function affectedGalleryTreeBranches(branches: string[], changedPath: string): string[] {
  const changed = keyOf(changedPath);
  if (!changed) return [];
  return branches.filter(path => {
    const branch = keyOf(path);
    return changed === branch || changed.startsWith(`${branch}/`);
  });
}

export class GalleryTreeRefreshQueue {
  private entries = new Map<string, { due: number; dirty: boolean; checked: number; retryAt: number }>();

  invalidate(paths: string[]) {
    for (const path of paths) {
      const key = keyOf(path);
      const entry = this.entries.get(key);
      this.entries.set(key, { due: entry?.due ?? 0, dirty: true, checked: entry?.checked ?? 0, retryAt: 0 });
    }
  }

  hasDirty(paths: string[]): boolean {
    return paths.some(path => this.entries.get(keyOf(path))?.dirty);
  }

  next(paths: string[], now: number, dirtyOnly = false): string | undefined {
    const visible = new Set(paths.map(keyOf));
    for (const key of this.entries.keys()) if (!visible.has(key)) this.entries.delete(key);
    let selected: string | undefined;
    let earliest = Infinity;
    let selectedDirty = false;
    for (const path of paths) {
      const entry = this.entries.get(keyOf(path));
      const due = Math.max(entry?.retryAt ?? 0, entry?.dirty ? entry.checked : entry?.due ?? 0);
      const dirty = entry?.dirty ?? false;
      if ((!dirtyOnly || dirty) && due <= now && ((dirty && !selectedDirty) || (dirty === selectedDirty && due < earliest))) {
        selected = path;
        earliest = due;
        selectedDirty = dirty;
      }
    }
    if (selected) this.entries.set(keyOf(selected), { due: Infinity, dirty: false, checked: now, retryAt: 0 });
    return selected;
  }

  complete(path: string, now: number, succeeded: boolean, refreshMs = BRANCH_REFRESH_MS) {
    const key = keyOf(path);
    const dirty = succeeded && (this.entries.get(key)?.dirty ?? false);
    this.entries.set(key, { due: now + (succeeded ? refreshMs : RETRY_MS), dirty, checked: now, retryAt: succeeded ? 0 : now + RETRY_MS });
  }
}

interface TreeRefreshWork {
  path: string;
  background: boolean;
}

export class GalleryTreeRefreshScheduler {
  private foreground = new GalleryTreeRefreshQueue();
  private background = new GalleryTreeRefreshQueue();
  private preferBackground = false;

  invalidate(paths: string[]) {
    this.foreground.invalidate(paths);
    this.background.invalidate(paths);
  }

  hasDirty(paths: string[], backgroundPaths: string[]): boolean {
    return this.foreground.hasDirty(paths) || this.background.hasDirty(backgroundPaths);
  }

  next(paths: string[], backgroundPaths: string[], now: number): TreeRefreshWork | undefined {
    const foregroundKeys = new Set(paths.map(keyOf));
    const backgroundOnly = backgroundPaths.filter(path => !foregroundKeys.has(keyOf(path)));
    // One request at a time, alternating when both lanes have due work.
    for (const dirtyOnly of [true, false]) {
      for (const background of [this.preferBackground, !this.preferBackground]) {
        const queue = background ? this.background : this.foreground;
        const path = queue.next(background ? backgroundOnly : paths, now, dirtyOnly);
        if (path) {
          this.preferBackground = !background;
          return { path, background };
        }
      }
    }
  }

  complete(work: TreeRefreshWork, now: number, succeeded: boolean, refreshMs = BRANCH_REFRESH_MS) {
    const queue = work.background ? this.background : this.foreground;
    queue.complete(work.path, now, succeeded, work.background ? BACKGROUND_REFRESH_MS : refreshMs);
  }
}

export function useGalleryTreeRefresh(options: {
  paths: string[];
  backgroundPaths?: string[];
  paused: boolean;
  refreshMs?: number;
  refresh: (path: string) => Promise<unknown>;
}) {
  const latest = useRef(options);
  latest.current = options;
  const queue = useRef(new GalleryTreeRefreshScheduler());
  const inFlight = useRef(false);
  const wake = useRef<() => void>(() => undefined);
  const watchCursor = useRef('');
  const previousWatchPaths = useRef<string[]>([]);
  const invalidate = useCallback((changedPath: string) => {
    queue.current.invalidate(affectedGalleryTreeBranches([
      ...latest.current.paths, ...(latest.current.backgroundPaths || []),
    ], changedPath));
    wake.current();
  }, []);

  const watchPaths = [...new Map([...options.paths, ...(options.backgroundPaths || [])]
    .filter(Boolean).map(path => [keyOf(path), path])).values()].slice(0, 64);
  const watchKey = JSON.stringify(watchPaths);

  useEffect(() => {
    const paths = JSON.parse(watchKey) as string[];
    if (options.paused || !paths.length) return;
    const previous = new Set(previousWatchPaths.current.map(keyOf));
    const addedPaths = paths.filter(path => !previous.has(keyOf(path)));
    queue.current.invalidate(addedPaths);
    if (addedPaths.length) wake.current();
    previousWatchPaths.current = paths;
    let disposed = false;
    let controller: AbortController | undefined;
    const connect = () => {
      if (document.visibilityState === 'hidden') { controller?.abort(); return; }
      if (controller && !controller.signal.aborted) return;
      const current = new AbortController();
      controller = current;
      void (async () => {
        let retryMs = 5_000;
        while (!disposed && !current.signal.aborted) {
          try {
            const params = new URLSearchParams({ cursor: watchCursor.current });
            for (const path of paths) params.append('path', path);
            const response = await fetch(galleryBridgeFsUrl('/tree-changes', params), {
              cache: 'no-store', signal: AbortSignal.any([current.signal, AbortSignal.timeout(32_000)]),
            });
            if (!response.ok) throw new Error('Folder watch unavailable');
            const payload = await response.json() as { cursor?: unknown; paths?: unknown };
            if (typeof payload.cursor !== 'string' || !Array.isArray(payload.paths)
              || !payload.paths.every(path => typeof path === 'string')) throw new Error('Invalid folder watch response');
            if (disposed || current.signal.aborted) return;
            watchCursor.current = payload.cursor;
            retryMs = 5_000;
            queue.current.invalidate(payload.paths);
            if (payload.paths.length) wake.current();
          } catch {
            if (disposed || current.signal.aborted) return;
            // Keep periodic reads working while the split process restarts.
            await new Promise<void>(resolve => {
              const abort = () => { clearTimeout(timer); resolve(); };
              const timer = window.setTimeout(() => {
                current.signal.removeEventListener('abort', abort); resolve();
              }, retryMs);
              current.signal.addEventListener('abort', abort, { once: true });
            });
            retryMs = Math.min(60_000, retryMs * 2);
          }
        }
      })();
    };
    connect();
    window.addEventListener('focus', connect);
    document.addEventListener('visibilitychange', connect);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener('focus', connect);
      document.removeEventListener('visibilitychange', connect);
    };
  }, [options.paused, watchKey]);

  useEffect(() => {
    let disposed = false;
    let immediateTimer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (disposed || inFlight.current || latest.current.paused || document.visibilityState === 'hidden') return;
      const work = queue.current.next(latest.current.paths, latest.current.backgroundPaths || [], Date.now());
      if (!work) return;
      inFlight.current = true;
      try {
        await latest.current.refresh(work.path);
        queue.current.complete(work, Date.now(), true, latest.current.refreshMs);
      } catch {
        // Keep the last good branch and back off for offline/cloud folders.
        queue.current.complete(work, Date.now(), false);
      } finally {
        inFlight.current = false;
        if (!disposed && queue.current.hasDirty(latest.current.paths, latest.current.backgroundPaths || [])) {
          immediateTimer = setTimeout(() => { void poll(); }, 0);
        }
      }
    };
    const onWake = () => { void poll(); };
    wake.current = onWake;
    const onFolderChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ paths?: string[]; rootPath?: string }>).detail;
      const paths = detail?.paths?.length ? detail.paths : detail?.rootPath ? [detail.rootPath] : [];
      if (paths.length) for (const path of paths) invalidate(path);
      else {
        queue.current.invalidate([...latest.current.paths, ...(latest.current.backgroundPaths || [])]);
        onWake();
      }
    };
    const timer = window.setInterval(onWake, CHECK_INTERVAL_MS);
    window.addEventListener('focus', onWake);
    window.addEventListener(FOLDER_TREE_CHANGED_EVENT, onFolderChanged);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      disposed = true;
      wake.current = () => undefined;
      clearTimeout(immediateTimer);
      window.clearInterval(timer);
      window.removeEventListener('focus', onWake);
      window.removeEventListener(FOLDER_TREE_CHANGED_EVENT, onFolderChanged);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [invalidate]);
  return invalidate;
}
