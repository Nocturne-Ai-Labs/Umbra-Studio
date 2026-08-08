'use client';

import React from 'react';
import { Save, Trash2 } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { cn } from '@/lib/utils';

interface UmbraExtrasPreset {
  id: string;
  name: string;
  value: Record<string, unknown>;
}
const controlClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500';

function readPresets(storageKey: string): UmbraExtrasPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const source = entry as Record<string, unknown>;
      const id = String(source.id || '').trim();
      const name = String(source.name || '').trim().slice(0, 48);
      const value = source.value && typeof source.value === 'object' && !Array.isArray(source.value)
        ? source.value as Record<string, unknown>
        : null;
      return id && name && value ? [{ id, name, value }] : [];
    }).slice(-20);
  } catch {
    return [];
  }
}

export function UmbraExtrasPresetControl({
  scope,
  label,
  value,
  onApply,
  saveDisabled = false,
  saveDisabledTitle = 'Complete the required settings before saving this preset',
}: {
  scope: string;
  label: string;
  value: Record<string, unknown>;
  onApply: (value: Record<string, unknown>) => void;
  saveDisabled?: boolean;
  saveDisabledTitle?: string;
}) {
  const storageKey = `umbra-ui:extras-operation-presets:${scope}`;
  const [presets, setPresets] = React.useState<UmbraExtrasPreset[]>(() => readPresets(storageKey));
  const [selectedId, setSelectedId] = React.useState('custom');
  const [name, setName] = React.useState('');

  React.useEffect(() => {
    setPresets(readPresets(storageKey));
    setSelectedId('custom');
  }, [storageKey]);

  const persist = React.useCallback((next: UmbraExtrasPreset[]) => {
    setPresets(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* best effort */ }
  }, [storageKey]);

  const choose = React.useCallback((id: string) => {
    setSelectedId(id);
    const preset = presets.find((candidate) => candidate.id === id);
    if (preset) onApply(preset.value);
  }, [onApply, presets]);

  const save = React.useCallback(() => {
    const presetName = name.trim().slice(0, 48);
    if (!presetName || saveDisabled) return;
    const existing = presets.find((preset) => preset.name.toLowerCase() === presetName.toLowerCase());
    const id = existing?.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextPreset: UmbraExtrasPreset = { id, name: presetName, value };
    const next = [...presets.filter((preset) => preset.id !== id), nextPreset].slice(-20);
    persist(next);
    setSelectedId(id);
    setName('');
  }, [name, persist, presets, saveDisabled, value]);

  const remove = React.useCallback(() => {
    if (!selectedId.startsWith('custom-')) return;
    persist(presets.filter((preset) => preset.id !== selectedId));
    setSelectedId('custom');
  }, [persist, presets, selectedId]);

  return (
    <div data-umbra-extras-operation-presets={scope} className="space-y-2 border-t border-white/10 pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
        <label className="block min-w-0 space-y-1.5">
          <span className={labelClass}>{label}</span>
          <UmbraSelectControl value={selectedId} onChange={(event) => choose(event.target.value)} className={controlClass}>
            <option value="custom">Custom Settings</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </UmbraSelectControl>
        </label>
        <button type="button" onClick={remove} disabled={!selectedId.startsWith('custom-')} title="Delete selected preset" className="mt-[19px] inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-500 hover:border-red-300/25 hover:text-red-200 disabled:opacity-25"><Trash2 size={12} /></button>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
        <input value={name} maxLength={48} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); save(); } }} placeholder="Preset name" className={cn(controlClass, 'h-9')} />
        <button type="button" onClick={save} disabled={!name.trim() || saveDisabled} title={saveDisabled ? saveDisabledTitle : 'Save current preset'} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-500/[0.07] text-cyan-200 hover:bg-cyan-500/[0.13] disabled:opacity-25"><Save size={12} /></button>
      </div>
    </div>
  );
}
