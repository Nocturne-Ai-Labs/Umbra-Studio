import type {
  UmbraUiInpaintControlAdapterType,
  UmbraUiInpaintControlMode,
  UmbraUiInpaintReferenceMethod,
  UmbraUiIpAdapterCombineEmbeds,
  UmbraUiIpAdapterEmbedsScaling,
  UmbraUiIpAdapterWeightType,
} from '../../../../shared/umbra-ui/pipelineTypes';

export const UMBRA_CANVAS_PROJECT_VERSION = 8 as const;
export const UMBRA_CANVAS_DEFAULT_ALIGNMENT = 8;

export interface UmbraCanvasRasterAdjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
}

export const UMBRA_CANVAS_DEFAULT_RASTER_ADJUSTMENTS: UmbraCanvasRasterAdjustments = {
  brightness: 0,
  contrast: 0,
  saturation: 0,
  hue: 0,
  blur: 0,
};

export function normalizeUmbraCanvasRasterAdjustments(
  value: Partial<UmbraCanvasRasterAdjustments> | null | undefined,
): UmbraCanvasRasterAdjustments {
  const clamp = (candidate: unknown, minimum: number, maximum: number) => {
    const numeric = Number(candidate);
    return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : 0;
  };
  return {
    brightness: clamp(value?.brightness, -100, 100),
    contrast: clamp(value?.contrast, -100, 100),
    saturation: clamp(value?.saturation, -100, 200),
    hue: clamp(value?.hue, -180, 180),
    blur: clamp(value?.blur, 0, 128),
  };
}

export interface UmbraCanvasPoint {
  x: number;
  y: number;
}

export interface UmbraCanvasRect extends UmbraCanvasPoint {
  width: number;
  height: number;
}

export interface UmbraCanvasViewport {
  x: number;
  y: number;
  scale: number;
}

export interface UmbraCanvasRasterEntity {
  id: string;
  kind: 'raster';
  name: string;
  imageUrl: string;
  sourcePath: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blendMode: UmbraCanvasBlendMode;
  visible: boolean;
  generationEnabled: boolean;
  locked: boolean;
  alphaLocked: boolean;
  adjustments: UmbraCanvasRasterAdjustments;
  strokes: UmbraCanvasRasterStroke[];
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasRasterStroke {
  id: string;
  mode: 'paint' | 'erase';
  points: number[];
  size: number;
  opacity: number;
  color: string;
  createdAt: number;
}

export interface UmbraCanvasMaskStroke {
  id: string;
  mode: 'paint' | 'erase';
  points: number[];
  size: number;
  opacity: number;
  closed: boolean;
  createdAt: number;
}

export interface UmbraCanvasMaskEntity {
  id: string;
  kind: 'mask';
  name: string;
  imageUrl: string;
  sourcePath: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  strokes: UmbraCanvasMaskStroke[];
  operation: UmbraCanvasMaskOperation;
  visible: boolean;
  generationEnabled: boolean;
  inverted: boolean;
  feather: number;
  grow: number;
  locked: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasControlEntity {
  id: string;
  kind: 'control';
  name: string;
  rasterEntityId: string;
  adapterType: UmbraUiInpaintControlAdapterType;
  controlMode: UmbraUiInpaintControlMode;
  controlType: 'raw' | 'canny' | 'depth' | 'pose' | 'lineart' | 'lineart_anime' | 'softedge' | 'scribble' | 'face_mesh' | 'mlsd' | 'normal_map' | 'pidi' | 'content_shuffle';
  modelName: string;
  weight: number;
  beginStepPercent: number;
  endStepPercent: number;
  processorResolution: number;
  lowThreshold: number;
  highThreshold: number;
  visible: boolean;
  generationEnabled: boolean;
  locked: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasReferenceEntity {
  id: string;
  kind: 'reference';
  name: string;
  rasterEntityId: string;
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
  maskEntityId: string;
  visible: boolean;
  generationEnabled: boolean;
  locked: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export type UmbraCanvasMaskOperation = 'add' | 'subtract' | 'intersect' | 'replace';

interface UmbraCanvasDrawableEntityBase {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  opacity: number;
  blendMode: UmbraCanvasBlendMode;
  visible: boolean;
  generationEnabled: boolean;
  locked: boolean;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasShapeEntity extends UmbraCanvasDrawableEntityBase {
  kind: 'shape';
  shape: 'rectangle' | 'ellipse';
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface UmbraCanvasTextEntity extends UmbraCanvasDrawableEntityBase {
  kind: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic';
  align: 'left' | 'center' | 'right';
  fill: string;
}

export interface UmbraCanvasGradientEntity extends UmbraCanvasDrawableEntityBase {
  kind: 'gradient';
  startColor: string;
  endColor: string;
  angle: number;
}

export interface UmbraCanvasPathEntity extends UmbraCanvasDrawableEntityBase {
  kind: 'path';
  points: number[];
  closed: boolean;
  fill: string;
  fillEnabled: boolean;
  stroke: string;
  strokeWidth: number;
}

export type UmbraCanvasBlendMode =
  | 'source-over'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

export const UMBRA_CANVAS_BLEND_MODES: Array<{ value: UmbraCanvasBlendMode; label: string }> = [
  { value: 'source-over', label: 'Normal' },
  { value: 'multiply', label: 'Multiply' },
  { value: 'screen', label: 'Screen' },
  { value: 'overlay', label: 'Overlay' },
  { value: 'darken', label: 'Darken' },
  { value: 'lighten', label: 'Lighten' },
  { value: 'color-dodge', label: 'Color Dodge' },
  { value: 'color-burn', label: 'Color Burn' },
  { value: 'hard-light', label: 'Hard Light' },
  { value: 'soft-light', label: 'Soft Light' },
  { value: 'difference', label: 'Difference' },
  { value: 'exclusion', label: 'Exclusion' },
];

export type UmbraCanvasDrawableEntity = UmbraCanvasRasterEntity | UmbraCanvasShapeEntity | UmbraCanvasTextEntity | UmbraCanvasGradientEntity | UmbraCanvasPathEntity;
export type UmbraCanvasConditioningEntity = UmbraCanvasControlEntity | UmbraCanvasReferenceEntity;
export type UmbraCanvasEntity = UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity | UmbraCanvasConditioningEntity;

export function isUmbraCanvasDrawableEntity(entity: UmbraCanvasEntity): entity is UmbraCanvasDrawableEntity {
  return entity.kind === 'raster' || entity.kind === 'shape' || entity.kind === 'text' || entity.kind === 'gradient' || entity.kind === 'path';
}

export function isUmbraCanvasSpatialEntity(entity: UmbraCanvasEntity): entity is UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity {
  return isUmbraCanvasDrawableEntity(entity) || entity.kind === 'mask';
}

export function isUmbraCanvasControlEntity(entity: UmbraCanvasEntity): entity is UmbraCanvasControlEntity {
  return entity.kind === 'control';
}

export function isUmbraCanvasReferenceEntity(entity: UmbraCanvasEntity): entity is UmbraCanvasReferenceEntity {
  return entity.kind === 'reference';
}

export interface UmbraCanvasGenerationSettingsSnapshot {
  modelFamily: string;
  modelSource: string;
  checkpointName: string;
  workflowResources: Record<string, string>;
  promptSegments: Array<{
    id: string;
    text: string;
    label?: string;
    slotType?: string;
    variantId?: string;
    variantName?: string;
    agentEnabled?: boolean;
  }>;
  negativePrompt: string;
  loras: Array<Record<string, unknown>>;
  clipSkip: number;
  seed: string;
  seedMode: string;
  seedIncrement: number;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  denoise: number;
  samples: number;
  tiledVae: Record<string, unknown>;
  hiresFix: Record<string, unknown>;
  detailerPipeline: Array<Record<string, unknown>>;
  maskGrow: number;
  maskFeather: number;
  contextPadding: number;
  colorMatch: number;
  differentialStrength: number;
  softInpaintEnabled: boolean;
  softInpaintPreservation: number;
  softInpaintTransitionContrast: number;
  softInpaintMaskInfluence: number;
}

export interface UmbraCanvasPendingGeneration {
  id: string;
  jobId: string;
  bbox: UmbraCanvasRect;
  projectRevision: number;
  snapshotSignature?: string;
  acceptanceMaskUrl?: string;
  status: string;
  settings: UmbraCanvasGenerationSettingsSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasStagedGeneration {
  id: string;
  jobId: string;
  itemId: string;
  seed: number;
  imageUrl: string;
  sourcePath: string;
  bbox: UmbraCanvasRect;
  projectRevision: number;
  snapshotSignature?: string;
  acceptanceMaskUrl?: string;
  acceptedEntityId: string;
  pinned: boolean;
  createdAt: number;
}

export interface UmbraCanvasGenerationState {
  settings: UmbraCanvasGenerationSettingsSnapshot | null;
  pending: UmbraCanvasPendingGeneration[];
  staging: UmbraCanvasStagedGeneration[];
}

export interface UmbraCanvasProjectDocument {
  version: typeof UMBRA_CANVAS_PROJECT_VERSION;
  id: string;
  name: string;
  entities: UmbraCanvasEntity[];
  activeEntityId: string;
  generationBbox: UmbraCanvasRect;
  generationAlignment: number;
  viewport: UmbraCanvasViewport;
  generation: UmbraCanvasGenerationState;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export function buildUmbraCanvasSnapshotSignature(project: UmbraCanvasProjectDocument): string {
  const bbox = project.generationBbox;
  const entities = project.entities
    .filter((entity) => entity.visible && entity.generationEnabled)
    .map((entity) => entity.kind === 'control'
        ? [entity.id, entity.kind, entity.revision, entity.rasterEntityId, entity.adapterType, entity.controlMode, entity.controlType, entity.modelName, entity.weight, entity.beginStepPercent, entity.endStepPercent].join(':')
        : entity.kind === 'reference'
          ? [entity.id, entity.kind, entity.revision, entity.rasterEntityId, entity.method, entity.modelName, entity.visionModelName, entity.weight, entity.beginStepPercent, entity.endStepPercent, entity.maskEntityId].join(':')
      : [entity.id, entity.kind, entity.revision, entity.x, entity.y, entity.width, entity.height, entity.scaleX, entity.scaleY, entity.rotation].join(':'));
  return [`${bbox.x}:${bbox.y}:${bbox.width}:${bbox.height}`, ...entities].join('|');
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function alignUmbraCanvasDimension(value: number, alignment: number): number {
  const safeAlignment = Math.max(1, Math.round(Number(alignment) || UMBRA_CANVAS_DEFAULT_ALIGNMENT));
  return Math.max(safeAlignment, Math.round(Math.max(1, Number(value) || safeAlignment) / safeAlignment) * safeAlignment);
}

export function normalizeUmbraCanvasBbox(
  bbox: Partial<UmbraCanvasRect>,
  alignment = UMBRA_CANVAS_DEFAULT_ALIGNMENT,
): UmbraCanvasRect {
  return {
    x: Math.round(Number(bbox.x) || 0),
    y: Math.round(Number(bbox.y) || 0),
    width: alignUmbraCanvasDimension(Number(bbox.width) || 1024, alignment),
    height: alignUmbraCanvasDimension(Number(bbox.height) || 1024, alignment),
  };
}

export function getUmbraCanvasSpatialBounds(
  entity: Pick<UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity, 'x' | 'y' | 'width' | 'height' | 'scaleX' | 'scaleY' | 'rotation'>,
): UmbraCanvasRect {
  const radians = entity.rotation * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const width = entity.width * entity.scaleX;
  const height = entity.height * entity.scaleY;
  const corners = [[0, 0], [width, 0], [width, height], [0, height]];
  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;
  for (const [localX, localY] of corners) {
    const x = entity.x + localX * cosine - localY * sine;
    const y = entity.y + localX * sine + localY * cosine;
    left = Math.min(left, x);
    top = Math.min(top, y);
    right = Math.max(right, x);
    bottom = Math.max(bottom, y);
  }
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function createUmbraCanvasProjectDocument(name = 'Untitled Canvas'): UmbraCanvasProjectDocument {
  const now = Date.now();
  return {
    version: UMBRA_CANVAS_PROJECT_VERSION,
    id: createId('canvas'),
    name,
    entities: [],
    activeEntityId: '',
    generationBbox: { x: 0, y: 0, width: 1024, height: 1024 },
    generationAlignment: UMBRA_CANVAS_DEFAULT_ALIGNMENT,
    viewport: { x: 0, y: 0, scale: 1 },
    generation: {
      settings: null,
      pending: [],
      staging: [],
    },
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUmbraCanvasRasterEntity(options: {
  name: string;
  imageUrl: string;
  sourcePath?: string;
  width: number;
  height: number;
  x?: number;
  y?: number;
}): UmbraCanvasRasterEntity {
  const now = Date.now();
  return {
    id: createId('raster'),
    kind: 'raster',
    name: String(options.name || 'Image').trim() || 'Image',
    imageUrl: options.imageUrl,
    sourcePath: String(options.sourcePath || '').trim(),
    width: Math.max(1, Math.round(options.width)),
    height: Math.max(1, Math.round(options.height)),
    x: Math.round(Number(options.x) || 0),
    y: Math.round(Number(options.y) || 0),
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blendMode: 'source-over',
    visible: true,
    generationEnabled: true,
    locked: false,
    alphaLocked: false,
    adjustments: { ...UMBRA_CANVAS_DEFAULT_RASTER_ADJUSTMENTS },
    strokes: [],
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUmbraCanvasRasterStroke(options: {
  mode: 'paint' | 'erase';
  points: number[];
  size: number;
  opacity: number;
  color?: string;
}): UmbraCanvasRasterStroke {
  return {
    id: createId('raster-stroke'),
    mode: options.mode,
    points: options.points.map((value) => Number(value) || 0),
    size: Math.max(1, Math.min(2048, Number(options.size) || 64)),
    opacity: Math.max(0.01, Math.min(1, Number(options.opacity) || 1)),
    color: /^#[0-9a-f]{6}$/i.test(String(options.color || '')) ? String(options.color) : '#ffffff',
    createdAt: Date.now(),
  };
}

export function createUmbraCanvasMaskEntity(options: {
  name?: string;
  bbox?: Partial<UmbraCanvasRect>;
  imageUrl?: string;
  sourcePath?: string;
} = {}): UmbraCanvasMaskEntity {
  const now = Date.now();
  const bbox = normalizeUmbraCanvasBbox(options.bbox || {});
  return {
    id: createId('mask'),
    kind: 'mask',
    name: String(options.name || 'Inpaint Mask').trim() || 'Inpaint Mask',
    imageUrl: String(options.imageUrl || '').trim(),
    sourcePath: String(options.sourcePath || '').trim(),
    x: bbox.x,
    y: bbox.y,
    width: bbox.width,
    height: bbox.height,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    strokes: [],
    operation: 'add',
    visible: true,
    generationEnabled: true,
    inverted: false,
    feather: 12,
    grow: 0,
    locked: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUmbraCanvasMaskStroke(options: {
  mode: 'paint' | 'erase';
  points: number[];
  size: number;
  opacity: number;
  closed?: boolean;
}): UmbraCanvasMaskStroke {
  return {
    id: createId('stroke'),
    mode: options.mode,
    points: options.points.map((value) => Number(value) || 0),
    size: Math.max(1, Math.min(2048, Number(options.size) || 64)),
    opacity: Math.max(0.01, Math.min(1, Number(options.opacity) || 1)),
    closed: options.closed === true,
    createdAt: Date.now(),
  };
}

export function createUmbraCanvasControlEntity(options: {
  rasterEntityId: string;
  adapterType: UmbraUiInpaintControlAdapterType;
  controlMode: UmbraUiInpaintControlMode;
  modelName?: string;
  name?: string;
}): UmbraCanvasControlEntity {
  const now = Date.now();
  return {
    id: createId('control'),
    kind: 'control',
    name: String(options.name || 'Control Layer').trim() || 'Control Layer',
    rasterEntityId: options.rasterEntityId,
    adapterType: options.adapterType,
    controlMode: options.controlMode,
    controlType: 'raw',
    modelName: String(options.modelName || ''),
    weight: 1,
    beginStepPercent: 0,
    endStepPercent: 1,
    processorResolution: 512,
    lowThreshold: 100,
    highThreshold: 200,
    visible: true,
    generationEnabled: true,
    locked: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUmbraCanvasReferenceEntity(options: {
  rasterEntityId: string;
  method: UmbraUiInpaintReferenceMethod;
  modelName?: string;
  visionModelName?: string;
  name?: string;
}): UmbraCanvasReferenceEntity {
  const now = Date.now();
  return {
    id: createId('reference'),
    kind: 'reference',
    name: String(options.name || 'Reference Layer').trim() || 'Reference Layer',
    rasterEntityId: options.rasterEntityId,
    method: options.method,
    modelName: String(options.modelName || ''),
    visionModelName: String(options.visionModelName || ''),
    crop: 'center',
    strengthType: 'multiply',
    weight: 1,
    beginStepPercent: 0,
    endStepPercent: 1,
    ipAdapterWeightType: 'linear',
    ipAdapterCombineEmbeds: 'concat',
    ipAdapterEmbedsScaling: 'V only',
    maskEntityId: '',
    visible: true,
    generationEnabled: true,
    locked: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function createDrawableBase(name: string, bbox: Partial<UmbraCanvasRect> = {}) {
  const now = Date.now();
  const rect = normalizeUmbraCanvasBbox({ width: 384, height: 256, ...bbox });
  return {
    name,
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    blendMode: 'source-over' as UmbraCanvasBlendMode,
    visible: true,
    generationEnabled: true,
    locked: false,
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function createUmbraCanvasShapeEntity(
  shape: 'rectangle' | 'ellipse',
  bbox: Partial<UmbraCanvasRect> = {},
): UmbraCanvasShapeEntity {
  return {
    ...createDrawableBase(shape === 'ellipse' ? 'Ellipse' : 'Rectangle', bbox),
    id: createId('shape'),
    kind: 'shape',
    shape,
    fill: '#22d3ee',
    stroke: '#ffffff',
    strokeWidth: 0,
  };
}

export function createUmbraCanvasPathEntity(
  worldPoints: number[],
  closed: boolean,
): UmbraCanvasPathEntity {
  const finitePoints = worldPoints
    .slice(0, 200_000)
    .map((value) => Number.isFinite(Number(value)) ? Number(value) : 0);
  const pairedPoints = finitePoints.length % 2 === 0 ? finitePoints : finitePoints.slice(0, -1);
  let left = 0;
  let top = 0;
  let right = 1;
  let bottom = 1;
  if (pairedPoints.length >= 2) {
    left = right = pairedPoints[0];
    top = bottom = pairedPoints[1];
    for (let index = 2; index < pairedPoints.length; index += 2) {
      left = Math.min(left, pairedPoints[index]);
      right = Math.max(right, pairedPoints[index]);
      top = Math.min(top, pairedPoints[index + 1]);
      bottom = Math.max(bottom, pairedPoints[index + 1]);
    }
  }
  const localPoints = pairedPoints.map((value, index) => value - (index % 2 === 0 ? left : top));
  return {
    ...createDrawableBase(closed ? 'Polygon' : 'Freehand Path', {
      x: left,
      y: top,
      width: Math.max(1, right - left),
      height: Math.max(1, bottom - top),
    }),
    id: createId('path'),
    kind: 'path',
    points: localPoints,
    closed,
    fill: '#22d3ee',
    fillEnabled: closed,
    stroke: '#ffffff',
    strokeWidth: 8,
  };
}

export function createUmbraCanvasTextEntity(bbox: Partial<UmbraCanvasRect> = {}): UmbraCanvasTextEntity {
  return {
    ...createDrawableBase('Text', { width: 512, height: 128, ...bbox }),
    id: createId('text'),
    kind: 'text',
    text: 'Canvas text',
    fontFamily: 'Arial',
    fontSize: 64,
    fontStyle: 'normal',
    align: 'left',
    fill: '#ffffff',
  };
}

export function createUmbraCanvasGradientEntity(bbox: Partial<UmbraCanvasRect> = {}): UmbraCanvasGradientEntity {
  return {
    ...createDrawableBase('Gradient', { width: 512, height: 512, ...bbox }),
    id: createId('gradient'),
    kind: 'gradient',
    startColor: '#22d3ee',
    endColor: '#f43f5e',
    angle: 0,
  };
}
