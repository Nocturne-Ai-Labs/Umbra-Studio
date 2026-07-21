'use client';

import React from 'react';
import { Check, Loader2, WandSparkles, X } from 'lucide-react';
import type { UmbraCanvasControlLayer, UmbraCanvasRasterLayer } from '@/lib/umbraUiCanvasDocument';
import {
  DEFAULT_UMBRA_RASTER_FILTER_CONFIG,
  renderUmbraRasterFilter,
  type UmbraRasterFilterConfig,
  type UmbraRasterFilterType,
} from '@/lib/umbraUiRasterFilters';
import {
  canUseUmbraRasterFilterWorker,
  renderUmbraRasterFilterInWorker,
} from '@/lib/umbraUiRasterFilterWorker';
import {
  preprocessUmbraUiControlImage,
  type UmbraUiControlPreprocessOptions,
} from '@/lib/umbraUiInpaint';

type UmbraRasterPreprocessorType = Exclude<UmbraUiControlPreprocessOptions['controlType'], 'raw'>;

export interface UmbraRasterPreprocessorOption {
  value: UmbraRasterPreprocessorType;
  label: string;
}

interface UmbraRasterFilterDialogProps {
  layer: UmbraCanvasRasterLayer | UmbraCanvasControlLayer;
  onClose: () => void;
  onApply: (result: { blob: Blob; width: number; height: number; padding: number; type: string; elapsedMs?: number; execution?: 'worker' | 'main' | 'comfy' }) => void;
  preprocessorOptions?: UmbraRasterPreprocessorOption[];
  comfyConnected?: boolean;
}

const FILTERS: Array<{ id: UmbraRasterFilterType; label: string }> = [
  { id: 'blur', label: 'Blur' },
  { id: 'noise', label: 'Noise' },
  { id: 'pixelate', label: 'Pixelate' },
  { id: 'color_map', label: 'Color Map' },
  { id: 'grayscale', label: 'Grayscale' },
  { id: 'invert', label: 'Invert' },
  { id: 'canny', label: 'Canny Edges' },
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The raster layer image could not be loaded.'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('The filtered image could not be encoded.')), 'image/png'));
}

interface PreprocessorConfig {
  type: UmbraRasterPreprocessorType;
  processorResolution: number;
  lowThreshold: number;
  highThreshold: number;
  detectBody: boolean;
  detectFace: boolean;
  detectHands: boolean;
  maxFaces: number;
  minimumConfidence: number;
  scoreThreshold: number;
  distanceThreshold: number;
  normalStrength: number;
  backgroundThreshold: number;
  safeMode: boolean;
  processorSeed: number;
}

const DEFAULT_PREPROCESSOR_CONFIG: PreprocessorConfig = {
  type: 'canny',
  processorResolution: 1024,
  lowThreshold: 100,
  highThreshold: 200,
  detectBody: true,
  detectFace: true,
  detectHands: true,
  maxFaces: 10,
  minimumConfidence: 0.5,
  scoreThreshold: 0.1,
  distanceThreshold: 0.1,
  normalStrength: Math.PI * 2,
  backgroundThreshold: 0.1,
  safeMode: true,
  processorSeed: 0,
};

export function UmbraRasterFilterDialog({
  layer,
  onApply,
  onClose,
  preprocessorOptions = [],
  comfyConnected = false,
}: UmbraRasterFilterDialogProps) {
  const previewRef = React.useRef<HTMLCanvasElement | null>(null);
  const sourceRef = React.useRef<HTMLImageElement | null>(null);
  const renderRevisionRef = React.useRef(0);
  const filterAbortRef = React.useRef<AbortController | null>(null);
  const [filterMode, setFilterMode] = React.useState<'local' | 'preprocessor'>('local');
  const [config, setConfig] = React.useState<UmbraRasterFilterConfig>(DEFAULT_UMBRA_RASTER_FILTER_CONFIG);
  const [preprocessor, setPreprocessor] = React.useState<PreprocessorConfig>(() => ({
    ...DEFAULT_PREPROCESSOR_CONFIG,
    type: preprocessorOptions[0]?.value || 'canny',
  }));
  const [processedPreview, setProcessedPreview] = React.useState<{
    blob: Blob;
    url: string;
    width: number;
    height: number;
    filename: string;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState('');

  const clearProcessedPreview = React.useCallback(() => {
    setProcessedPreview((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  React.useEffect(() => () => {
    if (processedPreview?.url) URL.revokeObjectURL(processedPreview.url);
  }, [processedPreview?.url]);

  React.useEffect(() => () => filterAbortRef.current?.abort(), []);

  React.useEffect(() => {
    if (preprocessorOptions.some((option) => option.value === preprocessor.type)) return;
    const nextType = preprocessorOptions[0]?.value;
    if (nextType) setPreprocessor((current) => ({ ...current, type: nextType }));
  }, [preprocessor.type, preprocessorOptions]);

  React.useEffect(() => {
    let disposed = false;
    setLoading(true);
    void loadImage(layer.asset.imageUrl).then((image) => {
      if (disposed) return;
      sourceRef.current = image;
      setLoading(false);
    }).catch((reason) => {
      if (disposed) return;
      setError(reason instanceof Error ? reason.message : 'The raster layer could not be loaded.');
      setLoading(false);
    });
    return () => { disposed = true; };
  }, [layer.asset.imageUrl]);

  React.useEffect(() => {
    const source = sourceRef.current;
    const preview = previewRef.current;
    if (filterMode !== 'local' || !source || !preview) return;
    const revision = ++renderRevisionRef.current;
    const scale = Math.min(1, 640 / Math.max(source.naturalWidth, source.naturalHeight));
    const sample = document.createElement('canvas');
    sample.width = Math.max(1, Math.round(source.naturalWidth * scale));
    sample.height = Math.max(1, Math.round(source.naturalHeight * scale));
    sample.getContext('2d')?.drawImage(source, 0, 0, sample.width, sample.height);
    window.requestAnimationFrame(() => {
      if (revision !== renderRevisionRef.current) return;
      const previewConfig = {
        ...config,
        blurRadius: config.blurRadius * scale,
        pixelSize: Math.max(1, config.pixelSize * scale),
      };
      const result = renderUmbraRasterFilter(sample, sample.width, sample.height, previewConfig);
      preview.width = result.canvas.width;
      preview.height = result.canvas.height;
      preview.getContext('2d')?.drawImage(result.canvas, 0, 0);
    });
  }, [config, filterMode, loading]);

  const update = React.useCallback(<K extends keyof UmbraRasterFilterConfig>(key: K, value: UmbraRasterFilterConfig[K]) => {
    setError('');
    setConfig((current) => ({ ...current, [key]: value }));
  }, []);

  const updatePreprocessor = React.useCallback(<K extends keyof PreprocessorConfig>(key: K, value: PreprocessorConfig[K]) => {
    setError('');
    clearProcessedPreview();
    setPreprocessor((current) => ({ ...current, [key]: value }));
  }, [clearProcessedPreview]);

  const processPreprocessor = React.useCallback(async () => {
    if (!comfyConnected) throw new Error('Launch ComfyUI through Umbra before running a model preprocessor.');
    if (!preprocessorOptions.some((option) => option.value === preprocessor.type)) {
      throw new Error('The selected preprocessor is not installed in the active portable ComfyUI.');
    }
    const response = await fetch(layer.asset.imageUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error(`The raster layer could not be read (${response.status}).`);
    const result = await preprocessUmbraUiControlImage({
      image: await response.blob(),
      imageName: layer.asset.name || 'raster-layer.png',
      controlType: preprocessor.type,
      processorResolution: preprocessor.processorResolution,
      lowThreshold: preprocessor.lowThreshold,
      highThreshold: preprocessor.highThreshold,
      detectBody: preprocessor.detectBody,
      detectFace: preprocessor.detectFace,
      detectHands: preprocessor.detectHands,
      maxFaces: preprocessor.maxFaces,
      minimumConfidence: preprocessor.minimumConfidence,
      scoreThreshold: preprocessor.scoreThreshold,
      distanceThreshold: preprocessor.distanceThreshold,
      normalStrength: preprocessor.normalStrength,
      backgroundThreshold: preprocessor.backgroundThreshold,
      safeMode: preprocessor.safeMode,
      processorSeed: preprocessor.processorSeed,
    });
    const url = URL.createObjectURL(result.blob);
    try {
      const image = await loadImage(url);
      const processed = {
        blob: result.blob,
        url,
        width: image.naturalWidth,
        height: image.naturalHeight,
        filename: result.filename,
      };
      setProcessedPreview((current) => {
        if (current?.url) URL.revokeObjectURL(current.url);
        return processed;
      });
      return processed;
    } catch (reason) {
      URL.revokeObjectURL(url);
      throw reason;
    }
  }, [comfyConnected, layer.asset.imageUrl, layer.asset.name, preprocessor, preprocessorOptions]);

  const previewPreprocessor = React.useCallback(async () => {
    if (processing || applying) return;
    setProcessing(true);
    setError('');
    try {
      await processPreprocessor();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The model preprocessor failed.');
    } finally {
      setProcessing(false);
    }
  }, [applying, processPreprocessor, processing]);

  const apply = React.useCallback(async () => {
    const source = sourceRef.current;
    if (!source || applying) return;
    setApplying(true);
    setError('');
    try {
      if (filterMode === 'preprocessor') {
        const result = processedPreview || await processPreprocessor();
        onApply({
          blob: result.blob,
          width: result.width,
          height: result.height,
          padding: 0,
          type: `${preprocessor.type}_preprocessor`,
          execution: 'comfy',
        });
        return;
      }
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (canUseUmbraRasterFilterWorker()) {
        filterAbortRef.current?.abort();
        const abortController = new AbortController();
        filterAbortRef.current = abortController;
        const response = await fetch(layer.asset.imageUrl, { cache: 'no-store', signal: abortController.signal });
        if (!response.ok) throw new Error(`The raster layer could not be read (${response.status}).`);
        const result = await renderUmbraRasterFilterInWorker({
          blob: await response.blob(),
          width: source.naturalWidth,
          height: source.naturalHeight,
          config,
          signal: abortController.signal,
        });
        if (filterAbortRef.current === abortController) filterAbortRef.current = null;
        onApply({
          blob: result.blob,
          width: result.width,
          height: result.height,
          padding: result.padding,
          type: config.type,
          elapsedMs: result.elapsedMs,
          execution: 'worker',
        });
        return;
      }
      const startedAt = performance.now();
      const result = renderUmbraRasterFilter(source, source.naturalWidth, source.naturalHeight, config);
      const blob = await canvasToBlob(result.canvas);
      onApply({
        blob,
        width: result.canvas.width,
        height: result.canvas.height,
        padding: result.padding,
        type: config.type,
        elapsedMs: performance.now() - startedAt,
        execution: 'main',
      });
    } catch (reason) {
      filterAbortRef.current?.abort();
      filterAbortRef.current = null;
      setError(reason instanceof Error ? reason.message : 'The filter could not be applied.');
      setApplying(false);
    }
  }, [applying, config, filterMode, layer.asset.imageUrl, onApply, preprocessor.type, processPreprocessor, processedPreview]);

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-5 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border border-rose-300/30 bg-[#090a0c] shadow-2xl shadow-black/80">
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-white/10 px-3">
          <WandSparkles size={13} className="text-rose-200" />
          <span className="text-[9px] font-black uppercase tracking-[0.16em] text-zinc-200">Layer Filter</span>
          <span className="min-w-0 truncate font-mono text-[8px] text-zinc-600">{layer.name}</span>
          <button type="button" onClick={onClose} title="Close filter preview" className="ml-auto inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500"><X size={11} /></button>
        </div>
        <div className="grid min-h-0 flex-1 grid-cols-[190px_minmax(0,1fr)]">
          <div className="overflow-y-auto border-r border-white/10 p-3 custom-scrollbar">
            <div className="grid grid-cols-2 gap-1 border border-white/10 p-1">
              <button type="button" onClick={() => { setFilterMode('local'); setError(''); }} className={`h-7 text-[7px] font-black uppercase ${filterMode === 'local' ? 'bg-rose-500/15 text-rose-100' : 'text-zinc-600'}`}>Local</button>
              <button type="button" onClick={() => { setFilterMode('preprocessor'); setError(''); }} disabled={preprocessorOptions.length <= 0} className={`h-7 text-[7px] font-black uppercase disabled:text-zinc-800 ${filterMode === 'preprocessor' ? 'bg-amber-500/15 text-amber-100' : 'text-zinc-600'}`}>Model</button>
            </div>
            {filterMode === 'local' ? (
              <>
            <label className="space-y-1">
              <span className="block text-[7px] font-black uppercase text-zinc-600">Filter</span>
              <select value={config.type} onChange={(event) => update('type', event.target.value as UmbraRasterFilterType)} className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300 outline-none">
                {FILTERS.map((filter) => <option key={filter.id} value={filter.id}>{filter.label}</option>)}
              </select>
            </label>
            {config.type === 'blur' ? <RangeControl label="Radius" value={config.blurRadius} minimum={0} maximum={64} step={1} onChange={(value) => update('blurRadius', value)} /> : null}
            {config.type === 'noise' ? (
              <>
                <label className="mt-3 block space-y-1"><span className="block text-[7px] font-black uppercase text-zinc-600">Noise Type</span><select value={config.noiseMode} onChange={(event) => update('noiseMode', event.target.value as UmbraRasterFilterConfig['noiseMode'])} className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300"><option value="gaussian">Gaussian</option><option value="salt_pepper">Salt & Pepper</option></select></label>
                <RangeControl label="Amount" value={config.noiseAmount} minimum={0} maximum={1} step={0.01} onChange={(value) => update('noiseAmount', value)} />
                <label className="mt-3 flex h-8 items-center gap-2 border border-white/10 px-2 font-mono text-[8px] text-zinc-400"><input type="checkbox" checked={config.noiseColor} onChange={(event) => update('noiseColor', event.target.checked)} className="accent-rose-300" /> Color Noise</label>
                <label className="mt-3 block space-y-1"><span className="block text-[7px] font-black uppercase text-zinc-600">Seed</span><input type="number" value={config.seed} onChange={(event) => update('seed', Number(event.target.value) || 0)} className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300" /></label>
              </>
            ) : null}
            {config.type === 'pixelate' ? <RangeControl label="Tile Size" value={config.pixelSize} minimum={2} maximum={128} step={1} onChange={(value) => update('pixelSize', value)} /> : null}
            {config.type === 'color_map' ? (
              <div className="mt-3 space-y-2">
                <label className="flex h-9 items-center gap-2 border border-white/10 px-2"><span className="text-[7px] font-black uppercase text-zinc-600">Shadows</span><input type="color" value={config.colorMapLow} onChange={(event) => update('colorMapLow', event.target.value)} className="ml-auto h-6 w-10 border-0 bg-transparent p-0" /></label>
                <label className="flex h-9 items-center gap-2 border border-white/10 px-2"><span className="text-[7px] font-black uppercase text-zinc-600">Highlights</span><input type="color" value={config.colorMapHigh} onChange={(event) => update('colorMapHigh', event.target.value)} className="ml-auto h-6 w-10 border-0 bg-transparent p-0" /></label>
              </div>
            ) : null}
            {config.type === 'canny' ? <><RangeControl label="Low Threshold" value={config.lowThreshold} minimum={0} maximum={255} step={1} onChange={(value) => update('lowThreshold', value)} /><RangeControl label="High Threshold" value={config.highThreshold} minimum={0} maximum={255} step={1} onChange={(value) => update('highThreshold', value)} /></> : null}
              </>
            ) : (
              <div className="mt-3 space-y-3">
                <label className="space-y-1">
                  <span className="block text-[7px] font-black uppercase text-zinc-600">Preprocessor</span>
                  <select value={preprocessor.type} onChange={(event) => updatePreprocessor('type', event.target.value as UmbraRasterPreprocessorType)} className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300 outline-none">
                    {preprocessorOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <NumberControl label="Resolution" value={preprocessor.processorResolution} minimum={64} maximum={4096} step={64} onChange={(value) => updatePreprocessor('processorResolution', value)} />
                {preprocessor.type === 'canny' ? <div className="grid grid-cols-2 gap-1.5"><NumberControl label="Low" value={preprocessor.lowThreshold} minimum={0} maximum={255} step={1} onChange={(value) => updatePreprocessor('lowThreshold', value)} /><NumberControl label="High" value={preprocessor.highThreshold} minimum={0} maximum={255} step={1} onChange={(value) => updatePreprocessor('highThreshold', value)} /></div> : null}
                {preprocessor.type === 'pose' ? <div className="grid grid-cols-3 gap-1">{([['Body', 'detectBody'], ['Face', 'detectFace'], ['Hands', 'detectHands']] as const).map(([label, key]) => <label key={key} className="flex h-8 items-center gap-1.5 border border-white/10 px-2 text-[7px] font-black uppercase text-zinc-500"><input type="checkbox" checked={preprocessor[key]} onChange={(event) => updatePreprocessor(key, event.target.checked)} className="accent-amber-300" />{label}</label>)}</div> : null}
                {preprocessor.type === 'face_mesh' ? <div className="grid grid-cols-2 gap-1.5"><NumberControl label="Max Faces" value={preprocessor.maxFaces} minimum={1} maximum={50} step={1} onChange={(value) => updatePreprocessor('maxFaces', value)} /><NumberControl label="Confidence" value={preprocessor.minimumConfidence} minimum={0.1} maximum={1} step={0.05} onChange={(value) => updatePreprocessor('minimumConfidence', value)} /></div> : null}
                {preprocessor.type === 'mlsd' ? <div className="grid grid-cols-2 gap-1.5"><NumberControl label="Score" value={preprocessor.scoreThreshold} minimum={0.01} maximum={2} step={0.01} onChange={(value) => updatePreprocessor('scoreThreshold', value)} /><NumberControl label="Distance" value={preprocessor.distanceThreshold} minimum={0.01} maximum={20} step={0.01} onChange={(value) => updatePreprocessor('distanceThreshold', value)} /></div> : null}
                {preprocessor.type === 'normal_map' ? <div className="grid grid-cols-2 gap-1.5"><NumberControl label="Strength" value={preprocessor.normalStrength} minimum={0} maximum={Math.PI * 5} step={0.1} onChange={(value) => updatePreprocessor('normalStrength', value)} /><NumberControl label="Background" value={preprocessor.backgroundThreshold} minimum={0} maximum={1} step={0.01} onChange={(value) => updatePreprocessor('backgroundThreshold', value)} /></div> : null}
                {preprocessor.type === 'softedge' || preprocessor.type === 'scribble' || preprocessor.type === 'pidi' ? <label className="flex h-8 items-center gap-2 border border-white/10 px-2 text-[7px] font-black uppercase text-zinc-500"><input type="checkbox" checked={preprocessor.safeMode} onChange={(event) => updatePreprocessor('safeMode', event.target.checked)} className="accent-amber-300" /> Safe Mode</label> : null}
                {preprocessor.type === 'content_shuffle' ? <NumberControl label="Seed" value={preprocessor.processorSeed} minimum={0} maximum={Number.MAX_SAFE_INTEGER} step={1} onChange={(value) => updatePreprocessor('processorSeed', value)} /> : null}
                <button type="button" onClick={() => void previewPreprocessor()} disabled={!comfyConnected || processing || applying} className="inline-flex h-8 w-full items-center justify-center gap-1.5 border border-amber-300/25 text-[7px] font-black uppercase text-amber-200 disabled:text-zinc-800">{processing ? <Loader2 size={10} className="animate-spin" /> : <WandSparkles size={10} />} Render Preview</button>
              </div>
            )}
          </div>
          <div className="flex min-h-[360px] items-center justify-center overflow-auto bg-[linear-gradient(45deg,#111_25%,transparent_25%),linear-gradient(-45deg,#111_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#111_75%),linear-gradient(-45deg,transparent_75%,#111_75%)] bg-[length:16px_16px] p-4 custom-scrollbar">
            {loading || processing ? <Loader2 size={20} className="animate-spin text-zinc-600" /> : error ? <span className="max-w-md text-center font-mono text-[9px] text-red-300">{error}</span> : filterMode === 'preprocessor' ? <img src={processedPreview?.url || layer.asset.imageUrl} alt="Layer filter preview" className="max-h-[62vh] max-w-full object-contain shadow-xl shadow-black/70" /> : <canvas ref={previewRef} className="max-h-[62vh] max-w-full object-contain shadow-xl shadow-black/70" />}
          </div>
        </div>
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-white/10 px-3">
          <button type="button" onClick={onClose} className="h-8 border border-white/10 px-4 text-[8px] font-black uppercase text-zinc-500">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={loading || applying || processing || !!error || (filterMode === 'preprocessor' && (!comfyConnected || preprocessorOptions.length <= 0))} className="inline-flex h-8 items-center gap-1.5 border border-rose-300/30 bg-rose-500/[0.08] px-4 text-[8px] font-black uppercase text-rose-200 disabled:text-zinc-700">{applying ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />} Apply Filter</button>
        </div>
      </div>
    </div>
  );
}

function RangeControl({ label, maximum, minimum, onChange, step, value }: { label: string; value: number; minimum: number; maximum: number; step: number; onChange: (value: number) => void }) {
  return <label className="mt-3 block space-y-1"><span className="flex text-[7px] font-black uppercase text-zinc-600"><span>{label}</span><span className="ml-auto font-mono text-zinc-500">{value.toFixed(step < 1 ? 2 : 0)}</span></span><input type="range" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-rose-300" /></label>;
}

function NumberControl({ label, maximum, minimum, onChange, step, value }: { label: string; value: number; minimum: number; maximum: number; step: number; onChange: (value: number) => void }) {
  return <label className="block space-y-1"><span className="block text-[7px] font-black uppercase text-zinc-600">{label}</span><input type="number" min={minimum} max={maximum} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300 outline-none" /></label>;
}
