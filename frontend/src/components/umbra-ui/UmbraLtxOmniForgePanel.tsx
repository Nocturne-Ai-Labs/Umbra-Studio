'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import {
  getLtx23ColorReferenceImageName,
  isLtx23ComfyInputName,
  isLtx23ComfyImageName,
  normalizeLtx23OmniForgeControls,
  type Ltx23DirectorAudioSegment,
  type Ltx23DirectorMotionSegment,
  type Ltx23DirectorSegment,
  type Ltx23OmniForgeControls,
  type Ltx23OmniForgeModelUpscale,
  type Ltx23OmniForgePass,
  type Ltx23OmniForgeResize,
  type Ltx23OmniForgeRtx,
  type Ltx23Watermark,
} from '../../../../shared/umbra-ui/ltx23OmniForge';

const inputClass = 'w-full min-w-0 rounded border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-teal-300/50';
const labelClass = 'block text-[10px] font-semibold text-zinc-400';
const toolClass = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-zinc-400 hover:border-teal-300/35 hover:text-teal-100 disabled:opacity-30';

export interface Ltx23UploadedImage {
  name: string;
  previewUrl?: string;
  sourcePath?: string;
}

export interface Ltx23UploadedMedia extends Ltx23UploadedImage {
  durationSeconds?: number;
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
  previewVaes?: string[];
  upscaleModels?: string[];
}

export type Ltx23WiredControl = 'resources' | 'passes' | 'decode' | 'preprocessing' | 'attention'
  | 'directorOptions' | 'icLora' | 'attentionTuner' | 'fp16' | 'output'
  | 'audioTimeline' | 'motionTimeline' | 'retake' | 'tritonVae' | 'samplingPreview'
  | 'colorTransfer' | 'watermarks' | 'resize' | 'modelUpscale' | 'rtx';

export interface UmbraLtxOmniForgePanelProps {
  controls: Ltx23OmniForgeControls;
  onChange: (controls: Ltx23OmniForgeControls) => void;
  onClose: () => void;
  onUploadImage: (file: File) => Promise<Ltx23UploadedImage>;
  onUploadMedia?: (file: File, kind: 'image' | 'video' | 'audio') => Promise<Ltx23UploadedMedia>;
  frameRate: number;
  frames: number;
  globalPrompt: string;
  catalog?: Ltx23OmniForgeCatalog;
  wiredControls?: readonly Ltx23WiredControl[];
  firstFrame?: Ltx23UploadedImage | null;
  lastFrame?: Ltx23UploadedImage | null;
  onFirstFrameChange?: (image: Ltx23UploadedImage | null) => void;
  onLastFrameChange?: (image: Ltx23UploadedImage | null) => void;
  onDraftBusyChange?: (busy: boolean) => void;
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
    isEndFrame: false,
  };
}

function newMediaSegment(kind: 'audio' | 'motion', frames: number, existing: Array<{ start: number; length: number }>): Ltx23DirectorAudioSegment | Ltx23DirectorMotionSegment {
  const end = existing.reduce((max, segment) => Math.max(max, segment.start + segment.length), 0);
  const start = Math.min(Math.max(0, frames - 1), end);
  const base = {
    id: globalThis.crypto?.randomUUID?.() || `media-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    start, length: Math.max(1, Math.min(24, frames - start)), trimStart: 0,
  };
  return kind === 'audio'
    ? { ...base, type: 'audio', audioFile: '', audioDurationFrames: 0 }
    : { ...base, type: 'motion_video', videoFile: '', videoDurationFrames: 0,
      videoStrength: 1, videoAttentionStrength: 0.65, resampleMode: 'nearest' };
}

function readMediaDurationSeconds(file: File, kind: 'video' | 'audio'): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const media = document.createElement(kind);
    const timeout = window.setTimeout(() => finish(), 15_000);
    const finish = (seconds?: number) => {
      window.clearTimeout(timeout);
      media.onloadedmetadata = null;
      media.onerror = null;
      media.removeAttribute('src');
      media.load();
      URL.revokeObjectURL(url);
      if (seconds && Number.isFinite(seconds) && seconds > 0) resolve(seconds);
      else reject(new Error('Could not read the media duration.'));
    };
    media.onloadedmetadata = () => finish(media.duration);
    media.onerror = () => finish();
    media.src = url;
  });
}

export function UmbraLtxOmniForgePanel({
  controls, onChange, onClose, onUploadImage, onUploadMedia, frameRate, frames, globalPrompt, catalog = {}, wiredControls = [],
  firstFrame, lastFrame, onFirstFrameChange, onLastFrameChange, onDraftBusyChange,
}: UmbraLtxOmniForgePanelProps) {
  const latest = React.useRef(controls);
  latest.current = controls;
  const fileRef = React.useRef<HTMLInputElement>(null);
  const mediaRef = React.useRef<HTMLInputElement>(null);
  const uploadTarget = React.useRef<string>('');
  const mediaTarget = React.useRef<{ kind: 'video' | 'audio'; target: string } | null>(null);
  const [uploading, setUploading] = React.useState('');
  const [uploadError, setUploadError] = React.useState<{ target: string; message: string } | null>(null);
  const [mediaUploading, setMediaUploading] = React.useState('');
  const [mediaError, setMediaError] = React.useState<{ target: string; message: string } | null>(null);
  const wired = (feature: Ltx23WiredControl) => wiredControls.includes(feature);
  const duration = Math.max(1, frames) / Math.max(1, frameRate);
  let colorReference = '';
  try { colorReference = getLtx23ColorReferenceImageName(controls); } catch { /* No staged guide yet. */ }

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
  const chooseMedia = (kind: 'video' | 'audio', target: string) => {
    mediaTarget.current = { kind, target };
    setMediaError(null);
    if (mediaRef.current) mediaRef.current.accept = kind === 'audio' ? 'audio/*' : 'video/*';
    mediaRef.current?.click();
  };
  const uploadImage = async (file: File) => {
    const target = uploadTarget.current;
    if (!target || uploading) return;
    onDraftBusyChange?.(true);
    setUploading(target);
    setUploadError(null);
    try {
      const uploaded = onUploadMedia ? await onUploadMedia(file, 'image') : await onUploadImage(file);
      if (!isLtx23ComfyImageName(uploaded.name)) throw new Error('Upload did not return a safe ComfyUI input name.');
      if (target === 'first') onFirstFrameChange?.(uploaded);
      else if (target === 'last') onLastFrameChange?.(uploaded);
      else if (target.startsWith('watermark:')) {
        const index = Number(target.split(':')[1]);
        const watermarks = [...latest.current.watermarks] as Ltx23OmniForgeControls['watermarks'];
        watermarks[index] = { ...watermarks[index], imageName: uploaded.name,
          sourcePath: uploaded.sourcePath, previewUrl: uploaded.previewUrl };
        change({ watermarks });
      }
      else if (latest.current.segments.some((segment) => segment.id === target)) {
        changeSegment(target, { sourceImageName: uploaded.name,
          sourcePath: uploaded.sourcePath, previewUrl: uploaded.previewUrl });
      } else throw new Error('The target segment was removed while the image uploaded.');
    } catch (error) {
      setUploadError({ target, message: error instanceof Error ? error.message : 'Image upload failed.' });
    } finally {
      setUploading('');
      if (fileRef.current) fileRef.current.value = '';
      onDraftBusyChange?.(false);
    }
  };
  const uploadMedia = async (file: File) => {
    const request = mediaTarget.current;
    if (!request || !onUploadMedia || mediaUploading) return;
    const { target, kind } = request;
    onDraftBusyChange?.(true);
    setMediaUploading(target);
    setMediaError(null);
    try {
      const uploaded = await onUploadMedia(file, kind);
      if (!isLtx23ComfyInputName(uploaded.name)) throw new Error('Upload did not return a safe ComfyUI input name.');
      const seconds = uploaded.durationSeconds && Number.isFinite(uploaded.durationSeconds)
        ? uploaded.durationSeconds : await readMediaDurationSeconds(file, kind);
      const durationFrames = Math.max(1, Math.ceil(seconds * Math.max(1, frameRate)));
      if (target === 'retake') {
        const retake = latest.current.retake;
        change({ retake: { ...retake, start: 0, length: Math.min(durationFrames, Math.max(1, frames)),
          video: { imageFile: uploaded.name, videoDurationFrames: durationFrames,
            sourcePath: uploaded.sourcePath, previewUrl: uploaded.previewUrl } } });
      } else if (target.startsWith('audio:')) {
        const id = target.slice(6);
        if (!latest.current.audioSegments.some((segment) => segment.id === id)) throw new Error('Audio segment was removed during upload.');
        change({ audioSegments: latest.current.audioSegments.map((segment) => segment.id === id
          ? { ...segment, audioFile: uploaded.name, audioDurationFrames: durationFrames,
            length: Math.min(segment.length, durationFrames), trimStart: 0,
            sourcePath: uploaded.sourcePath, previewUrl: uploaded.previewUrl }
          : segment) });
      } else if (target.startsWith('motion:')) {
        const id = target.slice(7);
        if (!latest.current.motionSegments.some((segment) => segment.id === id)) throw new Error('Motion segment was removed during upload.');
        change({ motionSegments: latest.current.motionSegments.map((segment) => segment.id === id
          ? { ...segment, videoFile: uploaded.name, videoDurationFrames: durationFrames,
            length: Math.min(segment.length, durationFrames), trimStart: 0,
            sourcePath: uploaded.sourcePath, previewUrl: uploaded.previewUrl }
          : segment) });
      }
    } catch (error) {
      setMediaError({ target, message: error instanceof Error ? error.message : 'Media upload failed.' });
    } finally {
      setMediaUploading('');
      if (mediaRef.current) mediaRef.current.value = '';
      onDraftBusyChange?.(false);
    }
  };
  const changePass = (index: number, patch: Partial<Ltx23OmniForgePass>) => {
    const passes = latest.current.passes.map((pass, passIndex) => passIndex === index ? { ...pass, ...patch } : pass) as Ltx23OmniForgeControls['passes'];
    change({ passes });
  };
  const changeAudio = (id: string, patch: Partial<Ltx23DirectorAudioSegment>) =>
    change({ audioSegments: latest.current.audioSegments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) });
  const changeMotion = (id: string, patch: Partial<Ltx23DirectorMotionSegment>) =>
    change({ motionSegments: latest.current.motionSegments.map((segment) => segment.id === id ? { ...segment, ...patch } : segment) });
  const changeResize = (patch: Partial<Ltx23OmniForgeResize>) => change({ resize: { ...latest.current.resize, ...patch } });
  const changeModelUpscale = (patch: Partial<Ltx23OmniForgeModelUpscale>) => change({ modelUpscale: { ...latest.current.modelUpscale, ...patch } });
  const changeRtx = (patch: Partial<Ltx23OmniForgeRtx>) => change({ rtx: { ...latest.current.rtx, ...patch } });
  const changeWatermark = (index: number, patch: Partial<Ltx23Watermark>) => {
    const watermarks = [...latest.current.watermarks] as Ltx23OmniForgeControls['watermarks'];
    watermarks[index] = { ...watermarks[index], ...patch };
    change({ watermarks });
  };
  const moveMedia = (kind: 'audio' | 'motion', id: string, direction: -1 | 1) => {
    const entries = kind === 'audio' ? [...latest.current.audioSegments] : [...latest.current.motionSegments];
    const index = entries.findIndex((segment) => segment.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= entries.length) return;
    const starts = [entries[index].start, entries[target].start];
    const next = entries.map((segment, position) => position === index ? { ...segment, start: starts[1] }
      : position === target ? { ...segment, start: starts[0] } : segment);
    [next[index], next[target]] = [next[target], next[index]];
    if (kind === 'audio') change({ audioSegments: next as Ltx23DirectorAudioSegment[] });
    else change({ motionSegments: next as Ltx23DirectorMotionSegment[] });
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
  const boolean = (label: string, value: boolean, apply: (value: boolean) => void, disabled = false) => (
    <label className="inline-flex items-center gap-2 text-xs text-zinc-200">
      <input type="checkbox" checked={value} disabled={disabled} onChange={(event) => apply(event.target.checked)} /> {label}
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
  const mediaTrack = (kind: 'audio' | 'motion') => {
    const isAudio = kind === 'audio';
    const entries = isAudio ? controls.audioSegments : controls.motionSegments;
    const gate = isAudio ? 'audioTimeline' : 'motionTimeline';
    if (!onUploadMedia || !wired(gate)) return null;
    const trackEnabled = isAudio ? controls.audioTrackEnabled : controls.motionTrackEnabled;
    return <section aria-label={`${kind} timeline`} className="space-y-2">
      <div className="flex items-center gap-2 border-b border-white/10 pb-2">
        <h3 className="mr-auto text-xs font-semibold capitalize">{kind} track</h3>
        <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={trackEnabled}
          onChange={(event) => isAudio
            ? change({ audioTrackEnabled: event.target.checked, useCustomAudio: event.target.checked,
              overrideAudio: event.target.checked ? false : controls.overrideAudio })
            : change({ motionTrackEnabled: event.target.checked, useCustomMotion: event.target.checked,
              overrideAudio: event.target.checked ? controls.overrideAudio : false })} /> Enabled</label>
        <button type="button" className={toolClass} title={`Add ${kind} segment`} aria-label={`Add ${kind} segment`}
          onClick={() => isAudio
            ? change({ audioSegments: [...controls.audioSegments, newMediaSegment('audio', frames, entries) as Ltx23DirectorAudioSegment] })
            : change({ motionSegments: [...controls.motionSegments, newMediaSegment('motion', frames, entries) as Ltx23DirectorMotionSegment] })}>
          <Plus size={14} /></button>
      </div>
      {isAudio && <div className="flex flex-wrap gap-4 text-xs">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={controls.inpaintAudio}
          onChange={(event) => change({ inpaintAudio: event.target.checked })} /> Inpaint gaps</label>
        {wired('motionTimeline') && <label className="inline-flex items-center gap-2"><input type="checkbox" checked={controls.overrideAudio}
          disabled={!controls.motionTrackEnabled || !controls.motionSegments.length}
          onChange={(event) => change({ overrideAudio: event.target.checked,
            audioTrackEnabled: event.target.checked ? false : controls.audioTrackEnabled,
            useCustomAudio: event.target.checked ? false : controls.useCustomAudio })} /> Use motion-video audio</label>}
      </div>}
      {entries.map((segment, index) => {
        const file = segment.type === 'audio' ? segment.audioFile : segment.videoFile;
        const sourceFrames = segment.type === 'audio' ? segment.audioDurationFrames : segment.videoDurationFrames;
        const target = `${kind}:${segment.id}`;
        const update = (patch: Partial<Ltx23DirectorAudioSegment> & Partial<Ltx23DirectorMotionSegment>) =>
          segment.type === 'audio' ? changeAudio(segment.id, patch) : changeMotion(segment.id, patch);
        return <article key={segment.id} className="border-b border-white/10 py-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs" title={file}>{file || `${kind} file required`}</span>
            <button type="button" className={toolClass} title={`Upload ${kind}`} aria-label={`Upload ${kind}`}
              disabled={!!mediaUploading} onClick={() => chooseMedia(isAudio ? 'audio' : 'video', target)}>
              {mediaUploading === target ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}</button>
            <button type="button" className={toolClass} title="Move earlier" aria-label="Move earlier" disabled={index === 0}
              onClick={() => moveMedia(kind, segment.id, -1)}><ArrowUp size={14} /></button>
            <button type="button" className={toolClass} title="Move later" aria-label="Move later" disabled={index === entries.length - 1}
              onClick={() => moveMedia(kind, segment.id, 1)}><ArrowDown size={14} /></button>
            <button type="button" className={toolClass} title="Remove segment" aria-label="Remove segment"
              onClick={() => isAudio
                ? change({ audioSegments: controls.audioSegments.filter((item) => item.id !== segment.id) })
                : change({ motionSegments: controls.motionSegments.filter((item) => item.id !== segment.id) })}><Trash2 size={14} /></button>
          </div>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {numeric('Start frame', segment.start, (start) => update({ start }), 0, Math.max(0, frames - 1))}
            {numeric('Length · frames', segment.length, (length) => update({ length }), 1, Math.max(1, sourceFrames || frames))}
            {numeric('Trim start · frames', segment.trimStart, (trimStart) => update({ trimStart }), 0, Math.max(0, sourceFrames - 1))}
            {segment.type === 'motion_video' && <>
              {numeric('Motion strength', segment.videoStrength, (videoStrength) => changeMotion(segment.id, { videoStrength }), 0, 1, 0.05)}
              {numeric('Attention strength', segment.videoAttentionStrength,
                (videoAttentionStrength) => changeMotion(segment.id, { videoAttentionStrength }), 0, 1, 0.05)}
              {resource('Resampling', segment.resampleMode, ['nearest', 'bilinear'],
                (resampleMode) => changeMotion(segment.id, { resampleMode: resampleMode as Ltx23DirectorMotionSegment['resampleMode'] }))}
            </>}
          </div>
          {file && !isLtx23ComfyInputName(file) && <p role="alert" className="mt-1 text-xs text-red-300">Unsafe staged media path.</p>}
          {file && segment.trimStart + segment.length > sourceFrames && <p role="alert" className="mt-1 text-xs text-red-300">Trim exceeds source duration.</p>}
          {segment.start + segment.length > frames && <p role="alert" className="mt-1 text-xs text-red-300">Segment exceeds requested frames.</p>}
          {mediaError?.target === target && <p role="alert" className="mt-1 text-xs text-red-300">{mediaError.message}</p>}
        </article>;
      })}
    </section>;
  };

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

        {!controls.retake.enabled && (onFirstFrameChange || onLastFrameChange) && <section aria-label="Primary frames" className="grid gap-x-5 md:grid-cols-2">
          {onFirstFrameChange && imageSlot('First frame', 'first', firstFrame, onFirstFrameChange)}
          {onLastFrameChange && imageSlot('Last frame', 'last', lastFrame, onLastFrameChange)}
        </section>}

        {!controls.retake.enabled && <section aria-label="Director timeline" className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-2">
            <h3 className="mr-auto text-xs font-semibold">Timeline</h3>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs hover:border-teal-300/35"
              onClick={() => change({ segments: [...controls.segments, newSegment('image', frames, controls.segments)] })}><Plus size={13} /> Image</button>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs hover:border-teal-300/35"
              onClick={() => change({ segments: [...controls.segments, newSegment('text', frames, controls.segments)] })}><Plus size={13} /> Text</button>
          </div>
          <div className="break-words text-xs text-zinc-500">Global prompt: <span className="text-zinc-300">{globalPrompt || 'Empty'}</span></div>
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
                  onChange={(event) => changeSegment(segment.id, { prompt: event.target.value })} /></label>
              {segment.prompt.includes('|') && <p role="alert" className="mt-1 text-xs text-red-300">The pipe character is not allowed in local prompts.</p>}
              {segment.start + segment.length > frames && <p role="alert" className="mt-1 text-xs text-red-300">Segment exceeds requested frames.</p>}
              {controls.segments.some((other) => other.id !== segment.id
                && segment.start < other.start + other.length && other.start < segment.start + segment.length)
                && <p role="alert" className="mt-1 text-xs text-red-300">Main timeline segments overlap.</p>}
              {segment.type === 'image' && <div className="mt-2 flex min-w-0 items-center gap-2">
                {segment.previewUrl && <img src={segment.previewUrl} alt="" className="h-10 w-14 shrink-0 rounded object-cover" />}
                <span className="min-w-0 flex-1 truncate text-xs text-zinc-400" title={segment.sourceImageName}>
                  {segment.sourceImageName || 'Image required'}</span>
                <button type="button" className={toolClass} title="Upload segment image" aria-label="Upload segment image"
                  disabled={!!uploading} onClick={() => chooseImage(segment.id)}>
                  {uploading === segment.id ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                </button>
                {segment.sourceImageName && <button type="button" className={toolClass} title="Clear segment image" aria-label="Clear segment image"
                  onClick={() => changeSegment(segment.id, { sourceImageName: '', sourcePath: undefined, previewUrl: undefined })}><X size={14} /></button>}
              </div>}
              {segment.type === 'image' && boolean('Place at segment end', segment.isEndFrame,
                (isEndFrame) => changeSegment(segment.id, { isEndFrame }))}
              {segment.type === 'image' && segment.sourceImageName && !isLtx23ComfyImageName(segment.sourceImageName)
                && <p role="alert" className="mt-1 text-xs text-red-300">Unsafe staged image path. Upload this image again.</p>}
              {uploadError?.target === segment.id && <p role="alert" className="mt-1 text-xs text-red-300">{uploadError.message}</p>}
            </article>
          ))}
        </section>}

        {!controls.retake.enabled && mediaTrack('audio')}
        {!controls.retake.enabled && mediaTrack('motion')}
        {onUploadMedia && wired('retake') && <section aria-label="Retake" className="space-y-2">
          <div className="flex items-center gap-2 border-b border-white/10 pb-2">
            <h3 className="mr-auto text-xs font-semibold">Retake</h3>
            <label className="inline-flex items-center gap-2 text-xs"><input type="checkbox" checked={controls.retake.enabled}
              onChange={(event) => change({ retake: { ...controls.retake, enabled: event.target.checked } })} /> Enabled</label>
          </div>
          {controls.retake.enabled && <>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs" title={controls.retake.video?.imageFile}>
                {controls.retake.video?.imageFile || 'Base video required'}</span>
              <button type="button" className={toolClass} title="Upload retake video" aria-label="Upload retake video"
                disabled={!!mediaUploading} onClick={() => chooseMedia('video', 'retake')}>
                {mediaUploading === 'retake' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}</button>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {numeric('Start frame', controls.retake.start, (start) => change({ retake: { ...controls.retake, start } }), 0,
                Math.max(0, (controls.retake.video?.videoDurationFrames || frames) - 1))}
              {numeric('Length · frames', controls.retake.length, (length) => change({ retake: { ...controls.retake, length } }), 1,
                controls.retake.video?.videoDurationFrames || frames)}
              {numeric('Guide strength', controls.retake.strength, (strength) => change({ retake: { ...controls.retake, strength } }), 0, 1, 0.05)}
            </div>
            <label className="block space-y-1"><span className={labelClass}>Retake prompt</span>
              <textarea className={`${inputClass} min-h-16 resize-y`} value={controls.retake.prompt}
                onChange={(event) => change({ retake: { ...controls.retake, prompt: event.target.value } })} /></label>
            {controls.retake.prompt.includes('|') && <p role="alert" className="text-xs text-red-300">The pipe character is not allowed in retake prompts.</p>}
            {controls.retake.start + controls.retake.length > frames && <p role="alert" className="text-xs text-red-300">Retake exceeds requested frames.</p>}
            {controls.retake.video && controls.retake.start + controls.retake.length > controls.retake.video.videoDurationFrames
              && <p role="alert" className="text-xs text-red-300">Retake exceeds base video duration.</p>}
            {controls.retake.video && !isLtx23ComfyInputName(controls.retake.video.imageFile)
              && <p role="alert" className="text-xs text-red-300">Unsafe staged retake video path.</p>}
            {mediaError?.target === 'retake' && <p role="alert" className="text-xs text-red-300">{mediaError.message}</p>}
          </>}
        </section>}

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
                (value) => change({ tiledDecode: { ...controls.tiledDecode, [key]: value } }),
                key === 'temporalTileSize' ? 2 : key.includes('Overlap') ? 0 : 1,
                key === 'temporalTileSize' ? 1000 : 8)}</React.Fragment>)}</div>}
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
        {wired('tritonVae') && <section aria-label="Triton VAE" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Triton VAE</h3>
          {boolean('Patch Triton VAE', controls.tritonVae.enabled,
            (enabled) => change({ tritonVae: { ...controls.tritonVae, enabled } }))}
          {controls.tritonVae.enabled && <div className="flex flex-wrap gap-x-5 gap-y-2">
            {boolean('Fuse norm + SiLU', controls.tritonVae.fuseNormSilu,
              (fuseNormSilu) => change({ tritonVae: { ...controls.tritonVae, fuseNormSilu } }))}
            {boolean('Channels last', controls.tritonVae.channelsLast,
              (channelsLast) => change({ tritonVae: { ...controls.tritonVae, channelsLast } }))}
            <label className="inline-flex items-center gap-2 text-xs text-zinc-500" title="Unavailable for the LTX VAE">
              <input type="checkbox" checked={false} disabled readOnly /> INT8 conv
            </label>
            {boolean('Autotune', controls.tritonVae.autotune,
              (autotune) => change({ tritonVae: { ...controls.tritonVae, autotune } }))}
          </div>}
        </section>}
        {wired('samplingPreview') && <section aria-label="Sampling preview" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Sampling preview</h3>
          {boolean('Preview override', controls.samplingPreview.enabled,
            (enabled) => change({ samplingPreview: { ...controls.samplingPreview, enabled } }))}
          {controls.samplingPreview.enabled && <div className="grid gap-2 sm:grid-cols-2">
            {resource('Preview VAE', controls.samplingPreview.previewVae, catalog.previewVaes,
              (previewVae) => change({ samplingPreview: { ...controls.samplingPreview, previewVae } }))}
            {numeric('Preview rate', controls.samplingPreview.previewRate,
              (previewRate) => change({ samplingPreview: { ...controls.samplingPreview, previewRate } }), 1, 60)}
          </div>}
        </section>}
        {wired('colorTransfer') && <section aria-label="Color transfer" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Color transfer</h3>
          {boolean('Enable color transfer', controls.colorTransfer.enabled,
            (enabled) => change({ colorTransfer: { ...controls.colorTransfer, enabled } }), !colorReference)}
          <div className="truncate text-xs text-zinc-500" title={colorReference}>
            Reference: {colorReference || 'Stage an image on the main timeline'}</div>
          {controls.colorTransfer.enabled && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resource('Method', controls.colorTransfer.method, ['reinhard_lab', 'mkl_lab', 'histogram'],
              (method) => change({ colorTransfer: { ...controls.colorTransfer,
                method: method as Ltx23OmniForgeControls['colorTransfer']['method'] } }))}
            {resource('Source stats', controls.colorTransfer.sourceStats, ['per_frame', 'uniform', 'target_frame'],
              (sourceStats) => change({ colorTransfer: { ...controls.colorTransfer,
                sourceStats: sourceStats as Ltx23OmniForgeControls['colorTransfer']['sourceStats'] } }))}
            {controls.colorTransfer.sourceStats === 'target_frame' && numeric('Target frame', controls.colorTransfer.targetIndex,
              (targetIndex) => change({ colorTransfer: { ...controls.colorTransfer, targetIndex } }), 0, Math.max(0, frames - 1))}
            {numeric('Strength', controls.colorTransfer.strength,
              (strength) => change({ colorTransfer: { ...controls.colorTransfer, strength } }), 0, 10, 0.01)}
          </div>}
        </section>}
        {wired('watermarks') && <section aria-label="Watermarks" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Watermarks</h3>
          {controls.watermarks.map((mark, index) => <div key={index} className="space-y-2 border-b border-white/10 py-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-xs font-semibold">Watermark {index + 1}</span>
              {boolean('Enabled', mark.enabled, (enabled) => changeWatermark(index, { enabled }))}
            </div>
            {mark.enabled && <>
              <div className="flex items-center gap-2">
                {mark.previewUrl && <img src={mark.previewUrl} alt="" className="h-10 w-14 shrink-0 rounded object-contain" />}
                <span className="min-w-0 flex-1 truncate text-xs" title={mark.imageName}>{mark.imageName || 'Watermark image required'}</span>
                <button type="button" className={toolClass} title="Upload watermark" aria-label="Upload watermark"
                  disabled={!!uploading} onClick={() => chooseImage(`watermark:${index}`)}>
                  {uploading === `watermark:${index}` ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}</button>
                {mark.imageName && <button type="button" className={toolClass} title="Clear watermark" aria-label="Clear watermark"
                  onClick={() => changeWatermark(index, { imageName: '', sourcePath: undefined, previewUrl: undefined })}><X size={14} /></button>}
              </div>
              {mark.imageName && !isLtx23ComfyInputName(mark.imageName)
                && <p role="alert" className="text-xs text-red-300">Unsafe staged watermark path.</p>}
              {!mark.imageName && <p role="alert" className="text-xs text-red-300">Upload a watermark image before generating.</p>}
              {uploadError?.target === `watermark:${index}` && <p role="alert" className="text-xs text-red-300">{uploadError.message}</p>}
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {resource('Position', mark.position, ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'center'],
                  (position) => changeWatermark(index, { position: position as Ltx23Watermark['position'] }))}
                {resource('Resampling', mark.resampling, ['bicubic', 'bilinear', 'nearest', 'area', 'nearest-exact'],
                  (resampling) => changeWatermark(index, { resampling: resampling as Ltx23Watermark['resampling'] }))}
                {numeric('Scale', mark.scale, (scale) => changeWatermark(index, { scale }), 0.01, 1, 0.01)}
                {numeric('Transparency', mark.transparency, (transparency) => changeWatermark(index, { transparency }), 0, 1, 0.01)}
                {numeric('Rotation', mark.rotation, (rotation) => changeWatermark(index, { rotation }), 0, 359)}
                {numeric('Padding X', mark.paddingX, (paddingX) => changeWatermark(index, { paddingX }), 0, 4096)}
                {numeric('Padding Y', mark.paddingY, (paddingY) => changeWatermark(index, { paddingY }), 0, 4096)}
                {mark.opticalPadding && numeric('Optical strength', mark.opticalStrength,
                  (opticalStrength) => changeWatermark(index, { opticalStrength }), 0, 1, 0.05)}
                {mark.randomizePosition && numeric('Position switches', mark.randomSwitches,
                  (randomSwitches) => changeWatermark(index, { randomSwitches }), 1, 64)}
                {mark.randomizePosition && numeric('Random seed', mark.randomSeed,
                  (randomSeed) => changeWatermark(index, { randomSeed }), 0, 2_147_483_647)}
                {mark.fade && numeric('Fade margin', mark.fadeMargin,
                  (fadeMargin) => changeWatermark(index, { fadeMargin }), 0.01, 0.5, 0.01)}
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2">
                {boolean('Optical padding', mark.opticalPadding,
                  (opticalPadding) => changeWatermark(index, { opticalPadding }))}
                {boolean('Randomize position', mark.randomizePosition,
                  (randomizePosition) => changeWatermark(index, { randomizePosition }))}
                {boolean('Fade', mark.fade, (fade) => changeWatermark(index, { fade }))}
              </div>
            </>}
          </div>)}
        </section>}
        {wired('resize') && <section aria-label="Post resize" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Post resize</h3>
          {boolean('DaSiWa Torch Resize', controls.resize.enabled, (enabled) => changeResize({ enabled }))}
          {controls.resize.enabled && <>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {resource('Size mode', controls.resize.sizeMode, ['Multiplier', 'Target resolution'],
                (sizeMode) => changeResize({ sizeMode: sizeMode as Ltx23OmniForgeResize['sizeMode'] }))}
              {controls.resize.sizeMode === 'Target resolution' && resource('Aspect mode', controls.resize.aspectMode,
                ['Stretch', 'Fit', 'Fill and crop', 'Fit and pad', 'Long side with divisible crop'],
                (aspectMode) => changeResize({ aspectMode: aspectMode as Ltx23OmniForgeResize['aspectMode'] }))}
              {controls.resize.sizeMode === 'Multiplier'
                ? numeric('Scale multiplier', controls.resize.scaleMultiplier, (scaleMultiplier) => changeResize({ scaleMultiplier }), 0.01, 16, 0.01)
                : <>
                  {numeric('Target width', controls.resize.targetWidth, (targetWidth) => changeResize({ targetWidth }), 1, 16_384)}
                  {numeric('Target height', controls.resize.targetHeight, (targetHeight) => changeResize({ targetHeight }), 1, 16_384)}
                </>}
              {resource('Interpolation', controls.resize.interpolation, ['Nearest', 'Bilinear', 'Bicubic', 'Area', 'Lanczos'],
                (interpolation) => changeResize({ interpolation: interpolation as Ltx23OmniForgeResize['interpolation'] }))}
              {numeric('Divisible by', controls.resize.divisibleBy, (divisibleBy) => changeResize({ divisibleBy }), 1, 4096)}
              {resource('Crop position', controls.resize.cropPosition,
                ['center', 'top-left', 'top', 'top-right', 'left', 'right', 'bottom-left', 'bottom', 'bottom-right'],
                (cropPosition) => changeResize({ cropPosition }))}
              <label className="min-w-0 space-y-1"><span className={labelClass}>Pad color</span>
                <input className={inputClass} value={controls.resize.padColor}
                  onChange={(event) => changeResize({ padColor: event.target.value })} /></label>
              {numeric('Batch size', controls.resize.batchSize, (batchSize) => changeResize({ batchSize }), 0, 4096)}
              {numeric('Max batch MP', controls.resize.maxBatchMegapixels,
                (maxBatchMegapixels) => changeResize({ maxBatchMegapixels }), 0.25, 512, 0.25)}
              {numeric('Cache size', controls.resize.cacheSize, (cacheSize) => changeResize({ cacheSize }), 1, 512)}
            </div>
            {boolean('Gamma correct', controls.resize.gammaCorrect, (gammaCorrect) => changeResize({ gammaCorrect }))}
          </>}
        </section>}
        {wired('modelUpscale') && <section aria-label="Model upscale" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">Model upscale</h3>
          {boolean('Upscale with model', controls.modelUpscale.enabled, (enabled) => changeModelUpscale({ enabled }))}
          {controls.modelUpscale.enabled && <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {resource('Upscale model', controls.modelUpscale.modelName, catalog.upscaleModels,
              (modelName) => changeModelUpscale({ modelName }))}
            {numeric('Max batch size', controls.modelUpscale.maxBatchSize,
              (maxBatchSize) => changeModelUpscale({ maxBatchSize }), 0, 4096)}
            {numeric('Tile size', controls.modelUpscale.tileSize, (tileSize) => changeModelUpscale({ tileSize }), 0, 8192)}
            {resource('Precision', controls.modelUpscale.precision, ['fp32', 'fp16', 'bf16'],
              (precision) => changeModelUpscale({ precision: precision as Ltx23OmniForgeModelUpscale['precision'] }))}
            {boolean('Channels last', controls.modelUpscale.channelsLast,
              (channelsLast) => changeModelUpscale({ channelsLast }))}
          </div>}
          {controls.modelUpscale.enabled && !controls.modelUpscale.modelName
            && <p role="alert" className="text-xs text-red-300">Choose an upscale model before generating.</p>}
        </section>}
        {wired('rtx') && <section aria-label="RTX upscale and refine" className="space-y-2">
          <h3 className="border-b border-white/10 pb-2 text-xs font-semibold">RTX upscale and refine</h3>
          {boolean('DaSiWa RTX', controls.rtx.enabled, (enabled) => changeRtx({ enabled }))}
          {controls.rtx.enabled && <>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {boolean('Denoise', controls.rtx.denoise, (denoise) => changeRtx({ denoise }))}
              {boolean('Deblur', controls.rtx.deblur, (deblur) => changeRtx({ deblur }))}
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {controls.rtx.denoise && resource('Denoise quality', controls.rtx.denoiseQuality, ['Low', 'Medium', 'High', 'Ultra'],
                (denoiseQuality) => changeRtx({ denoiseQuality: denoiseQuality as Ltx23OmniForgeRtx['denoiseQuality'] }))}
              {controls.rtx.deblur && resource('Deblur quality', controls.rtx.deblurQuality, ['Low', 'Medium', 'High', 'Ultra'],
                (deblurQuality) => changeRtx({ deblurQuality: deblurQuality as Ltx23OmniForgeRtx['deblurQuality'] }))}
              {resource('Upscale', controls.rtx.upscale, ['Off', 'VSR', 'High Bitrate'],
                (upscale) => changeRtx({ upscale: upscale as Ltx23OmniForgeRtx['upscale'] }))}
              {controls.rtx.upscale !== 'Off' && resource('Upscale quality', controls.rtx.upscaleQuality,
                ['Low', 'Medium', 'High', 'Ultra'],
                (upscaleQuality) => changeRtx({ upscaleQuality: upscaleQuality as Ltx23OmniForgeRtx['upscaleQuality'] }))}
              {resource('Resize type', controls.rtx.resizeType,
                ['Keep Ratio', 'Manual', 'Preset Ratio', 'Scale', 'Same Size'],
                (resizeType) => changeRtx({ resizeType: resizeType as Ltx23OmniForgeRtx['resizeType'] }))}
              {controls.rtx.resizeType === 'Scale' && numeric('Scale', controls.rtx.scale,
                (scale) => changeRtx({ scale }), 1, 4, 0.05)}
              {['Keep Ratio', 'Preset Ratio'].includes(controls.rtx.resizeType) && numeric('Megapixels', controls.rtx.megapixels,
                (megapixels) => changeRtx({ megapixels }), 0.01, 64, 0.01)}
              {controls.rtx.resizeType === 'Manual' && <>
                {numeric('Width', controls.rtx.width, (width) => changeRtx({ width }), 64, 8192, 8)}
                {numeric('Height', controls.rtx.height, (height) => changeRtx({ height }), 64, 8192, 8)}
              </>}
              {controls.rtx.resizeType === 'Preset Ratio' && resource('Ratio preset', controls.rtx.ratioPreset,
                ['1:1', '4:3', '3:2', '16:9', '21:9'],
                (ratioPreset) => changeRtx({ ratioPreset: ratioPreset as Ltx23OmniForgeRtx['ratioPreset'] }))}
              {resource('Divisible by', controls.rtx.divisibleBy, ['8', '16', '32', '64', '128'],
                (divisibleBy) => changeRtx({ divisibleBy: divisibleBy as Ltx23OmniForgeRtx['divisibleBy'] }))}
              {resource('Resize method', controls.rtx.resizeMethod, ['Center Crop (Fill)', 'Letterbox (Fit)'],
                (resizeMethod) => changeRtx({ resizeMethod: resizeMethod as Ltx23OmniForgeRtx['resizeMethod'] }))}
              {numeric('GPU device', controls.rtx.deviceId, (deviceId) => changeRtx({ deviceId }), 0, 8)}
              {controls.rtx.chunking && numeric('Chunk frames', controls.rtx.chunkFrames,
                (chunkFrames) => changeRtx({ chunkFrames }), 1, 1024)}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {boolean('Empty cache', controls.rtx.emptyCache, (emptyCache) => changeRtx({ emptyCache }))}
              {boolean('Use mmap', controls.rtx.useMmap, (useMmap) => changeRtx({ useMmap }))}
              {boolean('Auto-unload models', controls.rtx.autoUnloadModels,
                (autoUnloadModels) => changeRtx({ autoUnloadModels }))}
              {boolean('Chunking', controls.rtx.chunking, (chunking) => changeRtx({ chunking }))}
              {boolean('Lossless FP16', controls.rtx.losslessFp16, (losslessFp16) => changeRtx({ losslessFp16 }))}
            </div>
          </>}
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
      <input ref={mediaRef} className="hidden" type="file" aria-label="Director media file"
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadMedia(file); }} />
    </aside>
  );
}

export default UmbraLtxOmniForgePanel;
