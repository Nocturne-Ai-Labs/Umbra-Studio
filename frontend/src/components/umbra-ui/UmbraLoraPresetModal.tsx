'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { Download, ImagePlus, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { buildUmbraUiLoraSyntax, type UmbraUiLoraEntry } from '@/lib/umbraUiModels';
import { createLoraPresetId, createLoraPresetThumbnail, instantiateLoraPreset, loadLoraPresets, saveLoraPreset, type UmbraLoraPreset } from '@/lib/umbraLoraPresets';

const buttonClass = 'inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center gap-2 rounded border border-white/15 px-2 text-xs hover:bg-white/10 disabled:opacity-40';

export function UmbraLoraPresetModal({ loras, onLoad, onClose }: {
  loras: UmbraUiLoraEntry[];
  onLoad: (loras: UmbraUiLoraEntry[]) => void;
  onClose: () => void;
}) {
  const [presets, setPresets] = React.useState<UmbraLoraPreset[]>([]);
  const [ready, setReady] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [search, setSearch] = React.useState('');
  const [selected, setSelected] = React.useState<UmbraLoraPreset | null>(null);
  const [name, setName] = React.useState('');
  const [thumbnail, setThumbnail] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const busyRef = React.useRef(false);
  const displayedLoras = selected?.loras ?? loras;

  React.useEffect(() => {
    let disposed = false;
    void loadLoraPresets().then((items) => { if (!disposed) { setPresets(items); setReady(true); } })
      .catch((e: Error) => { if (!disposed) setError(e.message); });
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => { disposed = true; previousFocus?.focus(); };
  }, []);

  const select = (preset: UmbraLoraPreset | null) => {
    setSelected(preset); setName(preset?.name ?? ''); setThumbnail(preset?.thumbnail ?? ''); setConfirmDelete(false); setError('');
  };
  const persist = async (replaceStack: boolean, remove = false) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    try {
      const preset: UmbraLoraPreset = {
        id: selected?.id ?? createLoraPresetId(), name: name.trim(), thumbnail,
        loras: instantiateLoraPreset(replaceStack ? loras : displayedLoras), updatedAt: Date.now(),
      };
      const items = await saveLoraPreset(preset, remove);
      setPresets(items); select(remove ? null : preset);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save preset.'); }
    finally { busyRef.current = false; setBusy(false); }
  };
  const close = () => { if (!busyRef.current) onClose(); };

  return createPortal(
    <div data-umbra-modal-root="" className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="LoRA stack presets" tabIndex={-1}
        className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-[var(--umbra-accent)] bg-[var(--umbra-bg,#101114)] text-zinc-200 shadow-2xl outline-none"
        onKeyDown={(event) => {
          if (event.key === 'Escape') { event.stopPropagation(); close(); }
          if (event.key !== 'Tab') return;
          const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"])') ?? []);
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex items-center gap-2 border-b border-white/10 p-3">
          <h2 className="min-w-0 flex-1 text-sm font-bold">LoRA Stack Presets</h2>
          <button type="button" className={buttonClass} onClick={close} disabled={busy} title="Close presets" aria-label="Close presets"><X size={16} /></button>
        </header>
        {error && <div role="alert" className="px-3 py-2 text-sm text-red-300">{error}</div>}
        <div className="grid min-h-0 grid-cols-1 overflow-y-auto sm:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 border-b border-white/10 p-3 sm:border-b-0 sm:border-r">
            <div className="mb-3 flex items-center gap-2">
              <Search size={14} className="shrink-0" />
              <input aria-label="Search LoRA presets" placeholder="Search presets" value={search} onChange={(e) => setSearch(e.target.value)} className="min-h-9 min-w-0 flex-1 rounded border border-white/15 bg-black/30 px-2 text-sm" />
              <button type="button" disabled={busy} onClick={() => select(null)} className={buttonClass} title="New preset from current stack" aria-label="New preset from current stack"><Plus size={15} /></button>
            </div>
            <div className="max-h-48 space-y-1 overflow-y-auto sm:max-h-[55dvh]">
              {!ready && !error && <Loader2 className="animate-spin" size={18} />}
              {ready && presets.length === 0 && <p className="py-3 text-sm text-zinc-500">No saved presets</p>}
              {presets.filter((p) => p.name.toLowerCase().includes(search.toLowerCase())).map((preset) => (
                <button type="button" key={preset.id} disabled={busy} onClick={() => select(preset)} aria-pressed={selected?.id === preset.id}
                  className="flex min-h-16 w-full min-w-0 items-center gap-2 rounded border border-transparent p-2 text-left hover:bg-white/5 aria-pressed:border-[var(--umbra-accent)] aria-pressed:bg-white/5">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded bg-black/30">
                    {preset.thumbnail ? <img src={preset.thumbnail} alt="" className="h-full w-full object-contain" loading="lazy" /> : <ImagePlus size={18} />}
                  </span>
                  <span className="min-w-0 flex-1"><span className="block break-words text-sm">{preset.name}</span><span className="text-xs text-zinc-500">{preset.loras.length} LoRAs</span></span>
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0 space-y-3 p-3">
            <label className="block space-y-1 text-xs">Preset name
              <input aria-label="Preset name" disabled={busy} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} className="mt-1 min-h-10 w-full rounded border border-white/15 bg-black/30 px-2 text-sm" />
            </label>
            <div className="flex items-center gap-2">
              <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} title="Upload preset thumbnail" aria-label="Upload preset thumbnail" className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-white/15 bg-black/30 hover:border-[var(--umbra-accent)]">
                {thumbnail ? <img src={thumbnail} alt="Preset thumbnail" className="h-full w-full object-contain" /> : <ImagePlus size={24} />}
              </button>
              {thumbnail && <button type="button" disabled={busy} onClick={() => setThumbnail('')} title="Remove thumbnail" aria-label="Remove thumbnail" className={buttonClass}><X size={14} /></button>}
              <input ref={fileRef} type="file" className="hidden" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                const file = e.target.files?.[0]; e.target.value = ''; if (!file) return;
                busyRef.current = true; setBusy(true); setError('');
                try { setThumbnail(await createLoraPresetThumbnail(file)); }
                catch (err) { setError(err instanceof Error ? err.message : 'Unable to read image.'); }
                finally { busyRef.current = false; setBusy(false); }
              }} />
              <span className="text-xs text-zinc-500">{displayedLoras.length} LoRAs</span>
            </div>
            <div className="max-h-56 space-y-2 overflow-y-auto rounded border border-white/10 bg-black/20 p-2">
              {displayedLoras.length === 0 && <p className="text-xs text-zinc-500">Empty stack</p>}
              {displayedLoras.map((lora, index) => <div key={index} className="break-all font-mono text-xs text-zinc-300"><span className={lora.enabled ? '' : 'opacity-40'}>{buildUmbraUiLoraSyntax(lora)}</span>{!lora.enabled && <span className="ml-2 text-zinc-500">Disabled</span>}</div>)}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass} disabled={!ready || busy || !name.trim() || displayedLoras.length === 0} onClick={() => void persist(!selected)}><Save size={14} />{selected ? 'Save changes' : 'Save current stack'}</button>
              {selected && <button type="button" className={buttonClass} disabled={busy || loras.length === 0 || !name.trim()} onClick={() => void persist(true)} title="Replace this preset's LoRAs with the current stack"><Save size={14} />Update from stack</button>}
              {selected && <button type="button" className={buttonClass} disabled={busy} onClick={() => { onLoad(instantiateLoraPreset(selected.loras)); onClose(); }} title="Replace active LoRA stack with this preset"><Download size={14} />Load stack</button>}
              {selected && <button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirmDelete((v) => !v)} title="Delete preset" aria-label="Delete preset"><Trash2 size={14} /></button>}
            </div>
            {confirmDelete && <div className="flex flex-wrap items-center gap-2 text-sm"><span>Delete this preset?</span><button type="button" className={buttonClass} disabled={busy} onClick={() => void persist(false, true)}>Delete</button><button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirmDelete(false)}>Cancel</button></div>}
          </div>
        </div>
      </div>
    </div>, document.body,
  );
}
