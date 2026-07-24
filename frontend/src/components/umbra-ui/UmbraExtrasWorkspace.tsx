'use client';

import React from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertTriangle,
  CheckCircle2,
  FolderOpen,
  ImageUp,
  Layers3,
  ListPlus,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import {
  fetchUmbraUiUpscaleJob,
  submitUmbraUiUpscaleJob,
  UMBRA_UI_UPSCALE_ACTIVE_JOB_KEY,
  UMBRA_UI_UPSCALE_HANDOFF_KEY,
  type UmbraUiUpscaleHandoff,
  type UmbraUiUpscaleJob,
} from '@/lib/umbraUiUpscale';
import type {
  UmbraQueuePlacement,
  UmbraQueueSummary,
} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import {
  UmbraQueuePlacementControls,
  useUmbraQueuePlacement,
} from '@/components/umbra-ui/UmbraQueuePlacementControls';
import { UmbraMobileWorkspaceSheet } from '@/components/umbra-ui/UmbraMobileWorkspaceSheet';

const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)$/i;
const MAX_UPSCALE_BATCH_ITEMS = 512;
const TERMINAL_JOB_STATUSES = new Set(['completed', 'partial', 'failed']);
const OUTPUT_FOLDER_STORAGE_KEY = 'umbra-ui:extras-output-folder';
const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500';

interface StagedUpscaleSource {
  id: string;
  name: string;
  path: string;
  file?: File;
  previewUrl: string;
}

interface UmbraExtrasWorkspaceProps {
  active?: boolean;
  upscaleModels: string[];
  modelName: string;
  maxDimension: number;
  onModelNameChange: (value: string) => void;
  onMaxDimensionChange: (value: number) => void;
  comfyConnected: boolean;
  queueSummary: UmbraQueueSummary;
  onOpenPowerPrompter: () => void;
}

function createSourceId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`; }
}

function buildPathPreview(path: string): string {
  return `/api/fs/thumbnail?${new URLSearchParams({ path, size: 'small', q: '90', fit: 'cover', lane: 'umbra-ui-extras' }).toString()}`;
}

function normalizeHandoff(value: unknown): UmbraUiUpscaleHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const path = String(source.path || '').trim();
  if (!path || !IMAGE_EXTENSION_PATTERN.test(path)) return null;
  return {
    path,
    name: String(source.name || path.replace(/\\/g, '/').split('/').pop() || 'Image').trim(),
    imageUrl: String(source.imageUrl || '').trim(),
    autoStart: source.autoStart === true,
    createdAt: Number(source.createdAt) || Date.now(),
  };
}

function isTerminalJob(job: UmbraUiUpscaleJob | null): boolean {
  return !!job && TERMINAL_JOB_STATUSES.has(job.status);
}

function JobStatusIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle2 size={12} className="text-emerald-300" />;
  if (status === 'failed') return <AlertTriangle size={12} className="text-red-300" />;
  return <Loader2 size={12} className="animate-spin text-cyan-300" />;
}

export function UmbraExtrasWorkspace({
  active = true,
  upscaleModels,
  modelName,
  maxDimension,
  onModelNameChange,
  onMaxDimensionChange,
  comfyConnected,
  queueSummary,
  onOpenPowerPrompter,
}: UmbraExtrasWorkspaceProps) {
  const showToast = useStore((state) => state.showToast);
  const [sources, setSources] = React.useState<StagedUpscaleSource[]>([]);
  const [job, setJob] = React.useState<UmbraUiUpscaleJob | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const { placement, setPlacement, effectivePlacement } = useUmbraQueuePlacement(queueSummary);
  const [stageProgress, setStageProgress] = React.useState({ completed: 0, total: 0 });
  const [pendingAutoStartPath, setPendingAutoStartPath] = React.useState('');
  const [outputFolder, setOutputFolder] = React.useState(() => {
    if (typeof window === 'undefined') return '';
    try { return window.localStorage.getItem(OUTPUT_FOLDER_STORAGE_KEY) || ''; } catch { return ''; }
  });
  const [browsingOutputFolder, setBrowsingOutputFolder] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const folderInputRef = React.useRef<HTMLInputElement | null>(null);
  const sourceListRef = React.useRef<HTMLDivElement | null>(null);
  const objectUrlsRef = React.useRef(new Set<string>());
  const modelChoices = React.useMemo(() => Array.from(new Set([modelName, ...upscaleModels].filter(Boolean))), [modelName, upscaleModels]);
  const remoteClient = isUmbraRemoteClient();

  React.useEffect(() => {
    if (remoteClient) return;
    try { window.localStorage.setItem(OUTPUT_FOLDER_STORAGE_KEY, outputFolder); } catch { /* best effort */ }
  }, [outputFolder, remoteClient]);

  const browseOutputFolder = React.useCallback(async () => {
    if (remoteClient || browsingOutputFolder) return;
    setBrowsingOutputFolder(true);
    try {
      const response = await fetch('/api/umbra-ui/upscale/browse-output-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDir: outputFolder, title: 'Select Upscale Output Folder' }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(String(payload?.error || `Folder picker failed (${response.status}).`));
      const selectedPath = String(payload?.path || '').trim();
      if (selectedPath) setOutputFolder(selectedPath);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to open the folder picker.', 'error');
    } finally {
      setBrowsingOutputFolder(false);
    }
  }, [browsingOutputFolder, outputFolder, remoteClient, showToast]);

  const addHandoff = React.useCallback((handoff: UmbraUiUpscaleHandoff) => {
    setSources((current) => {
      if (current.some((source) => source.path && source.path.toLowerCase() === handoff.path.toLowerCase())) return current;
      return [...current, {
        id: createSourceId(),
        name: handoff.name,
        path: handoff.path,
        previewUrl: handoff.imageUrl || buildPathPreview(handoff.path),
      }];
    });
    if (handoff.autoStart) setPendingAutoStartPath(handoff.path);
  }, []);

  React.useEffect(() => {
    const consume = (rawValue: unknown) => {
      const handoff = normalizeHandoff(rawValue);
      if (handoff) addHandoff(handoff);
    };
    try {
      consume(JSON.parse(window.sessionStorage.getItem(UMBRA_UI_UPSCALE_HANDOFF_KEY) || 'null'));
      window.sessionStorage.removeItem(UMBRA_UI_UPSCALE_HANDOFF_KEY);
    } catch { /* best effort */ }
    const onHandoff = (event: Event) => {
      consume((event as CustomEvent).detail);
      try { window.sessionStorage.removeItem(UMBRA_UI_UPSCALE_HANDOFF_KEY); } catch { /* best effort */ }
    };
    window.addEventListener('umbra:umbra-ui-upscale-handoff', onHandoff);
    return () => window.removeEventListener('umbra:umbra-ui-upscale-handoff', onHandoff);
  }, [addHandoff]);

  React.useEffect(() => {
    let canceled = false;
    let storedJobId = '';
    try { storedJobId = window.sessionStorage.getItem(UMBRA_UI_UPSCALE_ACTIVE_JOB_KEY) || ''; } catch { /* best effort */ }
    if (!storedJobId) return;
    void fetchUmbraUiUpscaleJob(storedJobId)
      .then((savedJob) => { if (!canceled) setJob(savedJob); })
      .catch(() => {
        try { window.sessionStorage.removeItem(UMBRA_UI_UPSCALE_ACTIVE_JOB_KEY); } catch { /* best effort */ }
      });
    return () => { canceled = true; };
  }, []);

  React.useEffect(() => {
    if (!job || isTerminalJob(job)) return;
    const controller = new AbortController();
    let timer = 0;
    const poll = async () => {
      try {
        const nextJob = await fetchUmbraUiUpscaleJob(job.id, controller.signal);
        setJob(nextJob);
        if (isTerminalJob(nextJob)) {
          window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
          showToast(
            nextJob.status === 'completed'
              ? `${nextJob.completed} image${nextJob.completed === 1 ? '' : 's'} upscaled.`
              : `Upscale finished with ${nextJob.failed} failed item${nextJob.failed === 1 ? '' : 's'}.`,
            nextJob.status === 'completed' ? 'success' : 'error',
          );
          return;
        }
        timer = window.setTimeout(poll, 1000);
      } catch (error) {
        if (controller.signal.aborted) return;
        showToast(error instanceof Error ? error.message : 'Failed to read upscale progress.', 'error');
      }
    };
    timer = window.setTimeout(poll, 500);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [job?.id, job?.status, showToast]);

  React.useEffect(() => () => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  const addFiles = React.useCallback((files: FileList | null, preserveRelativePath = false) => {
    if (!files) return;
    const availableSlots = Math.max(0, MAX_UPSCALE_BATCH_ITEMS - sources.length);
    const next: StagedUpscaleSource[] = [];
    let supportedCount = 0;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !IMAGE_EXTENSION_PATTERN.test(file.name)) continue;
      supportedCount += 1;
      if (next.length >= availableSlots) continue;
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      next.push({
        id: createSourceId(),
        name: preserveRelativePath && file.webkitRelativePath ? file.webkitRelativePath : file.name,
        path: '',
        file,
        previewUrl,
      });
    }
    if (next.length > 0) setSources((current) => [...current, ...next]);
    if (supportedCount > next.length) {
      showToast(`Upscale batches are limited to ${MAX_UPSCALE_BATCH_ITEMS} images.`, 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  }, [showToast, sources.length]);

  const removeSource = React.useCallback((id: string) => {
    setSources((current) => {
      const removed = current.find((source) => source.id === id);
      if (removed?.previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(removed.previewUrl);
        objectUrlsRef.current.delete(removed.previewUrl);
      }
      return current.filter((source) => source.id !== id);
    });
  }, []);

  const clearSources = React.useCallback(() => {
    setSources((current) => {
      for (const source of current) {
        if (!source.previewUrl.startsWith('blob:')) continue;
        URL.revokeObjectURL(source.previewUrl);
        objectUrlsRef.current.delete(source.previewUrl);
      }
      return [];
    });
  }, []);

  const removeSubmittedSources = React.useCallback((submittedSources: StagedUpscaleSource[]) => {
    const submittedIds = new Set(submittedSources.map((source) => source.id));
    setSources((current) => {
      for (const source of current) {
        if (!submittedIds.has(source.id) || !source.previewUrl.startsWith('blob:')) continue;
        URL.revokeObjectURL(source.previewUrl);
        objectUrlsRef.current.delete(source.previewUrl);
      }
      return current.filter((source) => !submittedIds.has(source.id));
    });
  }, []);

  const runSources = React.useCallback(async (
    selectedSources: StagedUpscaleSource[],
    requestedPlacement: UmbraQueuePlacement = effectivePlacement,
  ) => {
    if (submitting || selectedSources.length <= 0) return;
    if (!comfyConnected) {
      showToast('Start ComfyUI before queueing an upscale.', 'error');
      return;
    }
    const queuePlacement = queueSummary.powerPrompterActive ? requestedPlacement : 'end';
    if (queuePlacement === 'interrupt' && !window.confirm(
      'Stop the current Power Prompter image and run this upscale batch next?',
    )) return;
    setSubmitting(true);
    setStageProgress({ completed: 0, total: selectedSources.filter((source) => !!source.file).length });
    try {
      const nextJob = await submitUmbraUiUpscaleJob({
        paths: selectedSources.map((source) => source.path).filter(Boolean),
        files: selectedSources.map((source) => source.file).filter((file): file is File => !!file),
        modelName,
        maxDimension,
        outputFolder: remoteClient ? '' : outputFolder,
        queuePlacement,
        onStageProgress: (completed, total) => setStageProgress({ completed, total }),
      });
      setJob(nextJob);
      try { window.sessionStorage.setItem(UMBRA_UI_UPSCALE_ACTIVE_JOB_KEY, nextJob.id); } catch { /* best effort */ }
      removeSubmittedSources(selectedSources);
      const placementMessage = queuePlacement === 'next'
        ? 'will run after the current Power Prompter image.'
        : queuePlacement === 'interrupt'
          ? 'will run as soon as the current Power Prompter image stops.'
          : queueSummary.powerPrompterActive
            ? 'was added after the Power Prompter queue.'
            : 'was submitted.';
      showToast(`${nextJob.total} upscale${nextJob.total === 1 ? '' : 's'} ${placementMessage}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue upscale batch.', 'error');
    } finally {
      setSubmitting(false);
      setStageProgress({ completed: 0, total: 0 });
    }
  }, [
    comfyConnected,
    effectivePlacement,
    maxDimension,
    modelName,
    outputFolder,
    queueSummary.powerPrompterActive,
    remoteClient,
    removeSubmittedSources,
    showToast,
    submitting,
  ]);

  React.useEffect(() => {
    if (!pendingAutoStartPath || submitting) return;
    const source = sources.find((candidate) => candidate.path.toLowerCase() === pendingAutoStartPath.toLowerCase());
    if (!source) return;
    setPendingAutoStartPath('');
    void runSources([source]);
  }, [pendingAutoStartPath, runSources, sources, submitting]);

  const rowVirtualizer = useVirtualizer({
    count: sources.length,
    getScrollElement: () => sourceListRef.current,
    estimateSize: () => 66,
    overscan: 8,
  });
  const progressUnits = job ? job.completed + job.failed : 0;
  const progress = job?.total ? Math.max(0, Math.min(1, progressUnits / job.total)) : 0;

  return (
    <div data-umbra-ui-extras="" className="col-span-2 grid min-h-0 grid-cols-[minmax(280px,340px)_minmax(0,1fr)]">
      <section data-umbra-ui-extras-controls="" className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar">
        <div className="mb-3 flex items-center gap-2">
          <ImageUp size={13} className="text-cyan-300" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">Upscale</h2>
          <span className="ml-auto font-mono text-[9px] text-zinc-600">{sources.length} staged</span>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className={labelClass}>Upscale Model</span>
            <select value={modelName} onChange={(event) => onModelNameChange(event.target.value)} className={inputClass}>
              {modelChoices.map((model) => <option key={model} value={model}>{model}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5">
            <span className={labelClass}>Maximum Edge</span>
            <input
              type="number"
              min={512}
              max={16384}
              step={8}
              value={maxDimension}
              onChange={(event) => onMaxDimensionChange(Math.max(512, Math.min(16384, Number(event.target.value) || 512)))}
              className={inputClass}
            />
          </label>

          <div className={cn('space-y-1.5', remoteClient && 'opacity-45')}>
            <div className="flex items-center gap-2">
              <span className={labelClass}>Output Folder</span>
              {remoteClient ? <span className="ml-auto rounded-sm border border-white/10 px-1.5 py-0.5 font-mono text-[8px] uppercase text-zinc-600">Host only</span> : null}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_34px_34px] gap-1.5">
              <input
                value={outputFolder || 'Umbra UI/extras (dated)'}
                readOnly
                disabled={remoteClient}
                className={cn(inputClass, 'truncate font-mono text-[10px]', !outputFolder && 'text-zinc-500')}
                title={outputFolder || 'Default Umbra UI extras output'}
              />
              <button
                type="button"
                onClick={() => void browseOutputFolder()}
                disabled={remoteClient || browsingOutputFolder}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-400 hover:border-cyan-300/30 hover:text-cyan-100 disabled:cursor-not-allowed disabled:text-zinc-700"
                title={remoteClient ? 'Choose output folders from the host PC' : 'Choose output folder'}
              >
                {browsingOutputFolder ? <Loader2 size={12} className="animate-spin" /> : <FolderOpen size={12} />}
              </button>
              <button
                type="button"
                onClick={() => setOutputFolder('')}
                disabled={remoteClient || !outputFolder}
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-white/[0.03] text-zinc-500 hover:border-red-300/25 hover:text-red-200 disabled:cursor-not-allowed disabled:text-zinc-700"
                title="Use default dated output folder"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.avif,.bmp,.gif,.jpg,.jpeg,.png,.tif,.tiff,.webp"
            onChange={(event) => addFiles(event.target.files)}
            className="hidden"
          />
          <input
            ref={(element) => {
              folderInputRef.current = element;
              if (!element) return;
              element.setAttribute('webkitdirectory', '');
              element.setAttribute('directory', '');
            }}
            type="file"
            multiple
            accept="image/*,.avif,.bmp,.gif,.jpg,.jpeg,.png,.tif,.tiff,.webp"
            onChange={(event) => addFiles(event.target.files, true)}
            className="hidden"
          />
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] text-[9px] font-black uppercase tracking-[0.12em] text-zinc-300 hover:border-cyan-300/30 hover:text-cyan-100"
            >
              <Plus size={11} /> Add Images
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] text-[9px] font-black uppercase tracking-[0.12em] text-zinc-300 hover:border-cyan-300/30 hover:text-cyan-100"
            >
              <FolderOpen size={11} /> Add Folder
            </button>
            <button
              type="button"
              onClick={clearSources}
              disabled={sources.length <= 0 || submitting}
              className="col-span-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.03] text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500 hover:border-red-300/25 hover:text-red-200 disabled:opacity-30"
            >
              <Trash2 size={11} /> Clear
            </button>
          </div>
          <div className="space-y-2">
            <UmbraQueuePlacementControls
              queueSummary={queueSummary}
              value={placement}
              onChange={setPlacement}
              subject="upscale batch"
            />
            <button
              type="button"
              onClick={() => void runSources(sources, effectivePlacement)}
              disabled={sources.length <= 0 || submitting || !comfyConnected}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/30 bg-cyan-500/[0.1] text-[10px] font-black uppercase tracking-[0.16em] text-cyan-100 transition-colors hover:bg-cyan-500/[0.16] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            >
              {submitting ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {submitting && stageProgress.total > 0
                ? `Staging ${stageProgress.completed}/${stageProgress.total}`
                : 'Run Upscale Batch'}
            </button>
            <button
              type="button"
              onClick={onOpenPowerPrompter}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.025] text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400 transition-colors hover:border-cyan-300/30 hover:text-cyan-100"
            >
              <ListPlus size={12} />
              Open Power Prompter
            </button>
          </div>
        </div>

        {job ? (
          <div className="mt-4 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2">
              <JobStatusIcon status={job.status} />
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Latest Job</span>
              <span className="ml-auto font-mono text-[9px] text-zinc-500">{progressUnits}/{job.total}</span>
            </div>
            <div className="mt-2 h-1 overflow-hidden bg-white/10">
              <div className="h-full bg-cyan-300 transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[8px] uppercase text-zinc-600">
              <span>{job.status}</span>
              <span>{job.failed > 0 ? `${job.failed} failed` : job.modelName}</span>
            </div>
          </div>
        ) : null}
      </section>

      <UmbraMobileWorkspaceSheet
        active={active}
        title="Upscale Batch"
        subtitle={sources.length > 0
          ? `${sources.length} image${sources.length === 1 ? '' : 's'} staged`
          : job
            ? `${progressUnits}/${job.total} ${job.status}`
            : 'No images staged'}
        badge={sources.length > 0 ? `${sources.length}` : undefined}
        icon={<Layers3 size={14} />}
        thumbnailUrl={sources[0]?.previewUrl}
        tone="amber"
      >
        <main data-umbra-ui-extras-batch="" className="flex min-h-0 min-w-0 flex-col bg-black/20">
        <div className="flex min-h-10 items-center gap-2 border-b border-white/10 px-3">
          <Layers3 size={13} className="text-zinc-500" />
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-400">Batch</span>
          <span className="rounded-sm border border-cyan-300/20 bg-cyan-500/[0.05] px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-200">Serial</span>
          <span className="ml-auto font-mono text-[9px] text-zinc-600">{sources.length} images</span>
        </div>

        {sources.length > 0 ? (
          <div ref={sourceListRef} className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
            <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const source = sources[virtualRow.index];
                if (!source) return null;
                return (
                  <div
                    key={source.id}
                    ref={rowVirtualizer.measureElement}
                    data-index={virtualRow.index}
                    className="absolute left-0 top-0 w-full pb-1.5"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
                    <div className="flex h-[60px] items-center gap-2 border border-white/10 bg-white/[0.025] px-2">
                      <img src={source.previewUrl} alt="" className="h-11 w-14 shrink-0 object-cover bg-black/40" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[9px] font-bold text-zinc-300">{source.name}</div>
                        <div className="mt-1 font-mono text-[8px] uppercase text-zinc-600">{source.file ? 'Local file' : 'Umbra output'}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeSource(source.id)}
                        disabled={submitting}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-zinc-600 hover:text-red-200 disabled:opacity-30"
                        title="Remove image"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : job ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
            <div className="space-y-1.5">
              {job.items.map((item) => (
                <div key={item.id} className="flex min-h-12 items-center gap-2 border border-white/10 bg-white/[0.025] px-2.5">
                  <JobStatusIcon status={item.status} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[9px] font-bold text-zinc-300">{item.name}</div>
                    <div className={cn('truncate font-mono text-[8px] uppercase', item.error ? 'text-red-300/70' : 'text-zinc-600')}>
                      {item.error || item.status}
                    </div>
                  </div>
                  {item.outputs[0]?.fullpath ? (
                    <img
                      src={`/api/fs/thumbnail?${new URLSearchParams({ path: item.outputs[0].fullpath, size: 'small', q: '90', fit: 'cover', lane: 'umbra-ui-extras-result' }).toString()}`}
                      alt=""
                      className="h-9 w-12 shrink-0 object-cover bg-black/40"
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center text-zinc-700">
            <div className="text-center">
              <ImageUp size={28} className="mx-auto mb-2" />
              <div className="text-[10px] font-black uppercase tracking-[0.16em]">No images staged</div>
            </div>
          </div>
        )}
        </main>
      </UmbraMobileWorkspaceSheet>
    </div>
  );
}

export default UmbraExtrasWorkspace;
