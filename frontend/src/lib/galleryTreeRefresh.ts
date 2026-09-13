import { useCallback, useEffect, useRef } from 'react';

const CHECK_INTERVAL_MS = 1_500;
const BRANCH_REFRESH_MS = 15_000;
const RETRY_MS = 60_000;
const keyOf = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

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
      this.entries.set(key, { due: entry?.due ?? 0, dirty: true, checked: entry?.checked ?? 0, retryAt: entry?.retryAt ?? 0 });
    }
  }

  next(paths: string[], now: number): string | undefined {
    const visible = new Set(paths.map(keyOf));
    for (const key of this.entries.keys()) if (!visible.has(key)) this.entries.delete(key);
    let selected: string | undefined;
    let earliest = Infinity;
    for (const path of paths) {
      const entry = this.entries.get(keyOf(path));
      const due = Math.max(entry?.retryAt ?? 0, entry?.dirty ? entry.checked : entry?.due ?? 0);
      if (due <= now && due < earliest) {
        selected = path;
        earliest = due;
      }
    }
    if (selected) this.entries.set(keyOf(selected), { due: Infinity, dirty: false, checked: now, retryAt: 0 });
    return selected;
  }

  complete(path: string, now: number, succeeded: boolean) {
    const key = keyOf(path);
    const dirty = succeeded && (this.entries.get(key)?.dirty ?? false);
    this.entries.set(key, { due: now + (succeeded ? BRANCH_REFRESH_MS : RETRY_MS), dirty, checked: now, retryAt: succeeded ? 0 : now + RETRY_MS });
  }
}

export function useGalleryTreeRefresh(options: {
  paths: string[];
  paused: boolean;
  refresh: (path: string) => Promise<unknown>;
}) {
  const latest = useRef(options);
  latest.current = options;
  const queue = useRef(new GalleryTreeRefreshQueue());
  const inFlight = useRef(false);
  const invalidate = useCallback((changedPath: string) => {
    queue.current.invalidate(affectedGalleryTreeBranches(latest.current.paths, changedPath));
  }, []);

  useEffect(() => {
    let disposed = false;
    const poll = async () => {
      if (disposed || inFlight.current || latest.current.paused || document.visibilityState === 'hidden') return;
      const path = queue.current.next(latest.current.paths, Date.now());
      if (!path) return;
      inFlight.current = true;
      try {
        await latest.current.refresh(path);
        queue.current.complete(path, Date.now(), true);
      } catch {
        // Keep the last good branch and back off for offline/cloud folders.
        queue.current.complete(path, Date.now(), false);
      } finally {
        inFlight.current = false;
      }
    };
    const onWake = () => { void poll(); };
    const timer = window.setInterval(onWake, CHECK_INTERVAL_MS);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    return () => {
      disposed = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, []);
  return invalidate;
}
