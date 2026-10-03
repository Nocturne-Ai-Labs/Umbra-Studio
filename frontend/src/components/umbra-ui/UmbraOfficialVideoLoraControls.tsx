'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { readOfficialVideoLoraChoices, type OfficialVideoLoraRow } from '../../../../shared/umbra-ui/officialVideoLora';
import type { OfficialVideoWorkflowId } from '../../../../shared/umbra-ui/officialVideoWorkflow';

interface Props {
  rows: OfficialVideoLoraRow[];
  onChange: (rows: OfficialVideoLoraRow[]) => void;
  workflowId: OfficialVideoWorkflowId;
  catalog: unknown;
  disabled?: boolean;
}

const inputClass = 'min-h-9 w-full min-w-0 rounded border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-[var(--umbra-text)] outline-none focus:border-[var(--umbra-accent)] disabled:opacity-40';
const iconClass = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 text-zinc-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)] disabled:opacity-30';
const labelClass = 'flex min-w-0 flex-col gap-1 text-[11px] text-zinc-400';

function StrengthInput({ label, value, min, max, title, ariaLabel, disabled, onCommit }: {
  label: string; value: number; min: number; max: number; title: string; ariaLabel: string;
  disabled: boolean; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const parsed = Number(draft);
    if (draft.trim() && Number.isFinite(parsed)) onCommit(Math.min(max, Math.max(min, parsed)));
    else setDraft(String(value));
  };
  return <label className={labelClass}>{label}
    <input type="number" min={min} max={max} step={0.01} value={draft} disabled={disabled}
      onChange={event => setDraft(event.target.value)} onBlur={commit}
      onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}
      className={inputClass} aria-label={ariaLabel} title={title} />
  </label>;
}

export function UmbraOfficialVideoLoraControls({ rows, onChange, workflowId, catalog, disabled = false }: Props) {
  const installed = readOfficialVideoLoraChoices(catalog);
  const choices = installed || [];
  const ltx = workflowId === 'ltx23-50';
  const update = (index: number, patch: Partial<OfficialVideoLoraRow>) => onChange(rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const move = (index: number, direction: number) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return <section className="min-w-0" aria-label="LoRA stack">
    <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-2">
      <div className="min-w-0">
        <h3 className="text-xs font-bold text-[var(--umbra-text)]">LoRA stack</h3>
      </div>
      <button type="button" className={iconClass} aria-label="Add LoRA slot" title="Add LoRA slot" disabled={disabled} onClick={() => onChange([...rows, { on: true, lora: 'None', str: 1, vs: 1, as: 1 }])}><Plus size={15} /></button>
    </div>
    <div className="divide-y divide-white/10">
      {rows.map((row, index) => {
        const missing = row.lora !== 'None' && !choices.includes(row.lora);
        return <div key={index} className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <label className="flex min-h-9 items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={row.on} disabled={disabled} onChange={event => update(index, { on: event.target.checked })} className="accent-[var(--umbra-accent)]" aria-label={`Enable LoRA slot ${index + 1}`} />
            <span className="tabular-nums">{index + 1}</span>
          </label>
          <div className="min-w-0">
            <UmbraSelectControl aria-label={`LoRA file for slot ${index + 1}`} value={row.lora} disabled={disabled || installed === null} onChange={event => update(index, { lora: event.target.value })} className={inputClass} menuTitle="Installed LoRAs">
              <option value="None">None</option>
              {missing && <option value={row.lora}>{row.lora} ({installed ? 'missing' : 'unverified'})</option>}
              {choices.map(name => <option key={name} value={name}>{name}</option>)}
            </UmbraSelectControl>
            {missing && installed && <p className="mt-1 text-[11px] text-amber-400" role="status">{row.on ? 'File not installed; choose another, install it, or disable this slot before capture.' : 'File not installed; this slot is disabled.'}</p>}
            {!installed && <p className="mt-1 text-[11px] text-amber-400" role="status">Installed LoRA list unavailable; file selection cannot be verified.</p>}
          </div>
          <div className="col-span-2 flex items-start justify-end gap-1 sm:col-span-1">
            <button type="button" className={iconClass} aria-label={`Move LoRA slot ${index + 1} up`} title="Move up" disabled={disabled || index === 0} onClick={() => move(index, -1)}><ArrowUp size={14} /></button>
            <button type="button" className={iconClass} aria-label={`Move LoRA slot ${index + 1} down`} title="Move down" disabled={disabled || index === rows.length - 1} onClick={() => move(index, 1)}><ArrowDown size={14} /></button>
            <button type="button" className={iconClass} aria-label={`Remove LoRA slot ${index + 1}`} title="Remove slot" disabled={disabled} onClick={() => onChange(rows.filter((_, i) => i !== index))}><Trash2 size={14} /></button>
          </div>
          <div className="col-span-2 grid min-w-0 grid-cols-2 gap-2 sm:col-start-2 sm:grid-cols-3">
            <StrengthInput label="Strength" value={row.str} min={-5} max={5} disabled={disabled} onCommit={value => update(index, { str: value })} ariaLabel={`Master strength for LoRA slot ${index + 1}`} title="Master strength, -5 to 5" />
            <StrengthInput label={ltx ? 'Video' : 'Visual'} value={row.vs} min={0} max={2} disabled={disabled} onCommit={value => update(index, { vs: value })} ariaLabel={`Visual multiplier for LoRA slot ${index + 1}`} title={ltx ? 'Video branch multiplier, 0 to 2' : 'Full LoRA map multiplier, 0 to 2'} />
            {ltx && <StrengthInput label="Audio" value={row.as} min={0} max={2} disabled={disabled} onCommit={value => update(index, { as: value })} ariaLabel={`Audio multiplier for LoRA slot ${index + 1}`} title="Audio branch multiplier, 0 to 2" />}
          </div>
        </div>;
      })}
    </div>
  </section>;
}
