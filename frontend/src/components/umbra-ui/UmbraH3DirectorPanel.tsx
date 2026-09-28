'use client';

import React from 'react';
import { ArrowDown, ArrowUp, Download, FolderOpen, FolderUp, Image as ImageIcon, Loader2, Music2, Plus, RefreshCw, Sparkles, Trash2, Video, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { UmbraH3ContinuitySessionModal } from './UmbraH3ContinuitySessionModal';
import { ensureUmbraUiQueuedMedia } from '@/lib/umbraUiQueuedMedia';
import { openH3PromptForgeModelFolder } from '@/lib/h3PromptForgeModelFolder';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { resolveUmbraVideoQueueSourceUrl } from '@/lib/umbraVideoQueuePreview';
import { createMiniMaxH3ReferencePack, MINIMAX_H3_IMAGE_INPAINT_ENABLED, miniMaxH3DirectorMode, parseMiniMaxH3ReferencePack, selectedMiniMaxH3DirectorItems, type MiniMaxH3DirectorControls, type MiniMaxH3DirectorItem, type MiniMaxH3DirectorMediaKind, type MiniMaxH3ReferencePackMode, type MiniMaxH3ReferencePackScope } from '../../../../shared/umbra-ui/minimaxH3Director';

interface ForgeModel { id: string; label: string; disabled?: boolean }
interface ForgeCatalog {
  models?: ForgeModel[];
  creativity?: string[];
  detail_levels?: Record<string, string>;
  default_detail?: number;
  default_creativity?: string;
  message?: string;
}

interface Props {
  mode: string;
  frameGuideMode: string;
  onFrameGuideModeChange: (mode: 'first' | 'first_last') => void;
  onModeChange: (mode: 'text_to_video' | 'image_to_video' | 'reference_to_video') => void;
  controls: MiniMaxH3DirectorControls;
  onChange: (controls: MiniMaxH3DirectorControls) => void;
  prompt: string;
  durationSeconds: number;
  width: number;
  height: number;
  comfyConnected: boolean;
  onApplyPrompt: (prompt: string) => void;
  onClose: () => void;
}

const fieldClass = 'w-full min-w-0 rounded border border-white/10 bg-black/35 px-2 py-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/50';
const iconButton = 'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded border border-white/10 text-zinc-400 hover:border-fuchsia-300/35 hover:text-fuchsia-100 disabled:opacity-30';

function newItem(kind: MiniMaxH3DirectorMediaKind): MiniMaxH3DirectorItem {
  return {
    id: crypto.randomUUID(),
    kind,
    sourcePath: '',
    sourceName: '',
    enabled: true,
    note: '',
    trimStart: 0,
    trimEnd: null,
    mediaMode: 'video',
    role: 'subject',
  };
}

export function UmbraH3DirectorPanel({ mode, frameGuideMode, onFrameGuideModeChange, onModeChange, controls, onChange, prompt, durationSeconds, width, height, comfyConnected, onApplyPrompt, onClose }: Props) {
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode, controls);
  const [forgeCatalog, setForgeCatalog] = React.useState<ForgeCatalog | null>(null);
  const [forgeError, setForgeError] = React.useState('');
  const [forgeCatalogRefresh, setForgeCatalogRefresh] = React.useState(0);
  const [brief, setBrief] = React.useState(prompt);
  const [model, setModel] = React.useState('');
  const [detail, setDetail] = React.useState(5);
  const [creativity, setCreativity] = React.useState('balanced');
  const [draft, setDraft] = React.useState('');
  const [drafting, setDrafting] = React.useState(false);
  const [uploadingId, setUploadingId] = React.useState('');
  const [refModLibrary, setRefModLibrary] = React.useState<Array<{ name: string; kind: string; description?: string }>>([]);
  const [refModError, setRefModError] = React.useState('');
  const [nodesUpdateAvailable, setNodesUpdateAvailable] = React.useState(false);
  const [packScope, setPackScope] = React.useState<MiniMaxH3ReferencePackScope>('all');
  const [packLoadMode, setPackLoadMode] = React.useState<MiniMaxH3ReferencePackMode>('overwrite');
  const [packStatus, setPackStatus] = React.useState('');
  const [checkpoints, setCheckpoints] = React.useState<Array<{ clip_id: string; seconds: number; completed_ns: number }>>([]);
  const [checkpointError, setCheckpointError] = React.useState('');
  const [checkpointRefresh, setCheckpointRefresh] = React.useState(0);
  const [sessionPickerOpen, setSessionPickerOpen] = React.useState(false);
  const [sourceCheck, setSourceCheck] = React.useState('');
  const [sourceCheckFailed, setSourceCheckFailed] = React.useState(false);
  const [sourceVideoUploading, setSourceVideoUploading] = React.useState(false);
  const requestIdRef = React.useRef('');
  const packInput = React.useRef<HTMLInputElement | null>(null);
  const sourceVideoInput = React.useRef<HTMLInputElement | null>(null);
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const enabled = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode);
  const maxItems = directorMode === 'T2VA' ? 0 : directorMode === 'I2VA' || directorMode === 'L2VA' || directorMode === 'Image Inpaint' ? 1 : directorMode === 'FL2VA' ? 2 : 12;
  const continuity = controls.continuity;
  const continuitySource = continuity.sourceKind === 'video' ? continuity.sourceVideoId : continuity.sourceId;

  React.useEffect(() => { setDraft(''); }, [continuity.session, continuity.sourceKind, continuitySource,
    continuity.overlapFrames, continuity.idea, directorMode, durationSeconds, width, height, brief, model, detail, creativity]);

  React.useEffect(() => {
    setCheckpoints([]);
    if (!comfyConnected || !/^[a-zA-Z0-9_-]{1,80}$/.test(continuity.session)) return;
    const abort = new AbortController();
    fetch(`/comfy/df_h3_continuity/session/${encodeURIComponent(continuity.session)}`, { signal: abort.signal })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok || !Array.isArray(data.clips)) throw new Error(data.error || 'Could not load H3 checkpoints. Update DaSiWa nodes in ComfyUI.');
        setCheckpoints(data.clips);
        setCheckpointError('');
      })
      .catch((error) => { if (!abort.signal.aborted) setCheckpointError(error instanceof Error ? error.message : 'Could not load checkpoints.'); });
    return () => abort.abort();
  }, [comfyConnected, continuity.session, checkpointRefresh]);

  React.useEffect(() => {
    if (!comfyConnected || !continuitySource) { setSourceCheck(''); setSourceCheckFailed(false); return; }
    const abort = new AbortController();
    setSourceCheck('Checking continuity source...');
    setSourceCheckFailed(false);
    fetch('/comfy/df_h3_continuity/preflight', {
      method: 'POST', signal: abort.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session: continuity.session, source_kind: continuity.sourceKind, source_id: continuitySource,
        mode: directorMode, width, height, duration: durationSeconds, frame_rate: 24, overlap_frames: continuity.overlapFrames }),
    }).then(async (response) => {
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(Array.isArray(data.issues) ? data.issues.join(' ') : 'Continuity source check failed.');
      setSourceCheck(`Ready to continue · ${Number(data.total_seconds || 0).toFixed(1)}s total`);
    }).catch((error) => { if (!abort.signal.aborted) {
      setSourceCheck(error instanceof Error ? error.message : 'Continuity source check failed.');
      setSourceCheckFailed(true);
    } });
    return () => abort.abort();
  }, [comfyConnected, continuity.session, continuity.sourceKind, continuitySource, continuity.overlapFrames, directorMode, width, height, durationSeconds]);

  const uploadContinuityVideo = async (file: File) => {
    setSourceVideoUploading(true);
    try {
      const uploadResponse = await fetch('/api/comfy/upload-media', {
        method: 'POST', headers: { 'Content-Type': file.type || 'video/mp4', 'x-umbra-media-kind': 'video',
          'x-umbra-file-name': encodeURIComponent(file.name) }, body: file,
      });
      const uploadResult = await uploadResponse.json() as { filename?: string; error?: string };
      if (!uploadResponse.ok || !uploadResult.filename) throw new Error(uploadResult.error || 'Video upload failed.');
      const prepareResponse = await fetch('/comfy/df_h3_continuity/video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadResult.filename }),
      });
      const prepared = await prepareResponse.json() as { clip_id?: string; error?: string };
      if (!prepareResponse.ok || !prepared.clip_id) throw new Error(prepared.error || 'DaSiWa could not prepare the source video.');
      onChange({ ...controls, continuity: { ...continuity, sourceKind: 'video', sourceVideoId: prepared.clip_id, capture: true } });
      setCheckpointError('');
    } catch (error) {
      setCheckpointError(error instanceof Error ? error.message : 'Video preparation failed.');
    } finally { setSourceVideoUploading(false); }
  };

  React.useEffect(() => {
    if (!comfyConnected || directorMode !== 'REF2VA') return;
    let active = true;
    fetch('/comfy/dasiwa/refmods').then(async (response) => {
      const result = await response.json();
      if (!response.ok || !Array.isArray(result)) throw new Error(result.error || 'Could not load RefMods from ComfyUI.');
      if (active) { setRefModLibrary(result); setRefModError(''); }
    }).catch((error) => { if (active) setRefModError(error instanceof Error ? error.message : 'Could not load RefMods.'); });
    return () => { active = false; };
  }, [comfyConnected, directorMode]);

  React.useEffect(() => {
    let active = true;
    fetch('/api/umbra-ui/h3-director/node-update').then(async (response) => {
      if (!response.ok) return;
      const result = await response.json() as { updateAvailable?: boolean };
      if (active) setNodesUpdateAvailable(result.updateAvailable === true);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  React.useEffect(() => () => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    void fetch('/comfy/dasiwa/h3/forge/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }),
    }).catch(() => undefined);
  }, []);

  const updateItems = (items: MiniMaxH3DirectorItem[]) => onChange({ ...controls, items });
  const updateBuilder = (patch: Partial<MiniMaxH3DirectorControls['promptBuilder']>) => onChange({
    ...controls, promptBuilder: { ...controls.promptBuilder, ...patch },
  });
  const updateItem = (id: string, patch: Partial<MiniMaxH3DirectorItem>) => {
    updateItems(controls.items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };
  const moveItem = (id: string, direction: -1 | 1) => {
    const visibleIndex = enabled.findIndex((item) => item.id === id);
    const neighbor = enabled[visibleIndex + direction];
    if (!neighbor) return;
    const items = [...controls.items];
    const index = items.findIndex((item) => item.id === id);
    const neighborIndex = items.findIndex((item) => item.id === neighbor.id);
    [items[index], items[neighborIndex]] = [items[neighborIndex], items[index]];
    updateItems(items);
  };

  React.useEffect(() => {
    if (!comfyConnected) {
      setForgeError('Start the managed ComfyUI server to use DaSiWa Prompt Forge.');
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/comfy/dasiwa/h3/forge/models', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const result = await response.json().catch(() => ({})) as ForgeCatalog;
        if (!response.ok) throw new Error(result.message || 'DaSiWa Prompt Forge is unavailable. Install or update ComfyUI-DaSiWa-Nodes.');
        if (!active) return;
        setForgeCatalog(result);
        setModel((current) => result.models?.some((entry) => entry.id === current && !entry.disabled)
          ? current : result.models?.find((entry) => !entry.disabled)?.id || '');
        setDetail(Number(result.default_detail) || 5);
        setCreativity(result.default_creativity || 'balanced');
        setForgeError('');
      } catch (error) {
        if (active) setForgeError(error instanceof Error ? error.message : 'Prompt Forge is unavailable.');
      }
    };
    void load();
    return () => { active = false; };
  }, [comfyConnected, forgeCatalogRefresh]);

  const upload = async (item: MiniMaxH3DirectorItem, file: File) => {
    setUploadingId(item.id);
    try {
      const response = await fetch('/api/comfy/upload-media', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-umbra-media-kind': item.kind,
          'x-umbra-file-name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const result = await response.json() as { sourcePath?: string; filename?: string; error?: string };
      if (!response.ok || !result.sourcePath || !result.filename) throw new Error(result.error || 'Media upload failed.');
      updateItem(item.id, { sourcePath: result.sourcePath, sourceName: result.filename });
      setForgeError('');
    } catch (error) {
      setForgeError(error instanceof Error ? error.message : 'Media upload failed.');
    } finally {
      setUploadingId('');
    }
  };

  const cancelForge = async () => {
    if (!requestIdRef.current) return;
    await fetch('/comfy/dasiwa/h3/forge/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestIdRef.current }),
    }).catch(() => undefined);
  };

  const savePack = () => {
    try {
      const pack = createMiniMaxH3ReferencePack(controls, mode, frameGuideMode, prompt, packScope);
      const url = URL.createObjectURL(new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `minimax-h3-${packScope}-pack.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPackStatus('Reference pack saved.');
    } catch (error) {
      setPackStatus(error instanceof Error ? error.message : 'Reference pack could not be saved.');
    }
  };

  const loadPack = async (file: File) => {
    try {
      if (file.size > 1024 * 1024) throw new Error('Reference pack is larger than 1 MB.');
      const parsed = parseMiniMaxH3ReferencePack(JSON.parse(await file.text()), controls, packScope, packLoadMode);
      onModeChange(parsed.mode);
      onFrameGuideModeChange(parsed.frameGuideMode);
      onChange(parsed.controls);
      if (parsed.prompt !== null) onApplyPrompt(packLoadMode === 'append' && prompt.trim() ? `${prompt.trim()}\n\n${parsed.prompt}` : parsed.prompt);
      setPackStatus('Reference pack loaded. Missing media must be uploaded again before queueing.');
    } catch (error) {
      setPackStatus(error instanceof Error ? error.message : 'Reference pack could not be loaded.');
    }
  };

  const forge = async () => {
    if (drafting || (!brief.trim() && !continuitySource) || !model) return;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setDrafting(true);
    setForgeError('');
    try {
      const references = [];
      const forgeReferences = continuitySource && (directorMode !== 'REF2VA' || !continuity.useReferences) ? [] : enabled;
      for (const item of forgeReferences) {
        const path = await ensureUmbraUiQueuedMedia(item.kind, item.sourcePath, item.sourceName, `Director ${item.kind}`);
        if (item.kind === 'image') references.push({ kind: 'image', path, role: directorMode === 'REF2VA' ? item.role : 'keyframe', keep: item.note });
        else if (item.kind === 'video') references.push({ kind: 'video', role: 'motion', stream: item.mediaMode === 'video_audio' ? 'both' : item.mediaMode, keep: item.note, duration_seconds: item.trimEnd === null ? undefined : item.trimEnd - item.trimStart });
        else references.push({ kind: 'audio', keep: item.note, duration_seconds: item.trimEnd === null ? undefined : item.trimEnd - item.trimStart });
      }
      const response = await fetch('/comfy/dasiwa/h3/forge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: requestId,
          brief: brief.trim(),
          mode: directorMode,
          duration: durationSeconds,
          model,
          detail,
          creativity,
          references,
          ...(continuitySource ? { continuity: {
            session: continuity.session,
            clip_id: continuitySource,
            source_kind: continuity.sourceKind,
            overlap_frames: continuity.overlapFrames,
            current_prompt: continuity.idea,
          } } : {}),
        }),
      });
      const result = await response.json().catch(() => ({})) as { simple_prompt?: string; message?: string; warnings?: string[] };
      if (!response.ok || !result.simple_prompt) throw new Error(result.message || 'Prompt Forge did not return a draft.');
      if (requestIdRef.current !== requestId) return;
      setDraft(result.simple_prompt);
      if (result.warnings?.length) setForgeError(result.warnings.join(' '));
    } catch (error) {
      setForgeError(error instanceof Error ? error.message : 'Prompt Forge failed.');
    } finally {
      if (requestIdRef.current === requestId) requestIdRef.current = '';
      setDrafting(false);
    }
  };

  return (
    <aside className="min-h-0 min-w-0 overflow-y-auto border-r border-white/10 bg-black/25 p-3 custom-scrollbar max-md:order-first max-md:h-[min(70vh,580px)] max-md:min-h-[300px] max-md:shrink-0 max-md:border-r-0 max-md:border-b" aria-label="MiniMax H3 Director">
      <div className="mb-3 flex items-center gap-2 border-b border-white/10 pb-2">
        <Video size={15} className="text-fuchsia-300" />
        <h2 className="text-xs font-semibold text-zinc-100">H3 Director</h2>
        <span className="font-mono text-[10px] text-zinc-500">{directorMode}</span>
        <button type="button" className={`${iconButton} ml-auto`} title="Close Director" onClick={onClose}><X size={14} /></button>
      </div>
      {nodesUpdateAvailable ? <div role="status" className="mb-3 border border-amber-400/25 bg-amber-400/5 p-2 text-xs text-amber-200">
        DaSiWa nodes changed upstream. Check Umbra Director compatibility before updating in ComfyUI Manager. Umbra workflow changes are reviewed separately.
        <a href="/comfy/" target="_blank" rel="noopener noreferrer" className="ml-2 underline">Open ComfyUI</a>
      </div> : null}
      <label className={`mb-3 flex items-center gap-2 text-xs ${MINIMAX_H3_IMAGE_INPAINT_ENABLED ? 'text-zinc-300' : 'cursor-not-allowed text-zinc-600'}`} title={MINIMAX_H3_IMAGE_INPAINT_ENABLED ? undefined : 'Temporarily unavailable'}>
        <input type="checkbox" checked={MINIMAX_H3_IMAGE_INPAINT_ENABLED && controls.imageInpaint} disabled={!MINIMAX_H3_IMAGE_INPAINT_ENABLED} onChange={(event) => onChange({ ...controls, imageInpaint: event.target.checked,
          continuity: event.target.checked ? { ...continuity, capture: false, sourceId: '', sourceVideoId: '' } : continuity })} /> Image Inpaint (still frame)
        {!MINIMAX_H3_IMAGE_INPAINT_ENABLED ? <span className="text-[10px]">Unavailable for now</span> : null}
      </label>
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="text-[10px] text-zinc-500">{enabled.length}/{maxItems} reference slots</span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-zinc-400">
          Input scaling
          <UmbraSelectControl value={controls.inputScaling} onChange={(event) => onChange({ ...controls, inputScaling: event.target.value as MiniMaxH3DirectorControls['inputScaling'] })} className="h-8 rounded border border-white/10 bg-black/50 px-2 text-xs text-zinc-100">
            {['Auto', 'Off', 'Target', 'Fit', 'Fill and crop', 'Fit and pad', 'Long side with divisible crop'].map((value) => <option key={value} value={value}>{value}</option>)}
          </UmbraSelectControl>
        </label>
      </div>
      {mode === 'image_to_video' && !controls.imageInpaint ? <label className="mb-3 block text-[10px] text-zinc-500">Frame direction
        <UmbraSelectControl value={directorMode === 'L2VA' ? 'last' : directorMode === 'FL2VA' ? 'first_last' : 'first'} onChange={(event) => {
          const next = event.target.value as MiniMaxH3DirectorControls['endpointMode'];
          onChange({ ...controls, endpointMode: next });
          if (next !== 'last') onFrameGuideModeChange(next);
        }} className={fieldClass}>
          <option value="first">First frame</option><option value="last">Last frame</option><option value="first_last">First + last frames</option>
        </UmbraSelectControl>
      </label> : null}
      {!controls.imageInpaint ? <div className="mb-3 border-y border-white/10 py-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-zinc-200">Continuity</h3>
          <button type="button" className="text-[10px] text-zinc-400 hover:text-zinc-100" onClick={() => setCheckpointRefresh((value) => value + 1)}>Refresh checkpoints</button>
        </div>
        <div className="text-[10px] text-zinc-500">Session
          <button type="button" className={`${fieldClass} mt-1 flex items-center gap-2 text-left`} onClick={() => setSessionPickerOpen(true)} title="Choose or create continuity session">
            <FolderOpen size={13} className="shrink-0 text-fuchsia-300" /><span className="min-w-0 flex-1 truncate">{continuity.session}</span>
          </button>
        </div>
        <label className="mt-2 block text-[10px] text-zinc-500">Source
          <UmbraSelectControl className={fieldClass} value={continuity.sourceKind} onChange={(event) => onChange({ ...controls, continuity: { ...continuity, sourceKind: event.target.value as typeof continuity.sourceKind } })}>
            <option value="checkpoint">Saved checkpoint</option><option value="video">Uploaded video</option>
          </UmbraSelectControl>
        </label>
        {continuity.sourceKind === 'checkpoint' ? <label className="mt-2 block text-[10px] text-zinc-500">Continue from
          <UmbraSelectControl className={fieldClass} value={continuity.sourceId} onChange={(event) => onChange({ ...controls, continuity: { ...continuity, sourceId: event.target.value, capture: event.target.value ? true : continuity.capture } })}>
            <option value="">New take</option>
            {checkpoints.map((clip) => <option key={clip.clip_id} value={clip.clip_id}>{new Date(clip.completed_ns / 1e6).toLocaleString()} · {clip.seconds.toFixed(1)}s · {clip.clip_id.slice(0, 8)}</option>)}
          </UmbraSelectControl>
        </label> : <div className="mt-2 flex items-center gap-2">
          <button type="button" className="inline-flex h-8 items-center gap-1 border border-white/10 px-2 text-xs text-zinc-300" disabled={!comfyConnected || sourceVideoUploading} onClick={() => sourceVideoInput.current?.click()}>
            {sourceVideoUploading ? <Loader2 size={13} className="animate-spin" /> : <FolderUp size={13} />} Upload source video
          </button>
          <input ref={sourceVideoInput} type="file" accept="video/*" className="hidden" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadContinuityVideo(file);
            event.target.value = '';
          }} />
          {continuity.sourceVideoId ? <span className="truncate font-mono text-[10px] text-zinc-400" title={continuity.sourceVideoId}>{continuity.sourceVideoId.slice(0, 10)}</span> : null}
          {continuity.sourceVideoId ? <button type="button" className={iconButton} title="Clear source video" onClick={() => onChange({ ...controls, continuity: { ...continuity, sourceVideoId: '' } })}><X size={13} /></button> : null}
        </div>}
        <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
          <input type="checkbox" checked={continuity.capture || !!continuitySource} disabled={!!continuitySource} onChange={(event) => onChange({ ...controls, continuity: { ...continuity, capture: event.target.checked } })} /> Save checkpoint after export
        </label>
        {continuitySource ? <>
          <label className="mt-2 block text-[10px] text-zinc-500">Context frames
            <UmbraSelectControl className={fieldClass} value={continuity.overlapFrames} onChange={(event) => onChange({ ...controls, continuity: { ...continuity, overlapFrames: Number(event.target.value) as typeof continuity.overlapFrames } })}>
              {[5, 22, 39, 56, 73].map((frames) => <option key={frames} value={frames}>{frames}</option>)}
            </UmbraSelectControl>
          </label>
          <label className="mt-2 block text-[10px] text-zinc-500">Next action
            <textarea className={fieldClass} rows={3} value={continuity.idea} onChange={(event) => onChange({ ...controls, continuity: { ...continuity, idea: event.target.value } })} />
          </label>
          <label className="mt-2 flex items-center gap-2 text-xs text-zinc-300">
            <input type="checkbox" checked={continuity.useReferences} onChange={(event) => onChange({ ...controls, continuity: { ...continuity, useReferences: event.target.checked } })} /> Use Director references
          </label>
          {sourceCheck ? <p role={sourceCheckFailed ? 'alert' : 'status'} className={`mt-2 text-[10px] ${sourceCheckFailed ? 'text-amber-300' : 'text-zinc-400'}`}>{sourceCheck}</p> : null}
        </> : null}
        {checkpointError ? <p role="alert" className="mt-2 text-[10px] text-amber-300">{checkpointError}</p> : null}
      </div> : null}
      {sessionPickerOpen ? <UmbraH3ContinuitySessionModal currentSession={continuity.session} comfyConnected={comfyConnected}
        onClose={() => setSessionPickerOpen(false)} onSelect={(session) => {
          if (session === continuity.session) return;
          setCheckpoints([]);
          setCheckpointError('');
          onChange({ ...controls, continuity: { ...continuity, session, sourceKind: 'checkpoint', sourceId: '', sourceVideoId: '', capture: true, idea: '', useReferences: false } });
        }} /> : null}
      <div className="mb-3 border-y border-white/10 py-3">
        <div className="mb-2 flex items-center gap-2"><h3 className="text-xs font-semibold text-zinc-200">Reference pack</h3></div>
        <div className="grid grid-cols-2 gap-2">
          <UmbraSelectControl aria-label="Reference pack contents" value={packScope} onChange={(event) => setPackScope(event.target.value as MiniMaxH3ReferencePackScope)} className={fieldClass}>
            <option value="all">Files + prompt</option><option value="files">Files only</option><option value="prompt">Prompt only</option>
          </UmbraSelectControl>
          <UmbraSelectControl aria-label="Reference pack load mode" value={packLoadMode} onChange={(event) => setPackLoadMode(event.target.value as MiniMaxH3ReferencePackMode)} className={fieldClass}>
            <option value="overwrite">Overwrite</option><option value="append">Append</option>
          </UmbraSelectControl>
        </div>
        <div className="mt-2 flex gap-2">
          <button type="button" className="inline-flex h-8 flex-1 items-center justify-center gap-1 border border-white/10 text-xs text-zinc-300" onClick={savePack}><Download size={13} /> Save</button>
          <button type="button" className="inline-flex h-8 flex-1 items-center justify-center gap-1 border border-white/10 text-xs text-zinc-300" onClick={() => packInput.current?.click()}><FolderUp size={13} /> Load</button>
          <input ref={packInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void loadPack(file); event.target.value = ''; }} />
        </div>
        {packStatus ? <p role="status" className="mt-2 text-[10px] text-zinc-400">{packStatus}</p> : null}
      </div>
      <div className="space-y-2">
        {enabled.map((item, index) => (
          <div key={item.id} className="border border-white/10 bg-white/[0.025] p-2">
            <div className="mb-2 flex items-center gap-2">
              {item.kind === 'image' ? <ImageIcon size={13} /> : item.kind === 'video' ? <Video size={13} /> : <Music2 size={13} />}
              <span className="text-xs capitalize text-zinc-300">{item.kind} {index + 1}</span>
              <button type="button" className={`${iconButton} ml-auto`} disabled={index === 0} title="Move up" onClick={() => moveItem(item.id, -1)}><ArrowUp size={13} /></button>
              <button type="button" className={iconButton} disabled={index === enabled.length - 1} title="Move down" onClick={() => moveItem(item.id, 1)}><ArrowDown size={13} /></button>
              <button type="button" className={iconButton} title="Remove slot" onClick={() => updateItems(controls.items.filter((row) => row.id !== item.id))}><Trash2 size={13} /></button>
            </div>
            <div className="flex gap-2">
              <div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-black/40">
                {item.sourcePath && item.kind === 'image' ? <img src={`/api/fs/image?path=${encodeURIComponent(item.sourcePath)}`} alt="" className="h-full w-full object-contain" />
                  : item.sourcePath && item.kind === 'video' ? <video src={resolveUmbraVideoQueueSourceUrl({ mode: 'video_to_video', sourceVideoPath: item.sourcePath, sourceVideoName: item.sourceName })} muted preload="metadata" className="h-full w-full object-cover" />
                    : item.kind === 'image' ? <ImageIcon size={14} className="text-zinc-600" /> : item.kind === 'video' ? <Video size={14} className="text-zinc-600" /> : <Music2 size={14} className="text-zinc-600" />}
              </div>
              <input aria-label={`${item.kind} ${index + 1} path`} className={fieldClass} value={item.sourcePath} placeholder="Local path or upload" onChange={(event) => updateItem(item.id, { sourcePath: event.target.value, sourceName: '' })} />
              <input ref={(node) => { fileInputs.current[item.id] = node; }} type="file" className="hidden" accept={item.kind === 'image' ? 'image/*' : item.kind === 'video' ? 'video/*' : 'audio/*'} onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(item, file);
                event.target.value = '';
              }} />
              <button type="button" className={iconButton} title={`Upload ${item.kind}`} disabled={uploadingId === item.id} onClick={() => fileInputs.current[item.id]?.click()}>
                {uploadingId === item.id ? <Loader2 size={13} className="animate-spin" /> : <FolderUp size={13} />}
              </button>
            </div>
            {directorMode === 'REF2VA' && item.kind === 'image' ? <label className="mt-2 block text-[10px] text-zinc-500">Reference role
              <UmbraSelectControl value={item.role} onChange={(event) => updateItem(item.id, { role: event.target.value as MiniMaxH3DirectorItem['role'] })} className={fieldClass}>
                <option value="subject">Subject</option><option value="style">Style</option><option value="keyframe">Keyframe</option>
              </UmbraSelectControl>
            </label> : null}
            <input aria-label={`${item.kind} ${index + 1} reference prompt`} className={`${fieldClass} mt-2`} value={item.note} placeholder="Reference prompt" onChange={(event) => updateItem(item.id, { note: event.target.value })} />
            {item.kind !== 'image' ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <label className="text-[10px] text-zinc-500">Trim start (s)<input type="number" min={0} step={0.1} value={item.trimStart} onChange={(event) => updateItem(item.id, { trimStart: Number(event.target.value) || 0 })} className={fieldClass} /></label>
                <label className="text-[10px] text-zinc-500">Trim end (s)<input type="number" min={0} step={0.1} value={item.trimEnd ?? ''} onChange={(event) => updateItem(item.id, { trimEnd: event.target.value === '' ? null : Number(event.target.value) })} className={fieldClass} /></label>
                {item.kind === 'video' ? <label className="col-span-2 text-[10px] text-zinc-500">Video stream
                  <UmbraSelectControl value={item.mediaMode} onChange={(event) => updateItem(item.id, { mediaMode: event.target.value as MiniMaxH3DirectorItem['mediaMode'] })} className={fieldClass}>
                    <option value="video">Video</option><option value="audio">Audio</option><option value="video_audio">Video + audio</option>
                  </UmbraSelectControl>
                </label> : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {enabled.length < maxItems && controls.items.length < 12 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs text-zinc-300 hover:border-fuchsia-300/30 disabled:opacity-40" disabled={directorMode === 'REF2VA' && enabled.filter((item) => item.kind === 'image').length >= 9} onClick={() => updateItems([...controls.items, newItem('image')])}><Plus size={12} /> Image</button>
          {directorMode === 'REF2VA' ? <>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs text-zinc-300 hover:border-fuchsia-300/30" disabled={enabled.filter((item) => item.kind === 'video').length >= 3} onClick={() => updateItems([...controls.items, newItem('video')])}><Plus size={12} /> Video</button>
            <button type="button" className="inline-flex h-8 items-center gap-1 rounded border border-white/10 px-2 text-xs text-zinc-300 hover:border-fuchsia-300/30" disabled={enabled.filter((item) => item.kind === 'audio').length >= 3} onClick={() => updateItems([...controls.items, newItem('audio')])}><Plus size={12} /> Audio</button>
          </> : null}
        </div>
      ) : null}
      {directorMode === 'REF2VA' ? <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-zinc-200">RefMods</h3>
          <button type="button" className={iconButton} title="Add RefMod" disabled={controls.refMods.length >= 8} onClick={() => {
            const slot = Array.from({ length: 8 }, (_, index) => index + 1).find((value) => !controls.refMods.some((row) => row.slot === value));
            if (slot) onChange({ ...controls, refMods: [...controls.refMods, { slot, name: '', enabled: true, strength: 1, description: '' }] });
          }}><Plus size={13} /></button>
        </div>
        {refModError ? <p role="status" className="mb-2 text-xs text-amber-300">{refModError}</p> : null}
        {controls.refMods.map((ref) => <div key={ref.slot} className="mb-2 border border-white/10 p-2">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-zinc-300"><input type="checkbox" checked={ref.enabled} onChange={(event) => onChange({ ...controls, refMods: controls.refMods.map((row) => row.slot === ref.slot ? { ...row, enabled: event.target.checked } : row) })} />RefMod {ref.slot}</label>
            <button type="button" className={`${iconButton} ml-auto`} title="Insert RefMod tag" disabled={!ref.name || !ref.enabled} onClick={() => {
              const tag = `<RefMod ${ref.slot}>`;
              if (controls.promptBuilder.structured) {
                const description = controls.promptBuilder.description.trim();
                updateBuilder({ description: `${description}${description ? '\n' : ''}${tag}` });
              } else {
                onApplyPrompt(`${prompt.trim()}${prompt.trim() ? '\n' : ''}${tag}`);
              }
            }}><Plus size={13} /></button>
            <button type="button" className={iconButton} title="Remove RefMod" onClick={() => onChange({ ...controls, refMods: controls.refMods.filter((row) => row.slot !== ref.slot) })}><Trash2 size={13} /></button>
          </div>
          <UmbraSelectControl value={ref.name} onChange={(event) => onChange({ ...controls, refMods: controls.refMods.map((row) => row.slot === ref.slot ? { ...row, name: event.target.value } : row) })} className={`${fieldClass} mt-2`}>
            <option value="">Select a RefMod</option>
            {refModLibrary.map((entry) => <option key={entry.name} value={entry.name}>{entry.name} ({entry.kind})</option>)}
          </UmbraSelectControl>
          <label className="mt-2 block text-[10px] text-zinc-500">Strength
            <input type="number" min={0} max={1} step={0.05} value={ref.strength} onChange={(event) => onChange({ ...controls, refMods: controls.refMods.map((row) => row.slot === ref.slot ? { ...row, strength: Number(event.target.value) } : row) })} className={fieldClass} />
          </label>
          <input aria-label={`RefMod ${ref.slot} description`} className={`${fieldClass} mt-2`} value={ref.description} placeholder="Reference description" onChange={(event) => onChange({ ...controls, refMods: controls.refMods.map((row) => row.slot === ref.slot ? { ...row, description: event.target.value } : row) })} />
        </div>)}
      </div> : null}
      <div className="mt-4 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold text-zinc-200">Prompt</h3>
          <div className="flex border border-white/10" role="group" aria-label="Director prompt mode">
            <button type="button" className={`px-2 py-1 text-[10px] ${!controls.promptBuilder.structured ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-zinc-400'}`} onClick={() => {
              if (!controls.promptBuilder.structured) return;
              const builder = controls.promptBuilder;
              const sections = directorMode === 'REF2VA'
                ? [['subject_definitions', builder.subjects], ['summary', builder.summary], ['retention_analysis', builder.retention], ['detailed_description', builder.description], ['overall_soundscape', builder.soundscape], ['non_diegetic_music', builder.music]]
                : [['integrated_multimodal_description', builder.description], ['overall_soundscape', builder.soundscape], ['non_diegetic_music', builder.music]];
              onApplyPrompt(sections.map(([label, value]) => `${label}: ${value}`).join('\n\n'));
              updateBuilder({ structured: false });
            }}>Simple</button>
            <button type="button" className={`px-2 py-1 text-[10px] ${controls.promptBuilder.structured ? 'bg-fuchsia-500/20 text-fuchsia-100' : 'text-zinc-400'}`} onClick={() => updateBuilder({ structured: true, description: controls.promptBuilder.description || prompt })}>Structured</button>
          </div>
        </div>
        {controls.promptBuilder.structured ? <div className="space-y-2">
          {directorMode === 'REF2VA' ? <>
            <label className="block text-[10px] text-zinc-500">Subject definitions<textarea value={controls.promptBuilder.subjects} onChange={(event) => updateBuilder({ subjects: event.target.value })} className={`${fieldClass} min-h-16 resize-y`} /></label>
            <label className="block text-[10px] text-zinc-500">Reference summary<textarea value={controls.promptBuilder.summary} onChange={(event) => updateBuilder({ summary: event.target.value })} className={`${fieldClass} min-h-16 resize-y`} /></label>
            <label className="block text-[10px] text-zinc-500">Retention analysis<textarea value={controls.promptBuilder.retention} onChange={(event) => updateBuilder({ retention: event.target.value })} className={`${fieldClass} min-h-16 resize-y`} /></label>
          </> : null}
          <label className="block text-[10px] text-zinc-500">{directorMode === 'REF2VA' ? 'Detailed description' : 'Integrated multimodal description'}<textarea value={controls.promptBuilder.description} onChange={(event) => updateBuilder({ description: event.target.value })} className={`${fieldClass} min-h-24 resize-y`} /></label>
          <label className="block text-[10px] text-zinc-500">Overall soundscape<textarea value={controls.promptBuilder.soundscape} onChange={(event) => updateBuilder({ soundscape: event.target.value })} className={`${fieldClass} min-h-16 resize-y`} /></label>
          <label className="block text-[10px] text-zinc-500">Non-diegetic music<input value={controls.promptBuilder.music} onChange={(event) => updateBuilder({ music: event.target.value })} className={fieldClass} /></label>
        </div> : null}
      </div>
      <div className="mt-5 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-fuchsia-300" />
          <h3 className="text-xs font-semibold text-zinc-200">DaSiWa Prompt Forge</h3>
          <a href="https://github.com/darksidewalker/ComfyUI-DaSiWa-Nodes" target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-zinc-500 underline hover:text-zinc-300">DaSiWa</a>
        </div>
        <textarea value={brief} onChange={(event) => setBrief(event.target.value)} className={`${fieldClass} min-h-20 resize-y`} placeholder={continuitySource ? 'Next action (optional)' : 'Describe the shot to draft'} aria-label="Prompt Forge idea" />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_75px] gap-2">
          <div className="min-w-0 text-[10px] text-zinc-500">Model
            <div className="flex min-w-0 gap-1">
              <UmbraSelectControl aria-label="Prompt Forge model" value={model} onChange={(event) => setModel(event.target.value)} className={fieldClass}>
                <option value="">Choose a model</option>
                {(forgeCatalog?.models || []).map((entry) => <option key={entry.id} value={entry.id} disabled={entry.disabled}>{entry.label}</option>)}
              </UmbraSelectControl>
              <button type="button" className={iconButton} title="Open Prompt Forge model folder" aria-label="Open Prompt Forge model folder"
                disabled={isUmbraRemoteClient()} onClick={() => void openH3PromptForgeModelFolder().catch((error) => setForgeError(error instanceof Error ? error.message : 'Could not open model folder.'))}>
                <FolderOpen size={14} />
              </button>
              <button type="button" className={iconButton} title="Refresh Prompt Forge models" aria-label="Refresh Prompt Forge models"
                disabled={!comfyConnected} onClick={() => setForgeCatalogRefresh((current) => current + 1)}><RefreshCw size={14} /></button>
            </div>
          </div>
          <label className="text-[10px] text-zinc-500">Detail
            <input type="number" min={1} max={10} value={detail} onChange={(event) => setDetail(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className={fieldClass} />
          </label>
        </div>
        <label className="mt-2 block text-[10px] text-zinc-500">Creativity
          <UmbraSelectControl value={creativity} onChange={(event) => setCreativity(event.target.value)} className={fieldClass}>
            {(forgeCatalog?.creativity || ['balanced']).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </UmbraSelectControl>
        </label>
        <div className="mt-2 flex gap-2">
          <button type="button" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded border border-fuchsia-300/30 px-2 text-xs text-fuchsia-100 disabled:opacity-40" disabled={!model || (!brief.trim() && !continuitySource) || drafting} onClick={() => void forge()}>
            {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{drafting ? 'Drafting...' : 'Draft prompt'}
          </button>
          {drafting ? <button type="button" className={iconButton} title="Cancel Prompt Forge" onClick={() => void cancelForge()}><X size={13} /></button> : null}
        </div>
        {forgeError ? <p role="status" className="mt-2 text-xs text-amber-300">{forgeError}</p> : null}
        {draft ? <div className="mt-3 space-y-2">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className={`${fieldClass} min-h-40 resize-y`} aria-label="Prompt Forge draft" />
          <button type="button" className="h-9 rounded border border-fuchsia-300/30 px-3 text-xs text-fuchsia-100" onClick={() => {
            if (continuitySource) onChange({ ...controls, continuity: { ...continuity, idea: draft.trim() } });
            else if (controls.promptBuilder.structured) updateBuilder({ description: draft.trim() });
            else onApplyPrompt(draft.trim());
          }} disabled={!draft.trim()}>Use draft</button>
        </div> : null}
      </div>
    </aside>
  );
}
