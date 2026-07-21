'use client';

import React from 'react';
import {
  Clapperboard,
  Database,
  Film,
  Gauge,
  Image as ImageIcon,
  ImagePlus,
  ListPlus,
  Loader2,
  Music2,
  Play,
  Plus,
  RefreshCw,
  Scaling,
  SlidersHorizontal,
  Trash2,
  Upload,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import type { PowerPrompterSeedControlMode, PowerPrompterVideoControls, PowerPrompterVideoFamily, PowerPrompterVideoMode } from '@/types/powerPrompter';
import type {
  ApiWorkflowItem,
  UmbraQueuePlacement,
  UmbraQueueSummary,
  UmbraVideoModelCatalog,
  UmbraVideoQueueOptions,
} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import type { UmbraUiAgentDraft, UmbraUiAgentVideoContext } from '@/lib/umbraUiAgent';
import { UmbraInlineAgentPrompt } from '@/components/umbra-ui/UmbraInlineAgentPrompt';
import { UmbraSeedControls } from '@/components/umbra-ui/UmbraSeedControls';
import {
  UmbraQueuePlacementControls,
  useUmbraQueuePlacement,
} from '@/components/umbra-ui/UmbraQueuePlacementControls';
import { resolveUmbraUiPipeline } from '@/lib/umbraUiPipelines';
import { advanceUmbraUiSeed, normalizeUmbraUiSeed, resolveUmbraUiQueueSeed } from '@/lib/umbraUiSeed';
import {
  normalizeUmbraUiMediaHandoff,
  UMBRA_UI_MEDIA_HANDOFF_EVENT,
  UMBRA_UI_MEDIA_HANDOFF_KEY,
  type UmbraUiMediaHandoff,
  type UmbraUiVideoFrameRole,
} from '@/lib/umbraUiMediaHandoff';
import {
  UMBRA_VIDEO_ASPECT_PRESETS,
  UMBRA_VIDEO_RESOLUTION_PRESETS,
  resolveUmbraVideoSizing,
  resolveUmbraVideoTargetDimensions,
} from '../../../../shared/umbra-ui/videoSizing';

const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500';

interface UmbraVideoGenerationControlsProps {
  workflows: ApiWorkflowItem[];
  catalog: UmbraVideoModelCatalog;
  queueSummary: UmbraQueueSummary;
  queueConnected: boolean;
  comfyConnected: boolean;
  onRefreshCatalog: () => void;
  onOpenPowerPrompter: () => void;
  queueVideo: (options: UmbraVideoQueueOptions) => Promise<string>;
  agentDraft?: UmbraUiAgentDraft | null;
  onAgentDraftApplied?: (draftId: string) => void;
  onAgentContextChange?: (context: UmbraUiAgentVideoContext) => void;
  editorDraft?: UmbraVideoEditorDraft | null;
  onEditorDraftApplied?: (draftId: string) => void;
}

export interface UmbraVideoEditorDraft {
  id: string;
  prompt: string;
  negativePrompt: string;
  video: PowerPrompterVideoControls;
}

function createDefaultVideoControls(): PowerPrompterVideoControls {
  return {
    family: 'wan22',
    mode: 'text_to_video',
    frameGuideMode: 'first',
    sourceImagePath: '',
    sourceImageName: '',
    middleImagePath: '',
    middleImageName: '',
    lastImagePath: '',
    lastImageName: '',
    sourceVideoPath: '',
    sourceVideoName: '',
    denoise: 0.35,
    preserveSourceAudio: true,
    sourceAudioPath: '',
    sourceAudioName: '',
    resolutionPreset: '720p',
    aspectRatio: '16:9',
    sourceWidth: 0,
    sourceHeight: 0,
    width: 1280,
    height: 704,
    frames: 81,
    fps: 16,
    seed: 0,
    seedMode: 'fixed',
    outputPrefix: 'video/Umbra',
    format: 'auto',
    codec: 'h264',
    decodeMode: 'auto',
    decodeTileSize: 768,
    decodeOverlap: 64,
    temporalTileSize: 64,
    temporalOverlap: 8,
    postprocess: {
      interpolationEnabled: false,
      interpolationModel: '',
      interpolationMultiplier: 2,
      upscaleMode: 'none',
      upscaleModel: '',
      upscaleScale: 2,
      maxDimension: 3840,
      rtxQuality: 'ULTRA',
    },
    wan: {
      highModel: '',
      lowModel: '',
      highLora: '',
      lowLora: '',
      highLoraStrength: 1,
      lowLoraStrength: 1,
      textEncoder: '',
      vae: '',
      clipVision: '',
      steps: 4,
      splitStep: 2,
      cfg: 1,
      shift: 5,
      highSamplerName: 'euler',
      highScheduler: 'simple',
      lowSamplerName: 'euler',
      lowScheduler: 'simple',
    },
    ltx: {
      checkpoint: '',
      textEncoder: '',
      distilledLora: '',
      distilledLoraStrength: 0.5,
      promptLora: '',
      promptLoraStrength: 1,
      latentUpscaleModel: '',
      audioVae: '',
      baseCfg: 1,
      refineCfg: 1,
      baseSamplerName: 'euler',
      refineSamplerName: 'euler',
      baseSigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0',
      refineSigmas: '0.85, 0.7250, 0.4219, 0.0',
      twoStage: true,
      audioEnabled: true,
      promptEnhance: false,
      imageStrength: 0.7,
      imageCompression: 18,
      keyframes: [],
    },
  };
}

function createLtxKeyframe(frameCount: number, existingCount: number) {
  const stride = 8;
  const proposedFrame = existingCount === 0
    ? Math.round(((frameCount - 1) / 2) / stride) * stride
    : Math.min(frameCount - 1, Math.round((((existingCount + 1) * (frameCount - 1)) / (existingCount + 2)) / stride) * stride);
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `ltx-keyframe-${crypto.randomUUID()}`
      : `ltx-keyframe-${Date.now()}-${existingCount}`,
    sourceImagePath: '',
    sourceImageName: '',
    frameIndex: Math.max(0, proposedFrame),
    strength: 1,
  };
}

function optionList(current: string, values: string[]) {
  return Array.from(new Set([current, ...values].filter(Boolean)));
}

function SelectField({ label, value, values, onChange, emptyLabel = 'Not installed' }: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  emptyLabel?: string;
}) {
  const options = optionList(value, values);
  return (
    <label className="min-w-0 space-y-1.5">
      <span className={labelClass}>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1 }: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

function ToggleButton({ active, label, onClick, disabled = false, title }: {
  active: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-8 border px-2 text-[9px] font-black uppercase tracking-[0.12em] transition-colors disabled:cursor-not-allowed disabled:opacity-35',
        active
          ? 'border-emerald-300/30 bg-emerald-500/[0.1] text-emerald-100'
          : 'border-white/10 bg-white/[0.025] text-zinc-600 hover:text-zinc-300',
      )}
    >
      {label}
    </button>
  );
}

function FrameSourceField({ label, path, previewUrl, onChange, onClear, onDimensions }: {
  label: string;
  path: string;
  previewUrl?: string;
  onChange: (path: string) => void;
  onClear: () => void;
  onDimensions?: (width: number, height: number) => void;
}) {
  const resolvedPreview = previewUrl || (path ? `/api/fs/image?path=${encodeURIComponent(path)}` : '');
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-2 border-t border-white/[0.07] py-2 first:border-t-0">
      <div className="h-12 overflow-hidden border border-white/10 bg-black/40">
        {resolvedPreview ? <img
          src={resolvedPreview}
          alt={label}
          className="h-full w-full object-contain"
          onLoad={(event) => onDimensions?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)}
        /> : (
          <div className="flex h-full items-center justify-center"><ImageIcon size={13} className="text-zinc-700" /></div>
        )}
      </div>
      <label className="min-w-0 space-y-1">
        <span className={labelClass}>{label}</span>
        <input value={path} onChange={(event) => onChange(event.target.value)} placeholder="Send from Gallery or paste a local path" className={inputClass} />
      </label>
      <button
        type="button"
        onClick={onClear}
        disabled={!path}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-600 hover:border-red-300/25 hover:text-red-300 disabled:opacity-25"
        title={`Clear ${label.toLowerCase()}`}
      >
        <X size={11} />
      </button>
    </div>
  );
}

function MediaSourceField({ kind, label, path, onChange, onUploaded, onClear, onDimensions }: {
  kind: 'video' | 'audio';
  label: string;
  path: string;
  onChange: (path: string) => void;
  onUploaded: (path: string, name: string) => void;
  onClear: () => void;
  onDimensions?: (width: number, height: number) => void;
}) {
  const showToast = useStore((state) => state.showToast);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const mediaUrl = path ? `/api/fs/image?path=${encodeURIComponent(path)}` : '';
  const upload = React.useCallback(async (file: File) => {
    if (uploading) return;
    setUploading(true);
    try {
      const response = await fetch('/api/comfy/upload-media', {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'x-umbra-media-kind': kind,
          'x-umbra-file-name': encodeURIComponent(file.name),
        },
        body: file,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(String(payload?.error || `Failed to upload ${kind}.`));
      }
      const sourcePath = String(payload?.sourcePath || '').trim();
      const filename = String(payload?.filename || '').trim();
      if (!sourcePath || !filename) throw new Error(`Umbra did not return the uploaded ${kind}.`);
      onUploaded(sourcePath, filename);
      showToast(`${label} ready.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Failed to upload ${kind}.`, 'error');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [kind, label, onUploaded, showToast, uploading]);
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)_28px_28px] items-center gap-2 border-t border-white/[0.07] py-2 first:border-t-0">
      <div className="flex h-12 items-center justify-center overflow-hidden border border-white/10 bg-black/40">
        {kind === 'video' && mediaUrl ? (
          <video
            src={mediaUrl}
            muted
            preload="metadata"
            className="h-full w-full object-cover"
            onLoadedMetadata={(event) => onDimensions?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
          />
        ) : kind === 'audio' && mediaUrl ? (
          <Music2 size={16} className="text-cyan-300/70" />
        ) : kind === 'video' ? <Video size={15} className="text-zinc-700" /> : <Music2 size={15} className="text-zinc-700" />}
      </div>
      <label className="min-w-0 space-y-1">
        <span className={labelClass}>{label}</span>
        <input value={path} onChange={(event) => onChange(event.target.value)} placeholder={`Paste a local ${kind} path`} className={inputClass} />
      </label>
      <input
        ref={inputRef}
        type="file"
        accept={kind === 'video' ? 'video/*,.avi,.m4v,.mkv,.mov,.mp4,.webm' : 'audio/*,.aac,.flac,.m4a,.mp3,.ogg,.opus,.wav'}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:border-cyan-300/25 hover:text-cyan-200 disabled:opacity-40"
        title={`Choose ${label.toLowerCase()}`}
      >
        {uploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={!path}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-600 hover:border-red-300/25 hover:text-red-300 disabled:opacity-25"
        title={`Clear ${label.toLowerCase()}`}
      >
        <X size={11} />
      </button>
    </div>
  );
}

export function UmbraVideoGenerationControls({
  workflows,
  catalog,
  queueSummary,
  queueConnected,
  comfyConnected,
  onRefreshCatalog,
  onOpenPowerPrompter,
  queueVideo,
  agentDraft,
  onAgentDraftApplied,
  onAgentContextChange,
  editorDraft,
  onEditorDraftApplied,
}: UmbraVideoGenerationControlsProps) {
  const showToast = useStore((state) => state.showToast);
  const [prompt, setPrompt] = React.useState('');
  const [agentModeEnabled, setAgentModeEnabled] = React.useState(false);
  const [agentPrompt, setAgentPrompt] = React.useState('');
  const workflowPrompt = agentModeEnabled ? agentPrompt.trim() : prompt;
  const [negativePrompt, setNegativePrompt] = React.useState('');
  const [video, setVideo] = React.useState<PowerPrompterVideoControls>(() => createDefaultVideoControls());
  const [sourcePreviewUrl, setSourcePreviewUrl] = React.useState('');
  const [isQueueing, setIsQueueing] = React.useState(false);
  const { placement, setPlacement, effectivePlacement } = useUmbraQueuePlacement(queueSummary);
  const [settingsLoaded, setSettingsLoaded] = React.useState(false);
  const handoffAppliedRef = React.useRef(false);
  const handoffAppliedAtRef = React.useRef(0);
  const targetDimensions = React.useMemo(() => resolveUmbraVideoTargetDimensions({
    resolutionPreset: video.resolutionPreset,
    sourceWidth: video.mode === 'text_to_video' ? 0 : video.sourceWidth,
    sourceHeight: video.mode === 'text_to_video' ? 0 : video.sourceHeight,
    fallbackAspect: video.aspectRatio,
  }), [video.aspectRatio, video.mode, video.resolutionPreset, video.sourceHeight, video.sourceWidth]);

  React.useEffect(() => {
    setVideo((current) => (
      current.width === targetDimensions.targetWidth && current.height === targetDimensions.targetHeight
        ? current
        : { ...current, width: targetDimensions.targetWidth, height: targetDimensions.targetHeight }
    ));
  }, [targetDimensions.targetHeight, targetDimensions.targetWidth]);

  React.useEffect(() => {
    let canceled = false;
    void fetch('/api/umbra-ui/video-controls', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'Failed to load video controls.');
        return payload?.video as PowerPrompterVideoControls | undefined;
      })
      .then((savedVideo) => {
        if (canceled) return;
        if (savedVideo) {
          const defaults = createDefaultVideoControls();
          const normalizedSavedVideo: PowerPrompterVideoControls = {
            ...defaults,
            ...savedVideo,
            postprocess: { ...defaults.postprocess, ...(savedVideo.postprocess || {}) },
            wan: { ...defaults.wan, ...(savedVideo.wan || {}) },
            ltx: {
              ...defaults.ltx,
              ...(savedVideo.ltx || {}),
              keyframes: Array.isArray(savedVideo.ltx?.keyframes) ? savedVideo.ltx.keyframes : [],
            },
          };
          setVideo((current) => handoffAppliedRef.current
            ? {
              ...normalizedSavedVideo,
              mode: 'image_to_video',
              frameGuideMode: current.frameGuideMode,
              sourceImagePath: current.sourceImagePath,
              sourceImageName: current.sourceImageName,
              middleImagePath: current.middleImagePath,
              middleImageName: current.middleImageName,
              lastImagePath: current.lastImagePath,
              lastImageName: current.lastImageName,
              sourceWidth: current.sourceWidth,
              sourceHeight: current.sourceHeight,
            }
            : normalizedSavedVideo);
          if (!handoffAppliedRef.current && savedVideo.sourceImagePath) {
            setSourcePreviewUrl(`/api/fs/image?path=${encodeURIComponent(savedVideo.sourceImagePath)}`);
          }
        }
        setSettingsLoaded(true);
      })
      .catch(() => {
        if (!canceled) setSettingsLoaded(true);
      });
    return () => {
      canceled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!settingsLoaded) return;
    const timer = window.setTimeout(() => {
      void fetch('/api/umbra-ui/video-controls', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video }),
      }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [settingsLoaded, video]);

  React.useEffect(() => {
    if (!agentDraft || agentDraft.mediaType !== 'video') return;
    setAgentModeEnabled(true);
    setAgentPrompt(agentDraft.prompt || agentDraft.segments.join(' '));
    setNegativePrompt(agentDraft.negativePrompt);
    onAgentDraftApplied?.(agentDraft.id);
  }, [agentDraft, onAgentDraftApplied]);

  React.useEffect(() => {
    if (!editorDraft) return;
    const defaults = createDefaultVideoControls();
    setPrompt(editorDraft.prompt);
    setAgentModeEnabled(false);
    setAgentPrompt('');
    setNegativePrompt(editorDraft.negativePrompt);
    setVideo({
      ...defaults,
      ...editorDraft.video,
      postprocess: { ...defaults.postprocess, ...editorDraft.video.postprocess },
      wan: { ...defaults.wan, ...editorDraft.video.wan },
      ltx: {
        ...defaults.ltx,
        ...editorDraft.video.ltx,
        keyframes: editorDraft.video.ltx.keyframes.map((keyframe) => ({ ...keyframe })),
      },
    });
    setSourcePreviewUrl(editorDraft.video.sourceImagePath
      ? `/api/fs/image?path=${encodeURIComponent(editorDraft.video.sourceImagePath)}`
      : '');
    onEditorDraftApplied?.(editorDraft.id);
  }, [editorDraft, onEditorDraftApplied]);

  React.useEffect(() => {
    const modelFamily = video.family === 'wan22' ? 'Wan 2.2' : 'LTX-2.3';
    const feature = video.mode === 'video_to_video'
      ? 'vid2vid'
      : video.mode === 'image_to_video' ? 'img2vid' : 'txt2vid';
    const modelSource = video.family === 'wan22' ? 'unet' : 'checkpoint';
    const pipelineMatch = resolveUmbraUiPipeline(workflows, feature, modelFamily, modelSource);
    onAgentContextChange?.({
      prompt: workflowPrompt,
      negativePrompt,
      apiWorkflowId: pipelineMatch.workflow?.id || '',
      family: video.family,
      mode: video.mode,
      controls: {
        ...(video as unknown as Record<string, unknown>),
        width: targetDimensions.targetWidth,
        height: targetDimensions.targetHeight,
        agentModeEnabled,
        agentPrompt,
      },
    });
  }, [agentModeEnabled, agentPrompt, negativePrompt, onAgentContextChange, targetDimensions.targetHeight, targetDimensions.targetWidth, video, workflowPrompt, workflows]);

  React.useEffect(() => {
    if (video.mode !== 'image_to_video' || !video.sourceImagePath || video.sourceImageName) return;
    const controller = new AbortController();
    const sourcePath = video.sourceImagePath;
    const timer = window.setTimeout(() => {
      void fetch('/api/comfy/copy-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath }),
        signal: controller.signal,
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.filename) return;
        setVideo((current) => current.sourceImagePath === sourcePath
          ? { ...current, sourceImageName: String(payload.filename) }
          : current);
      }).catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [video.mode, video.sourceImageName, video.sourceImagePath]);

  React.useEffect(() => {
    const sourcePath = video.mode === 'image_to_video'
      ? video.sourceImagePath
      : video.mode === 'video_to_video' ? video.sourceVideoPath : '';
    if (!sourcePath) return;
    const controller = new AbortController();
    void fetch(`/api/fs/metadata?${new URLSearchParams({ path: sourcePath }).toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json().catch(() => ({}));
      const width = Math.max(0, Math.round(Number(payload?.width) || 0));
      const height = Math.max(0, Math.round(Number(payload?.height) || 0));
      if (!width || !height) return;
      setVideo((current) => {
        const currentPath = current.mode === 'image_to_video'
          ? current.sourceImagePath
          : current.mode === 'video_to_video' ? current.sourceVideoPath : '';
        return currentPath === sourcePath
          ? { ...current, sourceWidth: width, sourceHeight: height }
          : current;
      });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [video.mode, video.sourceImagePath, video.sourceVideoPath]);

  const modelFamily = video.family === 'wan22' ? 'Wan 2.2' : 'LTX-2.3';
  const pipelineFeature = video.mode === 'video_to_video'
    ? 'vid2vid'
    : video.mode === 'image_to_video' ? 'img2vid' : 'txt2vid';
  const pipelineModelSource = video.family === 'wan22' ? 'unet' : 'checkpoint';
  const pipelineMatch = React.useMemo(
    () => resolveUmbraUiPipeline(workflows, pipelineFeature, modelFamily, pipelineModelSource),
    [modelFamily, pipelineFeature, pipelineModelSource, workflows],
  );

  const applyHandoff = React.useCallback((detail: UmbraUiMediaHandoff | null) => {
    if (!detail || detail.mode !== 'video' || !detail.path) return;
    if (detail.createdAt <= handoffAppliedAtRef.current) return;
    handoffAppliedAtRef.current = detail.createdAt;
    handoffAppliedRef.current = true;
    const role: UmbraUiVideoFrameRole = detail.videoFrameRole || 'first';
    const handoffWidth = Math.max(0, Math.round(Number(detail.generation?.width) || 0));
    const handoffHeight = Math.max(0, Math.round(Number(detail.generation?.height) || 0));
    setVideo((current) => {
      if (role === 'source_video') {
        return {
          ...current,
          mode: 'video_to_video',
          sourceVideoPath: detail.path,
          sourceVideoName: '',
          sourceWidth: handoffWidth,
          sourceHeight: handoffHeight,
        };
      }
      if (role === 'middle') {
        return {
          ...current,
          mode: 'image_to_video',
          frameGuideMode: 'first_middle_last',
          middleImagePath: detail.path,
          middleImageName: '',
        };
      }
      if (role === 'last') {
        return {
          ...current,
          mode: 'image_to_video',
          frameGuideMode: current.middleImagePath ? 'first_middle_last' : 'first_last',
          lastImagePath: detail.path,
          lastImageName: '',
        };
      }
      return {
        ...current,
        mode: 'image_to_video',
        sourceImagePath: detail.path,
        sourceImageName: '',
        sourceWidth: handoffWidth,
        sourceHeight: handoffHeight,
      };
    });
    if (role === 'first') setSourcePreviewUrl(detail.imageUrl || `/api/fs/image?path=${encodeURIComponent(detail.path)}`);
    if (detail.generation?.positivePrompt) setPrompt(detail.generation.positivePrompt);
    if (detail.generation?.negativePrompt) setNegativePrompt(detail.generation.negativePrompt);
  }, []);

  React.useEffect(() => {
    const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: unknown };
    if (target.__umbraPendingUmbraUiMediaHandoff) {
      applyHandoff(normalizeUmbraUiMediaHandoff(target.__umbraPendingUmbraUiMediaHandoff));
    } else {
      try {
        applyHandoff(normalizeUmbraUiMediaHandoff(JSON.parse(window.sessionStorage.getItem(UMBRA_UI_MEDIA_HANDOFF_KEY) || 'null')));
      } catch { /* best effort */ }
    }
    const onHandoff = (event: Event) => applyHandoff(normalizeUmbraUiMediaHandoff((event as CustomEvent).detail));
    window.addEventListener(UMBRA_UI_MEDIA_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(UMBRA_UI_MEDIA_HANDOFF_EVENT, onHandoff);
  }, [applyHandoff]);

  const setFamily = (family: PowerPrompterVideoFamily) => {
    setVideo((current) => ({
      ...current,
      family,
      frames: family === 'ltx23' ? 121 : 81,
      fps: family === 'ltx23' ? 25 : 16,
    }));
  };
  const setMode = (mode: PowerPrompterVideoMode) => setVideo((current) => ({ ...current, mode }));
  const setCommon = <K extends keyof PowerPrompterVideoControls>(key: K, value: PowerPrompterVideoControls[K]) => {
    setVideo((current) => ({ ...current, [key]: value }));
  };
  const setWan = <K extends keyof PowerPrompterVideoControls['wan']>(key: K, value: PowerPrompterVideoControls['wan'][K]) => {
    setVideo((current) => ({ ...current, wan: { ...current.wan, [key]: value } }));
  };
  const setLtx = <K extends keyof PowerPrompterVideoControls['ltx']>(key: K, value: PowerPrompterVideoControls['ltx'][K]) => {
    setVideo((current) => ({ ...current, ltx: { ...current.ltx, [key]: value } }));
  };
  const setPostprocess = <K extends keyof PowerPrompterVideoControls['postprocess']>(key: K, value: PowerPrompterVideoControls['postprocess'][K]) => {
    setVideo((current) => ({ ...current, postprocess: { ...current.postprocess, [key]: value } }));
  };
  const sizing = resolveUmbraVideoSizing({
    width: targetDimensions.targetWidth,
    height: targetDimensions.targetHeight,
    family: video.family,
    ltxTwoStage: video.ltx.twoStage,
    upscaleMode: video.postprocess.upscaleMode,
    upscaleScale: video.postprocess.upscaleScale,
  });
  const updateLtxKeyframe = (id: string, patch: Partial<PowerPrompterVideoControls['ltx']['keyframes'][number]>) => {
    setVideo((current) => ({
      ...current,
      ltx: {
        ...current.ltx,
        keyframes: current.ltx.keyframes.map((keyframe) => keyframe.id === id ? { ...keyframe, ...patch } : keyframe),
      },
    }));
  };
  const removeLtxKeyframe = (id: string) => {
    setVideo((current) => ({
      ...current,
      ltx: { ...current.ltx, keyframes: current.ltx.keyframes.filter((keyframe) => keyframe.id !== id) },
    }));
  };

  const sourceDimensionsMissing = video.mode !== 'text_to_video'
    && (!video.sourceWidth || !video.sourceHeight);
  const requiredMissing = React.useMemo(() => {
    const sourceVideoMissing = video.mode === 'video_to_video'
      && !video.sourceVideoPath
      && !video.sourceVideoName;
    const frameGuideMissing = video.mode === 'image_to_video' && (
      !video.sourceImagePath
      || (video.frameGuideMode === 'first_middle_last' && !video.middleImagePath)
      || ((video.frameGuideMode === 'first_last' || video.frameGuideMode === 'first_middle_last') && !video.lastImagePath)
    );
    if (video.family === 'wan22') {
      return sourceVideoMissing || frameGuideMissing || sourceDimensionsMissing || [
        video.wan.highModel,
        video.wan.lowModel,
        video.wan.highLora,
        video.wan.lowLora,
        video.wan.textEncoder,
        video.wan.vae,
        ...(video.mode === 'image_to_video' ? [video.wan.clipVision, video.sourceImagePath] : []),
      ].some((value) => !String(value || '').trim());
    }
    return sourceVideoMissing || frameGuideMissing || sourceDimensionsMissing || [
      video.ltx.checkpoint,
      video.ltx.textEncoder,
      video.ltx.distilledLora,
      video.ltx.promptLora,
      ...(video.ltx.twoStage ? [video.ltx.latentUpscaleModel] : []),
      ...(video.ltx.audioEnabled && !(video.mode === 'video_to_video' && video.preserveSourceAudio) ? [video.ltx.audioVae] : []),
      ...(video.mode === 'image_to_video' ? [video.sourceImagePath] : []),
    ].some((value) => !String(value || '').trim());
  }, [video])
    || (video.postprocess.interpolationEnabled && !video.postprocess.interpolationModel)
    || (video.postprocess.upscaleMode === 'model' && !video.postprocess.upscaleModel)
    || (video.postprocess.upscaleMode === 'rtx' && !catalog.rtxAvailable)
    || (video.family === 'ltx23' && video.ltx.keyframes.some((keyframe) => !keyframe.sourceImagePath && !keyframe.sourceImageName));

  const handleQueue = async (requestedPlacement: UmbraQueuePlacement = effectivePlacement) => {
    if (isQueueing) return;
    const queuePlacement = queueSummary.powerPrompterActive ? requestedPlacement : 'end';
    if (queuePlacement === 'interrupt' && !window.confirm(
      'Stop the current Power Prompter image and run this Umbra UI video next?',
    )) return;
    setIsQueueing(true);
    try {
      const queuedSeed = resolveUmbraUiQueueSeed(video.seed, video.seedMode);
      await queueVideo({
        prompt: workflowPrompt,
        negativePrompt,
        video: {
          ...video,
          seed: queuedSeed,
          width: targetDimensions.targetWidth,
          height: targetDimensions.targetHeight,
        },
        queuePlacement,
      });
      const nextSeed = advanceUmbraUiSeed(queuedSeed, video.seedMode);
      setVideo((current) => current.seed === video.seed && current.seedMode === video.seedMode
        ? { ...current, seed: nextSeed }
        : current);
      const placementMessage = queuePlacement === 'next'
        ? 'will run after the current Power Prompter image.'
        : queuePlacement === 'interrupt'
          ? 'will run as soon as the current Power Prompter image stops.'
          : queueSummary.powerPrompterActive
            ? 'was added to the end of the Power Prompter queue.'
            : 'was submitted for generation.';
      showToast(`${video.family === 'wan22' ? 'Wan 2.2' : 'LTX-2.3'} video ${placementMessage}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue video.', 'error');
    } finally {
      setIsQueueing(false);
    }
  };

  const samplerOptions = catalog.samplers.length > 0 ? catalog.samplers : ['euler', 'uni_pc'];
  const schedulerOptions = catalog.schedulers.length > 0 ? catalog.schedulers : ['simple', 'beta'];
  const queueDisabled = isQueueing || !queueConnected || !comfyConnected || !pipelineMatch.workflow || !workflowPrompt.trim() || requiredMissing;

  return (
    <section className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar">
      <div className="mb-3 flex items-center gap-2">
        <Clapperboard size={13} className="text-fuchsia-300" />
        <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">Video Generation</h2>
        <button
          type="button"
          onClick={onRefreshCatalog}
          disabled={catalog.loading}
          className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-600 hover:border-fuchsia-300/30 hover:text-fuchsia-200"
          title="Refresh video model catalog"
        >
          <RefreshCw size={11} className={catalog.loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <ToggleButton active={video.family === 'wan22'} label="Wan 2.2" onClick={() => setFamily('wan22')} />
        <ToggleButton active={video.family === 'ltx23'} label="LTX-2.3" onClick={() => setFamily('ltx23')} />
      </div>
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <ToggleButton active={video.mode === 'text_to_video'} label="Text to Video" onClick={() => setMode('text_to_video')} />
        <ToggleButton active={video.mode === 'image_to_video'} label="Image to Video" onClick={() => setMode('image_to_video')} />
        <ToggleButton active={video.mode === 'video_to_video'} label="Video to Video" onClick={() => setMode('video_to_video')} />
      </div>

      <div className="space-y-3">
        {pipelineMatch.error ? <div className="font-mono text-[9px] leading-relaxed text-red-300/80">{pipelineMatch.error}</div> : null}

        {video.mode === 'image_to_video' ? (
          <div className="border border-fuchsia-300/20 bg-fuchsia-500/[0.04] p-2.5">
            <div className="mb-2 flex items-center gap-2">
              <ImageIcon size={12} className="text-fuchsia-300" />
              <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Frame Guidance</span>
              <span className="ml-auto font-mono text-[8px] text-zinc-600">ordered anchors</span>
            </div>
            <div className="mb-2 grid grid-cols-3 gap-1">
              <ToggleButton active={video.frameGuideMode === 'first'} label="First" onClick={() => setCommon('frameGuideMode', 'first')} />
              <ToggleButton active={video.frameGuideMode === 'first_last'} label="First + Last" onClick={() => setCommon('frameGuideMode', 'first_last')} />
              <ToggleButton active={video.frameGuideMode === 'first_middle_last'} label="First + Mid + Last" onClick={() => setCommon('frameGuideMode', 'first_middle_last')} />
            </div>
            <FrameSourceField
              label="First Frame"
              path={video.sourceImagePath}
              previewUrl={sourcePreviewUrl}
              onChange={(path) => {
                setVideo((current) => ({
                  ...current,
                  sourceImagePath: path,
                  sourceImageName: '',
                  sourceWidth: 0,
                  sourceHeight: 0,
                }));
                setSourcePreviewUrl(path ? `/api/fs/image?path=${encodeURIComponent(path)}` : '');
              }}
              onDimensions={(width, height) => setVideo((current) => ({ ...current, sourceWidth: width, sourceHeight: height }))}
              onClear={() => {
                setVideo((current) => ({
                  ...current,
                  sourceImagePath: '',
                  sourceImageName: '',
                  sourceWidth: 0,
                  sourceHeight: 0,
                }));
                setSourcePreviewUrl('');
              }}
            />
            {video.frameGuideMode === 'first_middle_last' ? <FrameSourceField
              label="Middle Frame"
              path={video.middleImagePath}
              onChange={(path) => setVideo((current) => ({ ...current, middleImagePath: path, middleImageName: '' }))}
              onClear={() => setVideo((current) => ({ ...current, middleImagePath: '', middleImageName: '' }))}
            /> : null}
            {video.frameGuideMode !== 'first' ? <FrameSourceField
              label="Last Frame"
              path={video.lastImagePath}
              onChange={(path) => setVideo((current) => ({ ...current, lastImagePath: path, lastImageName: '' }))}
              onClear={() => setVideo((current) => ({ ...current, lastImagePath: '', lastImageName: '' }))}
            /> : null}
          </div>
        ) : null}

        <div className="border border-cyan-300/15 bg-cyan-500/[0.025] p-2.5">
          <div className="mb-1 flex items-center gap-2">
            <Video size={12} className="text-cyan-300" />
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Media Inputs</span>
          </div>
          {video.mode === 'video_to_video' ? <>
            <MediaSourceField
              kind="video"
              label="Source Video"
              path={video.sourceVideoPath}
              onChange={(path) => setVideo((current) => ({
                ...current,
                sourceVideoPath: path,
                sourceVideoName: '',
                sourceWidth: 0,
                sourceHeight: 0,
              }))}
              onUploaded={(path, name) => setVideo((current) => ({
                ...current,
                sourceVideoPath: path,
                sourceVideoName: name,
                sourceWidth: 0,
                sourceHeight: 0,
              }))}
              onDimensions={(width, height) => setVideo((current) => ({ ...current, sourceWidth: width, sourceHeight: height }))}
              onClear={() => setVideo((current) => ({
                ...current,
                sourceVideoPath: '',
                sourceVideoName: '',
                sourceWidth: 0,
                sourceHeight: 0,
              }))}
            />
            <div className="grid gap-2 border-t border-white/[0.07] py-2 sm:grid-cols-[minmax(0,1fr)_88px_150px] sm:items-end">
              <label className="space-y-1.5">
                <span className={labelClass}>Transformation Strength</span>
                <input
                  type="range"
                  min={0.01}
                  max={1}
                  step={0.01}
                  value={video.denoise}
                  onChange={(event) => setCommon('denoise', Number(event.target.value))}
                  className="h-9 w-full accent-fuchsia-400"
                />
              </label>
              <NumberField label="Denoise" value={video.denoise} min={0.01} max={1} step={0.01} onChange={(value) => setCommon('denoise', value)} />
              <ToggleButton
                active={video.preserveSourceAudio}
                label="Preserve Source Audio"
                onClick={() => setCommon('preserveSourceAudio', !video.preserveSourceAudio)}
              />
            </div>
          </> : null}
          <MediaSourceField
            kind="audio"
            label="Audio Track"
            path={video.sourceAudioPath}
            onChange={(path) => setVideo((current) => ({ ...current, sourceAudioPath: path, sourceAudioName: '' }))}
            onUploaded={(path, name) => setVideo((current) => ({ ...current, sourceAudioPath: path, sourceAudioName: name }))}
            onClear={() => setVideo((current) => ({ ...current, sourceAudioPath: '', sourceAudioName: '' }))}
          />
        </div>

        <label className="block space-y-1.5">
          <span className={labelClass}>{agentModeEnabled ? 'Prompt Request' : 'Prompt'}</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Describe motion, camera, subject, and scene continuity" className={`${inputClass} min-h-28 resize-y leading-relaxed`} />
        </label>
        <UmbraInlineAgentPrompt
          mediaType="video"
          sourcePrompt={prompt}
          enabled={agentModeEnabled}
          onEnabledChange={setAgentModeEnabled}
          agentPrompt={agentPrompt}
          onAgentPromptChange={setAgentPrompt}
          accent="fuchsia"
          context={{
            family: video.family,
            mode: video.mode,
            pipeline: pipelineMatch.workflow?.name || '',
            width: targetDimensions.targetWidth,
            height: targetDimensions.targetHeight,
            frames: video.frames,
            fps: video.fps,
            frameGuideMode: video.frameGuideMode,
          }}
        />
        <label className="block space-y-1.5">
          <span className={labelClass}>Negative Prompt</span>
          <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder="Artifacts and motion failures to avoid" className={`${inputClass} min-h-20 resize-y leading-relaxed`} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 space-y-1.5">
            <span className={labelClass}>Target Resolution</span>
            <select
              value={video.resolutionPreset}
              onChange={(event) => setCommon('resolutionPreset', event.target.value)}
              className={inputClass}
            >
              <optgroup label="Resolution presets">
                {UMBRA_VIDEO_RESOLUTION_PRESETS
                  .filter((preset) => preset.group === 'standard')
                  .map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </optgroup>
              <optgroup label="Megapixel tiers">
                {UMBRA_VIDEO_RESOLUTION_PRESETS
                  .filter((preset) => preset.group === 'budget')
                  .map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
              </optgroup>
            </select>
          </label>
          {video.mode === 'text_to_video' ? (
            <label className="col-span-2 space-y-1.5">
              <span className={labelClass}>Frame Aspect</span>
              <select value={video.aspectRatio} onChange={(event) => setCommon('aspectRatio', event.target.value)} className={inputClass}>
                {UMBRA_VIDEO_ASPECT_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>{preset.label}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="col-span-2 flex min-w-0 items-center gap-2 border border-white/10 bg-black/25 px-2.5 py-2">
              <ImageIcon size={11} className={targetDimensions.usedSourceAspect ? 'text-emerald-300' : 'text-amber-300'} />
              <span className={labelClass}>Source Aspect</span>
              <span className="ml-auto font-mono text-[10px] text-zinc-300">
                {targetDimensions.usedSourceAspect
                  ? `${video.sourceWidth}x${video.sourceHeight}`
                  : 'Reading media...'}
              </span>
            </div>
          )}
          <div className="col-span-2 flex min-w-0 items-center gap-2 border border-cyan-300/15 bg-cyan-500/[0.035] px-2.5 py-2 font-mono text-[9px] text-zinc-500">
            <span>{sizing.samplingWidth}x{sizing.samplingHeight} sample</span>
            {sizing.latentScale > 1 ? <><span className="text-zinc-700">/</span><span>{sizing.decodedWidth}x{sizing.decodedHeight} latent</span></> : null}
            <span className="text-zinc-700">/</span>
            <span className="ml-auto text-cyan-200/80">{sizing.targetWidth}x{sizing.targetHeight} final</span>
          </div>
          <NumberField label={`Frames (${video.family === 'ltx23' ? '8n+1' : '4n+1'})`} value={video.frames} min={1} max={16385} step={video.family === 'ltx23' ? 8 : 4} onChange={(value) => setCommon('frames', value)} />
          <NumberField label="FPS" value={video.fps} min={1} max={120} onChange={(value) => setCommon('fps', value)} />
          <div className="col-span-2">
            <UmbraSeedControls
              seed={String(video.seed)}
              mode={video.seedMode}
              onSeedChange={(value) => setCommon('seed', normalizeUmbraUiSeed(value, video.seed))}
              onModeChange={(mode: PowerPrompterSeedControlMode) => setCommon('seedMode', mode)}
              accent="fuchsia"
            />
          </div>
          <label className="col-span-2 space-y-1.5">
            <span className={labelClass}>Output Prefix</span>
            <input value={video.outputPrefix} onChange={(event) => setCommon('outputPrefix', event.target.value)} className={inputClass} />
          </label>
        </div>

        {video.family === 'wan22' ? (
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2"><Database size={12} className="text-amber-300" /><span className={labelClass}>Wan Dual Stage</span></div>
            <SelectField label="High Noise Model (FP8 / GGUF)" value={video.wan.highModel} values={catalog.diffusionModels} onChange={(value) => setWan('highModel', value)} />
            <SelectField label="High Noise LoRA" value={video.wan.highLora} values={catalog.loras} onChange={(value) => setWan('highLora', value)} />
            <NumberField label="High LoRA Strength" value={video.wan.highLoraStrength} step={0.05} onChange={(value) => setWan('highLoraStrength', value)} />
            <SelectField label="Low Noise Model (FP8 / GGUF)" value={video.wan.lowModel} values={catalog.diffusionModels} onChange={(value) => setWan('lowModel', value)} />
            <SelectField label="Low Noise LoRA" value={video.wan.lowLora} values={catalog.loras} onChange={(value) => setWan('lowLora', value)} />
            <NumberField label="Low LoRA Strength" value={video.wan.lowLoraStrength} step={0.05} onChange={(value) => setWan('lowLoraStrength', value)} />
            <SelectField label="Text Encoder" value={video.wan.textEncoder} values={catalog.textEncoders} onChange={(value) => setWan('textEncoder', value)} />
            <SelectField label="VAE" value={video.wan.vae} values={catalog.vaes} onChange={(value) => setWan('vae', value)} />
            {video.mode === 'image_to_video' ? <SelectField label="Vision Encoder" value={video.wan.clipVision} values={catalog.clipVision} onChange={(value) => setWan('clipVision', value)} /> : null}
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Total Steps" value={video.wan.steps} min={2} max={10000} onChange={(value) => setWan('steps', value)} />
              <NumberField label="Split Step" value={video.wan.splitStep} min={1} max={Math.max(1, video.wan.steps - 1)} onChange={(value) => setWan('splitStep', value)} />
              <NumberField label="CFG" value={video.wan.cfg} min={0} max={100} step={0.1} onChange={(value) => setWan('cfg', value)} />
              <NumberField label="Model Shift" value={video.wan.shift} min={0} max={100} step={0.1} onChange={(value) => setWan('shift', value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField label="High Sampler" value={video.wan.highSamplerName} values={samplerOptions} onChange={(value) => setWan('highSamplerName', value)} />
              <SelectField label="High Scheduler" value={video.wan.highScheduler} values={schedulerOptions} onChange={(value) => setWan('highScheduler', value)} />
              <SelectField label="Low Sampler" value={video.wan.lowSamplerName} values={samplerOptions} onChange={(value) => setWan('lowSamplerName', value)} />
              <SelectField label="Low Scheduler" value={video.wan.lowScheduler} values={schedulerOptions} onChange={(value) => setWan('lowScheduler', value)} />
            </div>
          </div>
        ) : (
          <div className="space-y-3 border-t border-white/10 pt-3">
            <div className="flex items-center gap-2"><Film size={12} className="text-cyan-300" /><span className={labelClass}>LTX-2.3 Pipeline</span></div>
            <SelectField label="Checkpoint" value={video.ltx.checkpoint} values={catalog.checkpoints} onChange={(value) => setLtx('checkpoint', value)} />
            <SelectField label="Text Encoder" value={video.ltx.textEncoder} values={catalog.textEncoders} onChange={(value) => setLtx('textEncoder', value)} />
            <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
              <SelectField label="Distilled Model LoRA" value={video.ltx.distilledLora} values={catalog.loras} onChange={(value) => setLtx('distilledLora', value)} />
              <NumberField label="Strength" value={video.ltx.distilledLoraStrength} step={0.05} onChange={(value) => setLtx('distilledLoraStrength', value)} />
              <SelectField label="Prompt LoRA" value={video.ltx.promptLora} values={catalog.loras} onChange={(value) => setLtx('promptLora', value)} />
              <NumberField label="Strength" value={video.ltx.promptLoraStrength} step={0.05} onChange={(value) => setLtx('promptLoraStrength', value)} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <ToggleButton active={video.ltx.twoStage} label="Two Stage" onClick={() => setLtx('twoStage', !video.ltx.twoStage)} />
              <ToggleButton active={video.ltx.audioEnabled} label="Audio" onClick={() => setLtx('audioEnabled', !video.ltx.audioEnabled)} />
            </div>
            {video.ltx.twoStage ? <SelectField label="Latent Upscale Model" value={video.ltx.latentUpscaleModel} values={catalog.latentUpscaleModels} onChange={(value) => setLtx('latentUpscaleModel', value)} /> : null}
            {video.ltx.audioEnabled ? <SelectField label="Audio VAE" value={video.ltx.audioVae} values={catalog.checkpoints} onChange={(value) => setLtx('audioVae', value)} /> : null}
            {video.mode === 'image_to_video' ? (
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Image Strength" value={video.ltx.imageStrength} min={0} max={1} step={0.05} onChange={(value) => setLtx('imageStrength', value)} />
                <NumberField label="Image Compression" value={video.ltx.imageCompression} min={0} max={100} onChange={(value) => setLtx('imageCompression', value)} />
              </div>
            ) : null}
            <div className="border-t border-white/10 pt-3">
              <div className="mb-2 flex items-center gap-2">
                <ImagePlus size={12} className="text-cyan-300" />
                <span className={labelClass}>Keyframe Guides</span>
                <span className="font-mono text-[9px] text-zinc-700">{video.ltx.keyframes.length}</span>
                <button
                  type="button"
                  onClick={() => setLtx('keyframes', [...video.ltx.keyframes, createLtxKeyframe(video.frames, video.ltx.keyframes.length)])}
                  disabled={video.ltx.keyframes.length >= 16}
                  className="ml-auto inline-flex h-7 items-center gap-1 rounded-md border border-cyan-300/20 px-2 text-[8px] font-black uppercase tracking-[0.1em] text-cyan-200 hover:bg-cyan-500/10 disabled:text-zinc-700"
                >
                  <Plus size={10} /> Add Guide
                </button>
              </div>
              <div className="space-y-2">
                {video.ltx.keyframes.map((keyframe) => (
                  <div key={keyframe.id} className="rounded-md border border-white/10 bg-black/20 p-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-black/40">
                        {keyframe.sourceImagePath ? (
                          <img src={`/api/fs/image?path=${encodeURIComponent(keyframe.sourceImagePath)}`} alt="LTX guide" className="h-full w-full object-cover" />
                        ) : <ImageIcon size={13} className="text-zinc-700" />}
                      </div>
                      <input
                        value={keyframe.sourceImagePath}
                        onChange={(event) => updateLtxKeyframe(keyframe.id, { sourceImagePath: event.target.value, sourceImageName: '' })}
                        placeholder="Local image path"
                        className={`${inputClass} min-w-0 flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() => removeLtxKeyframe(keyframe.id)}
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-red-300/15 text-zinc-700 hover:text-red-300"
                        title="Remove keyframe guide"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <NumberField label="Frame" value={keyframe.frameIndex} min={0} max={Math.max(0, video.frames - 1)} onChange={(value) => updateLtxKeyframe(keyframe.id, { frameIndex: value })} />
                      <NumberField label="Strength" value={keyframe.strength} min={0} max={1} step={0.05} onChange={(value) => updateLtxKeyframe(keyframe.id, { strength: value })} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Base CFG" value={video.ltx.baseCfg} min={0} max={100} step={0.1} onChange={(value) => setLtx('baseCfg', value)} />
              <NumberField label="Refine CFG" value={video.ltx.refineCfg} min={0} max={100} step={0.1} onChange={(value) => setLtx('refineCfg', value)} />
              <SelectField label="Base Sampler" value={video.ltx.baseSamplerName} values={samplerOptions} onChange={(value) => setLtx('baseSamplerName', value)} />
              <SelectField label="Refine Sampler" value={video.ltx.refineSamplerName} values={samplerOptions} onChange={(value) => setLtx('refineSamplerName', value)} />
            </div>
            <label className="block space-y-1.5"><span className={labelClass}>Base Sigmas</span><textarea value={video.ltx.baseSigmas} onChange={(event) => setLtx('baseSigmas', event.target.value)} className={`${inputClass} min-h-16 resize-y font-mono text-[10px]`} /></label>
            <label className="block space-y-1.5"><span className={labelClass}>Refine Sigmas</span><textarea value={video.ltx.refineSigmas} onChange={(event) => setLtx('refineSigmas', event.target.value)} className={`${inputClass} min-h-14 resize-y font-mono text-[10px]`} /></label>
          </div>
        )}

        <details className="border-t border-white/10 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300">
            <Gauge size={11} /> Decode Memory
          </summary>
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <ToggleButton active={video.decodeMode === 'auto'} label="Auto" onClick={() => setCommon('decodeMode', 'auto')} />
              <ToggleButton active={video.decodeMode === 'full'} label="Full" onClick={() => setCommon('decodeMode', 'full')} />
              <ToggleButton active={video.decodeMode === 'tiled'} label="Tiled" onClick={() => setCommon('decodeMode', 'tiled')} />
            </div>
            {video.decodeMode !== 'full' ? (
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Tile Size" value={video.decodeTileSize} min={64} max={4096} step={32} onChange={(value) => setCommon('decodeTileSize', value)} />
                <NumberField label="Overlap" value={video.decodeOverlap} min={0} max={4096} step={32} onChange={(value) => setCommon('decodeOverlap', value)} />
                <NumberField label="Temporal Tile" value={video.temporalTileSize} min={8} max={4096} step={4} onChange={(value) => setCommon('temporalTileSize', value)} />
                <NumberField label="Temporal Overlap" value={video.temporalOverlap} min={4} max={4096} step={4} onChange={(value) => setCommon('temporalOverlap', value)} />
              </div>
            ) : null}
          </div>
        </details>

        <details className="border-t border-white/10 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-500 hover:text-zinc-300">
            <SlidersHorizontal size={11} /> Post Processing
          </summary>
          <div className="mt-3 space-y-3">
            <ToggleButton
              active={video.postprocess.interpolationEnabled}
              label="Frame Interpolation"
              onClick={() => setPostprocess('interpolationEnabled', !video.postprocess.interpolationEnabled)}
            />
            {video.postprocess.interpolationEnabled ? (
              <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                <SelectField label="Interpolation Model" value={video.postprocess.interpolationModel} values={catalog.frameInterpolationModels} onChange={(value) => setPostprocess('interpolationModel', value)} />
                <NumberField label="Multiplier" value={video.postprocess.interpolationMultiplier} min={2} max={16} onChange={(value) => setPostprocess('interpolationMultiplier', value)} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><Scaling size={11} className="text-zinc-600" /><span className={labelClass}>Upscale</span></div>
              <div className="grid grid-cols-4 gap-1.5">
                <ToggleButton active={video.postprocess.upscaleMode === 'none'} label="None" onClick={() => setPostprocess('upscaleMode', 'none')} />
                <ToggleButton active={video.postprocess.upscaleMode === 'lanczos'} label="Lanczos" onClick={() => setPostprocess('upscaleMode', 'lanczos')} />
                <ToggleButton active={video.postprocess.upscaleMode === 'model'} label="Model" onClick={() => setPostprocess('upscaleMode', 'model')} />
                <ToggleButton
                  active={video.postprocess.upscaleMode === 'rtx'}
                  label="NVIDIA RTX"
                  onClick={() => setPostprocess('upscaleMode', 'rtx')}
                  disabled={!catalog.rtxAvailable}
                  title={catalog.rtxAvailable ? 'NVIDIA RTX Video Super Resolution' : 'Install NVIDIA RTX Nodes in the managed ComfyUI runtime'}
                />
              </div>
            </div>
            {video.postprocess.upscaleMode !== 'none' ? (
              <div className="space-y-2">
                {video.postprocess.upscaleMode === 'model' ? (
                  <SelectField label="Upscale Model" value={video.postprocess.upscaleModel} values={catalog.upscaleModels} onChange={(value) => setPostprocess('upscaleModel', value)} />
                ) : null}
                {video.postprocess.upscaleMode === 'rtx' ? (
                  <SelectField
                    label="RTX Quality"
                    value={video.postprocess.rtxQuality}
                    values={['LOW', 'MEDIUM', 'HIGH', 'ULTRA']}
                    onChange={(value) => setPostprocess('rtxQuality', value as PowerPrompterVideoControls['postprocess']['rtxQuality'])}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        </details>

        {catalog.error ? <div className="border border-amber-300/20 bg-amber-500/[0.04] px-2.5 py-2 font-mono text-[9px] text-amber-200/70">{catalog.error}</div> : null}
        {!catalog.loading && requiredMissing ? (
          <div className="border border-amber-300/20 bg-amber-500/[0.04] px-2.5 py-2 font-mono text-[9px] text-amber-100/70">
            {sourceDimensionsMissing
              ? 'Waiting for the uploaded source dimensions before calculating the video resolution.'
              : `Install and select the required ${video.family === 'wan22' ? 'Wan high/low models, LoRAs, encoders, and VAE' : 'LTX checkpoint, encoders, LoRAs, and optional stage models'} to enable queueing.`}
          </div>
        ) : null}

        <div className="border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center gap-2 border border-cyan-300/20 bg-cyan-500/[0.045] px-2.5 py-2">
            <Volume2 size={11} className={video.family === 'ltx23' && video.ltx.audioEnabled ? 'text-cyan-300' : 'text-zinc-700'} />
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">{queueSummary.remaining} queue remaining</span>
          </div>
          <div className="space-y-2">
            <UmbraQueuePlacementControls
              queueSummary={queueSummary}
              value={placement}
              onChange={setPlacement}
              subject="video"
            />
          <button
            type="button"
            onClick={() => void handleQueue(effectivePlacement)}
            disabled={queueDisabled}
            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-fuchsia-300/30 bg-fuchsia-500/[0.1] text-[10px] font-black uppercase tracking-[0.16em] text-fuchsia-100 transition-colors hover:bg-fuchsia-500/[0.16] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
            title={sourceDimensionsMissing
              ? 'Wait for Umbra to read the source media dimensions'
              : requiredMissing ? 'Select all required video models first' : 'Queue this video through the shared Power Prompter queue'}
          >
            {isQueueing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
            Generate Video
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
      </div>
    </section>
  );
}

export default UmbraVideoGenerationControls;
