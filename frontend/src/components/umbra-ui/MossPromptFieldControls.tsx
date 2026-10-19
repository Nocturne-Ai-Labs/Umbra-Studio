import { UmbraSelect } from '@/components/ui/UmbraSelect';
import type { MossPromptField } from '../../../../shared/umbra-ui/mossPromptFields';

export function MossPromptFieldControls({ value, onChange }: { value: MossPromptField; onChange: (next: MossPromptField) => void }) {
  const inputClass = 'h-8 w-full min-w-0 rounded border border-white/10 bg-black/30 px-2 text-xs text-zinc-200';
  const role = value.purpose !== 'item' ? value.purpose : ['character', 'object', 'text'].includes(value.label) ? value.label : 'custom';
  return <div className="mb-2 space-y-2">
    <UmbraSelect ariaLabel="MOSS field purpose" menuTitle="Field purpose" value={role}
      options={[{ value: 'scene', label: 'Scene / Location' }, { value: 'meta', label: 'Style / Metadata' }, { value: 'character', label: 'Character' }, { value: 'object', label: 'Object' }, { value: 'text', label: 'Text' }, { value: 'custom', label: 'Custom label' }]}
      onValueChange={next => onChange({ ...value, purpose: next === 'scene' || next === 'meta' ? next : 'item', label: next === 'custom' ? 'subject' : next })} />
    {role === 'custom' && <input aria-label="MOSS item label" className={inputClass} value={value.label} onChange={event => onChange({ ...value, label: event.target.value })} />}
    {role === 'text' && <textarea aria-label="Text to render" placeholder="Exact words to render" className={`${inputClass} h-16`} value={value.text} onChange={event => onChange({ ...value, text: event.target.value })} />}
    {value.purpose === 'item' && <details className="rounded border border-white/10 p-2 text-xs text-zinc-400">
      <summary className="cursor-pointer">Placement · % of image</summary>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {['Top', 'Left', 'Bottom', 'Right'].map((label, index) => <label key={label} className="min-w-0 space-y-1"><span>{label}</span>
          <input aria-label={`MOSS ${label.toLowerCase()} percent`} type="number" min={0} max={100} step={1} className={inputClass} value={value.bounds[index]} onChange={event => {
            if (!event.target.value.trim()) return;
            const bounds = [...value.bounds] as MossPromptField['bounds'];
            bounds[index] = Number(event.target.value);
            if (bounds.every(n => Number.isFinite(n) && n >= 0 && n <= 100) && bounds[2] > bounds[0] && bounds[3] > bounds[1]) onChange({ ...value, bounds });
          }} /></label>)}
      </div>
    </details>}
  </div>;
}
