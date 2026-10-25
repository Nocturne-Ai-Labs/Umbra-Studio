import { SlidersHorizontal, RotateCcw } from 'lucide-react';
import { BOORU_SOURCES } from '../sources';
import { SOURCE_SEARCH_TOOLS, sourceSearchModifiers, type SourceSearchSettings } from '../sourceSearchTools';

export function SourceSearchTools({ source, value, onChange }: {
  source: string; value: SourceSearchSettings; onChange: (next: SourceSearchSettings) => void;
}) {
  const tools = SOURCE_SEARCH_TOOLS[source];
  if (!tools) return null;
  const options = value[source] || {};
  const modifiers = sourceSearchModifiers(source, options);
  return <section aria-label="Site search tools" className="space-y-2 border-t border-white/10 pt-3">
    <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
      <SlidersHorizontal size={12} /> Search tools
      <button type="button" className="umbra-icon-button ml-auto p-1" aria-label={`Reset ${BOORU_SOURCES[source]?.name} search tools`}
        title="Reset this site's search tools" disabled={!modifiers.length} onClick={() => onChange({ ...value, [source]: {} })}><RotateCcw size={12} /></button>
    </div>
    <p className="text-[10px] leading-relaxed text-zinc-500">Applies to {BOORU_SOURCES[source]?.name} when you search.</p>
    {(['sort', 'rating'] as const).map(field => <div key={field}>
      <div className="mb-1 text-[10px] text-zinc-400">{field === 'sort' ? 'Sort by' : 'Rating'}</div>
      <div className="flex flex-wrap gap-1">
        {(field === 'sort' ? tools.sorts : tools.ratings).map(item => <button key={item.value} type="button"
          aria-pressed={options[field] === item.value} title={item.value}
          onClick={() => onChange({ ...value, [source]: { ...options, [field]: options[field] === item.value ? undefined : item.value } })}
          className={`forge-button !min-h-7 !px-1.5 !text-[10px] ${options[field] === item.value ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-[var(--umbra-accent)]' : ''}`}>{item.label}</button>)}
      </div>
    </div>)}
    <label className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
      Site minimum score
      <input aria-label={`${BOORU_SOURCES[source]?.name} minimum search score`} type="number" step="1" value={options.score || ''} placeholder="Any"
        className="settings-input !w-16 !px-1.5 !py-1 !text-[11px]"
        onChange={event => onChange({ ...value, [source]: { ...options, score: event.target.value } })} />
    </label>
    {!!options.score?.trim() && !Number.isSafeInteger(Number(options.score)) && <p role="alert" className="text-[10px] text-amber-300">Use a whole number.</p>}
    {modifiers.length > 0 && <p className="break-words text-[10px] leading-relaxed text-zinc-500" title="These controls override matching filters typed in the search field for this site.">{modifiers.join(' · ')}</p>}
  </section>;
}
