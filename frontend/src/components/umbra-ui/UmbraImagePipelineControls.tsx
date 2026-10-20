import { useId } from 'react';
import { RotateCcw, Sparkles } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { normalizeImagePipelineSettings, type ImagePipelineSettings } from '../../../../shared/umbra-ui/imagePipelineSettings';
import type { UmbraUiPipelineCapabilities } from '../../../../shared/umbra-ui/pipelineTypes';

interface Props {
  value?: ImagePipelineSettings;
  onChange: (value: ImagePipelineSettings) => void;
  capabilities: UmbraUiPipelineCapabilities;
  section: 'flow' | 'output';
}

export function UmbraImagePipelineControls({ value, onChange, capabilities, section }: Props) {
  const id = useId();
  const settings = normalizeImagePipelineSettings(value);
  const inputClass = 'h-8 w-full min-w-0 rounded border border-white/10 bg-black/30 px-2 font-mono text-xs text-zinc-200 focus:border-[var(--accent-color)] focus:outline-none';
  const labelClass = 'block text-[9px] font-bold uppercase tracking-wider text-zinc-400';
  if (section === 'flow') {
    if (capabilities.flowShift.support !== 'adjustable') return null;
    const defaultShift = typeof capabilities.flowShift.value === 'number' ? capabilities.flowShift.value : undefined;
    return <div data-umbra-flow-shift="" className="space-y-2 border-t border-white/10 pt-3">
      {capabilities.mossPromptEnhancer.support === 'adjustable' && <div className="flex items-center justify-between gap-2 pb-2">
        <span className="flex items-center gap-2 text-xs text-zinc-200"><Sparkles size={14} />Prompt enhancer</span>
        <button type="button" role="switch" aria-label="MOSS prompt enhancer" aria-checked={settings.mossPromptEnhancer}
          title="Enhance captions locally before generation. Keeps JSON layout and text fields intact."
          className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors ${settings.mossPromptEnhancer ? 'border-[var(--accent-color)] bg-[var(--accent-color)]' : 'border-white/20 bg-white/5'}`}
          onClick={() => onChange({ ...settings, mossPromptEnhancer: !settings.mossPromptEnhancer })}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${settings.mossPromptEnhancer ? 'left-0.5 translate-x-4' : 'left-0.5'}`} />
        </button>
      </div>}
      <div className="flex items-center justify-between gap-2">
        <label className={labelClass} htmlFor={id}>Flow shift</label>
        <button type="button" aria-label="Use workflow flow shift" title="Use workflow default" className="rounded p-1 text-zinc-500 hover:text-zinc-200" onClick={() => onChange({ ...settings, flowShift: null })}><RotateCcw size={12} /></button>
      </div>
      <input id={id} aria-label="Flow shift" type="number" step="0.1" placeholder={defaultShift === undefined ? 'Workflow default' : `${defaultShift} · workflow default`} value={settings.flowShift ?? defaultShift ?? ''} className={inputClass} onChange={event => {
        const raw = event.target.value;
        const next = Number(raw);
        if (!raw.trim() || (Number.isFinite(next) && next > 0)) onChange({ ...settings, flowShift: raw.trim() ? next : null });
      }} />
    </div>;
  }
  if (capabilities.imageOutput.support !== 'adjustable') return null;
  const lossless = settings.outputFormat === 'png';
  return <div data-umbra-image-output="" className="space-y-2 border-t border-white/10 pt-3">
    <span className={labelClass}>Output</span>
    <UmbraSelect ariaLabel="Output image format" menuTitle="Output image format" value={settings.outputFormat} options={[{value:'png',label:'PNG · lossless'},{value:'jpeg',label:'JPEG'}]} onValueChange={outputFormat => onChange({ ...settings, outputFormat: outputFormat as ImagePipelineSettings['outputFormat'] })} />
    <label className="block space-y-1.5">
      <span className={labelClass}>Output quality {lossless ? '· lossless PNG' : `· ${settings.outputQuality}%`}</span>
      <input aria-label="Output quality" type="number" min={1} max={100} step={1} disabled={lossless} value={lossless ? 100 : settings.outputQuality} className={`${inputClass} disabled:opacity-40`} onChange={event => {
        if (!event.target.value.trim()) return;
        onChange(normalizeImagePipelineSettings({ ...settings, outputQuality: event.target.value }));
      }} />
    </label>
  </div>;
}
