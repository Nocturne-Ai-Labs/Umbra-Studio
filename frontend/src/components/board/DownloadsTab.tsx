import { Pause, Play, Trash2, CheckCircle, Download } from 'lucide-react';
import { DownloadQueue } from './components/DownloadQueue';
import { useBoardStore } from './hooks/useBoardStore';

export function DownloadsTab() {
  const { downloadQueue, downloadPaused: isPaused, setDownloadPaused: setIsPaused, removeFromDownloadQueue, clearDownloadQueue } = useBoardStore();
  const completed = downloadQueue.filter(item => item.status === 'done').length;
  const failed = downloadQueue.filter(item => item.status === 'error').length;
  const queued = downloadQueue.filter(item => item.status === 'queued').length;
  const downloading = downloadQueue.filter(item => item.status === 'downloading').length;
  const clearCompleted = () => downloadQueue.filter(item => item.status === 'done').forEach(item => removeFromDownloadQueue(item.id));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="glass-panel flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-none border-x-0 border-t-0 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold"><Download size={16} className="text-[var(--umbra-accent)]" /> Downloads</h2>
          <p role="status" className="mt-1 text-xs text-zinc-400">
            {isPaused ? 'Queue paused' : downloading ? `${downloading} downloading` : queued ? 'Waiting to download' : 'Queue idle'}
            <span className="text-zinc-500"> · {queued} waiting · {completed} saved</span>
            {failed > 0 && <span className="text-red-300"> · {failed} failed</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setIsPaused(!isPaused)} disabled={!isPaused && queued + downloading === 0} className="forge-button forge-button-primary" title="Pausing holds waiting items; active downloads finish.">
            {isPaused ? <Play size={14} /> : <Pause size={14} />}{isPaused ? 'Resume queue' : 'Pause queue'}
          </button>
          <button type="button" onClick={clearCompleted} disabled={completed === 0} className="forge-button" title="Remove completed entries from the list; saved files are kept."><CheckCircle size={14} />Clear completed</button>
          <button type="button" onClick={clearDownloadQueue} disabled={completed + failed + queued === 0} title="Remove waiting and finished entries from the list. Active downloads and saved files are kept." className="forge-button forge-button-danger"><Trash2 size={14} />Clear inactive</button>
        </div>
      </header>
      {isPaused && <p role="status" className="border-b border-white/10 px-4 py-2 text-xs text-amber-200">Waiting downloads are paused. Any active transfers will finish.</p>}
      <div className="min-h-0 flex-1"><DownloadQueue items={downloadQueue} onRemove={removeFromDownloadQueue} /></div>
    </div>
  );
}
