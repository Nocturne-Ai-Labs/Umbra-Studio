import React from 'react';
import { Save, Trash2 } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { cn } from '@/lib/utils';

export type UmbraImageExportFormat = 'png' | 'jpeg' | 'webp';

export interface UmbraImageExportSettings {
  resizeEnabled: boolean;
  longEdge: number;
  format: UmbraImageExportFormat;
  quality: number;
}

interface UmbraImageExportPreset extends UmbraImageExportSettings {
  id: string;
  name: string;
  builtIn?: boolean;
  extra?: Record<string, unknown>;
}

const PRESET_STORAGE_KEY = 'umbra-ui:extras-image-export-presets';
const BUILT_IN_PRESETS: UmbraImageExportPreset[] = [
  { id: 'original-png', name: 'Original Size PNG', resizeEnabled: false, longEdge: 3840, format: 'png', quality: 100, builtIn: true },
  { id: '4k-jpeg', name: '4K JPEG', resizeEnabled: true, longEdge: 3840, format: 'jpeg', quality: 94, builtIn: true },
  { id: '1024-jpeg', name: '1024 Release JPEG', resizeEnabled: true, longEdge: 1024, format: 'jpeg', quality: 90, builtIn: true },
];

const controlClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500';

function normalizeSettings(value: Partial<UmbraImageExportSettings>): UmbraImageExportSettings {
  const format = value.format === 'jpeg' || value.format === 'webp' ? value.format : 'png';
  return {
    resizeEnabled: value.resizeEnabled === true,
    longEdge: Math.max(64, Math.min(16384, Math.round(Number(value.longEdge) || 1024))),
    format,
    quality: Math.max(1, Math.min(100, Math.round(Number(value.quality) || 90))),
  };
}

function readCustomPresets(storageKey: string): UmbraImageExportPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return [];
      const name = String(entry.name || '').trim().slice(0, 48);
      const id = String(entry.id || '').trim();
      if (!name || !id) return [];
      const extra = entry.extra && typeof entry.extra === 'object' && !Array.isArray(entry.extra)
        ? entry.extra as Record<string, unknown>
        : undefined;
      return [{ id, name, ...normalizeSettings(entry), extra }];
    }).slice(0, 20);
  } catch {
    return [];
  }
}

export function UmbraImageExportControls({
  value,
  onChange,
  resizeLocked = false,
  presetScope = 'image-export',
  presetLabel = 'Export Preset',
  presetExtra,
  onPresetExtraChange,
  presetSaveDisabled = false,
}: {
  value: UmbraImageExportSettings;
  onChange: (value: UmbraImageExportSettings) => void;
  resizeLocked?: boolean;
  presetScope?: string;
  presetLabel?: string;
  presetExtra?: Record<string, unknown>;
  onPresetExtraChange?: (value: Record<string, unknown>) => void;
  presetSaveDisabled?: boolean;
}) {
  const storageKey = presetScope === 'image-export' ? PRESET_STORAGE_KEY : `${PRESET_STORAGE_KEY}:${presetScope}`;
  const [customPresets, setCustomPresets] = React.useState<UmbraImageExportPreset[]>(() => readCustomPresets(storageKey));
  const [selectedPresetId, setSelectedPresetId] = React.useState('custom');
  const [presetName, setPresetName] = React.useState('');
  const presets = React.useMemo(
    () => [
      ...BUILT_IN_PRESETS.filter((preset) => !resizeLocked || preset.resizeEnabled),
      ...customPresets,
    ],
    [customPresets, resizeLocked],
  );

  const persistCustomPresets = React.useCallback((next: UmbraImageExportPreset[]) => {
    setCustomPresets(next);
    try { window.localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* best effort */ }
  }, [storageKey]);

  React.useEffect(() => {
    setCustomPresets(readCustomPresets(storageKey));
    setSelectedPresetId('custom');
  }, [storageKey]);

  const update = React.useCallback((patch: Partial<UmbraImageExportSettings>) => {
    setSelectedPresetId('custom');
    onChange(normalizeSettings({ ...value, ...patch }));
  }, [onChange, value]);

  const choosePreset = React.useCallback((id: string) => {
    setSelectedPresetId(id);
    const preset = presets.find((candidate) => candidate.id === id);
    if (!preset) return;
    onChange(normalizeSettings({ ...preset, resizeEnabled: resizeLocked ? true : preset.resizeEnabled }));
    if (preset.extra && onPresetExtraChange) onPresetExtraChange(preset.extra);
  }, [onChange, onPresetExtraChange, presets, resizeLocked]);

  const savePreset = React.useCallback(() => {
    const name = presetName.trim().slice(0, 48);
    if (!name) return;
    const existing = customPresets.find((preset) => preset.name.toLowerCase() === name.toLowerCase());
    const id = existing?.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const nextPreset: UmbraImageExportPreset = {
      id,
      name,
      ...normalizeSettings(value),
      ...(presetExtra ? { extra: presetExtra } : {}),
    };
    const next = [...customPresets.filter((preset) => preset.id !== id), nextPreset].slice(-20);
    persistCustomPresets(next);
    setSelectedPresetId(id);
    setPresetName('');
  }, [customPresets, persistCustomPresets, presetExtra, presetName, value]);

  const deleteSelectedPreset = React.useCallback(() => {
    if (!selectedPresetId.startsWith('custom-')) return;
    persistCustomPresets(customPresets.filter((preset) => preset.id !== selectedPresetId));
    setSelectedPresetId('custom');
  }, [customPresets, persistCustomPresets, selectedPresetId]);

  return (
    <div data-umbra-image-export-controls="" className="space-y-3 border-t border-white/10 pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
        <label className="block min-w-0 space-y-1.5">
          <span className={labelClass}>{presetLabel}</span>
          <UmbraSelectControl value={selectedPresetId} onChange={(event) => choosePreset(event.target.value)} className={controlClass}>
            <option value="custom">Custom Settings</option>
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </UmbraSelectControl>
        </label>
        <button type="button" onClick={deleteSelectedPreset} disabled={!selectedPresetId.startsWith('custom-')} title="Delete selected preset" className="mt-[19px] inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-500 hover:border-red-300/25 hover:text-red-200 disabled:opacity-25"><Trash2 size={12} /></button>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
        <input value={presetName} maxLength={48} onChange={(event) => setPresetName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); savePreset(); } }} placeholder="Preset name" className={cn(controlClass, 'h-9')} />
        <button type="button" onClick={savePreset} disabled={!presetName.trim() || presetSaveDisabled} title={presetSaveDisabled ? 'Choose a watermark before saving this preset' : 'Save current preset'} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-cyan-300/20 bg-cyan-500/[0.07] text-cyan-200 hover:bg-cyan-500/[0.13] disabled:opacity-25"><Save size={12} /></button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!resizeLocked ? (
          <label className="col-span-2 flex min-h-9 items-center justify-between rounded-md border border-white/10 bg-black/25 px-2.5">
            <span className={labelClass}>Resize Long Edge</span>
            <input type="checkbox" checked={value.resizeEnabled} onChange={(event) => update({ resizeEnabled: event.target.checked })} className="h-4 w-4 accent-cyan-300" />
          </label>
        ) : null}
        <label className={cn('block space-y-1.5', !resizeLocked && !value.resizeEnabled && 'opacity-40')}>
          <span className={labelClass}>Long Edge</span>
          <input type="number" min={64} max={16384} step={8} value={value.longEdge} disabled={!resizeLocked && !value.resizeEnabled} onChange={(event) => update({ longEdge: Number(event.target.value) })} className={controlClass} />
        </label>
        <label className="block space-y-1.5">
          <span className={labelClass}>Format</span>
          <UmbraSelectControl value={value.format} onChange={(event) => update({ format: event.target.value as UmbraImageExportFormat })} className={controlClass}>
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </UmbraSelectControl>
        </label>
      </div>
      <label className={cn('block space-y-1.5', value.format === 'png' && 'opacity-40')}>
        <span className="flex justify-between"><span className={labelClass}>Quality</span><span className="font-mono text-[9px] text-cyan-200">{value.format === 'png' ? 'Lossless' : `${value.quality}%`}</span></span>
        <input type="range" min={40} max={100} step={1} value={value.quality} disabled={value.format === 'png'} onChange={(event) => update({ quality: Number(event.target.value) })} className="w-full accent-cyan-300" />
      </label>
    </div>
  );
}
