'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import {
  isLtx23ComfyImageName,
  normalizeLtx23OmniForgeControls,
  type Ltx23DirectorSegment,
  type Ltx23OmniForgeControls,
  type Ltx23OmniForgePass,
} from '../../../../shared/umbra-ui/ltx23OmniForge';

const inputClass = 'w-full min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-teal-300/50';
const labelClass = 'block text-[10px] font-semibold text-zinc-400';
const toolClass = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-zinc-400 hover:border-teal-300/35 hover:text-teal-100 disabled:opacity-30';

export interface Ltx23UploadedImage {
  name: string;
  previewUrl?: string;
}

export interface Ltx23OmniForgeCatalog {
  models?: string[];
  textEncoders?: string[];
  connectors?: string[];
  videoVaes?: string[];
  audioVaes?: string[];
  latentUpscaleModels?: string[];
  icLoras?: string[];
  samplers?: string[];
  schedulers?: string[];
  attentionBackends?: string[];
}

export type Ltx23WiredControl = 'resources' | 'passes' | 'decode' | 'preprocessing' | 'attention'
  | 'directorOptions' | 'icLora' | 'attentionTuner' | 'fp16' | 'output';

export interface UmbraLtxOmniForgePanelProps {
  controls: Ltx23OmniForgeControls;
  onChange: (controls: Ltx23OmniForgeControls) => void;
  onClose: () => void;
  onUploadImage: (file: File) => Promise<Ltx23UploadedImage>;
  frameRate: number;
  frames: number;
  globalPrompt: string;
  catalog?: Ltx23OmniForgeCatalog;
  wiredControls?: readonly Ltx23WiredControl[];
  firstFrame?: Ltx23UploadedImage | null;
  lastFrame?: Ltx23UploadedImage | null;
  onFirstFrameChange?: (image: Ltx23UploadedImage | null) => void;
  onLastFrameChange?: (image: Ltx23UploadedImage | null) => void;
}

function options(values: string[] | undefined, current: string) {
  return Array.from(new Set([...(current ? [current] : []), ...(values || [])].filter(Boolean)))
    .map((value) => ({ value, label: value }));
}

function newSegment(type: Ltx23DirectorSegment['type'], frames: number, existing: Ltx23DirectorSegment[]): Ltx23DirectorSegment {
  const end = existing.reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
  const start = Math.min(Math.max(0, frames - 1), end);
  return {
    id: globalThis.crypto?.randomUUID?.() || `segment-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type,
    start,
    length: Math.max(1, Math.min(24, frames - start)),
    prompt: '',
    guideStrength: 1,
    sourceImageName: '',
  };
}

export function UmbraLtxOmniForgePanel({
  controls, onChange, onClose, onUploadImage, frameRate, frames, globalPrompt, catalog = {}, wiredControls = [],
  firstFrame, lastFrame, onFirstFrameChange, onLastFrameChange,
}: UmbraLtxOmniForgePanelProps) {
  const latest = React.useRef(controls);
  latest.current = controls;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const uploadTarget = React.useRef<string>('');
  const [uploading, setUploading] = React.useState('');
  const [uploadError, setUploadError] = React.useState<{ target: string; message: string } | null>(null);
  const wired = (feature: Ltx23WiredControl) => wiredControls.includes(feature);
  const duration = Math.max(1, frames) / Math.max(1, frameRate);

  const change = (patch: Partial<Ltx23OmniForgeControls>) => {
    const next = normalizeLtx23OmniForgeControls({ ...latest.current, ...patch });
    latest.current = next;
    onChange(next);
  };
  const changeSegment = (id: string, patch: Partial<Ltx23DirectorSegment>) => {
    change({ segments: latest.current.segments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) });
  };
  const moveSegment = (id: string, direction: -1 | 1) => {
    const next = [...latest.current.segments];
    const index = next.findIndex((segment) => segment.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    const start = next[index].start;
    next[index] = { ...next[index], start: next[target].start };
    next[target] = { ...next[target], start };
    [next[index], next[target]] = [next[target], next[index]];
    change({ segments: next });
  };
  const chooseImage = (target: string) => {
    uploadTarget.current = target;
    setUploadError(null);
    fileRef.current?.click();
  };
  const uploadImage = async (file: File) => {
    const target = uploadTarget.current;
    if (!target || uploading) return;
    setUploading(target);
    setUploadError(null);
    try {
      const uploaded = await onUploadImage(file);
      if (!isLtx23ComfyImageName(uploaded.name)) throw new Error('Upload did not return a ComfyUI image basename.');
      if (target === 'first') onFirstFrameChange?.(uploaded);
      else if (target === 'last') onLastFrameChange?.(uploaded);
      else if (latest.current.segments.some((segment) => segment.id === target)) {
        changeSegment(target, { sourceImageName: uploaded.name, previewUrl: uploaded.previewUrl });
      } else throw new Error('The target segment was removed while the image uploaded.');
    } catch (error) {
      setUploadError({ target, message: error instanceof Error ? error.message : 'Image upload failed.' });
    } finally {
      setUploading('');
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const changePass = (index: number, patch: Partial<Ltx23OmniForgePass>) => {
    const passes = latest.current.passes.map((pass, passIndex) => passIndex === index ? { ...pass, ...patch } : pass) as Ltx23OmniForgeControls['passes'];
    change({ passes });
  };

  const resource = (label: string, value: string, values: string[] | undefined, apply: (value: string) => void) => (
    <label className="min-w-0 space-y-1">
      <span className={labelClass}>{label}</span>
      <UmbraSelect value={value} options={options(values, value)} onValueChange={apply} ariaLabel={label}
        placeholder={values?.length ? 'Choose model' : 'No models available'} size="sm" />
    </label>
  );
  const numeric = (label: string, value: number, apply: (value: number) => void, min: number, max: number, step = 1) => (
    <label className="min-w-0 space-y-1">
      <span className={labelClass}>{label}</span>
      <input className={inputClass} type="number" min={min} max={max} step={step} value={value}
        onChange={(event) => apply(Number(event.target.value))} />
    </label>
  );
  const imageSlot = (label: string, target: 'first' | 'last', image: Ltx23UploadedImage | null | undefined,
    clear: ((image: Ltx23UploadedImage | null) => void) | undefined) => (
    <div className="min-w-0 border-b border-white/10 py-2">
      <div className="flex items-center gap-2">
        {image?.previewUrl ? <img src={image.previewUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />
          : <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded bg-white/5 text-zinc-500"><ImageIcon size={16} /></div>}
        <div className="min-w-0 flex-1">
          <div className={labelClass}>{label}</div>
          <div className="truncate text-xs text-zinc-200" title={image?.name}>{image?.name || 'No image'}</div>
        </div>
        <button type="button" className={toolClass} title={`Upload ${label}`} aria-label={`Upload ${label}`}
          disabled={!!uploading} onClick={() => chooseImage(target)}>
          {uploading === target ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
        </button>
        {image && <button type="button" className={toolClass} title={`Clear ${label}`} aria-label={`Clear ${label}`}
          onClick={() => clear?.(null)}><X size={14} /></button>}
      </div>
      {uploadError?.target === target && <p role="alert" className="mt-1 text-xs text-red-300">{uploadError.message}</p>}
    </div>
  );

  return (
    <aside data-umbra-ltx23-omniforge="" className="flex max-h-[min(90vh,900px)] min-h-0 w-full flex-col overflow-hidden bg-[#0b1011] text-zinc-100">
      <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="min-w-0 flex-1 text-sm font-semibold">DaSiWa LTX-2.3 OmniForge Director</h2>
        <span className="text-xs text-zinc-500">{frames} frames · {duration.toFixed(1)}s</span>
        <button type="button" className={toolClass} title="Close Director" aria-label="Close Director" onClick={onClose}><X size={16} /></button>
      </header>
      <div className="min-h-0 space-y-5 overflow-y-auto px-4 py-3 custom-scrollbar">
        <div className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-3">
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.enabled}
            onChange={(event) => change({ enabled: event.target.checked })} /> Enable OmniForge</label>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.mainTrackEnabled}
            onChange={(event) => change({ mainTrackEnabled: event.target.checked })} /> Main track</label>
        </div>

        {(onFirstFrameChange || onLastFrameChange) && <section aria-label="Primary frames" className="grid gap-x-5 md:grid-cols-2">
          {onFirstFrameChange && imageSlot('First frame', 'first', firstFrame, onFirstFrameChange)}
          {onLastFrameChange && imageSlot('Last frame', 'last', lastFrame, onLastFrameChange)}
        </section>}

        <section aria-label="Director timeline" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
            <h3 className="mr-auto text-xs font-semibold">Timeline</h3>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs hover:border-teal-300/35"
              onClick={() => change({ segments: [...controls.segments, newSegment('image', frames, controls.segments)] })}><Plus size={13} /> Image</button>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs hover:border-teal-300/35"
              onClick={() => change({ segments: [...controls.segments, newSegment('text', frames, controls.segments)] })}><Plus size={13} /> Text</button>
          </div>
          <div className="text-xs text-zinc-500">Global prompt: <span className="text-zinc-300">{globalPrompt || 'Empty'}</span></div>
          {controls.segments.length === 0 && <p className="py-5 text-center text-xs text-zinc-500">No timeline segments</p>}
          {controls.segments.map((segment, index) => (
            <article key={segment.id} className="border-b border-white/10 py-2.5">
              <div className="mb-2 flex items-center gap-2">
                <span className="w-6 shrink-0 text-xs text-teal-200">{index + 1}</span>
                <span className="min-w-0 flex-1 text-xs font-semibold capitalize">{segment.type} segment</span>
                <button type="button" className={toolClass} disabled={index === 0} title="Move earlier" aria-label="Move earlier" onClick={() => moveSegment(segment.id, -1)}><ArrowUp size={14} /></button>
                <button type="button" className={toolClass} disabled={index === controls.segments.length - 1} title="Move later" aria-label="Move later" onClick={() => moveSegment(segment.id, 1)}><ArrowDown size={14} /></button>
                <button type="button" className={toolClass} title="Remove segment" aria-label="Remove segment"
                  onClick={() => change({ segments: controls.segments.filter((item) => item.id !== segment.id) })}><Trash2 size={14} /></button>
              </div>
              <div className="grid gap-2 sm:grid-cols-[repeat(2,minmax(0,8rem))_minmax(0,1fr)]">
                {numeric('Start frame', segment.start, (start) => changeSegment(segment.id, { start }), 0, Math.max(0, frames - 1))}
                {numeric('Length · frames', segment.length, (length) => changeSegment(segment.id, { length }), 1, frames)}
                {segment.type === 'image' && numeric('Guide strength', segment.guideStrength,
                  (guideStrength) => changeSegment(segment.id, { guideStrength }), 0, 1, 0.05)}
              </div>
              <label className="mt-2 block space-y-1"><span className={labelClass}>Local prompt</span>
                <textarea className={`${inputClass} min-h-16 resize-y`} value={segment.prompt}
                  onChange={(event) => changeSegment(segment.id, { prompt: event.target.value.replace(/\|/g, ',') })} /></label>
              {segment.type === 'image' && <div className="mt-2 flex min-w-0 items-center gap-2">
                {segment.previewUrl && <img src={segment.previewUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />}
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400" title={segment.sourceImageName}>
                  {segment.sourceImageName || 'Image required'}</span>
                <button type="button" className={toolClass} title="Upload segment image" aria-label="Upload segment image"
                  disabled={!!uploading} onClick={() => chooseImage(segment.id)}>
                  {uploading === segment.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                </button>
                {segment.sourceImageName && <button type="button" className={toolClass} title="Clear segment image" aria-label="Clear segment image"
                  onClick={() => changeSegment(segment.id, { sourceImageName: '', previewUrl: undefined })}><X size={14} /></button>}
              </div>}
              {segment.type === 'image' && segment.sourceImageName && !isLtx23ComfyImageName(segment.sourceImageName)
                && <p role="alert" className="mt-1 text-xs text-red-300">Unsafe staged image path. Upload this image again.</p>}
              {uploadError?.target === segment.id && <p role="alert" className="mt-1 text-xs text-red-300">{uploadError.message}</p>}
            </article>
          ))}
          <p className="text-xs text-zinc-500">Audio and motion tracks and retake are unavailable in this adaptation.</p>
        </section>

        {wired('directorOptions') && <section aria-label="Director settings" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Director settings</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {resource('Image resize', controls.directorOptions.resizeMethod,
              ['maintain aspect ratio', 'stretch to fit', 'pad', 'pad green', 'crop'],
              (resizeMethod) => change({ directorOptions: {
                ...controls.directorOptions, resizeMethod: resizeMethod as Ltx23OmniForgeControls['directorOptions']['resizeMethod'],
              } }))}
            {numeric('Image compression', controls.directorOptions.imageCompression,
              (imageCompression) => change({ directorOptions: { ...controls.directorOptions, imageCompression } }), 0, 100)}
            {numeric('Epsilon', controls.directorOptions.epsilon,
              (epsilon) => change({ directorOptions: { ...controls.directorOptions, epsilon } }), 0.0001, 0.99, 0.0001)}
          </div>
        </section>}

        {wired('resources') && <section aria-label="Model resources" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Model resources</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {resource('Model source', controls.modelSource, ['safetensors', 'gguf'], (modelSource) => change({ modelSource: modelSource as Ltx23OmniForgeControls['modelSource'], modelName: '' }))}
            {resource('Model', controls.modelName, catalog.models, (modelName) => change({ modelName }))}
            {resource('Encoder source', controls.textEncoderSource, ['safetensors', 'gguf'], (textEncoderSource) => change({ textEncoderSource: textEncoderSource as Ltx23OmniForgeControls['textEncoderSource'], textEncoder: '' }))}
            {resource('Text encoder', controls.textEncoder, catalog.textEncoders, (textEncoder) => change({ textEncoder }))}
            {resource('Connector', controls.connector, catalog.connectors, (connector) => change({ connector }))}
            {resource('Video VAE', controls.videoVae, catalog.videoVaes, (videoVae) => change({ videoVae }))}
            {resource('Audio VAE', controls.audioVae, catalog.audioVaes, (audioVae) => change({ audioVae }))}
            {resource('Latent upscale', controls.latentUpscaleModel, catalog.latentUpscaleModels, (latentUpscaleModel) => change({ latentUpscaleModel }))}
          </div>
        </section>}

        {wired('passes') && <section aria-label="Rendering passes" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Rendering</h3>
          {resource('Pass count', String(controls.passCount), ['1', '2', '3'], (value) => change({ passCount: Number(value) as 1 | 2 | 3 }))}
          {controls.passes.slice(0, controls.passCount).map((pass, index) => <div key={index} className="border-b border-white/10 py-2">
            <div className="mb-2 text-xs font-semibold">Pass {index + 1}</div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {resource('Sampler', pass.sampler, catalog.samplers, (sampler) => changePass(index, { sampler }))}
              {resource('Scheduler', pass.scheduler, catalog.schedulers, (scheduler) => changePass(index, { scheduler }))}
              {numeric('Steps', pass.steps, (steps) => changePass(index, { steps }), 1, 10_000)}
              {numeric('Denoise', pass.denoise, (denoise) => changePass(index, { denoise }), 0, 1, 0.01)}
              {numeric('CFG', pass.cfg, (cfg) => changePass(index, { cfg }), 0, 100, 0.1)}
              {numeric('Image attention', pass.imageAttentionStrength,
                (imageAttentionStrength) => changePass(index, { imageAttentionStrength }), 0, 1, 0.05)}
              {wired('icLora') && resource('IC-LoRA', pass.icLoraName, ['None', ...(catalog.icLoras || [])],
                (icLoraName) => changePass(index, { icLoraName }))}
              {wired('icLora') && numeric('IC-LoRA strength', pass.icLoraStrength,
                (icLoraStrength) => changePass(index, { icLoraStrength }), 0, 10, 0.05)}
            </div>
          </div>)}
        </section>}

        {wired('decode') && <section aria-label="Decode" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Decode</h3>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.tiledDecode.enabled}
            onChange={(event) => change({ tiledDecode: { ...controls.tiledDecode, enabled: event.target.checked } })} /> Tiled decode</label>
          {controls.tiledDecode.enabled && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {(['spatialTileSize', 'spatialOverlap', 'temporalTileSize', 'temporalOverlap'] as const).map((key) =>
              <React.Fragment key={key}>{numeric(key.replace(/([A-Z])/g, ' $1'), controls.tiledDecode[key],
                (value) => change({ tiledDecode: { ...controls.tiledDecode, [key]: value } }), key.includes('Overlap') ? 0 : 1, 10_000)}</React.Fragment>)}</div>}
        </section>}

        {wired('preprocessing') && <section aria-label="Preprocessing" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Preprocessing</h3>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.chunkFeedForward.enabled}
              onChange={(event) => change({ chunkFeedForward: { ...controls.chunkFeedForward, enabled: event.target.checked } })} /> Chunk feedforward</label>
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.nag.enabled}
              onChange={(event) => change({ nag: { ...controls.nag, enabled: event.target.checked } })} /> NAG</label>
          </div>
          {controls.chunkFeedForward.enabled && numeric('Chunks', controls.chunkFeedForward.chunks,
            (chunks) => change({ chunkFeedForward: { ...controls.chunkFeedForward, chunks } }), 1, 100)}
          {controls.nag.enabled && <div className="grid gap-2 sm:grid-cols-3">
            {numeric('Scale', controls.nag.scale, (scale) => change({ nag: { ...controls.nag, scale } }), 0, 100, 0.1)}
            {numeric('Tau', controls.nag.tau, (tau) => change({ nag: { ...controls.nag, tau } }), 0, 10, 0.01)}
            {numeric('Alpha', controls.nag.alpha, (alpha) => change({ nag: { ...controls.nag, alpha } }), 0, 1, 0.01)}
          </div>}
        </section>}
        {wired('attention') && resource('Attention backend', controls.attentionBackend, catalog.attentionBackends,
          (attentionBackend) => change({ attentionBackend }))}
        {wired('fp16') && <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.fp16Accumulation}
          onChange={(event) => change({ fp16Accumulation: event.target.checked })} /> FP16 accumulation</label>}
        {wired('attentionTuner') && <section aria-label="Attention tuner" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Attention tuner</h3>
          <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.attentionTuner.enabled}
            onChange={(event) => change({ attentionTuner: { ...controls.attentionTuner, enabled: event.target.checked } })} /> Enable tuner</label>
          {controls.attentionTuner.enabled && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="min-w-0 space-y-1"><span className={labelClass}>Blocks</span>
              <input className={inputClass} value={controls.attentionTuner.blocks}
                onChange={(event) => change({ attentionTuner: { ...controls.attentionTuner, blocks: event.target.value } })} /></label>
            {(['videoScale', 'audioScale', 'audioToVideoScale', 'videoToAudioScale'] as const).map((key) =>
              <React.Fragment key={key}>{numeric(key.replace(/([A-Z])/g, ' $1'), controls.attentionTuner[key],
                (value) => change({ attentionTuner: { ...controls.attentionTuner, [key]: value } }), 0, 10, 0.05)}</React.Fragment>)}
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.attentionTuner.tritonKernels}
              onChange={(event) => change({ attentionTuner: { ...controls.attentionTuner, tritonKernels: event.target.checked } })} /> Triton kernels</label>
          </div>}
        </section>}
        {wired('output') && <section aria-label="Video output" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Video output</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resource('Codec', controls.outputEncoding.codec, ['Auto', 'AV1', 'VP9', 'H.265 (HEVC)', 'H.264'],
              (codec) => change({ outputEncoding: { ...controls.outputEncoding, codec: codec as Ltx23OmniForgeControls['outputEncoding']['codec'] } }))}
            {resource('Container', controls.outputEncoding.container, ['Auto', 'WebM', 'MKV', 'MP4'],
              (container) => change({ outputEncoding: { ...controls.outputEncoding, container: container as Ltx23OmniForgeControls['outputEncoding']['container'] } }))}
            {resource('Bit depth', controls.outputEncoding.bitDepth, ['Auto', '8-bit', '10-bit'],
              (bitDepth) => change({ outputEncoding: { ...controls.outputEncoding, bitDepth: bitDepth as Ltx23OmniForgeControls['outputEncoding']['bitDepth'] } }))}
            {numeric('Quality', controls.outputEncoding.quality,
              (quality) => change({ outputEncoding: { ...controls.outputEncoding, quality } }), 0, 51)}
            {resource('Audio codec', controls.outputEncoding.audioCodec, ['Auto', 'AAC', 'Opus', 'MP3'],
              (audioCodec) => change({ outputEncoding: { ...controls.outputEncoding, audioCodec: audioCodec as Ltx23OmniForgeControls['outputEncoding']['audioCodec'] } }))}
            {resource('Audio bitrate', controls.outputEncoding.audioBitrate, ['64k', '96k', '128k', '160k', '192k', '256k', '320k'],
              (audioBitrate) => change({ outputEncoding: { ...controls.outputEncoding, audioBitrate: audioBitrate as Ltx23OmniForgeControls['outputEncoding']['audioBitrate'] } }))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {([
              ['pingpong', 'Ping-pong'], ['cropToAudio', 'Crop to audio'],
              ['saveFirstFrame', 'Save first frame'], ['saveLastFrame', 'Save last frame'],
            ] as const).map(([key, label]) => <label key={key} className="inline-flex items-center gap-2 text-xs">
              <input type="checkbox" checked={controls.outputEncoding[key]}
                onChange={(event) => change({ outputEncoding: { ...controls.outputEncoding, [key]: event.target.checked } })} /> {label}
            </label>)}
          </div>
        </section>}
      </div>
      <input ref={fileRef} className="hidden" type="file" accept="image/*" aria-label="Director image file"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); }} />
    </aside>
  );
}

export default UmbraLtxOmniForgePanel;
