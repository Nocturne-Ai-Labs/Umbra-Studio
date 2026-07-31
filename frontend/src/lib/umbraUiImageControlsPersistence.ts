import { normalizePowerPrompterGenerationControls } from '@/lib/powerPrompter';
import type {
  PowerPrompterDetailerStage,
  PowerPrompterModelType,
  PowerPrompterOutputUpscaleControls,
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
} from '@/types/powerPrompter';
import type { UmbraUiLoraEntry } from '@/lib/umbraUiModels';
import {
  inferUmbraImageAspectRatio,
  inferUmbraImageBaseResolution,
  UMBRA_IMAGE_ASPECT_PRESETS,
  type UmbraImageAspectPresetId,
} from '@/lib/umbraUiImageResolution';

export const UMBRA_UI_IMAGE_CONTROLS_VERSION = 1 as const;

export interface UmbraUiImageGenerationControls {
  negativePrompt: string;
  seed: number;
  seedMode: PowerPrompterSeedControlMode;
  seedIncrement: PowerPrompterSeedIncrement;
  steps: number;
  cfg: number;
  clipSkip: number;
  samplerName: string;
  scheduler: string;
  modelType: PowerPrompterModelType;
  checkpointName: string;
  width: number;
  height: number;
  batchSize: number;
  img2imgDenoise: number;
  hiresFix: {
    enabled: boolean;
    upscaler: string;
    resizeMode: 'scale' | 'dimensions';
    scaleBy: number;
    targetWidth: number;
    targetHeight: number;
    steps: number;
    denoise: number;
    cfg: number;
    samplerName: string;
    scheduler: string;
  };
  detailerPipeline: PowerPrompterDetailerStage[];
  outputUpscale: PowerPrompterOutputUpscaleControls;
}

export interface UmbraUiImageControlsSnapshot {
  version: typeof UMBRA_UI_IMAGE_CONTROLS_VERSION;
  updatedAt: number;
  modelFamily: string;
  workflowResourceValues: Record<string, string>;
  loras: UmbraUiLoraEntry[];
  imageAspectRatio: UmbraImageAspectPresetId;
  imageBaseResolution: number;
  generation: UmbraUiImageGenerationControls;
}

const MAX_MODEL_FAMILY_LENGTH = 256;
const MAX_LORAS = 128;
const MAX_LORA_NAME_LENGTH = 4096;
const MAX_LORA_TAGS = 128;
const MAX_LORA_TAG_LENGTH = 512;
const MAX_WORKFLOW_RESOURCES = 128;
const MAX_WORKFLOW_RESOURCE_ID_LENGTH = 240;
const MAX_WORKFLOW_RESOURCE_VALUE_LENGTH = 4096;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function clampInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
}

function clampNumber(value: unknown, fallback: number, minimum: number, maximum: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function normalizeModelFamily(value: unknown): string {
  return String(value || '').trim().slice(0, MAX_MODEL_FAMILY_LENGTH);
}

function normalizeWorkflowResources(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value)
    .map(([rawId, rawValue]) => [
      String(rawId || '').trim().slice(0, MAX_WORKFLOW_RESOURCE_ID_LENGTH),
      String(rawValue || '').trim().replace(/\\/g, '/').slice(0, MAX_WORKFLOW_RESOURCE_VALUE_LENGTH),
    ] as const)
    .filter(([id, resource]) => id.length > 0 && resource.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .slice(0, MAX_WORKFLOW_RESOURCES);
  return Object.fromEntries(entries);
}

function normalizeLoras(value: unknown): UmbraUiLoraEntry[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const normalized: UmbraUiLoraEntry[] = [];
  for (const [index, rawEntry] of value.entries()) {
    if (!isRecord(rawEntry) || normalized.length >= MAX_LORAS) continue;
    const name = String(rawEntry.name || '').trim().replace(/\\/g, '/').slice(0, MAX_LORA_NAME_LENGTH);
    if (!name) continue;
    const fallbackId = `umbra-ui-lora-${index + 1}-${name.toLowerCase()}`.slice(0, 512);
    let id = String(rawEntry.id || '').trim().slice(0, 512) || fallbackId;
    if (ids.has(id)) id = `${id}-${index + 1}`.slice(0, 512);
    ids.add(id);
    const trainedTags = Array.isArray(rawEntry.trainedTags)
      ? Array.from(new Set(rawEntry.trainedTags
        .map((tag) => String(tag || '').trim().slice(0, MAX_LORA_TAG_LENGTH))
        .filter(Boolean)))
        .slice(0, MAX_LORA_TAGS)
      : [];
    const strengthModel = clampNumber(rawEntry.strengthModel, 1, -10, 10);
    normalized.push({
      id,
      name,
      ...(normalizeModelFamily(rawEntry.modelFamilyKey) ? {
        modelFamilyKey: normalizeModelFamily(rawEntry.modelFamilyKey).toLowerCase(),
      } : {}),
      enabled: rawEntry.enabled !== false,
      strengthModel,
      strengthClip: clampNumber(rawEntry.strengthClip, strengthModel, -10, 10),
      trainedTags,
    });
  }
  return normalized;
}

function normalizeAspectRatio(value: unknown, width: number, height: number): UmbraImageAspectPresetId {
  const candidate = String(value || '').trim() as UmbraImageAspectPresetId;
  if (candidate === 'custom' || UMBRA_IMAGE_ASPECT_PRESETS.some((preset) => preset.id === candidate)) {
    return candidate;
  }
  return inferUmbraImageAspectRatio(width, height);
}

function normalizeUpdatedAt(value: unknown, fallback: number): number {
  return clampInteger(value, fallback, 0, Number.MAX_SAFE_INTEGER);
}

/**
 * Keeps Umbra UI's reusable image controls independent from transient browser
 * state such as prompts, source media, open drawers, and queue activity.
 */
export function normalizeUmbraUiImageControlsSnapshot(
  value: unknown,
  fallbackUpdatedAt = Date.now(),
): UmbraUiImageControlsSnapshot | null {
  if (!isRecord(value)) return null;
  const source = isRecord(value.generation) ? value.generation : value;
  const normalizedGeneration = normalizePowerPrompterGenerationControls({
    ...source,
    outputOwner: 'umbra_ui',
    outputMode: 'txt2img',
  });
  const workflowResourceValues = normalizeWorkflowResources(
    value.workflowResourceValues ?? normalizedGeneration.workflowResources,
  );
  const width = normalizedGeneration.width;
  const height = normalizedGeneration.height;
  const aspectRatio = normalizeAspectRatio(value.imageAspectRatio, width, height);
  const imageBaseResolution = clampInteger(
    value.imageBaseResolution,
    inferUmbraImageBaseResolution(width, height),
    512,
    2048,
  );

  return {
    version: UMBRA_UI_IMAGE_CONTROLS_VERSION,
    updatedAt: normalizeUpdatedAt(value.updatedAt, fallbackUpdatedAt),
    modelFamily: normalizeModelFamily(value.modelFamily),
    workflowResourceValues,
    loras: normalizeLoras(value.loras ?? source.loras),
    imageAspectRatio: aspectRatio,
    imageBaseResolution,
    generation: {
      negativePrompt: normalizedGeneration.negativePrompt,
      seed: normalizedGeneration.seed,
      seedMode: normalizedGeneration.controlAfterGenerate,
      seedIncrement: normalizedGeneration.seedIncrement,
      steps: normalizedGeneration.steps,
      cfg: normalizedGeneration.cfg,
      clipSkip: normalizedGeneration.clipSkip,
      samplerName: normalizedGeneration.samplerName,
      scheduler: normalizedGeneration.scheduler,
      modelType: normalizedGeneration.modelType,
      checkpointName: normalizedGeneration.checkpointName,
      width,
      height,
      batchSize: normalizedGeneration.batchSize,
      img2imgDenoise: normalizedGeneration.img2img?.denoise ?? 0.3,
      hiresFix: {
        enabled: normalizedGeneration.hiresFix?.enabled === true,
        upscaler: normalizedGeneration.hiresFix?.upscaler || 'Latent',
        resizeMode: normalizedGeneration.hiresFix?.resizeMode === 'dimensions' ? 'dimensions' : 'scale',
        scaleBy: normalizedGeneration.hiresFix?.scaleBy ?? 2,
        targetWidth: normalizedGeneration.hiresFix?.targetWidth ?? 0,
        targetHeight: normalizedGeneration.hiresFix?.targetHeight ?? 0,
        steps: normalizedGeneration.hiresFix?.steps ?? 0,
        denoise: normalizedGeneration.hiresFix?.denoise ?? 0.35,
        cfg: normalizedGeneration.hiresFix?.cfg ?? 0,
        samplerName: normalizedGeneration.hiresFix?.samplerName || 'use_same',
        scheduler: normalizedGeneration.hiresFix?.scheduler || 'use_same',
      },
      detailerPipeline: (normalizedGeneration.detailerPipeline || []).map((stage) => ({ ...stage })),
      outputUpscale: {
        enabled: normalizedGeneration.outputUpscale?.enabled === true,
        modelName: normalizedGeneration.outputUpscale?.modelName || 'RealESRGAN_x4plus.safetensors',
        maxDimension: normalizedGeneration.outputUpscale?.maxDimension ?? 3840,
      },
    },
  };
}

export function hasUmbraUiImageControls(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const generation = isRecord(value.generation) ? value.generation : value;
  return [
    value.modelFamily,
    value.workflowResourceValues,
    value.loras,
    value.imageAspectRatio,
    value.imageBaseResolution,
    generation.modelType,
    generation.checkpointName,
    generation.steps,
    generation.cfg,
    generation.width,
    generation.height,
    generation.detailerPipeline,
    generation.outputUpscale,
    generation.hiresFix,
  ].some((entry) => entry !== undefined);
}

export function getUmbraUiImageControlsFingerprint(snapshot: UmbraUiImageControlsSnapshot): string {
  const { updatedAt: _updatedAt, ...stableSnapshot } = snapshot;
  return JSON.stringify(stableSnapshot);
}
