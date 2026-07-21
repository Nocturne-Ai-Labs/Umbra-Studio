export const UMBRA_UI_AUTO_PIPELINE_ID = '__umbra_ui_auto__';
export const UMBRA_UI_PIPELINE_TARGET_PREFIX = 'pipeline:';

export type UmbraUiPipelineFeature =
  | 'txt2img'
  | 'img2img'
  | 'inpainting'
  | 'txt2vid'
  | 'img2vid'
  | 'vid2vid'
  | 'upscale';

export type UmbraUiPipelineModelSource =
  | 'checkpoint'
  | 'diffusers'
  | 'diffusion_model'
  | 'unet'
  | 'gguf';

export interface UmbraUiPipelineSelection {
  feature: UmbraUiPipelineFeature;
  modelFamily: string;
  modelFamilyKey: string;
  modelSource: UmbraUiPipelineModelSource;
}

export type UmbraUiInpaintAdapter =
  | 'classic_conditioning'
  | 'flux_fill'
  | 'qwen_image_controlnet'
  | 'native_edit';

export type UmbraUiInpaintControlAdapterType =
  | 'controlnet'
  | 't2i_adapter'
  | 'control_lora'
  | 'z_image_control'
  | 'anima_lllite';

export type UmbraUiInpaintControlMode =
  | 'balanced'
  | 'more_prompt'
  | 'more_control'
  | 'unbalanced';

export type UmbraUiInpaintReferenceMethod =
  | 'style_model'
  | 'ip_adapter'
  | 'flux_redux'
  | 'flux_kontext'
  | 'flux2_reference'
  | 'qwen_image_reference'
  | 'hidream_o1_reference';

export type UmbraUiIpAdapterWeightType =
  | 'linear'
  | 'ease in'
  | 'ease out'
  | 'ease in-out'
  | 'reverse in-out'
  | 'weak input'
  | 'weak output'
  | 'weak middle'
  | 'strong middle'
  | 'style transfer'
  | 'composition'
  | 'strong style transfer'
  | 'style and composition'
  | 'style transfer precise'
  | 'composition precise';

export type UmbraUiIpAdapterCombineEmbeds = 'concat' | 'add' | 'subtract' | 'average' | 'norm average';
export type UmbraUiIpAdapterEmbedsScaling = 'V only' | 'K+V' | 'K+V w/ C penalty' | 'K+mean(V) w/ C penalty';

export type UmbraUiPipelineResourceKind =
  | UmbraUiPipelineModelSource
  | 'vae'
  | 'text_encoder'
  | 'clip_vision'
  | 'controlnet'
  | 'upscale_model'
  | 'model';

export type UmbraUiPipelineCapabilitySupport = 'adjustable' | 'fixed' | 'unsupported';

export const UMBRA_UI_PIPELINE_CAPABILITY_KEYS = [
  'modelSources',
  'negativePrompt',
  'loras',
  'seed',
  'steps',
  'guidance',
  'clipSkip',
  'sampler',
  'scheduler',
  'denoise',
  'resolution',
  'hiresFix',
  'detailerStages',
  'finalModelUpscale',
] as const;

export type UmbraUiPipelineCapabilityKey = typeof UMBRA_UI_PIPELINE_CAPABILITY_KEYS[number];

export interface UmbraUiPipelineControlCapability {
  support: UmbraUiPipelineCapabilitySupport;
  reason: string;
  nodeClassTypes: string[];
  value?: string | number | boolean;
}

export interface UmbraUiPipelineModelSourcesCapability extends UmbraUiPipelineControlCapability {
  values: UmbraUiPipelineModelSource[];
}

export interface UmbraUiPipelineGuidanceCapability extends UmbraUiPipelineControlCapability {
  mode: 'cfg' | 'guidance' | 'none';
  label: 'CFG' | 'Guidance' | 'Guidance unavailable';
}

export interface UmbraUiPipelineResolutionCapability extends UmbraUiPipelineControlCapability {
  defaultWidth?: number;
  defaultHeight?: number;
  minimumWidth?: number;
  minimumHeight?: number;
  maximumWidth?: number;
  maximumHeight?: number;
  step?: number;
}

export interface UmbraUiPipelineHiresFixCapability extends UmbraUiPipelineControlCapability {
  resizeModes: Array<'scale' | 'dimensions'>;
  controls: {
    upscaler: boolean;
    steps: boolean;
    denoise: boolean;
    cfg: boolean;
    sampler: boolean;
    scheduler: boolean;
  };
}

export interface UmbraUiPipelineDetailerCapability extends UmbraUiPipelineControlCapability {
  stages: Array<'person' | 'face' | 'eyes' | 'hands'>;
  customStages: boolean;
}

export interface UmbraUiPipelineFinalUpscaleCapability extends UmbraUiPipelineControlCapability {
  modelSelection: boolean;
  maxDimension: boolean;
}

export interface UmbraUiInpaintLayerCapability extends UmbraUiPipelineControlCapability {
  maxLayers: number;
}

export interface UmbraUiInpaintRegionalGuidanceCapability extends UmbraUiInpaintLayerCapability {
  positivePrompt: boolean;
  negativePrompt: boolean;
  autoNegative: boolean;
}

export interface UmbraUiInpaintControlLayerCapability extends UmbraUiInpaintLayerCapability {
  adapterTypes: UmbraUiInpaintControlAdapterType[];
  modes: UmbraUiInpaintControlMode[];
}

export interface UmbraUiInpaintReferenceLayerCapability extends UmbraUiInpaintLayerCapability {
  methods: UmbraUiInpaintReferenceMethod[];
}

export interface UmbraUiInpaintSeamlessCapability extends UmbraUiPipelineControlCapability {
  axes: Array<'x' | 'y'>;
}

export interface UmbraUiInpaintCanvasCapabilities {
  version: 1;
  regionalGuidance: UmbraUiInpaintRegionalGuidanceCapability;
  controlLayers: UmbraUiInpaintControlLayerCapability;
  referenceLayers: UmbraUiInpaintReferenceLayerCapability;
  seamless: UmbraUiInpaintSeamlessCapability;
}

export interface UmbraUiPipelineCapabilities {
  version: 1;
  modelSources: UmbraUiPipelineModelSourcesCapability;
  negativePrompt: UmbraUiPipelineControlCapability;
  loras: UmbraUiPipelineControlCapability;
  seed: UmbraUiPipelineControlCapability;
  steps: UmbraUiPipelineControlCapability;
  guidance: UmbraUiPipelineGuidanceCapability;
  clipSkip: UmbraUiPipelineControlCapability;
  sampler: UmbraUiPipelineControlCapability;
  scheduler: UmbraUiPipelineControlCapability;
  denoise: UmbraUiPipelineControlCapability;
  resolution: UmbraUiPipelineResolutionCapability;
  hiresFix: UmbraUiPipelineHiresFixCapability;
  detailerStages: UmbraUiPipelineDetailerCapability;
  finalModelUpscale: UmbraUiPipelineFinalUpscaleCapability;
}

export interface UmbraUiPipelineCapabilitySupportSummary {
  status: 'full' | 'partial' | 'none';
  adjustable: UmbraUiPipelineCapabilityKey[];
  fixed: UmbraUiPipelineCapabilityKey[];
  unsupported: UmbraUiPipelineCapabilityKey[];
}

export interface UmbraUiPipelineResourceReadinessItem {
  id: string;
  label: string;
  kind: UmbraUiPipelineResourceKind;
  value: string;
  required: boolean;
  source: 'graph' | 'descriptor_default';
  status: 'available' | 'missing' | 'selection_required' | 'ambiguous' | 'unverified';
}

export interface UmbraUiPipelineReadiness {
  graph: {
    status: 'valid' | 'invalid' | 'unknown';
    issues: string[];
  };
  capabilitySupport: UmbraUiPipelineCapabilitySupportSummary;
  runtime: {
    comfyUi: 'online' | 'offline' | 'unknown';
    nodes: {
      status: 'ready' | 'missing' | 'unverified';
      missing: string[];
    };
    resources: {
      status: 'ready' | 'missing' | 'selection_required' | 'ambiguous' | 'unverified';
      missing: string[];
      requiredMissing: string[];
      selectionRequired: string[];
      ambiguous: string[];
      items: UmbraUiPipelineResourceReadinessItem[];
    };
  };
}

export interface UmbraUiPipelineDefaults {
  modelName?: string;
  modelNamesBySource?: Partial<Record<UmbraUiPipelineModelSource, string>>;
  adapterModelName?: string;
  steps?: number;
  cfg?: number;
  denoise?: number;
  samplerName?: string;
  scheduler?: string;
  width?: number;
  height?: number;
  clipSkip?: number;
}

export interface UmbraUiPipelineDescriptor {
  feature: UmbraUiPipelineFeature;
  modelFamily: string;
  modelFamilyKey: string;
  modelSources: UmbraUiPipelineModelSource[];
  priority: number;
  locked: true;
  inpaintAdapter?: UmbraUiInpaintAdapter;
  defaults?: UmbraUiPipelineDefaults;
  capabilities?: UmbraUiPipelineCapabilities;
  inpaintCanvas?: UmbraUiInpaintCanvasCapabilities;
  readiness?: UmbraUiPipelineReadiness;
}

export interface UmbraUiResolvedPipelineDescriptor extends UmbraUiPipelineDescriptor {
  capabilities: UmbraUiPipelineCapabilities;
  readiness: UmbraUiPipelineReadiness;
}

export function normalizeUmbraUiModelFamilyKey(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 80);
  const aliases: Record<string, string> = {
    chroma: 'chroma1',
    chroma1hd: 'chroma1',
    ernie: 'ernieimage',
    flux: 'flux1',
    flux1dev: 'flux1',
    flux1schnell: 'flux1',
    flux2dev: 'flux2',
    hidreamo1image: 'hidreamo1',
    ideogram: 'ideogram4',
    illustrious: 'illustriousxl',
    illustriousxl20: 'illustriousxl',
    krea2turbo: 'krea2',
    omnigen: 'omnigen2',
    ovis: 'ovisimage',
    ovis25: 'ovisimage',
    qwen: 'qwenimage',
    qwenimage2512: 'qwenimage',
    sd: 'stablediffusion',
    sd15: 'stablediffusion',
    sd2: 'stablediffusion',
    sdxl: 'stablediffusion',
    stablediffusionxl: 'stablediffusion',
    sd3: 'stablediffusion3',
    sd35: 'stablediffusion3',
    stablediffusion35: 'stablediffusion3',
    zimage: 'zimagebase',
  };
  return aliases[normalized] || normalized;
}

export function normalizeUmbraUiPipelineFeature(value: unknown): UmbraUiPipelineFeature | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const aliases: Record<string, UmbraUiPipelineFeature> = {
    text_to_image: 'txt2img',
    text2image: 'txt2img',
    image: 'txt2img',
    im2img: 'img2img',
    image_to_image: 'img2img',
    image2image: 'img2img',
    inpaint: 'inpainting',
    text_to_video: 'txt2vid',
    text2video: 'txt2vid',
    image_to_video: 'img2vid',
    image2video: 'img2vid',
    video_to_video: 'vid2vid',
    video2video: 'vid2vid',
    extras: 'upscale',
  };
  const candidate = aliases[normalized] || normalized;
  return ['txt2img', 'img2img', 'inpainting', 'txt2vid', 'img2vid', 'vid2vid', 'upscale'].includes(candidate)
    ? candidate as UmbraUiPipelineFeature
    : null;
}

export function normalizeUmbraUiPipelineModelSources(value: unknown): UmbraUiPipelineModelSource[] {
  const rawValues = Array.isArray(value) ? value : value == null ? [] : [value];
  const normalized = rawValues
    .map((entry) => String(entry || '').trim().toLowerCase().replace(/[\s-]+/g, '_'))
    .map((entry) => {
      if (entry === 'checkpoints' || entry === 'ckpt') return 'checkpoint';
      if (entry === 'diffuser') return 'diffusers';
      if (entry === 'diffusion_models') return 'diffusion_model';
      if (entry === 'unets') return 'unet';
      return entry;
    })
    .filter((entry): entry is UmbraUiPipelineModelSource => (
      ['checkpoint', 'diffusers', 'diffusion_model', 'unet', 'gguf'] as string[]
    ).includes(entry));
  return Array.from(new Set(normalized));
}

export function normalizeUmbraUiPipelineSelection(
  value: unknown,
  fallback: Partial<UmbraUiPipelineSelection> = {},
): UmbraUiPipelineSelection {
  const source = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const feature = normalizeUmbraUiPipelineFeature(source.feature ?? fallback.feature) || 'txt2img';
  const modelFamily = String(source.modelFamily ?? fallback.modelFamily ?? '').trim();
  const modelFamilyKey = normalizeUmbraUiModelFamilyKey(
    source.modelFamilyKey ?? modelFamily ?? fallback.modelFamilyKey,
  );
  const modelSource = normalizeUmbraUiPipelineModelSources(
    source.modelSource ?? fallback.modelSource ?? 'checkpoint',
  )[0] || 'checkpoint';
  return {
    feature,
    modelFamily,
    modelFamilyKey,
    modelSource,
  };
}

export function createUmbraUiPipelineTargetId(value: unknown): string {
  const selection = normalizeUmbraUiPipelineSelection(value);
  if (!selection.modelFamilyKey) return '';
  return `${UMBRA_UI_PIPELINE_TARGET_PREFIX}${selection.feature}:${selection.modelFamilyKey}:${selection.modelSource}`;
}

export function parseUmbraUiPipelineTargetId(value: unknown): UmbraUiPipelineSelection | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized.startsWith(UMBRA_UI_PIPELINE_TARGET_PREFIX)) return null;
  const [featureValue, familyValue, sourceValue] = normalized
    .slice(UMBRA_UI_PIPELINE_TARGET_PREFIX.length)
    .split(':');
  const feature = normalizeUmbraUiPipelineFeature(featureValue);
  const modelFamilyKey = normalizeUmbraUiModelFamilyKey(familyValue);
  const modelSource = normalizeUmbraUiPipelineModelSources(sourceValue)[0];
  if (!feature || !modelFamilyKey || !modelSource) return null;
  return {
    feature,
    modelFamily: modelFamilyKey,
    modelFamilyKey,
    modelSource,
  };
}

export function matchUmbraUiPipelineDescriptors<T extends UmbraUiPipelineDescriptor>(
  pipelines: T[],
  featureInput: unknown,
  modelFamilyInput: unknown,
  modelSourceInput: unknown,
): T[] {
  const feature = normalizeUmbraUiPipelineFeature(featureInput);
  const modelFamilyKey = normalizeUmbraUiModelFamilyKey(modelFamilyInput);
  const modelSource = normalizeUmbraUiPipelineModelSources(modelSourceInput)[0];
  if (!feature || !modelFamilyKey || !modelSource) return [];
  return pipelines.filter((pipeline) => (
    pipeline.feature === feature
    && pipeline.modelFamilyKey === modelFamilyKey
    && pipeline.modelSources.includes(modelSource)
  ));
}

const UMBRA_UI_RESOURCE_ROOT_FOLDERS = new Set([
  'checkpoint',
  'checkpoints',
  'clip',
  'clip_vision',
  'controlnet',
  'diffusers',
  'diffusion_models',
  'text_encoders',
  'unet',
  'unet_gguf',
  'upscale_models',
  'vae',
]);

export function normalizeUmbraUiResourceRelativePath(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/{2,}/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length > 1 && UMBRA_UI_RESOURCE_ROOT_FOLDERS.has(parts[0].toLowerCase())) {
    return parts.slice(1).join('/');
  }
  return parts.join('/');
}

export interface UmbraUiResourceCatalogMatch {
  status: 'available' | 'missing' | 'ambiguous';
  match: string;
  matches: string[];
}

export function matchUmbraUiResourceCatalog(
  value: unknown,
  catalogInput: Iterable<unknown>,
): UmbraUiResourceCatalogMatch {
  const expected = normalizeUmbraUiResourceRelativePath(value);
  if (!expected) return { status: 'missing', match: '', matches: [] };
  const catalog = Array.from(new Map(Array.from(catalogInput)
    .map((entry) => normalizeUmbraUiResourceRelativePath(entry))
    .filter(Boolean)
    .map((entry) => [entry.toLowerCase(), entry] as const)).values());
  const expectedKey = expected.toLowerCase();
  const exact = catalog.find((entry) => entry.toLowerCase() === expectedKey);
  if (exact) return { status: 'available', match: exact, matches: [exact] };
  const expectedBaseName = expectedKey.split('/').pop() || expectedKey;
  const basenameMatches = catalog.filter((entry) => (
    (entry.toLowerCase().split('/').pop() || '') === expectedBaseName
  ));
  if (basenameMatches.length === 1) {
    return { status: 'available', match: basenameMatches[0], matches: basenameMatches };
  }
  if (basenameMatches.length > 1) {
    return { status: 'ambiguous', match: '', matches: basenameMatches };
  }
  return { status: 'missing', match: '', matches: [] };
}

export type UmbraUiDetailerStageName = 'person' | 'face' | 'eyes' | 'hands';

export function normalizeUmbraUiDetailerStageName(value: unknown): UmbraUiDetailerStageName | null {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z]+/g, '');
  if (normalized === 'person' || normalized === 'people') return 'person';
  if (normalized === 'face' || normalized === 'faces') return 'face';
  if (normalized === 'eye' || normalized === 'eyes') return 'eyes';
  if (normalized === 'hand' || normalized === 'hands') return 'hands';
  return null;
}

export function resolveUmbraUiHiresResizeMode(
  capability: UmbraUiPipelineHiresFixCapability,
  value: unknown,
): 'scale' | 'dimensions' | null {
  if (capability.support !== 'adjustable') return null;
  const requested = value === 'dimensions' ? 'dimensions' : value === 'scale' ? 'scale' : null;
  if (requested && capability.resizeModes.includes(requested)) return requested;
  return capability.resizeModes[0] || null;
}

export function filterUmbraUiDetailerStages<T extends { label: string }>(
  capability: UmbraUiPipelineDetailerCapability,
  stages: T[],
): T[] {
  if (capability.support !== 'adjustable') return [];
  if (capability.customStages) return [...stages];
  const allowed = new Set(capability.stages);
  return stages.filter((stage) => {
    const stageName = normalizeUmbraUiDetailerStageName(stage.label);
    return !!stageName && allowed.has(stageName);
  });
}

function toPipelineRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizePipelineStringList(value: unknown, limit = 100): string[] {
  return Array.from(new Set((Array.isArray(value) ? value : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)))
    .slice(0, limit);
}

function normalizePipelineFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizePipelineResourceKind(value: unknown): UmbraUiPipelineResourceKind | null {
  const modelSource = normalizeUmbraUiPipelineModelSources([value])[0];
  if (modelSource) return modelSource;
  const normalized = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ['vae', 'text_encoder', 'clip_vision', 'controlnet', 'upscale_model', 'model'].includes(normalized)
    ? normalized as UmbraUiPipelineResourceKind
    : null;
}

function normalizeControlCapability(
  value: unknown,
  fallback: UmbraUiPipelineControlCapability,
): UmbraUiPipelineControlCapability {
  const raw = toPipelineRecord(value);
  const support = ['adjustable', 'fixed', 'unsupported'].includes(String(raw.support || ''))
    ? raw.support as UmbraUiPipelineCapabilitySupport
    : fallback.support;
  const rawValue = raw.value;
  const normalizedValue = typeof rawValue === 'string' || typeof rawValue === 'boolean'
    ? rawValue
    : normalizePipelineFiniteNumber(rawValue);
  return {
    support,
    reason: String(raw.reason || fallback.reason || '').trim().slice(0, 500),
    nodeClassTypes: normalizePipelineStringList(raw.nodeClassTypes ?? raw.node_class_types, 50),
    ...(normalizedValue !== undefined ? { value: normalizedValue } : fallback.value !== undefined ? { value: fallback.value } : {}),
  };
}

function unsupportedControl(reason: string): UmbraUiPipelineControlCapability {
  return {
    support: 'unsupported',
    reason,
    nodeClassTypes: [],
  };
}

export function createUnsupportedUmbraUiPipelineCapabilities(
  modelSourcesInput: unknown = [],
  reason = 'This pipeline did not provide capability metadata.',
): UmbraUiPipelineCapabilities {
  const modelSources = normalizeUmbraUiPipelineModelSources(modelSourcesInput);
  const modelSourceSupport: UmbraUiPipelineCapabilitySupport = modelSources.length > 1
    ? 'adjustable'
    : modelSources.length === 1 ? 'fixed' : 'unsupported';
  const fallback = () => unsupportedControl(reason);
  return {
    version: 1,
    modelSources: {
      support: modelSourceSupport,
      reason: modelSources.length > 0 ? 'Model sources are declared by the locked pipeline descriptor.' : reason,
      nodeClassTypes: [],
      values: modelSources,
    },
    negativePrompt: fallback(),
    loras: fallback(),
    seed: fallback(),
    steps: fallback(),
    guidance: {
      ...fallback(),
      mode: 'none',
      label: 'Guidance unavailable',
    },
    clipSkip: fallback(),
    sampler: fallback(),
    scheduler: fallback(),
    denoise: fallback(),
    resolution: fallback(),
    hiresFix: {
      ...fallback(),
      resizeModes: [],
      controls: {
        upscaler: false,
        steps: false,
        denoise: false,
        cfg: false,
        sampler: false,
        scheduler: false,
      },
    },
    detailerStages: {
      ...fallback(),
      stages: [],
      customStages: false,
    },
    finalModelUpscale: {
      ...fallback(),
      modelSelection: false,
      maxDimension: false,
    },
  };
}

function normalizeInpaintLayerCapability(
  value: unknown,
  fallbackReason: string,
): UmbraUiInpaintLayerCapability {
  const raw = toPipelineRecord(value);
  const support = ['adjustable', 'fixed', 'unsupported'].includes(String(raw.support || ''))
    ? raw.support as UmbraUiPipelineCapabilitySupport
    : 'unsupported';
  return {
    support,
    reason: String(raw.reason || fallbackReason).trim().slice(0, 500) || fallbackReason,
    nodeClassTypes: normalizePipelineStringList(raw.nodeClassTypes ?? raw.node_class_types, 50),
    maxLayers: support === 'unsupported'
      ? 0
      : Math.max(1, Math.min(64, Math.round(normalizePipelineFiniteNumber(raw.maxLayers ?? raw.max_layers) ?? 1))),
  };
}

const INPAINT_CONTROL_ADAPTER_TYPES: UmbraUiInpaintControlAdapterType[] = [
  'controlnet', 't2i_adapter', 'control_lora', 'z_image_control', 'anima_lllite',
];
const INPAINT_CONTROL_MODES: UmbraUiInpaintControlMode[] = [
  'balanced', 'more_prompt', 'more_control', 'unbalanced',
];
const INPAINT_REFERENCE_METHODS: UmbraUiInpaintReferenceMethod[] = [
  'style_model', 'ip_adapter', 'flux_redux', 'flux_kontext', 'flux2_reference', 'qwen_image_reference', 'hidream_o1_reference',
];

function normalizeInpaintControlCapability(value: unknown, fallbackReason: string): UmbraUiInpaintControlLayerCapability {
  const base = normalizeInpaintLayerCapability(value, fallbackReason);
  const raw = toPipelineRecord(value);
  const adapterTypes = normalizePipelineStringList(raw.adapterTypes ?? raw.adapter_types, 20)
    .filter((entry): entry is UmbraUiInpaintControlAdapterType => INPAINT_CONTROL_ADAPTER_TYPES.includes(entry as UmbraUiInpaintControlAdapterType));
  const modes = normalizePipelineStringList(raw.modes, 20)
    .filter((entry): entry is UmbraUiInpaintControlMode => INPAINT_CONTROL_MODES.includes(entry as UmbraUiInpaintControlMode));
  return {
    ...base,
    adapterTypes: base.support === 'unsupported' ? [] : adapterTypes,
    modes: base.support === 'unsupported' ? [] : modes,
  };
}

function normalizeInpaintRegionalCapability(value: unknown, fallbackReason: string): UmbraUiInpaintRegionalGuidanceCapability {
  const base = normalizeInpaintLayerCapability(value, fallbackReason);
  const raw = toPipelineRecord(value);
  const supported = base.support !== 'unsupported';
  const enabledByDefault = (camelCase: string, snakeCase: string) => {
    const declared = raw[camelCase] ?? raw[snakeCase];
    return supported && (declared === undefined ? true : declared === true);
  };
  return {
    ...base,
    positivePrompt: enabledByDefault('positivePrompt', 'positive_prompt'),
    negativePrompt: enabledByDefault('negativePrompt', 'negative_prompt'),
    autoNegative: enabledByDefault('autoNegative', 'auto_negative'),
  };
}

function normalizeInpaintReferenceCapability(value: unknown, fallbackReason: string): UmbraUiInpaintReferenceLayerCapability {
  const base = normalizeInpaintLayerCapability(value, fallbackReason);
  const raw = toPipelineRecord(value);
  const methods = normalizePipelineStringList(raw.methods, 20)
    .filter((entry): entry is UmbraUiInpaintReferenceMethod => INPAINT_REFERENCE_METHODS.includes(entry as UmbraUiInpaintReferenceMethod));
  return { ...base, methods: base.support === 'unsupported' ? [] : methods };
}

function normalizeInpaintSeamlessCapability(value: unknown, fallbackReason: string): UmbraUiInpaintSeamlessCapability {
  const raw = toPipelineRecord(value);
  const support = ['adjustable', 'fixed', 'unsupported'].includes(String(raw.support || ''))
    ? raw.support as UmbraUiPipelineCapabilitySupport
    : 'unsupported';
  const axes = normalizePipelineStringList(raw.axes, 2)
    .filter((axis): axis is 'x' | 'y' => axis === 'x' || axis === 'y');
  return {
    support,
    reason: String(raw.reason || fallbackReason).trim().slice(0, 500) || fallbackReason,
    nodeClassTypes: normalizePipelineStringList(raw.nodeClassTypes ?? raw.node_class_types, 50),
    axes: support === 'unsupported' ? [] : axes,
  };
}

export function createUnsupportedUmbraUiInpaintCanvasCapabilities(
  reason = 'The locked inpaint pipeline does not declare this canvas-layer contract.',
): UmbraUiInpaintCanvasCapabilities {
  const unsupportedLayer = (): UmbraUiInpaintLayerCapability => ({
    support: 'unsupported',
    reason,
    nodeClassTypes: [],
    maxLayers: 0,
  });
  return {
    version: 1,
    regionalGuidance: {
      ...unsupportedLayer(),
      positivePrompt: false,
      negativePrompt: false,
      autoNegative: false,
    },
    controlLayers: { ...unsupportedLayer(), adapterTypes: [], modes: [] },
    referenceLayers: { ...unsupportedLayer(), methods: [] },
    seamless: { support: 'unsupported', reason, nodeClassTypes: [], axes: [] },
  };
}

export function normalizeUmbraUiInpaintCanvasCapabilities(
  value: unknown,
): UmbraUiInpaintCanvasCapabilities {
  const fallbackReason = 'The locked inpaint pipeline does not declare this canvas-layer contract.';
  const raw = toPipelineRecord(value);
  if (Object.keys(raw).length <= 0) return createUnsupportedUmbraUiInpaintCanvasCapabilities(fallbackReason);
  return {
    version: 1,
    regionalGuidance: normalizeInpaintRegionalCapability(raw.regionalGuidance ?? raw.regional_guidance, fallbackReason),
    controlLayers: normalizeInpaintControlCapability(raw.controlLayers ?? raw.control_layers, fallbackReason),
    referenceLayers: normalizeInpaintReferenceCapability(raw.referenceLayers ?? raw.reference_layers, fallbackReason),
    seamless: normalizeInpaintSeamlessCapability(raw.seamless, fallbackReason),
  };
}

export function normalizeUmbraUiPipelineCapabilities(
  value: unknown,
  modelSourcesInput: unknown = [],
): UmbraUiPipelineCapabilities {
  const fallback = createUnsupportedUmbraUiPipelineCapabilities(modelSourcesInput);
  const raw = toPipelineRecord(value);
  if (Object.keys(raw).length <= 0) return fallback;

  const normalizedModelSources = normalizeUmbraUiPipelineModelSources(
    toPipelineRecord(raw.modelSources).values ?? modelSourcesInput,
  );
  const modelSources = normalizeControlCapability(raw.modelSources, fallback.modelSources);
  const guidanceRaw = toPipelineRecord(raw.guidance);
  const guidance = normalizeControlCapability(guidanceRaw, fallback.guidance);
  const guidanceMode = ['cfg', 'guidance', 'none'].includes(String(guidanceRaw.mode || ''))
    ? guidanceRaw.mode as UmbraUiPipelineGuidanceCapability['mode']
    : fallback.guidance.mode;
  const hiresRaw = toPipelineRecord(raw.hiresFix);
  const hiresControlsRaw = toPipelineRecord(hiresRaw.controls);
  const detailerRaw = toPipelineRecord(raw.detailerStages);
  const upscaleRaw = toPipelineRecord(raw.finalModelUpscale);
  const resolutionRaw = toPipelineRecord(raw.resolution);

  return {
    version: 1,
    modelSources: {
      ...modelSources,
      values: normalizedModelSources.length > 0 ? normalizedModelSources : fallback.modelSources.values,
    },
    negativePrompt: normalizeControlCapability(raw.negativePrompt, fallback.negativePrompt),
    loras: normalizeControlCapability(raw.loras, fallback.loras),
    seed: normalizeControlCapability(raw.seed, fallback.seed),
    steps: normalizeControlCapability(raw.steps, fallback.steps),
    guidance: {
      ...guidance,
      mode: guidanceMode,
      label: guidanceMode === 'cfg' ? 'CFG' : guidanceMode === 'guidance' ? 'Guidance' : 'Guidance unavailable',
    },
    clipSkip: normalizeControlCapability(raw.clipSkip, fallback.clipSkip),
    sampler: normalizeControlCapability(raw.sampler, fallback.sampler),
    scheduler: normalizeControlCapability(raw.scheduler, fallback.scheduler),
    denoise: normalizeControlCapability(raw.denoise, fallback.denoise),
    resolution: {
      ...normalizeControlCapability(resolutionRaw, fallback.resolution),
      ...(normalizePipelineFiniteNumber(resolutionRaw.defaultWidth) !== undefined
        ? { defaultWidth: normalizePipelineFiniteNumber(resolutionRaw.defaultWidth) }
        : {}),
      ...(normalizePipelineFiniteNumber(resolutionRaw.defaultHeight) !== undefined
        ? { defaultHeight: normalizePipelineFiniteNumber(resolutionRaw.defaultHeight) }
        : {}),
      minimumWidth: Math.max(1, normalizePipelineFiniteNumber(resolutionRaw.minimumWidth) ?? fallback.resolution.minimumWidth ?? 64),
      minimumHeight: Math.max(1, normalizePipelineFiniteNumber(resolutionRaw.minimumHeight) ?? fallback.resolution.minimumHeight ?? 64),
      maximumWidth: Math.max(1, normalizePipelineFiniteNumber(resolutionRaw.maximumWidth) ?? fallback.resolution.maximumWidth ?? 16384),
      maximumHeight: Math.max(1, normalizePipelineFiniteNumber(resolutionRaw.maximumHeight) ?? fallback.resolution.maximumHeight ?? 16384),
      step: Math.max(1, Math.round(normalizePipelineFiniteNumber(resolutionRaw.step) ?? fallback.resolution.step ?? 8)),
    },
    hiresFix: {
      ...normalizeControlCapability(hiresRaw, fallback.hiresFix),
      resizeModes: normalizePipelineStringList(hiresRaw.resizeModes, 2)
        .filter((entry): entry is 'scale' | 'dimensions' => entry === 'scale' || entry === 'dimensions'),
      controls: {
        upscaler: hiresControlsRaw.upscaler === true,
        steps: hiresControlsRaw.steps === true,
        denoise: hiresControlsRaw.denoise === true,
        cfg: hiresControlsRaw.cfg === true,
        sampler: hiresControlsRaw.sampler === true,
        scheduler: hiresControlsRaw.scheduler === true,
      },
    },
    detailerStages: {
      ...normalizeControlCapability(detailerRaw, fallback.detailerStages),
      stages: normalizePipelineStringList(detailerRaw.stages, 4)
        .filter((entry): entry is 'person' | 'face' | 'eyes' | 'hands' => (
          entry === 'person' || entry === 'face' || entry === 'eyes' || entry === 'hands'
        )),
      customStages: detailerRaw.customStages === true,
    },
    finalModelUpscale: {
      ...normalizeControlCapability(upscaleRaw, fallback.finalModelUpscale),
      modelSelection: upscaleRaw.modelSelection === true,
      maxDimension: upscaleRaw.maxDimension === true,
    },
  };
}

export function summarizeUmbraUiPipelineCapabilitySupport(
  capabilitiesInput: unknown,
  modelSourcesInput: unknown = [],
): UmbraUiPipelineCapabilitySupportSummary {
  const capabilities = normalizeUmbraUiPipelineCapabilities(capabilitiesInput, modelSourcesInput);
  const adjustable: UmbraUiPipelineCapabilityKey[] = [];
  const fixed: UmbraUiPipelineCapabilityKey[] = [];
  const unsupported: UmbraUiPipelineCapabilityKey[] = [];
  for (const key of UMBRA_UI_PIPELINE_CAPABILITY_KEYS) {
    const support = capabilities[key].support;
    if (support === 'adjustable') adjustable.push(key);
    else if (support === 'fixed') fixed.push(key);
    else unsupported.push(key);
  }
  return {
    status: unsupported.length <= 0 ? 'full' : adjustable.length + fixed.length > 0 ? 'partial' : 'none',
    adjustable,
    fixed,
    unsupported,
  };
}

export function createUnknownUmbraUiPipelineReadiness(
  capabilitiesInput: unknown,
  modelSourcesInput: unknown = [],
): UmbraUiPipelineReadiness {
  return {
    graph: { status: 'unknown', issues: [] },
    capabilitySupport: summarizeUmbraUiPipelineCapabilitySupport(capabilitiesInput, modelSourcesInput),
    runtime: {
      comfyUi: 'unknown',
      nodes: { status: 'unverified', missing: [] },
      resources: {
        status: 'unverified',
        missing: [],
        requiredMissing: [],
        selectionRequired: [],
        ambiguous: [],
        items: [],
      },
    },
  };
}

export function normalizeUmbraUiPipelineReadiness(
  value: unknown,
  capabilitiesInput: unknown,
  modelSourcesInput: unknown = [],
): UmbraUiPipelineReadiness {
  const fallback = createUnknownUmbraUiPipelineReadiness(capabilitiesInput, modelSourcesInput);
  const raw = toPipelineRecord(value);
  if (Object.keys(raw).length <= 0) return fallback;
  const graphRaw = toPipelineRecord(raw.graph);
  const runtimeRaw = toPipelineRecord(raw.runtime);
  const nodesRaw = toPipelineRecord(runtimeRaw.nodes);
  const resourcesRaw = toPipelineRecord(runtimeRaw.resources);
  const capabilitySupportRaw = toPipelineRecord(raw.capabilitySupport);
  const graphStatus = ['valid', 'invalid', 'unknown'].includes(String(graphRaw.status || ''))
    ? graphRaw.status as UmbraUiPipelineReadiness['graph']['status']
    : fallback.graph.status;
  const comfyUi = ['online', 'offline', 'unknown'].includes(String(runtimeRaw.comfyUi || ''))
    ? runtimeRaw.comfyUi as UmbraUiPipelineReadiness['runtime']['comfyUi']
    : fallback.runtime.comfyUi;
  const normalizeNodeRuntimeStatus = (status: unknown) => (
    ['ready', 'missing', 'unverified'].includes(String(status || ''))
      ? status as 'ready' | 'missing' | 'unverified'
      : 'unverified'
  );
  const normalizeResourceRuntimeStatus = (status: unknown) => (
    ['ready', 'missing', 'selection_required', 'ambiguous', 'unverified'].includes(String(status || ''))
      ? status as UmbraUiPipelineReadiness['runtime']['resources']['status']
      : 'unverified'
  );
  const items = (Array.isArray(resourcesRaw.items) ? resourcesRaw.items : [])
    .map((entry): UmbraUiPipelineResourceReadinessItem | null => {
      const item = toPipelineRecord(entry);
      const kind = normalizePipelineResourceKind(item.kind);
      const id = String(item.id || '').trim().slice(0, 200);
      const value = String(item.value || '').trim().replace(/\\/g, '/').slice(0, 500);
      const status = ['available', 'missing', 'selection_required', 'ambiguous', 'unverified'].includes(String(item.status || ''))
        ? item.status as UmbraUiPipelineResourceReadinessItem['status']
        : 'unverified';
      if (!id || !kind || (!value && status !== 'selection_required')) return null;
      return {
        id,
        label: String(item.label || id).trim().slice(0, 200),
        kind,
        value,
        required: item.required === true,
        source: item.source === 'descriptor_default' ? 'descriptor_default' : 'graph',
        status,
      };
    })
    .filter((entry): entry is UmbraUiPipelineResourceReadinessItem => !!entry);
  const normalizedSummary = summarizeUmbraUiPipelineCapabilitySupport(capabilitiesInput, modelSourcesInput);
  const summaryStatus = ['full', 'partial', 'none'].includes(String(capabilitySupportRaw.status || ''))
    ? capabilitySupportRaw.status as UmbraUiPipelineCapabilitySupportSummary['status']
    : normalizedSummary.status;
  const normalizeCapabilityKeys = (entries: unknown, fallbackEntries: UmbraUiPipelineCapabilityKey[]) => {
    const normalized = normalizePipelineStringList(entries, UMBRA_UI_PIPELINE_CAPABILITY_KEYS.length)
      .filter((entry): entry is UmbraUiPipelineCapabilityKey => (
        (UMBRA_UI_PIPELINE_CAPABILITY_KEYS as readonly string[]).includes(entry)
      ));
    return normalized.length > 0 ? normalized : fallbackEntries;
  };
  return {
    graph: {
      status: graphStatus,
      issues: normalizePipelineStringList(graphRaw.issues, 100),
    },
    capabilitySupport: {
      status: summaryStatus,
      adjustable: normalizeCapabilityKeys(capabilitySupportRaw.adjustable, normalizedSummary.adjustable),
      fixed: normalizeCapabilityKeys(capabilitySupportRaw.fixed, normalizedSummary.fixed),
      unsupported: normalizeCapabilityKeys(capabilitySupportRaw.unsupported, normalizedSummary.unsupported),
    },
    runtime: {
      comfyUi,
      nodes: {
        status: normalizeNodeRuntimeStatus(nodesRaw.status),
        missing: normalizePipelineStringList(nodesRaw.missing, 100),
      },
      resources: {
        status: normalizeResourceRuntimeStatus(resourcesRaw.status),
        missing: normalizePipelineStringList(resourcesRaw.missing, 100),
        requiredMissing: normalizePipelineStringList(resourcesRaw.requiredMissing, 100),
        selectionRequired: normalizePipelineStringList(resourcesRaw.selectionRequired, 100),
        ambiguous: normalizePipelineStringList(resourcesRaw.ambiguous, 100),
        items,
      },
    },
  };
}
