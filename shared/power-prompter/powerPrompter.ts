import type {
  PowerPrompterAutocompleteMode,
  PowerPrompterAutocompleteSettings,
  PowerPrompterCardDocument,
  PowerPrompterDeletedCardGroup,
  PowerPrompterCardNode,
  PowerPrompterCardType,
  PowerPrompterCompletionSoundStyle,
  PowerPrompterCsvSource,
  PowerPrompterEditorMode,
  PowerPrompterDetailerStage,
  PowerPrompterGenerationControls,
  PowerPrompterHiresFixControls,
  PowerPrompterLoraEntry,
  PowerPrompterModelType,
  PowerPrompterOutputUpscaleControls,
  PowerPrompterQueueTraversalMode,
  PowerPrompterQueueTraversalRole,
  PowerPrompterSeedControlMode,
  PowerPrompterSettings,
  PowerPrompterStyleSeedMode,
} from './types';
import { normalizeUmbraUiPipelineSelection } from '../umbra-ui/pipelineTypes';

interface PowerPrompterBaseCardConfig {
  type: Exclude<PowerPrompterCardType, 'custom'>;
  label: string;
}

const PP_BASE_CARD_CONFIG: PowerPrompterBaseCardConfig[] = [
  { type: 'character', label: 'Character' },
  { type: 'location', label: 'Location' },
  { type: 'expression', label: 'Expression' },
  { type: 'action', label: 'Action' },
  { type: 'style', label: 'Style' },
];

export const POWER_PROMPTER_CARD_DOC_VERSION = 1;
export const POWER_PROMPTER_MAX_QUEUE_SETS = 10;
export const POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT = 99;
export const POWER_PROMPTER_ASPECT_RATIO_OPTIONS = [
  'custom',
  'SD1.5 - 1:1 square 512x512',
  'SD1.5 - 2:3 portrait 512x768',
  'SD1.5 - 3:4 portrait 512x682',
  'SD1.5 - 3:2 landscape 768x512',
  'SD1.5 - 4:3 landscape 682x512',
  'SD1.5 - 16:9 cinema 910x512',
  'SD1.5 - 1.85:1 cinema 952x512',
  'SD1.5 - 2:1 cinema 1024x512',
  'SD1.5 - 2.39:1 anamorphic 1224x512',
  'SDXL - 1:1 square 1024x1024',
  'SDXL - 3:4 portrait 896x1152',
  'SDXL - 5:8 portrait 832x1216',
  'SDXL - 9:16 portrait 768x1344',
  'SDXL - 9:21 portrait 640x1536',
  'SDXL - 4:3 landscape 1152x896',
  'SDXL - 3:2 landscape 1216x832',
  'SDXL - 16:9 landscape 1344x768',
  'SDXL - 21:9 landscape 1536x640',
  '1536 - 1:1 square 1536x1536',
  '1536 - 2:3 portrait 1024x1536',
  '1536 - 3:4 portrait 1152x1536',
  '1536 - 5:8 portrait 960x1536',
  '1536 - 9:16 portrait 864x1536',
  '1536 - 9:21 portrait 656x1536',
  '1536 - 3:2 landscape 1536x1024',
  '1536 - 4:3 landscape 1536x1152',
  '1536 - 8:5 landscape 1536x960',
  '1536 - 16:9 landscape 1536x864',
  '1536 - 1.85:1 cinema 1536x832',
  '1536 - 2:1 cinema 1536x768',
  '1536 - 2.39:1 anamorphic 1536x640',
  '1536 - 21:9 landscape 1536x656',
] as const;
export const POWER_PROMPTER_SAMPLER_OPTIONS = [
  'euler',
  'euler_ancestral',
  'heun',
  'dpm_2',
  'dpm_2_ancestral',
  'lms',
  'dpm_fast',
  'dpm_adaptive',
  'dpmpp_2s_ancestral',
  'dpmpp_sde',
  'dpmpp_sde_gpu',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde',
  'dpmpp_3m_sde_gpu',
  'er_sde',
  'ddpm',
  'lcm',
  'ipndm',
  'ipndm_v',
  'vddim',
  'uni_pc',
  'uni_pc_bh2',
] as const;
export const POWER_PROMPTER_SCHEDULER_OPTIONS = [
  'normal',
  'karras',
  'exponential',
  'sgm_uniform',
  'simple',
  'ddim_uniform',
  'beta',
] as const;
const POWER_PROMPTER_SEED_CONTROL_OPTIONS: PowerPrompterSeedControlMode[] = [
  'fixed',
  'increment',
  'decrement',
  'randomize',
];
const POWER_PROMPTER_COMPLETION_SOUND_STYLE_OPTIONS: PowerPrompterCompletionSoundStyle[] = [
  'glass_tick',
  'soft_chime',
  'muted_bell',
  'mellow_ping',
  'warm_click',
  'crystal_drop',
  'airy_pluck',
  'soft_mallet',
  'bamboo_tap',
  'quiet_blip',
  'silver_ping',
  'velvet_tone',
  'tiny_marimba',
  'hollow_knock',
  'amber_chime',
  'misty_note',
  'calm_beep',
  'soft_triangle',
  'dusk_ting',
  'studio_tick',
];
const POWER_PROMPTER_QUEUE_TRAVERSAL_MODES: PowerPrompterQueueTraversalMode[] = [
  'cycle',
  'exhaustive',
];
const POWER_PROMPTER_STYLE_SEED_MODES: PowerPrompterStyleSeedMode[] = [
  'same',
  'different',
];
const POWER_PROMPTER_MODEL_TYPES: PowerPrompterModelType[] = [
  'checkpoint',
  'diffusers',
  'diffusion_model',
  'unet',
  'gguf',
];
const POWER_PROMPTER_QUEUE_DIVERSITY_MIN = 0;
const POWER_PROMPTER_QUEUE_DIVERSITY_MAX = 100;
const POWER_PROMPTER_QUEUE_DIVERSITY_DECIMAL_SCALE = 100;
const DEFAULT_POWER_PROMPTER_ASPECT_RATIO = 'SDXL - 1:1 square 1024x1024';
const MAX_JS_SAFE_SEED = Number.MAX_SAFE_INTEGER;
const MAX_LORA_ENTRIES = 24;
const MAX_THUMBNAIL_OVERRIDE_ENTRIES = 200;
const MAX_THUMBNAIL_OVERRIDE_VALUES_PER_ENTRY = 12;
const MAX_THUMBNAIL_OVERRIDE_DATA_URL_LENGTH = 2200000;

function createLoraEntryId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pp-lora-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeLoraName(rawName: unknown): string {
  return String(rawName || '').trim().replace(/\\/g, '/');
}

function normalizeLoraStrength(rawValue: unknown, fallback: number): number {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(-10, Math.min(10, numeric));
}

function normalizeLoraQueueSetIds(rawSets: unknown, fallbackEnabled = true): number[] {
  if (!Array.isArray(rawSets)) return fallbackEnabled ? [1] : [];
  const normalized = Array.from(new Set(
    rawSets
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= POWER_PROMPTER_MAX_QUEUE_SETS)
  )).sort((a, b) => a - b);
  if (normalized.length === 0 && fallbackEnabled) return [1];
  return normalized;
}

function normalizeVariantName(rawName: unknown): string {
  return String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function normalizeVariantTag(rawTag: unknown): string {
  return String(rawTag || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

function normalizeVariantTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTag of rawTags) {
    const tag = normalizeVariantTag(rawTag);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length >= 16) break;
  }
  return normalized;
}

function normalizeChainLinks(rawLinks: unknown, selfId = ''): string[] {
  if (!Array.isArray(rawLinks)) return [];
  const selfKey = String(selfId || '').trim();
  return Array.from(new Set(
    rawLinks
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0 && entry !== selfKey)
  ));
}

function normalizeBlockLinks(rawLinks: unknown, selfId = ''): string[] {
  return normalizeChainLinks(rawLinks, selfId);
}

export function normalizeQueueTraversalRole(rawRole: unknown): PowerPrompterQueueTraversalRole {
  const value = String(rawRole || '').trim().toLowerCase();
  if (value === 'hold' || value === 'fast') return value;
  return 'cycle';
}

function normalizeModelType(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function normalizeModelColor(rawValue: unknown): string {
  const value = String(rawValue || '').trim();
  if (!value) return '#38bdf8';
  const normalized = value.startsWith('#') ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized.toLowerCase() : '#38bdf8';
}

function normalizeStyleSeedMode(rawValue: unknown): PowerPrompterStyleSeedMode {
  const value = String(rawValue || '').trim().toLowerCase() as PowerPrompterStyleSeedMode;
  return POWER_PROMPTER_STYLE_SEED_MODES.includes(value) ? value : 'same';
}

function normalizeLoraEntries(rawEntries: unknown): PowerPrompterLoraEntry[] {
  if (!Array.isArray(rawEntries)) return [];
  const entries: PowerPrompterLoraEntry[] = [];
  const seenIds = new Set<string>();
  for (const rawEntry of rawEntries) {
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as Partial<PowerPrompterLoraEntry>;
    const name = normalizeLoraName(entry.name);
    if (!name) continue;
    const idCandidate = String(entry.id || '').trim() || createLoraEntryId();
    if (seenIds.has(idCandidate)) continue;
    seenIds.add(idCandidate);
    const strengthModel = normalizeLoraStrength(entry.strengthModel, 1.0);
    const strengthClip = normalizeLoraStrength(entry.strengthClip, strengthModel);
    const queueEnabled = entry.queueEnabled !== false;
    const queueSetIds = normalizeLoraQueueSetIds(entry.queueSetIds, queueEnabled);
    entries.push({
      id: idCandidate,
      name,
      strengthModel,
      strengthClip,
      enabled: entry.enabled !== false,
      queueEnabled: queueSetIds.length > 0,
      queueSetIds,
    });
    if (entries.length >= MAX_LORA_ENTRIES) break;
  }
  return entries;
}

export const DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS: PowerPrompterGenerationControls = {
  detailerPipeline: [
    {
      id: 'detail-person', enabled: true, label: 'Person', detectorModel: 'segm/person_yolov8m-seg.pt',
      guideSize: 1024, guideSizeFor: 'bbox', maxSize: 1536, seedOffset: 1, steps: 8, cfg: 4,
      samplerName: 'er_sde', scheduler: 'simple', denoise: 0.18, feather: 10, noiseMask: true,
      forceInpaint: true, bboxThreshold: 0.5, bboxDilation: 10, bboxCropFactor: 2.2, useSam: true,
      samModel: 'sam_vit_b_01ec64.pth', samDeviceMode: 'AUTO', samDetectionHint: 'center-1',
      samDilation: 0, samThreshold: 0.93, samBboxExpansion: 0, samMaskHintThreshold: 0.7,
      samMaskHintUseNegative: 'False', dropSize: 10,
      wildcard: '[CONCAT] coherent anatomy, natural body proportions, coherent clothing folds',
      cycle: 1, noiseMaskFeather: 24, tiledEncode: false, tiledDecode: false,
    },
    {
      id: 'detail-face', enabled: true, label: 'Face', detectorModel: 'bbox/face_yolov8m.pt',
      guideSize: 512, guideSizeFor: 'crop_region', maxSize: 1024, seedOffset: 2, steps: 8, cfg: 4,
      samplerName: 'er_sde', scheduler: 'simple', denoise: 0.18, feather: 5, noiseMask: true,
      forceInpaint: true, bboxThreshold: 0.5, bboxDilation: 10, bboxCropFactor: 2.5, useSam: true,
      samModel: 'sam_vit_b_01ec64.pth', samDeviceMode: 'AUTO', samDetectionHint: 'center-1',
      samDilation: 0, samThreshold: 0.93, samBboxExpansion: 0, samMaskHintThreshold: 0.7,
      samMaskHintUseNegative: 'False', dropSize: 10, wildcard: '', cycle: 1,
      noiseMaskFeather: 20, tiledEncode: false, tiledDecode: false,
    },
    {
      id: 'detail-eyes', enabled: false, label: 'Eyes', detectorModel: 'bbox/Eyes.pt',
      guideSize: 384, guideSizeFor: 'bbox', maxSize: 512, seedOffset: 3, steps: 7, cfg: 4,
      samplerName: 'er_sde', scheduler: 'simple', denoise: 0.16, feather: 4, noiseMask: true,
      forceInpaint: true, bboxThreshold: 0.4, bboxDilation: 5, bboxCropFactor: 2.4, useSam: true,
      samModel: 'sam_vit_b_01ec64.pth', samDeviceMode: 'AUTO', samDetectionHint: 'center-1',
      samDilation: 0, samThreshold: 0.93, samBboxExpansion: 0, samMaskHintThreshold: 0.7,
      samMaskHintUseNegative: 'False', dropSize: 4,
      wildcard: '[CONCAT] detailed symmetrical eyes, sharp irises, natural pupils', cycle: 1,
      noiseMaskFeather: 12, tiledEncode: false, tiledDecode: false,
    },
    {
      id: 'detail-hands', enabled: true, label: 'Hands', detectorModel: 'bbox/hand_yolov8s.pt',
      guideSize: 512, guideSizeFor: 'bbox', maxSize: 768, seedOffset: 4, steps: 10, cfg: 4,
      samplerName: 'er_sde', scheduler: 'simple', denoise: 0.28, feather: 10, noiseMask: true,
      forceInpaint: true, bboxThreshold: 0.35, bboxDilation: 14, bboxCropFactor: 2.8, useSam: true,
      samModel: 'sam_vit_b_01ec64.pth', samDeviceMode: 'AUTO', samDetectionHint: 'center-1',
      samDilation: 0, samThreshold: 0.93, samBboxExpansion: 0, samMaskHintThreshold: 0.7,
      samMaskHintUseNegative: 'False', dropSize: 10,
      wildcard: '[CONCAT] detailed hands, anatomically correct hands, five fingers, natural finger spacing',
      cycle: 1, noiseMaskFeather: 20, tiledEncode: false, tiledDecode: false,
    },
  ],
  outputUpscale: {
    enabled: false,
    modelName: 'RealESRGAN_x4plus.safetensors',
    maxDimension: 3840,
  },
  hiresFix: {
    enabled: false,
    upscaler: 'Latent',
    resizeMode: 'scale',
    scaleBy: 2,
    targetWidth: 0,
    targetHeight: 0,
    steps: 0,
    denoise: 0.35,
    cfg: 0,
    samplerName: 'use_same',
    scheduler: 'use_same',
  },
  negativePrompt: '',
  seed: 0,
  controlAfterGenerate: 'fixed',
  steps: 20,
  cfg: 7,
  clipSkip: 1,
  samplerName: 'euler',
  scheduler: 'normal',
  modelType: 'checkpoint',
  checkpointName: '',
  workflowResources: {},
  aspectRatio: DEFAULT_POWER_PROMPTER_ASPECT_RATIO,
  swapDimensions: false,
  width: 1024,
  height: 1024,
  batchSize: 1,
  loras: [],
  thumbnailOverrides: {},
};

function normalizeThumbnailOverrideKey(rawKey: unknown): string {
  return String(rawKey || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .toLowerCase();
}

function normalizeThumbnailOverrideValue(rawValue: unknown): string {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (value.length > MAX_THUMBNAIL_OVERRIDE_DATA_URL_LENGTH) return '';
  if (value.startsWith('data:image/')) return value;
  if (value.startsWith('data:video/')) return value;
  if (value.startsWith('umbra-media://')) return value;
  if (value.startsWith('/api/fs/read?path=')) return value;
  if (value.startsWith('/api/fs/image?path=')) return value;
  if (value.startsWith('/api/fs/thumbnail?path=')) return value;
  return '';
}

function normalizeThumbnailOverrideValues(rawValue: unknown): string[] {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const normalized = Array.from(new Set(
    values
      .map((entry) => normalizeThumbnailOverrideValue(entry))
      .filter((entry) => entry.length > 0)
  ));
  return normalized.slice(0, MAX_THUMBNAIL_OVERRIDE_VALUES_PER_ENTRY);
}

function normalizeThumbnailOverrides(rawOverrides: unknown): Record<string, string[]> {
  if (!rawOverrides || typeof rawOverrides !== 'object' || Array.isArray(rawOverrides)) return {};
  const normalized: Record<string, string[]> = {};
  for (const [rawKey, rawValue] of Object.entries(rawOverrides as Record<string, unknown>)) {
    const key = normalizeThumbnailOverrideKey(rawKey);
    if (!key) continue;
    const values = normalizeThumbnailOverrideValues(rawValue);
    if (values.length === 0) continue;
    normalized[key] = values;
    if (Object.keys(normalized).length >= MAX_THUMBNAIL_OVERRIDE_ENTRIES) break;
  }
  return normalized;
}

export function normalizePowerPrompterPromptText(rawPrompt: string): string {
  return String(rawPrompt || '')
    .split(',')
    .map((segment) => segment.replace(/\s+/g, ' ').trim())
    .filter((segment) => segment.length > 0)
    .join(', ');
}

export const DEFAULT_POWER_PROMPTER_SETTINGS: PowerPrompterSettings = {
  colors: {
    general: '#0073ff',
    artist: '#c00000',
    copyright: '#a000a0',
    character: '#00aa00',
    metadata: '#ff8a00',
  },
  fuzzySensitivity: 0.6,
  enabledCSVs: [],
  editorMode: 'cards',
  queueTraversalMode: 'cycle',
  queueDiversity: 0,
  queuePromptLimit: null,
  queueShuffleEnabled: false,
  queueShuffleSeed: 0,
  generationCompleteSoundEnabled: true,
  generationCompleteSoundStyle: 'glass_tick',
  generationCompleteSoundVolume: 0.42,
  activePromptTypingSoundEnabled: false,
  activePromptTypingSoundStyle: 'warm_click',
  activePromptTypingSoundVolume: 0.18,
  autocomplete: {
    mode: 'tags',
    enabledSourceIds: [],
    primarySourceId: null,
    matchMode: 'wordBoundary',
    minQueryLength: 2,
    replaceUnderscores: true,
    appendComma: true,
  },
};

export const POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME = 1.4;

function normalizeQueueShuffleSeed(rawSeed: unknown): number {
  const numeric = Math.floor(Number(rawSeed));
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(Number.MAX_SAFE_INTEGER, numeric);
}

export function getPowerPrompterCardDocPath(filePath: string): string {
  return `${String(filePath || '').trim()}.ppcards.json`;
}

function getNowIso(): string {
  return new Date().toISOString();
}

function createCardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pp-card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function createSlotId(type: PowerPrompterCardType, label?: string): string {
  const base = `${type}-${String(label || type).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || type}`;
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pp-slot-${base}-${crypto.randomUUID()}`;
  }
  return `pp-slot-${base}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function normalizeCardType(rawType: unknown): PowerPrompterCardType {
  const type = String(rawType || '').trim().toLowerCase();
  if (
    type === 'character' ||
    type === 'location' ||
    type === 'expression' ||
    type === 'action' ||
    type === 'style' ||
    type === 'custom'
  ) {
    return type;
  }
  return 'custom';
}

function normalizeQueueSetIds(rawSets: unknown, fallbackEnabled = true): number[] {
  if (!Array.isArray(rawSets)) return fallbackEnabled ? [1] : [];
  const normalized = Array.from(new Set(
    rawSets
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= POWER_PROMPTER_MAX_QUEUE_SETS)
  )).sort((a, b) => a - b);
  if (normalized.length === 0 && fallbackEnabled) return [1];
  return normalized;
}

function normalizeCardQueueSetIds(rawSets: unknown, queueEnabled: unknown, fallbackSetId = 1): number[] {
  const normalized = normalizeQueueSetIds(rawSets, false);
  if (Array.isArray(rawSets) || normalized.length > 0 || queueEnabled === false) return normalized;
  const fallback = Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number(fallbackSetId) || 1)));
  return [fallback];
}

function normalizeRandomSetIds(rawSets: unknown): number[] {
  return normalizeQueueSetIds(rawSets, false);
}

function normalizeQueueCycleWeights(rawWeights: unknown, allowedSetIds: number[]): Record<string, number> {
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) return {};
  const allowed = new Set(
    allowedSetIds
      .map((setId) => Math.floor(Number(setId) || 0))
      .filter((setId) => setId >= 1 && setId <= POWER_PROMPTER_MAX_QUEUE_SETS)
  );
  if (allowed.size <= 0) return {};
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(rawWeights as Record<string, unknown>)) {
    const setId = Math.floor(Number(rawKey));
    if (!Number.isFinite(setId) || !allowed.has(setId)) continue;
    const weight = Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, Math.floor(Number(rawValue) || 1)));
    if (weight <= 1) continue;
    normalized[String(setId)] = weight;
  }
  return normalized;
}

export function getQueueCycleWeightForSet(rawWeights: unknown, setIdRaw: unknown): number {
  const setId = Math.floor(Number(setIdRaw));
  if (!Number.isFinite(setId) || setId < 1 || setId > POWER_PROMPTER_MAX_QUEUE_SETS) return 1;
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) return 1;
  const rawValue = (rawWeights as Record<string, unknown>)[String(setId)];
  const weight = Math.floor(Number(rawValue) || 1);
  return Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, weight));
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(numeric)));
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeSeedControlMode(rawMode: unknown): PowerPrompterSeedControlMode {
  const mode = String(rawMode || '').trim().toLowerCase() as PowerPrompterSeedControlMode;
  return POWER_PROMPTER_SEED_CONTROL_OPTIONS.includes(mode) ? mode : 'fixed';
}

function normalizeAspectRatio(rawAspectRatio: unknown): string {
  const candidate = String(rawAspectRatio || '').trim();
  if (!candidate) return DEFAULT_POWER_PROMPTER_ASPECT_RATIO;
  if (candidate === 'custom') return candidate;
  return POWER_PROMPTER_ASPECT_RATIO_OPTIONS.includes(candidate as typeof POWER_PROMPTER_ASPECT_RATIO_OPTIONS[number])
    ? candidate
    : DEFAULT_POWER_PROMPTER_ASPECT_RATIO;
}

function normalizeSamplerName(rawSamplerName: unknown): string {
  const candidate = String(rawSamplerName || '').trim();
  if (!candidate) return DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.samplerName;
  return POWER_PROMPTER_SAMPLER_OPTIONS.includes(candidate as typeof POWER_PROMPTER_SAMPLER_OPTIONS[number])
    ? candidate
    : DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.samplerName;
}

function normalizeScheduler(rawScheduler: unknown): string {
  const candidate = String(rawScheduler || '').trim();
  if (!candidate) return DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.scheduler;
  return POWER_PROMPTER_SCHEDULER_OPTIONS.includes(candidate as typeof POWER_PROMPTER_SCHEDULER_OPTIONS[number])
    ? candidate
    : DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.scheduler;
}

function normalizeGenerationModelType(rawModelType: unknown): PowerPrompterModelType {
  const candidate = String(rawModelType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (candidate === 'checkpoints' || candidate === 'ckpt' || candidate === 'checkpoint_loader') return 'checkpoint';
  if (candidate === 'diffuser' || candidate === 'diffusers_model') return 'diffusers';
  if (candidate === 'diffusion_models') return 'diffusion_model';
  if (candidate === 'unets' || candidate === 'unet_model') return 'unet';
  return POWER_PROMPTER_MODEL_TYPES.includes(candidate as PowerPrompterModelType)
    ? candidate as PowerPrompterModelType
    : 'checkpoint';
}

function normalizeWorkflowResources(rawResources: unknown): Record<string, string> {
  if (!rawResources || typeof rawResources !== 'object' || Array.isArray(rawResources)) return {};
  const normalized: Record<string, string> = {};
  for (const [rawId, rawValue] of Object.entries(rawResources as Record<string, unknown>)) {
    const id = String(rawId || '').trim().slice(0, 240);
    const value = String(rawValue || '').trim().replace(/\\/g, '/').slice(0, 4096);
    if (!id || !value) continue;
    normalized[id] = value;
    if (Object.keys(normalized).length >= 128) break;
  }
  return normalized;
}

function normalizeHiresDimension(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.max(64, Math.min(16384, Math.round(numeric / 8) * 8));
}

function normalizePowerPrompterHiresFixControls(rawValue: unknown): PowerPrompterHiresFixControls {
  const defaults = DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.hiresFix!;
  const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  return {
    enabled: value.enabled === true,
    upscaler: String(value.upscaler || defaults.upscaler).trim() || defaults.upscaler,
    resizeMode: String(value.resizeMode || '').trim().toLowerCase() === 'dimensions' ? 'dimensions' : 'scale',
    scaleBy: clampNumber(value.scaleBy, defaults.scaleBy, 1, 8),
    targetWidth: normalizeHiresDimension(value.targetWidth),
    targetHeight: normalizeHiresDimension(value.targetHeight),
    steps: clampInteger(value.steps, defaults.steps, 0, 10000),
    denoise: clampNumber(value.denoise, defaults.denoise, 0, 1),
    cfg: clampNumber(value.cfg, defaults.cfg, 0, 100),
    samplerName: String(value.samplerName || defaults.samplerName).trim() || defaults.samplerName,
    scheduler: String(value.scheduler || defaults.scheduler).trim() || defaults.scheduler,
  };
}

function normalizeDetailerBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'on', 'enabled'].includes(normalized)) return true;
    if (['false', 'off', 'disabled'].includes(normalized)) return false;
  }
  return value === true;
}

function normalizeDetailerDimension(value: unknown, fallback: number): number {
  return Math.max(64, Math.round(clampInteger(value, fallback, 64, 16384) / 8) * 8);
}

function normalizePowerPrompterDetailerPipeline(
  rawPipeline: unknown,
  rawLegacyStages: unknown,
): PowerPrompterDetailerStage[] {
  const defaults = DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.detailerPipeline!;
  const legacyStages = rawLegacyStages && typeof rawLegacyStages === 'object' && !Array.isArray(rawLegacyStages)
    ? rawLegacyStages as Record<string, unknown>
    : null;
  const source = Array.isArray(rawPipeline)
    ? rawPipeline
    : defaults.map((stage) => ({
      ...stage,
      enabled: legacyStages
        ? normalizeDetailerBoolean(legacyStages[stage.label === 'Eyes' ? 'eyes' : stage.label.toLowerCase()], stage.enabled)
        : stage.enabled,
    }));
  const usedIds = new Set<string>();
  const samHints = new Set(['center-1', 'horizontal-2', 'vertical-2', 'rect-4', 'diamond-4', 'mask-area', 'mask-points', 'mask-point-bbox', 'none']);

  return source.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const stage = entry as Record<string, unknown>;
    const detectorModel = String(stage.detectorModel || '').trim().replace(/\\/g, '/');
    const preset = defaults.find((candidate) => (
      candidate.detectorModel.toLowerCase() === detectorModel.toLowerCase()
      || candidate.label.toLowerCase() === String(stage.label || '').trim().toLowerCase()
    )) || defaults[1] || defaults[0];
    let id = String(stage.id || `detail-stage-${index + 1}`).trim().slice(0, 128) || `detail-stage-${index + 1}`;
    if (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    const samDeviceRaw = String(stage.samDeviceMode || preset.samDeviceMode).trim();
    const samDeviceMode: PowerPrompterDetailerStage['samDeviceMode'] = samDeviceRaw === 'CPU'
      ? 'CPU'
      : samDeviceRaw === 'Prefer GPU' ? 'Prefer GPU' : 'AUTO';
    const samNegativeRaw = String(stage.samMaskHintUseNegative || preset.samMaskHintUseNegative).trim();
    const samMaskHintUseNegative: PowerPrompterDetailerStage['samMaskHintUseNegative'] = samNegativeRaw === 'Small'
      ? 'Small'
      : samNegativeRaw === 'Outter' ? 'Outter' : 'False';
    const samDetectionHint = String(stage.samDetectionHint || preset.samDetectionHint).trim();
    return [{
      id,
      enabled: normalizeDetailerBoolean(stage.enabled, preset.enabled),
      label: String(stage.label || preset.label).trim().slice(0, 80) || preset.label,
      detectorModel: detectorModel || preset.detectorModel,
      guideSize: normalizeDetailerDimension(stage.guideSize, preset.guideSize),
      guideSizeFor: String(stage.guideSizeFor || '').trim().toLowerCase() === 'crop_region' ? 'crop_region' : 'bbox',
      maxSize: normalizeDetailerDimension(stage.maxSize, preset.maxSize),
      seedOffset: clampInteger(stage.seedOffset, index + 1, 0, 1000000),
      steps: clampInteger(stage.steps, preset.steps, 1, 10000),
      cfg: clampNumber(stage.cfg, preset.cfg, 0, 100),
      samplerName: String(stage.samplerName || preset.samplerName).trim() || preset.samplerName,
      scheduler: String(stage.scheduler || preset.scheduler).trim() || preset.scheduler,
      denoise: clampNumber(stage.denoise, preset.denoise, 0.0001, 1),
      feather: clampInteger(stage.feather, preset.feather, 0, 100),
      noiseMask: normalizeDetailerBoolean(stage.noiseMask, preset.noiseMask),
      forceInpaint: normalizeDetailerBoolean(stage.forceInpaint, preset.forceInpaint),
      bboxThreshold: clampNumber(stage.bboxThreshold, preset.bboxThreshold, 0, 1),
      bboxDilation: clampInteger(stage.bboxDilation, preset.bboxDilation, -512, 512),
      bboxCropFactor: clampNumber(stage.bboxCropFactor, preset.bboxCropFactor, 1, 10),
      useSam: normalizeDetailerBoolean(stage.useSam, preset.useSam),
      samModel: String(stage.samModel || preset.samModel).trim().replace(/\\/g, '/'),
      samDeviceMode,
      samDetectionHint: samHints.has(samDetectionHint) ? samDetectionHint : preset.samDetectionHint,
      samDilation: clampInteger(stage.samDilation, preset.samDilation, -512, 512),
      samThreshold: clampNumber(stage.samThreshold, preset.samThreshold, 0, 1),
      samBboxExpansion: clampInteger(stage.samBboxExpansion, preset.samBboxExpansion, 0, 1000),
      samMaskHintThreshold: clampNumber(stage.samMaskHintThreshold, preset.samMaskHintThreshold, 0, 1),
      samMaskHintUseNegative,
      dropSize: clampInteger(stage.dropSize, preset.dropSize, 1, 16384),
      wildcard: String(stage.wildcard || '').replace(/\r\n/g, '\n'),
      cycle: clampInteger(stage.cycle, preset.cycle, 1, 10),
      noiseMaskFeather: clampInteger(stage.noiseMaskFeather, preset.noiseMaskFeather, 0, 100),
      tiledEncode: normalizeDetailerBoolean(stage.tiledEncode, preset.tiledEncode),
      tiledDecode: normalizeDetailerBoolean(stage.tiledDecode, preset.tiledDecode),
    }];
  });
}

function normalizePowerPrompterOutputUpscaleControls(rawValue: unknown): PowerPrompterOutputUpscaleControls {
  const defaults = DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.outputUpscale!;
  const value = rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)
    ? rawValue as Record<string, unknown>
    : {};
  return {
    enabled: value.enabled === true,
    modelName: String(value.modelName || defaults.modelName).trim().replace(/\\/g, '/') || defaults.modelName,
    maxDimension: clampInteger(value.maxDimension, defaults.maxDimension, 512, 16384),
  };
}

export function normalizePowerPrompterGenerationControls(rawControls: unknown): PowerPrompterGenerationControls {
  const controls = (rawControls && typeof rawControls === 'object')
    ? rawControls as Partial<PowerPrompterGenerationControls> & { loras?: unknown }
    : {};
  const swapRaw = controls.swapDimensions as unknown;
  const swapDimensions = swapRaw === true || String(swapRaw || '').trim().toLowerCase() === 'on';
  return {
    hiresFix: normalizePowerPrompterHiresFixControls((controls as any).hiresFix),
    detailerPipeline: normalizePowerPrompterDetailerPipeline(
      (controls as any).detailerPipeline,
      (controls as any).umbraUiDetailStages,
    ),
    outputUpscale: normalizePowerPrompterOutputUpscaleControls((controls as any).outputUpscale),
    negativePrompt: String(controls.negativePrompt || '').replace(/\r\n/g, '\n'),
    seed: clampInteger(controls.seed, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.seed, 0, MAX_JS_SAFE_SEED),
    controlAfterGenerate: normalizeSeedControlMode(controls.controlAfterGenerate),
    steps: clampInteger(controls.steps, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.steps, 1, 10000),
    cfg: clampNumber(controls.cfg, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.cfg, 0, 100),
    clipSkip: clampInteger((controls as any).clipSkip ?? (controls as any).clip_skip, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.clipSkip, 1, 12),
    samplerName: normalizeSamplerName(controls.samplerName),
    scheduler: normalizeScheduler(controls.scheduler),
    modelType: normalizeGenerationModelType((controls as any).modelType ?? (controls as any).model_type),
    checkpointName: String(controls.checkpointName || '').trim().replace(/\\/g, '/'),
    workflowResources: normalizeWorkflowResources((controls as any).workflowResources),
    aspectRatio: normalizeAspectRatio(controls.aspectRatio),
    swapDimensions,
    width: clampInteger(controls.width, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.width, 64, 8192),
    height: clampInteger(controls.height, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.height, 64, 8192),
    batchSize: clampInteger(controls.batchSize, DEFAULT_POWER_PROMPTER_GENERATION_CONTROLS.batchSize, 1, 64),
    loras: normalizeLoraEntries(controls.loras),
    thumbnailOverrides: normalizeThumbnailOverrides((controls as any).thumbnailOverrides),
  };
}

export function sortPowerPrompterCards(cards: PowerPrompterCardNode[]): PowerPrompterCardNode[] {
  return [...cards].sort((a, b) => {
    const orderDelta = Number(a.order) - Number(b.order);
    if (orderDelta !== 0) return orderDelta;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function createPowerPrompterCardNode(
  type: PowerPrompterCardType,
  label?: string,
  text = '',
  order = 0,
  slotId?: string
): PowerPrompterCardNode {
  const now = getNowIso();
  const resolvedLabel = String(label || '').trim() || (type === 'custom' ? 'Custom' : type[0].toUpperCase() + type.slice(1));
  const queueSetIds = [1];
  return {
    id: createCardId(),
    slotId: String(slotId || '').trim() || createSlotId(type, resolvedLabel),
    type,
    label: resolvedLabel,
    variantName: '',
    variantTags: [],
    skipVariant: false,
    text: String(text || ''),
    randomEnabled: false,
    randomSetIds: [],
    queueEnabled: true,
    queueSetIds,
    queueTraversalRole: 'cycle',
    queueCycleWeights: {},
    chainLinks: [],
    blockLinks: [],
    order,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultPowerPrompterCardDocument(filePath: string | null): PowerPrompterCardDocument {
  const now = getNowIso();
  const cards = PP_BASE_CARD_CONFIG.map((card, idx) =>
    createPowerPrompterCardNode(card.type, card.label, '', idx)
  );

  return {
    version: POWER_PROMPTER_CARD_DOC_VERSION,
    file: filePath,
    createdAt: now,
    updatedAt: now,
    modelType: '',
    modelColor: '#38bdf8',
    pipeline: normalizeUmbraUiPipelineSelection(null),
    activeQueueSet: 1,
    styleSeedMode: 'same',
    generation: normalizePowerPrompterGenerationControls(null),
    cards,
    deletedCardGroups: {},
  };
}

export function composePromptFromCards(
  cards: PowerPrompterCardNode[],
  options?: { includeQueueDisabled?: boolean }
): string {
  const includeQueueDisabled = options?.includeQueueDisabled !== false;
  return normalizePowerPrompterPromptText(
    sortPowerPrompterCards(cards)
    .filter((card) => includeQueueDisabled || card.queueEnabled !== false)
    .map((card) => String(card.text || '').trim())
    .filter((text) => text.length > 0)
    .join(', ')
  );
}

function splitLegacyPromptSegments(text: string): string[] {
  return String(text || '')
    .split(/\r?\n|,/g)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

export function importLegacyPromptToCardDocument(
  text: string,
  filePath: string | null,
  existingDoc?: PowerPrompterCardDocument | null
): PowerPrompterCardDocument {
  const base = existingDoc ? normalizePowerPrompterCardDocument(existingDoc, filePath) : createDefaultPowerPrompterCardDocument(filePath);
  const fallbackSetId = Number.isFinite(Number(base.activeQueueSet))
    ? Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number(base.activeQueueSet))))
    : 1;
  const segments = splitLegacyPromptSegments(text);
  const cards: PowerPrompterCardNode[] = sortPowerPrompterCards(base.cards).map((card, idx) => {
    const nextText = segments[idx] || '';
    const queueSetIds = normalizeCardQueueSetIds(card.queueSetIds, card.queueEnabled, fallbackSetId);
    return {
      ...card,
      slotId: String(card.slotId || '').trim() || createSlotId(card.type, card.label),
      text: nextText,
      randomEnabled: card.randomEnabled === true,
      randomSetIds: normalizeRandomSetIds(card.randomSetIds),
      queueEnabled: queueSetIds.length > 0,
      queueSetIds,
      queueTraversalRole: normalizeQueueTraversalRole((card as any).queueTraversalRole),
      queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, queueSetIds),
      chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
      blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
      variantName: normalizeVariantName(card.variantName),
      variantTags: normalizeVariantTags((card as any).variantTags),
      skipVariant: (card as any).skipVariant === true,
      updatedAt: nextText !== card.text ? getNowIso() : card.updatedAt,
      order: idx,
    };
  });

  if (segments.length > cards.length) {
    let nextOrder = cards.length;
    for (let idx = cards.length; idx < segments.length; idx += 1) {
      cards.push(createPowerPrompterCardNode('custom', `Custom ${idx - cards.length + 1}`, segments[idx], nextOrder));
      nextOrder += 1;
    }
  }

  return {
    ...base,
    file: filePath,
    updatedAt: getNowIso(),
    modelType: normalizeModelType(base.modelType),
    modelColor: normalizeModelColor(base.modelColor),
    pipeline: normalizeUmbraUiPipelineSelection(base.pipeline, {
      feature: 'txt2img',
      modelFamily: base.modelType,
      modelSource: base.generation.modelType,
    }),
    activeQueueSet: Number.isFinite(Number(base.activeQueueSet))
      ? Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number(base.activeQueueSet))))
      : 1,
    styleSeedMode: normalizeStyleSeedMode((base as any).styleSeedMode),
    generation: normalizePowerPrompterGenerationControls(base.generation),
    cards,
    deletedCardGroups: base.deletedCardGroups || {},
  };
}

function normalizeDeletedCardGroups(rawGroups: unknown, now: string): Record<string, PowerPrompterDeletedCardGroup> {
  if (!rawGroups || typeof rawGroups !== 'object') return {};
  const groups = rawGroups as Record<string, unknown>;
  const normalized: Record<string, PowerPrompterDeletedCardGroup> = {};
  for (const [rawKey, rawEntry] of Object.entries(groups)) {
    const key = String(rawKey || '').trim();
    if (!key) continue;
    if (!rawEntry || typeof rawEntry !== 'object') continue;
    const entry = rawEntry as Partial<PowerPrompterDeletedCardGroup>;
    const type = normalizeCardType(entry.type);
    const label = String(entry.label || '').trim() || (type === 'custom' ? 'Custom' : type[0].toUpperCase() + type.slice(1));
    const cardsRaw = Array.isArray(entry.cards) ? entry.cards : [];
    const cards: PowerPrompterCardNode[] = cardsRaw.map((rawCard, idx) => {
      const card = (rawCard || {}) as Partial<PowerPrompterCardNode>;
      const cardType = normalizeCardType(card.type || type);
      const queueSetIds = normalizeCardQueueSetIds(card.queueSetIds, card.queueEnabled, 1);
      return {
        id: String(card.id || createCardId()),
        slotId: String(card.slotId || '').trim(),
        type: cardType,
        label: String(card.label || '').trim() || label,
        variantName: normalizeVariantName(card.variantName),
        variantTags: normalizeVariantTags((card as any).variantTags),
        skipVariant: (card as any).skipVariant === true,
        text: String(card.text || ''),
        randomEnabled: card.randomEnabled === true,
        randomSetIds: normalizeRandomSetIds(card.randomSetIds),
        queueEnabled: queueSetIds.length > 0,
        queueSetIds,
        queueTraversalRole: normalizeQueueTraversalRole((card as any).queueTraversalRole),
        queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, queueSetIds),
        chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
        blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
        order: Number.isFinite(Number(card.order)) ? Math.max(0, Math.floor(Number(card.order))) : idx,
        createdAt: String(card.createdAt || now),
        updatedAt: String(card.updatedAt || now),
      };
    });
    normalized[key] = {
      key,
      type,
      label,
      deletedAt: String(entry.deletedAt || now),
      cards: sortPowerPrompterCards(cards).map((card, idx) => ({ ...card, order: idx })),
    };
  }
  return normalized;
}

export function normalizePowerPrompterCardDocument(
  rawDoc: unknown,
  filePath: string | null
): PowerPrompterCardDocument {
  const now = getNowIso();
  const base = createDefaultPowerPrompterCardDocument(filePath);

  if (!rawDoc || typeof rawDoc !== 'object') {
    return base;
  }

  const doc = rawDoc as Partial<PowerPrompterCardDocument>;
  const activeQueueSet = Number.isFinite(Number(doc.activeQueueSet))
    ? Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number(doc.activeQueueSet))))
    : 1;
  const rawCards = Array.isArray(doc.cards) ? doc.cards : [];
  const normalizedCards: PowerPrompterCardNode[] = rawCards.map((rawCard, idx) => {
    const card = (rawCard || {}) as Partial<PowerPrompterCardNode>;
    const type = normalizeCardType(card.type);
    const queueSetIds = normalizeCardQueueSetIds(card.queueSetIds, card.queueEnabled, activeQueueSet);
    return {
      id: String(card.id || createCardId()),
      slotId: String(card.slotId || '').trim() || createSlotId(type, card.label),
      type,
      label: String(card.label || '').trim() || (type === 'custom' ? 'Custom' : type[0].toUpperCase() + type.slice(1)),
      variantName: normalizeVariantName(card.variantName),
      variantTags: normalizeVariantTags((card as any).variantTags),
      skipVariant: (card as any).skipVariant === true,
      text: String(card.text || ''),
      randomEnabled: card.randomEnabled === true,
      randomSetIds: normalizeRandomSetIds(card.randomSetIds),
      queueEnabled: queueSetIds.length > 0,
      queueSetIds,
      queueTraversalRole: normalizeQueueTraversalRole((card as any).queueTraversalRole),
      queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, queueSetIds),
      chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
      blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
      order: Number.isFinite(Number(card.order)) ? Math.max(0, Math.floor(Number(card.order))) : idx,
      createdAt: String(card.createdAt || now),
      updatedAt: String(card.updatedAt || now),
    };
  });

  const dedupedCards = (() => {
    const seen = new Set<string>();
    return normalizedCards.map((card) => {
      let id = String(card.id || '').trim() || createCardId();
      while (seen.has(id)) {
        id = createCardId();
      }
      seen.add(id);
      return id === card.id ? card : { ...card, id };
    });
  })();

  const cards = dedupedCards.length > 0 ? sortPowerPrompterCards(dedupedCards).map((card, idx) => ({ ...card, order: idx })) : base.cards;
  const generation = normalizePowerPrompterGenerationControls(doc.generation);
  const legacyModelFamily = normalizeModelType((doc as any).modelType);
  const pipeline = normalizeUmbraUiPipelineSelection((doc as any).pipeline, {
    feature: 'txt2img',
    modelFamily: legacyModelFamily,
    modelSource: generation.modelType,
  });

  return {
    version: POWER_PROMPTER_CARD_DOC_VERSION,
    file: filePath,
    createdAt: String(doc.createdAt || now),
    updatedAt: String(doc.updatedAt || now),
    modelType: pipeline.modelFamily,
    modelColor: normalizeModelColor((doc as any).modelColor),
    pipeline,
    activeQueueSet,
    styleSeedMode: normalizeStyleSeedMode((doc as any).styleSeedMode),
    generation,
    cards,
    deletedCardGroups: normalizeDeletedCardGroups((doc as any).deletedCardGroups, now),
  };
}

export function getAllowedPowerPrompterSourceTypes(mode: PowerPrompterAutocompleteMode) {
  if (mode === 'mixed') return new Set<PowerPrompterCsvSource['type']>(['tag', 'character']);
  return new Set<PowerPrompterCsvSource['type']>([mode === 'tags' ? 'tag' : 'character']);
}

export function getEffectivePowerPrompterAutocompleteSettings(
  settings: PowerPrompterSettings,
  sources: PowerPrompterCsvSource[]
): PowerPrompterAutocompleteSettings {
  const normalized = normalizePowerPrompterSettings(settings, sources);
  const allowedTypes = getAllowedPowerPrompterSourceTypes(normalized.autocomplete.mode);
  const compatibleSources = sources.filter((source) => allowedTypes.has(source.type));
  const compatibleEnabled = normalized.autocomplete.enabledSourceIds.filter((sourceId) => {
    const source = sources.find((entry) => entry.id === sourceId);
    return !!source && allowedTypes.has(source.type);
  });
  const defaultSource = getDefaultPowerPrompterSource(sources, normalized.autocomplete.mode);
  const primarySource = normalized.autocomplete.primarySourceId
    ? sources.find((source) => source.id === normalized.autocomplete.primarySourceId)
    : null;
  const fallbackSourceId = primarySource && allowedTypes.has(primarySource.type)
    ? primarySource.id
    : defaultSource?.id ?? compatibleSources[0]?.id ?? null;

  return {
    ...normalized.autocomplete,
    enabledSourceIds: compatibleEnabled.length > 0
      ? compatibleEnabled
      : (fallbackSourceId ? [fallbackSourceId] : []),
    primarySourceId: fallbackSourceId,
  };
}

export function getDefaultPowerPrompterSource(
  sources: PowerPrompterCsvSource[],
  mode: PowerPrompterAutocompleteMode = 'tags'
): PowerPrompterCsvSource | null {
  const allowedTypes = getAllowedPowerPrompterSourceTypes(mode);
  const candidates = sources.filter((source) => allowedTypes.has(source.type));
  if (candidates.length === 0) return null;

  const danbooru = candidates.find((source) =>
    source.type === 'tag' && /danbooru/i.test(source.name)
  );
  if (danbooru) return danbooru;

  return candidates[0];
}

export function resolvePowerPrompterSourceIds(
  sourceIds: string[] | undefined,
  sources: PowerPrompterCsvSource[]
): string[] {
  if (!Array.isArray(sourceIds)) return [];

  const byId = new Map(sources.map((source) => [source.id, source.id]));
  const byName = new Map(sources.map((source) => [source.name, source.id]));
  const resolved = new Set<string>();

  for (const rawId of sourceIds) {
    const sourceId = String(rawId || '').trim();
    if (!sourceId) continue;
    if (byId.has(sourceId)) {
      resolved.add(sourceId);
      continue;
    }
    const fallback = byName.get(sourceId);
    if (fallback) {
      resolved.add(fallback);
    }
  }

  return Array.from(resolved);
}

function normalizeRawSourceIdList(sourceIds: unknown): string[] {
  if (!Array.isArray(sourceIds)) return [];
  const resolved = new Set<string>();
  for (const raw of sourceIds) {
    const value = String(raw || '').trim();
    if (value) resolved.add(value);
  }
  return Array.from(resolved);
}

function normalizeCompletionSoundStyle(rawStyle: unknown): PowerPrompterCompletionSoundStyle {
  const style = String(rawStyle || '').trim().toLowerCase() as PowerPrompterCompletionSoundStyle;
  return POWER_PROMPTER_COMPLETION_SOUND_STYLE_OPTIONS.includes(style) ? style : 'glass_tick';
}

function normalizeCompletionSoundVolume(rawVolume: unknown): number {
  const numeric = Number(rawVolume);
  if (!Number.isFinite(numeric)) return DEFAULT_POWER_PROMPTER_SETTINGS.generationCompleteSoundVolume;
  return Math.max(0, Math.min(POWER_PROMPTER_MAX_COMPLETION_SOUND_VOLUME, numeric));
}

function normalizeQueueTraversalMode(rawMode: unknown): PowerPrompterQueueTraversalMode {
  const mode = String(rawMode || '').trim().toLowerCase() as PowerPrompterQueueTraversalMode;
  return POWER_PROMPTER_QUEUE_TRAVERSAL_MODES.includes(mode)
    ? mode
    : DEFAULT_POWER_PROMPTER_SETTINGS.queueTraversalMode;
}

function normalizeQueueDiversity(rawValue: unknown, fallbackMode?: unknown): number {
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric)) {
    const clamped = Math.max(
      POWER_PROMPTER_QUEUE_DIVERSITY_MIN,
      Math.min(POWER_PROMPTER_QUEUE_DIVERSITY_MAX, numeric)
    );
    return Math.round(clamped * POWER_PROMPTER_QUEUE_DIVERSITY_DECIMAL_SCALE) / POWER_PROMPTER_QUEUE_DIVERSITY_DECIMAL_SCALE;
  }
  const traversalMode = normalizeQueueTraversalMode(fallbackMode);
  return traversalMode === 'exhaustive'
    ? POWER_PROMPTER_QUEUE_DIVERSITY_MAX
    : DEFAULT_POWER_PROMPTER_SETTINGS.queueDiversity;
}

function normalizeQueuePromptLimit(rawValue: unknown): number | null {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
    return null;
  }
  const numeric = Math.floor(Number(rawValue));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.min(Number.MAX_SAFE_INTEGER, numeric);
}

export function normalizePowerPrompterSettings(
  rawSettings: unknown,
  sources: PowerPrompterCsvSource[] = []
): PowerPrompterSettings {
  const settings = (rawSettings && typeof rawSettings === 'object')
    ? rawSettings as Partial<PowerPrompterSettings> & { enabledCSVs?: string[]; autocomplete?: Partial<PowerPrompterSettings['autocomplete']> }
    : {};
  const autocomplete = (settings.autocomplete || {}) as Partial<PowerPrompterSettings['autocomplete']>;
  const rawEditorMode = String(settings.editorMode || '').trim().toLowerCase();
  const editorMode: PowerPrompterEditorMode = rawEditorMode === 'classic' ? 'classic' : 'cards';
  const mode = autocomplete.mode === 'characters' || autocomplete.mode === 'mixed' || autocomplete.mode === 'tags'
    ? autocomplete.mode
    : DEFAULT_POWER_PROMPTER_SETTINGS.autocomplete.mode;
  const allowedTypes = getAllowedPowerPrompterSourceTypes(mode);
  const defaultSource = getDefaultPowerPrompterSource(sources, mode);
  const enabledSourceIds = resolvePowerPrompterSourceIds(
    autocomplete.enabledSourceIds ?? settings.enabledCSVs ?? [],
    sources
  );
  const primarySourceId = resolvePowerPrompterSourceIds(
    autocomplete.primarySourceId ? [autocomplete.primarySourceId] : [],
    sources
  ).find((sourceId) => {
    const source = sources.find((entry) => entry.id === sourceId);
    return !!source && allowedTypes.has(source.type);
  }) ?? defaultSource?.id ?? null;

  return {
    colors: {
      ...DEFAULT_POWER_PROMPTER_SETTINGS.colors,
      ...(settings.colors || {}),
    },
    fuzzySensitivity: Number.isFinite(Number(settings.fuzzySensitivity))
      ? Math.max(0.1, Math.min(1, Number(settings.fuzzySensitivity)))
      : DEFAULT_POWER_PROMPTER_SETTINGS.fuzzySensitivity,
    enabledCSVs: normalizeRawSourceIdList(settings.enabledCSVs),
    editorMode,
    queueTraversalMode: normalizeQueueTraversalMode(settings.queueTraversalMode),
    queueDiversity: normalizeQueueDiversity((settings as any).queueDiversity, settings.queueTraversalMode),
    queuePromptLimit: normalizeQueuePromptLimit((settings as any).queuePromptLimit),
    queueShuffleEnabled: settings.queueShuffleEnabled === true,
    queueShuffleSeed: normalizeQueueShuffleSeed((settings as any).queueShuffleSeed),
    generationCompleteSoundEnabled: settings.generationCompleteSoundEnabled !== false,
    generationCompleteSoundStyle: normalizeCompletionSoundStyle(settings.generationCompleteSoundStyle),
    generationCompleteSoundVolume: normalizeCompletionSoundVolume(settings.generationCompleteSoundVolume),
    activePromptTypingSoundEnabled: settings.activePromptTypingSoundEnabled === true,
    activePromptTypingSoundStyle: normalizeCompletionSoundStyle(settings.activePromptTypingSoundStyle || 'warm_click'),
    activePromptTypingSoundVolume: normalizeCompletionSoundVolume(
      settings.activePromptTypingSoundVolume ?? DEFAULT_POWER_PROMPTER_SETTINGS.activePromptTypingSoundVolume
    ),
    autocomplete: {
      mode,
      enabledSourceIds: enabledSourceIds.length > 0
        ? enabledSourceIds
        : (defaultSource ? [defaultSource.id] : []),
      primarySourceId,
      matchMode: autocomplete.matchMode === 'prefix' || autocomplete.matchMode === 'substring'
        ? autocomplete.matchMode
        : DEFAULT_POWER_PROMPTER_SETTINGS.autocomplete.matchMode,
      minQueryLength: Number.isFinite(Number(autocomplete.minQueryLength))
        ? Math.max(1, Math.min(5, Number(autocomplete.minQueryLength)))
        : DEFAULT_POWER_PROMPTER_SETTINGS.autocomplete.minQueryLength,
      replaceUnderscores: autocomplete.replaceUnderscores ?? DEFAULT_POWER_PROMPTER_SETTINGS.autocomplete.replaceUnderscores,
      appendComma: autocomplete.appendComma ?? DEFAULT_POWER_PROMPTER_SETTINGS.autocomplete.appendComma,
    },
  };
}
