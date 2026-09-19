import { Download, Loader2 } from 'lucide-react';
import type { DatasetImage } from '../types';

export function DatasetRedownloadButton({ image, busy, onRedownload, compact = false }: {
  image: DatasetImage; busy: boolean; onRedownload: (image: DatasetImage) => void; compact?: boolean;
}) {
  const label = busy ? 'Re-downloading original...' : 'Re-download original';
  return (
    <button
      type="button"
      disabled={busy || !image.canRedownload}
      title={image.canRedownload ? label : 'No recoverable booru source for this image'}
      aria-label={label}
      onClick={event => { event.stopPropagation(); onRedownload(image); }}
      onDoubleClick={event => event.stopPropagation()}
      className={`umbra-icon-button inline-flex shrink-0 items-center justify-center gap-2 rounded border border-white/15 bg-black/80 text-xs text-zinc-200 disabled:opacity-50 ${compact ? 'h-8 w-8' : 'min-h-8 px-2 py-1'}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      {!compact && label}
    </button>
  );
}
