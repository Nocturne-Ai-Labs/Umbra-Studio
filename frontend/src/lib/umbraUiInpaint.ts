import type {
  UmbraUiInpaintControlAdapterType,
  UmbraUiInpaintControlMode,
  UmbraUiInpaintReferenceMethod,
  UmbraUiIpAdapterCombineEmbeds,
  UmbraUiIpAdapterEmbedsScaling,
  UmbraUiIpAdapterWeightType,
} from '../../../shared/umbra-ui/pipelineTypes';
import type { UmbraUiMediaGenerationSnapshot, UmbraUiStudioDestinationMode } from './umbraUiMediaHandoff';

export type UmbraUiInpaintItemStatus = 'staging' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type UmbraUiInpaintJobStatus = 'staging' | 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'canceled';
export type UmbraUiInpaintFillMode = 'neutral' | 'telea' | 'navier-stokes' | 'color' | 'tile' | 'lama';

export const UMBRA_UI_LOCAL_PREFILL_MAX_MASK_COVERAGE = 0.35;

export function resolveUmbraUiInpaintFillModeForMask(
  fillMode: UmbraUiInpaintFillMode,
  maskCoverage: number,
): UmbraUiInpaintFillMode {
  const coverage = Math.max(0, Math.min(1, Number(maskCoverage) || 0));
  return (fillMode === 'telea' || fillMode === 'navier-stokes')
    && coverage >= UMBRA_UI_LOCAL_PREFILL_MAX_MASK_COVERAGE
    ? 'neutral'
    : fillMode;
}

export interface UmbraUiInpaintOutput {
  filename: string;
  subfolder: string;
  type: string;
  fullpath: string;
}

export interface UmbraUiInpaintJobItem {
  id: string;
  seed: number;
  status: UmbraUiInpaintItemStatus;
  promptId: string;
  outputs: UmbraUiInpaintOutput[];
  error: string;
}

export interface UmbraUiInpaintJob {
  id: string;
  status: UmbraUiInpaintJobStatus;
  sourceName: string;
  workflowId: string;
  prompt: string;
  width: number;
  height: number;
  total: number;
  completed: number;
  failed: number;
  createdAt: number;
  updatedAt: number;
  items: UmbraUiInpaintJobItem[];
}

export class UmbraUiInpaintRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'UmbraUiInpaintRequestError';
    this.status = status;
  }
}

export function failLostUmbraUiInpaintJob(job: UmbraUiInpaintJob, message: string): UmbraUiInpaintJob {
  const error = String(message || 'The backend no longer has this inpaint job.').trim();
  const items = job.items.map((item) => (
    item.status === 'staging' || item.status === 'queued' || item.status === 'running'
      ? { ...item, status: 'failed' as const, error }
      : item
  ));
  const completed = items.filter((item) => item.status === 'completed').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  return {
    ...job,
    status: completed > 0 ? 'partial' : 'failed',
    completed,
    failed,
    updatedAt: Date.now(),
    items,
  };
}

export interface UmbraUiInpaintHandoff {
  mode: 'inpaint';
  path?: string;
  originalSourcePath?: string;
  name?: string;
  imageUrl: string;
  source: string;
  canvasProjectId?: string;
  canvasOperationMode?: 'inpaint' | 'outpaint';
  studioProjectId?: string;
  studioArtboardId?: string;
  studioDestination?: UmbraUiStudioDestinationMode;
  generation?: UmbraUiMediaGenerationSnapshot;
  createdAt: number;
}

export interface UmbraUiInpaintRegionalGuidanceInput {
  id: string;
  name: string;
  mask: Blob;
  positivePrompt: string;
  negativePrompt: string;
  autoNegative: boolean;
  weight: number;
  beginStepPercent: number;
  endStepPercent: number;
}

export interface UmbraUiInpaintControlInput {
  id: string;
  name: string;
  image: Blob;
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

export interface UmbraUiControlPreprocessOptions {
  image: Blob;
  imageName: string;
  controlType: UmbraUiInpaintControlInput['controlType'];
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

export interface UmbraUiControlPreprocessResult {
  blob: Blob;
  filename: string;
}

export interface UmbraUiLayerUpscaleOptions {
  image: Blob;
  imageName: string;
  modelName: string;
  maxDimension: number;
}

export interface UmbraUiLayerUpscaleResult {
  blob: Blob;
  filename: string;
}

export interface UmbraUiBackgroundRemovalOptions {
  image: Blob;
  imageName?: string;
  model?: string;
  signal?: AbortSignal;
}

export interface UmbraUiBackgroundRemovalResult {
  blob: Blob;
  filename: string;
}

export interface UmbraUiInpaintReferenceInput {
  id: string;
  name: string;
  image: Blob;
  mask?: Blob;
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
}

export async function preprocessUmbraUiControlImage(options: UmbraUiControlPreprocessOptions): Promise<UmbraUiControlPreprocessResult> {
  const form = new FormData();
  form.append('image', options.image, options.imageName || 'control-source.png');
  for (const [key, value] of Object.entries(options)) {
    if (key === 'image' || key === 'imageName') continue;
    form.append(key, String(value));
  }
  const response = await fetch('/api/umbra-ui/inpaint/control-preprocess', { method: 'POST', body: form });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error || `Control preprocessing returned ${response.status}.`));
  }
  const encodedFilename = String(response.headers.get('X-Umbra-Control-Filename') || '').trim();
  let filename = 'processed-control.png';
  if (encodedFilename) {
    try { filename = decodeURIComponent(encodedFilename); } catch { filename = encodedFilename; }
  }
  return { blob: await response.blob(), filename };
}

export async function upscaleUmbraUiCanvasLayer(options: UmbraUiLayerUpscaleOptions): Promise<UmbraUiLayerUpscaleResult> {
  const form = new FormData();
  form.append('image', options.image, options.imageName || 'canvas-layer.png');
  form.append('modelName', options.modelName);
  form.append('maxDimension', String(options.maxDimension));
  const response = await fetch('/api/umbra-ui/inpaint/layer-upscale', { method: 'POST', body: form });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error || `Layer upscale returned ${response.status}.`));
  }
  const encodedFilename = String(response.headers.get('X-Umbra-Upscale-Filename') || '').trim();
  let filename = 'upscaled-layer.png';
  if (encodedFilename) {
    try { filename = decodeURIComponent(encodedFilename); } catch { filename = encodedFilename; }
  }
  return { blob: await response.blob(), filename };
}

export async function removeUmbraUiImageBackground(
  options: UmbraUiBackgroundRemovalOptions,
): Promise<UmbraUiBackgroundRemovalResult> {
  const form = new FormData();
  form.append('image', options.image, options.imageName || 'character-source.png');
  form.append('model', options.model || 'isnet-anime');
  const response = await fetch('/api/umbra-ui/inpaint/remove-background', {
    method: 'POST',
    body: form,
    signal: options.signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(String(payload?.error || `Background removal returned ${response.status}.`));
  }
  const encodedFilename = String(response.headers.get('X-Umbra-Background-Filename') || '').trim();
  let filename = 'character-cutout.png';
  if (encodedFilename) {
    try { filename = decodeURIComponent(encodedFilename); } catch { filename = encodedFilename; }
  }
  return { blob: await response.blob(), filename };
}

export interface UmbraUiInpaintSubmitOptions {
  source: Blob;
  sourceName: string;
  canvasProjectId: string;
  operationMode: 'inpaint' | 'outpaint';
  generationRegionX: number;
  generationRegionY: number;
  generationRegionWidth: number;
  generationRegionHeight: number;
  submissionRegionX: number;
  submissionRegionY: number;
  submissionRegionWidth: number;
  submissionRegionHeight: number;
  mask: Blob;
  modelFamily: string;
  modelSource: 'checkpoint' | 'diffusers' | 'diffusion_model' | 'unet' | 'gguf';
  prompt: string;
  negativePrompt: string;
  checkpointName: string;
  clipSkip: number;
  seed: number;
  steps: number;
  cfg: number;
  samplerName: string;
  scheduler: string;
  denoise: number;
  samples: number;
  width: number;
  height: number;
  maskGrow: number;
  maskFeather: number;
  canvasMaskGrow: number;
  canvasMaskFeather: number;
  contextPadding: number;
  processingScaleMode: 'none' | 'auto' | 'manual';
  processingWidth: number;
  processingHeight: number;
  coherenceMode: 'none' | 'gaussian' | 'box' | 'staged';
  coherenceEdgeSize: number;
  coherenceMinimumDenoise: number;
  fillMode: UmbraUiInpaintFillMode;
  infillColor: string;
  infillTileSize: number;
  inpaintModelName: string;
  seamlessX: boolean;
  seamlessY: boolean;
  outputOnlyMaskedRegions: boolean;
  semanticCutout?: boolean;
  colorMatch: number;
  differentialStrength: number;
  softInpaintEnabled: boolean;
  softInpaintPreservation: number;
  softInpaintTransitionContrast: number;
  softInpaintMaskInfluence: number;
  regionalGuidance: UmbraUiInpaintRegionalGuidanceInput[];
  controlLayers: UmbraUiInpaintControlInput[];
  referenceLayers: UmbraUiInpaintReferenceInput[];
}

export async function submitUmbraUiInpaintJob(options: UmbraUiInpaintSubmitOptions): Promise<UmbraUiInpaintJob> {
  const form = new FormData();
  form.append('source', options.source, options.sourceName || 'inpaint-source.png');
  form.append('mask', options.mask, 'inpaint-mask.png');
  for (const [key, value] of Object.entries(options)) {
    if (key === 'source' || key === 'sourceName' || key === 'mask' || key === 'regionalGuidance' || key === 'controlLayers' || key === 'referenceLayers') continue;
    form.append(key, String(value));
  }
  form.append('regionalGuidance', JSON.stringify(options.regionalGuidance.map((region) => ({
    id: region.id,
    name: region.name,
    positivePrompt: region.positivePrompt,
    negativePrompt: region.negativePrompt,
    autoNegative: region.autoNegative,
    weight: region.weight,
    beginStepPercent: region.beginStepPercent,
    endStepPercent: region.endStepPercent,
  }))));
  for (const region of options.regionalGuidance) {
    form.append(`regionalMask:${region.id}`, region.mask, `${region.id}.png`);
  }
  form.append('controlLayers', JSON.stringify(options.controlLayers.map((control) => ({
    id: control.id,
    name: control.name,
    adapterType: control.adapterType,
    controlMode: control.controlMode,
    controlType: control.controlType,
    modelName: control.modelName,
    weight: control.weight,
    beginStepPercent: control.beginStepPercent,
    endStepPercent: control.endStepPercent,
    processorResolution: control.processorResolution,
    lowThreshold: control.lowThreshold,
    highThreshold: control.highThreshold,
    detectBody: control.detectBody,
    detectFace: control.detectFace,
    detectHands: control.detectHands,
    maxFaces: control.maxFaces,
    minimumConfidence: control.minimumConfidence,
    scoreThreshold: control.scoreThreshold,
    distanceThreshold: control.distanceThreshold,
    normalStrength: control.normalStrength,
    backgroundThreshold: control.backgroundThreshold,
    safeMode: control.safeMode,
    processorSeed: control.processorSeed,
  }))));
  for (const control of options.controlLayers) {
    form.append(`controlImage:${control.id}`, control.image, `${control.id}.png`);
  }
  form.append('referenceLayers', JSON.stringify(options.referenceLayers.map((reference) => ({
    id: reference.id,
    name: reference.name,
    method: reference.method,
    modelName: reference.modelName,
    visionModelName: reference.visionModelName,
    crop: reference.crop,
    strengthType: reference.strengthType,
    weight: reference.weight,
    beginStepPercent: reference.beginStepPercent,
    endStepPercent: reference.endStepPercent,
    ipAdapterWeightType: reference.ipAdapterWeightType,
    ipAdapterCombineEmbeds: reference.ipAdapterCombineEmbeds,
    ipAdapterEmbedsScaling: reference.ipAdapterEmbedsScaling,
    hasMask: !!reference.mask,
  }))));
  for (const reference of options.referenceLayers) {
    form.append(`referenceImage:${reference.id}`, reference.image, `${reference.id}.png`);
    if (reference.mask) form.append(`referenceMask:${reference.id}`, reference.mask, `${reference.id}-mask.png`);
  }
  const response = await fetch('/api/umbra-ui/inpaint', { method: 'POST', body: form });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.job) {
    throw new Error(String(payload?.error || `Inpaint request failed (${response.status}).`));
  }
  return payload.job as UmbraUiInpaintJob;
}

export async function fetchUmbraUiInpaintJob(jobId: string, signal?: AbortSignal): Promise<UmbraUiInpaintJob> {
  const response = await fetch(`/api/umbra-ui/inpaint/jobs/${encodeURIComponent(jobId)}`, {
    cache: 'no-store',
    signal,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.job) {
    throw new UmbraUiInpaintRequestError(
      String(payload?.error || `Inpaint job returned ${response.status}.`),
      response.status,
    );
  }
  return payload.job as UmbraUiInpaintJob;
}

export async function cancelUmbraUiInpaintJob(jobId: string): Promise<UmbraUiInpaintJob> {
  const response = await fetch(`/api/umbra-ui/inpaint/jobs/${encodeURIComponent(jobId)}/cancel`, { method: 'POST' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.job) {
    throw new Error(String(payload?.error || `Inpaint cancel returned ${response.status}.`));
  }
  return payload.job as UmbraUiInpaintJob;
}

export function isUmbraUiInpaintJobTerminal(job: UmbraUiInpaintJob | null): boolean {
  return !!job && (job.status === 'completed' || job.status === 'partial' || job.status === 'failed' || job.status === 'canceled');
}

export function buildUmbraUiInpaintOutputPath(output: UmbraUiInpaintOutput): string {
  const fullpath = String(output.fullpath || '').trim();
  if (fullpath) return fullpath;
  const subfolder = String(output.subfolder || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const filename = String(output.filename || '').trim();
  if (!filename) return '';
  return ['Tools/ComfyUI/output', subfolder, filename].filter(Boolean).join('/');
}

export function buildUmbraUiInpaintOutputUrl(output: UmbraUiInpaintOutput, revision?: number): string {
  const params = new URLSearchParams({ path: buildUmbraUiInpaintOutputPath(output) });
  if (revision) params.set('rev', String(revision));
  return `/api/fs/image?${params.toString()}`;
}

export function stageUmbraUiInpaintHandoff(detail: Omit<UmbraUiInpaintHandoff, 'mode' | 'createdAt'>) {
  return stageUmbraUiMediaHandoff({
    mode: 'inpaint',
    path: detail.path || '',
    originalSourcePath: detail.originalSourcePath || detail.path || '',
    name: detail.name,
    imageUrl: detail.imageUrl,
    source: detail.source,
    canvasProjectId: detail.canvasProjectId,
    canvasOperationMode: detail.canvasOperationMode,
    studioProjectId: detail.studioProjectId,
    studioArtboardId: detail.studioArtboardId,
    studioDestination: detail.studioDestination,
  });
}
import { stageUmbraUiMediaHandoff } from '@/lib/umbraUiMediaHandoff';
