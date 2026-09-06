import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, RefreshCw, X } from 'lucide-react';
import { dismissGalleryTransfer, retryGalleryTransferIndex, type GalleryTransferState } from '@/lib/galleryTransfers';

const phaseLabels: Record<string, string> = {
  queued: 'Queued', preparing: 'Preparing', transferring: 'Transferring', sidecars: 'Updating sidecars',
  indexing: 'Updating Gallery', completed: 'Completed', failed: 'Needs attention',
};
const bytes = (value: number) => value >= 1024 ** 3 ? `${(value / 1024 ** 3).toFixed(1)} GB` : `${(value / 1024 ** 2).toFixed(1)} MB`;

export function GalleryTransferStrip({ transfer }: { transfer: GalleryTransferState | null }) {
  const [expanded, setExpanded] = useState(false);
  const [page, setPage] = useState(0);
  if (!transfer) return null;
  const failed = transfer.results.filter(result => !result.success);
  const needsAttention = Boolean(transfer.error || failed.length);
  const label = transfer.reconnecting ? 'Reconnecting to transfer' : phaseLabels[transfer.phase] || transfer.phase;
  const isCounting = transfer.phase === 'queued' || transfer.phase === 'preparing' || transfer.reconnecting;
  const currentName = (transfer.currentPath || transfer.destination).replaceAll('\\', '/').split('/').pop();
  const error = transfer.error || failed[0]?.error || 'Some items could not be transferred.';
  const errorSummary = /ENOENT/.test(error) ? 'Source file not found.'
    : /EEXIST/.test(error) ? 'Destination already exists; existing file preserved.'
    : /EACCES|EPERM/.test(error) ? 'File access was denied.'
    : /ENOSPC/.test(error) ? 'Destination has insufficient free space.' : error;
  const maxPage = Math.max(0, Math.ceil(transfer.results.length / 25) - 1);
  const currentPage = Math.min(page, maxPage);
  return (
    <aside data-gallery-transfer-strip className="relative z-40 w-full shrink-0 border-b border-[var(--umbra-accent)] bg-zinc-950 px-3 py-2 text-xs text-zinc-200">
      <div className="flex min-w-0 items-center gap-2">
        {transfer.active ? <Loader2 size={16} className="shrink-0 animate-spin text-[var(--umbra-accent)]" /> : needsAttention ? <AlertTriangle size={16} className="shrink-0 text-amber-400" /> : <Check size={16} className="shrink-0 text-[var(--umbra-accent)]" />}
        <div className="min-w-0 flex-1">
          <div role="status" className="flex flex-wrap gap-x-2 gap-y-0.5">
            <strong>{transfer.mode === 'copy' ? 'Copy' : 'Move'}: {label}</strong>
            <span>{transfer.active ? `${transfer.completedUnits}/${transfer.totalUnits || transfer.totalPaths} processed` : `${transfer.completedPaths}/${transfer.totalPaths} successful`}</span>
            {failed.length > 0 && <span className="text-amber-400">{failed.length} failed</span>}
          </div>
          <div className="truncate text-zinc-400" title={transfer.currentPath || transfer.destination}>{currentName}</div>
        </div>
        <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-white/10" aria-label="Transfer details" title="Transfer details" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</button>
        {transfer.indexPending && !transfer.active && <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-white/10" aria-label="Retry Gallery indexing" title="Retry Gallery indexing without transferring files again" onClick={() => void retryGalleryTransferIndex()}><RefreshCw size={18} /></button>}
        {!transfer.active && <button type="button" className="flex h-9 w-9 shrink-0 items-center justify-center rounded hover:bg-white/10" aria-label="Dismiss transfer" title="Dismiss transfer" onClick={dismissGalleryTransfer}><X size={18} /></button>}
      </div>
      <div role="progressbar" aria-label="Transfer progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={isCounting ? undefined : transfer.percent} className="mt-1.5 h-1 overflow-hidden rounded bg-zinc-800">
        <div className={`${isCounting ? 'animate-pulse' : ''} h-full bg-[var(--umbra-accent)]`} style={{ width: `${isCounting ? 25 : transfer.percent}%` }} />
      </div>
      {transfer.active && transfer.phase === 'transferring' && Boolean(transfer.fileTotalBytes) && <div className="mt-1 text-zinc-400">
        Current file: {bytes(transfer.fileBytes || 0)} / {bytes(transfer.fileTotalBytes || 0)}
        <progress aria-label="Current file copy progress" className="mt-1 block h-1 w-full accent-[var(--umbra-accent)]" max={transfer.fileTotalBytes} value={transfer.fileBytes || 0} />
      </div>}
      {needsAttention && !transfer.active && <div className="mt-1 line-clamp-2 break-words text-amber-300" title={error}>{errorSummary}</div>}
      {expanded && <div className="mt-2 max-h-40 overflow-y-auto border-t border-zinc-800 pt-2">
        <div className="break-all text-zinc-400">Destination: {transfer.destination}</div>
        {transfer.error && <div className="break-words text-amber-300">{transfer.error}</div>}
        {maxPage > 0 && <div className="flex items-center gap-2">
          <button type="button" className="flex h-9 w-9 items-center justify-center disabled:opacity-30" aria-label="Previous transfer results" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button>
          <span>{currentPage + 1} / {maxPage + 1}</span>
          <button type="button" className="flex h-9 w-9 items-center justify-center disabled:opacity-30" aria-label="Next transfer results" disabled={currentPage === maxPage} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button>
        </div>}
        {transfer.results.slice(currentPage * 25, currentPage * 25 + 25).map((result, index) => <div key={`${result.path}-${index}`} className="mt-1 break-all">{result.success ? 'Transferred' : 'Failed'}: {result.path}{result.error ? ` - ${result.error}` : result.newPath ? ` -> ${result.newPath}` : ''}</div>)}
      </div>}
    </aside>
  );
}
