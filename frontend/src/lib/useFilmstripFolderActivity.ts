import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { acknowledgeFolderActivity, clearFolderActivityNotifications, folderActivityCounts, FOLDER_ACTIVITY_READ_KEY, readFolderActivityState, type FolderActivitySnapshot, type FolderActivityReadState } from './filmstripFolderActivity';

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
        || folder.entries.some(entry => typeof entry?.id !== 'string' || !Number.isSafeInteger(entry.count) || entry.count < 0
          || typeof entry.direct !== 'boolean'))
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
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const [read, setRead] = useState(readFolderActivityState);
  const [deletionRevision, setDeletionRevision] = useState(0);
  const deletionRevisionRef = useRef(0);
  const pathsKey = JSON.stringify([...new Set(paths)].slice(0, 256));

  useEffect(() => {
    const onFoldersDeleted = () => {
      deletionRevisionRef.current += 1;
      setDeletionRevision(deletionRevisionRef.current);
    };
    window.addEventListener('umbra:gallery-empty-folders-deleted', onFoldersDeleted);
    return () => window.removeEventListener('umbra:gallery-empty-folders-deleted', onFoldersDeleted);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestRevision = deletionRevisionRef.current;
    const trackedPaths = JSON.parse(pathsKey) as string[];
    const discoveryOnly = trackedPaths.length === 0;
    if (discoveryOnly) {
      setSnapshot(null);
    }
    let timer: ReturnType<typeof setTimeout>;
    let outputTimer: ReturnType<typeof setTimeout>;
    let busy = false;
    let refreshPending = false;
    const refresh = async () => {
      if (busy || controller.signal.aborted) return;
      clearTimeout(timer);
      busy = true;
      try {
        const next = await fetchActivity(trackedPaths, controller.signal);
        if (controller.signal.aborted || requestRevision !== deletionRevisionRef.current) return;
        setSnapshot(next);
        if (next.recentFolders.length) rememberFolders(next.recentFolders.map(folder => folder.path));
      } catch { /* Keep existing badges through transient outages; never block the strip. */ }
      finally {
        busy = false;
        if (!controller.signal.aborted) {
          const delay = refreshPending ? 0 : discoveryOnly ? 30_000 : (document.hidden ? 30_000 : 5000);
          refreshPending = false;
          timer = setTimeout(() => { void refresh(); }, delay);
        }
      }
    };
    const wake = () => { if (!document.hidden) void refresh(); };
    const onOutputSaved = () => {
      clearTimeout(outputTimer);
      outputTimer = setTimeout(() => {
        if (busy) refreshPending = true;
        else void refresh();
      }, 150);
    };
    void refresh();
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('umbra:powerprompter-output-saved', onOutputSaved);
    window.addEventListener('umbra:gallery-generation-complete', onOutputSaved);
    window.addEventListener('umbra:gallery-content-changed', onOutputSaved);
    return () => {
      controller.abort(); clearTimeout(timer); clearTimeout(outputTimer);
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('umbra:powerprompter-output-saved', onOutputSaved);
      window.removeEventListener('umbra:gallery-generation-complete', onOutputSaved);
      window.removeEventListener('umbra:gallery-content-changed', onOutputSaved);
    };
  }, [deletionRevision, pathsKey, rememberFolders]);

  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === FOLDER_ACTIVITY_READ_KEY) setRead(readFolderActivityState()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  const commitRead = useCallback((value: FolderActivitySnapshot, acknowledge: (base: FolderActivityReadState) => FolderActivityReadState) => {
    setRead(previous => {
      const stored = readFolderActivityState();
      const counts = previous.epoch === value.epoch ? { ...previous.counts } : {};
      if (stored.epoch === value.epoch) {
        for (const [id, count] of Object.entries(stored.counts)) counts[id] = Math.max(counts[id] || 0, count);
      }
      const base = { epoch: value.epoch, counts };
      const next = acknowledge(base);
      try { localStorage.setItem(FOLDER_ACTIVITY_READ_KEY, JSON.stringify(next)); } catch { /* In-memory counts still work. */ }
      return next;
    });
  }, []);

  const markOpened = useCallback((path: string) => {
    const snapshot = snapshotRef.current;
    const acknowledge = (value: FolderActivitySnapshot) => commitRead(value, base => acknowledgeFolderActivity(value, base, path));
    // A matching polled snapshot is the click-time ceiling. A later response could
    // include outputs published after the folder was opened and mark them read.
    if (snapshot?.folders.some(folder => folder.path === path)) {
      acknowledge(snapshot);
      return;
    }
    // Cold or untracked folders still need a fetch; their read cutoff is when
    // that response arrives, so an output published during the request may be read.
    void fetchActivity([path]).then(acknowledge).catch(() => undefined);
  }, [commitRead]);

  const clearNotifications = useCallback((path?: string) => {
    const snapshot = snapshotRef.current;
    // Clear only the counts already displayed, so new outputs remain unread.
    if (snapshot) commitRead(snapshot, base => clearFolderActivityNotifications(snapshot, base, path));
  }, [commitRead]);

  return {
    ...useMemo(() => folderActivityCounts(snapshot, read), [snapshot, read]),
    latestFolder: snapshot?.recentFolders[0]?.path || '',
    markOpened,
    clearNotifications,
  };
}
