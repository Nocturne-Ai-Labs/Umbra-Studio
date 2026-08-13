'use client';

import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import React from 'react';
import {
  ChevronDown,
  Clapperboard,
  Clock3,
  Database,
  Film,
  FolderOpen,
  Gauge,
  Image as ImageIcon,
  ImagePlus,
  PanelRight,
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
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { UmbraModelPickerModal, type UmbraModelPickerKind } from '@/components/umbra-ui/UmbraModelPickerModal';
import type {
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
  PowerPrompterVideoControls,
  PowerPrompterVideoFamily,
  PowerPrompterVideoMode,
} from '@/types/powerPrompter';
import type {
  ApiWorkflowItem,
  UmbraQueuePlacement,
  UmbraQueueSummary,
  UmbraVideoModelCatalog,
  UmbraVideoQueueOptions,
} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import type { UmbraUiAgentDraft, UmbraUiAgentVideoContext } from '@/lib/umbraUiAgent';
import { UmbraInlineAgentPrompt } from '@/components/umbra-ui/UmbraInlineAgentPrompt';
import { UmbraPositivePromptEditor } from '@/components/umbra-ui/UmbraPositivePromptEditor';
import { UmbraSeedControls } from '@/components/umbra-ui/UmbraSeedControls';
import { UmbraLtxStoryboardPanel } from '@/components/umbra-ui/UmbraLtxStoryboardPanel';
import { UmbraLtxExtendedPanel } from '@/components/umbra-ui/UmbraLtxExtendedPanel';
import {
  UmbraQueuePlacementControls,
  useUmbraQueuePlacement,
} from '@/components/umbra-ui/UmbraQueuePlacementControls';
import { resolveUmbraUiPipeline } from '@/lib/umbraUiPipelines';
import { readDeviceUiResume, writeDeviceUiResume } from '@/lib/deviceUiResume';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { advanceUmbraUiSeed, normalizeUmbraUiSeed, resolveUmbraUiQueueSeed } from '@/lib/umbraUiSeed';
import {
  mergeUmbraUiPromptHistories,
  normalizeUmbraUiPromptHistory,
  recordUmbraUiPromptHistory,
  type UmbraUiPromptHistoryEntry,
} from '@/lib/umbraUiPromptHistory';
import {
  compileUmbraUiPromptSegments,
  createUmbraUiPromptSegment,
  type UmbraUiPromptSegment,
} from '@/lib/umbraUiPromptSegments';
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
import {
  resolveUmbraLtxStoryboardTimeline,
  resolveUmbraVideoDurationSeconds,
  resolveUmbraVideoFrameIndexForSeconds,
  resolveUmbraVideoFramesForDuration,
  type UmbraLtxStoryboardShot,
} from '../../../../shared/umbra-ui/videoStoryboard';
import {
  createDefaultUmbraLtxExtendedControls,
  resolveUmbraLtxExtendedTotalSeconds,
  UMBRA_LTX_EXTENDED_MAX_CLIPS,
  UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS,
  type UmbraLtxExtendedClip,
} from '../../../../shared/umbra-ui/videoExtension';
import {
  applyUmbraPromptWeightToTextarea,
  isUmbraPromptWeightShortcut,
  isUmbraQueueShortcut,
} from '@/lib/umbraUiPromptShortcuts';

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
  onStoryboardOpenChange?: (open: boolean) => void;
}

export interface UmbraVideoEditorDraft {
  id: string;
  prompt: string;
  negativePrompt: string;
  video: PowerPrompterVideoControls;
}

interface UmbraVideoDeviceResume {
  prompt?: string;
  promptSegments?: UmbraUiPromptSegment[];
  activePromptSegmentId?: string;
  agentModeEnabled?: boolean;
  agentPrompt?: string;
  autoPrompterEnabled?: boolean;
  autoPrompterPrompt?: string;
  negativePrompt?: string;
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
    seedIncrement: 1,
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
      rtxVsrEnabled: false,
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
      storyboard: {
        enabled: false,
        epsilon: 0.001,
        shots: [],
      },
      extended: createDefaultUmbraLtxExtendedControls(),
    },
    ltx25: {
      model: '',
      textEncoder: '',
      videoVae: '',
      audioVae: '',
      latentUpscaleModel: '',
      promptEnhanceModel: '',
      baseCfg: 1,
      refineCfg: 1,
      baseSamplerName: 'euler_ancestral',
      refineSamplerName: 'euler_ancestral',
      baseSigmas: '1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0',
      refineSigmas: '0.85, 0.7250, 0.4219, 0.0',
      twoStage: true,
      audioEnabled: true,
      promptEnhance: false,
      promptEnhanceSampling: true,
      promptEnhanceMaxLength: 600,
      promptEnhanceTemperature: 0.7,
      promptEnhanceTopK: 64,
      promptEnhanceTopP: 0.95,
      promptEnhanceMinP: 0.05,
      promptEnhanceRepetitionPenalty: 1.15,
      promptEnhancePresencePenalty: 0,
      promptEnhanceThinking: false,
      imageStrength: 0.7,
      imageCompression: 18,
      keyframes: [],
    },
    minimaxH3: {
      model: '',
      textEncoder: '',
      videoVae: '',
      audioVae: '',
      shiftVideo: 10,
      shiftAudio: 5,
      referenceImageSize: 'match',
      referenceNotes: ['', '', ''],
      sageAttention: 'auto',
      allowCompile: true,
      easyCacheEnabled: true,
      easyCacheReuseThreshold: 0.2,
      easyCacheStartPercent: 0.15,
      easyCacheEndPercent: 0.95,
      steps: 20,
      scheduler: 'simple',
      samplerName: 'res_multistep',
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

function createLtxStoryboardShot(index: number): UmbraLtxStoryboardShot {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `ltx-storyboard-${crypto.randomUUID()}`
      : `ltx-storyboard-${Date.now()}-${index}`,
    prompt: '',
    durationSeconds: 4,
    sourceImagePath: '',
    sourceImageName: '',
    strength: 1,
    agentEnabled: false,
  };
}

function createLtxExtendedClip(index: number): UmbraLtxExtendedClip {
  return {
    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `ltx-extended-${crypto.randomUUID()}`
      : `ltx-extended-${Date.now()}-${index}`,
    prompt: '',
    durationSeconds: 10,
  };
}

function resolveMiniMaxH3FramesForDuration(durationSeconds: number): number {
  const requested = Math.max(5, Math.round(Math.max(0.25, durationSeconds) * 24));
  const remainder = requested % 17;
  return remainder === 5 ? requested : requested + ((5 - remainder + 17) % 17);
}

function resolveVideoFramesForDurationChange(
  durationSeconds: number,
  currentFrames: number,
  currentFps: number,
  family: PowerPrompterVideoControls['family'],
): number {
  const stride = family === 'minimax_h3' ? 17 : family === 'ltx23' || family === 'ltx25' ? 8 : 4;
  const minimumFrames = family === 'minimax_h3' ? 5 : stride + 1;
  const requestedFrames = family === 'minimax_h3'
    ? resolveMiniMaxH3FramesForDuration(durationSeconds)
    : resolveUmbraVideoFramesForDuration(durationSeconds, currentFps, stride);
  const currentDuration = resolveUmbraVideoDurationSeconds(currentFrames, currentFps);
  if (durationSeconds < currentDuration && requestedFrames >= currentFrames) {
    return Math.max(minimumFrames, currentFrames - stride);
  }
  if (durationSeconds > currentDuration && requestedFrames <= currentFrames) {
    return currentFrames + stride;
  }
  return requestedFrames;
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
      <UmbraSelect
        ariaLabel={label}
        menuTitle={label}
        value={value}
        onValueChange={onChange}
        options={[
          { value: '', label: emptyLabel },
          ...options.map((option) => ({ value: option, label: option })),
        ]}
      />
    </label>
  );
}

interface VideoResourcePicker {
  label: string;
  value: string;
  values: string[];
  kind: UmbraModelPickerKind;
  onChange: (value: string) => void;
}

function VideoResourceField({
  label,
  value,
  values,
  onChange,
  onChoose,
  kind = 'checkpoint',
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
  onChoose: (picker: VideoResourcePicker) => void;
  kind?: UmbraModelPickerKind;
}) {
  const available = optionList(value, values);
  return (
    <div className="min-w-0 space-y-1.5">
      <span className={labelClass}>{label}</span>
      <button
        type="button"
        onClick={() => onChoose({ label, value, values: available, kind, onChange })}
        className="flex min-h-10 w-full min-w-0 items-center gap-2 rounded-md border border-white/10 bg-black/30 px-2.5 text-left transition-colors hover:border-cyan-300/40 hover:bg-cyan-500/[0.055]"
        title={`Browse ${label.toLowerCase()}`}
      >
        <FolderOpen size={12} className="shrink-0 text-cyan-300" />
        <span className={cn('min-w-0 flex-1 truncate font-mono text-[10px]', value ? 'text-zinc-100' : 'text-zinc-600')}>
          {value || 'Choose file...'}
        </span>
        <span className="shrink-0 rounded-sm border border-cyan-300/15 bg-cyan-500/[0.055] px-1.5 py-0.5 font-mono text-[8px] text-cyan-100/75">{available.length}</span>
      </button>
    </div>
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
  const [draft, setDraft] = React.useState(String(value));
  const [editing, setEditing] = React.useState(false);
  React.useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [editing, value]);
  return (
    <label className="space-y-1.5">
      <span className={labelClass}>{label}</span>
      <input
        type="number"
        value={draft}
        min={min}
        max={max}
        step={step}
        onFocus={() => setEditing(true)}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          if (next.trim() !== '' && Number.isFinite(Number(next))) onChange(Number(next));
        }}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() === '' || !Number.isFinite(Number(draft))) setDraft(String(value));
          else onChange(Number(draft));
        }}
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

function VideoAccordion({
  title,
  icon,
  children,
  defaultOpen = false,
  summary,
  accent = 'zinc',
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  summary?: string;
  accent?: 'zinc' | 'cyan' | 'fuchsia' | 'amber';
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const tone = accent === 'fuchsia'
    ? 'border-fuchsia-300/18 bg-fuchsia-500/[0.025]'
    : accent === 'cyan'
      ? 'border-cyan-300/18 bg-cyan-500/[0.025]'
      : accent === 'amber'
        ? 'border-amber-300/18 bg-amber-500/[0.025]'
        : 'border-white/10 bg-black/20';
  return (
    <details
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className={cn('overflow-hidden rounded-md border', tone)}
    >
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 px-2.5 py-2 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300 hover:bg-white/[0.025]">
        {icon}
        <span>{title}</span>
        {summary ? <span className="ml-auto truncate font-mono text-[8px] font-normal normal-case tracking-normal text-zinc-600">{summary}</span> : null}
        <ChevronDown size={11} className={cn('shrink-0 text-zinc-600 transition-transform', open && 'rotate-180', !summary && 'ml-auto')} />
      </summary>
      <div className="space-y-3 border-t border-white/[0.08] p-2.5">
        {children}
      </div>
    </details>
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
  onStoryboardOpenChange,
}: UmbraVideoGenerationControlsProps) {
  const showToast = useStore((state) => state.showToast);
  const [initialDeviceResume] = React.useState(() => readDeviceUiResume<UmbraVideoDeviceResume>('umbra-ui-video'));
  const [promptSegments, setPromptSegments] = React.useState<UmbraUiPromptSegment[]>(() => (
    Array.isArray(initialDeviceResume?.promptSegments) && initialDeviceResume.promptSegments.length > 0
      ? initialDeviceResume.promptSegments.map((segment) => ({ ...segment }))
      : [createUmbraUiPromptSegment(initialDeviceResume?.prompt || '', { label: 'Video Prompt' })]
  ));
  const [activePromptSegmentId, setActivePromptSegmentId] = React.useState(
    initialDeviceResume?.activePromptSegmentId || promptSegments[0]?.id || '',
  );
  const [promptHistory, setPromptHistory] = React.useState<UmbraUiPromptHistoryEntry[]>([]);
  const promptHistoryLoadedRef = React.useRef(false);
  const promptHistoryDirtyRef = React.useRef(false);
  const promptHistoryRevisionRef = React.useRef(0);
  const promptHistoryWriteQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const prompt = React.useMemo(() => compileUmbraUiPromptSegments(promptSegments), [promptSegments]);
  const [agentModeEnabled, setAgentModeEnabled] = React.useState(initialDeviceResume?.agentModeEnabled === true);
  const [agentPrompt, setAgentPrompt] = React.useState(initialDeviceResume?.agentPrompt || '');
  const [autoPrompterEnabled, setAutoPrompterEnabled] = React.useState(initialDeviceResume?.autoPrompterEnabled === true);
  const [autoPrompterPrompt, setAutoPrompterPrompt] = React.useState(initialDeviceResume?.autoPrompterPrompt || '');
  const workflowPrompt = autoPrompterEnabled ? autoPrompterPrompt.trim() : agentModeEnabled ? agentPrompt.trim() : prompt;
  const [negativePrompt, setNegativePrompt] = React.useState(initialDeviceResume?.negativePrompt || '');
  const [video, setVideo] = React.useState<PowerPrompterVideoControls>(() => createDefaultVideoControls());
  const [selectedStoryboardShotId, setSelectedStoryboardShotId] = React.useState('');
  const [sourcePreviewUrl, setSourcePreviewUrl] = React.useState('');
  const [isQueueing, setIsQueueing] = React.useState(false);
  const [resourcePicker, setResourcePicker] = React.useState<VideoResourcePicker | null>(null);
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
  const storyboardTimeline = React.useMemo(
    () => resolveUmbraLtxStoryboardTimeline(video.ltx.storyboard, video.fps, video.frames),
    [video.fps, video.frames, video.ltx.storyboard],
  );
  const storyboardOpen = video.family === 'ltx23' && video.ltx.storyboard.enabled;
  const extendedOpen = video.family === 'ltx23' && video.ltx.extended.enabled;
  const extendedTotalSeconds = React.useMemo(
    () => resolveUmbraLtxExtendedTotalSeconds(video.ltx.extended),
    [video.ltx.extended],
  );
  const videoDurationSeconds = extendedOpen
    ? extendedTotalSeconds
    : storyboardOpen
    ? storyboardTimeline.durationSeconds
    : resolveUmbraVideoDurationSeconds(video.frames, video.fps);
  const queuePrompt = extendedOpen
    ? String(video.ltx.extended.clips[0]?.prompt || '').trim()
    : workflowPrompt;

  const replacePromptSegments = React.useCallback((
    text: string,
    segments?: UmbraUiPromptSegment[],
  ) => {
    const nextSegments = Array.isArray(segments) && segments.length > 0
      ? segments.map((segment) => ({ ...segment }))
      : [createUmbraUiPromptSegment(text, { label: 'Video Prompt' })];
    setPromptSegments(nextSegments);
    setActivePromptSegmentId(nextSegments[0]?.id || '');
  }, []);

  React.useEffect(() => {
    setVideo((current) => (
      current.width === targetDimensions.targetWidth && current.height === targetDimensions.targetHeight
        ? current
        : { ...current, width: targetDimensions.targetWidth, height: targetDimensions.targetHeight }
    ));
  }, [targetDimensions.targetHeight, targetDimensions.targetWidth]);

  React.useEffect(() => {
    onStoryboardOpenChange?.(storyboardOpen || extendedOpen);
    return () => onStoryboardOpenChange?.(false);
  }, [extendedOpen, onStoryboardOpenChange, storyboardOpen]);

  React.useEffect(() => {
    if (!storyboardOpen || video.frames === storyboardTimeline.frames) return;
    setVideo((current) => ({
      ...current,
      frames: resolveUmbraLtxStoryboardTimeline(
        current.ltx.storyboard,
        current.fps,
        current.frames,
      ).frames,
    }));
  }, [storyboardOpen, storyboardTimeline.frames, video.frames]);

  React.useEffect(() => {
    if (!storyboardOpen || video.ltx.storyboard.shots.length <= 0) return;
    if (video.ltx.storyboard.shots.some((shot) => shot.id === selectedStoryboardShotId)) return;
    setSelectedStoryboardShotId(video.ltx.storyboard.shots[0].id);
  }, [selectedStoryboardShotId, storyboardOpen, video.ltx.storyboard.shots]);

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
              storyboard: {
                ...defaults.ltx.storyboard,
                ...(savedVideo.ltx?.storyboard || {}),
                shots: Array.isArray(savedVideo.ltx?.storyboard?.shots)
                  ? savedVideo.ltx.storyboard.shots.map((shot) => ({ ...shot }))
                  : [],
              },
              extended: {
                ...defaults.ltx.extended,
                ...(savedVideo.ltx?.extended || {}),
                clips: Array.isArray(savedVideo.ltx?.extended?.clips)
                  ? savedVideo.ltx.extended.clips.map((clip) => ({ ...clip }))
                  : defaults.ltx.extended.clips.map((clip) => ({ ...clip })),
              },
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
    let canceled = false;
    void readUserConfig<unknown>('umbra-ui-video-prompt-history', [])
      .then((storedHistory) => {
        if (canceled) return;
        setPromptHistory((current) => mergeUmbraUiPromptHistories(
          normalizeUmbraUiPromptHistory(storedHistory),
          current,
        ));
        promptHistoryLoadedRef.current = true;
      });
    return () => {
      canceled = true;
    };
  }, []);

  React.useEffect(() => {
    if (!promptHistoryLoadedRef.current || !promptHistoryDirtyRef.current) return;
    const revision = promptHistoryRevisionRef.current;
    promptHistoryWriteQueueRef.current = promptHistoryWriteQueueRef.current
      .catch(() => undefined)
      .then(() => writeUserConfig('umbra-ui-video-prompt-history', promptHistory))
      .then(() => {
        if (promptHistoryRevisionRef.current === revision) {
          promptHistoryDirtyRef.current = false;
        }
      })
      .catch((error) => {
        console.warn('[Umbra UI] Failed to persist video prompt history:', error);
      });
  }, [promptHistory]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      writeDeviceUiResume<UmbraVideoDeviceResume>('umbra-ui-video', {
        prompt,
        promptSegments,
        activePromptSegmentId,
        agentModeEnabled,
        agentPrompt,
        autoPrompterEnabled,
        autoPrompterPrompt,
        negativePrompt,
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [activePromptSegmentId, agentModeEnabled, agentPrompt, autoPrompterEnabled, autoPrompterPrompt, negativePrompt, prompt, promptSegments]);

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
    replacePromptSegments(editorDraft.prompt);
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
        storyboard: {
          ...defaults.ltx.storyboard,
          ...(editorDraft.video.ltx.storyboard || {}),
          shots: Array.isArray(editorDraft.video.ltx.storyboard?.shots)
            ? editorDraft.video.ltx.storyboard.shots.map((shot) => ({ ...shot }))
            : [],
        },
        extended: {
          ...defaults.ltx.extended,
          ...(editorDraft.video.ltx.extended || {}),
          clips: Array.isArray(editorDraft.video.ltx.extended?.clips)
            ? editorDraft.video.ltx.extended.clips.map((clip) => ({ ...clip }))
            : defaults.ltx.extended.clips.map((clip) => ({ ...clip })),
        },
      },
      ltx25: {
        ...defaults.ltx25,
        ...(editorDraft.video.ltx25 || {}),
        keyframes: Array.isArray(editorDraft.video.ltx25?.keyframes)
          ? editorDraft.video.ltx25.keyframes.map((keyframe) => ({ ...keyframe }))
          : [],
      },
      minimaxH3: {
        ...defaults.minimaxH3,
        ...(editorDraft.video.minimaxH3 || {}),
      },
    });
    setSourcePreviewUrl(editorDraft.video.sourceImagePath
      ? `/api/fs/image?path=${encodeURIComponent(editorDraft.video.sourceImagePath)}`
      : '');
    onEditorDraftApplied?.(editorDraft.id);
  }, [editorDraft, onEditorDraftApplied, replacePromptSegments]);

  React.useEffect(() => {
    const modelFamily = video.family === 'wan22' ? 'Wan 2.2' : video.family === 'ltx23' ? 'LTX-2.3' : video.family === 'ltx25' ? 'LTX-2.5' : 'MiniMax H3';
    const feature = video.mode === 'video_to_video'
      ? 'vid2vid'
      : video.mode === 'reference_to_video' ? 'ref2vid'
      : video.mode === 'image_to_video' ? 'img2vid' : 'txt2vid';
    const modelSource = video.family === 'ltx23' ? 'checkpoint' : 'unet';
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
        autoPrompterEnabled,
        autoPrompterPrompt,
      },
    });
  }, [agentModeEnabled, agentPrompt, autoPrompterEnabled, autoPrompterPrompt, negativePrompt, onAgentContextChange, targetDimensions.targetHeight, targetDimensions.targetWidth, video, workflowPrompt, workflows]);

  React.useEffect(() => {
    if ((video.mode !== 'image_to_video' && video.mode !== 'reference_to_video') || !video.sourceImagePath || video.sourceImageName) return;
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
    const sourcePath = video.mode === 'image_to_video' || video.mode === 'reference_to_video'
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
        const currentPath = current.mode === 'image_to_video' || current.mode === 'reference_to_video'
          ? current.sourceImagePath
          : current.mode === 'video_to_video' ? current.sourceVideoPath : '';
        return currentPath === sourcePath
          ? { ...current, sourceWidth: width, sourceHeight: height }
          : current;
      });
    }).catch(() => undefined);
    return () => controller.abort();
  }, [video.mode, video.sourceImagePath, video.sourceVideoPath]);

  const modelFamily = video.family === 'wan22' ? 'Wan 2.2' : video.family === 'ltx23' ? 'LTX-2.3' : video.family === 'ltx25' ? 'LTX-2.5' : 'MiniMax H3';
  const pipelineFeature = video.mode === 'video_to_video'
    ? 'vid2vid'
    : video.mode === 'reference_to_video' ? 'ref2vid'
    : video.mode === 'image_to_video' ? 'img2vid' : 'txt2vid';
  const pipelineModelSource = video.family === 'ltx23' ? 'checkpoint' : 'unet';
  const pipelineMatch = React.useMemo(
    () => resolveUmbraUiPipeline(workflows, pipelineFeature, modelFamily, pipelineModelSource),
    [modelFamily, pipelineFeature, pipelineModelSource, workflows],
  );

  React.useEffect(() => {
    if (promptSegments.some((segment) => segment.id === activePromptSegmentId)) return;
    setActivePromptSegmentId(promptSegments[0]?.id || '');
  }, [activePromptSegmentId, promptSegments]);

  const rememberCurrentPrompt = React.useCallback(() => {
    if (!prompt) {
      showToast('Enter a video prompt before saving it to history.', 'error');
      return;
    }
    promptHistoryDirtyRef.current = true;
    promptHistoryRevisionRef.current += 1;
    setPromptHistory((current) => recordUmbraUiPromptHistory(
      current,
      promptSegments,
      negativePrompt,
    ));
    showToast('Video prompt saved to history.', 'success');
  }, [negativePrompt, prompt, promptSegments, showToast]);

  const restorePromptHistoryEntry = React.useCallback((entry: UmbraUiPromptHistoryEntry) => {
    const restoredSegments = entry.promptSegments.map((segment) => ({ ...segment }));
    if (restoredSegments.length <= 0) return;
    setPromptSegments(restoredSegments);
    setActivePromptSegmentId(restoredSegments[0].id);
    setNegativePrompt(entry.negativePrompt);
    showToast(`Restored ${restoredSegments.length} video prompt field${restoredSegments.length === 1 ? '' : 's'}.`, 'success');
  }, [showToast]);

  const removePromptHistoryEntry = React.useCallback((entryId: string) => {
    promptHistoryDirtyRef.current = true;
    promptHistoryRevisionRef.current += 1;
    setPromptHistory((current) => current.filter((entry) => entry.id !== entryId));
  }, []);

  const clearPromptHistory = React.useCallback(() => {
    promptHistoryDirtyRef.current = true;
    promptHistoryRevisionRef.current += 1;
    setPromptHistory([]);
    showToast('Video prompt history cleared.', 'success');
  }, [showToast]);

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
    if (detail.generation?.positivePrompt) {
      const handoffSegments = Array.isArray(detail.generation.positivePromptSegments)
        ? detail.generation.positivePromptSegments.map((segment) => createUmbraUiPromptSegment(segment.text, {
          label: segment.label,
          slotType: segment.slotType,
          variantId: segment.variantId,
          variantName: segment.variantName,
        }))
        : [];
      replacePromptSegments(detail.generation.positivePrompt, handoffSegments);
    }
    if (detail.generation?.negativePrompt) setNegativePrompt(detail.generation.negativePrompt);
  }, [replacePromptSegments]);

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
    setVideo((current) => {
      const fps = family === 'minimax_h3' || family === 'ltx25' ? 24 : family === 'ltx23' ? 25 : 16;
      const frameStride = family === 'ltx23' || family === 'ltx25' ? 8 : 4;
      const durationSeconds = resolveUmbraVideoDurationSeconds(current.frames, current.fps);
      return {
        ...current,
        family,
        fps,
        mode: family === 'minimax_h3' && current.mode === 'video_to_video'
          ? 'text_to_video'
          : family !== 'minimax_h3' && current.mode === 'reference_to_video'
            ? 'text_to_video'
            : current.mode,
        frameGuideMode: family === 'minimax_h3' ? 'first' : current.frameGuideMode,
        frames: family === 'minimax_h3'
          ? resolveMiniMaxH3FramesForDuration(durationSeconds)
          : resolveUmbraVideoFramesForDuration(durationSeconds, fps, frameStride),
        ltx: {
          ...current.ltx,
          storyboard: {
            ...current.ltx.storyboard,
            enabled: family === 'ltx23' && current.ltx.storyboard.enabled,
          },
          extended: {
            ...current.ltx.extended,
            enabled: family === 'ltx23' && current.ltx.extended.enabled,
          },
        },
      };
    });
  };
  const setMode = (mode: PowerPrompterVideoMode) => setVideo((current) => ({
    ...current,
    mode,
    ltx: {
      ...current.ltx,
      storyboard: {
        ...current.ltx.storyboard,
        enabled: false,
      },
      extended: {
        ...current.ltx.extended,
        enabled: false,
      },
    },
  }));
  const setCommon = <K extends keyof PowerPrompterVideoControls>(key: K, value: PowerPrompterVideoControls[K]) => {
    setVideo((current) => ({ ...current, [key]: value }));
  };
  const setWan = <K extends keyof PowerPrompterVideoControls['wan']>(key: K, value: PowerPrompterVideoControls['wan'][K]) => {
    setVideo((current) => ({ ...current, wan: { ...current.wan, [key]: value } }));
  };
  const setLtx = <K extends keyof PowerPrompterVideoControls['ltx']>(key: K, value: PowerPrompterVideoControls['ltx'][K]) => {
    setVideo((current) => ({ ...current, ltx: { ...current.ltx, [key]: value } }));
  };
  const setLtx25 = <K extends keyof PowerPrompterVideoControls['ltx25']>(key: K, value: PowerPrompterVideoControls['ltx25'][K]) => {
    setVideo((current) => ({ ...current, ltx25: { ...current.ltx25, [key]: value } }));
  };
  const setMiniMaxH3 = <K extends keyof PowerPrompterVideoControls['minimaxH3']>(key: K, value: PowerPrompterVideoControls['minimaxH3'][K]) => {
    setVideo((current) => ({ ...current, minimaxH3: { ...current.minimaxH3, [key]: value } }));
  };
  const setMiniMaxReferenceNote = (index: 0 | 1 | 2, value: string) => {
    setVideo((current) => {
      const referenceNotes = [...current.minimaxH3.referenceNotes] as [string, string, string];
      referenceNotes[index] = value.slice(0, 500);
      return { ...current, minimaxH3: { ...current.minimaxH3, referenceNotes } };
    });
  };
  const setStoryboardShots = React.useCallback((shots: UmbraLtxStoryboardShot[]) => {
    setVideo((current) => ({
      ...current,
      ltx: {
        ...current.ltx,
        storyboard: {
          ...current.ltx.storyboard,
          shots: shots.map((shot) => ({ ...shot })),
        },
      },
    }));
  }, []);
  const setStoryboardEnabled = React.useCallback((enabled: boolean) => {
    setVideo((current) => {
      const shots = current.ltx.storyboard.shots.length >= 2
        ? current.ltx.storyboard.shots
        : [createLtxStoryboardShot(0), createLtxStoryboardShot(1)];
      return {
        ...current,
        mode: enabled ? 'text_to_video' : current.mode,
        ltx: {
          ...current.ltx,
          storyboard: {
            ...current.ltx.storyboard,
            enabled,
            shots,
          },
          extended: {
            ...current.ltx.extended,
            enabled: false,
          },
        },
      };
    });
  }, []);
  const setExtendedEnabled = React.useCallback((enabled: boolean) => {
    setVideo((current) => {
      const clips = current.ltx.extended.clips.length > 0
        ? current.ltx.extended.clips
        : createDefaultUmbraLtxExtendedControls().clips;
      return {
        ...current,
        mode: enabled
          ? current.sourceImagePath ? 'image_to_video' : 'text_to_video'
          : current.mode,
        ltx: {
          ...current.ltx,
          keyframes: enabled ? [] : current.ltx.keyframes,
          storyboard: {
            ...current.ltx.storyboard,
            enabled: false,
          },
          extended: {
            ...current.ltx.extended,
            enabled,
            clips: clips.map((clip) => ({ ...clip })),
          },
        },
      };
    });
  }, []);
  const setExtendedClips = React.useCallback((clips: UmbraLtxExtendedClip[]) => {
    setVideo((current) => ({
      ...current,
      ltx: {
        ...current.ltx,
        extended: {
          ...current.ltx.extended,
          clips: clips.slice(0, UMBRA_LTX_EXTENDED_MAX_CLIPS).map((clip) => ({ ...clip })),
        },
      },
    }));
  }, []);
  const addExtendedClip = React.useCallback(() => {
    setVideo((current) => {
      if (current.ltx.extended.clips.length >= UMBRA_LTX_EXTENDED_MAX_CLIPS) return current;
      return {
        ...current,
        ltx: {
          ...current.ltx,
          extended: {
            ...current.ltx.extended,
            clips: [
              ...current.ltx.extended.clips,
              createLtxExtendedClip(current.ltx.extended.clips.length),
            ],
          },
        },
      };
    });
  }, []);
  const setDurationSeconds = React.useCallback((durationSeconds: number) => {
    setVideo((current) => ({
      ...current,
      frames: resolveVideoFramesForDurationChange(durationSeconds, current.frames, current.fps, current.family),
    }));
  }, []);
  const setOutputFps = React.useCallback((fpsInput: number) => {
    setVideo((current) => {
      if (current.family === 'minimax_h3') {
        return { ...current, fps: 24 };
      }
      const fps = Math.max(1, Math.min(120, Math.round(fpsInput || current.fps)));
      const frameStride = current.family === 'ltx23' || current.family === 'ltx25' ? 8 : 4;
      const durationSeconds = current.family === 'ltx23' && current.ltx.extended.enabled
        ? current.ltx.extended.clips[0]?.durationSeconds || 10
        : current.family === 'ltx23' && current.ltx.storyboard.enabled
        ? current.ltx.storyboard.shots.reduce((sum, shot) => sum + shot.durationSeconds, 0)
        : resolveUmbraVideoDurationSeconds(current.frames, current.fps);
      const frames = current.family === 'ltx23' && current.ltx.extended.enabled
        ? resolveUmbraVideoFramesForDuration(durationSeconds, fps, frameStride)
        : current.family === 'ltx23' && current.ltx.storyboard.enabled
        ? resolveUmbraLtxStoryboardTimeline(current.ltx.storyboard, fps, current.frames).frames
        : resolveUmbraVideoFramesForDuration(durationSeconds, fps, frameStride);
      return {
        ...current,
        fps,
        frames,
        ltx: {
          ...current.ltx,
          keyframes: current.ltx.keyframes.map((keyframe) => ({
            ...keyframe,
            frameIndex: resolveUmbraVideoFrameIndexForSeconds(
              keyframe.frameIndex / Math.max(1, current.fps),
              fps,
              8,
              Math.max(0, frames - 1),
            ),
          })),
        },
      };
    });
  }, []);
  const addStoryboardShot = React.useCallback(() => {
    setVideo((current) => {
      if (current.ltx.storyboard.shots.length >= 24) return current;
      const shot = createLtxStoryboardShot(current.ltx.storyboard.shots.length);
      return {
        ...current,
        ltx: {
          ...current.ltx,
          storyboard: {
            ...current.ltx.storyboard,
            shots: [...current.ltx.storyboard.shots, shot],
          },
        },
      };
    });
  }, []);
  const setPostprocess = <K extends keyof PowerPrompterVideoControls['postprocess']>(key: K, value: PowerPrompterVideoControls['postprocess'][K]) => {
    setVideo((current) => ({ ...current, postprocess: { ...current.postprocess, [key]: value } }));
  };
  const sizing = resolveUmbraVideoSizing({
    width: targetDimensions.targetWidth,
    height: targetDimensions.targetHeight,
    family: video.family,
    ltxTwoStage: video.family === 'ltx25' ? video.ltx25.twoStage : video.ltx.twoStage,
    upscaleMode: video.postprocess.upscaleMode,
    upscaleScale: video.postprocess.upscaleScale,
    rtxVsrEnabled: video.postprocess.rtxVsrEnabled,
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
    && !extendedOpen
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
    if (video.family === 'minimax_h3') {
      const referenceMissing = video.mode === 'reference_to_video' && !video.sourceImagePath;
      return frameGuideMissing || referenceMissing || sourceDimensionsMissing || [
        video.minimaxH3.model,
        video.minimaxH3.textEncoder,
        video.minimaxH3.videoVae,
        video.minimaxH3.audioVae,
        ...((video.mode === 'image_to_video' || video.mode === 'reference_to_video') ? [video.sourceImagePath] : []),
      ].some((value) => !String(value || '').trim());
    }
    if (video.family === 'ltx25') {
      return sourceVideoMissing || frameGuideMissing || sourceDimensionsMissing || [
        video.ltx25.model,
        video.ltx25.textEncoder,
        video.ltx25.videoVae,
        ...(video.ltx25.twoStage ? [video.ltx25.latentUpscaleModel] : []),
        ...(video.ltx25.audioEnabled && !(video.mode === 'video_to_video' && video.preserveSourceAudio) ? [video.ltx25.audioVae] : []),
        ...(video.ltx25.promptEnhance ? [video.ltx25.promptEnhanceModel] : []),
        ...(video.mode === 'image_to_video' ? [video.sourceImagePath] : []),
      ].some((value) => !String(value || '').trim());
    }
    const extendedMissing = extendedOpen && (
      video.ltx.extended.clips.length < 1
      || video.ltx.extended.clips.length > UMBRA_LTX_EXTENDED_MAX_CLIPS
      || extendedTotalSeconds > UMBRA_LTX_EXTENDED_MAX_TOTAL_SECONDS
      || video.ltx.extended.clips.some((clip) => (
        !clip.prompt.trim()
        || clip.durationSeconds < 1
        || clip.durationSeconds > 10
      ))
    );
    return sourceVideoMissing || frameGuideMissing || sourceDimensionsMissing || extendedMissing || [
      video.ltx.checkpoint,
      video.ltx.textEncoder,
      video.ltx.distilledLora,
      video.ltx.promptLora,
      ...(video.ltx.twoStage ? [video.ltx.latentUpscaleModel] : []),
      ...(video.ltx.audioEnabled && !(video.mode === 'video_to_video' && video.preserveSourceAudio) ? [video.ltx.audioVae] : []),
      ...(video.mode === 'image_to_video' ? [video.sourceImagePath] : []),
    ].some((value) => !String(value || '').trim());
  }, [extendedOpen, extendedTotalSeconds, video])
    || (video.postprocess.interpolationEnabled && !video.postprocess.interpolationModel)
    || (video.postprocess.upscaleMode === 'model' && !video.postprocess.upscaleModel)
    || (video.postprocess.rtxVsrEnabled && !catalog.rtxAvailable)
    || (video.family === 'ltx23' && !storyboardOpen && !extendedOpen && video.ltx.keyframes.some((keyframe) => !keyframe.sourceImagePath && !keyframe.sourceImageName))
    || (video.family === 'ltx25' && video.ltx25.keyframes.some((keyframe) => !keyframe.sourceImagePath && !keyframe.sourceImageName))
    || (storyboardOpen && (
      !catalog.umbraDirectorAvailable
      || video.ltx.storyboard.shots.length < 2
      || video.ltx.storyboard.shots.some((shot) => !shot.prompt.trim())
    ));

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
        prompt: queuePrompt,
        negativePrompt,
        video: {
          ...video,
          seed: queuedSeed,
          width: targetDimensions.targetWidth,
          height: targetDimensions.targetHeight,
        },
        queuePlacement,
      });
      const nextSeed = advanceUmbraUiSeed(queuedSeed, video.seedMode, video.seedIncrement);
      setVideo((current) => current.seed === video.seed
        && current.seedMode === video.seedMode
        && current.seedIncrement === video.seedIncrement
        ? { ...current, seed: nextSeed }
        : current);
      const placementMessage = queuePlacement === 'next'
        ? 'will run after the current Power Prompter image.'
        : queuePlacement === 'interrupt'
          ? 'will run as soon as the current Power Prompter image stops.'
          : queueSummary.powerPrompterActive
            ? 'was added to the end of the Power Prompter queue.'
            : 'was submitted for generation.';
      showToast(`${video.family === 'wan22' ? 'Wan 2.2' : video.family === 'ltx23' ? 'LTX-2.3' : video.family === 'ltx25' ? 'LTX-2.5' : 'MiniMax H3'} video ${placementMessage}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue video.', 'error');
    } finally {
      setIsQueueing(false);
    }
  };

  const handlePromptKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
    onValueChange: (value: string) => void,
  ) => {
    if (isUmbraPromptWeightShortcut(event.nativeEvent)) {
      const textarea = event.currentTarget;
      const weighted = applyUmbraPromptWeightToTextarea(
        textarea,
        event.key === 'ArrowUp' ? 0.1 : -0.1,
      );
      if (!weighted) return;
      event.preventDefault();
      onValueChange(weighted.nextValue);
      window.requestAnimationFrame(() => {
        textarea.focus({ preventScroll: true });
        textarea.setSelectionRange(weighted.selectionStart, weighted.selectionEnd);
      });
      return;
    }
    if (isUmbraQueueShortcut(event.nativeEvent)) {
      event.preventDefault();
      void handleQueue();
    }
  };

  const samplerOptions = catalog.samplers.length > 0 ? catalog.samplers : ['euler', 'uni_pc'];
  const schedulerOptions = catalog.schedulers.length > 0 ? catalog.schedulers : ['simple', 'beta'];
  const queueDisabled = isQueueing || !queueConnected || !comfyConnected || !pipelineMatch.workflow || !queuePrompt || requiredMissing;

  return (
    <>
    <section data-umbra-ui-video-controls="" className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar">
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

      <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        <ToggleButton active={video.family === 'wan22'} label="Wan 2.2" onClick={() => setFamily('wan22')} />
        <ToggleButton active={video.family === 'ltx23'} label="LTX-2.3" onClick={() => setFamily('ltx23')} />
        <ToggleButton active={video.family === 'ltx25'} label="LTX-2.5" onClick={() => setFamily('ltx25')} />
        <ToggleButton active={video.family === 'minimax_h3'} label="MiniMax H3" onClick={() => setFamily('minimax_h3')} />
      </div>
      <div className="mb-3 rounded-md border border-fuchsia-300/20 bg-fuchsia-500/[0.045] p-2.5">
        <div className="mb-2 flex items-center gap-2">
          <Database size={12} className="text-fuchsia-300" />
          <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">
            Video Model
          </span>
          <span className="ml-auto font-mono text-[8px] text-zinc-600">
            {video.family === 'ltx23' ? 'LTX-2.3' : video.family === 'ltx25' ? 'LTX-2.5' : video.family === 'minimax_h3' ? 'MiniMax H3' : 'Wan 2.2'}
          </span>
        </div>
        {video.family === 'ltx23' ? (
          <VideoResourceField
            label="LTX Checkpoint"
            value={video.ltx.checkpoint}
            values={catalog.checkpoints}
            onChange={(value) => setLtx('checkpoint', value)}
            onChoose={setResourcePicker}
          />
        ) : video.family === 'ltx25' ? (
          <VideoResourceField
            label="LTX-2.5 Diffusion Model"
            value={video.ltx25.model}
            values={catalog.diffusionModels}
            onChange={(value) => setLtx25('model', value)}
            onChoose={setResourcePicker}
          />
        ) : video.family === 'minimax_h3' ? (
          <VideoResourceField
            label="MiniMax H3 Model"
            value={video.minimaxH3.model}
            values={catalog.diffusionModels}
            onChange={(value) => setMiniMaxH3('model', value)}
            onChoose={setResourcePicker}
          />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            <VideoResourceField
              label="High Noise Model"
              value={video.wan.highModel}
              values={catalog.diffusionModels}
              onChange={(value) => setWan('highModel', value)}
              onChoose={setResourcePicker}
            />
            <VideoResourceField
              label="Low Noise Model"
              value={video.wan.lowModel}
              values={catalog.diffusionModels}
              onChange={(value) => setWan('lowModel', value)}
              onChoose={setResourcePicker}
            />
          </div>
        )}
      </div>
      <div className={cn('mb-3 grid gap-1.5', video.family === 'ltx23' ? 'grid-cols-2' : 'grid-cols-3')}>
        <ToggleButton active={!storyboardOpen && !extendedOpen && video.mode === 'text_to_video'} label="Text to Video" onClick={() => setMode('text_to_video')} />
        <ToggleButton active={!storyboardOpen && !extendedOpen && video.mode === 'image_to_video'} label="Image to Video" onClick={() => setMode('image_to_video')} />
        {video.family === 'minimax_h3' ? <ToggleButton active={video.mode === 'reference_to_video'} label="Reference to Video" onClick={() => setMode('reference_to_video')} /> : null}
        {video.family !== 'minimax_h3' ? <ToggleButton active={!storyboardOpen && !extendedOpen && video.mode === 'video_to_video'} label="Video to Video" onClick={() => setMode('video_to_video')} /> : null}
        {video.family === 'ltx23' ? (
          <ToggleButton
            active={storyboardOpen}
            label="Umbra Director"
            onClick={() => setStoryboardEnabled(!storyboardOpen)}
            title="Use an exclusive timed-shot LTX pipeline"
          />
        ) : null}
        {video.family === 'ltx23' ? (
          <div className="col-span-2 [&>button]:w-full">
            <ToggleButton
              active={extendedOpen}
              label="LTX Extended"
              onClick={() => setExtendedEnabled(!extendedOpen)}
              title="Continue up to 12 clips from each preceding final frame"
            />
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {pipelineMatch.error ? <div className="font-mono text-[9px] leading-relaxed text-red-300/80">{pipelineMatch.error}</div> : null}

        {extendedOpen ? (
          <VideoAccordion
            title="Extended Starting Frame"
            icon={<ImageIcon size={12} className="text-fuchsia-300" />}
            summary={video.sourceImagePath ? 'image guided' : 'text only'}
            accent="fuchsia"
            defaultOpen={!video.sourceImagePath}
          >
            <FrameSourceField
              label="Optional First Frame"
              path={video.sourceImagePath}
              previewUrl={sourcePreviewUrl}
              onChange={(path) => {
                setVideo((current) => ({
                  ...current,
                  mode: path ? 'image_to_video' : 'text_to_video',
                  sourceImagePath: path,
                  sourceImageName: '',
                  sourceWidth: 0,
                  sourceHeight: 0,
                }));
                setSourcePreviewUrl(path ? `/api/fs/image?path=${encodeURIComponent(path)}` : '');
              }}
              onDimensions={(width, height) => setVideo((current) => ({
                ...current,
                sourceWidth: width,
                sourceHeight: height,
              }))}
              onClear={() => {
                setVideo((current) => ({
                  ...current,
                  mode: 'text_to_video',
                  sourceImagePath: '',
                  sourceImageName: '',
                  sourceWidth: 0,
                  sourceHeight: 0,
                }));
                setSourcePreviewUrl('');
              }}
            />
            <p className="mt-2 font-mono text-[8px] leading-relaxed text-zinc-600">
              Leave empty for text-to-video. When selected, clip 1 starts from this image and every later clip starts from the preceding final frame.
            </p>
          </VideoAccordion>
        ) : video.mode === 'reference_to_video' ? (
          <VideoAccordion
            title="Reference Images"
            icon={<ImageIcon size={12} className="text-fuchsia-300" />}
            summary={[video.sourceImagePath, video.middleImagePath, video.lastImagePath].filter(Boolean).length ? `${[video.sourceImagePath, video.middleImagePath, video.lastImagePath].filter(Boolean).length} attached` : '1 to 3 images'}
            accent="fuchsia"
            defaultOpen={!video.sourceImagePath}
          >
            <p className="mb-2 rounded-md border border-fuchsia-300/20 bg-fuchsia-500/[0.045] px-2.5 py-2 font-mono text-[9px] leading-relaxed text-zinc-400">
              One continuous MiniMax H3 shot. Reference notes preserve identity, wardrobe, style, or environment; the shot direction below controls camera and motion.
            </p>
            <FrameSourceField
              label="Reference Image 1"
              path={video.sourceImagePath}
              previewUrl={sourcePreviewUrl}
              onChange={(path) => {
                setVideo((current) => ({ ...current, sourceImagePath: path, sourceImageName: '', sourceWidth: 0, sourceHeight: 0 }));
                setSourcePreviewUrl(path ? `/api/fs/image?path=${encodeURIComponent(path)}` : '');
              }}
              onDimensions={(width, height) => setVideo((current) => ({ ...current, sourceWidth: width, sourceHeight: height }))}
              onClear={() => { setVideo((current) => ({ ...current, sourceImagePath: '', sourceImageName: '', sourceWidth: 0, sourceHeight: 0 })); setSourcePreviewUrl(''); }}
            />
            <label className="mb-2 block pl-[80px] pr-7">
              <span className={labelClass}>Reference note (optional)</span>
              <input value={video.minimaxH3.referenceNotes[0]} onChange={(event) => setMiniMaxReferenceNote(0, event.target.value)} placeholder="e.g. preserve character identity and jacket" className={inputClass} />
            </label>
            <FrameSourceField
              label="Reference Image 2 (optional)"
              path={video.middleImagePath}
              onChange={(path) => setVideo((current) => ({ ...current, middleImagePath: path, middleImageName: '' }))}
              onClear={() => setVideo((current) => ({ ...current, middleImagePath: '', middleImageName: '' }))}
            />
            <label className="mb-2 block pl-[80px] pr-7">
              <span className={labelClass}>Reference note (optional)</span>
              <input value={video.minimaxH3.referenceNotes[1]} onChange={(event) => setMiniMaxReferenceNote(1, event.target.value)} placeholder="e.g. preserve the environment and lighting" className={inputClass} />
            </label>
            <FrameSourceField
              label="Reference Image 3 (optional)"
              path={video.lastImagePath}
              onChange={(path) => setVideo((current) => ({ ...current, lastImagePath: path, lastImageName: '' }))}
              onClear={() => setVideo((current) => ({ ...current, lastImagePath: '', lastImageName: '' }))}
            />
            <label className="mb-2 block pl-[80px] pr-7">
              <span className={labelClass}>Reference note (optional)</span>
              <input value={video.minimaxH3.referenceNotes[2]} onChange={(event) => setMiniMaxReferenceNote(2, event.target.value)} placeholder="e.g. preserve the color palette and set dressing" className={inputClass} />
            </label>
            <div className="mt-2 max-w-xs">
              <SelectField
                label="Reference Image Fit"
                value={video.minimaxH3.referenceImageSize}
                values={['match', 'max']}
                onChange={(value) => setMiniMaxH3('referenceImageSize', value === 'max' ? 'max' : 'match')}
              />
            </div>
          </VideoAccordion>
        ) : video.mode === 'image_to_video' ? (
          <VideoAccordion
            title="Frame Guidance"
            icon={<ImageIcon size={12} className="text-fuchsia-300" />}
            summary={video.frameGuideMode.replaceAll('_', ' ')}
            accent="fuchsia"
            defaultOpen={!video.sourceImagePath}
          >
            {video.family === 'minimax_h3' ? <div className="mb-2 grid grid-cols-2 gap-1">
              <ToggleButton active={video.frameGuideMode === 'first'} label="First" onClick={() => setCommon('frameGuideMode', 'first')} />
              <ToggleButton active={video.frameGuideMode === 'first_last'} label="First + Last" onClick={() => setCommon('frameGuideMode', 'first_last')} />
            </div> : <div className="mb-2 grid grid-cols-3 gap-1">
              <ToggleButton active={video.frameGuideMode === 'first'} label="First" onClick={() => setCommon('frameGuideMode', 'first')} />
              <ToggleButton active={video.frameGuideMode === 'first_last'} label="First + Last" onClick={() => setCommon('frameGuideMode', 'first_last')} />
              <ToggleButton active={video.frameGuideMode === 'first_middle_last'} label="First + Mid + Last" onClick={() => setCommon('frameGuideMode', 'first_middle_last')} />
            </div>}
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
            {video.family !== 'minimax_h3' && video.frameGuideMode === 'first_middle_last' ? <FrameSourceField
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
          </VideoAccordion>
        ) : null}

        <VideoAccordion
          title="Media Inputs"
          icon={<Video size={12} className="text-cyan-300" />}
          summary={video.sourceAudioPath ? 'audio attached' : video.mode === 'video_to_video' ? 'source video' : 'optional audio'}
          accent="cyan"
          defaultOpen={video.mode === 'video_to_video' && !video.sourceVideoPath}
        >
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
        </VideoAccordion>

        {extendedOpen ? (
          <div className="border border-cyan-300/15 bg-cyan-500/[0.035] px-3 py-2.5">
            <span className="block text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100">
              Sequence prompts are edited in LTX Extended
            </span>
            <span className="mt-1 block font-mono text-[8px] leading-relaxed text-zinc-500">
              Every clip has its own exact prompt and duration. The negative prompt below applies to the complete sequence.
            </span>
          </div>
        ) : <>
        <UmbraPositivePromptEditor
          segments={promptSegments}
          activeSegmentId={activePromptSegmentId}
          onChange={setPromptSegments}
          onActiveSegmentChange={setActivePromptSegmentId}
          heading={video.mode === 'reference_to_video' ? 'Reference Shot Direction' : agentModeEnabled ? 'Video Prompt Request' : 'Video Prompt'}
          history={promptHistory}
          onRememberCurrent={rememberCurrentPrompt}
          onRestoreHistory={restorePromptHistoryEntry}
          onRemoveHistory={removePromptHistoryEntry}
          onClearHistory={clearPromptHistory}
          onSubmit={() => { void handleQueue(); }}
          mediaType="video"
          accent="fuchsia"
          agentContext={{
            family: video.family,
            mode: video.mode,
            pipeline: pipelineMatch.workflow?.name || '',
            width: targetDimensions.targetWidth,
            height: targetDimensions.targetHeight,
            frames: video.frames,
            fps: video.fps,
            frameGuideMode: video.frameGuideMode,
            referenceNotes: video.mode === 'reference_to_video' ? video.minimaxH3.referenceNotes : [],
            referenceImageSize: video.mode === 'reference_to_video' ? video.minimaxH3.referenceImageSize : '',
          }}
          onAgentEnhancementApplied={() => {
            setAgentModeEnabled(false);
            setAgentPrompt('');
          }}
        />
        {video.family === 'minimax_h3' ? <UmbraInlineAgentPrompt
          mediaType="video"
          sourcePrompt={agentModeEnabled && agentPrompt.trim() ? agentPrompt : prompt}
          enabled={autoPrompterEnabled}
          onEnabledChange={setAutoPrompterEnabled}
          agentPrompt={autoPrompterPrompt}
          onAgentPromptChange={setAutoPrompterPrompt}
          onSubmit={() => { void handleQueue(); }}
          accent="fuchsia"
          title="Auto Prompter"
          subtitle="Optional MiniMax H3 prompt pass"
          context={{
            family: video.family,
            mode: video.mode,
            pipeline: pipelineMatch.workflow?.name || '',
            width: targetDimensions.targetWidth,
            height: targetDimensions.targetHeight,
            frames: video.frames,
            fps: video.fps,
            frameGuideMode: video.frameGuideMode,
            referenceNotes: video.mode === 'reference_to_video' ? video.minimaxH3.referenceNotes : [],
            referenceImageSize: video.mode === 'reference_to_video' ? video.minimaxH3.referenceImageSize : '',
          }}
        /> : null}
        <UmbraInlineAgentPrompt
          mediaType="video"
          sourcePrompt={prompt}
          enabled={agentModeEnabled}
          onEnabledChange={setAgentModeEnabled}
          agentPrompt={agentPrompt}
          onAgentPromptChange={setAgentPrompt}
          onSubmit={() => { void handleQueue(); }}
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
            referenceNotes: video.mode === 'reference_to_video' ? video.minimaxH3.referenceNotes : [],
            referenceImageSize: video.mode === 'reference_to_video' ? video.minimaxH3.referenceImageSize : '',
          }}
        />
        </>}
        {video.family === 'minimax_h3' ? (
          <div className="border border-fuchsia-300/15 bg-fuchsia-500/[0.035] px-2.5 py-2 font-mono text-[9px] leading-relaxed text-fuchsia-100/70">
            MiniMax H3 uses one native audio-video prompt. Negative prompting is not part of this workflow.
          </div>
        ) : (
          <label className="block space-y-1.5">
            <span className={labelClass}>Negative Prompt</span>
            <textarea
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              onKeyDown={(event) => handlePromptKeyDown(event, setNegativePrompt)}
              placeholder="Artifacts and motion failures to avoid"
              className={`${inputClass} min-h-20 resize-y leading-relaxed`}
            />
          </label>
        )}

        <VideoAccordion
          title="Generation Settings"
          icon={<SlidersHorizontal size={12} className="text-fuchsia-300" />}
          summary={`${sizing.targetWidth}x${sizing.targetHeight} / ${videoDurationSeconds.toFixed(1)} seconds / ${video.fps} fps`}
          accent="fuchsia"
          defaultOpen
        >
          <div className="grid grid-cols-2 gap-2">
          <label className="col-span-2 space-y-1.5">
            <span className={labelClass}>Target Resolution</span>
            <UmbraSelectControl
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
            </UmbraSelectControl>
          </label>
          {video.mode === 'text_to_video' ? (
            <label className="col-span-2 space-y-1.5">
              <span className={labelClass}>Frame Aspect</span>
              <UmbraSelect value={video.aspectRatio} onValueChange={(value) => setCommon('aspectRatio', value)} ariaLabel="Frame Aspect" menuTitle="Frame Aspect" options={UMBRA_VIDEO_ASPECT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label }))} />
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
          {extendedOpen ? (
            <div className="space-y-1.5">
              <span className={labelClass}>Sequence Duration</span>
              <div className="flex h-9 items-center rounded-md border border-cyan-300/15 bg-cyan-500/[0.035] px-2.5 font-mono text-xs text-cyan-100">
                {extendedTotalSeconds.toFixed(1)} seconds / {video.ltx.extended.clips.length} clips
              </div>
            </div>
          ) : storyboardOpen ? (
            <div className="space-y-1.5">
              <span className={labelClass}>Duration (from shots)</span>
              <div className="flex h-9 items-center rounded-md border border-cyan-300/15 bg-cyan-500/[0.035] px-2.5 font-mono text-xs text-cyan-100">
                {storyboardTimeline.durationSeconds.toFixed(1)} seconds
              </div>
            </div>
          ) : (
            <NumberField
              label="Duration (seconds)"
              value={Number(videoDurationSeconds.toFixed(2))}
              min={0.25}
              step={0.5}
              onChange={setDurationSeconds}
            />
          )}
          {video.family === 'minimax_h3' ? (
            <div className="space-y-1.5">
              <span className={labelClass}>Frame Rate (FPS)</span>
              <div className="flex h-9 items-center rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.035] px-2.5 font-mono text-xs text-fuchsia-100">24 (native)</div>
            </div>
          ) : (
            <NumberField
              label="Frame Rate (FPS)"
              value={video.fps}
              min={1}
              max={120}
              onChange={setOutputFps}
            />
          )}
          <div className="col-span-2">
            <UmbraSeedControls
              seed={String(video.seed)}
              mode={video.seedMode}
              increment={video.seedIncrement}
              onSeedChange={(value) => setCommon('seed', normalizeUmbraUiSeed(value, video.seed))}
              onModeChange={(mode: PowerPrompterSeedControlMode) => setCommon('seedMode', mode)}
              onIncrementChange={(increment: PowerPrompterSeedIncrement) => setCommon('seedIncrement', increment)}
              accent="fuchsia"
            />
          </div>
          <label className="col-span-2 space-y-1.5">
            <span className={labelClass}>Output Prefix</span>
            <input value={video.outputPrefix} onChange={(event) => setCommon('outputPrefix', event.target.value)} className={inputClass} />
          </label>
          </div>
        </VideoAccordion>

        <VideoAccordion
          title={video.family === 'wan22' ? 'Wan Dual Stage Pipeline' : video.family === 'minimax_h3' ? 'MiniMax H3 Pipeline' : video.family === 'ltx25' ? 'LTX-2.5 Pipeline' : 'LTX-2.3 Pipeline'}
          icon={video.family === 'wan22'
            ? <Database size={12} className="text-amber-300" />
            : video.family === 'minimax_h3' ? <Film size={12} className="text-fuchsia-300" /> : <Film size={12} className="text-cyan-300" />}
          summary={video.family === 'wan22' ? 'high + low noise' : video.family === 'minimax_h3' ? 'native AV sampling' : video.family === 'ltx25' ? video.ltx25.twoStage ? 'pixel diffusion + refine' : 'pixel diffusion' : video.ltx.twoStage ? 'two stage' : 'single stage'}
          accent={video.family === 'wan22' ? 'amber' : video.family === 'minimax_h3' ? 'fuchsia' : 'cyan'}
          defaultOpen={video.family === 'wan22'
            ? !video.wan.highModel || !video.wan.lowModel || !video.wan.textEncoder || !video.wan.vae
            : video.family === 'minimax_h3'
              ? !video.minimaxH3.model || !video.minimaxH3.textEncoder || !video.minimaxH3.videoVae || !video.minimaxH3.audioVae
              : video.family === 'ltx25'
                ? !video.ltx25.model || !video.ltx25.textEncoder || !video.ltx25.videoVae
              : !video.ltx.checkpoint || !video.ltx.textEncoder || !video.ltx.distilledLora || !video.ltx.promptLora}
        >
          {video.family === 'wan22' ? (
            <>
            <VideoResourceField label="High Noise LoRA" value={video.wan.highLora} values={catalog.loras} kind="lora" onChange={(value) => setWan('highLora', value)} onChoose={setResourcePicker} />
            <NumberField label="High LoRA Strength" value={video.wan.highLoraStrength} step={0.05} onChange={(value) => setWan('highLoraStrength', value)} />
            <VideoResourceField label="Low Noise LoRA" value={video.wan.lowLora} values={catalog.loras} kind="lora" onChange={(value) => setWan('lowLora', value)} onChoose={setResourcePicker} />
            <NumberField label="Low LoRA Strength" value={video.wan.lowLoraStrength} step={0.05} onChange={(value) => setWan('lowLoraStrength', value)} />
            <VideoResourceField label="Text Encoder" value={video.wan.textEncoder} values={catalog.textEncoders} onChange={(value) => setWan('textEncoder', value)} onChoose={setResourcePicker} />
            <VideoResourceField label="VAE" value={video.wan.vae} values={catalog.vaes} onChange={(value) => setWan('vae', value)} onChoose={setResourcePicker} />
            {video.mode === 'image_to_video' ? <VideoResourceField label="Vision Encoder" value={video.wan.clipVision} values={catalog.clipVision} onChange={(value) => setWan('clipVision', value)} onChoose={setResourcePicker} /> : null}
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
            </>
          ) : video.family === 'minimax_h3' ? (
            <>
              <VideoResourceField label="Text Encoder" value={video.minimaxH3.textEncoder} values={catalog.textEncoders} onChange={(value) => setMiniMaxH3('textEncoder', value)} onChoose={setResourcePicker} />
              <VideoResourceField label="Video VAE" value={video.minimaxH3.videoVae} values={catalog.vaes} onChange={(value) => setMiniMaxH3('videoVae', value)} onChoose={setResourcePicker} />
              <VideoResourceField label="Audio VAE" value={video.minimaxH3.audioVae} values={catalog.vaes} onChange={(value) => setMiniMaxH3('audioVae', value)} onChoose={setResourcePicker} />
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Sampling Steps" value={video.minimaxH3.steps} min={1} max={1000} onChange={(value) => setMiniMaxH3('steps', value)} />
                <SelectField label="Sampler" value={video.minimaxH3.samplerName} values={['res_multistep']} onChange={(value) => setMiniMaxH3('samplerName', value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Video Shift" value={video.minimaxH3.shiftVideo} min={0.01} max={100} step={0.01} onChange={(value) => setMiniMaxH3('shiftVideo', value)} />
                <NumberField label="Audio Shift" value={video.minimaxH3.shiftAudio} min={0.01} max={100} step={0.01} onChange={(value) => setMiniMaxH3('shiftAudio', value)} />
              </div>
              <SelectField label="Scheduler" value={video.minimaxH3.scheduler} values={['simple']} onChange={(value) => setMiniMaxH3('scheduler', value)} />
              <p className="rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.045] px-2.5 py-2 font-mono text-[9px] leading-relaxed text-zinc-400">
                MiniMax H3 generates video and audio together at 24 FPS. Duration snaps to its required frame grid.
              </p>
            </>
          ) : video.family === 'ltx25' ? (
            <>
              <VideoResourceField label="Text Encoder" value={video.ltx25.textEncoder} values={catalog.textEncoders} onChange={(value) => setLtx25('textEncoder', value)} onChoose={setResourcePicker} />
              <VideoResourceField label="Video VAE" value={video.ltx25.videoVae} values={catalog.vaes} onChange={(value) => setLtx25('videoVae', value)} onChoose={setResourcePicker} />
              <div className="grid grid-cols-3 gap-1.5">
                <ToggleButton active={video.ltx25.twoStage} label="Two Stage" onClick={() => setLtx25('twoStage', !video.ltx25.twoStage)} />
                <ToggleButton active={video.ltx25.audioEnabled} label="Audio" onClick={() => setLtx25('audioEnabled', !video.ltx25.audioEnabled)} />
                <ToggleButton
                  active={video.ltx25.promptEnhance}
                  label="Native Enhancer"
                  onClick={() => setLtx25('promptEnhance', !video.ltx25.promptEnhance)}
                  title="Use LTX-2.5's official Gemma 4 prompt enhancer and system template"
                />
              </div>
              {video.ltx25.twoStage ? <VideoResourceField label="LTX-2.5 Latent Upscaler" value={video.ltx25.latentUpscaleModel} values={catalog.latentUpscaleModels} onChange={(value) => setLtx25('latentUpscaleModel', value)} onChoose={setResourcePicker} /> : null}
              {video.ltx25.audioEnabled ? <VideoResourceField label="Audio VAE" value={video.ltx25.audioVae} values={catalog.vaes} onChange={(value) => setLtx25('audioVae', value)} onChoose={setResourcePicker} /> : null}
              {video.ltx25.promptEnhance ? (
                <div className="space-y-2 rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.035] p-2.5">
                  <VideoResourceField label="Official Gemma 4 Enhancer Model" value={video.ltx25.promptEnhanceModel} values={catalog.textEncoders} onChange={(value) => setLtx25('promptEnhanceModel', value)} onChoose={setResourcePicker} />
                  <p className="font-mono text-[9px] leading-relaxed text-zinc-400">
                    Uses ComfyUI&apos;s official LTX-2.5 {video.mode === 'image_to_video' ? 'image-grounded I2V' : 'audiovisual T2V'} system prompt. The official template is always preserved. {agentModeEnabled ? 'Umbra Agent drafts first; the native enhancer performs the final LTX-specific pass.' : 'This is separate from Umbra Agent.'}
                  </p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <ToggleButton active={video.ltx25.promptEnhanceSampling} label="Sampling" onClick={() => setLtx25('promptEnhanceSampling', !video.ltx25.promptEnhanceSampling)} />
                    <ToggleButton active={video.ltx25.promptEnhanceThinking} label="Thinking" onClick={() => setLtx25('promptEnhanceThinking', !video.ltx25.promptEnhanceThinking)} title="Reasoning is stripped before the generated prompt is submitted" />
                  </div>
                  <NumberField label="Maximum Output Tokens" value={video.ltx25.promptEnhanceMaxLength} min={1} max={32768} onChange={(value) => setLtx25('promptEnhanceMaxLength', value)} />
                  {video.ltx25.promptEnhanceSampling ? (
                    <div className="grid grid-cols-2 gap-2">
                      <NumberField label="Temperature" value={video.ltx25.promptEnhanceTemperature} min={0.01} max={2} step={0.01} onChange={(value) => setLtx25('promptEnhanceTemperature', value)} />
                      <NumberField label="Top K" value={video.ltx25.promptEnhanceTopK} min={0} max={1000} onChange={(value) => setLtx25('promptEnhanceTopK', value)} />
                      <NumberField label="Top P" value={video.ltx25.promptEnhanceTopP} min={0} max={1} step={0.01} onChange={(value) => setLtx25('promptEnhanceTopP', value)} />
                      <NumberField label="Min P" value={video.ltx25.promptEnhanceMinP} min={0} max={1} step={0.01} onChange={(value) => setLtx25('promptEnhanceMinP', value)} />
                      <NumberField label="Repetition Penalty" value={video.ltx25.promptEnhanceRepetitionPenalty} min={0} max={5} step={0.01} onChange={(value) => setLtx25('promptEnhanceRepetitionPenalty', value)} />
                      <NumberField label="Presence Penalty" value={video.ltx25.promptEnhancePresencePenalty} min={0} max={5} step={0.01} onChange={(value) => setLtx25('promptEnhancePresencePenalty', value)} />
                    </div>
                  ) : null}
                </div>
              ) : null}
              {video.mode === 'image_to_video' ? (
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="Image Strength" value={video.ltx25.imageStrength} min={0} max={1} step={0.05} onChange={(value) => setLtx25('imageStrength', value)} />
                  <NumberField label="Image Compression" value={video.ltx25.imageCompression} min={0} max={100} onChange={(value) => setLtx25('imageCompression', value)} />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Base Video CFG" value={video.ltx25.baseCfg} min={0} max={100} step={0.1} onChange={(value) => setLtx25('baseCfg', value)} />
                <NumberField label="Refine Video CFG" value={video.ltx25.refineCfg} min={0} max={100} step={0.1} onChange={(value) => setLtx25('refineCfg', value)} />
                <SelectField label="Base Sampler" value={video.ltx25.baseSamplerName} values={samplerOptions} onChange={(value) => setLtx25('baseSamplerName', value)} />
                <SelectField label="Refine Sampler" value={video.ltx25.refineSamplerName} values={samplerOptions} onChange={(value) => setLtx25('refineSamplerName', value)} />
              </div>
              <label className="block space-y-1.5"><span className={labelClass}>Base Sigmas</span><textarea value={video.ltx25.baseSigmas} onChange={(event) => setLtx25('baseSigmas', event.target.value)} className={`${inputClass} min-h-16 resize-y font-mono text-[10px]`} /></label>
              <label className="block space-y-1.5"><span className={labelClass}>Refine Sigmas</span><textarea value={video.ltx25.refineSigmas} onChange={(event) => setLtx25('refineSigmas', event.target.value)} className={`${inputClass} min-h-14 resize-y font-mono text-[10px]`} /></label>
              <p className="rounded-md border border-cyan-300/15 bg-cyan-500/[0.045] px-2.5 py-2 font-mono text-[9px] leading-relaxed text-zinc-400">
                Native 24 FPS audio-video generation with the LTX-2.5 pixel-diffusion decoder. First, last, and middle frame guidance use the frame controls above.
              </p>
            </>
          ) : (
            <>
            <VideoResourceField label="Text Encoder" value={video.ltx.textEncoder} values={catalog.textEncoders} onChange={(value) => setLtx('textEncoder', value)} onChoose={setResourcePicker} />
            <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
              <VideoResourceField label="Distilled Model LoRA" value={video.ltx.distilledLora} values={catalog.loras} kind="lora" onChange={(value) => setLtx('distilledLora', value)} onChoose={setResourcePicker} />
              <NumberField label="Strength" value={video.ltx.distilledLoraStrength} step={0.05} onChange={(value) => setLtx('distilledLoraStrength', value)} />
              <VideoResourceField label="Prompt LoRA" value={video.ltx.promptLora} values={catalog.loras} kind="lora" onChange={(value) => setLtx('promptLora', value)} onChoose={setResourcePicker} />
              <NumberField label="Strength" value={video.ltx.promptLoraStrength} step={0.05} onChange={(value) => setLtx('promptLoraStrength', value)} />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <ToggleButton active={video.ltx.twoStage} label="Two Stage" onClick={() => setLtx('twoStage', !video.ltx.twoStage)} />
              <ToggleButton active={video.ltx.audioEnabled} label="Audio" onClick={() => setLtx('audioEnabled', !video.ltx.audioEnabled)} />
            </div>
            {extendedOpen ? (
              <div className="flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-500/[0.055] px-2.5 py-2">
                <Clock3 size={12} className="text-cyan-200" />
                <div className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-[0.11em] text-cyan-100">
                    {video.ltx.extended.clips.length} continuation clips
                  </span>
                  <span className="block font-mono text-[8px] text-zinc-500">
                    {extendedTotalSeconds.toFixed(1)} seconds total
                  </span>
                </div>
              </div>
            ) : storyboardOpen ? (
              <div className="flex items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-500/[0.055] px-2.5 py-2">
                <PanelRight size={12} className="text-cyan-200" />
                <div className="min-w-0">
                  <span className="block text-[9px] font-black uppercase tracking-[0.11em] text-cyan-100">
                    {video.ltx.storyboard.shots.length} timed shots
                  </span>
                  <span className="block font-mono text-[8px] text-zinc-500">
                    {storyboardTimeline.durationSeconds.toFixed(1)} seconds total
                  </span>
                </div>
                {!catalog.umbraDirectorAvailable ? (
                  <span className="ml-auto text-right font-mono text-[8px] text-red-300">
                    Umbra Director missing
                  </span>
                ) : null}
              </div>
            ) : null}
            {video.ltx.twoStage ? <VideoResourceField label="Latent Upscale Model" value={video.ltx.latentUpscaleModel} values={catalog.latentUpscaleModels} onChange={(value) => setLtx('latentUpscaleModel', value)} onChoose={setResourcePicker} /> : null}
            {video.ltx.audioEnabled ? <VideoResourceField label="Audio VAE" value={video.ltx.audioVae} values={catalog.vaes} onChange={(value) => setLtx('audioVae', value)} onChoose={setResourcePicker} /> : null}
            {video.mode === 'image_to_video' ? (
              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Image Strength" value={video.ltx.imageStrength} min={0} max={1} step={0.05} onChange={(value) => setLtx('imageStrength', value)} />
                <NumberField label="Image Compression" value={video.ltx.imageCompression} min={0} max={100} onChange={(value) => setLtx('imageCompression', value)} />
              </div>
            ) : null}
            {!storyboardOpen && !extendedOpen ? <div className="border-t border-white/10 pt-3">
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
                      <NumberField
                        label="Time (seconds)"
                        value={Number((keyframe.frameIndex / video.fps).toFixed(2))}
                        min={0}
                        max={videoDurationSeconds}
                        step={0.5}
                        onChange={(value) => updateLtxKeyframe(keyframe.id, {
                          frameIndex: Math.max(
                            0,
                            Math.min(
                              video.frames - 1,
                              Math.round((value * video.fps) / 8) * 8,
                            ),
                          ),
                        })}
                      />
                      <NumberField label="Strength" value={keyframe.strength} min={0} max={1} step={0.05} onChange={(value) => updateLtxKeyframe(keyframe.id, { strength: value })} />
                    </div>
                  </div>
                ))}
              </div>
            </div> : null}
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Base CFG" value={video.ltx.baseCfg} min={0} max={100} step={0.1} onChange={(value) => setLtx('baseCfg', value)} />
              <NumberField label="Refine CFG" value={video.ltx.refineCfg} min={0} max={100} step={0.1} onChange={(value) => setLtx('refineCfg', value)} />
              <SelectField label="Base Sampler" value={video.ltx.baseSamplerName} values={samplerOptions} onChange={(value) => setLtx('baseSamplerName', value)} />
              <SelectField label="Refine Sampler" value={video.ltx.refineSamplerName} values={samplerOptions} onChange={(value) => setLtx('refineSamplerName', value)} />
            </div>
            <label className="block space-y-1.5"><span className={labelClass}>Base Sigmas</span><textarea value={video.ltx.baseSigmas} onChange={(event) => setLtx('baseSigmas', event.target.value)} className={`${inputClass} min-h-16 resize-y font-mono text-[10px]`} /></label>
            <label className="block space-y-1.5"><span className={labelClass}>Refine Sigmas</span><textarea value={video.ltx.refineSigmas} onChange={(event) => setLtx('refineSigmas', event.target.value)} className={`${inputClass} min-h-14 resize-y font-mono text-[10px]`} /></label>
            </>
          )}
        </VideoAccordion>

        {video.family === 'minimax_h3' ? <VideoAccordion
          title="MiniMax Acceleration"
          icon={<Gauge size={11} className="text-fuchsia-300" />}
          summary={[
            video.minimaxH3.sageAttention === 'auto' ? 'sage' : '',
            video.minimaxH3.easyCacheEnabled ? 'cache' : '',
            video.minimaxH3.allowCompile ? 'compile' : '',
          ].filter(Boolean).join(' + ') || 'off'}
        >
          <div className="space-y-2.5">
            <div className="grid grid-cols-2 gap-1.5">
              <ToggleButton active={video.minimaxH3.sageAttention === 'auto'} label="Sage Attention" onClick={() => setMiniMaxH3('sageAttention', video.minimaxH3.sageAttention === 'auto' ? 'disabled' : 'auto')} />
              <ToggleButton active={video.minimaxH3.allowCompile} label="Compile" onClick={() => setMiniMaxH3('allowCompile', !video.minimaxH3.allowCompile)} />
            </div>
            <ToggleButton active={video.minimaxH3.easyCacheEnabled} label="EasyCache" onClick={() => setMiniMaxH3('easyCacheEnabled', !video.minimaxH3.easyCacheEnabled)} />
            {video.minimaxH3.easyCacheEnabled ? <div className="grid grid-cols-3 gap-2">
              <NumberField label="Threshold" value={video.minimaxH3.easyCacheReuseThreshold} min={0} max={3} step={0.01} onChange={(value) => setMiniMaxH3('easyCacheReuseThreshold', value)} />
              <NumberField label="Start" value={video.minimaxH3.easyCacheStartPercent} min={0} max={1} step={0.01} onChange={(value) => setMiniMaxH3('easyCacheStartPercent', value)} />
              <NumberField label="End" value={video.minimaxH3.easyCacheEndPercent} min={0} max={1} step={0.01} onChange={(value) => setMiniMaxH3('easyCacheEndPercent', value)} />
            </div> : null}
            <p className="rounded-md border border-fuchsia-300/15 bg-fuchsia-500/[0.045] px-2.5 py-2 font-mono text-[9px] leading-relaxed text-zinc-400">
              Mirrors the accelerated MiniMax workflow. Compile can improve repeat-run speed after an initial warmup; disable it when diagnosing compatibility or memory pressure.
            </p>
          </div>
        </VideoAccordion> : null}

        <VideoAccordion
          title="Decode Memory"
          icon={<Gauge size={11} className="text-zinc-500" />}
          summary={video.decodeMode}
        >
          <div className="space-y-2">
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
        </VideoAccordion>

        <VideoAccordion
          title="Post Processing"
          icon={<SlidersHorizontal size={11} className="text-zinc-500" />}
          summary={[
            video.postprocess.interpolationEnabled ? 'interpolation' : '',
            video.postprocess.upscaleMode !== 'none' ? video.postprocess.upscaleMode : '',
            video.postprocess.rtxVsrEnabled ? 'rtx vsr' : '',
          ].filter(Boolean).join(' + ') || 'off'}
        >
          <div className="space-y-3">
            <ToggleButton
              active={video.postprocess.interpolationEnabled}
              label="Frame Interpolation"
              onClick={() => setPostprocess('interpolationEnabled', !video.postprocess.interpolationEnabled)}
            />
            {video.postprocess.interpolationEnabled ? (
              <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                <VideoResourceField label="Interpolation Model" value={video.postprocess.interpolationModel} values={catalog.frameInterpolationModels} onChange={(value) => setPostprocess('interpolationModel', value)} onChoose={setResourcePicker} />
                <NumberField label="Multiplier" value={video.postprocess.interpolationMultiplier} min={2} max={16} onChange={(value) => setPostprocess('interpolationMultiplier', value)} />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2"><Scaling size={11} className="text-zinc-600" /><span className={labelClass}>Upscale</span></div>
              <div className="grid grid-cols-3 gap-1.5">
                <ToggleButton active={video.postprocess.upscaleMode === 'none'} label="None" onClick={() => setPostprocess('upscaleMode', 'none')} />
                <ToggleButton active={video.postprocess.upscaleMode === 'lanczos'} label="Lanczos" onClick={() => setPostprocess('upscaleMode', 'lanczos')} />
                <ToggleButton active={video.postprocess.upscaleMode === 'model'} label="Model" onClick={() => setPostprocess('upscaleMode', 'model')} />
              </div>
              <ToggleButton
                active={video.postprocess.rtxVsrEnabled}
                label="NVIDIA RTX VSR"
                onClick={() => setPostprocess('rtxVsrEnabled', !video.postprocess.rtxVsrEnabled)}
                disabled={!catalog.rtxAvailable}
                title={catalog.rtxAvailable ? 'Apply NVIDIA RTX Video Super Resolution after the selected upscale stage.' : 'Install NVIDIA RTX Nodes in the managed ComfyUI runtime'}
              />
            </div>
            {video.postprocess.upscaleMode !== 'none' ? (
              <div className="space-y-2">
                {video.postprocess.upscaleMode === 'model' ? (
                  <VideoResourceField label="Upscale Model" value={video.postprocess.upscaleModel} values={catalog.upscaleModels} onChange={(value) => setPostprocess('upscaleModel', value)} onChoose={setResourcePicker} />
                ) : null}
                {video.postprocess.rtxVsrEnabled ? (
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
        </VideoAccordion>

        {catalog.error ? <div className="border border-amber-300/20 bg-amber-500/[0.04] px-2.5 py-2 font-mono text-[9px] text-amber-200/70">{catalog.error}</div> : null}
        {!catalog.loading && requiredMissing ? (
          <div className="border border-amber-300/20 bg-amber-500/[0.04] px-2.5 py-2 font-mono text-[9px] text-amber-100/70">
            {sourceDimensionsMissing
              ? 'Waiting for the uploaded source dimensions before calculating the video resolution.'
              : `Install and select the required ${video.family === 'wan22' ? 'Wan high/low models, LoRAs, encoders, and VAE' : video.family === 'ltx23' ? 'LTX checkpoint, encoders, LoRAs, and optional stage models' : video.family === 'ltx25' ? 'LTX-2.5 diffusion model, Gemma 4 encoder, video/audio VAEs, and optional stage models' : 'MiniMax H3 diffusion model, text encoder, and video/audio VAEs'} to enable queueing.`}
          </div>
        ) : null}

        <div className="border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center gap-2 border border-cyan-300/20 bg-cyan-500/[0.045] px-2.5 py-2">
            <Volume2 size={11} className={(video.family === 'ltx23' && video.ltx.audioEnabled) || (video.family === 'ltx25' && video.ltx25.audioEnabled) ? 'text-cyan-300' : 'text-zinc-700'} />
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
            {extendedOpen ? 'Generate Extended Video' : 'Generate Video'}
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
    {storyboardOpen ? (
      <UmbraLtxStoryboardPanel
        shots={video.ltx.storyboard.shots}
        selectedShotId={selectedStoryboardShotId}
        agentContext={{
          prompt: workflowPrompt,
          negativePrompt,
          family: video.family,
          mode: video.mode,
          width: targetDimensions.targetWidth,
          height: targetDimensions.targetHeight,
        }}
        onSelectedShotChange={setSelectedStoryboardShotId}
        onShotsChange={setStoryboardShots}
        onAddShot={addStoryboardShot}
        onClose={() => setStoryboardEnabled(false)}
      />
    ) : null}
    {extendedOpen ? (
      <UmbraLtxExtendedPanel
        clips={video.ltx.extended.clips}
        onClipsChange={setExtendedClips}
        onAddClip={addExtendedClip}
        onClose={() => setExtendedEnabled(false)}
      />
    ) : null}
    <UmbraModelPickerModal
      open={resourcePicker !== null}
      kind={resourcePicker?.kind || 'checkpoint'}
      items={resourcePicker?.values || []}
      selectedValue={resourcePicker?.value || ''}
      catalogLoading={catalog.loading}
      onClose={() => setResourcePicker(null)}
      onRefresh={onRefreshCatalog}
      onConfirm={(name) => {
        resourcePicker?.onChange(name);
        setResourcePicker(null);
      }}
      titleOverride={resourcePicker ? `${resourcePicker.label} Browser` : undefined}
      searchPlaceholder={resourcePicker ? `Search ${resourcePicker.label.toLowerCase()} files...` : undefined}
      confirmLabel={resourcePicker ? `Use ${resourcePicker.label}` : undefined}
      showSourceFilter={false}
    />
    </>
  );
}

export default UmbraVideoGenerationControls;
