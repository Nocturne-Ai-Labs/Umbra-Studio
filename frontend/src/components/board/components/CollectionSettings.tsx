import { Film, Image, Layers } from 'lucide-react';
import { useState } from 'react';
import { collectionOptionsError, type CollectionOptions, type CollectionMediaType } from '../collectionOptions';

const MEDIA_OPTIONS: { id: CollectionMediaType; label: string; icon: typeof Image }[] = [
  { id: 'image', label: 'Still images', icon: Image },
  { id: 'gif', label: 'GIFs', icon: Layers },
  { id: 'video', label: 'Videos', icon: Film },
];

export function CollectionSettings({ value, onChange }: { value: CollectionOptions; onChange: (patch: Partial<CollectionOptions>) => void }) {
  const error = collectionOptionsError(value);
  const [expanded, setExpanded] = useState(() => typeof window === 'undefined' || window.matchMedia('(min-width: 768px)').matches);
  return <details className="forge-disclosure mt-3 text-xs" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>Collection settings<span className={`ml-auto text-[10px] ${error ? 'text-amber-300' : 'text-zinc-500'}`}>{error ? 'Check settings' : 'Score, limits & media'}</span></summary>
    <div className="custom-scrollbar max-h-[32dvh] overflow-y-auto">
    <div className="forge-collection-fields grid gap-3 py-3">
      <label className="min-w-0 space-y-1.5">
        <span className="block text-zinc-300">Minimum score</span>
        <input aria-label="Minimum score" type="number" step="1" value={value.minimumScore} onChange={event => onChange({ minimumScore: event.target.value })} placeholder="Any score" className="umbra-input h-9 w-full rounded px-2" />
        <span className="block text-[11px] leading-relaxed text-zinc-500">Leave blank for any score. Filters the loaded results.</span>
      </label>
      <label className="min-w-0 space-y-1.5">
        <span className="block text-zinc-300">Download limit per batch</span>
        <input aria-label="Download limit per batch" type="number" min="0" step="1" value={value.downloadLimit} onChange={event => onChange({ downloadLimit: event.target.value })} className="umbra-input h-9 w-full rounded px-2" />
        <span className="block text-[11px] leading-relaxed text-zinc-500">0 = all selected. Extra selections stay for the next batch. Applies per destination.</span>
      </label>
      <fieldset className="min-w-0 space-y-1.5">
        <legend className="mb-1.5 text-zinc-300">Media types</legend>
        <div className="flex flex-wrap gap-1.5">{MEDIA_OPTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" className="forge-button" aria-pressed={value.mediaTypes.includes(id)} onClick={() => onChange({ mediaTypes: value.mediaTypes.includes(id) ? value.mediaTypes.filter(type => type !== id) : [...value.mediaTypes, id] })}><Icon size={14} />{label}</button>)}</div>
        <p className="text-[11px] leading-relaxed text-zinc-500">Original files are preserved. Videos are saved to the folder; dataset caption tools process images.</p>
      </fieldset>
    </div>
    <p className="pb-2 text-[11px] text-zinc-500">Filters apply to loaded results from every source. Load more to find additional matches.</p>
    {error && <p role="alert" className="pb-2 text-xs text-amber-300">{error}</p>}
    </div>
  </details>;
}
