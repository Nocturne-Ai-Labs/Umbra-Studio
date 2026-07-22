'use client';

import React from 'react';
import {
  Activity,
  Bot,
  Clapperboard,
  Image as ImageIcon,
  Images,
  ImageUp,
  Layers3,
  ListPlus,
  Loader2,
  Paintbrush,
  PanelsTopLeft,
  Play,
  Radio,
  Sparkles,
} from 'lucide-react';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';
import { DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE } from '@/lib/powerPrompter';
import type {
  PowerPrompterDetailerStage,
  PowerPrompterModelType,
  PowerPrompterOutputUpscaleControls,
  PowerPrompterSeedControlMode,
} from '@/types/powerPrompter';
import {
  useUmbraPowerPrompterBridge,
  type UmbraImageQueueOptions,
  type UmbraModelCatalog,
  type UmbraQueuePlacement,
  type UmbraQueueSummary,
  type UmbraWorkflowResourceSelector,
} from '@/components/umbra-ui/useUmbraPowerPrompterBridge';
import { UmbraDetailerPipelineControls } from '@/components/umbra-ui/UmbraDetailerPipelineControls';
import { UmbraHiresFixControls } from '@/components/umbra-ui/UmbraHiresFixControls';
import {
  UmbraImg2ImgSourceControls,
  type UmbraImg2ImgSourceValue,
} from '@/components/umbra-ui/UmbraImg2ImgSourceControls';
import {
  UmbraVideoGenerationControls,
  type UmbraVideoEditorDraft,
} from '@/components/umbra-ui/UmbraVideoGenerationControls';
import { UmbraVideoQueuePanel } from '@/components/umbra-ui/UmbraVideoQueuePanel';
import { UmbraExtrasWorkspace } from '@/components/umbra-ui/UmbraExtrasWorkspace';
import { UmbraInpaintWorkspace } from '@/components/umbra-ui/UmbraInpaintWorkspace';
import { UmbraCheckpointControls } from '@/components/umbra-ui/UmbraCheckpointControls';
import { UmbraWorkflowResourceControls } from '@/components/umbra-ui/UmbraWorkflowResourceControls';
import { UmbraLoraStackControls } from '@/components/umbra-ui/UmbraLoraStackControls';
import { UmbraPositivePromptEditor } from '@/components/umbra-ui/UmbraPositivePromptEditor';
import { UmbraAgentPromptPanel } from '@/components/umbra-ui/UmbraAgentPromptPanel';
import { UmbraInlineAgentPrompt } from '@/components/umbra-ui/UmbraInlineAgentPrompt';
import { UmbraSeedControls } from '@/components/umbra-ui/UmbraSeedControls';
import {
  UmbraQueuePlacementControls,
  useUmbraQueuePlacement,
} from '@/components/umbra-ui/UmbraQueuePlacementControls';
import {
  UmbraModelPickerModal,
  type UmbraModelPickerInfo,
  type UmbraModelPickerKind,
} from '@/components/umbra-ui/UmbraModelPickerModal';
import { stageUmbraUiUpscaleHandoff } from '@/lib/umbraUiUpscale';
import { stageUmbraUiInpaintHandoff } from '@/lib/umbraUiInpaint';
import {
  resolveUmbraUiInpaintControlAvailability,
  resolveUmbraUiInpaintReferenceAvailability,
} from '@/lib/umbraUiInpaintResourceAvailability';
import {
  filterUmbraUiCompatibleIpAdapterModels,
  filterUmbraUiInpaintPrimaryModels,
} from '../../../../shared/umbra-ui/inpaintModelCompatibility';
import {
  normalizeUmbraUiMediaHandoff,
  UMBRA_UI_MEDIA_HANDOFF_EVENT,
  UMBRA_UI_MEDIA_HANDOFF_KEY,
  type UmbraUiMediaHandoff,
} from '@/lib/umbraUiMediaHandoff';
import {
  createUmbraUiLoraEntry,
  getUmbraUiLorasForFamily,
  replaceUmbraUiLorasForFamily,
  type UmbraUiLoraEntry,
} from '@/lib/umbraUiModels';
import {
  appendUmbraUiPromptToken,
  compileUmbraUiPromptSegments,
  createUmbraUiPromptSegment,
  type UmbraUiPromptSegment,
} from '@/lib/umbraUiPromptSegments';
import {
  clearPendingUmbraUiPowerPrompterHandoff,
  normalizeUmbraUiPowerPrompterHandoff,
  takePendingUmbraUiPowerPrompterHandoff,
  UMBRA_UI_POWER_PROMPTER_HANDOFF_EVENT,
  type UmbraUiPowerPrompterHandoff,
} from '@/lib/umbraUiPowerPrompterHandoff';
import {
  publishUmbraUiAgentContext,
  type UmbraUiAgentDraft,
  type UmbraUiAgentVideoContext,
} from '@/lib/umbraUiAgent';
import { listUmbraUiPipelineFamilies, resolveUmbraUiPipeline } from '@/lib/umbraUiPipelines';
import {
  advanceUmbraUiSeed,
  normalizeUmbraUiSeedMode,
  resolveUmbraUiQueueSeed,
} from '@/lib/umbraUiSeed';
import {
  filterUmbraUiDetailerStages,
  matchUmbraUiResourceCatalog,
  normalizeUmbraUiDetailerStageName,
  normalizeUmbraUiModelFamilyKey,
  normalizeUmbraUiPipelineCapabilities,
  normalizeUmbraUiInpaintCanvasCapabilities,
  normalizeUmbraUiPipelineReadiness,
  resolveUmbraUiHiresResizeMode,
} from '../../../../shared/umbra-ui/pipelineTypes';

type UmbraGenerationMode = 'image' | 'img2img' | 'inpaint' | 'video' | 'extras';

const UMBRA_UI_ACTIVE_MODE_STORAGE_KEY = 'umbra-ui:active-mode';
const UMBRA_UI_GENERATION_MODES: UmbraGenerationMode[] = ['image', 'img2img', 'inpaint', 'video', 'extras'];

function readPersistedUmbraGenerationMode(): UmbraGenerationMode {
  if (typeof window === 'undefined') return 'image';
  try {
    const stored = window.localStorage.getItem(UMBRA_UI_ACTIVE_MODE_STORAGE_KEY);
    if (stored === 'canvas') return 'inpaint';
    return UMBRA_UI_GENERATION_MODES.includes(stored as UmbraGenerationMode)
      ? stored as UmbraGenerationMode
      : 'image';
  } catch {
    return 'image';
  }
}

const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-cyan-300/45';
const labelClass = 'text-[11px] font-black uppercase tracking-[0.12em] text-zinc-400';

const PRIMARY_MODEL_TYPE_OPTIONS: Array<{ value: PowerPrompterModelType; label: string }> = [
  { value: 'checkpoint', label: 'Checkpoint' },
  { value: 'diffusers', label: 'Diffusers' },
  { value: 'diffusion_model', label: 'Diffusion' },
  { value: 'unet', label: 'UNet' },
  { value: 'gguf', label: 'GGUF' },
];

function uniqueCatalogItems(...groups: Array<string[] | undefined>): string[] {
  return Array.from(new Set(groups
    .flatMap((group) => group || [])
    .map((entry) => String(entry || '').trim().replace(/\\/g, '/'))
    .filter(Boolean)));
}

function resolveCatalogMatch(value: string, catalog: string[]): string {
  const normalized = String(value || '').trim().replace(/\\/g, '/');
  if (!normalized) return '';
  const match = matchUmbraUiResourceCatalog(normalized, catalog);
  return match.status === 'available' ? match.match : '';
}

function getPrimaryModelItems(catalog: UmbraModelCatalog, modelType: PowerPrompterModelType): string[] {
  if (modelType === 'diffusers') return catalog.diffusersModels;
  if (modelType === 'diffusion_model') return catalog.diffusionModels;
  if (modelType === 'unet') return uniqueCatalogItems(catalog.unetModels, catalog.diffusionModels);
  if (modelType === 'gguf') return catalog.ggufModels;
  return catalog.checkpoints;
}

function getPrimaryModelLabel(modelType: PowerPrompterModelType): string {
  return PRIMARY_MODEL_TYPE_OPTIONS.find((option) => option.value === modelType)?.label || 'Model';
}

function getWorkflowResourceItems(
  resource: UmbraWorkflowResourceSelector,
  catalog: UmbraModelCatalog,
): string[] {
  const declared = Array.isArray(resource.options) ? resource.options : [];
  if (resource.kind === 'checkpoint') return uniqueCatalogItems(declared, catalog.checkpoints);
  if (resource.kind === 'diffusers') return uniqueCatalogItems(declared, catalog.diffusersModels);
  if (resource.kind === 'diffusion_model') return uniqueCatalogItems(declared, catalog.diffusionModels);
  if (resource.kind === 'unet') return uniqueCatalogItems(declared, catalog.unetModels, catalog.diffusionModels);
  if (resource.kind === 'gguf') return uniqueCatalogItems(declared, catalog.ggufModels);
  if (resource.kind === 'vae') return uniqueCatalogItems(declared, catalog.vaes);
  if (resource.kind === 'text_encoder') return uniqueCatalogItems(declared, catalog.textEncoders);
  if (resource.kind === 'clip_vision') return uniqueCatalogItems(declared, catalog.clipVision);
  if (resource.kind === 'controlnet') return uniqueCatalogItems(declared, catalog.controlnets);
  if (resource.kind === 'model') return uniqueCatalogItems(declared, catalog.modelPatches);
  if (resource.kind === 'upscale_model') return uniqueCatalogItems(declared, catalog.upscaleModels);
  return uniqueCatalogItems(declared);
}

function getInstalledWorkflowResourceItems(
  resource: UmbraWorkflowResourceSelector,
  catalog: UmbraModelCatalog,
): string[] {
  if (resource.kind === 'checkpoint') return catalog.checkpoints;
  if (resource.kind === 'diffusers') return catalog.diffusersModels;
  if (resource.kind === 'diffusion_model') return catalog.diffusionModels;
  if (resource.kind === 'unet') return uniqueCatalogItems(catalog.unetModels, catalog.diffusionModels);
  if (resource.kind === 'gguf') return catalog.ggufModels;
  if (resource.kind === 'vae') return catalog.vaes;
  if (resource.kind === 'text_encoder') return catalog.textEncoders;
  if (resource.kind === 'clip_vision') return catalog.clipVision;
  if (resource.kind === 'controlnet') return catalog.controlnets;
  if (resource.kind === 'model') return catalog.modelPatches;
  if (resource.kind === 'upscale_model') return catalog.upscaleModels;
  return [];
}

interface PipelineControlsProps {
  queueSummary: UmbraQueueSummary;
  onQueueImage: (placement: UmbraQueuePlacement) => void;
  onOpenPowerPrompter: () => void;
  isQueueing: boolean;
  queueDisabled: boolean;
  queueTitle: string;
  queueLabel?: string;
}

function PipelineControls({
  queueSummary,
  onQueueImage,
  onOpenPowerPrompter,
  isQueueing,
  queueDisabled,
  queueTitle,
  queueLabel = 'Generate Image',
}: PipelineControlsProps) {
  const { placement, setPlacement, effectivePlacement } = useUmbraQueuePlacement(queueSummary);

  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <div className="mb-3 flex items-center gap-2">
        <ListPlus size={13} className="text-emerald-300" />
        <h2 className="text-xs font-black uppercase tracking-[0.14em] text-zinc-200">Queue</h2>
      </div>

      <div className="mb-3 border border-cyan-300/20 bg-cyan-500/[0.045] p-2.5">
        <div className="flex items-center gap-2">
          <Radio size={12} className={queueSummary.running > 0 ? 'text-cyan-300' : 'text-zinc-600'} />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-200">Batch Queue</span>
          <span className="ml-auto font-mono text-[10px] text-zinc-400">{queueSummary.remaining} remaining</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
          <div className="border border-white/10 bg-black/20 px-1 py-1.5">
            <div className="font-mono text-[11px] text-zinc-200">{queueSummary.groups}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Groups</div>
          </div>
          <div className="border border-white/10 bg-black/20 px-1 py-1.5">
            <div className="font-mono text-[11px] text-cyan-200">{queueSummary.running}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Running</div>
          </div>
          <div className="border border-white/10 bg-black/20 px-1 py-1.5">
            <div className="font-mono text-[11px] text-emerald-200">{queueSummary.completed}</div>
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-500">Done</div>
          </div>
        </div>
        <div className="mt-2 h-1 overflow-hidden bg-white/10">
          <div className="h-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${queueSummary.progress * 100}%` }} />
        </div>
      </div>

      <div className="space-y-2">
        <UmbraQueuePlacementControls
          queueSummary={queueSummary}
          value={placement}
          onChange={setPlacement}
          subject="image"
        />
        <button
          type="button"
          onClick={() => onQueueImage(effectivePlacement)}
          disabled={queueDisabled}
          className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md border border-emerald-300/30 bg-emerald-500/[0.1] text-[11px] font-black uppercase tracking-[0.13em] text-emerald-100 transition-colors hover:bg-emerald-500/[0.16] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-600"
          title={queueTitle}
        >
          {isQueueing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          {queueLabel}
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
  );
}

export function UmbraUIWorkspace() {
  const comfyConnected = useStore((state) => state.connections.comfyui === 'connected');
  const setActiveWorkspace = useStore((state) => state.setActiveWorkspace);
  const showToast = useStore((state) => state.showToast);
  const {
    connected: queueConnected,
    workflows,
    modelCatalog,
    videoModelCatalog,
    refreshModelCatalog,
    loraCatalog,
    loraCatalogLoading,
    refreshLoraCatalog,
    requestLoraInfo,
    requestModelInfo,
    inheritedGeneration,
    queueSummary,
    videoJobs,
    videoJobsLoading,
    videoJobsError,
    refreshVideoJobs,
    generationPreview,
    latestSavedImage,
    queueImage,
    queueVideo,
  } = useUmbraPowerPrompterBridge(comfyConnected);
  const [activeMode, setActiveMode] = React.useState<UmbraGenerationMode>(readPersistedUmbraGenerationMode);
  const [mountedModes, setMountedModes] = React.useState<Set<UmbraGenerationMode>>(
    () => new Set([activeMode]),
  );
  const [promptSegments, setPromptSegments] = React.useState<UmbraUiPromptSegment[]>(() => [createUmbraUiPromptSegment()]);
  const [activePromptSegmentId, setActivePromptSegmentId] = React.useState('');
  const prompt = React.useMemo(() => compileUmbraUiPromptSegments(promptSegments), [promptSegments]);
  const [imageAgentModeEnabled, setImageAgentModeEnabled] = React.useState(false);
  const [imageAgentPrompt, setImageAgentPrompt] = React.useState('');
  const workflowImagePrompt = imageAgentModeEnabled ? imageAgentPrompt.trim() : prompt;
  const [negativePrompt, setNegativePrompt] = React.useState('');
  const [modelType, setModelType] = React.useState<PowerPrompterModelType>('checkpoint');
  const [modelFamily, setModelFamily] = React.useState(() => {
    if (typeof window === 'undefined') return 'Anima';
    try { return window.localStorage.getItem('umbra-ui:model-pipeline') || 'Anima'; } catch { return 'Anima'; }
  });
  const [checkpointName, setCheckpointName] = React.useState('anima_baseV10.safetensors');
  const [workflowResourceValues, setWorkflowResourceValues] = React.useState<Record<string, string>>({});
  const [loras, setLoras] = React.useState<UmbraUiLoraEntry[]>([]);
  const activeLoraFamilyKey = React.useMemo(
    () => normalizeUmbraUiModelFamilyKey(modelFamily),
    [modelFamily],
  );
  const activeLoras = React.useMemo(
    () => getUmbraUiLorasForFamily(loras, activeLoraFamilyKey),
    [activeLoraFamilyKey, loras],
  );
  const replaceActiveLoras = React.useCallback((nextLoras: UmbraUiLoraEntry[]) => {
    setLoras((current) => replaceUmbraUiLorasForFamily(current, activeLoraFamilyKey, nextLoras));
  }, [activeLoraFamilyKey]);
  const [modelPickerKind, setModelPickerKind] = React.useState<UmbraModelPickerKind | null>(null);
  const [resourcePickerId, setResourcePickerId] = React.useState<string | null>(null);
  const [clipSkip, setClipSkip] = React.useState('1');
  const [seed, setSeed] = React.useState('0');
  const [seedMode, setSeedMode] = React.useState<PowerPrompterSeedControlMode>('fixed');
  const [steps, setSteps] = React.useState('35');
  const [cfg, setCfg] = React.useState('4');
  const [width, setWidth] = React.useState('896');
  const [height, setHeight] = React.useState('1152');
  const [img2imgSource, setImg2imgSource] = React.useState<UmbraImg2ImgSourceValue>({
    path: '',
    originalPath: '',
    name: '',
    imageUrl: '',
    width: 0,
    height: 0,
  });
  const [img2imgDenoise, setImg2imgDenoise] = React.useState(0.3);
  const [replaceImg2ImgSourceOnComplete, setReplaceImg2ImgSourceOnComplete] = React.useState(false);
  const [samplerName, setSamplerName] = React.useState('er_sde');
  const [scheduler, setScheduler] = React.useState('simple');
  const [hiresEnabled, setHiresEnabled] = React.useState(false);
  const [hiresUpscaler, setHiresUpscaler] = React.useState('Latent');
  const [hiresResizeMode, setHiresResizeMode] = React.useState<'scale' | 'dimensions'>('scale');
  const [hiresScaleBy, setHiresScaleBy] = React.useState(2);
  const [hiresTargetWidth, setHiresTargetWidth] = React.useState('0');
  const [hiresTargetHeight, setHiresTargetHeight] = React.useState('0');
  const [hiresSteps, setHiresSteps] = React.useState('0');
  const [hiresDenoise, setHiresDenoise] = React.useState(0.35);
  const [hiresCfg, setHiresCfg] = React.useState('0');
  const [hiresSamplerName, setHiresSamplerName] = React.useState('use_same');
  const [hiresScheduler, setHiresScheduler] = React.useState('use_same');
  const [detailerPipeline, setDetailerPipeline] = React.useState<PowerPrompterDetailerStage[]>(
    () => DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE.map((stage) => ({ ...stage })),
  );
  const [outputUpscale, setOutputUpscale] = React.useState<PowerPrompterOutputUpscaleControls>({
    enabled: false,
    modelName: 'RealESRGAN_x4plus.safetensors',
    maxDimension: 3840,
  });
  const [isQueueing, setIsQueueing] = React.useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = React.useState(false);
  const [agentDraftCount, setAgentDraftCount] = React.useState(0);
  const [pendingVideoAgentDraft, setPendingVideoAgentDraft] = React.useState<UmbraUiAgentDraft | null>(null);
  const [videoEditorDraft, setVideoEditorDraft] = React.useState<UmbraVideoEditorDraft | null>(null);
  const [videoAgentContext, setVideoAgentContext] = React.useState<UmbraUiAgentVideoContext>({
    prompt: '',
    negativePrompt: '',
    apiWorkflowId: '',
    family: '',
    mode: '',
    controls: {},
  });
  const inheritedControlsAppliedRef = React.useRef(false);
  const attemptedLoraInfoRef = React.useRef(new Set<string>());
  const mediaHandoffAppliedAtRef = React.useRef(0);
  const img2imgSourceReplacementRequestsRef = React.useRef(new Map<string, string>());
  const appliedImagePipelineDefaultsRef = React.useRef('');

  const clearStoredMediaHandoff = React.useCallback((handoff: UmbraUiMediaHandoff) => {
    const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: unknown };
    const pending = normalizeUmbraUiMediaHandoff(target.__umbraPendingUmbraUiMediaHandoff);
    if (pending?.createdAt === handoff.createdAt) target.__umbraPendingUmbraUiMediaHandoff = null;
    try {
      const stored = normalizeUmbraUiMediaHandoff(JSON.parse(window.sessionStorage.getItem(UMBRA_UI_MEDIA_HANDOFF_KEY) || 'null'));
      if (stored?.createdAt === handoff.createdAt) window.sessionStorage.removeItem(UMBRA_UI_MEDIA_HANDOFF_KEY);
    } catch { /* best effort */ }
  }, []);

  React.useEffect(() => {
    setMountedModes((current) => {
      if (current.has(activeMode)) return current;
      const next = new Set(current);
      next.add(activeMode);
      return next;
    });
    try { window.localStorage.setItem(UMBRA_UI_ACTIVE_MODE_STORAGE_KEY, activeMode); } catch { /* best effort */ }
  }, [activeMode]);

  const modeIsMounted = React.useCallback(
    (mode: UmbraGenerationMode) => activeMode === mode || mountedModes.has(mode),
    [activeMode, mountedModes],
  );
  const activeImageFeature = activeMode === 'img2img' ? 'img2img' : 'txt2img';
  const inpaintWorkspaceActive = activeMode === 'inpaint';
  const imageModelFamilies = React.useMemo(
    () => listUmbraUiPipelineFamilies(workflows, activeImageFeature),
    [activeImageFeature, workflows],
  );
  const inpaintModelFamilies = React.useMemo(
    () => listUmbraUiPipelineFamilies(workflows, 'inpainting'),
    [workflows],
  );
  const selectedFamilyPipelines = React.useMemo(() => workflows.flatMap((workflow) => (
    (workflow.umbraUiPipelines || [])
      .filter((pipeline) => pipeline.feature === activeImageFeature
        && pipeline.modelFamilyKey === normalizeUmbraUiModelFamilyKey(modelFamily))
      .map((pipeline) => ({ workflow, pipeline }))
  )), [activeImageFeature, modelFamily, workflows]);
  const imageModelTypeOptions = React.useMemo(() => {
    const supportedSources = new Set(selectedFamilyPipelines.flatMap(({ pipeline }) => pipeline.modelSources));
    return PRIMARY_MODEL_TYPE_OPTIONS.filter((option) => supportedSources.has(option.value));
  }, [selectedFamilyPipelines]);
  const selectedInpaintFamilyPipelines = React.useMemo(() => workflows.flatMap((workflow) => (
    (workflow.umbraUiPipelines || [])
      .filter((pipeline) => pipeline.feature === 'inpainting'
        && pipeline.modelFamilyKey === normalizeUmbraUiModelFamilyKey(modelFamily))
      .map((pipeline) => ({ workflow, pipeline }))
  )), [modelFamily, workflows]);
  const inpaintModelTypeOptions = React.useMemo(() => {
    const supportedSources = new Set(selectedInpaintFamilyPipelines.flatMap(({ pipeline }) => pipeline.modelSources));
    return PRIMARY_MODEL_TYPE_OPTIONS.filter((option) => supportedSources.has(option.value));
  }, [selectedInpaintFamilyPipelines]);
  const imagePipelineMatch = React.useMemo(
    () => resolveUmbraUiPipeline(workflows, activeImageFeature, modelFamily, modelType),
    [activeImageFeature, modelFamily, modelType, workflows],
  );
  const inpaintPipelineMatch = React.useMemo(
    () => resolveUmbraUiPipeline(workflows, 'inpainting', modelFamily, modelType),
    [modelFamily, modelType, workflows],
  );
  const selectedImageWorkflow = imagePipelineMatch.workflow;
  const selectedImagePipeline = imagePipelineMatch.pipeline;
  const imageCapabilities = React.useMemo(
    () => normalizeUmbraUiPipelineCapabilities(
      selectedImagePipeline?.capabilities,
      selectedImagePipeline?.modelSources || [],
    ),
    [selectedImagePipeline],
  );
  const inpaintCapabilities = React.useMemo(
    () => normalizeUmbraUiPipelineCapabilities(
      inpaintPipelineMatch.pipeline?.capabilities,
      inpaintPipelineMatch.pipeline?.modelSources || [],
    ),
    [inpaintPipelineMatch.pipeline],
  );
  const inpaintCanvasCapabilities = React.useMemo(
    () => normalizeUmbraUiInpaintCanvasCapabilities(inpaintPipelineMatch.pipeline?.inpaintCanvas),
    [inpaintPipelineMatch.pipeline],
  );
  const compatibleIpAdapterModels = React.useMemo(
    () => filterUmbraUiCompatibleIpAdapterModels(modelCatalog.ipAdapterModels, modelFamily, checkpointName),
    [checkpointName, modelCatalog.ipAdapterModels, modelFamily],
  );
  const inpaintResourceCatalog = React.useMemo(() => ({
    controlModels: modelCatalog.controlnets,
    animaLlliteAvailable: modelCatalog.animaLlliteAvailable,
    animaLlliteModels: modelCatalog.animaLlliteModels,
    modelPatchModels: modelCatalog.modelPatches,
    styleModels: modelCatalog.styleModels,
    ipAdapterModels: compatibleIpAdapterModels,
    visionModels: modelCatalog.clipVision,
  }), [compatibleIpAdapterModels, modelCatalog]);
  const inpaintControlAvailability = React.useMemo(
    () => resolveUmbraUiInpaintControlAvailability(
      inpaintCanvasCapabilities.controlLayers.adapterTypes,
      inpaintResourceCatalog,
    ),
    [inpaintCanvasCapabilities.controlLayers.adapterTypes, inpaintResourceCatalog],
  );
  const inpaintReferenceAvailability = React.useMemo(
    () => resolveUmbraUiInpaintReferenceAvailability(
      inpaintCanvasCapabilities.referenceLayers.methods,
      inpaintResourceCatalog,
    ),
    [inpaintCanvasCapabilities.referenceLayers.methods, inpaintResourceCatalog],
  );
  const inpaintControlAdapterTypes = inpaintControlAvailability.methods;
  const inpaintControlLayersAvailable = inpaintCanvasCapabilities.controlLayers.support !== 'unsupported'
    && inpaintControlAdapterTypes.length > 0
    && inpaintCanvasCapabilities.controlLayers.modes.length > 0;
  const inpaintControlLayersReason = modelCatalog.loading
    ? 'Checking installed ComfyUI control resources.'
    : inpaintControlAdapterTypes.length <= 0
      ? inpaintControlAvailability.reason || 'The locked pipeline does not declare a compatible control adapter.'
      : inpaintCanvasCapabilities.controlLayers.modes.length <= 0
        ? 'The locked pipeline does not declare a compatible control conditioning mode.'
        : inpaintCanvasCapabilities.controlLayers.reason;
  const inpaintReferenceLayersAvailable = inpaintCanvasCapabilities.referenceLayers.support !== 'unsupported'
    && inpaintReferenceAvailability.methods.length > 0;
  const inpaintReferenceLayersReason = modelCatalog.loading
    ? 'Checking installed ComfyUI reference resources.'
    : inpaintReferenceAvailability.methods.length <= 0
      ? inpaintReferenceAvailability.reason || 'The locked pipeline does not declare a compatible reference-image method.'
      : inpaintCanvasCapabilities.referenceLayers.reason;
  const imageReadiness = React.useMemo(
    () => normalizeUmbraUiPipelineReadiness(
      selectedImagePipeline?.readiness,
      imageCapabilities,
      selectedImagePipeline?.modelSources || [],
    ),
    [imageCapabilities, selectedImagePipeline],
  );
  const selectedWorkflowResources = React.useMemo(
    () => [...(selectedImageWorkflow?.resources || [])].sort((left, right) => left.order - right.order),
    [selectedImageWorkflow],
  );
  const primaryModelItems = React.useMemo(
    () => getPrimaryModelItems(modelCatalog, modelType),
    [modelCatalog, modelType],
  );
  const inpaintPrimaryModelItems = React.useMemo(
    () => filterUmbraUiInpaintPrimaryModels(
      primaryModelItems,
      inpaintPipelineMatch.pipeline?.inpaintAdapter || 'native_edit',
    ),
    [inpaintPipelineMatch.pipeline?.inpaintAdapter, primaryModelItems],
  );
  const primaryModelRuntimeIssue = React.useMemo(() => {
    if (!checkpointName || primaryModelItems.length <= 0) return '';
    const match = matchUmbraUiResourceCatalog(checkpointName, primaryModelItems);
    if (match.status === 'ambiguous') return `Model basename is ambiguous: ${match.matches.join(', ')}`;
    if (match.status === 'missing') return `Model is not installed: ${checkpointName}`;
    return '';
  }, [checkpointName, primaryModelItems]);
  const workflowResourceRuntimeIssue = React.useMemo(() => {
    for (const resource of selectedWorkflowResources) {
      const value = String(workflowResourceValues[resource.id] || resource.defaultValue || '').trim().replace(/\\/g, '/');
      if (resource.required && !value) return `Select ${resource.label}`;
      if (!value) continue;
      const installed = getInstalledWorkflowResourceItems(resource, modelCatalog);
      if (installed.length > 0) {
        const match = matchUmbraUiResourceCatalog(value, installed);
        if (match.status === 'ambiguous') return `${resource.label} basename is ambiguous: ${match.matches.join(', ')}`;
        if (match.status === 'missing') return `${resource.label} is not installed: ${value}`;
        continue;
      }
      const readinessItem = imageReadiness.runtime.resources.items.find((item) => item.id === resource.id);
      if (!readinessItem || readinessItem.value.toLowerCase() !== value.toLowerCase()) continue;
      if (readinessItem.status === 'selection_required') return `Select ${resource.label}`;
      if (readinessItem.status === 'ambiguous') return `${resource.label} basename is ambiguous: ${value}`;
      if (readinessItem.status === 'missing') return `${resource.label} is not installed: ${value}`;
    }
    return '';
  }, [imageReadiness.runtime.resources.items, modelCatalog, selectedWorkflowResources, workflowResourceValues]);
  const outputUpscaleRuntimeIssue = React.useMemo(() => {
    if (!outputUpscale.enabled || imageCapabilities.finalModelUpscale.support !== 'adjustable') return '';
    const value = imageCapabilities.finalModelUpscale.modelSelection
      ? outputUpscale.modelName
      : typeof imageCapabilities.finalModelUpscale.value === 'string'
        ? imageCapabilities.finalModelUpscale.value
        : '';
    if (!value) return imageCapabilities.finalModelUpscale.modelSelection
      ? 'Select an output upscale model'
      : '';
    if (modelCatalog.upscaleModels.length <= 0) return '';
    const match = matchUmbraUiResourceCatalog(value, modelCatalog.upscaleModels);
    if (match.status === 'ambiguous') return `Upscale model basename is ambiguous: ${match.matches.join(', ')}`;
    if (match.status === 'missing') return `Upscale model is not installed: ${value}`;
    return '';
  }, [imageCapabilities.finalModelUpscale, modelCatalog.upscaleModels, outputUpscale]);
  const imagePipelineRuntimeIssue = imageReadiness.runtime.nodes.status === 'missing'
    ? `Missing ComfyUI nodes: ${imageReadiness.runtime.nodes.missing.join(', ')}`
    : primaryModelRuntimeIssue
      || workflowResourceRuntimeIssue
      || outputUpscaleRuntimeIssue;
  const activeResourcePicker = React.useMemo(
    () => selectedWorkflowResources.find((resource) => resource.id === resourcePickerId) || null,
    [resourcePickerId, selectedWorkflowResources],
  );
  const missingWorkflowResource = React.useMemo(
    () => selectedWorkflowResources.find((resource) => (
      resource.required
      && !String(workflowResourceValues[resource.id] || resource.defaultValue || '').trim()
    )) || null,
    [selectedWorkflowResources, workflowResourceValues],
  );

  React.useEffect(() => {
    if (activeMode !== 'image' && activeMode !== 'img2img' && !inpaintWorkspaceActive) return;
    const activeFamilyPipelines = inpaintWorkspaceActive
      ? selectedInpaintFamilyPipelines
      : selectedFamilyPipelines;
    if (activeFamilyPipelines.length <= 0) return;
    const supportsCurrentSource = activeFamilyPipelines.some(({ pipeline }) => pipeline.modelSources.includes(modelType));
    const nextModelType = supportsCurrentSource
      ? modelType
      : activeFamilyPipelines[0]?.pipeline.modelSources[0] || modelType;
    const selected = [...activeFamilyPipelines]
      .filter(({ pipeline }) => pipeline.modelSources.includes(nextModelType))
      .sort((left, right) => right.pipeline.priority - left.pipeline.priority)[0];
    if (!selected) return;

    if (nextModelType !== modelType) setModelType(nextModelType);
    const defaults = selected.pipeline.defaults;
    const discoveredModelItems = getPrimaryModelItems(modelCatalog, nextModelType);
    const modelItems = inpaintWorkspaceActive
      ? filterUmbraUiInpaintPrimaryModels(discoveredModelItems, selected.pipeline.inpaintAdapter || 'native_edit')
      : discoveredModelItems;
    const preferredModelName = defaults?.modelNamesBySource?.[nextModelType]
      || (nextModelType === selected.pipeline.modelSources[0] ? defaults?.modelName : '');
    const preferredModel = preferredModelName
      ? resolveCatalogMatch(preferredModelName, modelItems)
      : '';
    const hasPreferredModel = !!preferredModel && modelItems.includes(preferredModel);
    setCheckpointName((current) => {
      if (hasPreferredModel) return current === preferredModel ? current : preferredModel;
      return modelItems.includes(current) ? current : '';
    });

    const defaultsKey = [
      selected.workflow.id,
      selected.pipeline.modelFamilyKey,
      nextModelType,
      JSON.stringify(defaults || {}),
    ].join(':');
    if (!defaults || appliedImagePipelineDefaultsRef.current === defaultsKey) return;
    appliedImagePipelineDefaultsRef.current = defaultsKey;
    const capabilities = normalizeUmbraUiPipelineCapabilities(selected.pipeline.capabilities, selected.pipeline.modelSources);
    const stepDefault = typeof capabilities.steps.value === 'number' ? capabilities.steps.value : defaults.steps;
    const guidanceDefault = typeof capabilities.guidance.value === 'number' ? capabilities.guidance.value : defaults.cfg;
    const samplerDefault = typeof capabilities.sampler.value === 'string' ? capabilities.sampler.value : defaults.samplerName;
    const schedulerDefault = typeof capabilities.scheduler.value === 'string' ? capabilities.scheduler.value : defaults.scheduler;
    const clipSkipDefault = typeof capabilities.clipSkip.value === 'number' ? Math.abs(capabilities.clipSkip.value) : defaults.clipSkip;
    const widthDefault = capabilities.resolution.defaultWidth ?? defaults.width;
    const heightDefault = capabilities.resolution.defaultHeight ?? defaults.height;
    const denoiseDefault = typeof capabilities.denoise.value === 'number'
      ? capabilities.denoise.value
      : defaults.denoise;
    if (typeof stepDefault === 'number' && Number.isFinite(stepDefault)) setSteps(String(stepDefault));
    if (typeof guidanceDefault === 'number' && Number.isFinite(guidanceDefault)) setCfg(String(guidanceDefault));
    if (samplerDefault) setSamplerName(samplerDefault);
    if (schedulerDefault) setScheduler(schedulerDefault);
    if (typeof widthDefault === 'number' && Number.isFinite(widthDefault)) setWidth(String(widthDefault));
    if (typeof heightDefault === 'number' && Number.isFinite(heightDefault)) setHeight(String(heightDefault));
    if (typeof clipSkipDefault === 'number' && Number.isFinite(clipSkipDefault)) setClipSkip(String(clipSkipDefault));
    if (activeMode === 'img2img' && typeof denoiseDefault === 'number' && Number.isFinite(denoiseDefault)) {
      setImg2imgDenoise(Math.max(0.01, Math.min(1, denoiseDefault)));
    }
  }, [activeMode, inpaintWorkspaceActive, modelCatalog, modelFamily, modelType, selectedFamilyPipelines, selectedInpaintFamilyPipelines]);

  React.useEffect(() => {
    if (!inpaintWorkspaceActive || inpaintModelFamilies.length <= 0) return;
    if (!inpaintModelFamilies.includes(modelFamily)) {
      setModelFamily(inpaintModelFamilies[0]);
      return;
    }
    const supportedSources = selectedInpaintFamilyPipelines.flatMap(({ pipeline }) => pipeline.modelSources);
    if (supportedSources.length <= 0 || supportedSources.includes(modelType)) return;
    const nextModelType = supportedSources[0];
    setModelType(nextModelType);
    const selectedPipeline = [...selectedInpaintFamilyPipelines]
      .filter(({ pipeline }) => pipeline.modelSources.includes(nextModelType))
      .sort((left, right) => right.pipeline.priority - left.pipeline.priority)[0]?.pipeline;
    const modelItems = filterUmbraUiInpaintPrimaryModels(
      getPrimaryModelItems(modelCatalog, nextModelType),
      selectedPipeline?.inpaintAdapter || 'native_edit',
    );
    setCheckpointName((current) => modelItems.includes(current) ? current : modelItems[0] || '');
  }, [inpaintWorkspaceActive, inpaintModelFamilies, modelCatalog, modelFamily, modelType, selectedInpaintFamilyPipelines]);

  React.useEffect(() => {
    setWorkflowResourceValues((current) => {
      const next: Record<string, string> = {};
      for (const resource of selectedWorkflowResources) {
        const value = String(current[resource.id] || resource.defaultValue || '').trim().replace(/\\/g, '/');
        if (value) next[resource.id] = value;
      }
      const currentEntries = Object.entries(current);
      const nextEntries = Object.entries(next);
      if (currentEntries.length === nextEntries.length && nextEntries.every(([id, value]) => current[id] === value)) {
        return current;
      }
      return next;
    });
  }, [selectedWorkflowResources]);

  React.useEffect(() => {
    const resizeMode = resolveUmbraUiHiresResizeMode(imageCapabilities.hiresFix, hiresResizeMode);
    if (!resizeMode) setHiresEnabled(false);
    else if (resizeMode !== hiresResizeMode) setHiresResizeMode(resizeMode);
    if (!imageCapabilities.hiresFix.controls.upscaler) setHiresUpscaler('Latent');
    if (!imageCapabilities.hiresFix.controls.steps) setHiresSteps('0');
    if (!imageCapabilities.hiresFix.controls.denoise) setHiresDenoise(0.35);
    if (!imageCapabilities.hiresFix.controls.cfg) setHiresCfg('0');
    if (!imageCapabilities.hiresFix.controls.sampler) setHiresSamplerName('use_same');
    if (!imageCapabilities.hiresFix.controls.scheduler) setHiresScheduler('use_same');

    setDetailerPipeline((current) => {
      if (imageCapabilities.detailerStages.support !== 'adjustable') return current.length > 0 ? [] : current;
      if (imageCapabilities.detailerStages.customStages) {
        return current.length > 0
          ? current
          : DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE.map((stage) => ({ ...stage }));
      }
      const available = [...current, ...DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE]
        .filter((stage, index, stages) => {
          const stageName = normalizeUmbraUiDetailerStageName(stage.label);
          return !!stageName && stages.findIndex((candidate) => (
            normalizeUmbraUiDetailerStageName(candidate.label) === stageName
          )) === index;
        });
      const filtered = filterUmbraUiDetailerStages(imageCapabilities.detailerStages, available);
      return filtered.length === current.length
        && filtered.every((stage, index) => stage.id === current[index]?.id)
        ? current
        : filtered.map((stage) => ({ ...stage }));
    });

    setOutputUpscale((current) => {
      const next = {
        enabled: imageCapabilities.finalModelUpscale.support === 'adjustable' && current.enabled,
        modelName: imageCapabilities.finalModelUpscale.modelSelection
        ? current.modelName
        : typeof imageCapabilities.finalModelUpscale.value === 'string'
          ? imageCapabilities.finalModelUpscale.value
          : current.modelName,
        maxDimension: imageCapabilities.finalModelUpscale.maxDimension ? current.maxDimension : 3840,
      };
      return next.enabled === current.enabled
        && next.modelName === current.modelName
        && next.maxDimension === current.maxDimension
        ? current
        : next;
    });
  }, [
    detailerPipeline,
    hiresCfg,
    hiresDenoise,
    hiresResizeMode,
    hiresSamplerName,
    hiresScheduler,
    hiresSteps,
    hiresUpscaler,
    imageCapabilities,
    outputUpscale,
  ]);

  const applyPowerPrompterGenerationControls = React.useCallback((
    source: Record<string, unknown>,
    options: { replace?: boolean; modelFamily?: string } = {},
  ) => {
    const generation = source && typeof source === 'object' ? source : {};
    const replace = options.replace === true;
    const readString = (key: string) => String(generation[key] || '').trim();
    const readNumber = (key: string) => {
      const value = Number(generation[key]);
      return Number.isFinite(value) ? String(value) : '';
    };
    const inheritedModelType = readString('modelType').toLowerCase().replace(/[\s-]+/g, '_');
    if (PRIMARY_MODEL_TYPE_OPTIONS.some((option) => option.value === inheritedModelType)) {
      setModelType(inheritedModelType as PowerPrompterModelType);
    }
    const inheritedModelFamily = String(options.modelFamily || readString('modelFamily')).trim();
    if (inheritedModelFamily) setModelFamily(inheritedModelFamily);
    const inheritedModelFamilyKey = normalizeUmbraUiModelFamilyKey(inheritedModelFamily);
    const inheritedCheckpoint = readString('checkpointName');
    if (inheritedCheckpoint) setCheckpointName(inheritedCheckpoint);
    const inheritedResources = generation.workflowResources;
    if (inheritedResources && typeof inheritedResources === 'object' && !Array.isArray(inheritedResources)) {
      setWorkflowResourceValues(Object.fromEntries(Object.entries(inheritedResources as Record<string, unknown>)
        .map(([id, value]) => [String(id || '').trim(), String(value || '').trim().replace(/\\/g, '/')])
        .filter(([id, value]) => id.length > 0 && value.length > 0)));
    } else if (replace) {
      setWorkflowResourceValues({});
    }
    if (Array.isArray(generation.loras)) {
      const inheritedLoras = (generation.loras as Array<Record<string, unknown>>)
        .map((entry) => {
          const name = String(entry?.name || '').trim();
          if (!name) return null;
          const baseEntry = createUmbraUiLoraEntry(name, [], inheritedModelFamilyKey);
          return {
            ...baseEntry,
            id: String(entry.id || '').trim() || baseEntry.id,
            enabled: entry.enabled !== false,
            strengthModel: Number.isFinite(Number(entry.strengthModel)) ? Number(entry.strengthModel) : 1,
            strengthClip: Number.isFinite(Number(entry.strengthClip)) ? Number(entry.strengthClip) : 1,
          } satisfies UmbraUiLoraEntry;
        })
        .filter((entry): entry is UmbraUiLoraEntry => !!entry);
      if (replace || inheritedLoras.length > 0) setLoras(inheritedLoras);
    } else if (replace) {
      setLoras([]);
    }
    const inheritedNegative = readString('negativePrompt');
    if (replace || inheritedNegative) setNegativePrompt(inheritedNegative);
    const inheritedSeed = readNumber('seed');
    if (inheritedSeed) setSeed(inheritedSeed);
    const inheritedSeedMode = readString('controlAfterGenerate');
    if (replace || inheritedSeedMode) setSeedMode(normalizeUmbraUiSeedMode(inheritedSeedMode));
    const inheritedSteps = readNumber('steps');
    if (inheritedSteps) setSteps(inheritedSteps);
    const inheritedCfg = readNumber('cfg');
    if (inheritedCfg) setCfg(inheritedCfg);
    const inheritedClipSkip = readNumber('clipSkip') || readNumber('clip_skip');
    if (inheritedClipSkip) setClipSkip(inheritedClipSkip);
    const inheritedWidth = readNumber('width');
    if (inheritedWidth) setWidth(inheritedWidth);
    const inheritedHeight = readNumber('height');
    if (inheritedHeight) setHeight(inheritedHeight);
    const inheritedSampler = readString('samplerName');
    if (inheritedSampler) setSamplerName(inheritedSampler);
    const inheritedScheduler = readString('scheduler');
    if (inheritedScheduler) setScheduler(inheritedScheduler);
    const inheritedHiresFix = generation.hiresFix;
    if (inheritedHiresFix && typeof inheritedHiresFix === 'object') {
      const hiresFix = inheritedHiresFix as Record<string, unknown>;
      setHiresEnabled(hiresFix.enabled === true);
      setHiresUpscaler(String(hiresFix.upscaler || 'Latent'));
      setHiresResizeMode(String(hiresFix.resizeMode || '').toLowerCase() === 'dimensions' ? 'dimensions' : 'scale');
      setHiresScaleBy(Math.max(1, Math.min(8, Number(hiresFix.scaleBy) || 2)));
      setHiresTargetWidth(String(Math.max(0, Number(hiresFix.targetWidth) || 0)));
      setHiresTargetHeight(String(Math.max(0, Number(hiresFix.targetHeight) || 0)));
      setHiresSteps(String(Math.max(0, Number(hiresFix.steps) || 0)));
      setHiresDenoise(Math.max(0, Math.min(1, Number(hiresFix.denoise) || 0.35)));
      setHiresCfg(String(Math.max(0, Number(hiresFix.cfg) || 0)));
      setHiresSamplerName(String(hiresFix.samplerName || 'use_same'));
      setHiresScheduler(String(hiresFix.scheduler || 'use_same'));
    }
    if (Array.isArray(generation.detailerPipeline)) {
      setDetailerPipeline((generation.detailerPipeline as PowerPrompterDetailerStage[]).map((stage) => ({ ...stage })));
    }
    const inheritedOutputUpscale = generation.outputUpscale;
    if (inheritedOutputUpscale && typeof inheritedOutputUpscale === 'object') {
      const upscale = inheritedOutputUpscale as Record<string, unknown>;
      setOutputUpscale({
        enabled: upscale.enabled === true,
        modelName: String(upscale.modelName || 'RealESRGAN_x4plus.safetensors'),
        maxDimension: Math.max(512, Math.min(16384, Number(upscale.maxDimension) || 3840)),
      });
    }
    const inheritedImg2Img = generation.img2img;
    if (inheritedImg2Img && typeof inheritedImg2Img === 'object') {
      const img2img = inheritedImg2Img as Record<string, unknown>;
      const sourceImagePath = String(img2img.sourceImagePath || '').trim().replace(/\\/g, '/');
      const sourceImageName = String(img2img.sourceImageName || '').trim().replace(/\\/g, '/');
      if (sourceImagePath || sourceImageName || replace) {
        setImg2imgSource({
          path: sourceImagePath,
          originalPath: sourceImagePath,
          name: sourceImageName,
          imageUrl: '',
          width: 0,
          height: 0,
        });
      }
      const denoise = Number(img2img.denoise);
      if (Number.isFinite(denoise)) setImg2imgDenoise(Math.max(0.01, Math.min(1, denoise)));
    }
  }, []);

  React.useEffect(() => {
    if (!inheritedGeneration || inheritedControlsAppliedRef.current) return;
    inheritedControlsAppliedRef.current = true;
    applyPowerPrompterGenerationControls(inheritedGeneration);
  }, [applyPowerPrompterGenerationControls, inheritedGeneration]);

  React.useEffect(() => {
    const applyHandoff = (handoff: UmbraUiPowerPrompterHandoff | null) => {
      if (!handoff) return;
      setActiveMode('image');
      setPromptSegments([createUmbraUiPromptSegment(handoff.prompt)]);
      setActivePromptSegmentId('');
      applyPowerPrompterGenerationControls(handoff.generation, {
        replace: true,
        modelFamily: handoff.modelFamily,
      });
    };

    applyHandoff(takePendingUmbraUiPowerPrompterHandoff());
    const onHandoff = (event: Event) => {
      const handoff = normalizeUmbraUiPowerPrompterHandoff(
        (event as CustomEvent<UmbraUiPowerPrompterHandoff>).detail,
      );
      clearPendingUmbraUiPowerPrompterHandoff();
      applyHandoff(handoff);
    };
    window.addEventListener(UMBRA_UI_POWER_PROMPTER_HANDOFF_EVENT, onHandoff);
    return () => window.removeEventListener(UMBRA_UI_POWER_PROMPTER_HANDOFF_EVENT, onHandoff);
  }, [applyPowerPrompterGenerationControls]);

  React.useEffect(() => {
    if (imageModelFamilies.length <= 0) return;
    const currentKey = normalizeUmbraUiModelFamilyKey(modelFamily);
    const matchedFamily = imageModelFamilies.find((family) => normalizeUmbraUiModelFamilyKey(family) === currentKey);
    if (matchedFamily) {
      if (matchedFamily !== modelFamily) setModelFamily(matchedFamily);
      return;
    }
    setModelFamily(imageModelFamilies[0]);
  }, [imageModelFamilies, modelFamily]);

  React.useEffect(() => {
    if (!modelFamily) return;
    try { window.localStorage.setItem('umbra-ui:model-pipeline', modelFamily); } catch { /* best effort */ }
  }, [modelFamily]);

  React.useEffect(() => {
    if (activeMode !== 'img2img' || !img2imgSource.path || img2imgSource.name) return;
    const controller = new AbortController();
    const sourcePath = img2imgSource.path;
    const timer = window.setTimeout(() => {
      void fetch('/api/comfy/copy-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath }),
        signal: controller.signal,
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.filename) return;
        setImg2imgSource((current) => current.path === sourcePath
          ? { ...current, name: String(payload.filename) }
          : current);
      }).catch(() => undefined);
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [activeMode, img2imgSource.name, img2imgSource.path]);

  React.useEffect(() => {
    if (promptSegments.some((segment) => segment.id === activePromptSegmentId)) return;
    setActivePromptSegmentId(promptSegments[0]?.id || '');
  }, [activePromptSegmentId, promptSegments]);

  const addPromptToken = React.useCallback((token: string) => {
    setPromptSegments((current) => appendUmbraUiPromptToken(current, activePromptSegmentId, token));
  }, [activePromptSegmentId]);

  const applyAgentDraft = React.useCallback((draft: UmbraUiAgentDraft) => {
    if (draft.mediaType === 'video') {
      setPendingVideoAgentDraft(draft);
      setActiveMode('video');
      return;
    }
    setImageAgentModeEnabled(true);
    setImageAgentPrompt(draft.prompt || draft.segments.join(', '));
    setNegativePrompt(draft.negativePrompt);
    setActiveMode((current) => current === 'inpaint' || current === 'img2img' ? current : 'image');
  }, []);

  const handleModelTypeChange = React.useCallback((nextType: PowerPrompterModelType) => {
    const discoveredItems = getPrimaryModelItems(modelCatalog, nextType);
    const nextItems = inpaintWorkspaceActive
      ? filterUmbraUiInpaintPrimaryModels(
        discoveredItems,
        inpaintPipelineMatch.pipeline?.inpaintAdapter || 'native_edit',
      )
      : discoveredItems;
    setModelType(nextType);
    setCheckpointName((current) => nextItems.includes(current) ? current : nextItems[0] || '');
  }, [inpaintPipelineMatch.pipeline?.inpaintAdapter, inpaintWorkspaceActive, modelCatalog]);

  const updateWorkflowResource = React.useCallback((resourceId: string, value: string) => {
    const normalizedId = String(resourceId || '').trim();
    if (!normalizedId) return;
    const normalizedValue = String(value || '').trim().replace(/\\/g, '/');
    setWorkflowResourceValues((current) => {
      if (!normalizedValue) {
        if (!Object.prototype.hasOwnProperty.call(current, normalizedId)) return current;
        const next = { ...current };
        delete next[normalizedId];
        return next;
      }
      if (current[normalizedId] === normalizedValue) return current;
      return { ...current, [normalizedId]: normalizedValue };
    });
  }, []);

  const openPrimaryModelPicker = React.useCallback(() => {
    setResourcePickerId(null);
    setModelPickerKind('checkpoint');
  }, []);

  const openLoraPicker = React.useCallback(() => {
    setResourcePickerId(null);
    setModelPickerKind('lora');
  }, []);

  const openWorkflowResourcePicker = React.useCallback((resource: UmbraWorkflowResourceSelector) => {
    setModelPickerKind(null);
    setResourcePickerId(resource.id);
  }, []);

  const closeModelPicker = React.useCallback(() => {
    setModelPickerKind(null);
    setResourcePickerId(null);
  }, []);

  const handleModelPickerConfirm = React.useCallback(async (name: string, info: UmbraModelPickerInfo | null) => {
    const normalizedName = String(name || '').trim().replace(/\\/g, '/');
    if (!normalizedName) return;
    if (activeResourcePicker) {
      updateWorkflowResource(activeResourcePicker.id, normalizedName);
      closeModelPicker();
      return;
    }
    if (modelPickerKind === 'checkpoint') {
      setCheckpointName(normalizedName);
      closeModelPicker();
      return;
    }
    try {
      const loraInfo = info && 'loraName' in info
        ? info
        : await requestLoraInfo(normalizedName);
      setLoras((current) => {
        const existing = current.find((entry) => (
          String(entry.modelFamilyKey || '').toLowerCase() === activeLoraFamilyKey
          && entry.name.toLowerCase() === normalizedName.toLowerCase()
        ));
        if (existing) {
          return current.map((entry) => entry.id === existing.id
            ? { ...entry, enabled: true, trainedTags: loraInfo.trainedTags }
            : entry);
        }
        return [...current, createUmbraUiLoraEntry(normalizedName, loraInfo.trainedTags, activeLoraFamilyKey)];
      });
      closeModelPicker();
    } catch (error) {
      setLoras((current) => current.some((entry) => (
        String(entry.modelFamilyKey || '').toLowerCase() === activeLoraFamilyKey
        && entry.name.toLowerCase() === normalizedName.toLowerCase()
      )) ? current : [...current, createUmbraUiLoraEntry(normalizedName, [], activeLoraFamilyKey)]);
      closeModelPicker();
      showToast(error instanceof Error ? `${error.message} Added without trained tokens.` : 'LoRA added without trained tokens.', 'error');
    }
  }, [activeLoraFamilyKey, activeResourcePicker, closeModelPicker, modelPickerKind, requestLoraInfo, showToast, updateWorkflowResource]);

  React.useEffect(() => {
    const unresolved = loras.filter((lora) => {
      const key = lora.name.toLowerCase();
      return lora.trainedTags.length <= 0 && !attemptedLoraInfoRef.current.has(key);
    });
    if (unresolved.length <= 0) return;
    for (const lora of unresolved) {
      const key = lora.name.toLowerCase();
      attemptedLoraInfoRef.current.add(key);
      void requestLoraInfo(lora.name)
        .then((info) => {
          if (info.trainedTags.length <= 0) return;
          setLoras((current) => current.map((entry) => entry.name.toLowerCase() === key
            ? { ...entry, trainedTags: info.trainedTags }
            : entry));
        })
        .catch(() => undefined);
    }
  }, [loras, requestLoraInfo]);

  const handleQueueImage = React.useCallback(async (placement: UmbraQueuePlacement = 'end') => {
    if (isQueueing) return;
    const effectivePlacement = queueSummary.powerPrompterActive ? placement : 'end';
    if (effectivePlacement === 'interrupt' && !window.confirm(
      'Stop the current Power Prompter image and run this Umbra UI image next?',
    )) return;
    setIsQueueing(true);
    try {
      const controlNumber = (value: string, capabilityValue: string | number | boolean | undefined) => (
        typeof capabilityValue === 'number' && Number.isFinite(capabilityValue)
          ? capabilityValue
          : Number(value)
      );
      const effectiveSampler = imageCapabilities.sampler.support === 'adjustable'
        ? samplerName
        : typeof imageCapabilities.sampler.value === 'string' ? imageCapabilities.sampler.value : samplerName;
      const effectiveScheduler = imageCapabilities.scheduler.support === 'adjustable'
        ? scheduler
        : typeof imageCapabilities.scheduler.value === 'string' ? imageCapabilities.scheduler.value : scheduler;
      const effectiveHiresResizeMode = resolveUmbraUiHiresResizeMode(
        imageCapabilities.hiresFix,
        hiresResizeMode,
      );
      const effectiveDetailerPipeline = filterUmbraUiDetailerStages(
        imageCapabilities.detailerStages,
        detailerPipeline,
      );
      const seedIsAdjustable = imageCapabilities.seed.support === 'adjustable';
      const queuedSeed = seedIsAdjustable
        ? resolveUmbraUiQueueSeed(seed, seedMode)
        : controlNumber(seed, imageCapabilities.seed.value);
      const requestId = await queueImage({
        prompt: workflowImagePrompt,
        negativePrompt: imageCapabilities.negativePrompt.support === 'adjustable' ? negativePrompt : '',
        modelFamily,
        modelType,
        checkpointName,
        workflowResources: workflowResourceValues,
        clipSkip: imageCapabilities.clipSkip.support === 'adjustable'
          ? Number(clipSkip)
          : controlNumber('1', imageCapabilities.clipSkip.value),
        seed: queuedSeed,
        seedMode: seedIsAdjustable ? seedMode : 'fixed',
        steps: controlNumber(steps, imageCapabilities.steps.support === 'adjustable' ? undefined : imageCapabilities.steps.value),
        cfg: controlNumber(cfg, imageCapabilities.guidance.support === 'adjustable' ? undefined : imageCapabilities.guidance.value),
        samplerName: effectiveSampler,
        scheduler: effectiveScheduler,
        width: imageCapabilities.resolution.support === 'adjustable'
          ? Number(width)
          : imageCapabilities.resolution.defaultWidth || Number(width),
        height: imageCapabilities.resolution.support === 'adjustable'
          ? Number(height)
          : imageCapabilities.resolution.defaultHeight || Number(height),
        outputMode: activeImageFeature,
        sourceImagePath: img2imgSource.path,
        sourceImageName: img2imgSource.name,
        denoise: img2imgDenoise,
        hiresFix: {
          enabled: imageCapabilities.hiresFix.support === 'adjustable' && !!effectiveHiresResizeMode && hiresEnabled,
          upscaler: imageCapabilities.hiresFix.controls.upscaler ? hiresUpscaler : 'Latent',
          resizeMode: effectiveHiresResizeMode || 'scale',
          scaleBy: hiresScaleBy,
          targetWidth: Number(hiresTargetWidth),
          targetHeight: Number(hiresTargetHeight),
          steps: imageCapabilities.hiresFix.controls.steps ? Number(hiresSteps) : 0,
          denoise: imageCapabilities.hiresFix.controls.denoise ? hiresDenoise : 0.35,
          cfg: imageCapabilities.hiresFix.controls.cfg ? Number(hiresCfg) : 0,
          samplerName: imageCapabilities.hiresFix.controls.sampler ? hiresSamplerName : 'use_same',
          scheduler: imageCapabilities.hiresFix.controls.scheduler ? hiresScheduler : 'use_same',
        },
        detailerPipeline: effectiveDetailerPipeline,
        outputUpscale: {
          ...outputUpscale,
          enabled: imageCapabilities.finalModelUpscale.support === 'adjustable' && outputUpscale.enabled,
          modelName: imageCapabilities.finalModelUpscale.modelSelection
            ? outputUpscale.modelName
            : typeof imageCapabilities.finalModelUpscale.value === 'string'
              ? imageCapabilities.finalModelUpscale.value
              : outputUpscale.modelName,
          maxDimension: imageCapabilities.finalModelUpscale.maxDimension
            ? outputUpscale.maxDimension
            : 3840,
        },
        loras: imageCapabilities.loras.support === 'adjustable' ? activeLoras : [],
        queuePlacement: effectivePlacement,
      });
      if (activeImageFeature === 'img2img' && replaceImg2ImgSourceOnComplete && requestId) {
        const originalPath = String(img2imgSource.originalPath || img2imgSource.path || '').trim();
        if (!originalPath) throw new Error('Umbra could not identify the original Gallery image to replace.');
        img2imgSourceReplacementRequestsRef.current.set(requestId, originalPath);
      }
      if (seedIsAdjustable) setSeed(String(advanceUmbraUiSeed(queuedSeed, seedMode)));
      const jobLabel = activeImageFeature === 'img2img' ? 'IMG2IMG job' : 'Image';
      const placementMessage = effectivePlacement === 'next'
        ? 'will run after the current Power Prompter image.'
        : effectivePlacement === 'interrupt'
          ? 'will run as soon as the current Power Prompter image stops.'
          : queueSummary.powerPrompterActive
            ? 'was added to the end of the Power Prompter queue.'
            : 'was submitted for generation.';
      showToast(`${jobLabel} ${placementMessage}`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue image.', 'error');
    } finally {
      setIsQueueing(false);
    }
  }, [
    activeImageFeature,
    cfg,
    checkpointName,
    clipSkip,
    detailerPipeline,
    height,
    hiresCfg,
    hiresDenoise,
    hiresEnabled,
    hiresResizeMode,
    hiresSamplerName,
    hiresScaleBy,
    hiresScheduler,
    hiresSteps,
    hiresTargetHeight,
    hiresTargetWidth,
    hiresUpscaler,
    imageCapabilities,
    img2imgDenoise,
    img2imgSource,
    isQueueing,
    activeLoras,
    modelFamily,
    modelType,
    negativePrompt,
    outputUpscale,
    queueImage,
    queueSummary.powerPrompterActive,
    replaceImg2ImgSourceOnComplete,
    samplerName,
    scheduler,
    seed,
    seedMode,
    showToast,
    steps,
    width,
    workflowImagePrompt,
    workflowResourceValues,
  ]);

  React.useEffect(() => {
    if (!latestSavedImage?.requestId) return;
    const originalPath = img2imgSourceReplacementRequestsRef.current.get(latestSavedImage.requestId);
    if (!originalPath) return;
    img2imgSourceReplacementRequestsRef.current.delete(latestSavedImage.requestId);

    let canceled = false;
    void (async () => {
      try {
        const response = await fetch('/api/umbra-ui/image/replace-source', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalPath,
            resultPath: latestSavedImage.path,
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || payload?.success === false) {
          throw new Error(String(payload?.error || 'Failed to replace the original image.'));
        }
        if (canceled) return;
        const replacedPath = String(payload?.path || originalPath).trim() || originalPath;
        const revision = String(payload?.revision || Date.now()).trim();
        const replacedFolderPath = replacedPath.replace(/[\\/][^\\/]+$/, '');
        setImg2imgSource({
          path: replacedPath,
          originalPath: replacedPath,
          name: '',
          imageUrl: `/api/fs/image?${new URLSearchParams({ path: replacedPath, rev: revision }).toString()}`,
          width: 0,
          height: 0,
        });
        window.dispatchEvent(new CustomEvent('umbra:gallery-content-changed', {
          detail: {
            path: replacedPath,
            mediaPath: replacedPath,
            folderPath: replacedFolderPath,
            reason: 'replace-source',
            source: 'umbra-ui',
            revision,
            modifiedMs: Number(payload?.modifiedMs || Date.now()),
            size: Number(payload?.size || 0),
          },
        }));
        window.dispatchEvent(new CustomEvent('umbra:umbra-ui-output-refresh'));
        const backupPath = String(payload?.backupPath || '').trim();
        showToast(
          backupPath
            ? `Original image replaced. Recovery copy: ${backupPath}`
            : 'Original image replaced and a recovery copy was saved.',
          'success',
        );
      } catch (error) {
        if (!canceled) showToast(error instanceof Error ? error.message : 'Failed to replace the original image.', 'error');
      }
    })();
    return () => { canceled = true; };
  }, [latestSavedImage, showToast]);

  const previewProgress = generationPreview?.maxStep
    ? Math.max(0, Math.min(1, generationPreview.step / generationPreview.maxStep))
    : 0;
  const showingLivePreview = queueSummary.running > 0 && !!generationPreview?.imageDataUrl;
  const imagePreviewUrl = showingLivePreview
    ? generationPreview?.imageDataUrl || ''
    : latestSavedImage?.imageUrl || generationPreview?.imageDataUrl || '';
  const samplerOptions = modelCatalog.samplers.length > 0
    ? modelCatalog.samplers
    : ['er_sde', 'euler', 'dpmpp_2m_sde'];
  const schedulerOptions = modelCatalog.schedulers.length > 0
    ? modelCatalog.schedulers
    : ['simple', 'normal', 'karras'];
  React.useEffect(() => {
    const publishContext = () => {
      void publishUmbraUiAgentContext({
        updatedAt: Date.now(),
        activeMode,
        image: {
          prompt: workflowImagePrompt,
          promptSegments,
          negativePrompt,
          apiWorkflowId: selectedImageWorkflow?.id || '',
          checkpointName,
          loras: activeLoras.filter((entry) => entry.enabled).map((entry) => ({
            name: entry.name,
            strengthModel: entry.strengthModel,
            strengthClip: entry.strengthClip,
            trainedTags: entry.trainedTags,
          })),
          controls: {
            agentModeEnabled: imageAgentModeEnabled,
            agentPrompt: imageAgentPrompt,
            modelType,
            modelFamily,
            outputMode: activeImageFeature,
            img2img: {
              sourceImagePath: img2imgSource.path,
              sourceImageName: img2imgSource.name,
              denoise: img2imgDenoise,
            },
            workflowResources: workflowResourceValues,
            clipSkip: Number(clipSkip),
            seed: Number(seed),
            seedMode,
            steps: Number(steps),
            cfg: Number(cfg),
            width: Number(width),
            height: Number(height),
            samplerName,
            scheduler,
            hiresFix: {
              enabled: hiresEnabled,
              upscaler: hiresUpscaler,
              resizeMode: hiresResizeMode,
              scaleBy: hiresScaleBy,
              targetWidth: Number(hiresTargetWidth),
              targetHeight: Number(hiresTargetHeight),
              steps: Number(hiresSteps),
              denoise: hiresDenoise,
              cfg: Number(hiresCfg),
              samplerName: hiresSamplerName,
              scheduler: hiresScheduler,
            },
            detailerPipeline,
            outputUpscale,
          },
        },
        video: videoAgentContext,
      }).catch(() => undefined);
    };
    const timer = window.setTimeout(publishContext, 350);
    const heartbeat = window.setInterval(publishContext, 30_000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(heartbeat);
    };
  }, [
    activeMode,
    activeImageFeature,
    cfg,
    checkpointName,
    clipSkip,
    detailerPipeline,
    height,
    hiresCfg,
    hiresDenoise,
    hiresEnabled,
    hiresResizeMode,
    hiresSamplerName,
    hiresScaleBy,
    hiresScheduler,
    hiresSteps,
    hiresTargetHeight,
    hiresTargetWidth,
    hiresUpscaler,
    activeLoras,
    modelFamily,
    modelType,
    negativePrompt,
    outputUpscale,
    promptSegments,
    samplerName,
    scheduler,
    seed,
    seedMode,
    selectedImageWorkflow?.id,
    steps,
    videoAgentContext,
    width,
    imageAgentModeEnabled,
    imageAgentPrompt,
    img2imgDenoise,
    img2imgSource,
    workflowImagePrompt,
    workflowResourceValues,
  ]);

  React.useEffect(() => {
    const applyMediaHandoff = (handoff: UmbraUiMediaHandoff | null) => {
      if (!handoff) return;
      if (handoff.createdAt <= mediaHandoffAppliedAtRef.current) return;
      mediaHandoffAppliedAtRef.current = handoff.createdAt;
      window.setTimeout(() => {
        clearStoredMediaHandoff(handoff);
      }, 250);
      if (handoff.mode === 'video') setActiveMode('video');
      if (handoff.mode === 'img2img') {
        setActiveMode('img2img');
        setImg2imgSource({
          path: handoff.path,
          originalPath: handoff.originalSourcePath || handoff.path,
          name: '',
          imageUrl: handoff.imageUrl,
          width: 0,
          height: 0,
        });
        if (typeof handoff.generation?.denoise === 'number') {
          setImg2imgDenoise(Math.max(0.01, Math.min(1, handoff.generation.denoise)));
        }
      }
      if (handoff.mode === 'inpaint') setActiveMode('inpaint');
      const snapshot = handoff.generation;
      if (!snapshot) return;

      if (snapshot.positivePrompt) {
        const segment = createUmbraUiPromptSegment(snapshot.positivePrompt);
        setPromptSegments([segment]);
        setActivePromptSegmentId(segment.id);
      }
      const requestedModelType = PRIMARY_MODEL_TYPE_OPTIONS.some((option) => option.value === snapshot.modelType)
        ? snapshot.modelType as PowerPrompterModelType
        : 'checkpoint';
      const modelItems = getPrimaryModelItems(modelCatalog, requestedModelType);
      const checkpoint = resolveCatalogMatch(snapshot.checkpointName, modelItems);
      const inheritedLoras = snapshot.loras.map((entry) => ({
        ...entry,
        name: resolveCatalogMatch(entry.name, loraCatalog),
      }));
      applyPowerPrompterGenerationControls({
        modelType: requestedModelType,
        modelFamily: snapshot.modelFamily,
        checkpointName: checkpoint,
        negativePrompt: snapshot.negativePrompt,
        seed: snapshot.seed,
        steps: snapshot.steps,
        cfg: snapshot.cfg,
        clipSkip: snapshot.clipSkip,
        samplerName: snapshot.samplerName,
        scheduler: snapshot.scheduler,
        width: snapshot.width,
        height: snapshot.height,
        workflowResources: snapshot.workflowResources,
        loras: inheritedLoras,
      }, { replace: true, modelFamily: snapshot.modelFamily });

      if (snapshot.vaeName) {
        const vaeResource = selectedWorkflowResources.find((resource) => resource.kind === 'vae');
        if (vaeResource) {
          const vaeName = resolveCatalogMatch(snapshot.vaeName, modelCatalog.vaes);
          setWorkflowResourceValues((current) => ({ ...current, [vaeResource.id]: vaeName }));
        }
      }
    };

    const onHandoff = (event: Event) => {
      applyMediaHandoff(normalizeUmbraUiMediaHandoff((event as CustomEvent).detail));
    };
    const onUpscaleHandoff = () => setActiveMode('extras');
    const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: unknown };
    let storedHandoff: UmbraUiMediaHandoff | null = null;
    try {
      storedHandoff = normalizeUmbraUiMediaHandoff(JSON.parse(window.sessionStorage.getItem(UMBRA_UI_MEDIA_HANDOFF_KEY) || 'null'));
    } catch { /* best effort */ }
    applyMediaHandoff(normalizeUmbraUiMediaHandoff(target.__umbraPendingUmbraUiMediaHandoff) || storedHandoff);
    window.addEventListener(UMBRA_UI_MEDIA_HANDOFF_EVENT, onHandoff);
    window.addEventListener('umbra:umbra-ui-upscale-handoff', onUpscaleHandoff);
    return () => {
      window.removeEventListener(UMBRA_UI_MEDIA_HANDOFF_EVENT, onHandoff);
      window.removeEventListener('umbra:umbra-ui-upscale-handoff', onUpscaleHandoff);
    };
  }, [applyPowerPrompterGenerationControls, clearStoredMediaHandoff, loraCatalog, modelCatalog, selectedWorkflowResources]);

  const sendLatestToUpscale = React.useCallback((autoStart: boolean) => {
    if (!latestSavedImage?.path) {
      showToast('Finish an Umbra UI image before sending it to upscale.', 'error');
      return;
    }
    stageUmbraUiUpscaleHandoff({
      path: latestSavedImage.path,
      name: latestSavedImage.name,
      imageUrl: latestSavedImage.imageUrl,
      autoStart,
    });
    setActiveMode('extras');
    showToast(autoStart ? 'Image sent to Extras for immediate upscaling.' : 'Image added to the upscale batch.', 'success');
  }, [latestSavedImage, showToast]);

  const sendLatestToImg2Img = React.useCallback(() => {
    if (!latestSavedImage?.path) {
      showToast('Finish an Umbra UI image before sending it to IMG2IMG.', 'error');
      return;
    }
    setImg2imgSource({
      path: latestSavedImage.path,
      originalPath: latestSavedImage.path,
      name: '',
      imageUrl: latestSavedImage.imageUrl,
      width: 0,
      height: 0,
    });
    setActiveMode('img2img');
    showToast('Image opened in IMG2IMG.', 'success');
  }, [latestSavedImage, showToast]);

  const sendLatestToInpaint = React.useCallback(() => {
    if (!latestSavedImage?.path) {
      showToast('Finish an Umbra UI image before sending it to inpaint.', 'error');
      return;
    }
    stageUmbraUiInpaintHandoff({
      path: latestSavedImage.path,
      name: latestSavedImage.name,
      imageUrl: latestSavedImage.imageUrl,
      source: 'umbra-ui-latest-output',
    });
    setActiveMode('inpaint');
    showToast('Image opened in Inpaint.', 'success');
  }, [latestSavedImage, showToast]);

  const modelPickerOpen = modelPickerKind !== null || activeResourcePicker !== null;
  const activePickerItems = activeResourcePicker
    ? getWorkflowResourceItems(activeResourcePicker, modelCatalog)
    : modelPickerKind === 'lora'
      ? loraCatalog
      : inpaintWorkspaceActive ? inpaintPrimaryModelItems : primaryModelItems;
  const activePickerSelection = activeResourcePicker
    ? String(workflowResourceValues[activeResourcePicker.id] || activeResourcePicker.defaultValue || '')
    : modelPickerKind === 'checkpoint'
      ? checkpointName
      : '';
  const primaryModelLabel = getPrimaryModelLabel(modelType);
  const activePickerTitle = activeResourcePicker
    ? `${activeResourcePicker.label} Browser`
    : modelPickerKind === 'checkpoint' && modelType !== 'checkpoint'
      ? `${primaryModelLabel} Browser`
      : undefined;
  const activePickerSearchPlaceholder = activeResourcePicker
    ? `Search ${activeResourcePicker.label.toLowerCase()} files...`
    : modelPickerKind === 'checkpoint' && modelType !== 'checkpoint'
      ? `Search ${primaryModelLabel.toLowerCase()} models...`
      : undefined;
  const activePickerConfirmLabel = activeResourcePicker
    ? `Use ${activeResourcePicker.label}`
    : modelPickerKind === 'checkpoint' && modelType !== 'checkpoint'
      ? `Use ${primaryModelLabel}`
      : undefined;
  const activeImageModelFamilies = imageModelFamilies;

  return (
    <div data-umbra-ui-workspace="" className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)] text-zinc-100">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-white/10 bg-black/30 px-4 py-1.5 max-[1140px]:gap-2 max-[1140px]:px-3">
        <PanelsTopLeft size={16} className="text-[var(--umbra-accent)] max-[1140px]:hidden" />
        <div className="text-xs font-black uppercase tracking-[0.18em] max-[1140px]:hidden">Umbra UI</div>
        <div className="h-4 w-px bg-white/10 max-[1140px]:hidden" />
        <div className="inline-flex h-9 shrink-0 overflow-hidden rounded-md border border-white/10 bg-black/25">
          <button
            type="button"
            onClick={() => setActiveMode('image')}
            className={cn(
              'inline-flex items-center gap-2 px-3 text-[10px] font-black uppercase tracking-[0.11em] transition-colors',
              activeMode === 'image' ? 'bg-cyan-500/[0.12] text-cyan-100' : 'text-zinc-600 hover:text-zinc-300',
            )}
          >
            <ImageIcon size={13} /> TXT2IMG
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('img2img')}
            className={cn(
              'inline-flex items-center gap-2 border-l border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.11em] transition-colors',
              activeMode === 'img2img' ? 'bg-cyan-500/[0.12] text-cyan-100' : 'text-zinc-600 hover:text-zinc-300',
            )}
          >
            <Images size={13} /> IMG2IMG
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('inpaint')}
            className={cn(
              'inline-flex items-center gap-2 border-l border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.11em] transition-colors',
              activeMode === 'inpaint' ? 'bg-rose-500/[0.12] text-rose-100' : 'text-zinc-600 hover:text-zinc-300',
            )}
          >
            <Paintbrush size={13} /> Inpaint
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('video')}
            className={cn(
              'inline-flex items-center gap-2 border-l border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.11em] transition-colors',
              activeMode === 'video' ? 'bg-fuchsia-500/[0.12] text-fuchsia-100' : 'text-zinc-600 hover:text-zinc-300',
            )}
          >
            <Clapperboard size={13} /> Video
          </button>
          <button
            type="button"
            onClick={() => setActiveMode('extras')}
            className={cn(
              'inline-flex items-center gap-2 border-l border-white/10 px-3 text-[10px] font-black uppercase tracking-[0.11em] transition-colors',
              activeMode === 'extras' ? 'bg-amber-500/[0.12] text-amber-100' : 'text-zinc-600 hover:text-zinc-300',
            )}
          >
            <ImageUp size={13} /> Extras
          </button>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setAgentPanelOpen(true)}
            className="relative inline-flex h-9 items-center gap-2 rounded-md border border-cyan-300/20 bg-cyan-500/[0.045] px-3 text-[10px] font-black uppercase tracking-[0.11em] text-cyan-100 transition-colors hover:bg-cyan-500/[0.1]"
          >
            <Bot size={13} />
            Agent
            {agentDraftCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-cyan-300 px-1 font-mono text-[9px] text-black">{agentDraftCount}</span>
            ) : null}
          </button>
          <span className={cn(
            'h-1.5 w-1.5 rounded-full shadow-[0_0_7px_currentColor]',
            comfyConnected ? 'bg-emerald-400 text-emerald-400' : 'bg-zinc-700 text-zinc-700',
          )} />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
            {comfyConnected ? 'ComfyUI Ready' : 'ComfyUI Offline'}
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(360px,400px)_minmax(320px,1fr)]">
        {modeIsMounted('extras') ? (
          <div className={activeMode === 'extras' ? 'contents' : 'hidden'} aria-hidden={activeMode !== 'extras'}>
            <UmbraExtrasWorkspace
              upscaleModels={modelCatalog.upscaleModels}
              modelName={outputUpscale.modelName}
              maxDimension={outputUpscale.maxDimension}
              onModelNameChange={(modelName) => setOutputUpscale((current) => ({ ...current, modelName }))}
              onMaxDimensionChange={(maxDimension) => setOutputUpscale((current) => ({ ...current, maxDimension }))}
              comfyConnected={comfyConnected}
              queueSummary={queueSummary}
              onOpenPowerPrompter={() => setActiveWorkspace('powerprompter')}
            />
          </div>
        ) : null}
        {modeIsMounted('inpaint') ? (
          <div className={inpaintWorkspaceActive ? 'contents' : 'hidden'} aria-hidden={!inpaintWorkspaceActive}>
            <UmbraInpaintWorkspace
            capabilities={inpaintCapabilities}
            inpaintAdapter={inpaintPipelineMatch.pipeline?.inpaintAdapter || 'native_edit'}
            modelFamily={modelFamily}
            modelFamilyOptions={inpaintModelFamilies}
            onModelFamilyChange={setModelFamily}
            modelSource={modelType}
            modelSourceOptions={inpaintModelTypeOptions}
            onModelSourceChange={handleModelTypeChange}
            modelLabel={primaryModelLabel}
            pipelineError={inpaintPipelineMatch.error}
            regionalGuidanceAvailable={inpaintCanvasCapabilities.regionalGuidance.support !== 'unsupported'}
            regionalGuidanceReason={inpaintCanvasCapabilities.regionalGuidance.reason}
            regionalGuidanceMaxLayers={inpaintCanvasCapabilities.regionalGuidance.maxLayers}
            regionalPositivePromptAvailable={inpaintCanvasCapabilities.regionalGuidance.positivePrompt}
            regionalNegativePromptAvailable={inpaintCanvasCapabilities.regionalGuidance.negativePrompt}
            regionalAutoNegativeAvailable={inpaintCanvasCapabilities.regionalGuidance.autoNegative}
            controlLayersAvailable={inpaintControlLayersAvailable}
            controlLayersReason={inpaintControlLayersReason}
            controlLayersMaxLayers={inpaintCanvasCapabilities.controlLayers.maxLayers}
            controlAdapterTypes={inpaintControlAdapterTypes}
            controlModes={inpaintCanvasCapabilities.controlLayers.modes}
            controlModels={modelCatalog.controlnets}
            animaLlliteModels={modelCatalog.animaLlliteModels}
            modelPatchModels={modelCatalog.modelPatches}
            controlPreprocessors={modelCatalog.controlPreprocessors}
            referenceLayersAvailable={inpaintReferenceLayersAvailable}
            referenceLayersReason={inpaintReferenceLayersReason}
            referenceLayersMaxLayers={inpaintCanvasCapabilities.referenceLayers.maxLayers}
            referenceMethods={inpaintReferenceAvailability.methods}
            styleModels={modelCatalog.styleModels}
            ipAdapterModels={compatibleIpAdapterModels}
            visionModels={modelCatalog.clipVision}
            seamlessAvailable={inpaintCanvasCapabilities.seamless.support !== 'unsupported'
              && inpaintCanvasCapabilities.seamless.axes.length > 0}
            seamlessReason={inpaintCanvasCapabilities.seamless.reason}
            seamlessAxes={inpaintCanvasCapabilities.seamless.axes}
            checkpointName={checkpointName}
            checkpointAvailableCount={inpaintPrimaryModelItems.length}
            checkpointLoading={modelCatalog.loading}
            checkpointError={modelCatalog.error}
            onOpenCheckpointPicker={openPrimaryModelPicker}
            onRefreshModelCatalog={refreshModelCatalog}
            loras={activeLoras}
            onLorasChange={replaceActiveLoras}
            loraAvailableCount={loraCatalog.length}
            onOpenLoraPicker={openLoraPicker}
            onAddPromptToken={addPromptToken}
            clipSkip={clipSkip}
            onClipSkipChange={setClipSkip}
            prompt={prompt}
            promptSegments={promptSegments}
            activePromptSegmentId={activePromptSegmentId}
            onPromptSegmentsChange={setPromptSegments}
            onActivePromptSegmentChange={setActivePromptSegmentId}
            negativePrompt={negativePrompt}
            onNegativePromptChange={setNegativePrompt}
            seed={seed}
            onSeedChange={setSeed}
            steps={steps}
            onStepsChange={setSteps}
            cfg={cfg}
            onCfgChange={setCfg}
            samplerName={samplerName}
            onSamplerNameChange={setSamplerName}
            scheduler={scheduler}
            onSchedulerChange={setScheduler}
            samplerOptions={samplerOptions}
            schedulerOptions={schedulerOptions}
            samModels={modelCatalog.samModels}
            upscaleModels={modelCatalog.upscaleModels}
            img2imgDetailerActiveCount={detailerPipeline.filter((stage) => stage.enabled).length}
            img2imgDetailerStageCount={detailerPipeline.length}
            onImg2imgDetailersEnabledChange={(enabled) => {
              setDetailerPipeline((current) => current.map((stage) => ({ ...stage, enabled })));
            }}
            comfyConnected={comfyConnected}
              showToast={showToast}
            />
          </div>
        ) : null}
        {modeIsMounted('image') || modeIsMounted('img2img') ? (
          <div
            className={activeMode === 'image' || activeMode === 'img2img' ? 'contents' : 'hidden'}
            aria-hidden={activeMode !== 'image' && activeMode !== 'img2img'}
          >
          <section className="min-h-0 overflow-y-auto border-r border-white/10 bg-black/15 p-4 custom-scrollbar">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles size={14} className="text-cyan-300" />
            <h2 className="text-xs font-black uppercase tracking-[0.14em] text-zinc-200">Generation</h2>
          </div>

          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className={labelClass}>Model Pipeline</span>
              <select
                value={modelFamily}
                onChange={(event) => setModelFamily(event.target.value)}
                className={inputClass}
              >
                {activeImageModelFamilies.length <= 0 ? <option value="">No compatible image pipeline</option> : null}
                {activeImageModelFamilies.map((family) => <option key={family} value={family}>{family}</option>)}
              </select>
            </label>

            {imagePipelineMatch.error || imagePipelineRuntimeIssue ? (
              <div className="font-mono text-[9px] leading-relaxed text-red-300/80">
                {imagePipelineMatch.error || imagePipelineRuntimeIssue}
              </div>
            ) : null}

            {activeMode === 'img2img' ? (
              <UmbraImg2ImgSourceControls
                source={img2imgSource}
                denoise={img2imgDenoise}
                replaceSourceOnComplete={replaceImg2ImgSourceOnComplete}
                onSourceChange={setImg2imgSource}
                onDenoiseChange={setImg2imgDenoise}
                onReplaceSourceOnCompleteChange={setReplaceImg2ImgSourceOnComplete}
                onUseSourceSize={(sourceWidth, sourceHeight) => {
                  if (sourceWidth <= 0 || sourceHeight <= 0) return;
                  setWidth(String(Math.max(64, Math.round(sourceWidth / 8) * 8)));
                  setHeight(String(Math.max(64, Math.round(sourceHeight / 8) * 8)));
                }}
                showToast={showToast}
              />
            ) : null}

            <UmbraCheckpointControls
              checkpointName={checkpointName}
              availableCount={primaryModelItems.length}
              loading={modelCatalog.loading}
              clipSkip={clipSkip}
              onClipSkipChange={setClipSkip}
              onChoose={openPrimaryModelPicker}
              onRefresh={refreshModelCatalog}
              error={modelCatalog.error}
              heading="Primary Model"
              modelLabel={primaryModelLabel}
              emptyLabel={`Choose ${primaryModelLabel.toLowerCase()}`}
              modelType={modelType}
              modelTypeOptions={imageModelTypeOptions}
              onModelTypeChange={handleModelTypeChange}
              showClipSkip={imageCapabilities.clipSkip.support === 'adjustable'}
            />

            <UmbraWorkflowResourceControls
              workflowName={selectedImageWorkflow?.name || 'Selected workflow'}
              modelFamily={modelFamily}
              resources={selectedWorkflowResources}
              values={workflowResourceValues}
              getOptions={(resource) => getWorkflowResourceItems(resource, modelCatalog)}
              onChoose={openWorkflowResourcePicker}
              onChange={updateWorkflowResource}
            />

            {imageCapabilities.loras.support === 'adjustable' ? (
              <UmbraLoraStackControls
                loras={activeLoras}
                availableCount={loraCatalog.length}
                onChange={replaceActiveLoras}
                onOpenPicker={openLoraPicker}
                onAddPromptToken={addPromptToken}
              />
            ) : null}

            <UmbraPositivePromptEditor
              segments={promptSegments}
              activeSegmentId={activePromptSegmentId}
              onChange={setPromptSegments}
              onActiveSegmentChange={setActivePromptSegmentId}
              heading={imageAgentModeEnabled ? 'Prompt Request' : 'Positive Prompt'}
            />

            <UmbraInlineAgentPrompt
              mediaType="image"
              sourcePrompt={prompt}
              enabled={imageAgentModeEnabled}
              onEnabledChange={setImageAgentModeEnabled}
              agentPrompt={imageAgentPrompt}
              onAgentPromptChange={setImageAgentPrompt}
              context={{
                modelFamily,
                modelType,
                pipeline: selectedImageWorkflow?.name || '',
                checkpointName,
                width: Number(width),
                height: Number(height),
                enabledLoras: activeLoras.filter((entry) => entry.enabled).map((entry) => entry.name),
              }}
            />

            {imageCapabilities.negativePrompt.support === 'adjustable' ? (
              <label className="block space-y-1.5">
                <span className={labelClass}>Negative Prompt</span>
                <textarea
                  value={negativePrompt}
                  onChange={(event) => setNegativePrompt(event.target.value)}
                  placeholder="Negative prompt"
                  className={`${inputClass} min-h-20 resize-y leading-relaxed`}
                />
              </label>
            ) : null}

            <UmbraSeedControls
              seed={seed}
              mode={seedMode}
              onSeedChange={setSeed}
              onModeChange={setSeedMode}
              disabled={imageCapabilities.seed.support !== 'adjustable'}
              disabledReason={imageCapabilities.seed.reason}
            />

            {imageCapabilities.steps.support === 'adjustable'
              || imageCapabilities.guidance.support === 'adjustable' ? (
                <div className="grid grid-cols-2 gap-2">
                  {imageCapabilities.steps.support === 'adjustable' ? (
                    <label className="space-y-1.5">
                      <span className={labelClass}>Steps</span>
                      <input value={steps} onChange={(event) => setSteps(event.target.value)} inputMode="numeric" className={inputClass} />
                    </label>
                  ) : null}
                  {imageCapabilities.guidance.support === 'adjustable' ? (
                    <label className="space-y-1.5">
                      <span className={labelClass}>{imageCapabilities.guidance.label}</span>
                      <input value={cfg} onChange={(event) => setCfg(event.target.value)} inputMode="decimal" className={inputClass} />
                    </label>
                  ) : null}
                </div>
              ) : null}

            {imageCapabilities.resolution.support === 'adjustable' ? (
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1.5">
                  <span className={labelClass}>Width</span>
                  <input value={width} onChange={(event) => setWidth(event.target.value)} inputMode="numeric" className={inputClass} />
                </label>
                <label className="space-y-1.5">
                  <span className={labelClass}>Height</span>
                  <input value={height} onChange={(event) => setHeight(event.target.value)} inputMode="numeric" className={inputClass} />
                </label>
              </div>
            ) : null}

            {imageCapabilities.sampler.support === 'adjustable' || imageCapabilities.scheduler.support === 'adjustable' ? (
              <div className={imageCapabilities.sampler.support === 'adjustable' && imageCapabilities.scheduler.support === 'adjustable'
                ? 'grid grid-cols-2 gap-2'
                : 'grid grid-cols-1 gap-2'}>
                {imageCapabilities.sampler.support === 'adjustable' ? (
                  <label className="space-y-1.5">
                    <span className={labelClass}>Sampler</span>
                    <select value={samplerName} onChange={(event) => setSamplerName(event.target.value)} className={inputClass}>
                      {samplerOptions.map((sampler) => <option key={sampler} value={sampler}>{sampler}</option>)}
                    </select>
                  </label>
                ) : null}
                {imageCapabilities.scheduler.support === 'adjustable' ? (
                  <label className="space-y-1.5">
                    <span className={labelClass}>Scheduler</span>
                    <select value={scheduler} onChange={(event) => setScheduler(event.target.value)} className={inputClass}>
                      {schedulerOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {imageCapabilities.hiresFix.support === 'adjustable' ? (
              <UmbraHiresFixControls
              enabled={hiresEnabled}
              onEnabledChange={setHiresEnabled}
              upscaler={hiresUpscaler}
              onUpscalerChange={setHiresUpscaler}
              upscaleModels={modelCatalog.upscaleModels}
              resizeMode={hiresResizeMode}
              onResizeModeChange={setHiresResizeMode}
              scaleBy={hiresScaleBy}
              onScaleByChange={setHiresScaleBy}
              targetWidth={hiresTargetWidth}
              onTargetWidthChange={setHiresTargetWidth}
              targetHeight={hiresTargetHeight}
              onTargetHeightChange={setHiresTargetHeight}
              baseWidth={Number(width)}
              baseHeight={Number(height)}
              steps={hiresSteps}
              onStepsChange={setHiresSteps}
              denoise={hiresDenoise}
              onDenoiseChange={setHiresDenoise}
              cfg={hiresCfg}
              onCfgChange={setHiresCfg}
              samplerName={hiresSamplerName}
              onSamplerNameChange={setHiresSamplerName}
              scheduler={hiresScheduler}
              onSchedulerChange={setHiresScheduler}
              samplerOptions={samplerOptions}
              schedulerOptions={schedulerOptions}
              resizeModes={imageCapabilities.hiresFix.resizeModes}
              showUpscaler={imageCapabilities.hiresFix.controls.upscaler}
              showSteps={imageCapabilities.hiresFix.controls.steps}
              showDenoise={imageCapabilities.hiresFix.controls.denoise}
              showCfg={imageCapabilities.hiresFix.controls.cfg}
              showSampler={imageCapabilities.hiresFix.controls.sampler}
              showScheduler={imageCapabilities.hiresFix.controls.scheduler}
              />
            ) : null}

            {imageCapabilities.detailerStages.support === 'adjustable'
              || imageCapabilities.finalModelUpscale.support === 'adjustable' ? (
              <UmbraDetailerPipelineControls
              stages={detailerPipeline}
              onStagesChange={setDetailerPipeline}
              detectorModels={modelCatalog.detectorModels}
              samModels={modelCatalog.samModels}
              samplerOptions={samplerOptions}
              schedulerOptions={schedulerOptions}
              upscaleModels={modelCatalog.upscaleModels}
              outputUpscale={outputUpscale}
              onOutputUpscaleChange={setOutputUpscale}
              showDetailer={imageCapabilities.detailerStages.support === 'adjustable'}
              showOutputUpscale={imageCapabilities.finalModelUpscale.support === 'adjustable'}
              allowCustomStages={imageCapabilities.detailerStages.customStages}
              showStageControls={imageCapabilities.detailerStages.customStages}
              showOutputModelSelection={imageCapabilities.finalModelUpscale.modelSelection}
              showOutputMaxDimension={imageCapabilities.finalModelUpscale.maxDimension}
              />
            ) : null}
          </div>

          <PipelineControls
            queueSummary={queueSummary}
            onQueueImage={(placement) => void handleQueueImage(placement)}
            onOpenPowerPrompter={() => setActiveWorkspace('powerprompter')}
            isQueueing={isQueueing}
            queueLabel={activeMode === 'img2img' ? 'Generate IMG2IMG' : 'Generate Image'}
            queueDisabled={isQueueing
              || !queueConnected
              || !comfyConnected
              || !selectedImageWorkflow
              || !checkpointName
              || !!missingWorkflowResource
              || !!imagePipelineRuntimeIssue
              || (activeMode === 'img2img' && !img2imgSource.path && !img2imgSource.name)
              || !workflowImagePrompt.trim()}
            queueTitle={!queueConnected
              ? 'Connecting to the shared queue'
              : (activeMode === 'image' || activeMode === 'img2img') && imageAgentModeEnabled && !imageAgentPrompt.trim()
                ? 'Compose or enter an agent prompt first'
                : activeMode === 'img2img' && !img2imgSource.path && !img2imgSource.name
                  ? 'Choose a source image for IMG2IMG'
                : imagePipelineRuntimeIssue
                  ? imagePipelineRuntimeIssue
                : missingWorkflowResource
                ? `Select ${missingWorkflowResource.label}`
                : imagePipelineMatch.error || (activeMode === 'img2img'
                  ? 'Queue this source through the locked Umbra UI IMG2IMG pipeline'
                  : 'Queue this image through the locked Umbra UI pipeline')}
          />
        </section>
        <main className="flex min-h-0 min-w-0 flex-col">
          <div className="flex min-h-11 items-center gap-2 border-b border-white/10 px-3">
            {activeMode === 'image' || activeMode === 'img2img'
              ? <ImageIcon size={13} className="text-zinc-500" />
              : <Clapperboard size={13} className="text-fuchsia-300/70" />}
            <span className="text-[11px] font-black uppercase tracking-[0.14em] text-zinc-300">
              {activeMode === 'img2img' ? 'IMG2IMG Preview' : activeMode === 'image' ? 'Preview' : 'Video Queue'}
            </span>
            <span className="ml-auto font-mono text-[10px] text-zinc-500">{queueSummary.completed} outputs</span>
          </div>
          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-black/35 p-4">
            <div className="relative flex h-full min-h-0 w-full items-center justify-center border border-white/10 bg-black/25">
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt={showingLivePreview ? 'Current generation preview' : 'Latest Umbra UI output'}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="text-center text-zinc-700">
                  <ImageIcon size={28} className="mx-auto mb-2" />
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]">Waiting for output</div>
                </div>
              )}
              {showingLivePreview && generationPreview && generationPreview.maxStep > 0 ? (
                <div className="absolute inset-x-3 bottom-3 border border-white/10 bg-black/80 px-2.5 py-2 backdrop-blur-sm">
                  <div className="mb-1 flex items-center justify-between font-mono text-[9px] text-zinc-300">
                    <span>Sampling</span>
                    <span>{generationPreview.step}/{generationPreview.maxStep}</span>
                  </div>
                  <div className="h-1 overflow-hidden bg-white/10">
                    <div className="h-full bg-cyan-300 transition-[width] duration-150" style={{ width: `${previewProgress * 100}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex min-h-11 items-center gap-2 border-t border-white/10 bg-black/20 px-3">
            <Activity size={12} className={queueSummary.running > 0 ? 'text-cyan-300' : 'text-zinc-600'} />
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-400">
              {queueSummary.paused
                ? 'Queue paused'
                : queueSummary.running > 0
                  ? `Generating ${queueSummary.activePosition}/${queueSummary.activeTotal}`
                  : queueSummary.pending > 0
                    ? `${queueSummary.pending} queued`
                    : 'Idle'}
            </span>
            {queueSummary.activePrompt ? (
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-500">{queueSummary.activePrompt}</span>
            ) : null}
            {activeMode === 'image' || activeMode === 'img2img' ? (
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <button
                  type="button"
                  onClick={sendLatestToImg2Img}
                  disabled={!latestSavedImage?.path}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-cyan-300/20 bg-cyan-500/[0.055] px-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-cyan-100 transition-colors hover:bg-cyan-500/[0.1] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
                  title="Use the latest completed image as an IMG2IMG source"
                >
                  <Images size={12} /> IMG2IMG
                </button>
                <button
                  type="button"
                  onClick={sendLatestToInpaint}
                  disabled={!latestSavedImage?.path}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-rose-300/20 bg-rose-500/[0.055] px-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-rose-100 transition-colors hover:bg-rose-500/[0.1] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
                  title="Open the latest completed image in the non-destructive inpaint editor"
                >
                  <Paintbrush size={12} /> Inpaint
                </button>
                <button
                  type="button"
                  onClick={() => sendLatestToUpscale(false)}
                  disabled={!latestSavedImage?.path}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-white/10 bg-white/[0.025] px-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 transition-colors hover:border-amber-300/25 hover:text-amber-100 disabled:cursor-not-allowed disabled:opacity-30"
                  title="Add the latest completed image to the Extras upscale batch"
                >
                  <Layers3 size={12} /> Add to Batch
                </button>
                <button
                  type="button"
                  onClick={() => sendLatestToUpscale(true)}
                  disabled={!latestSavedImage?.path || !comfyConnected}
                  className="inline-flex h-8 items-center gap-1.5 rounded-sm border border-amber-300/25 bg-amber-500/[0.08] px-2.5 text-[10px] font-black uppercase tracking-[0.1em] text-amber-100 transition-colors hover:bg-amber-500/[0.14] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-600"
                  title="Upscale the latest completed image now"
                >
                  <ImageUp size={12} /> Upscale Now
                </button>
              </div>
            ) : null}
          </div>
          </main>
          </div>
        ) : null}
        {modeIsMounted('video') ? (
          <div className={activeMode === 'video' ? 'contents' : 'hidden'} aria-hidden={activeMode !== 'video'}>
            <UmbraVideoGenerationControls
              workflows={workflows}
              catalog={videoModelCatalog}
              queueSummary={queueSummary}
              queueConnected={queueConnected}
              comfyConnected={comfyConnected}
              onRefreshCatalog={refreshModelCatalog}
              onOpenPowerPrompter={() => setActiveWorkspace('powerprompter')}
              queueVideo={queueVideo}
              agentDraft={pendingVideoAgentDraft}
              onAgentDraftApplied={(draftId) => setPendingVideoAgentDraft((current) => current?.id === draftId ? null : current)}
              onAgentContextChange={setVideoAgentContext}
              editorDraft={videoEditorDraft}
              onEditorDraftApplied={(draftId) => setVideoEditorDraft((current) => current?.id === draftId ? null : current)}
            />
            <UmbraVideoQueuePanel
              jobs={videoJobs}
              loading={videoJobsLoading}
              error={videoJobsError}
              queueVideo={queueVideo}
              onLoadIntoEditor={setVideoEditorDraft}
              onRefresh={refreshVideoJobs}
            />
          </div>
        ) : null}

      </div>

      <UmbraModelPickerModal
        open={modelPickerOpen}
        kind={modelPickerKind || 'checkpoint'}
        items={activePickerItems}
        selectedValue={activePickerSelection}
        catalogLoading={modelPickerKind === 'lora' ? loraCatalogLoading : modelCatalog.loading}
        onClose={closeModelPicker}
        onRefresh={modelPickerKind === 'lora' ? refreshLoraCatalog : refreshModelCatalog}
        onRequestInfo={activeResourcePicker
          ? undefined
          : modelPickerKind === 'lora'
            ? requestLoraInfo
            : modelType === 'checkpoint'
              ? requestModelInfo
              : undefined}
        onConfirm={(name, info) => void handleModelPickerConfirm(name, info)}
        titleOverride={activePickerTitle}
        searchPlaceholder={activePickerSearchPlaceholder}
        confirmLabel={activePickerConfirmLabel}
      />
      <UmbraAgentPromptPanel
        open={agentPanelOpen}
        onClose={() => setAgentPanelOpen(false)}
        onApplyDraft={applyAgentDraft}
        onPendingCountChange={setAgentDraftCount}
      />
    </div>
  );
}

export default UmbraUIWorkspace;
