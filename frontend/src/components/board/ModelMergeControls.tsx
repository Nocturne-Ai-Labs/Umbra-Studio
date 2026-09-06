import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, CircleHelp, Plus, RotateCcw, Shuffle, Trash2, Undo2 } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { BLOCK_MIX_RANDOM_MODES, blockMixRandomRange, randomizeBlockMix, type BlockMixRandomMode } from '@/lib/modelMergeRandomizer';

export type MergeLora = { id: string; model: string; enabled: boolean; strength: number };
export type MergeLoraModel = { id: string; name: string; bytes: number };
export const mergeInputClass = 'w-full min-h-11 rounded-md border border-[var(--umbra-border)] bg-[var(--umbra-bg)] px-3 text-sm text-[var(--umbra-text)]';
export const mergeButtonClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-md border border-[var(--umbra-border)] px-3 text-sm disabled:cursor-not-allowed disabled:opacity-40 hover:bg-white/5';

function Triggers({ model }: { model: string }) {
  const [triggers, setTriggers] = useState<string[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    setTriggers([]);
    void fetch('/api/data-forge/model-merge/lora-info', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: model }) })
      .then(async response => { if (response.ok) { const value = await response.json(); if (!controller.signal.aborted) setTriggers(value.triggers || []); } })
      .catch(() => undefined);
    return () => controller.abort();
  }, [model]);
  return <p className="break-words text-xs text-[var(--umbra-text-muted)]">Triggers: {triggers.length ? triggers.join(', ') : 'Not specified'}</p>;
}

export function MergeLoraStack({ side, entries, models, locked, onChange }: { side: string; entries: MergeLora[]; models: MergeLoraModel[]; locked: boolean; onChange: (entries: MergeLora[]) => void }) {
  const [search, setSearch] = useState('');
  const update = (id: string, patch: Partial<MergeLora>) => onChange(entries.map(entry => entry.id === id ? { ...entry, ...patch } : entry));
  const move = (index: number, direction: number) => {
    const next = [...entries];
    [next[index], next[index + direction]] = [next[index + direction], next[index]];
    onChange(next);
  };
  return <section className="space-y-3 pt-3" aria-label={`Model ${side} LoRA stack`}>
    <h3 className="text-sm font-semibold">Model {side} LoRAs <span className="text-[var(--umbra-text-muted)]">({entries.length})</span></h3>
    <input className={mergeInputClass} type="search" aria-label={`Search Model ${side} LoRAs`} placeholder="Search local LoRAs..." value={search} onChange={event => setSearch(event.target.value)} disabled={locked} />
    <UmbraSelect value="" ariaLabel={`Add Model ${side} LoRA`} placeholder="Add LoRA" leadingIcon={<Plus size={15} />} options={models.filter(model => model.id.toLowerCase().includes(search.toLowerCase())).map(model => ({ value: model.id, label: model.name, description: model.id }))} onValueChange={model => onChange([...entries, { id: crypto.randomUUID(), model, strength: 1, enabled: true }])} disabled={locked || entries.length >= 32} buttonClassName="!min-h-11 !h-auto !text-sm" />
    {entries.map((entry, index) => <div key={entry.id} className="space-y-2 border-t border-[var(--umbra-border)] pt-3" data-merge-lora={entry.id}>
      <div className="flex items-start gap-2"><input aria-label={`Enable ${side} LoRA ${index + 1}`} className="mt-1 h-5 w-5 shrink-0 accent-[var(--umbra-accent)]" type="checkbox" checked={entry.enabled} disabled={locked} onChange={event => update(entry.id, { enabled: event.target.checked })} /><span className="min-w-0 break-all text-sm">{entry.model.replace(/^loras\//, '')}</span></div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs">Strength<input className={`${mergeInputClass} !w-24 text-center`} type="number" min={-2} max={2} step={0.05} aria-label={`${side} LoRA ${index + 1} strength`} value={entry.strength} disabled={locked} onChange={event => update(entry.id, { strength: Math.max(-2, Math.min(2, Number(event.target.value) || 0)) })} /></label>
        <div className="ml-auto flex gap-1">
          <button className={mergeButtonClass} title="Move LoRA up" aria-label={`Move ${side} LoRA ${index + 1} up`} disabled={locked || index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button>
          <button className={mergeButtonClass} title="Move LoRA down" aria-label={`Move ${side} LoRA ${index + 1} down`} disabled={locked || index === entries.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button>
          <button className={`${mergeButtonClass} text-red-400`} title="Remove LoRA" aria-label={`Remove ${side} LoRA ${index + 1}`} disabled={locked} onClick={() => onChange(entries.filter(item => item.id !== entry.id))}><Trash2 size={15} /></button>
        </div>
      </div>
      <Triggers model={entry.model} />
    </div>)}
  </section>;
}

function BlockMixSlider({ label, percentage, locked, onChange }: { label: string; percentage: number; locked: boolean; onChange: (value: number) => void }) {
  const display = Math.round(percentage * 100) / 100;
  return <div className="min-w-0 space-y-1">
    <div className="flex items-center justify-between gap-2 text-xs tabular-nums">
      <span className="font-semibold text-[var(--umbra-accent)]">A {Math.round((100 - display) * 100) / 100}%</span>
      <span className="font-semibold text-emerald-400">B {display}%</span>
    </div>
    <div className="flex items-center gap-3">
      <div className="relative min-w-0 flex-1">
        <span aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 h-4 w-px -translate-y-1/2 bg-white/60" />
        <input type="range" min={0} max={100} step={1} value={percentage} disabled={locked}
          aria-label={`${label} blend`} aria-valuetext={`Model A ${100 - display} percent, Model B ${display} percent`}
          className="umbra-accent-mix-slider umbra-block-mix-slider relative !h-11 !min-h-11 rounded-sm focus-visible:ring-2 focus-visible:ring-[var(--umbra-accent)] disabled:opacity-50"
          style={{ backgroundImage: 'linear-gradient(to right, var(--umbra-accent), #34d399)' }}
          onChange={event => onChange(Number(event.target.value))} />
      </div>
      <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--umbra-text-muted)]">
        <input type="number" min={0} max={100} step={1} value={display} disabled={locked}
          aria-label={`${label} B percentage`} className={`${mergeInputClass} !w-20 text-center`}
          onChange={event => onChange(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />% B
      </label>
    </div>
  </div>;
}

export function MergeBlockEditor({ count, ratio, values, locked, onChange }: { count: number; ratio: number; values: Record<string, number>; locked: boolean; onChange: (value: Record<string, number>) => void }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [bulkRatio, setBulkRatio] = useState(50);
  const [helpBlock, setHelpBlock] = useState<number | null>(null);
  const [randomMode, setRandomMode] = useState<BlockMixRandomMode>('light');
  const [randomUndo, setRandomUndo] = useState<{ before: Record<string, number>; after: Record<string, number> } | null>(null);
  const range = blockMixRandomRange(ratio, randomMode);
  const randomTargets = selected.filter(index => index < count);
  const canUndo = randomUndo && JSON.stringify(randomUndo.after) === JSON.stringify(values);
  const randomize = () => {
    if (locked) return;
    const after = randomizeBlockMix(values, count, ratio, randomMode, randomTargets);
    setRandomUndo({ before: { ...values }, after });
    onChange(after);
  };
  const change = (indices: number[], percentage?: number) => {
    const next = { ...values };
    for (const index of indices.filter(index => index < count)) {
      if (percentage === undefined) delete next[index];
      else next[index] = percentage / 100;
    }
    onChange(next);
  };
  return <section aria-label="Transformer blocks" className="space-y-4">
    <details className="border-b border-[var(--umbra-border)] pb-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-3 font-semibold">What do these blocks affect?</summary>
      <dl className="grid gap-4 pb-2 text-xs leading-relaxed sm:grid-cols-2">
        <div><dt className="font-semibold">Image and prompt relationships</dt><dd className="mt-1 text-[var(--umbra-text-muted)]">Each block connects image features through self-attention, relates them to the prompt through cross-attention, and transforms those features. Blocks work together; none is a dedicated face, style, or background control.</dd></div>
        <div><dt className="font-semibold">Why blend individual blocks?</dt><dd className="mt-1 text-[var(--umbra-text-muted)]">A block blend combines that stage's learned weights from the two models. It can change the result differently from a whole-model blend, but the effect depends on the checkpoints and prompt. A-only and B-only are complete weight swaps for that block.</dd></div>
        <div><dt className="font-semibold">Depth, not denoising steps</dt><dd className="mt-1 text-[var(--umbra-text-muted)]">Block numbers describe order inside the network. All these stages run during each model evaluation, not at separate points on the sampler timeline. Earlier does not reliably mean composition, and later does not reliably mean detail.</dd></div>
        <div><dt className="font-semibold">Hardware and quality</dt><dd className="mt-1 text-[var(--umbra-text-muted)]">Blending keeps the same architecture and block count; it does not shrink the model or save inference VRAM. Quality is best compared using the same seed, prompt, and generation settings, changing a small number of blocks at a time.</dd></div>
      </dl>
    </details>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={selected.filter(i => i < count).length === count} disabled={locked} onChange={event => setSelected(event.target.checked ? Array.from({ length: count }, (_, i) => i) : [])} />All {count} blocks</label>
      <div className="min-w-0 basis-72 grow"><BlockMixSlider label="Selected blocks" percentage={bulkRatio} locked={locked} onChange={setBulkRatio} /></div>
      <button className={mergeButtonClass} disabled={locked || !selected.some(i => i < count)} onClick={() => change(selected, bulkRatio)}>Apply to selected</button>
      <button className={mergeButtonClass} title="Return selected blocks to the global mix" disabled={locked || !selected.some(i => i < count)} onClick={() => change(selected)}><RotateCcw size={15} />Selected</button>
      <button className={`${mergeButtonClass} ml-auto`} disabled={locked || !Object.keys(values).length} onClick={() => onChange({})}><RotateCcw size={15} />All blocks</button>
    </div>
    <div className="flex flex-wrap items-center gap-3 border-y border-[var(--umbra-border)] py-3" aria-label="Block randomizer" role="group">
      <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Random mix strength">
        {BLOCK_MIX_RANDOM_MODES.map(mode => <button key={mode.id} className={`${mergeButtonClass} ${randomMode === mode.id ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent)]/10 text-[var(--umbra-accent)]' : ''}`} aria-pressed={randomMode === mode.id} disabled={locked} title={`Up to ${mode.spread} percentage points either side of the global blend. Strength is variation, not a quality rating.`} onClick={() => setRandomMode(mode.id)}>{mode.label}</button>)}
      </div>
      <span className="text-xs tabular-nums text-[var(--umbra-text-muted)]">B {range.min}-{range.max}% | {randomTargets.length || count} {randomTargets.length ? 'selected blocks' : 'blocks'}</span>
      <button className={`${mergeButtonClass} text-[var(--umbra-accent)]`} disabled={locked} onClick={randomize}><Shuffle size={16} />{randomTargets.length ? 'Randomize selected' : 'Randomize all'}</button>
      <button className={mergeButtonClass} title="Undo last block randomization" aria-label="Undo block randomization" disabled={locked || !canUndo} onClick={() => { if (!locked && canUndo && randomUndo) { onChange(randomUndo.before); setRandomUndo(null); } }}><Undo2 size={16} /></button>
    </div>
    <div className="grid gap-x-5 gap-y-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
      {Array.from({ length: count }, (_, index) => {
        const value = values[index];
        return <div className="min-w-0 space-y-1 border-b border-[var(--umbra-border)] py-2" key={index}>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex min-h-11 items-center gap-2 text-sm font-semibold"><input className="h-5 w-5 accent-[var(--umbra-accent)]" type="checkbox" aria-label={`Select block ${index}`} checked={selected.includes(index)} disabled={locked} onChange={event => setSelected(current => event.target.checked ? [...current, index] : current.filter(i => i !== index))} />Block {index}</label>
            <span className="text-xs text-[var(--umbra-text-muted)]">{value === undefined ? 'Global' : 'Override'}</span>
            <div className="ml-auto flex gap-1">
              <button className={mergeButtonClass} title={`About block ${index}`} aria-label={`About block ${index}`} aria-expanded={helpBlock === index} onClick={() => setHelpBlock(helpBlock === index ? null : index)}><CircleHelp size={16} /></button>
              <button className={mergeButtonClass} title="Return to global mix" aria-label={`Reset block ${index} to global`} disabled={locked || value === undefined} onClick={() => change([index])}><RotateCcw size={16} /></button>
            </div>
          </div>
          {helpBlock === index && <p className="pb-2 text-xs leading-relaxed text-[var(--umbra-text-muted)]">Stage {index + 1} of {count}, {index < count / 3 ? 'in the earlier part' : index < 2 * count / 3 ? 'in the middle' : 'in the later part'} of the network. It refines the features passed from {index === 0 ? 'the image input projection' : `block ${index - 1}`} through image attention, prompt attention, and feature transformations. Its visual effect is not isolated to one subject or image region.</p>}
          <BlockMixSlider label={`Block ${index}`} percentage={value === undefined ? ratio : value * 100} locked={locked} onChange={percentage => change([index], percentage)} />
        </div>;
      })}
    </div>
  </section>;
}
