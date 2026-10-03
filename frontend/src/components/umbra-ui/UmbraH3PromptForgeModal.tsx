'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Loader2, RefreshCw, Sparkles, X } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { openH3PromptForgeModelFolder } from '@/lib/h3PromptForgeModelFolder';
import { h3PromptForgeModels, H3_FORGE_MODEL_MISSING } from '@/lib/h3PromptForgeModels';
import { UmbraH3ForgeDeviceControl, useH3ForgeComputeDevice } from './UmbraH3ForgeDeviceControl';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import type { PowerPrompterVideoControls } from '@/types/powerPrompter';
import { miniMaxH3DirectorMode } from '../../../../shared/umbra-ui/minimaxH3Director';
import { H3ForgeRawResponse, h3ForgeFailureMessage, recoverH3ForgeDraft, type H3ForgeResponse } from './H3ForgeResponse';

interface ForgeModel { id: string; label: string; disabled?: boolean }
interface ForgeCatalog {
  models?: ForgeModel[];
  compute_devices?: string[];
  local_model?: string;
  creativity?: string[];
  default_detail?: number;
  default_creativity?: string;
  message?: string;
}

interface Props {
  video: PowerPrompterVideoControls;
  prompt: string;
  durationSeconds: number;
  comfyConnected: boolean;
  onApplyPrompt: (prompt: string) => void;
  onClose: () => void;
  inline?: boolean;
  disabled?: boolean;
  modeOverride?: 'T2VA' | 'I2VA' | 'FL2VA' | 'L2VA' | 'REF2VA';
  referenceNotes?: Array<{ kind: 'image' | 'video' | 'audio'; role: string; keep: string }>;
}

const fieldClass = 'min-h-9 w-full min-w-0 rounded border border-white/15 bg-black/30 px-2 py-2 text-xs text-zinc-100 outline-none focus:border-fuchsia-300/50';
const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/15 px-3 text-xs text-zinc-200 hover:border-fuchsia-300/40 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40';

export function UmbraH3PromptForgeModal({ video, prompt, durationSeconds, comfyConnected, onApplyPrompt, onClose, inline = false, disabled = false, referenceNotes, modeOverride }: Props) {
  const [catalog, setCatalog] = React.useState<ForgeCatalog | null>(null);
  const [model, setModel] = React.useState('');
  const [detail, setDetail] = React.useState(5);
  const [creativity, setCreativity] = React.useState('balanced');
  const [computeDevice, setComputeDevice] = useH3ForgeComputeDevice();
  const [brief, setBrief] = React.useState(prompt);
  const [draft, setDraft] = React.useState('');
  const [drafting, setDrafting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [rawResponse, setRawResponse] = React.useState('');
  const [catalogRefresh, setCatalogRefresh] = React.useState(0);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const requestIdRef = React.useRef('');
  const mode = modeOverride || miniMaxH3DirectorMode(video.mode, video.frameGuideMode);
  const contextKey = JSON.stringify([prompt, mode, durationSeconds, referenceNotes]);
  React.useEffect(() => {
    setDraft(''); setError(''); setRawResponse('');
    const requestId = requestIdRef.current;
    if (!requestId) return;
    requestIdRef.current = ''; setDrafting(false);
    void fetch('/comfy/dasiwa/h3/forge/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }) }).catch(() => undefined);
  }, [contextKey]);
  const localModel = model.startsWith('local:');
  const supportsComputeDevice = catalog?.local_model === 'llama-3.2-3b-instruct'
    && catalog.compute_devices?.includes('cpu') && catalog.compute_devices.includes('gpu');

  React.useEffect(() => {
    if (inline) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previousFocus?.focus();
  }, [inline]);

  React.useEffect(() => {
    if (!comfyConnected) { setError('Start the managed ComfyUI server to use DaSiWa Prompt Forge.'); return; }
    const abort = new AbortController();
    fetch('/comfy/dasiwa/h3/forge/models', {
      method: 'POST', signal: abort.signal, headers: { 'Content-Type': 'application/json' }, body: '{}',
    }).then(async (response) => {
      const result = await response.json().catch(() => ({})) as ForgeCatalog;
      if (!response.ok) throw new Error(result.message || 'Prompt Forge is unavailable. Install or update DaSiWa nodes.');
      const models = h3PromptForgeModels(result.models);
      setCatalog({ ...result, models });
      setModel((current) => models.some((entry) => entry.id === current) ? current : models[0]?.id || '');
      setDetail(Number(result.default_detail) || 5);
      setCreativity(result.default_creativity || 'balanced');
      setError(models.length ? '' : H3_FORGE_MODEL_MISSING);
    }).catch((cause) => { if (!abort.signal.aborted) setError(cause instanceof Error ? cause.message : 'Prompt Forge is unavailable.'); });
    return () => abort.abort();
  }, [comfyConnected, catalogRefresh]);

  React.useEffect(() => () => {
    if (!requestIdRef.current) return;
    void fetch('/comfy/dasiwa/h3/forge/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestIdRef.current }),
    }).catch(() => undefined);
  }, []);

  const cancel = () => {
    if (!requestIdRef.current) return;
    const requestId = requestIdRef.current;
    requestIdRef.current = '';
    setDrafting(false);
    void fetch('/comfy/dasiwa/h3/forge/cancel', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ request_id: requestId }),
    }).catch(() => undefined);
  };

  const forge = async () => {
    if (disabled || drafting || !comfyConnected || !brief.trim() || !model) return;
    const requestId = crypto.randomUUID();
    requestIdRef.current = requestId;
    setDrafting(true);
    setDraft('');
    setError('');
    setRawResponse('');
    try {
      const imageSources = video.mode === 'text_to_video' ? [] : video.mode === 'image_to_video'
        ? [[video.sourceImagePath, video.sourceImageName, ''], ...(video.frameGuideMode === 'first_last' ? [[video.lastImagePath, video.lastImageName, '']] : [])]
        : [[video.sourceImagePath, video.sourceImageName, video.minimaxH3.referenceNotes[0]],
          [video.middleImagePath, video.middleImageName, video.minimaxH3.referenceNotes[1]],
          [video.lastImagePath, video.lastImageName, video.minimaxH3.referenceNotes[2]]];
      const references = referenceNotes ? [...referenceNotes] : [];
      for (const [sourcePath, filename, keep] of referenceNotes ? [] : imageSources) {
        if (requestIdRef.current !== requestId) return;
        if (!sourcePath && !filename) continue;
        references.push({ kind: 'image', role: mode === 'REF2VA' ? 'subject' : 'keyframe', keep });
      }
      if (requestIdRef.current !== requestId) return;
      const response = await fetch('/comfy/dasiwa/h3/forge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id: requestId, brief: brief.trim(), mode, duration: durationSeconds,
          model, detail, creativity, references, ...(localModel ? { compute_device: computeDevice } : {}) }),
      });
      const result = await response.json().catch(() => ({})) as H3ForgeResponse;
      if (!response.ok || !result.simple_prompt) {
        if (requestIdRef.current !== requestId) return;
        setRawResponse(result.raw || '');
        const recovered = recoverH3ForgeDraft(result, mode);
        if (recovered) {
          setDraft(recovered);
          setError('The model returned a complete H3 prompt without DaSiWa markers. Review it before using.');
          return;
        }
        throw new Error(h3ForgeFailureMessage(result));
      }
      if (requestIdRef.current !== requestId) return;
      setDraft(result.simple_prompt);
      if (result.warnings?.length) setError(result.warnings.join(' '));
    } catch (cause) {
      if (requestIdRef.current === requestId) setError(cause instanceof Error ? cause.message : 'Prompt Forge failed.');
    } finally {
      if (requestIdRef.current === requestId) { requestIdRef.current = ''; setDrafting(false); }
    }
  };

  const panel = (
      <div ref={dialogRef} role={inline ? 'region' : 'dialog'} aria-modal={inline ? undefined : true} aria-label="MiniMax H3 Prompt Forge" tabIndex={inline ? undefined : -1}
        className={inline ? 'flex w-full min-w-0 flex-col text-[var(--umbra-text)]' : 'flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-fuchsia-300/35 bg-[#101114] text-zinc-200 shadow-2xl outline-none'}
        onKeyDown={(event) => {
          if (inline) return;
          if (event.key === 'Escape') { event.stopPropagation(); if (!drafting) onClose(); }
          if (event.key !== 'Tab') return;
          const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea:not(:disabled), input:not(:disabled)') ?? []);
          const first = nodes[0]; const last = nodes[nodes.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="flex items-center gap-2 border-b border-white/10 p-3">
          <Sparkles size={16} className="text-fuchsia-300" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">H3 Prompt Forge</h2>
          <span className="text-[10px] text-zinc-500">{mode}</span>
          <button type="button" className={buttonClass} title="Close Prompt Forge" aria-label="Close Prompt Forge" disabled={drafting} onClick={onClose}><X size={15} /></button>
        </header>
        <div className="min-h-0 space-y-3 overflow-y-auto p-3">
          <label className="block text-xs text-zinc-400">Video idea
            <textarea className={`${fieldClass} mt-1 min-h-24 resize-y`} value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="Describe the shot" />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_80px_minmax(0,1fr)]">
            <div className="min-w-0 text-xs text-zinc-400">Model
              <div className="mt-1 flex min-w-0 gap-1">
                <UmbraSelectControl aria-label="Prompt Forge model" value={model} onChange={(event) => setModel(event.target.value)} className={fieldClass}>
                  <option value="">Llama 3.2 not installed</option>
                  {(catalog?.models || []).map((entry) => <option key={entry.id} value={entry.id} disabled={entry.disabled}>{entry.label}</option>)}
                </UmbraSelectControl>
                <button type="button" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 text-zinc-300 hover:border-fuchsia-300/40 hover:bg-white/5 disabled:opacity-40"
                  title="Open Prompt Forge model folder" aria-label="Open Prompt Forge model folder" disabled={isUmbraRemoteClient()}
                  onClick={() => void openH3PromptForgeModelFolder().catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not open model folder.'))}>
                  <FolderOpen size={15} />
                </button>
                <button type="button" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/15 text-zinc-300 hover:border-fuchsia-300/40 hover:bg-white/5 disabled:opacity-40"
                  title="Refresh Prompt Forge models" aria-label="Refresh Prompt Forge models" disabled={!comfyConnected}
                  onClick={() => setCatalogRefresh((current) => current + 1)}><RefreshCw size={15} /></button>
              </div>
            </div>
            <label className="text-xs text-zinc-400">Detail
              <input type="number" min={1} max={10} value={detail} onChange={(event) => setDetail(Math.max(1, Math.min(10, Number(event.target.value) || 1)))} className={`${fieldClass} mt-1`} />
            </label>
            <label className="min-w-0 text-xs text-zinc-400">Creativity
              <UmbraSelectControl value={creativity} onChange={(event) => setCreativity(event.target.value)} className={`${fieldClass} mt-1`}>
                {(catalog?.creativity || ['balanced']).map((entry) => <option key={entry} value={entry}>{entry}</option>)}
              </UmbraSelectControl>
            </label>
          </div>
          <p className="text-xs text-zinc-500">Text-only model: describe reference images in your idea or reference notes.</p>
          {localModel ? <>
            <UmbraH3ForgeDeviceControl value={computeDevice} onChange={(value) => { setComputeDevice(value); setDraft(''); }} disabled={drafting || !supportsComputeDevice} />
            {!supportsComputeDevice ? <p role="status" className="text-xs text-amber-300">Update DaSiWa H3 nodes in Umbra Updater and restart ComfyUI for local Llama support.</p> : null}
          </> : null}
          {error ? <p role="status" className="text-xs text-amber-300">{error}</p> : null}
          <H3ForgeRawResponse raw={rawResponse} />
          <div className="flex gap-2">
            <button type="button" className={buttonClass} disabled={disabled || !comfyConnected || !model || !brief.trim() || drafting || (localModel && !supportsComputeDevice)} onClick={() => void forge()}>
              {drafting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}{drafting ? 'Drafting...' : 'Draft prompt'}
            </button>
            {drafting ? <button type="button" className={buttonClass} onClick={cancel}>Cancel draft</button> : null}
          </div>
          {draft ? <div className="space-y-2 border-t border-white/10 pt-3">
            <label className="block text-xs text-zinc-400">Draft
              <textarea aria-label="Prompt Forge draft" className={`${fieldClass} mt-1 min-h-40 resize-y`} value={draft} onChange={(event) => setDraft(event.target.value)} />
            </label>
            <button type="button" className={buttonClass} disabled={disabled || !draft.trim()} onClick={() => { if (!disabled) { onApplyPrompt(draft.trim()); onClose(); } }}>Use prompt</button>
          </div> : null}
        </div>
      </div>
  );
  return inline ? panel : createPortal(
    <div data-umbra-modal-root="" className="fixed inset-0 z-[240] flex items-center justify-center bg-black/80 p-3" onMouseDown={(event) => { if (event.target === event.currentTarget && !drafting) onClose(); }}>{panel}</div>, document.body,
  );
}
