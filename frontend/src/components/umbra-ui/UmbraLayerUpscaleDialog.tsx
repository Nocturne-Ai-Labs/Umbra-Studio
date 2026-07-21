'use client';

import React from 'react';
import { ImageUp, Loader2, X } from 'lucide-react';
import type { UmbraCanvasRasterLayer } from '@/lib/umbraUiCanvasDocument';
import { upscaleUmbraUiCanvasLayer } from '@/lib/umbraUiInpaint';

interface UmbraLayerUpscaleDialogProps {
  layer: UmbraCanvasRasterLayer;
  models: string[];
  comfyConnected: boolean;
  onClose: () => void;
  onApply: (result: { blob: Blob; filename: string; useUpscaledBounds: boolean }) => Promise<void> | void;
}

const inputClass = 'h-9 w-full border border-white/10 bg-black/35 px-2 font-mono text-[9px] text-zinc-200 outline-none focus:border-cyan-300/35';

export function UmbraLayerUpscaleDialog({
  layer,
  models,
  comfyConnected,
  onApply,
  onClose,
}: UmbraLayerUpscaleDialogProps) {
  const [modelName, setModelName] = React.useState(models[0] || '');
  const [maxDimension, setMaxDimension] = React.useState(() => Math.max(512, Math.min(16384, Math.max(layer.asset.width, layer.asset.height) * 4)));
  const [useUpscaledBounds, setUseUpscaledBounds] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    if (modelName && models.includes(modelName)) return;
    setModelName(models[0] || '');
  }, [modelName, models]);

  const apply = React.useCallback(async () => {
    if (busy || !comfyConnected || !modelName) return;
    setBusy(true);
    setError('');
    try {
      const sourceResponse = await fetch(layer.asset.imageUrl, { cache: 'no-store' });
      if (!sourceResponse.ok) throw new Error(`Unable to load the canvas layer (${sourceResponse.status}).`);
      const result = await upscaleUmbraUiCanvasLayer({
        image: await sourceResponse.blob(),
        imageName: layer.asset.name || 'canvas-layer.png',
        modelName,
        maxDimension,
      });
      await onApply({ ...result, useUpscaledBounds });
      onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The canvas layer could not be upscaled.');
      setBusy(false);
    }
  }, [busy, comfyConnected, layer.asset.imageUrl, layer.asset.name, maxDimension, modelName, onApply, onClose, useUpscaledBounds]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div className="flex w-full max-w-xl flex-col overflow-hidden border border-cyan-300/25 bg-[#090a0c] shadow-2xl shadow-black/80">
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-3">
          <ImageUp size={13} className="text-cyan-200" />
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-200">Upscale Canvas Layer</span>
          <span className="min-w-0 truncate font-mono text-[8px] text-zinc-600">{layer.name}</span>
          <button type="button" onClick={onClose} disabled={busy} title="Close layer upscale" className="ml-auto inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><X size={11} /></button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
          <div className="flex min-h-40 items-center justify-center overflow-hidden border border-white/10 bg-black/35 p-2">
            <img src={layer.asset.imageUrl} alt="" className="max-h-52 max-w-full object-contain" />
          </div>
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="block text-[7px] font-black uppercase text-zinc-600">Upscale Model</span>
              <select value={modelName} onChange={(event) => setModelName(event.target.value)} disabled={busy} className={inputClass}>
                {models.length <= 0 ? <option value="">No upscale models installed</option> : null}
                {models.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="flex text-[7px] font-black uppercase text-zinc-600"><span>Maximum Dimension</span><span className="ml-auto font-mono text-zinc-500">{maxDimension}px</span></span>
              <input type="range" min={512} max={16384} step={64} value={maxDimension} onChange={(event) => setMaxDimension(Number(event.target.value))} disabled={busy} className="w-full accent-cyan-300" />
              <input type="number" min={512} max={16384} step={64} value={maxDimension} onChange={(event) => setMaxDimension(Math.max(512, Math.min(16384, Number(event.target.value) || 512)))} disabled={busy} className={inputClass} />
            </label>
            <label className="flex min-h-9 items-center gap-2 border border-white/10 px-2 font-mono text-[8px] text-zinc-400">
              <input type="checkbox" checked={useUpscaledBounds} onChange={(event) => setUseUpscaledBounds(event.target.checked)} disabled={busy} className="accent-cyan-300" />
              Resize the layer bounds to the new pixel dimensions
            </label>
            <p className="font-mono text-[7px] leading-relaxed text-zinc-600">The result replaces this layer as one undoable edit. The immutable source is preserved as a hidden original.</p>
            {!comfyConnected ? <p className="font-mono text-[8px] text-amber-200">ComfyUI must be connected to upscale a layer.</p> : null}
            {error ? <p className="font-mono text-[8px] text-red-300">{error}</p> : null}
          </div>
        </div>
        <div className="flex h-12 items-center justify-end gap-2 border-t border-white/10 px-3">
          <button type="button" onClick={onClose} disabled={busy} className="h-8 border border-white/10 px-4 text-[8px] font-black uppercase text-zinc-500 disabled:text-zinc-800">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={busy || !comfyConnected || !modelName} className="inline-flex h-8 items-center gap-1.5 border border-cyan-300/30 bg-cyan-500/[0.08] px-4 text-[8px] font-black uppercase text-cyan-200 disabled:text-zinc-700">
            {busy ? <Loader2 size={10} className="animate-spin" /> : <ImageUp size={10} />} {busy ? 'Upscaling' : 'Upscale Layer'}
          </button>
        </div>
      </div>
    </div>
  );
}
