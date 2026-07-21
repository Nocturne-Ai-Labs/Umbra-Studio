import { Check, AlertCircle, Loader2, Clock } from 'lucide-react';
import { BOORU_SOURCES } from '../sources';
import type { DownloadItem } from '../types';

interface DownloadQueueProps {
  items: DownloadItem[];
  onRemove: (id: string) => void;
}

export function DownloadQueue({ items, onRemove: _onRemove }: DownloadQueueProps) {
  const getStatusIcon = (item: DownloadItem) => {
    switch (item.status) {
      case 'done':
        return <Check className="w-4 h-4 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'downloading':
        return <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-zinc-500" />;
    }
  };

  const getStatusText = (item: DownloadItem) => {
    switch (item.status) {
      case 'done':
        return 'Done';
      case 'error':
        return item.error || 'Error';
      case 'downloading':
        return `${Math.round(item.progress)}%`;
      default:
        return 'Queued';
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <p className="text-xs uppercase tracking-[0.16em]">Download queue is empty</p>
      </div>
    );
  }

  // Calculate overall progress
  const completed = items.filter(i => i.status === 'done').length;
  const total = items.length;
  const overallProgress = total > 0 ? (completed / total) * 100 : 0;

  return (
    <div className="h-full flex flex-col bg-[var(--umbra-bg)]">
      {/* Overall progress */}
      <div className="glass-panel m-2 mb-0 flex-shrink-0 rounded-lg border-white/10 p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            {completed} / {total} images
          </span>
          <span className="text-xs text-cyan-200">
            {Math.round(overallProgress)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-black/45 ring-1 ring-white/10">
          <div
            className="h-full bg-cyan-400 transition-all duration-300 shadow-[0_0_14px_rgba(34,211,238,0.45)]"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Queue list */}
      <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
        <table className="w-full">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-[var(--umbra-bg)]/95 backdrop-blur">
            <tr className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              <th className="w-16 p-2 text-left">Img</th>
              <th className="p-2 text-left">Filename</th>
              <th className="w-24 p-2 text-left">Source</th>
              <th className="w-20 p-2 text-left">Size</th>
              <th className="w-24 p-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const source = BOORU_SOURCES[item.post.source];

              return (
                <tr
                  key={item.id}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="p-2">
                    <div className="umbra-surface-deep h-10 w-10 overflow-hidden rounded border border-white/10">
                      <img
                        src={item.post.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </td>
                  <td className="p-2">
                    <span className="font-mono text-xs text-zinc-300">
                      {item.post.md5}.{item.post.fileExt}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded border border-white/15 text-xs font-bold text-white"
                        style={{ backgroundColor: source?.color || '#666' }}
                      >
                        {source?.icon || '?'}
                      </span>
                      <span className="text-xs text-zinc-400">{source?.name}</span>
                    </div>
                  </td>
                  <td className="p-2">
                    <span className="text-xs text-zinc-400">
                      {item.post.fileSize
                        ? `${(item.post.fileSize / 1024 / 1024).toFixed(1)} MB`
                        : '--'}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item)}
                      <span className={`text-xs ${
                        item.status === 'error' ? 'text-red-400' :
                        item.status === 'done' ? 'text-emerald-400' :
                        'text-zinc-400'
                      }`}>
                        {getStatusText(item)}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
