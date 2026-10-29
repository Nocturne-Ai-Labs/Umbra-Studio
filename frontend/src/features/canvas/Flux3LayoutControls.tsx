import { AutoSizePromptTextarea } from '@/components/umbra-ui/AutoSizePromptTextarea';
import type { UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';
import { BoxSelect, ChevronDown, Crosshair, Link2, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { getMossLayoutFieldName } from '@/lib/mossLayoutPresentation';
import { cn } from '@/lib/utils';
import type { Flux3LayoutRegion } from '../../../../shared/umbra-ui/flux3Edit';

export function Flux3LayoutControls({ regions, drawing, onDraw, onChange, onAdd, moss = false, promptFields = [], selectedId, onLocate }: {
  regions: Flux3LayoutRegion[];
  promptFields?: UmbraUiPromptSegment[];
  drawing: boolean;
  onDraw: () => void;
  onChange: (regions: Flux3LayoutRegion[]) => void;
  moss?: boolean;
  onAdd?: () => void;
  selectedId?: string;
  onLocate?: (id: string) => void;
}) {
  const update = (id: string, patch: Partial<Flux3LayoutRegion>) => onChange(regions.map(row => row.id === id ? { ...row, ...patch } : row));
  const fields = promptFields.filter(field => field.moss?.enabled && field.moss.purpose === 'item');
  const iconButton = 'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border border-[var(--umbra-border)] text-zinc-400 transition hover:bg-white/5 hover:text-[var(--umbra-text)] focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]';
  return (
    <section aria-label="Layout boxes" className="space-y-2 border-t border-[var(--umbra-border)] pt-3">
      <div className="flex items-center gap-2">
        <BoxSelect size={12} className="text-[var(--umbra-accent)]" />
        <h3 className="text-[10px] font-bold uppercase tracking-wider text-[var(--umbra-text)]">Layout boxes</h3>
        <span className="font-mono text-[10px] text-zinc-500">{regions.length}</span>
        <div className="ml-auto flex gap-1">
          {moss && onAdd ? <button type="button" onClick={onAdd} aria-label="Add layout box" title="Add layout box" className={iconButton}><Plus size={13} /></button> : null}
          <button type="button" aria-pressed={drawing} onClick={onDraw}
            title={moss ? 'Draw a box with an independent description' : 'Draw layout box'}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded border px-2 text-[10px] transition focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]', drawing ? 'border-[var(--umbra-accent)] text-[var(--umbra-accent)]' : 'border-[var(--umbra-border)] text-zinc-300 hover:bg-white/5')}>
            <BoxSelect size={12} />{drawing ? 'Stop drawing' : moss ? 'Unlinked box' : 'Draw box'}
          </button>
        </div>
      </div>
      {moss ? <p className="text-[10px] leading-relaxed text-zinc-500">Draw from a JSON item field to link its subject. Select a box to move or resize it.</p>
        : <p className="text-[10px] text-zinc-500">Draw inside the generation box. Mention {'<obj_1>, <obj_2>'} in your prompt.</p>}
      {!regions.length && moss ? <div className="rounded border border-dashed border-[var(--umbra-border)] px-3 py-3 text-[11px] leading-relaxed text-zinc-400">No boxes yet. Use <strong className="font-medium text-[var(--umbra-text)]">Draw box</strong> on a character, object or text field. Scene and style apply to the whole image.</div> : null}
      {regions.map((region, index) => {
        const field = fields.find(entry => entry.id === region.promptFieldId);
        const duplicate = !!region.promptFieldId && regions.some(row => row.id !== region.id && row.promptFieldId === region.promptFieldId);
        const issue = region.promptFieldId && !field ? 'Field missing. Choose another field or unlink this box.'
          : duplicate ? 'This field already has a box. Link a different field.'
            : field && !field.text.trim() && !field.moss?.text.trim() ? 'Add a description or exact text to the linked field.' : '';
        const title = moss ? field ? getMossLayoutFieldName(field, promptFields) : `Box ${index + 1}` : `<obj_${index + 1}>`;
        return <div key={region.id} className={cn('min-w-0 space-y-2 rounded border bg-black/20 p-2 transition-colors', issue ? 'border-amber-400/40' : selectedId === region.id ? 'border-[var(--umbra-accent)]' : 'border-[var(--umbra-border)]')}>
          <div className="flex min-w-0 items-center gap-1.5">
            {moss && <span className="rounded border border-[var(--umbra-border)] px-1 py-0.5 font-mono text-[9px] text-zinc-500">{index + 1}</span>}
            {region.promptFieldId && <Link2 size={11} className="shrink-0 text-[var(--umbra-accent)]" />}
            <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[var(--umbra-text)]" title={title}>{title}</span>
            {moss && onLocate && <button type="button" aria-label={`Locate layout box ${index + 1}`} title="Select and center this box" className={iconButton} onClick={() => onLocate(region.id)}><Crosshair size={13} /></button>}
            <button type="button" aria-label={`Delete layout box ${index + 1}`} title="Delete box; keep the prompt field" onClick={() => onChange(regions.filter(row => row.id !== region.id))} className={cn(iconButton, 'hover:text-red-300')}><Trash2 size={13} /></button>
          </div>
          {moss && <UmbraSelect ariaLabel={`Layout box ${index + 1} prompt field`} menuTitle="Link JSON field" value={region.promptFieldId || ''}
            options={[{ value: '', label: 'Independent description' }, ...fields.map(entry => ({ value: entry.id,
              label: `${getMossLayoutFieldName(entry, promptFields)}: ${entry.text.slice(0, 48) || 'Empty field'}`,
              disabled: regions.some(row => row.id !== region.id && row.promptFieldId === entry.id),
            })), ...(region.promptFieldId && !field ? [{ value: region.promptFieldId, label: 'Missing field' }] : [])]}
            onValueChange={value => update(region.id, { promptFieldId: value || undefined, promptItemIndex: undefined })} size="sm" />}
          {issue && <p role="alert" className="flex gap-1.5 text-[10px] leading-relaxed text-amber-200"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{issue}</p>}
          {region.promptFieldId && moss ? field && <p className="line-clamp-2 text-[11px] leading-relaxed text-zinc-400" title={field.text}>{field.text || field.moss?.text}</p> : <>
            <AutoSizePromptTextarea aria-label={`Layout box ${index + 1} description`} value={region.description} maxLength={10000} onChange={event => update(region.id, { description: event.target.value })} placeholder="Describe this subject" className="w-full rounded border border-[var(--umbra-border)] bg-black/35 p-2 text-xs text-[var(--umbra-text)]" />
            {moss ? <>
              <UmbraSelect ariaLabel={`Layout box ${index + 1} type`} menuTitle="Layout item" value={region.label || 'object'} options={[{ value: 'object', label: 'Object' }, { value: 'text', label: 'Text' }]} onValueChange={value => update(region.id, { label: value === 'text' ? 'text' : 'object' })} size="sm" />
              {region.label === 'text' ? <AutoSizePromptTextarea aria-label={`Layout box ${index + 1} exact text`} value={region.text || ''} maxLength={10000} onChange={event => update(region.id, { text: event.target.value })} placeholder="Exact words to render" className="w-full rounded border border-[var(--umbra-border)] bg-black/35 p-2 text-xs text-[var(--umbra-text)]" /> : null}
            </> : null}
          </>}
          <details className="group" open={!moss || undefined}>
            <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded py-1 text-[10px] text-zinc-400 focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)] [&::-webkit-details-marker]:hidden">
              <ChevronDown size={12} className="-rotate-90 transition-transform group-open:rotate-0" /><span>Position & size</span>
              <span className="ml-auto font-mono text-[9px] text-zinc-500">{Math.round(region.width)} × {Math.round(region.height)} px</span>
            </summary>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(['x', 'y', 'width', 'height'] as const).map(key => <label key={key} className="space-y-1 text-[9px] uppercase text-zinc-500">
                <span>{key === 'x' ? 'Left' : key === 'y' ? 'Top' : key}</span>
                <input aria-label={`Layout box ${index + 1} ${key}`} type="number" step="any" value={region[key]} onChange={event => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && (key === 'x' || key === 'y' || value > 0)) update(region.id, { [key]: value });
                }} className="h-7 min-w-0 w-full rounded border border-[var(--umbra-border)] bg-black/35 px-2 font-mono text-[11px] text-[var(--umbra-text)] focus:border-[var(--umbra-accent)] focus:outline-none" />
              </label>)}
            </div>
          </details>
        </div>;
      })}
    </section>
  );
}
