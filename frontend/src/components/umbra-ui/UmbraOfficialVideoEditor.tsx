'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Film, Image as ImageIcon, Loader2, Music2, Plus, SlidersHorizontal, Sparkles, Trash2, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { normalizePowerPrompterGenerationControls } from '@/lib/powerPrompter';
import { UmbraH3PromptForgeModal } from './UmbraH3PromptForgeModal';
import { UmbraOfficialH3DirectorControls } from './UmbraOfficialH3DirectorControls';
import { UmbraOfficialLtxDirectorControls } from './UmbraOfficialLtxDirectorControls';
import { UmbraOfficialVideoLoraControls } from './UmbraOfficialVideoLoraControls';
import { readOfficialLtxDirectorSettings } from '../../../../shared/umbra-ui/officialLtxDirector';
import { hasOfficialH3Continuity, readOfficialH3DirectorSettings } from '../../../../shared/umbra-ui/officialH3Director';
import { DEFAULT_OFFICIAL_H3_RESOLUTION, getOfficialVideoEditorFields, OFFICIAL_H3_ASPECTS, OFFICIAL_H3_INPUT_SCALING, OFFICIAL_H3_RESOLUTIONS, OFFICIAL_VIDEO_EDITOR_MODES, OFFICIAL_VIDEO_SETTINGS_CATEGORIES, type OfficialH3ResolutionSettings, type OfficialVideoEditorDraft } from '../../../../shared/umbra-ui/officialVideoEditor';
import type { OfficialVideoWorkflowId } from '../../../../shared/umbra-ui/officialVideoWorkflow';

interface Props {
  workflowId: OfficialVideoWorkflowId;
  source: Record<string, unknown>;
  catalog: Record<string, unknown>;
  draft: OfficialVideoEditorDraft;
  onChange: (draft: OfficialVideoEditorDraft) => void;
  disabled: boolean;
  comfyConnected: boolean;
  preview: React.ReactNode;
  onMediaBusyChange: (busy: boolean) => void;
}

const inputClass = 'min-h-9 w-full min-w-0 rounded border border-white/15 bg-black/25 px-2 py-1.5 text-xs text-[var(--umbra-text)] outline-none focus:border-[var(--umbra-accent)] disabled:opacity-40';
const iconClass = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 text-zinc-300 hover:bg-white/5 disabled:opacity-30';
const labelClass = 'text-[11px] text-zinc-400';

export function UmbraOfficialVideoEditor({ workflowId, source, catalog, draft, onChange, disabled, comfyConnected, preview, onMediaBusyChange }: Props) {
  const [forgeOpen, setForgeOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsTrigger = React.useRef<HTMLButtonElement>(null);
  const settingsDialog = React.useRef<HTMLElement>(null);
  const settingsId = React.useId();
  const [uploading, setUploading] = React.useState('');
  const [uploadError, setUploadError] = React.useState('');
  const fileInput = React.useRef<HTMLInputElement>(null);
  const uploadKind = React.useRef<'image' | 'video' | 'audio'>('image');
  const latest = React.useRef(draft);
  const uploadAbort = React.useRef<AbortController | null>(null);
  latest.current = draft;
  React.useEffect(() => () => { if (uploadAbort.current) { uploadAbort.current.abort(); onMediaBusyChange(false); } }, [onMediaBusyChange]);
  React.useEffect(() => {
    if (!settingsOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : settingsTrigger.current;
    settingsDialog.current?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [settingsOpen]);
  const h3 = workflowId === 'h3-26';
  const h3Settings = draft.h3 || readOfficialH3DirectorSettings({});
  const ltxSettings = draft.ltx || readOfficialLtxDirectorSettings({});
  const continuing = h3 && hasOfficialH3Continuity(h3Settings);
  const activePrompt = continuing ? h3Settings.continuity.nextPrompt : draft.prompt;
  const changePrompt = (prompt: string) => continuing
    ? change({ h3: { ...h3Settings, continuity: { ...h3Settings.continuity, nextPrompt: prompt } } }) : change({ prompt });
  const fields = getOfficialVideoEditorFields(source, workflowId, catalog);
  const settingsSections = OFFICIAL_VIDEO_SETTINGS_CATEGORIES.map(category => ({ ...category,
    fields: fields.filter(field => field.group === 'generation' && field.category === category.id && !field.key.endsWith('.save_last_frame')),
  })).filter(category => category.id !== 'resolution' && (category.fields.length || category.id === 'video-output'));
  const workflowSizing = draft.resolution?.mode === 'workflow';
  const h3Resolution = { ...DEFAULT_OFFICIAL_H3_RESOLUTION, ...draft.resolution?.h3 };
  const change = (patch: Partial<OfficialVideoEditorDraft>) => onChange({ ...latest.current, ...patch });
  const changeH3Resolution = (patch: Partial<OfficialH3ResolutionSettings>) => change({ resolution: {
    ...latest.current.resolution, mode: 'workflow', h3: { ...DEFAULT_OFFICIAL_H3_RESOLUTION, ...latest.current.resolution?.h3, ...patch },
  } });
  const references = h3 ? draft.references : [...draft.references].sort((a, b) => a.startSeconds - b.startSeconds);
  const changeMode = (mode: string) => {
    const current = latest.current;
    if (!h3 && mode === 'FLF2V' && current.frameRate > 0 && current.references.length <= 2) {
      const durationSeconds = Math.max(2, Math.round(current.durationSeconds * current.frameRate)) / current.frameRate;
      change({ mode, durationSeconds, references: [...current.references].sort((a, b) => a.startSeconds - b.startSeconds)
        .map((reference, index) => ({ ...reference, startSeconds: index === 0 ? 0 : durationSeconds - 1 / current.frameRate,
          durationSeconds: 1 / current.frameRate })) });
    } else change({ mode });
  };
  const changeTiming = (patch: Partial<Pick<OfficialVideoEditorDraft, 'durationSeconds' | 'frameRate'>>) => {
    const current = latest.current;
    const next = { ...current, ...patch };
    if (!h3 && next.frameRate > 0 && next.durationSeconds > 0) {
      next.durationSeconds = Math.max(1, Math.round(next.durationSeconds * next.frameRate)) / next.frameRate;
    }
    if (!h3 && next.mode === 'FLF2V' && next.frameRate > 0 && next.durationSeconds > 0) {
      next.references = [...current.references].sort((a, b) => a.startSeconds - b.startSeconds).map((reference, index) => ({ ...reference,
        startSeconds: index === 0 ? 0 : next.durationSeconds - 1 / next.frameRate, durationSeconds: 1 / next.frameRate }));
    } else if (!h3 && patch.frameRate && patch.frameRate > 0) {
      next.references = current.references.map(reference => {
        const start = Math.round(reference.startSeconds * next.frameRate);
        const end = Math.round((reference.startSeconds + reference.durationSeconds) * next.frameRate);
        return { ...reference, startSeconds: start / next.frameRate, durationSeconds: Math.max(1, end - start) / next.frameRate };
      });
    }
    onChange(next);
  };
  const updateReference = (id: string, patch: Partial<OfficialVideoEditorDraft['references'][number]>) => {
    if (!h3 && latest.current.frameRate > 0) {
      if (typeof patch.startSeconds === 'number') patch.startSeconds = Math.round(patch.startSeconds * latest.current.frameRate) / latest.current.frameRate;
      if (typeof patch.durationSeconds === 'number') patch.durationSeconds = Math.max(1, Math.round(patch.durationSeconds * latest.current.frameRate)) / latest.current.frameRate;
    }
    change({ references: latest.current.references.map(reference => reference.id === id ? { ...reference, ...patch } : reference) });
  };
  const moveReference = (id: string, direction: number) => {
    const next = h3 ? [...latest.current.references] : [...latest.current.references].sort((a, b) => a.startSeconds - b.startSeconds);
    const index = next.findIndex(reference => reference.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    if (!h3) {
      let cursor = 0;
      for (let i = 0; i < next.length; i++) { next[i] = { ...next[i], startSeconds: cursor }; cursor += next[i].durationSeconds; }
    }
    change({ references: next });
  };
  const addMedia = async (file: File) => {
    const kind = uploadKind.current;
    const abort = new AbortController(); uploadAbort.current = abort;
    setUploading(file.name); setUploadError(''); onMediaBusyChange(true);
    try {
      const response = await fetch('/api/comfy/upload-media', { signal: abort.signal, method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-umbra-media-kind': kind,
          'x-umbra-file-name': encodeURIComponent(file.name) }, body: file });
      const result = await response.json();
      if (abort.signal.aborted) return;
      if (!response.ok || !result.filename) throw new Error(String(result.error || 'Media upload failed.'));
      const current = latest.current;
      const startSeconds = current.references.reduce((end, reference) => Math.max(end, reference.startSeconds + reference.durationSeconds), 0);
      const endpoint = current.mode === 'FLF2V';
      const reference = { id: crypto.randomUUID(), kind, filename: String(result.filename), prompt: '',
        startSeconds: h3 ? 0 : endpoint ? (current.references.length ? current.durationSeconds - 1 / current.frameRate : 0) : startSeconds,
        durationSeconds: h3 ? kind === 'image' ? 1 : Math.min(2, current.durationSeconds) : endpoint ? 1 / current.frameRate : Math.min(1, current.durationSeconds - startSeconds) };
      onChange({ ...current, references: [...current.references, reference] });
    } catch (error) { if (!abort.signal.aborted) setUploadError(error instanceof Error ? error.message : 'Media upload failed.'); }
    finally { if (uploadAbort.current === abort) uploadAbort.current = null; if (!abort.signal.aborted) { setUploading(''); onMediaBusyChange(false); if (fileInput.current) fileInput.current.value = ''; } }
  };
  const video = React.useMemo(() => {
    const controls = normalizePowerPrompterGenerationControls(null).video!;
    controls.mode = draft.mode === 'T2VA' || draft.mode === 'T2V' ? 'text_to_video' : draft.mode === 'REF2VA' ? 'reference_to_video' : 'image_to_video';
    controls.frameGuideMode = draft.mode === 'FL2VA' ? 'first_last' : 'first';
    return controls;
  }, [draft.mode]);
  const renderField = (field: (typeof fields)[number]) => {
    const value = draft.values[field.key] ?? field.value;
    const setValue = (next: string | number | boolean) => change({ values: { ...latest.current.values, [field.key]: next } });
    const fieldDisabled = disabled || (!h3 && workflowSizing && draft.resolution?.followSourceAspect === true
      && ['3600.aspect_preset_when_not_image', '3600.custom_aspect_width', '3600.custom_aspect_height'].includes(field.key));
    const wide = field.group === 'generation' && (field.type === 'text' || (field.type === 'select' && ['models', 'upscaling', 'post-processing'].includes(field.category)));
    return <label key={field.key} className={`flex min-w-0 ${wide ? 'col-span-2' : ''} ${field.type === 'boolean' ? 'items-center gap-2 self-end py-2' : 'flex-col gap-1'} ${labelClass}`}>
      {field.type === 'boolean' ? <input type="checkbox" checked={value === true} disabled={fieldDisabled} onChange={event => setValue(event.target.checked)} className="h-4 w-4 shrink-0 accent-[var(--umbra-accent)]" /> : null}
      <span className="min-w-0 break-words">{field.label}</span>
      {field.type === 'select' ? <UmbraSelectControl aria-label={field.label} value={String(value)} disabled={fieldDisabled} onChange={event => setValue(event.target.value)} className={inputClass}>
        {Array.from(new Set([String(value), ...(field.options || [])])).map(option => <option key={option} value={option}>{option || 'None'}</option>)}
      </UmbraSelectControl> : field.type === 'boolean' ? null : <input aria-label={field.label} type={field.type === 'number' ? 'number' : 'text'} value={String(value)} min={field.min} max={field.max} step={field.step} disabled={fieldDisabled}
        onChange={event => setValue(field.type === 'number' ? Number(event.target.value) : event.target.value)} className={inputClass} />}
    </label>;
  };
  const mediaAllowed = !disabled && !uploading && comfyConnected && draft.mode !== 'T2VA' && draft.mode !== 'T2V';
  return <div className="min-w-0">
    <section aria-label="Director timeline and settings" data-official-editor-section="director" className="min-w-0 space-y-3 border-b border-white/10 pb-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-xs font-semibold">Director</h3><span className="text-[10px] text-zinc-500">{references.length} references</span></div>
      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
        <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Mode<UmbraSelectControl aria-label="Director mode" value={draft.mode} disabled={disabled} onChange={event => changeMode(event.target.value)} className={inputClass}>
          {OFFICIAL_VIDEO_EDITOR_MODES[workflowId].map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </UmbraSelectControl></label>
        <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Duration (s)<input aria-label="Video duration seconds" type="number" min={1} max={h3 ? 15 : 120} step={1 / Math.max(1, draft.frameRate)} value={Number(draft.durationSeconds.toFixed(6))} disabled={disabled} onChange={event => changeTiming({ durationSeconds: Number(event.target.value) })} className={inputClass} /></label>
        <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Frame rate<input aria-label="Video frame rate" type="number" min={1} max={120} value={draft.frameRate} disabled={disabled} onChange={event => changeTiming({ frameRate: Number(event.target.value) })} className={inputClass} /></label>
        <div className="flex items-end gap-1">
          {(h3 && draft.mode === 'REF2VA' ? ['image', 'video', 'audio'] as const : draft.mode === 'V2V' ? ['video'] as const : ['image'] as const).map(kind => <button key={kind} type="button" disabled={!mediaAllowed || (['I2VA', 'L2VA'].includes(draft.mode) && references.length >= 1) || (['FL2VA', 'FLF2V'].includes(draft.mode) && references.length >= 2) || (!h3 && draft.mode !== 'FLF2V' && references.some(reference => reference.startSeconds + reference.durationSeconds >= draft.durationSeconds))} className={iconClass} aria-label={`Add Director ${kind}`} title={`Add ${kind} reference`} onClick={() => { uploadKind.current = kind; if (fileInput.current) { fileInput.current.accept = `${kind}/*`; fileInput.current.click(); } }}>
            {kind === 'image' ? <ImageIcon size={16} /> : kind === 'video' ? <Film size={16} /> : <Music2 size={16} />}
          </button>)}
          <input ref={fileInput} type="file" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) void addMedia(file); }} />
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-3">{fields.filter(field => field.group === 'director').map(renderField)}</div>
      <div aria-label="Director reference timeline" className="flex min-h-12 min-w-0 items-stretch gap-1 overflow-x-auto border-y border-white/10 bg-black/20 p-1 custom-scrollbar">
        {references.length ? references.map((reference, index) => <div key={reference.id} className="flex min-w-32 max-w-56 shrink-0 flex-col justify-center border-l-2 border-[var(--umbra-accent)] bg-white/5 px-2 py-1">
          <span className="truncate text-[11px]">{index + 1}. {reference.filename}</span><span className="text-[10px] text-zinc-400">{h3 ? reference.kind : `${reference.startSeconds.toFixed(2)} - ${(reference.startSeconds + reference.durationSeconds).toFixed(2)}s`}</span>
        </div>) : <span className="self-center px-2 text-[11px] text-zinc-500">{draft.durationSeconds}s</span>}
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {references.map((reference, index) => <article key={reference.id} aria-label={`Director reference ${index + 1}`} className="min-w-0 space-y-2 rounded border border-white/10 bg-black/15 p-2">
          <div className="flex min-w-0 items-center gap-2">
            {h3 ? <input aria-label={`Enable reference ${index + 1}`} type="checkbox" checked={reference.enabled !== false} disabled={disabled} onChange={event => updateReference(reference.id, { enabled: event.target.checked })} /> : null}
            {reference.kind === 'image' ? <img src={`/comfy/view?filename=${encodeURIComponent(reference.filename)}&type=input`} alt={`Reference ${index + 1}`} className="h-14 w-14 shrink-0 rounded object-contain" /> : reference.kind === 'video' ? <Film size={22} /> : <Music2 size={22} />}
            <span className="min-w-0 flex-1 truncate text-xs" title={reference.filename}>{reference.filename}</span>
            <button type="button" className={iconClass} disabled={disabled || index === 0 || draft.mode === 'FLF2V'} aria-label={`Move reference ${index + 1} earlier`} title="Move earlier" onClick={() => moveReference(reference.id, -1)}><ArrowUp size={14} /></button>
            <button type="button" className={iconClass} disabled={disabled || index === references.length - 1 || draft.mode === 'FLF2V'} aria-label={`Move reference ${index + 1} later`} title="Move later" onClick={() => moveReference(reference.id, 1)}><ArrowDown size={14} /></button>
            <button type="button" className={iconClass} disabled={disabled} aria-label={`Remove reference ${index + 1}`} title="Remove reference" onClick={() => change({ references: latest.current.references.filter(item => item.id !== reference.id) })}><Trash2 size={14} /></button>
          </div>
          {!h3 || reference.kind !== 'image' ? <div className="grid grid-cols-2 gap-2"><label className={labelClass}>{h3 ? 'Trim start (s)' : 'Start (s)'}<input aria-label={`Reference ${index + 1} start seconds`} type="number" min={0} step={h3 ? 0.1 : 1 / draft.frameRate} value={Number(reference.startSeconds.toFixed(6))} disabled={disabled || draft.mode === 'FLF2V'} onChange={event => updateReference(reference.id, { startSeconds: Number(event.target.value) })} className={inputClass} /></label><label className={labelClass}>Length (s)<input aria-label={`Reference ${index + 1} duration seconds`} type="number" min={h3 ? 2 : 1 / draft.frameRate} max={h3 ? 15 : draft.durationSeconds} step={h3 ? 0.1 : 1 / draft.frameRate} value={Number(reference.durationSeconds.toFixed(6))} disabled={disabled || draft.mode === 'FLF2V'} onChange={event => updateReference(reference.id, { durationSeconds: Number(event.target.value) })} className={inputClass} /></label></div> : null}
          {h3 && reference.kind === 'video' ? <label className={`block space-y-1 ${labelClass}`}>Reference stream<UmbraSelectControl aria-label={`Reference ${index + 1} stream`} value={reference.mediaMode || 'video'} disabled={disabled} className={inputClass} onChange={event => updateReference(reference.id, { mediaMode: event.target.value as typeof reference.mediaMode })}><option value="video">Video only</option><option value="audio">Audio only</option><option value="video_audio">Video and audio</option></UmbraSelectControl></label> : null}
          {!h3 ? <div className="grid grid-cols-2 gap-2"><label className={labelClass}>Guide strength<input aria-label={`Reference ${index + 1} guide strength`} className={inputClass} type="number" min={0} max={1} step={0.01} value={reference.guideStrength ?? 1} disabled={disabled} onChange={event => updateReference(reference.id, { guideStrength: Number(event.target.value) })} /></label>{reference.kind === 'video' ? <label className={labelClass}>Trim-in (s)<input aria-label={`Reference ${index + 1} trim start seconds`} className={inputClass} type="number" min={0} step={1 / draft.frameRate} value={reference.trimStartSeconds ?? 0} disabled={disabled} onChange={event => updateReference(reference.id, { trimStartSeconds: Math.round(Number(event.target.value) * draft.frameRate) / draft.frameRate })} /></label> : null}</div> : null}
          <label className={`block space-y-1 ${labelClass}`}><span>{h3 ? 'Reference direction' : 'Scene prompt'}</span><textarea aria-label={`Reference ${index + 1} prompt`} value={reference.prompt} disabled={disabled} onChange={event => updateReference(reference.id, { prompt: event.target.value })} className={`${inputClass} min-h-20 resize-y`} /></label>
        </article>)}
      </div>
      {h3 ? <UmbraOfficialH3DirectorControls settings={h3Settings} onChange={h3 => change({ h3 })} disabled={disabled} comfyConnected={comfyConnected} mode={draft.mode} width={draft.width} height={draft.height} frameRate={draft.frameRate} durationSeconds={draft.durationSeconds} onMediaBusyChange={onMediaBusyChange} onMatchSource={source => change({ width: source.width, height: source.height, mode: source.mode, frameRate: 24, resolution: { mode: 'fixed' } })} /> : null}
      {!h3 ? <UmbraOfficialLtxDirectorControls settings={ltxSettings} onChange={ltx => change({ ltx })} disabled={disabled} comfyConnected={comfyConnected} durationSeconds={draft.durationSeconds} frameRate={draft.frameRate} onMediaBusyChange={onMediaBusyChange} /> : null}
      {uploading ? <p role="status" className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 size={13} className="animate-spin" />{uploading}</p> : null}
      {uploadError ? <p role="alert" className="text-xs text-red-300">{uploadError}</p> : null}
    </section>
    <section aria-label="Video preview" data-official-editor-section="preview" className="min-h-44 min-w-0 overflow-hidden border-b border-white/10 py-3">{preview}</section>
    <div data-official-editor-section="generation" className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 py-2">
      <span className="text-[11px] text-zinc-400">{workflowSizing ? 'DaSiWa resolution' : `${draft.width} x ${draft.height}`}</span>
      <button ref={settingsTrigger} type="button" aria-label="Open video generation settings" aria-haspopup="dialog" aria-expanded={settingsOpen} aria-controls={settingsOpen ? settingsId : undefined} onClick={() => setSettingsOpen(true)} className="inline-flex min-h-9 items-center gap-2 rounded border border-white/15 px-3 text-xs text-zinc-300 hover:bg-white/5"><SlidersHorizontal size={15} />Settings</button>
    </div>
    {settingsOpen ? createPortal(<div data-umbra-modal-root="" className="fixed inset-0 z-[240] bg-black/60 text-[var(--umbra-text)]" onPointerDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
      <style>{'@keyframes umbra-video-settings-slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } }'}</style>
      <aside ref={settingsDialog} id={settingsId} role="dialog" aria-modal="true" aria-label="Video generation settings" tabIndex={-1} className="absolute inset-y-0 right-0 flex w-full flex-col border-l border-white/15 bg-[#101114] shadow-2xl outline-none motion-safe:animate-[umbra-video-settings-slide-in_200ms_ease-out] sm:max-w-[560px]" onKeyDown={event => {
        // Selection menus are portalled children and own their keyboard handling.
        if ((event.target as HTMLElement).closest('[role="menu"]')) return;
        if (event.key === 'Escape') { event.stopPropagation(); setSettingsOpen(false); }
        if (event.key !== 'Tab') return;
        const nodes = Array.from(settingsDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled)') ?? []);
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === settingsDialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === settingsDialog.current)) { event.preventDefault(); first?.focus(); }
      }}>
        <header className="flex min-h-14 shrink-0 items-center gap-2 border-b border-white/10 px-4 pt-[env(safe-area-inset-top)]"><SlidersHorizontal size={16} className="text-[var(--umbra-accent)]" /><h3 className="min-w-0 flex-1 text-sm font-semibold">Generation settings</h3><button type="button" aria-label="Close video generation settings" title="Close settings" className={iconClass} onClick={() => setSettingsOpen(false)}><X size={16} /></button></header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] custom-scrollbar">
          <section aria-label="Resolution and aspect ratio settings" className="space-y-3 border-b border-white/10 py-4">
            <h4 className="text-xs font-semibold text-zinc-200">Resolution and aspect ratio</h4>
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <label className={`col-span-2 flex min-w-0 flex-col gap-1 ${labelClass}`}>Sizing<UmbraSelectControl aria-label="Video resolution method" value={workflowSizing ? 'workflow' : 'fixed'} disabled={disabled} onChange={event => change({ resolution: { ...latest.current.resolution, mode: event.target.value as 'workflow' | 'fixed' } })} className={inputClass}><option value="workflow">DaSiWa resolution</option><option value="fixed">Fixed pixels</option></UmbraSelectControl></label>
              {workflowSizing && h3 ? <>
                <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Aspect ratio<UmbraSelectControl aria-label="H3 aspect ratio" value={h3Resolution.aspect} disabled={disabled} onChange={event => changeH3Resolution({ aspect: event.target.value })} className={inputClass}>{OFFICIAL_H3_ASPECTS.map(value => <option key={value} value={value}>{value === 'auto' ? 'Auto (reference)' : value === 'custom' ? 'Custom ratio' : value}</option>)}</UmbraSelectControl></label>
                <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Resolution<UmbraSelectControl aria-label="H3 resolution preset" value={h3Resolution.resolution} disabled={disabled} onChange={event => changeH3Resolution({ resolution: event.target.value })} className={inputClass}>{OFFICIAL_H3_RESOLUTIONS.map(value => <option key={value} value={value}>{value === 'auto' ? 'Native (768px short edge)' : value === 'custom' ? 'Custom' : value}</option>)}</UmbraSelectControl></label>
                <label className={`col-span-2 flex min-w-0 flex-col gap-1 ${labelClass}`}>Input scaling<UmbraSelectControl aria-label="H3 input scaling" value={h3Resolution.input_scaling} disabled={disabled} onChange={event => changeH3Resolution({ input_scaling: event.target.value })} className={inputClass}>{OFFICIAL_H3_INPUT_SCALING.map(value => <option key={value} value={value}>{value === 'Auto' ? 'Native (2048px short edge)' : value}</option>)}</UmbraSelectControl></label>
                {h3Resolution.aspect === 'custom' ? <>{(['custom_aspect_w', 'custom_aspect_h'] as const).map((key, index) => <label key={key} className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Ratio {index ? 'height' : 'width'}<input aria-label={`H3 aspect ${index ? 'height' : 'width'}`} type="number" min={1} max={8192} value={h3Resolution[key]} disabled={disabled} onChange={event => changeH3Resolution({ [key]: Number(event.target.value) })} className={inputClass} /></label>)}</> : null}
                {h3Resolution.resolution === 'custom' ? <><label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Custom sizing<UmbraSelectControl aria-label="H3 custom resolution mode" value={h3Resolution.custom_mode} disabled={disabled} onChange={event => changeH3Resolution({ custom_mode: event.target.value as 'mp' | 'fixed' })} className={inputClass}><option value="mp">Megapixels</option><option value="fixed">Fixed pixels</option></UmbraSelectControl></label>{h3Resolution.custom_mode === 'mp' ? <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Megapixels<input aria-label="H3 custom megapixels" type="number" min={0.01} max={64} step={0.01} value={h3Resolution.custom_mp} disabled={disabled} onChange={event => changeH3Resolution({ custom_mp: Number(event.target.value) })} className={inputClass} /></label> : null}</> : null}
              </> : null}
              {workflowSizing && !h3 ? <>
                <label className={`col-span-2 flex items-center gap-2 py-2 ${labelClass}`}><input type="checkbox" checked={draft.resolution?.followSourceAspect === true} disabled={disabled} onChange={event => change({ resolution: { ...latest.current.resolution, mode: 'workflow', followSourceAspect: event.target.checked } })} className="h-4 w-4 accent-[var(--umbra-accent)]" />Use first reference aspect ratio</label>
                {fields.filter(field => field.category === 'resolution').map(renderField)}
              </> : null}
              {!workflowSizing || (h3 && h3Resolution.resolution === 'custom' && h3Resolution.custom_mode === 'fixed') ? <>
                <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Width<input aria-label="Video width" type="number" min={64} max={4096} step={h3 ? 32 : 64} value={draft.width} disabled={disabled} onChange={event => change({ width: Number(event.target.value) })} className={inputClass} /></label>
                <label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}>Height<input aria-label="Video height" type="number" min={64} max={4096} step={h3 ? 32 : 64} value={draft.height} disabled={disabled} onChange={event => change({ height: Number(event.target.value) })} className={inputClass} /></label>
              </> : null}
            </div>
          </section>
          <section aria-label="Seed settings" className="space-y-3 border-b border-white/10 py-4"><h4 className="text-xs font-semibold text-zinc-200">Seed</h4><label className={`flex min-w-0 flex-col gap-1 ${labelClass}`}><input aria-label="Video seed" inputMode="numeric" value={draft.seed} disabled={disabled} onChange={event => change({ seed: event.target.value })} className={inputClass} /></label></section>
          <section aria-label="LoRA stack settings" className="space-y-3 border-b border-white/10 py-4"><UmbraOfficialVideoLoraControls rows={draft.loraStack || []} onChange={loraStack => change({ loraStack })} workflowId={workflowId} catalog={catalog} disabled={disabled} /></section>
          {settingsSections.map(category => <section key={category.id} aria-label={`${category.label} settings`} className="space-y-3 border-b border-white/10 py-4 last:border-b-0">
            <h4 className="text-xs font-semibold text-zinc-200">{category.label}</h4>
            <div className="grid min-w-0 grid-cols-2 gap-3">{category.id === 'video-output' ? <label className={`col-span-2 flex items-center gap-2 py-2 ${labelClass}`}><input aria-label="Save last frame" type="checkbox" checked={draft.saveLastFrame !== false} disabled={disabled} onChange={event => change({ saveLastFrame: event.target.checked })} className="h-4 w-4 accent-[var(--umbra-accent)]" />Save last frame</label> : null}{category.fields.map(renderField)}</div>
          </section>)}
        </div>
      </aside>
    </div>, document.body) : null}
    <section aria-label="Video prompt" data-official-editor-section="prompt" className="min-w-0 space-y-2 py-4">
      <label className={`block space-y-2 ${labelClass}`}><span>{continuing ? 'Continuation prompt' : 'Overall prompt'}</span><textarea aria-label="Video overall prompt" value={activePrompt} disabled={disabled} onChange={event => changePrompt(event.target.value)} className={`${inputClass} min-h-28 resize-y`} /></label>
    </section>
    {h3 ? <section aria-label="Prompt Forge" data-official-editor-section="forge" className="min-w-0 border-t border-white/10 pb-3">
      <button type="button" className="flex min-h-10 items-center gap-2 text-xs text-zinc-300 hover:text-[var(--umbra-accent)]" aria-expanded={forgeOpen} onClick={() => setForgeOpen(!forgeOpen)}><Sparkles size={15} />Prompt Forge<Plus size={13} /></button>
      {forgeOpen ? <UmbraH3PromptForgeModal inline disabled={disabled} modeOverride={draft.mode as 'T2VA' | 'I2VA' | 'FL2VA' | 'L2VA' | 'REF2VA'} video={video} prompt={activePrompt} durationSeconds={draft.durationSeconds} comfyConnected={comfyConnected} onApplyPrompt={prompt => { if (!disabled) changePrompt(prompt); }} onClose={() => setForgeOpen(false)} continuity={continuing ? { session: h3Settings.continuity.session, source_kind: h3Settings.continuity.sourceKind, clip_id: h3Settings.continuity.sourceKind === 'video' ? h3Settings.continuity.sourceVideoId : h3Settings.continuity.sourceId, overlap_frames: h3Settings.continuity.overlapFrames, current_prompt: activePrompt, use_references: h3Settings.continuity.useReferences } : undefined} referenceNotes={references.filter(reference => reference.enabled !== false && (!continuing || (draft.mode === 'REF2VA' && h3Settings.continuity.useReferences))).map(reference => ({ kind: reference.kind, ...(reference.kind === 'video' ? { stream: reference.mediaMode || 'video' } : {}), role: draft.mode === 'REF2VA' ? 'subject' : 'keyframe', keep: reference.prompt }))} /> : null}
    </section> : null}
  </div>;
}
