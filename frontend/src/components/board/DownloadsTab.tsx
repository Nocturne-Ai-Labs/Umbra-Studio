import { useState, useEffect, useRef } from 'react';
import { Pause, Play, Trash2, CheckCircle } from 'lucide-react';
import { DownloadQueue } from './components/DownloadQueue';
import { useBoardStore } from './hooks/useBoardStore';

export function DownloadsTab() {
  const {
    downloadQueue,
    setIsDownloading,
    updateDownloadItem,
    removeFromDownloadQueue,
    clearDownloadQueue,
  } = useBoardStore();

  const [isPaused, setIsPaused] = useState(false);
  const activeDownloadsRef = useRef<Set<string>>(new Set());
  const MAX_CONCURRENT = 5;

  // Download a single item
  const downloadItem = async (item: typeof downloadQueue[0]) => {
    activeDownloadsRef.current.add(item.id);
    updateDownloadItem(item.id, { status: 'downloading', progress: 0 });

    try {
      const response = await fetch('/api/booru/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: item.post.fullUrl,
          md5: item.post.md5,
          ext: item.post.fileExt,
          tags: item.post.tags,
          dataset: item.dataset,
          concept: item.concept,
        }),
      });

      if (response.ok) {
        updateDownloadItem(item.id, { status: 'done', progress: 100 });
      } else {
        const err = await response.json();
        updateDownloadItem(item.id, { status: 'error', error: err.error || 'Download failed' });
      }
    } catch (err: any) {
      updateDownloadItem(item.id, { status: 'error', error: err.message });
    }

    activeDownloadsRef.current.delete(item.id);
  };

  // Process download queue - runs continuously with parallel downloads
  useEffect(() => {
    const processQueue = () => {
      if (isPaused) return;

      const queue = useBoardStore.getState().downloadQueue;
      const activeCount = activeDownloadsRef.current.size;
      const slotsAvailable = MAX_CONCURRENT - activeCount;

      if (slotsAvailable <= 0) return;

      // Get queued items that aren't already being processed
      const queuedItems = queue.filter(
        i => i.status === 'queued' && !activeDownloadsRef.current.has(i.id)
      );

      // Start downloads for available slots
      const itemsToStart = queuedItems.slice(0, slotsAvailable);
      if (itemsToStart.length > 0) {
        setIsDownloading(true);
        itemsToStart.forEach(item => downloadItem(item));
      }

      // Check if we're done
      const hasActive = activeDownloadsRef.current.size > 0;
      const hasQueued = queue.some(i => i.status === 'queued');
      if (!hasActive && !hasQueued) {
        setIsDownloading(false);
      }
    };

    // Poll frequently for new items
    const interval = setInterval(processQueue, 200);
    return () => clearInterval(interval);
  }, [isPaused, setIsDownloading, updateDownloadItem]);

  // Stats
  const completed = downloadQueue.filter(i => i.status === 'done').length;
  const failed = downloadQueue.filter(i => i.status === 'error').length;
  const queued = downloadQueue.filter(i => i.status === 'queued').length;
  const downloading = downloadQueue.filter(i => i.status === 'downloading').length;

  const clearCompleted = () => {
    downloadQueue
      .filter(i => i.status === 'done')
      .forEach(i => removeFromDownloadQueue(i.id));
  };

  return (
    <div className="h-full flex flex-col" style={{ fontFamily: 'var(--font-family)' }}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--umbra-border)', background: 'var(--umbra-panel)' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--umbra-text)' }}>Download Queue</h2>
          <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
            {completed} done
            {downloading > 0 && <span style={{ color: '#22c55e' }}>, {downloading} downloading</span>}
            {queued > 0 && `, ${queued} queued`}
            {failed > 0 && <span style={{ color: '#ef4444' }}>, {failed} failed</span>}
            <span style={{ color: 'rgba(255,255,255,0.3)' }}> (5 parallel)</span>
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {completed > 0 && (
            <button
              onClick={clearCompleted}
              className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors"
              style={{ color: 'rgba(255,255,255,0.6)' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--umbra-text)'; e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Clear Done
            </button>
          )}

          <button
            onClick={() => setIsPaused(!isPaused)}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors"
            style={{
              background: isPaused ? 'rgba(34, 197, 94, 0.2)' : 'rgba(234, 179, 8, 0.2)',
              color: isPaused ? '#22c55e' : '#eab308',
            }}
          >
            {isPaused ? (
              <>
                <Play className="w-3.5 h-3.5" />
                Resume
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5" />
                Pause
              </>
            )}
          </button>

          <button
            onClick={clearDownloadQueue}
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors"
            style={{ color: '#ef4444' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        </div>
      </div>

      {/* Queue */}
      <div className="flex-1 min-h-0">
        <DownloadQueue
          items={downloadQueue}
          onRemove={removeFromDownloadQueue}
        />
      </div>
    </div>
  );
}
