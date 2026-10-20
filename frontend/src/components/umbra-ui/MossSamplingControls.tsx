import { Gauge, Layers, Sparkles, ChevronDown } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { normalizeMossSamplingSettings, type MossSamplingSettings } from '../../../../shared/umbra-ui/mossSampling';

export function MossSamplingControls({ value, onChange }: { value: MossSamplingSettings; onChange: (value: MossSamplingSettings) => void }) {
  const settings = normalizeMossSamplingSettings(value);
  const update = (patch: Partial<MossSamplingSettings>) => onChange(normalizeMossSamplingSettings({ ...settings, ...patch }));
  const inputClass = 'h-8 w-full min-w-0 rounded border border-white/10 bg-black/30 px-2 font-mono text-xs text-zinc-200 focus:border-[var(--accent-color)] focus:outline-none';
  const toggle = (key: 'negativeSkip' | 'guidance' | 'spectrum', label: string, description: string, icon: React.ReactNode) => <div className="flex items-center justify-between gap-2">
    <span className="flex items-center gap-2 text-xs text-zinc-200" title={description}>{icon}{label}</span>
    <button type="button" role="switch" aria-label={`MOSS ${label}`} aria-checked={settings[key]} title={description}
      className="inline-flex h-8 w-11 shrink-0 items-center justify-center rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-color)]"
      onClick={() => update({ [key]: !settings[key] })}>
      <span aria-hidden="true" className={`relative block h-6 w-10 shrink-0 rounded-full border transition-colors ${settings[key] ? 'border-[var(--accent-color)] bg-[var(--accent-color)]' : 'border-white/20 bg-white/5'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${settings[key] ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  </div>;
  const number = (key: 'negativeSkipEnd' | 'guidanceScale' | 'guidanceStart' | 'guidanceEnd', label: string, max: number) => <label className="block min-w-0 space-y-1">
    <span className="text-[10px] text-zinc-400">{label}</span>
    <input type="number" aria-label={`MOSS ${label}`} min={0} max={max} step={0.01} value={settings[key]} className={inputClass}
      onChange={event => { if (event.target.value.trim()) update({ [key]: Number(event.target.value) }); }} />
  </label>;
  return <div data-moss-sampling="" className="space-y-3 pt-2">
    {toggle('negativeSkip', 'Negative-branch skip', 'Skip layer 22 on the negative branch. Recommended MOSS baseline; requires CFG above 1.', <Layers size={14} />)}
    {toggle('guidance', 'Extra guidance', 'Experimental additional SkipLayerGuidanceDiT pass at layer 22. May change detail and adds generation time.', <Sparkles size={14} />)}
    {toggle('spectrum', 'Spectrum acceleration', 'Experimental feature forecasting. Requires MOSS Spectrum acceleration in Setup. May change image detail; gains depend on the job.', <Gauge size={14} />)}
    {settings.spectrum && <p className="text-[10px] text-zinc-400">Install MOSS Spectrum acceleration in Setup before enabling. Uses additional cache memory.</p>}
    <details className="group rounded border border-white/10 bg-black/20">
      <summary className="flex cursor-pointer list-none items-center justify-between px-2 py-2 text-[10px] text-zinc-400 hover:text-zinc-200">MOSS tuning<ChevronDown size={12} className="transition-transform group-open:rotate-180" /></summary>
      <div className="space-y-2 border-t border-white/10 p-2">
        {settings.negativeSkip && number('negativeSkipEnd', 'Skip end · 0–1', 1)}
        {settings.guidance && <>
          {number('guidanceScale', 'Extra guidance strength', 10)}
          <div className="grid grid-cols-2 gap-2">{number('guidanceStart', 'Guidance start · 0–1', 1)}{number('guidanceEnd', 'Guidance end · 0–1', 1)}</div>
        </>}
        {settings.spectrum && <UmbraSelect ariaLabel="MOSS Spectrum cache" menuTitle="Spectrum cache" value={settings.spectrumCache}
          options={[{ value: 'main_device', label: 'GPU cache · faster' }, { value: 'cpu', label: 'CPU cache · less VRAM' }]}
          onValueChange={spectrumCache => update({ spectrumCache: spectrumCache as MossSamplingSettings['spectrumCache'] })} />}
        <button type="button" className="text-[10px] text-zinc-400 hover:text-zinc-200" onClick={() => onChange(normalizeMossSamplingSettings(null))}>Reset MOSS sampling</button>
      </div>
    </details>
  </div>;
}
