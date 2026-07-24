import type {
  UmbraUiInpaintControlAdapterType,
  UmbraUiInpaintControlMode,
  UmbraUiInpaintReferenceMethod,
  UmbraUiIpAdapterCombineEmbeds,
  UmbraUiIpAdapterEmbedsScaling,
  UmbraUiIpAdapterWeightType,
} from '../../../shared/umbra-ui/pipelineTypes';
import { resolveUmbraCanvasInteractiveAllocation } from './umbraUiCanvasPerformance';
import { compileUmbraUiPromptSegments } from './umbraUiPromptSegments';
import type {
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
} from '@/types/powerPrompter';

export const UMBRA_CANVAS_DOCUMENT_VERSION = 19 as const;
export const UMBRA_CANVAS_PROMPT_HISTORY_LIMIT = 100;

export type UmbraCanvasOperationMode = 'inpaint' | 'outpaint';
export type UmbraCanvasProcessingScaleMode = 'none' | 'auto' | 'manual';
export type UmbraCanvasCoherenceMode = 'none' | 'gaussian' | 'box' | 'staged';
export type UmbraCanvasBooleanOperation = 'intersect' | 'cut_out' | 'cut_away' | 'exclude';
export type UmbraCanvasBlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-burn'
  | 'color-dodge'
  | 'soft-light'
  | 'hard-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity';

export const UMBRA_CANVAS_BLEND_MODES: UmbraCanvasBlendMode[] = [
  'source-over',
  'darken',
  'multiply',
  'color-burn',
  'lighten',
  'screen',
  'color-dodge',
  'overlay',
  'soft-light',
  'hard-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];
export type UmbraCanvasLayerKind = 'raster' | 'mask' | 'regional_guidance' | 'control' | 'reference' | 'group' | 'text' | 'gradient';
export const UMBRA_CANVAS_CONTROL_TYPES = [
  'raw',
  'canny',
  'depth',
  'pose',
  'lineart',
  'lineart_anime',
  'softedge',
  'scribble',
  'face_mesh',
  'mlsd',
  'normal_map',
  'pidi',
  'content_shuffle',
] as const;
export type UmbraCanvasControlType = typeof UMBRA_CANVAS_CONTROL_TYPES[number];

const UMBRA_CANVAS_CONTROL_ADAPTER_TYPES: UmbraUiInpaintControlAdapterType[] = [
  'controlnet',
  't2i_adapter',
  'control_lora',
  'z_image_control',
  'anima_lllite',
];
const UMBRA_CANVAS_CONTROL_MODES: UmbraUiInpaintControlMode[] = [
  'balanced',
  'more_prompt',
  'more_control',
  'unbalanced',
];
const UMBRA_CANVAS_REFERENCE_METHODS: UmbraUiInpaintReferenceMethod[] = [
  'style_model',
  'ip_adapter',
  'flux_redux',
  'flux_kontext',
  'flux2_reference',
  'qwen_image_reference',
  'hidream_o1_reference',
];
const UMBRA_IP_ADAPTER_WEIGHT_TYPES: UmbraUiIpAdapterWeightType[] = [
  'linear', 'ease in', 'ease out', 'ease in-out', 'reverse in-out', 'weak input', 'weak output', 'weak middle',
  'strong middle', 'style transfer', 'composition', 'strong style transfer', 'style and composition',
  'style transfer precise', 'composition precise',
];
const UMBRA_IP_ADAPTER_COMBINE_EMBEDS: UmbraUiIpAdapterCombineEmbeds[] = [
  'concat', 'add', 'subtract', 'average', 'norm average',
];
const UMBRA_IP_ADAPTER_EMBEDS_SCALING: UmbraUiIpAdapterEmbedsScaling[] = [
  'V only', 'K+V', 'K+V w/ C penalty', 'K+mean(V) w/ C penalty',
];

export interface UmbraCanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type UmbraCanvasFitMode = 'contain' | 'cover' | 'fill';

export interface UmbraCanvasImageAsset {
  id: string;
  name: string;
  path: string;
  imageUrl: string;
  width: number;
  height: number;
  objectUrl?: boolean;
  seed?: number;
}

export interface UmbraCanvasLayerBase {
  id: string;
  kind: UmbraCanvasLayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: UmbraCanvasBlendMode;
  groupId?: string;
  transform: UmbraCanvasRect & {
    rotation: number;
    scaleX: number;
    scaleY: number;
  };
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasRasterLayer extends UmbraCanvasLayerBase {
  kind: 'raster';
  role: 'source' | 'generated' | 'paint' | 'imported' | 'cutout';
  asset: UmbraCanvasImageAsset;
  maskLayerId?: string;
  smoothing: 'none' | 'low' | 'medium' | 'high';
  transparencyLocked: boolean;
  adjustments: {
    enabled: boolean;
    mode: 'simple' | 'curves';
    brightness: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
    sharpness: number;
    curves: UmbraCanvasCurves;
  };
}

export type UmbraCanvasCurveChannel = 'master' | 'r' | 'g' | 'b';
export type UmbraCanvasCurvePoint = [number, number];
export type UmbraCanvasCurves = Record<UmbraCanvasCurveChannel, UmbraCanvasCurvePoint[]>;

export interface UmbraCanvasMaskLayer extends UmbraCanvasLayerBase {
  kind: 'mask';
  enabled: boolean;
  purpose: 'inpaint' | 'regional_guidance' | 'reference' | 'layer';
  dataUrl: string;
  frozen: boolean;
  noiseLevel: number;
  denoiseLimit: number;
  overlayColor: string;
  overlayStyle: UmbraCanvasMaskOverlayStyle;
}

export const UMBRA_CANVAS_MASK_OVERLAY_STYLES = ['solid', 'grid', 'crosshatch', 'diagonal', 'horizontal', 'vertical'] as const;
export type UmbraCanvasMaskOverlayStyle = typeof UMBRA_CANVAS_MASK_OVERLAY_STYLES[number];

export interface UmbraCanvasRegionalGuidanceLayer extends UmbraCanvasLayerBase {
  kind: 'regional_guidance';
  enabled: boolean;
  maskLayerId: string;
  positivePrompt: string;
  negativePrompt: string;
  autoNegative: boolean;
  weight: number;
  beginStepPercent: number;
  endStepPercent: number;
}

export interface UmbraCanvasControlLayer extends UmbraCanvasLayerBase {
  kind: 'control';
  enabled: boolean;
  lightnessToAlpha: boolean;
  asset: UmbraCanvasImageAsset;
  adapterType: UmbraUiInpaintControlAdapterType;
  controlMode: UmbraUiInpaintControlMode;
  controlType: UmbraCanvasControlType;
  modelName: string;
  weight: number;
  beginStepPercent: number;
  endStepPercent: number;
  processorResolution: number;
  lowThreshold: number;
  highThreshold: number;
  detectBody: boolean;
  detectFace: boolean;
  detectHands: boolean;
  maxFaces: number;
  minimumConfidence: number;
  scoreThreshold: number;
  distanceThreshold: number;
  normalStrength: number;
  backgroundThreshold: number;
  safeMode: boolean;
  processorSeed: number;
}

export interface UmbraCanvasReferenceLayer extends UmbraCanvasLayerBase {
  kind: 'reference';
  enabled: boolean;
  asset: UmbraCanvasImageAsset;
  method: UmbraUiInpaintReferenceMethod;
  modelName: string;
  visionModelName: string;
  crop: 'center' | 'none';
  strengthType: 'multiply' | 'attn_bias';
  weight: number;
  beginStepPercent: number;
  endStepPercent: number;
  ipAdapterWeightType: UmbraUiIpAdapterWeightType;
  ipAdapterCombineEmbeds: UmbraUiIpAdapterCombineEmbeds;
  ipAdapterEmbedsScaling: UmbraUiIpAdapterEmbedsScaling;
  maskLayerId?: string;
  regionLayerId?: string;
}

export interface UmbraCanvasGroupLayer extends UmbraCanvasLayerBase {
  kind: 'group';
  collapsed: boolean;
}

export interface UmbraCanvasTextLayer extends UmbraCanvasLayerBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  color: string;
  backgroundColor: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface UmbraCanvasGradientStop {
  offset: number;
  color: string;
}

export interface UmbraCanvasGradientLayer extends UmbraCanvasLayerBase {
  kind: 'gradient';
  gradientType: 'linear' | 'radial';
  angle: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  centerX: number;
  centerY: number;
  radius: number;
  clipEnabled: boolean;
  stops: UmbraCanvasGradientStop[];
}

export type UmbraCanvasLayer =
  | UmbraCanvasRasterLayer
  | UmbraCanvasMaskLayer
  | UmbraCanvasRegionalGuidanceLayer
  | UmbraCanvasControlLayer
  | UmbraCanvasReferenceLayer
  | UmbraCanvasGroupLayer
  | UmbraCanvasTextLayer
  | UmbraCanvasGradientLayer;

export interface UmbraCanvasStage {
  id: string;
  jobId: string;
  itemId: string;
  name: string;
  asset: UmbraCanvasImageAsset;
  seed: number;
  region: UmbraCanvasRect;
  maskDataUrl: string;
  createdAt: number;
  pinned?: boolean;
  galleryPath?: string;
  gallerySavedAt?: number;
}

export interface UmbraCanvasPendingJob {
  id: string;
  region: UmbraCanvasRect;
  maskDataUrl: string;
  createdAt: number;
}

export interface UmbraCanvasPromptHistoryEntry {
  id: string;
  promptSegments: Array<{ id: string; text: string }>;
  negativePrompt: string;
  createdAt: number;
}

export interface UmbraCanvasGenerationSettings {
  modelFamily: string;
  modelSource: string;
  checkpointName: string;
  loras: Array<{
    id: string;
    name: string;
    modelFamilyKey?: string;
    enabled: boolean;
    strengthModel: number;
    strengthClip: number;
    trainedTags: string[];
  }>;
  promptSegments: Array<{ id: string; text: string }>;
  activePromptSegmentId: string;
  negativePrompt: string;
  promptHistory: UmbraCanvasPromptHistoryEntry[];
  clipSkip: string;
  seed: string;
  seedMode: PowerPrompterSeedControlMode;
  seedIncrement: PowerPrompterSeedIncrement;
  steps: string;
  cfg: string;
  samplerName: string;
  scheduler: string;
  samples: number;
  denoise: number;
  maskGrow: number;
  maskFeather: number;
  contextPadding: number;
  processingScaleMode: UmbraCanvasProcessingScaleMode;
  processingWidth: number;
  processingHeight: number;
  coherenceMode: UmbraCanvasCoherenceMode;
  coherenceEdgeSize: number;
  coherenceMinimumDenoise: number;
  seamlessX: boolean;
  seamlessY: boolean;
  outputOnlyMaskedRegions: boolean;
  fillMode: 'neutral' | 'telea' | 'navier-stokes' | 'color' | 'tile' | 'lama';
  infillColor: string;
  infillTileSize: number;
  inpaintModelName: string;
  colorMatch: number;
  differentialStrength: number;
  softInpaintEnabled: boolean;
  softInpaintPreservation: number;
  softInpaintTransitionContrast: number;
  softInpaintMaskInfluence: number;
}

export interface UmbraCanvasDocument {
  version: typeof UMBRA_CANVAS_DOCUMENT_VERSION;
  id: string;
  name: string;
  width: number;
  height: number;
  operationMode: UmbraCanvasOperationMode;
  layers: UmbraCanvasLayer[];
  staging: UmbraCanvasStage[];
  pendingJobs: UmbraCanvasPendingJob[];
  generation: UmbraCanvasGenerationSettings;
  activeLayerId: string;
  activeMaskLayerId: string;
  bookmarkedLayerId: string;
  previewStageId: string;
  generationRegion: UmbraCanvasRect | null;
  generationRegionAspectRatio: number;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type UmbraCanvasDocumentState = UmbraCanvasDocument | null;

export type UmbraCanvasDocumentAction =
  | { type: 'load_source'; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'replace_document'; document: UmbraCanvasDocument }
  | { type: 'set_document_name'; name: string }
  | { type: 'set_operation_mode'; mode: UmbraCanvasOperationMode }
  | { type: 'set_generation_settings'; generation: UmbraCanvasGenerationSettings }
  | { type: 'set_generation_region'; region: UmbraCanvasRect | null }
  | { type: 'set_generation_region_aspect_ratio'; ratio: number }
  | { type: 'swap_generation_region_dimensions' }
  | {
      type: 'transform_canvas';
      operation: 'flip_horizontal' | 'flip_vertical' | 'rotate_left' | 'rotate_right';
      maskSnapshots?: Array<{ layerId: string; dataUrl: string }>;
    }
  | { type: 'resize_canvas'; width: number; height: number; translateX: number; translateY: number; clearGenerationRegion?: boolean }
  | { type: 'resample_canvas'; width: number; height: number; sourceRect: UmbraCanvasRect }
  | { type: 'set_mask_snapshot'; dataUrl: string }
  | { type: 'set_mask_layer_snapshot'; layerId: string; dataUrl: string }
  | { type: 'crop_mask_to_region'; layerId: string; dataUrl: string }
  | { type: 'bake_inpaint_mask_transform'; layerId: string; dataUrl: string }
  | { type: 'update_inpaint_mask'; layerId: string; changes: Partial<Pick<UmbraCanvasMaskLayer, 'noiseLevel' | 'denoiseLimit'>> }
  | { type: 'update_mask_overlay'; layerId: string; changes: Partial<Pick<UmbraCanvasMaskLayer, 'overlayColor' | 'overlayStyle'>> }
  | { type: 'track_pending_job'; job: UmbraCanvasPendingJob }
  | { type: 'remove_pending_job'; jobId: string }
  | { type: 'stage_outputs'; stages: UmbraCanvasStage[]; previewStageId?: string }
  | { type: 'mark_stages_gallery_saved'; receipts: Array<{ stageId: string; path: string; savedAt: number }> }
  | { type: 'toggle_stage_pin'; stageId: string }
  | { type: 'preview_stage'; stageId: string }
  | { type: 'discard_stage'; stageId: string }
  | { type: 'discard_stages'; stageIds: string[] }
  | { type: 'accept_stage'; stageId: string; mode?: 'replace_region' | 'new_layer'; preserveMask?: boolean }
  | { type: 'accept_stages'; stageIds: string[]; mode?: 'replace_region' | 'new_layer'; preserveMask?: boolean }
  | { type: 'add_inpaint_mask'; name?: string; dataUrl?: string }
  | { type: 'add_layer_mask'; rasterLayerId: string; dataUrl: string; name?: string }
  | { type: 'detach_layer_mask'; rasterLayerId: string }
  | { type: 'set_active_mask'; layerId: string }
  | { type: 'select_layer'; layerId: string }
  | { type: 'set_bookmarked_layer'; layerId: string }
  | { type: 'toggle_layer'; layerId: string }
  | { type: 'toggle_layer_enabled'; layerId: string }
  | { type: 'toggle_layer_lock'; layerId: string }
  | { type: 'set_layer_opacity'; layerId: string; opacity: number }
  | { type: 'set_layer_blend_mode'; layerId: string; blendMode: UmbraCanvasBlendMode }
  | { type: 'set_layer_transform'; layerId: string; transform: Partial<UmbraCanvasLayerBase['transform']> }
  | { type: 'reset_layer_transform'; layerId: string }
  | { type: 'set_layers_transforms'; transforms: Array<{ layerId: string; transform: Partial<UmbraCanvasLayerBase['transform']> }> }
  | { type: 'set_raster_smoothing'; layerId: string; smoothing: UmbraCanvasRasterLayer['smoothing'] }
  | { type: 'set_raster_transparency_lock'; layerId: string; locked: boolean }
  | { type: 'update_raster_adjustments'; layerId: string; changes: Partial<UmbraCanvasRasterLayer['adjustments']> }
  | { type: 'set_layer_name'; layerId: string; name: string }
  | { type: 'add_raster_layer'; asset: UmbraCanvasImageAsset; name: string; role?: UmbraCanvasRasterLayer['role']; transform?: Partial<UmbraCanvasLayerBase['transform']> }
  | { type: 'add_cutout_layer'; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'replace_source_asset'; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'replace_raster_asset'; layerId: string; asset: UmbraCanvasImageAsset }
  | { type: 'apply_raster_filter'; layerId: string; asset: UmbraCanvasImageAsset; transform: UmbraCanvasLayerBase['transform']; name?: string }
  | { type: 'apply_control_filter'; layerId: string; asset: UmbraCanvasImageAsset; transform: UmbraCanvasLayerBase['transform']; name?: string; resetPreprocessor?: boolean }
  | { type: 'merge_down'; upperLayerId: string; lowerLayerId: string; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'merge_control_down'; upperLayerId: string; lowerLayerId: string; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'merge_inpaint_masks_down'; upperLayerId: string; lowerLayerId: string; dataUrl: string; name?: string }
  | { type: 'merge_regional_guidance_down'; upperLayerId: string; lowerLayerId: string; dataUrl: string; name?: string }
  | { type: 'merge_visible_controls'; layerIds: string[]; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'merge_visible_inpaint_masks'; layerIds: string[]; dataUrl: string; name?: string }
  | { type: 'merge_visible_regional_guidance'; layerIds: string[]; dataUrl: string; name?: string }
  | { type: 'boolean_raster_layers'; lowerLayerId: string; upperLayerId: string; operation: UmbraCanvasBooleanOperation; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'group_layers'; layerIds: string[]; name?: string }
  | { type: 'merge_selected'; layerIds: string[]; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'merge_group'; groupId: string; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'flatten_visible'; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'add_regional_guidance'; dataUrl: string; name?: string; positivePrompt?: string; negativePrompt?: string; autoNegative?: boolean }
  | { type: 'update_regional_guidance'; layerId: string; changes: Partial<Pick<UmbraCanvasRegionalGuidanceLayer, 'positivePrompt' | 'negativePrompt' | 'autoNegative' | 'weight' | 'beginStepPercent' | 'endStepPercent'>> }
  | { type: 'add_control_layer'; asset: UmbraCanvasImageAsset; name?: string; modelName?: string; controlType?: UmbraCanvasControlType; adapterType?: UmbraUiInpaintControlAdapterType; controlMode?: UmbraUiInpaintControlMode; transform?: Partial<UmbraCanvasLayerBase['transform']> }
  | { type: 'update_control_layer'; layerId: string; changes: Partial<Pick<UmbraCanvasControlLayer, 'adapterType' | 'controlMode' | 'controlType' | 'modelName' | 'weight' | 'beginStepPercent' | 'endStepPercent' | 'processorResolution' | 'lowThreshold' | 'highThreshold' | 'detectBody' | 'detectFace' | 'detectHands' | 'maxFaces' | 'minimumConfidence' | 'scoreThreshold' | 'distanceThreshold' | 'normalStrength' | 'backgroundThreshold' | 'safeMode' | 'processorSeed' | 'lightnessToAlpha'>> }
  | { type: 'bake_control_preprocessor'; layerId: string; asset: UmbraCanvasImageAsset; name?: string }
  | { type: 'convert_raster_to_control'; layerId: string; asset: UmbraCanvasImageAsset; name?: string; modelName?: string; adapterType?: UmbraUiInpaintControlAdapterType; controlMode?: UmbraUiInpaintControlMode }
  | { type: 'convert_control_to_raster'; layerId: string; name?: string }
  | { type: 'convert_layer_to_inpaint_mask'; layerId: string; dataUrl: string; name?: string }
  | { type: 'convert_layer_to_regional_guidance'; layerId: string; dataUrl: string; name?: string }
  | { type: 'convert_inpaint_mask_to_regional_guidance'; layerId: string; name?: string }
  | { type: 'convert_regional_guidance_to_inpaint_mask'; layerId: string; name?: string }
  | { type: 'add_reference_layer'; asset: UmbraCanvasImageAsset; name?: string; modelName?: string; visionModelName?: string; method?: UmbraUiInpaintReferenceMethod; transform?: Partial<UmbraCanvasLayerBase['transform']> }
  | { type: 'add_regional_reference_layer'; asset: UmbraCanvasImageAsset; regionDataUrl: string; name?: string; modelName?: string; visionModelName?: string; transform?: Partial<UmbraCanvasLayerBase['transform']> }
  | { type: 'replace_reference_asset'; layerId: string; asset: UmbraCanvasImageAsset; transform: UmbraCanvasLayerBase['transform']; name?: string }
  | { type: 'update_reference_layer'; layerId: string; changes: Partial<Pick<UmbraCanvasReferenceLayer, 'method' | 'modelName' | 'visionModelName' | 'crop' | 'strengthType' | 'weight' | 'beginStepPercent' | 'endStepPercent' | 'ipAdapterWeightType' | 'ipAdapterCombineEmbeds' | 'ipAdapterEmbedsScaling'>> }
  | { type: 'attach_reference_mask'; layerId: string; dataUrl: string; name?: string }
  | { type: 'link_reference_region'; layerId: string; regionLayerId: string }
  | { type: 'detach_reference_mask'; layerId: string }
  | { type: 'add_group_layer'; name?: string }
  | { type: 'toggle_group_collapsed'; layerId: string }
  | { type: 'set_layer_group'; layerId: string; groupId: string }
  | { type: 'add_text_layer'; text?: string; name?: string; transform?: Partial<UmbraCanvasLayerBase['transform']> }
  | { type: 'update_text_layer'; layerId: string; changes: Partial<Pick<UmbraCanvasTextLayer, 'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'italic' | 'underline' | 'strikethrough' | 'color' | 'backgroundColor' | 'align' | 'lineHeight'>> }
  | { type: 'add_gradient_layer'; gradientType?: UmbraCanvasGradientLayer['gradientType']; name?: string; stops?: UmbraCanvasGradientStop[] }
  | { type: 'update_gradient_layer'; layerId: string; changes: Partial<Pick<UmbraCanvasGradientLayer, 'gradientType' | 'angle' | 'startX' | 'startY' | 'endX' | 'endY' | 'centerX' | 'centerY' | 'radius' | 'clipEnabled' | 'stops'>> }
  | { type: 'move_layer'; layerId: string; direction: 'up' | 'down' | 'front' | 'back' }
  | { type: 'reorder_layer'; layerId: string; targetLayerId: string; placement: 'before' | 'after' }
  | { type: 'duplicate_layer'; layerId: string }
  | { type: 'remove_layer'; layerId: string };

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function normalizeRotation(value: number): number {
  const normalized = ((Number(value) || 0) % 360 + 360) % 360;
  return normalized > 180 ? normalized - 360 : normalized;
}

function defaultMaskOverlayColor(purpose: UmbraCanvasMaskLayer['purpose']): string {
  if (purpose === 'regional_guidance') return '#a855f7';
  if (purpose === 'reference') return '#22d3ee';
  if (purpose === 'layer') return '#ffffff';
  return '#ff304c';
}

function normalizeMaskOverlayColor(value: unknown, purpose: UmbraCanvasMaskLayer['purpose']): string {
  const normalized = String(value || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : defaultMaskOverlayColor(purpose);
}

function normalizeMaskOverlayStyle(value: unknown): UmbraCanvasMaskOverlayStyle {
  return UMBRA_CANVAS_MASK_OVERLAY_STYLES.includes(value as UmbraCanvasMaskOverlayStyle)
    ? value as UmbraCanvasMaskOverlayStyle
    : 'solid';
}

function gradientEndpointsFromAngle(angle: number, width: number, height: number): Pick<UmbraCanvasGradientLayer, 'startX' | 'startY' | 'endX' | 'endY'> {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const radians = ((Number(angle) || 0) * Math.PI) / 180;
  const extent = Math.hypot(safeWidth, safeHeight) / 2;
  const normalizedX = (Math.cos(radians) * extent) / safeWidth;
  const normalizedY = (Math.sin(radians) * extent) / safeHeight;
  return {
    startX: 0.5 - normalizedX,
    startY: 0.5 - normalizedY,
    endX: 0.5 + normalizedX,
    endY: 0.5 + normalizedY,
  };
}

function isVisualCanvasLayer(
  layer: UmbraCanvasLayer,
): layer is UmbraCanvasRasterLayer | UmbraCanvasTextLayer | UmbraCanvasGradientLayer {
  return layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient';
}

function isImmutableSourceLayer(layer: UmbraCanvasLayer | null | undefined): layer is UmbraCanvasRasterLayer {
  return layer?.kind === 'raster' && layer.role === 'source';
}

function isLayerProtectedFromMutation(layer: UmbraCanvasLayer | null | undefined): boolean {
  return !!layer && (layer.locked || isImmutableSourceLayer(layer));
}

function hasProtectedLayer(document: UmbraCanvasDocument, layerIds: Iterable<string>, allowSource = false): boolean {
  const requestedIds = new Set(layerIds);
  return document.layers.some((layer) => (
    requestedIds.has(layer.id)
    && isLayerProtectedFromMutation(layer)
    && !(allowSource && isImmutableSourceLayer(layer))
  ));
}

function shouldRejectProtectedLayerMutation(
  document: UmbraCanvasDocument,
  action: UmbraCanvasDocumentAction,
): boolean {
  switch (action.type) {
    case 'set_mask_layer_snapshot':
    case 'crop_mask_to_region':
    case 'bake_inpaint_mask_transform':
    case 'update_inpaint_mask':
    case 'update_mask_overlay':
    case 'toggle_layer_enabled':
    case 'set_layer_opacity':
    case 'set_layer_blend_mode':
    case 'set_layer_transform':
    case 'reset_layer_transform':
    case 'set_raster_smoothing':
    case 'set_raster_transparency_lock':
    case 'update_raster_adjustments':
    case 'set_layer_name':
    case 'replace_raster_asset':
    case 'apply_raster_filter':
    case 'apply_control_filter':
    case 'update_regional_guidance':
    case 'update_control_layer':
    case 'bake_control_preprocessor':
    case 'convert_raster_to_control':
    case 'convert_control_to_raster':
    case 'convert_layer_to_inpaint_mask':
    case 'convert_layer_to_regional_guidance':
    case 'convert_inpaint_mask_to_regional_guidance':
    case 'convert_regional_guidance_to_inpaint_mask':
    case 'replace_reference_asset':
    case 'update_reference_layer':
    case 'attach_reference_mask':
    case 'link_reference_region':
    case 'detach_reference_mask':
    case 'set_layer_group':
    case 'update_text_layer':
    case 'update_gradient_layer':
    case 'move_layer':
    case 'reorder_layer':
    case 'duplicate_layer':
    case 'remove_layer':
      return isLayerProtectedFromMutation(document.layers.find((layer) => layer.id === action.layerId));
    case 'set_mask_snapshot':
      return isLayerProtectedFromMutation(document.layers.find((layer) => layer.id === document.activeMaskLayerId));
    case 'add_layer_mask':
    case 'detach_layer_mask':
      return isLayerProtectedFromMutation(document.layers.find((layer) => layer.id === action.rasterLayerId));
    case 'merge_down': {
      const upper = document.layers.find((layer) => layer.id === action.upperLayerId);
      const lower = document.layers.find((layer) => layer.id === action.lowerLayerId);
      return isLayerProtectedFromMutation(upper)
        || (isLayerProtectedFromMutation(lower) && !isImmutableSourceLayer(lower));
    }
    case 'merge_control_down':
    case 'merge_inpaint_masks_down':
    case 'merge_regional_guidance_down':
      return hasProtectedLayer(document, [action.upperLayerId, action.lowerLayerId]);
    case 'merge_visible_controls':
    case 'merge_visible_inpaint_masks':
    case 'merge_visible_regional_guidance':
      return hasProtectedLayer(document, action.layerIds);
    case 'group_layers':
      return document.layers.some((layer) => (
        action.layerIds.includes(layer.id)
        && !isImmutableSourceLayer(layer)
        && isLayerProtectedFromMutation(layer)
      ));
    case 'merge_selected':
      return hasProtectedLayer(document, action.layerIds, true);
    case 'merge_group': {
      const group = document.layers.find((layer) => layer.id === action.groupId);
      if (isLayerProtectedFromMutation(group)) return true;
      return document.layers.some((layer) => layer.groupId === action.groupId && isLayerProtectedFromMutation(layer));
    }
    default:
      return false;
  }
}

function enforceImmutableSourceLock(document: UmbraCanvasDocument): UmbraCanvasDocument {
  let changed = false;
  const layers = document.layers.map((layer) => {
    if (!isImmutableSourceLayer(layer) || layer.locked) return layer;
    changed = true;
    return { ...layer, locked: true };
  }) as UmbraCanvasLayer[];
  return changed ? { ...document, layers } : document;
}

function isEffectivelyVisibleVisualLayer(document: UmbraCanvasDocument, layer: UmbraCanvasLayer): boolean {
  if (!isVisualCanvasLayer(layer) || !layer.visible) return false;
  if (!layer.groupId) return true;
  const group = document.layers.find((candidate) => candidate.id === layer.groupId && candidate.kind === 'group');
  return group?.visible !== false;
}

function normalizeRect(rect: UmbraCanvasRect, width: number, height: number): UmbraCanvasRect {
  const x = clamp(Math.round(rect.x), 0, Math.max(0, width - 1));
  const y = clamp(Math.round(rect.y), 0, Math.max(0, height - 1));
  return {
    x,
    y,
    width: clamp(Math.round(rect.width), 1, Math.max(1, width - x)),
    height: clamp(Math.round(rect.height), 1, Math.max(1, height - y)),
  };
}

export function fitUmbraCanvasRectToAspectRatio(
  rect: UmbraCanvasRect,
  canvasWidth: number,
  canvasHeight: number,
  ratioInput: number,
): UmbraCanvasRect {
  const normalized = normalizeRect(rect, canvasWidth, canvasHeight);
  const ratio = clamp(Number(ratioInput) || 0, 0, 32);
  if (ratio <= 0) return normalized;
  const area = Math.max(1, normalized.width * normalized.height);
  let width = Math.sqrt(area * ratio);
  let height = width / ratio;
  const scale = Math.min(1, canvasWidth / Math.max(1, width), canvasHeight / Math.max(1, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));
  const centerX = normalized.x + normalized.width / 2;
  const centerY = normalized.y + normalized.height / 2;
  return normalizeRect({
    x: Math.round(centerX - width / 2),
    y: Math.round(centerY - height / 2),
    width,
    height,
  }, canvasWidth, canvasHeight);
}

export function fitUmbraCanvasTransformToRect(
  transform: UmbraCanvasLayerBase['transform'],
  target: UmbraCanvasRect,
  mode: UmbraCanvasFitMode,
): UmbraCanvasLayerBase['transform'] {
  const targetWidth = Math.max(1, Number(target.width) || 1);
  const targetHeight = Math.max(1, Number(target.height) || 1);
  const sourceWidth = Math.max(1, Math.abs((Number(transform.width) || 1) * (Number(transform.scaleX) || 1)));
  const sourceHeight = Math.max(1, Math.abs((Number(transform.height) || 1) * (Number(transform.scaleY) || 1)));
  let width = targetWidth;
  let height = targetHeight;
  if (mode !== 'fill') {
    const scale = mode === 'cover'
      ? Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight)
      : Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    width = sourceWidth * scale;
    height = sourceHeight * scale;
  }
  return {
    x: Number(target.x) + (targetWidth - width) / 2,
    y: Number(target.y) + (targetHeight - height) / 2,
    width,
    height,
    rotation: 0,
    scaleX: Number(transform.scaleX) < 0 ? -1 : 1,
    scaleY: Number(transform.scaleY) < 0 ? -1 : 1,
  };
}

export function canResetUmbraCanvasLayerTransform(layer: UmbraCanvasLayer | null | undefined): boolean {
  if (!layer || layer.locked || layer.kind === 'group') return false;
  if (layer.kind === 'raster' && layer.role === 'source') return false;
  return layer.kind === 'raster'
    || layer.kind === 'control'
    || layer.kind === 'reference'
    || layer.kind === 'text'
    || layer.kind === 'gradient';
}

function resetUmbraCanvasLayerTransform(layer: UmbraCanvasLayer): UmbraCanvasLayerBase['transform'] {
  const centerX = layer.transform.x + layer.transform.width / 2;
  const centerY = layer.transform.y + layer.transform.height / 2;
  const asset = layer.kind === 'raster' || layer.kind === 'control' || layer.kind === 'reference'
    ? layer.asset
    : null;
  const width = Math.max(1, Number(asset?.width) || layer.transform.width || 1);
  const height = Math.max(1, Number(asset?.height) || layer.transform.height || 1);
  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
  };
}

function normalizePromptHistorySegments(value: unknown, entryIndex: number): Array<{ id: string; text: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((segment: Record<string, any>, segmentIndex: number) => ({
      id: String(segment?.id || `umbra-history-${entryIndex + 1}-prompt-${segmentIndex + 1}`),
      text: String(segment?.text || '').trim(),
    }))
    .filter((segment) => !!segment.text)
    .slice(0, 24);
}

function promptHistoryEntryKey(
  promptSegments: Array<{ id: string; text: string }>,
  negativePrompt: string,
): string {
  return `${compileUmbraUiPromptSegments(promptSegments).toLowerCase()}\n${String(negativePrompt || '').replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

function normalizePromptHistory(value: unknown): UmbraCanvasPromptHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const candidates = value
    .map((entry: Record<string, any>, index: number) => {
      const promptSegments = normalizePromptHistorySegments(entry?.promptSegments, index);
      const negativePrompt = String(entry?.negativePrompt || '').trim();
      return {
        id: String(entry?.id || '').trim(),
        promptSegments,
        negativePrompt,
        createdAt: Math.max(0, Number(entry?.createdAt) || 0),
        index,
        key: promptHistoryEntryKey(promptSegments, negativePrompt),
      };
    })
    .filter((entry) => !!compileUmbraUiPromptSegments(entry.promptSegments))
    .sort((left, right) => right.createdAt - left.createdAt || left.index - right.index);
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const normalized: UmbraCanvasPromptHistoryEntry[] = [];
  for (const candidate of candidates) {
    if (seenKeys.has(candidate.key)) continue;
    seenKeys.add(candidate.key);
    let id = candidate.id || `umbra-prompt-history-${candidate.createdAt || candidate.index + 1}`;
    if (seenIds.has(id)) id = `${id}-${candidate.index + 1}`;
    seenIds.add(id);
    normalized.push({
      id,
      promptSegments: candidate.promptSegments,
      negativePrompt: candidate.negativePrompt,
      createdAt: candidate.createdAt,
    });
    if (normalized.length >= UMBRA_CANVAS_PROMPT_HISTORY_LIMIT) break;
  }
  return normalized;
}

export function recordUmbraCanvasPromptHistory(
  history: readonly UmbraCanvasPromptHistoryEntry[] | undefined,
  promptSegments: Array<{ id: string; text: string }>,
  negativePrompt: string,
  createdAt = Date.now(),
): UmbraCanvasPromptHistoryEntry[] {
  const normalizedSegments = normalizePromptHistorySegments(promptSegments, 0);
  if (!compileUmbraUiPromptSegments(normalizedSegments)) return normalizePromptHistory(history);
  const entry: UmbraCanvasPromptHistoryEntry = {
    id: createId('canvas-prompt-history'),
    promptSegments: normalizedSegments,
    negativePrompt: String(negativePrompt || '').trim(),
    createdAt: Math.max(0, Number(createdAt) || Date.now()),
  };
  return normalizePromptHistory([entry, ...(history || [])]);
}

function normalizeGenerationSettings(value: unknown): UmbraCanvasGenerationSettings {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
  const promptSegments = Array.isArray(source.promptSegments)
    ? source.promptSegments.map((segment: Record<string, any>, index: number) => ({
      id: String(segment?.id || `umbra-prompt-${index + 1}`),
      text: String(segment?.text || ''),
    }))
    : [];
  const loras = Array.isArray(source.loras) ? source.loras.map((lora: Record<string, any>, index: number) => ({
    id: String(lora?.id || `umbra-ui-lora-${index + 1}`),
    name: String(lora?.name || '').trim().replace(/\\/g, '/'),
    ...(String(lora?.modelFamilyKey || '').trim() ? { modelFamilyKey: String(lora.modelFamilyKey).trim().toLowerCase() } : {}),
    enabled: lora?.enabled !== false,
    strengthModel: clamp(lora?.strengthModel ?? 1, -10, 10),
    strengthClip: clamp(lora?.strengthClip ?? lora?.strengthModel ?? 1, -10, 10),
    trainedTags: Array.isArray(lora?.trainedTags) ? lora.trainedTags.map((tag: unknown) => String(tag || '').trim()).filter(Boolean) : [],
  })).filter((lora: { name: string }) => !!lora.name) : [];
  const fillMode = source.fillMode === 'telea' || source.fillMode === 'neutral' || source.fillMode === 'color' || source.fillMode === 'tile' || source.fillMode === 'lama'
    ? source.fillMode
    : 'navier-stokes';
  const processingScaleMode: UmbraCanvasProcessingScaleMode = source.processingScaleMode === 'auto' || source.processingScaleMode === 'manual'
    ? source.processingScaleMode
    : 'none';
  const coherenceMode: UmbraCanvasCoherenceMode = source.coherenceMode === 'gaussian'
    || source.coherenceMode === 'box'
    || source.coherenceMode === 'staged'
    ? source.coherenceMode
    : 'none';
  const seedMode: PowerPrompterSeedControlMode = source.seedMode === 'increment'
    || source.seedMode === 'decrement'
    || source.seedMode === 'randomize'
    ? source.seedMode
    : 'fixed';
  const seedIncrement: PowerPrompterSeedIncrement = Number(source.seedIncrement) === 100
    ? 100
    : Number(source.seedIncrement) === 1000 ? 1000 : 1;
  return {
    modelFamily: String(source.modelFamily || ''),
    modelSource: String(source.modelSource || 'checkpoint'),
    checkpointName: String(source.checkpointName || '').replace(/\\/g, '/'),
    loras,
    promptSegments,
    activePromptSegmentId: String(source.activePromptSegmentId || promptSegments[0]?.id || ''),
    negativePrompt: String(source.negativePrompt || ''),
    promptHistory: normalizePromptHistory(source.promptHistory),
    clipSkip: String(source.clipSkip ?? '1'),
    seed: String(source.seed ?? '-1'),
    seedMode,
    seedIncrement,
    steps: String(source.steps ?? '35'),
    cfg: String(source.cfg ?? '4'),
    samplerName: String(source.samplerName || 'er_sde'),
    scheduler: String(source.scheduler || 'simple'),
    samples: clamp(Math.round(Number(source.samples) || 4), 1, 16),
    denoise: clamp(source.denoise ?? 0.8, 0.05, 1),
    maskGrow: clamp(Math.round(Number(source.maskGrow) || 0), 0, 2048),
    maskFeather: clamp(Math.round(Number(source.maskFeather) || 0), 0, 2048),
    contextPadding: clamp(Math.round(Number(source.contextPadding) || 0), 0, 2048),
    processingScaleMode,
    processingWidth: clamp(Math.round(Number(source.processingWidth) || 1024), 64, 16384),
    processingHeight: clamp(Math.round(Number(source.processingHeight) || 1024), 64, 16384),
    coherenceMode,
    coherenceEdgeSize: clamp(Math.round(Number(source.coherenceEdgeSize) || 16), 0, 2048),
    coherenceMinimumDenoise: clamp(source.coherenceMinimumDenoise ?? 0, 0, 1),
    seamlessX: source.seamlessX === true,
    seamlessY: source.seamlessY === true,
    outputOnlyMaskedRegions: source.outputOnlyMaskedRegions === true,
    fillMode,
    infillColor: /^#[0-9a-f]{6}$/i.test(String(source.infillColor || '')) ? String(source.infillColor).toLowerCase() : '#7f7f7f',
    infillTileSize: clamp(Math.round(Number(source.infillTileSize) || 32), 8, 512),
    inpaintModelName: String(source.inpaintModelName || '').trim().replace(/\\/g, '/'),
    colorMatch: clamp(source.colorMatch ?? 0.35, 0, 1),
    differentialStrength: clamp(source.differentialStrength ?? 1, 0, 1),
    softInpaintEnabled: source.softInpaintEnabled !== false,
    softInpaintPreservation: clamp(source.softInpaintPreservation ?? 0.5, 0, 1),
    softInpaintTransitionContrast: clamp(source.softInpaintTransitionContrast ?? 2, 0.25, 8),
    softInpaintMaskInfluence: clamp(source.softInpaintMaskInfluence ?? 0, 0, 1),
  };
}

function baseLayer(
  kind: UmbraCanvasLayerKind,
  name: string,
  width: number,
  height: number,
  now = Date.now(),
): UmbraCanvasLayerBase {
  return {
    id: createId(`canvas-${kind}`),
    kind,
    name,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: 'source-over',
    transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
    createdAt: now,
    updatedAt: now,
  };
}

function convertedLayerBase(
  layer: UmbraCanvasLayer,
  kind: UmbraCanvasLayerKind,
  name: string,
  now: number,
  transform: UmbraCanvasLayerBase['transform'] = layer.transform,
): UmbraCanvasLayerBase {
  return {
    id: layer.id,
    kind,
    name,
    visible: layer.visible,
    locked: layer.locked,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    groupId: layer.groupId,
    transform: { ...transform },
    createdAt: layer.createdAt,
    updatedAt: now,
  };
}

function defaultRasterAdjustments(): UmbraCanvasRasterLayer['adjustments'] {
  return {
    enabled: false,
    mode: 'simple',
    brightness: 0,
    contrast: 0,
    saturation: 0,
    temperature: 0,
    tint: 0,
    sharpness: 0,
    curves: defaultCanvasCurves(),
  };
}

export function defaultCanvasCurves(): UmbraCanvasCurves {
  return {
    master: [[0, 0], [255, 255]],
    r: [[0, 0], [255, 255]],
    g: [[0, 0], [255, 255]],
    b: [[0, 0], [255, 255]],
  };
}

function normalizeCurvePoints(value: unknown): UmbraCanvasCurvePoint[] {
  const points = Array.isArray(value)
    ? value
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [clamp(Math.round(Number(point[0]) || 0), 0, 255), clamp(Math.round(Number(point[1]) || 0), 0, 255)] as UmbraCanvasCurvePoint)
      .sort((left, right) => left[0] - right[0])
      .filter((point, index, source) => index === 0 || point[0] !== source[index - 1]?.[0])
      .slice(0, 32)
    : [];
  if (points.length === 0) return [[0, 0], [255, 255]];
  if (points[0][0] !== 0) points.unshift([0, points[0][1]]);
  if (points.at(-1)?.[0] !== 255) points.push([255, points.at(-1)?.[1] ?? 255]);
  return points;
}

export function normalizeCanvasCurves(value: unknown): UmbraCanvasCurves {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return {
    master: normalizeCurvePoints(source.master),
    r: normalizeCurvePoints(source.r),
    g: normalizeCurvePoints(source.g),
    b: normalizeCurvePoints(source.b),
  };
}

export function createUmbraCanvasImageAsset(input: Omit<UmbraCanvasImageAsset, 'id'> & { id?: string }): UmbraCanvasImageAsset {
  return {
    ...input,
    id: input.id || createId('canvas-asset'),
    width: Math.max(1, Math.round(Number(input.width) || 1)),
    height: Math.max(1, Math.round(Number(input.height) || 1)),
  };
}

export function migrateUmbraCanvasDocument(input: unknown): UmbraCanvasDocument {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('The canvas project document is invalid.');
  }
  const source = structuredClone(input as Record<string, any>);
  const version = Math.max(1, Math.round(Number(source.version) || 1));
  if (version > UMBRA_CANVAS_DOCUMENT_VERSION) {
    throw new Error(`Canvas project version ${version} is newer than this Umbra build supports.`);
  }
  if (!Array.isArray(source.layers) || !Array.isArray(source.staging)) {
    throw new Error('The canvas project is missing its layer or staging data.');
  }
  const allocation = resolveUmbraCanvasInteractiveAllocation(source.width, source.height);
  if (!allocation.allowed) throw new Error(allocation.error);
  source.width = allocation.width;
  source.height = allocation.height;
  source.version = UMBRA_CANVAS_DOCUMENT_VERSION;
  source.generationRegionAspectRatio = clamp(Number(source.generationRegionAspectRatio) || 0, 0, 32);
  const pendingJobIds = new Set<string>();
  source.pendingJobs = Array.isArray(source.pendingJobs) ? source.pendingJobs.map((job: Record<string, any>) => ({
    id: String(job.id || '').trim(),
    region: normalizeRect(job.region || { x: 0, y: 0, width: source.width, height: source.height }, source.width, source.height),
    maskDataUrl: String(job.maskDataUrl || '').trim(),
    createdAt: Number(job.createdAt) || Date.now(),
  })).filter((job: UmbraCanvasPendingJob) => {
    if (!job.id || pendingJobIds.has(job.id)) return false;
    pendingJobIds.add(job.id);
    return true;
  }) : [];
  source.generation = normalizeGenerationSettings(source.generation);
  const stagingIds = new Set<string>();
  source.staging = source.staging.map((stage: Record<string, any>) => ({
    ...stage,
    id: String(stage.id || '').trim(),
    jobId: String(stage.jobId || '').trim(),
    itemId: String(stage.itemId || '').trim(),
    name: String(stage.name || 'Generated sample').trim() || 'Generated sample',
    seed: Number.isFinite(Number(stage.seed)) ? Number(stage.seed) : 0,
    region: normalizeRect(stage.region || { x: 0, y: 0, width: source.width, height: source.height }, source.width, source.height),
    maskDataUrl: String(stage.maskDataUrl || '').trim(),
    createdAt: Number(stage.createdAt) || Date.now(),
    pinned: stage.pinned === true,
    galleryPath: String(stage.galleryPath || '').trim() || undefined,
    gallerySavedAt: Number(stage.gallerySavedAt) > 0 ? Number(stage.gallerySavedAt) : undefined,
  })).filter((stage: UmbraCanvasStage) => {
    if (!stage.id || stagingIds.has(stage.id) || !stage.asset?.imageUrl) return false;
    stagingIds.add(stage.id);
    return true;
  });
  source.previewStageId = stagingIds.has(String(source.previewStageId || '').trim())
    ? String(source.previewStageId || '').trim()
    : '';
  source.layers = source.layers.map((layer: Record<string, any>) => {
    const migrated = { ...layer };
    migrated.visible = layer.visible !== false;
    migrated.locked = layer.locked === true;
    migrated.opacity = clamp(layer.opacity ?? 1, 0, 1);
    migrated.blendMode = UMBRA_CANVAS_BLEND_MODES.includes(String(layer.blendMode || '') as UmbraCanvasBlendMode)
      ? layer.blendMode
      : 'source-over';
    migrated.groupId = String(layer.groupId || '').trim() || undefined;
    if (layer.kind === 'control') {
      migrated.enabled = version >= 16 ? layer.enabled !== false : layer.visible !== false;
      migrated.lightnessToAlpha = version >= 17 ? layer.lightnessToAlpha !== false : true;
      migrated.adapterType = UMBRA_CANVAS_CONTROL_ADAPTER_TYPES.includes(layer.adapterType)
        ? layer.adapterType
        : 'controlnet';
      migrated.controlMode = UMBRA_CANVAS_CONTROL_MODES.includes(layer.controlMode)
        ? layer.controlMode
        : 'balanced';
      migrated.controlType = UMBRA_CANVAS_CONTROL_TYPES.includes(layer.controlType)
        ? layer.controlType
        : 'raw';
      migrated.processorResolution = clamp(Math.round(Number(layer.processorResolution) || 512), 64, 4096);
      migrated.lowThreshold = clamp(Math.round(Number(layer.lowThreshold) || 100), 0, 255);
      migrated.highThreshold = clamp(Math.round(Number(layer.highThreshold) || 200), 0, 255);
      migrated.detectBody = layer.detectBody !== false;
      migrated.detectFace = layer.detectFace !== false;
      migrated.detectHands = layer.detectHands !== false;
      migrated.maxFaces = clamp(Math.round(Number(layer.maxFaces) || 10), 1, 50);
      migrated.minimumConfidence = clamp(layer.minimumConfidence ?? 0.5, 0.1, 1);
      migrated.scoreThreshold = clamp(layer.scoreThreshold ?? 0.1, 0.01, 2);
      migrated.distanceThreshold = clamp(layer.distanceThreshold ?? 0.1, 0.01, 20);
      migrated.normalStrength = clamp(layer.normalStrength ?? Math.PI * 2, 0, Math.PI * 5);
      migrated.backgroundThreshold = clamp(layer.backgroundThreshold ?? 0.1, 0, 1);
      migrated.safeMode = layer.safeMode !== false;
      migrated.processorSeed = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(layer.processorSeed) || 0)));
    }
    if (layer.kind === 'raster') {
      if (layer.role === 'source') migrated.locked = true;
      migrated.smoothing = ['none', 'low', 'medium', 'high'].includes(String(layer.smoothing || '')) ? layer.smoothing : 'high';
      migrated.transparencyLocked = layer.transparencyLocked === true;
      const adjustments = layer.adjustments && typeof layer.adjustments === 'object' ? layer.adjustments : {};
      migrated.adjustments = {
        enabled: adjustments.enabled === true,
        mode: adjustments.mode === 'curves' ? 'curves' : 'simple',
        brightness: clamp(adjustments.brightness ?? 0, -1, 1),
        contrast: clamp(adjustments.contrast ?? 0, -1, 1),
        saturation: clamp(adjustments.saturation ?? 0, -1, 1),
        temperature: clamp(adjustments.temperature ?? 0, -1, 1),
        tint: clamp(adjustments.tint ?? 0, -1, 1),
        sharpness: clamp(adjustments.sharpness ?? 0, 0, 1),
        curves: normalizeCanvasCurves(adjustments.curves),
      };
    }
    if (layer.kind === 'gradient') {
      const angle = Number(layer.angle) || 0;
      const endpoints = gradientEndpointsFromAngle(angle, layer.transform?.width || source.width, layer.transform?.height || source.height);
      migrated.angle = angle;
      migrated.startX = Number.isFinite(Number(layer.startX)) ? clamp(Number(layer.startX), -8, 9) : endpoints.startX;
      migrated.startY = Number.isFinite(Number(layer.startY)) ? clamp(Number(layer.startY), -8, 9) : endpoints.startY;
      migrated.endX = Number.isFinite(Number(layer.endX)) ? clamp(Number(layer.endX), -8, 9) : endpoints.endX;
      migrated.endY = Number.isFinite(Number(layer.endY)) ? clamp(Number(layer.endY), -8, 9) : endpoints.endY;
      migrated.clipEnabled = version >= 13 ? layer.clipEnabled !== false : layer.clipEnabled === true;
    }
    if (layer.kind === 'text') {
      migrated.text = String(layer.text || '');
      migrated.fontFamily = String(layer.fontFamily || 'Arial').trim() || 'Arial';
      migrated.fontSize = clamp(layer.fontSize ?? 48, 4, 1024);
      migrated.fontWeight = clamp(Math.round((Number(layer.fontWeight) || 400) / 100) * 100, 100, 900);
      migrated.italic = layer.italic === true;
      migrated.underline = layer.underline === true;
      migrated.strikethrough = layer.strikethrough === true;
      migrated.color = String(layer.color || '#ffffff');
      migrated.backgroundColor = String(layer.backgroundColor || 'transparent');
      migrated.align = layer.align === 'left' || layer.align === 'right' ? layer.align : 'center';
      migrated.lineHeight = clamp(layer.lineHeight ?? 1.2, 0.5, 4);
    }
    if (layer.kind === 'mask') {
      migrated.enabled = version >= 16 ? layer.enabled !== false : layer.visible !== false;
      migrated.purpose = layer.purpose === 'regional_guidance'
        ? 'regional_guidance'
        : layer.purpose === 'reference'
          ? 'reference'
        : layer.purpose === 'layer'
          ? 'layer'
          : 'inpaint';
      migrated.noiseLevel = clamp(layer.noiseLevel ?? 0, 0, 1);
      migrated.denoiseLimit = clamp(layer.denoiseLimit ?? 1, 0, 1);
      migrated.overlayColor = normalizeMaskOverlayColor(layer.overlayColor, migrated.purpose);
      migrated.overlayStyle = normalizeMaskOverlayStyle(layer.overlayStyle);
    }
    if (layer.kind === 'reference') {
      migrated.enabled = version >= 16 ? layer.enabled !== false : layer.visible !== false;
      migrated.method = UMBRA_CANVAS_REFERENCE_METHODS.includes(layer.method)
        ? layer.method
        : 'style_model';
      migrated.crop = layer.crop === 'none' ? 'none' : 'center';
      migrated.strengthType = layer.strengthType === 'attn_bias' ? 'attn_bias' : 'multiply';
      migrated.weight = migrated.method === 'style_model' || migrated.method === 'flux_redux'
        ? clamp(layer.weight ?? 1, 0, 10)
        : migrated.method === 'ip_adapter' ? clamp(layer.weight ?? 0.8, -1, 5) : 1;
      migrated.beginStepPercent = clamp(layer.beginStepPercent ?? 0, 0, 1);
      migrated.endStepPercent = clamp(layer.endStepPercent ?? 1, migrated.beginStepPercent, 1);
      migrated.ipAdapterWeightType = UMBRA_IP_ADAPTER_WEIGHT_TYPES.includes(layer.ipAdapterWeightType)
        ? layer.ipAdapterWeightType
        : 'linear';
      migrated.ipAdapterCombineEmbeds = UMBRA_IP_ADAPTER_COMBINE_EMBEDS.includes(layer.ipAdapterCombineEmbeds)
        ? layer.ipAdapterCombineEmbeds
        : 'concat';
      migrated.ipAdapterEmbedsScaling = UMBRA_IP_ADAPTER_EMBEDS_SCALING.includes(layer.ipAdapterEmbedsScaling)
        ? layer.ipAdapterEmbedsScaling
        : 'V only';
      migrated.maskLayerId = String(layer.maskLayerId || '').trim() || undefined;
      migrated.regionLayerId = String(layer.regionLayerId || '').trim() || undefined;
    }
    if (layer.kind === 'regional_guidance') {
      migrated.enabled = version >= 16 ? layer.enabled !== false : layer.visible !== false;
      migrated.autoNegative = layer.autoNegative === true;
    }
    return migrated;
  });
  const regionalLayerIds = new Set(source.layers
    .filter((layer: Record<string, any>) => layer.kind === 'regional_guidance')
    .map((layer: Record<string, any>) => String(layer.id || '')));
  source.layers = source.layers.map((layer: Record<string, any>) => {
    if (layer.kind !== 'reference') return layer;
    if (layer.method !== 'ip_adapter') return { ...layer, maskLayerId: undefined, regionLayerId: undefined };
    if (layer.regionLayerId && regionalLayerIds.has(layer.regionLayerId)) return { ...layer, maskLayerId: undefined };
    return { ...layer, regionLayerId: undefined };
  });
  const referencedMaskIds = new Set(source.layers.flatMap((layer: Record<string, any>) => (
    typeof layer.maskLayerId === 'string' && layer.maskLayerId ? [layer.maskLayerId] : []
  )));
  source.layers = source.layers.filter((layer: Record<string, any>) => (
    layer.kind !== 'mask' || layer.purpose !== 'reference' || referencedMaskIds.has(layer.id)
  ));
  const activeMaskLayerId = String(source.activeMaskLayerId || '').trim();
  const fallbackMask = source.layers.find((layer: Record<string, any>) => (
    layer.kind === 'mask' && layer.purpose === 'inpaint' && layer.frozen !== true
  ));
  source.activeMaskLayerId = source.layers.some((layer: Record<string, any>) => (
    layer.id === activeMaskLayerId && layer.kind === 'mask' && layer.purpose === 'inpaint' && layer.frozen !== true
  )) ? activeMaskLayerId : String(fallbackMask?.id || '');
  const activeLayerId = String(source.activeLayerId || '').trim();
  source.activeLayerId = source.layers.some((layer: Record<string, any>) => layer.id === activeLayerId)
    ? activeLayerId
    : String(source.activeMaskLayerId || source.layers[0]?.id || '');
  const bookmarkedLayerId = String(source.bookmarkedLayerId || '').trim();
  source.bookmarkedLayerId = source.layers.some((layer: Record<string, any>) => layer.id === bookmarkedLayerId)
    ? bookmarkedLayerId
    : '';
  return source as UmbraCanvasDocument;
}

export function createUmbraCanvasDocument(asset: UmbraCanvasImageAsset, name = asset.name): UmbraCanvasDocument {
  const allocation = resolveUmbraCanvasInteractiveAllocation(asset.width, asset.height);
  if (!allocation.allowed) throw new Error(allocation.error);
  const sourceAsset = {
    ...asset,
    width: allocation.width,
    height: allocation.height,
  };
  const now = Date.now();
  const sourceLayer: UmbraCanvasRasterLayer = {
    ...baseLayer('raster', 'Original', sourceAsset.width, sourceAsset.height, now),
    kind: 'raster',
    role: 'source',
    asset: sourceAsset,
    smoothing: 'high',
    transparencyLocked: false,
    adjustments: defaultRasterAdjustments(),
    locked: true,
  };
  const maskLayer: UmbraCanvasMaskLayer = {
    ...baseLayer('mask', 'Inpaint Mask', sourceAsset.width, sourceAsset.height, now),
    kind: 'mask',
    enabled: true,
    purpose: 'inpaint',
    dataUrl: '',
    frozen: false,
    noiseLevel: 0,
    denoiseLimit: 1,
    overlayColor: defaultMaskOverlayColor('inpaint'),
    overlayStyle: 'solid',
  };
  return {
    version: UMBRA_CANVAS_DOCUMENT_VERSION,
    id: createId('canvas-document'),
    name: String(name || sourceAsset.name || 'Untitled Canvas').trim() || 'Untitled Canvas',
    width: sourceAsset.width,
    height: sourceAsset.height,
    operationMode: 'inpaint',
    layers: [sourceLayer, maskLayer],
    staging: [],
    pendingJobs: [],
    generation: normalizeGenerationSettings({}),
    activeLayerId: sourceLayer.id,
    activeMaskLayerId: maskLayer.id,
    bookmarkedLayerId: '',
    previewStageId: '',
    generationRegion: null,
    generationRegionAspectRatio: 0,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export function forkUmbraCanvasDocument(document: UmbraCanvasDocument, name: string): UmbraCanvasDocument {
  const now = Date.now();
  return {
    ...structuredClone(document),
    id: createId('canvas-document'),
    name: String(name || `${document.name} Copy`).trim().slice(0, 240) || `${document.name} Copy`,
    revision: 1,
    pendingJobs: [],
    createdAt: now,
    updatedAt: now,
  };
}

function commit(document: UmbraCanvasDocument, changes: Partial<UmbraCanvasDocument>): UmbraCanvasDocument {
  const layers = changes.layers || document.layers;
  const requestedBookmark = changes.bookmarkedLayerId === undefined
    ? document.bookmarkedLayerId
    : changes.bookmarkedLayerId;
  return {
    ...document,
    ...changes,
    bookmarkedLayerId: layers.some((layer) => layer.id === requestedBookmark) ? requestedBookmark : '',
    revision: document.revision + 1,
    updatedAt: Date.now(),
  };
}

function patchLayer(
  document: UmbraCanvasDocument,
  layerId: string,
  update: (layer: UmbraCanvasLayer) => UmbraCanvasLayer,
): UmbraCanvasDocument {
  let changed = false;
  const layers = document.layers.map((layer) => {
    if (layer.id !== layerId) return layer;
    changed = true;
    return { ...update(layer), updatedAt: Date.now() } as UmbraCanvasLayer;
  });
  return changed ? commit(document, { layers }) : document;
}

function resolvePreviewAfterStageRemoval(
  staging: UmbraCanvasStage[],
  previewStageId: string,
  removedStageIds: ReadonlySet<string>,
): string {
  if (!previewStageId) return '';
  const remaining = staging.filter((stage) => !removedStageIds.has(stage.id));
  if (remaining.some((stage) => stage.id === previewStageId)) return previewStageId;
  if (remaining.length <= 0) return '';
  const removedIndex = staging.findIndex((stage) => stage.id === previewStageId);
  return remaining[Math.min(Math.max(0, removedIndex), remaining.length - 1)]?.id || '';
}

function acceptStage(
  document: UmbraCanvasDocument,
  stageId: string,
  mode: 'replace_region' | 'new_layer' = 'replace_region',
  preserveMask = false,
): UmbraCanvasDocument {
  const stage = document.staging.find((candidate) => candidate.id === stageId);
  if (!stage) return document;
  const now = Date.now();
  const frozenMask: UmbraCanvasMaskLayer = {
    ...baseLayer('mask', `${stage.name} Mask`, stage.region.width, stage.region.height, now),
    kind: 'mask',
    enabled: true,
    purpose: 'inpaint',
    dataUrl: stage.maskDataUrl,
    frozen: true,
    noiseLevel: 0,
    denoiseLimit: 1,
    overlayColor: defaultMaskOverlayColor('inpaint'),
    overlayStyle: 'solid',
    locked: true,
    transform: {
      x: stage.region.x,
      y: stage.region.y,
      width: stage.region.width,
      height: stage.region.height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  };
  const rasterLayer: UmbraCanvasRasterLayer = {
    ...baseLayer('raster', stage.name, stage.region.width, stage.region.height, now),
    kind: 'raster',
    role: 'generated',
    asset: stage.asset,
    smoothing: 'high',
    transparencyLocked: false,
    adjustments: defaultRasterAdjustments(),
    // Inpaint outputs are already composited against the submitted source by
    // the backend. Reapplying the generation mask here makes the accepted
    // result translucent and feathers it a second time. Replace therefore
    // keeps the opaque composite; New Layer retains the editable masked patch.
    maskLayerId: mode === 'new_layer' ? frozenMask.id : undefined,
    transform: {
      x: stage.region.x,
      y: stage.region.y,
      width: stage.region.width,
      height: stage.region.height,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    },
  };
  const freshMask: UmbraCanvasMaskLayer = {
    ...baseLayer('mask', 'Inpaint Mask', document.width, document.height, now),
    kind: 'mask',
    enabled: true,
    purpose: 'inpaint',
    dataUrl: '',
    frozen: false,
    noiseLevel: 0,
    denoiseLimit: 1,
    overlayColor: defaultMaskOverlayColor('inpaint'),
    overlayStyle: 'solid',
  };
  const activeMaskIndex = document.layers.findIndex((layer) => layer.id === document.activeMaskLayerId);
  const layers = [...document.layers];
  const insertionIndex = activeMaskIndex >= 0 ? activeMaskIndex : layers.length;
  layers.splice(insertionIndex, 0, ...(mode === 'new_layer' ? [frozenMask, rasterLayer] : [rasterLayer]));
  let activeMaskLayerId = document.activeMaskLayerId;
  if (!preserveMask) {
    const oldMaskIndex = layers.findIndex((layer) => layer.id === document.activeMaskLayerId);
    if (oldMaskIndex >= 0) layers.splice(oldMaskIndex, 1, freshMask);
    else layers.push(freshMask);
    activeMaskLayerId = freshMask.id;
  }
  return commit(document, {
    layers,
    staging: document.staging.filter((candidate) => candidate.id !== stageId),
    activeLayerId: rasterLayer.id,
    activeMaskLayerId,
    previewStageId: resolvePreviewAfterStageRemoval(document.staging, document.previewStageId, new Set([stageId])),
  });
}

export function umbraCanvasDocumentReducer(
  state: UmbraCanvasDocumentState,
  action: UmbraCanvasDocumentAction,
): UmbraCanvasDocumentState {
  if (action.type === 'load_source') return createUmbraCanvasDocument(action.asset, action.name);
  if (action.type === 'replace_document') return enforceImmutableSourceLock(action.document);
  if (!state) return state;
  if (shouldRejectProtectedLayerMutation(state, action)) return state;

  switch (action.type) {
    case 'set_document_name':
      return commit(state, { name: String(action.name || '').slice(0, 240) });
    case 'set_operation_mode':
      return commit(state, { operationMode: action.mode });
    case 'set_generation_settings':
      return commit(state, { generation: normalizeGenerationSettings(action.generation) });
    case 'set_generation_region':
      return commit(state, {
        generationRegion: action.region
          ? fitUmbraCanvasRectToAspectRatio(action.region, state.width, state.height, state.generationRegionAspectRatio)
          : null,
      });
    case 'set_generation_region_aspect_ratio': {
      const generationRegionAspectRatio = clamp(Number(action.ratio) || 0, 0, 32);
      return commit(state, {
        generationRegionAspectRatio,
        generationRegion: state.generationRegion
          ? fitUmbraCanvasRectToAspectRatio(state.generationRegion, state.width, state.height, generationRegionAspectRatio)
          : null,
      });
    }
    case 'swap_generation_region_dimensions': {
      if (!state.generationRegion) return state;
      const generationRegionAspectRatio = state.generationRegionAspectRatio > 0
        ? 1 / state.generationRegionAspectRatio
        : 0;
      const centerX = state.generationRegion.x + state.generationRegion.width / 2;
      const centerY = state.generationRegion.y + state.generationRegion.height / 2;
      const swapped = {
        x: centerX - state.generationRegion.height / 2,
        y: centerY - state.generationRegion.width / 2,
        width: state.generationRegion.height,
        height: state.generationRegion.width,
      };
      return commit(state, {
        generationRegionAspectRatio,
        generationRegion: fitUmbraCanvasRectToAspectRatio(
          swapped,
          state.width,
          state.height,
          generationRegionAspectRatio,
        ),
      });
    }
    case 'transform_canvas': {
      if (state.staging.length > 0 || state.pendingJobs.length > 0) return state;
      const oldWidth = state.width;
      const oldHeight = state.height;
      const rotates = action.operation === 'rotate_left' || action.operation === 'rotate_right';
      const width = rotates ? oldHeight : oldWidth;
      const height = rotates ? oldWidth : oldHeight;
      const now = Date.now();
      const transformRect = (rect: UmbraCanvasRect): UmbraCanvasRect => {
        if (action.operation === 'flip_horizontal') {
          return { ...rect, x: oldWidth - rect.x - rect.width };
        }
        if (action.operation === 'flip_vertical') {
          return { ...rect, y: oldHeight - rect.y - rect.height };
        }
        if (action.operation === 'rotate_right') {
          return {
            x: oldHeight - rect.y - rect.height,
            y: rect.x,
            width: rect.height,
            height: rect.width,
          };
        }
        return {
          x: rect.y,
          y: oldWidth - rect.x - rect.width,
          width: rect.height,
          height: rect.width,
        };
      };
      const transformedLayers = state.layers.map((layer) => {
        const transform = layer.transform;
        if (action.operation === 'flip_horizontal') {
          return {
            ...layer,
            transform: {
              ...transform,
              x: oldWidth - transform.x - transform.width,
              rotation: normalizeRotation(-transform.rotation),
              scaleX: -transform.scaleX,
            },
            updatedAt: now,
          } as UmbraCanvasLayer;
        }
        if (action.operation === 'flip_vertical') {
          return {
            ...layer,
            transform: {
              ...transform,
              y: oldHeight - transform.y - transform.height,
              rotation: normalizeRotation(-transform.rotation),
              scaleY: -transform.scaleY,
            },
            updatedAt: now,
          } as UmbraCanvasLayer;
        }
        const centerX = transform.x + transform.width / 2;
        const centerY = transform.y + transform.height / 2;
        const rotatedCenterX = action.operation === 'rotate_right' ? oldHeight - centerY : centerY;
        const rotatedCenterY = action.operation === 'rotate_right' ? centerX : oldWidth - centerX;
        return {
          ...layer,
          transform: {
            ...transform,
            x: rotatedCenterX - transform.width / 2,
            y: rotatedCenterY - transform.height / 2,
            rotation: normalizeRotation(transform.rotation + (action.operation === 'rotate_right' ? 90 : -90)),
          },
          updatedAt: now,
        } as UmbraCanvasLayer;
      });
      const maskSnapshots = new Map((action.maskSnapshots || []).map((entry) => [entry.layerId, entry.dataUrl]));
      const flattenedMaskIds = new Set(maskSnapshots.keys());
      const layers = transformedLayers.map((layer) => {
        if (layer.kind === 'mask' && flattenedMaskIds.has(layer.id)) {
          return {
            ...layer,
            dataUrl: maskSnapshots.get(layer.id) || '',
            transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
            updatedAt: now,
          } as UmbraCanvasLayer;
        }
        if (layer.kind === 'regional_guidance' && flattenedMaskIds.has(layer.maskLayerId)) {
          return {
            ...layer,
            transform: { x: 0, y: 0, width, height, rotation: 0, scaleX: 1, scaleY: 1 },
            updatedAt: now,
          } as UmbraCanvasLayer;
        }
        return layer;
      });
      return commit(state, {
        width,
        height,
        layers,
        generationRegion: state.generationRegion
          ? normalizeRect(transformRect(state.generationRegion), width, height)
          : null,
        generationRegionAspectRatio: rotates && state.generationRegionAspectRatio > 0
          ? 1 / state.generationRegionAspectRatio
          : state.generationRegionAspectRatio,
      });
    }
    case 'resize_canvas': {
      const allocation = resolveUmbraCanvasInteractiveAllocation(action.width, action.height);
      if (!allocation.allowed) return state;
      const { width, height } = allocation;
      const layers = state.layers.map((layer) => ({
        ...layer,
        transform: layer.id === state.activeMaskLayerId
          ? { ...layer.transform, x: 0, y: 0, width, height }
          : {
            ...layer.transform,
            x: layer.transform.x + action.translateX,
            y: layer.transform.y + action.translateY,
          },
        updatedAt: Date.now(),
      })) as UmbraCanvasLayer[];
      return commit(state, {
        width,
        height,
        layers,
        pendingJobs: state.pendingJobs.map((job) => ({
          ...job,
          region: normalizeRect({
            ...job.region,
            x: job.region.x + action.translateX,
            y: job.region.y + action.translateY,
          }, width, height),
        })),
        generationRegion: action.clearGenerationRegion
          ? null
          : state.generationRegion
          ? fitUmbraCanvasRectToAspectRatio({
            ...state.generationRegion,
            x: state.generationRegion.x + action.translateX,
            y: state.generationRegion.y + action.translateY,
          }, width, height, state.generationRegionAspectRatio)
          : null,
      });
    }
    case 'resample_canvas': {
      const allocation = resolveUmbraCanvasInteractiveAllocation(action.width, action.height);
      if (!allocation.allowed) return state;
      const { width, height } = allocation;
      const sourceRect = normalizeRect(action.sourceRect, state.width, state.height);
      const scaleX = width / Math.max(1, sourceRect.width);
      const scaleY = height / Math.max(1, sourceRect.height);
      const scaleRect = (rect: UmbraCanvasRect): UmbraCanvasRect => ({
        x: (rect.x - sourceRect.x) * scaleX,
        y: (rect.y - sourceRect.y) * scaleY,
        width: rect.width * scaleX,
        height: rect.height * scaleY,
      });
      const scaleRegion = (rect: UmbraCanvasRect): UmbraCanvasRect => normalizeRect(scaleRect(rect), width, height);
      const textScale = Math.sqrt(scaleX * scaleY);
      const layers = state.layers.map((layer) => ({
        ...layer,
        transform: layer.id === state.activeMaskLayerId
          ? { ...layer.transform, x: 0, y: 0, width, height }
          : { ...layer.transform, ...scaleRect(layer.transform) },
        ...(layer.kind === 'text' ? { fontSize: clamp(layer.fontSize * textScale, 4, 1024) } : {}),
        updatedAt: Date.now(),
      })) as UmbraCanvasLayer[];
      return commit(state, {
        width,
        height,
        layers,
        staging: state.staging.map((stage) => ({
          ...stage,
          region: scaleRegion(stage.region),
        })),
        pendingJobs: state.pendingJobs.map((job) => ({
          ...job,
          region: scaleRegion(job.region),
        })),
        generationRegion: null,
        generationRegionAspectRatio: 0,
      });
    }
    case 'set_mask_snapshot': {
      const mask = state.layers.find((layer) => layer.id === state.activeMaskLayerId);
      if (mask?.kind !== 'mask' || mask.frozen || mask.locked) return state;
      return patchLayer(state, state.activeMaskLayerId, (layer) => (
        layer.kind === 'mask' ? { ...layer, dataUrl: action.dataUrl } : layer
      ));
    }
    case 'add_inpaint_mask': {
      const now = Date.now();
      const index = state.layers.filter((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen).length + 1;
      const mask: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', String(action.name || `Inpaint Mask ${index}`).trim() || `Inpaint Mask ${index}`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'inpaint',
        dataUrl: String(action.dataUrl || ''),
        frozen: false,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('inpaint'),
        overlayStyle: 'solid',
      };
      return commit(state, { layers: [...state.layers, mask], activeLayerId: mask.id, activeMaskLayerId: mask.id });
    }
    case 'add_layer_mask': {
      const rasterIndex = state.layers.findIndex((layer) => (
        layer.id === action.rasterLayerId && layer.kind === 'raster' && layer.role !== 'source'
      ));
      if (rasterIndex < 0) return state;
      const raster = state.layers[rasterIndex] as UmbraCanvasRasterLayer;
      if (raster.maskLayerId) return state;
      const now = Date.now();
      const mask: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', String(action.name || `${raster.name} Mask`).trim() || `${raster.name} Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'layer',
        dataUrl: String(action.dataUrl || ''),
        frozen: false,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('layer'),
        overlayStyle: 'solid',
      };
      const layers = state.layers.map((layer) => layer.id === raster.id
        ? { ...layer, maskLayerId: mask.id, updatedAt: now }
        : layer) as UmbraCanvasLayer[];
      layers.splice(rasterIndex, 0, mask);
      return commit(state, { layers, activeLayerId: mask.id, previewStageId: '' });
    }
    case 'detach_layer_mask': {
      const raster = state.layers.find((layer) => layer.id === action.rasterLayerId);
      if (raster?.kind !== 'raster' || !raster.maskLayerId || raster.role === 'source') return state;
      const maskLayerId = raster.maskLayerId;
      const now = Date.now();
      const layers = state.layers
        .filter((layer) => layer.id !== maskLayerId)
        .map((layer) => layer.id === raster.id ? { ...layer, maskLayerId: undefined, updatedAt: now } : layer) as UmbraCanvasLayer[];
      return commit(state, {
        layers,
        activeLayerId: state.activeLayerId === maskLayerId ? raster.id : state.activeLayerId,
        previewStageId: '',
      });
    }
    case 'set_active_mask': {
      const mask = state.layers.find((layer) => layer.id === action.layerId);
      if (mask?.kind !== 'mask' || mask.purpose !== 'inpaint' || mask.frozen) return state;
      return commit(state, { activeLayerId: mask.id, activeMaskLayerId: mask.id, previewStageId: '' });
    }
    case 'set_mask_layer_snapshot': {
      const mask = state.layers.find((layer) => layer.id === action.layerId);
      if (mask?.kind !== 'mask' || (!mask.frozen && mask.locked)) return state;
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'mask' ? { ...layer, dataUrl: String(action.dataUrl || '') } : layer
      ));
    }
    case 'crop_mask_to_region': {
      const target = state.layers.find((layer) => layer.id === action.layerId);
      if (target?.kind === 'mask' && target.purpose === 'inpaint' && target.locked) return state;
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'mask' && (layer.purpose === 'inpaint' || layer.purpose === 'regional_guidance')
          ? {
            ...layer,
            dataUrl: String(action.dataUrl || ''),
            transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
          }
          : layer
      ));
    }
    case 'bake_inpaint_mask_transform': {
      const target = state.layers.find((layer) => layer.id === action.layerId);
      if (target?.kind === 'mask' && target.locked) return state;
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen && !layer.locked
          ? {
            ...layer,
            dataUrl: String(action.dataUrl || ''),
            transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
          }
          : layer
      ));
    }
    case 'update_inpaint_mask': {
      const target = state.layers.find((layer) => layer.id === action.layerId);
      if (target?.kind === 'mask' && target.locked) return state;
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen && !layer.locked
          ? {
            ...layer,
            noiseLevel: action.changes.noiseLevel === undefined ? layer.noiseLevel : clamp(action.changes.noiseLevel, 0, 1),
            denoiseLimit: action.changes.denoiseLimit === undefined ? layer.denoiseLimit : clamp(action.changes.denoiseLimit, 0, 1),
          }
          : layer
      ));
    }
    case 'update_mask_overlay':
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'mask'
          ? {
            ...layer,
            overlayColor: action.changes.overlayColor === undefined
              ? layer.overlayColor
              : normalizeMaskOverlayColor(action.changes.overlayColor, layer.purpose),
            overlayStyle: action.changes.overlayStyle === undefined
              ? layer.overlayStyle
              : normalizeMaskOverlayStyle(action.changes.overlayStyle),
          }
          : layer
      ));
    case 'track_pending_job': {
      const pendingJobs = state.pendingJobs.filter((job) => job.id !== action.job.id);
      pendingJobs.push({
        ...action.job,
        region: normalizeRect(action.job.region, state.width, state.height),
      });
      return commit(state, { pendingJobs });
    }
    case 'remove_pending_job':
      return commit(state, { pendingJobs: state.pendingJobs.filter((job) => job.id !== action.jobId) });
    case 'stage_outputs': {
      const byId = new Map(state.staging.map((stage) => [stage.id, stage]));
      for (const stage of action.stages) {
        const previous = byId.get(stage.id);
        byId.set(stage.id, { ...previous, ...stage, pinned: previous?.pinned ?? stage.pinned ?? false });
      }
      const staging = Array.from(byId.values()).sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt || left.id.localeCompare(right.id));
      const requestedPreview = String(action.previewStageId || '').trim();
      return commit(state, {
        staging,
        previewStageId: requestedPreview && staging.some((stage) => stage.id === requestedPreview)
          ? requestedPreview
          : staging.some((stage) => stage.id === state.previewStageId) ? state.previewStageId : '',
      });
    }
    case 'mark_stages_gallery_saved': {
      const receipts = new Map(action.receipts
        .map((receipt) => [String(receipt.stageId || '').trim(), {
          path: String(receipt.path || '').trim(),
          savedAt: Number(receipt.savedAt) || Date.now(),
        }] as const)
        .filter(([stageId, receipt]) => stageId && receipt.path));
      if (receipts.size <= 0) return state;
      let changed = false;
      const staging = state.staging.map((stage) => {
        const receipt = receipts.get(stage.id);
        if (!receipt || (stage.galleryPath === receipt.path && stage.gallerySavedAt === receipt.savedAt)) return stage;
        changed = true;
        return { ...stage, galleryPath: receipt.path, gallerySavedAt: receipt.savedAt };
      });
      return changed ? commit(state, { staging }) : state;
    }
    case 'toggle_stage_pin':
      return commit(state, {
        staging: state.staging
          .map((stage) => stage.id === action.stageId ? { ...stage, pinned: !stage.pinned } : stage)
          .sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt || left.id.localeCompare(right.id)),
      });
    case 'preview_stage':
      return commit(state, {
        previewStageId: !action.stageId || state.staging.some((stage) => stage.id === action.stageId) ? action.stageId : state.previewStageId,
      });
    case 'discard_stage':
      return commit(state, {
        staging: state.staging.filter((stage) => stage.id !== action.stageId),
        previewStageId: resolvePreviewAfterStageRemoval(state.staging, state.previewStageId, new Set([action.stageId])),
      });
    case 'discard_stages': {
      const discarded = new Set(action.stageIds);
      if (discarded.size <= 0 || !state.staging.some((stage) => discarded.has(stage.id))) return state;
      return commit(state, {
        staging: state.staging.filter((stage) => !discarded.has(stage.id)),
        previewStageId: resolvePreviewAfterStageRemoval(state.staging, state.previewStageId, discarded),
      });
    }
    case 'accept_stage':
      return acceptStage(state, action.stageId, action.mode, action.preserveMask === true);
    case 'accept_stages': {
      const requested = new Set(action.stageIds);
      const orderedStageIds = state.staging.filter((stage) => requested.has(stage.id)).map((stage) => stage.id);
      if (orderedStageIds.length <= 0) return state;
      return orderedStageIds.reduce((document, stageId) => (
        acceptStage(document, stageId, action.mode, action.preserveMask === true)
      ), state);
    }
    case 'select_layer':
      return state.layers.some((layer) => layer.id === action.layerId)
        ? commit(state, { activeLayerId: action.layerId, previewStageId: '' })
        : state;
    case 'set_bookmarked_layer': {
      const layerId = String(action.layerId || '').trim();
      if (layerId && !state.layers.some((layer) => layer.id === layerId)) return state;
      return commit(state, { bookmarkedLayerId: layerId });
    }
    case 'toggle_layer':
      return patchLayer(state, action.layerId, (layer) => ({ ...layer, visible: !layer.visible }));
    case 'toggle_layer_enabled': {
      const target = state.layers.find((layer) => layer.id === action.layerId);
      const canToggle = target?.kind === 'mask' && target.purpose === 'inpaint'
        || target?.kind === 'regional_guidance'
        || target?.kind === 'control'
        || target?.kind === 'reference';
      if (!canToggle) return state;
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'mask' && layer.purpose === 'inpaint'
          || layer.kind === 'regional_guidance'
          || layer.kind === 'control'
          || layer.kind === 'reference'
          ? { ...layer, enabled: !layer.enabled }
          : layer
      ));
    }
    case 'toggle_layer_lock': {
      const layer = state.layers.find((candidate) => candidate.id === action.layerId);
      if (!layer || isImmutableSourceLayer(layer)) return state;
      return patchLayer(state, action.layerId, (candidate) => ({ ...candidate, locked: !candidate.locked }));
    }
    case 'set_layer_opacity':
      return patchLayer(state, action.layerId, (layer) => ({ ...layer, opacity: clamp(action.opacity, 0, 1) }));
    case 'set_layer_blend_mode':
      return patchLayer(state, action.layerId, (layer) => ({ ...layer, blendMode: action.blendMode }));
    case 'set_layer_transform': {
      const source = state.layers.find((layer) => layer.id === action.layerId);
      if (!source || source.locked || source.kind === 'raster' && source.role === 'source') return state;
      const transform = {
        ...source.transform,
        ...action.transform,
        x: Number.isFinite(Number(action.transform.x)) ? Number(action.transform.x) : source.transform.x,
        y: Number.isFinite(Number(action.transform.y)) ? Number(action.transform.y) : source.transform.y,
        width: action.transform.width === undefined ? source.transform.width : Math.max(1, Number(action.transform.width) || 1),
        height: action.transform.height === undefined ? source.transform.height : Math.max(1, Number(action.transform.height) || 1),
        rotation: action.transform.rotation === undefined ? source.transform.rotation : Number(action.transform.rotation) || 0,
        scaleX: action.transform.scaleX === undefined ? source.transform.scaleX : Number(action.transform.scaleX) || 1,
        scaleY: action.transform.scaleY === undefined ? source.transform.scaleY : Number(action.transform.scaleY) || 1,
      };
      const linkedLayerIds = new Set([source.id]);
      if (source.kind === 'regional_guidance') linkedLayerIds.add(source.maskLayerId);
      if (source.kind === 'mask' && source.purpose === 'regional_guidance') {
        const region = state.layers.find((layer) => layer.kind === 'regional_guidance' && layer.maskLayerId === source.id);
        if (region) linkedLayerIds.add(region.id);
      }
      const now = Date.now();
      const layers = state.layers.map((layer) => linkedLayerIds.has(layer.id)
        ? { ...layer, transform: { ...transform }, updatedAt: now }
        : layer) as UmbraCanvasLayer[];
      return commit(state, { layers });
    }
    case 'reset_layer_transform': {
      const source = state.layers.find((layer) => layer.id === action.layerId);
      if (!canResetUmbraCanvasLayerTransform(source)) return state;
      const transform = resetUmbraCanvasLayerTransform(source!);
      if (Object.keys(transform).every((key) => (
        transform[key as keyof typeof transform] === source!.transform[key as keyof typeof transform]
      ))) return state;
      return patchLayer(state, action.layerId, (layer) => ({ ...layer, transform }));
    }
    case 'set_layers_transforms': {
      const transforms = new Map(action.transforms.map((entry) => [entry.layerId, entry.transform]));
      const forcedLinkedTransforms = new Set<string>();
      for (const entry of action.transforms) {
        const source = state.layers.find((layer) => layer.id === entry.layerId);
        if (!source || isLayerProtectedFromMutation(source)) continue;
        if (source?.kind === 'regional_guidance') {
          transforms.set(source.maskLayerId, entry.transform);
          forcedLinkedTransforms.add(source.maskLayerId);
        } else if (source?.kind === 'mask' && source.purpose === 'regional_guidance') {
          const region = state.layers.find((layer) => layer.kind === 'regional_guidance' && layer.maskLayerId === source.id);
          if (region) {
            transforms.set(region.id, entry.transform);
            forcedLinkedTransforms.add(region.id);
          }
        }
      }
      let changed = false;
      const now = Date.now();
      const layers = state.layers.map((layer) => {
        const transform = transforms.get(layer.id);
        if (!transform || layer.locked && !forcedLinkedTransforms.has(layer.id) || layer.kind === 'raster' && layer.role === 'source') return layer;
        changed = true;
        return {
          ...layer,
          transform: {
            ...layer.transform,
            ...transform,
            x: Number.isFinite(Number(transform.x)) ? Number(transform.x) : layer.transform.x,
            y: Number.isFinite(Number(transform.y)) ? Number(transform.y) : layer.transform.y,
            width: transform.width === undefined ? layer.transform.width : Math.max(1, Number(transform.width) || 1),
            height: transform.height === undefined ? layer.transform.height : Math.max(1, Number(transform.height) || 1),
            rotation: transform.rotation === undefined ? layer.transform.rotation : Number(transform.rotation) || 0,
            scaleX: transform.scaleX === undefined ? layer.transform.scaleX : Number(transform.scaleX) || 1,
            scaleY: transform.scaleY === undefined ? layer.transform.scaleY : Number(transform.scaleY) || 1,
          },
          updatedAt: now,
        } as UmbraCanvasLayer;
      });
      return changed ? commit(state, { layers }) : state;
    }
    case 'set_raster_smoothing':
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'raster'
          ? { ...layer, smoothing: ['none', 'low', 'medium', 'high'].includes(action.smoothing) ? action.smoothing : 'high' }
          : layer
      ));
    case 'set_raster_transparency_lock':
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'raster' ? { ...layer, transparencyLocked: action.locked } : layer
      ));
    case 'update_raster_adjustments':
      return patchLayer(state, action.layerId, (layer) => {
        if (layer.kind !== 'raster') return layer;
        const next = { ...layer.adjustments, ...action.changes };
        return {
          ...layer,
          adjustments: {
            enabled: next.enabled === true,
            mode: next.mode === 'curves' ? 'curves' : 'simple',
            brightness: clamp(next.brightness, -1, 1),
            contrast: clamp(next.contrast, -1, 1),
            saturation: clamp(next.saturation, -1, 1),
            temperature: clamp(next.temperature, -1, 1),
            tint: clamp(next.tint, -1, 1),
            sharpness: clamp(next.sharpness, 0, 1),
            curves: normalizeCanvasCurves(next.curves),
          },
        };
      });
    case 'set_layer_name':
      return patchLayer(state, action.layerId, (layer) => ({
        ...layer,
        name: String(action.name || '').trim() || layer.name,
      }));
    case 'add_raster_layer': {
      const now = Date.now();
      const layer: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', action.name, action.asset.width, action.asset.height, now),
        kind: 'raster',
        role: action.role || 'paint',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
        transform: {
          x: 0,
          y: 0,
          width: action.asset.width,
          height: action.asset.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
          ...action.transform,
        },
      };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'add_cutout_layer': {
      if (state.staging.length > 0 || state.pendingJobs.length > 0) return state;
      const now = Date.now();
      const name = String(action.name || 'Character Cutout').trim() || 'Character Cutout';
      const layer: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', name, state.width, state.height, now),
        kind: 'raster',
        role: 'cutout',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
        transform: {
          x: 0,
          y: 0,
          width: state.width,
          height: state.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        },
      };
      const layers = state.layers.map((candidate) => (
        isVisualCanvasLayer(candidate) && candidate.visible
          ? { ...candidate, visible: false, updatedAt: now }
          : candidate
      )) as UmbraCanvasLayer[];
      const activeMaskIndex = layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'replace_source_asset': {
      const sourceIndex = state.layers.findIndex((layer) => layer.kind === 'raster' && layer.role === 'source');
      if (sourceIndex < 0) return state;
      const source = state.layers[sourceIndex] as UmbraCanvasRasterLayer;
      const now = Date.now();
      const layers = [...state.layers];
      layers[sourceIndex] = {
        ...source,
        name: String(action.name || action.asset.name || source.name).trim() || source.name,
        asset: action.asset,
        locked: true,
        updatedAt: now,
      };
      return commit(state, {
        layers,
        activeLayerId: source.id,
        previewStageId: '',
      });
    }
    case 'replace_raster_asset':
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'raster' && layer.role !== 'source' ? { ...layer, asset: action.asset } : layer
      ));
    case 'apply_raster_filter': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId && layer.kind === 'raster');
      if (index < 0) return state;
      const sourceLayer = state.layers[index] as UmbraCanvasRasterLayer;
      if (sourceLayer.role !== 'source') {
        return patchLayer(state, sourceLayer.id, (layer) => layer.kind === 'raster' ? {
          ...layer,
          asset: action.asset,
          transform: action.transform,
          name: String(action.name || layer.name).trim() || layer.name,
        } : layer);
      }
      const now = Date.now();
      const filtered: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', String(action.name || `${sourceLayer.name} Filtered`), action.asset.width, action.asset.height, now),
        kind: 'raster',
        role: 'paint',
        asset: action.asset,
        transform: action.transform,
        smoothing: sourceLayer.smoothing,
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
      };
      const layers = state.layers.map((layer) => layer.id === sourceLayer.id ? { ...layer, visible: false, updatedAt: now } : layer) as UmbraCanvasLayer[];
      layers.splice(index + 1, 0, filtered);
      return commit(state, { layers, activeLayerId: filtered.id, previewStageId: '' });
    }
    case 'apply_control_filter':
      return patchLayer(state, action.layerId, (layer) => layer.kind === 'control' ? {
        ...layer,
        asset: action.asset,
        transform: action.transform,
        name: String(action.name || layer.name).trim() || layer.name,
        controlType: action.resetPreprocessor ? 'raw' : layer.controlType,
      } : layer);
    case 'merge_down': {
      const upperIndex = state.layers.findIndex((layer) => layer.id === action.upperLayerId);
      const lowerIndex = state.layers.findIndex((layer) => layer.id === action.lowerLayerId);
      if (upperIndex < 0 || lowerIndex < 0 || upperIndex <= lowerIndex) return state;
      const upper = state.layers[upperIndex];
      const lower = state.layers[lowerIndex];
      const isVisual = (layer: UmbraCanvasLayer): layer is UmbraCanvasRasterLayer | UmbraCanvasTextLayer | UmbraCanvasGradientLayer => (
        layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient'
      );
      if (!isVisual(upper) || !isVisual(lower) || upper.groupId !== lower.groupId) return state;
      if (upper.kind === 'raster' && upper.role === 'source') return state;
      const now = Date.now();
      const merged: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', String(action.name || `${lower.name} + ${upper.name}`), state.width, state.height, now),
        kind: 'raster',
        role: 'paint',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
        groupId: lower.groupId,
      };
      const lowerIsSource = lower.kind === 'raster' && lower.role === 'source';
      const removedIds = new Set([upper.id, ...(lowerIsSource ? [] : [lower.id])]);
      const removedMaskIds = new Set(
        [upper, ...(lowerIsSource ? [] : [lower])]
          .flatMap((layer) => layer.kind === 'raster' && layer.maskLayerId ? [layer.maskLayerId] : []),
      );
      const layers = state.layers
        .filter((layer) => !removedIds.has(layer.id) && !removedMaskIds.has(layer.id))
        .map((layer) => lowerIsSource && layer.id === lower.id
          ? { ...layer, visible: false, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      const retainedLowerIndex = lowerIsSource
        ? layers.findIndex((layer) => layer.id === lower.id) + 1
        : state.layers.slice(0, lowerIndex).filter((layer) => !removedIds.has(layer.id) && !removedMaskIds.has(layer.id)).length;
      layers.splice(Math.max(0, retainedLowerIndex), 0, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'merge_control_down': {
      const upperIndex = state.layers.findIndex((layer) => layer.id === action.upperLayerId);
      const lowerIndex = state.layers.findIndex((layer) => layer.id === action.lowerLayerId);
      const upper = state.layers[upperIndex];
      const lower = state.layers[lowerIndex];
      if (upperIndex < 0 || lowerIndex < 0 || upperIndex <= lowerIndex || upper?.kind !== 'control' || lower?.kind !== 'control') return state;
      const now = Date.now();
      const merged: UmbraCanvasControlLayer = {
        ...upper,
        id: createId('canvas-control'),
        name: String(action.name || `${lower.name} + ${upper.name}`).trim() || 'Merged Control',
        asset: action.asset,
        controlType: 'raw',
        visible: true,
        enabled: upper.enabled || lower.enabled,
        locked: false,
        groupId: upper.groupId === lower.groupId ? upper.groupId : undefined,
        transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
        createdAt: now,
        updatedAt: now,
      };
      const removed = new Set([upper.id, lower.id]);
      const insertionIndex = state.layers.slice(0, lowerIndex).filter((layer) => !removed.has(layer.id)).length;
      const layers = state.layers.filter((layer) => !removed.has(layer.id));
      layers.splice(insertionIndex, 0, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'merge_inpaint_masks_down': {
      const upperIndex = state.layers.findIndex((layer) => layer.id === action.upperLayerId);
      const lowerIndex = state.layers.findIndex((layer) => layer.id === action.lowerLayerId);
      const upper = state.layers[upperIndex];
      const lower = state.layers[lowerIndex];
      const dataUrl = String(action.dataUrl || '').trim();
      if (upperIndex < 0 || lowerIndex < 0 || upperIndex <= lowerIndex
        || upper?.kind !== 'mask' || upper.purpose !== 'inpaint' || upper.frozen
        || lower?.kind !== 'mask' || lower.purpose !== 'inpaint' || lower.frozen || !dataUrl) return state;
      const now = Date.now();
      const merged: UmbraCanvasMaskLayer = {
        ...upper,
        id: createId('canvas-mask'),
        name: String(action.name || `${lower.name} + ${upper.name}`).trim() || 'Merged Inpaint Mask',
        dataUrl,
        visible: true,
        enabled: upper.enabled || lower.enabled,
        locked: false,
        groupId: upper.groupId === lower.groupId ? upper.groupId : undefined,
        transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
        createdAt: now,
        updatedAt: now,
      };
      const removed = new Set([upper.id, lower.id]);
      const insertionIndex = state.layers.slice(0, lowerIndex).filter((layer) => !removed.has(layer.id)).length;
      const layers = state.layers.filter((layer) => !removed.has(layer.id));
      layers.splice(insertionIndex, 0, merged);
      return commit(state, {
        layers,
        activeLayerId: merged.id,
        activeMaskLayerId: merged.id,
        previewStageId: '',
      });
    }
    case 'merge_regional_guidance_down': {
      const upperIndex = state.layers.findIndex((layer) => layer.id === action.upperLayerId);
      const lowerIndex = state.layers.findIndex((layer) => layer.id === action.lowerLayerId);
      const upper = state.layers[upperIndex];
      const lower = state.layers[lowerIndex];
      const dataUrl = String(action.dataUrl || '').trim();
      if (upperIndex < 0 || lowerIndex < 0 || upperIndex <= lowerIndex || upper?.kind !== 'regional_guidance' || lower?.kind !== 'regional_guidance' || !dataUrl) return state;
      const upperMask = state.layers.find((layer) => layer.id === upper.maskLayerId);
      const lowerMask = state.layers.find((layer) => layer.id === lower.maskLayerId);
      const now = Date.now();
      const name = String(action.name || `${lower.name} + ${upper.name}`).trim() || 'Merged Region';
      const privateMask: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', `${name} Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'regional_guidance',
        dataUrl,
        frozen: true,
        noiseLevel: Math.max(lowerMask?.kind === 'mask' ? lowerMask.noiseLevel : 0, upperMask?.kind === 'mask' ? upperMask.noiseLevel : 0),
        denoiseLimit: Math.min(lowerMask?.kind === 'mask' ? lowerMask.denoiseLimit : 1, upperMask?.kind === 'mask' ? upperMask.denoiseLimit : 1),
        overlayColor: defaultMaskOverlayColor('regional_guidance'),
        overlayStyle: 'solid',
        locked: true,
        visible: false,
        groupId: upper.groupId === lower.groupId ? upper.groupId : undefined,
      };
      const merged: UmbraCanvasRegionalGuidanceLayer = {
        ...upper,
        id: createId('canvas-regional_guidance'),
        name,
        maskLayerId: privateMask.id,
        visible: true,
        enabled: upper.enabled || lower.enabled,
        locked: false,
        groupId: upper.groupId === lower.groupId ? upper.groupId : undefined,
        transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
        createdAt: now,
        updatedAt: now,
      };
      const removed = new Set([upper.id, lower.id, upper.maskLayerId, lower.maskLayerId]);
      const insertionIndex = state.layers.slice(0, lowerIndex).filter((layer) => !removed.has(layer.id)).length;
      const layers = state.layers
        .filter((layer) => !removed.has(layer.id))
        .map((layer) => layer.kind === 'reference' && (layer.regionLayerId === upper.id || layer.regionLayerId === lower.id)
          ? { ...layer, regionLayerId: merged.id, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      layers.splice(insertionIndex, 0, privateMask, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'merge_visible_controls': {
      const requestedIds = new Set(action.layerIds);
      const selected = state.layers.filter((layer): layer is UmbraCanvasControlLayer => requestedIds.has(layer.id) && layer.kind === 'control');
      if (selected.length < 2 || selected.some((layer) => !layer.visible)) return state;
      const selectedIds = new Set(selected.map((layer) => layer.id));
      const top = selected[selected.length - 1];
      const firstSelectedIndex = state.layers.findIndex((layer) => selectedIds.has(layer.id));
      if (!top || firstSelectedIndex < 0) return state;
      const now = Date.now();
      const commonGroupId = selected.every((layer) => layer.groupId === selected[0]?.groupId) ? selected[0]?.groupId : undefined;
      const merged: UmbraCanvasControlLayer = {
        ...top,
        id: createId('canvas-control'),
        name: String(action.name || `Merged ${selected.length} Controls`).trim() || `Merged ${selected.length} Controls`,
        asset: action.asset,
        controlType: 'raw',
        visible: true,
        enabled: selected.some((layer) => layer.enabled),
        locked: false,
        groupId: commonGroupId,
        transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
        createdAt: now,
        updatedAt: now,
      };
      const layers = state.layers.filter((layer) => !selectedIds.has(layer.id));
      const insertionIndex = state.layers.slice(0, firstSelectedIndex).filter((layer) => !selectedIds.has(layer.id)).length;
      layers.splice(insertionIndex, 0, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'merge_visible_inpaint_masks': {
      const requestedIds = new Set(action.layerIds);
      const selected = state.layers.filter((layer): layer is UmbraCanvasMaskLayer => (
        requestedIds.has(layer.id) && layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen
      ));
      const dataUrl = String(action.dataUrl || '').trim();
      if (selected.length < 2 || selected.some((layer) => !layer.visible) || !dataUrl) return state;
      const selectedIds = new Set(selected.map((layer) => layer.id));
      const top = selected[selected.length - 1];
      const firstSelectedIndex = state.layers.findIndex((layer) => selectedIds.has(layer.id));
      if (!top || firstSelectedIndex < 0) return state;
      const now = Date.now();
      const commonGroupId = selected.every((layer) => layer.groupId === selected[0]?.groupId) ? selected[0]?.groupId : undefined;
      const merged: UmbraCanvasMaskLayer = {
        ...top,
        id: createId('canvas-mask'),
        name: String(action.name || `Merged ${selected.length} Inpaint Masks`).trim() || `Merged ${selected.length} Inpaint Masks`,
        dataUrl,
        visible: true,
        enabled: selected.some((layer) => layer.enabled),
        locked: false,
        groupId: commonGroupId,
        transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
        createdAt: now,
        updatedAt: now,
      };
      const layers = state.layers.filter((layer) => !selectedIds.has(layer.id));
      const insertionIndex = state.layers.slice(0, firstSelectedIndex).filter((layer) => !selectedIds.has(layer.id)).length;
      layers.splice(insertionIndex, 0, merged);
      return commit(state, {
        layers,
        activeLayerId: merged.id,
        activeMaskLayerId: merged.id,
        previewStageId: '',
      });
    }
    case 'merge_visible_regional_guidance': {
      const requestedIds = new Set(action.layerIds);
      const selected = state.layers.filter((layer): layer is UmbraCanvasRegionalGuidanceLayer => requestedIds.has(layer.id) && layer.kind === 'regional_guidance');
      const dataUrl = String(action.dataUrl || '').trim();
      if (selected.length < 2 || selected.some((layer) => !layer.visible) || !dataUrl) return state;
      const selectedIds = new Set(selected.map((layer) => layer.id));
      const top = selected[selected.length - 1];
      const firstSelectedIndex = state.layers.findIndex((layer) => selectedIds.has(layer.id));
      if (!top || firstSelectedIndex < 0) return state;
      const selectedMaskIds = new Set(selected.map((layer) => layer.maskLayerId));
      const selectedMasks = state.layers.filter((layer): layer is UmbraCanvasMaskLayer => selectedMaskIds.has(layer.id) && layer.kind === 'mask');
      const now = Date.now();
      const name = String(action.name || `Merged ${selected.length} Regions`).trim() || `Merged ${selected.length} Regions`;
      const commonGroupId = selected.every((layer) => layer.groupId === selected[0]?.groupId) ? selected[0]?.groupId : undefined;
      const privateMask: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', `${name} Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'regional_guidance',
        dataUrl,
        frozen: true,
        noiseLevel: Math.max(0, ...selectedMasks.map((mask) => mask.noiseLevel)),
        denoiseLimit: Math.min(1, ...selectedMasks.map((mask) => mask.denoiseLimit)),
        overlayColor: defaultMaskOverlayColor('regional_guidance'),
        overlayStyle: 'solid',
        locked: true,
        visible: false,
        groupId: commonGroupId,
      };
      const merged: UmbraCanvasRegionalGuidanceLayer = {
        ...top,
        id: createId('canvas-regional_guidance'),
        name,
        maskLayerId: privateMask.id,
        visible: true,
        enabled: selected.some((layer) => layer.enabled),
        locked: false,
        groupId: commonGroupId,
        transform: { x: 0, y: 0, width: state.width, height: state.height, rotation: 0, scaleX: 1, scaleY: 1 },
        createdAt: now,
        updatedAt: now,
      };
      const removedIds = new Set([...selectedIds, ...selectedMaskIds]);
      const layers = state.layers
        .filter((layer) => !removedIds.has(layer.id))
        .map((layer) => layer.kind === 'reference' && layer.regionLayerId && selectedIds.has(layer.regionLayerId)
          ? { ...layer, regionLayerId: merged.id, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      const insertionIndex = state.layers.slice(0, firstSelectedIndex).filter((layer) => !removedIds.has(layer.id)).length;
      layers.splice(insertionIndex, 0, privateMask, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'boolean_raster_layers': {
      const lowerIndex = state.layers.findIndex((layer) => layer.id === action.lowerLayerId);
      const upperIndex = state.layers.findIndex((layer) => layer.id === action.upperLayerId);
      if (lowerIndex < 0 || upperIndex < 0 || lowerIndex >= upperIndex) return state;
      const lower = state.layers[lowerIndex];
      const upper = state.layers[upperIndex];
      if (lower.kind !== 'raster' || upper.kind !== 'raster') return state;
      const operationNames: Record<UmbraCanvasBooleanOperation, string> = {
        intersect: 'Intersect',
        cut_out: 'Cut Out',
        cut_away: 'Cut Away',
        exclude: 'Exclude',
      };
      if (!operationNames[action.operation]) return state;
      const now = Date.now();
      const result: UmbraCanvasRasterLayer = {
        ...baseLayer(
          'raster',
          String(action.name || `${lower.name} ${operationNames[action.operation]} ${upper.name}`).trim(),
          state.width,
          state.height,
          now,
        ),
        kind: 'raster',
        role: 'paint',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
        groupId: lower.groupId === upper.groupId ? lower.groupId : undefined,
      };
      const sourceIds = new Set([lower.id, upper.id]);
      const layers = state.layers.map((layer) => sourceIds.has(layer.id)
        ? { ...layer, visible: false, updatedAt: now }
        : layer) as UmbraCanvasLayer[];
      layers.splice(upperIndex + 1, 0, result);
      return commit(state, { layers, activeLayerId: result.id, previewStageId: '' });
    }
    case 'group_layers': {
      const requestedIds = new Set(action.layerIds);
      const selected = state.layers.filter((layer) => (
        requestedIds.has(layer.id)
        && isVisualCanvasLayer(layer)
        && !(layer.kind === 'raster' && layer.role === 'source')
      ));
      if (selected.length < 2) return state;
      const selectedIds = new Set(selected.map((layer) => layer.id));
      const firstSelectedIndex = state.layers.findIndex((layer) => selectedIds.has(layer.id));
      if (firstSelectedIndex < 0) return state;
      const now = Date.now();
      const groupIndex = state.layers.filter((layer) => layer.kind === 'group').length + 1;
      const group: UmbraCanvasGroupLayer = {
        ...baseLayer('group', String(action.name || `Group ${groupIndex}`).trim() || `Group ${groupIndex}`, state.width, state.height, now),
        kind: 'group',
        collapsed: false,
      };
      const layers = state.layers.map((layer) => selectedIds.has(layer.id)
        ? { ...layer, groupId: group.id, updatedAt: now }
        : layer) as UmbraCanvasLayer[];
      layers.splice(firstSelectedIndex, 0, group);
      return commit(state, { layers, activeLayerId: group.id, previewStageId: '' });
    }
    case 'merge_selected': {
      const requestedIds = new Set(action.layerIds);
      const selected = state.layers.filter((layer) => requestedIds.has(layer.id) && isVisualCanvasLayer(layer));
      if (selected.length < 2) return state;
      const selectedIds = new Set(selected.map((layer) => layer.id));
      const removedIds = new Set(selected
        .filter((layer) => !(layer.kind === 'raster' && layer.role === 'source'))
        .map((layer) => layer.id));
      const removedMaskIds = new Set(selected.flatMap((layer) => (
        removedIds.has(layer.id) && layer.kind === 'raster' && layer.maskLayerId ? [layer.maskLayerId] : []
      )));
      const firstSelectedIndex = state.layers.findIndex((layer) => selectedIds.has(layer.id));
      if (firstSelectedIndex < 0) return state;
      const now = Date.now();
      const commonGroupId = selected.every((layer) => layer.groupId === selected[0].groupId)
        ? selected[0].groupId
        : undefined;
      const merged: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', String(action.name || `Merged ${selected.length} Layers`).trim() || `Merged ${selected.length} Layers`, state.width, state.height, now),
        kind: 'raster',
        role: 'paint',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
        groupId: commonGroupId,
      };
      const keep = (layer: UmbraCanvasLayer) => !removedIds.has(layer.id) && !removedMaskIds.has(layer.id);
      const layers = state.layers
        .filter(keep)
        .map((layer) => selectedIds.has(layer.id) && layer.kind === 'raster' && layer.role === 'source'
          ? { ...layer, visible: false, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      let insertionIndex = state.layers.slice(0, firstSelectedIndex).filter(keep).length;
      const retainedSourceIndex = layers.findIndex((layer) => (
        selectedIds.has(layer.id) && layer.kind === 'raster' && layer.role === 'source'
      ));
      if (retainedSourceIndex >= 0) insertionIndex = Math.max(insertionIndex, retainedSourceIndex + 1);
      layers.splice(insertionIndex, 0, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'merge_group': {
      const groupIndex = state.layers.findIndex((layer) => layer.id === action.groupId && layer.kind === 'group');
      if (groupIndex < 0) return state;
      const children = state.layers.filter((layer) => (
        layer.groupId === action.groupId && (layer.kind === 'raster' || layer.kind === 'text' || layer.kind === 'gradient')
      ));
      if (children.length <= 0) return state;
      const childIds = new Set(children.map((layer) => layer.id));
      const linkedMaskIds = new Set(children.flatMap((layer) => layer.kind === 'raster' && layer.maskLayerId ? [layer.maskLayerId] : []));
      const now = Date.now();
      const merged: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', String(action.name || 'Merged Group'), state.width, state.height, now),
        kind: 'raster',
        role: 'paint',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
      };
      const keep = (layer: UmbraCanvasLayer) => layer.id !== action.groupId && !childIds.has(layer.id) && !linkedMaskIds.has(layer.id);
      const insertionIndex = state.layers.slice(0, groupIndex).filter(keep).length;
      const layers = state.layers.filter(keep);
      layers.splice(insertionIndex, 0, merged);
      return commit(state, { layers, activeLayerId: merged.id, previewStageId: '' });
    }
    case 'flatten_visible': {
      const visibleVisualLayers = state.layers.filter((layer) => isEffectivelyVisibleVisualLayer(state, layer));
      if (visibleVisualLayers.length <= 0) return state;
      const hasProtectedVisibleLayer = visibleVisualLayers.some((layer) => {
        if (isImmutableSourceLayer(layer)) return false;
        const group = layer.groupId
          ? state.layers.find((candidate) => candidate.id === layer.groupId && candidate.kind === 'group')
          : null;
        return layer.locked || group?.locked === true;
      });
      if (hasProtectedVisibleLayer) return state;
      const removedVisualIds = new Set(visibleVisualLayers
        .filter((layer) => !isImmutableSourceLayer(layer))
        .map((layer) => layer.id));
      const linkedMaskIds = new Set(visibleVisualLayers.flatMap((layer) => (
        removedVisualIds.has(layer.id) && layer.kind === 'raster' && layer.maskLayerId ? [layer.maskLayerId] : []
      )));
      const now = Date.now();
      const flattened: UmbraCanvasRasterLayer = {
        ...baseLayer('raster', String(action.name || 'Flattened Canvas'), state.width, state.height, now),
        kind: 'raster',
        role: 'paint',
        asset: action.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
      };
      let layers = state.layers
        .filter((layer) => !removedVisualIds.has(layer.id) && !linkedMaskIds.has(layer.id))
        .map((layer) => isImmutableSourceLayer(layer) && visibleVisualLayers.some((visibleLayer) => visibleLayer.id === layer.id)
          ? { ...layer, visible: false, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      const groupsWithRemainingChildren = new Set(layers.flatMap((layer) => layer.groupId ? [layer.groupId] : []));
      layers = layers.filter((layer) => (
        layer.kind !== 'group'
        || layer.locked
        || layer.visible === false
        || groupsWithRemainingChildren.has(layer.id)
      ));
      const activeMaskIndex = layers.findIndex((layer) => layer.id === state.activeMaskLayerId);
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, flattened);
      return commit(state, { layers, activeLayerId: flattened.id, previewStageId: '' });
    }
    case 'add_regional_guidance': {
      const dataUrl = String(action.dataUrl || '').trim();
      if (!dataUrl) return state;
      const now = Date.now();
      const regionIndex = state.layers.filter((layer) => layer.kind === 'regional_guidance').length + 1;
      const regionName = String(action.name || `Region ${regionIndex}`).trim() || `Region ${regionIndex}`;
      const maskLayer: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', `${regionName} Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'regional_guidance',
        dataUrl,
        frozen: true,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('regional_guidance'),
        overlayStyle: 'solid',
        locked: true,
        visible: false,
      };
      const guidanceLayer: UmbraCanvasRegionalGuidanceLayer = {
        ...baseLayer('regional_guidance', regionName, state.width, state.height, now),
        kind: 'regional_guidance',
        enabled: true,
        maskLayerId: maskLayer.id,
        positivePrompt: String(action.positivePrompt || '').trim(),
        negativePrompt: String(action.negativePrompt || '').trim(),
        autoNegative: action.autoNegative === true,
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
      };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const insertionIndex = activeMaskIndex >= 0 ? activeMaskIndex : state.layers.length;
      const layers = [...state.layers];
      layers.splice(insertionIndex, 0, maskLayer, guidanceLayer);
      return commit(state, { layers, activeLayerId: guidanceLayer.id, previewStageId: '' });
    }
    case 'update_regional_guidance':
      return patchLayer(state, action.layerId, (layer) => {
        if (layer.kind !== 'regional_guidance') return layer;
        const beginStepPercent = action.changes.beginStepPercent === undefined
          ? layer.beginStepPercent
          : clamp(action.changes.beginStepPercent, 0, 1);
        const endStepPercent = action.changes.endStepPercent === undefined
          ? layer.endStepPercent
          : clamp(action.changes.endStepPercent, 0, 1);
        return {
          ...layer,
          ...action.changes,
          positivePrompt: action.changes.positivePrompt === undefined ? layer.positivePrompt : String(action.changes.positivePrompt),
          negativePrompt: action.changes.negativePrompt === undefined ? layer.negativePrompt : String(action.changes.negativePrompt),
          autoNegative: action.changes.autoNegative === undefined ? layer.autoNegative : action.changes.autoNegative === true,
          weight: action.changes.weight === undefined ? layer.weight : clamp(action.changes.weight, 0, 10),
          beginStepPercent: Math.min(beginStepPercent, endStepPercent),
          endStepPercent: Math.max(beginStepPercent, endStepPercent),
        };
      });
    case 'add_control_layer': {
      const now = Date.now();
      const controlIndex = state.layers.filter((layer) => layer.kind === 'control').length + 1;
      const name = String(action.name || `Control ${controlIndex}`).trim() || `Control ${controlIndex}`;
      const layer: UmbraCanvasControlLayer = {
        ...baseLayer('control', name, action.asset.width, action.asset.height, now),
        kind: 'control',
        enabled: true,
        lightnessToAlpha: true,
        asset: action.asset,
        adapterType: action.adapterType || 'controlnet',
        controlMode: action.controlMode || 'balanced',
        controlType: action.controlType || 'raw',
        modelName: String(action.modelName || '').trim(),
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
        processorResolution: 512,
        lowThreshold: 100,
        highThreshold: 200,
        detectBody: true,
        detectFace: true,
        detectHands: true,
        maxFaces: 10,
        minimumConfidence: 0.5,
        scoreThreshold: 0.1,
        distanceThreshold: 0.1,
        normalStrength: Math.PI * 2,
        backgroundThreshold: 0.1,
        safeMode: true,
        processorSeed: 0,
      };
      layer.transform = { ...layer.transform, ...action.transform };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'update_control_layer':
      return patchLayer(state, action.layerId, (layer) => {
        if (layer.kind !== 'control') return layer;
        const adapterType = action.changes.adapterType === undefined ? layer.adapterType : action.changes.adapterType;
        const beginStepPercent = action.changes.beginStepPercent === undefined
          ? layer.beginStepPercent
          : clamp(action.changes.beginStepPercent, 0, 1);
        const endStepPercent = action.changes.endStepPercent === undefined
          ? layer.endStepPercent
          : clamp(action.changes.endStepPercent, 0, 1);
        return {
          ...layer,
          ...action.changes,
          adapterType,
          modelName: action.changes.modelName === undefined ? layer.modelName : String(action.changes.modelName),
          weight: action.changes.weight === undefined ? layer.weight : clamp(action.changes.weight, 0, 10),
          beginStepPercent: adapterType === 'z_image_control' ? 0 : Math.min(beginStepPercent, endStepPercent),
          endStepPercent: adapterType === 'z_image_control' ? 1 : Math.max(beginStepPercent, endStepPercent),
          processorResolution: action.changes.processorResolution === undefined
            ? layer.processorResolution
            : clamp(Math.round(action.changes.processorResolution), 64, 4096),
          lowThreshold: action.changes.lowThreshold === undefined ? layer.lowThreshold : clamp(Math.round(action.changes.lowThreshold), 0, 255),
          highThreshold: action.changes.highThreshold === undefined ? layer.highThreshold : clamp(Math.round(action.changes.highThreshold), 0, 255),
          maxFaces: action.changes.maxFaces === undefined ? layer.maxFaces : clamp(Math.round(action.changes.maxFaces), 1, 50),
          minimumConfidence: action.changes.minimumConfidence === undefined ? layer.minimumConfidence : clamp(action.changes.minimumConfidence, 0.1, 1),
          scoreThreshold: action.changes.scoreThreshold === undefined ? layer.scoreThreshold : clamp(action.changes.scoreThreshold, 0.01, 2),
          distanceThreshold: action.changes.distanceThreshold === undefined ? layer.distanceThreshold : clamp(action.changes.distanceThreshold, 0.01, 20),
          normalStrength: action.changes.normalStrength === undefined ? layer.normalStrength : clamp(action.changes.normalStrength, 0, Math.PI * 5),
          backgroundThreshold: action.changes.backgroundThreshold === undefined ? layer.backgroundThreshold : clamp(action.changes.backgroundThreshold, 0, 1),
          safeMode: action.changes.safeMode === undefined ? layer.safeMode : action.changes.safeMode === true,
          processorSeed: action.changes.processorSeed === undefined
            ? layer.processorSeed
            : Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(Number(action.changes.processorSeed) || 0))),
        };
      });
    case 'bake_control_preprocessor':
      return patchLayer(state, action.layerId, (layer) => layer.kind === 'control'
        ? {
          ...layer,
          asset: action.asset,
          controlType: 'raw',
          name: String(action.name || layer.name).trim() || layer.name,
          }
        : layer);
    case 'convert_raster_to_control': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      const source = state.layers[index];
      if (index < 0 || source?.kind !== 'raster' || source.role === 'source') return state;
      const now = Date.now();
      const name = String(action.name || `${source.name} Control`).trim() || `${source.name} Control`;
      const control: UmbraCanvasControlLayer = {
        ...convertedLayerBase(source, 'control', name, now, {
          x: 0,
          y: 0,
          width: state.width,
          height: state.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        }),
        kind: 'control',
        enabled: true,
        lightnessToAlpha: true,
        asset: action.asset,
        adapterType: action.adapterType || 'controlnet',
        controlMode: action.controlMode || 'balanced',
        controlType: 'raw',
        modelName: String(action.modelName || '').trim(),
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
        processorResolution: 512,
        lowThreshold: 100,
        highThreshold: 200,
        detectBody: true,
        detectFace: true,
        detectHands: true,
        maxFaces: 10,
        minimumConfidence: 0.5,
        scoreThreshold: 0.1,
        distanceThreshold: 0.1,
        normalStrength: Math.PI * 2,
        backgroundThreshold: 0.1,
        safeMode: true,
        processorSeed: 0,
      };
      const removedMaskId = source.maskLayerId || '';
      const layers = state.layers.filter((layer) => layer.id !== removedMaskId);
      const replacementIndex = layers.findIndex((layer) => layer.id === source.id);
      layers.splice(replacementIndex, 1, control);
      return commit(state, {
        layers,
        activeLayerId: state.activeLayerId === removedMaskId ? control.id : state.activeLayerId,
        previewStageId: '',
      });
    }
    case 'convert_control_to_raster': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      const source = state.layers[index];
      if (index < 0 || source?.kind !== 'control') return state;
      const now = Date.now();
      const raster: UmbraCanvasRasterLayer = {
        ...convertedLayerBase(
          source,
          'raster',
          String(action.name || source.name.replace(/\s+Control$/i, '') || 'Imported Layer').trim() || 'Imported Layer',
          now,
        ),
        kind: 'raster',
        role: 'imported',
        asset: source.asset,
        smoothing: 'high',
        transparencyLocked: false,
        adjustments: defaultRasterAdjustments(),
      };
      const layers = [...state.layers];
      layers.splice(index, 1, raster);
      return commit(state, { layers, previewStageId: '' });
    }
    case 'convert_layer_to_inpaint_mask': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      const source = state.layers[index];
      const dataUrl = String(action.dataUrl || '').trim();
      const convertible = source?.kind === 'control'
        || source?.kind === 'text'
        || source?.kind === 'gradient'
        || source?.kind === 'raster' && source.role !== 'source';
      if (index < 0 || !source || !convertible || !dataUrl) return state;
      const now = Date.now();
      const name = String(action.name || `${source.name} Mask`).trim() || `${source.name} Mask`;
      const mask: UmbraCanvasMaskLayer = {
        ...convertedLayerBase(source, 'mask', name, now, {
          x: 0,
          y: 0,
          width: state.width,
          height: state.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        }),
        kind: 'mask',
        enabled: 'enabled' in source ? source.enabled : true,
        purpose: 'inpaint',
        dataUrl,
        frozen: false,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('inpaint'),
        overlayStyle: 'solid',
        locked: false,
      };
      const removedMaskId = source.kind === 'raster' ? source.maskLayerId || '' : '';
      const layers = state.layers.filter((layer) => layer.id !== removedMaskId);
      const replacementIndex = layers.findIndex((layer) => layer.id === source.id);
      layers.splice(replacementIndex, 1, mask);
      return commit(state, {
        layers,
        activeLayerId: mask.id,
        activeMaskLayerId: mask.id,
        previewStageId: '',
      });
    }
    case 'convert_layer_to_regional_guidance': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      const source = state.layers[index];
      const dataUrl = String(action.dataUrl || '').trim();
      const convertible = source?.kind === 'control'
        || source?.kind === 'text'
        || source?.kind === 'gradient'
        || source?.kind === 'raster' && source.role !== 'source';
      if (index < 0 || !source || !convertible || !dataUrl) return state;
      const now = Date.now();
      const name = String(action.name || `${source.name} Region`).trim() || `${source.name} Region`;
      const maskLayer: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', `${name} Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'regional_guidance',
        dataUrl,
        frozen: true,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('regional_guidance'),
        overlayStyle: 'solid',
        locked: true,
        visible: false,
        groupId: source.groupId,
      };
      const guidanceLayer: UmbraCanvasRegionalGuidanceLayer = {
        ...convertedLayerBase(source, 'regional_guidance', name, now, {
          x: 0,
          y: 0,
          width: state.width,
          height: state.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        }),
        kind: 'regional_guidance',
        enabled: 'enabled' in source ? source.enabled : true,
        maskLayerId: maskLayer.id,
        positivePrompt: '',
        negativePrompt: '',
        autoNegative: false,
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
      };
      const removedMaskId = source.kind === 'raster' ? source.maskLayerId || '' : '';
      const layers = state.layers.filter((layer) => layer.id !== removedMaskId);
      const replacementIndex = layers.findIndex((layer) => layer.id === source.id);
      layers.splice(replacementIndex, 1, maskLayer, guidanceLayer);
      return commit(state, {
        layers,
        activeLayerId: guidanceLayer.id,
        previewStageId: '',
      });
    }
    case 'convert_inpaint_mask_to_regional_guidance': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      const source = state.layers[index];
      if (index < 0 || source?.kind !== 'mask' || source.purpose !== 'inpaint' || source.frozen) return state;
      const now = Date.now();
      const name = String(action.name || source.name.replace(/\s+Mask$/i, '') || 'Region').trim() || 'Region';
      const privateMask: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', `${name} Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'regional_guidance',
        dataUrl: source.dataUrl,
        frozen: true,
        noiseLevel: source.noiseLevel,
        denoiseLimit: source.denoiseLimit,
        overlayColor: defaultMaskOverlayColor('regional_guidance'),
        overlayStyle: source.overlayStyle,
        locked: true,
        visible: false,
        groupId: source.groupId,
      };
      const guidanceLayer: UmbraCanvasRegionalGuidanceLayer = {
        ...convertedLayerBase(source, 'regional_guidance', name, now),
        kind: 'regional_guidance',
        enabled: source.enabled,
        maskLayerId: privateMask.id,
        positivePrompt: '',
        negativePrompt: '',
        autoNegative: false,
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
      };
      const alternateMask = state.layers.find((layer) => (
        layer.id !== source.id && layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen
      )) as UmbraCanvasMaskLayer | undefined;
      const freshMask: UmbraCanvasMaskLayer | null = alternateMask ? null : {
        ...baseLayer('mask', 'Inpaint Mask', state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'inpaint',
        dataUrl: '',
        frozen: false,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('inpaint'),
        overlayStyle: 'solid',
      };
      const layers = [...state.layers];
      layers.splice(index, 1, privateMask, guidanceLayer);
      if (freshMask) layers.push(freshMask);
      return commit(state, {
        layers,
        activeLayerId: guidanceLayer.id,
        activeMaskLayerId: alternateMask?.id || freshMask!.id,
        previewStageId: '',
      });
    }
    case 'convert_regional_guidance_to_inpaint_mask': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      const source = state.layers[index];
      if (index < 0 || source?.kind !== 'regional_guidance') return state;
      const privateMask = state.layers.find((layer) => layer.id === source.maskLayerId);
      if (privateMask?.kind !== 'mask') return state;
      const now = Date.now();
      const name = String(action.name || `${source.name} Mask`).trim() || `${source.name} Mask`;
      const mask: UmbraCanvasMaskLayer = {
        ...convertedLayerBase(source, 'mask', name, now, {
          x: 0,
          y: 0,
          width: state.width,
          height: state.height,
          rotation: 0,
          scaleX: 1,
          scaleY: 1,
        }),
        kind: 'mask',
        enabled: source.enabled,
        purpose: 'inpaint',
        dataUrl: privateMask.dataUrl,
        frozen: false,
        noiseLevel: privateMask.noiseLevel,
        denoiseLimit: privateMask.denoiseLimit,
        overlayColor: defaultMaskOverlayColor('inpaint'),
        overlayStyle: privateMask.overlayStyle,
        locked: false,
      };
      const layers = state.layers
        .filter((layer) => layer.id !== privateMask.id)
        .map((layer) => layer.kind === 'reference' && layer.regionLayerId === source.id
          ? { ...layer, regionLayerId: undefined, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      const replacementIndex = layers.findIndex((layer) => layer.id === source.id);
      layers.splice(replacementIndex, 1, mask);
      return commit(state, {
        layers,
        activeLayerId: mask.id,
        activeMaskLayerId: mask.id,
        previewStageId: '',
      });
    }
    case 'add_reference_layer': {
      const now = Date.now();
      const referenceIndex = state.layers.filter((layer) => layer.kind === 'reference').length + 1;
      const name = String(action.name || `Reference ${referenceIndex}`).trim() || `Reference ${referenceIndex}`;
      const layer: UmbraCanvasReferenceLayer = {
        ...baseLayer('reference', name, action.asset.width, action.asset.height, now),
        kind: 'reference',
        enabled: true,
        asset: action.asset,
        method: action.method || 'style_model',
        modelName: String(action.modelName || '').trim(),
        visionModelName: String(action.visionModelName || '').trim(),
        crop: 'center',
        strengthType: 'multiply',
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
        ipAdapterWeightType: 'linear',
        ipAdapterCombineEmbeds: 'concat',
        ipAdapterEmbedsScaling: 'V only',
      };
      layer.transform = { ...layer.transform, ...action.transform };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'add_regional_reference_layer': {
      const regionDataUrl = String(action.regionDataUrl || '').trim();
      if (!regionDataUrl) return state;
      const now = Date.now();
      const referenceIndex = state.layers.filter((layer) => layer.kind === 'reference').length + 1;
      const name = String(action.name || `Regional Reference ${referenceIndex}`).trim() || `Regional Reference ${referenceIndex}`;
      const maskLayer: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', `${name} Region Mask`, state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'regional_guidance',
        dataUrl: regionDataUrl,
        frozen: true,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('regional_guidance'),
        overlayStyle: 'solid',
        locked: true,
        visible: false,
      };
      const regionLayer: UmbraCanvasRegionalGuidanceLayer = {
        ...baseLayer('regional_guidance', `${name} Region`, state.width, state.height, now),
        kind: 'regional_guidance',
        enabled: true,
        maskLayerId: maskLayer.id,
        positivePrompt: '',
        negativePrompt: '',
        autoNegative: false,
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
      };
      const referenceLayer: UmbraCanvasReferenceLayer = {
        ...baseLayer('reference', name, action.asset.width, action.asset.height, now),
        kind: 'reference',
        enabled: true,
        asset: action.asset,
        method: 'ip_adapter',
        modelName: String(action.modelName || '').trim(),
        visionModelName: String(action.visionModelName || '').trim(),
        crop: 'center',
        strengthType: 'multiply',
        weight: 1,
        beginStepPercent: 0,
        endStepPercent: 1,
        ipAdapterWeightType: 'linear',
        ipAdapterCombineEmbeds: 'concat',
        ipAdapterEmbedsScaling: 'V only',
        regionLayerId: regionLayer.id,
      };
      referenceLayer.transform = { ...referenceLayer.transform, ...action.transform };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, maskLayer, regionLayer, referenceLayer);
      return commit(state, { layers, activeLayerId: referenceLayer.id, previewStageId: '' });
    }
    case 'replace_reference_asset':
      return patchLayer(state, action.layerId, (layer) => layer.kind === 'reference' ? {
        ...layer,
        asset: action.asset,
        transform: action.transform,
        name: String(action.name || layer.name).trim() || layer.name,
      } : layer);
    case 'update_reference_layer': {
      const previous = state.layers.find((layer) => layer.id === action.layerId);
      const updated = patchLayer(state, action.layerId, (layer) => {
        if (layer.kind !== 'reference') return layer;
        const method = action.changes.method === undefined ? layer.method : action.changes.method;
        let beginStepPercent = action.changes.beginStepPercent === undefined
          ? layer.beginStepPercent
          : clamp(action.changes.beginStepPercent, 0, 1);
        let endStepPercent = action.changes.endStepPercent === undefined
          ? layer.endStepPercent
          : clamp(action.changes.endStepPercent, 0, 1);
        if (beginStepPercent > endStepPercent) {
          if (action.changes.beginStepPercent !== undefined && action.changes.endStepPercent === undefined) {
            endStepPercent = beginStepPercent;
          } else if (action.changes.endStepPercent !== undefined && action.changes.beginStepPercent === undefined) {
            beginStepPercent = endStepPercent;
          } else {
            [beginStepPercent, endStepPercent] = [endStepPercent, beginStepPercent];
          }
        }
        return {
          ...layer,
          ...action.changes,
          method,
          modelName: action.changes.modelName === undefined ? layer.modelName : String(action.changes.modelName),
          visionModelName: action.changes.visionModelName === undefined ? layer.visionModelName : String(action.changes.visionModelName),
          weight: method === 'style_model' || method === 'flux_redux'
            ? action.changes.weight === undefined ? layer.weight : clamp(action.changes.weight, 0, 10)
            : method === 'ip_adapter'
              ? action.changes.weight === undefined ? layer.weight : clamp(action.changes.weight, -1, 5)
              : 1,
          beginStepPercent,
          endStepPercent,
          ipAdapterWeightType: action.changes.ipAdapterWeightType === undefined
            ? layer.ipAdapterWeightType
            : UMBRA_IP_ADAPTER_WEIGHT_TYPES.includes(action.changes.ipAdapterWeightType) ? action.changes.ipAdapterWeightType : 'linear',
          ipAdapterCombineEmbeds: action.changes.ipAdapterCombineEmbeds === undefined
            ? layer.ipAdapterCombineEmbeds
            : UMBRA_IP_ADAPTER_COMBINE_EMBEDS.includes(action.changes.ipAdapterCombineEmbeds) ? action.changes.ipAdapterCombineEmbeds : 'concat',
          ipAdapterEmbedsScaling: action.changes.ipAdapterEmbedsScaling === undefined
            ? layer.ipAdapterEmbedsScaling
            : UMBRA_IP_ADAPTER_EMBEDS_SCALING.includes(action.changes.ipAdapterEmbedsScaling) ? action.changes.ipAdapterEmbedsScaling : 'V only',
          maskLayerId: method === 'ip_adapter' ? layer.maskLayerId : undefined,
          regionLayerId: method === 'ip_adapter' ? layer.regionLayerId : undefined,
        };
      });
      if (previous?.kind !== 'reference' || !previous.maskLayerId || action.changes.method === undefined || action.changes.method === 'ip_adapter') return updated;
      return commit(updated, { layers: updated.layers.filter((layer) => layer.id !== previous.maskLayerId) });
    }
    case 'attach_reference_mask': {
      const referenceIndex = state.layers.findIndex((layer) => layer.id === action.layerId && layer.kind === 'reference');
      if (referenceIndex < 0) return state;
      const reference = state.layers[referenceIndex] as UmbraCanvasReferenceLayer;
      if (reference.method !== 'ip_adapter') return state;
      const dataUrl = String(action.dataUrl || '').trim();
      if (!dataUrl) return state;
      if (reference.maskLayerId) {
        const patched = patchLayer(state, reference.maskLayerId, (layer) => (
          layer.kind === 'mask' ? { ...layer, dataUrl } : layer
        ));
        return patchLayer(patched, reference.id, (layer) => layer.kind === 'reference' ? { ...layer, regionLayerId: undefined } : layer);
      }
      const now = Date.now();
      const mask: UmbraCanvasMaskLayer = {
        ...baseLayer('mask', String(action.name || `${reference.name} Influence Mask`).trim(), state.width, state.height, now),
        kind: 'mask',
        enabled: true,
        purpose: 'reference',
        dataUrl,
        frozen: true,
        noiseLevel: 0,
        denoiseLimit: 1,
        overlayColor: defaultMaskOverlayColor('reference'),
        overlayStyle: 'solid',
      };
      const layers = state.layers.map((layer) => layer.id === reference.id
        ? { ...layer, maskLayerId: mask.id, regionLayerId: undefined, updatedAt: now }
        : layer) as UmbraCanvasLayer[];
      layers.splice(referenceIndex, 0, mask);
      return commit(state, { layers, activeLayerId: reference.id, previewStageId: '' });
    }
    case 'link_reference_region': {
      const reference = state.layers.find((layer) => layer.id === action.layerId);
      const region = state.layers.find((layer) => layer.id === action.regionLayerId);
      if (reference?.kind !== 'reference' || reference.method !== 'ip_adapter' || region?.kind !== 'regional_guidance') return state;
      const now = Date.now();
      const layers = state.layers
        .filter((layer) => !reference.maskLayerId || layer.id !== reference.maskLayerId)
        .map((layer) => layer.id === reference.id
          ? { ...layer, maskLayerId: undefined, regionLayerId: region.id, updatedAt: now }
          : layer) as UmbraCanvasLayer[];
      return commit(state, { layers, activeLayerId: reference.id, previewStageId: '' });
    }
    case 'detach_reference_mask': {
      const reference = state.layers.find((layer) => layer.id === action.layerId);
      if (reference?.kind !== 'reference' || (!reference.maskLayerId && !reference.regionLayerId)) return state;
      const maskLayerId = reference.maskLayerId;
      const now = Date.now();
      const layers = state.layers
        .filter((layer) => !maskLayerId || layer.id !== maskLayerId)
        .map((layer) => layer.id === reference.id ? { ...layer, maskLayerId: undefined, regionLayerId: undefined, updatedAt: now } : layer) as UmbraCanvasLayer[];
      return commit(state, { layers, activeLayerId: reference.id, previewStageId: '' });
    }
    case 'add_group_layer': {
      const now = Date.now();
      const groupIndex = state.layers.filter((layer) => layer.kind === 'group').length + 1;
      const layer: UmbraCanvasGroupLayer = {
        ...baseLayer('group', String(action.name || `Group ${groupIndex}`).trim() || `Group ${groupIndex}`, state.width, state.height, now),
        kind: 'group',
        collapsed: false,
      };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'toggle_group_collapsed':
      return patchLayer(state, action.layerId, (layer) => (
        layer.kind === 'group' ? { ...layer, collapsed: !layer.collapsed } : layer
      ));
    case 'set_layer_group': {
      const groupId = String(action.groupId || '').trim();
      const groupExists = !groupId || state.layers.some((layer) => layer.id === groupId && layer.kind === 'group');
      if (!groupExists) return state;
      return patchLayer(state, action.layerId, (layer) => {
        if (layer.kind === 'group' || layer.kind === 'mask' || (layer.kind === 'raster' && layer.role === 'source')) return layer;
        return { ...layer, groupId: groupId || undefined };
      });
    }
    case 'add_text_layer': {
      const now = Date.now();
      const textIndex = state.layers.filter((layer) => layer.kind === 'text').length + 1;
      const requestedTransform = action.transform || {};
      const width = clamp(Math.round(Number(requestedTransform.width) || Math.min(state.width, 640)), 1, state.width);
      const height = clamp(Math.round(Number(requestedTransform.height) || Math.min(state.height, 200)), 1, state.height);
      const x = clamp(Number.isFinite(Number(requestedTransform.x)) ? Number(requestedTransform.x) : (state.width - width) / 2, 0, Math.max(0, state.width - width));
      const y = clamp(Number.isFinite(Number(requestedTransform.y)) ? Number(requestedTransform.y) : (state.height - height) / 2, 0, Math.max(0, state.height - height));
      const layer: UmbraCanvasTextLayer = {
        ...baseLayer('text', String(action.name || `Text ${textIndex}`).trim() || `Text ${textIndex}`, width, height, now),
        kind: 'text',
        text: String(action.text || 'Umbra Studio'),
        fontFamily: 'Arial',
        fontSize: 64,
        fontWeight: 700,
        italic: false,
        underline: false,
        strikethrough: false,
        color: '#ffffff',
        backgroundColor: 'transparent',
        align: 'center',
        lineHeight: 1.2,
        transform: {
          x,
          y,
          width,
          height,
          rotation: Number.isFinite(Number(requestedTransform.rotation)) ? Number(requestedTransform.rotation) : 0,
          scaleX: Number(requestedTransform.scaleX) < 0 ? -1 : 1,
          scaleY: Number(requestedTransform.scaleY) < 0 ? -1 : 1,
        },
      };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'update_text_layer': {
      const target = state.layers.find((layer) => layer.id === action.layerId);
      if (target?.kind === 'text' && target.locked) return state;
      return patchLayer(state, action.layerId, (layer) => {
        if (layer.kind !== 'text' || layer.locked) return layer;
        return {
          ...layer,
          ...action.changes,
          text: action.changes.text === undefined ? layer.text : String(action.changes.text),
          fontFamily: action.changes.fontFamily === undefined ? layer.fontFamily : String(action.changes.fontFamily || 'Arial').trim() || 'Arial',
          fontSize: action.changes.fontSize === undefined ? layer.fontSize : clamp(action.changes.fontSize, 4, 1024),
          fontWeight: action.changes.fontWeight === undefined ? layer.fontWeight : clamp(Math.round(action.changes.fontWeight / 100) * 100, 100, 900),
          italic: action.changes.italic === undefined ? layer.italic : action.changes.italic === true,
          underline: action.changes.underline === undefined ? layer.underline : action.changes.underline === true,
          strikethrough: action.changes.strikethrough === undefined ? layer.strikethrough : action.changes.strikethrough === true,
          color: action.changes.color === undefined ? layer.color : String(action.changes.color || '#ffffff'),
          backgroundColor: action.changes.backgroundColor === undefined ? layer.backgroundColor : String(action.changes.backgroundColor || 'transparent'),
          align: action.changes.align === 'left' || action.changes.align === 'right' ? action.changes.align : action.changes.align === 'center' ? 'center' : layer.align,
          lineHeight: action.changes.lineHeight === undefined ? layer.lineHeight : clamp(action.changes.lineHeight, 0.5, 4),
        };
      });
    }
    case 'add_gradient_layer': {
      const now = Date.now();
      const gradientIndex = state.layers.filter((layer) => layer.kind === 'gradient').length + 1;
      const endpoints = gradientEndpointsFromAngle(0, state.width, state.height);
      const layer: UmbraCanvasGradientLayer = {
        ...baseLayer('gradient', String(action.name || `Gradient ${gradientIndex}`).trim() || `Gradient ${gradientIndex}`, state.width, state.height, now),
        kind: 'gradient',
        gradientType: action.gradientType === 'radial' ? 'radial' : 'linear',
        angle: 0,
        ...endpoints,
        centerX: 0.5,
        centerY: 0.5,
        radius: 0.5,
        clipEnabled: true,
        stops: Array.isArray(action.stops) && action.stops.length >= 2
          ? action.stops.slice(0, 16).map((stop) => ({ offset: clamp(stop.offset, 0, 1), color: String(stop.color || '#000000') })).sort((left, right) => left.offset - right.offset)
          : [
            { offset: 0, color: '#000000' },
            { offset: 1, color: '#ffffff' },
          ],
      };
      const activeMaskIndex = state.layers.findIndex((candidate) => candidate.id === state.activeMaskLayerId);
      const layers = [...state.layers];
      layers.splice(activeMaskIndex >= 0 ? activeMaskIndex : layers.length, 0, layer);
      return commit(state, { layers, activeLayerId: layer.id, previewStageId: '' });
    }
    case 'update_gradient_layer':
      return patchLayer(state, action.layerId, (layer) => {
        if (layer.kind !== 'gradient') return layer;
        const angle = action.changes.angle === undefined ? layer.angle : Number(action.changes.angle) || 0;
        const hasExplicitEndpoints = action.changes.startX !== undefined
          || action.changes.startY !== undefined
          || action.changes.endX !== undefined
          || action.changes.endY !== undefined;
        const angleEndpoints = action.changes.angle !== undefined && !hasExplicitEndpoints
          ? gradientEndpointsFromAngle(angle, layer.transform.width, layer.transform.height)
          : null;
        const stops = action.changes.stops === undefined
          ? layer.stops
          : action.changes.stops.slice(0, 16).map((stop) => ({
            offset: clamp(stop.offset, 0, 1),
            color: String(stop.color || '#000000'),
          })).sort((left, right) => left.offset - right.offset);
        return {
          ...layer,
          ...action.changes,
          gradientType: action.changes.gradientType === 'radial' ? 'radial' : action.changes.gradientType === 'linear' ? 'linear' : layer.gradientType,
          angle,
          startX: clamp(angleEndpoints?.startX ?? action.changes.startX ?? layer.startX, -8, 9),
          startY: clamp(angleEndpoints?.startY ?? action.changes.startY ?? layer.startY, -8, 9),
          endX: clamp(angleEndpoints?.endX ?? action.changes.endX ?? layer.endX, -8, 9),
          endY: clamp(angleEndpoints?.endY ?? action.changes.endY ?? layer.endY, -8, 9),
          centerX: action.changes.centerX === undefined ? layer.centerX : clamp(action.changes.centerX, 0, 1),
          centerY: action.changes.centerY === undefined ? layer.centerY : clamp(action.changes.centerY, 0, 1),
          radius: action.changes.radius === undefined ? layer.radius : clamp(action.changes.radius, 0.01, 2),
          clipEnabled: action.changes.clipEnabled === undefined ? layer.clipEnabled : action.changes.clipEnabled === true,
          stops: stops.length >= 2 ? stops : layer.stops,
        };
      });
    case 'move_layer': {
      const index = state.layers.findIndex((layer) => layer.id === action.layerId);
      if (index < 0) return state;
      const movingLayer = state.layers[index];
      if (movingLayer.kind === 'raster' && movingLayer.role === 'source') return state;
      if (action.direction === 'front' || action.direction === 'back') {
        const layers = state.layers.filter((layer) => layer.id !== movingLayer.id);
        const sourceIndex = layers.findIndex((layer) => layer.kind === 'raster' && layer.role === 'source');
        const insertionIndex = action.direction === 'front'
          ? layers.length
          : sourceIndex >= 0 ? sourceIndex + 1 : 0;
        layers.splice(insertionIndex, 0, movingLayer);
        if (layers.every((layer, layerIndex) => layer.id === state.layers[layerIndex]?.id)) return state;
        return commit(state, { layers });
      }
      const target = action.direction === 'up' ? index + 1 : index - 1;
      if (target < 0 || target >= state.layers.length) return state;
      const targetLayer = state.layers[target];
      if (targetLayer.kind === 'raster' && targetLayer.role === 'source') return state;
      const layers = [...state.layers];
      [layers[index], layers[target]] = [layers[target], layers[index]];
      return commit(state, { layers });
    }
    case 'reorder_layer': {
      const movingIndex = state.layers.findIndex((layer) => layer.id === action.layerId);
      const targetIndex = state.layers.findIndex((layer) => layer.id === action.targetLayerId);
      if (movingIndex < 0 || targetIndex < 0 || movingIndex === targetIndex) return state;
      const movingLayer = state.layers[movingIndex];
      if (movingLayer.kind === 'raster' && movingLayer.role === 'source') return state;
      const layers = state.layers.filter((layer) => layer.id !== movingLayer.id);
      const retainedTargetIndex = layers.findIndex((layer) => layer.id === action.targetLayerId);
      if (retainedTargetIndex < 0) return state;
      let insertionIndex = retainedTargetIndex + (action.placement === 'after' ? 1 : 0);
      const sourceIndex = layers.findIndex((layer) => layer.kind === 'raster' && layer.role === 'source');
      if (sourceIndex >= 0) insertionIndex = Math.max(sourceIndex + 1, insertionIndex);
      layers.splice(Math.min(layers.length, insertionIndex), 0, movingLayer);
      if (layers.every((layer, index) => layer.id === state.layers[index]?.id)) return state;
      return commit(state, { layers });
    }
    case 'duplicate_layer': {
      const source = state.layers.find((layer) => layer.id === action.layerId);
      if (!source
        || source.kind === 'group'
        || source.kind === 'mask' && (source.frozen || source.purpose !== 'inpaint')
        || isImmutableSourceLayer(source)) return state;
      const now = Date.now();
      if (source.kind === 'mask') {
        const copy: UmbraCanvasMaskLayer = {
          ...source,
          id: createId('canvas-mask'),
          name: `${source.name} Copy`,
          locked: false,
          createdAt: now,
          updatedAt: now,
        };
        const index = state.layers.findIndex((layer) => layer.id === source.id);
        const layers = [...state.layers];
        layers.splice(index + 1, 0, copy);
        return commit(state, {
          layers,
          activeLayerId: copy.id,
          activeMaskLayerId: copy.id,
          previewStageId: '',
        });
      }
      if (source.kind === 'regional_guidance') {
        const sourceMask = state.layers.find((layer) => layer.id === source.maskLayerId && layer.kind === 'mask') as UmbraCanvasMaskLayer | undefined;
        if (!sourceMask) return state;
        const maskCopy: UmbraCanvasMaskLayer = {
          ...sourceMask,
          id: createId('canvas-mask'),
          name: `${sourceMask.name} Copy`,
          createdAt: now,
          updatedAt: now,
        };
        const guidanceCopy: UmbraCanvasRegionalGuidanceLayer = {
          ...source,
          id: createId('canvas-regional_guidance'),
          name: `${source.name} Copy`,
          maskLayerId: maskCopy.id,
          locked: false,
          createdAt: now,
          updatedAt: now,
        };
        const index = state.layers.findIndex((layer) => layer.id === source.id);
        const layers = [...state.layers];
        layers.splice(index + 1, 0, maskCopy, guidanceCopy);
        return commit(state, { layers, activeLayerId: guidanceCopy.id, previewStageId: '' });
      }
      if (source.kind === 'reference' && source.maskLayerId) {
        const sourceMask = state.layers.find((layer) => layer.id === source.maskLayerId && layer.kind === 'mask') as UmbraCanvasMaskLayer | undefined;
        if (!sourceMask) return state;
        const maskCopy: UmbraCanvasMaskLayer = {
          ...sourceMask,
          id: createId('canvas-mask'),
          name: `${sourceMask.name} Copy`,
          createdAt: now,
          updatedAt: now,
        };
        const referenceCopy: UmbraCanvasReferenceLayer = {
          ...source,
          id: createId('canvas-reference'),
          name: `${source.name} Copy`,
          maskLayerId: maskCopy.id,
          locked: false,
          createdAt: now,
          updatedAt: now,
        };
        const index = state.layers.findIndex((layer) => layer.id === source.id);
        const layers = [...state.layers];
        layers.splice(index + 1, 0, maskCopy, referenceCopy);
        return commit(state, { layers, activeLayerId: referenceCopy.id, previewStageId: '' });
      }
      if (source.kind === 'raster' && source.maskLayerId) {
        const sourceMask = state.layers.find((layer) => layer.id === source.maskLayerId && layer.kind === 'mask') as UmbraCanvasMaskLayer | undefined;
        if (!sourceMask) return state;
        const maskCopy: UmbraCanvasMaskLayer = {
          ...sourceMask,
          id: createId('canvas-mask'),
          name: `${sourceMask.name} Copy`,
          createdAt: now,
          updatedAt: now,
        };
        const rasterCopy: UmbraCanvasRasterLayer = {
          ...source,
          id: createId('canvas-raster'),
          name: `${source.name} Copy`,
          maskLayerId: maskCopy.id,
          locked: false,
          createdAt: now,
          updatedAt: now,
        };
        const index = state.layers.findIndex((layer) => layer.id === source.id);
        const layers = [...state.layers];
        layers.splice(index + 1, 0, maskCopy, rasterCopy);
        return commit(state, { layers, activeLayerId: rasterCopy.id, previewStageId: '' });
      }
      const copy = {
        ...source,
        id: createId(`canvas-${source.kind}`),
        name: `${source.name} Copy`,
        locked: false,
        createdAt: now,
        updatedAt: now,
      } as UmbraCanvasLayer;
      const index = state.layers.findIndex((layer) => layer.id === source.id);
      const layers = [...state.layers];
      layers.splice(index + 1, 0, copy);
      return commit(state, { layers, activeLayerId: copy.id, previewStageId: '' });
    }
    case 'remove_layer': {
      const layer = state.layers.find((candidate) => candidate.id === action.layerId);
      if (!layer || isImmutableSourceLayer(layer)) return state;
      if (layer.kind === 'mask') {
        if (layer.frozen || layer.purpose !== 'inpaint') return state;
        if (state.layers.some((candidate) => (
          (candidate.kind === 'raster' || candidate.kind === 'regional_guidance' || candidate.kind === 'reference')
          && candidate.maskLayerId === layer.id
        ))) return state;
        const editableMasks = state.layers.filter((candidate) => (
          candidate.kind === 'mask' && candidate.purpose === 'inpaint' && !candidate.frozen
        ));
        if (editableMasks.length <= 1) {
          const now = Date.now();
          const replacement: UmbraCanvasMaskLayer = {
            ...baseLayer('mask', 'Inpaint Mask', state.width, state.height, now),
            kind: 'mask',
            enabled: true,
            purpose: 'inpaint',
            dataUrl: '',
            frozen: false,
            noiseLevel: 0,
            denoiseLimit: 1,
            overlayColor: defaultMaskOverlayColor('inpaint'),
            overlayStyle: 'solid',
          };
          const layers = [...state.layers];
          layers.splice(layers.findIndex((candidate) => candidate.id === layer.id), 1, replacement);
          return commit(state, {
            layers,
            activeMaskLayerId: replacement.id,
            activeLayerId: state.activeLayerId === layer.id ? replacement.id : state.activeLayerId,
            bookmarkedLayerId: state.bookmarkedLayerId === layer.id ? replacement.id : state.bookmarkedLayerId,
            previewStageId: '',
          });
        }
      }
      const alternateActiveMask = layer.id === state.activeMaskLayerId
        ? state.layers.find((candidate) => candidate.kind === 'mask' && candidate.purpose === 'inpaint' && !candidate.frozen && candidate.id !== layer.id)
        : null;
      if (layer.id === state.activeMaskLayerId && !alternateActiveMask) return state;
      if (layer.kind === 'group') {
        const layers = state.layers
          .filter((candidate) => candidate.id !== layer.id)
          .map((candidate) => candidate.groupId === layer.id ? { ...candidate, groupId: undefined, updatedAt: Date.now() } : candidate) as UmbraCanvasLayer[];
        return commit(state, {
          layers,
          activeLayerId: state.activeLayerId === layer.id
            ? (layers.findLast((candidate) => candidate.kind !== 'mask')?.id || '')
            : state.activeLayerId,
        });
      }
      const linkedMaskId = layer.kind === 'raster' || layer.kind === 'regional_guidance' || layer.kind === 'reference' ? layer.maskLayerId : '';
      const layers = state.layers
        .filter((candidate) => (
          candidate.id !== action.layerId
          && (!linkedMaskId || candidate.id !== linkedMaskId)
        ))
        .map((candidate) => candidate.kind === 'reference' && candidate.regionLayerId === action.layerId
          ? { ...candidate, regionLayerId: undefined, updatedAt: Date.now() }
          : candidate) as UmbraCanvasLayer[];
      return commit(state, {
        layers,
        activeMaskLayerId: alternateActiveMask?.id || state.activeMaskLayerId,
        activeLayerId: state.activeLayerId === action.layerId
          ? (alternateActiveMask?.id || layers.findLast((candidate) => candidate.kind === 'raster')?.id || '')
          : state.activeLayerId,
      });
    }
    default:
      return state;
  }
}

export function getUmbraCanvasRasterLayers(document: UmbraCanvasDocument | null): UmbraCanvasRasterLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasRasterLayer => layer.kind === 'raster');
}

export function getUmbraCanvasMaskLayer(
  document: UmbraCanvasDocument | null,
  layerId: string,
): UmbraCanvasMaskLayer | null {
  const layer = document?.layers.find((candidate) => candidate.id === layerId);
  return layer?.kind === 'mask' ? layer : null;
}

export function getUmbraCanvasRegionalGuidanceLayers(document: UmbraCanvasDocument | null): UmbraCanvasRegionalGuidanceLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasRegionalGuidanceLayer => layer.kind === 'regional_guidance');
}

export function getUmbraCanvasControlLayers(document: UmbraCanvasDocument | null): UmbraCanvasControlLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasControlLayer => layer.kind === 'control');
}

export function getUmbraCanvasReferenceLayers(document: UmbraCanvasDocument | null): UmbraCanvasReferenceLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasReferenceLayer => layer.kind === 'reference');
}

export function getUmbraCanvasGroupLayers(document: UmbraCanvasDocument | null): UmbraCanvasGroupLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasGroupLayer => layer.kind === 'group');
}

export function getUmbraCanvasTextLayers(document: UmbraCanvasDocument | null): UmbraCanvasTextLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasTextLayer => layer.kind === 'text');
}

export function getUmbraCanvasGradientLayers(document: UmbraCanvasDocument | null): UmbraCanvasGradientLayer[] {
  if (!document) return [];
  return document.layers.filter((layer): layer is UmbraCanvasGradientLayer => layer.kind === 'gradient');
}

export function getUmbraCanvasGenerationRegion(document: UmbraCanvasDocument | null): UmbraCanvasRect | null {
  if (!document) return null;
  return document.generationRegion || { x: 0, y: 0, width: document.width, height: document.height };
}

export function validateUmbraCanvasDocument(document: UmbraCanvasDocument): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const layer of document.layers) {
    if (ids.has(layer.id)) issues.push(`Duplicate layer id: ${layer.id}`);
    ids.add(layer.id);
    if (layer.opacity < 0 || layer.opacity > 1) issues.push(`Invalid opacity on ${layer.name}`);
    if (layer.transform.width <= 0 || layer.transform.height <= 0) issues.push(`Invalid bounds on ${layer.name}`);
    if (layer.kind === 'regional_guidance') {
      if (typeof layer.enabled !== 'boolean') issues.push(`Invalid enabled state on ${layer.name}`);
      const mask = document.layers.find((candidate) => candidate.id === layer.maskLayerId);
      if (!mask || mask.kind !== 'mask') issues.push(`Regional mask missing for ${layer.name}`);
      if (layer.beginStepPercent > layer.endStepPercent) issues.push(`Invalid step range on ${layer.name}`);
    }
    if (layer.kind === 'mask') {
      if (typeof layer.enabled !== 'boolean') issues.push(`Invalid enabled state on ${layer.name}`);
      if (!/^#[0-9a-f]{6}$/i.test(layer.overlayColor)) issues.push(`Invalid overlay color on ${layer.name}`);
      if (!UMBRA_CANVAS_MASK_OVERLAY_STYLES.includes(layer.overlayStyle)) issues.push(`Invalid overlay style on ${layer.name}`);
    }
    if (layer.kind === 'raster' && layer.maskLayerId) {
      const mask = document.layers.find((candidate) => candidate.id === layer.maskLayerId);
      if (!mask || mask.kind !== 'mask') issues.push(`Raster mask missing for ${layer.name}`);
    }
    if (isImmutableSourceLayer(layer) && !layer.locked) issues.push('The immutable source layer is unlocked.');
    if (layer.kind === 'control') {
      if (typeof layer.enabled !== 'boolean') issues.push(`Invalid enabled state on ${layer.name}`);
      if (typeof layer.lightnessToAlpha !== 'boolean') issues.push(`Invalid control transparency state on ${layer.name}`);
      if (!layer.asset?.imageUrl) issues.push(`Control image missing for ${layer.name}`);
      if (layer.controlType === 'content_shuffle' && layer.adapterType !== 't2i_adapter') {
        issues.push(`Content Shuffle requires a T2I Adapter on ${layer.name}`);
      }
    }
    if (layer.kind === 'reference') {
      if (typeof layer.enabled !== 'boolean') issues.push(`Invalid enabled state on ${layer.name}`);
      if (!layer.asset?.imageUrl) issues.push(`Reference image missing for ${layer.name}`);
      if (layer.maskLayerId && layer.regionLayerId) issues.push(`Reference has conflicting influence masks for ${layer.name}`);
      if (layer.method !== 'ip_adapter' && (layer.maskLayerId || layer.regionLayerId)) issues.push(`Unsupported regional influence on ${layer.name}`);
      if (layer.maskLayerId) {
        const mask = document.layers.find((candidate) => candidate.id === layer.maskLayerId);
        if (!mask || mask.kind !== 'mask' || mask.purpose !== 'reference') issues.push(`Reference mask missing for ${layer.name}`);
      }
      if (layer.regionLayerId) {
        const region = document.layers.find((candidate) => candidate.id === layer.regionLayerId);
        if (!region || region.kind !== 'regional_guidance') issues.push(`Reference region missing for ${layer.name}`);
      }
      if (layer.beginStepPercent > layer.endStepPercent) issues.push(`Invalid reference step range on ${layer.name}`);
    }
    if (layer.groupId && !document.layers.some((candidate) => candidate.id === layer.groupId && candidate.kind === 'group')) {
      issues.push(`Layer group missing for ${layer.name}`);
    }
    if (layer.kind === 'text' && !layer.text.trim()) issues.push(`Text content missing for ${layer.name}`);
    if (layer.kind === 'gradient') {
      if (layer.stops.length < 2) issues.push(`Gradient stops missing for ${layer.name}`);
      if (![layer.startX, layer.startY, layer.endX, layer.endY].every(Number.isFinite)) issues.push(`Gradient endpoints invalid for ${layer.name}`);
    }
  }
  if (!ids.has(document.activeMaskLayerId)) issues.push('The active mask layer is missing.');
  if (!ids.has(document.activeLayerId)) issues.push('The active canvas layer is missing.');
  if (document.bookmarkedLayerId && !ids.has(document.bookmarkedLayerId)) issues.push('The bookmarked layer is missing.');
  const stagingIds = new Set<string>();
  for (const stage of document.staging) {
    if (!stage.id || stagingIds.has(stage.id)) issues.push(`Invalid staged canvas result: ${stage.id || 'missing id'}`);
    stagingIds.add(stage.id);
    if (!stage.asset?.imageUrl) issues.push(`Staged canvas result image missing: ${stage.id || 'missing id'}`);
    if (!stage.maskDataUrl) issues.push(`Staged canvas result mask missing: ${stage.id || 'missing id'}`);
    if (stage.region.width <= 0 || stage.region.height <= 0) issues.push(`Invalid staged canvas result bounds: ${stage.id || 'missing id'}`);
  }
  if (document.previewStageId && !stagingIds.has(document.previewStageId)) issues.push('The staged preview result is missing.');
  const pendingIds = new Set<string>();
  for (const job of document.pendingJobs) {
    if (!job.id || pendingIds.has(job.id)) issues.push(`Invalid pending canvas job: ${job.id || 'missing id'}`);
    pendingIds.add(job.id);
    if (!job.maskDataUrl) issues.push(`Pending canvas job mask missing: ${job.id}`);
  }
  if (!document.layers.some((layer) => layer.kind === 'raster' && layer.role === 'source')) {
    issues.push('The immutable source layer is missing.');
  }
  return issues;
}
