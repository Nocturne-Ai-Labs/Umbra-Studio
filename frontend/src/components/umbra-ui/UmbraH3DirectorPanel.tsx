'use client';

import React from 'react';
import { ArrowDown, ArrowUp, FolderUp, Image as ImageIcon, Loader2, Music2, Plus, Sparkles, Trash2, Video, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { ensureUmbraUiQueuedMedia } from '@/lib/umbraUiQueuedMedia';
import { resolveUmbraVideoQueueSourceUrl } from '@/lib/umbraVideoQueuePreview';
import { miniMaxH3DirectorMode, selectedMiniMaxH3DirectorItems, type MiniMaxH3DirectorControls, type MiniMaxH3DirectorItem, type MiniMaxH3DirectorMediaKind } from '../../../../shared/umbra-ui/minimaxH3Director';

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
  controls: MiniMaxH3DirectorControls;
  onChange: (controls: MiniMaxH3DirectorControls) => void;
  prompt: string;
  durationSeconds: number;
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

export function UmbraH3DirectorPanel({ mode, frameGuideMode, onFrameGuideModeChange, controls, onChange, prompt, durationSeconds, comfyConnected, onApplyPrompt, onClose }: Props) {
  const directorMode = miniMaxH3DirectorMode(mode, frameGuideMode);
  const [forgeCatalog, setForgeCatalog] = React.useState<ForgeCatalog | null>(null);
  const [forgeError, setForgeError] = React.useState('');
  const [brief, setBrief] = React.useState(prompt);
  const [model, setModel] = React.useState('');
  const [detail, setDetail] = React.useState(5);
  const [creativity, setCreativity] = React.useState('balanced');
  const [draft, setDraft] = React.useState('');
  const [drafting, setDrafting] = React.useState(false);
  const [uploadingId, setUploadingId] = React.useState('');
  const requestIdRef = React.useRef('');
  const fileInputs = React.useRef<Record<string, HTMLInputElement | null>>({});
  const enabled = selectedMiniMaxH3DirectorItems(controls, mode, frameGuideMode);
  const maxItems = directorMode === 'T2VA' ? 0 : directorMode === 'I2VA' ? 1 : directorMode === 'FL2VA' ? 2 : 12;

  React.useEffect(() => () => {
    const requestId = requestIdRef.current;
    if (!requestId) return;
    void fetch('/comfy/dasiwa/h3/forge/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }),
    }).catch(() => undefined);
  }, []);

  const updateItems = (items: MiniMaxH3DirectorItem[]) => onChange({ ...controls, items });
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
        setModel((current) => current || result.models?.find((entry) => !entry.disabled)?.id || '');
        setDetail(Number(result.default_detail) || 5);
        setCreativity(result.default_creativity || 'balanced');
        setForgeError('');
      } catch (error) {
        if (active) setForgeError(error instanceof Error ? error.message : 'Prompt Forge is unavailable.');
      }
    };
    void load();
    return () => { active = false; };
  }, [comfyConnected]);

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

  const forge = async () => {
    if (drafting || !brief.trim() || !model) return;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setDrafting(true);
    setForgeError('');
    try {
      const references = [];
      for (const item of enabled) {
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
      <div className="mb-3 flex flex-wrap gap-2">
        <span className="text-[10px] text-zinc-500">{enabled.length}/{maxItems} reference slots</span>
        <label className="ml-auto flex items-center gap-1 text-[10px] text-zinc-400">
          Input scaling
          <UmbraSelectControl value={controls.inputScaling} onChange={(event) => onChange({ ...controls, inputScaling: event.target.value === 'Off' ? 'Off' : 'Auto' })} className="h-8 rounded border border-white/10 bg-black/50 px-2 text-xs text-zinc-100">
            <option value="Auto">Auto</option><option value="Off">Off</option>
          </UmbraSelectControl>
        </label>
      </div>
      {mode === 'image_to_video' ? <label className="mb-3 block text-[10px] text-zinc-500">Frame direction
        <UmbraSelectControl value={frameGuideMode === 'first_last' ? 'first_last' : 'first'} onChange={(event) => onFrameGuideModeChange(event.target.value === 'first_last' ? 'first_last' : 'first')} className={fieldClass}>
          <option value="first">First frame</option><option value="first_last">First + last frames</option>
        </UmbraSelectControl>
      </label> : null}
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
            {directorMode === 'REF2VA' ? <input aria-label={`${item.kind} ${index + 1} details for Prompt Forge`} className={`${fieldClass} mt-2`} value={item.note} placeholder="Details to preserve in Prompt Forge" onChange={(event) => updateItem(item.id, { note: event.target.value })} /> : null}
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
      <div className="mt-5 border-t border-white/10 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <Sparkles size={14} className="text-fuchsia-300" />
          <h3 className="text-xs font-semibold text-zinc-200">DaSiWa Prompt Forge</h3>
          <a href="https://github.com/darksidewalker/ComfyUI-DaSiWa-Nodes" target="_blank" rel="noopener noreferrer" className="ml-auto text-[10px] text-zinc-500 underline hover:text-zinc-300">DaSiWa</a>
        </div>
        <textarea value={brief} onChange={(event) => setBrief(event.target.value)} className={`${fieldClass} min-h-20 resize-y`} placeholder="Describe the shot to draft" aria-label="Prompt Forge idea" />
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_75px] gap-2">
          <label className="min-w-0 text-[10px] text-zinc-500">Model
            <UmbraSelectControl value={model} onChange={(event) => setModel(event.target.value)} className={fieldClass}>
              {(forgeCatalog?.models || []).map((entry) => <option key={entry.id} value={entry.id} disabled={entry.disabled}>{entry.label}</option>)}
            </UmbraSelectControl>
          </label>
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
          <button type="button" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded border border-fuchsia-300/30 px-2 text-xs text-fuchsia-100 disabled:opacity-40" disabled={!model || !brief.trim() || drafting} onClick={() => void forge()}>
            {drafting ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}{drafting ? 'Drafting...' : 'Draft prompt'}
          </button>
          {drafting ? <button type="button" className={iconButton} title="Cancel Prompt Forge" onClick={() => void cancelForge()}><X size={13} /></button> : null}
        </div>
        {forgeError ? <p role="status" className="mt-2 text-xs text-amber-300">{forgeError}</p> : null}
        {draft ? <div className="mt-3 space-y-2">
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} className={`${fieldClass} min-h-40 resize-y`} aria-label="Prompt Forge draft" />
          <button type="button" className="h-9 rounded border border-fuchsia-300/30 px-3 text-xs text-fuchsia-100" onClick={() => onApplyPrompt(draft.trim())} disabled={!draft.trim()}>Use draft</button>
        </div> : null}
      </div>
    </aside>
  );
}
