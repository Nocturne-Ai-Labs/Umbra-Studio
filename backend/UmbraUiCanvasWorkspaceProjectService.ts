import { createHash } from 'crypto';
import { copyFile, mkdir, open, readFile, readdir, rename, rm, stat } from 'fs/promises';
import { extname, join, resolve, sep } from 'path';

const PROJECT_VERSION = 8;
const PROJECT_ASSET_PREFIX = 'umbra-canvas-asset:';
const MAX_PROJECT_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_ENTITIES = 4096;
const MAX_COORDINATE = 100_000_000;
const MAX_IMAGE_SIDE = 65_536;
const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const BLEND_MODES = new Set(['source-over', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion']);

export interface UmbraUiCanvasWorkspaceAssetInput {
  key: string;
  name: string;
  bytes: Uint8Array;
}

export interface UmbraUiCanvasWorkspaceProjectSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  entityCount: number;
  generationWidth: number;
  generationHeight: number;
  updatedAt: number;
}

export interface UmbraUiCanvasWorkspaceRestorePointSummary {
  id: string;
  name: string;
  createdAt: number;
  revision: number;
  entityCount: number;
  stagingCount: number;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeId(value: unknown, fallback = ''): string {
  const normalized = String(value || '').trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return normalized || fallback;
}

function safeStoredFilename(value: unknown): string {
  const filename = String(value || '').trim().replace(/\\/g, '/').split('/').pop() || '';
  if (!/^[a-z0-9._-]+$/i.test(filename) || !IMAGE_EXTENSIONS.has(extname(filename).toLowerCase())) return '';
  return filename;
}

function safeAssetName(key: string, originalName: string, bytes: Uint8Array): string {
  const extension = extname(String(originalName || '')).toLowerCase();
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  return `${safeId(key, 'asset')}-${digest}${IMAGE_EXTENSIONS.has(extension) ? extension : '.png'}`;
}

function finiteNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(min, Math.min(max, numeric)) : fallback;
}

function normalizeGenerationSettings(rawSettings: unknown): Record<string, any> | null {
  const settings = asRecord(rawSettings);
  if (Object.keys(settings).length === 0) return null;
  const workflowResources = Object.fromEntries(
    Object.entries(asRecord(settings.workflowResources)).slice(0, 64).map(([key, value]) => [
      String(key).slice(0, 160),
      String(value || '').slice(0, 4096),
    ]),
  );
  const promptSegments = (Array.isArray(settings.promptSegments) ? settings.promptSegments : []).slice(0, 64).map((rawSegment: unknown, index: number) => {
    const segment = asRecord(rawSegment);
    return {
      id: safeId(segment.id, `canvas-prompt-${index + 1}`),
      text: String(segment.text || '').slice(0, 1_000_000),
      ...(String(segment.label || '').trim() ? { label: String(segment.label).trim().slice(0, 160) } : {}),
      ...(String(segment.slotType || '').trim() ? { slotType: String(segment.slotType).trim().slice(0, 160) } : {}),
      ...(String(segment.variantId || '').trim() ? { variantId: String(segment.variantId).trim().slice(0, 240) } : {}),
      ...(String(segment.variantName || '').trim() ? { variantName: String(segment.variantName).trim().slice(0, 240) } : {}),
      ...(segment.agentEnabled === true ? { agentEnabled: true } : {}),
    };
  });
  const loras = (Array.isArray(settings.loras) ? settings.loras : []).slice(0, 64).map((rawLora: unknown, index: number) => {
    const lora = asRecord(rawLora);
    return {
      id: safeId(lora.id, `canvas-lora-${index + 1}`),
      name: String(lora.name || '').trim().replace(/\\/g, '/').slice(0, 4096),
      modelFamilyKey: String(lora.modelFamilyKey || '').trim().slice(0, 160),
      enabled: lora.enabled !== false,
      strengthModel: finiteNumber(lora.strengthModel, 1, -10, 10),
      strengthClip: finiteNumber(lora.strengthClip, 1, -10, 10),
      trainedTags: (Array.isArray(lora.trainedTags) ? lora.trainedTags : []).slice(0, 512).map((tag: unknown) => String(tag || '').trim().slice(0, 512)).filter(Boolean),
      thumbnailUrl: String(lora.thumbnailUrl || '').trim().slice(0, 4096),
      thumbnailUrls: (Array.isArray(lora.thumbnailUrls) ? lora.thumbnailUrls : []).slice(0, 32).map((url: unknown) => String(url || '').trim().slice(0, 4096)).filter(Boolean),
      civitaiUrl: String(lora.civitaiUrl || '').trim().slice(0, 4096),
    };
  }).filter((lora: Record<string, any>) => lora.name);
  return {
    modelFamily: String(settings.modelFamily || '').trim().slice(0, 160),
    modelSource: String(settings.modelSource || '').trim().slice(0, 160),
    checkpointName: String(settings.checkpointName || '').trim().replace(/\\/g, '/').slice(0, 4096),
    workflowResources,
    promptSegments,
    negativePrompt: String(settings.negativePrompt || '').slice(0, 1_000_000),
    loras,
    clipSkip: Math.round(finiteNumber(settings.clipSkip, 1, -128, 128)),
    seed: String(settings.seed || '').trim().slice(0, 64),
    seedMode: String(settings.seedMode || 'fixed').trim().slice(0, 64),
    seedIncrement: Math.round(finiteNumber(settings.seedIncrement, 1, -1_000_000, 1_000_000)),
    steps: Math.round(finiteNumber(settings.steps, 20, 1, 10_000)),
    cfg: finiteNumber(settings.cfg, 1, -1_000, 1_000),
    samplerName: String(settings.samplerName || 'euler').trim().slice(0, 160),
    scheduler: String(settings.scheduler || 'normal').trim().slice(0, 160),
    denoise: finiteNumber(settings.denoise, 0.65, 0, 1),
    samples: Math.round(finiteNumber(settings.samples, 1, 1, 1_000)),
    tiledVae: cloneJson(asRecord(settings.tiledVae)),
    hiresFix: cloneJson(asRecord(settings.hiresFix)),
    detailerPipeline: (Array.isArray(settings.detailerPipeline) ? settings.detailerPipeline : []).slice(0, 64).map((stage: unknown) => cloneJson(asRecord(stage))),
    maskGrow: Math.round(finiteNumber(settings.maskGrow, 8, 0, 2_048)),
    maskFeather: Math.round(finiteNumber(settings.maskFeather, 12, 0, 2_048)),
    contextPadding: Math.round(finiteNumber(settings.contextPadding, 64, 0, 2_048)),
    colorMatch: finiteNumber(settings.colorMatch, 0.5, 0, 1),
    differentialStrength: finiteNumber(settings.differentialStrength, 0.75, 0, 1),
    softInpaintEnabled: settings.softInpaintEnabled !== false,
    softInpaintPreservation: finiteNumber(settings.softInpaintPreservation, 0.35, 0, 1),
    softInpaintTransitionContrast: finiteNumber(settings.softInpaintTransitionContrast, 1.75, 0.25, 8),
    softInpaintMaskInfluence: finiteNumber(settings.softInpaintMaskInfluence, 0, 0, 1),
  };
}

function normalizeProject(rawProject: unknown): Record<string, any> {
  const source = cloneJson(asRecord(rawProject));
  const version = Math.max(1, Math.round(Number(source.version) || 1));
  if (version > PROJECT_VERSION) throw new Error(`Canvas project version ${version} is newer than this Umbra build supports.`);
  const id = safeId(source.id);
  if (!id) throw new Error('A valid Canvas project id is required.');
  const alignment = Math.max(1, Math.min(256, Math.round(Number(source.generationAlignment) || 8)));
  const bbox = asRecord(source.generationBbox);
  const viewport = asRecord(source.viewport);
  const rawEntities = Array.isArray(source.entities) ? source.entities : [];
  if (rawEntities.length > MAX_ENTITIES) throw new Error(`A Canvas project cannot contain more than ${MAX_ENTITIES} entities.`);
  const entities = rawEntities.map((rawEntity: unknown, index: number) => {
    const entity = asRecord(rawEntity);
    const entityId = safeId(entity.id);
    if (!entityId || !['raster', 'mask', 'shape', 'text', 'gradient', 'path', 'regional-guidance', 'control', 'reference'].includes(String(entity.kind || ''))) throw new Error(`Canvas entity ${index + 1} is invalid or unsupported.`);
    if (entity.kind === 'regional-guidance') {
      return {
        id: entityId,
        kind: 'regional-guidance',
        name: String(entity.name || `Regional Guide ${index + 1}`).trim().slice(0, 240) || `Regional Guide ${index + 1}`,
        maskEntityId: safeId(entity.maskEntityId),
        positivePrompt: String(entity.positivePrompt || '').slice(0, 1_000_000),
        negativePrompt: String(entity.negativePrompt || '').slice(0, 1_000_000),
        autoNegative: entity.autoNegative === true,
        weight: finiteNumber(entity.weight, 1, -10, 10),
        beginStepPercent: finiteNumber(entity.beginStepPercent, 0, 0, 1),
        endStepPercent: finiteNumber(entity.endStepPercent, 1, 0, 1),
        visible: entity.visible !== false,
        generationEnabled: entity.generationEnabled !== false,
        locked: entity.locked === true,
        revision: Math.max(0, Math.round(Number(entity.revision) || 0)),
        createdAt: Math.max(0, Math.round(Number(entity.createdAt) || Date.now())),
        updatedAt: Math.max(0, Math.round(Number(entity.updatedAt) || Date.now())),
      };
    }
    if (entity.kind === 'control') {
      return {
        id: entityId,
        kind: 'control',
        name: String(entity.name || `Control Layer ${index + 1}`).trim().slice(0, 240) || `Control Layer ${index + 1}`,
        rasterEntityId: safeId(entity.rasterEntityId),
        adapterType: String(entity.adapterType || 'controlnet').trim().slice(0, 64),
        controlMode: String(entity.controlMode || 'balanced').trim().slice(0, 64),
        controlType: String(entity.controlType || 'raw').trim().slice(0, 64),
        modelName: String(entity.modelName || '').trim().replace(/\\/g, '/').slice(0, 4096),
        weight: finiteNumber(entity.weight, 1, -10, 10),
        beginStepPercent: finiteNumber(entity.beginStepPercent, 0, 0, 1),
        endStepPercent: finiteNumber(entity.endStepPercent, 1, 0, 1),
        processorResolution: Math.round(finiteNumber(entity.processorResolution, 512, 64, 8192)),
        lowThreshold: Math.round(finiteNumber(entity.lowThreshold, 100, 0, 255)),
        highThreshold: Math.round(finiteNumber(entity.highThreshold, 200, 0, 255)),
        visible: entity.visible !== false,
        generationEnabled: entity.generationEnabled !== false,
        locked: entity.locked === true,
        revision: Math.max(0, Math.round(Number(entity.revision) || 0)),
        createdAt: Math.max(0, Math.round(Number(entity.createdAt) || Date.now())),
        updatedAt: Math.max(0, Math.round(Number(entity.updatedAt) || Date.now())),
      };
    }
    if (entity.kind === 'reference') {
      return {
        id: entityId,
        kind: 'reference',
        name: String(entity.name || `Reference Layer ${index + 1}`).trim().slice(0, 240) || `Reference Layer ${index + 1}`,
        rasterEntityId: safeId(entity.rasterEntityId),
        method: String(entity.method || 'ip_adapter').trim().slice(0, 64),
        modelName: String(entity.modelName || '').trim().replace(/\\/g, '/').slice(0, 4096),
        visionModelName: String(entity.visionModelName || '').trim().replace(/\\/g, '/').slice(0, 4096),
        crop: entity.crop === 'none' ? 'none' : 'center',
        strengthType: entity.strengthType === 'attn_bias' ? 'attn_bias' : 'multiply',
        weight: finiteNumber(entity.weight, 1, -10, 10),
        beginStepPercent: finiteNumber(entity.beginStepPercent, 0, 0, 1),
        endStepPercent: finiteNumber(entity.endStepPercent, 1, 0, 1),
        ipAdapterWeightType: String(entity.ipAdapterWeightType || 'linear').trim().slice(0, 64),
        ipAdapterCombineEmbeds: String(entity.ipAdapterCombineEmbeds || 'concat').trim().slice(0, 64),
        ipAdapterEmbedsScaling: String(entity.ipAdapterEmbedsScaling || 'V only').trim().slice(0, 64),
        maskEntityId: safeId(entity.maskEntityId),
        visible: entity.visible !== false,
        generationEnabled: entity.generationEnabled !== false,
        locked: entity.locked === true,
        revision: Math.max(0, Math.round(Number(entity.revision) || 0)),
        createdAt: Math.max(0, Math.round(Number(entity.createdAt) || Date.now())),
        updatedAt: Math.max(0, Math.round(Number(entity.updatedAt) || Date.now())),
      };
    }
    const width = Math.round(finiteNumber(entity.width, 1, 1, MAX_IMAGE_SIDE));
    const height = Math.round(finiteNumber(entity.height, 1, 1, MAX_IMAGE_SIDE));
    if (entity.kind === 'mask') {
      const rawStrokes = Array.isArray(entity.strokes) ? entity.strokes : [];
      if (rawStrokes.length > 100_000) throw new Error(`Mask ${entity.name || index + 1} contains too many strokes.`);
      const strokes = rawStrokes.map((rawStroke: unknown, strokeIndex: number) => {
        const stroke = asRecord(rawStroke);
        const points = Array.isArray(stroke.points)
          ? stroke.points.slice(0, 1_000_000).map((value: unknown) => finiteNumber(value, 0, -MAX_COORDINATE, MAX_COORDINATE))
          : [];
        if (!safeId(stroke.id) || points.length < 2 || points.length % 2 !== 0) throw new Error(`Mask stroke ${strokeIndex + 1} is invalid.`);
        return {
          id: safeId(stroke.id),
          mode: stroke.mode === 'erase' ? 'erase' : 'paint',
          points,
          size: finiteNumber(stroke.size, 64, 1, 2048),
          opacity: finiteNumber(stroke.opacity, 1, 0.01, 1),
          closed: stroke.closed === true,
          createdAt: Math.max(0, Math.round(Number(stroke.createdAt) || Date.now())),
        };
      });
      return {
        id: entityId,
        kind: 'mask',
        name: String(entity.name || `Inpaint Mask ${index + 1}`).trim().slice(0, 240) || `Inpaint Mask ${index + 1}`,
        imageUrl: String(entity.imageUrl || '').trim().slice(0, 8192),
        sourcePath: String(entity.sourcePath || '').trim().slice(0, 8192),
        width,
        height,
        x: finiteNumber(entity.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
        y: finiteNumber(entity.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
        scaleX: finiteNumber(entity.scaleX, 1, -1024, 1024) || 1,
        scaleY: finiteNumber(entity.scaleY, 1, -1024, 1024) || 1,
        rotation: finiteNumber(entity.rotation, 0, -360_000, 360_000),
        strokes,
        operation: ['add', 'subtract', 'intersect', 'replace'].includes(String(entity.operation || '')) ? String(entity.operation) : 'add',
        visible: entity.visible !== false,
        generationEnabled: entity.generationEnabled !== false,
        inverted: entity.inverted === true,
        feather: finiteNumber(entity.feather, 12, 0, 512),
        grow: finiteNumber(entity.grow, 0, -512, 512),
        locked: entity.locked === true,
        revision: Math.max(0, Math.round(Number(entity.revision) || 0)),
        createdAt: Math.max(0, Math.round(Number(entity.createdAt) || Date.now())),
        updatedAt: Math.max(0, Math.round(Number(entity.updatedAt) || Date.now())),
      };
    }
    const drawableBase = {
      id: entityId,
      name: String(entity.name || `Layer ${index + 1}`).trim().slice(0, 240) || `Layer ${index + 1}`,
      width,
      height,
      x: finiteNumber(entity.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
      y: finiteNumber(entity.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
      scaleX: finiteNumber(entity.scaleX, 1, -1024, 1024) || 1,
      scaleY: finiteNumber(entity.scaleY, 1, -1024, 1024) || 1,
      rotation: finiteNumber(entity.rotation, 0, -360_000, 360_000),
      opacity: finiteNumber(entity.opacity, 1, 0, 1),
      blendMode: BLEND_MODES.has(String(entity.blendMode || '')) ? String(entity.blendMode) : 'source-over',
      visible: entity.visible !== false,
      generationEnabled: entity.generationEnabled !== false,
      locked: entity.locked === true,
      revision: Math.max(0, Math.round(Number(entity.revision) || 0)),
      createdAt: Math.max(0, Math.round(Number(entity.createdAt) || Date.now())),
      updatedAt: Math.max(0, Math.round(Number(entity.updatedAt) || Date.now())),
    };
    if (entity.kind === 'shape') {
      return {
        ...drawableBase,
        kind: 'shape',
        shape: entity.shape === 'ellipse' ? 'ellipse' : 'rectangle',
        fill: /^#[0-9a-f]{6}$/i.test(String(entity.fill || '')) ? String(entity.fill) : '#22d3ee',
        stroke: /^#[0-9a-f]{6}$/i.test(String(entity.stroke || '')) ? String(entity.stroke) : '#ffffff',
        strokeWidth: finiteNumber(entity.strokeWidth, 0, 0, 2048),
      };
    }
    if (entity.kind === 'text') {
      return {
        ...drawableBase,
        kind: 'text',
        text: String(entity.text || '').slice(0, 1_000_000),
        fontFamily: String(entity.fontFamily || 'Arial').trim().slice(0, 160) || 'Arial',
        fontSize: finiteNumber(entity.fontSize, 64, 1, 4096),
        fontStyle: ['normal', 'bold', 'italic', 'bold italic'].includes(String(entity.fontStyle || '')) ? String(entity.fontStyle) : 'normal',
        align: ['left', 'center', 'right'].includes(String(entity.align || '')) ? String(entity.align) : 'left',
        fill: /^#[0-9a-f]{6}$/i.test(String(entity.fill || '')) ? String(entity.fill) : '#ffffff',
      };
    }
    if (entity.kind === 'gradient') {
      return {
        ...drawableBase,
        kind: 'gradient',
        startColor: /^#[0-9a-f]{6}$/i.test(String(entity.startColor || '')) ? String(entity.startColor) : '#22d3ee',
        endColor: /^#[0-9a-f]{6}$/i.test(String(entity.endColor || '')) ? String(entity.endColor) : '#f43f5e',
        angle: finiteNumber(entity.angle, 0, -360_000, 360_000),
      };
    }
    if (entity.kind === 'path') {
      const points = (Array.isArray(entity.points) ? entity.points : [])
        .slice(0, 200_000)
        .map((value: unknown) => finiteNumber(value, 0, -MAX_COORDINATE, MAX_COORDINATE));
      if (points.length < 4 || points.length % 2 !== 0) throw new Error(`Canvas path ${entity.name || index + 1} is invalid.`);
      return {
        ...drawableBase,
        kind: 'path',
        points,
        closed: entity.closed === true,
        fill: /^#[0-9a-f]{6}$/i.test(String(entity.fill || '')) ? String(entity.fill) : '#22d3ee',
        fillEnabled: entity.fillEnabled === true,
        stroke: /^#[0-9a-f]{6}$/i.test(String(entity.stroke || '')) ? String(entity.stroke) : '#ffffff',
        strokeWidth: finiteNumber(entity.strokeWidth, 8, 0.5, 2048),
      };
    }
    return {
      ...drawableBase,
      id: entityId,
      kind: 'raster',
      name: String(entity.name || `Image ${index + 1}`).trim().slice(0, 240) || `Image ${index + 1}`,
      imageUrl: String(entity.imageUrl || '').trim(),
      sourcePath: String(entity.sourcePath || '').trim().slice(0, 4096),
      alphaLocked: entity.alphaLocked === true,
      adjustments: {
        brightness: finiteNumber(asRecord(entity.adjustments).brightness, 0, -100, 100),
        contrast: finiteNumber(asRecord(entity.adjustments).contrast, 0, -100, 100),
        saturation: finiteNumber(asRecord(entity.adjustments).saturation, 0, -100, 200),
        hue: finiteNumber(asRecord(entity.adjustments).hue, 0, -180, 180),
        blur: finiteNumber(asRecord(entity.adjustments).blur, 0, 0, 128),
      },
      strokes: (Array.isArray(entity.strokes) ? entity.strokes : []).slice(0, 100_000).map((rawStroke: unknown, strokeIndex: number) => {
        const stroke = asRecord(rawStroke);
        const points = Array.isArray(stroke.points)
          ? stroke.points.slice(0, 1_000_000).map((value: unknown) => finiteNumber(value, 0, -MAX_COORDINATE, MAX_COORDINATE))
          : [];
        if (!safeId(stroke.id) || points.length < 2 || points.length % 2 !== 0) throw new Error(`Raster stroke ${strokeIndex + 1} is invalid.`);
        return {
          id: safeId(stroke.id),
          mode: stroke.mode === 'erase' ? 'erase' : 'paint',
          points,
          size: finiteNumber(stroke.size, 64, 1, 2048),
          opacity: finiteNumber(stroke.opacity, 1, 0.01, 1),
          color: /^#[0-9a-f]{6}$/i.test(String(stroke.color || '')) ? String(stroke.color) : '#ffffff',
          createdAt: Math.max(0, Math.round(Number(stroke.createdAt) || Date.now())),
        };
      }),
    };
  });
  const entityIds = new Set(entities.map((entity) => entity.id));
  const rawGeneration = asRecord(source.generation);
  const pending = (Array.isArray(rawGeneration.pending) ? rawGeneration.pending : []).slice(0, 64).map((rawPending: unknown, index: number) => {
    const entry = asRecord(rawPending);
    const entryBbox = asRecord(entry.bbox);
    const jobId = safeId(entry.jobId);
    return {
      id: safeId(entry.id, jobId || `canvas-pending-${index + 1}`),
      jobId,
      bbox: {
        x: Math.round(finiteNumber(entryBbox.x, 0, -MAX_COORDINATE, MAX_COORDINATE)),
        y: Math.round(finiteNumber(entryBbox.y, 0, -MAX_COORDINATE, MAX_COORDINATE)),
        width: Math.round(finiteNumber(entryBbox.width, 1024, 1, MAX_IMAGE_SIDE)),
        height: Math.round(finiteNumber(entryBbox.height, 1024, 1, MAX_IMAGE_SIDE)),
      },
      projectRevision: Math.max(0, Math.round(Number(entry.projectRevision) || 0)),
      snapshotSignature: String(entry.snapshotSignature || '').slice(0, 1_000_000),
      acceptanceMaskUrl: String(entry.acceptanceMaskUrl || '').trim().slice(0, 8192),
      status: String(entry.status || 'queued').trim().slice(0, 64),
      settings: normalizeGenerationSettings(entry.settings),
      createdAt: Math.max(0, Math.round(Number(entry.createdAt) || Date.now())),
      updatedAt: Math.max(0, Math.round(Number(entry.updatedAt) || Date.now())),
    };
  }).filter((entry: Record<string, any>) => entry.jobId && entry.settings);
  const staging = (Array.isArray(rawGeneration.staging) ? rawGeneration.staging : []).slice(0, 1024).map((rawStage: unknown, index: number) => {
    const entry = asRecord(rawStage);
    const entryBbox = asRecord(entry.bbox);
    return {
      id: safeId(entry.id, `canvas-stage-${index + 1}`),
      jobId: safeId(entry.jobId),
      itemId: safeId(entry.itemId),
      seed: Math.round(finiteNumber(entry.seed, 0, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)),
      imageUrl: String(entry.imageUrl || '').trim().slice(0, 8192),
      sourcePath: String(entry.sourcePath || '').trim().slice(0, 8192),
      bbox: {
        x: Math.round(finiteNumber(entryBbox.x, 0, -MAX_COORDINATE, MAX_COORDINATE)),
        y: Math.round(finiteNumber(entryBbox.y, 0, -MAX_COORDINATE, MAX_COORDINATE)),
        width: Math.round(finiteNumber(entryBbox.width, 1024, 1, MAX_IMAGE_SIDE)),
        height: Math.round(finiteNumber(entryBbox.height, 1024, 1, MAX_IMAGE_SIDE)),
      },
      projectRevision: Math.max(0, Math.round(Number(entry.projectRevision) || 0)),
      snapshotSignature: String(entry.snapshotSignature || '').slice(0, 1_000_000),
      acceptanceMaskUrl: String(entry.acceptanceMaskUrl || '').trim().slice(0, 8192),
      acceptedEntityId: safeId(entry.acceptedEntityId),
      pinned: entry.pinned === true,
      createdAt: Math.max(0, Math.round(Number(entry.createdAt) || Date.now())),
    };
  }).filter((entry: Record<string, any>) => entry.imageUrl && entry.sourcePath);
  return {
    version: PROJECT_VERSION,
    id,
    name: String(source.name || 'Untitled Canvas').trim().slice(0, 240) || 'Untitled Canvas',
    entities,
    activeEntityId: entityIds.has(String(source.activeEntityId || '')) ? String(source.activeEntityId) : '',
    generationBbox: {
      x: Math.round(finiteNumber(bbox.x, 0, -MAX_COORDINATE, MAX_COORDINATE)),
      y: Math.round(finiteNumber(bbox.y, 0, -MAX_COORDINATE, MAX_COORDINATE)),
      width: Math.max(alignment, Math.round(finiteNumber(bbox.width, 1024, alignment, MAX_IMAGE_SIDE) / alignment) * alignment),
      height: Math.max(alignment, Math.round(finiteNumber(bbox.height, 1024, alignment, MAX_IMAGE_SIDE) / alignment) * alignment),
    },
    generationAlignment: alignment,
    viewport: {
      x: finiteNumber(viewport.x, 0, -MAX_COORDINATE, MAX_COORDINATE),
      y: finiteNumber(viewport.y, 0, -MAX_COORDINATE, MAX_COORDINATE),
      scale: finiteNumber(viewport.scale, 1, 0.05, 8),
    },
    generation: {
      settings: normalizeGenerationSettings(rawGeneration.settings),
      pending,
      staging,
    },
    revision: Math.max(0, Math.round(Number(source.revision) || 0)),
    createdAt: Math.max(0, Math.round(Number(source.createdAt) || Date.now())),
    updatedAt: Math.max(0, Math.round(Number(source.updatedAt) || Date.now())),
  };
}

async function writeFileDurably(path: string, data: string | Uint8Array): Promise<void> {
  const handle = await open(path, 'w');
  try {
    if (typeof data === 'string') await handle.writeFile(data, 'utf8');
    else await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function replaceFileAtomically(temporaryPath: string, finalPath: string): Promise<void> {
  try {
    await rename(temporaryPath, finalPath);
    return;
  } catch {
    // Windows cannot replace an existing file with rename(). Keep a short-lived
    // backup so an interrupted save never destroys the last usable document.
  }
  const backupPath = `${finalPath}.umbra-canvas-backup-${Date.now()}`;
  const hadExisting = await stat(finalPath).then((entry) => entry.isFile()).catch(() => false);
  if (hadExisting) await rename(finalPath, backupPath);
  try {
    await rename(temporaryPath, finalPath);
    if (hadExisting) await rm(backupPath, { force: true });
  } catch (error) {
    if (hadExisting) await rename(backupPath, finalPath).catch(() => undefined);
    throw error;
  }
}

export class UmbraUiCanvasWorkspaceProjectService {
  private readonly root: string;

  constructor(userRoot: string) {
    this.root = resolve(userRoot, 'UmbraUI', 'CanvasProjects');
  }

  private projectRoot(projectIdInput: string): string {
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid Canvas project id is required.');
    const target = resolve(this.root, projectId);
    if (!target.startsWith(`${this.root}${sep}`)) throw new Error('Invalid Canvas project path.');
    return target;
  }

  private projectAssetUrl(projectId: string, filename: string): string {
    return `/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(filename)}`;
  }

  private projectThumbnailUrl(projectId: string, updatedAt: number): string {
    return `/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/thumbnail?rev=${Math.max(0, Math.round(updatedAt))}`;
  }

  private restorePointRoot(projectId: string): string {
    return join(this.projectRoot(projectId), 'restore-points');
  }

  private restorePointPath(projectId: string, restorePointIdInput: string): string {
    const restorePointId = safeId(restorePointIdInput);
    if (!restorePointId) throw new Error('A valid Canvas restore point id is required.');
    const root = resolve(this.restorePointRoot(projectId));
    const target = resolve(root, `${restorePointId}.json`);
    if (!target.startsWith(`${root}${sep}`)) throw new Error('Invalid Canvas restore point path.');
    return target;
  }

  private async readRestorePoint(projectId: string, restorePointId: string): Promise<Record<string, any> | null> {
    try {
      return asRecord(JSON.parse(await readFile(this.restorePointPath(projectId, restorePointId), 'utf8')));
    } catch {
      return null;
    }
  }

  private async collectRestorePointAssetNames(projectId: string, names: Set<string>): Promise<void> {
    const entries = await readdir(this.restorePointRoot(projectId), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const restorePoint = asRecord(JSON.parse(await readFile(join(this.restorePointRoot(projectId), entry.name), 'utf8')));
        const project = asRecord(restorePoint.project);
        for (const entity of Array.isArray(project.entities) ? project.entities : []) {
          const imageUrl = String(asRecord(entity).imageUrl || '');
          if (!imageUrl.startsWith(PROJECT_ASSET_PREFIX)) continue;
          const filename = safeStoredFilename(imageUrl.slice(PROJECT_ASSET_PREFIX.length));
          if (filename) names.add(filename);
        }
        const generation = asRecord(project.generation);
        for (const entry of [
          ...(Array.isArray(generation.pending) ? generation.pending : []),
          ...(Array.isArray(generation.staging) ? generation.staging : []),
        ]) {
          const acceptanceMaskUrl = String(asRecord(entry).acceptanceMaskUrl || '');
          if (!acceptanceMaskUrl.startsWith(PROJECT_ASSET_PREFIX)) continue;
          const filename = safeStoredFilename(acceptanceMaskUrl.slice(PROJECT_ASSET_PREFIX.length));
          if (filename) names.add(filename);
        }
      } catch {
        // A malformed restore point must not prevent a normal project save.
      }
    }
  }

  private dehydrateExistingUrl(projectId: string, value: unknown): string {
    const raw = String(value || '').trim();
    const prefix = `/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/assets/`;
    if (!raw.startsWith(prefix)) return raw;
    const filename = safeStoredFilename(decodeURIComponent(raw.slice(prefix.length).split(/[?#]/, 1)[0] || ''));
    return filename ? `${PROJECT_ASSET_PREFIX}${filename}` : '';
  }

  private hydrate(projectId: string, rawProject: unknown): Record<string, any> {
    const project = cloneJson(asRecord(rawProject));
    project.entities = (Array.isArray(project.entities) ? project.entities : []).map((entity: Record<string, any>) => {
      const imageUrl = String(entity.imageUrl || '');
      if (!imageUrl.startsWith(PROJECT_ASSET_PREFIX)) return entity;
      const filename = safeStoredFilename(imageUrl.slice(PROJECT_ASSET_PREFIX.length));
      return { ...entity, imageUrl: filename ? this.projectAssetUrl(projectId, filename) : '' };
    });
    const generation = asRecord(project.generation);
    for (const collectionName of ['pending', 'staging']) {
      generation[collectionName] = (Array.isArray(generation[collectionName]) ? generation[collectionName] : []).map((entry: Record<string, any>) => {
        const acceptanceMaskUrl = String(entry.acceptanceMaskUrl || '');
        if (!acceptanceMaskUrl.startsWith(PROJECT_ASSET_PREFIX)) return entry;
        const filename = safeStoredFilename(acceptanceMaskUrl.slice(PROJECT_ASSET_PREFIX.length));
        return { ...entry, acceptanceMaskUrl: filename ? this.projectAssetUrl(projectId, filename) : '' };
      });
    }
    project.generation = generation;
    return project;
  }

  private async readStored(projectId: string): Promise<Record<string, any> | null> {
    try {
      return asRecord(JSON.parse(await readFile(join(this.projectRoot(projectId), 'project.json'), 'utf8')));
    } catch {
      return null;
    }
  }

  async save(
    projectIdInput: string,
    rawProject: unknown,
    assetInputs: UmbraUiCanvasWorkspaceAssetInput[],
    thumbnailInput?: Uint8Array,
  ): Promise<Record<string, any>> {
    await mkdir(this.root, { recursive: true });
    const project = normalizeProject(rawProject);
    const projectId = safeId(projectIdInput);
    if (!projectId || projectId !== project.id) throw new Error('The Canvas project id does not match its save target.');
    if (thumbnailInput && thumbnailInput.byteLength > 16 * 1024 * 1024) throw new Error('The Canvas project thumbnail exceeds the 16 MB limit.');
    const rawJson = JSON.stringify(project);
    if (Buffer.byteLength(rawJson, 'utf8') > MAX_PROJECT_JSON_BYTES) throw new Error('The Canvas project document exceeds the 16 MB limit.');
    const projectRoot = this.projectRoot(projectId);
    const assetsRoot = join(projectRoot, 'assets');
    await mkdir(assetsRoot, { recursive: true });
    const stored = await this.readStored(projectId);
    const previousById = new Map((Array.isArray(stored?.entities) ? stored.entities : []).map((entity: any) => [String(entity.id || ''), entity]));
    const previousGeneration = asRecord(stored?.generation);
    const previousPendingByJob = new Map((Array.isArray(previousGeneration.pending) ? previousGeneration.pending : []).map((entry: any) => [String(entry.jobId || ''), entry]));
    const previousStageByKey = new Map((Array.isArray(previousGeneration.staging) ? previousGeneration.staging : []).map((entry: any) => [`${String(entry.jobId || '')}:${String(entry.itemId || '')}`, entry]));
    const uploaded = new Map<string, string>();
    for (const input of assetInputs) {
      const key = safeId(input.key);
      if (!key || input.bytes.byteLength <= 0) continue;
      if (input.bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`Canvas asset ${key} exceeds the 256 MB limit.`);
      const filename = safeAssetName(key, input.name, input.bytes);
      const finalPath = join(assetsRoot, filename);
      const existingSize = await stat(finalPath).then((entry) => entry.size).catch(() => -1);
      if (existingSize !== input.bytes.byteLength) {
        const temporaryPath = join(assetsRoot, `.${filename}.${Date.now()}.tmp`);
        await writeFileDurably(temporaryPath, input.bytes);
        await replaceFileAtomically(temporaryPath, finalPath).catch(async (error) => {
          await rm(temporaryPath, { force: true }).catch(() => undefined);
          throw error;
        });
      }
      uploaded.set(key, filename);
    }
    project.entities = project.entities.map((entity: Record<string, any>) => {
      if (entity.kind !== 'raster' && entity.kind !== 'mask') return entity;
      const uploadedFilename = uploaded.get(entity.id);
      const currentUrl = this.dehydrateExistingUrl(projectId, entity.imageUrl);
      const previousUrl = String(asRecord(previousById.get(entity.id)).imageUrl || '');
      if (uploadedFilename) return { ...entity, imageUrl: `${PROJECT_ASSET_PREFIX}${uploadedFilename}` };
      if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) return { ...entity, imageUrl: currentUrl };
      if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) return { ...entity, imageUrl: previousUrl };
      if (entity.kind === 'mask' && !currentUrl) return { ...entity, imageUrl: '' };
      if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Canvas layer ${entity.name} was not uploaded with the project.`);
      throw new Error(`Canvas layer ${entity.name} does not reference a saved image asset.`);
    });
    project.generation.pending = project.generation.pending.map((entry: Record<string, any>) => {
      const key = safeId(`pending-mask-${entry.jobId}`);
      const uploadedFilename = uploaded.get(key);
      const currentUrl = this.dehydrateExistingUrl(projectId, entry.acceptanceMaskUrl);
      const previousUrl = String(asRecord(previousPendingByJob.get(entry.jobId)).acceptanceMaskUrl || '');
      if (uploadedFilename) return { ...entry, acceptanceMaskUrl: `${PROJECT_ASSET_PREFIX}${uploadedFilename}` };
      if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) return { ...entry, acceptanceMaskUrl: currentUrl };
      if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) return { ...entry, acceptanceMaskUrl: previousUrl };
      if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Canvas pending mask ${entry.jobId} was not uploaded with the project.`);
      return { ...entry, acceptanceMaskUrl: '' };
    });
    project.generation.staging = project.generation.staging.map((entry: Record<string, any>) => {
      const key = safeId(`stage-mask-${entry.jobId}-${entry.itemId}`);
      const uploadedFilename = uploaded.get(key);
      const currentUrl = this.dehydrateExistingUrl(projectId, entry.acceptanceMaskUrl);
      const previousUrl = String(asRecord(previousStageByKey.get(`${entry.jobId}:${entry.itemId}`)).acceptanceMaskUrl || '');
      if (uploadedFilename) return { ...entry, acceptanceMaskUrl: `${PROJECT_ASSET_PREFIX}${uploadedFilename}` };
      if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) return { ...entry, acceptanceMaskUrl: currentUrl };
      if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) return { ...entry, acceptanceMaskUrl: previousUrl };
      if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Canvas staging mask ${entry.id} was not uploaded with the project.`);
      return { ...entry, acceptanceMaskUrl: '' };
    });
    project.updatedAt = Date.now();
    const serialized = JSON.stringify(project, null, 2);
    const temporaryProjectPath = join(projectRoot, `project.${Date.now()}.tmp`);
    await writeFileDurably(temporaryProjectPath, serialized);
    await replaceFileAtomically(temporaryProjectPath, join(projectRoot, 'project.json')).catch(async (error) => {
      await rm(temporaryProjectPath, { force: true }).catch(() => undefined);
      throw error;
    });
    if (thumbnailInput && thumbnailInput.byteLength > 0) {
      const temporaryThumbnailPath = join(projectRoot, `.thumbnail.${Date.now()}.tmp`);
      await writeFileDurably(temporaryThumbnailPath, thumbnailInput);
      await replaceFileAtomically(temporaryThumbnailPath, join(projectRoot, 'thumbnail.png')).catch(async (error) => {
        await rm(temporaryThumbnailPath, { force: true }).catch(() => undefined);
        throw error;
      });
    }
    const referenced = new Set(project.entities.map((entity: Record<string, any>) => (
      (entity.kind === 'raster' || entity.kind === 'mask') && String(entity.imageUrl || '').startsWith(PROJECT_ASSET_PREFIX)
        ? safeStoredFilename(String(entity.imageUrl).slice(PROJECT_ASSET_PREFIX.length))
        : ''
    )).filter(Boolean));
    for (const entry of [...project.generation.pending, ...project.generation.staging]) {
      const acceptanceMaskUrl = String(entry.acceptanceMaskUrl || '');
      if (!acceptanceMaskUrl.startsWith(PROJECT_ASSET_PREFIX)) continue;
      const filename = safeStoredFilename(acceptanceMaskUrl.slice(PROJECT_ASSET_PREFIX.length));
      if (filename) referenced.add(filename);
    }
    await this.collectRestorePointAssetNames(projectId, referenced);
    const assetEntries = await readdir(assetsRoot, { withFileTypes: true }).catch(() => []);
    await Promise.all(assetEntries.map((entry) => (
      entry.isFile() && !referenced.has(entry.name)
        ? rm(join(assetsRoot, entry.name), { force: true })
        : Promise.resolve()
    )));
    return this.hydrate(projectId, project);
  }

  async get(projectIdInput: string): Promise<Record<string, any> | null> {
    const projectId = safeId(projectIdInput);
    if (!projectId) return null;
    const stored = await this.readStored(projectId);
    return stored ? this.hydrate(projectId, normalizeProject(stored)) : null;
  }

  async fork(projectIdInput: string, nameInput: unknown): Promise<Record<string, any>> {
    const sourceId = safeId(projectIdInput);
    if (!sourceId) throw new Error('A valid Canvas project id is required.');
    const stored = await this.readStored(sourceId);
    if (!stored) throw new Error('Save the Canvas project before creating a copy.');
    const now = Date.now();
    const targetId = safeId(`canvas-${now}-${Math.random().toString(36).slice(2, 10)}`);
    const project = normalizeProject(stored);
    project.id = targetId;
    project.name = String(nameInput || `${project.name} Copy`).trim().slice(0, 160) || `${project.name} Copy`;
    project.revision = 0;
    project.createdAt = now;
    project.updatedAt = now;
    const sourceRoot = this.projectRoot(sourceId);
    const targetRoot = this.projectRoot(targetId);
    const targetAssets = join(targetRoot, 'assets');
    await mkdir(targetAssets, { recursive: true });
    const sourceAssets = await readdir(join(sourceRoot, 'assets'), { withFileTypes: true }).catch(() => []);
    for (const entry of sourceAssets) {
      if (!entry.isFile()) continue;
      await copyFile(join(sourceRoot, 'assets', entry.name), join(targetAssets, entry.name));
    }
    const sourceThumbnail = join(sourceRoot, 'thumbnail.png');
    if (await stat(sourceThumbnail).then((entry) => entry.isFile()).catch(() => false)) {
      await copyFile(sourceThumbnail, join(targetRoot, 'thumbnail.png'));
    }
    const temporaryPath = join(targetRoot, `project.${now}.tmp`);
    await writeFileDurably(temporaryPath, JSON.stringify(project, null, 2));
    await replaceFileAtomically(temporaryPath, join(targetRoot, 'project.json')).catch(async (error) => {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    });
    return this.hydrate(targetId, project);
  }

  async list(): Promise<UmbraUiCanvasWorkspaceProjectSummary[]> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    const summaries: UmbraUiCanvasWorkspaceProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const stored = await this.readStored(entry.name);
      if (!stored) continue;
      const project = normalizeProject(stored);
      const topVisible = [...project.entities].reverse().find((entity: Record<string, any>) => entity.visible !== false && String(entity.imageUrl || '').startsWith(PROJECT_ASSET_PREFIX));
      const filename = topVisible ? safeStoredFilename(String(topVisible.imageUrl).slice(PROJECT_ASSET_PREFIX.length)) : '';
      const hasThumbnail = await stat(join(this.projectRoot(project.id), 'thumbnail.png')).then((item) => item.isFile()).catch(() => false);
      summaries.push({
        id: project.id,
        name: project.name,
        thumbnailUrl: hasThumbnail
          ? this.projectThumbnailUrl(project.id, project.updatedAt)
          : filename ? `${this.projectAssetUrl(project.id, filename)}?thumb=1` : '',
        entityCount: project.entities.length,
        generationWidth: project.generationBbox.width,
        generationHeight: project.generationBbox.height,
        updatedAt: project.updatedAt,
      });
    }
    return summaries.sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  }

  async listRestorePoints(projectIdInput: string): Promise<UmbraUiCanvasWorkspaceRestorePointSummary[]> {
    const projectId = safeId(projectIdInput);
    if (!projectId) return [];
    const entries = await readdir(this.restorePointRoot(projectId), { withFileTypes: true }).catch(() => []);
    const restorePoints: UmbraUiCanvasWorkspaceRestorePointSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const restorePoint = asRecord(JSON.parse(await readFile(join(this.restorePointRoot(projectId), entry.name), 'utf8')));
        const project = asRecord(restorePoint.project);
        const id = safeId(restorePoint.id, entry.name.slice(0, -5));
        if (!id) continue;
        restorePoints.push({
          id,
          name: String(restorePoint.name || 'Restore Point').trim().slice(0, 160) || 'Restore Point',
          createdAt: Math.max(0, Math.round(Number(restorePoint.createdAt) || 0)),
          revision: Math.max(0, Math.round(Number(project.revision) || 0)),
          entityCount: Array.isArray(project.entities) ? project.entities.length : 0,
          stagingCount: Array.isArray(asRecord(project.generation).staging) ? asRecord(project.generation).staging.length : 0,
        });
      } catch {
        // Ignore malformed restore points while preserving the rest of the list.
      }
    }
    return restorePoints.sort((left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name));
  }

  async createRestorePoint(projectIdInput: string, nameInput: unknown): Promise<UmbraUiCanvasWorkspaceRestorePointSummary> {
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid Canvas project id is required.');
    const stored = await this.readStored(projectId);
    if (!stored) throw new Error('Save the Canvas project before creating a restore point.');
    const project = normalizeProject(stored);
    const createdAt = Date.now();
    const name = String(nameInput || 'Restore Point').trim().slice(0, 160) || 'Restore Point';
    const id = safeId(`${createdAt}-${name}-${Math.random().toString(36).slice(2, 8)}`);
    const root = this.restorePointRoot(projectId);
    await mkdir(root, { recursive: true });
    const restorePoint = { id, name, createdAt, project };
    const temporaryPath = join(root, `${id}.${createdAt}.tmp`);
    await writeFileDurably(temporaryPath, JSON.stringify(restorePoint, null, 2));
    await replaceFileAtomically(temporaryPath, this.restorePointPath(projectId, id)).catch(async (error) => {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    });
    const restorePoints = await this.listRestorePoints(projectId);
    await Promise.all(restorePoints.slice(50).map((candidate) => rm(this.restorePointPath(projectId, candidate.id), { force: true })));
    return {
      id,
      name,
      createdAt,
      revision: project.revision,
      entityCount: project.entities.length,
      stagingCount: project.generation.staging.length,
    };
  }

  async restoreRestorePoint(projectIdInput: string, restorePointIdInput: string): Promise<Record<string, any>> {
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid Canvas project id is required.');
    const restorePoint = await this.readRestorePoint(projectId, restorePointIdInput);
    if (!restorePoint?.project) throw new Error('The Canvas restore point was not found.');
    const project = normalizeProject(restorePoint.project);
    project.id = projectId;
    project.revision = Math.max(1, project.revision + 1);
    project.updatedAt = Date.now();
    const root = this.projectRoot(projectId);
    await mkdir(root, { recursive: true });
    const temporaryPath = join(root, `project.restore.${Date.now()}.tmp`);
    await writeFileDurably(temporaryPath, JSON.stringify(project, null, 2));
    await replaceFileAtomically(temporaryPath, join(root, 'project.json')).catch(async (error) => {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    });
    return this.hydrate(projectId, project);
  }

  async deleteRestorePoint(projectIdInput: string, restorePointIdInput: string): Promise<void> {
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid Canvas project id is required.');
    await rm(this.restorePointPath(projectId, restorePointIdInput), { force: true });
  }

  async delete(projectIdInput: string): Promise<void> {
    await rm(this.projectRoot(projectIdInput), { recursive: true, force: true });
  }

  async resolveAsset(projectIdInput: string, filenameInput: string): Promise<{ path: string; size: number } | null> {
    const assetsRoot = resolve(this.projectRoot(projectIdInput), 'assets');
    const filename = safeStoredFilename(filenameInput);
    if (!filename) return null;
    const target = resolve(assetsRoot, filename);
    if (!target.startsWith(`${assetsRoot}${sep}`)) return null;
    const entry = await stat(target).catch(() => null);
    return entry?.isFile() ? { path: target, size: entry.size } : null;
  }

  async resolveThumbnail(projectIdInput: string): Promise<{ path: string; size: number } | null> {
    const target = join(this.projectRoot(projectIdInput), 'thumbnail.png');
    const entry = await stat(target).catch(() => null);
    return entry?.isFile() ? { path: target, size: entry.size } : null;
  }
}
