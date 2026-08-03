'use client';

import { UmbraSelectControl } from '@/components/ui/UmbraSelectControl';
import React from 'react';
import {
  ArrowDown,
  ArrowUp,
  BoxSelect,
  Brush,
  Copy,
  Crop,
  Download,
  Eye,
  EyeOff,
  Eraser,
  FolderOpen,
  FlipHorizontal2,
  FlipVertical2,
  Focus,
  Hand,
  History,
  ImagePlus,
  Layers3,
  LassoSelect,
  Lock,
  Pin,
  LoaderCircle,
  MousePointer2,
  PanelLeftOpen,
  PanelRightOpen,
  PenTool,
  Pipette,
  Redo2,
  RotateCcw,
  RotateCw,
  Save,
  ScanLine,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Spline,
  Square,
  Circle,
  Combine,
  Type,
  Blend,
  Trash2,
  Undo2,
  Unlock,
  Upload,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useStore } from '@/store/useStore';
import { UmbraSelect } from '@/components/ui/UmbraSelect';
import { UmbraCheckpointControls, type UmbraPrimaryModelTypeOption } from '@/components/umbra-ui/UmbraCheckpointControls';
import { UmbraLoraStackControls } from '@/components/umbra-ui/UmbraLoraStackControls';
import { UmbraHiresFixControls } from '@/components/umbra-ui/UmbraHiresFixControls';
import { UmbraDetailerPipelineControls } from '@/components/umbra-ui/UmbraDetailerPipelineControls';
import { UmbraPositivePromptEditor } from '@/components/umbra-ui/UmbraPositivePromptEditor';
import { UmbraSeedControls } from '@/components/umbra-ui/UmbraSeedControls';
import { UmbraTiledVaeControls } from '@/components/umbra-ui/UmbraTiledVaeControls';
import { compileUmbraUiPromptSegments, type UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';
import { composeUmbraUiPromptWithLoras, type UmbraUiLoraEntry } from '@/lib/umbraUiModels';
import { stageUmbraUiMediaHandoff, type UmbraUiMediaHandoff, type UmbraUiMediaHandoffMode } from '@/lib/umbraUiMediaHandoff';
import { stageUmbraUiUpscaleHandoff } from '@/lib/umbraUiUpscale';
import { advanceUmbraUiSeed, resolveUmbraUiQueueSeed } from '@/lib/umbraUiSeed';
import {
  buildUmbraUiInpaintOutputPath,
  buildUmbraUiInpaintOutputUrl,
  cancelUmbraUiInpaintJob,
  fetchUmbraUiInpaintJob,
  isUmbraUiInpaintJobTerminal,
  submitUmbraUiInpaintJob,
  type UmbraUiInpaintJob,
  type UmbraUiInpaintPreviewEvent,
} from '@/lib/umbraUiInpaint';
import type {
  PowerPrompterDetailerStage,
  PowerPrompterHiresFixControls,
  PowerPrompterModelType,
  PowerPrompterOutputUpscaleControls,
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
  PowerPrompterTiledVaeControls,
} from '@/types/powerPrompter';
import type {
  UmbraUiPipelineCapabilities,
  UmbraUiInpaintAdapter,
  UmbraUiInpaintCanvasCapabilities,
  UmbraUiInpaintControlAdapterType,
  UmbraUiInpaintControlMode,
  UmbraUiInpaintReferenceMethod,
} from '../../../../shared/umbra-ui/pipelineTypes';
import {
  createUmbraCanvasWorkspaceRestorePoint,
  deleteUmbraCanvasWorkspaceProject,
  deleteUmbraCanvasWorkspaceRestorePoint,
  forkUmbraCanvasWorkspaceProject,
  listUmbraCanvasWorkspaceProjects,
  listUmbraCanvasWorkspaceRestorePoints,
  loadUmbraCanvasWorkspaceProject,
  restoreUmbraCanvasWorkspaceRestorePoint,
  saveUmbraCanvasWorkspaceProject,
  type UmbraCanvasWorkspaceProjectSummary,
  type UmbraCanvasWorkspaceRestorePointSummary,
} from '@/lib/umbraUiCanvasWorkspaceProjects';
import {
  downloadUmbraCanvasWorkspaceArchive,
  exportUmbraCanvasWorkspaceArchive,
  importUmbraCanvasWorkspaceArchive,
} from '@/lib/umbraUiCanvasWorkspaceArchive';
import {
  createUmbraCanvasMaskEntity,
  createUmbraCanvasRasterEntity,
  createUmbraCanvasShapeEntity,
  createUmbraCanvasTextEntity,
  createUmbraCanvasGradientEntity,
  createUmbraCanvasPathEntity,
  createUmbraCanvasRegionalGuidanceEntity,
  createUmbraCanvasControlEntity,
  createUmbraCanvasReferenceEntity,
  isUmbraCanvasDrawableEntity,
  isUmbraCanvasSpatialEntity,
  isUmbraCanvasRegionalGuidanceEntity,
  isUmbraCanvasControlEntity,
  isUmbraCanvasReferenceEntity,
  getUmbraCanvasSpatialBounds,
  buildUmbraCanvasSnapshotSignature,
  UMBRA_CANVAS_BLEND_MODES,
  UMBRA_CANVAS_DEFAULT_RASTER_ADJUSTMENTS,
  type UmbraCanvasGenerationSettingsSnapshot,
  type UmbraCanvasStagedGeneration,
} from './canvasModel';
import { composeUmbraCanvasAcceptedReplacementBlob, composeUmbraCanvasDrawableRegionBlob, composeUmbraCanvasGenerationRegion, composeUmbraCanvasMaskBlob, composeUmbraCanvasProjectThumbnail, composeUmbraCanvasRasterBlob, composeUmbraCanvasRasterCropBlob, type UmbraCanvasCompositeResult } from './canvasCompositor';
import { releaseUmbraCanvasImageResource, UmbraCanvasManager, type UmbraCanvasTool } from './UmbraCanvasManager';
import { useUmbraCanvasStore } from './useUmbraCanvasStore';

interface UmbraCanvasWorkspaceProps {
  active: boolean;
  capabilities: UmbraUiPipelineCapabilities;
  canvasCapabilities: UmbraUiInpaintCanvasCapabilities;
  controlLayersAvailable: boolean;
  controlLayersReason: string;
  controlAdapterTypes: UmbraUiInpaintControlAdapterType[];
  controlModes: UmbraUiInpaintControlMode[];
  controlModels: string[];
  animaLlliteModels: string[];
  modelPatchModels: string[];
  referenceLayersAvailable: boolean;
  referenceLayersReason: string;
  referenceMethods: UmbraUiInpaintReferenceMethod[];
  styleModels: string[];
  ipAdapterModels: string[];
  visionModels: string[];
  inpaintAdapter: UmbraUiInpaintAdapter;
  modelFamily: string;
  modelFamilyOptions: string[];
  onModelFamilyChange: (value: string) => void;
  modelSource: PowerPrompterModelType;
  modelSourceOptions: UmbraPrimaryModelTypeOption[];
  onModelSourceChange: (value: PowerPrompterModelType) => void;
  modelLabel: string;
  pipelineError: string;
  checkpointName: string;
  checkpointAvailableCount: number;
  checkpointLoading: boolean;
  checkpointError: string;
  onOpenCheckpointPicker: () => void;
  onRefreshModelCatalog: () => void;
  loras: UmbraUiLoraEntry[];
  onLorasChange: (loras: UmbraUiLoraEntry[]) => void;
  workflowResources: Record<string, string>;
  loraAvailableCount: number;
  onOpenLoraPicker: () => void;
  clipSkip: string;
  onClipSkipChange: (value: string) => void;
  promptSegments: UmbraUiPromptSegment[];
  activePromptSegmentId: string;
  onPromptSegmentsChange: (segments: UmbraUiPromptSegment[]) => void;
  onActivePromptSegmentChange: (segmentId: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  seed: string;
  seedMode: PowerPrompterSeedControlMode;
  seedIncrement: PowerPrompterSeedIncrement;
  onSeedChange: (value: string) => void;
  onSeedModeChange: (value: PowerPrompterSeedControlMode) => void;
  onSeedIncrementChange: (value: PowerPrompterSeedIncrement) => void;
  steps: string;
  onStepsChange: (value: string) => void;
  cfg: string;
  onCfgChange: (value: string) => void;
  samplerName: string;
  onSamplerNameChange: (value: string) => void;
  scheduler: string;
  onSchedulerChange: (value: string) => void;
  samplerOptions: string[];
  schedulerOptions: string[];
  tiledVae: PowerPrompterTiledVaeControls;
  onTiledVaeChange: (value: PowerPrompterTiledVaeControls) => void;
  hiresFix: PowerPrompterHiresFixControls;
  onHiresFixChange: (value: PowerPrompterHiresFixControls) => void;
  upscaleModels: string[];
  detailerPipeline: PowerPrompterDetailerStage[];
  onDetailerPipelineChange: (stages: PowerPrompterDetailerStage[]) => void;
  detectorModels: string[];
  samModels: string[];
  outputUpscale: PowerPrompterOutputUpscaleControls;
  onOutputUpscaleChange: (value: PowerPrompterOutputUpscaleControls) => void;
  pinnedOutputFolders: string[];
  comfyConnected: boolean;
  mediaHandoff: UmbraUiMediaHandoff | null;
  onMediaHandoffConsumed: () => void;
  onRestoreGenerationSettings: (settings: UmbraCanvasGenerationSettingsSnapshot) => void;
}

interface UmbraCanvasPreparedRegion extends UmbraCanvasCompositeResult {
  projectRevision: number;
  snapshotSignature: string;
  bbox: { x: number; y: number; width: number; height: number };
}

const UMBRA_CANVAS_LAST_PROJECT_KEY = 'umbra-canvas-last-project-id';
const UMBRA_CANVAS_BLANK_PROJECT = '__blank__';
const UMBRA_GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';
// Preserve the experimental editor code without exposing it in the focused Canvas workflow.
const UMBRA_CANVAS_VECTOR_TOOLS_ENABLED = false;
const UMBRA_CANVAS_COLOR_PICKER_ENABLED = false;
const UMBRA_CANVAS_RASTER_PAINT_ENABLED = false;
const UMBRA_CANVAS_GENERATION_RATIO_OPTIONS = [
  { value: '1:1', label: '1:1 Square' },
  { value: '3:4', label: '3:4 Portrait' },
  { value: '4:3', label: '4:3 Landscape' },
  { value: '9:16', label: '9:16 Portrait' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '21:9', label: '21:9 Ultrawide' },
] as const;

type CanvasInpaintTaskModeId = 'touch_up' | 'recolor' | 'replace';
type CanvasInpaintBlendModeId = 'tight' | 'balanced' | 'soft';

const CANVAS_INPAINT_TASK_MODES = [
  { id: 'touch_up', label: 'Touch Up', denoise: 0.35, contextPadding: 32, maskGrow: 4, colorMatch: 0.65, differentialStrength: 0.4 },
  { id: 'recolor', label: 'Recolor', denoise: 0.55, contextPadding: 64, maskGrow: 8, colorMatch: 0, differentialStrength: 0.65 },
  { id: 'replace', label: 'Replace', denoise: 0.92, contextPadding: 128, maskGrow: 12, colorMatch: 0.15, differentialStrength: 1 },
] as const;

const CANVAS_INPAINT_BLEND_MODES = [
  { id: 'tight', label: 'Tight', maskFeather: 6, preservation: 0.2, contrast: 2.75, maskInfluence: 0 },
  { id: 'balanced', label: 'Balanced', maskFeather: 12, preservation: 0.35, contrast: 1.75, maskInfluence: 0 },
  { id: 'soft', label: 'Soft', maskFeather: 24, preservation: 0.55, contrast: 1.15, maskInfluence: 0.15 },
] as const;

function ToolButton({
  active,
  title,
  icon,
  shortcut,
  onClick,
}: {
  active: boolean;
  title: string;
  icon: React.ReactNode;
  shortcut?: string;
  onClick: () => void;
}) {
  const accessibleTitle = shortcut ? `${title} (${shortcut})` : title;
  return (
    <button
      type="button"
      title={accessibleTitle}
      aria-label={accessibleTitle}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'relative inline-flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
        active
          ? 'border-cyan-300/35 bg-cyan-500/[0.12] text-cyan-100'
          : 'border-white/10 bg-black/35 text-zinc-500 hover:border-white/20 hover:text-zinc-200',
      )}
    >
      {icon}
      {shortcut ? <kbd aria-hidden="true" className="absolute bottom-0.5 right-0.5 min-w-3 rounded-sm bg-black/80 px-0.5 text-center font-mono text-[6px] font-black leading-3 tracking-normal text-zinc-400">{shortcut}</kbd> : null}
    </button>
  );
}

export function UmbraCanvasWorkspace({
  active,
  capabilities,
  canvasCapabilities,
  controlLayersAvailable,
  controlLayersReason,
  controlAdapterTypes,
  controlModes,
  controlModels,
  animaLlliteModels,
  modelPatchModels,
  referenceLayersAvailable,
  referenceLayersReason,
  referenceMethods,
  styleModels,
  ipAdapterModels,
  visionModels,
  inpaintAdapter,
  modelFamily,
  modelFamilyOptions,
  onModelFamilyChange,
  modelSource,
  modelSourceOptions,
  onModelSourceChange,
  modelLabel,
  pipelineError,
  checkpointName,
  checkpointAvailableCount,
  checkpointLoading,
  checkpointError,
  onOpenCheckpointPicker,
  onRefreshModelCatalog,
  loras,
  onLorasChange,
  workflowResources,
  loraAvailableCount,
  onOpenLoraPicker,
  clipSkip,
  onClipSkipChange,
  promptSegments,
  activePromptSegmentId,
  onPromptSegmentsChange,
  onActivePromptSegmentChange,
  negativePrompt,
  onNegativePromptChange,
  seed,
  seedMode,
  seedIncrement,
  onSeedChange,
  onSeedModeChange,
  onSeedIncrementChange,
  steps,
  onStepsChange,
  cfg,
  onCfgChange,
  samplerName,
  onSamplerNameChange,
  scheduler,
  onSchedulerChange,
  samplerOptions,
  schedulerOptions,
  tiledVae,
  onTiledVaeChange,
  hiresFix,
  onHiresFixChange,
  upscaleModels,
  detailerPipeline,
  onDetailerPipelineChange,
  detectorModels,
  samModels,
  outputUpscale,
  onOutputUpscaleChange,
  pinnedOutputFolders,
  comfyConnected,
  mediaHandoff,
  onMediaHandoffConsumed,
  onRestoreGenerationSettings,
}: UmbraCanvasWorkspaceProps) {
  const showToast = useStore((state) => state.showToast);
  const project = useUmbraCanvasStore((state) => state.present);
  const canUndo = useUmbraCanvasStore((state) => state.past.length > 0);
  const canRedo = useUmbraCanvasStore((state) => state.future.length > 0);
  const addRaster = useUmbraCanvasStore((state) => state.addRaster);
  const addDrawable = useUmbraCanvasStore((state) => state.addDrawable);
  const mergeVisibleDrawables = useUmbraCanvasStore((state) => state.mergeVisibleDrawables);
  const addRasterStroke = useUmbraCanvasStore((state) => state.addRasterStroke);
  const clearRasterStrokes = useUmbraCanvasStore((state) => state.clearRasterStrokes);
  const addMask = useUmbraCanvasStore((state) => state.addMask);
  const addRegionalGuidance = useUmbraCanvasStore((state) => state.addRegionalGuidance);
  const addControl = useUmbraCanvasStore((state) => state.addControl);
  const addReference = useUmbraCanvasStore((state) => state.addReference);
  const addMaskStroke = useUmbraCanvasStore((state) => state.addMaskStroke);
  const clearMask = useUmbraCanvasStore((state) => state.clearMask);
  const updateMask = useUmbraCanvasStore((state) => state.updateMask);
  const updateRegionalGuidance = useUmbraCanvasStore((state) => state.updateRegionalGuidance);
  const updateControl = useUmbraCanvasStore((state) => state.updateControl);
  const updateReference = useUmbraCanvasStore((state) => state.updateReference);
  const duplicateEntities = useUmbraCanvasStore((state) => state.duplicateEntities);
  const replaceProject = useUmbraCanvasStore((state) => state.replaceProject);
  const syncPersistedProject = useUmbraCanvasStore((state) => state.syncPersistedProject);
  const selectEntity = useUmbraCanvasStore((state) => state.selectEntity);
  const updateRaster = useUmbraCanvasStore((state) => state.updateRaster);
  const replaceRasterSource = useUmbraCanvasStore((state) => state.replaceRasterSource);
  const updateDrawable = useUmbraCanvasStore((state) => state.updateDrawable);
  const updateDrawableTransform = useUmbraCanvasStore((state) => state.updateDrawableTransform);
  const updateDrawableTransforms = useUmbraCanvasStore((state) => state.updateDrawableTransforms);
  const setGenerationBbox = useUmbraCanvasStore((state) => state.setGenerationBbox);
  const setViewport = useUmbraCanvasStore((state) => state.setViewport);
  const renameProject = useUmbraCanvasStore((state) => state.renameProject);
  const newProject = useUmbraCanvasStore((state) => state.newProject);
  const toggleEntityVisibility = useUmbraCanvasStore((state) => state.toggleEntityVisibility);
  const toggleEntityGeneration = useUmbraCanvasStore((state) => state.toggleEntityGeneration);
  const toggleEntityLock = useUmbraCanvasStore((state) => state.toggleEntityLock);
  const toggleEntityAlphaLock = useUmbraCanvasStore((state) => state.toggleEntityAlphaLock);
  const deleteEntities = useUmbraCanvasStore((state) => state.deleteEntities);
  const moveEntity = useUmbraCanvasStore((state) => state.moveEntity);
  const undo = useUmbraCanvasStore((state) => state.undo);
  const redo = useUmbraCanvasStore((state) => state.redo);
  const setGenerationSettings = useUmbraCanvasStore((state) => state.setGenerationSettings);
  const upsertPendingGeneration = useUmbraCanvasStore((state) => state.upsertPendingGeneration);
  const removePendingGeneration = useUmbraCanvasStore((state) => state.removePendingGeneration);
  const addStagedGenerations = useUmbraCanvasStore((state) => state.addStagedGenerations);
  const discardStagedGeneration = useUmbraCanvasStore((state) => state.discardStagedGeneration);
  const clearStagedGenerations = useUmbraCanvasStore((state) => state.clearStagedGenerations);
  const toggleStagedGenerationPin = useUmbraCanvasStore((state) => state.toggleStagedGenerationPin);
  const acceptStagedGeneration = useUmbraCanvasStore((state) => state.acceptStagedGeneration);
  const stages = useUmbraCanvasStore((state) => state.present.generation.staging);
  const [tool, setTool] = React.useState<UmbraCanvasTool>('select');
  const [maskBrushSize, setMaskBrushSize] = React.useState(64);
  const [maskBrushOpacity, setMaskBrushOpacity] = React.useState(0.72);
  const [rasterBrushSize, setRasterBrushSize] = React.useState(64);
  const [rasterBrushOpacity, setRasterBrushOpacity] = React.useState(1);
  const [rasterBrushColor, setRasterBrushColor] = React.useState('#ffffff');
  const copiedEntityIdsRef = React.useRef<string[]>([]);
  const [selectedEntityIds, setSelectedEntityIds] = React.useState<Set<string>>(() => new Set(project.activeEntityId ? [project.activeEntityId] : []));
  const selectedEntityIdsRef = React.useRef(selectedEntityIds);
  const [projectBrowserOpen, setProjectBrowserOpen] = React.useState(false);
  const [pendingMediaImport, setPendingMediaImport] = React.useState<UmbraUiMediaHandoff | null>(null);
  const [mediaImportBusy, setMediaImportBusy] = React.useState(false);
  const [compactPanel, setCompactPanel] = React.useState<'generation' | 'inpaint' | 'layers' | ''>('');
  const [layerSearch, setLayerSearch] = React.useState('');
  const [projectSummaries, setProjectSummaries] = React.useState<UmbraCanvasWorkspaceProjectSummary[]>([]);
  const [restorePoints, setRestorePoints] = React.useState<UmbraCanvasWorkspaceRestorePointSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = React.useState(false);
  const [restorePointsLoading, setRestorePointsLoading] = React.useState(false);
  const [restorePointName, setRestorePointName] = React.useState('');
  const [restorePointBusy, setRestorePointBusy] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState('');
  const [forkingProject, setForkingProject] = React.useState(false);
  const [croppingRaster, setCroppingRaster] = React.useState(false);
  const [mergingLayers, setMergingLayers] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [preparingRegion, setPreparingRegion] = React.useState(false);
  const [preparedRegion, setPreparedRegion] = React.useState<UmbraCanvasPreparedRegion | null>(null);
  const [denoise, setDenoise] = React.useState(0.65);
  const [samples, setSamples] = React.useState(1);
  const [maskGrow, setMaskGrow] = React.useState(8);
  const [maskFeather, setMaskFeather] = React.useState(12);
  const [contextPadding, setContextPadding] = React.useState(64);
  const [colorMatch, setColorMatch] = React.useState(0.5);
  const [differentialStrength, setDifferentialStrength] = React.useState(0.75);
  const [softInpaintEnabled, setSoftInpaintEnabled] = React.useState(true);
  const [softInpaintPreservation, setSoftInpaintPreservation] = React.useState(0.35);
  const [softInpaintTransitionContrast, setSoftInpaintTransitionContrast] = React.useState(1.75);
  const [softInpaintMaskInfluence, setSoftInpaintMaskInfluence] = React.useState(0);
  const [job, setJob] = React.useState<UmbraUiInpaintJob | null>(null);
  const [liveSamplingPreview, setLiveSamplingPreview] = React.useState<UmbraUiInpaintPreviewEvent | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [canceling, setCanceling] = React.useState(false);
  const [previewStageId, setPreviewStageId] = React.useState('');
  const [stagingReveal, setStagingReveal] = React.useState(1);
  const [selectedStageIds, setSelectedStageIds] = React.useState<Set<string>>(() => new Set());
  const [stagingSaveDestination, setStagingSaveDestination] = React.useState('');
  const [savingStagedResults, setSavingStagedResults] = React.useState(false);
  const [conflictStageId, setConflictStageId] = React.useState('');
  const [lastSavedRevision, setLastSavedRevision] = React.useState(-1);
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const managerRef = React.useRef<UmbraCanvasManager | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const maskInputRef = React.useRef<HTMLInputElement | null>(null);
  const archiveInputRef = React.useRef<HTMLInputElement | null>(null);
  const autoSubmitPreparedRegionRef = React.useRef(false);
  const previousEntityCountRef = React.useRef(project.entities.length);
  const jobBboxesRef = React.useRef(new Map<string, {
    bbox: UmbraCanvasStagedGeneration['bbox'];
    projectRevision: number;
    snapshotSignature: string;
    acceptanceMaskUrl: string;
  }>());
  const jobRef = React.useRef(job);
  const liveSamplingPreviewsRef = React.useRef(new Map<string, UmbraUiInpaintPreviewEvent>());
  const seenStageIdsRef = React.useRef(new Set<string>());
  const consumedHandoffAtRef = React.useRef(0);
  const recoveredProjectRef = React.useRef(false);
  const projectRef = React.useRef(project);
  projectRef.current = project;
  jobRef.current = job;

  React.useEffect(() => {
    let socket: WebSocket | null = null;
    let reconnectTimer = 0;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocol}//${window.location.host}/ws/inpaint-preview`);
      socket.onmessage = (event) => {
        let message: { type?: string; data?: UmbraUiInpaintPreviewEvent } | null = null;
        try { message = JSON.parse(String(event.data)); } catch { return; }
        if (message?.type !== 'umbra_ui_inpaint_preview' || !message.data?.jobId) return;
        const preview = message.data;
        if (preview.active) liveSamplingPreviewsRef.current.set(preview.jobId, preview);
        else liveSamplingPreviewsRef.current.delete(preview.jobId);
        while (liveSamplingPreviewsRef.current.size > 8) {
          const oldest = liveSamplingPreviewsRef.current.keys().next().value;
          if (!oldest) break;
          liveSamplingPreviewsRef.current.delete(oldest);
        }
        if (jobRef.current?.id === preview.jobId) {
          setLiveSamplingPreview(preview.active ? preview : null);
        }
      };
      socket.onclose = () => {
        socket = null;
        if (!disposed) reconnectTimer = window.setTimeout(connect, 1_500);
      };
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  React.useEffect(() => {
    if (!job || isUmbraUiInpaintJobTerminal(job)) {
      setLiveSamplingPreview(null);
      return;
    }
    setLiveSamplingPreview(liveSamplingPreviewsRef.current.get(job.id) || null);
  }, [job?.id, job?.status]);

  React.useEffect(() => {
    const settings = project.generation.settings;
    if (!settings) return;
    setDenoise(Math.max(0, Math.min(1, Number(settings.denoise) || 0)));
    setSamples(Math.max(1, Math.min(16, Math.round(Number(settings.samples) || 1))));
    setMaskGrow(Math.max(0, Math.min(2048, Math.round(Number(settings.maskGrow) || 0))));
    setMaskFeather(Math.max(0, Math.min(2048, Math.round(Number(settings.maskFeather) || 0))));
    setContextPadding(Math.max(0, Math.min(2048, Math.round(Number(settings.contextPadding) || 0))));
    setColorMatch(Math.max(0, Math.min(1, Number(settings.colorMatch) || 0)));
    setDifferentialStrength(Math.max(0, Math.min(1, Number(settings.differentialStrength) || 0)));
    setSoftInpaintEnabled(settings.softInpaintEnabled !== false);
    setSoftInpaintPreservation(Math.max(0, Math.min(1, Number(settings.softInpaintPreservation) || 0)));
    setSoftInpaintTransitionContrast(Math.max(0.25, Math.min(8, Number(settings.softInpaintTransitionContrast) || 0.25)));
    setSoftInpaintMaskInfluence(Math.max(0, Math.min(1, Number(settings.softInpaintMaskInfluence) || 0)));
  }, [project.generation.settings]);

  const applyEntitySelection = React.useCallback((entityIds: Iterable<string>, primaryEntityId?: string) => {
    const available = new Set(useUmbraCanvasStore.getState().present.entities.map((entity) => entity.id));
    const next = new Set([...entityIds].filter((entityId) => available.has(entityId)));
    const primary = primaryEntityId && next.has(primaryEntityId) ? primaryEntityId : [...next].at(-1) || '';
    selectedEntityIdsRef.current = next;
    setSelectedEntityIds(next);
    managerRef.current?.setSelectedEntityIds([...next]);
    selectEntity(primary);
  }, [selectEntity]);

  const handleSelectEntity = React.useCallback((entityId: string, additive = false) => {
    if (!entityId) {
      applyEntitySelection([]);
      return;
    }
    if (!additive) {
      applyEntitySelection([entityId], entityId);
      return;
    }
    const next = new Set(selectedEntityIdsRef.current);
    if (next.has(entityId)) next.delete(entityId);
    else next.add(entityId);
    applyEntitySelection(next, next.has(entityId) ? entityId : [...next].at(-1));
  }, [applyEntitySelection]);

  const duplicateSelection = React.useCallback(() => {
    const sourceIds = [...selectedEntityIdsRef.current];
    if (sourceIds.length === 0 && projectRef.current.activeEntityId) sourceIds.push(projectRef.current.activeEntityId);
    const duplicateIds = duplicateEntities(sourceIds);
    if (duplicateIds.length > 0) applyEntitySelection(duplicateIds, duplicateIds.at(-1));
  }, [applyEntitySelection, duplicateEntities]);

  const deleteSelection = React.useCallback(() => {
    const sourceIds = [...selectedEntityIdsRef.current];
    if (sourceIds.length === 0 && projectRef.current.activeEntityId) sourceIds.push(projectRef.current.activeEntityId);
    if (sourceIds.length === 0) return;
    deleteEntities(sourceIds);
    applyEntitySelection([]);
  }, [applyEntitySelection, deleteEntities]);

  const closePreparedRegion = React.useCallback(() => {
    setPreparedRegion(null);
  }, []);

  React.useEffect(() => {
    const knownObjectUrls = new Set<string>();
    const sweep = (state: ReturnType<typeof useUmbraCanvasStore.getState>) => {
      const referenced = new Set<string>();
      const collect = (candidate: string | undefined) => {
        const value = String(candidate || '');
        if (!value.startsWith('blob:')) return;
        referenced.add(value);
        knownObjectUrls.add(value);
      };
      for (const document of [...state.past, state.present, ...state.future]) {
        for (const entity of document.entities) {
          if (entity.kind === 'raster' || entity.kind === 'mask') collect(entity.imageUrl);
        }
        for (const pending of document.generation.pending) collect(pending.acceptanceMaskUrl);
        for (const stage of document.generation.staging) {
          collect(stage.imageUrl);
          collect(stage.acceptanceMaskUrl);
        }
      }
      for (const objectUrl of [...knownObjectUrls]) {
        if (referenced.has(objectUrl)) continue;
        releaseUmbraCanvasImageResource(objectUrl);
        URL.revokeObjectURL(objectUrl);
        knownObjectUrls.delete(objectUrl);
      }
    };
    sweep(useUmbraCanvasStore.getState());
    const unsubscribe = useUmbraCanvasStore.subscribe(sweep);
    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const manager = new UmbraCanvasManager(container, {
      onSelectEntity: handleSelectEntity,
      onTransformEntities: updateDrawableTransforms,
      onGenerationBboxChange: setGenerationBbox,
      onViewportChange: setViewport,
      onMaskStroke: addMaskStroke,
      onRasterStroke: addRasterStroke,
      onCreatePath: (worldPoints, closed) => {
        addDrawable(createUmbraCanvasPathEntity(worldPoints, closed));
        setTool('select');
      },
      onPickColor: (color) => {
        setRasterBrushColor(color);
        showToast(`Picked ${color}.`, 'success');
      },
    });
    managerRef.current = manager;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) manager.resize(rect.width, rect.height);
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      manager.destroy();
      managerRef.current = null;
    };
  }, [addDrawable, addMaskStroke, addRasterStroke, handleSelectEntity, setGenerationBbox, setViewport, showToast, updateDrawableTransforms]);

  const canvasSceneKey = React.useMemo(() => JSON.stringify({
    activeEntityId: project.activeEntityId,
    bbox: project.generationBbox,
    entities: project.entities
      .filter(isUmbraCanvasSpatialEntity)
      .map((entity) => [entity.id, entity.kind, entity.revision, entity.visible, entity.locked]),
  }), [project.activeEntityId, project.entities, project.generationBbox]);

  React.useEffect(() => {
    managerRef.current?.render(projectRef.current);
  }, [canvasSceneKey]);

  React.useEffect(() => {
    managerRef.current?.setSelectedEntityIds([...selectedEntityIds]);
  }, [selectedEntityIds]);

  const entityIdsKey = React.useMemo(
    () => project.entities.map((entity) => entity.id).join('|'),
    [project.entities],
  );

  React.useEffect(() => {
    const available = new Set(entityIdsKey ? entityIdsKey.split('|') : []);
    const current = new Set([...selectedEntityIdsRef.current].filter((entityId) => available.has(entityId)));
    if (project.activeEntityId && available.has(project.activeEntityId) && !current.has(project.activeEntityId)) {
      applyEntitySelection([project.activeEntityId], project.activeEntityId);
      return;
    }
    if (!project.activeEntityId && current.size > 0) {
      applyEntitySelection([]);
      return;
    }
    if (current.size !== selectedEntityIdsRef.current.size) applyEntitySelection(current, project.activeEntityId);
  }, [applyEntitySelection, entityIdsKey, project.activeEntityId, project.id]);

  React.useEffect(() => {
    managerRef.current?.setViewport(project.viewport);
  }, [project.viewport]);

  React.useEffect(() => {
    managerRef.current?.setTool(tool);
  }, [tool]);

  React.useEffect(() => {
    managerRef.current?.setMaskBrush(maskBrushSize, maskBrushOpacity);
  }, [maskBrushOpacity, maskBrushSize]);

  React.useEffect(() => {
    managerRef.current?.setRasterBrush(rasterBrushSize, rasterBrushOpacity, rasterBrushColor);
  }, [rasterBrushColor, rasterBrushOpacity, rasterBrushSize]);

  const previewStage = stages.find((stage) => stage.id === previewStageId) || null;
  const currentSnapshotSignature = React.useMemo(
    () => buildUmbraCanvasSnapshotSignature(project),
    [project.entities, project.generationBbox],
  );
  const previewStageKey = previewStage
    ? [previewStage.id, previewStage.imageUrl, previewStage.bbox.x, previewStage.bbox.y, previewStage.bbox.width, previewStage.bbox.height].join(':')
    : '';
  const previewStageRef = React.useRef(previewStage);
  previewStageRef.current = previewStage;

  React.useEffect(() => {
    managerRef.current?.setStagingPreview(previewStageRef.current, stagingReveal);
  }, [previewStageKey, stagingReveal]);

  const samplingPreview = React.useMemo(() => {
    if (!job || isUmbraUiInpaintJobTerminal(job)) return null;
    const preview = liveSamplingPreview?.jobId === job.id ? liveSamplingPreview : job.preview;
    if (!preview?.imageDataUrl) return null;
    const frozen = jobBboxesRef.current.get(job.id);
    if (!frozen) return null;
    const belongsToJob = job.items.some((item) => (
      item.id === preview.itemId
      && (!preview.promptId || !item.promptId || item.promptId === preview.promptId)
    ));
    if (!belongsToJob) return null;
    return {
      imageDataUrl: preview.imageDataUrl,
      bbox: { ...frozen.bbox },
      step: preview.step,
      maxStep: preview.maxStep,
    };
  }, [job, liveSamplingPreview]);
  const samplingPreviewKey = samplingPreview
    ? [samplingPreview.imageDataUrl.length, samplingPreview.imageDataUrl.slice(-48), samplingPreview.step, samplingPreview.maxStep, samplingPreview.bbox.x, samplingPreview.bbox.y, samplingPreview.bbox.width, samplingPreview.bbox.height].join(':')
    : '';

  React.useEffect(() => {
    managerRef.current?.setSamplingPreview(samplingPreview);
  }, [samplingPreviewKey]);

  React.useEffect(() => {
    if (previewStageId && !stages.some((stage) => stage.id === previewStageId)) setPreviewStageId('');
  }, [previewStageId, stages]);

  React.useEffect(() => {
    setSelectedStageIds((current) => {
      const available = new Set(stages.map((stage) => stage.id));
      const next = new Set([...current].filter((id) => available.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [stages]);

  React.useEffect(() => {
    const previousCount = previousEntityCountRef.current;
    previousEntityCountRef.current = project.entities.length;
    if (previousCount !== 0 || project.entities.length === 0) return;
    const frame = requestAnimationFrame(() => managerRef.current?.fitToContent());
    return () => cancelAnimationFrame(frame);
  }, [project.entities.length]);

  React.useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
      if (event.code === 'Space' && !editing) {
        event.preventDefault();
        managerRef.current?.setSpacePressed(true);
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        const selectable = projectRef.current.entities
          .filter((entity) => isUmbraCanvasSpatialEntity(entity) && entity.visible && !entity.locked)
          .map((entity) => entity.id);
        applyEntitySelection(selectable, selectable.at(-1));
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selectedEntityIdsRef.current.size > 0) {
        event.preventDefault();
        copiedEntityIdsRef.current = [...selectedEntityIdsRef.current];
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v' && copiedEntityIdsRef.current.length > 0) {
        event.preventDefault();
        const duplicateIds = duplicateEntities(copiedEntityIdsRef.current);
        if (duplicateIds.length > 0) applyEntitySelection(duplicateIds, duplicateIds.at(-1));
      }
      if (!editing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && selectedEntityIdsRef.current.size > 0) {
        event.preventDefault();
        duplicateSelection();
      }
      if (!editing && (event.key === 'Delete' || event.key === 'Backspace') && selectedEntityIdsRef.current.size > 0) {
        event.preventDefault();
        deleteSelection();
      }
      if (!editing && (event.key === '[' || event.key === ']')) {
        event.preventDefault();
        const direction = event.key === ']' ? 1 : -1;
        if (tool === 'mask-brush' || tool === 'mask-eraser') {
          setMaskBrushSize((current) => Math.max(4, Math.min(512, current + direction * Math.max(4, Math.round(current * 0.1 / 4) * 4))));
        }
        if (tool === 'raster-brush' || tool === 'raster-eraser') {
          setRasterBrushSize((current) => Math.max(4, Math.min(512, current + direction * Math.max(4, Math.round(current * 0.1 / 4) * 4))));
        }
      }
      if (!editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'v') setTool('select');
        if (key === 'h') setTool('pan');
        if (key === 'g') setTool('bbox');
        if (key === 'i' && UMBRA_CANVAS_COLOR_PICKER_ENABLED) setTool('eyedropper');
        if (key === 'enter' && tool === 'polygon-shape') {
          event.preventDefault();
          managerRef.current?.commitPolygon();
        }
        if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && stages.length > 0) {
          event.preventDefault();
          const currentIndex = Math.max(0, stages.findIndex((stage) => stage.id === previewStageId));
          const direction = event.key === 'ArrowRight' ? 1 : -1;
          const nextIndex = (currentIndex + direction + stages.length) % stages.length;
          setPreviewStageId(stages[nextIndex].id);
        }
        if (key === 'escape') {
          managerRef.current?.cancelShapeDrawing();
          setTool('select');
          setPreviewStageId('');
          setConflictStageId('');
        }
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') managerRef.current?.setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [active, applyEntitySelection, deleteSelection, duplicateEntities, duplicateSelection, previewStageId, redo, stages, tool, undo]);

  const refreshProjects = React.useCallback(async () => {
    setProjectsLoading(true);
    try {
      setProjectSummaries(await listUmbraCanvasWorkspaceProjects());
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to list Canvas projects.', 'error');
    } finally {
      setProjectsLoading(false);
    }
  }, [showToast]);

  const refreshRestorePoints = React.useCallback(async (projectId = useUmbraCanvasStore.getState().present.id) => {
    setRestorePointsLoading(true);
    try {
      setRestorePoints(await listUmbraCanvasWorkspaceRestorePoints(projectId));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to list Canvas restore points.', 'error');
    } finally {
      setRestorePointsLoading(false);
    }
  }, [showToast]);

  const saveProject = React.useCallback(async (notify = true) => {
    if (saving) return null;
    setSaving(true);
    try {
      const current = useUmbraCanvasStore.getState().present;
      const thumbnail = await composeUmbraCanvasProjectThumbnail(current).catch(() => null);
      const saved = await saveUmbraCanvasWorkspaceProject(current, thumbnail);
      syncPersistedProject(saved);
      window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, saved.id);
      setLastSavedRevision(saved.revision);
      setSaveError('');
      if (projectBrowserOpen) void refreshProjects();
      if (notify) showToast('Canvas project saved.', 'success');
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save the Canvas project.';
      setSaveError(message);
      if (notify) showToast(`Canvas save failed: ${message}`, 'error');
      else console.warn(`[Canvas] Autosave failed: ${message}`);
      return null;
    } finally {
      setSaving(false);
    }
  }, [projectBrowserOpen, refreshProjects, saving, showToast, syncPersistedProject]);

  const exportProject = React.useCallback(async () => {
    if (archiving || project.entities.length === 0) return;
    setArchiving(true);
    try {
      downloadUmbraCanvasWorkspaceArchive(await exportUmbraCanvasWorkspaceArchive(project), project.name);
      showToast('Portable Canvas project exported.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Canvas project could not be exported.', 'error');
    } finally {
      setArchiving(false);
    }
  }, [archiving, project, showToast]);

  const importProjectArchive = React.useCallback(async (file: File) => {
    if (archiving) return;
    setArchiving(true);
    let objectUrls: string[] = [];
    try {
      const imported = await importUmbraCanvasWorkspaceArchive(file);
      objectUrls = imported.objectUrls;
      const thumbnail = await composeUmbraCanvasProjectThumbnail(imported.project).catch(() => null);
      const saved = await saveUmbraCanvasWorkspaceProject(imported.project, thumbnail);
      replaceProject(saved);
      window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, saved.id);
      setLastSavedRevision(saved.revision);
      if (saved.generation.settings) onRestoreGenerationSettings(saved.generation.settings);
      requestAnimationFrame(() => managerRef.current?.fitToContent());
      showToast(`Imported ${saved.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Canvas archive could not be imported.', 'error');
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      setArchiving(false);
    }
  }, [archiving, onRestoreGenerationSettings, replaceProject, showToast]);

  React.useEffect(() => {
    if (project.entities.length === 0 || project.revision === lastSavedRevision || saving) return;
    const timer = window.setTimeout(() => void saveProject(false), 30_000);
    return () => window.clearTimeout(timer);
  }, [lastSavedRevision, project.entities.length, project.revision, saveProject, saving]);

  const openProjectBrowser = React.useCallback(() => {
    setProjectBrowserOpen(true);
    void refreshProjects();
    void refreshRestorePoints();
  }, [refreshProjects, refreshRestorePoints]);

  const loadProject = React.useCallback(async (projectId: string) => {
    try {
      const loaded = await loadUmbraCanvasWorkspaceProject(projectId);
      replaceProject(loaded);
      window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, loaded.id);
      setLastSavedRevision(loaded.revision);
      if (loaded.generation.settings) {
        onRestoreGenerationSettings(loaded.generation.settings);
        setDenoise(loaded.generation.settings.denoise);
        setSamples(loaded.generation.settings.samples);
      }
      setJob(null);
      jobBboxesRef.current.clear();
      seenStageIdsRef.current = new Set(loaded.generation.staging.map((stage) => stage.id));
      setPreviewStageId('');
      const pending = loaded.generation.pending.at(-1);
      if (pending) {
        jobBboxesRef.current.set(pending.jobId, {
          bbox: { ...pending.bbox },
          projectRevision: pending.projectRevision,
          snapshotSignature: pending.snapshotSignature || '',
          acceptanceMaskUrl: pending.acceptanceMaskUrl || '',
        });
        try {
          setJob(await fetchUmbraUiInpaintJob(pending.jobId));
        } catch (error) {
          showToast(error instanceof Error ? error.message : 'The pending Canvas job could not be recovered.', 'error');
        }
      }
      setProjectBrowserOpen(false);
      requestAnimationFrame(() => managerRef.current?.fitToContent());
      showToast(`Opened ${loaded.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to open the Canvas project.', 'error');
    }
  }, [onRestoreGenerationSettings, replaceProject, showToast]);

  React.useEffect(() => {
    if (!active || !mediaHandoff || mediaHandoff.mode !== 'canvas') return;
    if (mediaHandoff.createdAt <= consumedHandoffAtRef.current) return;
    consumedHandoffAtRef.current = mediaHandoff.createdAt;
    setPendingMediaImport(mediaHandoff);
    void refreshProjects();
  }, [active, mediaHandoff, refreshProjects]);

  const importMediaHandoff = React.useCallback(async (destinationProjectId: string) => {
    const handoff = pendingMediaImport;
    if (!handoff || mediaImportBusy) return;
    setMediaImportBusy(true);
    let bitmap: ImageBitmap | null = null;
    let destinationSettings: UmbraCanvasGenerationSettingsSnapshot | null = null;
    try {
      const response = await fetch(handoff.imageUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`The Canvas source returned ${response.status}.`);
      const blob = await response.blob();
      bitmap = await createImageBitmap(blob);
      const name = String(handoff.name || handoff.path.split(/[\\/]/).pop() || 'Canvas Source').trim();

      if (destinationProjectId) {
        if (destinationProjectId !== useUmbraCanvasStore.getState().present.id) {
          const loaded = await loadUmbraCanvasWorkspaceProject(destinationProjectId);
          replaceProject(loaded);
          window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, loaded.id);
          setLastSavedRevision(loaded.revision);
          destinationSettings = loaded.generation.settings;
        }
      } else {
        newProject();
        renameProject(name.replace(/\.[a-z0-9]{2,5}$/i, '') || 'Canvas Source');
      }

      const imageUrl = URL.createObjectURL(blob);
      const currentProject = useUmbraCanvasStore.getState().present;
      const targetBbox = currentProject.generationBbox;
      addRaster(createUmbraCanvasRasterEntity({
        name,
        imageUrl,
        sourcePath: handoff.path,
        width: bitmap.width,
        height: bitmap.height,
        x: destinationProjectId ? Math.round(targetBbox.x + (targetBbox.width - bitmap.width) / 2) : 0,
        y: destinationProjectId ? Math.round(targetBbox.y + (targetBbox.height - bitmap.height) / 2) : 0,
      }));
      if (!destinationProjectId) {
        setGenerationBbox({ x: 0, y: 0, width: bitmap.width, height: bitmap.height });
      }

      const inherited = handoff.generation;
      if (inherited) {
        const restoredSettings: UmbraCanvasGenerationSettingsSnapshot = {
          modelFamily: inherited.modelFamily,
          modelSource: inherited.modelType,
          checkpointName: inherited.checkpointName,
          workflowResources: { ...(inherited.workflowResources || {}) },
          promptSegments: inherited.positivePromptSegments?.length
            ? inherited.positivePromptSegments.map((segment, index) => ({
                id: `canvas-handoff-prompt-${handoff.createdAt}-${index + 1}`,
                ...segment,
              }))
            : [{ id: `canvas-handoff-prompt-${handoff.createdAt}-1`, text: inherited.positivePrompt }],
          negativePrompt: inherited.negativePrompt,
          loras: inherited.loras.map((lora) => ({ ...lora })),
          clipSkip: inherited.clipSkip || 1,
          seed: String(inherited.seed ?? ''),
          seedMode: inherited.controlAfterGenerate || 'fixed',
          seedIncrement: inherited.seedIncrement || 1,
          steps: inherited.steps || 20,
          cfg: inherited.cfg || 1,
          samplerName: inherited.samplerName || 'euler',
          scheduler: inherited.scheduler || 'normal',
          denoise: inherited.denoise ?? 0.65,
          samples: 1,
          tiledVae: {},
          hiresFix: inherited.hiresFix ? { ...inherited.hiresFix } : {},
          detailerPipeline: (inherited.detailerPipeline || []).map((stage) => ({ ...stage })) as unknown as Array<Record<string, unknown>>,
          maskGrow: 8,
          maskFeather: 12,
          contextPadding: 64,
          colorMatch: 0.5,
          differentialStrength: 0.75,
          softInpaintEnabled: true,
          softInpaintPreservation: 0.35,
          softInpaintTransitionContrast: 1.75,
          softInpaintMaskInfluence: 0,
        };
        setGenerationSettings(restoredSettings);
        onRestoreGenerationSettings(restoredSettings);
        setDenoise(restoredSettings.denoise);
        setSamples(restoredSettings.samples);
      } else if (destinationSettings) {
        onRestoreGenerationSettings(destinationSettings);
        setDenoise(destinationSettings.denoise);
        setSamples(destinationSettings.samples);
      }

      setPendingMediaImport(null);
      onMediaHandoffConsumed();
      window.setTimeout(() => void saveProject(false), 0);
      requestAnimationFrame(() => managerRef.current?.fitToContent());
      showToast(destinationProjectId ? 'Image added to the selected Canvas project.' : 'Image and generation metadata opened in a new Canvas project.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The image could not be opened in Canvas.', 'error');
    } finally {
      bitmap?.close();
      setMediaImportBusy(false);
    }
  }, [addRaster, mediaImportBusy, newProject, onMediaHandoffConsumed, onRestoreGenerationSettings, pendingMediaImport, renameProject, replaceProject, saveProject, setGenerationBbox, setGenerationSettings, showToast]);

  const cancelMediaHandoff = React.useCallback(() => {
    if (mediaImportBusy) return;
    setPendingMediaImport(null);
    onMediaHandoffConsumed();
  }, [mediaImportBusy, onMediaHandoffConsumed]);

  const forkProject = React.useCallback(async () => {
    if (forkingProject || saving || project.entities.length === 0) return;
    setForkingProject(true);
    try {
      const saved = await saveProject(false);
      if (!saved) return;
      const forked = await forkUmbraCanvasWorkspaceProject(saved.id, `${saved.name} Copy`);
      replaceProject(forked);
      window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, forked.id);
      setLastSavedRevision(forked.revision);
      if (forked.generation.settings) onRestoreGenerationSettings(forked.generation.settings);
      setProjectBrowserOpen(false);
      requestAnimationFrame(() => managerRef.current?.fitToContent());
      showToast(`Created ${forked.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The Canvas project could not be copied.', 'error');
    } finally {
      setForkingProject(false);
    }
  }, [forkingProject, onRestoreGenerationSettings, project.entities.length, replaceProject, saveProject, saving, showToast]);

  React.useEffect(() => {
    if (!active || recoveredProjectRef.current) return;
    recoveredProjectRef.current = true;
    const recover = async () => {
      const remembered = String(window.localStorage.getItem(UMBRA_CANVAS_LAST_PROJECT_KEY) || '').trim();
      if (remembered === UMBRA_CANVAS_BLANK_PROJECT) return;
      if (remembered) {
        await loadProject(remembered);
        return;
      }
      try {
        const summaries = await listUmbraCanvasWorkspaceProjects();
        if (summaries[0]?.id) await loadProject(summaries[0].id);
      } catch {
        // A blank workspace remains usable when recent-project recovery fails.
      }
    };
    void recover();
  }, [active, loadProject]);

  const deleteProject = React.useCallback(async (summary: UmbraCanvasWorkspaceProjectSummary) => {
    if (!window.confirm(`Delete the Canvas project "${summary.name}" and its saved assets?`)) return;
    try {
      await deleteUmbraCanvasWorkspaceProject(summary.id);
      if (window.localStorage.getItem(UMBRA_CANVAS_LAST_PROJECT_KEY) === summary.id) {
        window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, UMBRA_CANVAS_BLANK_PROJECT);
      }
      await refreshProjects();
      showToast(`Deleted ${summary.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete the Canvas project.', 'error');
    }
  }, [refreshProjects, showToast]);

  const createRestorePoint = React.useCallback(async () => {
    if (restorePointBusy || saving || project.entities.length === 0) return;
    setRestorePointBusy(true);
    try {
      const saved = await saveProject(false);
      if (!saved) return;
      const fallbackName = `Restore ${new Date().toLocaleString()}`;
      await createUmbraCanvasWorkspaceRestorePoint(saved.id, restorePointName.trim() || fallbackName);
      setRestorePointName('');
      await refreshRestorePoints(saved.id);
      showToast('Canvas restore point created.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create the Canvas restore point.', 'error');
    } finally {
      setRestorePointBusy(false);
    }
  }, [project.entities.length, refreshRestorePoints, restorePointBusy, restorePointName, saveProject, saving, showToast]);

  const restoreFromRestorePoint = React.useCallback(async (restorePoint: UmbraCanvasWorkspaceRestorePointSummary) => {
    if (restorePointBusy) return;
    if (!window.confirm(`Restore "${restorePoint.name}"? The current document will be replaced, but this restore point remains available.`)) return;
    setRestorePointBusy(true);
    try {
      const saved = await saveProject(false);
      if (!saved) return;
      await createUmbraCanvasWorkspaceRestorePoint(saved.id, `Before restoring ${restorePoint.name}`);
      const restored = await restoreUmbraCanvasWorkspaceRestorePoint(project.id, restorePoint.id);
      replaceProject(restored);
      window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, restored.id);
      setLastSavedRevision(restored.revision);
      if (restored.generation.settings) {
        onRestoreGenerationSettings(restored.generation.settings);
        setDenoise(restored.generation.settings.denoise);
        setSamples(restored.generation.settings.samples);
      }
      setJob(null);
      setPreviewStageId('');
      jobBboxesRef.current.clear();
      seenStageIdsRef.current = new Set(restored.generation.staging.map((stage) => stage.id));
      await Promise.all([refreshProjects(), refreshRestorePoints(restored.id)]);
      requestAnimationFrame(() => managerRef.current?.fitToContent());
      showToast(`Restored ${restorePoint.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to restore the Canvas restore point.', 'error');
    } finally {
      setRestorePointBusy(false);
    }
  }, [onRestoreGenerationSettings, project.id, refreshProjects, refreshRestorePoints, replaceProject, restorePointBusy, saveProject, showToast]);

  const deleteRestorePoint = React.useCallback(async (restorePoint: UmbraCanvasWorkspaceRestorePointSummary) => {
    if (restorePointBusy) return;
    if (!window.confirm(`Delete the restore point "${restorePoint.name}"?`)) return;
    setRestorePointBusy(true);
    try {
      await deleteUmbraCanvasWorkspaceRestorePoint(project.id, restorePoint.id);
      await refreshRestorePoints(project.id);
      showToast(`Deleted ${restorePoint.name}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete the Canvas restore point.', 'error');
    } finally {
      setRestorePointBusy(false);
    }
  }, [project.id, refreshRestorePoints, restorePointBusy, showToast]);

  const importImages = React.useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const bitmap = await createImageBitmap(file);
        const imageUrl = URL.createObjectURL(file);
        const bbox = useUmbraCanvasStore.getState().present.generationBbox;
        addRaster(createUmbraCanvasRasterEntity({
          name: file.name,
          imageUrl,
          width: bitmap.width,
          height: bitmap.height,
          x: Math.round(bbox.x + (bbox.width - bitmap.width) / 2),
          y: Math.round(bbox.y + (bbox.height - bitmap.height) / 2),
        }));
        bitmap.close();
      } catch (error) {
        showToast(error instanceof Error ? error.message : `Could not import ${file.name}.`, 'error');
      }
    }
  }, [addRaster, showToast]);

  const importGalleryPaths = React.useCallback(async (paths: string[]) => {
    const uniquePaths = Array.from(new Set(paths.map((path) => String(path || '').trim()).filter(Boolean)));
    let importedCount = 0;
    for (const path of uniquePaths) {
      try {
        const response = await fetch(`/api/fs/image?${new URLSearchParams({ path }).toString()}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`The media source returned ${response.status}.`);
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        const imageUrl = URL.createObjectURL(blob);
        const bbox = useUmbraCanvasStore.getState().present.generationBbox;
        const name = path.replace(/\\/g, '/').split('/').pop() || 'Gallery Image';
        addRaster(createUmbraCanvasRasterEntity({
          name,
          imageUrl,
          sourcePath: path,
          width: bitmap.width,
          height: bitmap.height,
          x: Math.round(bbox.x + (bbox.width - bitmap.width) / 2),
          y: Math.round(bbox.y + (bbox.height - bitmap.height) / 2),
        }));
        bitmap.close();
        importedCount += 1;
      } catch (error) {
        showToast(error instanceof Error ? error.message : `Could not import ${path}.`, 'error');
      }
    }
    if (importedCount > 0) {
      showToast(`Added ${importedCount} Gallery item${importedCount === 1 ? '' : 's'} to Canvas.`, 'success');
    }
  }, [addRaster, showToast]);

  const sendStagedResult = React.useCallback(async (
    stage: UmbraCanvasStagedGeneration,
    mode: Exclude<UmbraUiMediaHandoffMode, 'canvas' | 'txt2img'> | 'extras',
  ) => {
    try {
      const name = stage.sourcePath.replace(/\\/g, '/').split('/').pop() || `Canvas ${stage.seed}`;
      if (mode === 'extras') {
        stageUmbraUiUpscaleHandoff({ path: stage.sourcePath, name, imageUrl: stage.imageUrl });
      } else {
        await stageUmbraUiMediaHandoff({
          mode,
          path: stage.sourcePath,
          originalSourcePath: stage.sourcePath,
          name,
          imageUrl: stage.imageUrl,
          source: 'canvas-staging',
          ...(mode === 'video' ? { videoFrameRole: 'first' as const } : {}),
        });
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The staged result could not be sent.', 'error');
    }
  }, [showToast]);

  React.useEffect(() => {
    if (!stagingSaveDestination) return;
    const selected = stagingSaveDestination.toLowerCase();
    if (pinnedOutputFolders.some((folder) => folder.toLowerCase() === selected)) return;
    setStagingSaveDestination('');
  }, [pinnedOutputFolders, stagingSaveDestination]);

  const saveSelectedStagesToPinnedFolder = React.useCallback(async () => {
    if (savingStagedResults || !stagingSaveDestination) return;
    const paths = stages
      .filter((stage) => selectedStageIds.has(stage.id))
      .map((stage) => stage.sourcePath)
      .filter(Boolean);
    if (paths.length === 0) {
      showToast('Select one or more staged samples first.', 'error');
      return;
    }
    setSavingStagedResults(true);
    try {
      const response = await fetch('/api/fs/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths, destination: stagingSaveDestination, trackProgress: false }),
      });
      const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || payload.success !== true) {
        throw new Error(String(payload.error || `Failed to save staged samples (${response.status}).`));
      }
      const copied = Math.max(0, Number(payload.copied) || 0);
      showToast(`Saved ${copied} staged sample${copied === 1 ? '' : 's'} to the pinned Gallery folder.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The staged samples could not be saved.', 'error');
    } finally {
      setSavingStagedResults(false);
    }
  }, [savingStagedResults, selectedStageIds, showToast, stages, stagingSaveDestination]);

  const importMaskImages = React.useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const bitmap = await createImageBitmap(file);
        const imageUrl = URL.createObjectURL(file);
        const bbox = useUmbraCanvasStore.getState().present.generationBbox;
        addMask(createUmbraCanvasMaskEntity({
          name: file.name.replace(/\.[^.]+$/, '') || 'Imported Mask',
          imageUrl,
          bbox: {
            x: Math.round(bbox.x + (bbox.width - bitmap.width) / 2),
            y: Math.round(bbox.y + (bbox.height - bitmap.height) / 2),
            width: bitmap.width,
            height: bitmap.height,
          },
        }));
        bitmap.close();
        setTool('mask-brush');
        showToast(`Imported ${file.name} as a mask layer.`, 'success');
      } catch (error) {
        showToast(error instanceof Error ? error.message : `Could not import ${file.name} as a mask.`, 'error');
      }
    }
  }, [addMask, showToast]);

  const prepareGenerationRegion = React.useCallback(async () => {
    if (preparingRegion || submitting) return;
    autoSubmitPreparedRegionRef.current = true;
    setPreparingRegion(true);
    try {
      const frozenProject = useUmbraCanvasStore.getState().present;
      const composite = await composeUmbraCanvasGenerationRegion(frozenProject);
      setPreparedRegion({
        ...composite,
        projectRevision: frozenProject.revision,
        snapshotSignature: buildUmbraCanvasSnapshotSignature(frozenProject),
        bbox: { ...frozenProject.generationBbox },
      });
    } catch (error) {
      autoSubmitPreparedRegionRef.current = false;
      showToast(error instanceof Error ? error.message : 'The Canvas generation region could not be prepared.', 'error');
    } finally {
      setPreparingRegion(false);
    }
  }, [preparingRegion, showToast, submitting]);

  const submitPreparedRegion = React.useCallback(async () => {
    if (!preparedRegion || submitting) return;
    const compiledPrompt = compileUmbraUiPromptSegments(promptSegments);
    if (!compiledPrompt.trim()) {
      showToast('Enter a Canvas prompt before generating.', 'error');
      closePreparedRegion();
      return;
    }
    if (!comfyConnected) {
      showToast('Launch ComfyUI before generating from Canvas.', 'error');
      closePreparedRegion();
      return;
    }
    if (pipelineError || !checkpointName) {
      showToast(pipelineError || 'Choose a model for Canvas generation.', 'error');
      closePreparedRegion();
      return;
    }
    setSubmitting(true);
    try {
      const settingsSnapshot: UmbraCanvasGenerationSettingsSnapshot = {
        modelFamily,
        modelSource,
        checkpointName,
        workflowResources: { ...workflowResources },
        promptSegments: promptSegments.map((segment) => ({ ...segment })),
        negativePrompt,
        loras: loras.map((lora) => ({ ...lora })) as Array<Record<string, unknown>>,
        clipSkip: Number(clipSkip) || 1,
        seed,
        seedMode,
        seedIncrement,
        steps: Number(steps) || 20,
        cfg: Number(cfg) || 1,
        samplerName: samplerName || 'euler',
        scheduler: scheduler || 'normal',
        denoise,
        samples,
        tiledVae: { ...tiledVae } as unknown as Record<string, unknown>,
        hiresFix: { ...hiresFix } as unknown as Record<string, unknown>,
        detailerPipeline: detailerPipeline.map((stage) => ({ ...stage })) as unknown as Array<Record<string, unknown>>,
        maskGrow,
        maskFeather,
        contextPadding,
        colorMatch,
        differentialStrength,
        softInpaintEnabled,
        softInpaintPreservation,
        softInpaintTransitionContrast,
        softInpaintMaskInfluence,
      };
      setGenerationSettings(settingsSnapshot);
      await saveProject(false);
      const queuedSeed = resolveUmbraUiQueueSeed(seed, seedMode);
      const promptWithLoras = capabilities.loras.support === 'adjustable'
        ? composeUmbraUiPromptWithLoras(compiledPrompt, loras)
        : compiledPrompt;
      const enabledRegionalGuides = project.entities.filter(isUmbraCanvasRegionalGuidanceEntity).filter((entity) => entity.generationEnabled);
      if (enabledRegionalGuides.length > 0 && canvasCapabilities.regionalGuidance.support === 'unsupported') {
        throw new Error(canvasCapabilities.regionalGuidance.reason || 'Regional guidance is unavailable for this pipeline.');
      }
      if (enabledRegionalGuides.length > canvasCapabilities.regionalGuidance.maxLayers) {
        throw new Error(`This pipeline supports up to ${canvasCapabilities.regionalGuidance.maxLayers} regional guides.`);
      }
      const regionalGuidance = await Promise.all(enabledRegionalGuides.map(async (guide) => ({
        id: guide.id,
        name: guide.name,
        mask: await composeUmbraCanvasMaskBlob(project, guide.maskEntityId),
        positivePrompt: canvasCapabilities.regionalGuidance.positivePrompt ? guide.positivePrompt : '',
        negativePrompt: canvasCapabilities.regionalGuidance.negativePrompt ? guide.negativePrompt : '',
        autoNegative: canvasCapabilities.regionalGuidance.autoNegative && guide.autoNegative,
        weight: guide.weight,
        beginStepPercent: Math.min(guide.beginStepPercent, guide.endStepPercent),
        endStepPercent: Math.max(guide.beginStepPercent, guide.endStepPercent),
      })));
      const enabledControlLayers = project.entities.filter(isUmbraCanvasControlEntity).filter((entity) => entity.generationEnabled);
      if (enabledControlLayers.length > 0 && !controlLayersAvailable) throw new Error(controlLayersReason || 'Control layers are unavailable for this pipeline.');
      if (enabledControlLayers.length > canvasCapabilities.controlLayers.maxLayers) throw new Error(`This pipeline supports up to ${canvasCapabilities.controlLayers.maxLayers} control layers.`);
      const submittedControlLayers = await Promise.all(enabledControlLayers.map(async (control) => ({
        id: control.id,
        name: control.name,
        image: await composeUmbraCanvasRasterBlob(project, control.rasterEntityId),
        adapterType: control.adapterType,
        controlMode: control.controlMode,
        controlType: control.controlType,
        modelName: control.modelName,
        weight: control.weight,
        beginStepPercent: Math.min(control.beginStepPercent, control.endStepPercent),
        endStepPercent: Math.max(control.beginStepPercent, control.endStepPercent),
        processorResolution: control.processorResolution,
        lowThreshold: control.lowThreshold,
        highThreshold: control.highThreshold,
        detectBody: true,
        detectFace: true,
        detectHands: true,
        maxFaces: 1,
        minimumConfidence: 0.3,
        scoreThreshold: 0.5,
        distanceThreshold: 10,
        normalStrength: 1,
        backgroundThreshold: 0.1,
        safeMode: true,
        processorSeed: 0,
      })));
      const enabledReferenceLayers = project.entities.filter(isUmbraCanvasReferenceEntity).filter((entity) => entity.generationEnabled);
      if (enabledReferenceLayers.length > 0 && !referenceLayersAvailable) throw new Error(referenceLayersReason || 'Reference layers are unavailable for this pipeline.');
      if (enabledReferenceLayers.length > canvasCapabilities.referenceLayers.maxLayers) throw new Error(`This pipeline supports up to ${canvasCapabilities.referenceLayers.maxLayers} reference layers.`);
      const submittedReferenceLayers = await Promise.all(enabledReferenceLayers.map(async (reference) => ({
        id: reference.id,
        name: reference.name,
        image: await composeUmbraCanvasRasterBlob(project, reference.rasterEntityId),
        mask: reference.maskEntityId ? await composeUmbraCanvasMaskBlob(project, reference.maskEntityId) : undefined,
        method: reference.method,
        modelName: reference.modelName,
        visionModelName: reference.visionModelName,
        crop: reference.crop,
        strengthType: reference.strengthType,
        weight: reference.weight,
        beginStepPercent: Math.min(reference.beginStepPercent, reference.endStepPercent),
        endStepPercent: Math.max(reference.beginStepPercent, reference.endStepPercent),
        ipAdapterWeightType: reference.ipAdapterWeightType,
        ipAdapterCombineEmbeds: reference.ipAdapterCombineEmbeds,
        ipAdapterEmbedsScaling: reference.ipAdapterEmbedsScaling,
      })));
      const sourceFreeGeneration = preparedRegion.drawableLayerCount === 0
        && regionalGuidance.length === 0
        && submittedControlLayers.length === 0
        && submittedReferenceLayers.length === 0;
      const nextJob = await submitUmbraUiInpaintJob({
        source: preparedRegion.sourceBlob,
        sourceName: `${project.name || 'umbra-canvas'}.png`,
        canvasProjectId: project.id,
        sourceFreeGeneration,
        operationMode: preparedRegion.automaticMaskPixels > 0 ? 'outpaint' : 'inpaint',
        generationRegionX: preparedRegion.bbox.x,
        generationRegionY: preparedRegion.bbox.y,
        generationRegionWidth: preparedRegion.bbox.width,
        generationRegionHeight: preparedRegion.bbox.height,
        submissionRegionX: preparedRegion.bbox.x,
        submissionRegionY: preparedRegion.bbox.y,
        submissionRegionWidth: preparedRegion.bbox.width,
        submissionRegionHeight: preparedRegion.bbox.height,
        mask: preparedRegion.maskBlob,
        modelFamily,
        modelSource,
        prompt: promptWithLoras,
        promptSegments,
        negativePrompt: capabilities.negativePrompt.support === 'adjustable' ? negativePrompt : '',
        loras: loras.filter((lora) => lora.enabled !== false),
        workflowResources,
        checkpointName,
        clipSkip: Number(clipSkip) || 1,
        seed: queuedSeed,
        seedMode,
        seedIncrement,
        steps: Number(steps) || 20,
        cfg: Number(cfg) || 1,
        samplerName: samplerName || 'euler',
        scheduler: scheduler || 'normal',
        denoise,
        samples,
        width: preparedRegion.width,
        height: preparedRegion.height,
        maskGrow,
        maskFeather,
        canvasMaskGrow: maskGrow,
        canvasMaskFeather: maskFeather,
        contextPadding,
        processingScaleMode: 'none',
        processingWidth: preparedRegion.width,
        processingHeight: preparedRegion.height,
        coherenceMode: 'gaussian',
        coherenceEdgeSize: maskFeather,
        coherenceMinimumDenoise: 0,
        fillMode: 'neutral',
        infillColor: '#000000',
        infillTileSize: 32,
        inpaintModelName: '',
        seamlessX: false,
        seamlessY: false,
        outputOnlyMaskedRegions: false,
        colorMatch,
        differentialStrength: inpaintAdapter === 'native_edit' || inpaintAdapter === 'qwen_image_controlnet' ? 1 : differentialStrength,
        softInpaintEnabled: inpaintAdapter !== 'native_edit' && softInpaintEnabled,
        softInpaintPreservation,
        softInpaintTransitionContrast,
        softInpaintMaskInfluence,
        tiledVae,
        hiresFix,
        detailerPipeline: detailerPipeline.map((stage) => ({ ...stage })),
        regionalGuidance,
        controlLayers: submittedControlLayers,
        referenceLayers: submittedReferenceLayers,
      });
      const submittedRevision = useUmbraCanvasStore.getState().present.revision;
      const acceptanceMaskUrl = URL.createObjectURL(preparedRegion.maskBlob);
      jobBboxesRef.current.set(nextJob.id, {
        bbox: { ...preparedRegion.bbox },
        projectRevision: submittedRevision,
        snapshotSignature: preparedRegion.snapshotSignature,
        acceptanceMaskUrl,
      });
      upsertPendingGeneration({
        id: nextJob.id,
        jobId: nextJob.id,
        bbox: { ...preparedRegion.bbox },
        projectRevision: submittedRevision,
        snapshotSignature: preparedRegion.snapshotSignature,
        acceptanceMaskUrl,
        status: nextJob.status,
        settings: settingsSnapshot,
        createdAt: nextJob.createdAt,
        updatedAt: nextJob.updatedAt,
      });
      setJob(nextJob);
      await saveProject(false);
      onSeedChange(String(advanceUmbraUiSeed(queuedSeed, seedMode, seedIncrement, samples)));
      showToast(`${nextJob.total} Canvas sample${nextJob.total === 1 ? '' : 's'} queued.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Canvas generation could not be queued.', 'error');
    } finally {
      closePreparedRegion();
      setSubmitting(false);
    }
  }, [
    capabilities.loras.support,
    capabilities.negativePrompt.support,
    canvasCapabilities.regionalGuidance,
    canvasCapabilities.controlLayers.maxLayers,
    canvasCapabilities.referenceLayers.maxLayers,
    cfg,
    checkpointName,
    clipSkip,
    closePreparedRegion,
    colorMatch,
    comfyConnected,
    contextPadding,
    controlLayersAvailable,
    controlLayersReason,
    denoise,
    detailerPipeline,
    differentialStrength,
    hiresFix,
    inpaintAdapter,
    loras,
    modelFamily,
    modelSource,
    maskFeather,
    maskGrow,
    negativePrompt,
    onSeedChange,
    pipelineError,
    preparedRegion,
    project,
    referenceLayersAvailable,
    referenceLayersReason,
    project.id,
    project.name,
    promptSegments,
    samplerName,
    samples,
    saveProject,
    scheduler,
    seed,
    seedIncrement,
    seedMode,
    showToast,
    softInpaintEnabled,
    softInpaintMaskInfluence,
    softInpaintPreservation,
    softInpaintTransitionContrast,
    setGenerationSettings,
    steps,
    submitting,
    tiledVae,
    upsertPendingGeneration,
    workflowResources,
  ]);

  React.useEffect(() => {
    if (!preparedRegion || !autoSubmitPreparedRegionRef.current || submitting) return;
    autoSubmitPreparedRegionRef.current = false;
    void submitPreparedRegion();
  }, [preparedRegion, submitPreparedRegion, submitting]);

  React.useEffect(() => {
    if (!job) return;
    const frozen = jobBboxesRef.current.get(job.id);
    if (!frozen) return;
    const nextStages: UmbraCanvasStagedGeneration[] = [];
    for (const item of job.items) {
      const output = item.outputs[item.outputs.length - 1];
      if (!output) continue;
      const sourcePath = buildUmbraUiInpaintOutputPath(output);
      const id = `${job.id}:${item.id}:${sourcePath}`;
      if (seenStageIdsRef.current.has(id)) continue;
      nextStages.push({
        id,
        jobId: job.id,
        itemId: item.id,
        seed: item.seed,
        imageUrl: buildUmbraUiInpaintOutputUrl(output, job.updatedAt),
        sourcePath,
        bbox: { ...frozen.bbox },
        projectRevision: frozen.projectRevision,
        snapshotSignature: frozen.snapshotSignature,
        acceptanceMaskUrl: frozen.acceptanceMaskUrl,
        acceptedEntityId: '',
        pinned: false,
        createdAt: job.updatedAt,
      });
    }
    if (nextStages.length > 0) {
      nextStages.forEach((stage) => seenStageIdsRef.current.add(stage.id));
      addStagedGenerations(nextStages);
      setPreviewStageId(nextStages.at(-1)?.id || '');
      setStagingReveal(1);
      window.setTimeout(() => void saveProject(false), 0);
    }
    if (isUmbraUiInpaintJobTerminal(job)) {
      removePendingGeneration(job.id);
      jobBboxesRef.current.delete(job.id);
      window.setTimeout(() => void saveProject(false), 0);
    }
  }, [addStagedGenerations, job, removePendingGeneration, saveProject]);

  React.useEffect(() => {
    if (!job || isUmbraUiInpaintJobTerminal(job)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchUmbraUiInpaintJob(job.id, controller.signal)
        .then(setJob)
        .catch((error) => {
          if (controller.signal.aborted) return;
          showToast(error instanceof Error ? error.message : 'Canvas job status could not be refreshed.', 'error');
        });
    }, 850);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [job, showToast]);

  const cancelGeneration = React.useCallback(async () => {
    if (!job || isUmbraUiInpaintJobTerminal(job) || canceling) return;
    setCanceling(true);
    try {
      setJob(await cancelUmbraUiInpaintJob(job.id));
      showToast('Canvas generation canceled.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Canvas generation could not be canceled.', 'error');
    } finally {
      setCanceling(false);
    }
  }, [canceling, job, showToast]);

  const acceptStage = React.useCallback(async (
    stage: UmbraCanvasStagedGeneration,
    mode: 'replace' | 'layer',
    allowConflict = false,
  ) => {
    const currentSignature = buildUmbraCanvasSnapshotSignature(useUmbraCanvasStore.getState().present);
    if (!allowConflict && stage.snapshotSignature && currentSignature !== stage.snapshotSignature) {
      setConflictStageId(stage.id);
      return;
    }
    try {
      let temporaryMaskUrl = '';
      let blob: Blob;
      if (mode === 'replace') {
        let acceptanceMaskUrl = stage.acceptanceMaskUrl || '';
        if (!acceptanceMaskUrl) {
          const currentRegion = await composeUmbraCanvasGenerationRegion(useUmbraCanvasStore.getState().present);
          temporaryMaskUrl = URL.createObjectURL(currentRegion.maskBlob);
          acceptanceMaskUrl = temporaryMaskUrl;
        }
        try {
          blob = await composeUmbraCanvasAcceptedReplacementBlob(stage.imageUrl, acceptanceMaskUrl, stage.bbox);
        } finally {
          if (temporaryMaskUrl) URL.revokeObjectURL(temporaryMaskUrl);
        }
      } else {
        const response = await fetch(stage.imageUrl);
        if (!response.ok) throw new Error(`The staged sample returned ${response.status}.`);
        blob = await response.blob();
      }
      const bitmap = await createImageBitmap(blob);
      const imageUrl = URL.createObjectURL(blob);
      const entity = createUmbraCanvasRasterEntity({
        name: mode === 'replace' ? `Generated Region ${stage.seed}` : `Canvas Sample ${stage.seed}`,
        imageUrl,
        sourcePath: mode === 'replace' ? '' : stage.sourcePath,
        width: bitmap.width,
        height: bitmap.height,
        x: stage.bbox.x,
        y: stage.bbox.y,
      });
      acceptStagedGeneration(stage.id, entity);
      setPreviewStageId((current) => current === stage.id ? '' : current);
      bitmap.close();
      window.setTimeout(() => void saveProject(false), 0);
      showToast(mode === 'replace'
        ? 'Generated region accepted non-destructively at its frozen coordinates.'
        : 'Staged sample accepted as a movable layer.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The staged sample could not be accepted.', 'error');
    }
  }, [acceptStagedGeneration, saveProject, showToast]);

  const activeEntity = project.entities.find((entity) => entity.id === project.activeEntityId) || null;
  const regionalGuides = project.entities.filter((entity) => entity.kind === 'regional-guidance');
  const controlLayers = project.entities.filter((entity) => entity.kind === 'control');
  const referenceLayers = project.entities.filter((entity) => entity.kind === 'reference');

  const controlModelOptionsFor = React.useCallback((adapterType: UmbraUiInpaintControlAdapterType) => (
    adapterType === 'anima_lllite'
      ? animaLlliteModels
      : adapterType === 'control_lora' || adapterType === 'z_image_control'
        ? modelPatchModels
        : controlModels
  ), [animaLlliteModels, controlModels, modelPatchModels]);

  const referenceModelOptionsFor = React.useCallback((method: UmbraUiInpaintReferenceMethod) => (
    method === 'style_model' ? styleModels : method === 'ip_adapter' ? ipAdapterModels : modelPatchModels
  ), [ipAdapterModels, modelPatchModels, styleModels]);

  const createRegionalGuideFromMask = React.useCallback((maskEntityId: string) => {
    if (canvasCapabilities.regionalGuidance.support === 'unsupported') {
      showToast(canvasCapabilities.regionalGuidance.reason || 'Regional guidance is unavailable for this pipeline.', 'error');
      return;
    }
    if (regionalGuides.length >= canvasCapabilities.regionalGuidance.maxLayers) {
      showToast(`This pipeline supports up to ${canvasCapabilities.regionalGuidance.maxLayers} regional guides.`, 'error');
      return;
    }
    const mask = project.entities.find((entity) => entity.kind === 'mask' && entity.id === maskEntityId);
    if (!mask) return;
    addRegionalGuidance(createUmbraCanvasRegionalGuidanceEntity({
      maskEntityId,
      name: `${mask.name} Guide`,
    }));
    showToast('Regional guide created from the active mask.', 'success');
  }, [addRegionalGuidance, canvasCapabilities.regionalGuidance, project.entities, regionalGuides.length, showToast]);

  const createControlFromRaster = React.useCallback((rasterEntityId: string) => {
    if (!controlLayersAvailable || controlAdapterTypes.length === 0 || controlModes.length === 0) {
      showToast(controlLayersReason || 'Control layers are unavailable for this pipeline.', 'error');
      return;
    }
    if (controlLayers.length >= canvasCapabilities.controlLayers.maxLayers) {
      showToast(`This pipeline supports up to ${canvasCapabilities.controlLayers.maxLayers} control layers.`, 'error');
      return;
    }
    const raster = project.entities.find((entity) => entity.kind === 'raster' && entity.id === rasterEntityId);
    if (!raster) return;
    const adapterType = controlAdapterTypes[0];
    addControl(createUmbraCanvasControlEntity({
      rasterEntityId,
      adapterType,
      controlMode: controlModes[0],
      modelName: controlModelOptionsFor(adapterType)[0] || '',
      name: `${raster.name} Control`,
    }));
    showToast('Control layer created from the active image.', 'success');
  }, [addControl, canvasCapabilities.controlLayers.maxLayers, controlAdapterTypes, controlLayers.length, controlLayersAvailable, controlLayersReason, controlModelOptionsFor, controlModes, project.entities, showToast]);

  const createReferenceFromRaster = React.useCallback((rasterEntityId: string) => {
    if (!referenceLayersAvailable || referenceMethods.length === 0) {
      showToast(referenceLayersReason || 'Reference layers are unavailable for this pipeline.', 'error');
      return;
    }
    if (referenceLayers.length >= canvasCapabilities.referenceLayers.maxLayers) {
      showToast(`This pipeline supports up to ${canvasCapabilities.referenceLayers.maxLayers} reference layers.`, 'error');
      return;
    }
    const raster = project.entities.find((entity) => entity.kind === 'raster' && entity.id === rasterEntityId);
    if (!raster) return;
    const method = referenceMethods[0];
    addReference(createUmbraCanvasReferenceEntity({
      rasterEntityId,
      method,
      modelName: referenceModelOptionsFor(method)[0] || '',
      visionModelName: visionModels[0] || '',
      name: `${raster.name} Reference`,
    }));
    showToast('Reference layer created from the active image.', 'success');
  }, [addReference, canvasCapabilities.referenceLayers.maxLayers, project.entities, referenceLayers.length, referenceLayersAvailable, referenceLayersReason, referenceMethods, referenceModelOptionsFor, showToast, visionModels]);

  const createPaintAroundMaskFromRaster = React.useCallback((rasterEntityId: string) => {
    const raster = useUmbraCanvasStore.getState().present.entities.find((entity) => (
      entity.kind === 'raster' && entity.id === rasterEntityId
    ));
    if (!raster?.imageUrl) {
      showToast('Select an imported image before creating a surrounding mask.', 'error');
      return;
    }

    const sourceName = raster.name.replace(/\.[^.]+$/, '').trim() || 'Source';
    const mask = {
      ...createUmbraCanvasMaskEntity({
        name: `${sourceName} Surrounding Mask`,
        imageUrl: raster.imageUrl,
        sourcePath: raster.sourcePath,
        bbox: {
          x: raster.x,
          y: raster.y,
          width: raster.width,
          height: raster.height,
        },
      }),
      scaleX: raster.scaleX,
      scaleY: raster.scaleY,
      rotation: raster.rotation,
      inverted: true,
      feather: 0,
    };

    addMask(mask);
    applyEntitySelection([mask.id], mask.id);
    setTool('mask-brush');
    showToast('Created an inverted alpha mask around the visible source image.', 'success');
  }, [addMask, applyEntitySelection, showToast]);

  const activeInpaintTaskMode = CANVAS_INPAINT_TASK_MODES.find((mode) => (
    Math.abs(mode.denoise - denoise) < 0.001
    && mode.contextPadding === contextPadding
    && mode.maskGrow === maskGrow
    && Math.abs(mode.colorMatch - colorMatch) < 0.001
    && Math.abs(mode.differentialStrength - differentialStrength) < 0.001
  ))?.id || '';
  const activeInpaintBlendMode = CANVAS_INPAINT_BLEND_MODES.find((mode) => (
    mode.maskFeather === maskFeather
    && Math.abs(mode.preservation - softInpaintPreservation) < 0.001
    && Math.abs(mode.contrast - softInpaintTransitionContrast) < 0.001
    && Math.abs(mode.maskInfluence - softInpaintMaskInfluence) < 0.001
  ))?.id || '';
  const applyInpaintTaskMode = (modeId: CanvasInpaintTaskModeId) => {
    const mode = CANVAS_INPAINT_TASK_MODES.find((entry) => entry.id === modeId);
    if (!mode) return;
    setDenoise(mode.denoise);
    setContextPadding(mode.contextPadding);
    setMaskGrow(mode.maskGrow);
    setColorMatch(mode.colorMatch);
    setDifferentialStrength(mode.differentialStrength);
  };
  const applyInpaintBlendMode = (modeId: CanvasInpaintBlendModeId) => {
    const mode = CANVAS_INPAINT_BLEND_MODES.find((entry) => entry.id === modeId);
    if (!mode) return;
    setMaskFeather(mode.maskFeather);
    setSoftInpaintPreservation(mode.preservation);
    setSoftInpaintTransitionContrast(mode.contrast);
    setSoftInpaintMaskInfluence(mode.maskInfluence);
  };
  const normalizedLayerSearch = layerSearch.trim().toLowerCase();
  const visibleEntities = [...project.entities]
    .reverse()
    .filter((entity) => !normalizedLayerSearch
      || entity.name.toLowerCase().includes(normalizedLayerSearch)
      || entity.kind.replace('-', ' ').includes(normalizedLayerSearch));
  const activateMaskTool = (nextTool: 'mask-brush' | 'mask-eraser' | 'mask-lasso') => {
    if (activeEntity?.kind !== 'mask') {
      const mask = createUmbraCanvasMaskEntity({ bbox: project.generationBbox });
      addMask(mask);
    }
    setTool(nextTool);
  };
  const activateRasterTool = (nextTool: 'raster-brush' | 'raster-eraser') => {
    if (activeEntity?.kind !== 'raster') {
      showToast('Select an image layer before painting or erasing its pixels.', 'error');
      return;
    }
    if (activeEntity.locked) {
      showToast('Unlock the image layer before editing it.', 'error');
      return;
    }
    if (nextTool === 'raster-eraser' && activeEntity.alphaLocked) {
      showToast('Disable transparent-pixel lock before erasing the layer.', 'error');
      return;
    }
    setTool(nextTool);
  };
  const startBlankProject = () => {
    window.localStorage.setItem(UMBRA_CANVAS_LAST_PROJECT_KEY, UMBRA_CANVAS_BLANK_PROJECT);
    setPreviewStageId('');
    setJob(null);
    newProject();
  };
  const addVectorLayer = (kind: 'rectangle' | 'ellipse' | 'text' | 'gradient') => {
    const bbox = project.generationBbox;
    const width = kind === 'text' ? Math.min(512, bbox.width) : Math.min(384, bbox.width);
    const height = kind === 'text' ? Math.min(128, bbox.height) : Math.min(256, bbox.height);
    const placement = {
      x: Math.round((bbox.x + (bbox.width - width) / 2) / 8) * 8,
      y: Math.round((bbox.y + (bbox.height - height) / 2) / 8) * 8,
      width,
      height,
    };
    const entity = kind === 'text'
      ? createUmbraCanvasTextEntity(placement)
      : kind === 'gradient'
        ? createUmbraCanvasGradientEntity(placement)
        : createUmbraCanvasShapeEntity(kind, placement);
    addDrawable(entity);
    setTool('select');
  };
  const fitGenerationBbox = (target: 'drawables' | 'masks') => {
    const entities = project.entities
      .filter(isUmbraCanvasSpatialEntity)
      .filter((entity) => entity.generationEnabled && (target === 'masks' ? entity.kind === 'mask' : isUmbraCanvasDrawableEntity(entity)));
    if (entities.length === 0) {
      showToast(target === 'masks' ? 'No enabled mask layers are available.' : 'No enabled drawable layers are available.', 'error');
      return;
    }
    const bounds = entities.map(getUmbraCanvasSpatialBounds);
    const left = Math.min(...bounds.map((entry) => entry.x));
    const top = Math.min(...bounds.map((entry) => entry.y));
    const right = Math.max(...bounds.map((entry) => entry.x + entry.width));
    const bottom = Math.max(...bounds.map((entry) => entry.y + entry.height));
    setGenerationBbox({ x: left, y: top, width: right - left, height: bottom - top });
  };
  const cropRasterToGenerationBbox = async (entityId: string) => {
    if (croppingRaster || saving) return;
    const current = useUmbraCanvasStore.getState().present;
    const raster = current.entities.find((entity) => entity.kind === 'raster' && entity.id === entityId);
    if (!raster || raster.locked) return;
    setCroppingRaster(true);
    try {
      const saved = await saveProject(false);
      if (!saved) return;
      await createUmbraCanvasWorkspaceRestorePoint(saved.id, `Before cropping ${raster.name}`);
      const blob = await composeUmbraCanvasRasterCropBlob(saved, entityId);
      const imageUrl = URL.createObjectURL(blob);
      replaceRasterSource(entityId, {
        imageUrl,
        sourcePath: '',
        width: saved.generationBbox.width,
        height: saved.generationBbox.height,
        x: saved.generationBbox.x,
        y: saved.generationBbox.y,
      });
      if (projectBrowserOpen) void refreshRestorePoints(saved.id);
      showToast('Image layer cropped to the generation box. Undo or use the restore point to recover it.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The image layer could not be cropped.', 'error');
    } finally {
      setCroppingRaster(false);
    }
  };
  const mergeVisibleLayers = async () => {
    if (mergingLayers || saving) return;
    const current = useUmbraCanvasStore.getState().present;
    const currentDrawables = current.entities.filter(isUmbraCanvasDrawableEntity).filter((entity) => entity.visible && entity.generationEnabled);
    if (currentDrawables.length < 2) {
      showToast('Enable at least two visible drawable layers to merge them.', 'error');
      return;
    }
    setMergingLayers(true);
    try {
      const saved = await saveProject(false);
      if (!saved) return;
      await createUmbraCanvasWorkspaceRestorePoint(saved.id, 'Before merging visible layers');
      const drawables = saved.entities.filter(isUmbraCanvasDrawableEntity).filter((entity) => entity.visible && entity.generationEnabled);
      const bounds = drawables.map(getUmbraCanvasSpatialBounds);
      const left = Math.floor(Math.min(...bounds.map((entry) => entry.x)));
      const top = Math.floor(Math.min(...bounds.map((entry) => entry.y)));
      const right = Math.ceil(Math.max(...bounds.map((entry) => entry.x + entry.width)));
      const bottom = Math.ceil(Math.max(...bounds.map((entry) => entry.y + entry.height)));
      const mergeBbox = { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
      const blob = await composeUmbraCanvasDrawableRegionBlob(saved, mergeBbox);
      const imageUrl = URL.createObjectURL(blob);
      const merged = createUmbraCanvasRasterEntity({
        name: 'Merged Visible Layers',
        imageUrl,
        width: mergeBbox.width,
        height: mergeBbox.height,
        x: mergeBbox.x,
        y: mergeBbox.y,
      });
      mergeVisibleDrawables(merged, drawables.map((entity) => entity.id));
      if (projectBrowserOpen) void refreshRestorePoints(saved.id);
      showToast('Visible layers merged into one editable image layer. The source layers were hidden and remain recoverable.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The visible layers could not be merged.', 'error');
    } finally {
      setMergingLayers(false);
    }
  };

  return (
    <section
      data-umbra-canvas-workspace=""
      data-canvas-bbox-x={project.generationBbox.x}
      data-canvas-bbox-y={project.generationBbox.y}
      data-canvas-bbox-width={project.generationBbox.width}
      data-canvas-bbox-height={project.generationBbox.height}
      className="relative col-span-full grid min-h-0 grid-cols-[52px_minmax(0,1fr)] bg-[#07090a] 2xl:grid-cols-[52px_clamp(250px,18vw,300px)_clamp(240px,17vw,280px)_minmax(0,1fr)_280px]"
    >
      {compactPanel ? <button type="button" aria-label="Close Canvas side panel" onClick={() => setCompactPanel('')} className="absolute inset-0 z-10 bg-black/65 2xl:hidden" /> : null}
      <aside data-umbra-canvas-tool-rail="" className="relative z-20 flex min-h-0 flex-col items-center gap-2 overflow-y-auto border-r border-white/10 bg-black/35 px-1.5 py-2 custom-scrollbar 2xl:z-auto">
        <ToolButton active={tool === 'select'} title="Select and transform" shortcut="V" icon={<MousePointer2 size={15} />} onClick={() => setTool('select')} />
        <ToolButton active={tool === 'bbox'} title="Generation bounding box" shortcut="G" icon={<BoxSelect size={15} />} onClick={() => setTool('bbox')} />
        <ToolButton active={tool === 'pan'} title="Pan Canvas" shortcut="H" icon={<Hand size={15} />} onClick={() => setTool('pan')} />
        {UMBRA_CANVAS_RASTER_PAINT_ENABLED ? <ToolButton active={tool === 'raster-brush'} title="Paint active image layer" icon={<Brush size={15} />} onClick={() => activateRasterTool('raster-brush')} /> : null}
        <ToolButton active={tool === 'raster-eraser'} title="Erase active image layer" icon={<Eraser size={15} />} onClick={() => activateRasterTool('raster-eraser')} />
        {UMBRA_CANVAS_COLOR_PICKER_ENABLED ? <ToolButton active={tool === 'eyedropper'} title="Pick color from Canvas" icon={<Pipette size={15} />} onClick={() => setTool('eyedropper')} /> : null}
        <div className="h-px w-7 bg-white/10" />
        <ToolButton active={tool === 'mask-brush'} title="Paint inpaint mask" icon={<Brush size={15} />} onClick={() => activateMaskTool('mask-brush')} />
        <ToolButton active={tool === 'mask-eraser'} title="Erase inpaint mask" icon={<Eraser size={15} />} onClick={() => activateMaskTool('mask-eraser')} />
        <ToolButton active={tool === 'mask-lasso'} title="Lasso mask selection" icon={<LassoSelect size={15} />} onClick={() => activateMaskTool('mask-lasso')} />
        {UMBRA_CANVAS_VECTOR_TOOLS_ENABLED ? (
          <>
            <div className="h-px w-7 bg-white/10" />
            <button type="button" title="Add rectangle layer" aria-label="Add rectangle layer" onClick={() => addVectorLayer('rectangle')} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/35 text-zinc-500 hover:border-cyan-300/30 hover:text-cyan-100"><Square size={15} /></button>
            <button type="button" title="Add ellipse layer" aria-label="Add ellipse layer" onClick={() => addVectorLayer('ellipse')} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/35 text-zinc-500 hover:border-cyan-300/30 hover:text-cyan-100"><Circle size={15} /></button>
            <button type="button" title="Add text layer" aria-label="Add text layer" onClick={() => addVectorLayer('text')} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/35 text-zinc-500 hover:border-cyan-300/30 hover:text-cyan-100"><Type size={15} /></button>
            <button type="button" title="Add gradient layer" aria-label="Add gradient layer" onClick={() => addVectorLayer('gradient')} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/35 text-zinc-500 hover:border-cyan-300/30 hover:text-cyan-100"><Blend size={15} /></button>
            <ToolButton active={tool === 'freehand-shape'} title="Draw freehand vector path" icon={<Spline size={15} />} onClick={() => setTool('freehand-shape')} />
            <ToolButton active={tool === 'polygon-shape'} title="Draw polygon (double-click or Enter to finish)" icon={<PenTool size={15} />} onClick={() => setTool('polygon-shape')} />
          </>
        ) : null}
        <button type="button" title="Import image" aria-label="Import image" onClick={() => fileInputRef.current?.click()} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 bg-black/35 text-zinc-500 hover:border-cyan-300/30 hover:text-cyan-100"><ImagePlus size={15} /></button>
        <button type="button" title="Import mask image" aria-label="Import mask image" onClick={() => maskInputRef.current?.click()} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-rose-300/15 bg-black/35 text-rose-300/55 hover:border-rose-300/35 hover:text-rose-100"><LassoSelect size={15} /></button>
        <button type="button" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo (Ctrl/Cmd+Z)" onClick={undo} disabled={!canUndo} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-500 disabled:text-zinc-800"><Undo2 size={15} /><kbd aria-hidden="true" className="absolute bottom-0.5 right-0.5 min-w-3 rounded-sm bg-black/80 px-0.5 text-center font-mono text-[6px] font-black leading-3 tracking-normal text-zinc-400">Z</kbd></button>
        <button type="button" title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo (Ctrl/Cmd+Shift+Z)" onClick={redo} disabled={!canRedo} className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-500 disabled:text-zinc-800"><Redo2 size={15} /><kbd aria-hidden="true" className="absolute bottom-0.5 right-0.5 min-w-3 rounded-sm bg-black/80 px-0.5 text-center font-mono text-[6px] font-black leading-3 tracking-normal text-zinc-400">⇧Z</kbd></button>
        <div className="mt-auto flex flex-col gap-2">
          <button type="button" title="Fit visible content" aria-label="Fit visible content" onClick={() => managerRef.current?.fitToContent()} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><Focus size={15} /></button>
          <button type="button" title="Reset view" aria-label="Reset view" onClick={() => managerRef.current?.resetView()} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><RotateCcw size={15} /></button>
        </div>
      </aside>

      <aside data-umbra-canvas-generation-panel="" className={cn(
        'absolute bottom-0 left-[52px] top-0 z-20 w-[min(340px,calc(100%-52px))] min-h-0 overflow-y-auto border-r border-white/10 bg-[#090c0e] p-3 shadow-2xl custom-scrollbar 2xl:static 2xl:z-auto 2xl:block 2xl:w-auto 2xl:bg-black/20 2xl:shadow-none',
        compactPanel === 'generation' ? 'block' : 'hidden',
      )}>
        <div className="mb-3 flex items-center gap-2">
          <ScanLine size={14} className="text-rose-300" />
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Canvas Generation</h2>
            <p className="font-mono text-[8px] uppercase text-zinc-600">Bound to the generation box</p>
          </div>
          <button type="button" aria-label="Close generation panel" onClick={() => setCompactPanel('')} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 2xl:hidden"><X size={13} /></button>
        </div>
        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Model Pipeline</span>
            <UmbraSelect
              value={modelFamily}
              onValueChange={onModelFamilyChange}
              ariaLabel="Model Pipeline"
              menuTitle="Model Pipeline"
              options={modelFamilyOptions.map((family) => ({ value: family, label: family }))}
              size="sm"
              buttonClassName="h-9 px-2.5 text-xs focus-visible:border-rose-300/40"
            />
          </label>
          {pipelineError ? <p className="font-mono text-[9px] leading-relaxed text-red-300/80">{pipelineError}</p> : null}
          <UmbraCheckpointControls
            checkpointName={checkpointName}
            availableCount={checkpointAvailableCount}
            loading={checkpointLoading}
            clipSkip={clipSkip}
            onClipSkipChange={onClipSkipChange}
            onChoose={onOpenCheckpointPicker}
            onRefresh={onRefreshModelCatalog}
            error={checkpointError}
            accent="rose"
            heading="Primary Model"
            modelLabel={modelLabel}
            emptyLabel={`Choose ${modelLabel.toLowerCase()}`}
            modelType={modelSource}
            modelTypeOptions={modelSourceOptions}
            onModelTypeChange={onModelSourceChange}
            showClipSkip={capabilities.clipSkip.support === 'adjustable'}
          />
          {capabilities.loras.support === 'adjustable' ? (
            <UmbraLoraStackControls loras={loras} availableCount={loraAvailableCount} onChange={onLorasChange} onOpenPicker={onOpenLoraPicker} />
          ) : null}
          <UmbraSeedControls
            seed={seed}
            mode={seedMode}
            increment={seedIncrement}
            onSeedChange={onSeedChange}
            onModeChange={onSeedModeChange}
            onIncrementChange={onSeedIncrementChange}
            disabled={capabilities.seed.support !== 'adjustable'}
            disabledReason={capabilities.seed.reason}
          />
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1"><span className="text-[8px] font-black uppercase text-zinc-500">Steps</span><input value={steps} onChange={(event) => onStepsChange(event.target.value)} inputMode="numeric" className="h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-xs text-zinc-100 outline-none focus:border-rose-300/40" /></label>
            <label className="space-y-1"><span className="text-[8px] font-black uppercase text-zinc-500">{capabilities.guidance.label || 'Guidance'}</span><input value={cfg} onChange={(event) => onCfgChange(event.target.value)} inputMode="decimal" className="h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-xs text-zinc-100 outline-none focus:border-rose-300/40" /></label>
            <label className="space-y-1"><span className="text-[8px] font-black uppercase text-zinc-500">Sampler</span><UmbraSelect value={samplerName} onValueChange={onSamplerNameChange} ariaLabel="Sampler" menuTitle="Sampler" options={samplerOptions.map((option) => ({ value: option, label: option }))} size="sm" /></label>
            <label className="space-y-1"><span className="text-[8px] font-black uppercase text-zinc-500">Scheduler</span><UmbraSelect value={scheduler} onValueChange={onSchedulerChange} ariaLabel="Scheduler" menuTitle="Scheduler" options={schedulerOptions.map((option) => ({ value: option, label: option }))} size="sm" /></label>
            <label className="space-y-1"><span className="text-[8px] font-black uppercase text-zinc-500">Samples</span><input type="number" min="1" max="16" step="1" value={samples} onChange={(event) => setSamples(Math.max(1, Math.min(16, Math.round(Number(event.target.value) || 1))))} className="h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-xs text-zinc-100 outline-none focus:border-rose-300/40" /></label>
          </div>
          {capabilities.hiresFix.support === 'adjustable' ? (
            <UmbraHiresFixControls
              enabled={hiresFix.enabled}
              onEnabledChange={(enabled) => onHiresFixChange({ ...hiresFix, enabled })}
              upscaler={hiresFix.upscaler}
              onUpscalerChange={(upscaler) => onHiresFixChange({ ...hiresFix, upscaler })}
              upscaleModels={upscaleModels}
              resizeMode={hiresFix.resizeMode}
              onResizeModeChange={(resizeMode) => onHiresFixChange({ ...hiresFix, resizeMode })}
              scaleBy={hiresFix.scaleBy}
              onScaleByChange={(scaleBy) => onHiresFixChange({ ...hiresFix, scaleBy })}
              targetWidth={String(hiresFix.targetWidth)}
              onTargetWidthChange={(targetWidth) => onHiresFixChange({ ...hiresFix, targetWidth: Number(targetWidth) || 0 })}
              targetHeight={String(hiresFix.targetHeight)}
              onTargetHeightChange={(targetHeight) => onHiresFixChange({ ...hiresFix, targetHeight: Number(targetHeight) || 0 })}
              baseWidth={project.generationBbox.width}
              baseHeight={project.generationBbox.height}
              steps={String(hiresFix.steps)}
              onStepsChange={(nextSteps) => onHiresFixChange({ ...hiresFix, steps: Number(nextSteps) || 0 })}
              denoise={hiresFix.denoise}
              onDenoiseChange={(nextDenoise) => onHiresFixChange({ ...hiresFix, denoise: nextDenoise })}
              cfg={String(hiresFix.cfg)}
              onCfgChange={(nextCfg) => onHiresFixChange({ ...hiresFix, cfg: Number(nextCfg) || 0 })}
              samplerName={hiresFix.samplerName}
              onSamplerNameChange={(nextSampler) => onHiresFixChange({ ...hiresFix, samplerName: nextSampler })}
              scheduler={hiresFix.scheduler}
              onSchedulerChange={(nextScheduler) => onHiresFixChange({ ...hiresFix, scheduler: nextScheduler })}
              samplerOptions={samplerOptions}
              schedulerOptions={schedulerOptions}
              resizeModes={capabilities.hiresFix.resizeModes}
              showUpscaler={capabilities.hiresFix.controls.upscaler}
              showSteps={capabilities.hiresFix.controls.steps}
              showDenoise={capabilities.hiresFix.controls.denoise}
              showCfg={capabilities.hiresFix.controls.cfg}
              showSampler={capabilities.hiresFix.controls.sampler}
              showScheduler={capabilities.hiresFix.controls.scheduler}
            />
          ) : null}
          <UmbraTiledVaeControls value={tiledVae} onChange={onTiledVaeChange} mode="inpaint" />
          {capabilities.detailerStages.support === 'adjustable' ? (
            <UmbraDetailerPipelineControls
              stages={detailerPipeline}
              onStagesChange={onDetailerPipelineChange}
              detectorModels={detectorModels}
              samModels={samModels}
              samplerOptions={samplerOptions}
              schedulerOptions={schedulerOptions}
              upscaleModels={upscaleModels}
              outputUpscale={outputUpscale}
              onOutputUpscaleChange={onOutputUpscaleChange}
              showDetailer
              showOutputUpscale={false}
              allowCustomStages={capabilities.detailerStages.customStages}
              showStageControls={capabilities.detailerStages.customStages}
            />
          ) : null}
        </div>
      </aside>

      <aside data-umbra-canvas-inpaint-panel="" className={cn(
        'absolute bottom-0 left-[52px] top-0 z-20 w-[min(340px,calc(100%-52px))] min-h-0 overflow-y-auto border-r border-white/10 bg-[#090c0e] p-3 shadow-2xl custom-scrollbar 2xl:static 2xl:z-auto 2xl:block 2xl:w-auto 2xl:bg-black/15 2xl:shadow-none',
        compactPanel === 'inpaint' ? 'block' : 'hidden',
      )}>
        <div className="mb-3 flex items-center gap-2">
          <Focus size={14} className="text-cyan-300" />
          <div>
            <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Prompt & Inpaint</h2>
            <p className="font-mono text-[8px] uppercase text-zinc-600">Content and edge behavior</p>
          </div>
          <button type="button" aria-label="Close prompt and inpaint panel" onClick={() => setCompactPanel('')} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 2xl:hidden"><X size={13} /></button>
        </div>
        <div className="space-y-3">
          <UmbraPositivePromptEditor
            segments={promptSegments}
            activeSegmentId={activePromptSegmentId}
            onChange={onPromptSegmentsChange}
            onActiveSegmentChange={onActivePromptSegmentChange}
            accent="rose"
            heading="Canvas Prompt"
            onSubmit={() => void prepareGenerationRegion()}
            agentContext={{
              mode: 'canvas',
              modelFamily,
              modelType: modelSource,
              checkpointName,
              width: project.generationBbox.width,
              height: project.generationBbox.height,
              enabledLoras: loras.filter((entry) => entry.enabled).map((entry) => entry.name),
            }}
          />
          {capabilities.negativePrompt.support === 'adjustable' ? (
            <label className="block space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">Negative Prompt</span>
              <textarea value={negativePrompt} onChange={(event) => onNegativePromptChange(event.target.value)} placeholder="Negative prompt" className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs leading-relaxed text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-cyan-300/40" />
            </label>
          ) : null}
          <section className="rounded-md border border-white/10 bg-white/[0.02] p-2.5">
            <div className="mb-2 flex items-center gap-2"><ScanLine size={12} className="text-rose-300" /><span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-300">Edit Mode</span><span className="ml-auto font-mono text-[8px] uppercase text-zinc-600">{activeInpaintTaskMode ? CANVAS_INPAINT_TASK_MODES.find((mode) => mode.id === activeInpaintTaskMode)?.label : 'Custom'}</span></div>
            <div className="grid grid-cols-3 gap-1">
              {CANVAS_INPAINT_TASK_MODES.map((mode) => <button key={mode.id} type="button" onClick={() => applyInpaintTaskMode(mode.id)} className={cn('h-8 rounded-md border text-[8px] font-black uppercase', activeInpaintTaskMode === mode.id ? 'border-rose-300/35 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-500 hover:text-zinc-200')}>{mode.label}</button>)}
            </div>
          </section>
          <section className={cn('rounded-md border p-2.5', softInpaintEnabled ? 'border-cyan-300/20 bg-cyan-500/[0.035]' : 'border-white/10 bg-white/[0.02]')}>
            <div className="flex items-center gap-2"><Focus size={12} className={softInpaintEnabled ? 'text-cyan-300' : 'text-zinc-600'} /><span className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-300">Soft Inpaint</span><button type="button" role="switch" aria-checked={softInpaintEnabled} disabled={inpaintAdapter === 'native_edit'} onClick={() => setSoftInpaintEnabled((current) => !current)} className={cn('relative ml-auto h-5 w-9 rounded-full border', softInpaintEnabled ? 'border-cyan-300/40 bg-cyan-400/25' : 'border-white/15 bg-black/35')}><span className={cn('absolute top-0.5 h-3.5 w-3.5 rounded-full transition-[left,background-color]', softInpaintEnabled ? 'left-[18px] bg-cyan-200' : 'left-0.5 bg-zinc-600')} /></button></div>
            {inpaintAdapter === 'native_edit' ? <p className="mt-2 font-mono text-[8px] leading-relaxed text-zinc-600">This native edit pipeline owns its blend behavior.</p> : null}
            {softInpaintEnabled && inpaintAdapter !== 'native_edit' ? <div className="mt-3 space-y-3">
              <div className="grid grid-cols-3 gap-1">{CANVAS_INPAINT_BLEND_MODES.map((mode) => <button key={mode.id} type="button" onClick={() => applyInpaintBlendMode(mode.id)} className={cn('h-8 rounded-md border text-[8px] font-black uppercase', activeInpaintBlendMode === mode.id ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-500 hover:text-zinc-200')}>{mode.label}</button>)}</div>
              <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Edge Softness <span className="font-mono text-cyan-200">{maskFeather}px</span></span><input type="range" min="0" max="64" step="1" value={maskFeather} onChange={(event) => setMaskFeather(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>
              <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Source Protection <span className="font-mono text-cyan-200">{Math.round(softInpaintPreservation * 100)}%</span></span><input type="range" min="0" max="1" step="0.05" value={softInpaintPreservation} onChange={(event) => setSoftInpaintPreservation(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>
              <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Edge Contrast <span className="font-mono text-cyan-200">{softInpaintTransitionContrast.toFixed(2)}x</span></span><input type="range" min="0.25" max="4" step="0.05" value={softInpaintTransitionContrast} onChange={(event) => setSoftInpaintTransitionContrast(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>
            </div> : null}
          </section>
          <section className="space-y-3 rounded-md border border-white/10 bg-white/[0.02] p-2.5">
            <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Denoise <span className="font-mono text-rose-200">{denoise.toFixed(2)}</span></span><input type="range" min="0.05" max="1" step="0.01" value={denoise} onChange={(event) => setDenoise(Number(event.target.value))} className="mt-1 w-full accent-rose-300" /></label>
            <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Mask Grow <span className="font-mono text-rose-200">{maskGrow}px</span></span><input type="range" min="0" max="64" step="1" value={maskGrow} onChange={(event) => setMaskGrow(Number(event.target.value))} className="mt-1 w-full accent-rose-300" /></label>
            <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Context <span className="font-mono text-rose-200">{contextPadding}px</span></span><input type="range" min="0" max="256" step="8" value={contextPadding} onChange={(event) => setContextPadding(Number(event.target.value))} className="mt-1 w-full accent-rose-300" /></label>
            <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Color Match <span className="font-mono text-rose-200">{Math.round(colorMatch * 100)}%</span></span><input type="range" min="0" max="1" step="0.05" value={colorMatch} onChange={(event) => setColorMatch(Number(event.target.value))} className="mt-1 w-full accent-rose-300" /></label>
            <label className="block"><span className="flex justify-between text-[8px] font-black uppercase text-zinc-500">Mask Bias <span className="font-mono text-rose-200">{Math.round(softInpaintMaskInfluence * 100)}%</span></span><input type="range" min="0" max="1" step="0.05" value={softInpaintMaskInfluence} onChange={(event) => setSoftInpaintMaskInfluence(Number(event.target.value))} className="mt-1 w-full accent-rose-300" /></label>
          </section>
          <button type="button" onClick={() => void prepareGenerationRegion()} disabled={preparingRegion || submitting} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-rose-300/30 bg-rose-500/10 text-[10px] font-black uppercase tracking-[0.1em] text-rose-100 disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-700">{preparingRegion || submitting ? <LoaderCircle size={14} className="animate-spin" /> : <ScanLine size={14} />} {preparingRegion ? 'Preparing' : submitting ? 'Submitting' : 'Generate'}</button>
          {job ? <div className="rounded-md border border-white/10 bg-black/30 p-2.5 font-mono text-[9px] text-zinc-500"><div className="flex items-center gap-2"><span className="font-black uppercase text-zinc-300">{job.status}</span><span>{job.completed}/{job.total}</span>{!isUmbraUiInpaintJobTerminal(job) ? <button type="button" onClick={() => void cancelGeneration()} disabled={canceling} className="ml-auto text-rose-300 hover:text-rose-100">{canceling ? 'Canceling' : 'Cancel'}</button> : null}</div><div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-rose-400 transition-[width]" style={{ width: `${Math.round(job.completed / Math.max(1, job.total) * 100)}%` }} /></div></div> : null}
        </div>
      </aside>

      <div data-umbra-canvas-center="" className="col-start-2 grid min-h-0 min-w-0 grid-rows-[42px_minmax(0,1fr)_auto_38px] 2xl:col-start-auto">
        <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-white/10 bg-black/25 px-3 custom-scrollbar">
          <button type="button" title="Generation controls" aria-label="Open generation controls" onClick={() => setCompactPanel((current) => current === 'generation' ? '' : 'generation')} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-rose-300/20 text-rose-200 2xl:hidden"><PanelLeftOpen size={13} /></button>
          <button type="button" title="Prompt and inpaint controls" aria-label="Open prompt and inpaint controls" onClick={() => setCompactPanel((current) => current === 'inpaint' ? '' : 'inpaint')} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 text-cyan-200 2xl:hidden"><Focus size={13} /></button>
          <input
            value={project.name}
            onChange={(event) => renameProject(event.target.value)}
            aria-label="Canvas project name"
            className="h-8 min-w-0 max-w-72 flex-1 rounded-md border border-transparent bg-transparent px-2 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-zinc-300 outline-none focus:border-cyan-300/25 focus:bg-black/35"
          />
          <button type="button" onClick={startBlankProject} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[9px] font-black uppercase text-zinc-500 hover:text-cyan-100"><Layers3 size={12} /> New</button>
          <button type="button" onClick={openProjectBrowser} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-[9px] font-black uppercase text-zinc-500 hover:text-cyan-100"><FolderOpen size={12} /> Projects</button>
          <button type="button" title={saveError ? `Last save failed: ${saveError}` : 'Save Canvas project'} onClick={() => void saveProject()} disabled={saving || project.entities.length === 0} className={cn('inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[9px] font-black uppercase disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-700', saveError ? 'border-amber-300/35 bg-amber-400/[0.08] text-amber-100' : 'border-cyan-300/20 bg-cyan-500/[0.06] text-cyan-100')}><Save size={12} /> {saving ? 'Saving' : saveError ? 'Retry Save' : 'Save'}</button>
          <button type="button" title="Save project as a new copy" aria-label="Save project as a new copy" onClick={() => void forkProject()} disabled={forkingProject || saving || project.entities.length === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800">{forkingProject ? <LoaderCircle size={12} className="animate-spin" /> : <Copy size={12} />}</button>
          <button type="button" title="Export portable Canvas project" aria-label="Export portable Canvas project" onClick={() => void exportProject()} disabled={archiving || project.entities.length === 0} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800"><Download size={12} /></button>
          <button type="button" title="Import portable Canvas project" aria-label="Import portable Canvas project" onClick={() => archiveInputRef.current?.click()} disabled={archiving} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800"><Upload size={12} /></button>
          <button type="button" onClick={() => void prepareGenerationRegion()} disabled={preparingRegion || submitting} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-rose-300/25 bg-rose-500/[0.08] px-2.5 text-[9px] font-black uppercase text-rose-100 disabled:text-zinc-700">{preparingRegion || submitting ? <LoaderCircle size={12} className="animate-spin" /> : <ScanLine size={12} />} {preparingRegion ? 'Preparing' : submitting ? 'Submitting' : 'Generate'}</button>
          {tool === 'bbox' ? (
            <div className="flex shrink-0 items-center gap-1 border-l border-white/10 pl-2">
              {(['x', 'y', 'width', 'height'] as const).map((field) => (
                <label key={field} className="font-mono text-[7px] uppercase text-zinc-600">{field === 'width' ? 'W' : field === 'height' ? 'H' : field.toUpperCase()}
                  <input type="number" aria-label={`Generation ${field}`} value={Math.round(project.generationBbox[field])} onChange={(event) => setGenerationBbox({ [field]: Number(event.target.value) })} className="ml-1 h-7 w-16 rounded-md border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none focus:border-rose-300/35" />
                </label>
              ))}
              <UmbraSelect
                ariaLabel="Generation aspect ratio"
                value=""
                placeholder="Ratio"
                menuTitle="Generation Ratio"
                size="xs"
                className="w-[112px]"
                options={[...UMBRA_CANVAS_GENERATION_RATIO_OPTIONS]}
                onValueChange={(value) => {
                  const [ratioWidth, ratioHeight] = value.split(':').map(Number);
                  if (!ratioWidth || !ratioHeight) return;
                  const longSide = Math.max(project.generationBbox.width, project.generationBbox.height);
                  setGenerationBbox(ratioWidth >= ratioHeight
                    ? { width: longSide, height: longSide * ratioHeight / ratioWidth }
                    : { width: longSide * ratioWidth / ratioHeight, height: longSide });
                }}
                buttonClassName="font-mono uppercase text-zinc-400 focus-visible:border-rose-300/35"
              />
              <button type="button" title="Fit generation box to enabled layers" aria-label="Fit generation box to enabled layers" onClick={() => fitGenerationBbox('drawables')} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><Layers3 size={11} /></button>
              <button type="button" title="Fit generation box to enabled masks" aria-label="Fit generation box to enabled masks" onClick={() => fitGenerationBbox('masks')} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-rose-100"><Brush size={11} /></button>
            </div>
          ) : null}
          <div className="ml-auto flex shrink-0 items-center gap-2 font-mono text-[9px] text-zinc-600">
            <span>{Math.round(project.viewport.scale * 100)}%</span>
            <span>{project.generationBbox.width} x {project.generationBbox.height}</span>
            <span>{project.generationAlignment}px</span>
            <button type="button" title="Canvas layers" aria-label="Open Canvas layers" onClick={() => setCompactPanel((current) => current === 'layers' ? '' : 'layers')} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-cyan-300/20 text-cyan-200 2xl:hidden"><PanelRightOpen size={13} /></button>
          </div>
        </div>
        <div
          ref={containerRef}
          data-umbra-canvas-viewport=""
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files') || event.dataTransfer.types.includes(UMBRA_GALLERY_DRAG_PATHS_MIME)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(event) => {
            if (event.dataTransfer.files.length > 0) {
              event.preventDefault();
              void importImages(event.dataTransfer.files);
              return;
            }
            const rawPaths = event.dataTransfer.getData(UMBRA_GALLERY_DRAG_PATHS_MIME);
            if (!rawPaths) return;
            event.preventDefault();
            try {
              const paths = JSON.parse(rawPaths);
              if (Array.isArray(paths)) void importGalleryPaths(paths.map((path) => String(path || '')));
            } catch {
              showToast('The Gallery drag payload could not be read.', 'error');
            }
          }}
          className="relative min-h-0 overflow-hidden bg-[#090b0c] [background-image:linear-gradient(45deg,rgba(255,255,255,0.018)_25%,transparent_25%),linear-gradient(-45deg,rgba(255,255,255,0.018)_25%,transparent_25%),linear-gradient(45deg,transparent_75%,rgba(255,255,255,0.018)_75%),linear-gradient(-45deg,transparent_75%,rgba(255,255,255,0.018)_75%)] [background-position:0_0,0_8px,8px_-8px,-8px_0px] [background-size:16px_16px]"
        />
        {stages.length > 0 ? (
          <section data-umbra-canvas-staging-strip="" aria-label="Canvas staging strip" className="flex min-h-28 items-stretch gap-2 overflow-x-auto border-t border-white/10 bg-black/40 p-2 custom-scrollbar">
            <div className="flex w-36 shrink-0 flex-col justify-center">
              <strong className="text-[9px] font-black uppercase tracking-[0.1em] text-zinc-300">Staging</strong>
              <span className="mt-1 font-mono text-[8px] uppercase text-zinc-600">{stages.length} sample{stages.length === 1 ? '' : 's'}</span>
              <button type="button" onClick={() => setSelectedStageIds((current) => current.size === stages.length ? new Set() : new Set(stages.map((stage) => stage.id)))} className="mt-2 text-left font-mono text-[8px] uppercase text-cyan-300/70 hover:text-cyan-100">{selectedStageIds.size === stages.length ? 'Clear selection' : 'Select all'}</button>
              {previewStage ? <label className="mt-2 block font-mono text-[7px] uppercase text-zinc-600">A/B reveal <span className="float-right text-cyan-200">{Math.round(stagingReveal * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={stagingReveal} onChange={(event) => setStagingReveal(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label> : null}
              {selectedStageIds.size > 0 ? <button type="button" onClick={() => void (async () => { for (const stage of stages.filter((entry) => selectedStageIds.has(entry.id) && !entry.acceptedEntityId)) await acceptStage(stage, 'layer'); })()} className="mt-1 text-left font-mono text-[8px] uppercase text-cyan-300/70 hover:text-cyan-100">Layer selected</button> : null}
              {selectedStageIds.size > 0 ? <button type="button" onClick={() => { selectedStageIds.forEach(discardStagedGeneration); setSelectedStageIds(new Set()); }} className="mt-1 text-left font-mono text-[8px] uppercase text-rose-300/70 hover:text-rose-200">Discard selected</button> : null}
              <button type="button" onClick={() => { setPreviewStageId(''); clearStagedGenerations(); }} className="mt-1 text-left font-mono text-[8px] uppercase text-rose-300/70 hover:text-rose-200">Discard unpinned</button>
              {pinnedOutputFolders.length > 0 ? (
                <div className="mt-2 border-t border-white/10 pt-2">
                  <UmbraSelect value={stagingSaveDestination} onValueChange={setStagingSaveDestination} ariaLabel="Pinned Gallery save destination" menuTitle="Pinned Gallery Folder" options={[{ value: '', label: 'Pinned folder' }, ...pinnedOutputFolders.map((folder) => ({ value: folder, label: folder.replace(/\\/g, '/').split('/').pop() || folder }))]} size="xs" buttonClassName="font-mono uppercase text-zinc-400" />
                  <button type="button" disabled={savingStagedResults || selectedStageIds.size === 0 || !stagingSaveDestination} onClick={() => void saveSelectedStagesToPinnedFolder()} className="mt-1 inline-flex h-7 w-full items-center justify-center gap-1 rounded-md border border-cyan-300/20 text-[7px] font-black uppercase text-cyan-200 disabled:border-white/10 disabled:text-zinc-700">{savingStagedResults ? <LoaderCircle size={9} className="animate-spin" /> : <Save size={9} />} Save selected</button>
                </div>
              ) : null}
            </div>
            {stages.map((stage) => {
              const hasConflict = Boolean(stage.snapshotSignature && stage.snapshotSignature !== currentSnapshotSignature);
              return (
              <article key={stage.id} style={{ contentVisibility: 'auto', containIntrinsicSize: '288px 112px' }} className={cn('relative flex w-72 shrink-0 gap-2 rounded-md border bg-white/[0.025] p-1.5', selectedStageIds.has(stage.id) ? 'ring-1 ring-cyan-300/40' : '', previewStageId === stage.id ? 'border-cyan-300/35' : hasConflict ? 'border-amber-300/30' : 'border-white/10')}>
                <input type="checkbox" checked={selectedStageIds.has(stage.id)} onChange={() => setSelectedStageIds((current) => { const next = new Set(current); if (next.has(stage.id)) next.delete(stage.id); else next.add(stage.id); return next; })} aria-label={`Select staged sample ${stage.seed}`} className="absolute left-2 top-2 z-10 h-4 w-4 accent-cyan-300" />
                <button type="button" aria-label={`${previewStageId === stage.id ? 'Hide' : 'Preview'} staged sample ${stage.seed}`} onClick={() => setPreviewStageId((current) => current === stage.id ? '' : stage.id)} className="relative aspect-square h-full min-h-20 max-h-24 w-24 shrink-0 overflow-hidden rounded-sm border border-white/10 bg-black">
                  <img src={stage.imageUrl} alt={`Canvas staged sample ${stage.seed}`} className="h-full w-full object-cover" />
                  <span className="absolute bottom-1 right-1 inline-flex h-5 w-5 items-center justify-center rounded-sm bg-black/75 text-cyan-100">{previewStageId === stage.id ? <EyeOff size={10} /> : <Eye size={10} />}</span>
                </button>
                <div className="flex min-w-0 flex-1 flex-col py-1">
                  <span className="truncate font-mono text-[8px] uppercase text-zinc-500">Seed {stage.seed}</span>
                  <span className="mt-1 font-mono text-[8px] text-zinc-700">{stage.bbox.width} x {stage.bbox.height}</span>
                  {hasConflict ? <span className="mt-1 font-mono text-[7px] font-black uppercase text-amber-200">Canvas changed after submit</span> : null}
                  <div className="mt-auto grid grid-cols-[1fr_1fr_auto] gap-1">
                    <button type="button" onClick={() => void acceptStage(stage, 'replace')} disabled={Boolean(stage.acceptedEntityId)} className="inline-flex h-7 items-center justify-center rounded-md border border-rose-300/25 bg-rose-500/[0.08] text-[7px] font-black uppercase text-rose-100 disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-600">Replace</button>
                    <button type="button" onClick={() => void acceptStage(stage, 'layer')} disabled={Boolean(stage.acceptedEntityId)} className="inline-flex h-7 items-center justify-center gap-1 rounded-md border border-cyan-300/25 bg-cyan-500/[0.08] text-[7px] font-black uppercase text-cyan-100 disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-600"><ImagePlus size={9} /> {stage.acceptedEntityId ? 'Accepted' : 'Layer'}</button>
                    <details className="group relative">
                      <summary title="Send staged result" aria-label={`Send staged sample ${stage.seed}`} className="inline-flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-cyan-300/25 hover:text-cyan-100 [&::-webkit-details-marker]:hidden"><Send size={10} /></summary>
                      <div className="absolute bottom-9 right-0 z-30 w-36 rounded-md border border-cyan-300/20 bg-[#080b0d] p-1 shadow-2xl shadow-black/80">
                        <button type="button" onClick={() => void sendStagedResult(stage, 'img2img')} className="flex h-7 w-full items-center rounded-sm px-2 text-left text-[7px] font-black uppercase text-zinc-300 hover:bg-white/[0.06]">Img2Img</button>
                        <button type="button" onClick={() => void sendStagedResult(stage, 'inpaint')} className="flex h-7 w-full items-center rounded-sm px-2 text-left text-[7px] font-black uppercase text-zinc-300 hover:bg-white/[0.06]">Inpaint</button>
                        <button type="button" onClick={() => void sendStagedResult(stage, 'video')} className="flex h-7 w-full items-center rounded-sm px-2 text-left text-[7px] font-black uppercase text-zinc-300 hover:bg-white/[0.06]">Img2Vid</button>
                        <button type="button" onClick={() => void sendStagedResult(stage, 'extras')} className="flex h-7 w-full items-center rounded-sm px-2 text-left text-[7px] font-black uppercase text-zinc-300 hover:bg-white/[0.06]">Extras</button>
                      </div>
                    </details>
                  </div>
                  <div className="mt-1 flex justify-end gap-1">
                    <button type="button" aria-label={`${stage.pinned ? 'Unpin' : 'Pin'} staged sample ${stage.seed}`} onClick={() => toggleStagedGenerationPin(stage.id)} className={cn('inline-flex h-7 w-7 items-center justify-center rounded-md border', stage.pinned ? 'border-amber-300/30 bg-amber-500/10 text-amber-200' : 'border-white/10 text-zinc-600 hover:text-amber-200')}><Pin size={10} /></button>
                    <button type="button" aria-label={`Discard staged sample ${stage.seed}`} onClick={() => { setPreviewStageId((current) => current === stage.id ? '' : current); discardStagedGeneration(stage.id); }} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-600 hover:border-rose-300/25 hover:text-rose-200"><Trash2 size={10} /></button>
                  </div>
                </div>
              </article>
            );})}
          </section>
        ) : null}
        <div className="flex items-center gap-3 border-t border-white/10 bg-black/30 px-3 font-mono text-[9px] text-zinc-600">
          <span className="text-cyan-300">WORLD</span>
          <span>X {Math.round(project.viewport.x)}</span>
          <span>Y {Math.round(project.viewport.y)}</span>
          <span className="ml-auto">{project.entities.length} layer{project.entities.length === 1 ? '' : 's'}</span>
        </div>
      </div>

      <aside data-umbra-canvas-layers-panel="" className={cn(
        'absolute bottom-0 right-0 top-0 z-20 w-[min(340px,calc(100%-52px))] min-h-0 flex-col border-l border-white/10 bg-[#090c0e] shadow-2xl 2xl:static 2xl:z-auto 2xl:flex 2xl:w-auto 2xl:bg-black/30 2xl:shadow-none',
        compactPanel === 'layers' ? 'flex' : 'hidden',
      )}>
        <div className="flex h-11 items-center gap-2 border-b border-white/10 px-3">
          <Layers3 size={13} className="text-cyan-300" />
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">Layers</span>
          {selectedEntityIds.size > 1 ? <span className="rounded-sm border border-cyan-300/20 bg-cyan-500/[0.06] px-1.5 py-0.5 font-mono text-[7px] uppercase text-cyan-200">{selectedEntityIds.size} selected</span> : null}
          <button type="button" onClick={() => fileInputRef.current?.click()} title="Import image layer" className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><ImagePlus size={12} /></button>
          <button type="button" onClick={() => void mergeVisibleLayers()} disabled={mergingLayers || saving} title="Merge enabled visible layers" aria-label="Merge enabled visible layers" className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800">{mergingLayers ? <LoaderCircle size={12} className="animate-spin" /> : <Combine size={12} />}</button>
          <button type="button" aria-label="Close layers panel" onClick={() => setCompactPanel('')} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 text-zinc-500 2xl:hidden"><X size={12} /></button>
        </div>
        <label className="relative mx-2 mt-2 block">
          <Search size={11} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input value={layerSearch} onChange={(event) => setLayerSearch(event.target.value)} placeholder="Search layers" aria-label="Search Canvas layers" className="h-8 w-full rounded-md border border-white/10 bg-black/35 pl-7 pr-2 font-mono text-[9px] text-zinc-300 outline-none placeholder:text-zinc-700 focus:border-cyan-300/30" />
        </label>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visibleEntities.map((entity) => (
            <div
              key={entity.id}
              data-canvas-layer-row=""
              data-canvas-layer-id={entity.id}
              data-canvas-layer-active={entity.id === project.activeEntityId ? 'true' : 'false'}
              data-canvas-layer-selected={selectedEntityIds.has(entity.id) ? 'true' : 'false'}
              data-canvas-layer-x={isUmbraCanvasDrawableEntity(entity) || entity.kind === 'mask' ? entity.x : ''}
              data-canvas-layer-y={isUmbraCanvasDrawableEntity(entity) || entity.kind === 'mask' ? entity.y : ''}
              style={{ contentVisibility: 'auto', containIntrinsicSize: '52px' }}
              className={cn(
                'mb-1 grid w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-1.5 text-left',
                entity.id === project.activeEntityId
                  ? 'border-cyan-300/35 bg-cyan-500/[0.1]'
                  : selectedEntityIds.has(entity.id)
                    ? 'border-cyan-300/20 bg-cyan-500/[0.05]'
                    : 'border-white/10 bg-white/[0.02] hover:border-white/20',
              )}
            >
              <button type="button" onClick={(event) => handleSelectEntity(entity.id, event.shiftKey || event.ctrlKey || event.metaKey)} aria-label={`Select ${entity.name}`} className="col-span-2 grid min-w-0 grid-cols-[32px_minmax(0,1fr)] items-center gap-2 text-left">
                {entity.kind === 'raster'
                  ? <img src={entity.imageUrl} alt="" className="h-8 w-8 rounded-sm border border-white/10 object-cover" draggable={false} />
                  : <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-sm border', entity.kind === 'mask' ? 'border-rose-300/20 bg-rose-500/10 text-rose-200' : entity.kind === 'regional-guidance' ? 'border-violet-300/20 bg-violet-500/10 text-violet-200' : entity.kind === 'control' ? 'border-amber-300/20 bg-amber-500/10 text-amber-200' : entity.kind === 'reference' ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-200' : 'border-cyan-300/20 bg-cyan-500/10 text-cyan-200')}>
                      {entity.kind === 'mask' ? <Brush size={13} /> : entity.kind === 'regional-guidance' ? <Sparkles size={13} /> : entity.kind === 'control' ? <ScanLine size={13} /> : entity.kind === 'reference' ? <ImagePlus size={13} /> : entity.kind === 'shape' ? (entity.shape === 'ellipse' ? <Circle size={13} /> : <Square size={13} />) : entity.kind === 'text' ? <Type size={13} /> : entity.kind === 'path' ? <Spline size={13} /> : <Blend size={13} />}
                    </span>}
                <span className="min-w-0">
                  <strong className="block truncate text-[9px] font-black uppercase text-zinc-300">{entity.name}</strong>
                  <small className="block truncate font-mono text-[8px] text-zinc-600">{entity.kind === 'mask' ? `${entity.strokes.length} strokes` : entity.kind === 'regional-guidance' ? 'Regional guidance' : entity.kind === 'control' ? `${entity.adapterType} / ${entity.controlType}` : entity.kind === 'reference' ? entity.method : `${entity.width} x ${entity.height}`}</small>
                </span>
              </button>
              <span className="flex items-center gap-0.5">
                <button type="button" aria-label={entity.generationEnabled ? `Exclude ${entity.name} from generation` : `Include ${entity.name} in generation`} title={entity.generationEnabled ? 'Included in generation' : 'Excluded from generation'} onClick={() => toggleEntityGeneration(entity.id)} className={cn('inline-flex h-7 w-7 items-center justify-center hover:text-cyan-100', entity.generationEnabled ? 'text-cyan-300' : 'text-zinc-700')}><Sparkles size={11} /></button>
                {isUmbraCanvasDrawableEntity(entity) || entity.kind === 'mask' ? <button type="button" aria-label={entity.visible ? `Hide ${entity.name}` : `Show ${entity.name}`} title={entity.visible ? 'Hide layer' : 'Show layer'} onClick={() => toggleEntityVisibility(entity.id)} className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:text-cyan-100">{entity.visible ? <Eye size={11} /> : <EyeOff size={11} />}</button> : <span className="inline-flex h-7 w-7 items-center justify-center text-zinc-800"><Focus size={10} /></span>}
                <button type="button" aria-label={entity.locked ? `Unlock ${entity.name}` : `Lock ${entity.name}`} title={entity.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => toggleEntityLock(entity.id)} className="inline-flex h-7 w-7 items-center justify-center text-zinc-500 hover:text-cyan-100">{entity.locked ? <Lock size={11} /> : <Unlock size={11} />}</button>
              </span>
            </div>
          ))}
          {visibleEntities.length === 0 ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex h-24 w-full items-center justify-center gap-2 rounded-md border border-dashed border-white/10 font-mono text-[9px] uppercase text-zinc-600 hover:border-cyan-300/25 hover:text-cyan-100"><ImagePlus size={13} /> Import image</button>
          ) : null}
        </div>
        {activeEntity ? (
          <div className="max-h-[56%] space-y-2 overflow-y-auto border-t border-white/10 p-2">
            {activeEntity.kind === 'raster' ? (
              <>
                <input value={activeEntity.name} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { name: event.target.value })} aria-label="Active layer name" className="h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 font-mono text-[9px] uppercase text-zinc-300 outline-none focus:border-cyan-300/30 disabled:text-zinc-700" />
                <div className="grid grid-cols-3 gap-1">
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">X<input type="number" value={Math.round(activeEntity.x)} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { x: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300 outline-none focus:border-cyan-300/30" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Y<input type="number" value={Math.round(activeEntity.y)} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { y: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300 outline-none focus:border-cyan-300/30" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Rotate<input type="number" value={Math.round(activeEntity.rotation * 10) / 10} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { rotation: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300 outline-none focus:border-cyan-300/30" /></label>
                </div>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Opacity <span className="float-right text-cyan-300">{Math.round(activeEntity.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={activeEntity.opacity} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { opacity: Number(event.target.value) })} className="mt-1 w-full accent-cyan-300" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Blend mode<UmbraSelect className="mt-1" value={activeEntity.blendMode} disabled={activeEntity.locked} onValueChange={(blendMode) => updateRaster(activeEntity.id, { blendMode: blendMode as typeof activeEntity.blendMode })} ariaLabel="Blend mode" menuTitle="Blend Mode" options={UMBRA_CANVAS_BLEND_MODES.map((option) => ({ value: option.value, label: option.label }))} size="sm" buttonClassName="font-mono uppercase" /></label>
                <details className="rounded-md border border-white/10 bg-black/20">
                  <summary className="cursor-pointer px-2 py-2 font-mono text-[8px] font-black uppercase text-zinc-400">Image adjustments</summary>
                  <div className="space-y-1.5 border-t border-white/10 p-2">
                    <label className="block font-mono text-[8px] uppercase text-zinc-600">Brightness <span className="float-right text-cyan-200">{activeEntity.adjustments.brightness > 0 ? '+' : ''}{activeEntity.adjustments.brightness}%</span><input type="range" min="-100" max="100" step="1" value={activeEntity.adjustments.brightness} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { adjustments: { ...activeEntity.adjustments, brightness: Number(event.target.value) } })} className="mt-1 w-full accent-cyan-300" /></label>
                    <label className="block font-mono text-[8px] uppercase text-zinc-600">Contrast <span className="float-right text-cyan-200">{activeEntity.adjustments.contrast > 0 ? '+' : ''}{activeEntity.adjustments.contrast}%</span><input type="range" min="-100" max="100" step="1" value={activeEntity.adjustments.contrast} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { adjustments: { ...activeEntity.adjustments, contrast: Number(event.target.value) } })} className="mt-1 w-full accent-cyan-300" /></label>
                    <label className="block font-mono text-[8px] uppercase text-zinc-600">Saturation <span className="float-right text-cyan-200">{activeEntity.adjustments.saturation > 0 ? '+' : ''}{activeEntity.adjustments.saturation}%</span><input type="range" min="-100" max="200" step="1" value={activeEntity.adjustments.saturation} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { adjustments: { ...activeEntity.adjustments, saturation: Number(event.target.value) } })} className="mt-1 w-full accent-cyan-300" /></label>
                    <label className="block font-mono text-[8px] uppercase text-zinc-600">Hue <span className="float-right text-cyan-200">{activeEntity.adjustments.hue}deg</span><input type="range" min="-180" max="180" step="1" value={activeEntity.adjustments.hue} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { adjustments: { ...activeEntity.adjustments, hue: Number(event.target.value) } })} className="mt-1 w-full accent-cyan-300" /></label>
                    <label className="block font-mono text-[8px] uppercase text-zinc-600">Blur <span className="float-right text-cyan-200">{activeEntity.adjustments.blur}px</span><input type="range" min="0" max="128" step="0.5" value={activeEntity.adjustments.blur} disabled={activeEntity.locked} onChange={(event) => updateRaster(activeEntity.id, { adjustments: { ...activeEntity.adjustments, blur: Number(event.target.value) } })} className="mt-1 w-full accent-cyan-300" /></label>
                    <button type="button" disabled={activeEntity.locked} onClick={() => updateRaster(activeEntity.id, { adjustments: { ...UMBRA_CANVAS_DEFAULT_RASTER_ADJUSTMENTS } })} className="h-7 w-full rounded-md border border-white/10 text-[8px] font-black uppercase text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800">Reset adjustments</button>
                  </div>
                </details>
                <div className="rounded-md border border-white/10 bg-black/20 p-2">
                  <div className="flex items-center gap-1.5">
                    {UMBRA_CANVAS_RASTER_PAINT_ENABLED ? <button type="button" onClick={() => activateRasterTool('raster-brush')} className={cn('inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border text-[8px] font-black uppercase', tool === 'raster-brush' ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-500')}><Brush size={11} /> Paint</button> : null}
                    <button type="button" onClick={() => activateRasterTool('raster-eraser')} disabled={activeEntity.alphaLocked} className={cn('inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-md border text-[8px] font-black uppercase disabled:text-zinc-800', tool === 'raster-eraser' ? 'border-rose-300/35 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-500')}><Eraser size={11} /> Erase</button>
                    {UMBRA_CANVAS_RASTER_PAINT_ENABLED ? <input type="color" value={rasterBrushColor} onChange={(event) => setRasterBrushColor(event.target.value)} title="Raster brush color" aria-label="Raster brush color" className="h-8 w-9 cursor-pointer rounded-md border border-white/10 bg-transparent p-1" /> : null}
                  </div>
                  <label className="mt-2 block font-mono text-[8px] uppercase text-zinc-600">Brush size <span className="float-right text-cyan-200">{rasterBrushSize}px</span><input type="range" min="4" max="512" step="4" value={rasterBrushSize} onChange={(event) => setRasterBrushSize(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>
                  <label className="mt-1 block font-mono text-[8px] uppercase text-zinc-600">Brush opacity <span className="float-right text-cyan-200">{Math.round(rasterBrushOpacity * 100)}%</span><input type="range" min="0.05" max="1" step="0.05" value={rasterBrushOpacity} onChange={(event) => setRasterBrushOpacity(Number(event.target.value))} className="mt-1 w-full accent-cyan-300" /></label>
                  <button type="button" disabled={activeEntity.locked || activeEntity.strokes.length === 0} onClick={() => clearRasterStrokes(activeEntity.id)} className="mt-1 h-7 w-full rounded-md border border-rose-300/15 text-[8px] font-black uppercase text-rose-300/60 disabled:text-zinc-800">Clear layer edits ({activeEntity.strokes.length})</button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" disabled={!controlLayersAvailable || controlLayers.length >= canvasCapabilities.controlLayers.maxLayers} title={controlLayersReason || 'Use this image as a Control layer'} onClick={() => createControlFromRaster(activeEntity.id)} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-amber-300/20 text-[8px] font-black uppercase text-amber-200 disabled:text-zinc-800"><ScanLine size={11} /> Control</button>
                  <button type="button" disabled={!referenceLayersAvailable || referenceLayers.length >= canvasCapabilities.referenceLayers.maxLayers} title={referenceLayersReason || 'Use this image as a Reference layer'} onClick={() => createReferenceFromRaster(activeEntity.id)} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-emerald-300/20 text-[8px] font-black uppercase text-emerald-200 disabled:text-zinc-800"><ImagePlus size={11} /> Reference</button>
                </div>
                <button
                  type="button"
                  title="Protect visible pixels and create an editable mask around this transparent image"
                  onClick={() => createPaintAroundMaskFromRaster(activeEntity.id)}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-rose-300/25 bg-rose-500/[0.06] text-[8px] font-black uppercase text-rose-100 hover:border-rose-300/45 hover:bg-rose-500/[0.1]"
                ><Sparkles size={12} /> Paint around source</button>
                <div className="grid grid-cols-6 gap-1">
                  <button type="button" title={selectedEntityIds.size > 1 ? 'Duplicate selected layers' : 'Duplicate layer'} aria-label={selectedEntityIds.size > 1 ? 'Duplicate selected layers' : 'Duplicate layer'} onClick={duplicateSelection} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><Copy size={12} /></button>
                  <button type="button" title="Crop layer to generation box" aria-label="Crop layer to generation box" disabled={activeEntity.locked || croppingRaster || saving} onClick={() => void cropRasterToGenerationBbox(activeEntity.id)} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800">{croppingRaster ? <LoaderCircle size={12} className="animate-spin" /> : <Crop size={12} />}</button>
                  <button type="button" title="Flip layer horizontally" aria-label="Flip layer horizontally" disabled={activeEntity.locked} onClick={() => updateRaster(activeEntity.id, { scaleX: activeEntity.scaleX * -1 })} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800"><FlipHorizontal2 size={12} /></button>
                  <button type="button" title="Flip layer vertically" aria-label="Flip layer vertically" disabled={activeEntity.locked} onClick={() => updateRaster(activeEntity.id, { scaleY: activeEntity.scaleY * -1 })} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800"><FlipVertical2 size={12} /></button>
                  <button type="button" title="Rotate layer 90 degrees" aria-label="Rotate layer 90 degrees" disabled={activeEntity.locked} onClick={() => updateRaster(activeEntity.id, { rotation: activeEntity.rotation + 90 })} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100 disabled:text-zinc-800"><RotateCw size={12} /></button>
                  <button type="button" title={activeEntity.alphaLocked ? 'Unlock transparent pixels' : 'Lock transparent pixels'} aria-label={activeEntity.alphaLocked ? 'Unlock transparent pixels' : 'Lock transparent pixels'} onClick={() => toggleEntityAlphaLock(activeEntity.id)} className={cn('inline-flex h-8 items-center justify-center rounded-md border', activeEntity.alphaLocked ? 'border-cyan-300/30 text-cyan-200' : 'border-white/10 text-zinc-500 hover:text-cyan-100')}><ShieldCheck size={12} /></button>
                </div>
              </>
            ) : activeEntity.kind === 'mask' ? (
              <>
                <input value={activeEntity.name} disabled={activeEntity.locked} onChange={(event) => updateMask(activeEntity.id, { name: event.target.value })} aria-label="Active mask name" className="h-8 w-full rounded-md border border-rose-300/20 bg-black/35 px-2 font-mono text-[9px] uppercase text-rose-100 outline-none focus:border-rose-300/45 disabled:text-zinc-700" />
                <div className="grid grid-cols-3 gap-1">
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">X<input type="number" value={Math.round(activeEntity.x)} disabled={activeEntity.locked} onChange={(event) => updateDrawableTransform(activeEntity.id, { x: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Y<input type="number" value={Math.round(activeEntity.y)} disabled={activeEntity.locked} onChange={(event) => updateDrawableTransform(activeEntity.id, { y: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Rotate<input type="number" value={Math.round(activeEntity.rotation * 10) / 10} disabled={activeEntity.locked} onChange={(event) => updateDrawableTransform(activeEntity.id, { rotation: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Scale X<input type="number" step="0.05" value={Math.round(activeEntity.scaleX * 100) / 100} disabled={activeEntity.locked} onChange={(event) => updateDrawableTransform(activeEntity.id, { scaleX: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Scale Y<input type="number" step="0.05" value={Math.round(activeEntity.scaleY * 100) / 100} disabled={activeEntity.locked} onChange={(event) => updateDrawableTransform(activeEntity.id, { scaleY: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  <button type="button" onClick={() => setTool('mask-brush')} className={cn('inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[8px] font-black uppercase', tool === 'mask-brush' ? 'border-rose-300/35 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-500')}><Brush size={11} /> Paint</button>
                  <button type="button" onClick={() => setTool('mask-eraser')} className={cn('inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[8px] font-black uppercase', tool === 'mask-eraser' ? 'border-rose-300/35 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-500')}><Eraser size={11} /> Erase</button>
                  <button type="button" onClick={() => setTool('mask-lasso')} className={cn('inline-flex h-8 items-center justify-center gap-1 rounded-md border text-[8px] font-black uppercase', tool === 'mask-lasso' ? 'border-rose-300/35 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-500')}><LassoSelect size={11} /> Lasso</button>
                </div>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Mask operation<UmbraSelect className="mt-1" value={activeEntity.operation} disabled={activeEntity.locked} onValueChange={(operation) => updateMask(activeEntity.id, { operation: operation as typeof activeEntity.operation })} ariaLabel="Mask operation" menuTitle="Mask Operation" options={[{ value: 'add', label: 'Add' }, { value: 'subtract', label: 'Subtract' }, { value: 'intersect', label: 'Intersect' }, { value: 'replace', label: 'Replace' }]} size="sm" buttonClassName="font-mono uppercase focus-visible:border-rose-300/30" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Brush size <span className="float-right text-rose-200">{maskBrushSize}px</span><input type="range" min="4" max="512" step="4" value={maskBrushSize} onChange={(event) => setMaskBrushSize(Number(event.target.value))} className="mt-1 w-full accent-rose-400" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Brush opacity <span className="float-right text-rose-200">{Math.round(maskBrushOpacity * 100)}%</span><input type="range" min="0.05" max="1" step="0.05" value={maskBrushOpacity} onChange={(event) => setMaskBrushOpacity(Number(event.target.value))} className="mt-1 w-full accent-rose-400" /></label>
                <div className="grid grid-cols-3 gap-1">
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Feather<input type="number" min="0" max="512" value={activeEntity.feather} disabled={activeEntity.locked} onChange={(event) => updateMask(activeEntity.id, { feather: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Grow<input type="number" min="-512" max="512" value={activeEntity.grow} disabled={activeEntity.locked} onChange={(event) => updateMask(activeEntity.id, { grow: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <button type="button" disabled={activeEntity.locked} onClick={() => updateMask(activeEntity.id, { inverted: !activeEntity.inverted })} className={cn('mt-4 h-8 rounded-md border text-[8px] font-black uppercase', activeEntity.inverted ? 'border-rose-300/35 bg-rose-500/10 text-rose-100' : 'border-white/10 text-zinc-500')}>Invert</button>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <button type="button" disabled={activeEntity.locked || activeEntity.strokes.length === 0} onClick={() => clearMask(activeEntity.id)} className="h-8 rounded-md border border-rose-300/15 text-[8px] font-black uppercase text-rose-300/60 disabled:text-zinc-800">Clear brush edits</button>
                  <button type="button" disabled={activeEntity.locked || !activeEntity.imageUrl} onClick={() => updateMask(activeEntity.id, { imageUrl: '', sourcePath: '' })} className="h-8 rounded-md border border-rose-300/15 text-[8px] font-black uppercase text-rose-300/60 disabled:text-zinc-800">Remove imported mask</button>
                </div>
                <button
                  type="button"
                  disabled={activeEntity.locked || (!activeEntity.imageUrl && activeEntity.strokes.length === 0) || canvasCapabilities.regionalGuidance.support === 'unsupported' || regionalGuides.length >= canvasCapabilities.regionalGuidance.maxLayers}
                  title={canvasCapabilities.regionalGuidance.reason || 'Use this mask for regional prompting'}
                  onClick={() => createRegionalGuideFromMask(activeEntity.id)}
                  className="inline-flex h-8 w-full items-center justify-center gap-1 rounded-md border border-violet-300/20 text-[8px] font-black uppercase text-violet-200 disabled:text-zinc-800"
                ><Sparkles size={11} /> Use as regional guide</button>
              </>
            ) : activeEntity.kind === 'regional-guidance' ? (
              <>
                <input value={activeEntity.name} disabled={activeEntity.locked} onChange={(event) => updateRegionalGuidance(activeEntity.id, { name: event.target.value })} aria-label="Regional guide name" className="h-8 w-full rounded-md border border-violet-300/20 bg-black/35 px-2 font-mono text-[9px] uppercase text-violet-100 outline-none focus:border-violet-300/45 disabled:text-zinc-700" />
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Mask<UmbraSelect className="mt-1" value={activeEntity.maskEntityId} disabled={activeEntity.locked} onValueChange={(maskEntityId) => updateRegionalGuidance(activeEntity.id, { maskEntityId })} ariaLabel="Regional guidance mask" menuTitle="Regional Guidance Mask" options={project.entities.filter((entity) => entity.kind === 'mask').map((mask) => ({ value: mask.id, label: mask.name }))} size="sm" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Positive prompt<textarea value={activeEntity.positivePrompt} disabled={activeEntity.locked || !canvasCapabilities.regionalGuidance.positivePrompt} onChange={(event) => updateRegionalGuidance(activeEntity.id, { positivePrompt: event.target.value })} className="mt-1 min-h-16 w-full resize-y rounded-md border border-white/10 bg-black/35 p-2 text-xs text-zinc-100 outline-none focus:border-violet-300/35 disabled:text-zinc-700" /></label>
                {canvasCapabilities.regionalGuidance.negativePrompt ? <label className="block font-mono text-[8px] uppercase text-zinc-600">Negative prompt<textarea value={activeEntity.negativePrompt} disabled={activeEntity.locked} onChange={(event) => updateRegionalGuidance(activeEntity.id, { negativePrompt: event.target.value })} className="mt-1 min-h-14 w-full resize-y rounded-md border border-white/10 bg-black/35 p-2 text-xs text-zinc-100 outline-none focus:border-violet-300/35" /></label> : null}
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Weight <span className="float-right text-violet-200">{activeEntity.weight.toFixed(2)}</span><input type="range" min="-2" max="2" step="0.05" value={activeEntity.weight} disabled={activeEntity.locked} onChange={(event) => updateRegionalGuidance(activeEntity.id, { weight: Number(event.target.value) })} className="mt-1 w-full accent-violet-400" /></label>
                <div className="grid grid-cols-2 gap-1">
                  <label className="font-mono text-[8px] uppercase text-zinc-600">Begin %<input type="number" min="0" max="100" value={Math.round(activeEntity.beginStepPercent * 100)} disabled={activeEntity.locked} onChange={(event) => updateRegionalGuidance(activeEntity.id, { beginStepPercent: Number(event.target.value) / 100 })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="font-mono text-[8px] uppercase text-zinc-600">End %<input type="number" min="0" max="100" value={Math.round(activeEntity.endStepPercent * 100)} disabled={activeEntity.locked} onChange={(event) => updateRegionalGuidance(activeEntity.id, { endStepPercent: Number(event.target.value) / 100 })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
                {canvasCapabilities.regionalGuidance.autoNegative ? <label className="flex items-center justify-between rounded-md border border-white/10 px-2 py-2 font-mono text-[8px] uppercase text-zinc-500">Auto negative<input type="checkbox" checked={activeEntity.autoNegative} disabled={activeEntity.locked} onChange={(event) => updateRegionalGuidance(activeEntity.id, { autoNegative: event.target.checked })} className="accent-violet-400" /></label> : null}
                <p className="font-mono text-[8px] leading-relaxed text-zinc-600">This guide affects only its linked mask and is not merged into the inpaint mask.</p>
              </>
            ) : activeEntity.kind === 'control' ? (
              <>
                <input value={activeEntity.name} disabled={activeEntity.locked} onChange={(event) => updateControl(activeEntity.id, { name: event.target.value })} aria-label="Control layer name" className="h-8 w-full rounded-md border border-amber-300/20 bg-black/35 px-2 font-mono text-[9px] uppercase text-amber-100 outline-none focus:border-amber-300/45" />
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Source image<UmbraSelect className="mt-1" value={activeEntity.rasterEntityId} disabled={activeEntity.locked} onValueChange={(rasterEntityId) => updateControl(activeEntity.id, { rasterEntityId })} ariaLabel="Control source image" menuTitle="Control Source Image" options={project.entities.filter((entity) => entity.kind === 'raster').map((raster) => ({ value: raster.id, label: raster.name }))} size="sm" /></label>
                <div className="grid grid-cols-2 gap-1">
                  <label className="font-mono text-[8px] uppercase text-zinc-600">Adapter<UmbraSelect className="mt-1" value={activeEntity.adapterType} disabled={activeEntity.locked} onValueChange={(value) => { const adapterType = value as UmbraUiInpaintControlAdapterType; updateControl(activeEntity.id, { adapterType, modelName: controlModelOptionsFor(adapterType)[0] || '' }); }} ariaLabel="Control adapter" menuTitle="Control Adapter" options={controlAdapterTypes.map((value) => ({ value, label: value }))} size="sm" /></label>
                  <label className="font-mono text-[8px] uppercase text-zinc-600">Mode<UmbraSelect className="mt-1" value={activeEntity.controlMode} disabled={activeEntity.locked} onValueChange={(controlMode) => updateControl(activeEntity.id, { controlMode: controlMode as UmbraUiInpaintControlMode })} ariaLabel="Control mode" menuTitle="Control Mode" options={controlModes.map((value) => ({ value, label: value }))} size="sm" /></label>
                </div>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Control type<UmbraSelect className="mt-1" value={activeEntity.controlType} disabled={activeEntity.locked} onValueChange={(controlType) => updateControl(activeEntity.id, { controlType: controlType as typeof activeEntity.controlType })} ariaLabel="Control type" menuTitle="Control Type" options={['raw','canny','depth','pose','lineart','lineart_anime','softedge','scribble','face_mesh','mlsd','normal_map','pidi','content_shuffle'].map((value) => ({ value, label: value }))} size="sm" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Model<UmbraSelect className="mt-1" value={activeEntity.modelName} disabled={activeEntity.locked} onValueChange={(modelName) => updateControl(activeEntity.id, { modelName })} ariaLabel="Control model" menuTitle="Control Model" options={[{ value: '', label: 'Pipeline default' }, ...controlModelOptionsFor(activeEntity.adapterType).map((value) => ({ value, label: value }))]} size="sm" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Weight <span className="float-right text-amber-200">{activeEntity.weight.toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" value={activeEntity.weight} disabled={activeEntity.locked} onChange={(event) => updateControl(activeEntity.id, { weight: Number(event.target.value) })} className="mt-1 w-full accent-amber-400" /></label>
                <div className="grid grid-cols-3 gap-1">
                  <label className="font-mono text-[8px] uppercase text-zinc-600">Begin %<input type="number" min="0" max="100" value={Math.round(activeEntity.beginStepPercent * 100)} onChange={(event) => updateControl(activeEntity.id, { beginStepPercent: Number(event.target.value) / 100 })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="font-mono text-[8px] uppercase text-zinc-600">End %<input type="number" min="0" max="100" value={Math.round(activeEntity.endStepPercent * 100)} onChange={(event) => updateControl(activeEntity.id, { endStepPercent: Number(event.target.value) / 100 })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="font-mono text-[8px] uppercase text-zinc-600">Preprocess<input type="number" min="64" max="8192" step="64" value={activeEntity.processorResolution} onChange={(event) => updateControl(activeEntity.id, { processorResolution: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
              </>
            ) : activeEntity.kind === 'reference' ? (
              <>
                <input value={activeEntity.name} disabled={activeEntity.locked} onChange={(event) => updateReference(activeEntity.id, { name: event.target.value })} aria-label="Reference layer name" className="h-8 w-full rounded-md border border-emerald-300/20 bg-black/35 px-2 font-mono text-[9px] uppercase text-emerald-100 outline-none focus:border-emerald-300/45" />
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Source image<UmbraSelect className="mt-1" value={activeEntity.rasterEntityId} disabled={activeEntity.locked} onValueChange={(rasterEntityId) => updateReference(activeEntity.id, { rasterEntityId })} ariaLabel="Reference source image" menuTitle="Reference Source Image" options={project.entities.filter((entity) => entity.kind === 'raster').map((raster) => ({ value: raster.id, label: raster.name }))} size="sm" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Method<UmbraSelect className="mt-1" value={activeEntity.method} disabled={activeEntity.locked} onValueChange={(value) => { const method = value as UmbraUiInpaintReferenceMethod; updateReference(activeEntity.id, { method, modelName: referenceModelOptionsFor(method)[0] || '' }); }} ariaLabel="Reference method" menuTitle="Reference Method" options={referenceMethods.map((value) => ({ value, label: value }))} size="sm" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Model<UmbraSelect className="mt-1" value={activeEntity.modelName} disabled={activeEntity.locked} onValueChange={(modelName) => updateReference(activeEntity.id, { modelName })} ariaLabel="Reference model" menuTitle="Reference Model" options={[{ value: '', label: 'Pipeline default' }, ...referenceModelOptionsFor(activeEntity.method).map((value) => ({ value, label: value }))]} size="sm" /></label>
                {activeEntity.method === 'ip_adapter' ? <label className="block font-mono text-[8px] uppercase text-zinc-600">Vision model<UmbraSelect className="mt-1" value={activeEntity.visionModelName} disabled={activeEntity.locked} onValueChange={(visionModelName) => updateReference(activeEntity.id, { visionModelName })} ariaLabel="Vision model" menuTitle="Vision Model" options={[{ value: '', label: 'Select model' }, ...visionModels.map((value) => ({ value, label: value }))]} size="sm" /></label> : null}
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Optional mask<UmbraSelect className="mt-1" value={activeEntity.maskEntityId} disabled={activeEntity.locked} onValueChange={(maskEntityId) => updateReference(activeEntity.id, { maskEntityId })} ariaLabel="Optional reference mask" menuTitle="Optional Reference Mask" options={[{ value: '', label: 'None' }, ...project.entities.filter((entity) => entity.kind === 'mask').map((mask) => ({ value: mask.id, label: mask.name }))]} size="sm" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Weight <span className="float-right text-emerald-200">{activeEntity.weight.toFixed(2)}</span><input type="range" min="0" max="2" step="0.05" value={activeEntity.weight} disabled={activeEntity.locked} onChange={(event) => updateReference(activeEntity.id, { weight: Number(event.target.value) })} className="mt-1 w-full accent-emerald-400" /></label>
                <div className="grid grid-cols-2 gap-1">
                  <label className="font-mono text-[8px] uppercase text-zinc-600">Begin %<input type="number" min="0" max="100" value={Math.round(activeEntity.beginStepPercent * 100)} onChange={(event) => updateReference(activeEntity.id, { beginStepPercent: Number(event.target.value) / 100 })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="font-mono text-[8px] uppercase text-zinc-600">End %<input type="number" min="0" max="100" value={Math.round(activeEntity.endStepPercent * 100)} onChange={(event) => updateReference(activeEntity.id, { endStepPercent: Number(event.target.value) / 100 })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
              </>
            ) : (
              <>
                <input value={activeEntity.name} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { name: event.target.value })} aria-label="Active layer name" className="h-8 w-full rounded-md border border-cyan-300/20 bg-black/35 px-2 font-mono text-[9px] uppercase text-cyan-100 outline-none focus:border-cyan-300/45 disabled:text-zinc-700" />
                <div className="grid grid-cols-3 gap-1">
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">X<input type="number" value={Math.round(activeEntity.x)} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { x: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Y<input type="number" value={Math.round(activeEntity.y)} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { y: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Rotate<input type="number" value={Math.round(activeEntity.rotation * 10) / 10} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { rotation: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
                <div className="grid grid-cols-2 gap-1">
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Width<input type="number" min="1" value={Math.round(activeEntity.width)} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { width: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  <label className="min-w-0 font-mono text-[8px] uppercase text-zinc-600">Height<input type="number" min="1" value={Math.round(activeEntity.height)} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { height: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                </div>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Opacity <span className="float-right text-cyan-300">{Math.round(activeEntity.opacity * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={activeEntity.opacity} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { opacity: Number(event.target.value) })} className="mt-1 w-full accent-cyan-300" /></label>
                <label className="block font-mono text-[8px] uppercase text-zinc-600">Blend mode<UmbraSelectControl value={activeEntity.blendMode} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { blendMode: event.target.value as typeof activeEntity.blendMode })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] uppercase text-zinc-300">{UMBRA_CANVAS_BLEND_MODES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</UmbraSelectControl></label>
                {activeEntity.kind === 'shape' ? (
                  <div className="grid grid-cols-3 gap-1">
                    <label className="font-mono text-[8px] uppercase text-zinc-600">Fill<input type="color" value={activeEntity.fill} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { fill: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1" /></label>
                    <label className="font-mono text-[8px] uppercase text-zinc-600">Stroke<input type="color" value={activeEntity.stroke} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { stroke: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1" /></label>
                    <label className="font-mono text-[8px] uppercase text-zinc-600">Border<input type="number" min="0" max="128" value={activeEntity.strokeWidth} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { strokeWidth: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  </div>
                ) : activeEntity.kind === 'text' ? (
                  <>
                    <textarea value={activeEntity.text} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { text: event.target.value })} aria-label="Text layer content" className="min-h-20 w-full resize-y rounded-md border border-white/10 bg-black/35 p-2 text-xs text-zinc-100 outline-none focus:border-cyan-300/35" />
                    <div className="grid grid-cols-2 gap-1">
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Font<input value={activeEntity.fontFamily} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { fontFamily: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Size<input type="number" min="1" max="4096" value={activeEntity.fontSize} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { fontSize: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Style<UmbraSelectControl value={activeEntity.fontStyle} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { fontStyle: event.target.value as typeof activeEntity.fontStyle })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300"><option value="normal">Normal</option><option value="bold">Bold</option><option value="italic">Italic</option><option value="bold italic">Bold italic</option></UmbraSelectControl></label>
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Align<UmbraSelectControl value={activeEntity.align} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { align: event.target.value as typeof activeEntity.align })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></UmbraSelectControl></label>
                    </div>
                    <label className="font-mono text-[8px] uppercase text-zinc-600">Text color<input type="color" value={activeEntity.fill} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { fill: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1" /></label>
                  </>
                ) : activeEntity.kind === 'path' ? (
                  <>
                    <div className="grid grid-cols-3 gap-1">
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Fill<input type="color" value={activeEntity.fill} disabled={activeEntity.locked || !activeEntity.fillEnabled} onChange={(event) => updateDrawable(activeEntity.id, { fill: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1 disabled:opacity-30" /></label>
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Stroke<input type="color" value={activeEntity.stroke} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { stroke: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1" /></label>
                      <label className="font-mono text-[8px] uppercase text-zinc-600">Width<input type="number" min="0.5" max="2048" step="0.5" value={activeEntity.strokeWidth} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { strokeWidth: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                    </div>
                    <div className="grid grid-cols-2 gap-1">
                      <button type="button" disabled={activeEntity.locked || !activeEntity.closed} onClick={() => updateDrawable(activeEntity.id, { fillEnabled: !activeEntity.fillEnabled })} className={cn('h-8 rounded-md border text-[8px] font-black uppercase', activeEntity.fillEnabled ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-500 disabled:text-zinc-800')}>Fill {activeEntity.fillEnabled ? 'on' : 'off'}</button>
                      <button type="button" disabled={activeEntity.locked} onClick={() => updateDrawable(activeEntity.id, { closed: !activeEntity.closed, fillEnabled: activeEntity.closed ? false : activeEntity.fillEnabled })} className={cn('h-8 rounded-md border text-[8px] font-black uppercase', activeEntity.closed ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-500')}>{activeEntity.closed ? 'Closed' : 'Open'} path</button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-3 gap-1">
                    <label className="font-mono text-[8px] uppercase text-zinc-600">Start<input type="color" value={activeEntity.startColor} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { startColor: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1" /></label>
                    <label className="font-mono text-[8px] uppercase text-zinc-600">End<input type="color" value={activeEntity.endColor} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { endColor: event.target.value })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-transparent p-1" /></label>
                    <label className="font-mono text-[8px] uppercase text-zinc-600">Angle<input type="number" value={activeEntity.angle} disabled={activeEntity.locked} onChange={(event) => updateDrawable(activeEntity.id, { angle: Number(event.target.value) })} className="mt-1 h-8 w-full rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-300" /></label>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-1">
                  <button type="button" title={selectedEntityIds.size > 1 ? 'Duplicate selected layers' : 'Duplicate layer'} aria-label={selectedEntityIds.size > 1 ? 'Duplicate selected layers' : 'Duplicate layer'} onClick={duplicateSelection} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><Copy size={12} /></button>
                  <button type="button" title="Flip layer horizontally" aria-label="Flip layer horizontally" disabled={activeEntity.locked} onClick={() => updateDrawable(activeEntity.id, { scaleX: activeEntity.scaleX * -1 })} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><FlipHorizontal2 size={12} /></button>
                  <button type="button" title="Flip layer vertically" aria-label="Flip layer vertically" disabled={activeEntity.locked} onClick={() => updateDrawable(activeEntity.id, { scaleY: activeEntity.scaleY * -1 })} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><FlipVertical2 size={12} /></button>
                  <button type="button" title="Rotate layer 90 degrees" aria-label="Rotate layer 90 degrees" disabled={activeEntity.locked} onClick={() => updateDrawable(activeEntity.id, { rotation: activeEntity.rotation + 90 })} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><RotateCw size={12} /></button>
                </div>
              </>
            )}
            <div className="grid grid-cols-4 gap-1">
              <button type="button" title="Move layer up" onClick={() => moveEntity(activeEntity.id, 'up')} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><ArrowUp size={12} /></button>
              <button type="button" title="Move layer down" onClick={() => moveEntity(activeEntity.id, 'down')} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100"><ArrowDown size={12} /></button>
              <button type="button" title={activeEntity.locked ? 'Unlock layer' : 'Lock layer'} onClick={() => toggleEntityLock(activeEntity.id)} className="inline-flex h-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-cyan-100">{activeEntity.locked ? <Lock size={12} /> : <Unlock size={12} />}</button>
              <button type="button" title={selectedEntityIds.size > 1 ? 'Delete selected layers' : 'Delete layer'} onClick={deleteSelection} className="inline-flex h-8 items-center justify-center rounded-md border border-rose-300/15 text-rose-300/60 hover:text-rose-200"><Trash2 size={12} /></button>
            </div>
          </div>
        ) : null}
      </aside>

      {pendingMediaImport ? (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="Choose Canvas project destination" className="flex max-h-[86%] w-full max-w-4xl flex-col overflow-hidden rounded-md border border-cyan-300/20 bg-[#090c0e] shadow-2xl">
            <header className="flex min-h-14 items-center gap-3 border-b border-white/10 px-4">
              <ImagePlus size={15} className="text-cyan-300" />
              <div className="min-w-0">
                <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Add Image to Canvas</h2>
                <p className="truncate font-mono text-[8px] uppercase text-zinc-600">{pendingMediaImport.name}</p>
              </div>
              <button type="button" aria-label="Cancel Canvas media import" disabled={mediaImportBusy} onClick={cancelMediaHandoff} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100 disabled:opacity-40"><X size={13} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
              <button type="button" disabled={mediaImportBusy} onClick={() => void importMediaHandoff('')} className="mb-3 flex min-h-16 w-full items-center gap-3 rounded-md border border-cyan-300/25 bg-cyan-500/[0.07] px-4 text-left hover:bg-cyan-500/[0.11] disabled:opacity-40">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-cyan-300/25 text-cyan-200"><ImagePlus size={15} /></span>
                <span><strong className="block text-[10px] font-black uppercase text-cyan-100">New Canvas Project</strong><small className="mt-1 block font-mono text-[8px] uppercase text-zinc-600">Create a project sized to this source image</small></span>
                {mediaImportBusy ? <LoaderCircle size={14} className="ml-auto animate-spin text-cyan-200" /> : null}
              </button>
              <div className="mb-2 flex items-center gap-2 font-mono text-[8px] font-black uppercase text-zinc-600"><span>Or add to an existing project</span><span className="h-px flex-1 bg-white/10" /></div>
              {projectsLoading ? <div className="py-10 text-center font-mono text-[9px] uppercase text-zinc-600">Loading projects</div> : null}
              {!projectsLoading && projectSummaries.length === 0 ? <div className="py-10 text-center font-mono text-[9px] uppercase text-zinc-600">No saved projects yet</div> : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
                {projectSummaries.map((summary) => (
                  <button key={summary.id} type="button" disabled={mediaImportBusy} onClick={() => void importMediaHandoff(summary.id)} className={cn('overflow-hidden rounded-md border bg-black/30 text-left hover:border-cyan-300/35 disabled:opacity-40', summary.id === project.id ? 'border-cyan-300/30' : 'border-white/10')}>
                    <div className="aspect-video bg-black/50">{summary.thumbnailUrl ? <img src={summary.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}</div>
                    <div className="p-2.5"><strong className="block truncate text-[9px] font-black uppercase text-zinc-200">{summary.name}</strong><small className="mt-1 block font-mono text-[8px] uppercase text-zinc-600">{summary.entityCount} layers / {summary.generationWidth} x {summary.generationHeight}</small></div>
                  </button>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {projectBrowserOpen ? (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-label="Canvas projects" className="flex max-h-[86%] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-cyan-300/20 bg-[#090c0e] shadow-2xl">
            <header className="flex h-12 items-center gap-3 border-b border-white/10 px-4">
              <FolderOpen size={14} className="text-cyan-300" />
              <div>
                <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-zinc-200">Canvas Projects</h2>
                <p className="font-mono text-[8px] uppercase text-zinc-600">Saved layers, positions, viewport, and generation box</p>
              </div>
              <button type="button" aria-label="Close Canvas projects" onClick={() => setProjectBrowserOpen(false)} className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 text-zinc-500 hover:text-zinc-100"><X size={13} /></button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {projectsLoading ? <div className="py-12 text-center font-mono text-[9px] uppercase text-zinc-600">Loading projects</div> : null}
              {!projectsLoading && projectSummaries.length === 0 ? <div className="py-12 text-center font-mono text-[9px] uppercase text-zinc-600">No saved Canvas projects</div> : null}
              <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2">
                {projectSummaries.map((summary) => (
                  <article key={summary.id} className={cn('overflow-hidden rounded-md border bg-black/30', summary.id === project.id ? 'border-cyan-300/35' : 'border-white/10')}>
                    <button type="button" onClick={() => void loadProject(summary.id)} aria-label={`Open ${summary.name}`} className="block w-full text-left">
                      <div className="aspect-video bg-black/50">
                        {summary.thumbnailUrl ? <img src={summary.thumbnailUrl} alt="" className="h-full w-full object-cover" /> : null}
                      </div>
                      <div className="p-2.5">
                        <strong className="block truncate text-[10px] font-black uppercase text-zinc-200">{summary.name}</strong>
                        <small className="mt-1 block font-mono text-[8px] uppercase text-zinc-600">{summary.entityCount} layers · {summary.generationWidth} x {summary.generationHeight}</small>
                      </div>
                    </button>
                    <div className="flex items-center border-t border-white/10 p-1.5">
                      {summary.id === project.id ? <span className="px-1.5 font-mono text-[7px] font-black uppercase text-cyan-300">Open</span> : null}
                      <button type="button" aria-label={`Delete ${summary.name}`} onClick={() => void deleteProject(summary)} className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-rose-300/60 hover:bg-rose-500/10 hover:text-rose-200"><Trash2 size={11} /></button>
                    </div>
                  </article>
                ))}
              </div>
              <section className="mt-4 border-t border-white/10 pt-3" aria-label="Canvas restore points">
                <div className="flex flex-wrap items-center gap-2">
                  <History size={13} className="text-amber-200" />
                  <div className="mr-auto">
                    <h3 className="text-[10px] font-black uppercase text-zinc-200">Restore Points</h3>
                    <p className="font-mono text-[7px] uppercase text-zinc-600">Named, durable states for the open project</p>
                  </div>
                  <input value={restorePointName} onChange={(event) => setRestorePointName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createRestorePoint(); }} maxLength={160} placeholder="Restore point name" aria-label="Restore point name" className="h-8 w-56 rounded-md border border-white/10 bg-black/35 px-2 text-[9px] text-zinc-200 outline-none placeholder:text-zinc-700 focus:border-amber-200/35" />
                  <button type="button" onClick={() => void createRestorePoint()} disabled={restorePointBusy || saving || project.entities.length === 0} className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-amber-200/20 bg-amber-300/5 px-2.5 text-[8px] font-black uppercase text-amber-100 disabled:border-white/10 disabled:bg-transparent disabled:text-zinc-700">{restorePointBusy ? <LoaderCircle size={11} className="animate-spin" /> : <Save size={11} />} Save Point</button>
                </div>
                {restorePointsLoading ? <div className="py-8 text-center font-mono text-[8px] uppercase text-zinc-600">Loading restore points</div> : null}
                {!restorePointsLoading && restorePoints.length === 0 ? <div className="py-8 text-center font-mono text-[8px] uppercase text-zinc-600">No restore points yet</div> : null}
                <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-2">
                  {restorePoints.map((restorePoint) => (
                    <article key={restorePoint.id} className="rounded-md border border-white/10 bg-black/25 p-2.5">
                      <strong className="block truncate text-[9px] font-black uppercase text-zinc-200">{restorePoint.name}</strong>
                      <span className="mt-1 block font-mono text-[7px] uppercase text-zinc-600">{new Date(restorePoint.createdAt).toLocaleString()} / rev {restorePoint.revision} / {restorePoint.entityCount} layers / {restorePoint.stagingCount} staged</span>
                      <div className="mt-2 flex gap-1.5">
                        <button type="button" onClick={() => void restoreFromRestorePoint(restorePoint)} disabled={restorePointBusy} className="inline-flex h-7 flex-1 items-center justify-center gap-1 rounded-md border border-cyan-300/20 bg-cyan-500/5 text-[8px] font-black uppercase text-cyan-100 disabled:text-zinc-700"><RotateCcw size={10} /> Restore</button>
                        <button type="button" aria-label={`Delete restore point ${restorePoint.name}`} onClick={() => void deleteRestorePoint(restorePoint)} disabled={restorePointBusy} className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-300/15 text-rose-300/60 hover:text-rose-200 disabled:text-zinc-700"><Trash2 size={10} /></button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {conflictStageId ? (() => {
        const stage = stages.find((entry) => entry.id === conflictStageId);
        if (!stage) return null;
        return (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm">
            <section role="dialog" aria-modal="true" aria-label="Canvas generation conflict" className="w-full max-w-lg rounded-md border border-amber-300/25 bg-[#090c0e] p-4 shadow-2xl">
              <h2 className="text-[11px] font-black uppercase tracking-[0.12em] text-amber-100">Canvas Changed After Generation</h2>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">This sample belongs to an earlier layer arrangement. Umbra will keep its original {stage.bbox.width} x {stage.bbox.height} world position and will not silently move it.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button type="button" onClick={() => { setConflictStageId(''); void acceptStage(stage, 'replace', true); }} className="h-10 rounded-md border border-rose-300/25 bg-rose-500/10 text-[9px] font-black uppercase text-rose-100">Accept Frozen Region</button>
                <button type="button" onClick={() => { setConflictStageId(''); void acceptStage(stage, 'layer', true); }} className="h-10 rounded-md border border-cyan-300/25 bg-cyan-500/10 text-[9px] font-black uppercase text-cyan-100">Add New Layer</button>
                <button type="button" onClick={() => { setConflictStageId(''); discardStagedGeneration(stage.id); }} className="h-9 rounded-md border border-rose-300/15 text-[9px] font-black uppercase text-rose-300/70">Discard Sample</button>
                <button type="button" onClick={() => setConflictStageId('')} className="h-9 rounded-md border border-white/10 text-[9px] font-black uppercase text-zinc-500">Cancel</button>
              </div>
            </section>
          </div>
        );
      })() : null}

      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { if (event.target.files) void importImages(event.target.files); event.target.value = ''; }} />
      <input ref={maskInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => { if (event.target.files) void importMaskImages(event.target.files); event.target.value = ''; }} />
      <input ref={archiveInputRef} type="file" accept=".umbra-canvas,application/zip" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void importProjectArchive(file); event.target.value = ''; }} />
    </section>
  );
}

export default UmbraCanvasWorkspace;
