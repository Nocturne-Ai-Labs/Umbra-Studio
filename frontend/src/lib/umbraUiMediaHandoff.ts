import {
  extractGenerationParams,
  extractPrompts,
  type ImageMetadata,
} from '@/utils/metadata';
import { normalizePowerPrompterGenerationControls } from '@/lib/powerPrompter';
import type {
  PowerPrompterDetailerStage,
  PowerPrompterHiresFixControls,
  PowerPrompterOutputUpscaleControls,
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
} from '@/types/powerPrompter';

export const UMBRA_UI_MEDIA_HANDOFF_KEY = 'umbra-ui:pending-media-handoff';
export const UMBRA_UI_MEDIA_HANDOFF_EVENT = 'umbra:umbra-ui-media-handoff';

export type UmbraUiMediaHandoffMode = 'txt2img' | 'img2img' | 'inpaint' | 'video';
export type UmbraUiVideoFrameRole = 'first' | 'middle' | 'last' | 'source_video';
export type UmbraUiStudioDestinationMode = 'new_artboard' | 'layer_on_artboard' | 'reference' | 'replace_source';

export interface UmbraUiMediaHandoffLora {
  id: string;
  name: string;
  enabled: boolean;
  strengthModel: number;
  strengthClip: number;
}

export interface UmbraUiMediaPromptSegment {
  text: string;
  label?: string;
  slotType?: string;
  variantId?: string;
  variantName?: string;
}

export interface UmbraUiMediaInpaintSnapshot {
  receiptVersion?: number;
  workflowId: string;
  inpaintAdapter: string;
  adapterModelName: string;
  operationMode?: 'inpaint' | 'outpaint';
  generationRegion?: { x: number; y: number; width: number; height: number };
  samples?: number;
  maskGrow?: number;
  maskFeather?: number;
  contextPadding?: number;
  processingScaleMode?: 'none' | 'auto' | 'manual';
  processingWidth?: number;
  processingHeight?: number;
  coherenceMode?: 'none' | 'gaussian' | 'box' | 'staged';
  coherenceEdgeSize?: number;
  coherenceMinimumDenoise?: number;
  seamlessX?: boolean;
  seamlessY?: boolean;
  outputOnlyMaskedRegions?: boolean;
  semanticCutout?: boolean;
  fillMode?: 'neutral' | 'telea' | 'navier-stokes' | 'color' | 'tile' | 'lama';
  infillColor?: string;
  infillTileSize?: number;
  inpaintModelName?: string;
  colorMatch?: number;
  differentialStrength?: number;
  softInpaintEnabled?: boolean;
  softInpaintPreservation?: number;
  softInpaintTransitionContrast?: number;
  softInpaintMaskInfluence?: number;
  regionalGuidanceCount: number;
  controlLayerCount: number;
  referenceLayerCount: number;
}

export interface UmbraUiMediaGenerationSnapshot {
  positivePrompt: string;
  positivePromptSegments?: UmbraUiMediaPromptSegment[];
  negativePrompt: string;
  modelFamily: string;
  modelType: string;
  checkpointName: string;
  vaeName: string;
  seed?: number;
  steps?: number;
  cfg?: number;
  clipSkip?: number;
  samplerName: string;
  scheduler: string;
  width?: number;
  height?: number;
  denoise?: number;
  controlAfterGenerate?: PowerPrompterSeedControlMode;
  seedIncrement?: PowerPrompterSeedIncrement;
  hiresFix?: PowerPrompterHiresFixControls;
  detailerPipeline?: PowerPrompterDetailerStage[];
  outputUpscale?: PowerPrompterOutputUpscaleControls;
  workflowResources?: Record<string, string>;
  loras: UmbraUiMediaHandoffLora[];
  inpaint?: UmbraUiMediaInpaintSnapshot;
}

export interface UmbraUiMediaHandoff {
  mode: UmbraUiMediaHandoffMode;
  path: string;
  originalSourcePath: string;
  name: string;
  imageUrl: string;
  source: string;
  canvasProjectId?: string;
  canvasOperationMode?: 'inpaint' | 'outpaint';
  studioProjectId?: string;
  studioArtboardId?: string;
  studioDestination?: UmbraUiStudioDestinationMode;
  videoFrameRole?: UmbraUiVideoFrameRole;
  generation?: UmbraUiMediaGenerationSnapshot;
  createdAt: number;
}

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizePath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/');
}

function finiteNumber(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function boundedNumber(value: unknown, minimum: number, maximum: number, integer = false): number | undefined {
  const number = finiteNumber(value);
  if (number === undefined) return undefined;
  const bounded = Math.max(minimum, Math.min(maximum, number));
  return integer ? Math.round(bounded) : bounded;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function normalizeModelKey(value: string): string {
  return normalizePath(value).toLowerCase().replace(/\.(safetensors|ckpt|pt|pth|bin)$/i, '');
}

function inferModelFamily(modelName: string): string {
  const value = normalizeModelKey(modelName);
  if (value.includes('anima')) return 'Anima';
  if (value.includes('sdxl') || value.includes('pony')) return 'SDXL';
  if (value.includes('flux')) return 'Flux';
  if (value.includes('krea')) return 'Krea 2';
  if (value.includes('hidream')) return 'HiDream';
  if (value.includes('ernie')) return 'ERNIE';
  return '';
}

function cleanPromptText(value: string): string {
  return value
    .replace(/\s*,\s*/g, ', ')
    .replace(/(?:,\s*){2,}/g, ', ')
    .replace(/^\s*,\s*|\s*,\s*$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function readPromptGraph(metadata: ImageMetadata): UnknownRecord | null {
  const candidates = [metadata.prompt, metadata.umbra_api_workflow, metadata.workflow];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const direct = isRecord(candidate.prompt) ? candidate.prompt : candidate;
    const values = Object.values(direct);
    if (values.some((value) => isRecord(value) && typeof value.class_type === 'string')) return direct;
  }
  return null;
}

function extractPromptSyntaxLoras(prompt: string): UmbraUiMediaHandoffLora[] {
  const loras: UmbraUiMediaHandoffLora[] = [];
  const pattern = /<lora:([^:>]+)(?::([-+]?(?:\d+\.?\d*|\.\d+)))?(?::([-+]?(?:\d+\.?\d*|\.\d+)))?>/gi;
  for (const match of prompt.matchAll(pattern)) {
    const name = normalizePath(match[1]);
    if (!name) continue;
    const strengthModel = finiteNumber(match[2]) ?? 1;
    const strengthClip = finiteNumber(match[3]) ?? strengthModel;
    loras.push({
      id: `metadata-lora-${loras.length + 1}`,
      name,
      enabled: true,
      strengthModel,
      strengthClip,
    });
  }
  return loras;
}

function extractGraphLoras(metadata: ImageMetadata): UmbraUiMediaHandoffLora[] {
  const graph = readPromptGraph(metadata);
  if (!graph) return [];
  const loras: UmbraUiMediaHandoffLora[] = [];
  for (const node of Object.values(graph)) {
    if (!isRecord(node) || !isRecord(node.inputs)) continue;
    const classType = String(node.class_type || '').toLowerCase();
    if (!classType.includes('lora')) continue;
    const name = normalizePath(node.inputs.lora_name || node.inputs.loraName);
    if (!name || name === '[None]') continue;
    const strengthModel = finiteNumber(node.inputs.strength_model ?? node.inputs.strength) ?? 1;
    const strengthClip = finiteNumber(node.inputs.strength_clip) ?? strengthModel;
    loras.push({
      id: `metadata-graph-lora-${loras.length + 1}`,
      name,
      enabled: true,
      strengthModel,
      strengthClip,
    });
  }
  return loras;
}

function extractGraphClipSkip(metadata: ImageMetadata): number | undefined {
  const graph = readPromptGraph(metadata);
  if (!graph) return undefined;
  for (const node of Object.values(graph)) {
    if (!isRecord(node) || !isRecord(node.inputs)) continue;
    if (String(node.class_type || '') !== 'CLIPSetLastLayer') continue;
    const layer = finiteNumber(node.inputs.stop_at_clip_layer);
    if (layer !== undefined) return Math.max(1, Math.abs(Math.trunc(layer)));
  }
  return undefined;
}

function mergeLoras(...groups: UmbraUiMediaHandoffLora[][]): UmbraUiMediaHandoffLora[] {
  const merged = new Map<string, UmbraUiMediaHandoffLora>();
  for (const group of groups) {
    for (const lora of group) {
      const key = normalizeModelKey(lora.name);
      if (!key) continue;
      merged.set(key, { ...lora, id: `metadata-lora-${merged.size + 1}` });
    }
  }
  return Array.from(merged.values());
}

function normalizeMetadataLoras(value: unknown, idPrefix: string): UmbraUiMediaHandoffLora[] {
  if (!Array.isArray(value)) return [];
  return value.map((candidate, index) => {
    const entry = isRecord(candidate) ? candidate : {};
    const name = normalizePath(entry.name);
    const strengthModel = boundedNumber(entry.strengthModel ?? entry.model_weight, -10, 10) ?? 1;
    return {
      id: String(entry.id || `${idPrefix}-${index + 1}`).trim() || `${idPrefix}-${index + 1}`,
      name,
      enabled: entry.enabled !== false,
      strengthModel,
      strengthClip: boundedNumber(entry.strengthClip, -10, 10) ?? strengthModel,
    };
  }).filter((entry) => !!entry.name);
}

export function normalizeUmbraUiMediaInpaintSnapshot(value: unknown): UmbraUiMediaInpaintSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const region = isRecord(value.generationRegion) ? value.generationRegion : null;
  const regionWidth = boundedNumber(region?.width, 1, 16384, true);
  const regionHeight = boundedNumber(region?.height, 1, 16384, true);
  const fillMode = ['neutral', 'telea', 'navier-stokes', 'color', 'tile', 'lama'].includes(String(value.fillMode || ''))
    ? value.fillMode as UmbraUiMediaInpaintSnapshot['fillMode']
    : undefined;
  const processingScaleMode = ['none', 'auto', 'manual'].includes(String(value.processingScaleMode || ''))
    ? value.processingScaleMode as UmbraUiMediaInpaintSnapshot['processingScaleMode']
    : undefined;
  const coherenceMode = ['none', 'gaussian', 'box', 'staged'].includes(String(value.coherenceMode || ''))
    ? value.coherenceMode as UmbraUiMediaInpaintSnapshot['coherenceMode']
    : undefined;
  const infillColor = /^#[0-9a-f]{6}$/i.test(String(value.infillColor || ''))
    ? String(value.infillColor).toLowerCase()
    : undefined;
  const operationMode = value.operationMode === 'outpaint'
    ? 'outpaint'
    : value.operationMode === 'inpaint' ? 'inpaint' : undefined;
  const countLayers = (candidate: unknown, explicit: unknown) => (
    Array.isArray(candidate)
      ? candidate.length
      : boundedNumber(explicit, 0, 10_000, true) ?? 0
  );
  return {
    receiptVersion: boundedNumber(value.receiptVersion ?? value.version, 1, 100, true),
    workflowId: String(value.workflowId || '').trim().slice(0, 240),
    inpaintAdapter: String(value.inpaintAdapter || '').trim().slice(0, 120),
    adapterModelName: normalizePath(value.adapterModelName).slice(0, 500),
    operationMode,
    generationRegion: region && regionWidth !== undefined && regionHeight !== undefined
      ? {
        x: boundedNumber(region.x, 0, 16384, true) ?? 0,
        y: boundedNumber(region.y, 0, 16384, true) ?? 0,
        width: regionWidth,
        height: regionHeight,
      }
      : undefined,
    samples: boundedNumber(value.samples, 1, 16, true),
    maskGrow: boundedNumber(value.canvasMaskGrow ?? value.maskGrow, 0, 2048, true),
    maskFeather: boundedNumber(value.canvasMaskFeather ?? value.maskFeather, 0, 2048, true),
    contextPadding: boundedNumber(value.contextPadding, 0, 2048, true),
    processingScaleMode,
    processingWidth: boundedNumber(value.processingWidth, 64, 16384, true),
    processingHeight: boundedNumber(value.processingHeight, 64, 16384, true),
    coherenceMode,
    coherenceEdgeSize: boundedNumber(value.coherenceEdgeSize, 0, 2048, true),
    coherenceMinimumDenoise: boundedNumber(value.coherenceMinimumDenoise, 0, 1),
    seamlessX: optionalBoolean(value.seamlessX),
    seamlessY: optionalBoolean(value.seamlessY),
    outputOnlyMaskedRegions: optionalBoolean(value.outputOnlyMaskedRegions),
    semanticCutout: optionalBoolean(value.semanticCutout),
    fillMode,
    infillColor,
    infillTileSize: boundedNumber(value.infillTileSize, 8, 512, true),
    inpaintModelName: normalizePath(value.inpaintModelName).slice(0, 500) || undefined,
    colorMatch: boundedNumber(value.colorMatch, 0, 1),
    differentialStrength: boundedNumber(value.differentialStrength, 0, 1),
    softInpaintEnabled: optionalBoolean(value.softInpaintEnabled),
    softInpaintPreservation: boundedNumber(value.softInpaintPreservation, 0, 1),
    softInpaintTransitionContrast: boundedNumber(value.softInpaintTransitionContrast, 0.25, 8),
    softInpaintMaskInfluence: boundedNumber(value.softInpaintMaskInfluence, 0, 1),
    regionalGuidanceCount: countLayers(value.regionalGuidance, value.regionalGuidanceCount),
    controlLayerCount: countLayers(value.controlLayers, value.controlLayerCount),
    referenceLayerCount: countLayers(value.referenceLayers, value.referenceLayerCount),
  };
}

export function normalizeUmbraUiMediaGenerationSnapshot(value: unknown): UmbraUiMediaGenerationSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const seedControl = value.controlAfterGenerate ?? value.seedMode;
  const normalizedPipelineControls = normalizePowerPrompterGenerationControls({
    controlAfterGenerate: seedControl,
    seedIncrement: value.seedIncrement,
    hiresFix: value.hiresFix,
    detailerPipeline: value.detailerPipeline,
    outputUpscale: value.outputUpscale,
  });
  const resources = isRecord(value.workflowResources)
    ? Object.fromEntries(Object.entries(value.workflowResources)
      .map(([key, resource]) => [String(key || '').trim(), normalizePath(resource)])
      .filter(([key, resource]) => !!key && !!resource))
    : undefined;
  const positivePromptSegments = Array.isArray(value.positivePromptSegments)
    ? value.positivePromptSegments
      .map((candidate): UmbraUiMediaPromptSegment | null => {
        const segment = isRecord(candidate) ? candidate : {};
        const text = cleanPromptText(String(segment.text || '').trim());
        if (!text) return null;
        return {
          text,
          ...(String(segment.label || '').trim() ? { label: String(segment.label).trim().slice(0, 160) } : {}),
          ...(String(segment.slotType || '').trim() ? { slotType: String(segment.slotType).trim().slice(0, 80) } : {}),
          ...(String(segment.variantId || '').trim() ? { variantId: String(segment.variantId).trim().slice(0, 240) } : {}),
          ...(String(segment.variantName || '').trim() ? { variantName: String(segment.variantName).trim().slice(0, 240) } : {}),
        };
      })
      .filter((segment): segment is UmbraUiMediaPromptSegment => !!segment)
      .slice(0, 64)
    : [];
  return {
    positivePrompt: String(value.positivePrompt || '').trim(),
    ...(positivePromptSegments.length > 0 ? { positivePromptSegments } : {}),
    negativePrompt: String(value.negativePrompt || '').trim(),
    modelFamily: String(value.modelFamily || '').trim().slice(0, 160),
    modelType: String(value.modelType || '').trim().slice(0, 80),
    checkpointName: normalizePath(value.checkpointName).slice(0, 1000),
    vaeName: normalizePath(value.vaeName).slice(0, 1000),
    seed: boundedNumber(value.seed, 0, Number.MAX_SAFE_INTEGER, true),
    steps: boundedNumber(value.steps, 1, 10_000, true),
    cfg: boundedNumber(value.cfg, 0, 100),
    clipSkip: boundedNumber(value.clipSkip, 1, 12, true),
    samplerName: String(value.samplerName || '').trim().slice(0, 160),
    scheduler: String(value.scheduler || '').trim().slice(0, 160),
    width: boundedNumber(value.width, 1, 16384, true),
    height: boundedNumber(value.height, 1, 16384, true),
    denoise: boundedNumber(value.denoise, 0.01, 1),
    ...(seedControl !== undefined ? { controlAfterGenerate: normalizedPipelineControls.controlAfterGenerate } : {}),
    ...(value.seedIncrement !== undefined ? { seedIncrement: normalizedPipelineControls.seedIncrement } : {}),
    ...(isRecord(value.hiresFix) ? { hiresFix: normalizedPipelineControls.hiresFix } : {}),
    ...(Array.isArray(value.detailerPipeline) ? { detailerPipeline: normalizedPipelineControls.detailerPipeline } : {}),
    ...(isRecord(value.outputUpscale) ? { outputUpscale: normalizedPipelineControls.outputUpscale } : {}),
    workflowResources: resources && Object.keys(resources).length > 0 ? resources : undefined,
    loras: normalizeMetadataLoras(value.loras, 'metadata-handoff-lora'),
    inpaint: normalizeUmbraUiMediaInpaintSnapshot(value.inpaint),
  };
}

export function buildUmbraUiMediaGenerationSnapshot(metadata: ImageMetadata | null | undefined): UmbraUiMediaGenerationSnapshot | undefined {
  if (!metadata) return undefined;
  const prompts = extractPrompts(metadata);
  const params = extractGenerationParams(metadata);
  const powerPrompter = isRecord(metadata.umbra_power_prompter) ? metadata.umbra_power_prompter : {};
  const generation = isRecord(powerPrompter.generation) ? powerPrompter.generation : {};
  const inpaint = isRecord(metadata.umbra_inpaint) ? metadata.umbra_inpaint : {};
  const normalizedPowerPrompterGeneration = normalizePowerPrompterGenerationControls({
    ...generation,
    controlAfterGenerate: generation.controlAfterGenerate ?? generation.seedMode ?? inpaint.seedMode,
    seedIncrement: generation.seedIncrement ?? inpaint.seedIncrement,
  });
  const positivePromptWithSyntax = String(prompts.positive || powerPrompter.prompt || '').trim();
  const syntaxLoras = extractPromptSyntaxLoras(positivePromptWithSyntax);
  const positivePrompt = cleanPromptText(positivePromptWithSyntax.replace(/<lora:[^>]+>/gi, ''));
  const positivePromptSegments = Array.isArray(powerPrompter.segments)
    ? powerPrompter.segments
      .map((candidate): UmbraUiMediaPromptSegment | null => {
        const segment = isRecord(candidate) ? candidate : {};
        const text = cleanPromptText(String(segment.text || '').replace(/<lora:[^>]+>/gi, ''));
        if (!text) return null;
        return {
          text,
          ...(String(segment.slotLabel || '').trim() ? { label: String(segment.slotLabel).trim() } : {}),
          ...(String(segment.slotType || '').trim() ? { slotType: String(segment.slotType).trim() } : {}),
          ...(String(segment.variantId || '').trim() ? { variantId: String(segment.variantId).trim() } : {}),
          ...(String(segment.variantName || '').trim() ? { variantName: String(segment.variantName).trim() } : {}),
        };
      })
      .filter((segment): segment is UmbraUiMediaPromptSegment => !!segment)
    : [];
  const directLoras = Array.isArray(metadata.loras)
    ? metadata.loras.map((entry, index) => {
      const name = normalizePath(entry?.name);
      const strengthModel = finiteNumber(entry?.model_weight) ?? 1;
      return {
        id: `metadata-direct-lora-${index + 1}`,
        name,
        enabled: true,
        strengthModel,
        strengthClip: strengthModel,
      };
    }).filter((entry) => !!entry.name)
    : [];
  const generationLoras = Array.isArray(generation.loras)
    ? generation.loras.map((value, index) => {
      const entry = isRecord(value) ? value : {};
      const name = normalizePath(entry.name);
      const strengthModel = finiteNumber(entry.strengthModel) ?? 1;
      return {
        id: String(entry.id || `metadata-generation-lora-${index + 1}`),
        name,
        enabled: entry.enabled !== false,
        strengthModel,
        strengthClip: finiteNumber(entry.strengthClip) ?? strengthModel,
      };
    }).filter((entry) => !!entry.name)
    : [];
  const inpaintLoras = normalizeMetadataLoras(inpaint.loras, 'metadata-inpaint-lora');
  const checkpointName = normalizePath(generation.checkpointName || inpaint.checkpointName || params.model);
  const workflowResources = isRecord(generation.workflowResources)
    ? Object.fromEntries(Object.entries(generation.workflowResources)
      .map(([key, value]) => [String(key || '').trim(), normalizePath(value)])
      .filter(([key, value]) => !!key && !!value))
    : undefined;
  const negativePrompt = String(prompts.negative || powerPrompter.negativePrompt || generation.negativePrompt || '').trim();

  return normalizeUmbraUiMediaGenerationSnapshot({
    positivePrompt,
    positivePromptSegments,
    negativePrompt,
    modelFamily: String(generation.modelFamily || inpaint.modelFamily || '').trim() || inferModelFamily(checkpointName),
    modelType: String(generation.modelType || inpaint.modelSource || '').trim() || (checkpointName.toLowerCase().endsWith('.gguf') ? 'gguf' : 'checkpoint'),
    checkpointName,
    vaeName: normalizePath(generation.vaeName || params.vae),
    seed: finiteNumber(generation.seed ?? inpaint.seed ?? params.seed),
    steps: finiteNumber(generation.steps ?? inpaint.steps ?? params.steps),
    cfg: finiteNumber(generation.cfg ?? inpaint.cfg ?? params.cfg),
    clipSkip: finiteNumber(generation.clipSkip ?? generation.clip_skip ?? inpaint.clipSkip) ?? extractGraphClipSkip(metadata),
    samplerName: String(generation.samplerName || inpaint.samplerName || params.sampler || '').trim(),
    scheduler: String(generation.scheduler || inpaint.scheduler || params.scheduler || '').trim(),
    width: finiteNumber(generation.width ?? params.width),
    height: finiteNumber(generation.height ?? params.height),
    denoise: finiteNumber(generation.denoise ?? inpaint.denoise ?? params.denoise),
    ...(generation.controlAfterGenerate !== undefined
      || generation.seedMode !== undefined
      || inpaint.seedMode !== undefined
      ? { controlAfterGenerate: normalizedPowerPrompterGeneration.controlAfterGenerate }
      : {}),
    ...(generation.seedIncrement !== undefined || inpaint.seedIncrement !== undefined
      ? { seedIncrement: normalizedPowerPrompterGeneration.seedIncrement }
      : {}),
    ...(isRecord(generation.hiresFix) ? { hiresFix: normalizedPowerPrompterGeneration.hiresFix } : {}),
    ...(Array.isArray(generation.detailerPipeline)
      ? { detailerPipeline: normalizedPowerPrompterGeneration.detailerPipeline }
      : {}),
    ...(isRecord(generation.outputUpscale)
      ? { outputUpscale: normalizedPowerPrompterGeneration.outputUpscale }
      : {}),
    workflowResources,
    loras: mergeLoras(directLoras, extractGraphLoras(metadata), generationLoras, inpaintLoras, syntaxLoras),
    inpaint: normalizeUmbraUiMediaInpaintSnapshot(inpaint),
  });
}

export function normalizeUmbraUiMediaHandoff(value: unknown): UmbraUiMediaHandoff | null {
  if (!isRecord(value)) return null;
  const mode = String(value.mode || '').trim().toLowerCase();
  if (mode !== 'txt2img' && mode !== 'img2img' && mode !== 'inpaint' && mode !== 'video') return null;
  const path = normalizePath(value.path);
  const originalSourcePath = normalizePath(value.originalSourcePath) || path;
  const imageUrl = String(value.imageUrl || '').trim();
  if (!path || !imageUrl) return null;
  const role = String(value.videoFrameRole || '').trim().toLowerCase();
  const studioDestination = String(value.studioDestination || '').trim();
  return {
    mode,
    path,
    originalSourcePath,
    name: String(value.name || path.split('/').pop() || 'image').trim(),
    imageUrl,
    source: String(value.source || 'umbra-ui').trim() || 'umbra-ui',
    canvasProjectId: String(value.canvasProjectId || '').trim() || undefined,
    canvasOperationMode: value.canvasOperationMode === 'outpaint' ? 'outpaint' : value.canvasOperationMode === 'inpaint' ? 'inpaint' : undefined,
    studioProjectId: String(value.studioProjectId || '').trim() || undefined,
    studioArtboardId: String(value.studioArtboardId || '').trim() || undefined,
    studioDestination: studioDestination === 'layer_on_artboard' || studioDestination === 'reference' || studioDestination === 'replace_source'
      ? studioDestination
      : studioDestination === 'new_artboard' ? 'new_artboard' : undefined,
    ...(mode === 'video' ? {
      videoFrameRole: role === 'middle' || role === 'last' || role === 'source_video' ? role : 'first',
    } : {}),
    generation: normalizeUmbraUiMediaGenerationSnapshot(value.generation),
    createdAt: finiteNumber(value.createdAt) || Date.now(),
  };
}

export async function fetchUmbraUiMediaMetadata(path: string): Promise<ImageMetadata | null> {
  const normalizedPath = normalizePath(path);
  if (!normalizedPath) return null;
  try {
    const response = await fetch(`/api/fs/metadata?${new URLSearchParams({ path: normalizedPath }).toString()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json() as ImageMetadata;
  } catch {
    return null;
  }
}

export async function stageUmbraUiMediaHandoff(options: {
  mode: UmbraUiMediaHandoffMode;
  path: string;
  originalSourcePath?: string;
  name?: string;
  imageUrl?: string;
  source: string;
  videoFrameRole?: UmbraUiVideoFrameRole;
  canvasProjectId?: string;
  canvasOperationMode?: 'inpaint' | 'outpaint';
  studioProjectId?: string;
  studioArtboardId?: string;
  studioDestination?: UmbraUiStudioDestinationMode;
  metadata?: ImageMetadata | null;
}): Promise<UmbraUiMediaHandoff> {
  const path = normalizePath(options.path);
  if (!path) throw new Error('Choose media before sending it to Umbra UI.');
  const metadata = options.metadata === undefined ? await fetchUmbraUiMediaMetadata(path) : options.metadata;
  const inpaint = isRecord(metadata?.umbra_inpaint) ? metadata.umbra_inpaint : {};
  const originalSourcePath = normalizePath(options.originalSourcePath)
    || normalizePath(inpaint.originalSourcePath)
    || path;
  // Project routing must be explicit. Generated-image metadata can retain the
  // legacy canvas id for lineage, but generic Gallery/filmstrip handoffs must
  // still ask the user which Studio project should receive the image.
  const canvasProjectId = String(options.canvasProjectId || '').trim();
  const canvasOperationMode = options.canvasOperationMode || (inpaint.operationMode === 'outpaint' ? 'outpaint' : inpaint.operationMode === 'inpaint' ? 'inpaint' : undefined);
  const payload: UmbraUiMediaHandoff = {
    mode: options.mode,
    path,
    originalSourcePath,
    name: String(options.name || path.split('/').pop() || 'image').trim(),
    imageUrl: options.imageUrl || `/api/fs/image?${new URLSearchParams({ path }).toString()}`,
    source: String(options.source || 'umbra-ui').trim() || 'umbra-ui',
    ...(canvasProjectId ? { canvasProjectId } : {}),
    ...(canvasOperationMode ? { canvasOperationMode } : {}),
    ...(options.studioProjectId ? { studioProjectId: options.studioProjectId } : {}),
    ...(options.studioArtboardId ? { studioArtboardId: options.studioArtboardId } : {}),
    ...(options.studioDestination ? { studioDestination: options.studioDestination } : {}),
    ...(options.mode === 'video' ? { videoFrameRole: options.videoFrameRole || 'first' } : {}),
    generation: buildUmbraUiMediaGenerationSnapshot(metadata),
    createdAt: Date.now(),
  };
  const target = window as typeof window & { __umbraPendingUmbraUiMediaHandoff?: UmbraUiMediaHandoff | null };
  target.__umbraPendingUmbraUiMediaHandoff = payload;
  try { window.sessionStorage.setItem(UMBRA_UI_MEDIA_HANDOFF_KEY, JSON.stringify(payload)); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent(UMBRA_UI_MEDIA_HANDOFF_EVENT, { detail: payload }));
  return payload;
}
