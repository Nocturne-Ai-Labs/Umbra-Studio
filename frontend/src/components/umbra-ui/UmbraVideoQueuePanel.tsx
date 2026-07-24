'use client';

import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Loader2,
  Music2,
  Pencil,
  RefreshCw,
  RotateCcw,
  Settings2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import type {
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
  PowerPrompterVideoControls,
} from '@/types/powerPrompter';
import type {
  UmbraVideoQueueOptions,
  UmbraVideoReviewJob,
  UmbraVideoReviewOutput,
} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import type { UmbraVideoEditorDraft } from '@/components/umbra-ui/UmbraVideoGenerationControls';
import { UmbraSeedControls } from '@/components/umbra-ui/UmbraSeedControls';
import { normalizeUmbraUiSeed } from '@/lib/umbraUiSeed';

interface UmbraVideoQueuePanelProps {
  jobs: UmbraVideoReviewJob[];
  loading: boolean;
  error: string;
  queueVideo: (options: UmbraVideoQueueOptions) => Promise<string>;
  onLoadIntoEditor: (draft: UmbraVideoEditorDraft) => void;
  onRefresh: () => Promise<UmbraVideoReviewJob[]>;
}

const inputClass = 'w-full rounded-md border border-white/10 bg-black/45 px-3 py-2.5 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-fuchsia-300/45';
const labelClass = 'text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500';

function mediaUrl(path: string): string {
  return path ? `/api/fs/image?path=${encodeURIComponent(path)}` : '';
}

function LazyVideo({ src, controls = false, muted = false, className = '' }: {
  src: string;
  controls?: boolean;
  muted?: boolean;
  className?: string;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: '360px 0px' });
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="h-full w-full bg-black/45">
      {visible ? (
        <video
          src={src}
          controls={controls}
          muted={muted}
          preload="metadata"
          onClick={(event) => event.stopPropagation()}
          className={className}
        />
      ) : <div className="h-full w-full animate-pulse bg-white/[0.025]" />}
    </div>
  );
}

function cloneVideo(video: PowerPrompterVideoControls): PowerPrompterVideoControls {
  return {
    ...video,
    postprocess: { ...video.postprocess },
    wan: { ...video.wan },
    ltx: {
      ...video.ltx,
      keyframes: video.ltx.keyframes.map((keyframe) => ({ ...keyframe })),
    },
  };
}

function getReferences(video: PowerPrompterVideoControls) {
  return [
    video.sourceImagePath ? { id: 'first', label: 'First', path: video.sourceImagePath, type: 'image' as const } : null,
    video.middleImagePath ? { id: 'middle', label: 'Middle', path: video.middleImagePath, type: 'image' as const } : null,
    video.lastImagePath ? { id: 'last', label: 'Last', path: video.lastImagePath, type: 'image' as const } : null,
    ...video.ltx.keyframes
      .filter((keyframe) => keyframe.sourceImagePath)
      .map((keyframe) => ({ id: keyframe.id, label: `F${keyframe.frameIndex}`, path: keyframe.sourceImagePath, type: 'image' as const })),
    video.sourceVideoPath ? { id: 'video', label: 'Video', path: video.sourceVideoPath, type: 'video' as const } : null,
    video.sourceAudioPath ? { id: 'audio', label: 'Audio', path: video.sourceAudioPath, type: 'audio' as const } : null,
  ].filter((entry): entry is NonNullable<typeof entry> => !!entry);
}

function getPrimaryOutput(outputs: UmbraVideoReviewOutput[]): UmbraVideoReviewOutput | null {
  return outputs.find((output) => output.type === 'video')
    || outputs.find((output) => output.type === 'image')
    || outputs[0]
    || null;
}

function CardOutputPreview({ output }: { output: UmbraVideoReviewOutput }) {
  if (output.type === 'video') {
    return <LazyVideo src={mediaUrl(output.path)} controls className="h-full w-full object-contain" />;
  }
  if (output.type === 'image') {
    return <img src={mediaUrl(output.path)} alt={output.name} loading="lazy" className="h-full w-full object-contain" />;
  }
  if (output.type === 'audio') {
    return <div className="flex h-full items-center justify-center"><Music2 size={18} className="text-cyan-300/65" /></div>;
  }
  return <div className="flex h-full items-center justify-center font-mono text-[9px] text-zinc-600">FILE</div>;
}

function statusTone(status: UmbraVideoReviewJob['status']) {
  if (status === 'completed') return 'border-emerald-300/25 bg-emerald-500/[0.08] text-emerald-200';
  if (status === 'running' || status === 'submitting') return 'border-cyan-300/25 bg-cyan-500/[0.08] text-cyan-200';
  if (status === 'failed') return 'border-red-300/25 bg-red-500/[0.08] text-red-200';
  if (status === 'canceled' || status === 'interrupted') return 'border-amber-300/25 bg-amber-500/[0.08] text-amber-200';
  return 'border-white/10 bg-white/[0.035] text-zinc-400';
}

function StatusIcon({ status }: { status: UmbraVideoReviewJob['status'] }) {
  if (status === 'completed') return <CheckCircle2 size={12} />;
  if (status === 'running' || status === 'submitting') return <Loader2 size={12} className="animate-spin" />;
  if (status === 'failed') return <AlertTriangle size={12} />;
  return <Clock3 size={12} />;
}

function ReferenceStrip({ video, large = false }: { video: PowerPrompterVideoControls; large?: boolean }) {
  const references = getReferences(video);
  if (references.length <= 0) return null;
  return (
    <div className={cn('flex gap-1.5 overflow-x-auto border-b border-white/10 bg-black/30 p-1.5 custom-scrollbar', large ? 'min-h-24' : 'min-h-16')}>
      {references.map((reference) => (
        <div key={reference.id} className={cn('relative shrink-0 overflow-hidden border border-white/10 bg-black/50', large ? 'h-20 w-28' : 'h-12 w-16')}>
          {reference.type === 'image' ? (
            <img src={mediaUrl(reference.path)} alt={reference.label} loading="lazy" className="h-full w-full object-cover" />
          ) : reference.type === 'video' ? (
            <LazyVideo src={mediaUrl(reference.path)} muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center"><Music2 size={15} className="text-cyan-300/70" /></div>
          )}
          <span className="absolute inset-x-0 bottom-0 bg-black/75 px-1 py-0.5 text-center font-mono text-[8px] text-zinc-300">{reference.label}</span>
        </div>
      ))}
    </div>
  );
}

function SettingsChips({ video, seed, seedMode, seedIncrement }: {
  video: PowerPrompterVideoControls;
  seed: number;
  seedMode: string;
  seedIncrement: number;
}) {
  const chips = [
    video.family === 'wan22' ? 'Wan 2.2' : 'LTX-2.3',
    video.mode === 'video_to_video' ? 'VID2VID' : video.mode === 'image_to_video' ? 'IMG2VID' : 'TXT2VID',
    `${video.width}x${video.height}`,
    `${video.frames}f`,
    `${video.fps} FPS`,
    `Seed ${seed}`,
    seedMode !== 'fixed'
      ? `Seed ${seedMode}${seedMode === 'increment' ? ` +${seedIncrement.toLocaleString('en-US')}` : ''}`
      : '',
    video.mode === 'video_to_video' ? `Denoise ${video.denoise.toFixed(2)}` : '',
  ].filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {chips.map((chip) => <span key={chip} className="border border-white/10 bg-black/25 px-1.5 py-0.5 font-mono text-[9px] text-zinc-500">{chip}</span>)}
    </div>
  );
}

function VideoJobCard({ job, onOpen }: { job: UmbraVideoReviewJob; onOpen: () => void }) {
  const video = job.generation.video!;
  const primary = getPrimaryOutput(job.outputs);
  const visibleOutputs = job.outputs.slice(0, 4);
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onOpen();
      }}
      className="group overflow-hidden rounded-md border border-white/10 bg-white/[0.025] outline-none transition-colors hover:border-fuchsia-300/25 hover:bg-fuchsia-500/[0.025] focus:border-fuchsia-300/40"
      style={{ contentVisibility: 'auto', containIntrinsicSize: '420px' }}
    >
      <div className="flex min-h-9 items-center gap-2 border-b border-white/10 px-2.5">
        <span className={cn('inline-flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[9px] font-black uppercase tracking-[0.08em]', statusTone(job.status))}>
          <StatusIcon status={job.status} /> {job.status}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] text-zinc-500">{job.apiWorkflowName || job.requestId}</span>
        {job.outputs.length > 1 ? <span className="font-mono text-[9px] text-fuchsia-200">{job.outputs.length} outputs</span> : null}
      </div>
      <ReferenceStrip video={video} />
      <div className={cn('relative bg-black/45', visibleOutputs.length > 1 ? 'grid grid-cols-2 gap-px bg-white/10' : 'aspect-video min-h-36')}>
        {visibleOutputs.length > 0 ? visibleOutputs.map((output) => (
          <div key={output.id} className={cn('relative min-h-28 bg-black/70', visibleOutputs.length > 1 && 'aspect-video')}>
            <CardOutputPreview output={output} />
            <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-black/65 px-1.5 py-1 font-mono text-[8px] text-zinc-400">{output.name}</span>
          </div>
        )) : primary?.type === 'image' ? (
          <img src={mediaUrl(primary.path)} alt={primary.name} loading="lazy" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-zinc-700">
            {job.status === 'running' || job.status === 'submitting'
              ? <Loader2 size={24} className="mb-2 animate-spin text-cyan-300/50" />
              : <Clapperboard size={25} className="mb-2 text-fuchsia-300/25" />}
            <span className="text-[9px] font-black uppercase tracking-[0.13em]">{job.status === 'pending' ? 'Queued for generation' : 'No video output yet'}</span>
          </div>
        )}
        <div className="pointer-events-none absolute right-2 top-2 inline-flex h-7 items-center gap-1 border border-white/10 bg-black/75 px-2 text-[9px] font-black uppercase tracking-[0.09em] text-zinc-300 opacity-0 transition-opacity group-hover:opacity-100">
          <Pencil size={10} /> Review
        </div>
        {job.outputs.length > visibleOutputs.length ? (
          <span className="pointer-events-none absolute bottom-2 right-2 border border-white/10 bg-black/75 px-2 py-1 font-mono text-[9px] text-zinc-300">+{job.outputs.length - visibleOutputs.length}</span>
        ) : null}
      </div>
      <div className="space-y-2 border-t border-white/10 p-2.5">
        <p className="line-clamp-3 text-[11px] leading-relaxed text-zinc-300">{job.prompt || 'No prompt recorded.'}</p>
        <SettingsChips
          video={video}
          seed={job.generation.seed}
          seedMode={job.generation.controlAfterGenerate}
          seedIncrement={job.generation.seedIncrement}
        />
      </div>
    </article>
  );
}

function NumberEditor({ label, value, onChange, min = 0, step = 1 }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input type="number" min={min} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className={inputClass} />
    </label>
  );
}

export function UmbraVideoQueuePanel({ jobs, loading, error, queueVideo, onLoadIntoEditor, onRefresh }: UmbraVideoQueuePanelProps) {
  const showToast = useStore((state) => state.showToast);
  const [selected, setSelected] = React.useState<UmbraVideoReviewJob | null>(null);
  const [drawerVisible, setDrawerVisible] = React.useState(false);
  const [draftPrompt, setDraftPrompt] = React.useState('');
  const [draftNegative, setDraftNegative] = React.useState('');
  const [draftVideo, setDraftVideo] = React.useState<PowerPrompterVideoControls | null>(null);
  const [requeueing, setRequeueing] = React.useState(false);

  const openJob = React.useCallback((job: UmbraVideoReviewJob) => {
    setSelected(job);
    setDraftPrompt(job.prompt);
    setDraftNegative(job.negativePrompt);
    setDraftVideo(cloneVideo(job.generation.video!));
    setDrawerVisible(false);
    window.requestAnimationFrame(() => setDrawerVisible(true));
  }, []);

  const closeDrawer = React.useCallback(() => {
    setDrawerVisible(false);
    window.setTimeout(() => setSelected(null), 220);
  }, []);

  React.useEffect(() => {
    if (!selected) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDrawer, selected]);

  const patchVideo = React.useCallback(<K extends keyof PowerPrompterVideoControls>(key: K, value: PowerPrompterVideoControls[K]) => {
    setDraftVideo((current) => current ? { ...current, [key]: value } : current);
  }, []);

  const requeue = React.useCallback(async () => {
    if (!draftVideo || !draftPrompt.trim() || requeueing) return;
    setRequeueing(true);
    try {
      await queueVideo({ prompt: draftPrompt, negativePrompt: draftNegative, video: draftVideo });
      await onRefresh();
      showToast('Edited video added to the shared queue.', 'success');
    } catch (queueError) {
      showToast(queueError instanceof Error ? queueError.message : 'Failed to requeue video.', 'error');
    } finally {
      setRequeueing(false);
    }
  }, [draftNegative, draftPrompt, draftVideo, onRefresh, queueVideo, requeueing, showToast]);

  return (
    <main data-umbra-ui-video-queue="" className="relative flex min-h-0 min-w-0 flex-col bg-black/15">
      <div className="flex min-h-11 items-center gap-2 border-b border-white/10 px-3">
        <Clapperboard size={13} className="text-fuchsia-300" />
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-300">Video Review Queue</span>
        <span className="font-mono text-[10px] text-zinc-600">{jobs.length}</span>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:border-fuchsia-300/25 hover:text-fuchsia-200 disabled:opacity-40"
          title="Refresh video review queue"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
        {error ? <div className="mb-3 border border-red-300/20 bg-red-500/[0.04] p-3 font-mono text-[10px] text-red-200/80">{error}</div> : null}
        {loading && jobs.length <= 0 ? <div className="flex h-full items-center justify-center"><Loader2 size={20} className="animate-spin text-fuchsia-300/55" /></div> : null}
        {!loading && jobs.length <= 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-zinc-700">
            <Clapperboard size={32} className="mb-3 text-fuchsia-300/25" />
            <span className="text-[10px] font-black uppercase tracking-[0.16em]">Queue a video to begin review</span>
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 min-[1500px]:grid-cols-2">
          {jobs.map((job) => <VideoJobCard key={job.id} job={job} onOpen={() => openJob(job)} />)}
        </div>
      </div>

      {selected && draftVideo ? (
        <div className={cn('fixed inset-0 z-[160] transition-colors duration-200', drawerVisible ? 'bg-black/70' : 'bg-black/0')} onPointerDown={closeDrawer}>
          <section
            className={cn(
              'absolute inset-y-0 right-0 flex w-[min(720px,calc(100vw-24px))] flex-col border-l border-fuchsia-300/25 bg-[#080a0a] shadow-2xl shadow-black/80 transition-transform duration-200 ease-out',
              drawerVisible ? 'translate-x-0' : 'translate-x-full',
            )}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <div className="flex min-h-12 items-center gap-2 border-b border-white/10 px-3">
              <Clapperboard size={14} className="text-fuchsia-300" />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-black uppercase tracking-[0.13em] text-zinc-200">Video Quality Review</div>
                <div className="truncate font-mono text-[9px] text-zinc-600">{selected.apiWorkflowName || selected.requestId}</div>
              </div>
              <span className={cn('inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-[9px] font-black uppercase tracking-[0.08em]', statusTone(selected.status))}>
                <StatusIcon status={selected.status} /> {selected.status}
              </span>
              <button type="button" onClick={closeDrawer} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100" title="Close review">
                <X size={14} />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
              <ReferenceStrip video={draftVideo} large />
              <div className="grid gap-2 border-b border-white/10 bg-black/25 p-3 sm:grid-cols-2">
                {selected.outputs.length > 0 ? selected.outputs.map((output) => (
                  <div key={output.id} className="overflow-hidden rounded-md border border-white/10 bg-black/45">
                    {output.type === 'video' ? (
                      <video src={mediaUrl(output.path)} controls preload="metadata" className="aspect-video h-auto w-full bg-black object-contain" />
                    ) : output.type === 'image' ? (
                      <img src={mediaUrl(output.path)} alt={output.name} className="aspect-video h-auto w-full object-contain" />
                    ) : output.type === 'audio' ? (
                      <div className="flex min-h-24 items-center p-3"><audio src={mediaUrl(output.path)} controls className="w-full" /></div>
                    ) : (
                      <div className="flex min-h-24 items-center justify-center font-mono text-[10px] text-zinc-500">{output.name}</div>
                    )}
                    <div className="truncate border-t border-white/10 px-2 py-1.5 font-mono text-[9px] text-zinc-500">{output.name}</div>
                  </div>
                )) : (
                  <div className="col-span-full flex aspect-video items-center justify-center border border-white/10 bg-black/35 text-zinc-700">
                    <div className="text-center"><Clapperboard size={25} className="mx-auto mb-2" /><span className="text-[9px] font-black uppercase tracking-[0.12em]">Output pending</span></div>
                  </div>
                )}
              </div>

              <div className="space-y-4 p-4">
                {selected.error ? <div className="border border-red-300/20 bg-red-500/[0.04] p-3 text-[11px] text-red-200/80">{selected.error}</div> : null}
                <label className="block space-y-1.5">
                  <span className={labelClass}>Prompt</span>
                  <textarea value={draftPrompt} onChange={(event) => setDraftPrompt(event.target.value)} className={`${inputClass} min-h-32 resize-y leading-relaxed`} />
                </label>
                <label className="block space-y-1.5">
                  <span className={labelClass}>Negative Prompt</span>
                  <textarea value={draftNegative} onChange={(event) => setDraftNegative(event.target.value)} className={`${inputClass} min-h-20 resize-y leading-relaxed`} />
                </label>

                <div className="rounded-md border border-white/10 bg-white/[0.02] p-3">
                  <div className="mb-3 flex items-center gap-2"><Settings2 size={13} className="text-fuchsia-300" /><span className={labelClass}>Generation Settings</span></div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <NumberEditor label="Width" value={draftVideo.width} min={64} step={16} onChange={(value) => patchVideo('width', value)} />
                    <NumberEditor label="Height" value={draftVideo.height} min={64} step={16} onChange={(value) => patchVideo('height', value)} />
                    <NumberEditor label="Frames" value={draftVideo.frames} min={1} step={draftVideo.family === 'ltx23' ? 8 : 4} onChange={(value) => patchVideo('frames', value)} />
                    <NumberEditor label="FPS" value={draftVideo.fps} min={1} onChange={(value) => patchVideo('fps', value)} />
                    {draftVideo.mode === 'video_to_video' ? (
                      <NumberEditor label="Denoise" value={draftVideo.denoise} min={0.01} step={0.01} onChange={(value) => patchVideo('denoise', Math.min(1, value))} />
                    ) : null}
                    {draftVideo.family === 'wan22' ? (
                      <NumberEditor label="Steps" value={draftVideo.wan.steps} min={2} onChange={(value) => setDraftVideo((current) => current ? { ...current, wan: { ...current.wan, steps: value } } : current)} />
                    ) : (
                      <NumberEditor label="Base CFG" value={draftVideo.ltx.baseCfg} min={0} step={0.1} onChange={(value) => setDraftVideo((current) => current ? { ...current, ltx: { ...current.ltx, baseCfg: value } } : current)} />
                    )}
                    <div className="col-span-2 sm:col-span-3">
                      <UmbraSeedControls
                        seed={String(draftVideo.seed)}
                        mode={draftVideo.seedMode}
                        increment={draftVideo.seedIncrement}
                        onSeedChange={(value) => patchVideo('seed', normalizeUmbraUiSeed(value, draftVideo.seed))}
                        onModeChange={(mode: PowerPrompterSeedControlMode) => patchVideo('seedMode', mode)}
                        onIncrementChange={(increment: PowerPrompterSeedIncrement) => patchVideo('seedIncrement', increment)}
                        accent="fuchsia"
                      />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="space-y-1.5"><span className={labelClass}>Reference Video</span><input value={draftVideo.sourceVideoPath} onChange={(event) => setDraftVideo((current) => current ? { ...current, sourceVideoPath: event.target.value, sourceVideoName: '' } : current)} className={inputClass} /></label>
                    <label className="space-y-1.5"><span className={labelClass}>Audio Track</span><input value={draftVideo.sourceAudioPath} onChange={(event) => setDraftVideo((current) => current ? { ...current, sourceAudioPath: event.target.value, sourceAudioName: '' } : current)} className={inputClass} /></label>
                  </div>
                  {draftVideo.mode === 'video_to_video' ? (
                    <label className="mt-3 flex h-9 items-center gap-2 border border-white/10 bg-black/25 px-2.5 text-[9px] font-black uppercase tracking-[0.1em] text-zinc-400">
                      <input
                        type="checkbox"
                        checked={draftVideo.preserveSourceAudio}
                        onChange={(event) => patchVideo('preserveSourceAudio', event.target.checked)}
                        className="accent-fuchsia-400"
                      />
                      Preserve source audio
                    </label>
                  ) : null}
                  <details className="mt-3 border-t border-white/10 pt-3">
                    <summary className="cursor-pointer text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500 hover:text-zinc-300">Exact recorded settings</summary>
                    <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-black/45 p-3 font-mono text-[9px] leading-relaxed text-zinc-500 custom-scrollbar">{JSON.stringify(selected.generation, null, 2)}</pre>
                  </details>
                </div>
              </div>
            </div>

            <div className="flex min-h-14 items-center gap-2 border-t border-white/10 bg-black/35 px-3">
              <button
                type="button"
                onClick={() => {
                  onLoadIntoEditor({ id: `${selected.id}:${Date.now()}`, prompt: draftPrompt, negativePrompt: draftNegative, video: cloneVideo(draftVideo) });
                  closeDrawer();
                }}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 hover:border-fuchsia-300/25 hover:text-fuchsia-100"
              >
                <Pencil size={12} /> Full Controls
              </button>
              <button
                type="button"
                onClick={() => void requeue()}
                disabled={requeueing || !draftPrompt.trim()}
                className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-fuchsia-300/30 bg-fuchsia-500/[0.1] px-4 text-[10px] font-black uppercase tracking-[0.11em] text-fuchsia-100 hover:bg-fuchsia-500/[0.16] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
              >
                {requeueing ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                Edit & Requeue
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default UmbraVideoQueuePanel;
