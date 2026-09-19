import type { BoardState, DownloadItem } from './types';

export type BoardDownloadState = Pick<BoardState, 'downloadQueue' | 'downloadPaused' | 'isDownloading' | 'updateDownloadItem' | 'setIsDownloading'>;
type DownloadStore = {
  getState: () => BoardDownloadState;
  subscribe: (listener: (state: BoardDownloadState, previous: BoardDownloadState) => void) => () => void;
};
const runners = new WeakMap<DownloadStore, () => void>();

/** One scheduler per store, independent of which Data Forge view is mounted. */
export function startBoardDownloadRunner(store: DownloadStore, request: (url: string, init?: RequestInit) => Promise<Response> = fetch): () => void {
  const existing = runners.get(store);
  if (existing) return existing;
  const active = new Set<string>();
  let scheduled = false;
  let disposed = false;

  function schedule() {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(pump);
  }

  async function download(item: DownloadItem) {
    active.add(item.id);
    store.getState().updateDownloadItem(item.id, { status: 'downloading', progress: 0, error: undefined });
    try {
      const response = await request('/api/booru/download', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          url: item.post.fullUrl, md5: item.post.md5, ext: item.post.fileExt,
          tags: item.post.tags, source: item.post.source, postId: item.post.id,
          dataset: item.dataset, concept: item.concept,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success !== true) throw new Error(result?.error || 'Download was not confirmed');
      if (!disposed) store.getState().updateDownloadItem(item.id, { status: 'done', progress: 100 });
    } catch (error) {
      if (!disposed) store.getState().updateDownloadItem(item.id, { status: 'error', error: error instanceof Error ? error.message : 'Download failed' });
    } finally {
      active.delete(item.id);
      schedule();
    }
  }

  function pump() {
    scheduled = false;
    if (disposed) return;
    const state = store.getState();
    if (!state.downloadPaused) {
      const next = state.downloadQueue.filter(item => item.status === 'queued' && !active.has(item.id)).slice(0, Math.max(0, 5 - active.size));
      for (const item of next) void download(item);
    }
    const running = active.size > 0;
    if (store.getState().isDownloading !== running) store.getState().setIsDownloading(running);
  }

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.downloadQueue !== previous.downloadQueue || state.downloadPaused !== previous.downloadPaused) schedule();
  });
  const dispose = () => { disposed = true; unsubscribe(); runners.delete(store); };
  runners.set(store, dispose);
  schedule();
  return dispose;
}
