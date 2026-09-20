import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { acknowledgeFolderActivity, folderActivityCounts, FOLDER_ACTIVITY_READ_KEY, readFolderActivityState, type FolderActivitySnapshot } from './filmstripFolderActivity';

async function fetchActivity(paths: string[], signal?: AbortSignal): Promise<FolderActivitySnapshot> {
  const params = new URLSearchParams();
  for (const path of paths) params.append('folder', path);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timeout = setTimeout(abort, 10_000);
  try {
    const response = await fetch(`/api/fs/generated-media-activity?${params}`, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Folder activity unavailable');
    const value: FolderActivitySnapshot = await response.json();
    if (typeof value?.epoch !== 'string' || !Array.isArray(value.folders) || !Array.isArray(value.recentFolders)
      || value.folders.some(folder => typeof folder?.path !== 'string' || !Array.isArray(folder.entries)
        || folder.entries.some(entry => typeof entry?.id !== 'string' || !Number.isSafeInteger(entry.count) || entry.count < 0))
      || value.recentFolders.some(folder => typeof folder?.path !== 'string' || !Number.isFinite(folder.updatedAt))) {
      throw new Error('Invalid folder activity response');
    }
    return value;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export function useFilmstripFolderActivity(paths: string[], rememberFolders: (paths: string[]) => void) {
  const [snapshot, setSnapshot] = useState<FolderActivitySnapshot | null>(null);
  const [read, setRead] = useState(readFolderActivityState);
  const newestAt = useRef(0);
  const pathsKey = JSON.stringify([...new Set(paths)].slice(0, 256));

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let busy = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      clearTimeout(timer);
      busy = true;
      try {
        const next = await fetchActivity(JSON.parse(pathsKey), controller.signal);
        if (controller.signal.aborted) return;
        setSnapshot(next);
        const recent = next.recentFolders.filter(folder => folder.updatedAt > newestAt.current);
        if (recent.length) {
          newestAt.current = Math.max(...recent.map(folder => folder.updatedAt));
          rememberFolders(recent.map(folder => folder.path));
        }
      } catch { /* Keep existing badges through transient outages; never block the strip. */ }
      finally {
        busy = false;
        if (!controller.signal.aborted) timer = setTimeout(() => { void refresh(); }, document.hidden ? 30_000 : 5000);
      }
    };
    const wake = () => { if (!document.hidden) void refresh(); };
    void refresh();
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      controller.abort(); clearTimeout(timer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [pathsKey, rememberFolders]);

  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === FOLDER_ACTIVITY_READ_KEY) setRead(readFolderActivityState()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const markOpened = useCallback((path: string) => {
    const acknowledge = (value: FolderActivitySnapshot) => setRead(previous => {
      const stored = readFolderActivityState();
      const counts = { ...previous.counts };
      if (stored.epoch === previous.epoch) {
        for (const [id, count] of Object.entries(stored.counts)) counts[id] = Math.max(counts[id] || 0, count);
      }
      const base = { epoch: previous.epoch, counts };
      const next = acknowledgeFolderActivity(value, base, path);
      try { localStorage.setItem(FOLDER_ACTIVITY_READ_KEY, JSON.stringify(next)); } catch { /* In-memory counts still work. */ }
      return next;
    });
    if (snapshot) acknowledge(snapshot);
    // Include outputs that arrived since the last periodic poll, without waiting to open the folder.
    void fetchActivity([path]).then(acknowledge).catch(() => undefined);
  }, [snapshot]);

  return { ...useMemo(() => folderActivityCounts(snapshot, read), [snapshot, read]), markOpened };
}
