'use client';

import React from 'react';
import { Film, Music2, Plus, Trash2 } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import type { OfficialLtxDirectorMedia, OfficialLtxDirectorMotionSegment, OfficialLtxDirectorSegment, OfficialLtxDirectorSettings } from '../../../../shared/umbra-ui/officialLtxDirector';

interface Props {
  settings: OfficialLtxDirectorSettings;
  onChange: (settings: OfficialLtxDirectorSettings) => void;
  disabled: boolean;
  comfyConnected: boolean;
  durationSeconds: number;
  frameRate: number;
  onMediaBusyChange: (busy: boolean) => void;
}

const inputClass = 'min-h-9 w-full min-w-0 rounded border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-[var(--umbra-text)] outline-none focus:border-[var(--umbra-accent)] disabled:opacity-40';
const iconClass = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 text-zinc-300 hover:bg-white/5 disabled:opacity-30';
const labelClass = 'flex min-w-0 flex-col gap-1 text-[11px] text-zinc-400';
const VIDEO_EXTENSIONS = ['avi', 'm4v', 'mkv', 'mov', 'mp4', 'webm'];
const AUDIO_EXTENSIONS = ['aac', 'flac', 'm4a', 'mp3', 'ogg', 'opus', 'wav'];

function sourceFrames(file: File, kind: 'video' | 'audio', frameRate: number, signal: AbortSignal): Promise<number> {
  return new Promise((resolve, reject) => {
    const element = document.createElement(kind);
    const url = URL.createObjectURL(file);
    let settled = false;
    const cleanup = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      element.onloadedmetadata = null;
      element.onerror = null;
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    };
    const finish = (frames?: number, error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(frames!);
    };
    const abort = () => finish(undefined, new DOMException('Media selection cancelled.', 'AbortError'));
    const timeout = window.setTimeout(() => finish(undefined, new Error('Media duration could not be read within 10 seconds.')), 10000);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    element.preload = 'metadata';
    element.onloadedmetadata = () => {
      const duration = element.duration;
      if (!Number.isFinite(duration) || duration <= 0) finish(undefined, new Error('Could not read media duration.'));
      else finish(Math.max(1, Math.ceil(duration * frameRate)));
    };
    element.onerror = () => finish(undefined, new Error('Could not read media duration.'));
    try { element.src = url; }
    catch { finish(undefined, new Error('Could not open media for duration inspection.')); }
  });
}

function NumberField({ label, value, min, max, step = 1, disabled, onChange }: {
  label: string; value: number; min: number; max?: number; step?: number; disabled: boolean; onChange: (value: number) => void;
}) {
  return <label className={labelClass}>{label}<input aria-label={label} className={inputClass} type="number" min={min} max={max} step={step}
    value={value} disabled={disabled} onChange={event => onChange(Number(event.target.value))} /></label>;
}

export function UmbraOfficialLtxDirectorControls({ settings, onChange, disabled, comfyConnected, durationSeconds, frameRate, onMediaBusyChange }: Props) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const latest = React.useRef(settings);
  latest.current = settings;
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const onMediaBusyRef = React.useRef(onMediaBusyChange);
  onMediaBusyRef.current = onMediaBusyChange;
  const mounted = React.useRef(true);
  const activeUpload = React.useRef<AbortController | null>(null);
  const reportedBusy = React.useRef(false);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      activeUpload.current?.abort();
      activeUpload.current = null;
      if (reportedBusy.current) { reportedBusy.current = false; onMediaBusyRef.current(false); }
    };
  }, []);
  const totalFrames = Math.max(1, Math.round(durationSeconds * frameRate));
  const locked = disabled || busy;
  const laneLocked = locked || settings.retake.enabled;
  const patch = (next: Partial<OfficialLtxDirectorSettings>) => onChange({ ...latest.current, ...next });
  const patchRetake = (next: Partial<OfficialLtxDirectorSettings['retake']>) => patch({ retake: { ...latest.current.retake, ...next } });
  const patchMotion = (next: Partial<OfficialLtxDirectorSettings['motion']>) => patch({ motion: { ...latest.current.motion, ...next } });
  const patchAudio = (next: Partial<OfficialLtxDirectorSettings['audio']>) => patch({ audio: { ...latest.current.audio, ...next } });
  const editMotion = (id: string, next: Partial<OfficialLtxDirectorMotionSegment>) => patchMotion({ segments: latest.current.motion.segments.map(item => item.id === id ? { ...item, ...next } : item) });
  const editAudio = (id: string, next: Partial<OfficialLtxDirectorSegment>) => patchAudio({ segments: latest.current.audio.segments.map(item => item.id === id ? { ...item, ...next } : item) });

  const upload = async (file: File, destination: 'retake' | 'motion' | 'audio' | 'audioVideo') => {
    if (!mounted.current || activeUpload.current || (destination !== 'retake' && latest.current.retake.enabled)) return;
    const kind = destination === 'audio' ? 'audio' : 'video';
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!(kind === 'audio' ? AUDIO_EXTENSIONS : VIDEO_EXTENSIONS).includes(extension)) { setError(`Unsupported ${kind} file.`); return; }
    if (!Number.isInteger(frameRate) || frameRate < 1 || frameRate > 240) { setError('Set a valid frame rate before adding media.'); return; }
    const controller = new AbortController();
    activeUpload.current = controller;
    setBusy(true); setError('');
    reportedBusy.current = true;
    onMediaBusyRef.current(true);
    try {
      const durationFrames = await sourceFrames(file, kind, frameRate, controller.signal);
      if (durationFrames > 10000) throw new Error('Media exceeds the 10,000-frame Director limit.');
      const response = await fetch('/api/comfy/upload-media', { method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-umbra-media-kind': kind,
          'x-umbra-file-name': encodeURIComponent(file.name) }, body: file, signal: controller.signal });
      const result = await response.json();
      if (!mounted.current || controller.signal.aborted || activeUpload.current !== controller) return;
      if (!response.ok || typeof result.filename !== 'string' || !result.filename) throw new Error(String(result.error || 'Media upload failed.'));
      const media: OfficialLtxDirectorMedia = { filename: result.filename, durationFrames, fileSize: file.size };
      const current = latest.current;
      if (destination === 'retake') {
        const lengthFrames = Math.max(1, Math.round(durationFrames / 2));
        onChangeRef.current({ ...current, retake: { ...current.retake, enabled: true, video: media,
          startFrame: Math.floor((durationFrames - lengthFrames) / 2), lengthFrames,
          windowStartFrame: 0, windowLengthFrames: durationFrames } });
      } else {
        const lane = destination === 'motion' ? current.motion.segments : current.audio.segments;
        const startFrame = lane.reduce((end, item) => Math.max(end, item.startFrame + item.lengthFrames), 0);
        if (startFrame >= totalFrames) throw new Error('The lane is full. Move or shorten a clip first.');
        const clip = { ...media, id: crypto.randomUUID(), startFrame, lengthFrames: Math.min(durationFrames, totalFrames - startFrame), trimStartFrame: 0 };
        if (destination === 'motion') onChangeRef.current({ ...current, motion: { ...current.motion, enabled: true, segments: [...current.motion.segments,
          { ...clip, strength: 1, attentionStrength: 0.65, resampleMode: 'nearest' }] } });
        else onChangeRef.current({ ...current, audio: { ...current.audio, enabled: true, overrideMotion: false,
          segments: [...current.audio.segments, clip] } });
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Media upload failed.');
    } finally {
      if (activeUpload.current === controller) {
        activeUpload.current = null;
        if (mounted.current) setBusy(false);
        if (reportedBusy.current) { reportedBusy.current = false; onMediaBusyRef.current(false); }
      }
    }
  };

  const uploadButton = (destination: 'retake' | 'motion' | 'audio' | 'audioVideo') => <label className={`${iconClass} ${locked || !comfyConnected || (destination !== 'retake' && settings.retake.enabled) ? 'opacity-30' : 'cursor-pointer'}`}
    title={destination === 'audioVideo' ? 'Add video audio to audio track' : `Add ${destination} ${destination === 'audio' ? 'audio' : 'video'}`} aria-label={`Add ${destination} media`}>
    {destination === 'audioVideo' ? <Film size={15} /> : <Plus size={15} />}<input type="file" className="hidden" accept={destination === 'audio' ? 'audio/*,.aac,.flac,.m4a,.mp3,.ogg,.opus,.wav' : 'video/*,.avi,.m4v,.mkv,.mov,.mp4,.webm'}
      disabled={locked || !comfyConnected || (destination !== 'retake' && settings.retake.enabled)} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, destination); }} />
  </label>;

  return <section aria-label="LTX advanced Director" className="min-w-0 space-y-2 border-b border-white/10 pb-4">
    <h3 className="text-xs font-semibold">LTX Director</h3>
    {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
    {settings.retake.enabled ? <p className="text-[11px] text-zinc-400">Retake uses base video audio; motion and audio lanes are paused.</p> : null}
    <details className="border-t border-white/10 pt-2"><summary className="cursor-pointer text-xs font-medium">Retake</summary>
      <div className="mt-3 space-y-3">
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.retake.enabled} disabled={locked || !settings.retake.video}
          onChange={event => patchRetake({ enabled: event.target.checked })} />Retake mode</label>
        <div className="flex min-w-0 items-center gap-2 text-xs"><Film size={16} className="shrink-0" /><span className="min-w-0 flex-1 truncate" title={settings.retake.video?.filename}>{settings.retake.video?.filename || 'No base video'}</span>
          {uploadButton('retake')}{settings.retake.video ? <button type="button" className={iconClass} disabled={locked} title="Remove retake video" aria-label="Remove retake video"
            onClick={() => patchRetake({ enabled: false, video: null })}><Trash2 size={15} /></button> : null}</div>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <NumberField label="Retake start (frames)" value={settings.retake.startFrame} min={0} disabled={locked} onChange={startFrame => patchRetake({ startFrame })} />
          <NumberField label="Retake length (frames)" value={settings.retake.lengthFrames} min={1} disabled={locked} onChange={lengthFrames => patchRetake({ lengthFrames })} />
          <NumberField label="Generate from frame" value={settings.retake.windowStartFrame} min={0} disabled={locked} onChange={windowStartFrame => patchRetake({ windowStartFrame })} />
          <NumberField label="Generate length (frames)" value={settings.retake.windowLengthFrames} min={1} disabled={locked} onChange={windowLengthFrames => patchRetake({ windowLengthFrames })} />
          <NumberField label="Retake strength" value={settings.retake.strength} min={0} max={1} step={0.01} disabled={locked} onChange={strength => patchRetake({ strength })} />
        </div>
        <label className={labelClass}>Retake prompt<input className={inputClass} value={settings.retake.prompt} disabled={locked}
          onChange={event => patchRetake({ prompt: event.target.value })} /></label>
        <label className={labelClass}>Retake global prompt<input className={inputClass} value={settings.retake.globalPrompt} disabled={locked}
          onChange={event => patchRetake({ globalPrompt: event.target.value })} /></label>
      </div>
    </details>
    <details className="border-t border-white/10 pt-2"><summary className="cursor-pointer text-xs font-medium">Motion / IC-LoRA</summary>
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-2"><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={settings.motion.enabled} disabled={laneLocked}
          onChange={event => { const enabled = event.target.checked; const audio = latest.current.audio; patch({ motion: { ...latest.current.motion, enabled },
            audio: enabled || !audio.overrideMotion ? audio : { ...audio, overrideMotion: false, enabled: audio.enabledBeforeOverride, enabledBeforeOverride: false } }); }} />Enable motion track</label>{uploadButton('motion')}</div>
        {settings.motion.segments.map((item, index) => <div key={item.id} className="space-y-2 border-t border-white/10 pt-2">
          <div className="flex min-w-0 items-center gap-2 text-xs"><Film size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate" title={item.filename}>{index + 1}. <span data-i18n-skip="">{item.filename}</span></span>
            <button type="button" className={iconClass} disabled={laneLocked} title="Remove motion clip" aria-label={`Remove motion clip ${index + 1}`}
              onClick={() => { const current = latest.current; const segments = current.motion.segments.filter(clip => clip.id !== item.id);
                const audio = current.audio; patch({ motion: { ...current.motion, segments }, audio: segments.length || !audio.overrideMotion ? audio
                  : { ...audio, overrideMotion: false, enabled: audio.enabledBeforeOverride, enabledBeforeOverride: false } }); }}><Trash2 size={15} /></button></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <NumberField label="Motion start (frames)" value={item.startFrame} min={0} disabled={laneLocked} onChange={startFrame => editMotion(item.id, { startFrame })} />
            <NumberField label="Motion length (frames)" value={item.lengthFrames} min={1} disabled={laneLocked} onChange={lengthFrames => editMotion(item.id, { lengthFrames })} />
            <NumberField label="Motion trim-in (frames)" value={item.trimStartFrame} min={0} disabled={laneLocked} onChange={trimStartFrame => editMotion(item.id, { trimStartFrame })} />
            <NumberField label="Motion strength" value={item.strength} min={0} max={1} step={0.01} disabled={laneLocked} onChange={strength => editMotion(item.id, { strength })} />
            <NumberField label="Attention strength" value={item.attentionStrength} min={0} max={1} step={0.01} disabled={laneLocked} onChange={attentionStrength => editMotion(item.id, { attentionStrength })} />
            <label className={labelClass}>Frame sampling<UmbraSelectControl aria-label={`Motion clip ${index + 1} frame sampling`} className={inputClass} value={item.resampleMode} disabled={laneLocked}
              onChange={event => editMotion(item.id, { resampleMode: event.target.value as 'nearest' | 'linear' })}><option value="nearest">Nearest</option><option value="linear">Linear</option></UmbraSelectControl></label>
          </div>
        </div>)}
      </div>
    </details>
    <details className="border-t border-white/10 pt-2"><summary className="cursor-pointer text-xs font-medium">Audio</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex flex-wrap gap-3 text-xs">
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.audio.enabled} disabled={laneLocked || settings.audio.overrideMotion}
            onChange={event => patchAudio({ enabled: event.target.checked })} />Enable audio track</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.audio.inpaint} disabled={locked}
            onChange={event => patchAudio({ inpaint: event.target.checked })} />Inpaint gaps</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.audio.overrideMotion} disabled={laneLocked || !settings.motion.enabled || !settings.motion.segments.length}
            onChange={event => { const overrideMotion = event.target.checked; patchAudio({ overrideMotion,
              enabledBeforeOverride: overrideMotion ? latest.current.audio.enabled : false,
              enabled: overrideMotion ? false : latest.current.audio.enabledBeforeOverride }); }} />Use motion video audio</label>
        </div><div className="flex gap-1">{uploadButton('audio')}{uploadButton('audioVideo')}</div></div>
        {settings.audio.segments.map((item, index) => <div key={item.id} className="space-y-2 border-t border-white/10 pt-2">
          <div className="flex min-w-0 items-center gap-2 text-xs"><Music2 size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate" title={item.filename}>{index + 1}. <span data-i18n-skip="">{item.filename}</span></span>
            <button type="button" className={iconClass} disabled={laneLocked} title="Remove audio clip" aria-label={`Remove audio clip ${index + 1}`}
              onClick={() => patchAudio({ segments: latest.current.audio.segments.filter(clip => clip.id !== item.id) })}><Trash2 size={15} /></button></div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
            <NumberField label="Audio start (frames)" value={item.startFrame} min={0} disabled={laneLocked} onChange={startFrame => editAudio(item.id, { startFrame })} />
            <NumberField label="Audio length (frames)" value={item.lengthFrames} min={1} disabled={laneLocked} onChange={lengthFrames => editAudio(item.id, { lengthFrames })} />
            <NumberField label="Audio trim-in (frames)" value={item.trimStartFrame} min={0} disabled={laneLocked} onChange={trimStartFrame => editAudio(item.id, { trimStartFrame })} />
          </div>
        </div>)}
      </div>
    </details>
  </section>;
}
