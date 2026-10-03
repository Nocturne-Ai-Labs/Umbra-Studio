'use client';

import { prepareOfficialVideoResolution } from '@/lib/officialVideoResolution';

import React from 'react';
import { Camera, Clapperboard, ExternalLink, Loader2, PanelRight, Play, RefreshCw, Upload } from 'lucide-react';
import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import { pushAppSettingsToBackend, saveAppSettings } from '@/lib/appSettings';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { normalizeVideoRoutePolicy } from '../../../../shared/umbra-ui/videoRoutePolicy';
import type { UmbraOfficialVideoQueueOptions } from './useUmbraPowerPrompterBridge';
import { createOfficialVideoEditorDraft, configureOfficialVideoEditor, type OfficialVideoEditorDraft } from '../../../../shared/umbra-ui/officialVideoEditor';
import { UmbraOfficialVideoEditor } from './UmbraOfficialVideoEditor';

type OfficialWorkflowId = UmbraOfficialVideoQueueOptions['workflowId'];
interface OfficialWorkflow {
  id: OfficialWorkflowId;
  name: string;
  sourceUrl: string;
  sourceCommit: string;
  sha256: string;
  license: string;
  readiness: { ready: boolean; issues: string[] };
}
interface NativeCapture {
  workflow: Record<string, unknown>;
  promptGraph: Record<string, unknown>;
  sourceSha256: string;
  serializer: 'comfy-native-v1';
}
interface CapturedWorkflow {
  captureId: string;
  workflowId: OfficialWorkflowId;
  prompt: string;
  name: string;
}
interface UmbraOfficialVideoWorkflowPanelProps {
  queueConnected: boolean;
  comfyConnected: boolean;
  queueOfficialVideo: (options: UmbraOfficialVideoQueueOptions) => Promise<string>;
  preview: React.ReactNode;
  review: React.ReactNode;
}

const buttonClass = 'inline-flex min-h-9 items-center justify-center gap-2 rounded border border-white/15 px-3 text-[11px] font-bold text-[var(--umbra-text)] hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)] disabled:cursor-not-allowed disabled:opacity-40';
const labelClass = 'text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400';
const MAX_NATIVE_EXPORT_BYTES = 16 * 1024 * 1024;
const isWorkflowId = (value: unknown): value is OfficialWorkflowId => value === 'h3-26' || value === 'ltx23-50';
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error || 'Official workflow action failed.');
const draftStorageKey = (item: OfficialWorkflow) => `umbra.official-video-draft.${item.id}.${item.sha256}`;
function restoredDraft(item: OfficialWorkflow, fallback: OfficialVideoEditorDraft): OfficialVideoEditorDraft {
  try {
    const saved = window.localStorage.getItem(draftStorageKey(item));
    if (!saved || saved.length > 1024 * 1024) return fallback;
    const draft = JSON.parse(saved) as OfficialVideoEditorDraft;
    if (typeof draft?.prompt !== 'string' || typeof draft.mode !== 'string' || typeof draft.seed !== 'string'
      || ![draft.width, draft.height, draft.durationSeconds, draft.frameRate].every(value => typeof value === 'number' && Number.isFinite(value))
      || !draft.values || typeof draft.values !== 'object' || Array.isArray(draft.values)
      || Object.values(draft.values).some(value => !['string', 'number', 'boolean'].includes(typeof value))
      || !Array.isArray(draft.references) || draft.references.length > 128
      || draft.references.some(reference => !reference || typeof reference.id !== 'string' || typeof reference.filename !== 'string'
        || !['image', 'video', 'audio'].includes(reference.kind) || typeof reference.prompt !== 'string'
        || ![reference.startSeconds, reference.durationSeconds].every(value => typeof value === 'number' && Number.isFinite(value)))) return fallback;
    return draft;
  } catch { return fallback; }
}

export function UmbraOfficialVideoWorkflowPanel({ queueConnected, comfyConnected, queueOfficialVideo, preview, review }: UmbraOfficialVideoWorkflowPanelProps) {
  const [items, setItems] = React.useState<OfficialWorkflow[]>([]);
  const [selectedId, setSelectedId] = React.useState<OfficialWorkflowId>('h3-26');
  const [loading, setLoading] = React.useState(true);
  const [catalogError, setCatalogError] = React.useState('');
  const [actionError, setActionError] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [busy, setBusy] = React.useState<'opening' | 'capturing' | 'importing' | 'queueing' | ''>('');
  const [policySaving, setPolicySaving] = React.useState(false);
  const [loadedId, setLoadedId] = React.useState<OfficialWorkflowId | null>(null);
  const [captured, setCaptured] = React.useState<CapturedWorkflow | null>(null);
  const [workflowFile, setWorkflowFile] = React.useState<File | null>(null);
  const [apiFile, setApiFile] = React.useState<File | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(() => window.innerWidth >= 1100);
  const [editors, setEditors] = React.useState<Partial<Record<OfficialWorkflowId, { sourceText: string; source: Record<string, unknown>; draft: OfficialVideoEditorDraft }>>>({});
  const [editorError, setEditorError] = React.useState('');
  const [settingsError, setSettingsError] = React.useState('');
  const [nodeCatalog, setNodeCatalog] = React.useState<Record<string, unknown>>({});
  const [mediaBusy, setMediaBusy] = React.useState(false);
  const backgroundLoadRef = React.useRef(false);
  const operationRef = React.useRef(false);
  const loadRequestRef = React.useRef('');
  const mountedRef = React.useRef(true);
  const reviewId = React.useId();
  const selected = items.find(item => item.id === selectedId);
  const editor = editors[selectedId];

  React.useEffect(() => { setWorkflowFile(null); setApiFile(null); }, [selectedId]);

  React.useEffect(() => {
    if (!selected || editor) return;
    const abort = new AbortController();
    setEditorError('');
    void fetch(`/api/video/official-workflows/${selected.id}/source`, { cache: 'no-store', signal: abort.signal })
      .then(async response => {
        if (!response.ok) throw new Error(`Official source could not be loaded (${response.status}).`);
        const sourceText = await response.text();
        const source = JSON.parse(sourceText) as Record<string, unknown>;
        const draft = restoredDraft(selected, createOfficialVideoEditorDraft(selected.id, source));
        if (!abort.signal.aborted) setEditors(current => ({ ...current, [selected.id]: { sourceText, source, draft } }));
      }).catch(error => { if (!abort.signal.aborted) setEditorError(errorText(error)); });
    return () => abort.abort();
  }, [selected, editor]);

  React.useEffect(() => {
    if (!comfyConnected) { setNodeCatalog({}); setSettingsError(''); return; }
    const abort = new AbortController();
    let retryTimer: number | undefined;
    let attempts = 0;
    const loadCatalog = async () => {
      try {
        const response = await fetch('/comfy/object_info', { cache: 'no-store', signal: abort.signal });
        if (!response.ok) throw new Error('Installed video settings could not be checked.');
        const catalog = await response.json();
        if (!abort.signal.aborted) { setNodeCatalog(catalog); setSettingsError(''); }
      } catch (error) {
        if (abort.signal.aborted) return;
        if (++attempts < 10) retryTimer = window.setTimeout(() => void loadCatalog(), 3000);
        else setSettingsError(errorText(error));
      }
    };
    void loadCatalog();
    return () => { abort.abort(); window.clearTimeout(retryTimer); };
  }, [comfyConnected, items]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setCatalogError('');
    try {
      const response = await fetch('/api/video/official-workflows', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) throw new Error(String(payload?.error || 'Official workflows could not be checked.'));
      const nextItems: OfficialWorkflow[] = (Array.isArray(payload?.items) ? payload.items : [])
        .filter((item: OfficialWorkflow) => isWorkflowId(item?.id))
        .map((item: OfficialWorkflow) => ({ ...item, readiness: { ready: item.readiness?.ready === true, issues: Array.isArray(item.readiness?.issues) ? item.readiness.issues.map(String) : ['Workflow readiness could not be verified.'] } }));
      if (!mountedRef.current) return;
      setItems(nextItems);
      setSelectedId(current => nextItems.some(item => item.id === current) ? current : nextItems[0]?.id || 'h3-26');
    } catch (error) {
      if (mountedRef.current) { setCatalogError(errorText(error)); setItems([]); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    mountedRef.current = true;
    void refresh();
    const onLoaded = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.loadRequestId !== loadRequestRef.current) return;
      if (backgroundLoadRef.current) return;
      setBusy('');
      if (detail.ok === true && isWorkflowId(detail.workflowId)) {
        setLoadedId(detail.workflowId);
        setStatus('Opened in ComfyUI. Configure the workflow there, then return to capture it.');
      } else setActionError(String(detail?.error || 'ComfyUI could not load the official workflow.'));
    };
    window.addEventListener('umbra:official-workflow-loaded', onLoaded);
    return () => { mountedRef.current = false; window.removeEventListener('umbra:official-workflow-loaded', onLoaded); };
  }, [refresh]);

  const openComfy = () => useStore.getState().setActiveWorkspace('comfyui');
  const openWorkflow = async () => {
    if (!selected || busy) return;
    setBusy('opening'); setActionError(''); setStatus(''); setCaptured(null);
    try {
      const response = await fetch(`/api/video/official-workflows/${selected.id}/source`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Official source could not be loaded (${response.status}).`);
      const sourceText = await response.text();
      if (!sourceText.trim()) throw new Error('The official source is empty.');
      if (!mountedRef.current) return;
      const payload = { sourceText, officialWorkflowId: selected.id, workflowId: selected.id, workflowName: selected.name, sourceSha256: selected.sha256, loadRequestId: crypto.randomUUID() };
      loadRequestRef.current = payload.loadRequestId;
      // The persisted handoff is consumed only after this explicit load action.
      window.sessionStorage.setItem('umbra.pendingComfyWorkflowLoad', JSON.stringify(payload));
      openComfy();
      window.dispatchEvent(new CustomEvent('umbra:comfyui-load-workflow', { detail: payload }));
    } catch (error) { setActionError(errorText(error)); setBusy(''); }
  };

  const captureNative = async (item: OfficialWorkflow, saveLastFrame?: boolean): Promise<CapturedWorkflow> => {
      const native = await new Promise<NativeCapture>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error('Native capture timed out. Reload the video engine and retry.')), 21000);
        window.dispatchEvent(new CustomEvent('umbra:official-workflow-serialize', { detail: { workflowId: item.id,
          resolve: (value: NativeCapture) => { window.clearTimeout(timer); resolve(value); },
          reject: (error: unknown) => { window.clearTimeout(timer); reject(new Error(errorText(error))); },
        } }));
      });
      if (!mountedRef.current) throw new Error('The video workspace was closed.');
      if (native.serializer !== 'comfy-native-v1' || native.sourceSha256 !== item.sha256) throw new Error('Native capture does not match this official source. Reload the official workflow in ComfyUI.');
      const response = await fetch(`/api/video/official-workflows/${item.id}/capture`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...native, ...(saveLastFrame !== undefined ? { saveLastFrame } : {}) }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) throw new Error(String(payload?.error || 'The configured workflow could not be captured.'));
      if (!payload?.captureId || payload.workflowId !== item.id) throw new Error('The capture response did not identify the selected official workflow.');
      return { captureId: String(payload.captureId), workflowId: item.id, prompt: String(payload.prompt || ''), name: String(payload.name || item.name) };
  };
  const captureWorkflow = async () => {
    if (!selected?.readiness.ready || loadedId !== selectedId || busy) return;
    setBusy('capturing'); setActionError(''); setStatus(''); setCaptured(null);
    try {
      const next = await captureNative(selected);
      if (mountedRef.current) { setCaptured(next); setStatus('Configured snapshot captured.'); }
    } catch (error) { if (mountedRef.current) setActionError(errorText(error)); }
    finally { if (mountedRef.current) setBusy(''); }
  };

  const importWorkflow = async () => {
    if (!selected || !workflowFile || !apiFile || busy || policySaving) return;
    setBusy('importing'); setActionError(''); setStatus(''); setCaptured(null);
    try {
      if (workflowFile.size > MAX_NATIVE_EXPORT_BYTES || apiFile.size > MAX_NATIVE_EXPORT_BYTES) throw new Error('Each native JSON export must be 16 MiB or smaller.');
      const [workflowText, apiText] = await Promise.all([workflowFile.text(), apiFile.text()]);
      if (!mountedRef.current) return;
      const response = await fetch(`/api/video/official-workflows/${selected.id}/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workflowText, apiText, sourceSha256: selected.sha256 }),
      });
      const payload = await response.json();
      if (!response.ok || payload?.success === false) throw new Error(String(payload?.error || 'The native exports could not be imported.'));
      if (!payload?.captureId || payload.workflowId !== selected.id) throw new Error('The import response did not identify the selected official workflow.');
      if (mountedRef.current) { setCaptured({ captureId: String(payload.captureId), workflowId: selected.id, prompt: String(payload.prompt || ''), name: String(payload.name || selected.name) }); setStatus('Native exports imported. Review the captured snapshot before queueing.'); }
    } catch (error) { if (mountedRef.current) setActionError(errorText(error)); }
    finally { if (mountedRef.current) setBusy(''); }
  };

  const changePolicy = async (value: string) => {
    if (policySaving || busy) return;
    setPolicySaving(true); setActionError('');
    try {
      const patch = { 'video.routePolicy': normalizeVideoRoutePolicy(value) };
      await pushAppSettingsToBackend(patch);
      useStore.getState().applyAppSettings(saveAppSettings(patch));
    } catch (error) { setActionError(errorText(error)); }
    finally { if (mountedRef.current) setPolicySaving(false); }
  };
  const queueReason = !selected?.readiness.ready ? 'Resolve the workflow readiness issues first.' : !captured ? 'Capture from ComfyUI or import native exports first.' : !queueConnected ? 'Connecting to the shared queue.' : !comfyConnected ? 'ComfyUI is not connected.' : '';
  const queueCapture = async () => {
    if (!captured || queueReason || busy || policySaving) return;
    setBusy('queueing'); setActionError(''); setStatus('');
    try { await queueOfficialVideo({ captureId: captured.captureId, workflowId: captured.workflowId, prompt: captured.prompt }); if (mountedRef.current) setStatus('Captured workflow queued.'); }
    catch (error) { if (mountedRef.current) setActionError(errorText(error)); }
    finally { if (mountedRef.current) setBusy(''); }
  };

  const prepareEditorCapture = async (): Promise<CapturedWorkflow> => {
    if (!selected || !editor) throw new Error('The official video editor is still loading.');
    setBusy('opening');
    const preparedDraft = await prepareOfficialVideoResolution({ ...editor.draft, saveLastFrame: editor.draft.saveLastFrame !== false }, selected.id);
    if (!mountedRef.current) throw new Error('The video workspace was closed.');
    const configuredWorkflow = configureOfficialVideoEditor(editor.source, selected.id, preparedDraft);
    const payload = { sourceText: editor.sourceText, configuredWorkflow, background: true, officialWorkflowId: selected.id,
      workflowId: selected.id, workflowName: selected.name, sourceSha256: selected.sha256, loadRequestId: crypto.randomUUID() };
    loadRequestRef.current = payload.loadRequestId;
    backgroundLoadRef.current = true;
    setBusy('opening');
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { window.clearTimeout(timer); window.removeEventListener('umbra:official-workflow-loaded', onLoaded); };
        const onLoaded = (event: Event) => {
          const detail = (event as CustomEvent).detail;
          if (detail?.loadRequestId !== payload.loadRequestId) return;
          cleanup();
          if (detail.ok === true) resolve(); else reject(new Error(String(detail.error || 'The native video engine could not prepare this workflow.')));
        };
        const timer = window.setTimeout(() => { cleanup(); reject(new Error('The native video engine did not become ready. Restart managed ComfyUI and retry.')); }, 45000);
        window.addEventListener('umbra:official-workflow-loaded', onLoaded);
        try {
          window.sessionStorage.setItem('umbra.pendingComfyWorkflowLoad', JSON.stringify(payload));
          window.dispatchEvent(new CustomEvent('umbra:comfyui-load-workflow', { detail: payload }));
        } catch (error) { cleanup(); reject(error); }
      });
      if (!mountedRef.current) throw new Error('The video workspace was closed.');
      setLoadedId(selected.id); setBusy('capturing');
      return await captureNative(selected, preparedDraft.saveLastFrame);
    } finally { backgroundLoadRef.current = false; }
  };
  const generateFromEditor = async (queue = true) => {
    if (!selected?.readiness.ready || !editor || !comfyConnected || busy || policySaving || mediaBusy || operationRef.current || (queue && !queueConnected)) return;
    operationRef.current = true;
    setCaptured(null); setActionError(''); setStatus('');
    try {
      const next = await prepareEditorCapture();
      if (!mountedRef.current) return;
      setCaptured(next);
      if (queue) {
        setBusy('queueing');
        await queueOfficialVideo({ captureId: next.captureId, workflowId: next.workflowId, prompt: editor.draft.prompt || next.prompt });
      }
      if (mountedRef.current) setStatus(queue ? 'Video queued.' : 'Native configuration verified.');
    } catch (error) { if (mountedRef.current) setActionError(errorText(error)); }
    finally { operationRef.current = false; if (mountedRef.current) setBusy(''); }
  };

  return (
    <section data-umbra-official-video="" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--umbra-panel-bg)] text-[var(--umbra-text)]">
      <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2">
        <Clapperboard size={16} className="text-[var(--umbra-accent)]" /><h2 className={labelClass}>Video Studio</h2>
        <span className="min-w-0 flex-1 text-[11px] font-bold">Official DaSiWa</span>
        <UmbraSelectControl value="dasiwa-only" disabled={policySaving || !!busy} onChange={event => void changePolicy(event.target.value)} aria-label="Video routing policy" controlSize="sm" className="min-w-40 rounded border border-white/15 bg-black/20 px-2 text-[11px]">
          <option value="dasiwa-only">DaSiWa only</option><option value="all-routes">All video routes</option>
        </UmbraSelectControl>
        <button type="button" className={buttonClass} aria-expanded={reviewOpen} aria-controls={reviewId} onClick={() => setReviewOpen(!reviewOpen)}><PanelRight size={13} />Queue / Results</button>
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto custom-scrollbar xl:flex-row xl:overflow-hidden">
        <main className="min-h-0 min-w-0 flex-1 space-y-3 overflow-y-auto p-3 custom-scrollbar">
          <div className="flex items-center justify-between gap-2"><h3 className={labelClass}>Official workflows</h3><button type="button" className={buttonClass} disabled={loading || !!busy} onClick={() => void refresh()} aria-label="Refresh official workflow readiness"><RefreshCw size={13} />Check readiness</button></div>
          {loading ? <p role="status" className="flex items-center gap-2 py-3 text-xs text-zinc-400"><Loader2 size={15} className="animate-spin" />Checking official workflows…</p> : null}
          {catalogError ? <p role="alert" className="break-words text-xs text-red-300">{catalogError}</p> : null}
          {!loading && !catalogError && items.length === 0 ? <p role="status" className="py-3 text-xs text-zinc-400">No official workflows are available. Check readiness to retry.</p> : null}
          <div className="grid min-w-0 gap-2 md:grid-cols-2" role="group" aria-label="Official video workflow">
            {items.map(item => <button key={item.id} type="button" aria-pressed={selectedId === item.id} disabled={!!busy} onClick={() => { setSelectedId(item.id); setCaptured(null); setActionError(''); setStatus(''); }} className={cn('min-w-0 rounded border p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)] disabled:opacity-50', selectedId === item.id ? 'border-[var(--umbra-accent)] bg-[color-mix(in_srgb,var(--umbra-accent)_8%,transparent)]' : 'border-white/10 bg-black/15 hover:bg-white/5')}>
              <span className="block break-words text-xs font-bold">{item.name}</span><span className="mt-1 block text-[10px] text-zinc-400">{item.id === 'h3-26' ? 'C-MMH3-26' : 'C-LTX23-50'} · {item.readiness.ready ? 'Ready' : 'Setup required'}</span>
            </button>)}
          </div>
          {selected ? <section className="space-y-3 border-b border-white/10 pb-3" aria-label="Selected official workflow">
            <div className="flex flex-wrap items-center gap-2 text-[10px] text-zinc-400"><span>{selected.license}</span><span title={selected.sourceCommit}>Revision {selected.sourceCommit.slice(0, 10)}</span><span title={selected.sha256}>SHA-256 {selected.sha256.slice(0, 12)}</span><a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-8 items-center gap-1 text-[var(--umbra-accent)] hover:underline">Upstream source<ExternalLink size={12} /></a></div>
            {!selected.readiness.ready ? <div role="status" data-official-readiness-blocked="" className="space-y-1 text-xs text-amber-200"><h4 className={labelClass}>Setup required</h4>{selected.readiness.issues.map((issue, index) => <p key={`${index}:${issue}`} className="break-words">{issue}</p>)}</div> : null}
            {!comfyConnected ? <p className="text-xs text-zinc-400">ComfyUI is not connected. Open its workspace to use the managed controls.</p> : null}
          </section> : null}
          {editorError ? <p role="alert" className="text-xs text-red-300">{editorError}</p> : null}
          {settingsError ? <p role="alert" className="text-xs text-red-300">{settingsError}</p> : null}
          {editor ? <UmbraOfficialVideoEditor key={selectedId} workflowId={selectedId} source={editor.source} draft={editor.draft} catalog={nodeCatalog} disabled={!!busy || mediaBusy} comfyConnected={comfyConnected} preview={preview} onMediaBusyChange={setMediaBusy}
            onChange={draft => {
              setEditors(current => ({ ...current, [selectedId]: { ...editor, draft } }));
              if (selected) { try { window.localStorage.setItem(draftStorageKey(selected), JSON.stringify(draft)); } catch { /* In-memory editing works when storage is unavailable. */ } }
              setCaptured(null); setStatus(''); setActionError('');
            }} /> : <div className="min-h-44">{preview}</div>}
          <details className="border-t border-white/10 py-3">
          <summary className="cursor-pointer text-[11px] text-zinc-400">Advanced workflow tools</summary>
          <div className="flex flex-wrap gap-2 py-3"><button type="button" className={buttonClass} disabled={!!busy || !comfyConnected} onClick={() => void openWorkflow()}><ExternalLink size={13} />Load official workflow in ComfyUI</button><button type="button" className={buttonClass} onClick={openComfy}>Open ComfyUI</button><button type="button" className={buttonClass} disabled={!!busy || !selected?.readiness.ready || loadedId !== selectedId || !comfyConnected} onClick={() => void captureWorkflow()}><Camera size={13} />Capture from ComfyUI</button></div>
          {selected ? <section key={selected.id} className="space-y-2 py-3" aria-label="Import native ComfyUI exports">
            <h3 className={labelClass}>Import native exports</h3>
            <p className="text-[11px] text-zinc-400">Choose Workflow JSON and API JSON exported from the same configured workflow in ComfyUI. Maximum 16 MiB per file.</p>
            <div className="grid min-w-0 gap-3 md:grid-cols-2">
              <label className="min-w-0 space-y-1"><span className={labelClass}>Workflow JSON</span><input type="file" accept=".json,application/json" disabled={!!busy || policySaving} onChange={event => { setWorkflowFile(event.target.files?.[0] || null); setActionError(''); }} className="block min-w-0 w-full max-w-full rounded border border-white/15 bg-black/20 p-2 text-[11px] text-zinc-300 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)] disabled:opacity-40" /></label>
              <label className="min-w-0 space-y-1"><span className={labelClass}>API JSON</span><input type="file" accept=".json,application/json" disabled={!!busy || policySaving} onChange={event => { setApiFile(event.target.files?.[0] || null); setActionError(''); }} className="block min-w-0 w-full max-w-full rounded border border-white/15 bg-black/20 p-2 text-[11px] text-zinc-300 file:mr-2 file:rounded file:border-0 file:bg-white/10 file:px-2 file:py-1 file:text-[11px] file:text-zinc-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)] disabled:opacity-40" /></label>
            </div>
            <button type="button" className={buttonClass} disabled={!!busy || policySaving || !workflowFile || !apiFile} onClick={() => void importWorkflow()}><Upload size={13} />Import native exports</button>
          </section> : null}
          {captured ? <button type="button" className={buttonClass} disabled={!!queueReason || !!busy || policySaving} onClick={() => void queueCapture()}><Play size={14} />Queue captured workflow</button> : null}
          </details>
          {busy ? <p role="status" className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 size={14} className="animate-spin" />{busy === 'opening' ? 'Opening official workflow…' : busy === 'capturing' ? 'Capturing native configuration…' : busy === 'importing' ? 'Importing native exports…' : 'Waiting for queue acknowledgement…'}</p> : null}
          {actionError ? <p role="alert" className="break-words text-xs text-red-300">{actionError}</p> : null}
          {status ? <p role="status" className="text-xs text-zinc-400">{status}</p> : null}
        </main>
        <aside id={reviewId} hidden={!reviewOpen} aria-label="Video queue and results" className="min-h-72 min-w-0 shrink-0 border-t border-white/10 xl:w-80 xl:border-l xl:border-t-0">{review}</aside>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-white/10 bg-black/20 p-3">
        <button type="button" className={cn(buttonClass, 'border-[var(--umbra-accent)]')} disabled={!selected?.readiness.ready || !editor || !comfyConnected || !queueConnected || !!busy || mediaBusy || policySaving} onClick={() => void generateFromEditor()}><Play size={14} />Generate video</button>
        <button type="button" className={buttonClass} disabled={!selected?.readiness.ready || !editor || !comfyConnected || !!busy || mediaBusy || policySaving} onClick={() => void generateFromEditor(false)}><Camera size={14} />Verify video configuration</button>
        {!comfyConnected ? <p className="text-[11px] text-zinc-500">ComfyUI is not connected.</p> : null}
      </footer>
    </section>
  );
}
