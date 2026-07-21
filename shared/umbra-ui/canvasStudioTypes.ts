export const UMBRA_CANVAS_STUDIO_VERSION = 1;

export type UmbraCanvasStudioRegionMode = 'standalone' | 'composite' | 'blend' | 'extend' | 'inpaint';
export type UmbraCanvasStudioOutputMode = 'raster' | 'cutout';
export type UmbraCanvasStudioShelfKind = 'source' | 'reference' | 'generated' | 'mask' | 'cutout' | 'revision';

export interface UmbraCanvasStudioRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UmbraCanvasStudioPromptSegment {
  id: string;
  text: string;
}

export type UmbraCanvasStudioGenerationSnapshot = Record<string, unknown>;

export interface UmbraCanvasStudioRegion {
  id: string;
  name: string;
  mode: UmbraCanvasStudioRegionMode;
  outputMode: UmbraCanvasStudioOutputMode;
  rect: UmbraCanvasStudioRect;
  visible: boolean;
  locked: boolean;
  targetLayerId: string;
  promptSegments: UmbraCanvasStudioPromptSegment[];
  activePromptSegmentId: string;
  negativePrompt: string;
  generation: UmbraCanvasStudioGenerationSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasStudioArtboard {
  id: string;
  documentId: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
  regions: UmbraCanvasStudioRegion[];
  activeRegionId: string;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasStudioShelfAsset {
  id: string;
  kind: UmbraCanvasStudioShelfKind;
  name: string;
  artboardId: string;
  documentId: string;
  layerId: string;
  stageId: string;
  sourcePath: string;
  originalSourcePath: string;
  imageUrl: string;
  thumbnailUrl: string;
  promptSegments: UmbraCanvasStudioPromptSegment[];
  negativePrompt: string;
  generation: UmbraCanvasStudioGenerationSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasStudioViewport {
  zoom: number;
  panX: number;
  panY: number;
  snapSize: number;
  snapEnabled: boolean;
}

export const UMBRA_CANVAS_STUDIO_SNAP_SIZE = 8;

export interface UmbraCanvasStudioProject {
  version: typeof UMBRA_CANVAS_STUDIO_VERSION;
  id: string;
  name: string;
  artboards: UmbraCanvasStudioArtboard[];
  activeArtboardId: string;
  shelf: UmbraCanvasStudioShelfAsset[];
  viewport: UmbraCanvasStudioViewport;
  revision: number;
  createdAt: number;
  updatedAt: number;
}

export interface UmbraCanvasStudioProjectSummary {
  id: string;
  name: string;
  artboardCount: number;
  shelfCount: number;
  activeArtboardId: string;
  revision: number;
  updatedAt: number;
}

export interface CreateUmbraCanvasStudioProjectOptions {
  id?: string;
  name?: string;
  documentId?: string;
  artboardName?: string;
  width?: number;
  height?: number;
  now?: number;
}

const REGION_MODES = new Set<UmbraCanvasStudioRegionMode>(['standalone', 'composite', 'blend', 'extend', 'inpaint']);
const OUTPUT_MODES = new Set<UmbraCanvasStudioOutputMode>(['raster', 'cutout']);
const SHELF_KINDS = new Set<UmbraCanvasStudioShelfKind>(['source', 'reference', 'generated', 'mask', 'cutout', 'revision']);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function safeId(value: unknown, fallback = ''): string {
  const normalized = String(value || '').trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return normalized || fallback;
}

function finite(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(numeric) ? numeric : fallback));
}

function integer(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return Math.round(finite(value, fallback, minimum, maximum));
}

function text(value: unknown, fallback = '', limit = 8_192): string {
  return String(value ?? fallback).trim().slice(0, limit);
}

function cloneRecord(value: unknown): UmbraCanvasStudioGenerationSnapshot {
  try {
    const cloned = JSON.parse(JSON.stringify(record(value)));
    return record(cloned);
  } catch {
    return {};
  }
}

function uniqueId(value: unknown, fallback: string, seen: Set<string>): string {
  const base = safeId(value, fallback);
  let candidate = base;
  let suffix = 2;
  while (seen.has(candidate)) candidate = `${base}-${suffix++}`;
  seen.add(candidate);
  return candidate;
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function normalizePromptSegments(value: unknown): UmbraCanvasStudioPromptSegment[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 64).map((candidate, index) => {
    const source = record(candidate);
    return {
      id: uniqueId(source.id, `prompt-${index + 1}`, seen),
      text: text(source.text, '', 32_768),
    };
  });
}

function normalizeRegion(
  value: unknown,
  index: number,
  artboardWidth: number,
  artboardHeight: number,
  seen: Set<string>,
  now: number,
): UmbraCanvasStudioRegion {
  const source = record(value);
  const rectSource = record(source.rect);
  const id = uniqueId(source.id, `region-${index + 1}`, seen);
  const width = integer(rectSource.width, Math.min(512, artboardWidth), 1, artboardWidth);
  const height = integer(rectSource.height, Math.min(512, artboardHeight), 1, artboardHeight);
  const x = integer(rectSource.x, 0, 0, Math.max(0, artboardWidth - width));
  const y = integer(rectSource.y, 0, 0, Math.max(0, artboardHeight - height));
  const promptSegments = normalizePromptSegments(source.promptSegments);
  const activePromptSegmentId = safeId(source.activePromptSegmentId);
  const mode = REGION_MODES.has(source.mode as UmbraCanvasStudioRegionMode)
    ? source.mode as UmbraCanvasStudioRegionMode
    : 'inpaint';
  const outputMode = OUTPUT_MODES.has(source.outputMode as UmbraCanvasStudioOutputMode)
    ? source.outputMode as UmbraCanvasStudioOutputMode
    : 'raster';
  const createdAt = integer(source.createdAt, now, 0, Number.MAX_SAFE_INTEGER);
  return {
    id,
    name: text(source.name, `Region ${index + 1}`, 160) || `Region ${index + 1}`,
    mode,
    outputMode,
    rect: { x, y, width, height },
    visible: source.visible !== false,
    locked: source.locked === true,
    targetLayerId: safeId(source.targetLayerId),
    promptSegments,
    activePromptSegmentId: promptSegments.some((segment) => segment.id === activePromptSegmentId)
      ? activePromptSegmentId
      : promptSegments[0]?.id || '',
    negativePrompt: text(source.negativePrompt, '', 32_768),
    generation: cloneRecord(source.generation),
    createdAt,
    updatedAt: integer(source.updatedAt, createdAt, createdAt, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeArtboard(value: unknown, index: number, seen: Set<string>, now: number): UmbraCanvasStudioArtboard {
  const source = record(value);
  const id = uniqueId(source.id, `artboard-${index + 1}`, seen);
  const width = integer(source.width, 1024, 64, 16_384);
  const height = integer(source.height, 1024, 64, 16_384);
  const regionIds = new Set<string>();
  const regions = (Array.isArray(source.regions) ? source.regions : [])
    .slice(0, 128)
    .map((region, regionIndex) => normalizeRegion(region, regionIndex, width, height, regionIds, now));
  const activeRegionId = safeId(source.activeRegionId);
  const createdAt = integer(source.createdAt, now, 0, Number.MAX_SAFE_INTEGER);
  return {
    id,
    documentId: safeId(source.documentId, id),
    name: text(source.name, `Artboard ${index + 1}`, 160) || `Artboard ${index + 1}`,
    x: integer(source.x, index * 80, -1_000_000, 1_000_000),
    y: integer(source.y, index * 80, -1_000_000, 1_000_000),
    width,
    height,
    zIndex: integer(source.zIndex, index, -100_000, 100_000),
    visible: source.visible !== false,
    locked: source.locked === true,
    regions,
    activeRegionId: regions.some((region) => region.id === activeRegionId) ? activeRegionId : regions[0]?.id || '',
    createdAt,
    updatedAt: integer(source.updatedAt, createdAt, createdAt, Number.MAX_SAFE_INTEGER),
  };
}

function normalizeShelfAsset(value: unknown, index: number, seen: Set<string>, now: number): UmbraCanvasStudioShelfAsset {
  const source = record(value);
  const createdAt = integer(source.createdAt, now, 0, Number.MAX_SAFE_INTEGER);
  return {
    id: uniqueId(source.id, `asset-${index + 1}`, seen),
    kind: SHELF_KINDS.has(source.kind as UmbraCanvasStudioShelfKind)
      ? source.kind as UmbraCanvasStudioShelfKind
      : 'reference',
    name: text(source.name, `Asset ${index + 1}`, 240) || `Asset ${index + 1}`,
    artboardId: safeId(source.artboardId),
    documentId: safeId(source.documentId),
    layerId: safeId(source.layerId),
    stageId: safeId(source.stageId),
    sourcePath: text(source.sourcePath, '', 4_096),
    originalSourcePath: text(source.originalSourcePath, '', 4_096),
    imageUrl: text(source.imageUrl, '', 16_384),
    thumbnailUrl: text(source.thumbnailUrl, '', 16_384),
    promptSegments: normalizePromptSegments(source.promptSegments),
    negativePrompt: text(source.negativePrompt, '', 32_768),
    generation: cloneRecord(source.generation),
    createdAt,
    updatedAt: integer(source.updatedAt, createdAt, createdAt, Number.MAX_SAFE_INTEGER),
  };
}

export function normalizeUmbraCanvasStudioProject(
  value: unknown,
  options: { projectId?: string; now?: number } = {},
): UmbraCanvasStudioProject {
  const source = record(value);
  const incomingVersion = integer(source.version, UMBRA_CANVAS_STUDIO_VERSION, 1, Number.MAX_SAFE_INTEGER);
  if (incomingVersion > UMBRA_CANVAS_STUDIO_VERSION) {
    throw new Error('This Canvas Studio project was saved by a newer Umbra Studio build.');
  }
  const now = integer(options.now, Date.now(), 0, Number.MAX_SAFE_INTEGER);
  const id = safeId(options.projectId || source.id);
  if (!id) throw new Error('A valid Canvas Studio project id is required.');
  const artboardIds = new Set<string>();
  const artboards = (Array.isArray(source.artboards) ? source.artboards : [])
    .slice(0, 64)
    .map((artboard, index) => normalizeArtboard(artboard, index, artboardIds, now));
  const activeArtboardId = safeId(source.activeArtboardId);
  const shelfIds = new Set<string>();
  const shelf = (Array.isArray(source.shelf) ? source.shelf : [])
    .slice(0, 4_096)
    .map((asset, index) => normalizeShelfAsset(asset, index, shelfIds, now));
  const viewport = record(source.viewport);
  const createdAt = integer(source.createdAt, now, 0, Number.MAX_SAFE_INTEGER);
  return {
    version: UMBRA_CANVAS_STUDIO_VERSION,
    id,
    name: text(source.name, 'Untitled Studio Project', 240) || 'Untitled Studio Project',
    artboards,
    activeArtboardId: artboards.some((artboard) => artboard.id === activeArtboardId)
      ? activeArtboardId
      : artboards[0]?.id || '',
    shelf,
    viewport: {
      zoom: finite(viewport.zoom, 1, 0.05, 8),
      panX: finite(viewport.panX, 0, -1_000_000, 1_000_000),
      panY: finite(viewport.panY, 0, -1_000_000, 1_000_000),
      snapSize: UMBRA_CANVAS_STUDIO_SNAP_SIZE,
      snapEnabled: viewport.snapEnabled !== false,
    },
    revision: integer(source.revision, 0, 0, Number.MAX_SAFE_INTEGER),
    createdAt,
    updatedAt: integer(source.updatedAt, createdAt, createdAt, Number.MAX_SAFE_INTEGER),
  };
}

export function createUmbraCanvasStudioProject(
  options: CreateUmbraCanvasStudioProjectOptions = {},
): UmbraCanvasStudioProject {
  const now = options.now ?? Date.now();
  const id = safeId(options.id, createId('studio'));
  const documentId = safeId(options.documentId);
  const artboardId = documentId ? createId('artboard') : '';
  return normalizeUmbraCanvasStudioProject({
    version: UMBRA_CANVAS_STUDIO_VERSION,
    id,
    name: options.name || 'Untitled Studio Project',
    artboards: documentId ? [{
      id: artboardId,
      documentId,
      name: options.artboardName || 'Artboard 1',
      x: 0,
      y: 0,
      width: options.width || 1024,
      height: options.height || 1024,
      zIndex: 0,
      visible: true,
      locked: false,
      regions: [],
      activeRegionId: '',
      createdAt: now,
      updatedAt: now,
    }] : [],
    activeArtboardId: artboardId,
    shelf: [],
    viewport: { zoom: 1, panX: 0, panY: 0, snapSize: UMBRA_CANVAS_STUDIO_SNAP_SIZE, snapEnabled: true },
    revision: 0,
    createdAt: now,
    updatedAt: now,
  }, { projectId: id, now });
}
