'use client';

import React from 'react';
import type { BlendMode as PsdBlendMode, Layer as PsdLayer, Psd } from 'ag-psd';
import {
  ArrowDown,
  ArrowRightLeft,
  ArrowUp,
  BoxSelect,
  Bookmark,
  BringToFront,
  Brush,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Combine,
  Copy,
  Crop,
  Download,
  Dices,
  Eraser,
  Eye,
  EyeOff,
  FileImage,
  FolderPlus,
  FlipHorizontal2,
  FlipVertical2,
  FolderOpen,
  Focus,
  Hand,
  GripVertical,
  Grid3X3,
  ImagePlus,
  Layers3,
  LassoSelect,
  Loader2,
  Lock,
  Magnet,
  Maximize2,
  Minimize2,
  Move,
  Palette,
  Pipette,
  Pin,
  Play,
  Plus,
  Power,
  Redo2,
  Ruler,
  RotateCcw,
  RotateCw,
  Save,
  Scissors,
  Scan,
  SendToBack,
  Settings2,
  Square,
  SquareDashed,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Trash2,
  Type,
  Undo2,
  Unlock,
  Upload,
  WandSparkles,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UmbraCheckpointControls } from '@/components/umbra-ui/UmbraCheckpointControls';
import { UmbraLoraStackControls } from '@/components/umbra-ui/UmbraLoraStackControls';
import { UmbraPositivePromptEditor } from '@/components/umbra-ui/UmbraPositivePromptEditor';
import { UmbraCanvasHotkeyEditor, type UmbraCanvasHotkeyAction } from '@/components/umbra-ui/UmbraCanvasHotkeyEditor';
import { UmbraRasterCurvesEditor } from '@/components/umbra-ui/UmbraRasterCurvesEditor';
import { UmbraRasterFilterDialog } from '@/components/umbra-ui/UmbraRasterFilterDialog';
import { UmbraLayerUpscaleDialog } from '@/components/umbra-ui/UmbraLayerUpscaleDialog';
import { UmbraInpaintProjectBrowserModal } from '@/components/umbra-ui/UmbraInpaintProjectBrowserModal';
import {
  composeUmbraUiPromptWithLoras,
  type UmbraUiLoraEntry,
} from '@/lib/umbraUiModels';
import type { UmbraUiPromptSegment } from '@/lib/umbraUiPromptSegments';
import type { PowerPrompterModelType } from '@/types/powerPrompter';
import { getUmbraUiInpaintPrimaryModelIssue } from '../../../../shared/umbra-ui/inpaintModelCompatibility';
import {
  canResetUmbraCanvasLayerTransform,
  createUmbraCanvasDocument,
  createUmbraCanvasImageAsset,
  fitUmbraCanvasTransformToRect,
  forkUmbraCanvasDocument,
  getUmbraCanvasControlLayers,
  getUmbraCanvasGenerationRegion,
  getUmbraCanvasMaskLayer,
  getUmbraCanvasRegionalGuidanceLayers,
  getUmbraCanvasReferenceLayers,
  recordUmbraCanvasPromptHistory,
  umbraCanvasDocumentReducer,
  UMBRA_CANVAS_BLEND_MODES,
  UMBRA_CANVAS_MASK_OVERLAY_STYLES,
  type UmbraCanvasBooleanOperation,
  type UmbraCanvasDocument,
  type UmbraCanvasBlendMode,
  type UmbraCanvasControlLayer,
  type UmbraCanvasControlType,
  type UmbraCanvasCoherenceMode,
  type UmbraCanvasCurves,
  type UmbraCanvasDocumentAction,
  type UmbraCanvasGradientLayer,
  type UmbraCanvasGroupLayer,
  type UmbraCanvasGenerationSettings,
  type UmbraCanvasFitMode,
  type UmbraCanvasLayer,
  type UmbraCanvasMaskLayer,
  type UmbraCanvasMaskOverlayStyle,
  type UmbraCanvasProcessingScaleMode,
  type UmbraCanvasPromptHistoryEntry,
  type UmbraCanvasRect,
  type UmbraCanvasRegionalGuidanceLayer,
  type UmbraCanvasReferenceLayer,
  type UmbraCanvasRasterLayer,
  type UmbraCanvasStage,
  type UmbraCanvasTextLayer,
} from '@/lib/umbraUiCanvasDocument';
import {
  convertUmbraMaskLuminanceToAlpha,
  encodeUmbraMaskAlphaAsGrayscale,
  resolveUmbraUiInpaintProcessingSize,
} from '@/lib/umbraUiInpaintProcessing';
import { saveUmbraUiCanvasToGallery } from '@/lib/umbraUiCanvasExport';
import {
  canUseUmbraCanvasEncodeWorker,
  encodeUmbraCanvasInWorker,
} from '@/lib/umbraUiCanvasEncodeWorker';
import {
  canUseUmbraPsdEncodeWorker,
  encodeUmbraPsdInWorker,
} from '@/lib/umbraUiPsdEncodeWorker';
import {
  UMBRA_CANVAS_INTERACTIVE_MAX_PIXELS,
  UMBRA_CANVAS_INTERACTIVE_MAX_SIDE,
  assertUmbraCanvasInteractiveAllocation,
  resolveUmbraCanvasLayerSourceCrop,
  resolveUmbraCanvasPaintBufferRect,
  resolveUmbraCanvasPreviewDisplaySize,
  resolveUmbraCanvasPreviewRaster,
  resolveUmbraCanvasWorldToLayerAssetTransform,
} from '@/lib/umbraUiCanvasPerformance';
import { UmbraWeightedLruCache } from '@/lib/umbraUiWeightedLruCache';
import {
  buildUmbraAssistedSelectionLayerSourceKey,
  buildUmbraAssistedSelectionSignature,
} from '@/lib/umbraUiAssistedSelection';
import { buildUmbraCanvasVisualRenderKey } from '@/lib/umbraUiCanvasRenderKey';
import {
  normalizeUmbraUiMediaHandoff,
  stageUmbraUiMediaHandoff,
  UMBRA_UI_MEDIA_HANDOFF_EVENT,
  type UmbraUiMediaGenerationSnapshot,
} from '@/lib/umbraUiMediaHandoff';
import {
  shouldAutoPreviewUmbraCanvasStage,
  type UmbraCanvasStagingAutoSwitch,
} from '@/lib/umbraUiCanvasStaging';
import {
  resolveUmbraCanvasPointerCursor,
  resolveUmbraCanvasPointerIntent,
  type UmbraCanvasPointerTool,
} from '@/lib/umbraUiCanvasPointerIntent';
import { resolveUmbraCanvasKeyboardIntent } from '@/lib/umbraUiCanvasKeyboardIntent';
import {
  deleteUmbraCanvasProject,
  listUmbraCanvasProjects,
  loadUmbraCanvasProject,
  saveUmbraCanvasProject,
  type UmbraCanvasProjectSummary,
} from '@/lib/umbraUiCanvasProjects';
import {
  UmbraCanvasStudioShelf,
  UmbraCanvasStudioToolbar,
} from '@/components/umbra-ui/UmbraCanvasStudioChrome';
import { useUmbraCanvasStudio } from '@/components/umbra-ui/useUmbraCanvasStudio';
import {
  UMBRA_CANVAS_STUDIO_SNAP_SIZE,
  type UmbraCanvasStudioArtboard,
  type UmbraCanvasStudioRegion,
} from '@/lib/umbraUiStudioProjects';
import {
  UMBRA_CANVAS_STUDIO_ALIGNMENT_SNAP_PX,
  clampUmbraCanvasStudioZoom,
  fitUmbraCanvasStudioArtboards,
  resolveUmbraCanvasStudioArtboardSnap,
  snapUmbraCanvasStudioCoordinate,
  type UmbraCanvasStudioAlignmentGuide,
  zoomUmbraCanvasStudioAtPoint,
} from '@/lib/umbraUiCanvasStudioViewport';
import { resolveUmbraCanvasStudioCompositeSlices } from '@/lib/umbraUiCanvasStudioComposite';
import { resolveUmbraCanvasMaskSnapshotLeases } from '@/lib/umbraUiCanvasAssetLeases';
import {
  cancelUmbraUiInpaintJob,
  failLostUmbraUiInpaintJob,
  fetchUmbraUiInpaintJob,
  isUmbraUiInpaintJobTerminal,
  preprocessUmbraUiControlImage,
  removeUmbraUiImageBackground,
  resolveUmbraUiInpaintFillModeForMask,
  submitUmbraUiInpaintJob,
  type UmbraUiInpaintFillMode,
  type UmbraUiInpaintHandoff,
  type UmbraUiInpaintControlInput,
  type UmbraUiInpaintJob,
  type UmbraUiInpaintRegionalGuidanceInput,
  type UmbraUiInpaintReferenceInput,
} from '@/lib/umbraUiInpaint';
import {
  buildUmbraUiInpaintOutputStages,
  classifyUmbraUiInpaintRecoveryError,
  getUmbraUiInpaintTerminalMaterializationIssue,
  getUmbraUiInpaintRecoveryRetryDelay,
  reconcileUmbraUiInpaintJobSnapshot,
  resolveUmbraUiInpaintTerminalTransition,
  selectUmbraUiInpaintRecoveryTarget,
  type UmbraUiInpaintStageContext,
} from '@/lib/umbraUiInpaintRecovery';
import {
  detectUmbraClipSegMask,
  detectUmbraSamMask,
  fetchUmbraClipSegCapabilities,
  installUmbraClipSegModel,
  type UmbraSamBox,
  type UmbraSamDeviceMode,
  type UmbraSamPoint,
} from '@/lib/umbraUiSam';
import type {
  UmbraUiInpaintAdapter,
  UmbraUiInpaintControlAdapterType,
  UmbraUiInpaintControlMode,
  UmbraUiInpaintReferenceMethod,
  UmbraUiIpAdapterCombineEmbeds,
  UmbraUiIpAdapterEmbedsScaling,
  UmbraUiIpAdapterWeightType,
  UmbraUiPipelineCapabilities,
  UmbraUiPipelineControlCapability,
  UmbraUiPipelineResolutionCapability,
} from '../../../../shared/umbra-ui/pipelineTypes';

type CanvasTool = UmbraCanvasPointerTool;
type CanvasEditTarget = 'mask' | 'raster';
type RasterShapeType = 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'freehand';
type CanvasArtboardTransformOperation = 'flip_horizontal' | 'flip_vertical' | 'rotate_left' | 'rotate_right';

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'));
}

type CanvasFullResolutionOperationPhase = 'rendering' | 'processing' | 'encoding' | 'saving' | 'collecting' | 'compressing' | 'serializing';

interface CanvasFullResolutionOperation {
  id: number;
  label: string;
  phase: CanvasFullResolutionOperationPhase;
}

const CANVAS_HOTKEYS_KEY = 'umbra-ui:canvas-hotkeys';
const CANVAS_HOTKEY_ACTIONS: UmbraCanvasHotkeyAction[] = [
  { id: 'pan', label: 'Pan Canvas' },
  { id: 'brush', label: 'Brush' },
  { id: 'erase', label: 'Eraser' },
  { id: 'box', label: 'Rectangle Mask' },
  { id: 'lasso', label: 'Freehand Lasso' },
  { id: 'polygon', label: 'Polygon Lasso' },
  { id: 'quick_switch', label: 'Quick Switch Layer' },
];
const DEFAULT_CANVAS_HOTKEYS: Record<string, string> = {
  pan: 'h', brush: 'b', erase: 'e', box: 'r', lasso: 'l', polygon: 'p', quick_switch: 'q',
};

function loadCanvasHotkeys(): Record<string, string> {
  if (typeof window === 'undefined') return { ...DEFAULT_CANVAS_HOTKEYS };
  try {
    const stored = JSON.parse(window.localStorage.getItem(CANVAS_HOTKEYS_KEY) || '{}') as Record<string, unknown>;
    const next = { ...DEFAULT_CANVAS_HOTKEYS };
    const used = new Set<string>();
    for (const action of CANVAS_HOTKEY_ACTIONS) {
      const value = String(stored[action.id] ?? next[action.id] ?? '').trim().toLowerCase();
      next[action.id] = value.length === 1 && !used.has(value) ? value : '';
      if (next[action.id]) used.add(next[action.id]);
    }
    return next;
  } catch {
    return { ...DEFAULT_CANVAS_HOTKEYS };
  }
}
type TransformDragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se' | 'rotate';
type RegionDragMode = 'move' | 'resize-nw' | 'resize-ne' | 'resize-sw' | 'resize-se';
type CanvasImageDropTarget = 'raster' | 'control' | 'resized_control' | 'reference' | 'mask';
type SamGuideMode = 'points' | 'box' | 'prompt';
type SamOutputMode = 'active_mask' | 'replace_layer' | 'new_mask' | 'regional_guidance' | 'raster' | 'control';

interface AssistedSelectionPreview {
  imageUrl: string;
  signature: string;
  label: string;
}

interface CanvasPreferences {
  autoProcessAssistedSelection: boolean;
  autoSaveStagesToGallery: boolean;
  clipToGenerationRegion: boolean;
  dynamicGrid: boolean;
  gradientClip: boolean;
  isolatedLayerPreview: boolean;
  isolatedStagingPreview: boolean;
  invertToolWheel: boolean;
  stagingAutoSwitch: UmbraCanvasStagingAutoSwitch;
  preserveMask: boolean;
  pressureSensitivity: boolean;
  ruleOfThirds: boolean;
  rulersEnabled: boolean;
  snapEnabled: boolean;
  snapSize: number;
  showGuidanceOverlays: boolean;
  showInpaintMaskOverlays: boolean;
  showRegionalGuidanceOverlays: boolean;
  showControlLayerOverlays: boolean;
  showReferenceLayerOverlays: boolean;
  showGenerationRegionOverlay: boolean;
  showProgressOnCanvas: boolean;
  stagingThumbnailsVisible: boolean;
}

interface CanvasToolSettings {
  brushSize: number;
  eraserSize: number;
  samThreshold: number;
  clipSegThreshold: number;
}

type GuidanceOverlayVisibility = Pick<CanvasPreferences,
  | 'showGuidanceOverlays'
  | 'showInpaintMaskOverlays'
  | 'showRegionalGuidanceOverlays'
  | 'showControlLayerOverlays'
  | 'showReferenceLayerOverlays'
>;

interface InpaintRuntimeCapabilities {
  modelInfill: boolean;
  maskedFill: boolean;
  maskExpand: boolean;
  colorMatch: boolean;
  differentialDiffusion: boolean;
  softInpaintComposite: boolean;
  colorPrefill: boolean;
  tilePrefill: boolean;
  seamless: boolean;
  maskedOutput: boolean;
  backgroundRemoval: boolean;
  semanticCutout: boolean;
}

interface InpaintSource {
  id: string;
  name: string;
  path: string;
  originalPath: string;
  imageUrl: string;
  width: number;
  height: number;
  objectUrl: boolean;
}

interface FrameMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Point {
  x: number;
  y: number;
}

interface BoxPreview {
  start: Point;
  current: Point;
}

interface CanvasClipboard {
  asset: ReturnType<typeof createUmbraCanvasImageAsset>;
  transform: UmbraCanvasRasterLayer['transform'];
}

interface TransformDragState {
  mode: TransformDragMode;
  layerId: string;
  pointerId: number;
  captureTarget: HTMLElement;
  start: Point;
  initial: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
  latest: UmbraCanvasRasterLayer['transform'];
  selectedInitial: Array<{
    layerId: string;
    transform: UmbraCanvasRasterLayer['transform'];
  }>;
  documentBefore: UmbraCanvasDocument;
}

interface ViewportPanState {
  pointerId: number;
  startX: number;
  startY: number;
  scrollLeft: number;
  scrollTop: number;
}

interface StudioViewportPanState {
  pointerId: number;
  startX: number;
  startY: number;
  panX: number;
  panY: number;
}

interface StudioArtboardDragState {
  pointerId: number;
  artboardId: string;
  startX: number;
  startY: number;
  artboardX: number;
  artboardY: number;
  artboardWidth: number;
  artboardHeight: number;
  latestX: number;
  latestY: number;
  moved: boolean;
  captureTarget: HTMLElement;
}

interface RegionDragState {
  pointerId: number;
  mode: RegionDragMode;
  start: Point;
  initial: UmbraCanvasRect;
  documentBefore: UmbraCanvasDocument;
  captureTarget: HTMLElement;
}

interface StudioRegionInteractionState {
  pointerId: number;
  mode: 'draw' | RegionDragMode;
  start: Point;
  initial: UmbraCanvasRect;
  latest: UmbraCanvasRect;
  documentBefore: UmbraCanvasDocument;
  captureTarget: HTMLElement;
}

interface CanvasDocumentHistory {
  past: UmbraCanvasDocument[];
  present: UmbraCanvasDocument | null;
  future: UmbraCanvasDocument[];
}

type CanvasDocumentHistoryAction = UmbraCanvasDocumentAction
  | { type: 'history_undo' }
  | { type: 'history_redo' }
  | { type: 'history_reset'; document?: UmbraCanvasDocument | null }
  | { type: 'history_hydrate'; document: UmbraCanvasDocument }
  | { type: 'history_apply_transient'; action: UmbraCanvasDocumentAction }
  | { type: 'history_commit_snapshot'; before: UmbraCanvasDocument };

const HISTORY_LIMIT = 64;
const PIXEL_READBACK_TILE_ROWS = 256;

function toPsdBlendMode(mode: UmbraCanvasBlendMode): PsdBlendMode {
  const mapped: Partial<Record<UmbraCanvasBlendMode, PsdBlendMode>> = {
    'source-over': 'normal',
    'color-burn': 'color burn',
    'color-dodge': 'color dodge',
    'soft-light': 'soft light',
    'hard-light': 'hard light',
  };
  return mapped[mode] || mode as PsdBlendMode;
}

function historyLimitForDocument(document: UmbraCanvasDocument | null): number {
  const pixels = (document?.width || 0) * (document?.height || 0);
  if (pixels >= 64 * 1024 * 1024) return 4;
  if (pixels > 16 * 1024 * 1024) return 8;
  if (pixels > 4 * 1024 * 1024) return 24;
  return HISTORY_LIMIT;
}

function canvasDocumentHistoryReducer(
  state: CanvasDocumentHistory,
  action: CanvasDocumentHistoryAction,
): CanvasDocumentHistory {
  if (action.type === 'history_undo') {
    const previous = state.past[state.past.length - 1];
    if (!previous) return state;
    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: state.present ? [state.present, ...state.future].slice(0, historyLimitForDocument(previous)) : state.future,
    };
  }
  if (action.type === 'history_redo') {
    const next = state.future[0];
    if (!next) return state;
    return {
      past: state.present ? [...state.past, state.present].slice(-historyLimitForDocument(next)) : state.past,
      present: next,
      future: state.future.slice(1),
    };
  }
  if (action.type === 'history_reset') return { past: [], present: action.document || null, future: [] };
  if (action.type === 'history_hydrate') return { ...state, present: action.document };
  if (action.type === 'history_apply_transient') {
    const present = umbraCanvasDocumentReducer(state.present, action.action);
    return present === state.present ? state : { ...state, present };
  }
  if (action.type === 'history_commit_snapshot') {
    if (!state.present || state.present === action.before) return state;
    return {
      past: [...state.past, action.before].slice(-historyLimitForDocument(state.present)),
      present: state.present,
      future: [],
    };
  }
  const next = umbraCanvasDocumentReducer(state.present, action);
  if (next === state.present) return state;
  if (action.type === 'load_source' || action.type === 'replace_document') {
    return { past: [], present: next, future: [] };
  }
  if (action.type === 'select_layer' || action.type === 'preview_stage' || action.type === 'set_generation_settings') {
    return { ...state, present: next };
  }
  return {
    past: state.present ? [...state.past, state.present].slice(-historyLimitForDocument(next)) : state.past,
    present: next,
    future: [],
  };
}

export interface UmbraInpaintWorkspaceProps {
  capabilities: UmbraUiPipelineCapabilities;
  inpaintAdapter: UmbraUiInpaintAdapter;
  modelFamily: string;
  modelFamilyOptions: string[];
  onModelFamilyChange: (value: string) => void;
  modelSource: PowerPrompterModelType;
  modelSourceOptions: Array<{ value: PowerPrompterModelType; label: string }>;
  onModelSourceChange: (value: PowerPrompterModelType) => void;
  modelLabel: string;
  pipelineError: string;
  regionalGuidanceAvailable: boolean;
  regionalGuidanceReason: string;
  regionalGuidanceMaxLayers: number;
  regionalPositivePromptAvailable: boolean;
  regionalNegativePromptAvailable: boolean;
  regionalAutoNegativeAvailable: boolean;
  controlLayersAvailable: boolean;
  controlLayersReason: string;
  controlLayersMaxLayers: number;
  controlAdapterTypes: UmbraUiInpaintControlAdapterType[];
  controlModes: UmbraUiInpaintControlMode[];
  controlModels: string[];
  animaLlliteModels: string[];
  modelPatchModels: string[];
  controlPreprocessors: string[];
  referenceLayersAvailable: boolean;
  referenceLayersReason: string;
  referenceLayersMaxLayers: number;
  referenceMethods: UmbraUiInpaintReferenceMethod[];
  styleModels: string[];
  ipAdapterModels: string[];
  visionModels: string[];
  seamlessAvailable: boolean;
  seamlessReason: string;
  seamlessAxes: Array<'x' | 'y'>;
  checkpointName: string;
  checkpointAvailableCount: number;
  checkpointLoading: boolean;
  checkpointError: string;
  onOpenCheckpointPicker: () => void;
  onRefreshModelCatalog: () => void;
  loras: UmbraUiLoraEntry[];
  onLorasChange: (loras: UmbraUiLoraEntry[]) => void;
  loraAvailableCount: number;
  onOpenLoraPicker: () => void;
  onAddPromptToken: (token: string) => void;
  clipSkip: string;
  onClipSkipChange: (value: string) => void;
  prompt: string;
  promptSegments: UmbraUiPromptSegment[];
  activePromptSegmentId: string;
  onPromptSegmentsChange: (segments: UmbraUiPromptSegment[]) => void;
  onActivePromptSegmentChange: (segmentId: string) => void;
  negativePrompt: string;
  onNegativePromptChange: (value: string) => void;
  seed: string;
  onSeedChange: (value: string) => void;
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
  samModels: string[];
  upscaleModels: string[];
  img2imgDetailerActiveCount: number;
  img2imgDetailerStageCount: number;
  onImg2imgDetailersEnabledChange: (enabled: boolean) => void;
  comfyConnected: boolean;
  showToast: (message: string, type: 'success' | 'error') => void;
}

const inputClass = 'w-full rounded-md border border-white/10 bg-black/35 px-2.5 py-2 text-xs text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-rose-300/45';
const labelClass = 'text-[9px] font-black uppercase tracking-[0.16em] text-zinc-500';
const EMPTY_MARGINS: FrameMargins = { left: 0, right: 0, top: 0, bottom: 0 };
const SIMPLE_INPAINT_DEFAULT_DENOISE = 0.65;
const SIMPLE_INPAINT_DEFAULT_EDGE_SOFTNESS = 32;
const SIMPLE_INPAINT_DEFAULT_MASK_GROW = 8;
const SIMPLE_INPAINT_DEFAULT_PRESERVATION = 0.5;
const SIMPLE_INPAINT_DEFAULT_TRANSITION_CONTRAST = 2;
const SIMPLE_INPAINT_DEFAULT_MASK_INFLUENCE = 0;
type SimpleInpaintBlendModeId = 'tight' | 'balanced' | 'soft';
type SimpleInpaintBlendMode = {
  id: SimpleInpaintBlendModeId;
  label: string;
  edgeSoftness: number;
  sourceProtection: number;
  edgeContrast: number;
  maskBias: number;
};
const SIMPLE_INPAINT_BLEND_MODES: readonly SimpleInpaintBlendMode[] = [
  {
    id: 'tight',
    label: 'Tight',
    edgeSoftness: 6,
    sourceProtection: 0.2,
    edgeContrast: 2.75,
    maskBias: 0,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    edgeSoftness: 12,
    sourceProtection: 0.35,
    edgeContrast: 1.75,
    maskBias: 0,
  },
  {
    id: 'soft',
    label: 'Soft',
    edgeSoftness: 24,
    sourceProtection: 0.55,
    edgeContrast: 1.15,
    maskBias: 0.15,
  },
];
type SimpleInpaintTaskModeId = 'touch_up' | 'recolor' | 'replace';
type SimpleInpaintTaskMode = {
  id: SimpleInpaintTaskModeId;
  label: string;
  denoise: number;
  contextPadding: number;
  maskGrow: number;
  colorMatch: number;
  differentialStrength: number;
  fillMode: UmbraUiInpaintFillMode;
};
const SIMPLE_INPAINT_TASK_MODES: readonly SimpleInpaintTaskMode[] = [
  {
    id: 'touch_up',
    label: 'Touch Up',
    denoise: 0.35,
    contextPadding: 32,
    maskGrow: 4,
    colorMatch: 0.65,
    differentialStrength: 0.4,
    fillMode: 'neutral',
  },
  {
    id: 'recolor',
    label: 'Recolor',
    denoise: 0.55,
    contextPadding: 64,
    maskGrow: 8,
    colorMatch: 0,
    differentialStrength: 0.65,
    fillMode: 'neutral',
  },
  {
    id: 'replace',
    label: 'Replace',
    denoise: 0.92,
    contextPadding: 128,
    maskGrow: 12,
    colorMatch: 0.15,
    differentialStrength: 1,
    fillMode: 'neutral',
  },
];
const CANVAS_PREFERENCES_KEY = 'umbra-ui:canvas-preferences';
const CANVAS_TOOL_SETTINGS_KEY = 'umbra-ui:canvas-tool-settings';
const ACTIVE_CANVAS_PROJECT_KEY = 'umbra-ui:active-canvas-project';
const CANVAS_PROJECT_AUTOSAVE_INTERVAL_MS = 30_000;
const GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';

function isSimpleInpaintLayer(layer: UmbraCanvasLayer): boolean {
  return layer.kind === 'raster'
    || layer.kind === 'group'
    || layer.kind === 'mask' && (layer.purpose === 'inpaint' || layer.purpose === 'layer');
}

const DEFAULT_CANVAS_PREFERENCES: CanvasPreferences = {
  autoProcessAssistedSelection: false,
  autoSaveStagesToGallery: false,
  clipToGenerationRegion: false,
  dynamicGrid: false,
  gradientClip: true,
  isolatedLayerPreview: false,
  isolatedStagingPreview: false,
  invertToolWheel: false,
  stagingAutoSwitch: 'start',
  preserveMask: false,
  pressureSensitivity: true,
  ruleOfThirds: false,
  rulersEnabled: true,
  snapEnabled: true,
  snapSize: 8,
  showGuidanceOverlays: true,
  showInpaintMaskOverlays: true,
  showRegionalGuidanceOverlays: true,
  showControlLayerOverlays: true,
  showReferenceLayerOverlays: true,
  showGenerationRegionOverlay: true,
  showProgressOnCanvas: true,
  stagingThumbnailsVisible: true,
};

const DEFAULT_CANVAS_TOOL_SETTINGS: CanvasToolSettings = {
  brushSize: 96,
  eraserSize: 96,
  samThreshold: 0.7,
  clipSegThreshold: 0.5,
};

function normalizeCanvasToolSize(value: unknown, fallback: number): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? Math.max(4, Math.min(512, Math.round(numericValue))) : fallback;
}

function normalizeAssistedSelectionThreshold(value: unknown, fallback: number): number {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.round(Math.max(0.05, Math.min(1, numericValue)) * 100) / 100;
}

function loadCanvasToolSettings(): CanvasToolSettings {
  if (typeof window === 'undefined') return DEFAULT_CANVAS_TOOL_SETTINGS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CANVAS_TOOL_SETTINGS_KEY) || '{}') as Partial<CanvasToolSettings>;
    return {
      brushSize: normalizeCanvasToolSize(stored.brushSize, DEFAULT_CANVAS_TOOL_SETTINGS.brushSize),
      eraserSize: normalizeCanvasToolSize(stored.eraserSize, DEFAULT_CANVAS_TOOL_SETTINGS.eraserSize),
      samThreshold: normalizeAssistedSelectionThreshold(stored.samThreshold, DEFAULT_CANVAS_TOOL_SETTINGS.samThreshold),
      clipSegThreshold: normalizeAssistedSelectionThreshold(stored.clipSegThreshold, DEFAULT_CANVAS_TOOL_SETTINGS.clipSegThreshold),
    };
  } catch {
    return DEFAULT_CANVAS_TOOL_SETTINGS;
  }
}

function loadCanvasPreferences(): CanvasPreferences {
  if (typeof window === 'undefined') return DEFAULT_CANVAS_PREFERENCES;
  try {
    const stored = JSON.parse(window.localStorage.getItem(CANVAS_PREFERENCES_KEY) || '{}') as Partial<CanvasPreferences> & { autoPreviewStaging?: boolean };
    const stagingAutoSwitch = stored.stagingAutoSwitch === 'off' || stored.stagingAutoSwitch === 'start' || stored.stagingAutoSwitch === 'finish'
      ? stored.stagingAutoSwitch
      : stored.autoPreviewStaging === false ? 'off' : 'start';
    return {
      autoProcessAssistedSelection: stored.autoProcessAssistedSelection === true,
      autoSaveStagesToGallery: stored.autoSaveStagesToGallery === true,
      clipToGenerationRegion: stored.clipToGenerationRegion === true,
      dynamicGrid: stored.dynamicGrid === true,
      gradientClip: stored.gradientClip !== false,
      isolatedLayerPreview: stored.isolatedLayerPreview === true,
      isolatedStagingPreview: stored.isolatedStagingPreview === true,
      invertToolWheel: stored.invertToolWheel === true,
      stagingAutoSwitch,
      preserveMask: stored.preserveMask === true,
      pressureSensitivity: stored.pressureSensitivity !== false,
      ruleOfThirds: stored.ruleOfThirds === true,
      rulersEnabled: stored.rulersEnabled !== false,
      snapEnabled: stored.snapEnabled !== false,
      snapSize: Number.isFinite(Number(stored.snapSize)) ? Math.max(1, Math.min(256, Math.round(Number(stored.snapSize)))) : 8,
      showGuidanceOverlays: stored.showGuidanceOverlays !== false,
      showInpaintMaskOverlays: stored.showInpaintMaskOverlays !== false,
      showRegionalGuidanceOverlays: stored.showRegionalGuidanceOverlays !== false,
      showControlLayerOverlays: stored.showControlLayerOverlays !== false,
      showReferenceLayerOverlays: stored.showReferenceLayerOverlays !== false,
      showGenerationRegionOverlay: stored.showGenerationRegionOverlay !== false,
      showProgressOnCanvas: stored.showProgressOnCanvas !== false,
      stagingThumbnailsVisible: stored.stagingThumbnailsVisible !== false,
    };
  } catch {
    return DEFAULT_CANVAS_PREFERENCES;
  }
}
const CONTROL_TYPE_OPTIONS: Array<{ value: UmbraCanvasControlType; label: string; nodeType: string; adapterTypes?: UmbraUiInpaintControlAdapterType[] }> = [
  { value: 'raw', label: 'Prepared / Raw', nodeType: '' },
  { value: 'canny', label: 'Canny', nodeType: 'CannyEdgePreprocessor' },
  { value: 'depth', label: 'Depth Anything V2', nodeType: 'DepthAnythingV2Preprocessor' },
  { value: 'pose', label: 'DWPose', nodeType: 'DWPreprocessor' },
  { value: 'lineart', label: 'Lineart', nodeType: 'LineArtPreprocessor' },
  { value: 'lineart_anime', label: 'Anime Lineart', nodeType: 'AnimeLineArtPreprocessor' },
  { value: 'softedge', label: 'Soft Edge', nodeType: 'HEDPreprocessor' },
  { value: 'scribble', label: 'Scribble', nodeType: 'FakeScribblePreprocessor' },
  { value: 'face_mesh', label: 'Face Mesh', nodeType: 'MediaPipe-FaceMeshPreprocessor' },
  { value: 'mlsd', label: 'M-LSD Lines', nodeType: 'M-LSDPreprocessor' },
  { value: 'normal_map', label: 'Normal Map', nodeType: 'MiDaS-NormalMapPreprocessor' },
  { value: 'pidi', label: 'PiDiNet', nodeType: 'PiDiNetPreprocessor' },
  { value: 'content_shuffle', label: 'Content Shuffle', nodeType: 'ShufflePreprocessor', adapterTypes: ['t2i_adapter'] },
];
const CONTROL_ADAPTER_LABELS: Record<UmbraUiInpaintControlAdapterType, string> = {
  controlnet: 'ControlNet',
  t2i_adapter: 'T2I Adapter',
  control_lora: 'Control LoRA',
  z_image_control: 'Z-Image Control',
  anima_lllite: 'Anima LLLite',
};
const CONTROL_MODE_LABELS: Record<UmbraUiInpaintControlMode, string> = {
  balanced: 'Balanced',
  more_prompt: 'Prompt Priority',
  more_control: 'Control Priority',
  unbalanced: 'Unbalanced',
};
const REFERENCE_METHOD_LABELS: Record<UmbraUiInpaintReferenceMethod, string> = {
  style_model: 'Style Model',
  ip_adapter: 'IP Adapter',
  flux_redux: 'FLUX Redux',
  flux_kontext: 'FLUX Kontext',
  flux2_reference: 'FLUX.2 Reference',
  qwen_image_reference: 'Qwen Image Reference',
  hidream_o1_reference: 'HiDream-O1 Reference',
};
const IP_ADAPTER_WEIGHT_TYPES: UmbraUiIpAdapterWeightType[] = [
  'linear', 'ease in', 'ease out', 'ease in-out', 'reverse in-out', 'weak input', 'weak output', 'weak middle',
  'strong middle', 'style transfer', 'composition', 'strong style transfer', 'style and composition',
  'style transfer precise', 'composition precise',
];
const IP_ADAPTER_COMBINE_MODES: UmbraUiIpAdapterCombineEmbeds[] = ['concat', 'add', 'subtract', 'average', 'norm average'];
const IP_ADAPTER_SCALING_MODES: UmbraUiIpAdapterEmbedsScaling[] = ['V only', 'K+V', 'K+V w/ C penalty', 'K+mean(V) w/ C penalty'];
const REGION_ASPECT_RATIO_OPTIONS = [
  { label: 'Free', ratio: 0, widthUnits: 0, heightUnits: 0 },
  { label: '9:16', ratio: 9 / 16, widthUnits: 9, heightUnits: 16 },
  { label: '3:4', ratio: 3 / 4, widthUnits: 3, heightUnits: 4 },
  { label: '1:1', ratio: 1, widthUnits: 1, heightUnits: 1 },
  { label: '16:9', ratio: 16 / 9, widthUnits: 16, heightUnits: 9 },
  { label: '21:9', ratio: 21 / 9, widthUnits: 7, heightUnits: 3 },
] as const;

const INPAINT_RESIZE_ASPECT_RATIO_OPTIONS = [
  { label: 'Source', value: 'source', ratio: 0 },
  { label: 'Custom', value: 'custom', ratio: -1 },
  { label: '1:1 Square', value: '1:1', ratio: 1 },
  { label: '4:3 Landscape', value: '4:3', ratio: 4 / 3 },
  { label: '3:4 Portrait', value: '3:4', ratio: 3 / 4 },
  { label: '16:9 Landscape', value: '16:9', ratio: 16 / 9 },
  { label: '9:16 Portrait', value: '9:16', ratio: 9 / 16 },
  { label: '21:9 Wide', value: '21:9', ratio: 21 / 9 },
] as const;

type InpaintResizeAspectValue = typeof INPAINT_RESIZE_ASPECT_RATIO_OPTIONS[number]['value'];

function createRandomGenerationSeed(): number {
  try {
    const values = new Uint32Array(2);
    crypto.getRandomValues(values);
    return Number((((BigInt(values[0]) << 21n) ^ BigInt(values[1])) % BigInt(Number.MAX_SAFE_INTEGER - 1)) + 1n);
  } catch {
    return Math.max(1, Math.floor(Math.random() * (Number.MAX_SAFE_INTEGER - 1)));
  }
}

function alignInpaintResizeDimension(
  value: number,
  axis: 'width' | 'height',
  resolution: UmbraUiPipelineResolutionCapability,
): number {
  const step = Math.max(1, Math.round(Number(resolution.step) || 8));
  const minimum = Math.max(step, Math.round(Number(axis === 'width' ? resolution.minimumWidth : resolution.minimumHeight) || 64));
  const maximum = Math.max(minimum, Math.round(Number(axis === 'width' ? resolution.maximumWidth : resolution.maximumHeight) || 16384));
  const clamped = Math.max(minimum, Math.min(maximum, Math.round(Number(value) || minimum)));
  return Math.max(minimum, Math.min(maximum, Math.round(clamped / step) * step));
}

function resolveInpaintResizeAspect(
  value: InpaintResizeAspectValue,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): number {
  if (value === 'custom') return Math.max(0.0001, targetWidth / Math.max(1, targetHeight));
  const preset = INPAINT_RESIZE_ASPECT_RATIO_OPTIONS.find((option) => option.value === value);
  return preset && preset.ratio > 0
    ? preset.ratio
    : Math.max(0.0001, sourceWidth / Math.max(1, sourceHeight));
}

function resolveInpaintResizeDimensions(
  area: number,
  ratio: number,
  resolution: UmbraUiPipelineResolutionCapability,
): { width: number; height: number } {
  const safeArea = Math.max(1, Number(area) || 1);
  const safeRatio = Math.max(0.0001, Number(ratio) || 1);
  const rawWidth = Math.sqrt(safeArea * safeRatio);
  const rawHeight = rawWidth / safeRatio;
  return {
    width: alignInpaintResizeDimension(rawWidth, 'width', resolution),
    height: alignInpaintResizeDimension(rawHeight, 'height', resolution),
  };
}

function resolveGenerationRegionPresetDimensions(
  widthUnits: number,
  heightUnits: number,
  resolution: UmbraUiPipelineResolutionCapability,
): { width: number; height: number } {
  const safeWidthUnits = Math.max(1, Math.round(widthUnits));
  const safeHeightUnits = Math.max(1, Math.round(heightUnits));
  const pipelineStep = Math.max(1, Math.round(Number(resolution.step) || UMBRA_CANVAS_STUDIO_SNAP_SIZE));
  const greatestCommonDivisor = (left: number, right: number): number => {
    let a = Math.abs(Math.round(left));
    let b = Math.abs(Math.round(right));
    while (b > 0) [a, b] = [b, a % b];
    return Math.max(1, a);
  };
  const unitStep = (pipelineStep * UMBRA_CANVAS_STUDIO_SNAP_SIZE)
    / greatestCommonDivisor(pipelineStep, UMBRA_CANVAS_STUDIO_SNAP_SIZE);
  const longEdge = Math.max(
    64,
    Number(resolution.defaultWidth) || 1024,
    Number(resolution.defaultHeight) || 1024,
  );
  const minimumUnits = Math.max(
    1,
    Math.ceil((Number(resolution.minimumWidth) || unitStep) / (safeWidthUnits * unitStep)),
    Math.ceil((Number(resolution.minimumHeight) || unitStep) / (safeHeightUnits * unitStep)),
  );
  const maximumWidthUnits = Number.isFinite(Number(resolution.maximumWidth)) && Number(resolution.maximumWidth) > 0
    ? Math.floor(Number(resolution.maximumWidth) / (safeWidthUnits * unitStep))
    : Number.MAX_SAFE_INTEGER;
  const maximumHeightUnits = Number.isFinite(Number(resolution.maximumHeight)) && Number(resolution.maximumHeight) > 0
    ? Math.floor(Number(resolution.maximumHeight) / (safeHeightUnits * unitStep))
    : Number.MAX_SAFE_INTEGER;
  const maximumUnits = Math.max(minimumUnits, Math.min(maximumWidthUnits, maximumHeightUnits));
  const preferredUnits = Math.max(1, Math.round(longEdge / (Math.max(safeWidthUnits, safeHeightUnits) * unitStep)));
  const scaleUnits = Math.max(minimumUnits, Math.min(maximumUnits, preferredUnits));
  return {
    width: safeWidthUnits * unitStep * scaleUnits,
    height: safeHeightUnits * unitStep * scaleUnits,
  };
}

function resolveCenteredInpaintCrop(
  sourceWidth: number,
  sourceHeight: number,
  targetRatio: number,
): UmbraCanvasRect {
  const width = Math.max(1, Math.round(sourceWidth));
  const height = Math.max(1, Math.round(sourceHeight));
  const sourceRatio = width / height;
  const relativeRatioDelta = Math.abs(sourceRatio - targetRatio) / Math.max(sourceRatio, targetRatio);
  // Model dimension alignment can introduce a sub-pixel-equivalent ratio drift.
  // Preserve the full source instead of presenting that negligible adjustment as a crop.
  if (relativeRatioDelta < 0.005) return { x: 0, y: 0, width, height };
  if (sourceRatio > targetRatio) {
    const cropWidth = Math.max(1, Math.round(height * targetRatio));
    return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
  }
  const cropHeight = Math.max(1, Math.round(width / targetRatio));
  return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

function createLocalId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

const HTML_IMAGE_CACHE_LIMIT = 96;
const HTML_IMAGE_CACHE_BYTE_LIMIT = 256 * 1024 * 1024;
const htmlImageCache = new UmbraWeightedLruCache<string, Promise<HTMLImageElement>>(
  HTML_IMAGE_CACHE_LIMIT,
  HTML_IMAGE_CACHE_BYTE_LIMIT,
);

function loadHtmlImage(imageUrl: string): Promise<HTMLImageElement> {
  const cached = htmlImageCache.get(imageUrl);
  if (cached) return cached;
  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      htmlImageCache.updateWeight(imageUrl, image.naturalWidth * image.naturalHeight * 4);
      resolve(image);
    };
    image.onerror = () => {
      htmlImageCache.delete(imageUrl);
      reject(new Error('The selected image could not be loaded.'));
    };
    image.src = imageUrl;
  });
  htmlImageCache.set(imageUrl, request);
  return request;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The inpaint canvas could not be encoded.'));
    }, type, quality);
  });
}

async function encodeFullResolutionCanvas(
  canvas: HTMLCanvasElement,
  options: { type?: string; quality?: number; signal?: AbortSignal } = {},
): Promise<Blob> {
  if (options.signal?.aborted) throw new DOMException('Canvas encoding was canceled.', 'AbortError');
  if (canUseUmbraCanvasEncodeWorker()) {
    return (await encodeUmbraCanvasInWorker({
      canvas,
      type: options.type,
      quality: options.quality,
      signal: options.signal,
    })).blob;
  }
  const blob = await canvasToBlob(canvas, options.type, options.quality);
  if (options.signal?.aborted) throw new DOMException('Canvas encoding was canceled.', 'AbortError');
  return blob;
}

function isCanvasOperationAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function resizeCanvasForProcessing(
  source: HTMLCanvasElement,
  width: number,
  height: number,
  imageSmoothing = true,
): HTMLCanvasElement {
  if (source.width === width && source.height === height) return source;
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(width));
  output.height = Math.max(1, Math.round(height));
  const context = output.getContext('2d');
  if (!context) throw new Error('The inpaint processing surface could not be resized.');
  context.imageSmoothingEnabled = imageSmoothing;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, output.width, output.height);
  return output;
}

function encodeMaskCanvasForComfy(source: HTMLCanvasElement): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;
  const context = output.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The inpaint mask could not be encoded for ComfyUI.');
  context.drawImage(source, 0, 0);
  for (let tileY = 0; tileY < output.height; tileY += PIXEL_READBACK_TILE_ROWS) {
    const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, output.height - tileY);
    const pixels = context.getImageData(0, tileY, output.width, tileHeight);
    encodeUmbraMaskAlphaAsGrayscale(pixels.data);
    context.putImageData(pixels, 0, tileY);
  }
  return output;
}

function parseCanvasColor(color: string): { red: number; green: number; blue: number; alpha: number } {
  const normalized = String(color || '').trim();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(normalized);
  const longHex = /^#([0-9a-f]{6})$/i.exec(normalized);
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(normalized);
  const value = shortHex
    ? shortHex[1].split('').map((character) => `${character}${character}`).join('')
    : longHex?.[1];
  if (value) return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
    alpha: 1,
  };
  if (rgba) return {
    red: Math.max(0, Math.min(255, Math.round(Number(rgba[1]) || 0))),
    green: Math.max(0, Math.min(255, Math.round(Number(rgba[2]) || 0))),
    blue: Math.max(0, Math.min(255, Math.round(Number(rgba[3]) || 0))),
    alpha: rgba[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgba[4]) || 0)),
  };
  return { red: 255, green: 48, blue: 76, alpha: 1 };
}

function colorWithAlpha(color: string, alpha: number): string {
  const { red, green, blue } = parseCanvasColor(color);
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, alpha))})`;
}

function colorAsHex(color: string): string {
  const { red, green, blue } = parseCanvasColor(color);
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function maskExtremaPass(
  source: Uint8ClampedArray,
  target: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean,
  grow: boolean,
) {
  const lineLength = horizontal ? width : height;
  const lineCount = horizontal ? height : width;
  const outside = grow ? 0 : 255;
  const indexes = new Int32Array(lineLength + radius * 2 + 1);
  const values = new Uint8ClampedArray(lineLength + radius * 2 + 1);
  for (let line = 0; line < lineCount; line += 1) {
    let head = 0;
    let tail = 0;
    for (let position = -radius; position < lineLength + radius; position += 1) {
      const inside = position >= 0 && position < lineLength;
      const sourceIndex = horizontal ? line * width + position : position * width + line;
      const value = inside ? source[sourceIndex] : outside;
      while (tail > head && (grow ? values[tail - 1] <= value : values[tail - 1] >= value)) tail -= 1;
      indexes[tail] = position;
      values[tail] = value;
      tail += 1;
      while (tail > head && indexes[head] < position - radius * 2) head += 1;
      const outputPosition = position - radius;
      if (outputPosition < 0 || outputPosition >= lineLength) continue;
      const targetIndex = horizontal ? line * width + outputPosition : outputPosition * width + line;
      target[targetIndex] = values[head];
    }
  }
}

function morphMaskCanvas(canvas: HTMLCanvasElement, amount: number) {
  const radius = Math.max(1, Math.min(256, Math.round(Math.abs(amount))));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const alpha = new Uint8ClampedArray(canvas.width * canvas.height);
  for (let tileY = 0; tileY < canvas.height; tileY += PIXEL_READBACK_TILE_ROWS) {
    const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, canvas.height - tileY);
    const pixels = context.getImageData(0, tileY, canvas.width, tileHeight);
    for (let index = 0; index < canvas.width * tileHeight; index += 1) {
      alpha[tileY * canvas.width + index] = pixels.data[index * 4 + 3];
    }
  }
  const horizontal = new Uint8ClampedArray(alpha.length);
  const grow = amount > 0;
  maskExtremaPass(alpha, horizontal, canvas.width, canvas.height, radius, true, grow);
  maskExtremaPass(horizontal, alpha, canvas.width, canvas.height, radius, false, grow);
  for (let tileY = 0; tileY < canvas.height; tileY += PIXEL_READBACK_TILE_ROWS) {
    const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, canvas.height - tileY);
    const pixels = context.createImageData(canvas.width, tileHeight);
    for (let index = 0; index < canvas.width * tileHeight; index += 1) {
      pixels.data[index * 4] = 255;
      pixels.data[index * 4 + 1] = 48;
      pixels.data[index * 4 + 2] = 76;
      pixels.data[index * 4 + 3] = alpha[tileY * canvas.width + index];
    }
    context.putImageData(pixels, 0, tileY);
  }
}

async function buildColorSelectionCanvas(
  source: HTMLCanvasElement,
  bounds: UmbraCanvasRect,
  point: Point,
  toleranceInput: number,
  contiguous: boolean,
): Promise<HTMLCanvasElement> {
  const sourceContext = source.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) throw new Error('The visible canvas cannot be sampled.');
  const left = Math.max(0, Math.min(source.width - 1, Math.floor(bounds.x)));
  const top = Math.max(0, Math.min(source.height - 1, Math.floor(bounds.y)));
  const width = Math.max(1, Math.min(source.width - left, Math.ceil(bounds.width)));
  const height = Math.max(1, Math.min(source.height - top, Math.ceil(bounds.height)));
  const seedX = Math.max(0, Math.min(width - 1, Math.round(point.x) - left));
  const seedY = Math.max(0, Math.min(height - 1, Math.round(point.y) - top));
  const tolerance = Math.max(0, Math.min(255, Math.round(toleranceInput)));
  const target = sourceContext.getImageData(left + seedX, top + seedY, 1, 1).data;
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('The color selection cannot be prepared.');
  const tileSize = 256;
  const matchesPixel = (pixels: Uint8ClampedArray, offset: number) => (
    Math.abs(pixels[offset] - target[0]) <= tolerance
    && Math.abs(pixels[offset + 1] - target[1]) <= tolerance
    && Math.abs(pixels[offset + 2] - target[2]) <= tolerance
    && Math.abs(pixels[offset + 3] - target[3]) <= tolerance
  );
  const writeTile = (tileX: number, tileY: number, tileWidth: number, tileHeight: number, selected: Uint8Array | null) => {
    const sourcePixels = selected ? null : sourceContext.getImageData(left + tileX, top + tileY, tileWidth, tileHeight);
    const maskPixels = outputContext.createImageData(tileWidth, tileHeight);
    for (let localY = 0; localY < tileHeight; localY += 1) {
      for (let localX = 0; localX < tileWidth; localX += 1) {
        const localIndex = localY * tileWidth + localX;
        const selectedValue = selected
          ? selected[(tileY + localY) * width + tileX + localX]
          : matchesPixel(sourcePixels!.data, localIndex * 4) ? 255 : 0;
        if (!selectedValue) continue;
        const offset = localIndex * 4;
        maskPixels.data[offset] = 255;
        maskPixels.data[offset + 1] = 48;
        maskPixels.data[offset + 2] = 76;
        maskPixels.data[offset + 3] = selectedValue;
      }
    }
    outputContext.putImageData(maskPixels, tileX, tileY);
  };

  if (!contiguous) {
    let tileCount = 0;
    for (let tileY = 0; tileY < height; tileY += tileSize) {
      for (let tileX = 0; tileX < width; tileX += tileSize) {
        writeTile(tileX, tileY, Math.min(tileSize, width - tileX), Math.min(tileSize, height - tileY), null);
        tileCount += 1;
        if (tileCount % 32 === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }
    return output;
  }

  const selected = new Uint8Array(width * height);
  const tileCache = new Map<string, ImageData>();
  const getTile = (x: number, y: number) => {
    const tileX = Math.floor(x / tileSize) * tileSize;
    const tileY = Math.floor(y / tileSize) * tileSize;
    const key = `${tileX}:${tileY}`;
    const cached = tileCache.get(key);
    if (cached) {
      tileCache.delete(key);
      tileCache.set(key, cached);
      return { pixels: cached, tileX, tileY };
    }
    const pixels = sourceContext.getImageData(
      left + tileX,
      top + tileY,
      Math.min(tileSize, width - tileX),
      Math.min(tileSize, height - tileY),
    );
    tileCache.set(key, pixels);
    if (tileCache.size > 64) tileCache.delete(tileCache.keys().next().value as string);
    return { pixels, tileX, tileY };
  };
  const matches = (x: number, y: number) => {
    const { pixels, tileX, tileY } = getTile(x, y);
    const offset = ((y - tileY) * pixels.width + x - tileX) * 4;
    return matchesPixel(pixels.data, offset);
  };
  const stack: number[] = [seedX, seedY];
  let spans = 0;
  while (stack.length > 0) {
    const y = stack.pop()!;
    let x = stack.pop()!;
    let index = y * width + x;
    while (x >= 0 && !selected[index] && matches(x, y)) {
      x -= 1;
      index -= 1;
    }
    x += 1;
    index += 1;
    let spanAbove = false;
    let spanBelow = false;
    while (x < width && !selected[index] && matches(x, y)) {
      selected[index] = 255;
      if (y > 0) {
        const above = index - width;
        if (!selected[above] && matches(x, y - 1)) {
          if (!spanAbove) stack.push(x, y - 1);
          spanAbove = true;
        } else spanAbove = false;
      }
      if (y + 1 < height) {
        const below = index + width;
        if (!selected[below] && matches(x, y + 1)) {
          if (!spanBelow) stack.push(x, y + 1);
          spanBelow = true;
        } else spanBelow = false;
      }
      x += 1;
      index += 1;
    }
    spans += 1;
    if (spans % 2048 === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  tileCache.clear();
  let tileCount = 0;
  for (let tileY = 0; tileY < height; tileY += tileSize) {
    for (let tileX = 0; tileX < width; tileX += tileSize) {
      writeTile(tileX, tileY, Math.min(tileSize, width - tileX), Math.min(tileSize, height - tileY), selected);
      tileCount += 1;
      if (tileCount % 32 === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
  }
  return output;
}

function cropCanvas(canvas: HTMLCanvasElement, region: UmbraCanvasRect, fill = ''): HTMLCanvasElement {
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(region.width));
  output.height = Math.max(1, Math.round(region.height));
  const context = output.getContext('2d');
  if (!context) throw new Error('The selected canvas region could not be prepared.');
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, output.width, output.height);
  }
  context.drawImage(
    canvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    output.width,
    output.height,
  );
  return output;
}

function transformFullCanvasBitmap(
  sourceCanvas: HTMLCanvasElement,
  operation: CanvasArtboardTransformOperation,
): HTMLCanvasElement {
  const rotates = operation === 'rotate_left' || operation === 'rotate_right';
  const output = document.createElement('canvas');
  output.width = rotates ? sourceCanvas.height : sourceCanvas.width;
  output.height = rotates ? sourceCanvas.width : sourceCanvas.height;
  const context = output.getContext('2d');
  if (!context) throw new Error('Unable to transform the canvas image.');
  context.save();
  if (operation === 'flip_horizontal') {
    context.translate(output.width, 0);
    context.scale(-1, 1);
  } else if (operation === 'flip_vertical') {
    context.translate(0, output.height);
    context.scale(1, -1);
  } else if (operation === 'rotate_right') {
    context.translate(output.width, 0);
    context.rotate(Math.PI / 2);
  } else {
    context.translate(0, output.height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(sourceCanvas, 0, 0);
  context.restore();
  return output;
}

async function renderImageTransformIntoRegion(
  imageUrl: string,
  transform: UmbraCanvasLayer['transform'],
  region: UmbraCanvasRect,
  fill = '',
): Promise<HTMLCanvasElement> {
  const output = document.createElement('canvas');
  output.width = Math.max(1, Math.round(region.width));
  output.height = Math.max(1, Math.round(region.height));
  const context = output.getContext('2d');
  if (!context) throw new Error('The regional canvas input could not be prepared.');
  if (fill) {
    context.fillStyle = fill;
    context.fillRect(0, 0, output.width, output.height);
  }
  const image = await loadHtmlImage(imageUrl);
  const { x, y, width, height, rotation, scaleX, scaleY } = transform;
  context.save();
  context.translate(x + width / 2 - region.x, y + height / 2 - region.y);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scaleX, scaleY);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
  return output;
}

function applyMaskedGaussianNoise(imageCanvas: HTMLCanvasElement, noiseMaskCanvas: HTMLCanvasElement, seed: number): void {
  const imageContext = imageCanvas.getContext('2d', { willReadFrequently: true });
  const maskContext = noiseMaskCanvas.getContext('2d', { willReadFrequently: true });
  if (!imageContext || !maskContext || imageCanvas.width !== noiseMaskCanvas.width || imageCanvas.height !== noiseMaskCanvas.height) return;
  let state = (Math.round(seed) >>> 0) || 0x9e3779b9;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
  for (let tileY = 0; tileY < imageCanvas.height; tileY += PIXEL_READBACK_TILE_ROWS) {
    const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, imageCanvas.height - tileY);
    const image = imageContext.getImageData(0, tileY, imageCanvas.width, tileHeight);
    const mask = maskContext.getImageData(0, tileY, noiseMaskCanvas.width, tileHeight);
    for (let index = 0; index < image.data.length; index += 4) {
      const influence = mask.data[index + 3] / 255;
      if (influence <= 0) continue;
      const gaussian = (random() + random() + random() + random() + random() + random() - 3) * 34 * influence;
      image.data[index] = Math.max(0, Math.min(255, image.data[index] + gaussian));
      image.data[index + 1] = Math.max(0, Math.min(255, image.data[index + 1] + gaussian));
      image.data[index + 2] = Math.max(0, Math.min(255, image.data[index + 2] + gaussian));
    }
    imageContext.putImageData(image, 0, tileY);
  }
}

function findMaskAlphaBounds(canvas: HTMLCanvasElement): UmbraCanvasRect | null {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let tileY = 0; tileY < canvas.height; tileY += PIXEL_READBACK_TILE_ROWS) {
    const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, canvas.height - tileY);
    const pixels = context.getImageData(0, tileY, canvas.width, tileHeight).data;
    for (let localY = 0; localY < tileHeight; localY += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        if (pixels[(localY * canvas.width + x) * 4 + 3] <= 4) continue;
        const y = tileY + localY;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }
  return right < left || bottom < top
    ? null
    : { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}

function calculateMaskAlphaCoverage(canvas: HTMLCanvasElement): number {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const totalPixels = canvas.width * canvas.height;
  if (!context || totalPixels <= 0) return 0;
  let coveredPixels = 0;
  for (let tileY = 0; tileY < canvas.height; tileY += PIXEL_READBACK_TILE_ROWS) {
    const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, canvas.height - tileY);
    const pixels = context.getImageData(0, tileY, canvas.width, tileHeight).data;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 4) coveredPixels += 1;
    }
  }
  return coveredPixels / totalPixels;
}

type UmbraVisualCanvasLayer = UmbraCanvasRasterLayer | UmbraCanvasTextLayer | UmbraCanvasGradientLayer;
type UmbraTransformableCanvasLayer = UmbraVisualCanvasLayer | UmbraCanvasControlLayer | UmbraCanvasReferenceLayer | UmbraCanvasRegionalGuidanceLayer | UmbraCanvasMaskLayer;

function visualLayerBounds(layer: UmbraVisualCanvasLayer): UmbraCanvasRect {
  const { x, y, width, height, rotation, scaleX, scaleY } = layer.transform;
  const radians = (rotation * Math.PI) / 180;
  const scaledWidth = Math.abs(width * scaleX);
  const scaledHeight = Math.abs(height * scaleY);
  const boundsWidth = Math.abs(scaledWidth * Math.cos(radians)) + Math.abs(scaledHeight * Math.sin(radians));
  const boundsHeight = Math.abs(scaledWidth * Math.sin(radians)) + Math.abs(scaledHeight * Math.cos(radians));
  return {
    x: x + width / 2 - boundsWidth / 2,
    y: y + height / 2 - boundsHeight / 2,
    width: boundsWidth,
    height: boundsHeight,
  };
}

function canvasResourceRevision(value: string): string {
  const source = String(value || '');
  return `${source.length}:${source.slice(0, 40)}:${source.slice(-40)}`;
}

function buildGuidanceOverlayKey(
  documentState: UmbraCanvasDocument | null,
  excludedMaskLayerId: string,
  visibility: GuidanceOverlayVisibility,
): string {
  if (!documentState || !visibility.showGuidanceOverlays) return 'hidden';
  const layers = documentState.layers.flatMap((layer) => {
    if ((layer.kind === 'control' && visibility.showControlLayerOverlays)
      || (layer.kind === 'reference' && visibility.showReferenceLayerOverlays)) return [{
      id: layer.id,
      kind: layer.kind,
      visible: layer.visible,
      opacity: layer.opacity,
      lightnessToAlpha: layer.kind === 'control' ? layer.lightnessToAlpha : undefined,
      transform: layer.transform,
      asset: canvasResourceRevision(layer.asset.imageUrl),
      maskLayerId: layer.kind === 'reference' ? layer.maskLayerId : undefined,
      regionLayerId: layer.kind === 'reference' ? layer.regionLayerId : undefined,
      updatedAt: layer.updatedAt,
    }];
    if (layer.kind === 'regional_guidance' && visibility.showRegionalGuidanceOverlays) return [{
      id: layer.id,
      kind: layer.kind,
      visible: layer.visible,
      opacity: layer.opacity,
      maskLayerId: layer.maskLayerId,
      updatedAt: layer.updatedAt,
    }];
    const maskOverlayVisible = layer.kind === 'mask' && (
      layer.purpose === 'inpaint' ? visibility.showInpaintMaskOverlays
        : layer.purpose === 'regional_guidance' ? visibility.showRegionalGuidanceOverlays
          : layer.purpose === 'reference' ? visibility.showReferenceLayerOverlays
            : false
    );
    if (layer.kind === 'mask' && maskOverlayVisible) return [{
      id: layer.id,
      kind: layer.kind,
      purpose: layer.purpose,
      visible: layer.visible,
      excluded: layer.id === excludedMaskLayerId,
      transform: layer.transform,
      data: canvasResourceRevision(layer.dataUrl),
      overlayColor: layer.overlayColor,
      overlayStyle: layer.overlayStyle,
      updatedAt: layer.updatedAt,
    }];
    return [];
  });
  return JSON.stringify([documentState.width, documentState.height, documentState.activeLayerId, visibility, layers]);
}

async function drawGuidanceOverlayImage(
  context: CanvasRenderingContext2D,
  imageUrl: string,
  transform: UmbraCanvasLayer['transform'],
  opacity: number,
  filter = 'none',
  lightnessToAlpha = false,
  scratch?: HTMLCanvasElement,
  previewScale = 1,
): Promise<void> {
  if (!imageUrl || opacity <= 0) return;
  const image = await loadHtmlImage(imageUrl);
  if (lightnessToAlpha && scratch) {
    const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
    if (!scratchContext) return;
    scratchContext.setTransform(1, 0, 0, 1, 0, 0);
    scratchContext.globalAlpha = 1;
    scratchContext.globalCompositeOperation = 'source-over';
    scratchContext.filter = filter;
    scratchContext.clearRect(0, 0, scratch.width, scratch.height);
    scratchContext.save();
    scratchContext.scale(previewScale, previewScale);
    const { x, y, width, height, rotation, scaleX, scaleY } = transform;
    scratchContext.translate(x + width / 2, y + height / 2);
    scratchContext.rotate((rotation * Math.PI) / 180);
    scratchContext.scale(scaleX, scaleY);
    scratchContext.drawImage(image, -width / 2, -height / 2, width, height);
    scratchContext.restore();
    for (let tileY = 0; tileY < scratch.height; tileY += PIXEL_READBACK_TILE_ROWS) {
      const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, scratch.height - tileY);
      const pixels = scratchContext.getImageData(0, tileY, scratch.width, tileHeight);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const red = pixels.data[index];
        const green = pixels.data[index + 1];
        const blue = pixels.data[index + 2];
        const alpha = pixels.data[index + 3];
        pixels.data[index + 3] = Math.min(alpha, Math.round((Math.min(red, green, blue) + Math.max(red, green, blue)) / 2));
      }
      scratchContext.putImageData(pixels, 0, tileY);
    }
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalAlpha = Math.max(0, Math.min(1, opacity));
    context.drawImage(scratch, 0, 0);
    context.restore();
    return;
  }
  const { x, y, width, height, rotation, scaleX, scaleY } = transform;
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  context.filter = filter;
  context.translate(x + width / 2, y + height / 2);
  context.rotate((rotation * Math.PI) / 180);
  context.scale(scaleX, scaleY);
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.restore();
}

function createGuidanceMaskPattern(
  context: CanvasRenderingContext2D,
  color: string,
  style: UmbraCanvasMaskOverlayStyle,
): string | CanvasPattern {
  if (style === 'solid') return colorAsHex(color);
  const tile = document.createElement('canvas');
  tile.width = 16;
  tile.height = 16;
  const tileContext = tile.getContext('2d');
  if (!tileContext) return colorAsHex(color);
  tileContext.fillStyle = colorWithAlpha(color, 0.22);
  tileContext.fillRect(0, 0, tile.width, tile.height);
  tileContext.strokeStyle = colorAsHex(color);
  tileContext.lineWidth = 1.5;
  tileContext.beginPath();
  if (style === 'grid') {
    tileContext.moveTo(0, 0.75);
    tileContext.lineTo(tile.width, 0.75);
    tileContext.moveTo(0.75, 0);
    tileContext.lineTo(0.75, tile.height);
  } else if (style === 'crosshatch') {
    tileContext.moveTo(-4, 4);
    tileContext.lineTo(12, 20);
    tileContext.moveTo(4, -4);
    tileContext.lineTo(20, 12);
    tileContext.moveTo(20, 4);
    tileContext.lineTo(4, 20);
    tileContext.moveTo(12, -4);
    tileContext.lineTo(-4, 12);
  } else if (style === 'diagonal') {
    tileContext.moveTo(-4, 4);
    tileContext.lineTo(12, 20);
    tileContext.moveTo(4, -4);
    tileContext.lineTo(20, 12);
  } else if (style === 'horizontal') {
    tileContext.moveTo(0, 8);
    tileContext.lineTo(16, 8);
  } else {
    tileContext.moveTo(8, 0);
    tileContext.lineTo(8, 16);
  }
  tileContext.stroke();
  return context.createPattern(tile, 'repeat') || colorAsHex(color);
}

async function drawGuidanceMaskOverlay(
  context: CanvasRenderingContext2D,
  scratch: HTMLCanvasElement,
  imageUrl: string,
  transform: UmbraCanvasLayer['transform'],
  opacity: number,
  color: string,
  style: UmbraCanvasMaskOverlayStyle,
  previewScale: number,
): Promise<void> {
  if (!imageUrl || opacity <= 0) return;
  const image = await loadHtmlImage(imageUrl);
  const scratchContext = scratch.getContext('2d');
  if (!scratchContext) return;
  scratchContext.setTransform(1, 0, 0, 1, 0, 0);
  scratchContext.globalAlpha = 1;
  scratchContext.globalCompositeOperation = 'source-over';
  scratchContext.clearRect(0, 0, scratch.width, scratch.height);
  scratchContext.save();
  scratchContext.scale(previewScale, previewScale);
  const { x, y, width, height, rotation, scaleX, scaleY } = transform;
  scratchContext.translate(x + width / 2, y + height / 2);
  scratchContext.rotate((rotation * Math.PI) / 180);
  scratchContext.scale(scaleX, scaleY);
  scratchContext.drawImage(image, -width / 2, -height / 2, width, height);
  scratchContext.restore();
  scratchContext.globalCompositeOperation = 'source-in';
  scratchContext.fillStyle = createGuidanceMaskPattern(scratchContext, color, style);
  scratchContext.fillRect(0, 0, scratch.width, scratch.height);
  scratchContext.globalCompositeOperation = 'source-over';
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = Math.max(0, Math.min(1, opacity));
  context.drawImage(scratch, 0, 0);
  context.restore();
}

async function renderCanvasGuidanceOverlays(
  canvas: HTMLCanvasElement,
  documentState: UmbraCanvasDocument,
  excludedMaskLayerId: string,
  visibility: GuidanceOverlayVisibility,
): Promise<void> {
  const previewScale = Math.min(
    1,
    2048 / Math.max(1, documentState.width, documentState.height),
    Math.sqrt(4_000_000 / Math.max(1, documentState.width * documentState.height)),
  );
  canvas.width = Math.max(1, Math.round(documentState.width * previewScale));
  canvas.height = Math.max(1, Math.round(documentState.height * previewScale));
  const context = canvas.getContext('2d');
  if (!context) return;
  const maskScratch = document.createElement('canvas');
  maskScratch.width = canvas.width;
  maskScratch.height = canvas.height;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.scale(previewScale, previewScale);
  const masks = new Map(documentState.layers
    .filter((layer): layer is Extract<UmbraCanvasLayer, { kind: 'mask' }> => layer.kind === 'mask')
    .map((layer) => [layer.id, layer]));
  const activeLayerId = documentState.activeLayerId;

  for (const layer of documentState.layers) {
    if (visibility.showControlLayerOverlays && layer.kind === 'control' && layer.visible) {
      await drawGuidanceOverlayImage(
        context,
        layer.asset.imageUrl,
        layer.transform,
        Math.min(0.72, layer.opacity * (layer.id === activeLayerId ? 0.68 : 0.38)),
        'none',
        layer.lightnessToAlpha,
        maskScratch,
        previewScale,
      );
      continue;
    }
    if (visibility.showReferenceLayerOverlays && layer.kind === 'reference' && layer.visible && layer.id === activeLayerId) {
      await drawGuidanceOverlayImage(context, layer.asset.imageUrl, layer.transform, Math.min(0.5, layer.opacity * 0.42));
      const influenceMask = layer.maskLayerId ? masks.get(layer.maskLayerId) : null;
      if (influenceMask?.dataUrl) {
        await drawGuidanceMaskOverlay(
          context,
          maskScratch,
          influenceMask.dataUrl,
          influenceMask.transform,
          0.42,
          influenceMask.overlayColor,
          influenceMask.overlayStyle,
          previewScale,
        );
      }
      continue;
    }
    if (visibility.showRegionalGuidanceOverlays && layer.kind === 'regional_guidance' && layer.visible) {
      const mask = masks.get(layer.maskLayerId);
      if (mask?.dataUrl) {
        await drawGuidanceMaskOverlay(
          context,
          maskScratch,
          mask.dataUrl,
          mask.transform,
          Math.min(0.7, layer.opacity * 0.5),
          mask.overlayColor,
          mask.overlayStyle,
          previewScale,
        );
      }
      continue;
    }
    if (
      layer.kind === 'mask'
      && layer.purpose === 'inpaint'
      && visibility.showInpaintMaskOverlays
      && layer.visible
      && !layer.frozen
      && layer.id !== excludedMaskLayerId
      && layer.dataUrl
    ) {
      await drawGuidanceMaskOverlay(
        context,
        maskScratch,
        layer.dataUrl,
        layer.transform,
        Math.min(0.72, layer.opacity * (layer.id === activeLayerId ? 0.62 : 0.38)),
        layer.overlayColor,
        layer.overlayStyle,
        previewScale,
      );
    }
  }
}

function applyRasterSharpness(canvas: HTMLCanvasElement, amount: number): void {
  const strength = Math.max(0, Math.min(1, amount));
  if (strength <= 0) return;
  const sourceContext = canvas.getContext('2d', { willReadFrequently: true });
  if (!sourceContext) return;
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const outputContext = output.getContext('2d');
  if (!outputContext) return;
  const tileSize = 512;
  const weight = strength * 0.65;
  for (let tileY = 0; tileY < canvas.height; tileY += tileSize) {
    for (let tileX = 0; tileX < canvas.width; tileX += tileSize) {
      const width = Math.min(tileSize, canvas.width - tileX);
      const height = Math.min(tileSize, canvas.height - tileY);
      const sourceX = Math.max(0, tileX - 1);
      const sourceY = Math.max(0, tileY - 1);
      const sourceRight = Math.min(canvas.width, tileX + width + 1);
      const sourceBottom = Math.min(canvas.height, tileY + height + 1);
      const source = sourceContext.getImageData(sourceX, sourceY, sourceRight - sourceX, sourceBottom - sourceY);
      const sharpened = outputContext.createImageData(width, height);
      const originX = tileX - sourceX;
      const originY = tileY - sourceY;
      const pixelOffset = (x: number, y: number) => (
        (Math.max(0, Math.min(source.height - 1, y)) * source.width + Math.max(0, Math.min(source.width - 1, x))) * 4
      );
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const center = pixelOffset(originX + x, originY + y);
          const left = pixelOffset(originX + x - 1, originY + y);
          const right = pixelOffset(originX + x + 1, originY + y);
          const top = pixelOffset(originX + x, originY + y - 1);
          const bottom = pixelOffset(originX + x, originY + y + 1);
          const target = (y * width + x) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            sharpened.data[target + channel] = Math.max(0, Math.min(255,
              source.data[center + channel] * (1 + weight * 4)
              - (source.data[left + channel] + source.data[right + channel] + source.data[top + channel] + source.data[bottom + channel]) * weight,
            ));
          }
          sharpened.data[target + 3] = source.data[center + 3];
        }
      }
      outputContext.putImageData(sharpened, tileX, tileY);
    }
  }
  sourceContext.clearRect(0, 0, canvas.width, canvas.height);
  sourceContext.drawImage(output, 0, 0);
}

function buildCanvasCurveLut(points: Array<[number, number]>): Uint8ClampedArray {
  const sorted = points.slice().sort((left, right) => left[0] - right[0]);
  const lut = new Uint8ClampedArray(256);
  let segment = 0;
  for (let input = 0; input < 256; input += 1) {
    while (segment < sorted.length - 2 && input > (sorted[segment + 1]?.[0] ?? 255)) segment += 1;
    const start = sorted[segment] || [0, 0];
    const end = sorted[segment + 1] || [255, 255];
    const ratio = end[0] === start[0] ? 0 : (input - start[0]) / (end[0] - start[0]);
    lut[input] = Math.max(0, Math.min(255, Math.round(start[1] + (end[1] - start[1]) * ratio)));
  }
  return lut;
}

function applyRasterCurves(canvas: HTMLCanvasElement, curves: UmbraCanvasCurves): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  const master = buildCanvasCurveLut(curves.master);
  const red = buildCanvasCurveLut(curves.r);
  const green = buildCanvasCurveLut(curves.g);
  const blue = buildCanvasCurveLut(curves.b);
  const tileSize = 512;
  for (let tileY = 0; tileY < canvas.height; tileY += tileSize) {
    for (let tileX = 0; tileX < canvas.width; tileX += tileSize) {
      const width = Math.min(tileSize, canvas.width - tileX);
      const height = Math.min(tileSize, canvas.height - tileY);
      const pixels = context.getImageData(tileX, tileY, width, height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = red[master[pixels.data[index]]];
        pixels.data[index + 1] = green[master[pixels.data[index + 1]]];
        pixels.data[index + 2] = blue[master[pixels.data[index + 2]]];
      }
      context.putImageData(pixels, tileX, tileY);
    }
  }
}

function createAdjustedRasterCanvas(
  image: HTMLImageElement,
  width: number,
  height: number,
  layer: UmbraCanvasRasterLayer,
  renderScale = 1,
  sourceCrop: UmbraCanvasRect | null = null,
): HTMLCanvasElement {
  const crop = sourceCrop || { x: 0, y: 0, width, height };
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(crop.width * renderScale));
  canvas.height = Math.max(1, Math.round(crop.height * renderScale));
  const context = canvas.getContext('2d');
  if (!context) return canvas;
  const adjustments = layer.adjustments;
  context.imageSmoothingEnabled = layer.smoothing !== 'none';
  context.imageSmoothingQuality = layer.smoothing === 'none' ? 'low' : layer.smoothing;
  if (adjustments.enabled && adjustments.mode === 'simple') {
    context.filter = [
      `brightness(${Math.max(0, 1 + adjustments.brightness)})`,
      `contrast(${Math.max(0, 1 + adjustments.contrast)})`,
      `saturate(${Math.max(0, 1 + adjustments.saturation)})`,
    ].join(' ');
  }
  context.drawImage(
    image,
    crop.x / Math.max(1, width) * image.naturalWidth,
    crop.y / Math.max(1, height) * image.naturalHeight,
    crop.width / Math.max(1, width) * image.naturalWidth,
    crop.height / Math.max(1, height) * image.naturalHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  context.filter = 'none';
  if (adjustments.enabled && adjustments.mode === 'simple' && adjustments.temperature !== 0) {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = adjustments.temperature > 0
      ? `rgba(255,128,0,${Math.abs(adjustments.temperature) * 0.2})`
      : `rgba(0,128,255,${Math.abs(adjustments.temperature) * 0.2})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (adjustments.enabled && adjustments.mode === 'simple' && adjustments.tint !== 0) {
    context.globalCompositeOperation = 'source-atop';
    context.fillStyle = adjustments.tint > 0
      ? `rgba(255,0,180,${Math.abs(adjustments.tint) * 0.16})`
      : `rgba(0,220,100,${Math.abs(adjustments.tint) * 0.16})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.globalCompositeOperation = 'source-over';
  if (adjustments.enabled && adjustments.mode === 'simple') applyRasterSharpness(canvas, adjustments.sharpness);
  if (adjustments.enabled && adjustments.mode === 'curves') applyRasterCurves(canvas, adjustments.curves);
  return canvas;
}

async function drawVisualCanvasLayer(
  context: CanvasRenderingContext2D,
  layer: UmbraVisualCanvasLayer,
  masks: Map<string, Extract<UmbraCanvasLayer, { kind: 'mask' }>>,
  renderScale = 1,
  renderViewport: UmbraCanvasRect | null = null,
): Promise<void> {
  if (!layer.visible) return;
    context.imageSmoothingEnabled = layer.kind !== 'raster' || layer.smoothing !== 'none';
    context.imageSmoothingQuality = layer.kind === 'raster' && layer.smoothing !== 'none' ? layer.smoothing : 'high';
    const { x, y, width, height, rotation, scaleX, scaleY } = layer.transform;
    let drawable: CanvasImageSource | null = null;
    let rasterSourceCrop: UmbraCanvasRect | null = null;
    if (layer.kind === 'raster') {
      const image = await loadHtmlImage(layer.asset.imageUrl);
      const adjustmentsEnabled = layer.adjustments.enabled;
      const linkedMask = layer.maskLayerId ? masks.get(layer.maskLayerId) : null;
      const linkedMaskEnabled = !!linkedMask?.enabled && !!linkedMask.dataUrl;
      if (linkedMaskEnabled || adjustmentsEnabled) {
        const sourceCrop = renderViewport
          ? resolveUmbraCanvasLayerSourceCrop(layer.transform, renderViewport, 2)
          : { x: 0, y: 0, width, height };
        if (!sourceCrop) return;
        rasterSourceCrop = sourceCrop;
        const maskedCanvas = createAdjustedRasterCanvas(image, width, height, layer, renderScale, sourceCrop);
        const maskedContext = maskedCanvas.getContext('2d');
        if (maskedContext) {
          if (linkedMaskEnabled && linkedMask) {
            const maskImage = await loadHtmlImage(linkedMask.dataUrl);
            const localMask = document.createElement('canvas');
            localMask.width = maskedCanvas.width;
            localMask.height = maskedCanvas.height;
            const localMaskContext = localMask.getContext('2d');
            if (localMaskContext) {
              localMaskContext.scale(renderScale, renderScale);
              localMaskContext.translate(-sourceCrop.x, -sourceCrop.y);
              localMaskContext.translate(width / 2, height / 2);
              localMaskContext.scale(1 / (scaleX || 1), 1 / (scaleY || 1));
              localMaskContext.rotate((-rotation * Math.PI) / 180);
              localMaskContext.translate(-(x + width / 2), -(y + height / 2));
              localMaskContext.drawImage(
                maskImage,
                linkedMask.transform.x,
                linkedMask.transform.y,
                linkedMask.transform.width,
                linkedMask.transform.height,
              );
            }
            maskedContext.globalCompositeOperation = 'destination-in';
            maskedContext.drawImage(localMask, 0, 0);
          }
          drawable = maskedCanvas;
        }
      } else drawable = image;
    }
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    context.globalCompositeOperation = layer.blendMode;
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    context.translate(centerX, centerY);
    context.rotate((rotation * Math.PI) / 180);
    context.scale(scaleX, scaleY);
    if (layer.kind === 'raster' && drawable) {
      context.drawImage(
        drawable,
        -width / 2 + (rasterSourceCrop?.x || 0),
        -height / 2 + (rasterSourceCrop?.y || 0),
        rasterSourceCrop?.width || width,
        rasterSourceCrop?.height || height,
      );
    } else if (layer.kind === 'gradient') {
      const startX = (layer.startX - 0.5) * width;
      const startY = (layer.startY - 0.5) * height;
      const endX = (layer.endX - 0.5) * width;
      const endY = (layer.endY - 0.5) * height;
      const centerOffsetX = (layer.centerX - 0.5) * width;
      const centerOffsetY = (layer.centerY - 0.5) * height;
      const radius = Math.max(1, Math.max(width, height) * layer.radius);
      if (layer.clipEnabled) {
        context.beginPath();
        if (layer.gradientType === 'radial') {
          context.arc(centerOffsetX, centerOffsetY, radius, 0, Math.PI * 2);
        } else {
          const deltaX = endX - startX;
          const deltaY = endY - startY;
          const length = Math.max(0.0001, Math.hypot(deltaX, deltaY));
          const perpendicularX = -deltaY / length;
          const perpendicularY = deltaX / length;
          const clipExtent = Math.max(1, Math.hypot(width, height) * 2);
          context.moveTo(startX + perpendicularX * clipExtent, startY + perpendicularY * clipExtent);
          context.lineTo(startX - perpendicularX * clipExtent, startY - perpendicularY * clipExtent);
          context.lineTo(endX - perpendicularX * clipExtent, endY - perpendicularY * clipExtent);
          context.lineTo(endX + perpendicularX * clipExtent, endY + perpendicularY * clipExtent);
          context.closePath();
        }
        context.clip();
      }
      const gradient = layer.gradientType === 'radial'
        ? context.createRadialGradient(centerOffsetX, centerOffsetY, 0, centerOffsetX, centerOffsetY, radius)
        : context.createLinearGradient(startX, startY, endX, endY);
      for (const stop of layer.stops) gradient.addColorStop(Math.max(0, Math.min(1, stop.offset)), stop.color);
      context.fillStyle = gradient;
      context.fillRect(-width / 2, -height / 2, width, height);
    } else if (layer.kind === 'text') {
      if (layer.backgroundColor && layer.backgroundColor !== 'transparent') {
        context.fillStyle = layer.backgroundColor;
        context.fillRect(-width / 2, -height / 2, width, height);
      }
      context.fillStyle = layer.color;
      context.font = `${layer.italic ? 'italic ' : ''}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
      context.textAlign = layer.align;
      context.textBaseline = 'top';
      const anchorX = layer.align === 'left' ? -width / 2 : layer.align === 'right' ? width / 2 : 0;
      const maxWidth = Math.max(1, width);
      const lines: string[] = [];
      for (const paragraph of layer.text.split(/\r?\n/)) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          lines.push('');
          continue;
        }
        let line = words[0];
        for (const word of words.slice(1)) {
          const candidate = `${line} ${word}`;
          if (context.measureText(candidate).width <= maxWidth) line = candidate;
          else {
            lines.push(line);
            line = word;
          }
        }
        lines.push(line);
      }
      const lineHeight = layer.fontSize * layer.lineHeight;
      lines.slice(0, Math.max(1, Math.floor(height / Math.max(1, lineHeight)))).forEach((line, index) => {
        const lineTop = -height / 2 + index * lineHeight;
        context.fillText(line, anchorX, lineTop, maxWidth);
        if (!line || (!layer.underline && !layer.strikethrough)) return;
        const lineWidth = Math.min(maxWidth, context.measureText(line).width);
        const lineLeft = layer.align === 'left' ? anchorX : layer.align === 'right' ? anchorX - lineWidth : anchorX - lineWidth / 2;
        const decorationHeight = Math.max(1, layer.fontSize * 0.06);
        if (layer.underline) context.fillRect(lineLeft, lineTop + layer.fontSize * 0.98, lineWidth, decorationHeight);
        if (layer.strikethrough) context.fillRect(lineLeft, lineTop + layer.fontSize * 0.52, lineWidth, decorationHeight);
      });
    }
    context.restore();
}

async function renderCanvasDocument(
  canvas: HTMLCanvasElement,
  documentState: UmbraCanvasDocument,
  previewStage: UmbraCanvasStage | null,
  transparent = false,
  renderRegion: UmbraCanvasRect | null = null,
  options: {
    shouldAbort?: () => boolean;
    yieldEveryLayers?: number;
    outputScale?: number;
    onLayerRendered?: (completed: number) => void;
  } = {},
): Promise<boolean> {
  const shouldAbort = options.shouldAbort || (() => false);
  const yieldEveryLayers = Math.max(0, Math.round(options.yieldEveryLayers || 0));
  const onLayerRendered = options.onLayerRendered;
  const outputScale = Math.max(1 / Math.max(documentState.width, documentState.height), Math.min(1, Number(options.outputScale) || 1));
  let renderedLayers = 0;
  const finishLayer = async (): Promise<boolean> => {
    renderedLayers += 1;
    onLayerRendered?.(renderedLayers);
    if (shouldAbort()) return false;
    if (yieldEveryLayers > 0 && renderedLayers % yieldEveryLayers === 0) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return !shouldAbort();
  };
  if (shouldAbort()) return false;
  const viewport = renderRegion
    ? {
      x: Math.max(0, Math.round(renderRegion.x)),
      y: Math.max(0, Math.round(renderRegion.y)),
      width: Math.max(1, Math.round(renderRegion.width)),
      height: Math.max(1, Math.round(renderRegion.height)),
    }
    : null;
  const viewportRight = viewport ? viewport.x + viewport.width : documentState.width;
  const viewportBottom = viewport ? viewport.y + viewport.height : documentState.height;
  const intersectsViewport = (rect: UmbraCanvasRect) => (
    rect.x < viewportRight
    && rect.y < viewportBottom
    && rect.x + rect.width > (viewport?.x || 0)
    && rect.y + rect.height > (viewport?.y || 0)
  );
  canvas.width = Math.max(1, Math.round((viewport?.width || documentState.width) * outputScale));
  canvas.height = Math.max(1, Math.round((viewport?.height || documentState.height) * outputScale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The inpaint canvas is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (!transparent) {
    context.fillStyle = '#000000';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (outputScale !== 1) context.scale(outputScale, outputScale);
  if (viewport) context.translate(-viewport.x, -viewport.y);

  const masks = new Map(
    documentState.layers
      .filter((layer): layer is Extract<UmbraCanvasLayer, { kind: 'mask' }> => layer.kind === 'mask')
      .map((layer) => [layer.id, layer]),
  );
  const groups = new Map(
    documentState.layers
      .filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group')
      .map((layer) => [layer.id, layer]),
  );
  const visualLayers = documentState.layers.filter((layer): layer is UmbraVisualCanvasLayer => (
    layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient'
  ));
  const groupedChildren = new Map<string, UmbraVisualCanvasLayer[]>();
  for (const layer of visualLayers) {
    if (!layer.groupId || !groups.has(layer.groupId)) continue;
    const children = groupedChildren.get(layer.groupId) || [];
    children.push(layer);
    groupedChildren.set(layer.groupId, children);
  }

  for (const layer of documentState.layers) {
    if (shouldAbort()) return false;
    if (layer.kind === 'group') {
      if (!layer.visible) continue;
      const children = (groupedChildren.get(layer.id) || []).filter((child) => (
        child.visible && (!viewport || intersectsViewport(visualLayerBounds(child)))
      ));
      if (children.length <= 0) continue;
      const childBounds = children.map(visualLayerBounds);
      const left = Math.max(viewport?.x || 0, Math.floor(Math.min(...childBounds.map((bounds) => bounds.x))));
      const top = Math.max(viewport?.y || 0, Math.floor(Math.min(...childBounds.map((bounds) => bounds.y))));
      const right = Math.min(viewportRight, Math.ceil(Math.max(...childBounds.map((bounds) => bounds.x + bounds.width))));
      const bottom = Math.min(viewportBottom, Math.ceil(Math.max(...childBounds.map((bounds) => bounds.y + bounds.height))));
      if (right <= left || bottom <= top) continue;
      const groupCanvas = document.createElement('canvas');
      groupCanvas.width = Math.max(1, Math.round((right - left) * outputScale));
      groupCanvas.height = Math.max(1, Math.round((bottom - top) * outputScale));
      const groupContext = groupCanvas.getContext('2d');
      if (!groupContext) continue;
      if (outputScale !== 1) groupContext.scale(outputScale, outputScale);
      groupContext.translate(-left, -top);
      for (const child of children) {
        if (shouldAbort()) return false;
        await drawVisualCanvasLayer(groupContext, child, masks, outputScale, viewport);
        if (!await finishLayer()) return false;
      }
      context.save();
      context.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
      context.globalCompositeOperation = layer.blendMode;
      context.drawImage(groupCanvas, left, top, right - left, bottom - top);
      context.restore();
      continue;
    }
    if (layer.kind !== 'raster' && layer.kind !== 'text' && layer.kind !== 'gradient') continue;
    if (layer.groupId && groups.has(layer.groupId)) continue;
    if (viewport && !intersectsViewport(visualLayerBounds(layer))) continue;
    await drawVisualCanvasLayer(context, layer, masks, outputScale, viewport);
    if (!await finishLayer()) return false;
  }

  if (previewStage && (!viewport || intersectsViewport(previewStage.region))) {
    const image = await loadHtmlImage(previewStage.asset.imageUrl);
    if (shouldAbort()) return false;
    context.drawImage(
      image,
      previewStage.region.x,
      previewStage.region.y,
      previewStage.region.width,
      previewStage.region.height,
    );
  }
  return !shouldAbort();
}

function normalizeMargins(value: FrameMargins): FrameMargins {
  const read = (entry: number) => Math.max(0, Math.min(UMBRA_CANVAS_INTERACTIVE_MAX_SIDE - 1, Math.round(Number(entry) || 0)));
  return {
    left: read(value.left),
    right: read(value.right),
    top: read(value.top),
    bottom: read(value.bottom),
  };
}

function resolveCanvasDocumentMargins(documentState: UmbraCanvasDocument): FrameMargins {
  const sourceLayer = documentState.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
  if (!sourceLayer || sourceLayer.kind !== 'raster') return EMPTY_MARGINS;
  const transform = sourceLayer.transform;
  const radians = transform.rotation * Math.PI / 180;
  const scaledWidth = Math.abs(transform.width * transform.scaleX);
  const scaledHeight = Math.abs(transform.height * transform.scaleY);
  const boundsWidth = Math.abs(Math.cos(radians)) * scaledWidth + Math.abs(Math.sin(radians)) * scaledHeight;
  const boundsHeight = Math.abs(Math.sin(radians)) * scaledWidth + Math.abs(Math.cos(radians)) * scaledHeight;
  const centerX = transform.x + transform.width / 2;
  const centerY = transform.y + transform.height / 2;
  const left = Math.max(0, Math.round(centerX - boundsWidth / 2));
  const top = Math.max(0, Math.round(centerY - boundsHeight / 2));
  const rightEdge = Math.round(centerX + boundsWidth / 2);
  const bottomEdge = Math.round(centerY + boundsHeight / 2);
  return {
    left,
    top,
    right: Math.max(0, documentState.width - rightEdge),
    bottom: Math.max(0, documentState.height - bottomEdge),
  };
}

function expandCanvasRect(rect: UmbraCanvasRect, padding: number, width: number, height: number): UmbraCanvasRect {
  const amount = Math.max(0, Math.round(Number(padding) || 0));
  const x = Math.max(0, rect.x - amount);
  const y = Math.max(0, rect.y - amount);
  const right = Math.min(width, rect.x + rect.width + amount);
  const bottom = Math.min(height, rect.y + rect.height + amount);
  return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
}

function alignCanvasRectToPipeline(
  rect: UmbraCanvasRect,
  canvasWidth: number,
  canvasHeight: number,
  resolution: UmbraUiPipelineResolutionCapability,
): UmbraCanvasRect {
  const step = Math.max(1, Math.round(resolution.step || 8));
  const alignDimension = (value: number, canvasSize: number, minimum: number | undefined, maximum: number | undefined) => {
    const availableMaximum = Math.max(1, Math.min(canvasSize, Math.round(maximum || canvasSize)));
    const gridMaximum = Math.floor(availableMaximum / step) * step;
    const alignedMaximum = gridMaximum >= step ? gridMaximum : availableMaximum;
    const requestedMinimum = Math.max(1, Math.min(availableMaximum, Math.round(minimum || step)));
    const alignedMinimum = Math.min(alignedMaximum, Math.max(step, Math.ceil(requestedMinimum / step) * step));
    return Math.max(alignedMinimum, Math.min(alignedMaximum, Math.ceil(Math.max(1, value) / step) * step));
  };
  const width = alignDimension(rect.width, canvasWidth, resolution.minimumWidth, resolution.maximumWidth);
  const height = alignDimension(rect.height, canvasHeight, resolution.minimumHeight, resolution.maximumHeight);
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return {
    x: Math.max(0, Math.min(canvasWidth - width, Math.round(centerX - width / 2))),
    y: Math.max(0, Math.min(canvasHeight - height, Math.round(centerY - height / 2))),
    width,
    height,
  };
}

function alignUnboundedCanvasRectToPipeline(
  rect: UmbraCanvasRect,
  resolution: UmbraUiPipelineResolutionCapability,
  aspectRatioInput = 0,
): UmbraCanvasRect {
  const step = Math.max(1, Math.round(resolution.step || 8));
  const aspectRatio = Math.max(0, Math.min(32, Number(aspectRatioInput) || 0));
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  let requestedWidth = Math.max(1, Math.abs(rect.width));
  let requestedHeight = Math.max(1, Math.abs(rect.height));
  if (aspectRatio > 0) {
    const area = Math.max(1, requestedWidth * requestedHeight);
    requestedWidth = Math.sqrt(area * aspectRatio);
    requestedHeight = requestedWidth / aspectRatio;
  }
  const alignDimension = (value: number, minimum: number | undefined, maximum: number | undefined) => {
    const requestedMinimum = Math.max(1, Math.round(minimum || step));
    const alignedMinimum = Math.max(step, Math.ceil(requestedMinimum / step) * step);
    const requestedMaximum = Number(maximum);
    const alignedMaximum = Number.isFinite(requestedMaximum) && requestedMaximum > 0
      ? Math.max(alignedMinimum, Math.floor(requestedMaximum / step) * step)
      : Number.MAX_SAFE_INTEGER;
    return Math.min(alignedMaximum, Math.max(alignedMinimum, Math.ceil(value / step) * step));
  };
  const width = alignDimension(requestedWidth, resolution.minimumWidth, resolution.maximumWidth);
  const height = alignDimension(requestedHeight, resolution.minimumHeight, resolution.maximumHeight);
  return {
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height,
  };
}

function canvasRulerStep(displayScale: number): number {
  const target = 72 / Math.max(0.0001, displayScale);
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, target)));
  const normalized = target / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(1, multiplier * magnitude);
}

function resolveCapabilityNumber(capability: UmbraUiPipelineControlCapability, current: number, fallback: number): number {
  if (capability.support === 'adjustable') return Number.isFinite(current) ? current : fallback;
  if (capability.support === 'fixed' && typeof capability.value === 'number' && Number.isFinite(capability.value)) return capability.value;
  return fallback;
}

function resolveCapabilityString(capability: UmbraUiPipelineControlCapability, current: string, fallback: string): string {
  if (capability.support === 'adjustable') return String(current || fallback);
  if (capability.support === 'fixed' && typeof capability.value === 'string') return capability.value || fallback;
  return fallback;
}

function normalizeBox(preview: BoxPreview): { x: number; y: number; width: number; height: number } {
  const x = Math.min(preview.start.x, preview.current.x);
  const y = Math.min(preview.start.y, preview.current.y);
  return {
    x,
    y,
    width: Math.abs(preview.current.x - preview.start.x),
    height: Math.abs(preview.current.y - preview.start.y),
  };
}

function canvasPointToLayerNormalized(point: Point, transform: UmbraCanvasRasterLayer['transform']): Point {
  const width = Math.max(1, transform.width);
  const height = Math.max(1, transform.height);
  const centerX = transform.x + width / 2;
  const centerY = transform.y + height / 2;
  const radians = (transform.rotation * Math.PI) / 180;
  const deltaX = point.x - centerX;
  const deltaY = point.y - centerY;
  const localX = (deltaX * Math.cos(radians) + deltaY * Math.sin(radians)) / (transform.scaleX || 1);
  const localY = (-deltaX * Math.sin(radians) + deltaY * Math.cos(radians)) / (transform.scaleY || 1);
  return {
    x: (localX + width / 2) / width,
    y: (localY + height / 2) / height,
  };
}

function parsePendingHandoff(value: unknown): UmbraUiInpaintHandoff | null {
  const source = normalizeUmbraUiMediaHandoff(value);
  if (!source || source.mode !== 'inpaint') return null;
  return {
    mode: 'inpaint',
    path: source.path,
    originalSourcePath: source.originalSourcePath,
    name: source.name,
    imageUrl: source.imageUrl,
    source: source.source,
    canvasProjectId: source.canvasProjectId,
    canvasOperationMode: source.canvasOperationMode,
    generation: source.generation,
    createdAt: source.createdAt,
  };
}

export function UmbraInpaintWorkspace({
  capabilities,
  inpaintAdapter,
  modelFamily,
  modelFamilyOptions,
  onModelFamilyChange,
  modelSource,
  modelSourceOptions,
  onModelSourceChange,
  modelLabel,
  pipelineError,
  regionalGuidanceAvailable,
  regionalGuidanceReason,
  regionalGuidanceMaxLayers,
  regionalPositivePromptAvailable,
  regionalNegativePromptAvailable,
  regionalAutoNegativeAvailable,
  controlLayersAvailable,
  controlLayersReason,
  controlLayersMaxLayers,
  controlAdapterTypes,
  controlModes,
  controlModels,
  animaLlliteModels,
  modelPatchModels,
  controlPreprocessors,
  referenceLayersAvailable,
  referenceLayersReason,
  referenceLayersMaxLayers,
  referenceMethods,
  styleModels,
  ipAdapterModels,
  visionModels,
  seamlessAvailable,
  seamlessReason,
  seamlessAxes,
  checkpointName,
  checkpointAvailableCount,
  checkpointLoading,
  checkpointError,
  onOpenCheckpointPicker,
  onRefreshModelCatalog,
  loras,
  onLorasChange,
  loraAvailableCount,
  onOpenLoraPicker,
  onAddPromptToken,
  clipSkip,
  onClipSkipChange,
  prompt,
  promptSegments,
  activePromptSegmentId,
  onPromptSegmentsChange,
  onActivePromptSegmentChange,
  negativePrompt,
  onNegativePromptChange,
  seed,
  onSeedChange,
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
  samModels,
  upscaleModels,
  img2imgDetailerActiveCount,
  img2imgDetailerStageCount,
  onImg2imgDetailersEnabledChange,
  comfyConnected,
  showToast,
}: UmbraInpaintWorkspaceProps) {
  const studioMode = false;
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const imageCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const paintCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const guidanceCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const minimapCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pointerActiveRef = React.useRef(false);
  const lastPointRef = React.useRef<Point | null>(null);
  const sourceObjectUrlRef = React.useRef('');
  const terminalNoticeRef = React.useRef('');
  const autoSelectJobRef = React.useRef('');
  const jobStageContextsRef = React.useRef(new Map<string, UmbraUiInpaintStageContext>());
  const stageGallerySaveInFlightRef = React.useRef(new Set<string>());
  const pendingMaskRestoreRef = React.useRef('');
  const pendingMaskRestoreCommitRef = React.useRef(true);
  const latestDocumentRef = React.useRef<UmbraCanvasDocument | null>(null);
  const visualDocumentRef = React.useRef<{ key: string; document: UmbraCanvasDocument | null }>({ key: 'empty', document: null });
  const projectSaveRequestRef = React.useRef(0);
  const projectAutoSaveTimerRef = React.useRef<number | null>(null);
  const projectAutoSaveSnapshotRef = React.useRef<UmbraCanvasDocument | null>(null);
  const generationRestoreProjectIdRef = React.useRef('');
  const maskSnapshotUrlsRef = React.useRef(new Set<string>());
  const maskSnapshotLeaseRef = React.useRef(new Map<string, number>());
  const maskSnapshotCleanupTimerRef = React.useRef<number | null>(null);
  const maskSnapshotGenerationRef = React.useRef(0);
  const maskSnapshotQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const resizeDocumentIdRef = React.useRef('');
  const paintCommitQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const paintCommitPendingRef = React.useRef(false);
  const canvasRenderQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const canvasRenderGenerationRef = React.useRef(0);
  const guidanceRenderGenerationRef = React.useRef(0);
  const transformDragRef = React.useRef<TransformDragState | null>(null);
  const keyboardMaskNudgeQueueRef = React.useRef<Promise<void>>(Promise.resolve());
  const viewportPanRef = React.useRef<ViewportPanState | null>(null);
  const studioViewportPanRef = React.useRef<StudioViewportPanState | null>(null);
  const studioArtboardDragRef = React.useRef<StudioArtboardDragState | null>(null);
  const studioSpacePressedRef = React.useRef(false);
  const studioInitialFitProjectRef = React.useRef('');
  const regionDragRef = React.useRef<RegionDragState | null>(null);
  const studioRegionInteractionRef = React.useRef<StudioRegionInteractionState | null>(null);
  const layerAssetObjectUrlsRef = React.useRef(new Set<string>());
  const selectionActiveLayerRef = React.useRef('');
  const quickSwitchHistoryRef = React.useRef<{ previous: string; current: string }>({ previous: '', current: '' });
  const booleanMenuRef = React.useRef<HTMLDivElement | null>(null);
  const canvasContextMenuRef = React.useRef<HTMLDivElement | null>(null);
  const psdExportAbortRef = React.useRef(false);
  const psdExportAbortControllerRef = React.useRef<AbortController | null>(null);
  const fullResolutionAbortRef = React.useRef<AbortController | null>(null);
  const fullResolutionOperationRef = React.useRef<CanvasFullResolutionOperation | null>(null);
  const fullResolutionOperationSequenceRef = React.useRef(0);
  const assistedSelectionPreviewUrlRef = React.useRef('');

  const [source, setSource] = React.useState<InpaintSource | null>(null);
  const [imageDropActive, setImageDropActive] = React.useState(false);
  const [rasterFilterLayerId, setRasterFilterLayerId] = React.useState('');
  const [layerUpscaleLayerId, setLayerUpscaleLayerId] = React.useState('');
  const [isExportingPsd, setIsExportingPsd] = React.useState(false);
  const [psdExportProgress, setPsdExportProgress] = React.useState({ completed: 0, total: 0 });
  const [fullResolutionOperation, setFullResolutionOperation] = React.useState<CanvasFullResolutionOperation | null>(null);
  const [isSavingCanvas, setIsSavingCanvas] = React.useState(false);
  const [isSavingStages, setIsSavingStages] = React.useState(false);
  const [stageGuidanceBusy, setStageGuidanceBusy] = React.useState(false);
  const [controlPreprocessBusy, setControlPreprocessBusy] = React.useState(false);
  const runFullResolutionOperation = React.useCallback(async (
    label: string,
    task: (context: {
      signal: AbortSignal;
      setPhase: (phase: CanvasFullResolutionOperationPhase) => void;
    }) => Promise<void>,
  ) => {
    if (fullResolutionOperationRef.current) {
      showToast(`${fullResolutionOperationRef.current.label} is already running.`, 'error');
      return;
    }
    if (isExportingPsd) {
      showToast('Finish or cancel the layered PSD export first.', 'error');
      return;
    }
    const controller = new AbortController();
    const operation: CanvasFullResolutionOperation = {
      id: ++fullResolutionOperationSequenceRef.current,
      label,
      phase: 'rendering',
    };
    fullResolutionAbortRef.current = controller;
    fullResolutionOperationRef.current = operation;
    setFullResolutionOperation(operation);
    const setPhase = (phase: CanvasFullResolutionOperationPhase) => {
      if (fullResolutionOperationRef.current?.id !== operation.id) return;
      const updated = { ...operation, phase };
      fullResolutionOperationRef.current = updated;
      setFullResolutionOperation(updated);
    };
    try {
      await task({ signal: controller.signal, setPhase });
    } catch (error) {
      if (isCanvasOperationAbort(error) || controller.signal.aborted) showToast(`${label} canceled.`, 'success');
      else showToast(error instanceof Error ? error.message : `${label} failed.`, 'error');
    } finally {
      if (fullResolutionAbortRef.current === controller) fullResolutionAbortRef.current = null;
      if (fullResolutionOperationRef.current?.id === operation.id) {
        fullResolutionOperationRef.current = null;
        setFullResolutionOperation(null);
      }
    }
  }, [isExportingPsd, showToast]);
  const cancelFullResolutionOperation = React.useCallback(() => {
    fullResolutionAbortRef.current?.abort();
  }, []);
  const cancelPsdExport = React.useCallback(() => {
    psdExportAbortRef.current = true;
    psdExportAbortControllerRef.current?.abort();
  }, []);
  React.useEffect(() => () => fullResolutionAbortRef.current?.abort(), []);
  React.useEffect(() => () => psdExportAbortControllerRef.current?.abort(), []);
  const [documentHistory, dispatchCanvasHistory] = React.useReducer(canvasDocumentHistoryReducer, {
    past: [],
    present: null,
    future: [],
  });
  const documentHistoryRef = React.useRef(documentHistory);
  documentHistoryRef.current = documentHistory;
  const canvasDocument = documentHistory.present;
  const dispatchCanvasDocument = React.useCallback((action: UmbraCanvasDocumentAction) => {
    dispatchCanvasHistory(action);
  }, []);
  const [canvasSize, setCanvasSize] = React.useState({ width: 1024, height: 1024 });
  const [resizeEnabled, setResizeEnabled] = React.useState(false);
  const [resizeAspectRatio, setResizeAspectRatio] = React.useState<InpaintResizeAspectValue>('source');
  const [resizeWidth, setResizeWidth] = React.useState('1024');
  const [resizeHeight, setResizeHeight] = React.useState('1024');
  const [manualRegionResolution, setManualRegionResolution] = React.useState({ width: '1024', height: '1024' });
  const [draftMargins, setDraftMargins] = React.useState<FrameMargins>(EMPTY_MARGINS);
  const [appliedMargins, setAppliedMargins] = React.useState<FrameMargins>(EMPTY_MARGINS);
  const [maskResetRevision, setMaskResetRevision] = React.useState(0);
  const [tool, setTool] = React.useState<CanvasTool>('brush');
  const initialCanvasToolSettings = React.useMemo(loadCanvasToolSettings, []);
  const initialCanvasPreferences = React.useMemo(loadCanvasPreferences, []);
  const [canvasPreferences, setCanvasPreferences] = React.useState<CanvasPreferences>(initialCanvasPreferences);
  const [editTarget, setEditTarget] = React.useState<CanvasEditTarget>('mask');
  const [maskInteractionActive, setMaskInteractionActive] = React.useState(false);
  const [paintColor, setPaintColor] = React.useState('#ffffff');
  const [secondaryPaintColor, setSecondaryPaintColor] = React.useState('#000000');
  const [shapeType, setShapeType] = React.useState<RasterShapeType>('rectangle');
  const [transformFitMode, setTransformFitMode] = React.useState<UmbraCanvasFitMode>('contain');
  const [shapeFilled, setShapeFilled] = React.useState(true);
  const [shapeStrokeWidth, setShapeStrokeWidth] = React.useState(8);
  const [brushSize, setBrushSize] = React.useState(initialCanvasToolSettings.brushSize);
  const [eraserSize, setEraserSize] = React.useState(initialCanvasToolSettings.eraserSize);
  const [brushOpacity, setBrushOpacity] = React.useState(1);
  const [brushHardness, setBrushHardness] = React.useState(1);
  const [boxPreview, setBoxPreview] = React.useState<BoxPreview | null>(null);
  const [studioGenerationRegionPreview, setStudioGenerationRegionPreview] = React.useState<UmbraCanvasRect | null>(null);
  const [lassoPoints, setLassoPoints] = React.useState<Point[]>([]);
  const [polygonPoints, setPolygonPoints] = React.useState<Point[]>([]);
  const [shapePoints, setShapePoints] = React.useState<Point[]>([]);
  const [wandTolerance, setWandTolerance] = React.useState(24);
  const [wandContiguous, setWandContiguous] = React.useState(true);
  const [lastBox, setLastBox] = React.useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [samGuideMode, setSamGuideMode] = React.useState<SamGuideMode>('points');
  const [samOutputMode, setSamOutputMode] = React.useState<SamOutputMode>('active_mask');
  const [samInvert, setSamInvert] = React.useState(false);
  const [samSourceMode, setSamSourceMode] = React.useState<'canvas' | 'layer'>('canvas');
  const [samPoints, setSamPoints] = React.useState<UmbraSamPoint[]>([]);
  const [samBox, setSamBox] = React.useState<UmbraSamBox | null>(null);
  const [samModelName, setSamModelName] = React.useState('');
  const [samDeviceMode, setSamDeviceMode] = React.useState<UmbraSamDeviceMode>('CPU');
  const [samThreshold, setSamThreshold] = React.useState(initialCanvasToolSettings.samThreshold);
  const [clipSegThreshold, setClipSegThreshold] = React.useState(initialCanvasToolSettings.clipSegThreshold);
  const [samRunning, setSamRunning] = React.useState(false);
  const [assistedSelectionPreview, setAssistedSelectionPreview] = React.useState<AssistedSelectionPreview | null>(null);
  const [clipSegAvailable, setClipSegAvailable] = React.useState(false);
  const [clipSegModelId, setClipSegModelId] = React.useState('');
  const [clipSegPrompt, setClipSegPrompt] = React.useState('');
  const [clipSegInstalling, setClipSegInstalling] = React.useState(false);
  const [clipSegError, setClipSegError] = React.useState('');
  const [maskProcessing, setMaskProcessing] = React.useState(false);
  const clearAssistedSelectionPreview = React.useCallback(() => {
    if (assistedSelectionPreviewUrlRef.current) URL.revokeObjectURL(assistedSelectionPreviewUrlRef.current);
    assistedSelectionPreviewUrlRef.current = '';
    setAssistedSelectionPreview(null);
  }, []);
  const replaceAssistedSelectionPreview = React.useCallback((preview: AssistedSelectionPreview) => {
    if (assistedSelectionPreviewUrlRef.current) URL.revokeObjectURL(assistedSelectionPreviewUrlRef.current);
    assistedSelectionPreviewUrlRef.current = preview.imageUrl;
    setAssistedSelectionPreview(preview);
  }, []);
  React.useEffect(() => () => {
    if (assistedSelectionPreviewUrlRef.current) URL.revokeObjectURL(assistedSelectionPreviewUrlRef.current);
    assistedSelectionPreviewUrlRef.current = '';
  }, []);
  React.useEffect(() => {
    clearAssistedSelectionPreview();
  }, [canvasDocument?.id, clearAssistedSelectionPreview]);
  const [viewportSize, setViewportSize] = React.useState({ width: 1, height: 1 });
  const [viewportMetrics, setViewportMetrics] = React.useState({ left: 0, top: 0, width: 1, height: 1, scrollWidth: 1, scrollHeight: 1 });
  const [studioViewportPreview, setStudioViewportPreview] = React.useState<{ panX: number; panY: number } | null>(null);
  const [studioArtboardPreview, setStudioArtboardPreview] = React.useState<{ id: string; x: number; y: number } | null>(null);
  const [studioAlignmentGuides, setStudioAlignmentGuides] = React.useState<UmbraCanvasStudioAlignmentGuide[]>([]);
  const [zoom, setZoom] = React.useState(1);
  const snapEnabled = canvasPreferences.snapEnabled;
  const snapSize = canvasPreferences.snapSize;
  const rulersEnabled = canvasPreferences.rulersEnabled;
  const [canvasReady, setCanvasReady] = React.useState(false);
  const [samples, setSamples] = React.useState(1);
  const [denoise, setDenoise] = React.useState(SIMPLE_INPAINT_DEFAULT_DENOISE);
  const [maskGrow, setMaskGrow] = React.useState(SIMPLE_INPAINT_DEFAULT_MASK_GROW);
  const [maskFeather, setMaskFeather] = React.useState(SIMPLE_INPAINT_DEFAULT_EDGE_SOFTNESS);
  const [contextPadding, setContextPadding] = React.useState(64);
  const [processingScaleMode, setProcessingScaleMode] = React.useState<UmbraCanvasProcessingScaleMode>('none');
  const [processingWidth, setProcessingWidth] = React.useState(1024);
  const [processingHeight, setProcessingHeight] = React.useState(1024);
  const [coherenceMode, setCoherenceMode] = React.useState<UmbraCanvasCoherenceMode>('gaussian');
  const [coherenceEdgeSize, setCoherenceEdgeSize] = React.useState(SIMPLE_INPAINT_DEFAULT_EDGE_SOFTNESS);
  const [coherenceMinimumDenoise, setCoherenceMinimumDenoise] = React.useState(0);
  const [seamlessX, setSeamlessX] = React.useState(false);
  const [seamlessY, setSeamlessY] = React.useState(false);
  const [outputOnlyMaskedRegions, setOutputOnlyMaskedRegions] = React.useState(false);
  const [semanticCutout, setSemanticCutout] = React.useState(false);
  const [fillMode, setFillMode] = React.useState<UmbraUiInpaintFillMode>('neutral');
  const [infillColor, setInfillColor] = React.useState('#7f7f7f');
  const [infillTileSize, setInfillTileSize] = React.useState(32);
  const [inpaintModelName, setInpaintModelName] = React.useState('');
  const [inpaintModels, setInpaintModels] = React.useState<string[]>([]);
  const [inpaintRuntimeCapabilities, setInpaintRuntimeCapabilities] = React.useState<InpaintRuntimeCapabilities | null>(null);
  const [colorMatch, setColorMatch] = React.useState(0.35);
  const [differentialStrength, setDifferentialStrength] = React.useState(1);
  const [softInpaintEnabled, setSoftInpaintEnabled] = React.useState(true);
  const [softInpaintPreservation, setSoftInpaintPreservation] = React.useState(SIMPLE_INPAINT_DEFAULT_PRESERVATION);
  const [softInpaintTransitionContrast, setSoftInpaintTransitionContrast] = React.useState(SIMPLE_INPAINT_DEFAULT_TRANSITION_CONTRAST);
  const [softInpaintMaskInfluence, setSoftInpaintMaskInfluence] = React.useState(SIMPLE_INPAINT_DEFAULT_MASK_INFLUENCE);
  const [job, setJob] = React.useState<UmbraUiInpaintJob | null>(null);
  const inpaintJobRunning = !!job && !isUmbraUiInpaintJobTerminal(job);
  const seedIsRandom = !Number.isFinite(Number(seed)) || Number(seed) <= 0;
  const resizeTarget = React.useMemo(() => ({
    width: alignInpaintResizeDimension(Number(resizeWidth) || canvasDocument?.width || 1024, 'width', capabilities.resolution),
    height: alignInpaintResizeDimension(Number(resizeHeight) || canvasDocument?.height || 1024, 'height', capabilities.resolution),
  }), [canvasDocument?.height, canvasDocument?.width, capabilities.resolution, resizeHeight, resizeWidth]);
  const resizeCrop = React.useMemo(() => {
    if (!canvasDocument) return null;
    return resolveCenteredInpaintCrop(
      canvasDocument.width,
      canvasDocument.height,
      resizeTarget.width / Math.max(1, resizeTarget.height),
    );
  }, [canvasDocument, resizeTarget.height, resizeTarget.width]);
  const resizeChangesAspect = !!canvasDocument && !!resizeCrop && (
    resizeCrop.x !== 0
    || resizeCrop.y !== 0
    || resizeCrop.width !== canvasDocument.width
    || resizeCrop.height !== canvasDocument.height
  );
  const resizeHasChanges = !!canvasDocument && !!resizeCrop && (
    resizeChangesAspect
    || resizeTarget.width !== canvasDocument.width
    || resizeTarget.height !== canvasDocument.height
  );
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [layersExpanded, setLayersExpanded] = React.useState(false);
  const [selectedLayerIds, setSelectedLayerIds] = React.useState<string[]>([]);
  const [booleanMenuOpen, setBooleanMenuOpen] = React.useState(false);
  const [canvasContextMenu, setCanvasContextMenu] = React.useState<{ x: number; y: number } | null>(null);
  const [editingLayerMaskId, setEditingLayerMaskId] = React.useState('');
  const [draggedLayerId, setDraggedLayerId] = React.useState('');
  const [layerDropTarget, setLayerDropTarget] = React.useState<{ layerId: string; placement: 'before' | 'after'; side: 'left' | 'right' } | null>(null);
  const [selectedStageIds, setSelectedStageIds] = React.useState<string[]>([]);
  const [compareStages, setCompareStages] = React.useState(false);
  const [projects, setProjects] = React.useState<UmbraCanvasProjectSummary[]>([]);
  const [projectBrowserOpen, setProjectBrowserOpen] = React.useState(false);
  const [projectSaveState, setProjectSaveState] = React.useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [canvasClipboard, setCanvasClipboard] = React.useState<CanvasClipboard | null>(null);
  const [projectNameDraft, setProjectNameDraft] = React.useState('');
  const [saveAsName, setSaveAsName] = React.useState('');
  const [canvasHotkeys, setCanvasHotkeys] = React.useState<Record<string, string>>(loadCanvasHotkeys);
  const [hotkeyEditorOpen, setHotkeyEditorOpen] = React.useState(false);
  const projectRestoreAttemptedRef = React.useRef(false);
  const consumedMediaHandoffKeysRef = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (canvasDocument && canvasDocument.operationMode !== 'inpaint') {
      dispatchCanvasDocument({ type: 'set_operation_mode', mode: 'inpaint' });
    }
  }, [canvasDocument?.id, canvasDocument?.operationMode, dispatchCanvasDocument]);

  React.useEffect(() => {
    if (!canvasDocument || resizeDocumentIdRef.current === canvasDocument.id) return;
    resizeDocumentIdRef.current = canvasDocument.id;
    setResizeEnabled(false);
    setResizeAspectRatio('source');
    setResizeWidth(String(canvasDocument.width));
    setResizeHeight(String(canvasDocument.height));
  }, [canvasDocument]);

  React.useEffect(() => {
    const region = canvasDocument?.generationRegion;
    setManualRegionResolution({
      width: String(Math.round(region?.width || capabilities.resolution.defaultWidth || canvasDocument?.width || 1024)),
      height: String(Math.round(region?.height || capabilities.resolution.defaultHeight || canvasDocument?.height || 1024)),
    });
  }, [
    canvasDocument?.generationRegion?.height,
    canvasDocument?.generationRegion?.width,
    canvasDocument?.height,
    canvasDocument?.id,
    canvasDocument?.width,
    capabilities.resolution.defaultHeight,
    capabilities.resolution.defaultWidth,
  ]);

  React.useEffect(() => {
    if (resizeEnabled) return;
    setResizeWidth(String(canvasSize.width));
    setResizeHeight(String(canvasSize.height));
  }, [canvasSize.height, canvasSize.width, resizeEnabled]);

  const enableCanvasResize = React.useCallback(() => {
    if (!canvasDocument) return;
    const sourceRatio = canvasDocument.width / Math.max(1, canvasDocument.height);
    const defaultArea = Math.max(
      1,
      (Number(capabilities.resolution.defaultWidth) || 1024)
      * (Number(capabilities.resolution.defaultHeight) || 1024),
    );
    const dimensions = resolveInpaintResizeDimensions(defaultArea, sourceRatio, capabilities.resolution);
    setResizeAspectRatio('source');
    setResizeWidth(String(dimensions.width));
    setResizeHeight(String(dimensions.height));
    setResizeEnabled(true);
  }, [canvasDocument, capabilities.resolution]);

  const disableCanvasResize = React.useCallback(() => {
    setResizeEnabled(false);
    setResizeAspectRatio('source');
    setResizeWidth(String(canvasDocument?.width || 1024));
    setResizeHeight(String(canvasDocument?.height || 1024));
  }, [canvasDocument?.height, canvasDocument?.width]);

  const updateResizeAspectRatio = React.useCallback((value: InpaintResizeAspectValue) => {
    setResizeAspectRatio(value);
    if (!canvasDocument || value === 'custom') return;
    const ratio = resolveInpaintResizeAspect(
      value,
      canvasDocument.width,
      canvasDocument.height,
      Number(resizeWidth) || canvasDocument.width,
      Number(resizeHeight) || canvasDocument.height,
    );
    const area = Math.max(1, (Number(resizeWidth) || canvasDocument.width) * (Number(resizeHeight) || canvasDocument.height));
    const dimensions = resolveInpaintResizeDimensions(area, ratio, capabilities.resolution);
    setResizeWidth(String(dimensions.width));
    setResizeHeight(String(dimensions.height));
  }, [canvasDocument, capabilities.resolution, resizeHeight, resizeWidth]);

  const updateResizeWidth = React.useCallback((value: string) => {
    setResizeWidth(value);
    const numeric = Number(value);
    if (!canvasDocument || resizeAspectRatio === 'custom' || !Number.isFinite(numeric) || numeric <= 0) return;
    const ratio = resolveInpaintResizeAspect(
      resizeAspectRatio,
      canvasDocument.width,
      canvasDocument.height,
      numeric,
      Number(resizeHeight) || canvasDocument.height,
    );
    setResizeHeight(String(alignInpaintResizeDimension(numeric / ratio, 'height', capabilities.resolution)));
  }, [canvasDocument, capabilities.resolution, resizeAspectRatio, resizeHeight]);

  const updateResizeHeight = React.useCallback((value: string) => {
    setResizeHeight(value);
    const numeric = Number(value);
    if (!canvasDocument || resizeAspectRatio === 'custom' || !Number.isFinite(numeric) || numeric <= 0) return;
    const ratio = resolveInpaintResizeAspect(
      resizeAspectRatio,
      canvasDocument.width,
      canvasDocument.height,
      Number(resizeWidth) || canvasDocument.width,
      numeric,
    );
    setResizeWidth(String(alignInpaintResizeDimension(numeric * ratio, 'width', capabilities.resolution)));
  }, [canvasDocument, capabilities.resolution, resizeAspectRatio, resizeWidth]);

  const normalizeResizeFields = React.useCallback(() => {
    setResizeWidth(String(resizeTarget.width));
    setResizeHeight(String(resizeTarget.height));
  }, [resizeTarget.height, resizeTarget.width]);

  React.useEffect(() => {
    try { window.localStorage.setItem(CANVAS_PREFERENCES_KEY, JSON.stringify(canvasPreferences)); } catch { /* best effort */ }
  }, [canvasPreferences]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(CANVAS_TOOL_SETTINGS_KEY, JSON.stringify({
        brushSize,
        eraserSize,
        samThreshold,
        clipSegThreshold,
      } satisfies CanvasToolSettings));
    } catch { /* best effort */ }
  }, [brushSize, clipSegThreshold, eraserSize, samThreshold]);

  React.useEffect(() => {
    try { window.localStorage.setItem(CANVAS_HOTKEYS_KEY, JSON.stringify(canvasHotkeys)); } catch { /* best effort */ }
  }, [canvasHotkeys]);

  React.useEffect(() => {
    if (!booleanMenuOpen) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!booleanMenuRef.current?.contains(event.target as Node)) setBooleanMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBooleanMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [booleanMenuOpen]);

  React.useEffect(() => {
    if (!canvasContextMenu) return;
    const closeOnPointerDown = (event: PointerEvent) => {
      if (!canvasContextMenuRef.current?.contains(event.target as Node)) setCanvasContextMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCanvasContextMenu(null);
    };
    document.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [canvasContextMenu]);

  latestDocumentRef.current = canvasDocument;
  const visualRenderKey = buildUmbraCanvasVisualRenderKey(canvasDocument);
  if (visualDocumentRef.current.key !== visualRenderKey) {
    visualDocumentRef.current = { key: visualRenderKey, document: canvasDocument };
  }
  const visualDocument = visualDocumentRef.current.document;
  const activeLayerForGuidanceOverlay = canvasDocument?.layers.find((layer) => layer.id === canvasDocument.activeLayerId);
  const transformingActiveInpaintMask = tool === 'transform'
    && activeLayerForGuidanceOverlay?.kind === 'mask'
    && activeLayerForGuidanceOverlay.purpose === 'inpaint'
    && !activeLayerForGuidanceOverlay.frozen;
  const guidanceOverlayMaskId = maskInteractionActive
    ? editingLayerMaskId || canvasDocument?.activeMaskLayerId || ''
    : '';
  const guidanceOverlayVisibility = React.useMemo<GuidanceOverlayVisibility>(() => ({
    showGuidanceOverlays: canvasPreferences.showGuidanceOverlays && !canvasDocument?.previewStageId,
    showInpaintMaskOverlays: canvasPreferences.showInpaintMaskOverlays && !canvasDocument?.previewStageId,
    showRegionalGuidanceOverlays: canvasPreferences.showRegionalGuidanceOverlays,
    showControlLayerOverlays: canvasPreferences.showControlLayerOverlays,
    showReferenceLayerOverlays: canvasPreferences.showReferenceLayerOverlays,
  }), [
    canvasDocument?.previewStageId,
    canvasPreferences.showControlLayerOverlays,
    canvasPreferences.showGuidanceOverlays,
    canvasPreferences.showInpaintMaskOverlays,
    canvasPreferences.showReferenceLayerOverlays,
    canvasPreferences.showRegionalGuidanceOverlays,
  ]);
  const guidanceOverlayKey = buildGuidanceOverlayKey(
    canvasDocument,
    guidanceOverlayMaskId,
    guidanceOverlayVisibility,
  );

  const currentGenerationSettings = React.useMemo<UmbraCanvasGenerationSettings>(() => ({
      modelFamily,
      modelSource,
      checkpointName,
      loras: loras.map((lora) => ({ ...lora, trainedTags: [...lora.trainedTags] })),
      promptSegments: promptSegments.map((segment) => ({ ...segment })),
      activePromptSegmentId,
      negativePrompt,
      promptHistory: (canvasDocument?.generation.promptHistory || []).map((entry) => ({
        ...entry,
        promptSegments: entry.promptSegments.map((segment) => ({ ...segment })),
      })),
      clipSkip,
      seed,
      steps,
      cfg,
      samplerName,
      scheduler,
      samples,
      denoise,
      maskGrow,
      maskFeather,
      contextPadding,
      processingScaleMode,
      processingWidth,
      processingHeight,
      coherenceMode,
      coherenceEdgeSize,
      coherenceMinimumDenoise,
      seamlessX,
      seamlessY,
      outputOnlyMaskedRegions,
      semanticCutout,
      fillMode,
      infillColor,
      infillTileSize,
      inpaintModelName,
      colorMatch,
      differentialStrength,
      softInpaintEnabled,
      softInpaintPreservation,
      softInpaintTransitionContrast,
      softInpaintMaskInfluence,
  }), [
    activePromptSegmentId,
    canvasDocument?.generation.promptHistory,
    cfg,
    checkpointName,
    clipSkip,
    coherenceEdgeSize,
    coherenceMinimumDenoise,
    coherenceMode,
    colorMatch,
    contextPadding,
    denoise,
    differentialStrength,
    softInpaintEnabled,
    softInpaintMaskInfluence,
    softInpaintPreservation,
    softInpaintTransitionContrast,
    fillMode,
    infillColor,
    infillTileSize,
    inpaintModelName,
    loras,
    maskFeather,
    maskGrow,
    modelFamily,
    modelSource,
    negativePrompt,
    outputOnlyMaskedRegions,
    semanticCutout,
    promptSegments,
    processingHeight,
    processingScaleMode,
    processingWidth,
    samplerName,
    samples,
    scheduler,
    seamlessX,
    seamlessY,
    seed,
    steps,
  ]);

  React.useEffect(() => {
    if (!canvasDocument) return;
    if (generationRestoreProjectIdRef.current === canvasDocument.id) {
      generationRestoreProjectIdRef.current = '';
      return;
    }
    if (JSON.stringify(canvasDocument.generation) !== JSON.stringify(currentGenerationSettings)) {
      dispatchCanvasDocument({ type: 'set_generation_settings', generation: currentGenerationSettings });
    }
  }, [
    canvasDocument?.id,
    canvasDocument?.generation,
    currentGenerationSettings,
    dispatchCanvasDocument,
  ]);

  const rememberCurrentPrompt = React.useCallback((notify = true) => {
    if (!canvasDocument) return false;
    const promptHistory = recordUmbraCanvasPromptHistory(
      canvasDocument.generation.promptHistory,
      promptSegments,
      negativePrompt,
    );
    if (promptHistory.length <= 0) {
      if (notify) showToast('Enter a positive prompt before saving it to history.', 'error');
      return false;
    }
    dispatchCanvasDocument({
      type: 'set_generation_settings',
      generation: { ...currentGenerationSettings, promptHistory },
    });
    if (notify) showToast('Prompt saved to this canvas project.', 'success');
    return true;
  }, [
    canvasDocument,
    currentGenerationSettings,
    dispatchCanvasDocument,
    negativePrompt,
    promptSegments,
    showToast,
  ]);

  const restorePromptHistoryEntry = React.useCallback((entry: UmbraCanvasPromptHistoryEntry) => {
    const restoredSegments = entry.promptSegments.map((segment) => ({ ...segment }));
    if (restoredSegments.length <= 0) return;
    onPromptSegmentsChange(restoredSegments);
    onActivePromptSegmentChange(restoredSegments[0].id);
    onNegativePromptChange(entry.negativePrompt);
    showToast('Prompt restored from this canvas project.', 'success');
  }, [onActivePromptSegmentChange, onNegativePromptChange, onPromptSegmentsChange, showToast]);

  const removePromptHistoryEntry = React.useCallback((entryId: string) => {
    if (!canvasDocument) return;
    dispatchCanvasDocument({
      type: 'set_generation_settings',
      generation: {
        ...currentGenerationSettings,
        promptHistory: canvasDocument.generation.promptHistory.filter((entry) => entry.id !== entryId),
      },
    });
  }, [canvasDocument, currentGenerationSettings, dispatchCanvasDocument]);

  const clearPromptHistory = React.useCallback(() => {
    if (!canvasDocument || canvasDocument.generation.promptHistory.length <= 0) return;
    dispatchCanvasDocument({
      type: 'set_generation_settings',
      generation: { ...currentGenerationSettings, promptHistory: [] },
    });
    showToast('Canvas prompt history cleared.', 'success');
  }, [canvasDocument, currentGenerationSettings, dispatchCanvasDocument, showToast]);

  React.useEffect(() => {
    setProjectNameDraft(canvasDocument?.name || '');
    setSaveAsName(canvasDocument ? `${canvasDocument.name} Copy` : '');
  }, [canvasDocument?.id]);

  React.useEffect(() => {
    if (samModels.includes(samModelName)) return;
    setSamModelName(samModels[0] || '');
  }, [samModelName, samModels]);

  const modelInfillAvailable = inpaintRuntimeCapabilities?.modelInfill === true
    && (inpaintAdapter === 'classic_conditioning' || inpaintAdapter === 'flux_fill')
    && inpaintModels.length > 0;
  const colorPrefillAvailable = inpaintRuntimeCapabilities?.colorPrefill === true && inpaintAdapter !== 'native_edit';
  const tilePrefillAvailable = inpaintRuntimeCapabilities?.tilePrefill === true && inpaintAdapter !== 'native_edit';
  const maskedFillAvailable = inpaintRuntimeCapabilities?.maskedFill === true && inpaintAdapter !== 'native_edit';
  const maskedOutputAvailable = inpaintRuntimeCapabilities?.maskedOutput === true && inpaintAdapter !== 'native_edit';
  const backgroundRemovalAvailable = comfyConnected && inpaintRuntimeCapabilities?.backgroundRemoval === true;
  const semanticCutoutAvailable = inpaintRuntimeCapabilities?.semanticCutout === true && maskedOutputAvailable;
  const colorMatchAvailable = inpaintRuntimeCapabilities?.colorMatch === true && inpaintAdapter !== 'native_edit';
  const differentialDiffusionAvailable = inpaintRuntimeCapabilities?.differentialDiffusion === true && inpaintAdapter !== 'native_edit';
  const softInpaintCompositeAvailable = inpaintRuntimeCapabilities?.softInpaintComposite === true && inpaintAdapter !== 'native_edit';
  const maskExpansionAvailable = inpaintRuntimeCapabilities?.maskExpand === true;
  const effectiveSeamlessAvailable = seamlessAvailable && inpaintRuntimeCapabilities?.seamless === true;
  const modelCompatibilityIssue = getUmbraUiInpaintPrimaryModelIssue(inpaintAdapter, checkpointName);
  const activeSoftInpaintBlendMode = React.useMemo(() => SIMPLE_INPAINT_BLEND_MODES.find((mode) => (
    mode.edgeSoftness === maskFeather
    && Math.abs(mode.sourceProtection - softInpaintPreservation) < 0.001
    && Math.abs(mode.edgeContrast - softInpaintTransitionContrast) < 0.001
    && Math.abs(mode.maskBias - softInpaintMaskInfluence) < 0.001
  ))?.id || 'custom', [
    maskFeather,
    softInpaintMaskInfluence,
    softInpaintPreservation,
    softInpaintTransitionContrast,
  ]);
  const applySoftInpaintBlendMode = React.useCallback((mode: SimpleInpaintBlendMode) => {
    setSoftInpaintEnabled(true);
    setMaskFeather(mode.edgeSoftness);
    setCoherenceEdgeSize(mode.edgeSoftness);
    setSoftInpaintPreservation(mode.sourceProtection);
    setSoftInpaintTransitionContrast(mode.edgeContrast);
    setSoftInpaintMaskInfluence(mode.maskBias);
  }, []);
  const activeInpaintTaskMode = React.useMemo(() => SIMPLE_INPAINT_TASK_MODES.find((mode) => (
    Math.abs(mode.denoise - denoise) < 0.001
    && mode.contextPadding === contextPadding
    && mode.maskGrow === maskGrow
    && (!colorMatchAvailable || Math.abs(mode.colorMatch - colorMatch) < 0.001)
    && (!differentialDiffusionAvailable || Math.abs(mode.differentialStrength - differentialStrength) < 0.001)
    && mode.fillMode === fillMode
  ))?.id || 'custom', [
    colorMatch,
    colorMatchAvailable,
    contextPadding,
    denoise,
    differentialDiffusionAvailable,
    differentialStrength,
    fillMode,
    maskGrow,
  ]);
  const applyInpaintTaskMode = React.useCallback((mode: SimpleInpaintTaskMode) => {
    setDenoise(mode.denoise);
    setContextPadding(mode.contextPadding);
    setMaskGrow(mode.maskGrow);
    if (colorMatchAvailable) setColorMatch(mode.colorMatch);
    if (differentialDiffusionAvailable) setDifferentialStrength(mode.differentialStrength);
    setFillMode(mode.fillMode);
  }, [
    colorMatchAvailable,
    differentialDiffusionAvailable,
  ]);

  React.useEffect(() => {
    if (!comfyConnected) {
      setInpaintModels([]);
      setInpaintRuntimeCapabilities(null);
      return;
    }
    const controller = new AbortController();
    let retryTimer = 0;
    let attempts = 0;
    const loadCapabilities = async () => {
      attempts += 1;
      try {
        const response = await fetch('/api/umbra-ui/inpaint/models', { cache: 'no-store', signal: controller.signal });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) throw new Error(String(payload?.error || 'Inpaint model catalog unavailable.'));
        const models = Array.isArray(payload.models)
          ? payload.models.map((model: unknown) => String(model || '').trim()).filter(Boolean)
          : [];
        const features = payload.features && typeof payload.features === 'object' ? payload.features : {};
        setInpaintModels(models);
        if (payload.verified !== true) {
          setInpaintRuntimeCapabilities(null);
          if (attempts < 4) retryTimer = window.setTimeout(() => void loadCapabilities(), 1500);
          return;
        }
        setInpaintRuntimeCapabilities({
          modelInfill: features.modelInfill === true,
          maskedFill: features.maskedFill === true,
          maskExpand: features.maskExpand === true,
          colorMatch: features.colorMatch === true,
          differentialDiffusion: features.differentialDiffusion === true,
          softInpaintComposite: features.softInpaintComposite === true,
          colorPrefill: features.colorPrefill === true,
          tilePrefill: features.tilePrefill === true,
          seamless: features.seamless === true,
          maskedOutput: features.maskedOutput === true,
          backgroundRemoval: features.backgroundRemoval === true,
          semanticCutout: features.semanticCutout === true,
        });
        setInpaintModelName((current) => models.includes(current) ? current : models[0] || '');
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          setInpaintRuntimeCapabilities(null);
          if (attempts < 4) retryTimer = window.setTimeout(() => void loadCapabilities(), 1500);
        }
      }
    };
    void loadCapabilities();
    return () => {
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [comfyConnected]);

  React.useEffect(() => {
    if (!comfyConnected) {
      setClipSegAvailable(false);
      setClipSegError('Launch ComfyUI to use prompt selection.');
      return;
    }
    const controller = new AbortController();
    void fetchUmbraClipSegCapabilities(controller.signal)
      .then((capabilities) => {
        setClipSegAvailable(capabilities.available && capabilities.supportsPrompt);
        setClipSegModelId(capabilities.modelId);
        setClipSegError('');
      })
      .catch((error) => {
        if ((error as Error)?.name === 'AbortError') return;
        setClipSegAvailable(false);
        setClipSegError(error instanceof Error ? error.message : 'Prompt selection is unavailable.');
      });
    return () => controller.abort();
  }, [comfyConnected]);

  React.useEffect(() => {
    if (!inpaintRuntimeCapabilities) return;
    if ((fillMode === 'lama' && !modelInfillAvailable)
      || ((fillMode === 'navier-stokes' || fillMode === 'telea') && !maskedFillAvailable)
      || (fillMode === 'color' && !colorPrefillAvailable)
      || (fillMode === 'tile' && !tilePrefillAvailable)) {
      setFillMode('neutral');
    }
  }, [colorPrefillAvailable, fillMode, inpaintRuntimeCapabilities, maskedFillAvailable, modelInfillAvailable, tilePrefillAvailable]);

  React.useEffect(() => {
    if (outputOnlyMaskedRegions) setOutputOnlyMaskedRegions(false);
  }, [outputOnlyMaskedRegions]);

  React.useEffect(() => {
    if (!inpaintRuntimeCapabilities) return;
    if (!semanticCutoutAvailable && semanticCutout) setSemanticCutout(false);
  }, [inpaintRuntimeCapabilities, semanticCutout, semanticCutoutAvailable]);

  React.useEffect(() => {
    if (!inpaintRuntimeCapabilities) return;
    if (!colorMatchAvailable && colorMatch !== 0) setColorMatch(0);
    if (!differentialDiffusionAvailable && differentialStrength !== 1) setDifferentialStrength(1);
    if (!maskExpansionAvailable && (maskGrow !== 0 || maskFeather !== 0)) {
      setMaskGrow(0);
      setMaskFeather(0);
    }
    if (!effectiveSeamlessAvailable && (seamlessX || seamlessY)) {
      setSeamlessX(false);
      setSeamlessY(false);
    }
  }, [colorMatch, colorMatchAvailable, differentialDiffusionAvailable, differentialStrength, effectiveSeamlessAvailable, inpaintRuntimeCapabilities, maskExpansionAvailable, maskFeather, maskGrow, seamlessX, seamlessY]);

  const previewStage = React.useMemo(
    () => canvasDocument?.staging.find((stage) => stage.id === canvasDocument.previewStageId) || null,
    [canvasDocument],
  );
  const previewStagePosition = React.useMemo(() => {
    const stages = canvasDocument?.staging || [];
    const index = stages.findIndex((stage) => stage.id === canvasDocument?.previewStageId);
    return index >= 0 ? index + 1 : 0;
  }, [canvasDocument]);
  const selectedStages = React.useMemo(() => {
    const selected = new Set(selectedStageIds);
    return (canvasDocument?.staging || []).filter((stage) => selected.has(stage.id));
  }, [canvasDocument?.staging, selectedStageIds]);
  const activeCanvasLayer = React.useMemo(
    () => canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId) || null,
    [canvasDocument],
  );
  const activeRasterLayer = React.useMemo(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'raster' ? layer : null;
  }, [canvasDocument]);
  const layerEraseUnavailableReason = !activeRasterLayer
    ? 'Select an image layer before erasing pixels.'
    : activeRasterLayer.role === 'source'
      ? 'The original source is protected. Select an editable image layer.'
      : activeRasterLayer.locked
        ? 'Unlock the selected image layer before erasing pixels.'
        : activeRasterLayer.transparencyLocked
          ? 'Disable alpha lock on the selected image layer before erasing pixels.'
          : '';
  const rasterFilterLayer = React.useMemo(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === rasterFilterLayerId);
    return layer?.kind === 'raster' || layer?.kind === 'control' ? layer : null;
  }, [canvasDocument, rasterFilterLayerId]);
  const layerUpscaleLayer = React.useMemo(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === layerUpscaleLayerId);
    return layer?.kind === 'raster' ? layer : null;
  }, [canvasDocument, layerUpscaleLayerId]);
  const activeVisualLayer = React.useMemo<UmbraVisualCanvasLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'raster' || layer?.kind === 'text' || layer?.kind === 'gradient' ? layer : null;
  }, [canvasDocument]);
  const selectedVisualLayers = React.useMemo(() => {
    const selected = new Set(selectedLayerIds);
    return (canvasDocument?.layers || []).filter((layer): layer is UmbraVisualCanvasLayer => (
      selected.has(layer.id) && (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient')
    ));
  }, [canvasDocument, selectedLayerIds]);
  const selectedVisualMutationLocked = React.useMemo(() => selectedVisualLayers.some((layer) => (
    layer.locked && !(layer.kind === 'raster' && layer.role === 'source')
  )), [selectedVisualLayers]);
  const booleanRasterLayers = React.useMemo(() => {
    if (!canvasDocument || selectedVisualLayers.length !== 2) return [];
    const groupVisibility = new Map(canvasDocument.layers
      .filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group')
      .map((group) => [group.id, group.visible]));
    if (!selectedVisualLayers.every((layer) => (
      layer.kind === 'raster'
      && layer.visible
      && (!layer.groupId || groupVisibility.get(layer.groupId) !== false)
    ))) return [];
    return selectedVisualLayers as UmbraCanvasRasterLayer[];
  }, [canvasDocument, selectedVisualLayers]);
  const groupableSelectedLayers = React.useMemo(() => selectedVisualLayers.filter((layer) => (
    !layer.locked && !(layer.kind === 'raster' && layer.role === 'source')
  )), [selectedVisualLayers]);
  const mergeDownTarget = React.useMemo<UmbraVisualCanvasLayer | null>(() => {
    if (!canvasDocument || !activeVisualLayer || (activeVisualLayer.kind === 'raster' && activeVisualLayer.role === 'source')) return null;
    const activeIndex = canvasDocument.layers.findIndex((layer) => layer.id === activeVisualLayer.id);
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      const candidate = canvasDocument.layers[index];
      if (candidate.kind === 'group') return null;
      if (candidate.kind !== 'raster' && candidate.kind !== 'text' && candidate.kind !== 'gradient') continue;
      return candidate.groupId === activeVisualLayer.groupId ? candidate : null;
    }
    return null;
  }, [activeVisualLayer, canvasDocument]);
  const activeGroupLayer = React.useMemo<UmbraCanvasGroupLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'group' ? layer : null;
  }, [canvasDocument]);
  const activeTextLayer = React.useMemo<UmbraCanvasTextLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'text' ? layer : null;
  }, [canvasDocument]);
  const activeGradientLayer = React.useMemo<UmbraCanvasGradientLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'gradient' ? layer : null;
  }, [canvasDocument]);
  const activeInpaintMaskLayer = React.useMemo(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen ? layer : null;
  }, [canvasDocument]);
  const editableInpaintMasks = React.useMemo(
    () => (canvasDocument?.layers || []).filter((layer): layer is UmbraCanvasMaskLayer => (
      layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen
    )),
    [canvasDocument],
  );
  const activeLayerMaskLayer = React.useMemo(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'mask' && layer.purpose === 'layer' && !layer.frozen ? layer : null;
  }, [canvasDocument]);
  const editableMaskLayer = React.useMemo<UmbraCanvasMaskLayer | null>(() => {
    const layerId = editingLayerMaskId || canvasDocument?.activeMaskLayerId || '';
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === layerId);
    return layer?.kind === 'mask' && !layer.frozen ? layer : null;
  }, [canvasDocument, editingLayerMaskId]);
  const maskEditingLocked = editableMaskLayer?.locked === true;
  const rasterForActiveLayerMask = React.useMemo(() => (
    activeLayerMaskLayer
      ? (canvasDocument?.layers.find((layer): layer is UmbraCanvasRasterLayer => (
        layer.kind === 'raster' && layer.maskLayerId === activeLayerMaskLayer.id
      )) || null)
      : null
  ), [activeLayerMaskLayer, canvasDocument]);
  const groupLayers = React.useMemo(
    () => (canvasDocument?.layers || []).filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group'),
    [canvasDocument],
  );
  const visibleLayerRows = React.useMemo(() => {
    if (!canvasDocument) return [];
    const collapsedGroups = new Set(groupLayers.filter((group) => group.collapsed).map((group) => group.id));
    return canvasDocument.layers.filter((layer) => (
      isSimpleInpaintLayer(layer)
      && (!layer.groupId || !collapsedGroups.has(layer.groupId))
    ));
  }, [canvasDocument, groupLayers]);
  const simpleInpaintLayerRows = React.useMemo(() => (canvasDocument?.layers || []).filter((layer) => (
    layer.kind === 'raster'
    || layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen
  )), [canvasDocument]);
  React.useEffect(() => {
    if (!canvasDocument || visibleLayerRows.some((layer) => layer.id === canvasDocument.activeLayerId)) return;
    const fallback = visibleLayerRows.find((layer) => layer.id === canvasDocument.activeMaskLayerId)
      || [...visibleLayerRows].reverse().find((layer) => layer.kind === 'raster')
      || visibleLayerRows[0];
    if (fallback) dispatchCanvasDocument({ type: 'select_layer', layerId: fallback.id });
  }, [canvasDocument, dispatchCanvasDocument, visibleLayerRows]);
  const activeRegionalGuidanceLayer = React.useMemo<UmbraCanvasRegionalGuidanceLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'regional_guidance' ? layer : null;
  }, [canvasDocument]);
  const activeRegionalMaskLayer = React.useMemo<UmbraCanvasMaskLayer | null>(() => (
    activeRegionalGuidanceLayer && canvasDocument
      ? getUmbraCanvasMaskLayer(canvasDocument, activeRegionalGuidanceLayer.maskLayerId)
      : null
  ), [activeRegionalGuidanceLayer, canvasDocument]);
  const activeControlLayer = React.useMemo<UmbraCanvasControlLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'control' ? layer : null;
  }, [canvasDocument]);
  const activeControlModels = activeControlLayer?.adapterType === 'z_image_control'
    ? modelPatchModels
    : activeControlLayer?.adapterType === 'anima_lllite'
      ? animaLlliteModels
      : controlModels;
  const defaultControlModel = controlAdapterTypes[0] === 'z_image_control'
    ? modelPatchModels[0] || ''
    : controlAdapterTypes[0] === 'anima_lllite'
      ? animaLlliteModels[0] || ''
      : controlModels[0] || '';
  const activeControlHasStepRange = activeControlLayer?.adapterType !== 'z_image_control';
  const activeReferenceLayer = React.useMemo<UmbraCanvasReferenceLayer | null>(() => {
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    return layer?.kind === 'reference' ? layer : null;
  }, [canvasDocument]);
  const activeImageLayer = activeRasterLayer || activeControlLayer || activeReferenceLayer;
  const activeTransformLayer = React.useMemo<UmbraTransformableCanvasLayer | null>(() => (
    activeVisualLayer || activeControlLayer || activeReferenceLayer || activeRegionalGuidanceLayer || activeInpaintMaskLayer
  ), [activeControlLayer, activeInpaintMaskLayer, activeReferenceLayer, activeRegionalGuidanceLayer, activeVisualLayer]);
  const guidanceMergeDownTarget = React.useMemo(() => {
    if (!canvasDocument || !activeCanvasLayer) return null;
    const isMergeable = activeCanvasLayer.kind === 'control'
      || activeCanvasLayer.kind === 'regional_guidance'
      || activeCanvasLayer.kind === 'mask' && activeCanvasLayer.purpose === 'inpaint' && !activeCanvasLayer.frozen;
    if (!isMergeable) return null;
    const activeIndex = canvasDocument.layers.findIndex((layer) => layer.id === activeCanvasLayer.id);
    for (let index = activeIndex - 1; index >= 0; index -= 1) {
      const candidate = canvasDocument.layers[index];
      if (activeCanvasLayer.kind === 'control' && candidate.kind === 'control') return candidate;
      if (activeCanvasLayer.kind === 'regional_guidance' && candidate.kind === 'regional_guidance') return candidate;
      if (activeCanvasLayer.kind === 'mask' && candidate.kind === 'mask' && candidate.purpose === 'inpaint' && !candidate.frozen) return candidate;
    }
    return null;
  }, [activeCanvasLayer, canvasDocument]);
  const visualMergeDownMutationLocked = !!activeVisualLayer && (
    activeVisualLayer.locked
    || !!mergeDownTarget && mergeDownTarget.locked && !(mergeDownTarget.kind === 'raster' && mergeDownTarget.role === 'source')
  );
  const guidanceMergeDownMutationLocked = !!activeCanvasLayer && (
    activeCanvasLayer.locked || guidanceMergeDownTarget?.locked === true
  );
  const visibleGuidanceMergeLayers = React.useMemo<Array<UmbraCanvasControlLayer | UmbraCanvasMaskLayer | UmbraCanvasRegionalGuidanceLayer>>(() => {
    if (!canvasDocument || !activeCanvasLayer) return [];
    if (activeCanvasLayer.kind === 'control') {
      return canvasDocument.layers.filter((layer): layer is UmbraCanvasControlLayer => layer.kind === 'control' && layer.visible);
    }
    if (activeCanvasLayer.kind === 'regional_guidance') {
      return canvasDocument.layers.filter((layer): layer is UmbraCanvasRegionalGuidanceLayer => layer.kind === 'regional_guidance' && layer.visible);
    }
    if (activeCanvasLayer.kind === 'mask' && activeCanvasLayer.purpose === 'inpaint' && !activeCanvasLayer.frozen) {
      return canvasDocument.layers.filter((layer): layer is UmbraCanvasMaskLayer => (
        layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen && layer.visible
      ));
    }
    return [];
  }, [activeCanvasLayer, canvasDocument]);
  const visibleGuidanceMergeMutationLocked = visibleGuidanceMergeLayers.some((layer) => layer.locked);
  const activeGroupMergeMutationLocked = React.useMemo(() => (
    !!activeGroupLayer && (
      activeGroupLayer.locked
      || (canvasDocument?.layers || []).some((layer) => layer.groupId === activeGroupLayer.id && layer.locked)
    )
  ), [activeGroupLayer, canvasDocument]);
  const flattenVisibleMutationLocked = React.useMemo(() => {
    if (!canvasDocument) return false;
    const groupsById = new Map(canvasDocument.layers
      .filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group')
      .map((group) => [group.id, group]));
    return canvasDocument.layers.some((layer) => {
      if ((layer.kind !== 'raster' && layer.kind !== 'text' && layer.kind !== 'gradient') || !layer.visible) return false;
      if (layer.kind === 'raster' && layer.role === 'source') return false;
      const group = layer.groupId ? groupsById.get(layer.groupId) : null;
      if (group?.visible === false) return false;
      return layer.locked || group?.locked === true;
    });
  }, [canvasDocument]);
  const regionalGuidanceLayers = React.useMemo(
    () => getUmbraCanvasRegionalGuidanceLayers(canvasDocument),
    [canvasDocument],
  );
  const activeReferenceRegion = activeReferenceLayer?.regionLayerId
    ? regionalGuidanceLayers.find((layer) => layer.id === activeReferenceLayer.regionLayerId) || null
    : null;
  const activeReferenceUsesStyleModel = activeReferenceLayer?.method === 'style_model' || activeReferenceLayer?.method === 'flux_redux';
  const activeReferenceUsesIpAdapter = activeReferenceLayer?.method === 'ip_adapter';
  const activeReferenceHasModelResources = activeReferenceUsesStyleModel || activeReferenceUsesIpAdapter;
  const activeReferenceModels = activeReferenceUsesIpAdapter ? ipAdapterModels : styleModels;
  const regionalReferenceCaptureAvailable = regionalGuidanceAvailable
    && referenceLayersAvailable
    && referenceMethods.includes('ip_adapter');
  const displayDocument = React.useMemo(() => {
    if (!visualDocument) return null;
    const isolateStage = canvasPreferences.isolatedStagingPreview && !!previewStage;
    const isolateLayer = canvasPreferences.isolatedLayerPreview && !previewStage && !!activeVisualLayer;
    if (!isolateStage && !isolateLayer) return visualDocument;
    return {
      ...visualDocument,
      layers: visualDocument.layers.map((layer) => {
        if (layer.kind === 'group') return { ...layer, visible: false };
        if (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient') {
          return {
            ...layer,
            visible: isolateLayer ? layer.id === activeVisualLayer?.id : false,
            groupId: undefined,
          };
        }
        return layer;
      }),
    };
  }, [activeVisualLayer, canvasPreferences.isolatedLayerPreview, canvasPreferences.isolatedStagingPreview, previewStage, visualDocument]);
  const transparentDisplay = (canvasPreferences.isolatedLayerPreview && !previewStage && !!activeVisualLayer)
    || (canvasPreferences.isolatedStagingPreview && !!previewStage);
  const availableControlTypeOptions = React.useMemo(() => CONTROL_TYPE_OPTIONS.filter((option) => (
    (!option.nodeType || controlPreprocessors.includes(option.nodeType))
    && (!option.adapterTypes || !!activeControlLayer && option.adapterTypes.includes(activeControlLayer.adapterType))
  )), [activeControlLayer, controlPreprocessors]);
  const activeControlPreprocessorOption = CONTROL_TYPE_OPTIONS.find((option) => option.value === activeControlLayer?.controlType);
  const activeControlPreprocessorInstalled = !activeControlPreprocessorOption?.nodeType
    || controlPreprocessors.includes(activeControlPreprocessorOption.nodeType);

  React.useEffect(() => {
    const available = new Set((canvasDocument?.staging || []).map((stage) => stage.id));
    setSelectedStageIds((current) => {
      const next = current.filter((stageId) => available.has(stageId));
      return next.length === current.length ? current : next;
    });
    if ((canvasDocument?.staging.length || 0) < 2) setCompareStages(false);
  }, [canvasDocument?.staging]);

  React.useEffect(() => {
    if ((canvasDocument?.staging.length || 0) > 0) setLayersExpanded(true);
  }, [canvasDocument?.staging.length]);

  React.useEffect(() => {
    const available = new Set((canvasDocument?.layers || []).map((layer) => layer.id));
    const activeLayerId = canvasDocument?.activeLayerId || '';
    if (activeLayerId && quickSwitchHistoryRef.current.current !== activeLayerId) {
      quickSwitchHistoryRef.current = {
        previous: quickSwitchHistoryRef.current.current,
        current: activeLayerId,
      };
    }
    const activeChanged = selectionActiveLayerRef.current !== activeLayerId;
    selectionActiveLayerRef.current = activeLayerId;
    setSelectedLayerIds((current) => {
      const retained = current.filter((layerId) => available.has(layerId));
      if (activeChanged && activeLayerId && !retained.includes(activeLayerId)) return [activeLayerId];
      if (retained.length > 0 || !activeLayerId || !available.has(activeLayerId)) {
        return retained.length === current.length ? current : retained;
      }
      return [activeLayerId];
    });
  }, [canvasDocument?.activeLayerId, canvasDocument?.layers]);

  React.useEffect(() => {
    if (activeLayerMaskLayer) {
      setEditingLayerMaskId(activeLayerMaskLayer.id);
      setEditTarget('mask');
      return;
    }
    if (editingLayerMaskId && !canvasDocument?.layers.some((layer) => layer.id === editingLayerMaskId && layer.kind === 'mask' && layer.purpose === 'layer')) {
      setEditingLayerMaskId('');
    }
  }, [activeLayerMaskLayer, canvasDocument?.layers, editingLayerMaskId]);
  const alignGenerationRegion = React.useCallback((region: UmbraCanvasRect) => {
    if (!canvasDocument) return region;
    return alignCanvasRectToPipeline(region, canvasDocument.width, canvasDocument.height, capabilities.resolution);
  }, [canvasDocument, capabilities.resolution]);
  const updateGenerationRegionGeometry = React.useCallback((changes: Partial<UmbraCanvasRect>) => {
    const region = latestDocumentRef.current?.generationRegion;
    if (!region) return;
    dispatchCanvasDocument({
      type: 'set_generation_region',
      region: alignGenerationRegion({ ...region, ...changes }),
    });
  }, [alignGenerationRegion, dispatchCanvasDocument]);
  React.useEffect(() => {
    if (!canvasDocument?.generationRegion) return;
    dispatchCanvasDocument({ type: 'set_generation_region', region: null });
  }, [canvasDocument?.generationRegion, dispatchCanvasDocument]);
  const visibleGenerationRegion = React.useMemo(() => (
    canvasDocument
      ? alignGenerationRegion({ x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height })
      : null
  ), [alignGenerationRegion, canvasDocument]);
  const visibleContextRegion: UmbraCanvasRect | null = null;
  const processingSize = React.useMemo(() => resolveUmbraUiInpaintProcessingSize(
    visibleContextRegion || visibleGenerationRegion || { width: 1024, height: 1024 },
    { processingScaleMode, processingWidth, processingHeight },
    capabilities.resolution,
  ), [
    capabilities.resolution,
    processingHeight,
    processingScaleMode,
    processingWidth,
    visibleContextRegion,
    visibleGenerationRegion,
  ]);
  const fitScale = React.useMemo(() => {
    if (viewportSize.width <= 1 || viewportSize.height <= 1) return 0.5;
    return Math.max(0.04, Math.min(
      (viewportSize.width - 32) / Math.max(1, canvasSize.width),
      (viewportSize.height - 32) / Math.max(1, canvasSize.height),
    ));
  }, [canvasSize.height, canvasSize.width, viewportSize.height, viewportSize.width]);
  const displayScale = fitScale * zoom;
  const displayWidth = Math.max(64, Math.round(canvasSize.width * displayScale));
  const displayHeight = Math.max(64, Math.round(canvasSize.height * displayScale));
  const renderFullCommittedCanvas = React.useCallback(async (options: {
    signal?: AbortSignal;
    onLayerRendered?: (completed: number) => void;
  } = {}) => {
    if (!visualDocument) throw new Error('The canvas is unavailable.');
    const output = document.createElement('canvas');
    const rendered = await renderCanvasDocument(output, visualDocument, null, false, null, {
      shouldAbort: () => !!options.signal?.aborted,
      yieldEveryLayers: 1,
      onLayerRendered: options.onLayerRendered,
    });
    if (!rendered) {
      if (options.signal?.aborted) throw new DOMException('Canvas rendering was canceled.', 'AbortError');
      throw new Error('The canvas render was interrupted.');
    }
    return output;
  }, [visualDocument]);
  const rasterEditingActive = editTarget === 'raster' && (tool === 'brush' || tool === 'erase' || tool === 'shape');
  const paintBufferBounds = React.useMemo(() => resolveUmbraCanvasPaintBufferRect(
    canvasSize.width,
    canvasSize.height,
    canvasDocument?.generationRegion || null,
    canvasPreferences.clipToGenerationRegion,
  ), [canvasDocument?.generationRegion, canvasPreferences.clipToGenerationRegion, canvasSize.height, canvasSize.width]);
  const rulerTicks = React.useMemo(() => {
    const step = canvasRulerStep(displayScale);
    const x = Array.from({ length: Math.min(512, Math.floor(canvasSize.width / step) + 1) }, (_, index) => index * step);
    const y = Array.from({ length: Math.min(512, Math.floor(canvasSize.height / step) + 1) }, (_, index) => index * step);
    return { x, y };
  }, [canvasSize.height, canvasSize.width, displayScale]);

  const captureMaskSnapshot = React.useCallback((reset = false) => {
    const canvas = maskCanvasRef.current;
    if (!canvas || maskEditingLocked) return;
    const targetMaskLayerId = editingLayerMaskId;
    const generation = reset ? ++maskSnapshotGenerationRef.current : maskSnapshotGenerationRef.current;
    maskSnapshotQueueRef.current = maskSnapshotQueueRef.current.then(async () => {
      const blob = await canvasToBlob(canvas);
      if (generation !== maskSnapshotGenerationRef.current) return;
      const snapshot = URL.createObjectURL(blob);
      maskSnapshotUrlsRef.current.add(snapshot);
      dispatchCanvasDocument(targetMaskLayerId
        ? { type: 'set_mask_layer_snapshot', layerId: targetMaskLayerId, dataUrl: snapshot }
        : { type: 'set_mask_snapshot', dataUrl: snapshot });
    }).catch(() => undefined);
  }, [editingLayerMaskId, maskEditingLocked]);

  const commitMask = React.useCallback(() => {
    captureMaskSnapshot(false);
  }, [captureMaskSnapshot]);

  const resetMaskHistory = React.useCallback(() => {
    captureMaskSnapshot(true);
  }, [captureMaskSnapshot]);

  const releaseMaskSnapshotUrls = React.useCallback(() => {
    if (maskSnapshotCleanupTimerRef.current !== null) window.clearTimeout(maskSnapshotCleanupTimerRef.current);
    maskSnapshotCleanupTimerRef.current = null;
    for (const snapshot of maskSnapshotUrlsRef.current) URL.revokeObjectURL(snapshot);
    maskSnapshotUrlsRef.current.clear();
    maskSnapshotLeaseRef.current.clear();
    maskSnapshotGenerationRef.current += 1;
  }, []);

  React.useEffect(() => {
    if (maskSnapshotCleanupTimerRef.current !== null) window.clearTimeout(maskSnapshotCleanupTimerRef.current);
    maskSnapshotCleanupTimerRef.current = window.setTimeout(() => {
      maskSnapshotCleanupTimerRef.current = null;
      const history = documentHistoryRef.current;
      const referenced = new Set<string>();
      const documents = [...history.past, history.present, ...history.future]
        .filter((document): document is UmbraCanvasDocument => !!document);
      for (const document of documents) {
        for (const layer of document.layers) {
          if (layer.kind === 'mask' && layer.dataUrl) referenced.add(layer.dataUrl);
        }
        for (const stage of document.staging) if (stage.maskDataUrl) referenced.add(stage.maskDataUrl);
        for (const job of document.pendingJobs) if (job.maskDataUrl) referenced.add(job.maskDataUrl);
      }
      const { retainedUrls, settledLeaseUrls } = resolveUmbraCanvasMaskSnapshotLeases({
        referencedUrls: referenced,
        leases: maskSnapshotLeaseRef.current,
        pendingRestoreUrl: pendingMaskRestoreRef.current,
        presentRevision: history.present?.revision ?? -1,
      });
      for (const snapshot of settledLeaseUrls) maskSnapshotLeaseRef.current.delete(snapshot);
      for (const snapshot of maskSnapshotUrlsRef.current) {
        if (retainedUrls.has(snapshot)) continue;
        URL.revokeObjectURL(snapshot);
        maskSnapshotUrlsRef.current.delete(snapshot);
      }
    }, 500);
    return () => {
      if (maskSnapshotCleanupTimerRef.current !== null) window.clearTimeout(maskSnapshotCleanupTimerRef.current);
      maskSnapshotCleanupTimerRef.current = null;
    };
  }, [documentHistory]);

  React.useEffect(() => () => {
    canvasRenderGenerationRef.current += 1;
    if (maskSnapshotCleanupTimerRef.current !== null) window.clearTimeout(maskSnapshotCleanupTimerRef.current);
    maskSnapshotCleanupTimerRef.current = null;
    for (const snapshot of maskSnapshotUrlsRef.current) URL.revokeObjectURL(snapshot);
    maskSnapshotUrlsRef.current.clear();
    maskSnapshotLeaseRef.current.clear();
    for (const assetUrl of layerAssetObjectUrlsRef.current) URL.revokeObjectURL(assetUrl);
    layerAssetObjectUrlsRef.current.clear();
  }, []);

  const drawMaskSnapshot = React.useCallback((snapshot: string) => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    if (!snapshot) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = snapshot;
  }, []);

  const activeMaskSnapshot = React.useMemo(() => {
    const targetMaskLayerId = editingLayerMaskId || canvasDocument?.activeMaskLayerId || '';
    const layer = canvasDocument?.layers.find((candidate) => candidate.id === targetMaskLayerId);
    return layer?.kind === 'mask' ? layer.dataUrl : '';
  }, [canvasDocument, editingLayerMaskId]);

  React.useEffect(() => {
    if (pendingMaskRestoreRef.current) return;
    drawMaskSnapshot(activeMaskSnapshot);
  }, [activeMaskSnapshot, drawMaskSnapshot]);

  const paintOutpaintMargins = React.useCallback((context: CanvasRenderingContext2D, margins: FrameMargins) => {
    if (!source) return;
    context.save();
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = '#ff304c';
    if (margins.top > 0) context.fillRect(0, 0, canvasSize.width, margins.top);
    if (margins.bottom > 0) context.fillRect(0, canvasSize.height - margins.bottom, canvasSize.width, margins.bottom);
    if (margins.left > 0) context.fillRect(0, margins.top, margins.left, source.height);
    if (margins.right > 0) context.fillRect(canvasSize.width - margins.right, margins.top, margins.right, source.height);
    context.restore();
  }, [canvasSize.height, canvasSize.width, source]);

  const loadSource = React.useCallback(async (
    imageUrl: string,
    name: string,
    path = '',
    objectUrl = false,
    originalPath = path,
  ) => {
    const normalizedUrl = String(imageUrl || '').trim();
    if (!normalizedUrl) throw new Error('No source image was provided.');
    const image = await loadHtmlImage(normalizedUrl);
    assertUmbraCanvasInteractiveAllocation(image.naturalWidth, image.naturalHeight);
    releaseMaskSnapshotUrls();
    for (const assetUrl of layerAssetObjectUrlsRef.current) URL.revokeObjectURL(assetUrl);
    layerAssetObjectUrlsRef.current.clear();
    if (sourceObjectUrlRef.current && sourceObjectUrlRef.current !== normalizedUrl) {
      URL.revokeObjectURL(sourceObjectUrlRef.current);
      sourceObjectUrlRef.current = '';
    }
    if (objectUrl) sourceObjectUrlRef.current = normalizedUrl;
    const nextSource: InpaintSource = {
      id: createLocalId('inpaint-source'),
      name: String(name || 'source.png').trim() || 'source.png',
      path: String(path || '').trim(),
      originalPath: String(originalPath || path || '').trim(),
      imageUrl: normalizedUrl,
      width: image.naturalWidth,
      height: image.naturalHeight,
      objectUrl,
    };
    setSource(nextSource);
    const canvasAsset = createUmbraCanvasImageAsset({
      id: nextSource.id,
      name: nextSource.name,
      path: nextSource.path,
      imageUrl: nextSource.imageUrl,
      width: nextSource.width,
      height: nextSource.height,
      objectUrl: nextSource.objectUrl,
    });
    const nextDocument = createUmbraCanvasDocument(canvasAsset, nextSource.name);
    dispatchCanvasDocument({ type: 'replace_document', document: nextDocument });
    setCanvasSize({ width: image.naturalWidth, height: image.naturalHeight });
    setDraftMargins(EMPTY_MARGINS);
    setAppliedMargins(EMPTY_MARGINS);
    setLastBox(null);
    setPolygonPoints([]);
    setSamPoints([]);
    setSamBox(null);
    setJob(null);
    setZoom(1);
    setMaskResetRevision((value) => value + 1);
    return nextDocument;
  }, [releaseMaskSnapshotUrls]);

  const refreshProjects = React.useCallback(async (signal?: AbortSignal) => {
    try {
      setProjects(await listUmbraCanvasProjects(signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void refreshProjects(controller.signal);
    return () => controller.abort();
  }, [refreshProjects]);

  const clearScheduledProjectAutoSave = React.useCallback(() => {
    if (projectAutoSaveTimerRef.current === null) return;
    window.clearTimeout(projectAutoSaveTimerRef.current);
    projectAutoSaveTimerRef.current = null;
  }, []);

  const persistProject = React.useCallback(async (documentSnapshot: UmbraCanvasDocument, notify = false) => {
    clearScheduledProjectAutoSave();
    const pendingSnapshot = projectAutoSaveSnapshotRef.current;
    if (pendingSnapshot?.id === documentSnapshot.id && pendingSnapshot.revision <= documentSnapshot.revision) {
      projectAutoSaveSnapshotRef.current = null;
    }
    const requestId = ++projectSaveRequestRef.current;
    setProjectSaveState('saving');
    try {
      const saved = await saveUmbraCanvasProject(documentSnapshot);
      if (requestId !== projectSaveRequestRef.current) return;
      if (latestDocumentRef.current?.id === saved.id && latestDocumentRef.current.revision === documentSnapshot.revision) {
        dispatchCanvasHistory({ type: 'history_hydrate', document: saved });
      }
      setProjects((current) => {
        const summary: UmbraCanvasProjectSummary = {
          id: saved.id,
          name: saved.name,
          width: saved.width,
          height: saved.height,
          layerCount: saved.layers.length,
          stagingCount: saved.staging.length,
          updatedAt: saved.updatedAt,
        };
        return [summary, ...current.filter((entry) => entry.id !== saved.id)]
          .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
      });
      setProjectSaveState('saved');
      if (notify) showToast('Inpaint project saved.', 'success');
      return saved;
    } catch (error) {
      if (requestId !== projectSaveRequestRef.current) return;
      setProjectSaveState('error');
      if (notify) showToast(error instanceof Error ? error.message : 'Failed to save the inpaint project.', 'error');
      return null;
    }
  }, [clearScheduledProjectAutoSave, showToast]);

  React.useEffect(() => {
    if (!canvasDocument || !source) {
      clearScheduledProjectAutoSave();
      return;
    }
    projectAutoSaveSnapshotRef.current = canvasDocument;
    if (projectAutoSaveTimerRef.current !== null) return;
    projectAutoSaveTimerRef.current = window.setTimeout(() => {
      projectAutoSaveTimerRef.current = null;
      const snapshot = projectAutoSaveSnapshotRef.current;
      if (snapshot) void persistProject(snapshot);
    }, CANVAS_PROJECT_AUTOSAVE_INTERVAL_MS);
  }, [canvasDocument?.id, canvasDocument?.pendingJobs.length, canvasDocument?.revision, clearScheduledProjectAutoSave, persistProject, source]);

  React.useEffect(() => () => {
    clearScheduledProjectAutoSave();
    const pendingSnapshot = projectAutoSaveSnapshotRef.current;
    projectAutoSaveSnapshotRef.current = null;
    if (pendingSnapshot) void saveUmbraCanvasProject(pendingSnapshot).catch(() => undefined);
  }, [clearScheduledProjectAutoSave]);

  React.useEffect(() => {
    if (!canvasDocument?.id || !source) return;
    try { window.localStorage.setItem(ACTIVE_CANVAS_PROJECT_KEY, canvasDocument.id); } catch { /* best effort */ }
  }, [canvasDocument?.id, source]);

  const applyProjectGenerationSettings = React.useCallback((generation: UmbraCanvasGenerationSettings) => {
    if (generation.modelFamily) onModelFamilyChange(generation.modelFamily);
    const supportedSource = modelSourceOptions.find((option) => option.value === generation.modelSource)?.value;
    if (supportedSource) onModelSourceChange(supportedSource);
    onLorasChange(generation.loras as UmbraUiLoraEntry[]);
    const segments = generation.promptSegments.length > 0
      ? generation.promptSegments
      : [{ id: createLocalId('umbra-prompt'), text: '' }];
    onPromptSegmentsChange(segments);
    onActivePromptSegmentChange(
      segments.some((segment) => segment.id === generation.activePromptSegmentId)
        ? generation.activePromptSegmentId
        : segments[0].id,
    );
    onNegativePromptChange(generation.negativePrompt);
    onClipSkipChange(generation.clipSkip);
    onSeedChange(generation.seed);
    onStepsChange(generation.steps);
    onCfgChange(generation.cfg);
    onSamplerNameChange(generation.samplerName);
    onSchedulerChange(generation.scheduler);
    setSamples(generation.samples);
    setDenoise(generation.denoise);
    setMaskGrow(SIMPLE_INPAINT_DEFAULT_MASK_GROW);
    setMaskFeather(Math.max(0, Math.min(128, generation.maskFeather || 0)));
    setContextPadding(generation.contextPadding);
    setProcessingScaleMode('none');
    setProcessingWidth(generation.processingWidth);
    setProcessingHeight(generation.processingHeight);
    setCoherenceMode('gaussian');
    setCoherenceEdgeSize(Math.max(0, Math.min(128, generation.maskFeather || 0)));
    setCoherenceMinimumDenoise(0);
    setSeamlessX(false);
    setSeamlessY(false);
    setOutputOnlyMaskedRegions(false);
    setFillMode('neutral');
    setInfillColor(generation.infillColor);
    setInfillTileSize(generation.infillTileSize);
    setInpaintModelName(generation.inpaintModelName);
    setColorMatch(generation.colorMatch);
    setDifferentialStrength(generation.differentialStrength);
    setSoftInpaintEnabled(generation.softInpaintEnabled);
    setSoftInpaintPreservation(generation.softInpaintPreservation);
    setSoftInpaintTransitionContrast(generation.softInpaintTransitionContrast);
    setSoftInpaintMaskInfluence(generation.softInpaintMaskInfluence);
  }, [
    modelSourceOptions,
    onActivePromptSegmentChange,
    onCfgChange,
    onClipSkipChange,
    onLorasChange,
    onModelFamilyChange,
    onModelSourceChange,
    onNegativePromptChange,
    onPromptSegmentsChange,
    onSamplerNameChange,
    onSchedulerChange,
    onSeedChange,
    onStepsChange,
  ]);

  const applyRecoveredInpaintSettings = React.useCallback((generation: UmbraUiMediaGenerationSnapshot | undefined) => {
    if (!generation) return;
    if (generation.denoise !== undefined) setDenoise(generation.denoise);
    const inpaint = generation.inpaint;
    if (!inpaint) return;
    if (inpaint.samples !== undefined) setSamples(inpaint.samples);
    setMaskGrow(SIMPLE_INPAINT_DEFAULT_MASK_GROW);
    if (inpaint.maskFeather !== undefined) setMaskFeather(Math.max(0, Math.min(128, inpaint.maskFeather || 0)));
    if (inpaint.contextPadding !== undefined) setContextPadding(inpaint.contextPadding);
    setProcessingScaleMode('none');
    if (inpaint.processingWidth !== undefined) setProcessingWidth(inpaint.processingWidth);
    if (inpaint.processingHeight !== undefined) setProcessingHeight(inpaint.processingHeight);
    setCoherenceMode('gaussian');
    setCoherenceEdgeSize(Math.max(0, Math.min(128, inpaint.maskFeather || 0)));
    setCoherenceMinimumDenoise(0);
    setSeamlessX(false);
    setSeamlessY(false);
    setOutputOnlyMaskedRegions(false);
    setFillMode('neutral');
    if (inpaint.infillColor !== undefined) setInfillColor(inpaint.infillColor);
    if (inpaint.infillTileSize !== undefined) setInfillTileSize(inpaint.infillTileSize);
    if (inpaint.inpaintModelName !== undefined) setInpaintModelName(inpaint.inpaintModelName);
    if (inpaint.colorMatch !== undefined) setColorMatch(inpaint.colorMatch);
    if (inpaint.differentialStrength !== undefined) setDifferentialStrength(inpaint.differentialStrength);
    if (inpaint.softInpaintEnabled !== undefined) setSoftInpaintEnabled(inpaint.softInpaintEnabled);
    if (inpaint.softInpaintPreservation !== undefined) setSoftInpaintPreservation(inpaint.softInpaintPreservation);
    if (inpaint.softInpaintTransitionContrast !== undefined) setSoftInpaintTransitionContrast(inpaint.softInpaintTransitionContrast);
    if (inpaint.softInpaintMaskInfluence !== undefined) setSoftInpaintMaskInfluence(inpaint.softInpaintMaskInfluence);
  }, []);

  React.useEffect(() => {
    if (!seamlessAvailable || !seamlessAxes.includes('x')) setSeamlessX(false);
    if (!seamlessAvailable || !seamlessAxes.includes('y')) setSeamlessY(false);
  }, [seamlessAvailable, seamlessAxes]);

  const openProject = React.useCallback(async (projectId: string, quiet = false): Promise<boolean> => {
    if (!projectId) return false;
    try {
      const pendingSnapshot = projectAutoSaveSnapshotRef.current;
      if (pendingSnapshot) await persistProject(pendingSnapshot);
      const project = await loadUmbraCanvasProject(projectId);
      assertUmbraCanvasInteractiveAllocation(project.width, project.height);
      const sourceLayer = project.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
      if (!sourceLayer || sourceLayer.kind !== 'raster') throw new Error('The project source layer is missing.');
      if (sourceObjectUrlRef.current) {
        URL.revokeObjectURL(sourceObjectUrlRef.current);
        sourceObjectUrlRef.current = '';
      }
      releaseMaskSnapshotUrls();
      for (const assetUrl of layerAssetObjectUrlsRef.current) URL.revokeObjectURL(assetUrl);
      layerAssetObjectUrlsRef.current.clear();
      const nextSource: InpaintSource = {
        id: sourceLayer.asset.id,
        name: sourceLayer.asset.name,
        path: sourceLayer.asset.path,
        originalPath: sourceLayer.asset.path,
        imageUrl: sourceLayer.asset.imageUrl,
        width: sourceLayer.asset.width,
        height: sourceLayer.asset.height,
        objectUrl: false,
      };
      const left = Math.max(0, Math.round(sourceLayer.transform.x));
      const top = Math.max(0, Math.round(sourceLayer.transform.y));
      const margins = {
        left,
        top,
        right: Math.max(0, project.width - left - Math.round(sourceLayer.transform.width)),
        bottom: Math.max(0, project.height - top - Math.round(sourceLayer.transform.height)),
      };
      const activeMask = project.layers.find((layer) => layer.id === project.activeMaskLayerId && layer.kind === 'mask');
      pendingMaskRestoreRef.current = activeMask?.kind === 'mask' ? activeMask.dataUrl : '';
      pendingMaskRestoreCommitRef.current = false;
      setSource(nextSource);
      setCanvasSize({ width: project.width, height: project.height });
      setDraftMargins(margins);
      setAppliedMargins(margins);
      setLastBox(null);
      setPolygonPoints([]);
      setSamPoints([]);
      setSamBox(null);
      setJob(null);
      setZoom(1);
      generationRestoreProjectIdRef.current = project.id;
      applyProjectGenerationSettings(project.generation);
      dispatchCanvasDocument({ type: 'replace_document', document: project });
      setMaskResetRevision((value) => value + 1);
      if (!quiet) showToast(`Opened ${project.name}.`, 'success');
      return true;
    } catch (error) {
      if (!quiet) showToast(error instanceof Error ? error.message : 'Failed to open the inpaint project.', 'error');
      return false;
    }
  }, [applyProjectGenerationSettings, persistProject, releaseMaskSnapshotUrls, showToast]);

  const showProjectBrowser = React.useCallback(() => {
    setProjectBrowserOpen(true);
    void refreshProjects();
  }, [refreshProjects]);

  const canvasStudio = useUmbraCanvasStudio({
    enabled: studioMode,
    document: canvasDocument,
    openCanvasDocument: openProject,
    showToast,
  });

  const studioViewport = React.useMemo(() => ({
    zoom: canvasStudio.project?.viewport.zoom || 1,
    panX: studioViewportPreview?.panX ?? canvasStudio.project?.viewport.panX ?? 0,
    panY: studioViewportPreview?.panY ?? canvasStudio.project?.viewport.panY ?? 0,
    snapSize: UMBRA_CANVAS_STUDIO_SNAP_SIZE,
    snapEnabled: canvasStudio.project?.viewport.snapEnabled !== false,
  }), [canvasStudio.project?.viewport, studioViewportPreview]);
  const [studioPreviewRenderZoom, setStudioPreviewRenderZoom] = React.useState(1);
  React.useEffect(() => {
    if (!studioMode) {
      setStudioPreviewRenderZoom(1);
      return;
    }
    const nextZoom = studioViewport.zoom;
    const timer = window.setTimeout(() => {
      setStudioPreviewRenderZoom((current) => (
        Math.abs(current - nextZoom) < 0.001 ? current : nextZoom
      ));
    }, 140);
    return () => window.clearTimeout(timer);
  }, [studioMode, studioViewport.zoom]);
  const previewDisplaySize = React.useMemo(() => resolveUmbraCanvasPreviewDisplaySize(
    canvasSize.width,
    canvasSize.height,
    displayWidth,
    displayHeight,
    studioMode ? studioPreviewRenderZoom : null,
  ), [
    canvasSize.height,
    canvasSize.width,
    displayHeight,
    displayWidth,
    studioMode,
    studioPreviewRenderZoom,
  ]);
  const interactivePreviewRaster = React.useMemo(() => resolveUmbraCanvasPreviewRaster(
    canvasSize.width,
    canvasSize.height,
    previewDisplaySize.width,
    previewDisplaySize.height,
    typeof window === 'undefined' ? 1 : window.devicePixelRatio,
  ), [canvasSize.height, canvasSize.width, previewDisplaySize.height, previewDisplaySize.width]);
  const studioPreviewAssets = React.useMemo(() => {
    const previews = new Map<string, { imageUrl: string; updatedAt: number }>();
    for (const asset of canvasStudio.project?.shelf || []) {
      const imageUrl = studioPreviewRenderZoom >= 0.5
        ? asset.imageUrl || asset.thumbnailUrl
        : asset.thumbnailUrl || asset.imageUrl;
      if (!asset.artboardId || !imageUrl) continue;
      const current = previews.get(asset.artboardId);
      if (!current || asset.updatedAt >= current.updatedAt) previews.set(asset.artboardId, { imageUrl, updatedAt: asset.updatedAt });
    }
    return previews;
  }, [canvasStudio.project?.shelf, studioPreviewRenderZoom]);
  const studioArtboardPosition = React.useCallback((artboard: UmbraCanvasStudioArtboard) => (
    studioArtboardPreview?.id === artboard.id
      ? { x: studioArtboardPreview.x, y: studioArtboardPreview.y }
      : { x: artboard.x, y: artboard.y }
  ), [studioArtboardPreview]);
  const studioActiveArtboardPosition = canvasStudio.activeArtboard
    ? studioArtboardPosition(canvasStudio.activeArtboard)
    : { x: 0, y: 0 };

  const fitStudioView = React.useCallback(() => {
    const viewport = viewportRef.current;
    const project = canvasStudio.project;
    if (!viewport || !project) return;
    const fitted = fitUmbraCanvasStudioArtboards(project.artboards, {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    });
    if (!fitted) return;
    setStudioViewportPreview(null);
    canvasStudio.updateViewport(fitted);
  }, [canvasStudio.project, canvasStudio.updateViewport]);

  const zoomStudioView = React.useCallback((factor: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !canvasStudio.project) return;
    const next = zoomUmbraCanvasStudioAtPoint(
      { ...canvasStudio.project.viewport, ...studioViewport },
      studioViewport.zoom * factor,
      { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 },
    );
    setStudioViewportPreview(null);
    canvasStudio.updateViewport(next);
  }, [canvasStudio.project, canvasStudio.updateViewport, studioViewport]);

  const resetStudioView = React.useCallback(() => {
    setStudioViewportPreview(null);
    canvasStudio.updateViewport({ zoom: 1, panX: 48, panY: 48 });
  }, [canvasStudio.updateViewport]);

  React.useEffect(() => {
    if (!studioMode) return;
    const setSpaceState = (event: KeyboardEvent, pressed: boolean) => {
      if (event.code !== 'Space') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      studioSpacePressedRef.current = pressed;
      if (pressed) event.preventDefault();
    };
    const keyDown = (event: KeyboardEvent) => setSpaceState(event, true);
    const keyUp = (event: KeyboardEvent) => setSpaceState(event, false);
    const blur = () => { studioSpacePressedRef.current = false; };
    window.addEventListener('keydown', keyDown);
    window.addEventListener('keyup', keyUp);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', keyDown);
      window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', blur);
      studioSpacePressedRef.current = false;
    };
  }, [studioMode]);

  React.useEffect(() => {
    const project = canvasStudio.project;
    if (!studioMode || !project || viewportSize.width <= 1 || viewportSize.height <= 1) return;
    if (studioInitialFitProjectRef.current === project.id) return;
    studioInitialFitProjectRef.current = project.id;
    if (project.viewport.zoom !== 1 || project.viewport.panX !== 0 || project.viewport.panY !== 0) return;
    const fitted = fitUmbraCanvasStudioArtboards(project.artboards, viewportSize);
    if (fitted) canvasStudio.updateViewport(fitted);
  }, [canvasStudio.project, canvasStudio.updateViewport, studioMode, viewportSize]);

  const applyStudioRegion = React.useCallback((region: UmbraCanvasStudioRegion) => {
    if (!canvasDocument) return;
    const generation = {
      ...canvasDocument.generation,
      ...region.generation,
      promptSegments: region.promptSegments.map((segment) => ({ ...segment })),
      activePromptSegmentId: region.activePromptSegmentId,
      negativePrompt: region.negativePrompt,
    } as UmbraCanvasGenerationSettings;
    dispatchCanvasDocument({ type: 'set_generation_region', region: region.rect });
    dispatchCanvasDocument({ type: 'set_operation_mode', mode: region.mode === 'extend' ? 'outpaint' : 'inpaint' });
    dispatchCanvasDocument({ type: 'set_generation_settings', generation });
    if (region.targetLayerId && canvasDocument.layers.some((layer) => layer.id === region.targetLayerId)) {
      dispatchCanvasDocument({ type: 'select_layer', layerId: region.targetLayerId });
    }
    applyProjectGenerationSettings(generation);
    const maskedLayerOutput = region.outputMode === 'cutout' || region.mode === 'standalone';
    setOutputOnlyMaskedRegions(maskedLayerOutput);
    setSemanticCutout(region.outputMode === 'cutout' && semanticCutoutAvailable);
    if (region.mode === 'standalone') {
      setDenoise(1);
      setFillMode('neutral');
    }
    if (region.mode === 'blend') setSoftInpaintEnabled(true);
  }, [applyProjectGenerationSettings, canvasDocument, semanticCutoutAvailable]);

  React.useEffect(() => {
    if (!studioMode || !canvasDocument || !canvasStudio.activeRegion) return;
    const regionId = canvasStudio.activeRegion.id;
    const snapshot = canvasDocument;
    const timer = window.setTimeout(() => {
      canvasStudio.updateRegion(regionId, {
        rect: snapshot.generationRegion || { x: 0, y: 0, width: snapshot.width, height: snapshot.height },
        targetLayerId: snapshot.activeLayerId,
        promptSegments: snapshot.generation.promptSegments.map((segment) => ({ ...segment })),
        activePromptSegmentId: snapshot.generation.activePromptSegmentId,
        negativePrompt: snapshot.generation.negativePrompt,
        generation: structuredClone(snapshot.generation) as unknown as Record<string, unknown>,
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [canvasDocument?.revision, canvasStudio.activeRegion?.id, canvasStudio.updateRegion, studioMode]);

  React.useEffect(() => {
    if (projectRestoreAttemptedRef.current || canvasDocument) return;
    projectRestoreAttemptedRef.current = true;

    const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: unknown };
    const directHandoff = normalizeUmbraUiMediaHandoff(target.__umbraPendingUmbraUiMediaHandoff);
    let storedHandoff = null;
    try {
      storedHandoff = normalizeUmbraUiMediaHandoff(JSON.parse(window.sessionStorage.getItem('umbra-ui:pending-media-handoff') || 'null'));
    } catch { /* best effort */ }
    if ((directHandoff || storedHandoff)?.mode === 'inpaint') return;

    let projectId = '';
    try { projectId = window.localStorage.getItem(ACTIVE_CANVAS_PROJECT_KEY) || ''; } catch { /* best effort */ }
    if (!projectId) return;
    void openProject(projectId, true).then((opened) => {
      if (opened) return;
      try {
        if (window.localStorage.getItem(ACTIVE_CANVAS_PROJECT_KEY) === projectId) {
          window.localStorage.removeItem(ACTIVE_CANVAS_PROJECT_KEY);
        }
      } catch { /* best effort */ }
    });
  }, [canvasDocument, openProject]);

  const saveProjectAs = React.useCallback(async () => {
    if (!canvasDocument) return;
    const name = saveAsName.trim();
    if (!name) {
      showToast('Enter a name for the new canvas project.', 'error');
      return;
    }
    const fork = forkUmbraCanvasDocument(canvasDocument, name);
    dispatchCanvasHistory({ type: 'history_reset', document: fork });
    setProjectSaveState('saving');
    const saved = await persistProject(fork, true);
    if (saved) dispatchCanvasHistory({ type: 'history_reset', document: saved });
  }, [canvasDocument, persistProject, saveAsName, showToast]);

  const deleteCurrentProject = React.useCallback(async () => {
    if (!canvasDocument) return;
    if (!window.confirm(`Delete the canvas project "${canvasDocument.name}" and its saved assets?`)) return;
    try {
      clearScheduledProjectAutoSave();
      projectAutoSaveSnapshotRef.current = null;
      projectSaveRequestRef.current += 1;
      await deleteUmbraCanvasProject(canvasDocument.id);
      releaseMaskSnapshotUrls();
      for (const assetUrl of layerAssetObjectUrlsRef.current) URL.revokeObjectURL(assetUrl);
      layerAssetObjectUrlsRef.current.clear();
      if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
      sourceObjectUrlRef.current = '';
      setSource(null);
      setCanvasSize({ width: 1024, height: 1024 });
      setDraftMargins(EMPTY_MARGINS);
      setAppliedMargins(EMPTY_MARGINS);
      setJob(null);
      dispatchCanvasHistory({ type: 'history_reset' });
      setProjects((current) => current.filter((project) => project.id !== canvasDocument.id));
      try {
        if (window.localStorage.getItem(ACTIVE_CANVAS_PROJECT_KEY) === canvasDocument.id) {
          window.localStorage.removeItem(ACTIVE_CANVAS_PROJECT_KEY);
        }
      } catch { /* best effort */ }
      showToast('Canvas project deleted.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete the canvas project.', 'error');
    }
  }, [canvasDocument, clearScheduledProjectAutoSave, releaseMaskSnapshotUrls, showToast]);

  React.useEffect(() => () => {
    if (sourceObjectUrlRef.current) URL.revokeObjectURL(sourceObjectUrlRef.current);
  }, []);

  const syncViewportMetrics = React.useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setViewportSize({ width: viewport.clientWidth, height: viewport.clientHeight });
    setViewportMetrics({
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      scrollWidth: Math.max(1, viewport.scrollWidth),
      scrollHeight: Math.max(1, viewport.scrollHeight),
    });
  }, []);

  React.useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    syncViewportMetrics();
    const observer = new ResizeObserver(syncViewportMetrics);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [syncViewportMetrics]);

  React.useLayoutEffect(() => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const pendingMaskRestore = pendingMaskRestoreRef.current;
    const shouldCommitMaskRestore = pendingMaskRestoreCommitRef.current;
    pendingMaskRestoreRef.current = '';
    pendingMaskRestoreCommitRef.current = true;
    if (pendingMaskRestore) {
      void loadHtmlImage(pendingMaskRestore).then((image) => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        if (shouldCommitMaskRestore) resetMaskHistory();
      }).catch(() => {
        if (shouldCommitMaskRestore) resetMaskHistory();
      });
      return;
    }
    paintOutpaintMargins(context, appliedMargins);
    if (shouldCommitMaskRestore) resetMaskHistory();
  }, [appliedMargins, canvasSize.height, canvasSize.width, maskResetRevision, paintOutpaintMargins, resetMaskHistory]);

  React.useLayoutEffect(() => {
    const canvas = paintCanvasRef.current;
    if (!canvas) return;
    canvas.width = rasterEditingActive ? paintBufferBounds.width : 1;
    canvas.height = rasterEditingActive ? paintBufferBounds.height : 1;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }, [paintBufferBounds.height, paintBufferBounds.width, rasterEditingActive]);

  React.useLayoutEffect(() => {
    const canvas = imageCanvasRef.current;
    if (!canvas || !displayDocument) return;
    setCanvasReady(false);
    const generation = ++canvasRenderGenerationRef.current;
    canvasRenderQueueRef.current = canvasRenderQueueRef.current.catch(() => undefined).then(async () => {
      if (generation !== canvasRenderGenerationRef.current || imageCanvasRef.current !== canvas) return;
      const rendered = await renderCanvasDocument(canvas, displayDocument, previewStage, transparentDisplay, null, {
        shouldAbort: () => generation !== canvasRenderGenerationRef.current || imageCanvasRef.current !== canvas,
        yieldEveryLayers: 8,
        outputScale: interactivePreviewRaster.scale,
      });
      if (!rendered || generation !== canvasRenderGenerationRef.current || imageCanvasRef.current !== canvas) return;
      const minimap = minimapCanvasRef.current;
      if (minimap) {
        const scale = Math.min(144 / Math.max(1, canvas.width), 96 / Math.max(1, canvas.height));
        minimap.width = Math.max(1, Math.round(canvas.width * scale));
        minimap.height = Math.max(1, Math.round(canvas.height * scale));
        minimap.getContext('2d')?.drawImage(canvas, 0, 0, minimap.width, minimap.height);
      }
      setCanvasReady(true);
      window.requestAnimationFrame(syncViewportMetrics);
    }).catch(() => {
      if (generation === canvasRenderGenerationRef.current) setCanvasReady(false);
    });
    return () => {
      if (generation === canvasRenderGenerationRef.current) canvasRenderGenerationRef.current += 1;
    };
  }, [displayDocument, interactivePreviewRaster.scale, previewStage, syncViewportMetrics, transparentDisplay]);

  React.useLayoutEffect(() => {
    const canvas = guidanceCanvasRef.current;
    const documentState = latestDocumentRef.current;
    if (!canvas || !documentState) return;
    const generation = ++guidanceRenderGenerationRef.current;
    if (guidanceOverlayKey === 'hidden') {
      canvas.width = 1;
      canvas.height = 1;
      return;
    }
    const buffer = document.createElement('canvas');
    void renderCanvasGuidanceOverlays(buffer, documentState, guidanceOverlayMaskId, guidanceOverlayVisibility).then(() => {
      if (generation !== guidanceRenderGenerationRef.current || guidanceCanvasRef.current !== canvas) return;
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      canvas.getContext('2d')?.drawImage(buffer, 0, 0);
    }).catch(() => {
      if (generation === guidanceRenderGenerationRef.current) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    });
    return () => {
      if (generation === guidanceRenderGenerationRef.current) guidanceRenderGenerationRef.current += 1;
    };
  }, [guidanceOverlayKey, guidanceOverlayMaskId, guidanceOverlayVisibility]);

  React.useEffect(() => {
    const frame = window.requestAnimationFrame(syncViewportMetrics);
    return () => window.cancelAnimationFrame(frame);
  }, [displayHeight, displayWidth, syncViewportMetrics]);

  const consumeHandoff = React.useCallback((handoff: UmbraUiInpaintHandoff) => {
    const handoffKey = [
      handoff.createdAt,
      handoff.path || handoff.imageUrl,
      handoff.canvasProjectId || '',
    ].join(':');
    if (consumedMediaHandoffKeysRef.current.has(handoffKey)) return;
    consumedMediaHandoffKeysRef.current.add(handoffKey);
    if (consumedMediaHandoffKeysRef.current.size > 32) {
      const oldest = consumedMediaHandoffKeysRef.current.values().next().value;
      if (oldest) consumedMediaHandoffKeysRef.current.delete(oldest);
    }
    void (async () => {
      if (handoff.canvasProjectId && await openProject(handoff.canvasProjectId, true)) {
        showToast(`Editable ${handoff.canvasOperationMode || 'inpaint'} project restored.`, 'success');
        return;
      }
      await loadSource(
        handoff.imageUrl,
        handoff.name || handoff.path?.replace(/\\/g, '/').split('/').pop() || 'generated-image.png',
        handoff.source === 'local-file' ? '' : handoff.path || '',
        handoff.imageUrl.startsWith('blob:'),
        handoff.source === 'local-file' ? '' : handoff.originalSourcePath || handoff.path || '',
      );
      dispatchCanvasDocument({ type: 'set_operation_mode', mode: 'inpaint' });
      applyRecoveredInpaintSettings(handoff.generation);
      const omittedLayerCount = handoff.generation?.inpaint
        ? handoff.generation.inpaint.regionalGuidanceCount
          + handoff.generation.inpaint.controlLayerCount
          + handoff.generation.inpaint.referenceLayerCount
        : 0;
      showToast(
        handoff.canvasProjectId
          ? omittedLayerCount > 0
            ? `The linked project was unavailable. Recoverable settings were restored; ${omittedLayerCount} guidance layer${omittedLayerCount === 1 ? '' : 's'} require the original project assets.`
            : 'The linked project was unavailable, so the image opened as a new canvas with its recoverable settings.'
          : 'Image opened in Inpaint.',
        'success',
      );
    })().catch((error) => showToast(error instanceof Error ? error.message : 'Failed to open the image.', 'error'));
  }, [applyRecoveredInpaintSettings, dispatchCanvasDocument, loadSource, openProject, showToast]);

  React.useEffect(() => {
    const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: unknown };
    const direct = parsePendingHandoff(target.__umbraPendingUmbraUiMediaHandoff);
    let stored: UmbraUiInpaintHandoff | null = null;
    try { stored = parsePendingHandoff(JSON.parse(window.sessionStorage.getItem('umbra-ui:pending-media-handoff') || 'null')); } catch { /* ignore */ }
    const pending = direct || stored;
    if (pending) {
      consumeHandoff(pending);
    }
    const onHandoff = (event: Event) => {
      const handoff = parsePendingHandoff((event as CustomEvent).detail);
      if (handoff) consumeHandoff(handoff);
    };
    window.addEventListener('umbra:umbra-ui-media-handoff', onHandoff);
    return () => window.removeEventListener('umbra:umbra-ui-media-handoff', onHandoff);
  }, [consumeHandoff]);

  React.useEffect(() => {
    const pending = selectUmbraUiInpaintRecoveryTarget(canvasDocument?.pendingJobs || [], job);
    if (!pending) return;
    const controller = new AbortController();
    let retryTimer = 0;
    let attempts = 0;
    let warned = false;
    jobStageContextsRef.current.set(pending.id, { region: pending.region, maskDataUrl: pending.maskDataUrl });
    const recoverPendingJob = async () => {
      attempts += 1;
      try {
        const restoredJob = await fetchUmbraUiInpaintJob(pending.id, controller.signal);
        terminalNoticeRef.current = '';
        setJob(restoredJob);
      } catch (error) {
        const disposition = classifyUmbraUiInpaintRecoveryError(error);
        if (disposition === 'aborted') return;
        if (disposition === 'missing') {
          dispatchCanvasDocument({ type: 'remove_pending_job', jobId: pending.id });
          jobStageContextsRef.current.delete(pending.id);
          showToast('The backend no longer has this pending inpaint job. Its project pointer was cleared.', 'error');
          return;
        }
        if (attempts >= 3 && !warned) {
          warned = true;
          showToast('Inpaint recovery is waiting for the backend. The project recovery pointer was preserved.', 'error');
        }
        retryTimer = window.setTimeout(() => void recoverPendingJob(), getUmbraUiInpaintRecoveryRetryDelay(attempts));
      }
    };
    void recoverPendingJob();
    return () => {
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [canvasDocument?.pendingJobs, dispatchCanvasDocument, job, showToast]);

  React.useEffect(() => {
    if (!job || isUmbraUiInpaintJobTerminal(job)) return;
    const controller = new AbortController();
    const jobId = job.id;
    let retryTimer = 0;
    let warned = false;
    const pollJob = async () => {
      try {
        const nextJob = await fetchUmbraUiInpaintJob(jobId, controller.signal);
        setJob((current) => reconcileUmbraUiInpaintJobSnapshot(current, nextJob));
        if (!controller.signal.aborted && !isUmbraUiInpaintJobTerminal(nextJob)) {
          retryTimer = window.setTimeout(() => void pollJob(), 900);
        }
      } catch (error) {
        const disposition = classifyUmbraUiInpaintRecoveryError(error);
        if (disposition === 'aborted') return;
        if (disposition === 'missing') {
          setJob((current) => current?.id === jobId
            ? failLostUmbraUiInpaintJob(current, 'The backend inpaint job disappeared before it reached a terminal state.')
            : current);
          return;
        }
        if (!warned) {
          warned = true;
          showToast('Inpaint status updates are reconnecting; the job and project pointer were preserved.', 'error');
        }
        retryTimer = window.setTimeout(() => void pollJob(), 2500);
      }
    };
    retryTimer = window.setTimeout(() => void pollJob(), 900);
    return () => {
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [job?.id, job?.status, showToast]);

  React.useEffect(() => {
    if (!job) return;
    const context = jobStageContextsRef.current.get(job.id);
    const nextStages = context ? buildUmbraUiInpaintOutputStages(job, context) : [];
    const terminal = isUmbraUiInpaintJobTerminal(job);
    const materializationIssue = getUmbraUiInpaintTerminalMaterializationIssue(job);
    const terminalTransition = resolveUmbraUiInpaintTerminalTransition(job, canvasDocument?.pendingJobs || []);
    if (nextStages.length > 0) {
      const shouldPreview = shouldAutoPreviewUmbraCanvasStage(
        canvasPreferences.stagingAutoSwitch,
        autoSelectJobRef.current === job.id,
        terminal,
      );
      dispatchCanvasDocument({
        type: 'stage_outputs',
        stages: nextStages,
        previewStageId: shouldPreview ? nextStages[0].id : undefined,
      });
      if (autoSelectJobRef.current === job.id && (shouldPreview || terminal)) {
        autoSelectJobRef.current = '';
      }
    }
    if (terminal && autoSelectJobRef.current === job.id) autoSelectJobRef.current = '';
    if (terminal && materializationIssue && terminalNoticeRef.current !== `${job.id}:materialization`) {
      terminalNoticeRef.current = `${job.id}:materialization`;
      showToast(`${materializationIssue} The project recovery pointer was preserved.`, 'error');
    }
    if (terminalTransition && terminalNoticeRef.current !== job.id) {
      terminalNoticeRef.current = job.id;
      dispatchCanvasDocument({ type: 'remove_pending_job', jobId: terminalTransition.removePendingJobId });
      jobStageContextsRef.current.delete(job.id);
      if (job.status === 'canceled') showToast('Inpaint job canceled.', 'success');
      else if (job.completed > 0 && job.failed > 0) showToast(`${job.completed} inpaint samples completed; ${job.failed} failed.`, 'error');
      else if (job.completed > 0) showToast(`${job.completed} inpaint sample${job.completed === 1 ? '' : 's'} completed.`, 'success');
      else showToast(job.items.find((item) => item.error)?.error || 'The inpaint job failed.', 'error');
      if (terminalTransition.shouldClearActiveJob) setJob(null);
    }
  }, [canvasDocument?.pendingJobs, canvasPreferences.stagingAutoSwitch, dispatchCanvasDocument, job, showToast]);

  const clientToCanvasPoint = React.useCallback((clientX: number, clientY: number): Point => {
    const canvas = maskCanvasRef.current;
    const bounds = canvas?.getBoundingClientRect();
    if (!canvas || !bounds) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(canvas.width, (clientX - bounds.left) * (canvas.width / Math.max(1, bounds.width)))),
      y: Math.max(0, Math.min(canvas.height, (clientY - bounds.top) * (canvas.height / Math.max(1, bounds.height)))),
    };
  }, []);

  const pointerPoint = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>): Point => (
    clientToCanvasPoint(event.clientX, event.clientY)
  ), [clientToCanvasPoint]);

  const beginViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (tool !== 'pan' || event.button !== 0) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    event.stopPropagation();
    viewport.setPointerCapture(event.pointerId);
    viewportPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
  }, [tool]);

  const moveViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = viewportPanRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    viewport.scrollLeft = pan.scrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.scrollTop - (event.clientY - pan.startY);
    syncViewportMetrics();
  }, [syncViewportMetrics]);

  const finishViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = viewportPanRef.current;
    const viewport = viewportRef.current;
    if (!pan || !viewport || pan.pointerId !== event.pointerId) return;
    viewportPanRef.current = null;
    try { viewport.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    syncViewportMetrics();
  }, [syncViewportMetrics]);

  const beginStudioViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof Element ? event.target : null;
    const overArtboard = !!target?.closest('[data-umbra-studio-artboard]');
    const overArtboardHandle = !!target?.closest('[data-umbra-studio-artboard-handle]');
    const primaryPan = event.button === 0
      && !overArtboardHandle
      && (tool === 'pan' || studioSpacePressedRef.current || (!overArtboard && tool !== 'region'));
    if (event.button !== 1 && !primaryPan) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    studioViewportPanRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: studioViewport.panX,
      panY: studioViewport.panY,
    };
    setStudioViewportPreview({ panX: studioViewport.panX, panY: studioViewport.panY });
  }, [studioViewport.panX, studioViewport.panY, tool]);

  const moveStudioViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = studioViewportPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    setStudioViewportPreview({
      panX: pan.panX + event.clientX - pan.startX,
      panY: pan.panY + event.clientY - pan.startY,
    });
  }, []);

  const finishStudioViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = studioViewportPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const next = {
      panX: pan.panX + event.clientX - pan.startX,
      panY: pan.panY + event.clientY - pan.startY,
    };
    studioViewportPanRef.current = null;
    setStudioViewportPreview(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    canvasStudio.updateViewport(next);
  }, [canvasStudio.updateViewport]);

  const cancelStudioViewportPan = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pan = studioViewportPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    event.preventDefault();
    studioViewportPanRef.current = null;
    setStudioViewportPreview(null);
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
  }, []);

  const clientToStudioWorldPoint = React.useCallback((clientX: number, clientY: number): Point => {
    const viewport = viewportRef.current;
    const bounds = viewport?.getBoundingClientRect();
    if (!viewport || !bounds) return { x: 0, y: 0 };
    return {
      x: (clientX - bounds.left - studioViewport.panX) / Math.max(0.0001, studioViewport.zoom),
      y: (clientY - bounds.top - studioViewport.panY) / Math.max(0.0001, studioViewport.zoom),
    };
  }, [studioViewport.panX, studioViewport.panY, studioViewport.zoom]);

  const currentStudioGenerationRegionWorld = React.useMemo<UmbraCanvasRect | null>(() => (
    canvasDocument?.generationRegion
      ? {
          ...canvasDocument.generationRegion,
          x: studioActiveArtboardPosition.x + canvasDocument.generationRegion.x,
          y: studioActiveArtboardPosition.y + canvasDocument.generationRegion.y,
        }
      : null
  ), [
    canvasDocument?.generationRegion,
    studioActiveArtboardPosition.x,
    studioActiveArtboardPosition.y,
  ]);

  const renderStudioCompositeRegion = React.useCallback(async (
    targetRegion: UmbraCanvasRect,
    documentOverrides: ReadonlyMap<string, UmbraCanvasDocument> = new Map(),
    options: {
      transparent?: boolean;
      simpleLayersOnly?: boolean;
      artboardIds?: ReadonlySet<string>;
    } = {},
  ): Promise<{ canvas: HTMLCanvasElement; artboardCount: number }> => {
    const project = canvasStudio.project;
    if (!project) throw new Error('The Canvas Studio project is unavailable.');
    const width = Math.max(1, Math.round(targetRegion.width));
    const height = Math.max(1, Math.round(targetRegion.height));
    assertUmbraCanvasInteractiveAllocation(width, height);
    const composite = document.createElement('canvas');
    composite.width = width;
    composite.height = height;
    const context = composite.getContext('2d');
    if (!context) throw new Error('The Canvas Studio generation context could not be prepared.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';

    const positionedArtboards = project.artboards
      .filter((artboard) => !options.artboardIds || options.artboardIds.has(artboard.id))
      .map((artboard) => ({
        ...artboard,
        ...studioArtboardPosition(artboard),
      }));
    const slices = resolveUmbraCanvasStudioCompositeSlices(targetRegion, positionedArtboards);
    const loadedDocuments = new Map(documentOverrides);
    for (const slice of slices) {
      let candidateDocument = loadedDocuments.get(slice.artboard.documentId);
      if (!candidateDocument) {
        candidateDocument = await loadUmbraCanvasProject(slice.artboard.documentId);
        loadedDocuments.set(slice.artboard.documentId, candidateDocument);
      }
      const renderDocument = options.simpleLayersOnly
        ? { ...candidateDocument, layers: candidateDocument.layers.filter(isSimpleInpaintLayer) }
        : candidateDocument;
      const scaleX = renderDocument.width / Math.max(1, slice.artboard.width);
      const scaleY = renderDocument.height / Math.max(1, slice.artboard.height);
      const sourceRegion = {
        x: slice.artboardSource.x * scaleX,
        y: slice.artboardSource.y * scaleY,
        width: slice.artboardSource.width * scaleX,
        height: slice.artboardSource.height * scaleY,
      };
      const rendered = document.createElement('canvas');
      const completed = await renderCanvasDocument(rendered, renderDocument, null, true, sourceRegion);
      if (!completed) throw new Error(`The context canvas ${slice.artboard.name} could not be rendered.`);
      context.drawImage(
        rendered,
        0,
        0,
        rendered.width,
        rendered.height,
        slice.destination.x,
        slice.destination.y,
        slice.destination.width,
        slice.destination.height,
      );
    }

    if (!options.transparent) {
      context.save();
      context.globalCompositeOperation = 'destination-over';
      context.fillStyle = '#000000';
      context.fillRect(0, 0, width, height);
      context.restore();
    }
    return { canvas: composite, artboardCount: slices.length };
  }, [canvasStudio.project, studioArtboardPosition]);

  const studioOverlapArtboards = React.useMemo(() => {
    const project = canvasStudio.project;
    const active = canvasStudio.activeArtboard;
    if (!project || !active || !active.visible) return [];
    const positioned = project.artboards.map((artboard) => ({
      ...artboard,
      ...studioArtboardPosition(artboard),
    }));
    const activePosition = studioArtboardPosition(active);
    return resolveUmbraCanvasStudioCompositeSlices({
      ...activePosition,
      width: active.width,
      height: active.height,
    }, positioned).map((slice) => slice.artboard);
  }, [canvasStudio.activeArtboard, canvasStudio.project, studioArtboardPosition]);

  const createStudioGenerationArtboard = React.useCallback(async (
    worldRegion: UmbraCanvasRect,
    sourceDocument: UmbraCanvasDocument,
    aspectRatioOverride?: number,
  ): Promise<boolean> => {
    const project = canvasStudio.project;
    if (!project) return false;
    const targetRegion = alignUnboundedCanvasRectToPipeline(
      worldRegion,
      capabilities.resolution,
      aspectRatioOverride ?? 0,
    );
    const width = Math.max(1, Math.round(targetRegion.width));
    const height = Math.max(1, Math.round(targetRegion.height));
    try {
      const { canvas: contextCanvas, artboardCount: overlapCount } = await renderStudioCompositeRegion(
        targetRegion,
        new Map([[sourceDocument.id, sourceDocument]]),
        { transparent: true },
      );

      const canvasNumber = project.artboards.length + 1;
      const canvasName = `Generation Canvas ${canvasNumber}`;
      const [sourceBlob, maskBlob] = await Promise.all([
        canvasToBlob(contextCanvas),
        (async () => {
          const maskCanvas = document.createElement('canvas');
          maskCanvas.width = width;
          maskCanvas.height = height;
          const maskContext = maskCanvas.getContext('2d');
          if (!maskContext) throw new Error('The generation canvas mask could not be prepared.');
          maskContext.fillStyle = '#ff304c';
          maskContext.fillRect(0, 0, width, height);
          return canvasToBlob(maskCanvas);
        })(),
      ]);
      const sourceUrl = URL.createObjectURL(sourceBlob);
      const maskUrl = URL.createObjectURL(maskBlob);
      try {
        const sourceAsset = createUmbraCanvasImageAsset({
          id: createLocalId('generation-canvas-source'),
          name: `${canvasName}.png`,
          path: '',
          imageUrl: sourceUrl,
          width,
          height,
          objectUrl: true,
        });
        let nextDocument = createUmbraCanvasDocument(sourceAsset, canvasName);
        nextDocument = umbraCanvasDocumentReducer(nextDocument, {
          type: 'set_generation_settings',
          generation: structuredClone(sourceDocument.generation),
        }) as UmbraCanvasDocument;
        nextDocument = umbraCanvasDocumentReducer(nextDocument, {
          type: 'set_generation_region_aspect_ratio',
          ratio: aspectRatioOverride ?? 0,
        }) as UmbraCanvasDocument;
        nextDocument = umbraCanvasDocumentReducer(nextDocument, {
          type: 'set_generation_region',
          region: { x: 0, y: 0, width, height },
        }) as UmbraCanvasDocument;
        nextDocument = umbraCanvasDocumentReducer(nextDocument, {
          type: 'set_mask_snapshot',
          dataUrl: maskUrl,
        }) as UmbraCanvasDocument;
        const highestZIndex = project.artboards.reduce((highest, candidate) => Math.max(highest, candidate.zIndex), -1);
        const artboard = await canvasStudio.attachDocumentToProject(project.id, nextDocument, {
          x: targetRegion.x,
          y: targetRegion.y,
          zIndex: highestZIndex + 1,
          name: canvasName,
        });
        if (!artboard) throw new Error('The independent generation canvas could not be added to this Studio project.');
        if (!await openProject(artboard.documentId, true)) {
          throw new Error('The independent generation canvas was saved but could not be opened.');
        }
        setLastBox({ x: 0, y: 0, width, height });
        showToast(
          overlapCount > 0
            ? `Created ${canvasName} with context from ${overlapCount} overlapping canvas${overlapCount === 1 ? '' : 'es'}.`
            : `Created independent ${canvasName}.`,
          'success',
        );
        return true;
      } finally {
        URL.revokeObjectURL(sourceUrl);
        URL.revokeObjectURL(maskUrl);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The independent generation canvas could not be created.', 'error');
      return false;
    }
  }, [canvasStudio, capabilities.resolution, openProject, renderStudioCompositeRegion, showToast]);

  const commitStudioGenerationRegion = React.useCallback(async (
    worldRegion: UmbraCanvasRect,
    documentBefore: UmbraCanvasDocument,
    aspectRatioOverride?: number,
  ) => {
    const documentState = latestDocumentRef.current;
    const artboard = canvasStudio.activeArtboard;
    if (!documentState || !artboard || artboard.documentId !== documentState.id) return;
    const artboardPosition = studioArtboardPosition(artboard);
    const requestedRegion = alignUnboundedCanvasRectToPipeline({
      ...worldRegion,
      x: worldRegion.x - artboardPosition.x,
      y: worldRegion.y - artboardPosition.y,
    }, capabilities.resolution, aspectRatioOverride ?? documentState.generationRegionAspectRatio);
    const extendsOutsideActiveArtboard = requestedRegion.x < 0
      || requestedRegion.y < 0
      || requestedRegion.x + requestedRegion.width > documentState.width
      || requestedRegion.y + requestedRegion.height > documentState.height;
    if (extendsOutsideActiveArtboard) {
      await createStudioGenerationArtboard({
        ...requestedRegion,
        x: artboardPosition.x + requestedRegion.x,
        y: artboardPosition.y + requestedRegion.y,
      }, documentState, aspectRatioOverride);
      return;
    }
    if (aspectRatioOverride === undefined) {
      dispatchCanvasDocument({ type: 'set_generation_region', region: requestedRegion });
    } else {
      dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region_aspect_ratio', ratio: aspectRatioOverride } });
      dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region', region: requestedRegion } });
      dispatchCanvasHistory({ type: 'history_commit_snapshot', before: documentBefore });
    }
    setLastBox(requestedRegion);
  }, [
    canvasStudio.activeArtboard,
    capabilities.resolution,
    createStudioGenerationArtboard,
    dispatchCanvasDocument,
    studioArtboardPosition,
  ]);

  const applyGenerationRegionAspectPreset = React.useCallback((ratioInput: number) => {
    const documentState = latestDocumentRef.current;
    if (!documentState) return;
    const ratio = Math.max(0, Math.min(32, Number(ratioInput) || 0));
    if (ratio <= 0) {
      dispatchCanvasDocument({ type: 'set_generation_region_aspect_ratio', ratio: 0 });
      return;
    }

    const preset = REGION_ASPECT_RATIO_OPTIONS.find((option) => Math.abs(option.ratio - ratio) < 0.0001);
    if (!preset || preset.widthUnits <= 0 || preset.heightUnits <= 0) return;
    const dimensions = resolveGenerationRegionPresetDimensions(preset.widthUnits, preset.heightUnits, capabilities.resolution);
    const artboard = canvasStudio.activeArtboard;
    const existingWorldRegion = studioMode && artboard
      ? (documentState.generationRegion ? {
          ...documentState.generationRegion,
          x: studioArtboardPosition(artboard).x + documentState.generationRegion.x,
          y: studioArtboardPosition(artboard).y + documentState.generationRegion.y,
        } : null)
      : documentState.generationRegion;
    const artboardPosition = artboard ? studioArtboardPosition(artboard) : { x: 0, y: 0 };
    const centerX = existingWorldRegion
      ? existingWorldRegion.x + existingWorldRegion.width / 2
      : artboardPosition.x + documentState.width / 2;
    const centerY = existingWorldRegion
      ? existingWorldRegion.y + existingWorldRegion.height / 2
      : artboardPosition.y + documentState.height / 2;
    const presetRegion = {
      x: snapUmbraCanvasStudioCoordinate(centerX - dimensions.width / 2, UMBRA_CANVAS_STUDIO_SNAP_SIZE, true),
      y: snapUmbraCanvasStudioCoordinate(centerY - dimensions.height / 2, UMBRA_CANVAS_STUDIO_SNAP_SIZE, true),
      width: dimensions.width,
      height: dimensions.height,
    };

    if (studioMode && artboard) {
      void createStudioGenerationArtboard(presetRegion, documentState, ratio);
      return;
    }

    const localRegion = alignCanvasRectToPipeline(presetRegion, documentState.width, documentState.height, capabilities.resolution);
    dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region_aspect_ratio', ratio } });
    dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region', region: localRegion } });
    dispatchCanvasHistory({ type: 'history_commit_snapshot', before: documentState });
    setLastBox(localRegion);
  }, [
    canvasStudio.activeArtboard,
    capabilities.resolution,
    createStudioGenerationArtboard,
    dispatchCanvasDocument,
    studioArtboardPosition,
    studioMode,
  ]);

  const resetManualGenerationRegionResolution = React.useCallback(() => {
    const documentState = latestDocumentRef.current;
    const region = documentState?.generationRegion;
    setManualRegionResolution({
      width: String(Math.round(region?.width || capabilities.resolution.defaultWidth || documentState?.width || 1024)),
      height: String(Math.round(region?.height || capabilities.resolution.defaultHeight || documentState?.height || 1024)),
    });
  }, [capabilities.resolution.defaultHeight, capabilities.resolution.defaultWidth]);

  const applyManualGenerationRegionResolution = React.useCallback(() => {
    const documentState = latestDocumentRef.current;
    if (!documentState) return;
    const requestedWidth = Number(manualRegionResolution.width.trim());
    const requestedHeight = Number(manualRegionResolution.height.trim());
    if (!Number.isFinite(requestedWidth) || requestedWidth <= 0 || !Number.isFinite(requestedHeight) || requestedHeight <= 0) {
      showToast('Enter a positive width and height for the generation region.', 'error');
      return;
    }

    const artboard = canvasStudio.activeArtboard;
    const artboardPosition = artboard ? studioArtboardPosition(artboard) : { x: 0, y: 0 };
    const existingRegion = documentState.generationRegion;
    const centerX = existingRegion
      ? artboardPosition.x + existingRegion.x + existingRegion.width / 2
      : artboardPosition.x + documentState.width / 2;
    const centerY = existingRegion
      ? artboardPosition.y + existingRegion.y + existingRegion.height / 2
      : artboardPosition.y + documentState.height / 2;
    const requestedRegion = alignUnboundedCanvasRectToPipeline({
      x: centerX - requestedWidth / 2,
      y: centerY - requestedHeight / 2,
      width: requestedWidth,
      height: requestedHeight,
    }, capabilities.resolution);

    setManualRegionResolution({
      width: String(requestedRegion.width),
      height: String(requestedRegion.height),
    });
    if (studioMode && artboard) {
      void createStudioGenerationArtboard(requestedRegion, documentState);
      return;
    }

    const localRegion = alignCanvasRectToPipeline(
      requestedRegion,
      documentState.width,
      documentState.height,
      capabilities.resolution,
    );
    dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region_aspect_ratio', ratio: 0 } });
    dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region', region: localRegion } });
    dispatchCanvasHistory({ type: 'history_commit_snapshot', before: documentState });
    setManualRegionResolution({ width: String(localRegion.width), height: String(localRegion.height) });
    setLastBox(localRegion);
  }, [
    canvasStudio.activeArtboard,
    capabilities.resolution,
    createStudioGenerationArtboard,
    manualRegionResolution.height,
    manualRegionResolution.width,
    showToast,
    studioArtboardPosition,
    studioMode,
  ]);

  const beginStudioRegionInteraction = React.useCallback((
    event: React.PointerEvent<HTMLElement>,
    mode: 'draw' | RegionDragMode,
  ) => {
    if (event.button !== 0 || !canvasDocument || !canvasStudio.activeArtboard || studioSpacePressedRef.current) return;
    const start = clientToStudioWorldPoint(event.clientX, event.clientY);
    const initial = mode === 'draw'
      ? { x: start.x, y: start.y, width: 1, height: 1 }
      : currentStudioGenerationRegionWorld;
    if (!initial) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const interaction: StudioRegionInteractionState = {
      pointerId: event.pointerId,
      mode,
      start,
      initial: { ...initial },
      latest: { ...initial },
      documentBefore: canvasDocument,
      captureTarget: event.currentTarget,
    };
    studioRegionInteractionRef.current = interaction;
    setStudioGenerationRegionPreview(interaction.latest);
  }, [canvasDocument, canvasStudio.activeArtboard, clientToStudioWorldPoint, currentStudioGenerationRegionWorld]);

  const moveStudioRegionInteraction = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const interaction = studioRegionInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const point = clientToStudioWorldPoint(event.clientX, event.clientY);
    const snap = (value: number) => snapUmbraCanvasStudioCoordinate(value, UMBRA_CANVAS_STUDIO_SNAP_SIZE, studioViewport.snapEnabled);
    const deltaX = point.x - interaction.start.x;
    const deltaY = point.y - interaction.start.y;
    let next: UmbraCanvasRect;
    if (interaction.mode === 'draw') {
      const current = { x: snap(point.x), y: snap(point.y) };
      const start = { x: snap(interaction.start.x), y: snap(interaction.start.y) };
      next = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.max(1, Math.abs(current.x - start.x)),
        height: Math.max(1, Math.abs(current.y - start.y)),
      };
    } else if (interaction.mode === 'move') {
      next = {
        ...interaction.initial,
        x: snap(interaction.initial.x + deltaX),
        y: snap(interaction.initial.y + deltaY),
      };
    } else {
      const north = interaction.mode.includes('n');
      const west = interaction.mode.includes('w');
      const x = west ? snap(interaction.initial.x + deltaX) : interaction.initial.x;
      const y = north ? snap(interaction.initial.y + deltaY) : interaction.initial.y;
      next = {
        x,
        y,
        width: Math.max(1, snap(interaction.initial.width + (west ? -deltaX : deltaX))),
        height: Math.max(1, snap(interaction.initial.height + (north ? -deltaY : deltaY))),
      };
    }
    interaction.latest = next;
    setStudioGenerationRegionPreview(next);
  }, [clientToStudioWorldPoint, studioViewport.snapEnabled]);

  const finishStudioRegionInteraction = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const interaction = studioRegionInteractionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    try { interaction.captureTarget.releasePointerCapture(interaction.pointerId); } catch { /* pointer already released */ }
    studioRegionInteractionRef.current = null;
    setStudioGenerationRegionPreview(null);
    if (interaction.latest.width < 2 || interaction.latest.height < 2) return;
    if (interaction.mode === 'draw') {
      void createStudioGenerationArtboard(interaction.latest, interaction.documentBefore);
      return;
    }
    const activeArtboard = canvasStudio.activeArtboard;
    if (interaction.mode === 'move' && activeArtboard) {
      const artboardPosition = studioArtboardPosition(activeArtboard);
      const initialCoversArtboard = Math.abs(interaction.initial.x - artboardPosition.x) < 0.5
        && Math.abs(interaction.initial.y - artboardPosition.y) < 0.5
        && Math.abs(interaction.initial.width - interaction.documentBefore.width) < 0.5
        && Math.abs(interaction.initial.height - interaction.documentBefore.height) < 0.5;
      if (initialCoversArtboard) {
        canvasStudio.updateArtboard(activeArtboard.id, {
          x: interaction.latest.x,
          y: interaction.latest.y,
        });
        setLastBox({
          x: 0,
          y: 0,
          width: interaction.documentBefore.width,
          height: interaction.documentBefore.height,
        });
        return;
      }
    }
    void commitStudioGenerationRegion(interaction.latest, interaction.documentBefore);
  }, [
    canvasStudio.activeArtboard,
    canvasStudio.updateArtboard,
    commitStudioGenerationRegion,
    createStudioGenerationArtboard,
    studioArtboardPosition,
  ]);

  const zoomStudioViewFromWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (!canvasStudio.project) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const factor = Math.exp(-event.deltaY * 0.0015);
    const next = zoomUmbraCanvasStudioAtPoint(
      { ...canvasStudio.project.viewport, ...studioViewport },
      clampUmbraCanvasStudioZoom(studioViewport.zoom * factor),
      point,
    );
    setStudioViewportPreview(null);
    canvasStudio.updateViewport(next);
  }, [canvasStudio.project, canvasStudio.updateViewport, studioViewport]);

  const beginStudioArtboardDrag = React.useCallback((event: React.PointerEvent<HTMLElement>, artboard: UmbraCanvasStudioArtboard) => {
    if (event.button !== 0 || artboard.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const position = studioArtboardPosition(artboard);
    studioArtboardDragRef.current = {
      pointerId: event.pointerId,
      artboardId: artboard.id,
      startX: event.clientX,
      startY: event.clientY,
      artboardX: position.x,
      artboardY: position.y,
      artboardWidth: artboard.width,
      artboardHeight: artboard.height,
      latestX: position.x,
      latestY: position.y,
      moved: false,
      captureTarget: event.currentTarget,
    };
    setStudioAlignmentGuides([]);
    setStudioArtboardPreview({ id: artboard.id, x: position.x, y: position.y });
  }, [studioArtboardPosition]);

  const moveStudioArtboardDrag = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = studioArtboardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const rawX = drag.artboardX + (event.clientX - drag.startX) / studioViewport.zoom;
    const rawY = drag.artboardY + (event.clientY - drag.startY) / studioViewport.zoom;
    const snapped = resolveUmbraCanvasStudioArtboardSnap({
      id: drag.artboardId,
      x: rawX,
      y: rawY,
      width: drag.artboardWidth,
      height: drag.artboardHeight,
    }, canvasStudio.project?.artboards || [], {
      enabled: studioViewport.snapEnabled,
      gridSize: studioViewport.snapSize,
      tolerance: UMBRA_CANVAS_STUDIO_ALIGNMENT_SNAP_PX / Math.max(0.05, studioViewport.zoom),
    });
    drag.latestX = snapped.x;
    drag.latestY = snapped.y;
    drag.moved = drag.moved || Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) >= 3;
    setStudioAlignmentGuides(snapped.guides);
    setStudioArtboardPreview({ id: drag.artboardId, x: drag.latestX, y: drag.latestY });
  }, [canvasStudio.project?.artboards, studioViewport.snapEnabled, studioViewport.snapSize, studioViewport.zoom]);

  const finishStudioArtboardDrag = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = studioArtboardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    studioArtboardDragRef.current = null;
    setStudioArtboardPreview(null);
    setStudioAlignmentGuides([]);
    try { drag.captureTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    if (drag.moved) canvasStudio.updateArtboard(drag.artboardId, { x: drag.latestX, y: drag.latestY });
    else void canvasStudio.selectArtboard(drag.artboardId);
  }, [canvasStudio.selectArtboard, canvasStudio.updateArtboard]);

  const cancelStudioArtboardDrag = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = studioArtboardDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    studioArtboardDragRef.current = null;
    setStudioArtboardPreview(null);
    setStudioAlignmentGuides([]);
    try { drag.captureTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
  }, []);

  const navigateMinimap = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const viewport = viewportRef.current;
    const minimap = minimapCanvasRef.current;
    if (!viewport || !minimap) return;
    const bounds = minimap.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    viewport.scrollLeft = x * viewport.scrollWidth - viewport.clientWidth / 2;
    viewport.scrollTop = y * viewport.scrollHeight - viewport.clientHeight / 2;
    syncViewportMetrics();
  }, [syncViewportMetrics]);

  const zoomToRect = React.useCallback((rect: UmbraCanvasRect) => {
    const viewport = viewportRef.current;
    if (!viewport || rect.width <= 0 || rect.height <= 0) return;
    const targetScale = Math.max(0.04, Math.min(
      (viewport.clientWidth - 72) / rect.width,
      (viewport.clientHeight - 72) / rect.height,
    ));
    setZoom(Math.max(0.25, Math.min(6, targetScale / Math.max(0.0001, fitScale))));
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const frame = imageCanvasRef.current?.parentElement;
      if (!frame) return;
      const viewportBounds = viewport.getBoundingClientRect();
      const frameBounds = frame.getBoundingClientRect();
      const frameLeft = frameBounds.left - viewportBounds.left + viewport.scrollLeft;
      const frameTop = frameBounds.top - viewportBounds.top + viewport.scrollTop;
      const renderedScale = frameBounds.width / Math.max(1, canvasSize.width);
      viewport.scrollLeft = frameLeft + (rect.x + rect.width / 2) * renderedScale - viewport.clientWidth / 2;
      viewport.scrollTop = frameTop + (rect.y + rect.height / 2) * renderedScale - viewport.clientHeight / 2;
      syncViewportMetrics();
    }));
  }, [canvasSize.width, fitScale, syncViewportMetrics]);

  const drawEditStroke = React.useCallback((from: Point, to: Point, pressure = 1) => {
    if (editTarget === 'mask' && maskEditingLocked) return;
    const canvas = editTarget === 'raster' ? paintCanvasRef.current : maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.save();
    if (editTarget === 'raster') context.translate(-paintBufferBounds.x, -paintBufferBounds.y);
    if (canvasPreferences.clipToGenerationRegion && canvasDocument?.generationRegion) {
      const region = canvasDocument.generationRegion;
      context.beginPath();
      context.rect(region.x, region.y, region.width, region.height);
      context.clip();
    }
    context.globalCompositeOperation = editTarget === 'mask' && tool === 'erase' ? 'destination-out' : 'source-over';
    const strokeColor = editTarget === 'raster' ? (tool === 'erase' ? '#fb7185' : paintColor) : '#ff304c';
    context.strokeStyle = strokeColor;
    context.fillStyle = strokeColor;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.globalAlpha = brushOpacity;
    const pressureScale = canvasPreferences.pressureSensitivity ? Math.max(0.15, Math.min(1, pressure || 0.5)) : 1;
    const diameter = (tool === 'erase' ? eraserSize : brushSize) * pressureScale;
    const radius = diameter / 2;
    if (brushHardness >= 0.995) {
      context.lineWidth = diameter;
      context.beginPath();
      context.moveTo(from.x, from.y);
      context.lineTo(to.x, to.y);
      context.stroke();
      if (Math.abs(from.x - to.x) < 0.5 && Math.abs(from.y - to.y) < 0.5) {
        context.beginPath();
        context.arc(to.x, to.y, radius, 0, Math.PI * 2);
        context.fill();
      }
    } else {
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const steps = distance < 0.5 ? 0 : Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.2)));
      const stamp = (x: number, y: number) => {
        const gradient = context.createRadialGradient(x, y, radius * brushHardness, x, y, radius);
        gradient.addColorStop(0, colorWithAlpha(strokeColor, 1));
        if (brushHardness > 0.01) gradient.addColorStop(Math.min(0.99, brushHardness), colorWithAlpha(strokeColor, 1));
        gradient.addColorStop(1, colorWithAlpha(strokeColor, 0));
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      };
      if (steps === 0) stamp(to.x, to.y);
      else for (let index = 0; index <= steps; index += 1) {
        const ratio = index / steps;
        stamp(from.x + (to.x - from.x) * ratio, from.y + (to.y - from.y) * ratio);
      }
    }
    context.restore();
  }, [brushHardness, brushOpacity, brushSize, canvasDocument?.generationRegion, canvasPreferences.clipToGenerationRegion, canvasPreferences.pressureSensitivity, editTarget, eraserSize, maskEditingLocked, paintBufferBounds.x, paintBufferBounds.y, paintColor, tool]);

  const drawRasterPointShape = React.useCallback((points: Point[], closed: boolean) => {
    const paintCanvas = paintCanvasRef.current;
    const context = paintCanvas?.getContext('2d');
    if (!paintCanvas || !context || points.length < (closed ? 3 : 2)) return false;
    context.save();
    context.translate(-paintBufferBounds.x, -paintBufferBounds.y);
    if (canvasPreferences.clipToGenerationRegion && canvasDocument?.generationRegion) {
      const region = canvasDocument.generationRegion;
      context.beginPath();
      context.rect(region.x, region.y, region.width, region.height);
      context.clip();
    }
    context.fillStyle = paintColor;
    context.strokeStyle = paintColor;
    context.globalAlpha = brushOpacity;
    context.lineWidth = shapeStrokeWidth;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) context.lineTo(point.x, point.y);
    if (closed) context.closePath();
    if (closed && shapeFilled) context.fill();
    else context.stroke();
    context.restore();
    return true;
  }, [brushOpacity, canvasDocument?.generationRegion, canvasPreferences.clipToGenerationRegion, paintBufferBounds.x, paintBufferBounds.y, paintColor, shapeFilled, shapeStrokeWidth]);

  const commitRasterStroke = React.useCallback(() => {
    const strokeCanvas = paintCanvasRef.current;
    if (!strokeCanvas || !canvasDocument || paintCommitPendingRef.current) return;
    const strokeSnapshot = document.createElement('canvas');
    strokeSnapshot.width = strokeCanvas.width;
    strokeSnapshot.height = strokeCanvas.height;
    strokeSnapshot.getContext('2d')?.drawImage(strokeCanvas, 0, 0);
    strokeCanvas.getContext('2d')?.clearRect(0, 0, strokeCanvas.width, strokeCanvas.height);
    const editableLayer = activeRasterLayer && activeRasterLayer.role !== 'source' && !activeRasterLayer.locked
      ? activeRasterLayer
      : activeControlLayer && !activeControlLayer.locked ? activeControlLayer : null;
    if (tool === 'erase' && (!editableLayer || editableLayer.kind === 'raster' && editableLayer.transparencyLocked)) {
      showToast(
        editableLayer?.kind === 'raster' && editableLayer.transparencyLocked
          ? 'Disable alpha lock before erasing this paint layer.'
          : 'Select an unlocked raster or control layer before erasing.',
        'error',
      );
      return;
    }
    paintCommitPendingRef.current = true;
    paintCommitQueueRef.current = paintCommitQueueRef.current.then(async () => {
      const output = document.createElement('canvas');
      let original: HTMLImageElement | null = null;
      if (editableLayer) {
        original = await loadHtmlImage(editableLayer.asset.imageUrl);
        output.width = Math.max(1, editableLayer.asset.width || original.naturalWidth);
        output.height = Math.max(1, editableLayer.asset.height || original.naturalHeight);
      } else {
        output.width = canvasDocument.width;
        output.height = canvasDocument.height;
      }
      const context = output.getContext('2d');
      if (!context) throw new Error('The raster paint layer could not be created.');
      if (original) context.drawImage(original, 0, 0, output.width, output.height);
      context.globalCompositeOperation = tool === 'erase' ? 'destination-out' : 'source-over';
      if (editableLayer) {
        const matrix = resolveUmbraCanvasWorldToLayerAssetTransform(
          editableLayer.transform,
          output.width,
          output.height,
        );
        context.save();
        context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
        context.drawImage(strokeSnapshot, paintBufferBounds.x, paintBufferBounds.y);
        context.restore();
      } else {
        context.drawImage(strokeSnapshot, paintBufferBounds.x, paintBufferBounds.y);
      }
      if (editableLayer?.kind === 'raster' && editableLayer.transparencyLocked && original) {
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(original, 0, 0, output.width, output.height);
      }
      const blob = await canvasToBlob(output);
      const imageUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const asset = createUmbraCanvasImageAsset({
        name: editableLayer?.asset.name || 'Raster Paint.png',
        path: '',
        imageUrl,
        width: output.width,
        height: output.height,
        objectUrl: true,
      });
      if (editableLayer?.kind === 'raster') {
        dispatchCanvasDocument({ type: 'replace_raster_asset', layerId: editableLayer.id, asset });
      } else if (editableLayer?.kind === 'control') {
        dispatchCanvasDocument({
          type: 'apply_control_filter',
          layerId: editableLayer.id,
          asset,
          transform: editableLayer.transform,
          name: editableLayer.name,
        });
      } else {
        dispatchCanvasDocument({
          type: 'add_raster_layer',
          asset,
          name: 'Raster Paint',
          role: 'paint',
          transform: { x: 0, y: 0, width: output.width, height: output.height },
        });
      }
    }).catch((error) => {
      showToast(error instanceof Error ? error.message : 'Failed to commit the raster paint stroke.', 'error');
    }).finally(() => {
      paintCommitPendingRef.current = false;
    });
  }, [activeControlLayer, activeRasterLayer, canvasDocument, paintBufferBounds.x, paintBufferBounds.y, showToast, tool]);

  const finishShapePolygon = React.useCallback((points = shapePoints) => {
    if (drawRasterPointShape(points, true)) commitRasterStroke();
    setShapePoints([]);
  }, [commitRasterStroke, drawRasterPointShape, shapePoints]);

  const applyMaskSelection = React.useCallback((draw: (context: CanvasRenderingContext2D) => void) => {
    if (maskEditingLocked) return;
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.save();
    context.fillStyle = '#ff304c';
    context.strokeStyle = '#ff304c';
    context.globalCompositeOperation = 'source-over';
    if (canvasPreferences.clipToGenerationRegion && canvasDocument?.generationRegion) {
      const region = canvasDocument.generationRegion;
      context.beginPath();
      context.rect(region.x, region.y, region.width, region.height);
      context.clip();
    }
    draw(context);
    context.restore();
  }, [canvasDocument?.generationRegion, canvasPreferences.clipToGenerationRegion, maskEditingLocked]);

  const applyWandSelection = React.useCallback(async (point: Point) => {
    if (!canvasDocument || maskProcessing) return;
    const clippedRegion = canvasPreferences.clipToGenerationRegion && canvasDocument?.generationRegion
      ? canvasDocument.generationRegion
      : { x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height };
    if (point.x < clippedRegion.x || point.y < clippedRegion.y
      || point.x >= clippedRegion.x + clippedRegion.width || point.y >= clippedRegion.y + clippedRegion.height) {
      showToast('Click inside the generation region while tool clipping is enabled.', 'error');
      return;
    }
    setMaskProcessing(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const imageCanvas = document.createElement('canvas');
      await renderCanvasDocument(imageCanvas, canvasDocument, previewStage, false, clippedRegion);
      const selection = await buildColorSelectionCanvas(
        imageCanvas,
        { x: 0, y: 0, width: clippedRegion.width, height: clippedRegion.height },
        { x: point.x - clippedRegion.x, y: point.y - clippedRegion.y },
        wandTolerance,
        wandContiguous,
      );
      applyMaskSelection((target) => target.drawImage(selection, clippedRegion.x, clippedRegion.y));
      commitMask();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Color selection failed.', 'error');
    } finally {
      setMaskProcessing(false);
    }
  }, [applyMaskSelection, canvasDocument, canvasPreferences.clipToGenerationRegion, commitMask, maskProcessing, previewStage, showToast, wandContiguous, wandTolerance]);

  const prepareAssistedSelectionMask = React.useCallback(async (mask: Blob, invert: boolean) => {
    const canvas = maskCanvasRef.current;
    if (!canvas) throw new Error('The inpaint mask is unavailable.');
    const objectUrl = URL.createObjectURL(mask);
    try {
      const image = await loadHtmlImage(objectUrl);
      const selection = document.createElement('canvas');
      selection.width = canvas.width;
      selection.height = canvas.height;
      const context = selection.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The assisted selection could not be prepared.');
      context.drawImage(image, 0, 0, selection.width, selection.height);
      for (let tileY = 0; tileY < selection.height; tileY += PIXEL_READBACK_TILE_ROWS) {
        const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, selection.height - tileY);
        const pixels = context.getImageData(0, tileY, selection.width, tileHeight);
        for (let index = 0; index < pixels.data.length; index += 4) {
          const coverage = Math.max(pixels.data[index], pixels.data[index + 1], pixels.data[index + 2]);
          pixels.data[index] = 255;
          pixels.data[index + 1] = 48;
          pixels.data[index + 2] = 76;
          pixels.data[index + 3] = invert ? 255 - coverage : coverage;
        }
        context.putImageData(pixels, 0, tileY);
      }
      return selection;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }, []);

  const finishPolygonSelection = React.useCallback((pointsOverride?: Point[]) => {
    const points = Array.isArray(pointsOverride) ? pointsOverride : polygonPoints;
    if (points.length < 3) return;
    applyMaskSelection((context) => {
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      context.closePath();
      context.fill();
    });
    setPolygonPoints([]);
    commitMask();
  }, [applyMaskSelection, commitMask, polygonPoints]);

  const installClipSeg = React.useCallback(async () => {
    if (!comfyConnected || clipSegInstalling) return;
    setClipSegInstalling(true);
    setClipSegError('');
    try {
      const capabilities = await installUmbraClipSegModel();
      setClipSegAvailable(capabilities.available && capabilities.supportsPrompt);
      setClipSegModelId(capabilities.modelId);
      showToast('Text-selection model installed.', 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Text-selection model installation failed.';
      setClipSegError(message);
      showToast(message, 'error');
    } finally {
      setClipSegInstalling(false);
    }
  }, [clipSegInstalling, comfyConnected, showToast]);

  const selectCanvasTool = React.useCallback((nextTool: CanvasTool, target?: CanvasEditTarget) => {
    setTool(nextTool);
    if (nextTool === 'gradient' && !activeGradientLayer && canvasDocument) {
      dispatchCanvasDocument({
        type: 'add_gradient_layer',
        stops: [{ offset: 0, color: paintColor }, { offset: 1, color: secondaryPaintColor }],
      });
    }
    if (target) {
      setEditTarget(target);
    } else if (nextTool === 'brush' || nextTool === 'erase' || nextTool === 'box' || nextTool === 'lasso' || nextTool === 'polygon') {
      setEditTarget('mask');
    } else if (nextTool === 'shape' || nextTool === 'gradient' || nextTool === 'eyedropper' || nextTool === 'text') {
      setEditTarget('raster');
    }
    setBoxPreview(null);
    setLassoPoints([]);
    setShapePoints([]);
    if (nextTool !== 'polygon') setPolygonPoints([]);
  }, [activeGradientLayer, canvasDocument, dispatchCanvasDocument, paintColor, secondaryPaintColor]);

  const adjustToolWidthFromWheel = React.useCallback((event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!event.shiftKey || (tool !== 'brush' && tool !== 'erase')) return;
    event.preventDefault();
    const naturalDirection = event.deltaY > 0 ? -1 : 1;
    const direction = canvasPreferences.invertToolWheel ? -naturalDirection : naturalDirection;
    const setToolSize = tool === 'erase' ? setEraserSize : setBrushSize;
    setToolSize((current) => Math.max(4, Math.min(512, current + direction * Math.max(4, Math.round(current * 0.08)))));
  }, [canvasPreferences.invertToolWheel, tool]);

  const openCanvasContextMenu = React.useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool === 'sam') {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setCanvasContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - 232)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - 390)),
    });
  }, [tool]);

  React.useEffect(() => {
    if (tool !== 'polygon') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finishPolygonSelection();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setPolygonPoints([]);
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && polygonPoints.length > 0) {
        event.preventDefault();
        setPolygonPoints((current) => current.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishPolygonSelection, polygonPoints.length, tool]);

  React.useEffect(() => {
    if (tool !== 'shape' || shapeType !== 'polygon') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        finishShapePolygon();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setShapePoints([]);
      } else if ((event.key === 'Backspace' || event.key === 'Delete') && shapePoints.length > 0) {
        event.preventDefault();
        setShapePoints((current) => current.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [finishShapePolygon, shapePoints.length, shapeType, tool]);

  const beginLayerTransform = React.useCallback((event: React.PointerEvent<HTMLElement>, mode: TransformDragMode) => {
    if (!activeTransformLayer || activeTransformLayer.locked || !canvasDocument) return;
    event.preventDefault();
    event.stopPropagation();
    const captureTarget = event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    const moveSelection = mode === 'move' && activeVisualLayer && selectedVisualLayers.some((layer) => layer.id === activeVisualLayer.id)
      ? selectedVisualLayers.filter((layer) => !layer.locked && !(layer.kind === 'raster' && layer.role === 'source'))
      : [activeTransformLayer];
    transformDragRef.current = {
      mode,
      layerId: activeTransformLayer.id,
      pointerId: event.pointerId,
      captureTarget,
      start: clientToCanvasPoint(event.clientX, event.clientY),
      initial: { ...activeTransformLayer.transform },
      latest: { ...activeTransformLayer.transform },
      selectedInitial: moveSelection.map((layer) => ({ layerId: layer.id, transform: { ...layer.transform } })),
      documentBefore: canvasDocument,
    };
  }, [activeTransformLayer, activeVisualLayer, canvasDocument, clientToCanvasPoint, selectedVisualLayers]);

  const snapTransformValue = React.useCallback((value: number) => (
    snapEnabled ? Math.round(value / Math.max(1, snapSize)) * Math.max(1, snapSize) : value
  ), [snapEnabled, snapSize]);

  const moveLayerTransform = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = transformDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const point = clientToCanvasPoint(event.clientX, event.clientY);
    const deltaX = point.x - drag.start.x;
    const deltaY = point.y - drag.start.y;
    if (drag.mode === 'move') {
      const snappedDeltaX = snapTransformValue(drag.initial.x + deltaX) - drag.initial.x;
      const snappedDeltaY = snapTransformValue(drag.initial.y + deltaY) - drag.initial.y;
      drag.latest = { ...drag.initial, x: drag.initial.x + snappedDeltaX, y: drag.initial.y + snappedDeltaY };
      dispatchCanvasHistory({
        type: 'history_apply_transient',
        action: {
          type: 'set_layers_transforms',
          transforms: drag.selectedInitial.map((entry) => ({
            layerId: entry.layerId,
            transform: { x: entry.transform.x + snappedDeltaX, y: entry.transform.y + snappedDeltaY },
          })),
        },
      });
      return;
    }
    if (drag.mode === 'rotate') {
      const centerX = drag.initial.x + drag.initial.width / 2;
      const centerY = drag.initial.y + drag.initial.height / 2;
      const startAngle = Math.atan2(drag.start.y - centerY, drag.start.x - centerX);
      const currentAngle = Math.atan2(point.y - centerY, point.x - centerX);
      const rotation = drag.initial.rotation + ((currentAngle - startAngle) * 180) / Math.PI;
      drag.latest = { ...drag.initial, rotation: snapEnabled ? Math.round(rotation / 5) * 5 : rotation };
      dispatchCanvasHistory({
        type: 'history_apply_transient',
        action: {
          type: 'set_layer_transform',
          layerId: drag.layerId,
          transform: { rotation: snapEnabled ? Math.round(rotation / 5) * 5 : rotation },
        },
      });
      return;
    }
    const radians = (drag.initial.rotation * Math.PI) / 180;
    const localDeltaX = deltaX * Math.cos(radians) + deltaY * Math.sin(radians);
    const localDeltaY = -deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
    const corner = drag.mode.slice(-2);
    const horizontalSign = corner[1] === 'e' ? 1 : -1;
    const verticalSign = corner[0] === 's' ? 1 : -1;
    const width = Math.max(16, snapTransformValue(drag.initial.width + horizontalSign * localDeltaX));
    const height = Math.max(16, snapTransformValue(drag.initial.height + verticalSign * localDeltaY));
    const appliedLocalX = (width - drag.initial.width) / horizontalSign;
    const appliedLocalY = (height - drag.initial.height) / verticalSign;
    const centerShiftX = (appliedLocalX / 2) * Math.cos(radians) - (appliedLocalY / 2) * Math.sin(radians);
    const centerShiftY = (appliedLocalX / 2) * Math.sin(radians) + (appliedLocalY / 2) * Math.cos(radians);
    const centerX = drag.initial.x + drag.initial.width / 2 + centerShiftX;
    const centerY = drag.initial.y + drag.initial.height / 2 + centerShiftY;
    drag.latest = { ...drag.initial, x: snapTransformValue(centerX - width / 2), y: snapTransformValue(centerY - height / 2), width, height };
    dispatchCanvasHistory({
      type: 'history_apply_transient',
        action: { type: 'set_layer_transform', layerId: drag.layerId, transform: drag.latest },
      });
  }, [clientToCanvasPoint, snapEnabled, snapTransformValue]);

  const finishLayerTransform = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = transformDragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    try { drag.captureTarget.releasePointerCapture(drag.pointerId); } catch { /* pointer already released */ }
    transformDragRef.current = null;
    const source = drag.documentBefore.layers.find((layer) => layer.id === drag.layerId);
    const transformIsIdentity = drag.latest.x === 0
      && drag.latest.y === 0
      && drag.latest.width === drag.documentBefore.width
      && drag.latest.height === drag.documentBefore.height
      && drag.latest.rotation === 0
      && drag.latest.scaleX === 1
      && drag.latest.scaleY === 1;
    if (source?.kind !== 'mask' || source.purpose !== 'inpaint' || source.frozen || transformIsIdentity) {
      dispatchCanvasHistory({ type: 'history_commit_snapshot', before: drag.documentBefore });
      return;
    }
    void (async () => {
      try {
        let dataUrl = '';
        if (source.dataUrl) {
          const baked = await renderImageTransformIntoRegion(
            source.dataUrl,
            drag.latest,
            { x: 0, y: 0, width: drag.documentBefore.width, height: drag.documentBefore.height },
          );
          dataUrl = URL.createObjectURL(await canvasToBlob(baked));
          layerAssetObjectUrlsRef.current.add(dataUrl);
        }
        dispatchCanvasHistory({
          type: 'history_apply_transient',
          action: { type: 'bake_inpaint_mask_transform', layerId: source.id, dataUrl },
        });
        dispatchCanvasHistory({ type: 'history_commit_snapshot', before: drag.documentBefore });
      } catch (error) {
        dispatchCanvasHistory({ type: 'history_hydrate', document: drag.documentBefore });
        showToast(error instanceof Error ? error.message : 'Failed to apply the inpaint-mask transform.', 'error');
      }
    })();
  }, [showToast]);

  const beginRegionTransform = React.useCallback((event: React.PointerEvent<HTMLElement>, mode: RegionDragMode) => {
    if (!canvasDocument?.generationRegion) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    regionDragRef.current = {
      pointerId: event.pointerId,
      mode,
      start: clientToCanvasPoint(event.clientX, event.clientY),
      initial: { ...canvasDocument.generationRegion },
      documentBefore: canvasDocument,
      captureTarget: event.currentTarget,
    };
  }, [canvasDocument, clientToCanvasPoint]);

  const moveRegionTransform = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = regionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const point = clientToCanvasPoint(event.clientX, event.clientY);
    const deltaX = point.x - drag.start.x;
    const deltaY = point.y - drag.start.y;
    let region: UmbraCanvasRect;
    if (drag.mode === 'move') {
      region = {
        ...drag.initial,
        x: snapTransformValue(drag.initial.x + deltaX),
        y: snapTransformValue(drag.initial.y + deltaY),
      };
    } else {
      const north = drag.mode.includes('n');
      const west = drag.mode.includes('w');
      const x = west ? snapTransformValue(drag.initial.x + deltaX) : drag.initial.x;
      const y = north ? snapTransformValue(drag.initial.y + deltaY) : drag.initial.y;
      region = {
        x,
        y,
        width: Math.max(Math.max(1, snapSize), snapTransformValue(drag.initial.width + (west ? -deltaX : deltaX))),
        height: Math.max(Math.max(1, snapSize), snapTransformValue(drag.initial.height + (north ? -deltaY : deltaY))),
      };
    }
    dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region', region } });
  }, [clientToCanvasPoint, snapSize, snapTransformValue]);

  const finishRegionTransform = React.useCallback((event: React.PointerEvent<HTMLElement>) => {
    const drag = regionDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    try { drag.captureTarget.releasePointerCapture(drag.pointerId); } catch { /* pointer already released */ }
    regionDragRef.current = null;
    const currentRegion = latestDocumentRef.current?.generationRegion;
    if (currentRegion) dispatchCanvasHistory({ type: 'history_apply_transient', action: { type: 'set_generation_region', region: alignGenerationRegion(currentRegion) } });
    dispatchCanvasHistory({ type: 'history_commit_snapshot', before: drag.documentBefore });
  }, [alignGenerationRegion]);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!source || (editTarget === 'raster' && paintCommitPendingRef.current)) return;
    if (editTarget === 'raster' && tool === 'erase' && layerEraseUnavailableReason) {
      event.preventDefault();
      showToast(layerEraseUnavailableReason, 'error');
      return;
    }
    const point = pointerPoint(event);
    if (editTarget === 'mask' && maskEditingLocked
      && (tool === 'brush' || tool === 'erase' || tool === 'box' || tool === 'lasso' || tool === 'polygon' || tool === 'wand')) {
      event.preventDefault();
      showToast('Unlock the active mask before editing it.', 'error');
      return;
    }
    if (tool === 'text') {
      if (event.button !== 0 || !canvasDocument) return;
      event.preventDefault();
      dispatchCanvasDocument({
        type: 'add_text_layer',
        text: 'Text',
        transform: {
          x: point.x,
          y: point.y,
          width: Math.min(canvasDocument.width, 640),
          height: Math.min(canvasDocument.height, 200),
        },
      });
      setLayersExpanded(false);
      setTool('brush');
      return;
    }
    if (tool === 'eyedropper') {
      if (event.button !== 0) return;
      event.preventDefault();
      const canvas = imageCanvasRef.current;
      const context = canvas?.getContext('2d', { willReadFrequently: true });
      if (!canvas || !context) return;
      const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((point.x / Math.max(1, canvasSize.width)) * canvas.width)));
      const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((point.y / Math.max(1, canvasSize.height)) * canvas.height)));
      const pixel = context.getImageData(x, y, 1, 1).data;
      const sampled = `#${[pixel[0], pixel[1], pixel[2]].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
      if (event.altKey || event.shiftKey) setSecondaryPaintColor(sampled);
      else setPaintColor(sampled);
      return;
    }
    if (tool === 'wand') {
      if (event.button !== 0) return;
      event.preventDefault();
      void applyWandSelection(point);
      return;
    }
    if (tool === 'polygon') {
      if (event.button !== 0) return;
      event.preventDefault();
      if (event.detail >= 2) {
        finishPolygonSelection(polygonPoints.length >= 3 ? polygonPoints : [...polygonPoints, point]);
      } else {
        setPolygonPoints((current) => [...current, point]);
      }
      return;
    }
    if (tool === 'shape' && shapeType === 'polygon') {
      if (event.button !== 0) return;
      event.preventDefault();
      const nextPoints = [...shapePoints, point];
      if (event.detail >= 2) finishShapePolygon(nextPoints);
      else setShapePoints(nextPoints);
      return;
    }
    if (tool === 'sam' && samGuideMode === 'points') {
      if (event.button !== 0 && event.button !== 2) return;
      event.preventDefault();
      const positive = event.button === 0 && !event.altKey && !event.shiftKey;
      setSamPoints((current) => [...current, { ...point, positive }]);
      return;
    }
    const pointerIntent = resolveUmbraCanvasPointerIntent(tool, shapeType, samGuideMode);
    if (pointerIntent === 'none') return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerActiveRef.current = true;
    if (editTarget === 'mask' && pointerIntent === 'paint') setMaskInteractionActive(true);
    lastPointRef.current = point;
    if (pointerIntent === 'shape_freehand') {
      setShapePoints([point]);
      return;
    }
    if (pointerIntent === 'box') {
      setBoxPreview({ start: point, current: point });
      return;
    }
    if (pointerIntent === 'lasso') {
      setLassoPoints([point]);
      return;
    }
    if (pointerIntent === 'paint') drawEditStroke(point, point, event.pressure);
  }, [applyWandSelection, canvasDocument, dispatchCanvasDocument, drawEditStroke, editTarget, finishPolygonSelection, finishShapePolygon, layerEraseUnavailableReason, maskEditingLocked, pointerPoint, polygonPoints, samGuideMode, shapePoints, shapeType, showToast, source, tool]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const point = pointerPoint(event);
    if (!pointerActiveRef.current) return;
    const pointerIntent = resolveUmbraCanvasPointerIntent(tool, shapeType, samGuideMode);
    if (pointerIntent === 'shape_freehand') {
      setShapePoints((current) => {
        const previous = current[current.length - 1];
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return current;
        return [...current, point];
      });
      return;
    }
    if (pointerIntent === 'box') {
      setBoxPreview((current) => current ? { ...current, current: point } : null);
      return;
    }
    if (pointerIntent === 'lasso') {
      setLassoPoints((current) => {
        const previous = current[current.length - 1];
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < 3) return current;
        return [...current, point];
      });
      return;
    }
    if (pointerIntent === 'paint') {
      const previous = lastPointRef.current || point;
      drawEditStroke(previous, point, event.pressure);
      lastPointRef.current = point;
    }
  }, [drawEditStroke, pointerPoint, samGuideMode, shapeType, tool]);

  const finishPointer = React.useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!pointerActiveRef.current) return;
    pointerActiveRef.current = false;
    setMaskInteractionActive(false);
    lastPointRef.current = null;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* pointer already released */ }
    const pointerIntent = resolveUmbraCanvasPointerIntent(tool, shapeType, samGuideMode);
    let rasterStrokeChanged = editTarget === 'raster' && pointerIntent === 'paint';
    let maskChanged = editTarget === 'mask' && pointerIntent === 'paint';
    if (pointerIntent === 'shape_freehand') {
      const endPoint = pointerPoint(event);
      const points = shapePoints.length > 0 ? [...shapePoints, endPoint] : [];
      rasterStrokeChanged = drawRasterPointShape(points, true);
      maskChanged = false;
      setShapePoints([]);
    }
    if (tool === 'gradient' && boxPreview) {
      const dx = boxPreview.current.x - boxPreview.start.x;
      const dy = boxPreview.current.y - boxPreview.start.y;
      const distance = Math.hypot(dx, dy);
      if (activeGradientLayer && distance >= 2) {
        const transform = activeGradientLayer.transform;
        const start = canvasPointToLayerNormalized(boxPreview.start, transform);
        const end = canvasPointToLayerNormalized(boxPreview.current, transform);
        const localDeltaX = (end.x - start.x) * transform.width;
        const localDeltaY = (end.y - start.y) * transform.height;
        const changes: Partial<Pick<UmbraCanvasGradientLayer, 'angle' | 'startX' | 'startY' | 'endX' | 'endY' | 'centerX' | 'centerY' | 'radius' | 'clipEnabled'>> = {
          angle: (Math.atan2(localDeltaY, localDeltaX) * 180) / Math.PI,
          startX: start.x,
          startY: start.y,
          endX: end.x,
          endY: end.y,
          clipEnabled: canvasPreferences.gradientClip,
        };
        if (activeGradientLayer.gradientType === 'linear') {
          dispatchCanvasDocument({
            type: 'update_gradient_layer',
            layerId: activeGradientLayer.id,
            changes,
          });
        } else {
          dispatchCanvasDocument({
            type: 'update_gradient_layer',
            layerId: activeGradientLayer.id,
            changes: {
              ...changes,
              centerX: start.x,
              centerY: start.y,
              radius: Math.hypot(localDeltaX, localDeltaY) / Math.max(1, Math.max(transform.width, transform.height)),
            },
          });
        }
      }
      setBoxPreview(null);
      maskChanged = false;
    }
    if (pointerIntent === 'box' && boxPreview) {
      const rawBox = normalizeBox(boxPreview);
      const grid = Math.max(1, snapSize);
      const box = snapEnabled ? {
        x: Math.max(0, Math.round(rawBox.x / grid) * grid),
        y: Math.max(0, Math.round(rawBox.y / grid) * grid),
        width: Math.max(grid, Math.round(rawBox.width / grid) * grid),
        height: Math.max(grid, Math.round(rawBox.height / grid) * grid),
      } : rawBox;
      const drawable = tool === 'shape' && shapeType === 'line'
        ? Math.hypot(boxPreview.current.x - boxPreview.start.x, boxPreview.current.y - boxPreview.start.y) >= 2
        : box.width >= 2 && box.height >= 2;
      if (drawable) {
        if (tool === 'region') {
          dispatchCanvasDocument({ type: 'set_generation_region', region: alignGenerationRegion(box) });
          maskChanged = false;
        } else if (tool === 'sam') {
          setSamBox(box);
          maskChanged = false;
        } else if (tool === 'shape') {
          const paintCanvas = paintCanvasRef.current;
          const context = paintCanvas?.getContext('2d');
          if (paintCanvas && context) {
            context.save();
            if (canvasPreferences.clipToGenerationRegion && canvasDocument?.generationRegion) {
              const region = canvasDocument.generationRegion;
              context.beginPath();
              context.rect(region.x, region.y, region.width, region.height);
              context.clip();
            }
            context.fillStyle = paintColor;
            context.strokeStyle = paintColor;
            context.globalAlpha = brushOpacity;
            context.lineWidth = shapeStrokeWidth;
            if (shapeType === 'line') {
              context.beginPath();
              context.moveTo(boxPreview.start.x, boxPreview.start.y);
              context.lineTo(boxPreview.current.x, boxPreview.current.y);
              context.stroke();
            } else if (shapeType === 'ellipse') {
              context.beginPath();
              context.ellipse(box.x + box.width / 2, box.y + box.height / 2, box.width / 2, box.height / 2, 0, 0, Math.PI * 2);
              if (shapeFilled) context.fill();
              else context.stroke();
            } else if (shapeFilled) context.fillRect(box.x, box.y, box.width, box.height);
            else context.strokeRect(box.x, box.y, box.width, box.height);
            context.restore();
            rasterStrokeChanged = true;
          }
          maskChanged = false;
        } else {
          applyMaskSelection((context) => context.fillRect(box.x, box.y, box.width, box.height));
          setLastBox(box);
          maskChanged = true;
        }
      }
      setBoxPreview(null);
    }
    if (pointerIntent === 'lasso') {
      if (lassoPoints.length >= 3) {
        applyMaskSelection((context) => {
          context.beginPath();
          context.moveTo(lassoPoints[0].x, lassoPoints[0].y);
          for (const point of lassoPoints.slice(1)) context.lineTo(point.x, point.y);
          context.closePath();
          context.fill();
        });
        maskChanged = true;
      }
      setLassoPoints([]);
    }
    if (rasterStrokeChanged) commitRasterStroke();
    else if (maskChanged) commitMask();
  }, [activeGradientLayer, alignGenerationRegion, applyMaskSelection, boxPreview, brushOpacity, canvasDocument?.generationRegion, canvasPreferences.clipToGenerationRegion, canvasPreferences.gradientClip, commitMask, commitRasterStroke, dispatchCanvasDocument, drawRasterPointShape, editTarget, lassoPoints, paintColor, pointerPoint, samGuideMode, shapeFilled, shapePoints, shapeStrokeWidth, shapeType, snapEnabled, snapSize, tool]);

  const restoreHistoryGeometry = React.useCallback((target: UmbraCanvasDocument | null | undefined) => {
    if (!target) return;
    const margins = resolveCanvasDocumentMargins(target);
    const currentDocument = latestDocumentRef.current;
    const artboard = canvasStudio.activeArtboard;
    if (studioMode && currentDocument && artboard?.documentId === target.id) {
      const currentMargins = resolveCanvasDocumentMargins(currentDocument);
      const deltaX = currentMargins.left - margins.left;
      const deltaY = currentMargins.top - margins.top;
      if (deltaX !== 0 || deltaY !== 0) {
        const artboardPosition = studioArtboardPosition(artboard);
        canvasStudio.updateArtboard(artboard.id, {
          x: artboardPosition.x + deltaX,
          y: artboardPosition.y + deltaY,
        });
      }
    }
    const activeMask = target.layers.find((layer) => layer.id === target.activeMaskLayerId && layer.kind === 'mask');
    pendingMaskRestoreRef.current = activeMask?.kind === 'mask' ? activeMask.dataUrl : '';
    pendingMaskRestoreCommitRef.current = false;
    setCanvasSize({ width: target.width, height: target.height });
    setDraftMargins(margins);
    setAppliedMargins(margins);
    setZoom(1);
    setMaskResetRevision((value) => value + 1);
  }, [canvasStudio.activeArtboard, canvasStudio.updateArtboard, studioArtboardPosition, studioMode]);

  const undoDocument = React.useCallback(() => {
    const target = documentHistory.past[documentHistory.past.length - 1];
    if (!target) return;
    setLastBox(null);
    restoreHistoryGeometry(target);
    dispatchCanvasHistory({ type: 'history_undo' });
  }, [documentHistory.past, restoreHistoryGeometry]);

  const redoDocument = React.useCallback(() => {
    const target = documentHistory.future[0];
    if (!target) return;
    setLastBox(null);
    restoreHistoryGeometry(target);
    dispatchCanvasHistory({ type: 'history_redo' });
  }, [documentHistory.future, restoreHistoryGeometry]);

  const clearDocumentHistory = React.useCallback(() => {
    if (!canvasDocument) return;
    if (!window.confirm('Clear the Canvas undo and redo history? This cannot be undone.')) return;
    dispatchCanvasHistory({ type: 'history_reset', document: canvasDocument });
    showToast('Canvas undo history cleared.', 'success');
  }, [canvasDocument, showToast]);

  const clearCanvasImageCache = React.useCallback(() => {
    const cachedImageCount = htmlImageCache.size;
    htmlImageCache.clear();
    showToast(cachedImageCount > 0 ? `Cleared ${cachedImageCount} cached canvas images.` : 'Canvas image cache is already empty.', 'success');
  }, [showToast]);

  const previewStageOffset = React.useCallback((offset: number) => {
    const stages = canvasDocument?.staging || [];
    if (stages.length <= 0) return;
    const currentIndex = stages.findIndex((stage) => stage.id === canvasDocument?.previewStageId);
    const nextIndex = currentIndex < 0
      ? (offset < 0 ? stages.length - 1 : 0)
      : (currentIndex + offset + stages.length) % stages.length;
    dispatchCanvasDocument({ type: 'preview_stage', stageId: stages[nextIndex].id });
  }, [canvasDocument]);

  const quickSwitchLayer = React.useCallback(() => {
    if (!canvasDocument) return;
    const available = new Set(canvasDocument.layers.map((layer) => layer.id));
    const { previous, current } = quickSwitchHistoryRef.current;
    const bookmark = available.has(canvasDocument.bookmarkedLayerId) ? canvasDocument.bookmarkedLayerId : '';
    const target = bookmark && current !== bookmark
      ? bookmark
      : available.has(previous) ? previous : '';
    if (!target || target === current) return;
    quickSwitchHistoryRef.current = { previous: current, current: target };
    dispatchCanvasDocument({ type: 'select_layer', layerId: target });
  }, [canvasDocument]);

  const nudgeActiveTransformLayer = React.useCallback((dx: number, dy: number) => {
    const documentState = latestDocumentRef.current;
    if (!documentState) return;
    const layer = documentState.layers.find((candidate) => candidate.id === documentState.activeLayerId);
    if (!layer || layer.locked || !layer.visible || layer.kind === 'group') return;
    if (layer.kind === 'raster' && layer.role === 'source') return;

    if (layer.kind === 'mask') {
      if (layer.purpose !== 'inpaint' || layer.frozen || !layer.dataUrl) return;
      const projectId = documentState.id;
      const layerId = layer.id;
      keyboardMaskNudgeQueueRef.current = keyboardMaskNudgeQueueRef.current.then(async () => {
        const currentDocument = latestDocumentRef.current;
        if (!currentDocument || currentDocument.id !== projectId) return;
        const currentLayer = currentDocument.layers.find((candidate) => candidate.id === layerId);
        if (currentLayer?.kind !== 'mask' || currentLayer.purpose !== 'inpaint'
          || currentLayer.frozen || currentLayer.locked || !currentLayer.visible || !currentLayer.dataUrl) return;
        const sourceSignature = `${currentLayer.updatedAt}:${currentLayer.dataUrl}:${JSON.stringify(currentLayer.transform)}`;
        const baked = await renderImageTransformIntoRegion(
          currentLayer.dataUrl,
          {
            ...currentLayer.transform,
            x: currentLayer.transform.x + dx,
            y: currentLayer.transform.y + dy,
          },
          { x: 0, y: 0, width: currentDocument.width, height: currentDocument.height },
        );
        const latestDocument = latestDocumentRef.current;
        const latestLayer = latestDocument?.id === projectId
          ? latestDocument.layers.find((candidate) => candidate.id === layerId)
          : null;
        if (latestLayer?.kind !== 'mask'
          || `${latestLayer.updatedAt}:${latestLayer.dataUrl}:${JSON.stringify(latestLayer.transform)}` !== sourceSignature) return;
        const dataUrl = URL.createObjectURL(await canvasToBlob(baked));
        layerAssetObjectUrlsRef.current.add(dataUrl);
        dispatchCanvasDocument({ type: 'bake_inpaint_mask_transform', layerId, dataUrl });
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }).catch((error) => {
        showToast(error instanceof Error ? error.message : 'Failed to nudge the inpaint mask.', 'error');
      });
      return;
    }

    const selectedIds = new Set(selectedLayerIds);
    const isVisual = layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient';
    const layersToMove = isVisual && selectedIds.has(layer.id)
      ? documentState.layers.filter((candidate) => (
        selectedIds.has(candidate.id)
        && (candidate.kind === 'raster' || candidate.kind === 'text' || candidate.kind === 'gradient')
        && !candidate.locked
        && !(candidate.kind === 'raster' && candidate.role === 'source')
      ))
      : [layer];
    dispatchCanvasDocument({
      type: 'set_layers_transforms',
      transforms: layersToMove.map((candidate) => ({
        layerId: candidate.id,
        transform: {
          x: candidate.transform.x + dx,
          y: candidate.transform.y + dy,
        },
      })),
    });
  }, [dispatchCanvasDocument, selectedLayerIds, showToast]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editing = isEditableKeyboardTarget(event.target);
      const modified = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (editing) return;
      if (modified && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoDocument();
        else undoDocument();
        return;
      }
      if (modified && key === 'y') {
        event.preventDefault();
        redoDocument();
        return;
      }
      if (modified && key === 's') {
        event.preventDefault();
        if (canvasDocument) void persistProject(canvasDocument, true);
        return;
      }
      if (modified) return;
      const keyboardIntent = resolveUmbraCanvasKeyboardIntent({
        key: event.key,
        editing,
        modified: modified || event.altKey,
        hasPreviewStage: Boolean(canvasDocument?.previewStageId),
        tool,
        hasMovableLayer: Boolean(
          activeTransformLayer
          && activeTransformLayer.visible
          && !activeTransformLayer.locked
          && !(activeTransformLayer.kind === 'raster' && activeTransformLayer.role === 'source')
        ),
      });
      if (keyboardIntent.kind === 'stage') {
        event.preventDefault();
        previewStageOffset(keyboardIntent.offset);
        return;
      }
      if (keyboardIntent.kind === 'layer') {
        event.preventDefault();
        nudgeActiveTransformLayer(keyboardIntent.dx, keyboardIntent.dy);
        return;
      }
      if (Object.entries(canvasHotkeys).find(([, shortcut]) => shortcut === key)?.[0]) {
        const actionId = Object.entries(canvasHotkeys).find(([, shortcut]) => shortcut === key)?.[0];
        if (actionId === 'quick_switch') quickSwitchLayer();
        else if (actionId) selectCanvasTool(actionId as CanvasTool);
      } else if (key === '[') {
        const setToolSize = tool === 'erase' ? setEraserSize : setBrushSize;
        setToolSize((value) => Math.max(4, value - 8));
      } else if (key === ']') {
        const setToolSize = tool === 'erase' ? setEraserSize : setBrushSize;
        setToolSize((value) => Math.min(512, value + 8));
      }
      else if (key === '0') setZoom(1);
      else if (key === 'escape') {
        if (canvasDocument?.previewStageId) dispatchCanvasDocument({ type: 'preview_stage', stageId: '' });
        setPolygonPoints([]);
        setLassoPoints([]);
        setBoxPreview(null);
        setSamPoints([]);
        setSamBox(null);
      } else if ((key === 'delete' || key === 'backspace') && canvasDocument?.activeLayerId) {
        dispatchCanvasDocument({ type: 'remove_layer', layerId: canvasDocument.activeLayerId });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTransformLayer, canvasDocument, canvasHotkeys, nudgeActiveTransformLayer, persistProject, previewStageOffset, quickSwitchLayer, redoDocument, selectCanvasTool, tool, undoDocument]);

  const clearMask = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || maskEditingLocked) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    paintOutpaintMargins(context, appliedMargins);
    setLastBox(null);
    commitMask();
  }, [appliedMargins, commitMask, maskEditingLocked, paintOutpaintMargins]);

  const deleteInpaintMask = React.useCallback((layerId: string) => {
    const mask = editableInpaintMasks.find((layer) => layer.id === layerId);
    if (!mask) return;
    if (mask.locked) {
      showToast('Unlock the inpaint mask before deleting it.', 'error');
      return;
    }
    dispatchCanvasDocument({ type: 'remove_layer', layerId: mask.id });
    if (editingLayerMaskId === mask.id) setEditingLayerMaskId('');
    setLastBox(null);
    showToast(
      editableInpaintMasks.length <= 1
        ? 'Inpaint mask deleted. A clean working mask is ready; Undo restores the deleted mask.'
        : 'Inpaint mask deleted. Undo restores it.',
      'success',
    );
  }, [editableInpaintMasks, editingLayerMaskId, showToast]);

  const invertMask = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context || maskEditingLocked) return;
    for (let tileY = 0; tileY < canvas.height; tileY += PIXEL_READBACK_TILE_ROWS) {
      const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, canvas.height - tileY);
      const pixels = context.getImageData(0, tileY, canvas.width, tileHeight);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = 255;
        pixels.data[index + 1] = 48;
        pixels.data[index + 2] = 76;
        pixels.data[index + 3] = 255 - pixels.data[index + 3];
      }
      context.putImageData(pixels, 0, tileY);
    }
    commitMask();
  }, [commitMask, maskEditingLocked]);

  const adjustActiveMask = React.useCallback(async (amount: number) => {
    const canvas = maskCanvasRef.current;
    if (!canvas || maskEditingLocked || maskProcessing) return;
    setMaskProcessing(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      morphMaskCanvas(canvas, amount);
      commitMask();
    } finally {
      setMaskProcessing(false);
    }
  }, [commitMask, maskEditingLocked, maskProcessing]);

  const featherActiveMask = React.useCallback(async (radius: number) => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context || maskEditingLocked || maskProcessing) return;
    setMaskProcessing(true);
    try {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const blurRadius = Math.max(1, Math.min(256, Math.round(radius)));
      const padding = Math.ceil(blurRadius * 3);
      const sourceBitmap = await createImageBitmap(canvas);
      try {
        context.clearRect(0, 0, canvas.width, canvas.height);
        const tileSize = 1024;
        let tileCount = 0;
        for (let y = 0; y < canvas.height; y += tileSize) {
          for (let x = 0; x < canvas.width; x += tileSize) {
            const width = Math.min(tileSize, canvas.width - x);
            const height = Math.min(tileSize, canvas.height - y);
            const sourceX = Math.max(0, x - padding);
            const sourceY = Math.max(0, y - padding);
            const sourceRight = Math.min(canvas.width, x + width + padding);
            const sourceBottom = Math.min(canvas.height, y + height + padding);
            const tile = document.createElement('canvas');
            tile.width = sourceRight - sourceX;
            tile.height = sourceBottom - sourceY;
            const tileContext = tile.getContext('2d');
            if (!tileContext) continue;
            tileContext.filter = `blur(${blurRadius}px)`;
            tileContext.drawImage(sourceBitmap, sourceX, sourceY, tile.width, tile.height, 0, 0, tile.width, tile.height);
            context.drawImage(tile, x - sourceX, y - sourceY, width, height, x, y, width, height);
            tileCount += 1;
            if (tileCount % 8 === 0) await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          }
        }
      } finally {
        sourceBitmap.close();
      }
      commitMask();
    } finally {
      setMaskProcessing(false);
    }
  }, [commitMask, maskEditingLocked, maskProcessing]);

  const cropToGenerationRegion = React.useCallback(async () => {
    const region = canvasDocument?.generationRegion;
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !region || !maskCanvas || maskProcessing) return;
    setMaskProcessing(true);
    try {
      const croppedMask = cropCanvas(maskCanvas, region);
      const maskBlob = await canvasToBlob(croppedMask);
      const maskSnapshot = URL.createObjectURL(maskBlob);
      maskSnapshotUrlsRef.current.add(maskSnapshot);
      pendingMaskRestoreRef.current = maskSnapshot;
      pendingMaskRestoreCommitRef.current = true;
      dispatchCanvasDocument({
        type: 'resize_canvas',
        width: region.width,
        height: region.height,
        translateX: -region.x,
        translateY: -region.y,
        clearGenerationRegion: true,
      });
      setCanvasSize({ width: region.width, height: region.height });
      setDraftMargins(EMPTY_MARGINS);
      setAppliedMargins(EMPTY_MARGINS);
      setLastBox(null);
      setZoom(1);
      setMaskResetRevision((value) => value + 1);
      showToast(`Canvas cropped to ${region.width}x${region.height}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to crop the canvas.', 'error');
    } finally {
      setMaskProcessing(false);
    }
  }, [canvasDocument, maskProcessing, showToast]);

  const applyCanvasResize = React.useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !maskCanvas || !resizeCrop || maskProcessing || !resizeHasChanges) return;
    if (inpaintJobRunning || canvasDocument.pendingJobs.length > 0) {
      showToast('Finish or cancel the active inpaint job before resizing the canvas.', 'error');
      return;
    }
    setMaskProcessing(true);
    try {
      assertUmbraCanvasInteractiveAllocation(resizeTarget.width, resizeTarget.height);
      const resizedMask = document.createElement('canvas');
      resizedMask.width = resizeTarget.width;
      resizedMask.height = resizeTarget.height;
      const context = resizedMask.getContext('2d');
      if (!context) throw new Error('The resized inpaint mask could not be prepared.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        maskCanvas,
        resizeCrop.x,
        resizeCrop.y,
        resizeCrop.width,
        resizeCrop.height,
        0,
        0,
        resizeTarget.width,
        resizeTarget.height,
      );
      const maskSnapshot = URL.createObjectURL(await canvasToBlob(resizedMask));
      maskSnapshotUrlsRef.current.add(maskSnapshot);
      pendingMaskRestoreRef.current = maskSnapshot;
      pendingMaskRestoreCommitRef.current = false;
      dispatchCanvasDocument({ type: 'set_mask_snapshot', dataUrl: maskSnapshot });
      dispatchCanvasDocument({
        type: 'resample_canvas',
        width: resizeTarget.width,
        height: resizeTarget.height,
        sourceRect: resizeCrop,
      });
      setCanvasSize({ width: resizeTarget.width, height: resizeTarget.height });
      setDraftMargins(EMPTY_MARGINS);
      setAppliedMargins(EMPTY_MARGINS);
      setLastBox(null);
      setZoom(1);
      setResizeEnabled(false);
      setResizeAspectRatio('source');
      setResizeWidth(String(resizeTarget.width));
      setResizeHeight(String(resizeTarget.height));
      setMaskResetRevision((value) => value + 1);
      showToast(
        `${resizeChangesAspect ? 'Canvas cropped and resized' : 'Canvas resized'} to ${resizeTarget.width}x${resizeTarget.height}. Undo restores the previous size.`,
        'success',
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to resize the inpaint canvas.', 'error');
    } finally {
      setMaskProcessing(false);
    }
  }, [
    canvasDocument,
    inpaintJobRunning,
    maskProcessing,
    resizeChangesAspect,
    resizeCrop,
    resizeHasChanges,
    resizeTarget.height,
    resizeTarget.width,
    showToast,
  ]);

  const cropCanvasToVisibleContent = React.useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !maskCanvas || maskProcessing) return;
    setMaskProcessing(true);
    try {
      const imageCanvas = await renderFullCommittedCanvas();
      const bounds = findMaskAlphaBounds(imageCanvas);
      if (!bounds) throw new Error('The canvas has no visible content to crop.');
      if (bounds.x === 0 && bounds.y === 0 && bounds.width === canvasDocument.width && bounds.height === canvasDocument.height) {
        showToast('Visible content already fills the canvas.', 'success');
        return;
      }
      const croppedMask = cropCanvas(maskCanvas, bounds);
      const maskSnapshot = URL.createObjectURL(await canvasToBlob(croppedMask));
      maskSnapshotUrlsRef.current.add(maskSnapshot);
      pendingMaskRestoreRef.current = maskSnapshot;
      pendingMaskRestoreCommitRef.current = true;
      dispatchCanvasDocument({
        type: 'resize_canvas',
        width: bounds.width,
        height: bounds.height,
        translateX: -bounds.x,
        translateY: -bounds.y,
        clearGenerationRegion: true,
      });
      setCanvasSize({ width: bounds.width, height: bounds.height });
      setDraftMargins(EMPTY_MARGINS);
      setAppliedMargins(EMPTY_MARGINS);
      setLastBox(null);
      setZoom(1);
      setMaskResetRevision((value) => value + 1);
      showToast(`Canvas cropped to visible content (${bounds.width}x${bounds.height}).`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to crop the canvas to visible content.', 'error');
    } finally {
      setMaskProcessing(false);
    }
  }, [canvasDocument, maskProcessing, renderFullCommittedCanvas, showToast]);

  const applyOutpaintFrame = React.useCallback(() => {
    if (!source || !canvasDocument) return;
    const margins = normalizeMargins(draftMargins);
    const deltaLeft = margins.left - appliedMargins.left;
    const deltaRight = margins.right - appliedMargins.right;
    const deltaTop = margins.top - appliedMargins.top;
    const deltaBottom = margins.bottom - appliedMargins.bottom;
    const width = canvasDocument.width + deltaLeft + deltaRight;
    const height = canvasDocument.height + deltaTop + deltaBottom;
    if (width < 1 || height < 1) {
      showToast('The outpaint frame cannot collapse the canvas.', 'error');
      return;
    }
    try {
      assertUmbraCanvasInteractiveAllocation(width, height);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The outpaint frame is too large.', 'error');
      return;
    }
    dispatchCanvasDocument({
      type: 'resize_canvas',
      width,
      height,
      translateX: deltaLeft,
      translateY: deltaTop,
    });
    setAppliedMargins(margins);
    setCanvasSize({ width, height });
    setLastBox(null);
    setMaskResetRevision((value) => value + 1);
    showToast('Outpaint frame applied. New canvas areas are masked.', 'success');
  }, [appliedMargins, canvasDocument, draftMargins, showToast, source]);

  const maskHasContent = React.useCallback((region?: UmbraCanvasRect | null) => {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !context) return false;
    const requested = region || { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const x = Math.max(0, Math.min(canvas.width - 1, Math.floor(requested.x)));
    const y = Math.max(0, Math.min(canvas.height - 1, Math.floor(requested.y)));
    const width = Math.max(1, Math.min(canvas.width - x, Math.ceil(requested.width)));
    const height = Math.max(1, Math.min(canvas.height - y, Math.ceil(requested.height)));
    for (let tileY = 0; tileY < height; tileY += PIXEL_READBACK_TILE_ROWS) {
      const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, height - tileY);
      const data = context.getImageData(x, y + tileY, width, tileHeight).data;
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] > 4) return true;
      }
    }
    return false;
  }, []);

  const buildCompositeInpaintMasks = React.useCallback(async (
    region: UmbraCanvasRect | null = null,
    includeModifiers = true,
  ) => {
    const activeCanvas = maskCanvasRef.current;
    if (!canvasDocument || !activeCanvas) throw new Error('The inpaint mask is unavailable.');
    await maskSnapshotQueueRef.current.catch(() => undefined);
    const originX = Math.max(0, Math.round(region?.x || 0));
    const originY = Math.max(0, Math.round(region?.y || 0));
    const targetWidth = Math.max(1, Math.round(region?.width || canvasDocument.width));
    const targetHeight = Math.max(1, Math.round(region?.height || canvasDocument.height));
    const createTarget = () => {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      return canvas;
    };
    const base = createTarget();
    const denoise = includeModifiers ? createTarget() : null;
    const noise = includeModifiers ? createTarget() : null;
    const masks = canvasDocument.layers.filter((layer): layer is Extract<UmbraCanvasLayer, { kind: 'mask' }> => (
      layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen && layer.enabled
    ));
    for (const layer of masks) {
      const sourceImage = !editingLayerMaskId && layer.id === canvasDocument.activeMaskLayerId
        ? activeCanvas
        : layer.dataUrl ? await loadHtmlImage(layer.dataUrl) : null;
      if (!sourceImage) continue;
      for (const [target, opacity] of [[base, 1], [denoise, 1], [noise, 0]] as const) {
        if (!target || opacity <= 0) continue;
        const context = target.getContext('2d');
        if (!context) continue;
        const { x, y, width, height, rotation, scaleX, scaleY } = layer.transform;
        context.save();
        context.globalAlpha = opacity;
        context.translate(-originX, -originY);
        context.translate(x + width / 2, y + height / 2);
        context.rotate((rotation * Math.PI) / 180);
        context.scale(scaleX, scaleY);
        context.drawImage(sourceImage, -width / 2, -height / 2, width, height);
        context.restore();
      }
    }
    return { base, denoise, noise };
  }, [canvasDocument, editingLayerMaskId]);

  const stitchOverlappingArtboards = React.useCallback(async () => {
    const project = canvasStudio.project;
    const active = canvasStudio.activeArtboard;
    if (!studioMode || !project || !active || !canvasDocument || active.documentId !== canvasDocument.id) return;
    if (studioOverlapArtboards.length < 2) {
      showToast('Overlap this canvas with another visible canvas before stitching.', 'error');
      return;
    }
    if (studioOverlapArtboards.some((artboard) => artboard.locked)) {
      showToast('Unlock every overlapping canvas before stitching.', 'error');
      return;
    }
    if (canvasDocument.pendingJobs.length > 0 || canvasDocument.staging.length > 0 || previewStage) {
      showToast('Accept or discard staged work before stitching canvases.', 'error');
      return;
    }
    const count = studioOverlapArtboards.length;
    if (!window.confirm(`Stitch ${count} overlapping canvases into one canvas? The source canvases stay available through Undo.`)) return;

    await runFullResolutionOperation('Stitch overlapping canvases', async ({ signal, setPhase }) => {
      setPhase('rendering');
      const positions = studioOverlapArtboards.map((artboard) => ({
        artboard,
        ...studioArtboardPosition(artboard),
      }));
      const minX = Math.min(...positions.map((entry) => entry.x));
      const minY = Math.min(...positions.map((entry) => entry.y));
      const maxX = Math.max(...positions.map((entry) => entry.x + entry.artboard.width));
      const maxY = Math.max(...positions.map((entry) => entry.y + entry.artboard.height));
      const union = {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
      };
      const activePosition = studioArtboardPosition(active);
      const activeScaleX = active.width / Math.max(1, canvasDocument.width);
      const activeScaleY = active.height / Math.max(1, canvasDocument.height);
      const ids = new Set(studioOverlapArtboards.map((artboard) => artboard.id));
      const { canvas: composite } = await renderStudioCompositeRegion(
        union,
        new Map([[canvasDocument.id, canvasDocument]]),
        { transparent: true, artboardIds: ids },
      );
      if (signal.aborted) throw new DOMException('Canvas stitching was canceled.', 'AbortError');

      setPhase('processing');
      const currentMasks = await buildCompositeInpaintMasks(null, false);
      const stitchedMask = document.createElement('canvas');
      stitchedMask.width = composite.width;
      stitchedMask.height = composite.height;
      const maskContext = stitchedMask.getContext('2d');
      if (!maskContext) throw new Error('The stitched inpaint mask could not be prepared.');
      maskContext.imageSmoothingEnabled = true;
      maskContext.imageSmoothingQuality = 'high';
      maskContext.drawImage(
        currentMasks.base,
        activePosition.x - union.x,
        activePosition.y - union.y,
        active.width,
        active.height,
      );

      setPhase('encoding');
      const [sourceBlob, maskBlob] = await Promise.all([
        canvasToBlob(composite),
        canvasToBlob(stitchedMask),
      ]);
      if (signal.aborted) throw new DOMException('Canvas stitching was canceled.', 'AbortError');
      const sourceUrl = URL.createObjectURL(sourceBlob);
      const maskUrl = URL.createObjectURL(maskBlob);
      try {
        const name = `${active.name} Stitched`;
        const asset = createUmbraCanvasImageAsset({
          id: createLocalId('stitched-canvas-source'),
          name: `${name}.png`,
          path: '',
          imageUrl: sourceUrl,
          width: composite.width,
          height: composite.height,
          objectUrl: true,
        });
        let stitchedDocument = createUmbraCanvasDocument(asset, name);
        stitchedDocument = umbraCanvasDocumentReducer(stitchedDocument, {
          type: 'set_generation_settings',
          generation: structuredClone(canvasDocument.generation),
        }) as UmbraCanvasDocument;
        stitchedDocument = umbraCanvasDocumentReducer(stitchedDocument, {
          type: 'set_operation_mode',
          mode: canvasDocument.operationMode,
        }) as UmbraCanvasDocument;
        stitchedDocument = umbraCanvasDocumentReducer(stitchedDocument, {
          type: 'set_generation_region_aspect_ratio',
          ratio: canvasDocument.generationRegionAspectRatio,
        }) as UmbraCanvasDocument;
        if (canvasDocument.generationRegion) {
          stitchedDocument = umbraCanvasDocumentReducer(stitchedDocument, {
            type: 'set_generation_region',
            region: {
              x: activePosition.x - union.x + canvasDocument.generationRegion.x * activeScaleX,
              y: activePosition.y - union.y + canvasDocument.generationRegion.y * activeScaleY,
              width: canvasDocument.generationRegion.width * activeScaleX,
              height: canvasDocument.generationRegion.height * activeScaleY,
            },
          }) as UmbraCanvasDocument;
        }
        stitchedDocument = umbraCanvasDocumentReducer(stitchedDocument, {
          type: 'set_mask_snapshot',
          dataUrl: maskUrl,
        }) as UmbraCanvasDocument;

        setPhase('saving');
        const stitched = await canvasStudio.replaceArtboardsWithDocument(
          stitchedDocument,
          [...ids],
          {
            x: union.x,
            y: union.y,
            zIndex: Math.max(...studioOverlapArtboards.map((artboard) => artboard.zIndex)),
            name,
          },
          'stitch overlapping canvases',
        );
        if (!stitched) return;
        showToast(`${count} canvases stitched into ${name}. Undo restores the originals.`, 'success');
      } finally {
        URL.revokeObjectURL(sourceUrl);
        URL.revokeObjectURL(maskUrl);
      }
    });
  }, [
    buildCompositeInpaintMasks,
    canvasDocument,
    canvasStudio,
    previewStage,
    renderStudioCompositeRegion,
    runFullResolutionOperation,
    showToast,
    studioArtboardPosition,
    studioMode,
    studioOverlapArtboards,
  ]);

  const fitGenerationRegionToMasks = React.useCallback(async () => {
    if (!canvasDocument) return;
    try {
      const masks = await buildCompositeInpaintMasks(null, false);
      const bounds = findMaskAlphaBounds(masks.base);
      if (!bounds) throw new Error('There are no enabled inpaint masks to fit.');
      dispatchCanvasDocument({
        type: 'set_generation_region',
        region: alignGenerationRegion(expandCanvasRect(bounds, Math.max(0, contextPadding), canvasDocument.width, canvasDocument.height)),
      });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to fit the generation region to masks.', 'error');
    }
  }, [alignGenerationRegion, buildCompositeInpaintMasks, canvasDocument, contextPadding, showToast]);

  const createCompositeLayer = React.useCallback(async (masked: boolean) => {
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !maskCanvas || !canvasReady) return;
    if (masked && !maskHasContent(null)) {
      showToast('Paint or select an area to extract.', 'error');
      return;
    }
    try {
      const output = await renderFullCommittedCanvas();
      const context = output.getContext('2d');
      if (!context) throw new Error('The extracted layer could not be prepared.');
      if (masked) {
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(maskCanvas, 0, 0);
      }
      const blob = await canvasToBlob(output);
      const imageUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const name = masked ? 'Masked Extraction' : 'Visible Composite';
      dispatchCanvasDocument({
        type: 'add_raster_layer',
        name,
        role: 'paint',
        asset: createUmbraCanvasImageAsset({
          name: `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast(`${name} added as a raster layer.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create the raster layer.', 'error');
    }
  }, [canvasDocument, canvasReady, maskHasContent, renderFullCommittedCanvas, showToast]);

  const copyMaskedSelection = React.useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas || !canvasReady) return;
    const bounds = findMaskAlphaBounds(maskCanvas);
    if (!bounds) {
      showToast('Paint or select an area to copy.', 'error');
      return;
    }
    try {
      const imageCanvas = await renderFullCommittedCanvas();
      const output = cropCanvas(imageCanvas, bounds);
      const context = output.getContext('2d');
      if (!context) throw new Error('The selected pixels could not be copied.');
      context.globalCompositeOperation = 'destination-in';
      context.drawImage(maskCanvas, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, bounds.width, bounds.height);
      const blob = await canvasToBlob(output);
      const imageUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      setCanvasClipboard({
        asset: createUmbraCanvasImageAsset({
          name: `selection_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: bounds.width,
          height: bounds.height,
          objectUrl: true,
        }),
        transform: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, rotation: 0, scaleX: 1, scaleY: 1 },
      });
      showToast('Masked pixels copied to the canvas clipboard.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to copy the selected pixels.', 'error');
    }
  }, [canvasReady, renderFullCommittedCanvas, showToast]);

  const pasteCanvasSelection = React.useCallback(() => {
    if (!canvasClipboard) return;
    const asset = createUmbraCanvasImageAsset({ ...canvasClipboard.asset, id: undefined });
    dispatchCanvasDocument({
      type: 'add_raster_layer',
      name: 'Pasted Selection',
      role: 'paint',
      asset,
      transform: {
        ...canvasClipboard.transform,
        x: canvasClipboard.transform.x + 16,
        y: canvasClipboard.transform.y + 16,
      },
    });
    showToast('Selection pasted as an independent raster layer.', 'success');
  }, [canvasClipboard, showToast]);

  const renderIsolatedVisualLayers = React.useCallback(async (layerIds: string[], signal?: AbortSignal) => {
    if (!canvasDocument) throw new Error('Open a canvas project first.');
    if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
    const selected = new Set(layerIds);
    const isolated: UmbraCanvasDocument = {
      ...structuredClone(canvasDocument),
      staging: [],
      previewStageId: '',
      layers: canvasDocument.layers.map((layer) => {
        if (layer.kind === 'group') return { ...layer, visible: false };
        if (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient') {
          return { ...layer, visible: selected.has(layer.id), groupId: undefined };
        }
        return layer;
      }),
    };
    const output = document.createElement('canvas');
    const rendered = await renderCanvasDocument(output, isolated, null, true, null, {
      shouldAbort: () => !!signal?.aborted,
      yieldEveryLayers: 1,
    });
    if (!rendered) {
      if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
      throw new Error('The layer render was interrupted.');
    }
    return output;
  }, [canvasDocument]);

  const renderLayerToFullCanvas = React.useCallback(async (layer: UmbraCanvasLayer, signal?: AbortSignal) => {
    if (!canvasDocument) throw new Error('Open a canvas project first.');
    if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
    if (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient') {
      return renderIsolatedVisualLayers([layer.id], signal);
    }
    const fullCanvas = { x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height };
    if (layer.kind === 'control' || layer.kind === 'reference') {
      const output = await renderImageTransformIntoRegion(layer.asset.imageUrl, layer.transform, fullCanvas);
      if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
      return output;
    }
    if (layer.kind === 'mask') {
      if (!layer.dataUrl) throw new Error(`${layer.name} is empty.`);
      const output = await renderImageTransformIntoRegion(layer.dataUrl, layer.transform, fullCanvas);
      if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
      return output;
    }
    if (layer.kind === 'regional_guidance') {
      const mask = getUmbraCanvasMaskLayer(canvasDocument, layer.maskLayerId);
      if (!mask?.dataUrl) throw new Error(`${layer.name} has no regional mask.`);
      const output = await renderImageTransformIntoRegion(mask.dataUrl, mask.transform, fullCanvas);
      if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
      return output;
    }
    if (layer.kind === 'group') {
      const isolated: UmbraCanvasDocument = {
        ...structuredClone(canvasDocument),
        staging: [],
        previewStageId: '',
        layers: canvasDocument.layers.map((candidate) => {
          if (candidate.kind === 'group') return { ...candidate, visible: candidate.id === layer.id };
          if (candidate.kind === 'raster' || candidate.kind === 'text' || candidate.kind === 'gradient') {
            return { ...candidate, visible: candidate.groupId === layer.id && candidate.visible };
          }
          return candidate;
        }),
      };
      const output = document.createElement('canvas');
      const rendered = await renderCanvasDocument(output, isolated, null, true, null, {
        shouldAbort: () => !!signal?.aborted,
        yieldEveryLayers: 1,
      });
      if (!rendered) {
        if (signal?.aborted) throw new DOMException('Layer rendering was canceled.', 'AbortError');
        throw new Error('The group render was interrupted.');
      }
      return output;
    }
    throw new Error('This layer cannot be rendered independently.');
  }, [canvasDocument, renderIsolatedVisualLayers]);

  const assistedSelectionCanvasSourceKey = React.useMemo(() => JSON.stringify({
    visual: buildUmbraCanvasVisualRenderKey(displayDocument),
    stage: previewStage ? {
      id: previewStage.id,
      region: previewStage.region,
      assetId: previewStage.asset.id,
      asset: canvasResourceRevision(previewStage.asset.imageUrl),
    } : null,
    transparent: transparentDisplay,
  }), [displayDocument, previewStage, transparentDisplay]);
  const assistedSelectionLayerSourceKey = React.useMemo(
    () => buildUmbraAssistedSelectionLayerSourceKey(canvasDocument, activeCanvasLayer),
    [activeCanvasLayer, canvasDocument],
  );
  const assistedSelectionThreshold = samGuideMode === 'prompt' ? clipSegThreshold : samThreshold;
  const assistedSelectionSignature = React.useMemo(() => buildUmbraAssistedSelectionSignature({
    projectId: canvasDocument?.id || '',
    guideMode: samGuideMode,
    sourceMode: samSourceMode,
    sourceLayerId: activeCanvasLayer?.id || '',
    sourceRevision: samSourceMode === 'layer' ? assistedSelectionLayerSourceKey : assistedSelectionCanvasSourceKey,
    points: samPoints,
    box: samBox,
    prompt: clipSegPrompt,
    modelName: samModelName,
    deviceMode: samDeviceMode,
    threshold: assistedSelectionThreshold,
    invert: samInvert,
  }), [activeCanvasLayer?.id, assistedSelectionCanvasSourceKey, assistedSelectionLayerSourceKey, assistedSelectionThreshold, canvasDocument?.id, clipSegPrompt, samBox, samDeviceMode, samGuideMode, samInvert, samModelName, samPoints, samSourceMode]);
  const assistedSelectionCanProcess = samGuideMode === 'prompt'
    ? clipSegAvailable && !!clipSegPrompt.trim()
    : !!samModelName && (samPoints.length > 0 || !!samBox);
  const assistedSelectionPreviewCurrent = assistedSelectionPreview?.signature === assistedSelectionSignature;
  const assistedSelectionOutputAvailable = samOutputMode === 'active_mask'
    ? !maskEditingLocked
    : samOutputMode === 'replace_layer'
      ? samSourceMode === 'layer' && Boolean(activeRasterLayer || activeControlLayer)
      : samOutputMode === 'regional_guidance'
        ? regionalGuidanceAvailable && regionalGuidanceLayers.length < regionalGuidanceMaxLayers
        : samOutputMode === 'control'
          ? controlLayersAvailable
            && Boolean(canvasDocument)
            && getUmbraCanvasControlLayers(canvasDocument).length < controlLayersMaxLayers
          : true;
  const assistedSelectionOutputReason = samOutputMode === 'active_mask' && maskEditingLocked
    ? 'Unlock the active mask or choose a different destination.'
    : samOutputMode === 'replace_layer' && (samSourceMode !== 'layer' || !activeRasterLayer && !activeControlLayer)
      ? 'Replace Layer requires Layer source mode with an active raster or Control layer.'
      : samOutputMode === 'regional_guidance' && !assistedSelectionOutputAvailable
        ? regionalGuidanceReason || `This pipeline supports at most ${regionalGuidanceMaxLayers} regional guidance layers.`
        : samOutputMode === 'control' && !assistedSelectionOutputAvailable
          ? controlLayersReason || `This pipeline supports at most ${controlLayersMaxLayers} control layers.`
          : '';

  React.useEffect(() => {
    if (assistedSelectionOutputAvailable) return;
    setSamOutputMode(maskEditingLocked ? 'new_mask' : 'active_mask');
  }, [assistedSelectionOutputAvailable, maskEditingLocked]);

  const runSamSelection = React.useCallback(async (announce = true) => {
    if (!source || !canvasReady || samRunning) return;
    if (!comfyConnected) {
      showToast('Launch ComfyUI before using assisted selection.', 'error');
      return;
    }
    if (samGuideMode === 'prompt') {
      if (!clipSegAvailable) {
        showToast('Install the text-selection model before using prompt selection.', 'error');
        return;
      }
      if (!clipSegPrompt.trim()) {
        showToast('Enter an object or region to select.', 'error');
        return;
      }
    } else {
      if (!samModelName) {
        showToast('No SAM model is installed.', 'error');
        return;
      }
      if (samPoints.length <= 0 && !samBox) {
        showToast('Add a positive point or draw a box guide first.', 'error');
        return;
      }
    }
    setSamRunning(true);
    try {
      const selectionSource = samSourceMode === 'layer' && activeCanvasLayer
        ? await renderLayerToFullCanvas(activeCanvasLayer)
        : await renderFullCommittedCanvas();
      const image = await canvasToBlob(selectionSource);
      const mask = samGuideMode === 'prompt'
        ? await detectUmbraClipSegMask({
          image,
          prompt: clipSegPrompt,
          deviceMode: samDeviceMode,
          threshold: clipSegThreshold,
        })
        : await detectUmbraSamMask({
          image,
          modelName: samModelName,
          deviceMode: samDeviceMode,
          threshold: samThreshold,
          points: samPoints,
          box: samBox,
        });
      const selectionMask = await prepareAssistedSelectionMask(mask, samInvert);
      const selectionLabel = samGuideMode === 'prompt' ? 'Prompt' : 'Assisted';
      const imageUrl = URL.createObjectURL(await canvasToBlob(selectionMask));
      replaceAssistedSelectionPreview({ imageUrl, signature: assistedSelectionSignature, label: selectionLabel });
      if (announce) showToast(`${selectionLabel} selection preview ready.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Assisted selection failed.', 'error');
    } finally {
      setSamRunning(false);
    }
  }, [activeCanvasLayer, assistedSelectionSignature, canvasReady, clipSegAvailable, clipSegPrompt, clipSegThreshold, comfyConnected, prepareAssistedSelectionMask, renderFullCommittedCanvas, renderLayerToFullCanvas, replaceAssistedSelectionPreview, samBox, samDeviceMode, samGuideMode, samInvert, samModelName, samPoints, samRunning, samSourceMode, samThreshold, showToast, source]);

  const applyAssistedSelection = React.useCallback(async () => {
    if (!source || !canvasDocument || !canvasReady || samRunning || !assistedSelectionPreview) return;
    if (assistedSelectionPreview.signature !== assistedSelectionSignature) {
      showToast('The assisted-selection preview is stale. Process the updated guides before applying it.', 'error');
      return;
    }
    setSamRunning(true);
    try {
      const previewImage = await loadHtmlImage(assistedSelectionPreview.imageUrl);
      const selectionMask = document.createElement('canvas');
      selectionMask.width = canvasDocument.width;
      selectionMask.height = canvasDocument.height;
      const selectionContext = selectionMask.getContext('2d');
      if (!selectionContext) throw new Error('The assisted-selection preview could not be read.');
      selectionContext.drawImage(previewImage, 0, 0, selectionMask.width, selectionMask.height);
      const selectionLabel = assistedSelectionPreview.label;
      if (samOutputMode === 'active_mask') {
        if (maskEditingLocked) throw new Error('Unlock the active mask before applying the assisted selection.');
        applyMaskSelection((target) => target.drawImage(selectionMask, 0, 0));
        commitMask();
        showToast(`${selectionLabel} selection added to the active mask.`, 'success');
      } else if (samOutputMode === 'new_mask' || samOutputMode === 'regional_guidance') {
        if (samOutputMode === 'regional_guidance'
          && (!regionalGuidanceAvailable || regionalGuidanceLayers.length >= regionalGuidanceMaxLayers)) {
          throw new Error(regionalGuidanceReason || `This pipeline supports at most ${regionalGuidanceMaxLayers} regional guidance layers.`);
        }
        const imageUrl = URL.createObjectURL(await canvasToBlob(selectionMask));
        layerAssetObjectUrlsRef.current.add(imageUrl);
        if (samOutputMode === 'new_mask') {
          dispatchCanvasDocument({ type: 'add_inpaint_mask', name: `${selectionLabel} Selection`, dataUrl: imageUrl });
          showToast(`${selectionLabel} selection saved as a new inpaint mask.`, 'success');
        } else {
          dispatchCanvasDocument({ type: 'add_regional_guidance', name: `${selectionLabel} Region`, dataUrl: imageUrl });
          showToast(`${selectionLabel} selection saved as regional guidance.`, 'success');
        }
      } else {
        const adapterType = controlAdapterTypes[0];
        const controlMode = controlModes[0];
        if (samOutputMode === 'replace_layer'
          && (samSourceMode !== 'layer' || !activeRasterLayer && !activeControlLayer)) {
          throw new Error('Replace Layer requires Layer source mode with an active raster or Control layer.');
        }
        if (samOutputMode === 'control') {
          if (!controlLayersAvailable || !canvasDocument || getUmbraCanvasControlLayers(canvasDocument).length >= controlLayersMaxLayers) {
            throw new Error(controlLayersReason || `This pipeline supports at most ${controlLayersMaxLayers} control layers.`);
          }
          if (!adapterType || !controlMode) throw new Error('The active pipeline does not declare a compatible control-layer contract.');
        }
        const selectionSource = samSourceMode === 'layer' && activeCanvasLayer
          ? await renderLayerToFullCanvas(activeCanvasLayer)
          : await renderFullCommittedCanvas();
        const context = selectionSource.getContext('2d');
        if (!context || !canvasDocument) throw new Error('The segmented layer could not be prepared.');
        context.save();
        context.globalCompositeOperation = 'destination-in';
        context.drawImage(selectionMask, 0, 0);
        context.restore();
        const imageUrl = URL.createObjectURL(await canvasToBlob(selectionSource));
        layerAssetObjectUrlsRef.current.add(imageUrl);
        const name = `${selectionLabel} Selection`;
        const asset = createUmbraCanvasImageAsset({
          name: `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        });
        if (samOutputMode === 'raster') {
          dispatchCanvasDocument({ type: 'add_raster_layer', name, role: 'paint', asset });
          showToast(`${selectionLabel} selection saved as a raster layer.`, 'success');
        } else if (samOutputMode === 'replace_layer' && activeRasterLayer) {
          dispatchCanvasDocument({
            type: 'apply_raster_filter',
            layerId: activeRasterLayer.id,
            asset,
            transform: { x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height, rotation: 0, scaleX: 1, scaleY: 1 },
            name: activeRasterLayer.name,
          });
          showToast(`${activeRasterLayer.name} replaced with its segmented pixels.`, 'success');
        } else if (samOutputMode === 'replace_layer' && activeControlLayer) {
          dispatchCanvasDocument({
            type: 'apply_control_filter',
            layerId: activeControlLayer.id,
            asset,
            transform: { x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height, rotation: 0, scaleX: 1, scaleY: 1 },
            name: activeControlLayer.name,
          });
          showToast(`${activeControlLayer.name} replaced with its segmented pixels.`, 'success');
        } else {
          dispatchCanvasDocument({
            type: 'add_control_layer',
            name: `${name} Control`,
            asset,
            adapterType,
            controlMode,
            controlType: 'raw',
          });
          showToast(`${selectionLabel} selection saved as a control layer.`, 'success');
        }
      }
      clearAssistedSelectionPreview();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The assisted selection could not be applied.', 'error');
    } finally {
      setSamRunning(false);
    }
  }, [activeCanvasLayer, activeControlLayer, activeRasterLayer, applyMaskSelection, assistedSelectionPreview, assistedSelectionSignature, canvasDocument, canvasReady, clearAssistedSelectionPreview, commitMask, controlAdapterTypes, controlLayersAvailable, controlLayersMaxLayers, controlLayersReason, controlModes, dispatchCanvasDocument, maskEditingLocked, regionalGuidanceAvailable, regionalGuidanceLayers.length, regionalGuidanceMaxLayers, regionalGuidanceReason, renderFullCommittedCanvas, renderLayerToFullCanvas, samOutputMode, samRunning, samSourceMode, showToast, source]);

  React.useEffect(() => {
    if (!canvasPreferences.autoProcessAssistedSelection
      || tool !== 'sam'
      || !comfyConnected
      || samRunning
      || clipSegInstalling
      || !assistedSelectionCanProcess
      || assistedSelectionPreviewCurrent) return;
    const timeout = window.setTimeout(() => void runSamSelection(false), samGuideMode === 'prompt' ? 700 : 300);
    return () => window.clearTimeout(timeout);
  }, [assistedSelectionCanProcess, assistedSelectionPreviewCurrent, canvasPreferences.autoProcessAssistedSelection, clipSegInstalling, comfyConnected, runSamSelection, samGuideMode, samRunning, tool]);

  const convertCanvasToMaskObjectUrl = React.useCallback(async (output: HTMLCanvasElement) => {
    const context = output.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The selected layer could not be converted to a mask.');
    let hasPixels = false;
    let hasTransparency = false;
    for (let tileY = 0; tileY < output.height; tileY += PIXEL_READBACK_TILE_ROWS) {
      const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, output.height - tileY);
      const pixels = context.getImageData(0, tileY, output.width, tileHeight);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const alpha = pixels.data[index + 3];
        if (alpha > 0) hasPixels = true;
        if (alpha < 250) hasTransparency = true;
      }
    }
    if (!hasPixels) throw new Error('The selected layer has no visible pixels.');
    for (let tileY = 0; tileY < output.height; tileY += PIXEL_READBACK_TILE_ROWS) {
      const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, output.height - tileY);
      const pixels = context.getImageData(0, tileY, output.width, tileHeight);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const sourceAlpha = pixels.data[index + 3] / 255;
        const luminance = (pixels.data[index] * 0.2126 + pixels.data[index + 1] * 0.7152 + pixels.data[index + 2] * 0.0722) / 255;
        pixels.data[index] = 255;
        pixels.data[index + 1] = 48;
        pixels.data[index + 2] = 76;
        pixels.data[index + 3] = Math.round(255 * sourceAlpha * (hasTransparency ? 1 : luminance));
      }
      context.putImageData(pixels, 0, tileY);
    }
    const dataUrl = URL.createObjectURL(await canvasToBlob(output));
    layerAssetObjectUrlsRef.current.add(dataUrl);
    return dataUrl;
  }, []);

  const writeCanvasToSystemClipboard = React.useCallback(async (canvas: HTMLCanvasElement, label: string, signal?: AbortSignal) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard access is unavailable in this browser.');
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': await encodeFullResolutionCanvas(canvas, { signal }) })]);
    showToast(`${label} copied to the system clipboard.`, 'success');
  }, [showToast]);

  const copyActiveLayerToSystemClipboard = React.useCallback(async () => {
    if (!activeCanvasLayer) return;
    await runFullResolutionOperation('Copy active layer', async ({ signal, setPhase }) => {
      const output = await renderLayerToFullCanvas(activeCanvasLayer, signal);
      setPhase('encoding');
      await writeCanvasToSystemClipboard(output, 'Active layer', signal);
    });
  }, [activeCanvasLayer, renderLayerToFullCanvas, runFullResolutionOperation, writeCanvasToSystemClipboard]);

  const renderCommittedCanvas = React.useCallback(async (options: {
    signal?: AbortSignal;
    onLayerRendered?: (completed: number) => void;
  } = {}) => {
    if (!canvasDocument) throw new Error('Open a canvas project first.');
    const output = document.createElement('canvas');
    const rendered = await renderCanvasDocument(output, canvasDocument, null, true, null, {
      shouldAbort: () => !!options.signal?.aborted,
      yieldEveryLayers: 1,
      onLayerRendered: options.onLayerRendered,
    });
    if (!rendered) {
      if (options.signal?.aborted) throw new DOMException('Canvas rendering was canceled.', 'AbortError');
      throw new Error('The canvas render was interrupted.');
    }
    return output;
  }, [canvasDocument]);

  const copyCanvasToSystemClipboard = React.useCallback(async (regionOnly: boolean) => {
    if (!canvasDocument) return;
    await runFullResolutionOperation(regionOnly ? 'Copy generation region' : 'Copy canvas', async ({ signal, setPhase }) => {
      const output = await renderCommittedCanvas({ signal });
      const region = regionOnly ? canvasDocument.generationRegion : null;
      if (regionOnly && !region) throw new Error('Set a generation region before copying it.');
      setPhase('encoding');
      await writeCanvasToSystemClipboard(region ? cropCanvas(output, region) : output, region ? 'Generation region' : 'Canvas', signal);
    });
  }, [canvasDocument, renderCommittedCanvas, runFullResolutionOperation, writeCanvasToSystemClipboard]);

  const downloadCanvasImage = React.useCallback(async (regionOnly: boolean) => {
    if (!canvasDocument) return;
    await runFullResolutionOperation(regionOnly ? 'Export generation region' : 'Export canvas PNG', async ({ signal, setPhase }) => {
      const output = await renderCommittedCanvas({ signal });
      const region = regionOnly ? canvasDocument.generationRegion : null;
      if (regionOnly && !region) throw new Error('Set a generation region before exporting it.');
      setPhase('encoding');
      const url = URL.createObjectURL(await encodeFullResolutionCanvas(region ? cropCanvas(output, region) : output, { signal }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${canvasDocument.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'umbra-canvas'}${region ? '-region' : ''}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }, [canvasDocument, renderCommittedCanvas, runFullResolutionOperation]);

  const buildCanvasSaveMetadata = React.useCallback((width: number, height: number, outputSeed: number) => {
    if (!canvasDocument) throw new Error('Open a canvas before saving it.');
    return {
      canvasProjectId: canvasDocument.id,
      originalSourcePath: source?.originalPath || source?.path || '',
      documentName: canvasDocument.name,
      operationMode: canvasDocument.operationMode,
      regionOnly: true,
      prompt,
      negativePrompt,
      checkpointName,
      modelFamily,
      modelSource,
      loras: loras.map((lora) => ({
        id: lora.id,
        name: lora.name,
        enabled: lora.enabled,
        strengthModel: lora.strengthModel,
        strengthClip: lora.strengthClip,
      })),
      seed: outputSeed,
      steps: Number(steps) || 1,
      cfg: Number(cfg) || 0,
      clipSkip: Number(clipSkip) || 1,
      samplerName,
      scheduler,
      samples,
      denoise,
      maskGrow,
      maskFeather,
      contextPadding,
      processingScaleMode,
      processingWidth,
      processingHeight,
      coherenceMode,
      coherenceEdgeSize,
      coherenceMinimumDenoise,
      seamlessX,
      seamlessY,
      outputOnlyMaskedRegions,
      fillMode,
      infillColor,
      infillTileSize,
      inpaintModelName,
      colorMatch,
      differentialStrength,
      softInpaintEnabled,
      softInpaintPreservation,
      softInpaintTransitionContrast,
      softInpaintMaskInfluence,
      regionalGuidanceCount: getUmbraCanvasRegionalGuidanceLayers(canvasDocument).filter((layer) => layer.enabled !== false).length,
      controlLayerCount: getUmbraCanvasControlLayers(canvasDocument).filter((layer) => layer.enabled !== false).length,
      referenceLayerCount: getUmbraCanvasReferenceLayers(canvasDocument).filter((layer) => layer.enabled !== false).length,
      width,
      height,
    };
  }, [
    canvasDocument,
    cfg,
    checkpointName,
    clipSkip,
    coherenceEdgeSize,
    coherenceMinimumDenoise,
    coherenceMode,
    colorMatch,
    contextPadding,
    denoise,
    differentialStrength,
    softInpaintEnabled,
    softInpaintMaskInfluence,
    softInpaintPreservation,
    softInpaintTransitionContrast,
    fillMode,
    infillColor,
    infillTileSize,
    inpaintModelName,
    loras,
    maskFeather,
    maskGrow,
    modelFamily,
    modelSource,
    negativePrompt,
    outputOnlyMaskedRegions,
    processingHeight,
    processingScaleMode,
    processingWidth,
    prompt,
    samplerName,
    samples,
    scheduler,
    seamlessX,
    seamlessY,
    source,
    steps,
  ]);

  const saveCanvasToGallery = React.useCallback(async (regionOnly: boolean) => {
    if (!canvasDocument || isSavingCanvas) return;
    await runFullResolutionOperation(regionOnly ? 'Save generation region' : 'Save canvas to Gallery', async ({ signal, setPhase }) => {
      setIsSavingCanvas(true);
      try {
        const committed = await renderCommittedCanvas({ signal });
        const region = regionOnly ? canvasDocument.generationRegion : null;
        if (regionOnly && !region) throw new Error('Set a generation region before saving it.');
        const output = region ? cropCanvas(committed, region) : committed;
        setPhase('encoding');
        const blob = await encodeFullResolutionCanvas(output, { signal });
        setPhase('saving');
        const result = await saveUmbraUiCanvasToGallery(
          blob,
          `${canvasDocument.name}${region ? ' Region' : ''}`,
          { ...buildCanvasSaveMetadata(output.width, output.height, Number(seed) || 0), regionOnly: !!region },
          signal,
        );
        showToast(`${result.filename || 'Canvas'} saved to Gallery.`, 'success');
      } finally {
        setIsSavingCanvas(false);
      }
    });
  }, [buildCanvasSaveMetadata, canvasDocument, isSavingCanvas, renderCommittedCanvas, runFullResolutionOperation, seed, showToast]);

  const sendCanvasToImg2Img = React.useCallback(async () => {
    if (!canvasDocument || isSavingCanvas) return;
    if (previewStage) {
      showToast('Accept the staged inpaint result before continuing in IMG2IMG.', 'error');
      return;
    }
    await runFullResolutionOperation('Send canvas to IMG2IMG', async ({ signal, setPhase }) => {
      setIsSavingCanvas(true);
      try {
        const output = await renderCommittedCanvas({ signal });
        setPhase('encoding');
        const blob = await encodeFullResolutionCanvas(output, { signal });
        setPhase('saving');
        const result = await saveUmbraUiCanvasToGallery(
          blob,
          `${canvasDocument.name} IMG2IMG`,
          { ...buildCanvasSaveMetadata(output.width, output.height, Number(seed) || 0), regionOnly: false },
          signal,
        );
        await stageUmbraUiMediaHandoff({
          mode: 'img2img',
          path: result.path,
          originalSourcePath: source?.originalPath || source?.path || result.path,
          name: result.filename,
          source: 'umbra-ui-inpaint-result',
        });
        showToast('Accepted inpaint canvas opened in IMG2IMG. Your detailer pipeline is still enabled.', 'success');
      } finally {
        setIsSavingCanvas(false);
      }
    });
  }, [buildCanvasSaveMetadata, canvasDocument, isSavingCanvas, previewStage, renderCommittedCanvas, runFullResolutionOperation, seed, showToast, source]);

  const transformCanvasArtboard = React.useCallback(async (operation: CanvasArtboardTransformOperation) => {
    if (!canvasDocument) return;
    if (canvasStudio.activeArtboard?.locked) {
      showToast('Unlock the artboard before transforming it.', 'error');
      return;
    }
    if (canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || previewStage) {
      showToast('Accept or discard staged work before transforming the artboard.', 'error');
      return;
    }
    const rotates = operation === 'rotate_left' || operation === 'rotate_right';
    const nextWidth = rotates ? canvasDocument.height : canvasDocument.width;
    const nextHeight = rotates ? canvasDocument.width : canvasDocument.height;
    await runFullResolutionOperation(
      operation.startsWith('flip') ? 'Flip artboard' : 'Rotate artboard',
      async ({ signal, setPhase }) => {
        const createdMaskUrls: string[] = [];
        try {
          // Keep delayed brush snapshots from becoming a second history entry after
          // the complete-artboard transform. The transformed masks below are the
          // authoritative snapshots for this single undoable edit.
          maskSnapshotGenerationRef.current += 1;
          await maskSnapshotQueueRef.current.catch(() => undefined);
          const maskSnapshots: Array<{ layerId: string; dataUrl: string }> = [];
          for (const layer of canvasDocument.layers) {
            if (layer.kind !== 'mask') continue;
            if (!layer.dataUrl) {
              maskSnapshots.push({ layerId: layer.id, dataUrl: '' });
              continue;
            }
            const renderedMask = await renderLayerToFullCanvas(layer, signal);
            setPhase('encoding');
            const transformedMask = transformFullCanvasBitmap(renderedMask, operation);
            const maskUrl = URL.createObjectURL(await encodeFullResolutionCanvas(transformedMask, { signal }));
            createdMaskUrls.push(maskUrl);
            maskSnapshots.push({ layerId: layer.id, dataUrl: maskUrl });
          }
          if (signal.aborted) throw new DOMException('Artboard transform was canceled.', 'AbortError');
          const expectedRevision = canvasDocument.revision + 1;
          for (const maskUrl of createdMaskUrls) {
            maskSnapshotUrlsRef.current.add(maskUrl);
            maskSnapshotLeaseRef.current.set(maskUrl, expectedRevision);
          }
          dispatchCanvasDocument({ type: 'transform_canvas', operation, maskSnapshots });
          const activeMaskSnapshot = maskSnapshots.find((entry) => entry.layerId === canvasDocument.activeMaskLayerId)?.dataUrl || '';
          pendingMaskRestoreRef.current = activeMaskSnapshot;
          pendingMaskRestoreCommitRef.current = false;
          setCanvasSize({ width: nextWidth, height: nextHeight });
          setDraftMargins(EMPTY_MARGINS);
          setAppliedMargins(EMPTY_MARGINS);
          setLastBox(null);
          setPolygonPoints([]);
          setSamPoints([]);
          setSamBox(null);
          setZoom(1);
          setMaskResetRevision((value) => value + 1);
          showToast(operation.startsWith('flip') ? 'Artboard flipped as one undoable edit.' : 'Artboard rotated as one undoable edit.', 'success');
        } catch (error) {
          for (const maskUrl of createdMaskUrls) {
            maskSnapshotUrlsRef.current.delete(maskUrl);
            maskSnapshotLeaseRef.current.delete(maskUrl);
            URL.revokeObjectURL(maskUrl);
          }
          throw error;
        }
      },
    );
  }, [canvasDocument, canvasStudio.activeArtboard?.locked, previewStage, renderLayerToFullCanvas, runFullResolutionOperation, showToast]);

  const removeCanvasBackground = React.useCallback(async () => {
    if (!canvasDocument) return;
    if (canvasStudio.activeArtboard?.locked) {
      showToast('Unlock the artboard before creating a character cutout.', 'error');
      return;
    }
    if (!backgroundRemovalAvailable) {
      showToast('Background removal requires ComfyUI and the Remove Background node.', 'error');
      return;
    }
    if (canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || previewStage) {
      showToast('Accept or discard staged work before creating a character cutout.', 'error');
      return;
    }
    await runFullResolutionOperation('Remove character background', async ({ signal, setPhase }) => {
      const output = await renderCommittedCanvas({ signal });
      setPhase('encoding');
      const sourceBlob = await encodeFullResolutionCanvas(output, { signal });
      setPhase('processing');
      const result = await removeUmbraUiImageBackground({
        image: sourceBlob,
        imageName: `${canvasDocument.name || 'character'}-source.png`,
        model: 'isnet-anime',
        signal,
      });
      const imageUrl = URL.createObjectURL(result.blob);
      try {
        const image = await loadHtmlImage(imageUrl);
        if (signal.aborted) throw new DOMException('Background removal was canceled.', 'AbortError');
        layerAssetObjectUrlsRef.current.add(imageUrl);
        dispatchCanvasDocument({
          type: 'add_cutout_layer',
          name: 'Character Cutout',
          asset: createUmbraCanvasImageAsset({
            name: result.filename || 'character-cutout.png',
            path: '',
            imageUrl,
            width: image.naturalWidth,
            height: image.naturalHeight,
            objectUrl: true,
          }),
        });
        showToast('Transparent character cutout added above the preserved original layers.', 'success');
      } catch (error) {
        layerAssetObjectUrlsRef.current.delete(imageUrl);
        URL.revokeObjectURL(imageUrl);
        throw error;
      }
    });
  }, [backgroundRemovalAvailable, canvasDocument, canvasStudio.activeArtboard?.locked, previewStage, renderCommittedCanvas, runFullResolutionOperation, showToast]);

  const saveActiveLayerToGallery = React.useCallback(async () => {
    if (!canvasDocument || !activeCanvasLayer || isSavingCanvas) return;
    await runFullResolutionOperation('Save active layer', async ({ signal, setPhase }) => {
      setIsSavingCanvas(true);
      try {
        const isolated = await renderLayerToFullCanvas(activeCanvasLayer, signal);
        const bounds = findMaskAlphaBounds(isolated);
        if (!bounds) throw new Error('The active layer has no visible pixels inside the canvas.');
        const output = cropCanvas(isolated, bounds);
        setPhase('encoding');
        const blob = await encodeFullResolutionCanvas(output, { signal });
        setPhase('saving');
        const result = await saveUmbraUiCanvasToGallery(
          blob,
          `${canvasDocument.name} ${activeCanvasLayer.name}`,
          buildCanvasSaveMetadata(output.width, output.height, Number(seed) || 0),
          signal,
        );
        showToast(`${result.filename || activeCanvasLayer.name} saved to Gallery.`, 'success');
      } finally {
        setIsSavingCanvas(false);
      }
    });
  }, [activeCanvasLayer, buildCanvasSaveMetadata, canvasDocument, isSavingCanvas, renderLayerToFullCanvas, runFullResolutionOperation, seed, showToast]);

  const saveStagesToGallery = React.useCallback(async (
    stages: UmbraCanvasStage[],
    options: { announce?: boolean } = {},
  ) => {
    if (!canvasDocument || stages.length <= 0) return;
    const announce = options.announce !== false;
    const pendingStages = stages.filter((stage) => (
      !stage.gallerySavedAt
      && !stageGallerySaveInFlightRef.current.has(stage.id)
    ));
    if (pendingStages.length <= 0) {
      if (announce) showToast('The selected staged results are already saved to Gallery.', 'success');
      return;
    }
    for (const stage of pendingStages) stageGallerySaveInFlightRef.current.add(stage.id);
    setIsSavingStages(true);
    const receipts: Array<{ stageId: string; path: string; savedAt: number }> = [];
    const failures: string[] = [];
    for (const stage of pendingStages) {
      try {
        const response = await fetch(stage.asset.imageUrl);
        if (!response.ok) throw new Error(`Could not read ${stage.name || 'a staged result'} (${response.status}).`);
        const image = await response.blob();
        const result = await saveUmbraUiCanvasToGallery(
          image,
          `${canvasDocument.name} ${stage.name || `Stage ${receipts.length + 1}`}`,
          buildCanvasSaveMetadata(stage.asset.width, stage.asset.height, stage.seed),
        );
        receipts.push({ stageId: stage.id, path: result.path, savedAt: Date.now() });
      } catch (error) {
        failures.push(error instanceof Error ? error.message : `${stage.name || 'A staged result'} could not be saved.`);
      } finally {
        stageGallerySaveInFlightRef.current.delete(stage.id);
      }
    }
    if (receipts.length > 0) dispatchCanvasDocument({ type: 'mark_stages_gallery_saved', receipts });
    setIsSavingStages(stageGallerySaveInFlightRef.current.size > 0);
    if (failures.length > 0) {
      const detail = failures[0];
      showToast(receipts.length > 0 ? `${receipts.length}/${pendingStages.length} saved. ${detail}` : detail, 'error');
    } else if (announce) {
      showToast(`${receipts.length} staged result${receipts.length === 1 ? '' : 's'} saved to Gallery.`, 'success');
    }
  }, [buildCanvasSaveMetadata, canvasDocument, dispatchCanvasDocument, showToast]);

  React.useEffect(() => {
    if (!canvasPreferences.autoSaveStagesToGallery || !canvasDocument?.staging.length) return;
    const unsavedStages = canvasDocument.staging.filter((stage) => (
      !stage.gallerySavedAt
      && !stageGallerySaveInFlightRef.current.has(stage.id)
    ));
    if (unsavedStages.length > 0) void saveStagesToGallery(unsavedStages, { announce: false });
  }, [canvasDocument?.staging, canvasPreferences.autoSaveStagesToGallery, saveStagesToGallery]);

  const exportCanvasToPsd = React.useCallback(async () => {
    if (!canvasDocument || isExportingPsd || fullResolutionOperationRef.current) return;
    if (canvasDocument.width * canvasDocument.height > UMBRA_CANVAS_INTERACTIVE_MAX_PIXELS || canvasDocument.width > 8192 || canvasDocument.height > 8192) {
      showToast('PSD export is limited to 8192 pixels per side and 64 megapixels.', 'error');
      return;
    }
    const groups = canvasDocument.layers.filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group' && layer.visible);
    const groupIds = new Set(groups.map((group) => group.id));
    const visibleLayers = canvasDocument.layers.filter((layer): layer is UmbraVisualCanvasLayer => (
      (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient')
      && layer.visible
      && (!layer.groupId || groupIds.has(layer.groupId))
    ));
    if (visibleLayers.length <= 0) {
      showToast('There are no visible visual layers to export.', 'error');
      return;
    }
    const controller = new AbortController();
    psdExportAbortRef.current = false;
    psdExportAbortControllerRef.current = controller;
    setIsExportingPsd(true);
    setPsdExportProgress({ completed: 0, total: visibleLayers.length });
    try {
      const renderLayer = async (layer: UmbraVisualCanvasLayer): Promise<PsdLayer | null> => {
        if (psdExportAbortRef.current || controller.signal.aborted) throw new DOMException('PSD export canceled.', 'AbortError');
        const isolated: UmbraCanvasDocument = {
          ...structuredClone(canvasDocument),
          staging: [],
          previewStageId: '',
          layers: canvasDocument.layers.map((candidate) => {
            if (candidate.kind === 'group') return { ...candidate, visible: false };
            if (candidate.kind === 'raster' || candidate.kind === 'text' || candidate.kind === 'gradient') {
              return {
                ...candidate,
                visible: candidate.id === layer.id,
                groupId: undefined,
                opacity: candidate.id === layer.id ? 1 : candidate.opacity,
                blendMode: candidate.id === layer.id ? 'source-over' as const : candidate.blendMode,
              };
            }
            return candidate;
          }),
        };
        const rawBounds = visualLayerBounds(layer);
        const left = Math.max(0, Math.floor(rawBounds.x));
        const top = Math.max(0, Math.floor(rawBounds.y));
        const right = Math.min(canvasDocument.width, Math.ceil(rawBounds.x + rawBounds.width));
        const bottom = Math.min(canvasDocument.height, Math.ceil(rawBounds.y + rawBounds.height));
        if (right <= left || bottom <= top) return null;
        const canvas = document.createElement('canvas');
        const completed = await renderCanvasDocument(
          canvas,
          isolated,
          null,
          true,
          { x: left, y: top, width: right - left, height: bottom - top },
          { yieldEveryLayers: 1, shouldAbort: () => psdExportAbortRef.current || controller.signal.aborted },
        );
        if (!completed || psdExportAbortRef.current || controller.signal.aborted) throw new DOMException('PSD export canceled.', 'AbortError');
        return {
          name: layer.name,
          left,
          top,
          right,
          bottom,
          opacity: Math.round(layer.opacity * 255),
          blendMode: toPsdBlendMode(layer.blendMode),
          hidden: false,
          canvas,
        };
      };
      const rendered = new Map<string, PsdLayer>();
      for (const [index, layer] of visibleLayers.entries()) {
        const psdLayer = await renderLayer(layer);
        if (psdLayer) rendered.set(layer.id, psdLayer);
        setPsdExportProgress({ completed: index + 1, total: visibleLayers.length });
      }
      const children: PsdLayer[] = [];
      const emittedGroups = new Set<string>();
      for (const layer of canvasDocument.layers) {
        if (layer.kind === 'group' && groupIds.has(layer.id)) {
          const groupedChildren = visibleLayers.filter((candidate) => candidate.groupId === layer.id).map((candidate) => rendered.get(candidate.id)).filter((candidate): candidate is PsdLayer => !!candidate);
          if (groupedChildren.length > 0) {
            children.push({ name: layer.name, opened: !layer.collapsed, opacity: Math.round(layer.opacity * 255), blendMode: toPsdBlendMode(layer.blendMode), children: groupedChildren });
            emittedGroups.add(layer.id);
          }
        } else if ((layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient') && !layer.groupId) {
          const renderedLayer = rendered.get(layer.id);
          if (renderedLayer) children.push(renderedLayer);
        }
      }
      for (const group of groups) {
        if (emittedGroups.has(group.id)) continue;
        const groupedChildren = visibleLayers.filter((candidate) => candidate.groupId === group.id).map((candidate) => rendered.get(candidate.id)).filter((candidate): candidate is PsdLayer => !!candidate);
        if (groupedChildren.length > 0) children.push({ name: group.name, opened: !group.collapsed, opacity: Math.round(group.opacity * 255), blendMode: toPsdBlendMode(group.blendMode), children: groupedChildren });
      }
      const psd: Psd = { width: canvasDocument.width, height: canvasDocument.height, channels: 3, bitsPerChannel: 8, colorMode: 3, children };
      setPsdExportProgress({ completed: visibleLayers.length, total: visibleLayers.length + 1 });
      if (psdExportAbortRef.current || controller.signal.aborted) throw new DOMException('PSD export canceled.', 'AbortError');
      const blob = canUseUmbraPsdEncodeWorker()
        ? (await encodeUmbraPsdInWorker(psd, { signal: controller.signal })).blob
        : new Blob([(await import('ag-psd')).writePsd(psd) as BlobPart], { type: 'application/octet-stream' });
      if (psdExportAbortRef.current || controller.signal.aborted) throw new DOMException('PSD export canceled.', 'AbortError');
      setPsdExportProgress({ completed: visibleLayers.length + 1, total: visibleLayers.length + 1 });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${canvasDocument.name.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'umbra-canvas'}.psd`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`${children.length} layered PSD item${children.length === 1 ? '' : 's'} exported.`, 'success');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') showToast('Layered PSD export canceled.', 'success');
      else showToast(error instanceof Error ? error.message : 'Failed to export the layered PSD.', 'error');
    } finally {
      psdExportAbortRef.current = false;
      if (psdExportAbortControllerRef.current === controller) psdExportAbortControllerRef.current = null;
      setIsExportingPsd(false);
      setPsdExportProgress({ completed: 0, total: 0 });
    }
  }, [canvasDocument, isExportingPsd, showToast]);

  const pasteSystemClipboardImage = React.useCallback(async (toGenerationRegion: boolean) => {
    if (!canvasDocument || !navigator.clipboard?.read) {
      showToast('Image clipboard access is unavailable in this browser.', 'error');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) => candidate.types.some((type) => type.startsWith('image/')));
      const mime = item?.types.find((type) => type.startsWith('image/'));
      if (!item || !mime) throw new Error('The system clipboard does not contain an image.');
      const imageUrl = URL.createObjectURL(await item.getType(mime));
      const image = await loadHtmlImage(imageUrl);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const target = toGenerationRegion && canvasDocument.generationRegion
        ? canvasDocument.generationRegion
        : { x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height };
      const scale = Math.min(1, target.width / image.naturalWidth, target.height / image.naturalHeight);
      const width = Math.max(1, image.naturalWidth * scale);
      const height = Math.max(1, image.naturalHeight * scale);
      dispatchCanvasDocument({
        type: 'add_raster_layer',
        name: 'Clipboard Image',
        role: 'imported',
        asset: createUmbraCanvasImageAsset({ name: `clipboard_${Date.now()}.png`, path: '', imageUrl, width: image.naturalWidth, height: image.naturalHeight, objectUrl: true }),
        transform: { x: target.x + (target.width - width) / 2, y: target.y + (target.height - height) / 2, width, height },
      });
      showToast(`Clipboard image added to the ${toGenerationRegion && canvasDocument.generationRegion ? 'generation region' : 'canvas'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to paste the clipboard image.', 'error');
    }
  }, [canvasDocument, showToast]);

  const addRasterLayerFromBlob = React.useCallback(async (blob: Blob, name: string) => {
    if (!canvasDocument) return;
    const imageUrl = URL.createObjectURL(blob);
    try {
      const image = await loadHtmlImage(imageUrl);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const scale = Math.min(1, canvasDocument.width / image.naturalWidth, canvasDocument.height / image.naturalHeight);
      const width = Math.max(1, image.naturalWidth * scale);
      const height = Math.max(1, image.naturalHeight * scale);
      dispatchCanvasDocument({
        type: 'add_raster_layer',
        name: name.replace(/\.[^.]+$/, '') || 'Imported Image',
        role: 'imported',
        asset: createUmbraCanvasImageAsset({
          name: name.replace(/\.[^.]+$/, '') + '.png',
          path: '',
          imageUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          objectUrl: true,
        }),
        transform: {
          x: (canvasDocument.width - width) / 2,
          y: (canvasDocument.height - height) / 2,
          width,
          height,
        },
      });
      showToast('Raster layer added.', 'success');
    } catch (error) {
      URL.revokeObjectURL(imageUrl);
      showToast(error instanceof Error ? error.message : 'Failed to add the raster layer.', 'error');
    }
  }, [canvasDocument, showToast]);

  const addInpaintMaskFromBlob = React.useCallback(async (blob: Blob, name: string) => {
    if (!canvasDocument) return;
    const sourceUrl = URL.createObjectURL(blob);
    try {
      const image = await loadHtmlImage(sourceUrl);
      const output = document.createElement('canvas');
      output.width = canvasDocument.width;
      output.height = canvasDocument.height;
      const context = output.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The mask import canvas is unavailable.');
      const scale = Math.min(output.width / image.naturalWidth, output.height / image.naturalHeight);
      const width = Math.max(1, image.naturalWidth * scale);
      const height = Math.max(1, image.naturalHeight * scale);
      context.clearRect(0, 0, output.width, output.height);
      context.drawImage(image, (output.width - width) / 2, (output.height - height) / 2, width, height);
      const tileSize = 1024;
      for (let y = 0; y < output.height; y += tileSize) {
        for (let x = 0; x < output.width; x += tileSize) {
          const tileWidth = Math.min(tileSize, output.width - x);
          const tileHeight = Math.min(tileSize, output.height - y);
          const pixels = context.getImageData(x, y, tileWidth, tileHeight);
          convertUmbraMaskLuminanceToAlpha(pixels.data);
          context.putImageData(pixels, x, y);
        }
      }
      const dataUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'add_inpaint_mask', name: name.replace(/\.[^.]+$/, '') || 'Imported Mask', dataUrl });
      showToast('Inpaint mask added.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to add the inpaint mask.', 'error');
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }, [canvasDocument, showToast]);

  const fitGenerationRegionToVisibleLayers = React.useCallback(() => {
    if (!canvasDocument) return;
    const hiddenGroupIds = new Set(canvasDocument.layers
      .filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group' && !layer.visible)
      .map((layer) => layer.id));
    const visualLayers = canvasDocument.layers.filter((layer): layer is UmbraVisualCanvasLayer => (
      (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient')
      && layer.visible
      && (!layer.groupId || !hiddenGroupIds.has(layer.groupId))
    ));
    if (visualLayers.length <= 0) {
      showToast('There are no visible layers to fit.', 'error');
      return;
    }
    const bounds = visualLayers.map(visualLayerBounds);
    const left = Math.max(0, Math.floor(Math.min(...bounds.map((rect) => rect.x))));
    const top = Math.max(0, Math.floor(Math.min(...bounds.map((rect) => rect.y))));
    const right = Math.min(canvasDocument.width, Math.ceil(Math.max(...bounds.map((rect) => rect.x + rect.width))));
    const bottom = Math.min(canvasDocument.height, Math.ceil(Math.max(...bounds.map((rect) => rect.y + rect.height))));
    dispatchCanvasDocument({ type: 'set_generation_region', region: alignGenerationRegion({ x: left, y: top, width: right - left, height: bottom - top }) });
  }, [alignGenerationRegion, canvasDocument, showToast]);

  const fitGenerationRegionToSelectedLayers = React.useCallback(() => {
    if (!canvasDocument || selectedVisualLayers.length <= 0) {
      showToast('Select one or more visual layers to fit.', 'error');
      return;
    }
    const bounds = selectedVisualLayers.map(visualLayerBounds);
    const left = Math.max(0, Math.floor(Math.min(...bounds.map((rect) => rect.x))));
    const top = Math.max(0, Math.floor(Math.min(...bounds.map((rect) => rect.y))));
    const right = Math.min(canvasDocument.width, Math.ceil(Math.max(...bounds.map((rect) => rect.x + rect.width))));
    const bottom = Math.min(canvasDocument.height, Math.ceil(Math.max(...bounds.map((rect) => rect.y + rect.height))));
    dispatchCanvasDocument({ type: 'set_generation_region', region: alignGenerationRegion({ x: left, y: top, width: right - left, height: bottom - top }) });
  }, [alignGenerationRegion, canvasDocument, selectedVisualLayers, showToast]);

  const zoomToSelectedLayers = React.useCallback(() => {
    if (!canvasDocument || selectedVisualLayers.length <= 0) return;
    const bounds = selectedVisualLayers.map(visualLayerBounds);
    const left = Math.max(0, Math.floor(Math.min(...bounds.map((rect) => rect.x))));
    const top = Math.max(0, Math.floor(Math.min(...bounds.map((rect) => rect.y))));
    const right = Math.min(canvasDocument.width, Math.ceil(Math.max(...bounds.map((rect) => rect.x + rect.width))));
    const bottom = Math.min(canvasDocument.height, Math.ceil(Math.max(...bounds.map((rect) => rect.y + rect.height))));
    zoomToRect({ x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) });
  }, [canvasDocument, selectedVisualLayers, zoomToRect]);

  const zoomToMaskSelection = React.useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const bounds = maskCanvas ? findMaskAlphaBounds(maskCanvas) : null;
    if (!bounds) {
      showToast('The active mask has no selection to zoom to.', 'error');
      return;
    }
    zoomToRect(bounds);
  }, [showToast, zoomToRect]);

  const fitActiveLayerToGenerationRegion = React.useCallback(async (mode: UmbraCanvasFitMode) => {
    if (!canvasDocument || !activeTransformLayer || activeTransformLayer.locked) return;
    if (activeTransformLayer.kind === 'raster' && activeTransformLayer.role === 'source') return;
    const target = canvasDocument.generationRegion || {
      x: 0,
      y: 0,
      width: canvasDocument.width,
      height: canvasDocument.height,
    };
    const transform = fitUmbraCanvasTransformToRect(activeTransformLayer.transform, target, mode);
    try {
      if (activeTransformLayer.kind === 'mask') {
        let dataUrl = '';
        if (activeTransformLayer.dataUrl) {
          const baked = await renderImageTransformIntoRegion(
            activeTransformLayer.dataUrl,
            transform,
            { x: 0, y: 0, width: canvasDocument.width, height: canvasDocument.height },
          );
          dataUrl = URL.createObjectURL(await canvasToBlob(baked));
          layerAssetObjectUrlsRef.current.add(dataUrl);
        }
        dispatchCanvasDocument({ type: 'bake_inpaint_mask_transform', layerId: activeTransformLayer.id, dataUrl });
      } else {
        dispatchCanvasDocument({ type: 'set_layer_transform', layerId: activeTransformLayer.id, transform });
      }
      showToast(`${activeTransformLayer.name} fitted to the ${canvasDocument.generationRegion ? 'generation region' : 'canvas'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to fit the active layer.', 'error');
    }
  }, [activeTransformLayer, canvasDocument, showToast]);

  const resetActiveLayerTransform = React.useCallback(() => {
    if (!canResetUmbraCanvasLayerTransform(activeTransformLayer)) return;
    dispatchCanvasDocument({ type: 'reset_layer_transform', layerId: activeTransformLayer.id });
    showToast(`${activeTransformLayer.name} transform reset.`, 'success');
  }, [activeTransformLayer, dispatchCanvasDocument, showToast]);

  const beginLayerDrag = React.useCallback((event: React.DragEvent<HTMLButtonElement>, layerId: string) => {
    setDraggedLayerId(layerId);
    setLayerDropTarget(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', layerId);
  }, []);

  const previewLayerDrop = React.useCallback((event: React.DragEvent<HTMLDivElement>, targetLayerId: string) => {
    if (!draggedLayerId || draggedLayerId === targetLayerId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect();
    const side = event.clientX < bounds.left + bounds.width / 2 ? 'left' : 'right';
    const placement = side === 'left' ? 'after' : 'before';
    setLayerDropTarget((current) => (
      current?.layerId === targetLayerId && current.placement === placement
        ? current
        : { layerId: targetLayerId, placement, side }
    ));
  }, [draggedLayerId]);

  const dropLayer = React.useCallback((event: React.DragEvent<HTMLDivElement>, targetLayerId: string) => {
    event.preventDefault();
    const layerId = draggedLayerId || event.dataTransfer.getData('text/plain');
    const placement = layerDropTarget?.layerId === targetLayerId ? layerDropTarget.placement : 'after';
    if (layerId && layerId !== targetLayerId) {
      dispatchCanvasDocument({ type: 'reorder_layer', layerId, targetLayerId, placement });
    }
    setDraggedLayerId('');
    setLayerDropTarget(null);
  }, [dispatchCanvasDocument, draggedLayerId, layerDropTarget]);

  const finishLayerDrag = React.useCallback(() => {
    setDraggedLayerId('');
    setLayerDropTarget(null);
  }, []);

  const selectLayerRow = React.useCallback((layer: UmbraCanvasLayer, additive: boolean) => {
    const removing = additive && selectedLayerIds.includes(layer.id);
    const remaining = removing ? selectedLayerIds.filter((layerId) => layerId !== layer.id) : selectedLayerIds;
    if (removing && remaining.length <= 0) return;
    setSelectedLayerIds(removing ? remaining : additive ? [...selectedLayerIds, layer.id] : [layer.id]);
    const currentActive = canvasDocument?.layers.find((candidate) => candidate.id === canvasDocument.activeLayerId);
    const nextActive = removing
      ? currentActive?.id === layer.id
        ? canvasDocument?.layers.find((candidate) => candidate.id === remaining[remaining.length - 1]) || null
        : currentActive || null
      : layer;
    if (!nextActive) return;
    if (nextActive.kind === 'mask' && nextActive.purpose === 'layer' && !nextActive.frozen) {
      setEditingLayerMaskId(nextActive.id);
      setEditTarget('mask');
      dispatchCanvasDocument({ type: 'select_layer', layerId: nextActive.id });
    } else if (nextActive.kind === 'mask' && nextActive.purpose === 'inpaint' && !nextActive.frozen) {
      setEditingLayerMaskId('');
      setEditTarget('mask');
      dispatchCanvasDocument({ type: 'set_active_mask', layerId: nextActive.id });
    } else {
      setEditingLayerMaskId('');
      dispatchCanvasDocument({ type: 'select_layer', layerId: nextActive.id });
    }
  }, [canvasDocument, dispatchCanvasDocument, selectedLayerIds]);

  const editOrAddActiveRasterMask = React.useCallback(async (fromCurrentSelection = false) => {
    if (!canvasDocument || !activeRasterLayer || activeRasterLayer.role === 'source') return;
    if (activeRasterLayer.maskLayerId) {
      const mask = canvasDocument.layers.find((layer) => layer.id === activeRasterLayer.maskLayerId);
      if (mask?.kind === 'mask' && !mask.frozen) {
        setEditingLayerMaskId(mask.id);
        dispatchCanvasDocument({ type: 'select_layer', layerId: mask.id });
      } else {
        showToast('This generated layer uses a frozen acceptance mask. Duplicate or merge it before editing its mask.', 'error');
      }
      return;
    }
    try {
      const sourceMask = maskCanvasRef.current;
      if (fromCurrentSelection && (!sourceMask || !maskHasContent(null))) {
        throw new Error('Paint or select an inpaint mask before creating a layer mask from it.');
      }
      const revealAll = document.createElement('canvas');
      revealAll.width = canvasDocument.width;
      revealAll.height = canvasDocument.height;
      const context = revealAll.getContext('2d');
      if (!context) throw new Error('The layer mask could not be created.');
      if (fromCurrentSelection && sourceMask) context.drawImage(sourceMask, 0, 0);
      else {
        context.fillStyle = '#ff304c';
        context.fillRect(0, 0, revealAll.width, revealAll.height);
      }
      const dataUrl = URL.createObjectURL(await canvasToBlob(revealAll));
      maskSnapshotUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'add_layer_mask', rasterLayerId: activeRasterLayer.id, dataUrl });
      showToast(`${fromCurrentSelection ? 'Selection-based' : 'Reveal-all'} layer mask added. Paint or erase it without changing the raster pixels.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to add the layer mask.', 'error');
    }
  }, [activeRasterLayer, canvasDocument, dispatchCanvasDocument, maskHasContent, showToast]);

  const detachRasterMask = React.useCallback((rasterLayer: UmbraCanvasRasterLayer | null) => {
    if (!rasterLayer?.maskLayerId || rasterLayer.role === 'source') return;
    setEditingLayerMaskId('');
    dispatchCanvasDocument({ type: 'detach_layer_mask', rasterLayerId: rasterLayer.id });
    showToast('Layer mask removed; raster pixels were preserved.', 'success');
  }, [dispatchCanvasDocument, showToast]);

  const groupSelectedLayers = React.useCallback(() => {
    if (groupableSelectedLayers.length < 2 || selectedVisualMutationLocked) return;
    dispatchCanvasDocument({
      type: 'group_layers',
      layerIds: groupableSelectedLayers.map((layer) => layer.id),
    });
    showToast(`${groupableSelectedLayers.length} layers grouped.`, 'success');
  }, [dispatchCanvasDocument, groupableSelectedLayers, selectedVisualMutationLocked, showToast]);

  const mergeSelectedLayers = React.useCallback(async () => {
    if (!canvasDocument || selectedVisualLayers.length < 2 || selectedVisualMutationLocked || !canvasReady) return;
    try {
      const output = await renderIsolatedVisualLayers(selectedVisualLayers.map((layer) => layer.id));
      const imageUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'merge_selected',
        layerIds: selectedVisualLayers.map((layer) => layer.id),
        name: `Merged ${selectedVisualLayers.length} Layers`,
        asset: createUmbraCanvasImageAsset({
          name: `merged_layers_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast(`${selectedVisualLayers.length} layers merged into one raster layer.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to merge the selected layers.', 'error');
    }
  }, [canvasDocument, canvasReady, dispatchCanvasDocument, renderIsolatedVisualLayers, selectedVisualLayers, selectedVisualMutationLocked, showToast]);

  const applyRasterBoolean = React.useCallback(async (operation: UmbraCanvasBooleanOperation) => {
    if (!canvasDocument || booleanRasterLayers.length !== 2 || !canvasReady) return;
    const [lowerLayer, upperLayer] = booleanRasterLayers;
    const operationDetails: Record<UmbraCanvasBooleanOperation, { label: string; composite: GlobalCompositeOperation }> = {
      intersect: { label: 'Intersect', composite: 'source-in' },
      cut_out: { label: 'Cut Out', composite: 'destination-in' },
      cut_away: { label: 'Cut Away', composite: 'source-out' },
      exclude: { label: 'Exclude', composite: 'xor' },
    };
    const detail = operationDetails[operation];
    setBooleanMenuOpen(false);
    try {
      const [lower, upper] = await Promise.all([
        renderIsolatedVisualLayers([lowerLayer.id]),
        renderIsolatedVisualLayers([upperLayer.id]),
      ]);
      const output = document.createElement('canvas');
      output.width = canvasDocument.width;
      output.height = canvasDocument.height;
      const context = output.getContext('2d');
      if (!context) throw new Error('The browser could not create a raster compositor.');
      context.drawImage(lower, 0, 0);
      context.globalCompositeOperation = detail.composite;
      context.drawImage(upper, 0, 0);
      context.globalCompositeOperation = 'source-over';
      const imageUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'boolean_raster_layers',
        lowerLayerId: lowerLayer.id,
        upperLayerId: upperLayer.id,
        operation,
        name: `${lowerLayer.name} ${detail.label} ${upperLayer.name}`,
        asset: createUmbraCanvasImageAsset({
          name: `boolean_${operation}_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast(`${detail.label} created a new raster layer; both source layers were hidden.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to combine the selected raster layers.', 'error');
    }
  }, [booleanRasterLayers, canvasDocument, canvasReady, dispatchCanvasDocument, renderIsolatedVisualLayers, showToast]);

  const cropActiveImageLayerToGenerationRegion = React.useCallback(async () => {
    const region = canvasDocument?.generationRegion;
    if (!canvasDocument || !activeImageLayer || !region || !canvasReady) return;
    try {
      const cropped = cropCanvas(await renderLayerToFullCanvas(activeImageLayer), region);
      const imageUrl = URL.createObjectURL(await canvasToBlob(cropped));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const asset = createUmbraCanvasImageAsset({
        name: `cropped_region_${Date.now()}.png`,
        path: '',
        imageUrl,
        width: region.width,
        height: region.height,
        objectUrl: true,
      });
      const transform = { x: region.x, y: region.y, width: region.width, height: region.height, rotation: 0, scaleX: 1, scaleY: 1 };
      if (activeImageLayer.kind === 'raster') {
        dispatchCanvasDocument({ type: 'apply_raster_filter', layerId: activeImageLayer.id, name: `${activeImageLayer.name} Region`, transform, asset });
      } else if (activeImageLayer.kind === 'control') {
        dispatchCanvasDocument({ type: 'apply_control_filter', layerId: activeImageLayer.id, name: `${activeImageLayer.name} Region`, transform, asset });
      } else {
        dispatchCanvasDocument({ type: 'replace_reference_asset', layerId: activeImageLayer.id, name: `${activeImageLayer.name} Region`, transform, asset });
      }
      showToast(`Active ${activeImageLayer.kind === 'control' ? 'control' : activeImageLayer.kind === 'reference' ? 'reference' : 'raster'} cropped to the generation region.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to crop the active image layer.', 'error');
    }
  }, [activeImageLayer, canvasDocument, canvasReady, dispatchCanvasDocument, renderLayerToFullCanvas, showToast]);

  const cropActiveMaskToGenerationRegion = React.useCallback(async () => {
    const region = canvasDocument?.generationRegion;
    const maskLayer = activeInpaintMaskLayer || activeRegionalMaskLayer;
    if (!canvasDocument || !region || !maskLayer || activeInpaintMaskLayer?.locked || !canvasReady) return;
    try {
      const rendered = await renderLayerToFullCanvas(maskLayer);
      const clipped = document.createElement('canvas');
      clipped.width = canvasDocument.width;
      clipped.height = canvasDocument.height;
      const context = clipped.getContext('2d');
      if (!context) throw new Error('The browser could not create a mask compositor.');
      context.drawImage(
        rendered,
        region.x,
        region.y,
        region.width,
        region.height,
        region.x,
        region.y,
        region.width,
        region.height,
      );
      const dataUrl = URL.createObjectURL(await canvasToBlob(clipped));
      maskSnapshotUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'crop_mask_to_region', layerId: maskLayer.id, dataUrl });
      showToast(`${activeRegionalGuidanceLayer ? 'Regional guidance' : 'Inpaint mask'} cropped to the generation region.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to crop the active mask.', 'error');
    }
  }, [activeInpaintMaskLayer, activeRegionalGuidanceLayer, activeRegionalMaskLayer, canvasDocument, canvasReady, dispatchCanvasDocument, renderLayerToFullCanvas, showToast]);

  const trimActiveImageLayerToContent = React.useCallback(async () => {
    if (!activeCanvasLayer || !canvasDocument || !canvasReady) return;
    if (activeCanvasLayer.kind !== 'raster' && activeCanvasLayer.kind !== 'control' && activeCanvasLayer.kind !== 'reference') return;
    try {
      const rendered = await renderLayerToFullCanvas(activeCanvasLayer);
      const bounds = findMaskAlphaBounds(rendered);
      if (!bounds) throw new Error('The active layer has no visible pixels inside the canvas.');
      const cropped = cropCanvas(rendered, bounds);
      const imageUrl = URL.createObjectURL(await canvasToBlob(cropped));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const asset = createUmbraCanvasImageAsset({
        name: `${activeCanvasLayer.name.replace(/\s+/g, '_').toLowerCase()}_trimmed_${Date.now()}.png`,
        path: '',
        imageUrl,
        width: bounds.width,
        height: bounds.height,
        objectUrl: true,
      });
      const transform = { ...bounds, rotation: 0, scaleX: 1, scaleY: 1 };
      if (activeCanvasLayer.kind === 'raster') {
        dispatchCanvasDocument({ type: 'apply_raster_filter', layerId: activeCanvasLayer.id, name: `${activeCanvasLayer.name} Trimmed`, asset, transform });
      } else if (activeCanvasLayer.kind === 'control') {
        dispatchCanvasDocument({ type: 'apply_control_filter', layerId: activeCanvasLayer.id, name: `${activeCanvasLayer.name} Trimmed`, asset, transform });
      } else {
        dispatchCanvasDocument({ type: 'replace_reference_asset', layerId: activeCanvasLayer.id, name: `${activeCanvasLayer.name} Trimmed`, asset, transform });
      }
      showToast('Layer trimmed to its visible content.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to trim the active layer.', 'error');
    }
  }, [activeCanvasLayer, canvasDocument, canvasReady, dispatchCanvasDocument, renderLayerToFullCanvas, showToast]);

  const mergeActiveLayerDown = React.useCallback(async () => {
    if (!canvasDocument || !activeVisualLayer || !mergeDownTarget || visualMergeDownMutationLocked || !canvasReady) return;
    try {
      const output = await renderIsolatedVisualLayers([mergeDownTarget.id, activeVisualLayer.id]);
      const imageUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'merge_down',
        upperLayerId: activeVisualLayer.id,
        lowerLayerId: mergeDownTarget.id,
        name: `${mergeDownTarget.name} + ${activeVisualLayer.name}`,
        asset: createUmbraCanvasImageAsset({
          name: `merged_down_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast('Active layer merged with the visual layer below it.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to merge the active layer.', 'error');
    }
  }, [activeVisualLayer, canvasDocument, canvasReady, mergeDownTarget, renderIsolatedVisualLayers, showToast, visualMergeDownMutationLocked]);

  const mergeActiveGuidanceDown = React.useCallback(async () => {
    if (!activeCanvasLayer || !guidanceMergeDownTarget || !canvasDocument || guidanceMergeDownMutationLocked || !canvasReady) return;
    try {
      const [lowerCanvas, upperCanvas] = await Promise.all([
        renderLayerToFullCanvas(guidanceMergeDownTarget),
        renderLayerToFullCanvas(activeCanvasLayer),
      ]);
      const output = document.createElement('canvas');
      output.width = canvasDocument.width;
      output.height = canvasDocument.height;
      const context = output.getContext('2d');
      if (!context) throw new Error('The guidance layers could not be merged.');
      context.drawImage(lowerCanvas, 0, 0);
      context.globalCompositeOperation = activeCanvasLayer.kind === 'control' ? 'lighter' : 'source-over';
      context.drawImage(upperCanvas, 0, 0);
      context.globalCompositeOperation = 'source-over';
      const blob = await canvasToBlob(output);
      const imageUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const name = `${guidanceMergeDownTarget.name} + ${activeCanvasLayer.name}`;
      if (activeCanvasLayer.kind === 'control' && guidanceMergeDownTarget.kind === 'control') {
        dispatchCanvasDocument({
          type: 'merge_control_down',
          upperLayerId: activeCanvasLayer.id,
          lowerLayerId: guidanceMergeDownTarget.id,
          name,
          asset: createUmbraCanvasImageAsset({
            name: `${name.replace(/\s+/g, '_').toLowerCase()}_${Date.now()}.png`,
            path: '',
            imageUrl,
            width: output.width,
            height: output.height,
            objectUrl: true,
          }),
        });
      } else if (activeCanvasLayer.kind === 'mask' && guidanceMergeDownTarget.kind === 'mask') {
        dispatchCanvasDocument({ type: 'merge_inpaint_masks_down', upperLayerId: activeCanvasLayer.id, lowerLayerId: guidanceMergeDownTarget.id, name, dataUrl: imageUrl });
      } else if (activeCanvasLayer.kind === 'regional_guidance' && guidanceMergeDownTarget.kind === 'regional_guidance') {
        dispatchCanvasDocument({ type: 'merge_regional_guidance_down', upperLayerId: activeCanvasLayer.id, lowerLayerId: guidanceMergeDownTarget.id, name, dataUrl: imageUrl });
      } else {
        throw new Error('Only matching guidance layer types can be merged.');
      }
      showToast('Guidance layers merged as one undoable edit.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to merge the guidance layers.', 'error');
    }
  }, [activeCanvasLayer, canvasDocument, canvasReady, guidanceMergeDownMutationLocked, guidanceMergeDownTarget, renderLayerToFullCanvas, showToast]);

  const mergeVisibleGuidanceLayers = React.useCallback(async () => {
    if (!activeCanvasLayer || !canvasDocument || !canvasReady || visibleGuidanceMergeLayers.length < 2 || visibleGuidanceMergeMutationLocked) return;
    try {
      const renderedLayers = await Promise.all(visibleGuidanceMergeLayers.map((layer) => renderLayerToFullCanvas(layer)));
      const output = document.createElement('canvas');
      output.width = canvasDocument.width;
      output.height = canvasDocument.height;
      const context = output.getContext('2d');
      if (!context) throw new Error('The visible guidance layers could not be merged.');
      renderedLayers.forEach((rendered, index) => {
        context.globalCompositeOperation = activeCanvasLayer.kind === 'control' && index > 0 ? 'lighter' : 'source-over';
        context.drawImage(rendered, 0, 0);
      });
      context.globalCompositeOperation = 'source-over';
      const imageUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const layerIds = visibleGuidanceMergeLayers.map((layer) => layer.id);
      const count = layerIds.length;
      if (activeCanvasLayer.kind === 'control') {
        dispatchCanvasDocument({
          type: 'merge_visible_controls',
          layerIds,
          name: `Merged ${count} Controls`,
          asset: createUmbraCanvasImageAsset({
            name: `merged_visible_controls_${Date.now()}.png`,
            path: '',
            imageUrl,
            width: output.width,
            height: output.height,
            objectUrl: true,
          }),
        });
      } else if (activeCanvasLayer.kind === 'mask' && activeCanvasLayer.purpose === 'inpaint' && !activeCanvasLayer.frozen) {
        dispatchCanvasDocument({ type: 'merge_visible_inpaint_masks', layerIds, name: `Merged ${count} Inpaint Masks`, dataUrl: imageUrl });
      } else if (activeCanvasLayer.kind === 'regional_guidance') {
        dispatchCanvasDocument({ type: 'merge_visible_regional_guidance', layerIds, name: `Merged ${count} Regions`, dataUrl: imageUrl });
      } else {
        throw new Error('The active layer type does not support merge visible.');
      }
      showToast(`${count} visible ${activeCanvasLayer.kind === 'control' ? 'controls' : activeCanvasLayer.kind === 'regional_guidance' ? 'regions' : 'masks'} merged as one undoable edit.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to merge the visible guidance layers.', 'error');
    }
  }, [activeCanvasLayer, canvasDocument, canvasReady, dispatchCanvasDocument, renderLayerToFullCanvas, showToast, visibleGuidanceMergeLayers, visibleGuidanceMergeMutationLocked]);

  const copyActiveVisualToMask = React.useCallback(async () => {
    if (!activeVisualLayer || !canvasDocument || !canvasReady) return;
    try {
      const dataUrl = await convertCanvasToMaskObjectUrl(await renderIsolatedVisualLayers([activeVisualLayer.id]));
      dispatchCanvasDocument({ type: 'add_inpaint_mask', name: `${activeVisualLayer.name} Mask`, dataUrl });
      showToast('Visual layer copied to a new editable mask.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to copy the layer to a mask.', 'error');
    }
  }, [activeVisualLayer, canvasDocument, canvasReady, convertCanvasToMaskObjectUrl, renderIsolatedVisualLayers, showToast]);

  const applyRasterFilter = React.useCallback((result: { blob: Blob; width: number; height: number; padding: number; type: string; elapsedMs?: number; execution?: 'worker' | 'main' | 'comfy' }) => {
    if (!canvasDocument || !rasterFilterLayer) return;
    if (rasterFilterLayer.locked || rasterFilterLayer.kind === 'raster' && rasterFilterLayer.role === 'source') {
      setRasterFilterLayerId('');
      showToast('Unlock the layer before applying a filter.', 'error');
      return;
    }
    const imageUrl = URL.createObjectURL(result.blob);
    layerAssetObjectUrlsRef.current.add(imageUrl);
    const horizontalScale = rasterFilterLayer.transform.width / Math.max(1, rasterFilterLayer.asset.width);
    const verticalScale = rasterFilterLayer.transform.height / Math.max(1, rasterFilterLayer.asset.height);
    const paddingX = result.padding * horizontalScale;
    const paddingY = result.padding * verticalScale;
    const common = {
      layerId: rasterFilterLayer.id,
      name: `${rasterFilterLayer.name} ${result.type.replace(/_/g, ' ')}`,
      asset: createUmbraCanvasImageAsset({
        name: `${rasterFilterLayer.name.replace(/\s+/g, '_').toLowerCase()}_${result.type}_${Date.now()}.png`,
        path: '',
        imageUrl,
        width: result.width,
        height: result.height,
        objectUrl: true,
      }),
      transform: {
        ...rasterFilterLayer.transform,
        x: rasterFilterLayer.transform.x - paddingX,
        y: rasterFilterLayer.transform.y - paddingY,
        width: rasterFilterLayer.transform.width + paddingX * 2,
        height: rasterFilterLayer.transform.height + paddingY * 2,
      },
    };
    dispatchCanvasDocument(rasterFilterLayer.kind === 'control'
      ? { type: 'apply_control_filter', ...common, resetPreprocessor: result.type.endsWith('_preprocessor') }
      : { type: 'apply_raster_filter', ...common });
    setRasterFilterLayerId('');
    showToast(`${rasterFilterLayer.kind === 'control' ? 'Control' : 'Raster'} filter applied as one undoable canvas edit.`, 'success');
  }, [canvasDocument, rasterFilterLayer, showToast]);

  const applyLayerUpscale = React.useCallback(async (result: { blob: Blob; filename: string; useUpscaledBounds: boolean }) => {
    if (!canvasDocument || !layerUpscaleLayer) return;
    if (layerUpscaleLayer.locked || layerUpscaleLayer.role === 'source') {
      setLayerUpscaleLayerId('');
      showToast('Unlock the layer before applying an upscale.', 'error');
      return;
    }
    const imageUrl = URL.createObjectURL(result.blob);
    try {
      const image = await loadHtmlImage(imageUrl);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const widthRatio = image.naturalWidth / Math.max(1, layerUpscaleLayer.asset.width);
      const heightRatio = image.naturalHeight / Math.max(1, layerUpscaleLayer.asset.height);
      dispatchCanvasDocument({
        type: 'apply_raster_filter',
        layerId: layerUpscaleLayer.id,
        name: `${layerUpscaleLayer.name} Upscaled`,
        asset: createUmbraCanvasImageAsset({
          name: result.filename || `${layerUpscaleLayer.name.replace(/\s+/g, '_').toLowerCase()}_upscaled.png`,
          path: '',
          imageUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          objectUrl: true,
        }),
        transform: result.useUpscaledBounds ? {
          ...layerUpscaleLayer.transform,
          width: layerUpscaleLayer.transform.width * widthRatio,
          height: layerUpscaleLayer.transform.height * heightRatio,
        } : layerUpscaleLayer.transform,
      });
      setLayerUpscaleLayerId('');
      showToast('Upscaled layer applied as one undoable canvas edit.', 'success');
    } catch (error) {
      URL.revokeObjectURL(imageUrl);
      throw error;
    }
  }, [canvasDocument, layerUpscaleLayer, showToast]);

  const bakeActiveControlPreprocessor = React.useCallback(async () => {
    if (!activeControlLayer || activeControlLayer.controlType === 'raw' || controlPreprocessBusy) return;
    setControlPreprocessBusy(true);
    try {
      const sourceResponse = await fetch(activeControlLayer.asset.imageUrl, { cache: 'no-store' });
      if (!sourceResponse.ok) throw new Error(`Unable to load the control source (${sourceResponse.status}).`);
      const result = await preprocessUmbraUiControlImage({
        image: await sourceResponse.blob(),
        imageName: activeControlLayer.asset.name || 'control-source.png',
        controlType: activeControlLayer.controlType,
        processorResolution: activeControlLayer.processorResolution,
        lowThreshold: activeControlLayer.lowThreshold,
        highThreshold: activeControlLayer.highThreshold,
        detectBody: activeControlLayer.detectBody,
        detectFace: activeControlLayer.detectFace,
        detectHands: activeControlLayer.detectHands,
        maxFaces: activeControlLayer.maxFaces,
        minimumConfidence: activeControlLayer.minimumConfidence,
        scoreThreshold: activeControlLayer.scoreThreshold,
        distanceThreshold: activeControlLayer.distanceThreshold,
        normalStrength: activeControlLayer.normalStrength,
        backgroundThreshold: activeControlLayer.backgroundThreshold,
        safeMode: activeControlLayer.safeMode,
        processorSeed: activeControlLayer.processorSeed,
      });
      const imageUrl = URL.createObjectURL(result.blob);
      const image = await loadHtmlImage(imageUrl);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const bakedType = activeControlLayer.controlType.replace(/_/g, ' ');
      dispatchCanvasDocument({
        type: 'bake_control_preprocessor',
        layerId: activeControlLayer.id,
        name: `${activeControlLayer.name} ${bakedType}`,
        asset: createUmbraCanvasImageAsset({
          name: result.filename || `${activeControlLayer.controlType}-control.png`,
          path: '',
          imageUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          objectUrl: true,
        }),
      });
      showToast(`${bakedType} baked into the control layer. The preprocessor is now Raw to prevent double processing.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to preprocess the control layer.', 'error');
    } finally {
      setControlPreprocessBusy(false);
    }
  }, [activeControlLayer, controlPreprocessBusy, showToast]);

  const flattenVisibleCanvas = React.useCallback(async () => {
    if (!canvasDocument || !canvasReady || flattenVisibleMutationLocked) return;
    if (!window.confirm('Flatten all visible canvas content into one raster layer? This can still be undone during this session.')) return;
    await runFullResolutionOperation('Flatten visible canvas', async ({ signal, setPhase }) => {
      const imageCanvas = await renderFullCommittedCanvas({ signal });
      setPhase('encoding');
      const blob = await encodeFullResolutionCanvas(imageCanvas, { signal });
      const imageUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      if (signal.aborted) {
        layerAssetObjectUrlsRef.current.delete(imageUrl);
        URL.revokeObjectURL(imageUrl);
        throw new DOMException('Canvas flattening was canceled.', 'AbortError');
      }
      dispatchCanvasDocument({
        type: 'flatten_visible',
        name: 'Flattened Canvas',
        asset: createUmbraCanvasImageAsset({
          name: `flattened_canvas_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast('Visible canvas content flattened into one raster layer.', 'success');
    });
  }, [canvasDocument, canvasReady, flattenVisibleMutationLocked, renderFullCommittedCanvas, runFullResolutionOperation, showToast]);

  const mergeActiveGroup = React.useCallback(async () => {
    if (!canvasDocument || !activeGroupLayer || activeGroupMergeMutationLocked || !canvasReady) return;
    const children = canvasDocument.layers.filter((layer) => layer.groupId === activeGroupLayer.id);
    if (children.length <= 0) {
      showToast('The selected group has no visual layers to merge.', 'error');
      return;
    }
    try {
      const isolated: UmbraCanvasDocument = {
        ...structuredClone(canvasDocument),
        staging: [],
        previewStageId: '',
        layers: canvasDocument.layers.map((layer) => {
          if (layer.kind === 'group') return { ...layer, visible: layer.id === activeGroupLayer.id };
          if (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient') {
            return { ...layer, visible: layer.groupId === activeGroupLayer.id && layer.visible };
          }
          return layer;
        }),
      };
      const output = document.createElement('canvas');
      await renderCanvasDocument(output, isolated, null, true);
      const blob = await canvasToBlob(output);
      const imageUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'merge_group',
        groupId: activeGroupLayer.id,
        name: `${activeGroupLayer.name} Merged`,
        asset: createUmbraCanvasImageAsset({
          name: `${activeGroupLayer.name.replace(/\s+/g, '_').toLowerCase()}_merged_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast('Layer group merged into a raster layer.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to merge the layer group.', 'error');
    }
  }, [activeGroupLayer, activeGroupMergeMutationLocked, canvasDocument, canvasReady, showToast]);

  const createRegionalGuidance = React.useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !maskCanvas || !canvasReady) return;
    if (!regionalGuidanceAvailable) {
      showToast(regionalGuidanceReason || 'Regional guidance is unavailable for this model pipeline.', 'error');
      return;
    }
    if (getUmbraCanvasRegionalGuidanceLayers(canvasDocument).length >= regionalGuidanceMaxLayers) {
      showToast(`This pipeline supports up to ${regionalGuidanceMaxLayers} regional guidance layers.`, 'error');
      return;
    }
    if (!maskHasContent(null)) {
      showToast('Paint or select a mask before creating a region.', 'error');
      return;
    }
    try {
      const blob = await canvasToBlob(maskCanvas);
      const dataUrl = URL.createObjectURL(blob);
      layerAssetObjectUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'add_regional_guidance', dataUrl });
      showToast('Regional guidance layer created from the current mask.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create regional guidance.', 'error');
    }
  }, [canvasDocument, canvasReady, maskHasContent, regionalGuidanceAvailable, regionalGuidanceMaxLayers, regionalGuidanceReason, showToast]);

  const invertRegionalGuidanceMask = React.useCallback(async () => {
    if (!canvasDocument || !activeRegionalGuidanceLayer) return;
    const maskLayer = getUmbraCanvasMaskLayer(canvasDocument, activeRegionalGuidanceLayer.maskLayerId);
    if (!maskLayer?.dataUrl) return;
    try {
      const image = await loadHtmlImage(maskLayer.dataUrl);
      const output = document.createElement('canvas');
      output.width = image.naturalWidth;
      output.height = image.naturalHeight;
      const context = output.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('The regional mask could not be inverted.');
      context.drawImage(image, 0, 0);
      for (let tileY = 0; tileY < output.height; tileY += PIXEL_READBACK_TILE_ROWS) {
        const tileHeight = Math.min(PIXEL_READBACK_TILE_ROWS, output.height - tileY);
        const pixels = context.getImageData(0, tileY, output.width, tileHeight);
        for (let index = 0; index < pixels.data.length; index += 4) {
          pixels.data[index] = 255;
          pixels.data[index + 1] = 48;
          pixels.data[index + 2] = 76;
          pixels.data[index + 3] = 255 - pixels.data[index + 3];
        }
        context.putImageData(pixels, 0, tileY);
      }
      const dataUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'set_mask_layer_snapshot', layerId: maskLayer.id, dataUrl });
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to invert the regional mask.', 'error');
    }
  }, [activeRegionalGuidanceLayer, canvasDocument, showToast]);

  const replaceRegionalGuidanceMask = React.useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !activeRegionalGuidanceLayer || !maskCanvas) return;
    if (!maskHasContent(null)) {
      showToast('Paint or select a mask before replacing the region.', 'error');
      return;
    }
    try {
      const dataUrl = URL.createObjectURL(await canvasToBlob(maskCanvas));
      layerAssetObjectUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'set_mask_layer_snapshot', layerId: activeRegionalGuidanceLayer.maskLayerId, dataUrl });
      showToast('Regional guidance mask replaced.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to replace the regional mask.', 'error');
    }
  }, [activeRegionalGuidanceLayer, canvasDocument, maskHasContent, showToast]);

  const attachIpAdapterMask = React.useCallback(async () => {
    const maskCanvas = maskCanvasRef.current;
    if (!canvasDocument || !activeReferenceLayer || activeReferenceLayer.method !== 'ip_adapter' || !maskCanvas) return;
    if (!maskHasContent(null)) {
      showToast('Paint or select a mask before assigning IP Adapter influence.', 'error');
      return;
    }
    try {
      const dataUrl = URL.createObjectURL(await canvasToBlob(maskCanvas));
      layerAssetObjectUrlsRef.current.add(dataUrl);
      dispatchCanvasDocument({ type: 'attach_reference_mask', layerId: activeReferenceLayer.id, dataUrl });
      showToast('Current mask assigned to the IP Adapter reference.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to assign the IP Adapter influence mask.', 'error');
    }
  }, [activeReferenceLayer, canvasDocument, maskHasContent, showToast]);

  const detachIpAdapterMask = React.useCallback(() => {
    if (!activeReferenceLayer?.maskLayerId && !activeReferenceLayer?.regionLayerId) return;
    dispatchCanvasDocument({ type: 'detach_reference_mask', layerId: activeReferenceLayer.id });
    showToast('IP Adapter regional influence removed.', 'success');
  }, [activeReferenceLayer, showToast]);

  const buildRegionalGuidanceInputs = React.useCallback(async (
    generationRegion: UmbraCanvasRect,
    outputSize: { width: number; height: number },
  ): Promise<UmbraUiInpaintRegionalGuidanceInput[]> => {
    if (!canvasDocument || !regionalGuidanceAvailable) return [];
    const regions = getUmbraCanvasRegionalGuidanceLayers(canvasDocument)
      .filter((layer) => layer.enabled
        && layer.weight > 0
        && ((regionalPositivePromptAvailable && !!layer.positivePrompt.trim())
          || (regionalNegativePromptAvailable && !!layer.negativePrompt.trim())));
    if (regions.length > regionalGuidanceMaxLayers) {
      throw new Error(`This pipeline supports up to ${regionalGuidanceMaxLayers} active regional guidance layers.`);
    }
    const inputs: UmbraUiInpaintRegionalGuidanceInput[] = [];
    for (const layer of regions) {
      const maskLayer = getUmbraCanvasMaskLayer(canvasDocument, layer.maskLayerId);
      if (!maskLayer?.dataUrl) continue;
      const croppedMask = resizeCanvasForProcessing(
        await renderImageTransformIntoRegion(maskLayer.dataUrl, maskLayer.transform, generationRegion, '#000000'),
        outputSize.width,
        outputSize.height,
      );
      inputs.push({
        id: layer.id,
        name: layer.name,
        mask: await canvasToBlob(encodeMaskCanvasForComfy(croppedMask)),
        positivePrompt: regionalPositivePromptAvailable ? layer.positivePrompt : '',
        negativePrompt: regionalNegativePromptAvailable ? layer.negativePrompt : '',
        autoNegative: regionalAutoNegativeAvailable && layer.autoNegative,
        weight: layer.weight,
        beginStepPercent: layer.beginStepPercent,
        endStepPercent: layer.endStepPercent,
      });
    }
    return inputs;
  }, [canvasDocument, regionalAutoNegativeAvailable, regionalGuidanceAvailable, regionalGuidanceMaxLayers, regionalNegativePromptAvailable, regionalPositivePromptAvailable]);

  const addControlLayerFromBlob = React.useCallback(async (blob: Blob, name: string, transform?: UmbraCanvasRect, announce = true) => {
    if (!canvasDocument || !controlLayersAvailable) return false;
    if (getUmbraCanvasControlLayers(canvasDocument).length >= controlLayersMaxLayers) {
      showToast(`This pipeline supports up to ${controlLayersMaxLayers} control layers.`, 'error');
      return false;
    }
    const imageUrl = URL.createObjectURL(blob);
    try {
      const image = await loadHtmlImage(imageUrl);
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'add_control_layer',
        name,
        adapterType: controlAdapterTypes[0],
        controlMode: controlModes[0],
        modelName: defaultControlModel,
        transform,
        asset: createUmbraCanvasImageAsset({
          name: name.replace(/\.[^.]+$/, '') + '.png',
          path: '',
          imageUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          objectUrl: true,
        }),
      });
      if (announce) showToast('Control layer added.', 'success');
      return true;
    } catch (error) {
      URL.revokeObjectURL(imageUrl);
      showToast(error instanceof Error ? error.message : 'Failed to add the control layer.', 'error');
      return false;
    }
  }, [canvasDocument, controlAdapterTypes, controlLayersAvailable, controlLayersMaxLayers, controlModes, defaultControlModel, showToast]);

  const createControlLayer = React.useCallback(async () => {
    if (!canvasDocument || !canvasReady) return;
    if (!controlLayersAvailable) {
      showToast(controlLayersReason || 'Control layers are unavailable for this model pipeline.', 'error');
      return;
    }
    try {
      const imageCanvas = await renderFullCommittedCanvas();
      await addControlLayerFromBlob(await canvasToBlob(imageCanvas), `Canvas Control ${Date.now()}.png`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to capture the control layer.', 'error');
    }
  }, [addControlLayerFromBlob, canvasDocument, canvasReady, controlLayersAvailable, controlLayersReason, renderFullCommittedCanvas, showToast]);

  const buildControlInputs = React.useCallback(async (
    generationRegion: UmbraCanvasRect,
    outputSize: { width: number; height: number },
  ): Promise<UmbraUiInpaintControlInput[]> => {
    if (!canvasDocument || !controlLayersAvailable) return [];
    const activeControls = getUmbraCanvasControlLayers(canvasDocument)
      .filter((layer) => layer.enabled && layer.weight > 0);
    if (activeControls.length > controlLayersMaxLayers) {
      throw new Error(`This pipeline supports up to ${controlLayersMaxLayers} active control layers.`);
    }
    const missingModel = activeControls.find((layer) => !layer.modelName.trim());
    if (missingModel) throw new Error(`Choose a control model for ${missingModel.name}.`);
    const unsupportedAdapter = activeControls.find((layer) => !controlAdapterTypes.includes(layer.adapterType));
    if (unsupportedAdapter) {
      throw new Error(`${unsupportedAdapter.name} uses ${CONTROL_ADAPTER_LABELS[unsupportedAdapter.adapterType]}, which this pipeline does not declare.`);
    }
    const unsupportedMode = activeControls.find((layer) => !controlModes.includes(layer.controlMode));
    if (unsupportedMode) {
      throw new Error(`${unsupportedMode.name} uses ${CONTROL_MODE_LABELS[unsupportedMode.controlMode]}, which this pipeline does not declare.`);
    }
    const supportedTypes = new Set(availableControlTypeOptions.map((option) => option.value));
    const unsupported = activeControls.find((layer) => !supportedTypes.has(layer.controlType));
    if (unsupported) throw new Error(`The ${unsupported.controlType} preprocessor used by ${unsupported.name} is not installed.`);
    const controls = activeControls;
    const inputs: UmbraUiInpaintControlInput[] = [];
    for (const layer of controls) {
      const croppedImage = resizeCanvasForProcessing(
        await renderImageTransformIntoRegion(layer.asset.imageUrl, layer.transform, generationRegion, '#000000'),
        outputSize.width,
        outputSize.height,
      );
      inputs.push({
        id: layer.id,
        name: layer.name,
        image: await canvasToBlob(croppedImage),
        adapterType: layer.adapterType,
        controlMode: layer.controlMode,
        controlType: layer.controlType,
        modelName: layer.modelName,
        weight: layer.weight,
        beginStepPercent: layer.beginStepPercent,
        endStepPercent: layer.endStepPercent,
        processorResolution: layer.processorResolution,
        lowThreshold: layer.lowThreshold,
        highThreshold: layer.highThreshold,
        detectBody: layer.detectBody,
        detectFace: layer.detectFace,
        detectHands: layer.detectHands,
        maxFaces: layer.maxFaces,
        minimumConfidence: layer.minimumConfidence,
        scoreThreshold: layer.scoreThreshold,
        distanceThreshold: layer.distanceThreshold,
        normalStrength: layer.normalStrength,
        backgroundThreshold: layer.backgroundThreshold,
        safeMode: layer.safeMode,
        processorSeed: layer.processorSeed,
      });
    }
    return inputs;
  }, [availableControlTypeOptions, canvasDocument, controlAdapterTypes, controlLayersAvailable, controlLayersMaxLayers, controlModes]);

  const addReferenceLayerFromBlob = React.useCallback(async (blob: Blob, name: string, transform?: UmbraCanvasRect, announce = true) => {
    if (!canvasDocument || !referenceLayersAvailable) return false;
    if (getUmbraCanvasReferenceLayers(canvasDocument).length >= referenceLayersMaxLayers) {
      showToast(`This pipeline supports up to ${referenceLayersMaxLayers} reference layers.`, 'error');
      return false;
    }
    const imageUrl = URL.createObjectURL(blob);
    try {
      const image = await loadHtmlImage(imageUrl);
      const defaultMethod = referenceMethods[0];
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'add_reference_layer',
        name,
        method: defaultMethod,
        modelName: defaultMethod === 'ip_adapter' ? ipAdapterModels[0] || '' : styleModels[0] || '',
        visionModelName: visionModels[0] || '',
        transform,
        asset: createUmbraCanvasImageAsset({
          name: name.replace(/\.[^.]+$/, '') + '.png',
          path: '',
          imageUrl,
          width: image.naturalWidth,
          height: image.naturalHeight,
          objectUrl: true,
        }),
      });
      if (announce) showToast('Reference layer added.', 'success');
      return true;
    } catch (error) {
      URL.revokeObjectURL(imageUrl);
      showToast(error instanceof Error ? error.message : 'Failed to add the reference layer.', 'error');
      return false;
    }
  }, [canvasDocument, ipAdapterModels, referenceLayersAvailable, referenceLayersMaxLayers, referenceMethods, showToast, styleModels, visionModels]);

  const addSelectedStagesToGuidance = React.useCallback(async (kind: 'control' | 'reference') => {
    if (!canvasDocument || selectedStages.length <= 0 || stageGuidanceBusy) return;
    const existing = kind === 'control'
      ? getUmbraCanvasControlLayers(canvasDocument).length
      : getUmbraCanvasReferenceLayers(canvasDocument).length;
    const maximum = kind === 'control' ? controlLayersMaxLayers : referenceLayersMaxLayers;
    const available = Math.max(0, maximum - existing);
    if (available <= 0) {
      showToast(`This pipeline already uses its maximum of ${maximum} ${kind} layer${maximum === 1 ? '' : 's'}.`, 'error');
      return;
    }
    const candidates = selectedStages.slice(0, available);
    setStageGuidanceBusy(true);
    let added = 0;
    try {
      for (const stage of candidates) {
        const response = await fetch(stage.asset.imageUrl);
        if (!response.ok) throw new Error(`Could not read ${stage.name || 'a staged result'} (${response.status}).`);
        const blob = await response.blob();
        const success = kind === 'control'
          ? await addControlLayerFromBlob(blob, `${stage.name} Control`, stage.region, false)
          : await addReferenceLayerFromBlob(blob, `${stage.name} Reference`, stage.region, false);
        if (success) added += 1;
      }
      const omitted = selectedStages.length - candidates.length;
      showToast(`${added} staged result${added === 1 ? '' : 's'} added as ${kind} layer${added === 1 ? '' : 's'}${omitted > 0 ? `; ${omitted} exceeded this pipeline's limit` : ''}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Failed to add staged ${kind} layers.`, 'error');
    } finally {
      setStageGuidanceBusy(false);
    }
  }, [addControlLayerFromBlob, addReferenceLayerFromBlob, canvasDocument, controlLayersMaxLayers, referenceLayersMaxLayers, selectedStages, showToast, stageGuidanceBusy]);

  const captureGenerationRegionAsGuidance = React.useCallback(async (kind: 'control' | 'reference') => {
    const region = canvasDocument?.generationRegion;
    if (!canvasDocument || !region || !canvasReady) {
      showToast('Set a generation region before capturing guidance.', 'error');
      return;
    }
    try {
      const committed = await renderCommittedCanvas();
      const cropped = cropCanvas(committed, region);
      const blob = await canvasToBlob(cropped);
      if (kind === 'control') await addControlLayerFromBlob(blob, 'Generation Region Control', region);
      else await addReferenceLayerFromBlob(blob, 'Generation Region Reference', region);
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Failed to capture the ${kind} layer.`, 'error');
    }
  }, [addControlLayerFromBlob, addReferenceLayerFromBlob, canvasDocument, canvasReady, renderCommittedCanvas, showToast]);

  const captureGenerationRegionAsRegionalReference = React.useCallback(async () => {
    const region = canvasDocument?.generationRegion;
    if (!canvasDocument || !region || !canvasReady) {
      showToast('Set a generation region before capturing a regional reference.', 'error');
      return;
    }
    if (!regionalReferenceCaptureAvailable) {
      showToast('This pipeline does not declare regional IP Adapter references.', 'error');
      return;
    }
    if (getUmbraCanvasReferenceLayers(canvasDocument).length >= referenceLayersMaxLayers) {
      showToast(`This pipeline supports up to ${referenceLayersMaxLayers} reference layers.`, 'error');
      return;
    }
    if (getUmbraCanvasRegionalGuidanceLayers(canvasDocument).length >= regionalGuidanceMaxLayers) {
      showToast(`This pipeline supports up to ${regionalGuidanceMaxLayers} regional layers.`, 'error');
      return;
    }
    const modelName = ipAdapterModels[0] || '';
    const visionModelName = visionModels[0] || '';
    if (!modelName || !visionModelName) {
      showToast('Install and select an IP Adapter model and vision encoder before creating a regional reference.', 'error');
      return;
    }
    try {
      const cropped = cropCanvas(await renderCommittedCanvas(), region);
      const imageUrl = URL.createObjectURL(await canvasToBlob(cropped));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      const regionMask = document.createElement('canvas');
      regionMask.width = canvasDocument.width;
      regionMask.height = canvasDocument.height;
      const maskContext = regionMask.getContext('2d');
      if (!maskContext) throw new Error('The regional reference mask could not be created.');
      maskContext.fillStyle = '#ffffff';
      maskContext.fillRect(region.x, region.y, region.width, region.height);
      const regionDataUrl = URL.createObjectURL(await canvasToBlob(regionMask));
      maskSnapshotUrlsRef.current.add(regionDataUrl);
      dispatchCanvasDocument({
        type: 'add_regional_reference_layer',
        name: 'Generation Region Reference',
        modelName,
        visionModelName,
        regionDataUrl,
        transform: region,
        asset: createUmbraCanvasImageAsset({
          name: `generation_region_reference_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: region.width,
          height: region.height,
          objectUrl: true,
        }),
      });
      showToast('Generation region captured as an IP Adapter reference with a linked influence region.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to capture the regional reference.', 'error');
    }
  }, [canvasDocument, canvasReady, dispatchCanvasDocument, ipAdapterModels, referenceLayersMaxLayers, regionalGuidanceMaxLayers, regionalReferenceCaptureAvailable, renderCommittedCanvas, showToast, visionModels]);

  const captureGenerationRegionAsRaster = React.useCallback(async () => {
    const region = canvasDocument?.generationRegion;
    if (!canvasDocument || !region || !canvasReady) {
      showToast('Set a generation region before capturing a raster layer.', 'error');
      return;
    }
    try {
      const cropped = cropCanvas(await renderCommittedCanvas(), region);
      const imageUrl = URL.createObjectURL(await canvasToBlob(cropped));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'add_raster_layer',
        name: 'Generation Region',
        role: 'imported',
        transform: region,
        asset: createUmbraCanvasImageAsset({
          name: `generation_region_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: region.width,
          height: region.height,
          objectUrl: true,
        }),
      });
      showToast('Generation region captured as a raster layer.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to capture the raster layer.', 'error');
    }
  }, [canvasDocument, canvasReady, renderCommittedCanvas, showToast]);

  const replaceActiveReferenceFromGenerationRegion = React.useCallback(async () => {
    const region = canvasDocument?.generationRegion;
    if (!activeReferenceLayer || !canvasDocument || !region || !canvasReady) {
      showToast('Select a reference layer and set a generation region first.', 'error');
      return;
    }
    try {
      const cropped = cropCanvas(await renderCommittedCanvas(), region);
      const imageUrl = URL.createObjectURL(await canvasToBlob(cropped));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'replace_reference_asset',
        layerId: activeReferenceLayer.id,
        name: `${activeReferenceLayer.name} Region`,
        transform: { ...region, rotation: 0, scaleX: 1, scaleY: 1 },
        asset: createUmbraCanvasImageAsset({
          name: `reference_region_${Date.now()}.png`,
          path: '',
          imageUrl,
          width: region.width,
          height: region.height,
          objectUrl: true,
        }),
      });
      showToast('Active reference replaced from the generation region; its guidance settings were preserved.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to replace the active reference.', 'error');
    }
  }, [activeReferenceLayer, canvasDocument, canvasReady, dispatchCanvasDocument, renderCommittedCanvas, showToast]);

  const pasteClipboardAsGuidance = React.useCallback(async (kind: 'mask' | 'control' | 'reference') => {
    if (!navigator.clipboard?.read) {
      showToast('Image clipboard access is unavailable in this browser.', 'error');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      const item = items.find((candidate) => candidate.types.some((type) => type.startsWith('image/')));
      const mime = item?.types.find((type) => type.startsWith('image/'));
      if (!item || !mime) throw new Error('The system clipboard does not contain an image.');
      const blob = await item.getType(mime);
      if (kind === 'mask') await addInpaintMaskFromBlob(blob, 'Clipboard Mask');
      else if (kind === 'control') await addControlLayerFromBlob(blob, 'Clipboard Control');
      else await addReferenceLayerFromBlob(blob, 'Clipboard Reference');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to paste the clipboard image.', 'error');
    }
  }, [addControlLayerFromBlob, addInpaintMaskFromBlob, addReferenceLayerFromBlob, showToast]);

  const addResizedControlLayerFromBlob = React.useCallback(async (blob: Blob, name: string) => {
    if (!canvasDocument || !controlLayersAvailable) return;
    const sourceUrl = URL.createObjectURL(blob);
    try {
      const image = await loadHtmlImage(sourceUrl);
      const output = document.createElement('canvas');
      output.width = canvasDocument.width;
      output.height = canvasDocument.height;
      const context = output.getContext('2d');
      if (!context) throw new Error('The control resize canvas is unavailable.');
      context.drawImage(image, 0, 0, output.width, output.height);
      await addControlLayerFromBlob(await canvasToBlob(output), name);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to resize the control layer.', 'error');
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }, [addControlLayerFromBlob, canvasDocument, controlLayersAvailable, showToast]);

  const handleCanvasImageDrop = React.useCallback((target: CanvasImageDropTarget, transfer: DataTransfer) => {
    setImageDropActive(false);
    const file = transfer.files?.[0] || null;
    let galleryPath = '';
    try {
      const parsed = JSON.parse(transfer.getData(GALLERY_DRAG_PATHS_MIME) || '[]');
      galleryPath = Array.isArray(parsed) ? String(parsed[0] || '').trim() : '';
    } catch {
      galleryPath = '';
    }
    const applyBlob = (blob: Blob, name: string) => {
      if (target === 'raster') void addRasterLayerFromBlob(blob, name);
      else if (target === 'control') void addControlLayerFromBlob(blob, name);
      else if (target === 'resized_control') void addResizedControlLayerFromBlob(blob, name);
      else if (target === 'reference') void addReferenceLayerFromBlob(blob, name);
      else void addInpaintMaskFromBlob(blob, name);
    };
    if (file?.type.startsWith('image/')) {
      applyBlob(file, file.name);
      return;
    }
    if (!galleryPath) {
      showToast('Choose an image file or Gallery image.', 'error');
      return;
    }
    const name = galleryPath.replace(/\\/g, '/').split('/').pop() || 'Gallery Image';
    void fetch(`/api/fs/image?path=${encodeURIComponent(galleryPath)}`, { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`The Gallery image could not be loaded (${response.status}).`);
        applyBlob(await response.blob(), name);
      })
      .catch((error) => showToast(error instanceof Error ? error.message : 'Failed to import the Gallery image.', 'error'));
  }, [addControlLayerFromBlob, addInpaintMaskFromBlob, addRasterLayerFromBlob, addReferenceLayerFromBlob, addResizedControlLayerFromBlob, showToast]);

  const handleCanvasSourceDrop = React.useCallback((transfer: DataTransfer) => {
    const file = transfer.files?.[0] || null;
    if (file) {
      if (!file.type.startsWith('image/')) {
        showToast('Choose an image file.', 'error');
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      void loadSource(objectUrl, file.name, '', true)
        .catch((error) => {
          URL.revokeObjectURL(objectUrl);
          showToast(error instanceof Error ? error.message : 'Failed to load the image.', 'error');
        });
      return;
    }
    try {
      const parsed = JSON.parse(transfer.getData(GALLERY_DRAG_PATHS_MIME) || '[]');
      const galleryPath = Array.isArray(parsed) ? String(parsed[0] || '').trim() : '';
      if (!galleryPath) throw new Error('Choose an image file or Gallery image.');
      const name = galleryPath.replace(/\\/g, '/').split('/').pop() || 'Gallery Image';
      void loadSource(`/api/fs/image?path=${encodeURIComponent(galleryPath)}`, name, galleryPath, false)
        .catch((error) => showToast(error instanceof Error ? error.message : 'Failed to load the Gallery image.', 'error'));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to read the Gallery image drop.', 'error');
    }
  }, [loadSource, showToast]);

  const copyActiveLayerToGuidance = React.useCallback(async (target: 'mask' | 'region') => {
    if (!activeCanvasLayer || !canvasDocument || !canvasReady) return;
    const convertible = activeCanvasLayer.kind === 'control'
      || activeCanvasLayer.kind === 'regional_guidance'
      || activeCanvasLayer.kind === 'mask' && activeCanvasLayer.purpose === 'inpaint'
      || activeCanvasLayer.kind === 'raster'
      || activeCanvasLayer.kind === 'text'
      || activeCanvasLayer.kind === 'gradient';
    if (!convertible) return;
    if (target === 'region') {
      if (!regionalGuidanceAvailable) {
        showToast(regionalGuidanceReason || 'Regional guidance is unavailable for this model pipeline.', 'error');
        return;
      }
      if (getUmbraCanvasRegionalGuidanceLayers(canvasDocument).length >= regionalGuidanceMaxLayers) {
        showToast(`This pipeline supports up to ${regionalGuidanceMaxLayers} regional guidance layers.`, 'error');
        return;
      }
    }
    try {
      const dataUrl = await convertCanvasToMaskObjectUrl(await renderLayerToFullCanvas(activeCanvasLayer));
      dispatchCanvasDocument(target === 'region'
        ? { type: 'add_regional_guidance', name: `${activeCanvasLayer.name} Region`, dataUrl }
        : { type: 'add_inpaint_mask', name: `${activeCanvasLayer.name} Mask`, dataUrl });
      showToast(`Layer copied to ${target === 'region' ? 'regional guidance' : 'a new editable inpaint mask'}.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : `Failed to copy the layer to ${target === 'region' ? 'regional guidance' : 'an inpaint mask'}.`, 'error');
    }
  }, [activeCanvasLayer, canvasDocument, canvasReady, convertCanvasToMaskObjectUrl, regionalGuidanceAvailable, regionalGuidanceMaxLayers, regionalGuidanceReason, renderLayerToFullCanvas, showToast]);

  const copyActiveControlToRaster = React.useCallback(() => {
    if (!activeControlLayer) return;
    dispatchCanvasDocument({
      type: 'add_raster_layer',
      name: activeControlLayer.name.replace(/\s+Control$/i, '') || `${activeControlLayer.name} Copy`,
      role: 'imported',
      transform: activeControlLayer.transform,
      asset: createUmbraCanvasImageAsset({ ...activeControlLayer.asset, id: undefined }),
    });
    showToast('Control copied to a new raster layer.', 'success');
  }, [activeControlLayer, showToast]);

  const convertActiveVisualToControl = React.useCallback(async () => {
    if (!activeVisualLayer || activeVisualLayer.kind !== 'raster' || activeVisualLayer.role === 'source' || !canvasDocument || !canvasReady) return;
    if (!controlLayersAvailable) {
      showToast(controlLayersReason || 'Control layers are unavailable for this model pipeline.', 'error');
      return;
    }
    if (getUmbraCanvasControlLayers(canvasDocument).length >= controlLayersMaxLayers) {
      showToast(`This pipeline supports up to ${controlLayersMaxLayers} control layers.`, 'error');
      return;
    }
    try {
      const output = await renderLayerToFullCanvas(activeVisualLayer);
      const imageUrl = URL.createObjectURL(await canvasToBlob(output));
      layerAssetObjectUrlsRef.current.add(imageUrl);
      dispatchCanvasDocument({
        type: 'convert_raster_to_control',
        layerId: activeVisualLayer.id,
        name: `${activeVisualLayer.name} Control`,
        adapterType: controlAdapterTypes[0],
        controlMode: controlModes[0],
        modelName: defaultControlModel,
        asset: createUmbraCanvasImageAsset({
          name: `${activeVisualLayer.name.replace(/\s+/g, '_').toLowerCase()}_control.png`,
          path: '',
          imageUrl,
          width: canvasDocument.width,
          height: canvasDocument.height,
          objectUrl: true,
        }),
      });
      showToast('Layer converted to a spatial control input. Undo restores the original layer.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to convert the layer to a control input.', 'error');
    }
  }, [activeVisualLayer, canvasDocument, canvasReady, controlAdapterTypes, controlLayersAvailable, controlLayersMaxLayers, controlLayersReason, controlModes, defaultControlModel, renderLayerToFullCanvas, showToast]);

  const convertActiveControlToRaster = React.useCallback(() => {
    if (!activeControlLayer) return;
    dispatchCanvasDocument({ type: 'convert_control_to_raster', layerId: activeControlLayer.id });
    showToast('Control converted to an editable raster layer. Undo restores its control settings.', 'success');
  }, [activeControlLayer, showToast]);

  const convertActiveLayerToMask = React.useCallback(async () => {
    if (!activeCanvasLayer || !canvasDocument || !canvasReady) return;
    const convertible = activeCanvasLayer.kind === 'control'
      || activeCanvasLayer.kind === 'text'
      || activeCanvasLayer.kind === 'gradient'
      || activeCanvasLayer.kind === 'raster' && activeCanvasLayer.role !== 'source';
    if (!convertible) return;
    try {
      const dataUrl = await convertCanvasToMaskObjectUrl(await renderLayerToFullCanvas(activeCanvasLayer));
      dispatchCanvasDocument({
        type: 'convert_layer_to_inpaint_mask',
        layerId: activeCanvasLayer.id,
        name: `${activeCanvasLayer.name} Mask`,
        dataUrl,
      });
      showToast('Layer converted to an editable inpaint mask. Undo restores the original layer.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to convert the layer to an inpaint mask.', 'error');
    }
  }, [activeCanvasLayer, canvasDocument, canvasReady, convertCanvasToMaskObjectUrl, renderLayerToFullCanvas, showToast]);

  const convertActiveLayerToRegion = React.useCallback(async () => {
    if (!activeCanvasLayer || !canvasDocument || !canvasReady) return;
    const convertible = activeCanvasLayer.kind === 'control'
      || activeCanvasLayer.kind === 'text'
      || activeCanvasLayer.kind === 'gradient'
      || activeCanvasLayer.kind === 'raster' && activeCanvasLayer.role !== 'source';
    if (!convertible) return;
    if (!regionalGuidanceAvailable) {
      showToast(regionalGuidanceReason || 'Regional guidance is unavailable for this model pipeline.', 'error');
      return;
    }
    if (getUmbraCanvasRegionalGuidanceLayers(canvasDocument).length >= regionalGuidanceMaxLayers) {
      showToast(`This pipeline supports up to ${regionalGuidanceMaxLayers} regional guidance layers.`, 'error');
      return;
    }
    try {
      const dataUrl = await convertCanvasToMaskObjectUrl(await renderLayerToFullCanvas(activeCanvasLayer));
      dispatchCanvasDocument({
        type: 'convert_layer_to_regional_guidance',
        layerId: activeCanvasLayer.id,
        name: `${activeCanvasLayer.name} Region`,
        dataUrl,
      });
      showToast('Layer converted to regional guidance. Undo restores the original layer.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to convert the layer to regional guidance.', 'error');
    }
  }, [activeCanvasLayer, canvasDocument, canvasReady, convertCanvasToMaskObjectUrl, regionalGuidanceAvailable, regionalGuidanceMaxLayers, regionalGuidanceReason, renderLayerToFullCanvas, showToast]);

  const convertActiveMaskToRegion = React.useCallback(() => {
    if (!activeInpaintMaskLayer || !canvasDocument) return;
    if (!regionalGuidanceAvailable) {
      showToast(regionalGuidanceReason || 'Regional guidance is unavailable for this model pipeline.', 'error');
      return;
    }
    if (getUmbraCanvasRegionalGuidanceLayers(canvasDocument).length >= regionalGuidanceMaxLayers) {
      showToast(`This pipeline supports up to ${regionalGuidanceMaxLayers} regional guidance layers.`, 'error');
      return;
    }
    dispatchCanvasDocument({ type: 'convert_inpaint_mask_to_regional_guidance', layerId: activeInpaintMaskLayer.id });
    showToast('Inpaint mask converted to regional guidance. A replacement paint mask remains active.', 'success');
  }, [activeInpaintMaskLayer, canvasDocument, regionalGuidanceAvailable, regionalGuidanceMaxLayers, regionalGuidanceReason, showToast]);

  const convertActiveRegionToMask = React.useCallback(() => {
    if (!activeRegionalGuidanceLayer) return;
    dispatchCanvasDocument({ type: 'convert_regional_guidance_to_inpaint_mask', layerId: activeRegionalGuidanceLayer.id });
    showToast('Regional guidance converted to an editable inpaint mask.', 'success');
  }, [activeRegionalGuidanceLayer, showToast]);

  const buildReferenceInputs = React.useCallback(async (
    generationRegion: UmbraCanvasRect,
    outputSize: { width: number; height: number },
  ): Promise<UmbraUiInpaintReferenceInput[]> => {
    if (!canvasDocument || !referenceLayersAvailable) return [];
    const regionsById = new Map(getUmbraCanvasRegionalGuidanceLayers(canvasDocument).map((region) => [region.id, region]));
    const references = getUmbraCanvasReferenceLayers(canvasDocument)
      .filter((layer) => (
        layer.enabled
        && (layer.method === 'ip_adapter' ? layer.weight !== 0 : layer.weight > 0)
        && (!layer.regionLayerId || regionsById.get(layer.regionLayerId)?.enabled === true)
      ));
    if (references.length > referenceLayersMaxLayers) {
      throw new Error(`This pipeline supports up to ${referenceLayersMaxLayers} active reference layers.`);
    }
    const unsupportedMethod = references.find((layer) => !referenceMethods.includes(layer.method));
    if (unsupportedMethod) {
      throw new Error(`${unsupportedMethod.name} uses ${REFERENCE_METHOD_LABELS[unsupportedMethod.method]}, which this pipeline does not declare.`);
    }
    const missingResources = references.find((layer) => (
      (layer.method === 'style_model' || layer.method === 'flux_redux' || layer.method === 'ip_adapter')
      && (!layer.modelName.trim() || !layer.visionModelName.trim())
    ));
    if (missingResources) throw new Error(`Choose a style model and vision encoder for ${missingResources.name}.`);
    const inputs: UmbraUiInpaintReferenceInput[] = [];
    for (const layer of references) {
      const image = await loadHtmlImage(layer.asset.imageUrl);
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      if (!context) continue;
      context.drawImage(image, 0, 0);
      let mask: Blob | undefined;
      if (layer.method === 'ip_adapter' && (layer.maskLayerId || layer.regionLayerId)) {
        const linkedRegion = layer.regionLayerId ? regionsById.get(layer.regionLayerId) : null;
        const influenceMaskLayerId = layer.maskLayerId || linkedRegion?.maskLayerId || '';
        const maskLayer = getUmbraCanvasMaskLayer(canvasDocument, influenceMaskLayerId);
        if (!maskLayer?.dataUrl) throw new Error(`${layer.name} is missing its IP Adapter influence mask.`);
        const croppedMask = await renderImageTransformIntoRegion(maskLayer.dataUrl, maskLayer.transform, generationRegion, '#000000');
        const processingMask = resizeCanvasForProcessing(croppedMask, outputSize.width, outputSize.height);
        mask = await canvasToBlob(encodeMaskCanvasForComfy(processingMask));
      }
      inputs.push({
        id: layer.id,
        name: layer.name,
        image: await canvasToBlob(canvas),
        mask,
        method: layer.method,
        modelName: layer.modelName,
        visionModelName: layer.visionModelName,
        crop: layer.crop,
        strengthType: layer.strengthType,
        weight: layer.weight,
        beginStepPercent: layer.beginStepPercent,
        endStepPercent: layer.endStepPercent,
        ipAdapterWeightType: layer.ipAdapterWeightType,
        ipAdapterCombineEmbeds: layer.ipAdapterCombineEmbeds,
        ipAdapterEmbedsScaling: layer.ipAdapterEmbedsScaling,
      });
    }
    return inputs;
  }, [canvasDocument, referenceLayersAvailable, referenceLayersMaxLayers, referenceMethods]);

  const generateSamples = React.useCallback(async (seedOverride?: number) => {
    if (!source || !canvasDocument || !visibleGenerationRegion || !canvasReady || !inpaintRuntimeCapabilities || isSubmitting) return;
    const submissionRegion = alignGenerationRegion(expandCanvasRect(
      visibleGenerationRegion,
      contextPadding,
      canvasDocument.width,
      canvasDocument.height,
    ));
    const submissionProcessingSize = resolveUmbraUiInpaintProcessingSize(
      submissionRegion,
      { processingScaleMode, processingWidth, processingHeight },
      capabilities.resolution,
    );
    if (!prompt.trim()) {
      showToast('Enter an inpaint prompt.', 'error');
      return;
    }
    if (pipelineError || modelCompatibilityIssue || !checkpointName) {
      showToast(pipelineError || modelCompatibilityIssue || 'Choose a checkpoint.', 'error');
      return;
    }
    setIsSubmitting(true);
    try {
      const promptWithLoras = capabilities.loras.support === 'adjustable'
        ? composeUmbraUiPromptWithLoras(prompt, loras)
        : prompt;
      const inpaintDocument = {
        ...canvasDocument,
        layers: canvasDocument.layers.filter(isSimpleInpaintLayer),
      };
      let workingImage: HTMLCanvasElement;
      const activeStudioArtboard = canvasStudio.activeArtboard;
      if (studioMode && canvasStudio.project && activeStudioArtboard?.documentId === canvasDocument.id) {
        const artboardPosition = studioArtboardPosition(activeStudioArtboard);
        const composite = await renderStudioCompositeRegion({
          x: artboardPosition.x + submissionRegion.x,
          y: artboardPosition.y + submissionRegion.y,
          width: submissionRegion.width,
          height: submissionRegion.height,
        }, new Map([[canvasDocument.id, inpaintDocument]]), {
          transparent: false,
          simpleLayersOnly: true,
        });
        workingImage = composite.canvas;
      } else {
        workingImage = document.createElement('canvas');
        await renderCanvasDocument(workingImage, inpaintDocument, null, false, submissionRegion);
      }
      const compositeMasks = await buildCompositeInpaintMasks(submissionRegion);
      const workingMask = compositeMasks.base;
      if (!findMaskAlphaBounds(workingMask)) {
        throw new Error('Paint an enabled inpaint mask, draw a box, or expand the canvas before generating.');
      }
      const requestedFillMode = inpaintAdapter === 'native_edit' || !maskedFillAvailable ? 'neutral' : fillMode;
      const resolvedFillMode = resolveUmbraUiInpaintFillModeForMask(
        requestedFillMode,
        calculateMaskAlphaCoverage(workingMask),
      );
      if (resolvedFillMode !== fillMode) setFillMode(resolvedFillMode);
      const denoiseMask = compositeMasks.denoise;
      const noiseMask = compositeMasks.noise;
      if (!denoiseMask || !noiseMask) throw new Error('The inpaint mask modifiers could not be prepared.');
      const resolvedSeed = resolveCapabilityNumber(capabilities.seed, Number(seedOverride ?? seed), 0);
      if (findMaskAlphaBounds(noiseMask)) applyMaskedGaussianNoise(workingImage, noiseMask, resolvedSeed);
      const maskDataUrl = workingMask.toDataURL('image/png');
      const processingImage = resizeCanvasForProcessing(
        workingImage,
        submissionProcessingSize.width,
        submissionProcessingSize.height,
      );
      const processingMask = resizeCanvasForProcessing(
        denoiseMask,
        submissionProcessingSize.width,
        submissionProcessingSize.height,
      );
      const [sourceBlob, maskBlob] = await Promise.all([
        canvasToBlob(processingImage),
        canvasToBlob(encodeMaskCanvasForComfy(processingMask)),
      ]);
      const processingScale = Math.sqrt(submissionProcessingSize.scaleX * submissionProcessingSize.scaleY);
      const nextJob = await submitUmbraUiInpaintJob({
        source: sourceBlob,
        sourceName: source.name.replace(/\.[^.]+$/, '') + '.png',
        canvasProjectId: canvasDocument.id,
        operationMode: canvasDocument.operationMode,
        generationRegionX: visibleGenerationRegion.x,
        generationRegionY: visibleGenerationRegion.y,
        generationRegionWidth: visibleGenerationRegion.width,
        generationRegionHeight: visibleGenerationRegion.height,
        submissionRegionX: submissionRegion.x,
        submissionRegionY: submissionRegion.y,
        submissionRegionWidth: submissionRegion.width,
        submissionRegionHeight: submissionRegion.height,
        mask: maskBlob,
        modelFamily,
        modelSource,
        prompt: promptWithLoras,
        negativePrompt: capabilities.negativePrompt.support === 'adjustable' ? negativePrompt : '',
        checkpointName,
        clipSkip: resolveCapabilityNumber(capabilities.clipSkip, Number(clipSkip), 1),
        seed: resolvedSeed,
        steps: resolveCapabilityNumber(capabilities.steps, Number(steps), 20),
        cfg: resolveCapabilityNumber(capabilities.guidance, Number(cfg), 1),
        samplerName: resolveCapabilityString(capabilities.sampler, samplerName, 'euler'),
        scheduler: resolveCapabilityString(capabilities.scheduler, scheduler, 'normal'),
        denoise,
        samples,
        width: submissionProcessingSize.width,
        height: submissionProcessingSize.height,
        maskGrow: maskExpansionAvailable ? Math.round(maskGrow * processingScale) : 0,
        maskFeather: maskExpansionAvailable ? Math.round(maskFeather * processingScale) : 0,
        canvasMaskGrow: maskGrow,
        canvasMaskFeather: maskFeather,
        contextPadding,
        processingScaleMode,
        processingWidth,
        processingHeight,
        coherenceMode: 'gaussian',
        coherenceEdgeSize: maskFeather,
        coherenceMinimumDenoise: 0,
        fillMode: resolvedFillMode,
        infillColor,
        infillTileSize,
        inpaintModelName,
        seamlessX: false,
        seamlessY: false,
        outputOnlyMaskedRegions: maskedOutputAvailable ? outputOnlyMaskedRegions : false,
        semanticCutout: semanticCutoutAvailable && outputOnlyMaskedRegions && semanticCutout,
        colorMatch: colorMatchAvailable ? colorMatch : 0,
        differentialStrength: softInpaintEnabled
          && softInpaintCompositeAvailable
          && differentialDiffusionAvailable
          && inpaintAdapter !== 'qwen_image_controlnet'
          ? differentialStrength
          : 1,
        softInpaintEnabled: softInpaintEnabled && softInpaintCompositeAvailable,
        softInpaintPreservation,
        softInpaintTransitionContrast,
        softInpaintMaskInfluence,
        regionalGuidance: [],
        controlLayers: [],
        referenceLayers: [],
      });
      terminalNoticeRef.current = '';
      autoSelectJobRef.current = nextJob.id;
      jobStageContextsRef.current.set(nextJob.id, {
        region: submissionRegion,
        maskDataUrl,
      });
      rememberCurrentPrompt(false);
      dispatchCanvasDocument({
        type: 'track_pending_job',
        job: {
          id: nextJob.id,
          region: submissionRegion,
          maskDataUrl,
          createdAt: nextJob.createdAt,
        },
      });
      setJob(nextJob);
      showToast(`${nextJob.total} inpaint sample${nextJob.total === 1 ? '' : 's'} queued.`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to queue inpaint samples.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    buildCompositeInpaintMasks,
    alignGenerationRegion,
    canvasDocument,
    canvasReady,
    capabilities,
    cfg,
    checkpointName,
    clipSkip,
    colorMatch,
    colorMatchAvailable,
    contextPadding,
    denoise,
    differentialDiffusionAvailable,
    differentialStrength,
    softInpaintCompositeAvailable,
    softInpaintEnabled,
    softInpaintMaskInfluence,
    softInpaintPreservation,
    softInpaintTransitionContrast,
    semanticCutout,
    semanticCutoutAvailable,
    outputOnlyMaskedRegions,
    maskedOutputAvailable,
    fillMode,
    infillColor,
    infillTileSize,
    inpaintAdapter,
    inpaintModelName,
    inpaintRuntimeCapabilities,
    isSubmitting,
    loras,
    maskFeather,
    maskGrow,
    maskExpansionAvailable,
    maskedFillAvailable,
    negativePrompt,
    prompt,
    samplerName,
    samples,
    scheduler,
    seed,
    canvasStudio.activeArtboard,
    canvasStudio.project,
    modelFamily,
    modelSource,
    modelCompatibilityIssue,
    pipelineError,
    processingHeight,
    processingScaleMode,
    processingWidth,
    rememberCurrentPrompt,
    renderStudioCompositeRegion,
    showToast,
    source,
    steps,
    studioArtboardPosition,
    studioMode,
    visibleGenerationRegion,
  ]);

  const cancelActiveJob = React.useCallback(async () => {
    if (!job || isUmbraUiInpaintJobTerminal(job)) return;
    try {
      setJob(await cancelUmbraUiInpaintJob(job.id));
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to cancel the inpaint job.', 'error');
    }
  }, [job, showToast]);

  const rerollSamples = React.useCallback(() => {
    const unpinnedStageIds = (canvasDocument?.staging || []).filter((stage) => !stage.pinned).map((stage) => stage.id);
    if (unpinnedStageIds.length > 0) dispatchCanvasDocument({ type: 'discard_stages', stageIds: unpinnedStageIds });
    const rerollSeed = createRandomGenerationSeed();
    if (!seedIsRandom) onSeedChange(String(rerollSeed));
    void generateSamples(rerollSeed);
  }, [canvasDocument?.staging, generateSamples, onSeedChange, seedIsRandom]);

  const handleFile = React.useCallback((file: File | null | undefined) => {
    if (!file || !file.type.startsWith('image/')) {
      if (file) showToast('Choose an image file.', 'error');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const handoff = normalizeUmbraUiMediaHandoff({
      mode: 'inpaint',
      path: `umbra-local-import/${encodeURIComponent(file.name)}`,
      originalSourcePath: '',
      name: file.name,
      imageUrl: objectUrl,
      source: 'local-file',
      createdAt: Date.now(),
    });
    if (!handoff) {
      URL.revokeObjectURL(objectUrl);
      showToast('Failed to prepare the local image for Canvas Studio.', 'error');
      return;
    }
    const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: UmbraUiInpaintHandoff | null };
    target.__umbraPendingUmbraUiMediaHandoff = handoff;
    window.dispatchEvent(new CustomEvent(UMBRA_UI_MEDIA_HANDOFF_EVENT, { detail: handoff }));
  }, [showToast]);

  const clearActiveMaskAfterAccept = React.useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const context = maskCanvas?.getContext('2d');
    if (!maskCanvas || !context) return;
    context.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
    resetMaskHistory();
  }, [resetMaskHistory]);

  const studioDefaultAcceptMode: 'replace_region' | 'new_layer' = studioMode
    && (canvasStudio.activeRegion?.mode === 'standalone' || canvasStudio.activeRegion?.outputMode === 'cutout')
    ? 'new_layer'
    : 'replace_region';

  const acceptStages = React.useCallback((stageIds: string[], mode: 'replace_region' | 'new_layer' = 'replace_region') => {
    const ids = Array.from(new Set(stageIds)).filter(Boolean);
    if (ids.length <= 0) return;
    dispatchCanvasDocument({ type: 'accept_stages', stageIds: ids, mode, preserveMask: canvasPreferences.preserveMask });
    if (!canvasPreferences.preserveMask) clearActiveMaskAfterAccept();
    setSelectedStageIds((current) => current.filter((stageId) => !ids.includes(stageId)));
    setCompareStages(false);
    showToast(`${ids.length} staged result${ids.length === 1 ? '' : 's'} accepted ${mode === 'new_layer' ? 'as masked layers' : 'as opaque replacements'}.`, 'success');
  }, [canvasPreferences.preserveMask, clearActiveMaskAfterAccept, showToast]);

  const discardStages = React.useCallback((stageIds: string[]) => {
    const ids = Array.from(new Set(stageIds)).filter(Boolean);
    if (ids.length <= 0) return;
    dispatchCanvasDocument({ type: 'discard_stages', stageIds: ids });
    setSelectedStageIds((current) => current.filter((stageId) => !ids.includes(stageId)));
    setCompareStages(false);
  }, []);

  const toggleStageSelection = React.useCallback((stageId: string) => {
    setSelectedStageIds((current) => (
      current.includes(stageId)
        ? current.filter((candidate) => candidate !== stageId)
        : [...current, stageId]
    ));
  }, []);

  const toolButtons: Array<{
    id: CanvasTool;
    label: string;
    icon: React.ReactNode;
    target?: CanvasEditTarget;
    disabled?: boolean;
  }> = [
    { id: 'pan', label: 'Pan canvas', icon: <Hand size={13} /> },
    { id: 'brush', target: 'mask', label: 'Paint inpaint mask', icon: <Brush size={13} /> },
    { id: 'erase', target: 'mask', label: 'Erase inpaint mask', icon: <Eraser size={13} /> },
    {
      id: 'erase',
      target: 'raster',
      label: layerEraseUnavailableReason || `Erase pixels from ${activeRasterLayer?.name || 'selected image layer'}`,
      disabled: !!layerEraseUnavailableReason,
      icon: (
        <span className="relative inline-flex h-4 w-4 items-center justify-center">
          <Eraser size={12} />
          <Layers3 size={7} className="absolute -bottom-0.5 -right-0.5 fill-current" />
        </span>
      ),
    },
    { id: 'box', target: 'mask', label: 'Rectangle mask', icon: <BoxSelect size={13} /> },
    { id: 'lasso', target: 'mask', label: 'Freehand lasso mask', icon: <LassoSelect size={13} /> },
    { id: 'polygon', target: 'mask', label: 'Polygon mask', icon: <SquareDashed size={13} /> },
  ];
  const operationMode = canvasDocument?.operationMode || 'inpaint';
  const running = inpaintJobRunning;
  const generationBlockedReason = !source || !canvasDocument
    ? 'Open an image before generating.'
    : !visibleGenerationRegion
      ? 'Create a valid generation region before generating.'
      : !canvasReady
        ? 'Waiting for the Canvas document to finish loading.'
        : !comfyConnected
          ? 'Launch ComfyUI before generating.'
          : !inpaintRuntimeCapabilities
            ? 'Waiting for ComfyUI inpaint capabilities.'
            : !prompt.trim()
              ? 'Enter an inpaint prompt.'
              : pipelineError
                ? pipelineError
                : modelCompatibilityIssue
                  ? modelCompatibilityIssue
                  : !checkpointName
                    ? 'Choose a checkpoint.'
                    : '';
  const generationReady = !generationBlockedReason;
  const progress = job ? (job.completed + job.failed) / Math.max(1, job.total) : 0;
  const boxStyle = boxPreview ? normalizeBox(boxPreview) : tool === 'sam' ? samBox : null;
  const activeCanvasLayerIsSource = activeCanvasLayer?.kind === 'raster' && activeCanvasLayer.role === 'source';
  const activeCanvasLayerIsProtectedMask = !!activeCanvasLayer
    && activeCanvasLayer.kind === 'mask'
    && (activeCanvasLayer.frozen || activeCanvasLayer.purpose !== 'inpaint');
  const activeCanvasLayerMutationLocked = !!activeCanvasLayer && (activeCanvasLayer.locked || activeCanvasLayerIsSource);
  return (
    <section
      data-umbra-inpaint-workspace=""
      data-umbra-canvas-studio={studioMode ? '' : undefined}
      className={cn(
        'col-span-2 grid min-h-0 min-w-0 bg-black/10',
        studioMode
          ? 'grid-cols-[clamp(220px,17vw,260px)_clamp(210px,16vw,244px)_minmax(0,1fr)_clamp(238px,18vw,286px)] grid-rows-[auto_minmax(0,1fr)]'
          : 'grid-cols-[clamp(232px,18vw,280px)_clamp(220px,17vw,260px)_minmax(0,1fr)]',
      )}
    >
      {studioMode ? (
        <UmbraCanvasStudioToolbar
          studio={canvasStudio}
          onFitView={fitStudioView}
          onResetView={resetStudioView}
          onZoomIn={() => zoomStudioView(1.2)}
          onZoomOut={() => zoomStudioView(1 / 1.2)}
        />
      ) : null}
      <aside data-umbra-inpaint-generation-sidebar="" className="min-h-0 min-w-0 overflow-y-auto border-r border-white/10 bg-black/15 p-3 custom-scrollbar">
        <div className="mb-3 flex items-center gap-2">
          <WandSparkles size={13} className="text-rose-300" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">Generation</h2>
          <span className="ml-auto font-mono text-[8px] uppercase text-zinc-600">{operationMode}</span>
        </div>

        <div className="space-y-3">
          <label className="block space-y-1.5">
            <span className={labelClass}>Model Pipeline</span>
            <select value={modelFamily} onChange={(event) => onModelFamilyChange(event.target.value)} className={inputClass}>
              {modelFamilyOptions.length <= 0 ? <option value="">No installed inpaint pipeline</option> : null}
              {modelFamilyOptions.map((family) => <option key={family} value={family}>{family}</option>)}
            </select>
          </label>
          {pipelineError ? <div className="font-mono text-[9px] leading-relaxed text-red-300/80">{pipelineError}</div> : null}
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
            <UmbraLoraStackControls
              loras={loras}
              availableCount={loraAvailableCount}
              onChange={onLorasChange}
              onOpenPicker={onOpenLoraPicker}
              onAddPromptToken={onAddPromptToken}
            />
          ) : null}

          <UmbraPositivePromptEditor
            segments={promptSegments}
            activeSegmentId={activePromptSegmentId}
            onChange={onPromptSegmentsChange}
            onActiveSegmentChange={onActivePromptSegmentChange}
            history={canvasDocument?.generation.promptHistory || []}
            onRememberCurrent={() => { rememberCurrentPrompt(); }}
            onRestoreHistory={restorePromptHistoryEntry}
            onRemoveHistory={removePromptHistoryEntry}
            onClearHistory={clearPromptHistory}
            accent="rose"
          />
          {capabilities.negativePrompt.support === 'adjustable' ? (
            <label className="block space-y-1.5">
              <span className={labelClass}>Negative Prompt</span>
              <textarea value={negativePrompt} onChange={(event) => onNegativePromptChange(event.target.value)} className={`${inputClass} min-h-16 resize-y leading-relaxed`} />
            </label>
          ) : null}

          <div className="flex items-center gap-2 border-t border-white/10 pt-3">
            <Settings2 size={11} className="text-rose-300" />
            <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Generation Pipeline</span>
          </div>
          {capabilities.seed.support === 'adjustable' ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Dices size={11} className="text-rose-300" />
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Seed</span>
                <span className="ml-auto font-mono text-[8px] uppercase text-zinc-600">{seedIsRandom ? 'Random each run' : 'Fixed'}</span>
              </div>
              <div className="grid grid-cols-2 border border-white/10 p-0.5">
                <button type="button" onClick={() => onSeedChange('0')} className={cn('h-7 font-mono text-[8px] font-black uppercase', seedIsRandom ? 'bg-rose-500/15 text-rose-100' : 'text-zinc-600 hover:text-zinc-300')}>Random</button>
                <button type="button" onClick={() => seedIsRandom && onSeedChange(String(createRandomGenerationSeed()))} className={cn('h-7 font-mono text-[8px] font-black uppercase', !seedIsRandom ? 'bg-cyan-500/15 text-cyan-100' : 'text-zinc-600 hover:text-zinc-300')}>Fixed</button>
              </div>
              {!seedIsRandom ? (
                <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
                  <input
                    value={seed}
                    onChange={(event) => onSeedChange(event.target.value.replace(/[^0-9]/g, '').slice(0, 16))}
                    onBlur={() => {
                      const numeric = Math.max(1, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(Number(seed) || 1)));
                      onSeedChange(String(numeric));
                    }}
                    inputMode="numeric"
                    aria-label="Fixed seed"
                    className={inputClass}
                  />
                  <button type="button" onClick={() => onSeedChange(String(createRandomGenerationSeed()))} title="Choose another fixed seed" className="inline-flex h-9 items-center justify-center border border-cyan-300/20 text-cyan-200 hover:bg-cyan-500/[0.07]"><Dices size={11} /></button>
                </div>
              ) : null}
            </div>
          ) : null}

          {capabilities.steps.support === 'adjustable' || capabilities.guidance.support === 'adjustable' ? (
            <div className={cn('grid gap-2', capabilities.steps.support === 'adjustable' && capabilities.guidance.support === 'adjustable' ? 'grid-cols-2' : 'grid-cols-1')}>
              {capabilities.steps.support === 'adjustable' ? <label className="space-y-1.5"><span className={labelClass}>Steps</span><input value={steps} onChange={(event) => onStepsChange(event.target.value)} inputMode="numeric" className={inputClass} /></label> : null}
              {capabilities.guidance.support === 'adjustable' ? <label className="space-y-1.5"><span className={labelClass}>{capabilities.guidance.label}</span><input value={cfg} onChange={(event) => onCfgChange(event.target.value)} inputMode="decimal" className={inputClass} /></label> : null}
            </div>
          ) : null}
          {capabilities.sampler.support === 'adjustable' || capabilities.scheduler.support === 'adjustable' ? (
            <div className="grid grid-cols-2 gap-2">
              {capabilities.sampler.support === 'adjustable' ? <label className="space-y-1.5"><span className={labelClass}>Sampler</span><select value={samplerName} onChange={(event) => onSamplerNameChange(event.target.value)} className={inputClass}>{samplerOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : null}
              {capabilities.scheduler.support === 'adjustable' ? <label className="space-y-1.5"><span className={labelClass}>Scheduler</span><select value={scheduler} onChange={(event) => onSchedulerChange(event.target.value)} className={inputClass}>{schedulerOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></label> : null}
            </div>
          ) : null}

          <div className="grid grid-cols-[80px_minmax(0,1fr)] gap-2 border-t border-white/10 pt-3">
            <label className="space-y-1.5">
              <span className={labelClass}>Samples</span>
              <input type="number" min={1} max={8} value={samples} onChange={(event) => setSamples(Math.max(1, Math.min(8, Number(event.target.value) || 1)))} className={inputClass} />
            </label>
            <button
              type="button"
              onClick={() => void generateSamples()}
              disabled={!generationReady || isSubmitting || running}
              title={generationBlockedReason || (running ? 'Generation is already running.' : 'Queue generation through the selected locked inpaint pipeline')}
              className="mt-[18px] inline-flex h-9 items-center justify-center gap-2 rounded-md border border-rose-300/35 bg-rose-500/[0.12] text-[9px] font-black uppercase tracking-[0.14em] text-rose-100 transition-colors hover:bg-rose-500/[0.18] disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.03] disabled:text-zinc-700"
            >
              {isSubmitting || running ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
              {running ? `${job?.completed || 0}/${job?.total || samples}` : 'Generate Inpaint'}
            </button>
          </div>
          {running ? (
            <button type="button" onClick={() => void cancelActiveJob()} className="inline-flex h-8 w-full items-center justify-center gap-2 border border-red-300/25 bg-red-500/[0.06] text-[8px] font-black uppercase tracking-[0.12em] text-red-200">
              <X size={10} /> Cancel Current Job
            </button>
          ) : job && isUmbraUiInpaintJobTerminal(job) ? (
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" onClick={() => void generateSamples()} disabled={!generationReady || isSubmitting} title={generationBlockedReason || 'Retry with the current seed and settings'} className="inline-flex h-8 items-center justify-center gap-1.5 border border-white/10 text-[8px] font-black uppercase text-zinc-400 disabled:text-zinc-800"><RotateCcw size={10} /> Retry</button>
              <button type="button" onClick={rerollSamples} disabled={!generationReady || isSubmitting} title={generationBlockedReason || 'Discard unpinned stages and retry with a new seed'} className="inline-flex h-8 items-center justify-center gap-1.5 border border-cyan-300/20 text-[8px] font-black uppercase text-cyan-200 disabled:text-zinc-800"><WandSparkles size={10} /> Reroll</button>
            </div>
          ) : null}
          {job ? (
            <div className="h-1 overflow-hidden bg-white/10">
              <div className="h-full bg-rose-400 transition-[width] duration-200" style={{ width: `${Math.max(3, progress * 100)}%` }} />
            </div>
          ) : null}
        </div>
      </aside>

      <aside data-umbra-inpaint-settings-sidebar="" className="min-h-0 min-w-0 overflow-y-auto border-r border-white/10 bg-[#07090a] p-3 custom-scrollbar">
        <div className="mb-3 flex items-center gap-2">
          <Focus size={13} className="text-cyan-300" />
          <h2 className="text-[10px] font-black uppercase tracking-[0.16em] text-zinc-300">Inpaint Settings</h2>
          {source ? <span className="ml-auto font-mono text-[8px] text-zinc-600">{canvasSize.width}x{canvasSize.height}</span> : null}
        </div>

        <div className="space-y-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(event) => {
              handleFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-500/[0.07] text-[9px] font-black uppercase tracking-[0.14em] text-cyan-100 transition-colors hover:bg-cyan-500/[0.12]"
          >
            <Upload size={12} /> {source ? 'Replace Source Image' : 'Open Image'}
          </button>
          {source ? (
            <div className="flex items-center gap-2 border-y border-white/10 py-2">
              <FileImage size={12} className="shrink-0 text-cyan-300" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[9px] text-zinc-300" title={source.name}>{source.name}</div>
                <div className="font-mono text-[8px] text-zinc-600">{source.width}x{source.height} source</div>
              </div>
            </div>
          ) : null}

          <details className="border border-white/[0.08] bg-black/20">
            <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 px-2.5 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400">
              <FolderOpen size={11} className="text-zinc-500" /> Project
              <span className="ml-auto max-w-28 truncate font-mono text-[8px] font-normal normal-case tracking-normal text-zinc-600">{canvasDocument?.name || 'No project'}</span>
              <ChevronDown size={10} />
            </summary>
            <div className="space-y-1.5 border-t border-white/[0.08] p-2">
              <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
                <button
                  type="button"
                  onClick={showProjectBrowser}
                  title="Browse saved inpaint projects"
                  className="flex h-8 min-w-0 items-center gap-2 border border-white/10 bg-black/30 px-2 text-left outline-none hover:border-cyan-300/30 focus:border-cyan-300/35"
                >
                  <FolderOpen size={10} className="shrink-0 text-zinc-500" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[8px] text-zinc-300">{canvasDocument?.name || 'Browse projects'}</span>
                  <span className="shrink-0 font-mono text-[7px] font-black uppercase text-cyan-200/70">Browse</span>
                  <ChevronRight size={9} className="shrink-0 text-zinc-600" />
                </button>
                <button type="button" onClick={() => canvasDocument && void persistProject(canvasDocument, true)} disabled={!canvasDocument || projectSaveState === 'saving'} title="Save inpaint project" className="inline-flex h-8 items-center justify-center border border-cyan-300/20 text-cyan-100 disabled:border-white/10 disabled:text-zinc-800">
                  {projectSaveState === 'saving' ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                </button>
              </div>
              {canvasDocument ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
                    <input
                      value={projectNameDraft}
                      onChange={(event) => setProjectNameDraft(event.target.value)}
                      onBlur={() => {
                        const name = projectNameDraft.trim() || 'Untitled Canvas';
                        setProjectNameDraft(name);
                        if (name !== canvasDocument.name) dispatchCanvasDocument({ type: 'set_document_name', name });
                      }}
                      onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                      aria-label="Inpaint project name"
                      className="h-8 min-w-0 border border-white/10 bg-black/30 px-2 font-mono text-[8px] text-zinc-300 outline-none focus:border-cyan-300/35"
                    />
                    <button type="button" onClick={() => void deleteCurrentProject()} title="Delete inpaint project" className="inline-flex h-8 items-center justify-center border border-red-300/20 text-red-200/80 hover:bg-red-500/10"><Trash2 size={10} /></button>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_34px] gap-1.5">
                    <input value={saveAsName} onChange={(event) => setSaveAsName(event.target.value)} aria-label="Save inpaint project as" placeholder="Save as..." className="h-8 min-w-0 border border-white/10 bg-black/30 px-2 font-mono text-[8px] text-zinc-400 outline-none focus:border-cyan-300/35" />
                    <button type="button" onClick={() => void saveProjectAs()} disabled={!saveAsName.trim() || projectSaveState === 'saving'} title="Save as a separate project" className="inline-flex h-8 items-center justify-center border border-cyan-300/20 text-cyan-200 disabled:text-zinc-800"><FolderPlus size={10} /></button>
                  </div>
                </>
              ) : null}
              <div className={cn('text-right font-mono text-[7px] uppercase', projectSaveState === 'error' ? 'text-red-300' : projectSaveState === 'saved' ? 'text-emerald-300/70' : 'text-zinc-700')}>
                {projectSaveState === 'saving' ? 'autosaving' : projectSaveState === 'error' ? 'autosave failed' : projectSaveState === 'saved' ? 'saved' : 'autosave ready'}
              </div>
            </div>
          </details>

          {source && capabilities.resolution.support !== 'unsupported' ? (
            <div className="space-y-2.5 border-t border-white/10 pt-3">
              <div className="flex items-center gap-2">
                <Maximize2 size={11} className="text-cyan-300" />
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Image Size</span>
                <span className="ml-auto font-mono text-[8px] text-zinc-600">{canvasSize.width}x{canvasSize.height}</span>
              </div>
              <div className="grid grid-cols-2 border border-white/10 p-0.5">
                <button type="button" onClick={disableCanvasResize} className={cn('h-7 font-mono text-[8px] font-black uppercase', !resizeEnabled ? 'bg-rose-500/15 text-rose-100' : 'text-zinc-600 hover:text-zinc-300')}>Keep Size</button>
                <button type="button" onClick={enableCanvasResize} className={cn('h-7 font-mono text-[8px] font-black uppercase', resizeEnabled ? 'bg-cyan-500/15 text-cyan-100' : 'text-zinc-600 hover:text-zinc-300')}>Resize</button>
              </div>
              {resizeEnabled ? (
                <div className="space-y-2">
                  <label className="block space-y-1.5"><span className={labelClass}>Aspect Ratio</span><select value={resizeAspectRatio} onChange={(event) => updateResizeAspectRatio(event.target.value as InpaintResizeAspectValue)} className={inputClass}>{INPAINT_RESIZE_ASPECT_RATIO_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1.5"><span className={labelClass}>Width</span><input value={resizeWidth} onChange={(event) => updateResizeWidth(event.target.value.replace(/[^0-9]/g, ''))} onBlur={normalizeResizeFields} inputMode="numeric" className={inputClass} /></label>
                    <label className="space-y-1.5"><span className={labelClass}>Height</span><input value={resizeHeight} onChange={(event) => updateResizeHeight(event.target.value.replace(/[^0-9]/g, ''))} onBlur={normalizeResizeFields} inputMode="numeric" className={inputClass} /></label>
                  </div>
                  <button type="button" onClick={() => void applyCanvasResize()} disabled={!resizeHasChanges || maskProcessing || inpaintJobRunning || (canvasDocument?.pendingJobs.length || 0) > 0} title={resizeChangesAspect ? 'Center-crop the layered canvas to this aspect ratio, then resize it. Undo restores the previous canvas.' : 'Resize the layered canvas. Undo restores the previous canvas.'} className="inline-flex h-8 w-full items-center justify-center gap-2 border border-cyan-300/25 bg-cyan-500/[0.06] text-[8px] font-black uppercase tracking-[0.12em] text-cyan-100 disabled:border-white/10 disabled:bg-white/[0.02] disabled:text-zinc-700">
                    {maskProcessing ? <Loader2 size={10} className="animate-spin" /> : resizeChangesAspect ? <Crop size={10} /> : <Maximize2 size={10} />}
                    {resizeChangesAspect ? 'Apply Crop & Resize' : 'Apply Resize'}
                    <span className="font-mono text-cyan-200/65">{resizeTarget.width}x{resizeTarget.height}</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-3 border-t border-white/10 pt-3">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">Edit Mode</span>
                <span className="font-mono text-[9px] font-semibold uppercase text-zinc-500">
                  {SIMPLE_INPAINT_TASK_MODES.find((mode) => mode.id === activeInpaintTaskMode)?.label || 'Custom'}
                </span>
              </div>
              <div className="grid grid-cols-3 border border-white/10 bg-black/20 p-0.5" aria-label="Inpaint edit mode">
                {SIMPLE_INPAINT_TASK_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => applyInpaintTaskMode(mode)}
                    title={mode.id === 'touch_up'
                      ? 'Preserve the source while repairing small details or adding subtle surface changes'
                      : mode.id === 'recolor'
                        ? 'Preserve shape and texture while changing hair, clothing, or object color'
                        : 'Rebuild masked content such as clothing, hair, or objects'}
                    className={cn(
                      'h-9 font-mono text-[10px] font-black uppercase transition-colors',
                      activeInpaintTaskMode === mode.id
                        ? 'bg-cyan-500/20 text-cyan-100'
                        : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200',
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex min-h-9 cursor-pointer items-center gap-2 border border-white/10 bg-white/[0.02] px-2.5">
              <input
                type="checkbox"
                role="switch"
                checked={softInpaintEnabled && softInpaintCompositeAvailable}
                onChange={(event) => setSoftInpaintEnabled(event.target.checked)}
                disabled={!softInpaintCompositeAvailable}
                className="h-4 w-4 shrink-0 accent-rose-400"
              />
              <Focus size={13} className="text-rose-300" />
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-200">Soft Inpaint</span>
              <span className="ml-auto text-[10px] font-semibold text-zinc-500">
                {softInpaintEnabled && softInpaintCompositeAvailable
                  ? SIMPLE_INPAINT_BLEND_MODES.find((mode) => mode.id === activeSoftInpaintBlendMode)?.label || 'Custom'
                  : 'Off'}
              </span>
            </label>
            {!softInpaintCompositeAvailable ? (
              <p className="border-l-2 border-amber-400/50 pl-2 text-[10px] leading-4 text-amber-200/70">
                Restart ComfyUI after updating Umbra Nodes to enable adaptive soft inpaint.
              </p>
            ) : (
              <p className="text-[10px] leading-4 text-zinc-500">
                Replaces the painted interior at full opacity and blends only the feathered edge.
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-300">Edge Blend</span>
              <span className="font-mono text-[9px] font-semibold uppercase text-zinc-500">
                {SIMPLE_INPAINT_BLEND_MODES.find((mode) => mode.id === activeSoftInpaintBlendMode)?.label || 'Custom'}
              </span>
            </div>
            <div className="grid grid-cols-3 border border-white/10 bg-black/20 p-0.5" aria-label="Soft inpaint blend mode">
              {SIMPLE_INPAINT_BLEND_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => applySoftInpaintBlendMode(mode)}
                  disabled={!softInpaintCompositeAvailable}
                  title={mode.id === 'tight'
                    ? 'Narrow, firm transition for precise replacements'
                    : mode.id === 'balanced'
                      ? 'Moderate edge blend for most edits'
                      : 'Wide, gentle transition for broad tonal changes'}
                  className={cn(
                    'h-8 font-mono text-[10px] font-black uppercase transition-colors disabled:cursor-not-allowed disabled:opacity-35',
                    activeSoftInpaintBlendMode === mode.id && softInpaintEnabled
                      ? 'bg-rose-500/20 text-rose-100'
                      : 'text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-200',
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
                Edge Softness
                <span className="font-mono text-zinc-300">{maskFeather}px</span>
              </span>
              <input
                type="range"
                min={0}
                max={128}
                step={1}
                value={maskFeather}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setMaskFeather(value);
                  setCoherenceEdgeSize(value);
                }}
                className="w-full accent-rose-400"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
                Edge Source Protection
                <span className="font-mono text-zinc-300">{Math.round(softInpaintPreservation * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={softInpaintPreservation}
                onChange={(event) => setSoftInpaintPreservation(Number(event.target.value))}
                disabled={!softInpaintEnabled || !softInpaintCompositeAvailable}
                className="w-full accent-rose-400 disabled:opacity-35"
              />
            </label>
            <label
              className={cn('block space-y-1.5', !colorMatchAvailable && 'opacity-45')}
              title={colorMatchAvailable
                ? 'Match the generated region colors to the surrounding source image'
                : 'Color matching is unavailable for this inpaint pipeline'}
            >
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
                Color Match
                <span className="font-mono text-zinc-300">{Math.round(colorMatch * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={colorMatch}
                onChange={(event) => setColorMatch(Number(event.target.value))}
                disabled={!colorMatchAvailable}
                className="w-full accent-cyan-400 disabled:opacity-35"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
                Edge Contrast
                <span className="font-mono text-zinc-300">{softInpaintTransitionContrast.toFixed(2)}x</span>
              </span>
              <input
                type="range"
                min={0.25}
                max={8}
                step={0.05}
                value={softInpaintTransitionContrast}
                onChange={(event) => setSoftInpaintTransitionContrast(Number(event.target.value))}
                disabled={!softInpaintEnabled || !softInpaintCompositeAvailable}
                className="w-full accent-rose-400 disabled:opacity-35"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
                Edge Mask Bias
                <span className="font-mono text-zinc-300">{Math.round(softInpaintMaskInfluence * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={softInpaintMaskInfluence}
                onChange={(event) => setSoftInpaintMaskInfluence(Number(event.target.value))}
                disabled={!softInpaintEnabled || !softInpaintCompositeAvailable}
                className="w-full accent-rose-400 disabled:opacity-35"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="flex items-center justify-between gap-2 text-[10px] font-black uppercase tracking-[0.08em] text-zinc-400">
                Denoise
                <span className="font-mono text-zinc-300">{denoise.toFixed(2)}</span>
              </span>
              <input type="range" min={0.05} max={1} step={0.01} value={denoise} onChange={(event) => setDenoise(Number(event.target.value))} className="w-full accent-rose-400" />
            </label>
          </div>

          {false ? <details open className="border-t border-white/10 pt-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">
              <Focus size={11} className="text-rose-300" /> Mask Processing <ChevronDown size={10} className="ml-auto" />
            </summary>
            <div className="mt-2 space-y-2.5">
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1.5">
                  <span className={labelClass}>Grow</span>
                  <input type="number" min={0} max={2048} value={maskGrow} onChange={(event) => setMaskGrow(Math.max(0, Math.min(2048, Number(event.target.value) || 0)))} disabled={!maskExpansionAvailable} title={maskExpansionAvailable ? 'Grow the submitted mask' : 'INPAINT_ExpandMask is not installed'} className={inputClass} />
                </label>
                <label className="space-y-1.5">
                  <span className={labelClass}>Feather</span>
                  <input type="number" min={0} max={2048} value={maskFeather} onChange={(event) => setMaskFeather(Math.max(0, Math.min(2048, Number(event.target.value) || 0)))} disabled={!maskExpansionAvailable} title={maskExpansionAvailable ? 'Feather the submitted mask' : 'INPAINT_ExpandMask is not installed'} className={inputClass} />
                </label>
                <label className="space-y-1.5">
                  <span className={labelClass}>Context</span>
                  <input type="number" min={0} max={2048} step={8} value={contextPadding} onChange={(event) => setContextPadding(Math.max(0, Math.min(2048, Number(event.target.value) || 0)))} className={inputClass} />
                </label>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className={labelClass}>Scale Before Processing</span>
                  <span className="ml-auto font-mono text-[8px] text-zinc-600">
                    {(visibleContextRegion || visibleGenerationRegion)?.width || 0}x{(visibleContextRegion || visibleGenerationRegion)?.height || 0}
                    {processingSize.resized ? ` -> ${processingSize.width}x${processingSize.height}` : ''}
                  </span>
                </div>
                <div className="grid grid-cols-3 border border-white/10 p-0.5">
                  {(['none', 'auto', 'manual'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setProcessingScaleMode(mode)}
                      className={cn(
                        'h-7 font-mono text-[8px] font-black uppercase',
                        processingScaleMode === mode ? 'bg-rose-500/15 text-rose-100' : 'text-zinc-600 hover:text-zinc-300',
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
                {processingScaleMode === 'manual' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1.5">
                      <span className={labelClass}>Processing Width</span>
                      <input type="number" min={64} max={16384} step={capabilities.resolution.step || 8} value={processingWidth} onChange={(event) => setProcessingWidth(Math.max(64, Math.min(16384, Number(event.target.value) || 64)))} className={inputClass} />
                    </label>
                    <label className="space-y-1.5">
                      <span className={labelClass}>Processing Height</span>
                      <input type="number" min={64} max={16384} step={capabilities.resolution.step || 8} value={processingHeight} onChange={(event) => setProcessingHeight(Math.max(64, Math.min(16384, Number(event.target.value) || 64)))} className={inputClass} />
                    </label>
                  </div>
                ) : null}
                {processingSize.limitedByMemory ? <div className="font-mono text-[8px] text-amber-300/80">Limited to 64 MP</div> : null}
              </div>
              <div className="space-y-1.5 border-t border-white/[0.06] pt-2">
                <span className={labelClass}>Coherence Pass</span>
                <select value={coherenceMode} onChange={(event) => setCoherenceMode(event.target.value as UmbraCanvasCoherenceMode)} className={inputClass}>
                  <option value="none">Off</option>
                  <option value="gaussian">Gaussian Falloff</option>
                  <option value="box">Box Falloff</option>
                  <option value="staged">Staged Edge</option>
                </select>
                {coherenceMode !== 'none' ? (
                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1.5">
                      <span className={labelClass}>Edge Size</span>
                      <input type="number" min={0} max={256} step={1} value={coherenceEdgeSize} onChange={(event) => setCoherenceEdgeSize(Math.max(0, Math.min(256, Number(event.target.value) || 0)))} className={inputClass} />
                    </label>
                    <label className="space-y-1.5">
                      <span className={labelClass}>Minimum Denoise {coherenceMinimumDenoise.toFixed(2)}</span>
                      <input type="range" min={0} max={1} step={0.01} value={coherenceMinimumDenoise} onChange={(event) => setCoherenceMinimumDenoise(Number(event.target.value))} className="w-full accent-cyan-400" />
                    </label>
                  </div>
                ) : null}
              </div>
              <div className={cn('space-y-1.5 border-t border-white/[0.06] pt-2', !effectiveSeamlessAvailable && 'opacity-45')} title={effectiveSeamlessAvailable ? 'Use circular model and VAE padding on the selected axes' : seamlessReason || 'UmbraSeamlessTiling is not installed'}>
                <span className={labelClass}>Seamless Tiling</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <label className="flex h-8 items-center gap-2 border border-white/10 px-2.5 font-mono text-[8px] uppercase">
                    <input type="checkbox" checked={seamlessX} onChange={(event) => setSeamlessX(event.target.checked)} disabled={!effectiveSeamlessAvailable || !seamlessAxes.includes('x')} className="accent-cyan-400" />
                    <span>Horizontal X</span>
                  </label>
                  <label className="flex h-8 items-center gap-2 border border-white/10 px-2.5 font-mono text-[8px] uppercase">
                    <input type="checkbox" checked={seamlessY} onChange={(event) => setSeamlessY(event.target.checked)} disabled={!effectiveSeamlessAvailable || !seamlessAxes.includes('y')} className="accent-cyan-400" />
                    <span>Vertical Y</span>
                  </label>
                </div>
                {!effectiveSeamlessAvailable ? <div className="font-mono text-[8px] text-zinc-700">{seamlessReason || 'UmbraSeamlessTiling is not installed.'}</div> : null}
              </div>
              <label className={cn('flex h-9 items-center gap-2 border border-white/10 px-2.5 font-mono text-[8px] uppercase', !maskedOutputAvailable && 'text-zinc-700')} title={maskedOutputAvailable ? 'Save generated pixels with transparency outside the active mask' : 'The selected native edit provider does not declare RGBA masked output.'}>
                <input type="checkbox" checked={outputOnlyMaskedRegions} onChange={(event) => setOutputOnlyMaskedRegions(event.target.checked)} disabled={!maskedOutputAvailable} className="accent-cyan-400" />
                <span>Output Only Masked Regions</span>
              </label>
              <label className="block space-y-1.5">
                <span className={labelClass}>Masked Fill</span>
                <select value={fillMode} onChange={(event) => setFillMode(event.target.value as UmbraUiInpaintFillMode)} className={inputClass}>
                  <option value="navier-stokes" disabled={!maskedFillAvailable}>Navier-Stokes{maskedFillAvailable ? '' : ' (Unavailable)'}</option>
                  <option value="telea" disabled={!maskedFillAvailable}>Telea{maskedFillAvailable ? '' : ' (Unavailable)'}</option>
                  <option value="neutral">Neutral</option>
                  <option value="color" disabled={!colorPrefillAvailable}>Solid Color{colorPrefillAvailable ? '' : ' (Unavailable)'}</option>
                  <option value="tile" disabled={!tilePrefillAvailable}>Source Tiles{tilePrefillAvailable ? '' : ' (Unavailable)'}</option>
                  <option value="lama" disabled={!modelInfillAvailable}>LaMa / MAT Model{modelInfillAvailable ? '' : ' (Unavailable)'}</option>
                </select>
              </label>
              {fillMode === 'color' ? (
                <label className="flex items-center gap-2 border border-white/10 px-2.5 py-2">
                  <span className={labelClass}>Infill Color</span>
                  <input type="color" value={infillColor} onChange={(event) => setInfillColor(event.target.value)} className="ml-auto h-7 w-10 cursor-pointer border-0 bg-transparent p-0" />
                  <span className="w-16 font-mono text-[8px] text-zinc-500">{infillColor}</span>
                </label>
              ) : null}
              {fillMode === 'tile' ? (
                <label className="block space-y-1.5">
                  <span className={labelClass}>Tile Size</span>
                  <input type="number" min={8} max={512} step={8} value={infillTileSize} onChange={(event) => setInfillTileSize(Math.max(8, Math.min(512, Number(event.target.value) || 8)))} className={inputClass} />
                </label>
              ) : null}
              {fillMode === 'lama' ? (
                <label className="block space-y-1.5">
                  <span className={labelClass}>Infill Model</span>
                  <select value={inpaintModelName} onChange={(event) => setInpaintModelName(event.target.value)} disabled={!modelInfillAvailable} className={inputClass}>
                    {inpaintModels.length <= 0 ? <option value="">No LaMa / MAT models installed</option> : null}
                    {inpaintModels.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block space-y-1.5">
                <span className={labelClass}>Denoise {denoise.toFixed(2)}</span>
                <input type="range" min={0.05} max={1} step={0.01} value={denoise} onChange={(event) => setDenoise(Number(event.target.value))} className="w-full accent-rose-400" />
              </label>
              <label className={cn('block space-y-1.5', !colorMatchAvailable && 'opacity-45')} title={colorMatchAvailable ? 'Match generated colors to the source context' : 'Color matching is unavailable for this provider or installation'}>
                <span className={labelClass}>Color Match {Math.round(colorMatch * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={colorMatch} onChange={(event) => setColorMatch(Number(event.target.value))} disabled={!colorMatchAvailable} className="w-full accent-cyan-400" />
              </label>
              <label className={cn('block space-y-1.5', !differentialDiffusionAvailable && 'opacity-45')} title={differentialDiffusionAvailable ? 'Blend feathered denoise strength through Differential Diffusion' : 'Differential Diffusion is unavailable for this provider or installation'}>
                <span className={labelClass}>Differential Blend {Math.round(differentialStrength * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={differentialStrength} onChange={(event) => setDifferentialStrength(Number(event.target.value))} disabled={!differentialDiffusionAvailable} className="w-full accent-emerald-400" />
              </label>
            </div>
          </details> : null}

          {false ? <details open className="border-t border-white/10 pt-2">
            <summary className="flex cursor-pointer list-none items-center gap-2 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-400">
              <Maximize2 size={11} className="text-cyan-300" /> Outpaint Frame <ChevronDown size={10} className="ml-auto" />
            </summary>
            <div className="mt-2 space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {(['left', 'right', 'top', 'bottom'] as const).map((side) => (
                  <label key={side} className="space-y-1.5">
                    <span className="block truncate text-center text-[8px] font-black uppercase text-zinc-600">{side}</span>
                    <input
                      type="number"
                      min={0}
                      max={UMBRA_CANVAS_INTERACTIVE_MAX_SIDE - 1}
                      step={8}
                      value={draftMargins[side]}
                      onChange={(event) => setDraftMargins((current) => ({ ...current, [side]: Number(event.target.value) }))}
                      className={`${inputClass} px-1 text-center`}
                    />
                  </label>
                ))}
              </div>
              <button type="button" onClick={applyOutpaintFrame} disabled={!source} className="inline-flex h-8 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-500/[0.06] text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 disabled:text-zinc-700">
                <Maximize2 size={11} /> Apply Frame
              </button>
            </div>
          </details> : null}

          {source ? (
            <button
              type="button"
              onClick={() => void sendCanvasToImg2Img()}
              disabled={isSavingCanvas || !!fullResolutionOperation || isExportingPsd}
              title={previewStage
                ? 'Accept the staged inpaint result before continuing in IMG2IMG'
                : 'Flatten the accepted canvas, preserve its generation metadata, and continue through IMG2IMG with the current detailers'}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-cyan-300/25 bg-cyan-500/[0.07] text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100 transition-colors hover:bg-cyan-500/[0.12] disabled:border-white/10 disabled:bg-white/[0.025] disabled:text-zinc-700"
            >
              {isSavingCanvas ? <Loader2 size={11} className="animate-spin" /> : <ImagePlus size={11} />}
              Continue in IMG2IMG
            </button>
          ) : null}
        </div>
      </aside>

      <main
        className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-black/25 transition-[padding-right] duration-150 ease-out"
        style={{ paddingRight: layersExpanded ? 'clamp(248px, 22vw, 320px)' : '40px' }}
      >
        <div data-umbra-inpaint-toolbar="" className="relative z-30 shrink-0 border-b border-white/10 bg-[#050708]/95 shadow-md shadow-black/35 backdrop-blur-sm">
          <div className="flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 px-2.5 py-1.5 [&>*]:shrink-0">
          {false ? (
            <>
          <div className="flex items-center gap-1 border border-white/[0.08] bg-black/30 p-0.5" aria-label="Canvas tools">
            {toolButtons.map((button) => (
              <button
                key={`${button.id}-${button.target || 'canvas'}`}
                type="button"
                onClick={() => selectCanvasTool(button.id, button.target)}
                disabled={button.disabled}
                title={button.label}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:border-transparent disabled:text-zinc-800',
                  tool === button.id && (!button.target || editTarget === button.target)
                    ? 'border-rose-300/50 bg-rose-500/[0.16] text-rose-50 shadow-sm shadow-rose-950/50'
                    : 'border-transparent text-zinc-600 hover:border-white/10 hover:bg-white/[0.035] hover:text-zinc-300',
                )}
              >
                {button.icon}
              </button>
            ))}
          </div>
          <div className="ml-1 h-5 w-px bg-white/10" />
          {tool === 'transform' ? (
            <>
              <select value={transformFitMode} onChange={(event) => setTransformFitMode(event.target.value as UmbraCanvasFitMode)} title="Fit mode" className="h-7 border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none">
                <option value="contain">Contain</option>
                <option value="cover">Cover</option>
                <option value="fill">Fill</option>
              </select>
              <button type="button" onClick={() => void fitActiveLayerToGenerationRegion(transformFitMode)} disabled={!activeTransformLayer || activeTransformLayer.locked || (activeTransformLayer.kind === 'raster' && activeTransformLayer.role === 'source')} title="Fit active layer to the generation region, or the whole canvas when no region is set" className="inline-flex h-7 items-center gap-1.5 border border-cyan-300/20 px-2 font-mono text-[7px] font-black uppercase text-cyan-200 disabled:border-white/5 disabled:text-zinc-800"><Maximize2 size={9} /> Fit</button>
              <button type="button" onClick={resetActiveLayerTransform} disabled={!canResetUmbraCanvasLayerTransform(activeTransformLayer)} title="Restore the active layer's original size, orientation, and mirroring while preserving its center" className="inline-flex h-7 items-center gap-1.5 border border-white/10 px-2 font-mono text-[7px] font-black uppercase text-zinc-400 disabled:border-white/5 disabled:text-zinc-800"><RotateCcw size={9} /> Reset</button>
              <div className="h-5 w-px bg-white/10" />
            </>
          ) : null}
          {tool === 'brush' || tool === 'erase' ? (
            <>
              <span className="inline-flex h-7 items-center border border-rose-300/20 bg-rose-500/[0.06] px-2 font-mono text-[7px] font-black uppercase text-rose-100">Inpaint Mask</span>
              <div className="h-5 w-px bg-white/10" />
            </>
          ) : null}
          {tool === 'eyedropper' ? <><CanvasColorPair primary={paintColor} secondary={secondaryPaintColor} onPrimaryChange={setPaintColor} onSecondaryChange={setSecondaryPaintColor} onSwap={() => { setPaintColor(secondaryPaintColor); setSecondaryPaintColor(paintColor); }} /><span className="font-mono text-[7px] uppercase text-zinc-600">Alt-click samples secondary</span></> : null}
          {tool === 'gradient' ? (
            <>
              <CanvasColorPair primary={paintColor} secondary={secondaryPaintColor} onPrimaryChange={setPaintColor} onSecondaryChange={setSecondaryPaintColor} onSwap={() => { setPaintColor(secondaryPaintColor); setSecondaryPaintColor(paintColor); }} />
              <select
                value={activeGradientLayer?.gradientType || 'linear'}
                onChange={(event) => activeGradientLayer && dispatchCanvasDocument({ type: 'update_gradient_layer', layerId: activeGradientLayer.id, changes: { gradientType: event.target.value as 'linear' | 'radial' } })}
                disabled={!activeGradientLayer}
                title="Gradient type"
                className="h-7 border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none disabled:text-zinc-700"
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
              <button
                type="button"
                aria-pressed={canvasPreferences.gradientClip}
                onClick={() => setCanvasPreferences((current) => ({ ...current, gradientClip: !current.gradientClip }))}
                title="Clip the gradient to the dragged transition range"
                className={cn('inline-flex h-7 items-center gap-1.5 border px-2 font-mono text-[7px] font-black uppercase', canvasPreferences.gradientClip ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600')}
              >
                <Crop size={9} /> Clip
              </button>
              <div className="h-5 w-px bg-white/10" />
            </>
          ) : null}
          {tool === 'shape' ? (
            <>
              <select value={shapeType} onChange={(event) => { setShapePoints([]); setBoxPreview(null); setShapeType(event.target.value as RasterShapeType); }} title="Raster shape type" className="h-7 border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none"><option value="rectangle">Rectangle</option><option value="ellipse">Ellipse</option><option value="line">Line</option><option value="polygon">Polygon</option><option value="freehand">Freehand</option></select>
              <CanvasColorPair primary={paintColor} secondary={secondaryPaintColor} onPrimaryChange={setPaintColor} onSecondaryChange={setSecondaryPaintColor} onSwap={() => { setPaintColor(secondaryPaintColor); setSecondaryPaintColor(paintColor); }} />
              {shapeType !== 'line' ? <label className="flex h-7 items-center gap-1.5 border border-white/10 px-2 font-mono text-[7px] uppercase text-zinc-400"><input type="checkbox" checked={shapeFilled} onChange={(event) => setShapeFilled(event.target.checked)} className="accent-cyan-300" /> Fill</label> : null}
              {!shapeFilled || shapeType === 'line' ? <label className="flex items-center gap-1.5"><span className="font-mono text-[7px] uppercase text-zinc-600">Stroke</span><input type="number" min={1} max={256} value={shapeStrokeWidth} onChange={(event) => setShapeStrokeWidth(Math.max(1, Math.min(256, Number(event.target.value) || 1)))} className="h-7 w-12 border border-white/10 bg-black/35 px-1 text-center font-mono text-[8px] text-zinc-400 outline-none" /></label> : null}
              <label className="flex items-center gap-1.5"><span className="font-mono text-[7px] uppercase text-zinc-600">Opacity</span><input type="range" min={0.05} max={1} step={0.05} value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} className="w-16 accent-rose-400" /><span className="w-7 text-right font-mono text-[8px] text-zinc-500">{Math.round(brushOpacity * 100)}%</span></label>
              {shapeType === 'polygon' ? <>
                <span className="font-mono text-[7px] uppercase text-zinc-600">{shapePoints.length} vertices</span>
                <button type="button" onClick={() => finishShapePolygon()} disabled={shapePoints.length < 3} title="Commit polygon shape (Enter)" className="inline-flex h-7 w-7 items-center justify-center border border-cyan-300/25 text-cyan-200 disabled:text-zinc-800"><Check size={10} /></button>
                <button type="button" onClick={() => setShapePoints([])} disabled={shapePoints.length <= 0} title="Cancel polygon shape (Escape)" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><X size={10} /></button>
              </> : null}
              <div className="h-5 w-px bg-white/10" />
            </>
          ) : null}
          {tool === 'brush' || tool === 'erase' ? (
            <>
              <label className="flex items-center gap-2 px-1">
                <span className="text-[8px] font-black uppercase text-zinc-600">{tool === 'erase' ? editTarget === 'raster' ? 'Layer Erase' : 'Mask Erase' : 'Brush'}</span>
                <input
                  type="range"
                  min={4}
                  max={512}
                  step={4}
                  value={tool === 'erase' ? eraserSize : brushSize}
                  onChange={(event) => (tool === 'erase' ? setEraserSize : setBrushSize)(Number(event.target.value))}
                  className="w-24 accent-rose-400"
                />
                <span className="w-8 text-right font-mono text-[8px] text-zinc-500">{tool === 'erase' ? eraserSize : brushSize}</span>
              </label>
              <label className="flex items-center gap-1.5 px-1" title="Brush opacity">
                <span className="text-[8px] font-black uppercase text-zinc-600">Opacity</span>
                <input type="range" min={0.05} max={1} step={0.05} value={brushOpacity} onChange={(event) => setBrushOpacity(Number(event.target.value))} className="w-16 accent-rose-400" />
                <span className="w-7 text-right font-mono text-[8px] text-zinc-500">{Math.round(brushOpacity * 100)}%</span>
              </label>
              <label className="flex items-center gap-1.5 px-1" title="Brush edge hardness">
                <span className="text-[8px] font-black uppercase text-zinc-600">Hard</span>
                <input type="range" min={0} max={1} step={0.05} value={brushHardness} onChange={(event) => setBrushHardness(Number(event.target.value))} className="w-16 accent-rose-400" />
                <span className="w-7 text-right font-mono text-[8px] text-zinc-500">{Math.round(brushHardness * 100)}%</span>
              </label>
              <div className="h-5 w-px bg-white/10" />
            </>
          ) : null}
          <div className="h-5 w-px bg-white/10" />
          <button type="button" aria-pressed={snapEnabled} onClick={() => setCanvasPreferences((current) => ({ ...current, snapEnabled: !current.snapEnabled }))} title="Toggle transform and region snapping" className={cn('inline-flex h-7 w-7 items-center justify-center rounded-sm border', snapEnabled ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600')}><Magnet size={11} /></button>
          {snapEnabled ? <input type="number" min={1} max={256} step={1} value={snapSize} onChange={(event) => setCanvasPreferences((current) => ({ ...current, snapSize: Math.max(1, Math.min(256, Number(event.target.value) || 8)) }))} title="Snap grid size" className="h-7 w-12 border border-white/10 bg-black/35 px-1 text-center font-mono text-[8px] text-zinc-500 outline-none" /> : null}
          <button type="button" aria-pressed={rulersEnabled} onClick={() => setCanvasPreferences((current) => ({ ...current, rulersEnabled: !current.rulersEnabled }))} title="Toggle canvas rulers" className={cn('inline-flex h-7 w-7 items-center justify-center rounded-sm border', rulersEnabled ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600')}><Ruler size={11} /></button>
          <details className="group relative">
            <summary title="Canvas editing preferences" className="inline-flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-sm border border-white/10 text-zinc-600 hover:text-zinc-300"><Settings2 size={11} /></summary>
            <div className="absolute right-0 top-8 z-50 w-52 border border-white/15 bg-[#090a0c] p-2 shadow-xl shadow-black/70">
              {([ 
                ['autoSaveStagesToGallery', 'Auto-save staged results'],
                ['clipToGenerationRegion', 'Clip tools to region'],
                ['dynamicGrid', 'Dynamic grid'],
                ['isolatedLayerPreview', 'Isolate active layer'],
                ['isolatedStagingPreview', 'Isolate staged result'],
                ['invertToolWheel', 'Invert Shift-wheel size'],
                ['ruleOfThirds', 'Rule of thirds'],
                ['showInpaintMaskOverlays', 'Show secondary masks'],
                ['showGenerationRegionOverlay', 'Show generation region'],
                ['showProgressOnCanvas', 'Show generation progress'],
                ['pressureSensitivity', 'Pen pressure'],
                ['preserveMask', 'Preserve mask on accept'],
                ['stagingThumbnailsVisible', 'Show staging thumbnails'],
              ] as Array<[keyof CanvasPreferences, string]>).map(([key, label]) => (
                <label key={key} className="flex h-7 items-center gap-2 border-b border-white/[0.05] px-1 font-mono text-[8px] text-zinc-400 last:border-b-0">
                  <input type="checkbox" checked={canvasPreferences[key]} onChange={(event) => setCanvasPreferences((current) => ({ ...current, [key]: event.target.checked }))} className="accent-cyan-400" />
                  <span>{label}</span>
                </label>
              ))}
              <label className="mt-1 flex flex-col gap-1 border-t border-white/[0.06] px-1 pt-2 font-mono text-[7px] font-black uppercase text-zinc-500">
                Staging auto-switch
                <select
                  value={canvasPreferences.stagingAutoSwitch}
                  onChange={(event) => setCanvasPreferences((current) => ({ ...current, stagingAutoSwitch: event.target.value as UmbraCanvasStagingAutoSwitch }))}
                  className="h-8 border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300 outline-none focus:border-cyan-300/30"
                >
                  <option value="off">Off</option>
                  <option value="start">On first result</option>
                  <option value="finish">When batch finishes</option>
                </select>
              </label>
              <button type="button" onClick={() => setHotkeyEditorOpen(true)} className="mt-1 flex h-8 w-full items-center justify-center border border-cyan-300/20 font-mono text-[7px] font-black uppercase text-cyan-200">Keyboard Shortcuts</button>
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button type="button" onClick={clearDocumentHistory} disabled={!canvasDocument || (documentHistory.past.length <= 0 && documentHistory.future.length <= 0)} className="flex h-8 items-center justify-center border border-white/10 font-mono text-[7px] font-black uppercase text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800">Clear History</button>
                <button type="button" onClick={clearCanvasImageCache} className="flex h-8 items-center justify-center border border-white/10 font-mono text-[7px] font-black uppercase text-zinc-500 hover:text-cyan-200">Clear Cache</button>
              </div>
            </div>
          </details>
          <div className="h-5 w-px bg-white/10" />
          <button type="button" onClick={undoDocument} disabled={documentHistory.past.length <= 0} title="Undo canvas edit" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><Undo2 size={12} /></button>
          <button type="button" onClick={redoDocument} disabled={documentHistory.future.length <= 0} title="Redo canvas edit" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><Redo2 size={12} /></button>
          <button type="button" onClick={invertMask} disabled={!source || maskEditingLocked || maskProcessing} title={maskEditingLocked ? 'Unlock the active mask before editing it' : 'Invert mask'} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><RotateCcw size={12} /></button>
          <button type="button" onClick={() => void adjustActiveMask(-8)} disabled={!source || maskEditingLocked || maskProcessing} title={maskEditingLocked ? 'Unlock the active mask before editing it' : 'Shrink mask by 8 pixels'} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><Minimize2 size={12} /></button>
          <button type="button" onClick={() => void adjustActiveMask(8)} disabled={!source || maskEditingLocked || maskProcessing} title={maskEditingLocked ? 'Unlock the active mask before editing it' : 'Grow mask by 8 pixels'} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><Maximize2 size={12} /></button>
          <button type="button" onClick={() => void featherActiveMask(8)} disabled={!source || maskEditingLocked || maskProcessing} title={maskEditingLocked ? 'Unlock the active mask before editing it' : 'Feather mask by 8 pixels'} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800">{maskProcessing ? <Loader2 size={12} className="animate-spin" /> : <Focus size={12} />}</button>
          <button type="button" onClick={clearMask} disabled={!source || maskEditingLocked || maskProcessing} title={maskEditingLocked ? 'Unlock the active mask before editing it' : 'Clear mask'} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 hover:text-red-200 disabled:text-zinc-800"><Trash2 size={12} /></button>
          <div className="h-5 w-px bg-white/10" />
          <button type="button" onClick={() => void createCompositeLayer(true)} disabled={!source || !canvasReady} title="Extract masked pixels to a raster layer" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><Scissors size={11} /></button>
          <button type="button" onClick={() => void copyMaskedSelection()} disabled={!source || !canvasReady} title="Copy masked pixels" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><Copy size={11} /></button>
          <button type="button" onClick={pasteCanvasSelection} disabled={!canvasClipboard} title="Paste copied pixels as a raster layer" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><ClipboardPaste size={11} /></button>
          <button type="button" onClick={() => void createCompositeLayer(false)} disabled={!source || !canvasReady} title="Composite visible pixels to a new raster layer" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><Combine size={11} /></button>
          <button type="button" onClick={() => void flattenVisibleCanvas()} disabled={!source || !canvasReady || flattenVisibleMutationLocked || !!fullResolutionOperation || isExportingPsd} title={flattenVisibleMutationLocked ? 'Unlock visible layers and groups before flattening' : 'Flatten visible canvas content'} className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-amber-200 disabled:text-zinc-800"><FileImage size={11} /></button>
          <button type="button" onClick={() => void mergeActiveLayerDown()} disabled={!mergeDownTarget || visualMergeDownMutationLocked || !canvasReady} title={visualMergeDownMutationLocked ? 'Unlock the participating layer before merging' : 'Merge active visual layer down'} className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-amber-200 disabled:text-zinc-800"><Layers3 size={11} /></button>
          <button type="button" onClick={() => void copyActiveVisualToMask()} disabled={!activeVisualLayer || !canvasReady} title="Copy active visual layer to an editable mask" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-rose-200 disabled:text-zinc-800"><SquareDashed size={11} /></button>
          <button type="button" onClick={() => void cropToGenerationRegion()} disabled={!canvasDocument?.generationRegion || maskProcessing} title="Crop canvas to generation region" className="inline-flex h-7 w-7 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><Crop size={11} /></button>
          <details className="group relative">
            <summary title="Canvas export, clipboard, and region fitting" className="inline-flex h-7 w-7 cursor-pointer list-none items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200"><Download size={11} /></summary>
            <div className="absolute left-0 top-8 z-50 w-52 border border-white/15 bg-[#090a0c] p-1.5 shadow-xl shadow-black/70">
              <CanvasMenuButton icon={<Copy size={9} />} label="Copy Active Layer" disabled={!activeVisualLayer || !!fullResolutionOperation || isExportingPsd} onClick={() => void copyActiveLayerToSystemClipboard()} />
              <CanvasMenuButton icon={<Copy size={9} />} label="Copy Canvas" disabled={!!fullResolutionOperation || isExportingPsd} onClick={() => void copyCanvasToSystemClipboard(false)} />
              <CanvasMenuButton icon={<BoxSelect size={9} />} label="Copy Generation Region" disabled={!canvasDocument?.generationRegion || !!fullResolutionOperation || isExportingPsd} onClick={() => void copyCanvasToSystemClipboard(true)} />
              <div className="my-1 h-px bg-white/[0.06]" />
              <CanvasMenuButton icon={<ClipboardPaste size={9} />} label="Paste to Canvas" onClick={() => void pasteSystemClipboardImage(false)} />
              <CanvasMenuButton icon={<ClipboardPaste size={9} />} label="Paste to Region" disabled={!canvasDocument?.generationRegion} onClick={() => void pasteSystemClipboardImage(true)} />
              <div className="my-1 h-px bg-white/[0.06]" />
              <CanvasMenuButton icon={isSavingCanvas ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />} label={isSavingCanvas ? 'Saving Canvas...' : 'Save Canvas to Gallery'} disabled={isSavingCanvas || !!fullResolutionOperation || isExportingPsd} onClick={() => void saveCanvasToGallery(false)} />
              <CanvasMenuButton icon={isSavingCanvas ? <Loader2 size={9} className="animate-spin" /> : <Save size={9} />} label="Save Region to Gallery" disabled={isSavingCanvas || !canvasDocument?.generationRegion || !!fullResolutionOperation || isExportingPsd} onClick={() => void saveCanvasToGallery(true)} />
              <CanvasMenuButton icon={isSavingCanvas ? <Loader2 size={9} className="animate-spin" /> : <Layers3 size={9} />} label="Save Active Layer to Gallery" disabled={isSavingCanvas || !activeVisualLayer || !!fullResolutionOperation || isExportingPsd} onClick={() => void saveActiveLayerToGallery()} />
              <CanvasMenuButton icon={<ImagePlus size={9} />} label="Continue in IMG2IMG" disabled={isSavingCanvas || !!fullResolutionOperation || isExportingPsd} onClick={() => void sendCanvasToImg2Img()} />
              <div className="my-1 h-px bg-white/[0.06]" />
              <CanvasMenuButton icon={<Download size={9} />} label="Download Canvas PNG" disabled={!!fullResolutionOperation || isExportingPsd} onClick={() => void downloadCanvasImage(false)} />
              <CanvasMenuButton icon={<Download size={9} />} label="Download Region PNG" disabled={!canvasDocument?.generationRegion || !!fullResolutionOperation || isExportingPsd} onClick={() => void downloadCanvasImage(true)} />
              <CanvasMenuButton icon={isExportingPsd ? <X size={9} /> : <Layers3 size={9} />} label={isExportingPsd ? `Cancel PSD Export ${psdExportProgress.completed}/${psdExportProgress.total}` : 'Download Layered PSD'} disabled={!!fullResolutionOperation} onClick={() => {
                if (isExportingPsd) cancelPsdExport();
                else void exportCanvasToPsd();
              }} />
              <div className="my-1 h-px bg-white/[0.06]" />
              <CanvasMenuButton icon={<SquareDashed size={9} />} label="Fit Region to Masks" onClick={() => void fitGenerationRegionToMasks()} />
              <CanvasMenuButton icon={<BoxSelect size={9} />} label="Fit Region to Selection" disabled={selectedVisualLayers.length <= 0} onClick={fitGenerationRegionToSelectedLayers} />
              <CanvasMenuButton icon={<Layers3 size={9} />} label="Fit Region to Layers" onClick={fitGenerationRegionToVisibleLayers} />
              <CanvasMenuButton icon={<Crop size={9} />} label="Crop Active Image Layer to Region" disabled={!activeImageLayer || !canvasDocument?.generationRegion || !canvasReady} onClick={() => void cropActiveImageLayerToGenerationRegion()} />
              <CanvasMenuButton icon={<SquareDashed size={9} />} label="Crop Active Mask to Region" disabled={!activeInpaintMaskLayer && !activeRegionalGuidanceLayer || Boolean(activeInpaintMaskLayer?.locked) || !canvasDocument?.generationRegion || !canvasReady} onClick={() => void cropActiveMaskToGenerationRegion()} />
            </div>
          </details>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-1 border border-white/[0.06] bg-black/25 p-0.5">
            {canvasDocument?.generationRegion ? (
              <details className="group relative">
                <summary title="Edit exact generation-region geometry" className="inline-flex h-7 w-7 cursor-pointer list-none items-center justify-center border border-cyan-300/20 text-cyan-200 hover:bg-cyan-500/[0.06]"><Scan size={10} /></summary>
                <div className="absolute right-0 top-8 z-50 w-56 border border-white/15 bg-[#090a0c] p-2 shadow-xl shadow-black/70">
                  <CanvasRegionGeometryControls
                    region={canvasDocument.generationRegion}
                    onChange={updateGenerationRegionGeometry}
                    onAlign={() => updateGenerationRegionGeometry({})}
                    onSwap={() => dispatchCanvasDocument({ type: 'swap_generation_region_dimensions' })}
                  />
                </div>
              </details>
            ) : null}
            {canvasDocument?.generationRegion ? (
              <button
                type="button"
                onClick={() => dispatchCanvasDocument({ type: 'set_generation_region', region: null })}
                title="Clear generation region"
                className="mr-1 inline-flex h-7 items-center gap-1.5 border border-cyan-300/20 px-2 font-mono text-[8px] text-cyan-200"
              >
                <Scan size={10} /> {canvasDocument.generationRegion.width}x{canvasDocument.generationRegion.height} <X size={9} />
              </button>
            ) : null}
            {lastBox ? <span className="mr-2 font-mono text-[8px] text-zinc-600">{Math.round(lastBox.width)}x{Math.round(lastBox.height)} @ {Math.round(lastBox.x)},{Math.round(lastBox.y)}</span> : null}
            <button type="button" onClick={() => activeTransformLayer && zoomToRect(activeTransformLayer.transform)} disabled={!activeTransformLayer} title="Zoom to active layer" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><Focus size={12} /></button>
            <button type="button" onClick={zoomToMaskSelection} disabled={!canvasDocument} title="Zoom to active mask selection" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><LassoSelect size={12} /></button>
            <button type="button" onClick={zoomToSelectedLayers} disabled={selectedVisualLayers.length <= 0} title="Zoom to selected layers" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><SquareDashed size={12} /></button>
            <button type="button" onClick={() => canvasDocument?.generationRegion && zoomToRect(canvasDocument.generationRegion)} disabled={!canvasDocument?.generationRegion} title="Zoom to generation region" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500 disabled:text-zinc-800"><BoxSelect size={12} /></button>
            <button type="button" onClick={() => studioMode ? zoomStudioView(1 / 1.2) : setZoom((value) => Math.max(0.25, value - 0.25))} title="Zoom out" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500"><ZoomOut size={12} /></button>
            <button type="button" onClick={() => studioMode ? fitStudioView() : setZoom(1)} title={studioMode ? 'Fit all artboards' : 'Fit canvas'} className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500"><Maximize2 size={12} /></button>
            <button type="button" onClick={() => studioMode ? zoomStudioView(1.2) : setZoom((value) => Math.min(6, value + 0.25))} title="Zoom in" className="inline-flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-zinc-500"><ZoomIn size={12} /></button>
            <span className="w-10 text-right font-mono text-[8px] text-zinc-600">{Math.round((studioMode ? studioViewport.zoom : zoom) * 100)}%</span>
          </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1 border border-white/[0.08] bg-black/30 p-0.5" aria-label="Inpaint tools">
                {toolButtons.map((button) => (
                  <button
                    key={`${button.id}-${button.target || 'canvas'}`}
                    type="button"
                    onClick={() => selectCanvasTool(button.id, button.target)}
                    disabled={button.disabled}
                    title={button.label}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center rounded-sm border transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300/60 disabled:cursor-not-allowed disabled:border-transparent disabled:text-zinc-800',
                      tool === button.id && (!button.target || editTarget === button.target)
                        ? 'border-rose-300/50 bg-rose-500/[0.16] text-rose-50'
                        : 'border-transparent text-zinc-500 hover:border-white/10 hover:bg-white/[0.035] hover:text-zinc-200',
                    )}
                  >
                    {button.icon}
                  </button>
                ))}
              </div>
              {tool === 'brush' || tool === 'erase' ? (
                <>
                  <label className="flex h-8 items-center gap-2 border border-white/[0.08] bg-black/25 px-2">
                    <span className="text-[8px] font-black uppercase text-zinc-500">{tool === 'erase' ? editTarget === 'raster' ? 'Layer Erase' : 'Mask Erase' : 'Brush'}</span>
                    <input
                      type="range"
                      min={4}
                      max={512}
                      step={4}
                      value={tool === 'erase' ? eraserSize : brushSize}
                      onChange={(event) => (tool === 'erase' ? setEraserSize : setBrushSize)(Number(event.target.value))}
                      className="w-24 accent-rose-400"
                    />
                    <span className="w-8 text-right font-mono text-[8px] text-zinc-400">{tool === 'erase' ? eraserSize : brushSize}</span>
                  </label>
                  <label className="flex h-8 items-center gap-2 border border-white/[0.08] bg-black/25 px-2" title="Tool edge hardness">
                    <span className="text-[8px] font-black uppercase text-zinc-500">Edge</span>
                    <input type="range" min={0} max={1} step={0.05} value={brushHardness} onChange={(event) => setBrushHardness(Number(event.target.value))} className="w-20 accent-rose-400" />
                    <span className="w-7 text-right font-mono text-[8px] text-zinc-400">{Math.round(brushHardness * 100)}%</span>
                  </label>
                </>
              ) : null}
              <div className="h-5 w-px bg-white/10" />
              <button type="button" onClick={undoDocument} disabled={documentHistory.past.length <= 0} title="Undo last edit" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 disabled:text-zinc-800"><Undo2 size={13} /></button>
              <button type="button" onClick={redoDocument} disabled={documentHistory.future.length <= 0} title="Redo last edit" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 disabled:text-zinc-800"><Redo2 size={13} /></button>
              <button type="button" onClick={invertMask} disabled={!source || maskEditingLocked || maskProcessing} title="Invert mask" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 disabled:text-zinc-800"><RotateCcw size={13} /></button>
              <button type="button" onClick={() => void adjustActiveMask(-8)} disabled={!source || maskEditingLocked || maskProcessing} title="Shrink mask" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-cyan-200 disabled:text-zinc-800"><Minimize2 size={13} /></button>
              <button type="button" onClick={() => void adjustActiveMask(8)} disabled={!source || maskEditingLocked || maskProcessing} title="Grow mask" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-cyan-200 disabled:text-zinc-800"><Maximize2 size={13} /></button>
              <button type="button" onClick={() => void featherActiveMask(8)} disabled={!source || maskEditingLocked || maskProcessing} title="Feather mask" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-cyan-200 disabled:text-zinc-800">{maskProcessing ? <Loader2 size={13} className="animate-spin" /> : <Focus size={13} />}</button>
              <button type="button" onClick={clearMask} disabled={!source || maskEditingLocked || maskProcessing} title="Clear mask" className="inline-flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 text-zinc-400 hover:text-red-200 disabled:text-zinc-800"><Trash2 size={13} /></button>
              <div className="ml-auto flex items-center gap-1 border border-white/[0.06] bg-black/25 p-0.5">
                <button type="button" onClick={() => void saveCanvasToGallery(false)} disabled={!source || isSavingCanvas || !!fullResolutionOperation} title="Save accepted image to Gallery" className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-zinc-400 hover:text-cyan-200 disabled:text-zinc-800">{isSavingCanvas ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}</button>
                <button type="button" onClick={() => void sendCanvasToImg2Img()} disabled={!source || isSavingCanvas || !!fullResolutionOperation} title="Continue accepted image in IMG2IMG" className="inline-flex h-8 w-8 items-center justify-center border border-cyan-300/20 text-cyan-200 disabled:text-zinc-800"><ImagePlus size={12} /></button>
                <button type="button" onClick={() => setZoom((value) => Math.max(0.25, value - 0.25))} title="Zoom out" className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-zinc-400"><ZoomOut size={13} /></button>
                <button type="button" onClick={() => setZoom(1)} title="Fit image" className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-zinc-400"><Maximize2 size={13} /></button>
                <button type="button" onClick={() => setZoom((value) => Math.min(6, value + 0.25))} title="Zoom in" className="inline-flex h-8 w-8 items-center justify-center border border-white/10 text-zinc-400"><ZoomIn size={13} /></button>
                <span className="w-10 text-right font-mono text-[8px] text-zinc-500">{Math.round(zoom * 100)}%</span>
              </div>
            </>
          )}
          </div>
          {false && tool === 'region' ? (
            <div data-umbra-generation-region-presets="" className="flex min-h-10 min-w-0 flex-wrap items-center gap-1.5 border-t border-cyan-300/[0.12] bg-cyan-500/[0.025] px-2.5 py-1.5">
              <BoxSelect size={11} className="text-cyan-200" />
              <span className="mr-1 font-mono text-[8px] font-black uppercase text-zinc-500">Region Aspect</span>
              <div role="group" aria-label="Generation region preset shape" className="flex min-w-0 flex-wrap items-center border border-white/[0.08] bg-black/30 p-0.5">
                {REGION_ASPECT_RATIO_OPTIONS.map((option) => {
                  const selected = Math.abs((canvasDocument?.generationRegionAspectRatio || 0) - option.ratio) < 0.0001;
                  return (
                    <button
                      key={option.label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => applyGenerationRegionAspectPreset(option.ratio)}
                      disabled={!canvasDocument}
                      title={option.ratio > 0
                        ? studioMode
                          ? `Create an independent ${option.label} generation canvas`
                          : `Create a ${option.label} generation region`
                        : 'Unlock the generation region aspect ratio'}
                      className={cn(
                        'inline-flex h-7 min-w-11 items-center justify-center border px-2 font-mono text-[8px] font-black uppercase transition-colors disabled:text-zinc-800',
                        selected
                          ? 'border-cyan-300/40 bg-cyan-500/[0.12] text-cyan-100'
                          : 'border-transparent text-zinc-500 hover:border-white/10 hover:text-zinc-200',
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              <div role="group" aria-label="Manual generation region resolution" className="flex min-w-0 items-center gap-1 border border-white/[0.08] bg-black/30 p-0.5">
                <span className="px-1 font-mono text-[7px] font-black uppercase text-zinc-600">Manual</span>
                <label className="flex h-7 items-center border border-white/[0.08] bg-black/35 pl-1.5 focus-within:border-cyan-300/35">
                  <span className="font-mono text-[7px] font-black text-zinc-600">W</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Generation region width"
                    value={manualRegionResolution.width}
                    onChange={(event) => setManualRegionResolution((current) => ({ ...current, width: event.target.value }))}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyManualGenerationRegionResolution();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetManualGenerationRegionResolution();
                        event.currentTarget.blur();
                      }
                    }}
                    disabled={!canvasDocument}
                    className="h-full w-16 bg-transparent px-1.5 font-mono text-[8px] text-zinc-200 outline-none disabled:text-zinc-800"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setManualRegionResolution((current) => ({ width: current.height, height: current.width }))}
                  disabled={!canvasDocument}
                  title="Swap manual width and height"
                  className="inline-flex h-7 w-7 items-center justify-center border border-white/[0.08] text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"
                >
                  <ArrowRightLeft size={10} />
                </button>
                <label className="flex h-7 items-center border border-white/[0.08] bg-black/35 pl-1.5 focus-within:border-cyan-300/35">
                  <span className="font-mono text-[7px] font-black text-zinc-600">H</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Generation region height"
                    value={manualRegionResolution.height}
                    onChange={(event) => setManualRegionResolution((current) => ({ ...current, height: event.target.value }))}
                    onFocus={(event) => event.currentTarget.select()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyManualGenerationRegionResolution();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        resetManualGenerationRegionResolution();
                        event.currentTarget.blur();
                      }
                    }}
                    disabled={!canvasDocument}
                    className="h-full w-16 bg-transparent px-1.5 font-mono text-[8px] text-zinc-200 outline-none disabled:text-zinc-800"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyManualGenerationRegionResolution}
                  disabled={!canvasDocument}
                  title={studioMode ? 'Create an independent generation canvas at this resolution' : 'Apply this manual generation-region resolution'}
                  className="inline-flex h-7 items-center gap-1.5 border border-cyan-300/30 bg-cyan-500/[0.08] px-2 font-mono text-[7px] font-black uppercase text-cyan-100 hover:bg-cyan-500/[0.14] disabled:border-white/[0.08] disabled:bg-transparent disabled:text-zinc-800"
                >
                  <Check size={9} /> {studioMode ? 'Create' : 'Apply'}
                </button>
              </div>
              <span className="ml-auto inline-flex h-7 items-center gap-1.5 border border-white/[0.08] bg-black/25 px-2 font-mono text-[8px] uppercase text-zinc-600">
                <Grid3X3 size={10} /> {UMBRA_CANVAS_STUDIO_SNAP_SIZE}px grid
              </span>
              {canvasDocument?.generationRegion ? (
                <span className="font-mono text-[8px] text-cyan-200/65">
                  {canvasDocument.generationRegion.width}x{canvasDocument.generationRegion.height}
                </span>
              ) : null}
            </div>
          ) : tool === 'polygon' ? (
            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 border-t border-white/[0.06] bg-black/20 px-2.5 py-1">
              <LassoSelect size={11} className="text-cyan-200" />
              <span className="font-mono text-[8px] uppercase text-zinc-500">{polygonPoints.length} vertices</span>
              <button type="button" onClick={finishPolygonSelection} disabled={polygonPoints.length < 3} title="Apply polygon (Enter)" className="ml-auto inline-flex h-6 w-6 items-center justify-center border border-cyan-300/25 text-cyan-200 disabled:text-zinc-800"><Check size={10} /></button>
              <button type="button" onClick={() => setPolygonPoints([])} disabled={polygonPoints.length <= 0} title="Cancel polygon (Escape)" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><X size={10} /></button>
            </div>
          ) : tool === 'wand' ? (
            <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2 border-t border-white/[0.06] bg-black/20 px-2.5 py-1">
              <WandSparkles size={11} className="text-cyan-200" />
              <label className="flex items-center gap-2">
                <span className="text-[8px] font-black uppercase text-zinc-600">Tolerance</span>
                <input type="range" min={0} max={255} step={1} value={wandTolerance} onChange={(event) => setWandTolerance(Number(event.target.value))} disabled={maskProcessing} className="w-28 accent-cyan-300" />
                <span className="w-6 text-right font-mono text-[8px] text-zinc-500">{wandTolerance}</span>
              </label>
              <button type="button" aria-pressed={wandContiguous} onClick={() => setWandContiguous((value) => !value)} disabled={maskProcessing} title="Toggle contiguous color selection" className={cn('inline-flex h-6 items-center gap-1.5 border px-2 text-[7px] font-black uppercase', wandContiguous ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600')}>
                <SquaresUnite size={9} /> Contiguous
              </button>
              {maskProcessing ? <Loader2 size={10} className="ml-auto animate-spin text-cyan-200" /> : null}
            </div>
          ) : tool === 'sam' ? (
            <div data-umbra-assisted-selection-toolbar="" className="flex min-h-9 min-w-0 flex-wrap items-center gap-1.5 border-t border-white/[0.06] bg-black/20 px-2.5 py-1">
              <WandSparkles size={11} className="text-cyan-200" />
              {(['canvas', 'layer'] as const).map((sourceMode) => (
                <button key={sourceMode} type="button" onClick={() => setSamSourceMode(sourceMode)} disabled={sourceMode === 'layer' && !activeCanvasLayer} title={sourceMode === 'canvas' ? 'Select from the composited canvas' : 'Select only from the active layer'} className={cn('h-6 border px-2 text-[7px] font-black uppercase disabled:text-zinc-800', samSourceMode === sourceMode ? 'border-violet-300/35 bg-violet-500/10 text-violet-100' : 'border-white/10 text-zinc-600')}>{sourceMode}</button>
              ))}
              <span className="mx-0.5 h-4 w-px bg-white/10" />
              {(['points', 'box', 'prompt'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setSamGuideMode(mode);
                    setBoxPreview(null);
                  }}
                  title={mode === 'points' ? 'Point guides: left positive, right or Alt negative' : mode === 'box' ? 'Draw a box guide' : 'Select an object or region from a text description'}
                  className={cn(
                    'h-6 border px-2 text-[7px] font-black uppercase',
                    samGuideMode === mode ? 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600',
                  )}
                >
                  {mode}
                </button>
              ))}
              {samGuideMode === 'prompt' ? (
                <input value={clipSegPrompt} onChange={(event) => setClipSegPrompt(event.target.value)} maxLength={500} disabled={samRunning || clipSegInstalling} placeholder="person, coat, sky..." title={clipSegModelId || clipSegError || 'Text selection prompt'} className="h-6 min-w-48 flex-1 border border-white/10 bg-black/40 px-2 font-mono text-[8px] text-zinc-300 outline-none placeholder:text-zinc-700" />
              ) : (
                <select value={samModelName} onChange={(event) => setSamModelName(event.target.value)} disabled={samModels.length <= 0 || samRunning} title="SAM model" className="h-6 min-w-0 max-w-44 border border-white/10 bg-black/40 px-1.5 font-mono text-[7px] text-zinc-400 outline-none disabled:text-zinc-700">
                  {samModels.length <= 0 ? <option value="">No SAM models</option> : null}
                  {samModels.map((model) => <option key={model} value={model}>{model}</option>)}
                </select>
              )}
              {samGuideMode === 'prompt' && !clipSegAvailable ? (
                <button type="button" onClick={() => void installClipSeg()} disabled={clipSegInstalling || samRunning || !comfyConnected} title={clipSegError || 'Download the vetted CLIPSeg text-selection model'} className="inline-flex h-6 items-center gap-1 border border-amber-300/30 px-2 text-[7px] font-black uppercase text-amber-100 disabled:text-zinc-800">
                  {clipSegInstalling ? <Loader2 size={9} className="animate-spin" /> : <Download size={9} />} Install Model
                </button>
              ) : null}
              <select value={samOutputMode} onChange={(event) => setSamOutputMode(event.target.value as SamOutputMode)} disabled={samRunning} title="Choose where the segmented result is saved" className="h-6 min-w-0 max-w-40 border border-white/10 bg-black/40 px-1.5 font-mono text-[7px] text-zinc-400 outline-none">
                <option value="active_mask">Active Mask</option>
                <option value="replace_layer" disabled={samSourceMode !== 'layer' || !activeRasterLayer && !activeControlLayer}>Replace Layer</option>
                <option value="new_mask">New Mask</option>
                <option value="regional_guidance" disabled={!regionalGuidanceAvailable || regionalGuidanceLayers.length >= regionalGuidanceMaxLayers}>Regional Guide</option>
                <option value="raster">Raster Layer</option>
                <option value="control" disabled={!controlLayersAvailable || getUmbraCanvasControlLayers(canvasDocument).length >= controlLayersMaxLayers}>Control Layer</option>
              </select>
              <button type="button" aria-pressed={samInvert} onClick={() => setSamInvert((value) => !value)} disabled={samRunning} title="Invert the segmented selection before applying it" className={cn('h-6 border px-2 text-[7px] font-black uppercase disabled:text-zinc-800', samInvert ? 'border-violet-300/35 bg-violet-500/10 text-violet-100' : 'border-white/10 text-zinc-600')}>Invert</button>
              <select value={samDeviceMode} onChange={(event) => setSamDeviceMode(event.target.value as UmbraSamDeviceMode)} disabled={samRunning} title="SAM compute device" className="h-6 border border-white/10 bg-black/40 px-1.5 font-mono text-[7px] text-zinc-400 outline-none">
                <option value="CPU">CPU</option>
                <option value="AUTO">Auto</option>
                <option value="Prefer GPU">GPU</option>
              </select>
              <label className="flex items-center gap-1" title={samGuideMode === 'prompt' ? 'CLIPSeg prompt-mask cutoff; independent from SAM confidence' : 'SAM mask confidence; independent from prompt cutoff'}>
                <span className="font-mono text-[7px] font-black uppercase text-zinc-600">{samGuideMode === 'prompt' ? 'Cutoff' : 'Confidence'}</span>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={assistedSelectionThreshold}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (samGuideMode === 'prompt') setClipSegThreshold(value);
                    else setSamThreshold(value);
                  }}
                  disabled={samRunning}
                  className="w-16 accent-cyan-300"
                />
                <span className="w-7 font-mono text-[7px] text-zinc-600">{Math.round(assistedSelectionThreshold * 100)}%</span>
              </label>
              {samGuideMode !== 'prompt' ? <span className="font-mono text-[7px] text-zinc-600">+{samPoints.filter((point) => point.positive).length} / -{samPoints.filter((point) => !point.positive).length}{samBox ? ' / BOX' : ''}</span> : null}
              {assistedSelectionPreview ? <span className={cn('font-mono text-[7px] font-black uppercase', assistedSelectionPreviewCurrent ? 'text-emerald-300' : 'text-amber-300')}>{assistedSelectionPreviewCurrent ? 'Preview Ready' : 'Preview Stale'}</span> : null}
              <button type="button" onClick={() => void runSamSelection()} disabled={samRunning || clipSegInstalling || !assistedSelectionCanProcess} title="Process or refresh the non-destructive assisted-selection preview" className="inline-flex h-6 items-center gap-1 border border-cyan-300/30 px-2 text-[7px] font-black uppercase text-cyan-100 disabled:text-zinc-800">
                {samRunning ? <Loader2 size={9} className="animate-spin" /> : <WandSparkles size={9} />} Process
              </button>
              <button type="button" onClick={() => void applyAssistedSelection()} disabled={samRunning || !assistedSelectionPreviewCurrent || !assistedSelectionOutputAvailable} title={assistedSelectionOutputReason || 'Apply the current preview to the selected destination'} className="inline-flex h-6 items-center gap-1 border border-emerald-300/30 px-2 text-[7px] font-black uppercase text-emerald-100 disabled:text-zinc-800"><Check size={9} /> Apply</button>
              <button type="button" onClick={() => { setSamPoints([]); setSamBox(null); setBoxPreview(null); if (samGuideMode === 'prompt') setClipSegPrompt(''); clearAssistedSelectionPreview(); }} disabled={samRunning || (samGuideMode === 'prompt' ? !clipSegPrompt && !assistedSelectionPreview : samPoints.length <= 0 && !samBox && !assistedSelectionPreview)} title="Clear assisted-selection guides and preview" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><X size={9} /></button>
            </div>
          ) : null}
        </div>

        <div
          ref={viewportRef}
          data-umbra-canvas-studio-viewport={studioMode ? '' : undefined}
          className={cn(
            'relative min-h-0 flex-1 bg-[#08090b]',
            studioMode ? 'overflow-hidden cursor-grab active:cursor-grabbing' : 'overflow-auto custom-scrollbar',
            !studioMode && tool === 'pan' && 'cursor-grab active:cursor-grabbing',
          )}
          style={studioMode ? {
            backgroundImage: 'linear-gradient(rgba(103,232,249,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.055) 1px, transparent 1px)',
            backgroundSize: `${Math.max(4, studioViewport.snapSize * studioViewport.zoom)}px ${Math.max(4, studioViewport.snapSize * studioViewport.zoom)}px`,
            backgroundPosition: `${studioViewport.panX}px ${studioViewport.panY}px`,
          } : undefined}
          onPointerDownCapture={studioMode ? beginStudioViewportPan : beginViewportPan}
          onPointerMove={studioMode ? moveStudioViewportPan : moveViewportPan}
          onPointerUp={studioMode ? finishStudioViewportPan : finishViewportPan}
          onPointerCancel={studioMode ? cancelStudioViewportPan : finishViewportPan}
          onWheel={studioMode ? zoomStudioViewFromWheel : undefined}
          onScroll={syncViewportMetrics}
          onDragEnter={(event) => {
            const transferTypes = Array.from(event.dataTransfer.types || []);
            if (transferTypes.includes('Files') || transferTypes.includes(GALLERY_DRAG_PATHS_MIME)) {
              event.preventDefault();
              if (source) setImageDropActive(true);
            }
          }}
          onDragLeave={(event) => {
            const relatedTarget = event.relatedTarget;
            if (!relatedTarget || !(relatedTarget instanceof Node) || !event.currentTarget.contains(relatedTarget)) {
              setImageDropActive(false);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (source) handleCanvasImageDrop('raster', event.dataTransfer);
            else handleCanvasSourceDrop(event.dataTransfer);
          }}
        >
          {source && imageDropActive ? (
            <div className="absolute inset-0 z-[70] grid grid-rows-2 gap-2 bg-black/85 p-4 backdrop-blur-sm">
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['raster', 'Raster Layer', <Layers3 key="raster" size={18} />, true],
                  ['control', 'Control Layer', <Scan key="control" size={18} />, controlLayersAvailable],
                ] as Array<[CanvasImageDropTarget, string, React.ReactNode, boolean]>).map(([target, label, icon, available]) => (
                  <div
                    key={target}
                    title={available ? `Add as ${label}` : controlLayersReason || `${label} is unavailable for this pipeline.`}
                    onDragOver={(event) => { if (available) event.preventDefault(); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (available) handleCanvasImageDrop(target, event.dataTransfer);
                      else setImageDropActive(false);
                    }}
                    className={cn(
                      'flex min-h-0 items-center justify-center gap-3 border text-[10px] font-black uppercase tracking-[0.14em]',
                      available
                        ? 'border-cyan-300/25 bg-cyan-500/[0.06] text-cyan-100'
                        : 'border-white/5 bg-white/[0.02] text-zinc-700',
                    )}
                  >
                    {icon}{label}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ['reference', 'Reference', <ImagePlus key="reference" size={18} />, referenceLayersAvailable],
                  ['mask', 'Inpaint Mask', <SquareDashed key="mask" size={18} />, true],
                  ['resized_control', 'Fit Control', <Maximize2 key="resized-control" size={18} />, controlLayersAvailable],
                ] as Array<[CanvasImageDropTarget, string, React.ReactNode, boolean]>).map(([target, label, icon, available]) => (
                  <div
                    key={target}
                    onDragOver={(event) => { if (available) event.preventDefault(); }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (available) handleCanvasImageDrop(target, event.dataTransfer);
                      else setImageDropActive(false);
                    }}
                    className={cn(
                      'flex min-h-0 items-center justify-center gap-3 border text-[9px] font-black uppercase tracking-[0.13em]',
                      available
                        ? 'border-violet-300/25 bg-violet-500/[0.06] text-violet-100'
                        : 'border-white/5 bg-white/[0.02] text-zinc-700',
                    )}
                  >
                    {icon}{label}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {studioMode && source && tool === 'region' ? (
            <div
              data-umbra-canvas-world-region-tool=""
              className="absolute inset-0 z-[65] cursor-crosshair touch-none overflow-hidden"
              onPointerDown={(event) => beginStudioRegionInteraction(event, 'draw')}
              onPointerMove={moveStudioRegionInteraction}
              onPointerUp={finishStudioRegionInteraction}
              onPointerCancel={finishStudioRegionInteraction}
            >
              {studioGenerationRegionPreview || currentStudioGenerationRegionWorld ? (() => {
                const region = studioGenerationRegionPreview || currentStudioGenerationRegionWorld as UmbraCanvasRect;
                const zoom = studioViewport.zoom;
                return (
                  <div
                    data-umbra-canvas-world-generation-region=""
                    className="absolute cursor-move border border-cyan-100 bg-cyan-300/[0.08] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.72),0_0_20px_rgba(103,232,249,0.28)]"
                    style={{
                      left: studioViewport.panX + region.x * zoom,
                      top: studioViewport.panY + region.y * zoom,
                      width: Math.max(1, region.width * zoom),
                      height: Math.max(1, region.height * zoom),
                    }}
                    onPointerDown={(event) => beginStudioRegionInteraction(event, 'move')}
                  >
                    <span className="pointer-events-none absolute left-0 top-0 bg-cyan-950/95 px-1.5 py-0.5 font-mono text-[7px] font-black uppercase text-cyan-50">
                      Generation Region / {Math.round(region.width)}x{Math.round(region.height)}
                    </span>
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        aria-label={`Resize generation region ${corner}`}
                        onPointerDown={(event) => beginStudioRegionInteraction(event, `resize-${corner}`)}
                        className={cn(
                          'absolute h-3 w-3 border border-cyan-50 bg-cyan-950 shadow-[0_0_8px_rgba(103,232,249,0.65)]',
                          corner[0] === 'n' ? '-top-1.5' : '-bottom-1.5',
                          corner[1] === 'w' ? '-left-1.5' : '-right-1.5',
                        )}
                      />
                    ))}
                  </div>
                );
              })() : null}
            </div>
          ) : null}
          {!source ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-700">
              <ImagePlus size={34} className="mb-3 text-rose-300/20" />
              <div className="text-[10px] font-black uppercase tracking-[0.16em]">No source image</div>
              <button type="button" onClick={() => fileInputRef.current?.click()} className="mt-3 inline-flex h-8 items-center gap-2 rounded-md border border-white/10 px-3 text-[9px] font-black uppercase tracking-[0.12em] text-zinc-400 hover:text-rose-100">
                <Upload size={11} /> Open Image
              </button>
            </div>
          ) : (
            <div
              data-umbra-canvas-studio-world={studioMode ? '' : undefined}
              className={studioMode ? 'pointer-events-none absolute left-0 top-0' : 'flex min-h-full min-w-full items-center justify-center p-4'}
              style={studioMode ? {
                transform: `translate3d(${studioViewport.panX}px, ${studioViewport.panY}px, 0) scale(${studioViewport.zoom})`,
                transformOrigin: '0 0',
              } : undefined}
            >
              {studioMode ? studioAlignmentGuides.map((guide) => {
                const padding = 12 / Math.max(0.05, studioViewport.zoom);
                const thickness = 1.5 / Math.max(0.05, studioViewport.zoom);
                return (
                  <div
                    key={`${guide.axis}:${guide.position}:${guide.targetArtboardId}`}
                    data-umbra-studio-alignment-guide={guide.axis}
                    data-umbra-studio-alignment-kind={guide.kind}
                    className="pointer-events-none absolute z-[1000] bg-cyan-300 shadow-[0_0_7px_rgba(103,232,249,0.9)]"
                    style={guide.axis === 'x' ? {
                      left: guide.position - thickness / 2,
                      top: guide.start - padding,
                      width: thickness,
                      height: Math.max(thickness, guide.end - guide.start + padding * 2),
                    } : {
                      left: guide.start - padding,
                      top: guide.position - thickness / 2,
                      width: Math.max(thickness, guide.end - guide.start + padding * 2),
                      height: thickness,
                    }}
                  />
                );
              }) : null}
              {studioMode ? canvasStudio.project?.artboards
                .filter((artboard) => artboard.visible && artboard.id !== canvasStudio.activeArtboard?.id)
                .map((artboard) => {
                  const position = studioArtboardPosition(artboard);
                  const preview = studioPreviewAssets.get(artboard.id)?.imageUrl || '';
                  return (
                    <div
                      key={artboard.id}
                      data-umbra-studio-artboard={artboard.id}
                      data-umbra-studio-artboard-active="false"
                      className="pointer-events-auto absolute border border-white/20 bg-[#050607] shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
                      style={{
                        left: position.x,
                        top: position.y,
                        width: artboard.width,
                        height: artboard.height,
                        zIndex: artboard.zIndex,
                      }}
                    >
                      <div
                        data-umbra-studio-artboard-handle=""
                        onPointerDown={(event) => beginStudioArtboardDrag(event, artboard)}
                        onPointerMove={moveStudioArtboardDrag}
                        onPointerUp={finishStudioArtboardDrag}
                        onPointerCancel={cancelStudioArtboardDrag}
                        className={cn(
                          'absolute inset-x-0 top-0 flex cursor-move touch-none items-center border border-white/15 bg-[#0a0d0e] text-zinc-300 shadow-lg shadow-black/50',
                          artboard.locked && 'cursor-default text-amber-200/70',
                        )}
                        style={{
                          top: -28 / studioViewport.zoom,
                          height: 28 / studioViewport.zoom,
                          paddingLeft: 8 / studioViewport.zoom,
                          paddingRight: 8 / studioViewport.zoom,
                          fontSize: 9 / studioViewport.zoom,
                        }}
                        title={artboard.locked ? `${artboard.name} is locked` : `Drag ${artboard.name}`}
                      >
                        <span className="min-w-0 flex-1 truncate font-mono font-black uppercase">{artboard.name}</span>
                        <span className="ml-2 shrink-0 font-mono text-zinc-600">{artboard.width}x{artboard.height}{artboard.locked ? ' / LOCKED' : ''}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => void canvasStudio.selectArtboard(artboard.id)}
                        className="absolute inset-0 flex items-center justify-center overflow-hidden bg-black text-zinc-600"
                        title={`Open ${artboard.name}`}
                      >
                        {preview ? <img src={preview} alt="" draggable={false} loading="lazy" className="h-full w-full object-contain opacity-80" style={{ imageRendering: 'auto' }} /> : <span className="font-mono text-[24px] font-black uppercase tracking-[0.18em]">Open Artboard</span>}
                        <span className="absolute inset-0 border-2 border-transparent hover:border-cyan-300/45 hover:bg-cyan-300/[0.03]" />
                      </button>
                    </div>
                  );
                }) : null}
              <div
                data-umbra-studio-artboard={studioMode ? canvasStudio.activeArtboard?.id || 'active' : undefined}
                data-umbra-studio-artboard-active={studioMode ? 'true' : undefined}
                className={cn(
                  'border bg-black shadow-2xl shadow-black/60',
                  studioMode
                    ? 'pointer-events-auto absolute border-cyan-300/65 shadow-[0_0_0_1px_rgba(103,232,249,0.15),0_18px_70px_rgba(0,0,0,0.65)]'
                    : 'relative shrink-0 border-white/15',
                )}
                style={{
                  width: studioMode ? canvasSize.width : displayWidth,
                  height: studioMode ? canvasSize.height : displayHeight,
                  ...(studioMode ? {
                    left: studioActiveArtboardPosition.x,
                    top: studioActiveArtboardPosition.y,
                    zIndex: canvasStudio.activeArtboard?.zIndex ?? 0,
                  } : {}),
                  ...(canvasPreferences.dynamicGrid ? {
                    backgroundImage: 'linear-gradient(rgba(103,232,249,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(103,232,249,0.09) 1px, transparent 1px)',
                    backgroundSize: `${Math.max(4, snapSize * displayScale)}px ${Math.max(4, snapSize * displayScale)}px`,
                  } : {}),
                }}
              >
                {studioMode && canvasStudio.activeArtboard ? (
                  <div
                    data-umbra-studio-artboard-handle=""
                    onPointerDown={(event) => beginStudioArtboardDrag(event, canvasStudio.activeArtboard as UmbraCanvasStudioArtboard)}
                    onPointerMove={moveStudioArtboardDrag}
                    onPointerUp={finishStudioArtboardDrag}
                    onPointerCancel={cancelStudioArtboardDrag}
                    className={cn(
                      'absolute inset-x-0 top-0 z-[80] flex cursor-move touch-none items-center border border-cyan-300/30 bg-[#071012] text-cyan-100 shadow-lg shadow-black/60',
                      canvasStudio.activeArtboard.locked && 'cursor-default border-amber-300/25 text-amber-100/75',
                    )}
                    style={{
                      top: -28 / studioViewport.zoom,
                      height: 28 / studioViewport.zoom,
                      paddingLeft: 8 / studioViewport.zoom,
                      paddingRight: 8 / studioViewport.zoom,
                      fontSize: 9 / studioViewport.zoom,
                    }}
                    title={canvasStudio.activeArtboard.locked ? `${canvasStudio.activeArtboard.name} is locked` : `Drag ${canvasStudio.activeArtboard.name}`}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono font-black uppercase">{canvasStudio.activeArtboard.name}</span>
                    <span className="ml-2 shrink-0 font-mono text-cyan-300/55">{Math.round(studioActiveArtboardPosition.x)},{Math.round(studioActiveArtboardPosition.y)}</span>
                  </div>
                ) : null}
                {rulersEnabled ? (
                  <>
                    <div className="pointer-events-none absolute -top-5 left-0 z-30 h-4 w-full border-b border-white/15 bg-black/90 font-mono text-[6px] text-zinc-500">
                      {rulerTicks.x.map((value) => <span key={`x-${value}`} className="absolute bottom-0 h-2 border-l border-white/25 pl-0.5" style={{ left: `${(value / canvasSize.width) * 100}%` }}>{Math.round(value)}</span>)}
                    </div>
                    <div className="pointer-events-none absolute -left-7 top-0 z-30 h-full w-6 border-r border-white/15 bg-black/90 font-mono text-[6px] text-zinc-500">
                      {rulerTicks.y.map((value) => <span key={`y-${value}`} className="absolute right-0 w-4 border-t border-white/25 pt-0.5 text-right" style={{ top: `${(value / canvasSize.height) * 100}%` }}>{Math.round(value)}</span>)}
                    </div>
                  </>
                ) : null}
                <canvas data-umbra-inpaint-image="" ref={imageCanvasRef} className="absolute inset-0 h-full w-full" style={{ imageRendering: 'auto' }} />
                <canvas data-umbra-inpaint-guidance="" ref={guidanceCanvasRef} className="pointer-events-none absolute inset-0 z-[5] h-full w-full" />
                {tool === 'sam' && assistedSelectionPreview ? <img src={assistedSelectionPreview.imageUrl} alt="" draggable={false} className={cn('pointer-events-none absolute inset-0 z-[7] h-full w-full object-fill transition-opacity', assistedSelectionPreviewCurrent ? 'opacity-55' : 'opacity-20')} /> : null}
                {canvasPreferences.ruleOfThirds ? (
                  <div className="pointer-events-none absolute inset-0 z-20 opacity-70">
                    <span className="absolute inset-y-0 left-1/3 border-l border-dashed border-white/45" />
                    <span className="absolute inset-y-0 left-2/3 border-l border-dashed border-white/45" />
                    <span className="absolute inset-x-0 top-1/3 border-t border-dashed border-white/45" />
                    <span className="absolute inset-x-0 top-2/3 border-t border-dashed border-white/45" />
                  </div>
                ) : null}
                <canvas
                  ref={paintCanvasRef}
                  data-umbra-inpaint-paint=""
                  className="pointer-events-none absolute z-10"
                  style={{
                    left: `${paintBufferBounds.x / Math.max(1, canvasSize.width) * 100}%`,
                    top: `${paintBufferBounds.y / Math.max(1, canvasSize.height) * 100}%`,
                    width: `${paintBufferBounds.width / Math.max(1, canvasSize.width) * 100}%`,
                    height: `${paintBufferBounds.height / Math.max(1, canvasSize.height) * 100}%`,
                  }}
                />
                <canvas
                  data-umbra-inpaint-mask=""
                  ref={maskCanvasRef}
                  className={cn(
                    'absolute inset-0 z-20 h-full w-full touch-none',
                    (tool === 'transform' || tool === 'pan') && 'pointer-events-none',
                    resolveUmbraCanvasPointerCursor(tool),
                  )}
                  style={{
                    opacity: transformingActiveInpaintMask || !maskInteractionActive || editableMaskLayer?.visible === false
                      ? 0
                      : Math.min(0.72, (editableMaskLayer?.opacity ?? 1) * 0.62),
                  }}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={finishPointer}
                  onPointerCancel={finishPointer}
                  onWheel={adjustToolWidthFromWheel}
                  onContextMenu={openCanvasContextMenu}
                />
                {fullResolutionOperation ? (
                  <div
                    data-umbra-canvas-operation=""
                    className="absolute bottom-2 left-2 z-[60] flex min-w-52 items-center gap-2 border border-cyan-300/25 bg-black/90 px-2 py-1.5 shadow-lg shadow-black/60"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Loader2 size={9} className="animate-spin text-cyan-200" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[7px] font-black uppercase text-cyan-100">{fullResolutionOperation.label}</span>
                      <span className="block font-mono text-[6px] uppercase text-zinc-500">{fullResolutionOperation.phase}</span>
                    </span>
                    <button type="button" onClick={cancelFullResolutionOperation} title={`Cancel ${fullResolutionOperation.label}`} className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-red-300/25 text-red-200"><X size={9} /></button>
                  </div>
                ) : isExportingPsd ? (
                  <div
                    data-umbra-canvas-operation=""
                    className="absolute bottom-2 left-2 z-[60] flex min-w-52 items-center gap-2 border border-violet-300/25 bg-black/90 px-2 py-1.5 shadow-lg shadow-black/60"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Loader2 size={9} className="animate-spin text-violet-200" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[7px] font-black uppercase text-violet-100">Export layered PSD</span>
                      <span className="block font-mono text-[6px] uppercase text-zinc-500">{psdExportProgress.completed}/{psdExportProgress.total} layers / encoding</span>
                    </span>
                    <button type="button" onClick={cancelPsdExport} title="Cancel layered PSD export" className="inline-flex h-6 w-6 shrink-0 items-center justify-center border border-red-300/25 text-red-200"><X size={9} /></button>
                  </div>
                ) : null}
                {canvasPreferences.showProgressOnCanvas && running ? (
                  <div className="pointer-events-none absolute bottom-2 left-1/2 z-50 w-52 max-w-[calc(100%-16px)] -translate-x-1/2 border border-rose-300/25 bg-black/85 px-2 py-1.5 shadow-lg shadow-black/50">
                    <div className="mb-1 flex items-center gap-2 font-mono text-[7px] font-black uppercase text-rose-100"><Loader2 size={8} className="animate-spin" /> Generating <span className="ml-auto">{job?.completed || 0}/{job?.total || samples}</span></div>
                    <div className="h-1 overflow-hidden bg-white/10"><div className="h-full bg-rose-400 transition-[width] duration-200" style={{ width: `${Math.max(3, progress * 100)}%` }} /></div>
                  </div>
                ) : null}
                {boxStyle && tool !== 'gradient' && tool !== 'shape' ? (
                  <div
                    className="pointer-events-none absolute border border-dashed border-cyan-200 bg-cyan-300/10"
                    style={{
                      left: `${(boxStyle.x / canvasSize.width) * 100}%`,
                      top: `${(boxStyle.y / canvasSize.height) * 100}%`,
                      width: `${(boxStyle.width / canvasSize.width) * 100}%`,
                      height: `${(boxStyle.height / canvasSize.height) * 100}%`,
                    }}
                  />
                ) : null}
                {tool === 'shape' && boxPreview && boxStyle && shapeType !== 'polygon' && shapeType !== 'freehand' ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none">
                    {shapeType === 'line' ? (
                      <line x1={boxPreview.start.x} y1={boxPreview.start.y} x2={boxPreview.current.x} y2={boxPreview.current.y} stroke={colorWithAlpha(paintColor, brushOpacity)} strokeWidth={shapeStrokeWidth} strokeLinecap="round" />
                    ) : shapeType === 'ellipse' ? (
                      <ellipse cx={boxStyle.x + boxStyle.width / 2} cy={boxStyle.y + boxStyle.height / 2} rx={boxStyle.width / 2} ry={boxStyle.height / 2} fill={shapeFilled ? colorWithAlpha(paintColor, brushOpacity * 0.28) : 'none'} stroke={colorWithAlpha(paintColor, brushOpacity)} strokeWidth={shapeFilled ? 0 : shapeStrokeWidth} />
                    ) : (
                      <rect x={boxStyle.x} y={boxStyle.y} width={boxStyle.width} height={boxStyle.height} fill={shapeFilled ? colorWithAlpha(paintColor, brushOpacity * 0.28) : 'none'} stroke={colorWithAlpha(paintColor, brushOpacity)} strokeWidth={shapeFilled ? 0 : shapeStrokeWidth} />
                    )}
                  </svg>
                ) : null}
                {tool === 'gradient' && boxPreview ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none">
                    <line x1={boxPreview.start.x} y1={boxPreview.start.y} x2={boxPreview.current.x} y2={boxPreview.current.y} stroke="rgb(165,243,252)" strokeWidth={Math.max(1, 1.5 / Math.max(0.05, displayScale))} strokeDasharray={`${Math.max(3, 5 / Math.max(0.05, displayScale))} ${Math.max(2, 3 / Math.max(0.05, displayScale))}`} />
                    <circle cx={boxPreview.start.x} cy={boxPreview.start.y} r={Math.max(2, 4 / Math.max(0.05, displayScale))} fill="rgb(165,243,252)" />
                    <circle cx={boxPreview.current.x} cy={boxPreview.current.y} r={Math.max(2, 4 / Math.max(0.05, displayScale))} fill="rgb(8,47,73)" stroke="rgb(165,243,252)" strokeWidth={Math.max(1, 1 / Math.max(0.05, displayScale))} />
                  </svg>
                ) : null}
                {lassoPoints.length > 1 ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none">
                    <polyline
                      points={lassoPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                      fill="rgba(103,232,249,0.08)"
                      stroke="rgb(165,243,252)"
                      strokeWidth={Math.max(1, 1.5 / Math.max(0.05, displayScale))}
                      strokeDasharray={`${Math.max(3, 5 / Math.max(0.05, displayScale))} ${Math.max(2, 3 / Math.max(0.05, displayScale))}`}
                    />
                  </svg>
                ) : null}
                {tool === 'shape' && shapePoints.length > 1 ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none">
                    {shapePoints.length >= 3 ? (
                      <polygon
                        points={shapePoints.map((point) => `${point.x},${point.y}`).join(' ')}
                        fill={shapeFilled ? colorWithAlpha(paintColor, brushOpacity * 0.28) : 'none'}
                        stroke={colorWithAlpha(paintColor, brushOpacity)}
                        strokeWidth={shapeStrokeWidth}
                        strokeLinejoin="round"
                      />
                    ) : (
                      <polyline
                        points={shapePoints.map((point) => `${point.x},${point.y}`).join(' ')}
                        fill="none"
                        stroke={colorWithAlpha(paintColor, brushOpacity)}
                        strokeWidth={shapeStrokeWidth}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    {shapeType === 'polygon' ? shapePoints.map((point, index) => (
                      <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={Math.max(2, 4 / Math.max(0.05, displayScale))} fill={paintColor} stroke="rgb(8,47,73)" strokeWidth={Math.max(1, 1 / Math.max(0.05, displayScale))} />
                    )) : null}
                  </svg>
                ) : null}
                {polygonPoints.length > 0 ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none">
                    <polyline
                      points={polygonPoints.map((point) => `${point.x},${point.y}`).join(' ')}
                      fill="rgba(103,232,249,0.08)"
                      stroke="rgb(165,243,252)"
                      strokeWidth={Math.max(1, 1.5 / Math.max(0.05, displayScale))}
                      strokeDasharray={`${Math.max(3, 5 / Math.max(0.05, displayScale))} ${Math.max(2, 3 / Math.max(0.05, displayScale))}`}
                    />
                    {polygonPoints.map((point, index) => (
                      <circle key={`${point.x}-${point.y}-${index}`} cx={point.x} cy={point.y} r={Math.max(2, 4 / Math.max(0.05, displayScale))} fill="rgb(165,243,252)" stroke="rgb(8,47,73)" strokeWidth={Math.max(1, 1 / Math.max(0.05, displayScale))} />
                    ))}
                  </svg>
                ) : null}
                {tool === 'sam' && samPoints.length > 0 ? (
                  <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} preserveAspectRatio="none">
                    {samPoints.map((point, index) => (
                      <g key={`${point.x}-${point.y}-${index}`}>
                        <circle cx={point.x} cy={point.y} r={Math.max(4, 7 / Math.max(0.05, displayScale))} fill={point.positive ? 'rgb(34,197,94)' : 'rgb(244,63,94)'} stroke="rgb(255,255,255)" strokeWidth={Math.max(1, 1.5 / Math.max(0.05, displayScale))} />
                        <path d={`M ${point.x - 3 / Math.max(0.05, displayScale)} ${point.y} H ${point.x + 3 / Math.max(0.05, displayScale)}${point.positive ? ` M ${point.x} ${point.y - 3 / Math.max(0.05, displayScale)} V ${point.y + 3 / Math.max(0.05, displayScale)}` : ''}`} stroke="rgb(255,255,255)" strokeWidth={Math.max(1, 1 / Math.max(0.05, displayScale))} />
                      </g>
                    ))}
                  </svg>
                ) : null}
                {false && (canvasPreferences.showGenerationRegionOverlay || tool === 'region') && visibleContextRegion && contextPadding > 0 ? (
                  <div
                    className="pointer-events-none absolute border border-dashed border-violet-300/55 bg-violet-300/[0.025]"
                    style={{
                      left: `${(visibleContextRegion.x / canvasSize.width) * 100}%`,
                      top: `${(visibleContextRegion.y / canvasSize.height) * 100}%`,
                      width: `${(visibleContextRegion.width / canvasSize.width) * 100}%`,
                      height: `${(visibleContextRegion.height / canvasSize.height) * 100}%`,
                    }}
                  />
                ) : null}
                {false && !studioMode && (canvasPreferences.showGenerationRegionOverlay || tool === 'region') && canvasDocument?.generationRegion ? (
                  <div
                    className={cn(
                      'absolute border border-cyan-200 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.75),0_0_18px_rgba(103,232,249,0.18)]',
                      tool === 'region' ? 'cursor-move touch-none' : 'pointer-events-none',
                    )}
                    style={{
                      left: `${(canvasDocument.generationRegion.x / canvasSize.width) * 100}%`,
                      top: `${(canvasDocument.generationRegion.y / canvasSize.height) * 100}%`,
                      width: `${(canvasDocument.generationRegion.width / canvasSize.width) * 100}%`,
                      height: `${(canvasDocument.generationRegion.height / canvasSize.height) * 100}%`,
                    }}
                    onPointerDown={(event) => beginRegionTransform(event, 'move')}
                    onPointerMove={moveRegionTransform}
                    onPointerUp={finishRegionTransform}
                    onPointerCancel={finishRegionTransform}
                  >
                    <span className="absolute left-0 top-0 bg-cyan-950/90 px-1.5 py-0.5 font-mono text-[7px] text-cyan-100">GENERATION REGION</span>
                    {tool === 'region' ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        aria-label={`Resize generation region ${corner}`}
                        onPointerDown={(event) => beginRegionTransform(event, `resize-${corner}`)}
                        className={cn(
                          'absolute h-2.5 w-2.5 border border-cyan-100 bg-cyan-950 shadow-[0_0_6px_rgba(103,232,249,0.5)]',
                          corner[0] === 'n' ? '-top-1.5' : '-bottom-1.5',
                          corner[1] === 'w' ? '-left-1.5' : '-right-1.5',
                        )}
                      />
                    )) : null}
                  </div>
                ) : null}
                {tool === 'transform' && activeTransformLayer && activeTransformLayer.visible ? (
                  <div
                    className={cn(
                      'absolute touch-none border border-cyan-200/85 shadow-[0_0_12px_rgba(103,232,249,0.2)]',
                      activeTransformLayer.locked ? 'pointer-events-none border-amber-200/60' : 'cursor-move',
                    )}
                    style={{
                      left: `${(activeTransformLayer.transform.x / canvasSize.width) * 100}%`,
                      top: `${(activeTransformLayer.transform.y / canvasSize.height) * 100}%`,
                      width: `${(activeTransformLayer.transform.width / canvasSize.width) * 100}%`,
                      height: `${(activeTransformLayer.transform.height / canvasSize.height) * 100}%`,
                      transform: `rotate(${activeTransformLayer.transform.rotation}deg) scale(${activeTransformLayer.transform.scaleX}, ${activeTransformLayer.transform.scaleY})`,
                    }}
                    onPointerDown={(event) => beginLayerTransform(event, 'move')}
                    onPointerMove={moveLayerTransform}
                    onPointerUp={finishLayerTransform}
                    onPointerCancel={finishLayerTransform}
                  >
                    {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                      <button
                        key={corner}
                        type="button"
                        aria-label={`Resize ${corner}`}
                        onPointerDown={(event) => beginLayerTransform(event, `resize-${corner}`)}
                        className={cn(
                          'absolute h-2.5 w-2.5 border border-cyan-100 bg-cyan-950 shadow-[0_0_6px_rgba(103,232,249,0.5)]',
                          corner[0] === 'n' ? '-top-1.5' : '-bottom-1.5',
                          corner[1] === 'w' ? '-left-1.5' : '-right-1.5',
                        )}
                      />
                    ))}
                    <button
                      type="button"
                      aria-label="Rotate layer"
                      onPointerDown={(event) => beginLayerTransform(event, 'rotate')}
                      className="absolute left-1/2 top-[-22px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border border-rose-100 bg-rose-950 shadow-[0_0_6px_rgba(251,113,133,0.5)] before:absolute before:left-1/2 before:top-2 before:h-3 before:w-px before:-translate-x-1/2 before:bg-rose-200/70"
                    />
                    <span className="pointer-events-none absolute left-0 top-0 bg-cyan-950/85 px-1 py-0.5 font-mono text-[7px] text-cyan-100">
                      {activeTransformLayer.name}{activeTransformLayer.locked ? ' / LOCKED' : ''}
                    </span>
                  </div>
                ) : null}
                {!canvasReady ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50"><Loader2 size={18} className="animate-spin text-rose-200" /></div>
                ) : null}
              </div>
            </div>
          )}
          {source ? (
            <div className="sticky bottom-2 z-20 ml-auto mr-2 w-fit border border-white/15 bg-black/85 p-1 shadow-lg shadow-black/60">
              <div className="relative">
                <canvas ref={minimapCanvasRef} onPointerDown={navigateMinimap} className="block max-h-24 max-w-36 cursor-crosshair" title="Navigate canvas" />
                <span
                  className="pointer-events-none absolute border border-cyan-200/80 bg-cyan-300/10"
                  style={{
                    left: `${Math.max(0, Math.min(100, (viewportMetrics.left / viewportMetrics.scrollWidth) * 100))}%`,
                    top: `${Math.max(0, Math.min(100, (viewportMetrics.top / viewportMetrics.scrollHeight) * 100))}%`,
                    width: `${Math.max(4, Math.min(100, (viewportMetrics.width / viewportMetrics.scrollWidth) * 100))}%`,
                    height: `${Math.max(4, Math.min(100, (viewportMetrics.height / viewportMetrics.scrollHeight) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            'absolute inset-y-0 right-0 z-40 flex min-h-0 flex-col overflow-hidden border-l border-white/10 bg-[#060809] shadow-xl shadow-black/40 transition-[width] duration-150 ease-out',
            layersExpanded ? '' : 'w-10',
          )}
          style={layersExpanded ? { width: 'clamp(248px, 22vw, 320px)' } : undefined}
        >
          <div
            className={cn(
              'z-30 flex bg-[#060809]/95 text-left shadow-md shadow-black/30 backdrop-blur-sm',
              layersExpanded
                ? 'min-h-10 w-full items-center gap-2 border-b border-white/[0.07] px-3'
                : 'h-full w-10 flex-col items-center gap-2 px-1 py-2',
            )}
          >
            {layersExpanded ? <span className="h-4 w-0.5 bg-rose-300/70" /> : null}
            <FileImage size={12} className="text-rose-300" />
            {layersExpanded ? (
              <>
                <span className="text-[9px] font-black uppercase tracking-[0.14em] text-zinc-300">Canvas Document</span>
                {canvasDocument?.staging.length ? <span className="font-mono text-[8px] text-cyan-300">{canvasDocument.staging.length} staged</span> : null}
              </>
            ) : (
              <span className="mt-1 font-mono text-[7px] font-black uppercase tracking-[0.14em] text-zinc-500 [writing-mode:vertical-rl]">Canvas Document</span>
            )}
            <button
              type="button"
              aria-expanded={layersExpanded}
              aria-controls="umbra-inpaint-results-panel"
              onClick={() => setLayersExpanded((value) => !value)}
              title={layersExpanded ? 'Collapse Canvas Document' : 'Expand Canvas Document'}
              className={cn(
                'inline-flex h-7 items-center justify-center gap-1.5 rounded-sm border border-white/10 bg-black/25 font-mono text-[8px] font-black uppercase text-zinc-400 transition-colors hover:border-cyan-300/25 hover:text-cyan-100',
                layersExpanded ? 'ml-auto px-2' : 'mt-auto w-7 px-0',
              )}
            >
              {layersExpanded ? <ChevronRight size={10} /> : <ChevronLeft size={10} />}
              {layersExpanded ? 'Collapse' : <span className="sr-only">Expand</span>}
            </button>
          </div>
          {layersExpanded ? (
            <div
              id="umbra-inpaint-results-panel"
              data-umbra-inpaint-results=""
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-white/[0.06] custom-scrollbar"
            >
              <div className="min-w-0 border-b border-white/[0.07] bg-[#07090a] px-3 pb-3 pt-2">
                <div className="mb-2 flex min-w-0 items-center gap-2">
                  <span className="border-l-2 border-rose-300/60 pl-2 text-[8px] font-black uppercase tracking-[0.14em] text-rose-100/80">Layers</span>
                  <span className="font-mono text-[8px] text-zinc-700">images + masks</span>
                  <span className="font-mono text-[8px] text-zinc-600">{simpleInpaintLayerRows.length}</span>
                  <button
                    type="button"
                    onClick={() => dispatchCanvasDocument({ type: 'add_inpaint_mask' })}
                    disabled={!canvasDocument}
                    title="Add an editable inpaint mask"
                    className="ml-auto inline-flex h-7 items-center justify-center gap-1.5 rounded-sm border border-rose-300/20 bg-rose-500/[0.04] px-2 text-[8px] font-black uppercase text-rose-200 hover:bg-rose-500/[0.09] disabled:border-white/[0.06] disabled:text-zinc-800"
                  >
                    <Plus size={9} /> New Mask
                  </button>
                </div>
                <div data-umbra-simple-layers="" className="flex min-h-[104px] flex-col gap-2 pb-1">
                  {[...simpleInpaintLayerRows].reverse().map((layer) => {
                    const active = canvasDocument?.activeLayerId === layer.id;
                    const isSource = layer.kind === 'raster' && layer.role === 'source';
                    const isMask = layer.kind === 'mask';
                    const isActiveMask = isMask && canvasDocument?.activeMaskLayerId === layer.id;
                    const thumbnail = layer.kind === 'raster' ? layer.asset.imageUrl : layer.dataUrl;
                    return (
                      <div
                        key={layer.id}
                        className={cn(
                          'w-full shrink-0 rounded-sm border bg-black/40 p-1.5',
                          active
                            ? 'border-rose-300/55 shadow-[0_0_14px_rgba(251,113,133,0.12)]'
                            : 'border-white/10',
                        )}
                      >
                        <button
                          type="button"
                          onClick={(event) => selectLayerRow(layer, event.shiftKey)}
                          aria-pressed={active}
                          title={isMask ? 'Select this mask for painting' : 'Select this image layer'}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="relative h-10 w-12 shrink-0 overflow-hidden border border-white/10 bg-[linear-gradient(45deg,#171717_25%,transparent_25%),linear-gradient(-45deg,#171717_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#171717_75%),linear-gradient(-45deg,transparent_75%,#171717_75%)] bg-[length:10px_10px]">
                            {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : isMask ? <SquareDashed size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-rose-300/70" /> : <FileImage size={14} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-600" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[8px] font-black uppercase text-zinc-300" title={layer.name}>{layer.name}</span>
                            <span className={cn('block font-mono text-[7px] uppercase', isMask ? 'text-rose-300/70' : 'text-cyan-300/65')}>
                              {isMask ? `Mask${isActiveMask ? ' / active' : ''}` : isSource ? 'Image / source' : 'Image'}
                            </span>
                          </span>
                        </button>
                        <div className="mt-1.5 flex items-center gap-1">
                          {isMask ? (
                            <button
                              type="button"
                              onClick={() => dispatchCanvasDocument({ type: 'toggle_layer_enabled', layerId: layer.id })}
                              disabled={layer.locked}
                              title={layer.enabled ? 'Disable mask for generation' : 'Enable mask for generation'}
                              className={cn('inline-flex h-6 w-6 items-center justify-center border disabled:text-zinc-800', layer.enabled ? 'border-emerald-300/30 text-emerald-200' : 'border-white/10 text-zinc-700')}
                            >
                              <Power size={9} />
                            </button>
                          ) : null}
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'toggle_layer', layerId: layer.id })} title={layer.visible ? 'Hide layer' : 'Show layer'} className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 hover:text-zinc-200">{layer.visible ? <Eye size={9} /> : <EyeOff size={9} />}</button>
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'move_layer', layerId: layer.id, direction: 'up' })} disabled={isSource || layer.locked} title="Move layer up" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><ArrowUp size={9} /></button>
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'move_layer', layerId: layer.id, direction: 'down' })} disabled={isSource || layer.locked} title="Move layer down" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 hover:text-cyan-200 disabled:text-zinc-800"><ArrowDown size={9} /></button>
                          <button
                            type="button"
                            onClick={() => isMask ? deleteInpaintMask(layer.id) : dispatchCanvasDocument({ type: 'remove_layer', layerId: layer.id })}
                            disabled={isSource || layer.locked}
                            title={isSource ? 'The source image cannot be deleted' : isMask ? 'Delete mask; Undo restores it' : 'Delete image layer'}
                            className="ml-auto inline-flex h-6 w-6 items-center justify-center border border-red-300/15 text-red-300/65 hover:text-red-200 disabled:text-zinc-800"
                          >
                            <Trash2 size={9} />
                          </button>
                        </div>
                        <label className="mt-1.5 flex items-center gap-1.5">
                          <span className="w-8 text-[7px] font-black uppercase text-zinc-700">Opacity</span>
                          <input type="range" min={0} max={1} step={0.01} value={layer.opacity} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_opacity', layerId: layer.id, opacity: Number(event.target.value) })} disabled={layer.locked} className="min-w-0 flex-1 accent-rose-300 disabled:opacity-35" />
                          <span className="w-7 text-right font-mono text-[7px] text-zinc-600">{Math.round(layer.opacity * 100)}%</span>
                        </label>
                      </div>
                    );
                  })}
                  {canvasDocument && simpleInpaintLayerRows.length <= 0 ? (
                    <div className="flex min-w-44 items-center justify-center border border-dashed border-white/10 px-3 text-center text-[8px] font-black uppercase tracking-[0.12em] text-zinc-700">No image or mask layers</div>
                  ) : null}
                </div>
              </div>
              {false ? <div className="min-w-0 bg-[#07090a] px-3 pb-3 pt-2">
                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="border-l-2 border-rose-300/60 pl-2 text-[8px] font-black uppercase tracking-[0.14em] text-rose-100/80">Layers</span>
                  <span className="font-mono text-[8px] text-zinc-700">bottom to top</span>
                  {selectedLayerIds.length > 1 ? <span className="font-mono text-[7px] uppercase text-cyan-300">{selectedLayerIds.length} selected</span> : null}
                  <div data-umbra-layer-actions="" className="flex w-full max-w-full min-w-0 flex-wrap items-center gap-1 [&>*]:shrink-0">
                    <button
                      type="button"
                      onClick={groupSelectedLayers}
                      disabled={groupableSelectedLayers.length < 2 || selectedVisualMutationLocked}
                      title="Group selected visual layers (Shift-click layer rows to select several)"
                      className="inline-flex h-6 items-center gap-1.5 border border-cyan-300/20 px-2 text-[7px] font-black uppercase text-cyan-200 disabled:border-white/5 disabled:text-zinc-800"
                    >
                      <FolderPlus size={9} /> Group
                    </button>
                    <button
                      type="button"
                      onClick={() => void mergeSelectedLayers()}
                      disabled={selectedVisualLayers.length < 2 || selectedVisualMutationLocked || !canvasReady}
                      title="Merge selected visual layers into one raster layer"
                      className="inline-flex h-6 items-center gap-1.5 border border-amber-300/20 px-2 text-[7px] font-black uppercase text-amber-200 disabled:border-white/5 disabled:text-zinc-800"
                    >
                      <Combine size={9} /> Merge
                    </button>
                    {activeControlLayer || activeInpaintMaskLayer || activeRegionalGuidanceLayer ? (
                      <button
                        type="button"
                        onClick={() => void mergeVisibleGuidanceLayers()}
                        disabled={visibleGuidanceMergeLayers.length < 2 || visibleGuidanceMergeMutationLocked || !canvasReady}
                        title={`Merge all visible ${activeControlLayer ? 'controls' : activeRegionalGuidanceLayer ? 'regions' : 'inpaint masks'} into one layer`}
                        className="inline-flex h-6 w-6 items-center justify-center border border-emerald-300/20 text-emerald-200 disabled:border-white/5 disabled:text-zinc-800"
                      >
                        <Layers3 size={9} />
                      </button>
                    ) : null}
                    {false ? <div ref={booleanMenuRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setBooleanMenuOpen((value) => !value)}
                        disabled={booleanRasterLayers.length !== 2 || !canvasReady}
                        aria-haspopup="menu"
                        aria-expanded={booleanMenuOpen}
                        title="Combine exactly two visible raster layers while preserving the originals"
                        className="inline-flex h-6 items-center gap-1.5 border border-violet-300/20 px-2 text-[7px] font-black uppercase text-violet-200 disabled:border-white/5 disabled:text-zinc-800"
                      >
                        <SquaresIntersect size={9} /> Boolean <ChevronDown size={8} />
                      </button>
                      {booleanMenuOpen ? (
                        <div role="menu" className="absolute right-0 top-[calc(100%+4px)] z-50 w-36 border border-violet-300/25 bg-[#08090d] p-1 shadow-xl shadow-black/70">
                          <button type="button" role="menuitem" onClick={() => void applyRasterBoolean('intersect')} className="flex h-7 w-full items-center gap-2 px-2 text-left text-[8px] font-black uppercase text-zinc-300 hover:bg-violet-500/10 hover:text-violet-100"><SquaresIntersect size={10} /> Intersect</button>
                          <button type="button" role="menuitem" onClick={() => void applyRasterBoolean('cut_out')} className="flex h-7 w-full items-center gap-2 px-2 text-left text-[8px] font-black uppercase text-zinc-300 hover:bg-violet-500/10 hover:text-violet-100"><Scissors size={10} /> Cut Out</button>
                          <button type="button" role="menuitem" onClick={() => void applyRasterBoolean('cut_away')} className="flex h-7 w-full items-center gap-2 px-2 text-left text-[8px] font-black uppercase text-zinc-300 hover:bg-violet-500/10 hover:text-violet-100"><SquaresSubtract size={10} /> Cut Away</button>
                          <button type="button" role="menuitem" onClick={() => void applyRasterBoolean('exclude')} className="flex h-7 w-full items-center gap-2 px-2 text-left text-[8px] font-black uppercase text-zinc-300 hover:bg-violet-500/10 hover:text-violet-100"><SquaresUnite size={10} /> Exclude</button>
                        </div>
                      ) : null}
                    </div> : null}
                    <button type="button" onClick={() => dispatchCanvasDocument({ type: 'add_inpaint_mask' })} disabled={!canvasDocument} title="Add another editable inpaint mask" className="inline-flex h-6 items-center justify-center gap-1.5 border border-rose-300/20 px-2 text-[7px] font-black uppercase text-rose-200 disabled:text-zinc-800"><Plus size={9} /> New Mask</button>
                    <button
                      type="button"
                      onClick={() => activeInpaintMaskLayer && deleteInpaintMask(activeInpaintMaskLayer.id)}
                      disabled={!activeInpaintMaskLayer || activeInpaintMaskLayer.locked}
                      title={!activeInpaintMaskLayer ? 'Select an inpaint mask to delete it' : activeInpaintMaskLayer.locked ? 'Unlock the active mask before deleting it' : 'Delete the selected inpaint mask; Undo restores it'}
                      className="inline-flex h-6 items-center justify-center gap-1.5 border border-red-300/20 px-2 text-[7px] font-black uppercase text-red-200 disabled:border-white/[0.06] disabled:text-zinc-800"
                    >
                      <Trash2 size={9} /> Delete Mask
                    </button>
                    <button type="button" onClick={() => dispatchCanvasDocument({ type: 'add_group_layer' })} disabled={!canvasDocument} title="Add layer group" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-400 disabled:text-zinc-800"><FolderPlus size={9} /></button>
                  </div>
                </div>
                <div className="flex min-h-[110px] gap-2 overflow-x-auto custom-scrollbar">
                  {canvasDocument ? [...visibleLayerRows].reverse().map((layer) => {
                    const active = canvasDocument.activeLayerId === layer.id;
                    const selected = selectedLayerIds.includes(layer.id);
                    const isSource = layer.kind === 'raster' && layer.role === 'source';
                    const isActiveMask = layer.id === canvasDocument.activeMaskLayerId;
                    const isEditingLayerMask = layer.id === editingLayerMaskId;
                    const canToggleGeneration = layer.kind === 'mask' && layer.purpose === 'inpaint'
                      || layer.kind === 'regional_guidance'
                      || layer.kind === 'control'
                      || layer.kind === 'reference';
                    const regionalMask = layer.kind === 'regional_guidance'
                      ? getUmbraCanvasMaskLayer(canvasDocument, layer.maskLayerId)
                      : null;
                    const thumbnail = layer.kind === 'raster'
                      ? layer.asset.imageUrl
                      : layer.kind === 'control'
                        ? layer.asset.imageUrl
                      : layer.kind === 'reference'
                        ? layer.asset.imageUrl
                      : layer.kind === 'mask'
                        ? layer.dataUrl
                        : regionalMask?.dataUrl || '';
                    return (
                      <div
                        key={layer.id}
                        onDragOver={(event) => previewLayerDrop(event, layer.id)}
                        onDrop={(event) => dropLayer(event, layer.id)}
                        className={cn(
                          'relative w-[194px] shrink-0 border bg-black/40 p-1.5',
                          active
                            ? 'border-rose-300/55 shadow-[0_0_14px_rgba(251,113,133,0.12)]'
                            : selected
                              ? 'border-cyan-300/50 bg-cyan-500/[0.045] shadow-[0_0_12px_rgba(103,232,249,0.1)]'
                              : 'border-white/10',
                          layerDropTarget?.layerId === layer.id && layerDropTarget.side === 'left' ? 'after:absolute after:bottom-0 after:left-[-5px] after:top-0 after:w-0.5 after:bg-cyan-200' : '',
                          layerDropTarget?.layerId === layer.id && layerDropTarget.side === 'right' ? 'after:absolute after:bottom-0 after:right-[-5px] after:top-0 after:w-0.5 after:bg-cyan-200' : '',
                        )}
                      >
                        {canToggleGeneration ? (
                          <button
                            type="button"
                            onClick={() => dispatchCanvasDocument({ type: 'toggle_layer_enabled', layerId: layer.id })}
                            disabled={layer.locked}
                            title={layer.enabled ? 'Disable this layer for generation' : 'Enable this layer for generation'}
                            className={cn('absolute left-[42px] top-2 z-10 inline-flex h-4 w-4 items-center justify-center border bg-black/80 disabled:text-zinc-800', layer.enabled ? 'border-emerald-300/40 text-emerald-200' : 'border-white/15 text-zinc-700')}
                          >
                            <Power size={8} />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          aria-pressed={selected}
                          title="Select layer; Shift-click to add or remove it from the selection"
                          onClick={(event) => selectLayerRow(layer, event.shiftKey)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <span className="relative h-10 w-12 shrink-0 overflow-hidden border border-white/10 bg-[linear-gradient(45deg,#171717_25%,transparent_25%),linear-gradient(-45deg,#171717_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#171717_75%),linear-gradient(-45deg,transparent_75%,#171717_75%)] bg-[length:10px_10px]">
                            {thumbnail ? <img src={thumbnail} alt="" className="h-full w-full object-cover" /> : layer.kind === 'gradient' ? <span className="absolute inset-0" style={{ background: `linear-gradient(${layer.angle}deg, ${layer.stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 100)}%`).join(', ')})` }} /> : layer.kind === 'text' ? <Type size={15} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-500" /> : layer.kind === 'group' ? <FolderPlus size={15} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-500" /> : <Layers3 size={13} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-zinc-700" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[8px] font-black uppercase text-zinc-300" title={layer.name}>{layer.name}</span>
                            <span className="block font-mono text-[7px] uppercase text-zinc-600">{layer.kind}{isActiveMask ? ' / active' : ''}{isEditingLayerMask ? ' / layer mask' : ''}{selected && !active ? ' / selected' : ''}</span>
                            {layer.groupId ? <span className="block truncate font-mono text-[6px] uppercase text-cyan-300/50">{groupLayers.find((group) => group.id === layer.groupId)?.name || 'Missing group'}</span> : null}
                          </span>
                        </button>
                        <div className="mt-1.5 flex items-center gap-1">
                          <button
                            type="button"
                            draggable={!isSource && !layer.locked}
                            onDragStart={(event) => beginLayerDrag(event, layer.id)}
                            onDragEnd={finishLayerDrag}
                            disabled={isSource || layer.locked}
                            title={isSource ? 'The immutable source stays at the bottom of the stack' : layer.locked ? 'Unlock the layer before reordering it' : 'Drag to reorder layer'}
                            className="inline-flex h-5 w-5 cursor-grab items-center justify-center border border-white/10 text-zinc-500 active:cursor-grabbing disabled:cursor-default disabled:text-zinc-800"
                          >
                            <GripVertical size={9} />
                          </button>
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'toggle_layer', layerId: layer.id })} title={layer.visible ? 'Hide layer' : 'Show layer'} className="inline-flex h-5 w-5 items-center justify-center border border-white/10 text-zinc-500">{layer.visible ? <Eye size={9} /> : <EyeOff size={9} />}</button>
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'toggle_layer_lock', layerId: layer.id })} disabled={isSource} title={isSource ? 'The source layer is immutable' : layer.locked ? 'Unlock layer' : 'Lock layer'} className="inline-flex h-5 w-5 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800">{layer.locked ? <Lock size={9} /> : <Unlock size={9} />}</button>
                          {layer.kind === 'group' ? <button type="button" onClick={() => dispatchCanvasDocument({ type: 'toggle_group_collapsed', layerId: layer.id })} title={layer.collapsed ? 'Expand group' : 'Collapse group'} className="inline-flex h-5 w-5 items-center justify-center border border-white/10 text-zinc-500">{layer.collapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}</button> : null}
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'move_layer', layerId: layer.id, direction: 'up' })} disabled={isSource || layer.locked} title="Move up" className="inline-flex h-5 w-5 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><ArrowUp size={9} /></button>
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'move_layer', layerId: layer.id, direction: 'down' })} disabled={isSource || layer.locked} title="Move down" className="inline-flex h-5 w-5 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><ArrowDown size={9} /></button>
                          <button type="button" onClick={() => dispatchCanvasDocument({ type: 'duplicate_layer', layerId: layer.id })} disabled={isSource || layer.locked || layer.kind === 'group' || layer.kind === 'mask' && (layer.frozen || layer.purpose !== 'inpaint')} title="Duplicate layer" className="inline-flex h-5 w-5 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><Copy size={9} /></button>
                          <button type="button" aria-pressed={canvasDocument.bookmarkedLayerId === layer.id} onClick={() => dispatchCanvasDocument({ type: 'set_bookmarked_layer', layerId: canvasDocument.bookmarkedLayerId === layer.id ? '' : layer.id })} title={canvasDocument.bookmarkedLayerId === layer.id ? 'Remove quick-switch bookmark' : 'Bookmark layer for quick switch'} className={cn('inline-flex h-5 w-5 items-center justify-center border', canvasDocument.bookmarkedLayerId === layer.id ? 'border-cyan-300/40 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600')}><Bookmark size={9} className={canvasDocument.bookmarkedLayerId === layer.id ? 'fill-current' : ''} /></button>
                          <button type="button" onClick={() => layer.kind === 'mask' && layer.purpose === 'inpaint' ? deleteInpaintMask(layer.id) : dispatchCanvasDocument({ type: 'remove_layer', layerId: layer.id })} disabled={isSource || layer.locked || (layer.kind === 'mask' && layer.purpose === 'layer')} title={layer.kind === 'mask' && layer.purpose === 'layer' ? 'Remove this mask from its raster layer controls' : layer.kind === 'mask' && layer.purpose === 'inpaint' ? 'Delete inpaint mask; Undo restores it' : 'Delete layer'} className="ml-auto inline-flex h-5 w-5 items-center justify-center border border-red-300/15 text-red-300/60 disabled:text-zinc-800"><Trash2 size={9} /></button>
                        </div>
                        {layer.kind !== 'mask' || !layer.frozen ? (
                          <label className="mt-1.5 flex items-center gap-1.5">
                            <span className="w-7 text-[7px] font-black uppercase text-zinc-700">Opacity</span>
                            <input type="range" min={0} max={1} step={0.01} value={layer.opacity} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_opacity', layerId: layer.id, opacity: Number(event.target.value) })} disabled={layer.locked} className="min-w-0 flex-1 accent-rose-400 disabled:opacity-30" />
                            <span className="w-7 text-right font-mono text-[7px] text-zinc-600">{Math.round(layer.opacity * 100)}%</span>
                          </label>
                        ) : null}
                      </div>
                    );
                  }) : (
                    <div className="flex min-w-44 items-center justify-center border border-dashed border-white/10 text-[8px] font-black uppercase tracking-[0.12em] text-zinc-700">Open an image</div>
                  )}
                </div>
                {activeRasterLayer ? (
                  <fieldset
                    disabled={activeRasterLayer.locked || activeRasterLayer.role === 'source'}
                    className="mt-2 grid w-full min-w-0 items-end gap-1.5 border-0 border-t border-white/[0.06] p-0 pt-2 disabled:opacity-55"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 88px), 1fr))' }}
                  >
                    <label className="col-span-2 min-w-0 space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Layer Name</span>
                      <input value={activeRasterLayer.name} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_name', layerId: activeRasterLayer.id, name: event.target.value })} className="h-7 w-full min-w-0 border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-200 outline-none focus:border-cyan-300/35" />
                    </label>
                    <label className="min-w-0 space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Blend</span>
                      <select value={activeRasterLayer.blendMode} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_blend_mode', layerId: activeRasterLayer.id, blendMode: event.target.value as UmbraCanvasBlendMode })} className="h-7 w-full border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none">
                        {UMBRA_CANVAS_BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode === 'source-over' ? 'Normal' : mode}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0 space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Group</span>
                      <select value={activeRasterLayer.groupId || ''} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_group', layerId: activeRasterLayer.id, groupId: event.target.value })} disabled={activeRasterLayer.role === 'source'} className="h-7 w-full border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none disabled:text-zinc-700">
                        <option value="">Ungrouped</option>
                        {groupLayers.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0 space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Smoothing</span>
                      <select value={activeRasterLayer.smoothing} onChange={(event) => dispatchCanvasDocument({ type: 'set_raster_smoothing', layerId: activeRasterLayer.id, smoothing: event.target.value as UmbraCanvasRasterLayer['smoothing'] })} className="h-7 w-full border border-white/10 bg-black/35 px-1 font-mono text-[8px] text-zinc-300 outline-none">
                        <option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                      </select>
                    </label>
                    {([
                      ['X', 'x'],
                      ['Y', 'y'],
                      ['W', 'width'],
                      ['H', 'height'],
                      ['ROT', 'rotation'],
                    ] as const).map(([label, key]) => (
                      <label key={key} className="min-w-0 space-y-1">
                        <span className="block text-[7px] font-black uppercase text-zinc-700">{label}</span>
                        <input
                          type="number"
                          value={Math.round(activeRasterLayer.transform[key] * 100) / 100}
                          onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_transform', layerId: activeRasterLayer.id, transform: { [key]: Number(event.target.value) } })}
                          disabled={activeRasterLayer.locked}
                          className="h-7 w-full border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none disabled:text-zinc-700"
                        />
                      </label>
                    ))}
                    <div className="space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Flip</span>
                      <div className="grid grid-cols-2 gap-1">
                        <button type="button" onClick={() => dispatchCanvasDocument({ type: 'set_layer_transform', layerId: activeRasterLayer.id, transform: { scaleX: activeRasterLayer.transform.scaleX * -1 } })} disabled={activeRasterLayer.locked} title="Flip horizontally" className="inline-flex h-7 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><FlipHorizontal2 size={10} /></button>
                        <button type="button" onClick={() => dispatchCanvasDocument({ type: 'set_layer_transform', layerId: activeRasterLayer.id, transform: { scaleY: activeRasterLayer.transform.scaleY * -1 } })} disabled={activeRasterLayer.locked} title="Flip vertically" className="inline-flex h-7 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><FlipVertical2 size={10} /></button>
                      </div>
                    </div>
                    <div className="col-span-full flex min-w-0 flex-wrap items-end gap-2 border-t border-white/[0.05] pt-2">
                      <label className="flex h-8 shrink-0 items-center gap-1.5 border border-white/10 px-2 font-mono text-[7px] uppercase text-zinc-400"><input type="checkbox" checked={activeRasterLayer.adjustments.enabled} onChange={(event) => dispatchCanvasDocument({ type: 'update_raster_adjustments', layerId: activeRasterLayer.id, changes: { enabled: event.target.checked } })} className="accent-cyan-300" /> Adjustments</label>
                      <label className="flex h-8 shrink-0 items-center gap-1.5 border border-white/10 px-2 font-mono text-[7px] uppercase text-zinc-400"><input type="checkbox" checked={activeRasterLayer.transparencyLocked} onChange={(event) => dispatchCanvasDocument({ type: 'set_raster_transparency_lock', layerId: activeRasterLayer.id, locked: event.target.checked })} className="accent-rose-300" /> Lock Alpha</label>
                      <button type="button" onClick={() => setRasterFilterLayerId(activeRasterLayer.id)} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-rose-300/20 px-2 text-[7px] font-black uppercase text-rose-200"><WandSparkles size={9} /> Filter</button>
                      <button type="button" onClick={() => setLayerUpscaleLayerId(activeRasterLayer.id)} disabled={!comfyConnected || upscaleModels.length <= 0} title={upscaleModels.length > 0 ? 'Upscale this layer with an installed model' : 'Install an upscale model to use this action'} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-cyan-300/20 px-2 text-[7px] font-black uppercase text-cyan-200 disabled:border-white/5 disabled:text-zinc-800"><Maximize2 size={9} /> Upscale</button>
                      <button type="button" onClick={() => void editOrAddActiveRasterMask()} disabled={activeRasterLayer.role === 'source'} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-cyan-300/20 px-2 text-[7px] font-black uppercase text-cyan-200 disabled:border-white/5 disabled:text-zinc-800"><SquareDashed size={9} /> {activeRasterLayer.maskLayerId ? 'Edit Mask' : 'Add Mask'}</button>
                      {!activeRasterLayer.maskLayerId ? <button type="button" onClick={() => void editOrAddActiveRasterMask(true)} disabled={activeRasterLayer.role === 'source'} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-cyan-300/20 px-2 text-[7px] font-black uppercase text-cyan-200 disabled:border-white/5 disabled:text-zinc-800"><Scissors size={9} /> From Selection</button> : null}
                      {activeRasterLayer.maskLayerId ? <button type="button" onClick={() => detachRasterMask(activeRasterLayer)} disabled={activeRasterLayer.role === 'source'} className="inline-flex h-8 shrink-0 items-center gap-1.5 border border-red-300/20 px-2 text-[7px] font-black uppercase text-red-200 disabled:border-white/5 disabled:text-zinc-800"><X size={9} /> Remove Mask</button> : null}
                      <div className="flex h-8 shrink-0 items-stretch">
                        {(['simple', 'curves'] as const).map((mode) => <button key={mode} type="button" onClick={() => dispatchCanvasDocument({ type: 'update_raster_adjustments', layerId: activeRasterLayer.id, changes: { mode } })} className={cn('border px-2 font-mono text-[7px] font-black uppercase', activeRasterLayer.adjustments.mode === mode ? 'border-cyan-300/30 bg-cyan-500/[0.08] text-cyan-200' : 'border-white/10 text-zinc-600')}>{mode}</button>)}
                      </div>
                      {activeRasterLayer.adjustments.mode === 'simple' ? ([
                          ['Brightness', 'brightness', -1, 1],
                          ['Contrast', 'contrast', -1, 1],
                          ['Saturation', 'saturation', -1, 1],
                          ['Temperature', 'temperature', -1, 1],
                          ['Tint', 'tint', -1, 1],
                          ['Sharpness', 'sharpness', 0, 1],
                        ] as const).map(([label, key, minimum, maximum]) => (
                          <label key={key} className="w-28 shrink-0 space-y-1">
                            <span className="flex text-[7px] font-black uppercase text-zinc-700"><span>{label}</span><span className="ml-auto font-mono text-zinc-500">{activeRasterLayer.adjustments[key].toFixed(2)}</span></span>
                            <input type="range" min={minimum} max={maximum} step={0.01} value={activeRasterLayer.adjustments[key]} disabled={!activeRasterLayer.adjustments.enabled} onChange={(event) => dispatchCanvasDocument({ type: 'update_raster_adjustments', layerId: activeRasterLayer.id, changes: { [key]: Number(event.target.value) } })} className="w-full accent-cyan-300 disabled:opacity-30" />
                          </label>
                        )) : (
                          <UmbraRasterCurvesEditor
                            curves={activeRasterLayer.adjustments.curves}
                            imageUrl={activeRasterLayer.asset.imageUrl}
                            disabled={!activeRasterLayer.adjustments.enabled}
                            onChange={(curves) => dispatchCanvasDocument({ type: 'update_raster_adjustments', layerId: activeRasterLayer.id, changes: { curves } })}
                          />
                        )}
                    </div>
                  </fieldset>
                ) : activeGroupLayer ? (
                  <div
                    data-umbra-layer-settings="group"
                    className="mt-2 grid w-full min-w-0 items-end gap-1.5 border-t border-white/[0.06] pt-2"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}
                  >
                    <label className="space-y-1"><span className="block text-[7px] font-black uppercase text-zinc-700">Group Name</span><input value={activeGroupLayer.name} disabled={activeGroupLayer.locked} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_name', layerId: activeGroupLayer.id, name: event.target.value })} className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-200 outline-none disabled:opacity-35" /></label>
                    <label className="space-y-1"><span className="block text-[7px] font-black uppercase text-zinc-700">Opacity</span><input type="range" min={0} max={1} step={0.01} value={activeGroupLayer.opacity} disabled={activeGroupLayer.locked} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_opacity', layerId: activeGroupLayer.id, opacity: Number(event.target.value) })} className="h-8 w-full accent-rose-300 disabled:opacity-35" /></label>
                    <label className="space-y-1"><span className="block text-[7px] font-black uppercase text-zinc-700">Blend</span><select value={activeGroupLayer.blendMode} disabled={activeGroupLayer.locked} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_blend_mode', layerId: activeGroupLayer.id, blendMode: event.target.value as UmbraCanvasBlendMode })} className="h-8 w-full border border-white/10 bg-black/35 px-1 font-mono text-[8px] text-zinc-300 outline-none disabled:opacity-35">{UMBRA_CANVAS_BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode === 'source-over' ? 'Normal' : mode}</option>)}</select></label>
                    <button type="button" onClick={() => dispatchCanvasDocument({ type: 'toggle_group_collapsed', layerId: activeGroupLayer.id })} className="inline-flex h-8 items-center justify-center gap-1 border border-white/10 text-[7px] font-black uppercase text-zinc-400">{activeGroupLayer.collapsed ? <ChevronRight size={9} /> : <ChevronDown size={9} />}{activeGroupLayer.collapsed ? 'Expand' : 'Collapse'}</button>
                    <button type="button" onClick={() => void mergeActiveGroup()} disabled={!canvasReady || activeGroupMergeMutationLocked} title={activeGroupMergeMutationLocked ? 'Unlock the group and its children before merging' : 'Merge the group into one raster layer'} className="inline-flex h-8 items-center justify-center gap-1 border border-cyan-300/20 text-[7px] font-black uppercase text-cyan-200 disabled:text-zinc-800"><Combine size={9} /> Merge</button>
                  </div>
                ) : activeLayerMaskLayer ? (
                  <div
                    data-umbra-layer-settings="layer-mask"
                    className="mt-2 grid w-full min-w-0 items-end gap-2 border-t border-white/[0.06] pt-2"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 130px), 1fr))' }}
                  >
                    <label className="min-w-0 space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Layer Mask Name</span>
                      <input value={activeLayerMaskLayer.name} onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_name', layerId: activeLayerMaskLayer.id, name: event.target.value })} className="h-8 w-full min-w-0 border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-200 outline-none focus:border-cyan-300/35" />
                    </label>
                    <div className="space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Masks Raster Layer</span>
                      <div className="flex h-8 items-center border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-400">{rasterForActiveLayerMask?.name || 'Missing raster layer'}</div>
                    </div>
                    <button type="button" onClick={() => detachRasterMask(rasterForActiveLayerMask)} disabled={!rasterForActiveLayerMask} className="inline-flex h-8 items-center justify-center gap-1.5 border border-red-300/20 text-[7px] font-black uppercase text-red-200 disabled:text-zinc-800"><Trash2 size={9} /> Remove Mask</button>
                  </div>
                ) : activeInpaintMaskLayer ? (
                  <div
                    data-umbra-layer-settings="inpaint-mask"
                    className="mt-2 grid w-full min-w-0 items-end gap-2 border-t border-white/[0.06] pt-2"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 120px), 1fr))' }}
                  >
                    <label className="min-w-0 space-y-1">
                      <span className="block text-[7px] font-black uppercase text-zinc-700">Mask Name</span>
                      <input
                        value={activeInpaintMaskLayer.name}
                        onChange={(event) => dispatchCanvasDocument({ type: 'set_layer_name', layerId: activeInpaintMaskLayer.id, name: event.target.value })}
                        disabled={activeInpaintMaskLayer.locked}
                        className="h-8 w-full min-w-0 border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-200 outline-none focus:border-rose-300/35 disabled:text-zinc-700"
                      />
                    </label>
                    <CanvasMaskOverlayControls
                      layer={activeInpaintMaskLayer}
                      disabled={activeInpaintMaskLayer.locked}
                      onChange={(changes) => dispatchCanvasDocument({ type: 'update_mask_overlay', layerId: activeInpaintMaskLayer.id, changes })}
                    />
                    <button
                      type="button"
                      onClick={() => deleteInpaintMask(activeInpaintMaskLayer.id)}
                      disabled={activeInpaintMaskLayer.locked}
                      title={activeInpaintMaskLayer.locked ? 'Unlock this mask before deleting it' : 'Delete this inpaint mask; Undo restores it'}
                      className="inline-flex h-8 items-center justify-center gap-1.5 border border-red-300/20 text-[7px] font-black uppercase text-red-200 hover:bg-red-500/10 disabled:border-white/[0.06] disabled:text-zinc-800"
                    >
                      <Trash2 size={9} /> Delete Mask
                    </button>
                  </div>
                ) : null}
              </div> : null}
              <div className="min-w-0 bg-[#060a0b] px-3 pb-3 pt-2">
                <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="border-l-2 border-cyan-300/60 pl-2 text-[8px] font-black uppercase tracking-[0.14em] text-cyan-100/80">Generation Staging</span>
                  <span className="font-mono text-[8px] text-zinc-700">{selectedStages.length}/{canvasDocument?.staging.length || 0} selected</span>
                  <div data-umbra-staging-actions="" className="flex w-full max-w-full min-w-0 flex-wrap items-center gap-1 [&>*]:shrink-0">
                    <button type="button" onClick={() => previewStageOffset(-1)} disabled={!canvasDocument?.staging.length} title="Preview previous staged result (Left Arrow)" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><ChevronLeft size={9} /></button>
                    <button type="button" onClick={() => previewStageOffset(1)} disabled={!canvasDocument?.staging.length} title="Preview next staged result (Right Arrow)" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><ChevronRight size={9} /></button>
                    <span className="w-9 text-center font-mono text-[7px] text-zinc-600">{previewStagePosition}/{canvasDocument?.staging.length || 0}</span>
                    <button type="button" onClick={() => canvasDocument?.previewStageId ? dispatchCanvasDocument({ type: 'preview_stage', stageId: '' }) : previewStageOffset(1)} disabled={!canvasDocument?.staging.length} title={canvasDocument?.previewStageId ? 'Hide staged result' : 'Show staged result'} className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800">{canvasDocument?.previewStageId ? <EyeOff size={9} /> : <Eye size={9} />}</button>
                    <button type="button" onClick={() => setSelectedStageIds((canvasDocument?.staging || []).map((stage) => stage.id))} disabled={!canvasDocument?.staging.length} title="Select all staged results" className="inline-flex h-6 w-6 items-center justify-center border border-white/10 text-zinc-500 disabled:text-zinc-800"><BoxSelect size={9} /></button>
                    <button type="button" onClick={() => setCompareStages((value) => !value)} disabled={selectedStages.length < 2} title="Compare the first two selected results" className={cn('inline-flex h-6 w-6 items-center justify-center border disabled:text-zinc-800', compareStages ? 'border-violet-300/35 bg-violet-500/10 text-violet-200' : 'border-white/10 text-zinc-500')}><SquaresIntersect size={9} /></button>
                    <button type="button" onClick={() => void saveStagesToGallery(selectedStages)} disabled={selectedStages.length <= 0 || isSavingStages} title="Save selected staged results to Gallery" className="inline-flex h-6 w-6 items-center justify-center border border-cyan-300/20 text-cyan-200 disabled:text-zinc-800">{isSavingStages ? <Loader2 size={8} className="animate-spin" /> : <Save size={8} />}</button>
                    <button type="button" onClick={() => acceptStages(selectedStageIds, 'replace_region')} disabled={selectedStageIds.length <= 0} title="Accept the selected result" className="inline-flex h-6 items-center gap-1 border border-emerald-300/25 px-2 text-[7px] font-black uppercase text-emerald-200 disabled:text-zinc-800"><Check size={8} /> Accept</button>
                    <button type="button" onClick={() => discardStages(selectedStageIds)} disabled={selectedStageIds.length <= 0} title="Discard selected results" className="inline-flex h-6 w-6 items-center justify-center border border-red-300/20 text-red-200/80 disabled:text-zinc-800"><Trash2 size={8} /></button>
                  </div>
                </div>
                {canvasPreferences.stagingThumbnailsVisible && compareStages && selectedStages.length >= 2 ? (
                  <div className="mb-2 grid h-[110px] grid-cols-2 gap-1.5 border border-violet-300/15 bg-black/30 p-1.5">
                    {selectedStages.slice(0, 2).map((stage, index) => (
                      <button key={stage.id} type="button" onClick={() => dispatchCanvasDocument({ type: 'preview_stage', stageId: stage.id })} className="relative min-w-0 overflow-hidden bg-black" title={`Preview ${stage.name}`}>
                        <img src={stage.asset.imageUrl} alt={`Comparison ${index + 1}`} className="h-full w-full object-contain" />
                        <span className="absolute bottom-1 left-1 border border-white/10 bg-black/80 px-1.5 py-0.5 font-mono text-[7px] text-zinc-200">{index === 0 ? 'A' : 'B'} / {stage.seed}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className={cn('min-h-[110px] flex-col gap-2', canvasPreferences.stagingThumbnailsVisible ? 'flex' : 'hidden')}>
                  {canvasDocument?.staging.map((stage, index) => (
                    <div key={stage.id} className={cn('relative w-full shrink-0 border bg-black/45 p-1.5', canvasDocument.previewStageId === stage.id ? 'border-cyan-300/60' : selectedStageIds.includes(stage.id) ? 'border-violet-300/45' : 'border-white/10')}>
                      <button type="button" onClick={() => dispatchCanvasDocument({ type: 'preview_stage', stageId: stage.id })} className="relative block h-28 w-full overflow-hidden bg-black" title={`${stage.name} - seed ${stage.seed}`}>
                        <img src={stage.asset.imageUrl} alt={`Staged result ${index + 1}`} className="h-full w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-left font-mono text-[7px] text-zinc-200">S{index + 1} / {stage.seed}</span>
                      </button>
                      <button type="button" aria-pressed={selectedStageIds.includes(stage.id)} onClick={() => toggleStageSelection(stage.id)} title={selectedStageIds.includes(stage.id) ? 'Deselect staged result' : 'Select staged result'} className={cn('absolute left-2.5 top-2.5 inline-flex h-4 w-4 items-center justify-center border', selectedStageIds.includes(stage.id) ? 'border-violet-200 bg-violet-500/50 text-white' : 'border-white/20 bg-black/70 text-transparent')}><Check size={8} /></button>
                      <button type="button" aria-pressed={!!stage.pinned} onClick={() => dispatchCanvasDocument({ type: 'toggle_stage_pin', stageId: stage.id })} title={stage.pinned ? 'Unpin staged result' : 'Pin staged result'} className={cn('absolute right-2.5 top-2.5 inline-flex h-4 w-4 items-center justify-center border bg-black/70', stage.pinned ? 'border-amber-200/60 text-amber-200' : 'border-white/20 text-zinc-600')}><Pin size={8} /></button>
                      {stage.gallerySavedAt ? <span title={`Saved to Gallery${stage.galleryPath ? `: ${stage.galleryPath}` : ''}`} className="absolute bottom-[35px] right-2.5 inline-flex h-4 w-4 items-center justify-center border border-cyan-300/35 bg-black/75 text-cyan-200"><Save size={7} /></span> : null}
                      <div className="mt-1.5 grid grid-cols-2 gap-1">
                        <button type="button" onClick={() => acceptStages([stage.id], studioDefaultAcceptMode)} className="inline-flex h-6 items-center justify-center gap-1 border border-emerald-300/25 text-[7px] font-black uppercase text-emerald-200"><Check size={8} /> {studioDefaultAcceptMode === 'new_layer' ? 'Layer' : 'Accept'}</button>
                        <button type="button" onClick={() => discardStages([stage.id])} className="inline-flex h-6 items-center justify-center gap-1 border border-red-300/20 text-[7px] font-black uppercase text-red-200/80"><X size={8} /> Discard</button>
                      </div>
                    </div>
                  ))}
                  {canvasDocument && canvasDocument.staging.length <= 0 ? (
                    <div className="flex min-w-44 items-center justify-center border border-dashed border-white/10 px-3 text-center text-[8px] font-black uppercase tracking-[0.12em] text-zinc-700">Generated samples wait here</div>
                  ) : null}
                </div>
                {!canvasPreferences.stagingThumbnailsVisible ? (
                  <button type="button" onClick={() => setCanvasPreferences((current) => ({ ...current, stagingThumbnailsVisible: true }))} className="flex h-9 w-full items-center justify-center gap-2 border border-dashed border-white/10 font-mono text-[8px] uppercase text-zinc-600 hover:text-cyan-200"><Eye size={9} /> Show {canvasDocument?.staging.length || 0} staged results</button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </main>
      {studioMode ? (
        <UmbraCanvasStudioShelf
          studio={canvasStudio}
          onSelectRegion={applyStudioRegion}
          onCreateRegion={applyStudioRegion}
          artboardActions={{
            busy: !!fullResolutionOperation || isSavingCanvas || isExportingPsd,
            canTransform: !!canvasDocument
              && canvasDocument.staging.length === 0
              && canvasDocument.pendingJobs.length === 0
              && !previewStage,
            backgroundRemovalAvailable,
            detailersEnabled: img2imgDetailerActiveCount > 0,
            detailerActiveCount: img2imgDetailerActiveCount,
            detailerStageCount: img2imgDetailerStageCount,
            overlapCount: studioOverlapArtboards.length,
            onFlipHorizontal: () => void transformCanvasArtboard('flip_horizontal'),
            onFlipVertical: () => void transformCanvasArtboard('flip_vertical'),
            onRotateLeft: () => void transformCanvasArtboard('rotate_left'),
            onRotateRight: () => void transformCanvasArtboard('rotate_right'),
            onRemoveBackground: () => void removeCanvasBackground(),
            onContinueImg2Img: () => void sendCanvasToImg2Img(),
            onStitchOverlaps: () => void stitchOverlappingArtboards(),
            onDetailersEnabledChange: onImg2imgDetailersEnabledChange,
          }}
        />
      ) : null}
      {canvasContextMenu ? (
        <div
          ref={canvasContextMenuRef}
          role="menu"
          aria-label="Inpaint actions"
          className="fixed z-[200] w-56 overflow-y-auto border border-white/15 bg-[#090a0c] p-1.5 shadow-2xl shadow-black/80 custom-scrollbar"
          style={{
            left: canvasContextMenu.x,
            top: canvasContextMenu.y,
            maxHeight: Math.max(160, window.innerHeight - canvasContextMenu.y - 8),
          }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {false ? <>
          <div className="px-2 py-1 font-mono text-[7px] font-black uppercase tracking-[0.14em] text-zinc-700">Canvas</div>
          {studioMode ? <CanvasMenuButton icon={<Combine size={9} />} label={`Stitch ${studioOverlapArtboards.length > 1 ? `${studioOverlapArtboards.length} Overlapping Canvases` : 'Overlaps'}`} disabled={studioOverlapArtboards.length < 2 || !!fullResolutionOperation || studioOverlapArtboards.some((artboard) => artboard.locked)} onClick={() => { setCanvasContextMenu(null); void stitchOverlappingArtboards(); }} /> : null}
          <CanvasMenuButton icon={<Copy size={9} />} label="Copy Canvas" onClick={() => { setCanvasContextMenu(null); void copyCanvasToSystemClipboard(false); }} />
          <CanvasMenuButton icon={<BoxSelect size={9} />} label="Copy Generation Region" disabled={!canvasDocument?.generationRegion} onClick={() => { setCanvasContextMenu(null); void copyCanvasToSystemClipboard(true); }} />
          <CanvasMenuButton icon={<FlipHorizontal2 size={9} />} label="Flip Artboard Horizontally" disabled={!canvasDocument || canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || !!fullResolutionOperation || canvasStudio.activeArtboard?.locked} onClick={() => { setCanvasContextMenu(null); void transformCanvasArtboard('flip_horizontal'); }} />
          <CanvasMenuButton icon={<FlipVertical2 size={9} />} label="Flip Artboard Vertically" disabled={!canvasDocument || canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || !!fullResolutionOperation || canvasStudio.activeArtboard?.locked} onClick={() => { setCanvasContextMenu(null); void transformCanvasArtboard('flip_vertical'); }} />
          <CanvasMenuButton icon={<RotateCcw size={9} />} label="Rotate Artboard Left" disabled={!canvasDocument || canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || !!fullResolutionOperation || canvasStudio.activeArtboard?.locked} onClick={() => { setCanvasContextMenu(null); void transformCanvasArtboard('rotate_left'); }} />
          <CanvasMenuButton icon={<RotateCw size={9} />} label="Rotate Artboard Right" disabled={!canvasDocument || canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || !!fullResolutionOperation || canvasStudio.activeArtboard?.locked} onClick={() => { setCanvasContextMenu(null); void transformCanvasArtboard('rotate_right'); }} />
          <CanvasMenuButton icon={<Scissors size={9} />} label="Create Transparent Character Cutout" disabled={!backgroundRemovalAvailable || !canvasDocument || canvasDocument.staging.length > 0 || canvasDocument.pendingJobs.length > 0 || !!fullResolutionOperation || canvasStudio.activeArtboard?.locked} onClick={() => { setCanvasContextMenu(null); void removeCanvasBackground(); }} />
          <CanvasMenuButton icon={<ClipboardPaste size={9} />} label="Paste to Canvas" onClick={() => { setCanvasContextMenu(null); void pasteSystemClipboardImage(false); }} />
          <CanvasMenuButton icon={<ClipboardPaste size={9} />} label="Paste to Region" disabled={!canvasDocument?.generationRegion} onClick={() => { setCanvasContextMenu(null); void pasteSystemClipboardImage(true); }} />
          <CanvasMenuButton icon={<SquareDashed size={9} />} label="Paste as Inpaint Mask" onClick={() => { setCanvasContextMenu(null); void pasteClipboardAsGuidance('mask'); }} />
          <CanvasMenuButton icon={<SquareDashed size={9} />} label="Fit Region to Masks" onClick={() => { setCanvasContextMenu(null); void fitGenerationRegionToMasks(); }} />
          <CanvasMenuButton icon={<Layers3 size={9} />} label="Fit Region to Visible Layers" onClick={() => { setCanvasContextMenu(null); fitGenerationRegionToVisibleLayers(); }} />
          <CanvasMenuButton icon={<Crop size={9} />} label="Crop Canvas to Region" disabled={!canvasDocument?.generationRegion} onClick={() => { setCanvasContextMenu(null); void cropToGenerationRegion(); }} />
          <CanvasMenuButton icon={<Crop size={9} />} label="Crop Canvas to Visible Content" disabled={!canvasReady || maskProcessing} onClick={() => { setCanvasContextMenu(null); void cropCanvasToVisibleContent(); }} />
          <CanvasMenuButton icon={<Save size={9} />} label="Save Canvas to Gallery" disabled={isSavingCanvas} onClick={() => { setCanvasContextMenu(null); void saveCanvasToGallery(false); }} />
          <CanvasMenuButton icon={<ImagePlus size={9} />} label="Continue in IMG2IMG" disabled={isSavingCanvas || !!fullResolutionOperation || isExportingPsd} onClick={() => { setCanvasContextMenu(null); void sendCanvasToImg2Img(); }} />
          <div className="my-1 h-px bg-white/[0.06]" />
          <div className="px-2 py-1 font-mono text-[7px] font-black uppercase tracking-[0.14em] text-zinc-700">New Layer</div>
          <CanvasMenuButton icon={<SquareDashed size={9} />} label="Inpaint Mask" onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'add_inpaint_mask' }); }} />
          <CanvasMenuButton icon={<FolderPlus size={9} />} label="Layer Group" onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'add_group_layer' }); }} />
          <CanvasMenuButton icon={<Layers3 size={9} />} label="Raster from Region" disabled={!canvasDocument?.generationRegion || !canvasReady} onClick={() => { setCanvasContextMenu(null); void captureGenerationRegionAsRaster(); }} />
          {activeCanvasLayer ? (
            <>
              <div className="my-1 h-px bg-white/[0.06]" />
              <div className="truncate px-2 py-1 font-mono text-[7px] font-black uppercase tracking-[0.14em] text-zinc-700">{activeCanvasLayer.name}</div>
              <CanvasMenuButton icon={activeCanvasLayer.visible ? <EyeOff size={9} /> : <Eye size={9} />} label={activeCanvasLayer.visible ? 'Hide Layer' : 'Show Layer'} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'toggle_layer', layerId: activeCanvasLayer.id }); }} />
              {'enabled' in activeCanvasLayer ? <CanvasMenuButton icon={<Power size={9} />} label={activeCanvasLayer.enabled ? 'Disable for Generation' : 'Enable for Generation'} disabled={activeCanvasLayerMutationLocked} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'toggle_layer_enabled', layerId: activeCanvasLayer.id }); }} /> : null}
              <CanvasMenuButton icon={activeCanvasLayer.locked ? <Unlock size={9} /> : <Lock size={9} />} label={activeCanvasLayerIsSource ? 'Source Is Immutable' : activeCanvasLayer.locked ? 'Unlock Layer' : 'Lock Layer'} disabled={activeCanvasLayerIsSource} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'toggle_layer_lock', layerId: activeCanvasLayer.id }); }} />
              <CanvasMenuButton icon={<Copy size={9} />} label="Duplicate Layer" disabled={activeCanvasLayerMutationLocked || activeCanvasLayer.kind === 'group' || activeCanvasLayerIsProtectedMask} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'duplicate_layer', layerId: activeCanvasLayer.id }); }} />
              <CanvasMenuButton icon={<Maximize2 size={9} />} label={`Fit Layer (${transformFitMode})`} disabled={!activeTransformLayer || activeTransformLayer.locked || activeTransformLayer.kind === 'raster' && activeTransformLayer.role === 'source'} onClick={() => { setCanvasContextMenu(null); void fitActiveLayerToGenerationRegion(transformFitMode); }} />
              <CanvasMenuButton icon={<RotateCcw size={9} />} label="Reset Layer Transform" disabled={!canResetUmbraCanvasLayerTransform(activeTransformLayer)} onClick={() => { setCanvasContextMenu(null); resetActiveLayerTransform(); }} />
              <CanvasMenuButton icon={<Copy size={9} />} label="Copy Layer to Clipboard" onClick={() => { setCanvasContextMenu(null); void copyActiveLayerToSystemClipboard(); }} />
              <CanvasMenuButton icon={<Save size={9} />} label="Save Layer to Gallery" disabled={isSavingCanvas} onClick={() => { setCanvasContextMenu(null); void saveActiveLayerToGallery(); }} />
              {activeRasterLayer ? <CanvasMenuButton icon={<WandSparkles size={9} />} label="Filter Layer" disabled={activeCanvasLayerMutationLocked} onClick={() => { setCanvasContextMenu(null); setRasterFilterLayerId(activeRasterLayer.id); }} /> : null}
              {activeRasterLayer ? <CanvasMenuButton icon={<Maximize2 size={9} />} label="Upscale Layer" disabled={activeCanvasLayerMutationLocked || !comfyConnected || upscaleModels.length <= 0} onClick={() => { setCanvasContextMenu(null); setLayerUpscaleLayerId(activeRasterLayer.id); }} /> : null}
              {activeRasterLayer ? <CanvasMenuButton icon={<Crop size={9} />} label="Crop Layer to Region" disabled={activeCanvasLayerMutationLocked || !canvasDocument?.generationRegion || !canvasReady} onClick={() => { setCanvasContextMenu(null); void cropActiveImageLayerToGenerationRegion(); }} /> : null}
              {activeInpaintMaskLayer ? <CanvasMenuButton icon={<SquareDashed size={9} />} label="Crop Mask to Region" disabled={Boolean(activeInpaintMaskLayer.locked) || !canvasDocument?.generationRegion || !canvasReady} onClick={() => { setCanvasContextMenu(null); void cropActiveMaskToGenerationRegion(); }} /> : null}
              {activeRasterLayer ? <CanvasMenuButton icon={<Crop size={9} />} label="Trim Layer to Content" disabled={activeCanvasLayerMutationLocked || !canvasReady} onClick={() => { setCanvasContextMenu(null); void trimActiveImageLayerToContent(); }} /> : null}
              {activeVisualLayer ? <CanvasMenuButton icon={<Combine size={9} />} label="Merge Layer Down" disabled={activeCanvasLayerMutationLocked || !mergeDownTarget || visualMergeDownMutationLocked || !canvasReady} onClick={() => { setCanvasContextMenu(null); void mergeActiveLayerDown(); }} /> : null}
              {activeInpaintMaskLayer ? <CanvasMenuButton icon={<Combine size={9} />} label="Merge Layer Down" disabled={activeCanvasLayerMutationLocked || !guidanceMergeDownTarget || guidanceMergeDownMutationLocked || !canvasReady} onClick={() => { setCanvasContextMenu(null); void mergeActiveGuidanceDown(); }} /> : null}
              {activeInpaintMaskLayer ? <CanvasMenuButton icon={<Layers3 size={9} />} label="Merge Visible Masks" disabled={visibleGuidanceMergeLayers.length < 2 || visibleGuidanceMergeMutationLocked || !canvasReady} onClick={() => { setCanvasContextMenu(null); void mergeVisibleGuidanceLayers(); }} /> : null}
              {activeVisualLayer ? <CanvasMenuButton icon={<SquareDashed size={9} />} label="Copy to Inpaint Mask" onClick={() => { setCanvasContextMenu(null); void copyActiveVisualToMask(); }} /> : null}
              <CanvasMenuButton icon={<BringToFront size={9} />} label="Move Layer to Front" disabled={activeCanvasLayerMutationLocked} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'move_layer', layerId: activeCanvasLayer.id, direction: 'front' }); }} />
              <CanvasMenuButton icon={<ArrowUp size={9} />} label="Move Layer Up" disabled={activeCanvasLayerMutationLocked} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'move_layer', layerId: activeCanvasLayer.id, direction: 'up' }); }} />
              <CanvasMenuButton icon={<ArrowDown size={9} />} label="Move Layer Down" disabled={activeCanvasLayerMutationLocked} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'move_layer', layerId: activeCanvasLayer.id, direction: 'down' }); }} />
              <CanvasMenuButton icon={<SendToBack size={9} />} label="Move Layer to Back" disabled={activeCanvasLayerMutationLocked} onClick={() => { setCanvasContextMenu(null); dispatchCanvasDocument({ type: 'move_layer', layerId: activeCanvasLayer.id, direction: 'back' }); }} />
              <CanvasMenuButton
                icon={<Trash2 size={9} />}
                label={activeInpaintMaskLayer ? 'Delete Mask' : 'Delete Layer'}
                disabled={activeCanvasLayerMutationLocked || activeCanvasLayerIsProtectedMask}
                onClick={() => {
                  setCanvasContextMenu(null);
                  if (activeInpaintMaskLayer) deleteInpaintMask(activeInpaintMaskLayer.id);
                  else dispatchCanvasDocument({ type: 'remove_layer', layerId: activeCanvasLayer.id });
                }}
              />
            </>
          ) : null}
          </> : <>
            <div className="px-2 py-1 font-mono text-[7px] font-black uppercase tracking-[0.14em] text-zinc-700">Inpaint Image</div>
            <CanvasMenuButton icon={<Copy size={9} />} label="Copy Image" onClick={() => { setCanvasContextMenu(null); void copyCanvasToSystemClipboard(false); }} />
            <CanvasMenuButton icon={<Save size={9} />} label="Save to Gallery" disabled={!source || isSavingCanvas} onClick={() => { setCanvasContextMenu(null); void saveCanvasToGallery(false); }} />
            <CanvasMenuButton icon={<ImagePlus size={9} />} label="Continue in IMG2IMG" disabled={!source || isSavingCanvas || !!fullResolutionOperation} onClick={() => { setCanvasContextMenu(null); void sendCanvasToImg2Img(); }} />
            <div className="my-1 h-px bg-white/[0.06]" />
            <CanvasMenuButton icon={<RotateCcw size={9} />} label="Invert Mask" disabled={!source || maskEditingLocked || maskProcessing} onClick={() => { setCanvasContextMenu(null); invertMask(); }} />
            <CanvasMenuButton icon={<Trash2 size={9} />} label="Clear Mask" disabled={!source || maskEditingLocked || maskProcessing} onClick={() => { setCanvasContextMenu(null); clearMask(); }} />
          </>}
        </div>
      ) : null}
      <UmbraInpaintProjectBrowserModal
        isOpen={projectBrowserOpen}
        projects={projects}
        activeProjectId={canvasDocument?.id}
        onClose={() => setProjectBrowserOpen(false)}
        onOpenProject={(projectId) => openProject(projectId)}
      />
      <UmbraCanvasHotkeyEditor open={hotkeyEditorOpen} actions={CANVAS_HOTKEY_ACTIONS} hotkeys={canvasHotkeys} defaults={DEFAULT_CANVAS_HOTKEYS} onChange={setCanvasHotkeys} onClose={() => setHotkeyEditorOpen(false)} />
      {rasterFilterLayer ? (
        <UmbraRasterFilterDialog
          layer={rasterFilterLayer}
          onClose={() => setRasterFilterLayerId('')}
          onApply={applyRasterFilter}
          comfyConnected={comfyConnected}
          preprocessorOptions={CONTROL_TYPE_OPTIONS.filter((option) => option.value !== 'raw' && controlPreprocessors.includes(option.nodeType)).map((option) => ({
            value: option.value as Exclude<UmbraCanvasControlType, 'raw'>,
            label: option.label,
          }))}
        />
      ) : null}
      {layerUpscaleLayer ? <UmbraLayerUpscaleDialog layer={layerUpscaleLayer} models={upscaleModels} comfyConnected={comfyConnected} onClose={() => setLayerUpscaleLayerId('')} onApply={applyLayerUpscale} /> : null}
    </section>
  );
}

export default UmbraInpaintWorkspace;

function CanvasRegionGeometryControls({
  region,
  onChange,
  onAlign,
  onSwap,
}: {
  region: UmbraCanvasRect;
  onChange: (changes: Partial<UmbraCanvasRect>) => void;
  onAlign: () => void;
  onSwap: () => void;
}) {
  const [draft, setDraft] = React.useState(() => ({
    x: String(Math.round(region.x)),
    y: String(Math.round(region.y)),
    width: String(Math.round(region.width)),
    height: String(Math.round(region.height)),
  }));

  React.useEffect(() => {
    setDraft({
      x: String(Math.round(region.x)),
      y: String(Math.round(region.y)),
      width: String(Math.round(region.width)),
      height: String(Math.round(region.height)),
    });
  }, [region.height, region.width, region.x, region.y]);

  const commit = React.useCallback((key: keyof UmbraCanvasRect) => {
    const numeric = Number(draft[key]);
    if (!Number.isFinite(numeric)) {
      setDraft((current) => ({ ...current, [key]: String(Math.round(region[key])) }));
      return;
    }
    onChange({ [key]: key === 'width' || key === 'height' ? Math.max(1, Math.round(numeric)) : Math.round(numeric) });
  }, [draft, onChange, region]);

  return <div className="space-y-2">
    <div className="flex items-center gap-2">
      <span className="text-[8px] font-black uppercase tracking-[0.12em] text-cyan-200">Generation Region</span>
      <span className="ml-auto font-mono text-[7px] text-zinc-600">exact geometry</span>
    </div>
    <div className="grid grid-cols-2 gap-1.5">
      {(['x', 'y', 'width', 'height'] as const).map((key) => <label key={key} className="space-y-1">
        <span className="block font-mono text-[7px] font-black uppercase text-zinc-600">{key === 'width' ? 'W' : key === 'height' ? 'H' : key.toUpperCase()}</span>
        <input
          type="text"
          inputMode="numeric"
          value={draft[key]}
          onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
          onBlur={() => commit(key)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
            if (event.key === 'Escape') {
              setDraft((current) => ({ ...current, [key]: String(Math.round(region[key])) }));
              event.currentTarget.blur();
            }
          }}
          onFocus={(event) => event.currentTarget.select()}
          className="h-8 w-full border border-white/10 bg-black/35 px-2 font-mono text-[8px] text-zinc-300 outline-none focus:border-cyan-300/35"
        />
      </label>)}
    </div>
    <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.06] pt-2">
      <button type="button" onClick={onAlign} className="inline-flex h-7 items-center justify-center gap-1.5 border border-white/10 font-mono text-[7px] font-black uppercase text-zinc-400 hover:text-cyan-200"><Magnet size={8} /> Align</button>
      <button type="button" onClick={onSwap} className="inline-flex h-7 items-center justify-center gap-1.5 border border-white/10 font-mono text-[7px] font-black uppercase text-zinc-400 hover:text-cyan-200"><ArrowRightLeft size={8} /> Swap W/H</button>
    </div>
  </div>;
}

function CanvasColorPair({
  primary,
  secondary,
  onPrimaryChange,
  onSecondaryChange,
  onSwap,
}: {
  primary: string;
  secondary: string;
  onPrimaryChange: (color: string) => void;
  onSecondaryChange: (color: string) => void;
  onSwap: () => void;
}) {
  return <div className="flex h-7 items-center gap-0.5 border border-white/10 bg-black/30 p-0.5" title="Foreground and background colors">
    <input type="color" value={colorAsHex(primary)} onChange={(event) => onPrimaryChange(event.target.value)} aria-label="Foreground color" className="h-5 w-6 border-0 bg-transparent p-0" />
    <input type="color" value={colorAsHex(secondary)} onChange={(event) => onSecondaryChange(event.target.value)} aria-label="Background color" className="h-5 w-6 border-0 bg-transparent p-0" />
    <button type="button" onClick={onSwap} title="Swap foreground and background colors" className="inline-flex h-5 w-5 items-center justify-center text-zinc-600 hover:text-cyan-200"><ArrowRightLeft size={9} /></button>
  </div>;
}

function CanvasMaskOverlayControls({
  disabled = false,
  layer,
  onChange,
}: {
  disabled?: boolean;
  layer: UmbraCanvasMaskLayer;
  onChange: (changes: Partial<Pick<UmbraCanvasMaskLayer, 'overlayColor' | 'overlayStyle'>>) => void;
}) {
  return <>
    <label className="min-w-0 space-y-1">
      <span className="block text-[7px] font-black uppercase text-zinc-700">Overlay Color</span>
      <input
        type="color"
        value={colorAsHex(layer.overlayColor)}
        onChange={(event) => onChange({ overlayColor: event.target.value })}
        disabled={disabled}
        className="h-8 w-full border border-white/10 bg-black/35 p-1 disabled:opacity-35"
      />
    </label>
    <label className="min-w-0 space-y-1">
      <span className="block text-[7px] font-black uppercase text-zinc-700">Overlay Fill</span>
      <select
        value={layer.overlayStyle}
        onChange={(event) => onChange({ overlayStyle: event.target.value as UmbraCanvasMaskOverlayStyle })}
        disabled={disabled}
        className="h-8 w-full border border-white/10 bg-black/35 px-1.5 font-mono text-[8px] text-zinc-300 outline-none disabled:text-zinc-700"
      >
        {UMBRA_CANVAS_MASK_OVERLAY_STYLES.map((style) => <option key={style} value={style}>{style.replace('_', ' ')}</option>)}
      </select>
    </label>
  </>;
}

function CanvasMenuButton({ disabled = false, icon, label, onClick }: { disabled?: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} disabled={disabled} className="flex h-7 w-full items-center gap-2 px-2 text-left font-mono text-[8px] text-zinc-400 hover:bg-white/[0.04] hover:text-cyan-100 disabled:text-zinc-800">{icon}<span>{label}</span></button>;
}
