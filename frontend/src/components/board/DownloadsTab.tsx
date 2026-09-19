import { Pause, Play, Trash2, CheckCircle } from 'lucide-react';
import { DownloadQueue } from './components/DownloadQueue';
import { useBoardStore } from './hooks/useBoardStore';

export function DownloadsTab() {
  const {
    downloadQueue,
    downloadPaused: isPaused,
    setDownloadPaused: setIsPaused,
    removeFromDownloadQueue,
    clearDownloadQueue,
  } = useBoardStore();

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
            title="Clear queued and finished items. Active downloads will finish."
            className="flex items-center gap-1.5 px-2 py-1 text-[11px] rounded transition-colors"
            style={{ color: '#ef4444' }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear Inactive
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
