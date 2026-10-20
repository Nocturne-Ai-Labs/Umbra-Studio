import type { UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';
import { Trash2 } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import type { Flux3LayoutRegion } from '../../../../shared/umbra-ui/flux3Edit';

export function Flux3LayoutControls({ regions, drawing, onDraw, onChange, onAdd, moss = false, promptFields = [] }: {
  regions: Flux3LayoutRegion[];
  promptFields?: UmbraUiPromptSegment[];
  drawing: boolean;
  onDraw: () => void;
  onChange: (regions: Flux3LayoutRegion[]) => void;
  moss?: boolean;
  onAdd?: () => void;
}) {
  const update = (id: string, patch: Partial<Flux3LayoutRegion>) => onChange(regions.map((row) => row.id === id ? { ...row, ...patch } : row));
  return (
    <section aria-label="Layout boxes" className="space-y-2 border-t border-white/10 pt-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-bold text-zinc-300">Layout boxes</h3>
        {moss && onAdd ? <button type="button" onClick={onAdd} className="ml-auto mr-2 rounded border border-white/15 px-2 py-1 text-[10px] text-zinc-300">Add box</button> : null}
        <button type="button" aria-pressed={drawing} onClick={onDraw} className="rounded border border-white/15 px-2 py-1 text-[10px] text-zinc-300">Draw box</button>
      </div>
      <p className="text-[10px] text-zinc-500">{moss ? 'Link a JSON item field to a box, then draw its position. Scene and style fields apply to the whole image. Layout control is experimental.' : 'Draw inside the generation box. Mention <obj_1>, <obj_2> in your prompt.'}</p>
      {regions.map((region, index) => (
        <div key={region.id} className="space-y-1 rounded border border-white/10 p-2">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400">{moss ? `Box ${index + 1}` : `<obj_${index + 1}>`}</span>
            <button type="button" aria-label={`Delete layout box ${index + 1}`} onClick={() => onChange(regions.filter((row) => row.id !== region.id))} className="ml-auto text-zinc-500 hover:text-red-300"><Trash2 size={13} /></button>
          </div>
          {moss && <UmbraSelect ariaLabel={`Layout box ${index + 1} prompt field`} menuTitle="Link JSON field"
            value={region.promptFieldId || ''} options={[{ value: '', label: 'Independent description' },
              ...promptFields.filter(field => field.moss?.enabled && field.moss.purpose === 'item').map((field, fieldIndex) => ({
                value: field.id, label: `${field.label || field.moss?.label || 'Item'} ${fieldIndex + 1}: ${field.text.slice(0, 48) || 'Empty field'}`,
              })), ...(region.promptFieldId && !promptFields.some(field => field.id === region.promptFieldId && field.moss?.purpose === 'item' && field.moss.enabled)
                ? [{ value: region.promptFieldId, label: 'Missing field — relink or unlink' }] : [])]}
            onValueChange={value => update(region.id, { promptFieldId: value || undefined, promptItemIndex: undefined })} size="sm" />}
          {region.promptFieldId && moss ? <p className="text-[10px] text-zinc-400">Uses the linked field’s description, label and exact text.</p> : <>
          <textarea aria-label={`Layout box ${index + 1} description`} value={region.description} maxLength={10000} onChange={(event) => update(region.id, { description: event.target.value })} placeholder="Describe this subject" className="w-full rounded border border-white/10 bg-black/35 p-2 text-xs text-zinc-200" />
          {moss ? <>
            <UmbraSelect ariaLabel={`Layout box ${index + 1} type`} menuTitle="Layout item" value={region.label || 'object'} options={[{ value: 'object', label: 'Object' }, { value: 'text', label: 'Text' }]} onValueChange={(value) => update(region.id, { label: value === 'text' ? 'text' : 'object' })} size="sm" />
            {region.label === 'text' ? <textarea aria-label={`Layout box ${index + 1} exact text`} value={region.text || ''} maxLength={10000} onChange={(event) => update(region.id, { text: event.target.value })} placeholder="Exact words to render" className="w-full rounded border border-white/10 bg-black/35 p-2 text-xs text-zinc-200" /> : null}
          </> : null}
          </>}
          <div className="grid grid-cols-2 gap-1">
            {(['x', 'y', 'width', 'height'] as const).map((key) => (
              <label key={key} className="flex items-center gap-1 text-[9px] text-zinc-500">
                {key}
                <input aria-label={`Layout box ${index + 1} ${key}`} type="number" step="any" value={region[key]} onChange={(event) => {
                  const value = Number(event.target.value);
                  if (Number.isFinite(value) && (key === 'x' || key === 'y' || value > 0)) update(region.id, { [key]: value });
                }} className="min-w-0 w-full rounded border border-white/10 bg-black/35 p-1 text-zinc-300" />
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
