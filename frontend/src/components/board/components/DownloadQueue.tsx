import { Check, AlertCircle, Loader2, Clock, Download, X } from 'lucide-react';
import { BOORU_SOURCES } from '../sources';
import type { DownloadItem } from '../types';
import { NsfwPrivacyShield, useNsfwPrivacy } from '@/components/privacy/NsfwPrivacyProvider';
import { isProtectedBooruPost } from '../booruPrivacy';

interface DownloadQueueProps {
  items: DownloadItem[];
  onRemove: (id: string) => void;
}

export function DownloadQueue({ items, onRemove }: DownloadQueueProps) {
  const { locked } = useNsfwPrivacy();
  const getStatusIcon = (item: DownloadItem) => {
    switch (item.status) {
      case 'done':
        return <Check className="w-4 h-4 text-emerald-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      case 'downloading':
        return <Loader2 className="w-4 h-4 text-[var(--umbra-accent)] animate-spin" />;
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
        return 'Downloading…';
      default:
        return 'Queued';
    }
  };

  if (items.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500">
        <Download size={26} className="text-[var(--umbra-accent)]" />
        <p className="text-sm font-medium text-zinc-300">No downloads queued</p>
        <p className="text-xs">Select media and a destination in Booru downloader to start collecting.</p>
      </div>
    );
  }

  // Calculate overall progress
  const completed = items.filter(i => i.status === 'done').length;
  const failed = items.filter(i => i.status === 'error').length;
  const total = items.length;
  const overallProgress = ((completed + failed) / total) * 100;

  return (
    <div className="h-full flex flex-col bg-[var(--umbra-bg)]">
      {/* Overall progress */}
      <div className="umbra-surface-soft flex-shrink-0 border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-zinc-400">
            {completed} saved{failed > 0 ? ` · ${failed} failed` : ''} · {total} total
          </span>
          <span className="text-xs text-zinc-400">
            {Math.round(overallProgress)}% processed
          </span>
        </div>
        <div role="progressbar" aria-label="Download queue processed" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed + failed} aria-valuetext={`${completed} saved, ${failed} failed, ${total - completed - failed} remaining`} className="flex h-1.5 overflow-hidden rounded bg-black/45 ring-1 ring-white/10">
          <div className="h-full bg-[var(--umbra-accent)] transition-all duration-300" style={{ width: `${completed / total * 100}%` }} />
          <div className="h-full bg-red-400 transition-all duration-300" style={{ width: `${failed / total * 100}%` }} />
        </div>
      </div>

      {/* Queue list */}
      <div className="custom-scrollbar flex-1 overflow-auto p-2">
        <table className="w-full min-w-[640px]">
          <thead className="sticky top-0 z-10 border-b border-white/10 bg-[var(--umbra-bg)]/95 backdrop-blur">
            <tr className="text-[10px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              <th className="w-16 p-2 text-left">Preview</th>
              <th className="p-2 text-left">Filename</th>
              <th className="min-w-32 p-2 text-left">Folder</th>
              <th className="w-24 p-2 text-left">Source</th>
              <th className="w-20 p-2 text-left">Size</th>
              <th className="w-24 p-2 text-left">Status</th>
              <th className="w-10 p-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => {
              const source = BOORU_SOURCES[item.post.source];
              const protectedMedia = isProtectedBooruPost(item.post);

              return (
                <tr
                  key={item.id}
                  className="border-b border-white/5 hover:bg-white/5"
                >
                  <td className="p-2">
                    <div className="umbra-surface-deep relative h-10 w-10 overflow-hidden rounded border border-white/10">
                      {!(locked && protectedMedia) && <img
                        data-umbra-nsfw-media={protectedMedia ? '' : undefined}
                        src={item.post.previewUrl}
                        alt=""
                        className="w-full h-full object-cover"
                      />}
                      <NsfwPrivacyShield protectedMedia={protectedMedia} compact />
                    </div>
                  </td>
                  <td className="p-2">
                    <span className="font-mono text-xs text-zinc-300">
                      {item.post.md5}.{item.post.fileExt}
                    </span>
                  </td>
                  <td className="p-2">
                    <span className="block max-w-48 truncate text-xs text-zinc-400" title={item.dataset === item.concept ? item.dataset : `${item.dataset}/${item.concept}`}>
                      {item.dataset === item.concept ? item.dataset : `${item.dataset}/${item.concept}`}
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
                  <td className="p-2"><button type="button" className="forge-button forge-button-icon" disabled={item.status === 'downloading'} onClick={() => onRemove(item.id)} aria-label={`Remove ${item.post.md5} from queue`} title={item.status === 'downloading' ? 'Active download is still running' : 'Remove from list; saved file is kept'}><X size={14} /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
