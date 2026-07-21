import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import sharp from 'sharp';
import {
  validateUmbraUiInpaintOutputMetadata,
  type UmbraUiInpaintMetadataExpectation,
} from './umbra-ui-inpaint-qualification';
import {
  formatUmbraUiInpaintPreflightIssue,
  preflightUmbraUiInpaintQualification,
} from './umbra-ui-inpaint-preflight';

type ModelSource = 'checkpoint' | 'diffusers' | 'diffusion_model' | 'unet' | 'gguf';
type OperationMode = 'inpaint' | 'outpaint';

interface GuidanceCase {
  id: string;
  name?: string;
  maskPath?: string;
  positivePrompt?: string;
  negativePrompt?: string;
  autoNegative?: boolean;
  weight?: number;
  beginStepPercent?: number;
  endStepPercent?: number;
}

interface ControlCase {
  id: string;
  name?: string;
  imagePath: string;
  adapterType?: string;
  controlMode?: string;
  controlType?: string;
  modelName: string;
  weight?: number;
  beginStepPercent?: number;
  endStepPercent?: number;
  processorResolution?: number;
  lowThreshold?: number;
  highThreshold?: number;
  detectBody?: boolean;
  detectFace?: boolean;
  detectHands?: boolean;
  maxFaces?: number;
  minimumConfidence?: number;
  scoreThreshold?: number;
  distanceThreshold?: number;
  normalStrength?: number;
  backgroundThreshold?: number;
  safeMode?: boolean;
  processorSeed?: number;
}

interface ReferenceCase {
  id: string;
  name?: string;
  imagePath: string;
  maskPath?: string;
  method: string;
  modelName?: string;
  visionModelName?: string;
  crop?: 'center' | 'none';
  strengthType?: 'multiply' | 'attn_bias';
  weight?: number;
  beginStepPercent?: number;
  endStepPercent?: number;
  ipAdapterWeightType?: string;
  ipAdapterCombineEmbeds?: string;
  ipAdapterEmbedsScaling?: string;
}

export interface QualificationCase {
  id: string;
  label?: string;
  enabled?: boolean;
  sourceImage?: string;
  maskImage?: string;
  fixtureMode?: 'inpaint-center' | 'outpaint-border';
  operationMode: OperationMode;
  modelFamily: string;
  modelSource: ModelSource;
  checkpointName: string;
  expectedWorkflowId?: string;
  expectedAdapter?: string;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  generationX?: number;
  generationY?: number;
  generationWidth?: number;
  generationHeight?: number;
  submissionX?: number;
  submissionY?: number;
  submissionWidth?: number;
  submissionHeight?: number;
  clipSkip?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  samplerName?: string;
  scheduler?: string;
  denoise?: number;
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
  fillMode?: string;
  infillColor?: string;
  infillTileSize?: number;
  inpaintModelName?: string;
  seamlessX?: boolean;
  seamlessY?: boolean;
  outputOnlyMaskedRegions?: boolean;
  colorMatch?: number;
  differentialStrength?: number;
  regionalGuidance?: GuidanceCase[];
  controlLayers?: ControlCase[];
  referenceLayers?: ReferenceCase[];
}

export interface QualificationManifest {
  baseUrl?: string;
  sourceImage: string;
  maskImage?: string;
  modelsRoot?: string;
  reportPath?: string;
  pollIntervalMs?: number;
  timeoutMs?: number;
  cases: QualificationCase[];
}

interface QualificationReportCase {
  id: string;
  label: string;
  status: 'validated' | 'passed' | 'failed';
  startedAt: string;
  finishedAt: string;
  pipelineId: string;
  modelFamily: string;
  modelSource: ModelSource;
  operationMode: OperationMode;
  job?: unknown;
  outputChecks: Array<{
    path: string;
    mediaReachable: boolean;
    metadataReachable: boolean;
    workflowEmbedded: boolean;
    inpaintMetadataValid: boolean;
    metadataIssues: string[];
  }>;
  warnings: string[];
  error: string;
}

const TERMINAL_STATUSES = new Set(['completed', 'partial', 'failed', 'canceled']);
const QUALIFICATION_DEFAULT_MASK_GROW = 12;
const QUALIFICATION_DEFAULT_MASK_FEATHER = 8;

function readArg(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function isLoopbackUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]');
  } catch {
    return false;
  }
}

function apiUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const response = await fetch(url, init);
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `${response.status} ${response.statusText}`));
  }
  return payload;
}

function imageName(path: string, fallback: string): string {
  const extension = extname(path).toLowerCase();
  return `${fallback}${['.png', '.jpg', '.jpeg', '.webp'].includes(extension) ? extension : '.png'}`;
}

async function requireFile(path: string): Promise<Blob> {
  const absolutePath = resolve(path);
  const file = Bun.file(absolutePath);
  if (!(await file.exists()) || file.size <= 0) throw new Error(`Fixture does not exist or is empty: ${absolutePath}`);
  return file;
}

async function preparePrimaryFixtures(
  sourcePath: string,
  maskPath: string,
  width: number,
  height: number,
  fixtureMode: QualificationCase['fixtureMode'],
): Promise<{ source: Blob; mask: Blob }> {
  const sourceFile = Bun.file(sourcePath);
  if (!(await sourceFile.exists()) || sourceFile.size <= 0) throw new Error(`Fixture does not exist or is empty: ${sourcePath}`);
  const mode = fixtureMode || 'inpaint-center';
  let sourcePipeline = sharp(sourcePath).rotate();
  if (mode === 'outpaint-border') {
    const insetX = Math.max(32, Math.round(width * 0.16));
    const insetY = Math.max(32, Math.round(height * 0.16));
    const innerWidth = Math.max(64, width - insetX * 2);
    const innerHeight = Math.max(64, height - insetY * 2);
    const inner = await sourcePipeline.resize(innerWidth, innerHeight, { fit: 'cover' }).png().toBuffer();
    sourcePipeline = sharp({
      create: { width, height, channels: 4, background: { r: 127, g: 127, b: 127, alpha: 1 } },
    }).composite([{ input: inner, left: insetX, top: insetY }]);
  } else {
    sourcePipeline = sourcePipeline.resize(width, height, { fit: 'cover' });
  }
  const sourceBytes = await sourcePipeline.png().toBuffer();

  let maskBytes: Buffer;
  if (maskPath) {
    const maskFile = Bun.file(maskPath);
    if (!(await maskFile.exists()) || maskFile.size <= 0) throw new Error(`Fixture does not exist or is empty: ${maskPath}`);
    maskBytes = await sharp(maskPath).rotate().resize(width, height, { fit: 'fill' }).greyscale().png().toBuffer();
  } else {
    const insetX = Math.max(32, Math.round(width * (mode === 'outpaint-border' ? 0.16 : 0.3)));
    const insetY = Math.max(32, Math.round(height * (mode === 'outpaint-border' ? 0.16 : 0.3)));
    const innerWidth = Math.max(1, width - insetX * 2);
    const innerHeight = Math.max(1, height - insetY * 2);
    const outer = mode === 'outpaint-border' ? '#ffffff' : '#000000';
    const inner = mode === 'outpaint-border' ? '#000000' : '#ffffff';
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${outer}"/><rect x="${insetX}" y="${insetY}" width="${innerWidth}" height="${innerHeight}" rx="${Math.max(8, Math.round(Math.min(width, height) * 0.03))}" fill="${inner}"/></svg>`;
    maskBytes = await sharp(Buffer.from(svg)).png().toBuffer();
  }
  const sourceArray = new Uint8Array(sourceBytes.length);
  sourceArray.set(sourceBytes);
  const maskArray = new Uint8Array(maskBytes.length);
  maskArray.set(maskBytes);
  return {
    source: new Blob([sourceArray], { type: 'image/png' }),
    mask: new Blob([maskArray], { type: 'image/png' }),
  };
}

function appendScalarSettings(form: FormData, item: QualificationCase): void {
  const settings: Record<string, string | number | boolean> = {
    canvasProjectId: `qualification-${item.id}`,
    operationMode: item.operationMode,
    generationRegionX: item.generationX ?? 0,
    generationRegionY: item.generationY ?? 0,
    generationRegionWidth: item.generationWidth ?? item.width,
    generationRegionHeight: item.generationHeight ?? item.height,
    submissionRegionX: item.submissionX ?? item.generationX ?? 0,
    submissionRegionY: item.submissionY ?? item.generationY ?? 0,
    submissionRegionWidth: item.submissionWidth ?? item.width,
    submissionRegionHeight: item.submissionHeight ?? item.height,
    modelFamily: item.modelFamily,
    modelSource: item.modelSource,
    prompt: item.prompt,
    negativePrompt: item.negativePrompt || '',
    checkpointName: item.checkpointName,
    clipSkip: item.clipSkip ?? 1,
    seed: item.seed ?? 1,
    steps: item.steps ?? 20,
    cfg: item.cfg ?? 4,
    samplerName: item.samplerName || 'euler',
    scheduler: item.scheduler || 'normal',
    denoise: item.denoise ?? 0.8,
    samples: item.samples ?? 1,
    width: item.width,
    height: item.height,
    maskGrow: item.maskGrow ?? QUALIFICATION_DEFAULT_MASK_GROW,
    maskFeather: item.maskFeather ?? QUALIFICATION_DEFAULT_MASK_FEATHER,
    canvasMaskGrow: item.maskGrow ?? QUALIFICATION_DEFAULT_MASK_GROW,
    canvasMaskFeather: item.maskFeather ?? QUALIFICATION_DEFAULT_MASK_FEATHER,
    contextPadding: item.contextPadding ?? 0,
    processingScaleMode: item.processingScaleMode || 'none',
    processingWidth: item.processingWidth ?? item.width,
    processingHeight: item.processingHeight ?? item.height,
    coherenceMode: item.coherenceMode || 'none',
    coherenceEdgeSize: item.coherenceEdgeSize ?? 16,
    coherenceMinimumDenoise: item.coherenceMinimumDenoise ?? 0,
    fillMode: item.fillMode || 'neutral',
    infillColor: item.infillColor || '#7f7f7f',
    infillTileSize: item.infillTileSize ?? 32,
    inpaintModelName: item.inpaintModelName || '',
    seamlessX: item.seamlessX === true,
    seamlessY: item.seamlessY === true,
    outputOnlyMaskedRegions: item.outputOnlyMaskedRegions === true,
    colorMatch: item.colorMatch ?? 0,
    differentialStrength: item.differentialStrength ?? 1,
  };
  for (const [key, value] of Object.entries(settings)) form.append(key, String(value));
}

export async function buildForm(manifest: QualificationManifest, item: QualificationCase): Promise<FormData> {
  const sourcePath = resolve(item.sourceImage || manifest.sourceImage);
  const requestedMaskPath = String(item.maskImage || manifest.maskImage || '').trim();
  const maskPath = requestedMaskPath ? resolve(requestedMaskPath) : '';
  const fixtures = await preparePrimaryFixtures(sourcePath, maskPath, item.width, item.height, item.fixtureMode);
  const form = new FormData();
  form.append('source', fixtures.source, 'qualification-source.png');
  form.append('mask', fixtures.mask, 'qualification-mask.png');
  appendScalarSettings(form, item);

  const regions = item.regionalGuidance || [];
  form.append('regionalGuidance', JSON.stringify(regions.map((region) => ({
    id: region.id,
    name: region.name || region.id,
    positivePrompt: region.positivePrompt || '',
    negativePrompt: region.negativePrompt || '',
    autoNegative: region.autoNegative === true,
    weight: region.weight ?? 1,
    beginStepPercent: region.beginStepPercent ?? 0,
    endStepPercent: region.endStepPercent ?? 1,
  }))));
  for (const region of regions) {
    const regionalMask = region.maskPath ? await requireFile(region.maskPath) : fixtures.mask;
    const regionalMaskName = region.maskPath
      ? imageName(region.maskPath, region.id)
      : `${region.id || 'region'}-qualification-mask.png`;
    form.append(`regionalMask:${region.id}`, regionalMask, regionalMaskName);
  }

  const controls = item.controlLayers || [];
  form.append('controlLayers', JSON.stringify(controls.map((control) => ({
    id: control.id,
    name: control.name || control.id,
    adapterType: control.adapterType || 'controlnet',
    controlMode: control.controlMode || 'balanced',
    controlType: control.controlType || 'raw',
    modelName: control.modelName,
    weight: control.weight ?? 1,
    beginStepPercent: control.beginStepPercent ?? 0,
    endStepPercent: control.endStepPercent ?? 1,
    processorResolution: control.processorResolution ?? 512,
    lowThreshold: control.lowThreshold ?? 100,
    highThreshold: control.highThreshold ?? 200,
    detectBody: control.detectBody !== false,
    detectFace: control.detectFace !== false,
    detectHands: control.detectHands !== false,
    maxFaces: control.maxFaces ?? 10,
    minimumConfidence: control.minimumConfidence ?? 0.5,
    scoreThreshold: control.scoreThreshold ?? 0.1,
    distanceThreshold: control.distanceThreshold ?? 0.1,
    normalStrength: control.normalStrength ?? Math.PI * 2,
    backgroundThreshold: control.backgroundThreshold ?? 0.1,
    safeMode: control.safeMode !== false,
    processorSeed: control.processorSeed ?? 0,
  }))));
  for (const control of controls) form.append(`controlImage:${control.id}`, await requireFile(control.imagePath), imageName(control.imagePath, control.id));

  const references = item.referenceLayers || [];
  form.append('referenceLayers', JSON.stringify(references.map((reference) => ({
    id: reference.id,
    name: reference.name || reference.id,
    method: reference.method,
    modelName: reference.modelName || '',
    visionModelName: reference.visionModelName || '',
    crop: reference.crop || 'center',
    strengthType: reference.strengthType || 'multiply',
    weight: reference.weight ?? 1,
    beginStepPercent: reference.beginStepPercent ?? 0,
    endStepPercent: reference.endStepPercent ?? 1,
    ipAdapterWeightType: reference.ipAdapterWeightType || 'linear',
    ipAdapterCombineEmbeds: reference.ipAdapterCombineEmbeds || 'concat',
    ipAdapterEmbedsScaling: reference.ipAdapterEmbedsScaling || 'V only',
    hasMask: !!reference.maskPath,
  }))));
  for (const reference of references) {
    form.append(`referenceImage:${reference.id}`, await requireFile(reference.imagePath), imageName(reference.imagePath, reference.id));
    if (reference.maskPath) form.append(`referenceMask:${reference.id}`, await requireFile(reference.maskPath), imageName(reference.maskPath, `${reference.id}-mask`));
  }
  return form;
}

function readinessWarnings(pipeline: any): string[] {
  const warnings: string[] = [];
  const readiness = pipeline?.readiness;
  if (!readiness) return ['Pipeline readiness was not reported.'];
  if (readiness.graph?.status !== 'valid') warnings.push(...(readiness.graph?.issues || ['Pipeline graph is not validated.']));
  if (readiness.runtime?.comfyUi !== 'online') warnings.push(`ComfyUI is ${readiness.runtime?.comfyUi || 'unknown'}.`);
  if (readiness.runtime?.nodes?.status !== 'ready') warnings.push(`Missing or unverified nodes: ${(readiness.runtime?.nodes?.missing || []).join(', ') || 'unknown'}`);
  if (readiness.runtime?.resources?.status === 'missing') warnings.push(`Missing resources: ${(readiness.runtime?.resources?.requiredMissing || []).join(', ') || 'unknown'}`);
  return warnings;
}

export function requiredPromptNodeClasses(item: QualificationCase, adapter: string, modelFamily: string): string[] {
  const required = new Set(['LoadImage', 'LoadImageMask', 'ImageCompositeMasked', 'UmbraLabSaveImage']);
  if (adapter === 'classic_conditioning' || adapter === 'flux_fill') required.add('InpaintModelConditioning');
  if (adapter === 'flux_fill') required.add('DifferentialDiffusion');
  if (adapter === 'qwen_image_controlnet') {
    required.add('ControlNetLoader');
    required.add('ControlNetInpaintingAliMamaApply');
    required.add('SetLatentNoiseMask');
  }
  if ((item.regionalGuidance?.length || 0) > 0) {
    required.add('ConditioningSetMask');
    const hasRestrictedStepRange = item.regionalGuidance?.some((region) => {
      const begin = Number(region.beginStepPercent ?? 0);
      const end = Number(region.endStepPercent ?? 1);
      return (Number.isFinite(begin) ? begin : 0) > 0.0001
        || (Number.isFinite(end) ? end : 1) < 0.9999;
    });
    if (hasRestrictedStepRange) required.add('ConditioningSetTimestepRange');
    required.add('ConditioningCombine');
    if (item.regionalGuidance?.some((region) => region.autoNegative === true)) required.add('InvertMask');
    if (adapter === 'flux_fill') required.add('CLIPTextEncodeFlux');
    if (adapter === 'native_edit' && /flux\.?2/i.test(modelFamily)) required.add('FluxGuidance');
  }
  for (const control of item.controlLayers || []) {
    if (control.adapterType === 'anima_lllite') required.add('AnimaLLLiteApply');
    else if (control.adapterType === 'z_image_control') {
      required.add('ModelPatchLoader');
      required.add('ZImageFunControlnet');
    } else {
      required.add('ControlNetLoader');
      required.add('ControlNetApplyAdvanced');
    }
  }
  for (const reference of item.referenceLayers || []) {
    if (reference.method === 'hidream_o1_reference') required.add('HiDreamO1ReferenceImages');
    else if (reference.method === 'qwen_image_reference') required.add('TextEncodeQwenImageEditPlus');
    else if (reference.method === 'flux_kontext' || reference.method === 'flux2_reference') required.add('ReferenceLatent');
    else if (reference.method === 'flux_redux' || reference.method === 'style_model') required.add('StyleModelApply');
    else if (reference.method === 'ip_adapter') required.add('IPAdapterAdvanced');
  }
  return Array.from(required).sort();
}

async function pollJob(baseUrl: string, jobId: string, pollIntervalMs: number, timeoutMs: number): Promise<any> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const payload = await fetchJson(apiUrl(baseUrl, `/api/umbra-ui/inpaint/jobs/${encodeURIComponent(jobId)}`), { cache: 'no-store' });
    if (TERMINAL_STATUSES.has(String(payload.job?.status || ''))) return payload.job;
    await Bun.sleep(pollIntervalMs);
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)} seconds waiting for job ${jobId}.`);
}

function outputPath(output: any): string {
  const fullpath = String(output?.fullpath || '').trim();
  if (fullpath) return fullpath;
  return ['Tools/ComfyUI/output', String(output?.subfolder || '').trim(), String(output?.filename || '').trim()].filter(Boolean).join('/');
}

async function verifyOutput(
  baseUrl: string,
  output: any,
  expected: UmbraUiInpaintMetadataExpectation,
): Promise<QualificationReportCase['outputChecks'][number]> {
  const path = outputPath(output);
  let mediaReachable = false;
  let metadataReachable = false;
  let workflowEmbedded = false;
  let inpaintMetadataValid = false;
  let metadataIssues: string[] = [];
  try {
    const response = await fetch(apiUrl(baseUrl, `/api/fs/image?${new URLSearchParams({ path })}`), { headers: { Range: 'bytes=0-0' } });
    mediaReachable = response.ok;
    await response.body?.cancel();
  } catch { /* reported below */ }
  try {
    const response = await fetch(apiUrl(baseUrl, `/api/fs/metadata?${new URLSearchParams({ path })}`), { cache: 'no-store' });
    metadataReachable = response.ok;
    const metadata = await response.json().catch(() => null);
    if (metadataReachable) {
      const validation = validateUmbraUiInpaintOutputMetadata(metadata, expected);
      workflowEmbedded = validation.workflowEmbedded;
      inpaintMetadataValid = validation.inpaintMetadataValid;
      metadataIssues = validation.metadataIssues;
    } else {
      metadataIssues = [`Metadata endpoint returned HTTP ${response.status}.`];
    }
  } catch (error) {
    metadataIssues = [`Metadata verification failed: ${error instanceof Error ? error.message : String(error)}`];
  }
  return {
    path,
    mediaReachable,
    metadataReachable,
    workflowEmbedded,
    inpaintMetadataValid,
    metadataIssues,
  };
}

async function writeReport(path: string, report: unknown): Promise<void> {
  const absolutePath = resolve(path);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, absolutePath);
}

export async function runUmbraUiInpaintQualification(): Promise<void> {
const manifestArgument = readArg('--manifest');
if (!manifestArgument) throw new Error('Usage: bun run qualify:umbra-ui-inpaint -- --manifest <qualification.json> [--case <id>|--all] [--offline-dry-run|--dry-run|--preflight-only]');
const manifestPath = resolve(manifestArgument);
const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as QualificationManifest;
const baseUrl = String(manifest.baseUrl || 'http://127.0.0.1:8212').replace(/\/+$/, '');
if (!isLoopbackUrl(baseUrl)) throw new Error('The qualification runner only connects to a loopback Umbra server.');
if (!Array.isArray(manifest.cases) || manifest.cases.length <= 0) throw new Error('The qualification manifest has no cases.');
const selectedCaseId = readArg('--case');
const runAll = process.argv.includes('--all');
const dryRun = process.argv.includes('--dry-run');
const offlineDryRun = process.argv.includes('--offline-dry-run');
const preflightOnly = process.argv.includes('--preflight-only');
if ([dryRun, offlineDryRun, preflightOnly].filter(Boolean).length > 1) {
  throw new Error('Choose only one of --offline-dry-run, --dry-run, or --preflight-only.');
}
if (!selectedCaseId && !runAll) {
  throw new Error('Choose one provider with --case <id>, or pass --all explicitly to run every enabled case.');
}
const cases = manifest.cases.filter((item) => item.enabled !== false && (!selectedCaseId || item.id === selectedCaseId));
if (cases.length <= 0) throw new Error(selectedCaseId ? `Qualification case was not found: ${selectedCaseId}` : 'No qualification cases are enabled.');

const preflight = await preflightUmbraUiInpaintQualification(manifest, {
  projectRoot: process.cwd(),
  caseIds: cases.map((item) => item.id),
});
for (const issue of preflight.issues) process.stderr.write(`${formatUmbraUiInpaintPreflightIssue(issue)}\n`);
if (!preflight.ok) {
  throw new Error(`Offline qualification preflight failed with ${preflight.issues.length} issue(s).`);
}
process.stdout.write(`Preflight: ${preflight.checks.length} fixture/model checks passed for ${preflight.checkedCaseIds.join(', ')}.\n`);
if (preflightOnly) process.exit(0);

if (!offlineDryRun) await fetchJson(apiUrl(baseUrl, '/api/umbra-ui/pipelines'), { cache: 'no-store' });
const reportCases: QualificationReportCase[] = [];
for (const item of cases) {
  const startedAt = new Date().toISOString();
  const reportCase: QualificationReportCase = {
    id: item.id,
    label: item.label || item.id,
    status: 'failed',
    startedAt,
    finishedAt: startedAt,
    pipelineId: '',
    modelFamily: item.modelFamily,
    modelSource: item.modelSource,
    operationMode: item.operationMode,
    outputChecks: [],
    warnings: [],
    error: '',
  };
  try {
    if (offlineDryRun) {
      await buildForm(manifest, item);
      reportCase.pipelineId = String(item.expectedWorkflowId || '');
      reportCase.warnings = [
        'Offline request construction passed. Locked pipeline resolution and inference were not contacted.',
      ];
      reportCase.status = 'validated';
      reportCase.finishedAt = new Date().toISOString();
      reportCases.push(reportCase);
      process.stdout.write(`VALIDATED ${reportCase.id}\n`);
      continue;
    }
    const resolved = await fetchJson(apiUrl(baseUrl, `/api/umbra-ui/pipelines/resolve?${new URLSearchParams({
      feature: 'inpainting',
      modelFamily: item.modelFamily,
      modelSource: item.modelSource,
    })}`), { cache: 'no-store' });
    reportCase.pipelineId = String(resolved.item?.id || '');
    reportCase.warnings = readinessWarnings(resolved.pipeline);
    if (item.expectedWorkflowId && reportCase.pipelineId !== item.expectedWorkflowId) {
      throw new Error(`Resolved ${reportCase.pipelineId || '(none)'} instead of expected workflow ${item.expectedWorkflowId}.`);
    }
    if (item.expectedAdapter && String(resolved.pipeline?.inpaintAdapter || '') !== item.expectedAdapter) {
      throw new Error(`Resolved ${String(resolved.pipeline?.inpaintAdapter || '(none)')} instead of expected inpaint adapter ${item.expectedAdapter}.`);
    }
    if (resolved.pipeline?.readiness?.graph?.status === 'invalid') throw new Error(reportCase.warnings.join(' '));
    if (dryRun) {
      await buildForm(manifest, item);
      reportCase.status = 'validated';
    } else {
      const submitted = await fetchJson(apiUrl(baseUrl, '/api/umbra-ui/inpaint'), { method: 'POST', body: await buildForm(manifest, item) });
      const job = await pollJob(baseUrl, String(submitted.job?.id || ''), Math.max(250, manifest.pollIntervalMs || 1000), Math.max(10_000, manifest.timeoutMs || 30 * 60_000));
      reportCase.job = job;
      const jobItems = Array.isArray(job.items) ? job.items : [];
      const outputEntries = jobItems.flatMap((entry: any) => (
        (Array.isArray(entry.outputs) ? entry.outputs : []).map((output: any) => ({ entry, output }))
      ));
      const outputs = outputEntries.map(({ output }: any) => output);
      if (job.status !== 'completed' || outputs.length <= 0) throw new Error(`Job ended as ${job.status} with ${outputs.length} outputs.`);
      if (jobItems.some((entry: any) => entry.status === 'completed' && (!Array.isArray(entry.outputs) || entry.outputs.length <= 0))) {
        throw new Error('At least one completed sample did not report an output image.');
      }
      const baseMetadataExpectation: Omit<UmbraUiInpaintMetadataExpectation, 'seed'> = {
        canvasProjectId: `qualification-${item.id}`,
        operationMode: item.operationMode,
        workflowId: reportCase.pipelineId,
        modelFamily: String(resolved.pipeline?.modelFamily || item.modelFamily),
        modelSource: item.modelSource,
        inpaintAdapter: String(resolved.pipeline?.inpaintAdapter || ''),
        adapterModelName: String(resolved.pipeline?.defaults?.adapterModelName || ''),
        checkpointName: item.checkpointName,
        prompt: item.prompt,
        negativePrompt: item.negativePrompt || '',
        steps: item.steps ?? 20,
        cfg: item.cfg ?? 4,
        clipSkip: item.clipSkip ?? 1,
        samplerName: item.samplerName || 'euler',
        scheduler: item.scheduler || 'normal',
        denoise: item.denoise ?? 0.8,
        samples: item.samples ?? 1,
        maskGrow: item.maskGrow ?? QUALIFICATION_DEFAULT_MASK_GROW,
        maskFeather: item.maskFeather ?? QUALIFICATION_DEFAULT_MASK_FEATHER,
        canvasMaskGrow: item.maskGrow ?? QUALIFICATION_DEFAULT_MASK_GROW,
        canvasMaskFeather: item.maskFeather ?? QUALIFICATION_DEFAULT_MASK_FEATHER,
        contextPadding: item.contextPadding ?? 0,
        processingScaleMode: item.processingScaleMode || 'none',
        processingWidth: item.processingWidth ?? item.width,
        processingHeight: item.processingHeight ?? item.height,
        coherenceMode: item.coherenceMode || 'none',
        coherenceEdgeSize: item.coherenceEdgeSize ?? 16,
        coherenceMinimumDenoise: item.coherenceMinimumDenoise ?? 0,
        fillMode: item.fillMode || 'neutral',
        infillColor: item.infillColor || '#7f7f7f',
        infillTileSize: item.infillTileSize ?? 32,
        inpaintModelName: item.inpaintModelName || '',
        seamlessX: item.seamlessX === true,
        seamlessY: item.seamlessY === true,
        outputOnlyMaskedRegions: item.outputOnlyMaskedRegions === true,
        colorMatch: item.colorMatch ?? 0,
        differentialStrength: item.differentialStrength ?? 1,
        regionalGuidanceIds: (item.regionalGuidance || []).map((entry) => entry.id),
        controlLayerIds: (item.controlLayers || []).map((entry) => entry.id),
        referenceLayerIds: (item.referenceLayers || []).map((entry) => entry.id),
        regionalGuidance: (item.regionalGuidance || []).map((entry) => ({
          id: entry.id,
          name: entry.name || entry.id,
          positivePrompt: entry.positivePrompt || '',
          negativePrompt: entry.negativePrompt || '',
          autoNegative: entry.autoNegative === true,
          weight: entry.weight ?? 1,
          beginStepPercent: entry.beginStepPercent ?? 0,
          endStepPercent: entry.endStepPercent ?? 1,
        })),
        controlLayers: (item.controlLayers || []).map((entry) => ({
          id: entry.id,
          name: entry.name || entry.id,
          adapterType: entry.adapterType || 'controlnet',
          controlMode: entry.controlMode || 'balanced',
          controlType: entry.controlType || 'raw',
          modelName: entry.modelName,
          weight: entry.weight ?? 1,
          beginStepPercent: entry.beginStepPercent ?? 0,
          endStepPercent: entry.endStepPercent ?? 1,
          processorResolution: entry.processorResolution ?? 512,
          lowThreshold: entry.lowThreshold ?? 100,
          highThreshold: entry.highThreshold ?? 200,
          detectBody: entry.detectBody !== false,
          detectFace: entry.detectFace !== false,
          detectHands: entry.detectHands !== false,
          maxFaces: entry.maxFaces ?? 10,
          minimumConfidence: entry.minimumConfidence ?? 0.5,
          scoreThreshold: entry.scoreThreshold ?? 0.1,
          distanceThreshold: entry.distanceThreshold ?? 0.1,
          normalStrength: entry.normalStrength ?? Math.PI * 2,
          backgroundThreshold: entry.backgroundThreshold ?? 0.1,
          safeMode: entry.safeMode !== false,
          processorSeed: entry.processorSeed ?? 0,
        })),
        referenceLayers: (item.referenceLayers || []).map((entry) => ({
          id: entry.id,
          name: entry.name || entry.id,
          method: entry.method,
          modelName: entry.modelName || '',
          visionModelName: entry.visionModelName || '',
          crop: entry.crop || 'center',
          strengthType: entry.strengthType || 'multiply',
          weight: entry.weight ?? 1,
          beginStepPercent: entry.beginStepPercent ?? 0,
          endStepPercent: entry.endStepPercent ?? 1,
          ipAdapterWeightType: entry.ipAdapterWeightType || 'linear',
          ipAdapterCombineEmbeds: entry.ipAdapterCombineEmbeds || 'concat',
          ipAdapterEmbedsScaling: entry.ipAdapterEmbedsScaling || 'V only',
          hasInfluenceMask: !!entry.maskPath,
        })),
        requiredPromptNodeClasses: requiredPromptNodeClasses(
          item,
          String(resolved.pipeline?.inpaintAdapter || ''),
          String(resolved.pipeline?.modelFamily || item.modelFamily),
        ),
        generationX: item.generationX ?? 0,
        generationY: item.generationY ?? 0,
        generationWidth: item.generationWidth ?? item.width,
        generationHeight: item.generationHeight ?? item.height,
        submissionX: item.submissionX ?? item.generationX ?? 0,
        submissionY: item.submissionY ?? item.generationY ?? 0,
        submissionWidth: item.submissionWidth ?? item.width,
        submissionHeight: item.submissionHeight ?? item.height,
        width: item.width,
        height: item.height,
      };
      reportCase.outputChecks = await Promise.all(outputEntries.map(({ entry, output }: any) => verifyOutput(baseUrl, output, {
        ...baseMetadataExpectation,
        seed: Number(entry.seed),
      })));
      const invalidOutputs = reportCase.outputChecks.filter((check) => (
        !check.mediaReachable
        || !check.metadataReachable
        || !check.workflowEmbedded
        || !check.inpaintMetadataValid
      ));
      if (invalidOutputs.length > 0) {
        const issues = Array.from(new Set(invalidOutputs.flatMap((check) => check.metadataIssues)));
        throw new Error(`One or more outputs failed recovery verification.${issues.length > 0 ? ` ${issues.join(' ')}` : ''}`);
      }
      reportCase.status = 'passed';
    }
  } catch (error) {
    reportCase.error = error instanceof Error ? error.message : String(error);
  }
  reportCase.finishedAt = new Date().toISOString();
  reportCases.push(reportCase);
  const summary = `${reportCase.status.toUpperCase()} ${reportCase.id}${reportCase.error ? `: ${reportCase.error}` : ''}`;
  process.stdout.write(`${summary}\n`);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = manifest.reportPath || `User/UmbraUI/QualificationReports/inpaint-${timestamp}.json`;
await writeReport(reportPath, {
  schemaVersion: 2,
  manifestPath,
  baseUrl,
  dryRun,
  offlineDryRun,
  startedAt: reportCases[0]?.startedAt || new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  passed: reportCases.filter((item) => item.status === 'passed' || item.status === 'validated').length,
  failed: reportCases.filter((item) => item.status === 'failed').length,
  cases: reportCases,
});
process.stdout.write(`Report: ${resolve(reportPath)}\n`);
if (reportCases.some((item) => item.status === 'failed')) process.exitCode = 1;
}

if (import.meta.main) await runUmbraUiInpaintQualification();
