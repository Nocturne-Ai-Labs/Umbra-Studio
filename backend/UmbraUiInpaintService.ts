import { closeSync, fsyncSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'fs';
import { mkdir, open, rename, rm } from 'fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'path';
import {
  normalizeUmbraUiModelFamilyKey,
  type UmbraUiInpaintAdapter,
  type UmbraUiInpaintControlAdapterType,
  type UmbraUiInpaintControlMode,
  type UmbraUiInpaintReferenceMethod,
  type UmbraUiIpAdapterCombineEmbeds,
  type UmbraUiIpAdapterEmbedsScaling,
  type UmbraUiIpAdapterWeightType,
  type UmbraUiPipelineModelSource,
} from '../shared/umbra-ui/pipelineTypes';
import {
  getUmbraUiInpaintPrimaryModelIssue,
  inferUmbraUiClassicModelArchitecture,
  inferUmbraUiIpAdapterArchitecture,
} from '../shared/umbra-ui/inpaintModelCompatibility';
import {
  resolveUmbraUiInpaintRegionalConditioningContractForAdapter,
} from './UmbraUiPipelineCapabilities';

const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const JOB_RETENTION_MS = 6 * 60 * 60 * 1000;
const HISTORY_TIMEOUT_MS = 6 * 60 * 60 * 1000;
const HISTORY_POLL_INTERVAL_MS = 800;
const QUEUE_CHECK_INTERVAL_MS = 2_400;
const ORPHANED_PROMPT_GRACE_MS = 15_000;
const MAX_SOURCE_BYTES = 256 * 1024 * 1024;
const MAX_GENERATION_PIXELS = 64 * 1024 * 1024;

function finiteNumberOrFallback(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

export function readComfyNodeInputChoices(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const descriptor = input[1] && typeof input[1] === 'object'
    ? input[1] as Record<string, unknown>
    : null;
  const choices = Array.isArray(input[0])
    ? input[0]
    : input[0] === 'COMBO' && Array.isArray(descriptor?.options)
    ? descriptor.options
    : [];
  return choices
    .map((value: unknown) => String(value || '').trim().replace(/\\/g, '/'))
    .filter(Boolean);
}

export function toComfyNodeInputChoice(value: unknown): string {
  return String(value || '').trim().replace(/[\\/]+/g, sep);
}

const CONTROL_PREPROCESSOR_NODES: Record<string, string> = {
  canny: 'CannyEdgePreprocessor',
  depth: 'DepthAnythingV2Preprocessor',
  pose: 'DWPreprocessor',
  lineart: 'LineArtPreprocessor',
  lineart_anime: 'AnimeLineArtPreprocessor',
  softedge: 'HEDPreprocessor',
  scribble: 'FakeScribblePreprocessor',
  face_mesh: 'MediaPipe-FaceMeshPreprocessor',
  mlsd: 'M-LSDPreprocessor',
  normal_map: 'MiDaS-NormalMapPreprocessor',
  pidi: 'PiDiNetPreprocessor',
  content_shuffle: 'ShufflePreprocessor',
};
const NATIVE_REFERENCE_METHODS = new Set<UmbraUiInpaintReferenceMethod>([
  'ip_adapter',
  'flux_redux',
  'flux_kontext',
  'flux2_reference',
  'qwen_image_reference',
  'hidream_o1_reference',
]);
const CLASSIC_REFERENCE_METHODS = new Set<UmbraUiInpaintReferenceMethod>([
  'style_model',
  'ip_adapter',
]);
const IP_ADAPTER_WEIGHT_TYPES = new Set<UmbraUiIpAdapterWeightType>([
  'linear',
  'ease in',
  'ease out',
  'ease in-out',
  'reverse in-out',
  'weak input',
  'weak output',
  'weak middle',
  'strong middle',
  'style transfer',
  'composition',
  'strong style transfer',
  'style and composition',
  'style transfer precise',
  'composition precise',
]);
const IP_ADAPTER_COMBINE_MODES = new Set<UmbraUiIpAdapterCombineEmbeds>([
  'concat',
  'add',
  'subtract',
  'average',
  'norm average',
]);
const IP_ADAPTER_SCALING_MODES = new Set<UmbraUiIpAdapterEmbedsScaling>([
  'V only',
  'K+V',
  'K+V w/ C penalty',
  'K+mean(V) w/ C penalty',
]);

function validateClassicIpAdapterArchitecture(
  reference: Pick<UmbraUiInpaintReferenceLayer, 'name' | 'modelName'>,
  settings: Pick<UmbraUiInpaintSettings, 'modelFamily' | 'checkpointName'>,
): void {
  const adapterArchitecture = inferUmbraUiIpAdapterArchitecture(reference.modelName);
  if (adapterArchitecture === 'unknown') {
    throw new Error(
      `${reference.name || 'Reference layer'} uses an IP Adapter whose SD architecture cannot be verified from its filename. `
      + 'Choose weights whose filename declares SD15 or SDXL.',
    );
  }
  const modelArchitecture = inferUmbraUiClassicModelArchitecture(settings.modelFamily, settings.checkpointName);
  if (modelArchitecture === 'unknown') {
    throw new Error(
      `Umbra cannot verify whether ${settings.checkpointName || settings.modelFamily || 'the selected checkpoint'} is SD 1.5 or SDXL. `
      + 'Choose an explicit compatible model pipeline before using IP Adapter.',
    );
  }
  if (adapterArchitecture !== modelArchitecture) {
    throw new Error(
      `${reference.name || 'Reference layer'} uses ${adapterArchitecture === 'sdxl' ? 'SDXL' : 'SD 1.5'} IP Adapter weights, `
      + `but the selected model pipeline is ${modelArchitecture === 'sdxl' ? 'SDXL' : 'SD 1.5'}.`,
    );
  }
}

export type UmbraUiInpaintItemStatus = 'staging' | 'queued' | 'running' | 'completed' | 'failed' | 'canceled';
export type UmbraUiInpaintJobStatus = 'staging' | 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'canceled';
export type UmbraUiInpaintFillMode = 'neutral' | 'telea' | 'navier-stokes' | 'color' | 'tile' | 'lama';

export interface UmbraUiInpaintSource {
  name: string;
  read: () => Promise<ArrayBuffer | Uint8Array>;
}

export interface UmbraUiInpaintRegionalGuidance {
  id: string;
  name: string;
  mask: UmbraUiInpaintSource;
  positivePrompt: string;
  negativePrompt: string;
  autoNegative: boolean;
  weight: number;
  beginStepPercent: number;
  endStepPercent: number;
}

export interface UmbraUiInpaintControlLayer {
  id: string;
  name: string;
  image: UmbraUiInpaintSource;
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

export interface UmbraUiControlPreprocessorSettings {
  controlType: UmbraUiInpaintControlLayer['controlType'];
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
  bytes: Uint8Array;
  contentType: string;
  output: UmbraUiInpaintOutput;
}

export interface UmbraUiLayerUpscaleSettings {
  modelName: string;
  maxDimension: number;
}

export interface UmbraUiLayerUpscaleResult {
  bytes: Uint8Array;
  contentType: string;
  output: UmbraUiInpaintOutput;
}

export interface UmbraUiBackgroundRemovalSettings {
  model?: string;
}

export interface UmbraUiBackgroundRemovalResult {
  bytes: Uint8Array;
  contentType: string;
  output: UmbraUiInpaintOutput;
}

export interface UmbraUiInpaintReferenceLayer {
  id: string;
  name: string;
  image: UmbraUiInpaintSource;
  mask?: UmbraUiInpaintSource;
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

export interface UmbraUiInpaintSettings {
  workflowId: string;
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
  modelFamily: string;
  modelSource: UmbraUiPipelineModelSource;
  inpaintAdapter: UmbraUiInpaintAdapter;
  adapterModelName: string;
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
  regionalGuidance: UmbraUiInpaintRegionalGuidance[];
  controlLayers: UmbraUiInpaintControlLayer[];
  referenceLayers: UmbraUiInpaintReferenceLayer[];
}

export function validateUmbraUiInpaintLayerProviderContract(
  controlLayers: UmbraUiInpaintControlLayer[],
  referenceLayers: UmbraUiInpaintReferenceLayer[],
  inpaintAdapter: UmbraUiInpaintAdapter = 'classic_conditioning',
  modelFamily = '',
): void {
  const incompatibleShuffle = controlLayers.find((control) => (
    control.controlType === 'content_shuffle' && control.adapterType !== 't2i_adapter'
  ));
  if (incompatibleShuffle) {
    throw new Error(`${incompatibleShuffle.name || 'Control layer'} uses Content Shuffle, which requires a T2I Adapter.`);
  }
  if (inpaintAdapter === 'native_edit') {
    const incompatibleControl = controlLayers.find((control) => (
      control.adapterType !== 'z_image_control'
      || control.controlMode !== 'balanced'
      || Math.abs(control.beginStepPercent) > 0.0001
      || Math.abs(control.endStepPercent - 1) > 0.0001
    ));
    if (incompatibleControl) {
      throw new Error(
        `${incompatibleControl.name || 'Control layer'} requests ${incompatibleControl.adapterType}/${incompatibleControl.controlMode}, `
        + 'but this native model-patch contract only accepts Z-Image Control at its full fixed step range.',
      );
    }
    const incompatibleReference = referenceLayers.find((reference) => !NATIVE_REFERENCE_METHODS.has(reference.method));
    if (incompatibleReference) {
      throw new Error(
        `${incompatibleReference.name || 'Reference layer'} requests ${incompatibleReference.method}, `
        + 'but the native edit contract requires an exact FLUX, Qwen Image, or HiDream-O1 reference provider.',
      );
    }
    if (new Set(referenceLayers.map((reference) => reference.method)).size > 1) {
      throw new Error('A native edit request cannot mix reference methods from different model architectures.');
    }
    return;
  }
  if (inpaintAdapter === 'flux_fill') {
    if (controlLayers.length > 0) {
      throw new Error('The flux_fill inpaint provider does not declare compatible canvas control layers.');
    }
    const incompatibleReference = referenceLayers.find((reference) => reference.method !== 'flux_redux');
    if (incompatibleReference) {
      throw new Error(
        `${incompatibleReference.name || 'Reference layer'} requests ${incompatibleReference.method}, `
        + 'but the FLUX Fill contract only accepts FLUX Redux references.',
      );
    }
    return;
  }
  if (inpaintAdapter !== 'classic_conditioning') {
    if (controlLayers.length > 0 || referenceLayers.length > 0) {
      throw new Error(`The ${inpaintAdapter} inpaint provider does not declare compatible canvas control or reference layers.`);
    }
    return;
  }
  const isAnima = normalizeUmbraUiModelFamilyKey(modelFamily) === 'anima';
  const incompatibleLllite = controlLayers.find((control) => control.adapterType === 'anima_lllite' && !isAnima);
  if (incompatibleLllite) {
    throw new Error(`${incompatibleLllite.name || 'Control layer'} requires the Anima model family for Anima LLLite.`);
  }
  const compatibleClassicAdapters = new Set<UmbraUiInpaintControlAdapterType>([
    'controlnet',
    't2i_adapter',
    'control_lora',
    ...(isAnima ? ['anima_lllite' as const] : []),
  ]);
  const incompatibleControl = controlLayers.find((control) => (
    !compatibleClassicAdapters.has(control.adapterType) || control.controlMode !== 'balanced'
  ));
  if (incompatibleControl) {
    throw new Error(
      `${incompatibleControl.name || 'Control layer'} requests ${incompatibleControl.adapterType}/${incompatibleControl.controlMode}, `
      + 'but this graph only declares classic CONTROL_NET-compatible adapters with balanced conditioning.',
    );
  }
  const incompatibleReference = referenceLayers.find((reference) => !CLASSIC_REFERENCE_METHODS.has(reference.method));
  if (incompatibleReference) {
    throw new Error(
      `${incompatibleReference.name || 'Reference layer'} requests ${incompatibleReference.method}, `
      + 'but this inpaint graph only declares classic style-model or IP Adapter references.',
    );
  }
}

interface UploadedRegionalGuidance extends Omit<UmbraUiInpaintRegionalGuidance, 'mask'> {
  maskInputName: string;
}

interface UploadedControlLayer extends Omit<UmbraUiInpaintControlLayer, 'image'> {
  imageInputName: string;
}

interface UploadedReferenceLayer extends Omit<UmbraUiInpaintReferenceLayer, 'image' | 'mask'> {
  imageInputName: string;
  maskInputName?: string;
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

interface UmbraUiInpaintBaseWorkflow {
  promptGraph: Record<string, any>;
}

interface UmbraUiInpaintServiceOptions {
  getComfyBaseUrl: () => string;
  getComfyInputRoot?: () => string;
  jobStatePath?: string;
  historyPollIntervalMs?: number;
  queueCheckIntervalMs?: number;
  orphanedPromptGraceMs?: number;
  atomicReplacementHooks?: {
    forceBackupPath?: boolean;
    afterBackupCreated?: (paths: {
      temporaryPath: string;
      finalPath: string;
      backupPath: string;
    }) => void | Promise<void>;
  };
  buildBaseWorkflow: (settings: UmbraUiInpaintSettings, seed: number) => Promise<UmbraUiInpaintBaseWorkflow>;
}

function collectQueuePromptIds(payload: any): Set<string> {
  const ids = new Set<string>();
  for (const key of ['queue_running', 'queue_pending']) {
    const entries = Array.isArray(payload?.[key]) ? payload[key] : [];
    for (const entry of entries) {
      const id = String(Array.isArray(entry) ? entry[1] : entry?.prompt_id || entry?.promptId || '').trim();
      if (id) ids.add(id);
    }
  }
  return ids;
}

function createId(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

const ATOMIC_BACKUP_MARKER = '.umbra-atomic-backup-';
const LEGACY_ATOMIC_BACKUP_MARKER = '.backup-';

async function writeFileDurably(path: string, data: string): Promise<void> {
  const handle = await open(path, 'w');
  try {
    await handle.writeFile(data, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncFileBestEffort(path: string): Promise<void> {
  const handle = await open(path, 'r').catch(() => null);
  if (!handle) return;
  try {
    await handle.sync().catch(() => undefined);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

async function syncContainingDirectoryBestEffort(path: string): Promise<void> {
  const handle = await open(dirname(path), 'r').catch(() => null);
  if (!handle) return;
  try {
    await handle.sync().catch(() => undefined);
  } finally {
    await handle.close().catch(() => undefined);
  }
}

function syncFileSyncBestEffort(path: string): void {
  let descriptor = -1;
  try {
    descriptor = openSync(path, 'r');
    fsyncSync(descriptor);
  } catch {
    // Best effort on filesystems that do not expose durable file sync.
  } finally {
    if (descriptor >= 0) {
      try { closeSync(descriptor); } catch { /* already closed */ }
    }
  }
}

function isUsableJobLedgerSync(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    const payload = JSON.parse(readFileSync(path, 'utf8'));
    return Boolean(payload && typeof payload === 'object' && Array.isArray(payload.jobs));
  } catch {
    return false;
  }
}

async function replaceFileAtomically(
  temporaryPath: string,
  finalPath: string,
  hooks?: UmbraUiInpaintServiceOptions['atomicReplacementHooks'],
): Promise<void> {
  let initialError: unknown = new Error('The forced atomic replacement fallback could not preserve the current file.');
  if (!hooks?.forceBackupPath) {
    try {
      await rename(temporaryPath, finalPath);
      await syncFileBestEffort(finalPath);
      await syncContainingDirectoryBestEffort(finalPath);
      return;
    } catch (error) {
      initialError = error;
    }
  }
  const backupPath = `${finalPath}${ATOMIC_BACKUP_MARKER}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await rename(finalPath, backupPath);
    await syncFileBestEffort(backupPath);
    await syncContainingDirectoryBestEffort(finalPath);
  } catch {
    throw initialError;
  }
  try {
    await hooks?.afterBackupCreated?.({ temporaryPath, finalPath, backupPath });
    await rename(temporaryPath, finalPath);
  } catch (replacementError) {
    const restored = await rename(backupPath, finalPath).then(() => true).catch(() => false);
    if (restored) {
      await syncFileBestEffort(finalPath);
      await syncContainingDirectoryBestEffort(finalPath);
    }
    throw replacementError;
  }
  await syncFileBestEffort(finalPath);
  await syncContainingDirectoryBestEffort(finalPath);
  await rm(backupPath, { force: true }).catch(() => undefined);
  await syncContainingDirectoryBestEffort(finalPath);
}

function recoverInterruptedAtomicReplacementSync(finalPath: string): void {
  const directory = dirname(finalPath);
  const filename = basename(finalPath);
  let entries: string[] = [];
  try {
    entries = readdirSync(directory);
  } catch {
    return;
  }
  const newBackupPrefix = `${filename}${ATOMIC_BACKUP_MARKER}`;
  const legacyBackupPrefix = `${filename}${LEGACY_ATOMIC_BACKUP_MARKER}`;
  const backups = entries
    .filter((entry) => {
      if (entry.startsWith(newBackupPrefix)) return /^\d+-[a-z0-9]{4,12}$/i.test(entry.slice(newBackupPrefix.length));
      if (entry.startsWith(legacyBackupPrefix)) return /^(?:\d+-[a-z0-9]{4,12}|interrupted)$/i.test(entry.slice(legacyBackupPrefix.length));
      return false;
    })
    .map((entry) => ({
      name: entry,
      mtimeMs: (() => {
        try { return statSync(join(directory, entry)).mtimeMs; } catch { return 0; }
      })(),
      usable: isUsableJobLedgerSync(join(directory, entry)),
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
  let finalUsable = isUsableJobLedgerSync(finalPath);
  const selected = backups.find((backup) => backup.usable);
  if (!finalUsable && selected) {
    try {
      rmSync(finalPath, { force: true });
      renameSync(join(directory, selected.name), finalPath);
      syncFileSyncBestEffort(finalPath);
      finalUsable = true;
    } catch {
      return;
    }
  }
  if (finalUsable) {
    for (const backup of backups) {
      try { rmSync(join(directory, backup.name), { force: true }); } catch { /* best effort */ }
    }
  }
  for (const entry of entries) {
    if (!entry.startsWith(`${filename}.`) || !entry.endsWith('.tmp')) continue;
    try { rmSync(join(directory, entry), { force: true }); } catch { /* best effort */ }
  }
}

function sanitizeFilename(rawName: unknown, fallback: string): string {
  const normalized = String(rawName || '').trim().replace(/\\/g, '/').split('/').pop() || fallback;
  const extension = extname(normalized).toLowerCase();
  const safeExtension = IMAGE_EXTENSIONS.has(extension) ? extension : '.png';
  const stem = normalized.slice(0, extension ? -extension.length : undefined)
    .replace(/[^a-z0-9._ -]+/gi, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 100) || fallback;
  return `${stem}${safeExtension}`;
}

function readPromptId(payload: any): string {
  return String(payload?.prompt_id ?? payload?.promptId ?? payload?.id ?? '').trim();
}

function readHistoryRecord(payload: any, promptId: string): any | null {
  if (!payload || typeof payload !== 'object') return null;
  return payload[promptId] || payload?.history?.[promptId] || payload?.data?.[promptId] || null;
}

function readExecutionError(record: any): string {
  const messages = Array.isArray(record?.status?.messages) ? record.status.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    if (!Array.isArray(entry) || String(entry[0] || '') !== 'execution_error') continue;
    const detail = entry[1] && typeof entry[1] === 'object' ? entry[1] : {};
    const nodeType = String(detail.node_type || '').trim();
    const message = String(detail.exception_message || detail.error || '').trim();
    return `${nodeType ? `${nodeType}: ` : ''}${message || 'ComfyUI inpaint execution failed.'}`;
  }
  return '';
}

function collectOutputs(record: any): UmbraUiInpaintOutput[] {
  const outputs = record?.outputs;
  if (!outputs || typeof outputs !== 'object') return [];
  const collected: UmbraUiInpaintOutput[] = [];
  for (const nodeOutput of Object.values(outputs as Record<string, unknown>)) {
    if (!nodeOutput || typeof nodeOutput !== 'object') continue;
    for (const key of ['images', 'files']) {
      const items = (nodeOutput as Record<string, unknown>)[key];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const source = item as Record<string, unknown>;
        const filename = String(source.filename || source.name || '').trim();
        const fullpath = String(source.fullpath || source.fullPath || source.path || '').trim();
        if (!filename && !fullpath) continue;
        collected.push({
          filename,
          subfolder: String(source.subfolder || '').trim(),
          type: String(source.type || 'output').trim() || 'output',
          fullpath,
        });
      }
    }
  }
  return collected;
}

function cloneJob(job: UmbraUiInpaintJob): UmbraUiInpaintJob {
  return {
    ...job,
    items: job.items.map((item) => ({
      ...item,
      outputs: item.outputs.map((output) => ({ ...output })),
    })),
  };
}

function isGraphReference(value: unknown, graph: Record<string, any>): value is [string | number, number] {
  return Array.isArray(value)
    && value.length === 2
    && (typeof value[0] === 'string' || typeof value[0] === 'number')
    && Object.prototype.hasOwnProperty.call(graph, String(value[0]));
}

type UmbraUiGraphRef = [string, number];

interface UmbraUiInpaintGraphBindings {
  model: UmbraUiGraphRef;
  clip: UmbraUiGraphRef | null;
  vae: UmbraUiGraphRef;
  positive: UmbraUiGraphRef;
  negative: UmbraUiGraphRef;
}

function normalizeGraphReference(value: unknown, graph: Record<string, any>): UmbraUiGraphRef | null {
  if (!isGraphReference(value, graph)) return null;
  return [String(value[0]), Math.max(0, Math.floor(Number(value[1]) || 0))];
}

function collectDependencyClosure(graph: Record<string, any>, rootIds: string[]): Set<string> {
  const retained = new Set<string>();
  const visit = (nodeId: string) => {
    if (retained.has(nodeId)) return;
    const node = graph[nodeId];
    if (!node || typeof node !== 'object') return;
    retained.add(nodeId);
    for (const value of Object.values(node.inputs || {})) {
      if (isGraphReference(value, graph)) visit(String(value[0]));
    }
  };
  for (const rootId of rootIds) visit(rootId);
  return retained;
}

function findUmbraInpaintBindings(graph: Record<string, any>): UmbraUiInpaintGraphBindings {
  const root = Object.entries(graph).find(([, node]) => String(node?.class_type || '') === 'UmbraPowerPrompter');
  if (root) {
    return {
      model: [root[0], 0],
      clip: [root[0], 1],
      vae: [root[0], 2],
      positive: [root[0], 3],
      negative: [root[0], 4],
    };
  }

  const samplerClasses = new Set(['UmbraKSamplerHiResFix', 'UmbraKSampler', 'UmbraKSamplerNormal', 'KSampler', 'KSamplerAdvanced']);
  const sampler = Object.entries(graph).find(([, node]) => samplerClasses.has(String(node?.class_type || '')));
  if (!sampler) {
    throw new Error('The selected locked pipeline does not expose a sampler binding for inpainting.');
  }
  const samplerInputs = sampler[1]?.inputs || {};
  const model = normalizeGraphReference(samplerInputs.model, graph);
  const positive = normalizeGraphReference(samplerInputs.positive, graph);
  const negative = normalizeGraphReference(samplerInputs.negative, graph);
  let vae = normalizeGraphReference(samplerInputs.vae, graph);
  if (!vae) {
    const decode = Object.values(graph).find((node: any) => {
      if (String(node?.class_type || '') !== 'VAEDecode') return false;
      const samples = normalizeGraphReference(node?.inputs?.samples, graph);
      return samples?.[0] === sampler[0];
    }) as any;
    vae = normalizeGraphReference(decode?.inputs?.vae, graph);
  }
  const loraRoot = Object.entries(graph).find(([, node]) => String(node?.class_type || '') === 'UmbraA1111LoraSyntax');
  const clip = loraRoot
    ? [loraRoot[0], 1] satisfies UmbraUiGraphRef
    : (() => {
      const encoder = Object.values(graph).find((node: any) => (
        String(node?.class_type || '').startsWith('CLIPTextEncode')
        && normalizeGraphReference(node?.inputs?.clip, graph)
      )) as any;
      return normalizeGraphReference(encoder?.inputs?.clip, graph);
    })();
  if (!model || !vae || !positive || !negative) {
    throw new Error('The selected locked pipeline is missing model, VAE, or conditioning bindings required by inpainting.');
  }
  return { model, clip, vae, positive, negative };
}

function createNodeAllocator(graph: Record<string, any>) {
  let nextId = Object.keys(graph).reduce((maximum, key) => {
    const numeric = Number(key);
    return Number.isFinite(numeric) ? Math.max(maximum, Math.floor(numeric)) : maximum;
  }, 0) + 1;
  return (node: any): string => {
    while (Object.prototype.hasOwnProperty.call(graph, String(nextId))) nextId += 1;
    const id = String(nextId);
    nextId += 1;
    graph[id] = node;
    return id;
  };
}

export function appendUmbraUiControlPreprocessorGraph(
  graph: Record<string, any>,
  imageRef: UmbraUiGraphRef,
  settings: UmbraUiControlPreprocessorSettings,
  title = 'Control Preprocessor',
): UmbraUiGraphRef {
  const controlType = settings.controlType;
  if (controlType === 'raw') return imageRef;
  const addNode = createNodeAllocator(graph);
  const resolution = Math.max(64, Math.min(4096, Math.round(finiteNumberOrFallback(settings.processorResolution, 512))));
  const lowThreshold = Math.max(0, Math.min(255, Math.round(finiteNumberOrFallback(settings.lowThreshold, 100))));
  const highThreshold = Math.max(0, Math.min(255, Math.round(finiteNumberOrFallback(settings.highThreshold, 200))));
  let node: Record<string, any>;
  if (controlType === 'canny') {
    node = {
      class_type: 'CannyEdgePreprocessor',
      inputs: {
        image: imageRef,
        low_threshold: Math.min(lowThreshold, highThreshold),
        high_threshold: Math.max(lowThreshold, highThreshold),
        resolution,
      },
    };
  } else if (controlType === 'depth') {
    node = {
      class_type: 'DepthAnythingV2Preprocessor',
      inputs: { image: imageRef, ckpt_name: 'depth_anything_v2_vits.pth', resolution },
    };
  } else if (controlType === 'pose') {
    node = {
      class_type: 'DWPreprocessor',
      inputs: {
        image: imageRef,
        detect_hand: settings.detectHands ? 'enable' : 'disable',
        detect_body: settings.detectBody ? 'enable' : 'disable',
        detect_face: settings.detectFace ? 'enable' : 'disable',
        resolution,
        bbox_detector: 'yolox_l.onnx',
        pose_estimator: 'dw-ll_ucoco_384.onnx',
        scale_stick_for_xinsr_cn: 'disable',
      },
    };
  } else if (controlType === 'lineart' || controlType === 'lineart_anime') {
    node = {
      class_type: controlType === 'lineart' ? 'LineArtPreprocessor' : 'AnimeLineArtPreprocessor',
      inputs: {
        image: imageRef,
        ...(controlType === 'lineart' ? { coarse: 'disable' } : {}),
        resolution,
      },
    };
  } else if (controlType === 'softedge' || controlType === 'scribble') {
    node = {
      class_type: controlType === 'softedge' ? 'HEDPreprocessor' : 'FakeScribblePreprocessor',
      inputs: { image: imageRef, safe: settings.safeMode ? 'enable' : 'disable', resolution },
    };
  } else if (controlType === 'face_mesh') {
    node = {
      class_type: 'MediaPipe-FaceMeshPreprocessor',
      inputs: {
        image: imageRef,
        max_faces: Math.max(1, Math.min(50, Math.round(finiteNumberOrFallback(settings.maxFaces, 10)))),
        min_confidence: Math.max(0.1, Math.min(1, finiteNumberOrFallback(settings.minimumConfidence, 0.5))),
        resolution,
      },
    };
  } else if (controlType === 'mlsd') {
    node = {
      class_type: 'M-LSDPreprocessor',
      inputs: {
        image: imageRef,
        score_threshold: Math.max(0.01, Math.min(2, finiteNumberOrFallback(settings.scoreThreshold, 0.1))),
        dist_threshold: Math.max(0.01, Math.min(20, finiteNumberOrFallback(settings.distanceThreshold, 0.1))),
        resolution,
      },
    };
  } else if (controlType === 'normal_map') {
    node = {
      class_type: 'MiDaS-NormalMapPreprocessor',
      inputs: {
        image: imageRef,
        a: Math.max(0, Math.min(Math.PI * 5, finiteNumberOrFallback(settings.normalStrength, Math.PI * 2))),
        bg_threshold: Math.max(0, Math.min(1, finiteNumberOrFallback(settings.backgroundThreshold, 0.1))),
        resolution,
      },
    };
  } else if (controlType === 'pidi') {
    node = {
      class_type: 'PiDiNetPreprocessor',
      inputs: { image: imageRef, safe: settings.safeMode ? 'enable' : 'disable', resolution },
    };
  } else {
    node = {
      class_type: 'ShufflePreprocessor',
      inputs: {
        image: imageRef,
        resolution,
        seed: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(finiteNumberOrFallback(settings.processorSeed, 0)))),
      },
    };
  }
  const nodeId = addNode({ ...node, _meta: { title } });
  return [nodeId, 0];
}

function randomSeed(): number {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return Number(((BigInt(bytes[0]) << 21n) ^ BigInt(bytes[1])) % BigInt(Number.MAX_SAFE_INTEGER));
}

export class UmbraUiInpaintService {
  private readonly jobs = new Map<string, UmbraUiInpaintJob>();
  private readonly getComfyBaseUrl: () => string;
  private readonly getComfyInputRoot?: () => string;
  private readonly buildBaseWorkflow: UmbraUiInpaintServiceOptions['buildBaseWorkflow'];
  private readonly jobStatePath: string;
  private readonly historyPollIntervalMs: number;
  private readonly queueCheckIntervalMs: number;
  private readonly orphanedPromptGraceMs: number;
  private readonly atomicReplacementHooks?: UmbraUiInpaintServiceOptions['atomicReplacementHooks'];
  private persistQueue = Promise.resolve();
  private nodeTypesCache: { fetchedAt: number; values: Set<string>; objectInfo: Record<string, any> } | null = null;

  constructor(options: UmbraUiInpaintServiceOptions) {
    this.getComfyBaseUrl = options.getComfyBaseUrl;
    this.getComfyInputRoot = options.getComfyInputRoot;
    this.buildBaseWorkflow = options.buildBaseWorkflow;
    this.jobStatePath = String(options.jobStatePath || '').trim();
    this.historyPollIntervalMs = Math.max(1, Math.round(Number(options.historyPollIntervalMs) || HISTORY_POLL_INTERVAL_MS));
    this.queueCheckIntervalMs = Math.max(1, Math.round(Number(options.queueCheckIntervalMs) || QUEUE_CHECK_INTERVAL_MS));
    this.orphanedPromptGraceMs = Math.max(1, Math.round(Number(options.orphanedPromptGraceMs) || ORPHANED_PROMPT_GRACE_MS));
    this.atomicReplacementHooks = options.atomicReplacementHooks;
    if (this.jobStatePath) recoverInterruptedAtomicReplacementSync(this.jobStatePath);
    const hydration = this.hydrateJobs();
    if (hydration.changed) this.persistJobs();
    if (hydration.resumable.length > 0) {
      queueMicrotask(() => {
        for (const [job, items] of hydration.resumable) {
          void this.monitor(job, items).finally(() => this.cleanupStagedInputs(job.id));
        }
      });
    }
  }

  getJob(jobId: string): UmbraUiInpaintJob | null {
    this.prune();
    const job = this.jobs.get(String(jobId || '').trim());
    return job ? cloneJob(job) : null;
  }

  async flushPersistence(): Promise<void> {
    await this.persistQueue;
  }

  listJobs(): UmbraUiInpaintJob[] {
    this.prune();
    return Array.from(this.jobs.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 20)
      .map(cloneJob);
  }

  async preprocessControl(
    image: UmbraUiInpaintSource,
    settings: UmbraUiControlPreprocessorSettings,
  ): Promise<UmbraUiControlPreprocessResult> {
    const requestId = createId('control-preview');
    try {
      const [bytesRaw, nodeTypes] = await Promise.all([image.read(), this.getNodeTypes()]);
      const bytes = bytesRaw instanceof Uint8Array ? bytesRaw : new Uint8Array(bytesRaw);
      if (bytes.byteLength <= 0) throw new Error('The control image is empty.');
      if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('The control image exceeds the 256 MB limit.');
      for (const required of ['LoadImage', 'PreviewImage']) {
        if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required control-preview node: ${required}.`);
      }
      const preprocessorNode = CONTROL_PREPROCESSOR_NODES[settings.controlType];
      if (preprocessorNode && !nodeTypes.has(preprocessorNode)) {
        throw new Error(`The ${settings.controlType} control preprocessor is not installed (${preprocessorNode}).`);
      }
      const imageInputName = await this.uploadInput(requestId, 'control', image.name, bytes);
      const graph: Record<string, any> = {
        '1': {
          class_type: 'LoadImage',
          inputs: { image: imageInputName },
          _meta: { title: 'Umbra Control Source' },
        },
      };
      const processedRef = appendUmbraUiControlPreprocessorGraph(graph, ['1', 0], settings, 'Umbra Control Preprocessor');
      const addNode = createNodeAllocator(graph);
      addNode({
        class_type: 'PreviewImage',
        inputs: { images: processedRef },
        _meta: { title: 'Umbra Control Preview' },
      });
      const queueResponse = await fetch(`${this.getComfyBaseUrl()}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: `umbra-ui-control-preview-${requestId}`,
          prompt: graph,
          extra_data: { extra_pnginfo: { workflow: graph, umbra_control_preprocessor: settings } },
        }),
      });
      if (!queueResponse.ok) {
        const detail = await queueResponse.text().catch(() => '');
        throw new Error(detail || `ComfyUI rejected the control preprocessor (${queueResponse.status}).`);
      }
      const promptId = readPromptId(await queueResponse.json().catch(() => ({})));
      if (!promptId) throw new Error('ComfyUI did not return a control-preprocessor prompt id.');
      const record = await this.waitForPromptRecord(promptId, () => false, 'control preprocessor');
      const executionError = readExecutionError(record);
      const status = String(record?.status?.status_str || '').trim().toLowerCase();
      if (executionError || status === 'error') throw new Error(executionError || 'Control preprocessing failed.');
      const output = collectOutputs(record)[0];
      if (!output) throw new Error('ComfyUI completed control preprocessing without an image output.');
      const params = new URLSearchParams({
        filename: output.filename,
        subfolder: output.subfolder,
        type: output.type || 'temp',
      });
      const outputResponse = await fetch(`${this.getComfyBaseUrl()}/view?${params.toString()}`, { cache: 'no-store' });
      if (!outputResponse.ok) throw new Error(`Unable to load the processed control image (${outputResponse.status}).`);
      const outputBytes = new Uint8Array(await outputResponse.arrayBuffer());
      if (outputBytes.byteLength <= 0 || outputBytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error('The processed control image is empty or exceeds the 256 MB limit.');
      }
      return {
        bytes: outputBytes,
        contentType: String(outputResponse.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png',
        output,
      };
    } finally {
      await this.cleanupStagedInputs(requestId);
    }
  }

  async upscaleLayer(
    image: UmbraUiInpaintSource,
    settings: UmbraUiLayerUpscaleSettings,
  ): Promise<UmbraUiLayerUpscaleResult> {
    const requestId = createId('layer-upscale');
    try {
      const modelName = String(settings.modelName || '').trim().replace(/\\/g, '/');
      if (!modelName) throw new Error('Choose an upscale model.');
      const maxDimension = Math.max(512, Math.min(16384, Math.round(finiteNumberOrFallback(settings.maxDimension, 4096))));
      const [bytesRaw, nodeTypes] = await Promise.all([
        image.read(),
        this.getNodeTypes(),
      ]);
      const availableModels = await this.getNodeInputChoices('UmbraImageUpscale', 'upscale_model');
      const bytes = bytesRaw instanceof Uint8Array ? bytesRaw : new Uint8Array(bytesRaw);
      if (bytes.byteLength <= 0) throw new Error('The layer image is empty.');
      if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('The layer image exceeds the 256 MB limit.');
      for (const required of ['LoadImage', 'UmbraImageUpscale', 'PreviewImage']) {
        if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required layer-upscale node: ${required}.`);
      }
      if (availableModels.length > 0 && !availableModels.includes(modelName)) {
        throw new Error(`The upscale model is not installed: ${modelName}`);
      }
      const imageInputName = await this.uploadInput(requestId, 'layer', image.name, bytes);
      const graph: Record<string, any> = {
        '1': {
          class_type: 'LoadImage',
          inputs: { image: imageInputName },
          _meta: { title: 'Umbra Layer Source' },
        },
        '2': {
          class_type: 'UmbraImageUpscale',
          inputs: {
            image: ['1', 0],
            upscale_model: modelName,
            max_dimension: maxDimension,
            enabled: true,
          },
          _meta: { title: 'Umbra Layer Upscale' },
        },
        '3': {
          class_type: 'PreviewImage',
          inputs: { images: ['2', 0] },
          _meta: { title: 'Umbra Layer Upscale Preview' },
        },
      };
      const queueResponse = await fetch(`${this.getComfyBaseUrl()}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: `umbra-ui-layer-upscale-${requestId}`,
          prompt: graph,
          extra_data: {
            extra_pnginfo: {
              workflow: graph,
              umbra_layer_upscale: { version: 1, modelName, maxDimension },
            },
          },
        }),
      });
      if (!queueResponse.ok) {
        const detail = await queueResponse.text().catch(() => '');
        throw new Error(detail || `ComfyUI rejected the layer upscale (${queueResponse.status}).`);
      }
      const promptId = readPromptId(await queueResponse.json().catch(() => ({})));
      if (!promptId) throw new Error('ComfyUI did not return a layer-upscale prompt id.');
      const record = await this.waitForPromptRecord(promptId, () => false, 'layer upscale');
      const executionError = readExecutionError(record);
      const status = String(record?.status?.status_str || '').trim().toLowerCase();
      if (executionError || status === 'error') throw new Error(executionError || 'Layer upscale failed.');
      const output = collectOutputs(record)[0];
      if (!output) throw new Error('ComfyUI completed the layer upscale without an image output.');
      const params = new URLSearchParams({
        filename: output.filename,
        subfolder: output.subfolder,
        type: output.type || 'temp',
      });
      const outputResponse = await fetch(`${this.getComfyBaseUrl()}/view?${params.toString()}`, { cache: 'no-store' });
      if (!outputResponse.ok) throw new Error(`Unable to load the upscaled layer (${outputResponse.status}).`);
      const outputBytes = new Uint8Array(await outputResponse.arrayBuffer());
      if (outputBytes.byteLength <= 0 || outputBytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error('The upscaled layer is empty or exceeds the 256 MB limit.');
      }
      return {
        bytes: outputBytes,
        contentType: String(outputResponse.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png',
        output,
      };
    } finally {
      await this.cleanupStagedInputs(requestId);
    }
  }

  async removeBackground(
    image: UmbraUiInpaintSource,
    settings: UmbraUiBackgroundRemovalSettings = {},
  ): Promise<UmbraUiBackgroundRemovalResult> {
    const requestId = createId('background-removal');
    try {
      const model = String(settings.model || 'isnet-anime').trim() || 'isnet-anime';
      const [bytesRaw, nodeTypes] = await Promise.all([image.read(), this.getNodeTypes()]);
      const bytes = bytesRaw instanceof Uint8Array ? bytesRaw : new Uint8Array(bytesRaw);
      if (bytes.byteLength <= 0) throw new Error('The image is empty.');
      if (bytes.byteLength > MAX_SOURCE_BYTES) throw new Error('The image exceeds the 256 MB limit.');
      for (const required of ['LoadImage', 'Image Rembg (Remove Background)', 'PreviewImage']) {
        if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required background-removal node: ${required}.`);
      }
      const imageInputName = await this.uploadInput(requestId, 'cutout', image.name, bytes);
      const graph: Record<string, any> = {
        '1': {
          class_type: 'LoadImage',
          inputs: { image: imageInputName },
          _meta: { title: 'Umbra Character Source' },
        },
        '2': {
          class_type: 'Image Rembg (Remove Background)',
          inputs: {
            images: ['1', 0],
            transparency: true,
            model,
            post_processing: true,
            only_mask: false,
          },
          _meta: { title: 'Umbra Character Cutout' },
        },
        '3': {
          class_type: 'PreviewImage',
          inputs: { images: ['2', 0] },
          _meta: { title: 'Umbra Character Cutout Preview' },
        },
      };
      const queueResponse = await fetch(`${this.getComfyBaseUrl()}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: `umbra-ui-background-removal-${requestId}`,
          prompt: graph,
          extra_data: {
            extra_pnginfo: {
              workflow: graph,
              umbra_background_removal: { version: 1, model },
            },
          },
        }),
      });
      if (!queueResponse.ok) {
        const detail = await queueResponse.text().catch(() => '');
        throw new Error(detail || `ComfyUI rejected background removal (${queueResponse.status}).`);
      }
      const promptId = readPromptId(await queueResponse.json().catch(() => ({})));
      if (!promptId) throw new Error('ComfyUI did not return a background-removal prompt id.');
      const record = await this.waitForPromptRecord(promptId, () => false, 'background removal');
      const executionError = readExecutionError(record);
      const status = String(record?.status?.status_str || '').trim().toLowerCase();
      if (executionError || status === 'error') throw new Error(executionError || 'Background removal failed.');
      const output = collectOutputs(record)[0];
      if (!output) throw new Error('ComfyUI completed background removal without an image output.');
      const params = new URLSearchParams({
        filename: output.filename,
        subfolder: output.subfolder,
        type: output.type || 'temp',
      });
      const outputResponse = await fetch(`${this.getComfyBaseUrl()}/view?${params.toString()}`, { cache: 'no-store' });
      if (!outputResponse.ok) throw new Error(`Unable to load the transparent cutout (${outputResponse.status}).`);
      const outputBytes = new Uint8Array(await outputResponse.arrayBuffer());
      if (outputBytes.byteLength <= 0 || outputBytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error('The transparent cutout is empty or exceeds the 256 MB limit.');
      }
      return {
        bytes: outputBytes,
        contentType: String(outputResponse.headers.get('content-type') || 'image/png').split(';')[0] || 'image/png',
        output,
      };
    } finally {
      await this.cleanupStagedInputs(requestId);
    }
  }

  async cancel(jobIdInput: string): Promise<UmbraUiInpaintJob | null> {
    const job = this.jobs.get(String(jobIdInput || '').trim());
    if (!job) return null;
    if (['completed', 'partial', 'failed', 'canceled'].includes(job.status)) return cloneJob(job);
    const promptIds = job.items.map((item) => item.promptId).filter(Boolean);
    job.status = 'canceled';
    for (const item of job.items) {
      if (item.status === 'staging' || item.status === 'queued' || item.status === 'running') {
        item.status = 'canceled';
        item.error = 'Canceled by user.';
      }
    }
    job.updatedAt = Date.now();
    this.persistJobs();
    try {
      let runningOwnPrompt = false;
      const queueResponse = await fetch(`${this.getComfyBaseUrl()}/queue`, { cache: 'no-store' });
      if (queueResponse.ok) {
        const queuePayload: any = await queueResponse.json().catch(() => ({}));
        const runningIds = collectQueuePromptIds({ queue_running: queuePayload?.queue_running });
        runningOwnPrompt = promptIds.some((promptId) => runningIds.has(promptId));
      }
      if (promptIds.length > 0) {
        await fetch(`${this.getComfyBaseUrl()}/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ delete: promptIds }),
        }).catch(() => undefined);
      }
      if (runningOwnPrompt) {
        await fetch(`${this.getComfyBaseUrl()}/interrupt`, { method: 'POST' }).catch(() => undefined);
      }
    } finally {
      await this.cleanupStagedInputs(job.id);
    }
    return cloneJob(job);
  }

  async submit(
    source: UmbraUiInpaintSource,
    mask: UmbraUiInpaintSource,
    settings: UmbraUiInpaintSettings,
  ): Promise<UmbraUiInpaintJob> {
    this.prune();
    const prompt = String(settings.prompt || '').trim();
    if (!prompt) throw new Error('Enter an inpaint prompt before generating.');
    const samples = Math.max(1, Math.min(8, Math.round(finiteNumberOrFallback(settings.samples, 1))));
    const baseSeed = Number.isFinite(Number(settings.seed)) && Number(settings.seed) > 0
      ? Math.min(Number.MAX_SAFE_INTEGER - samples, Math.floor(Number(settings.seed)))
      : randomSeed();
    const now = Date.now();
    const job: UmbraUiInpaintJob = {
      id: createId('umbra-inpaint'),
      status: 'staging',
      sourceName: sanitizeFilename(source.name, 'source.png'),
      workflowId: String(settings.workflowId || '').trim(),
      prompt,
      width: Math.max(64, Math.min(16384, Math.round(finiteNumberOrFallback(settings.width, 1024)))),
      height: Math.max(64, Math.min(16384, Math.round(finiteNumberOrFallback(settings.height, 1024)))),
      total: samples,
      completed: 0,
      failed: 0,
      createdAt: now,
      updatedAt: now,
      items: Array.from({ length: samples }, (_, index) => ({
        id: String(index + 1),
        seed: baseSeed + index,
        status: 'staging',
        promptId: '',
        outputs: [],
        error: '',
      })),
    };
    if (job.width * job.height > MAX_GENERATION_PIXELS) {
      throw new Error('The inpaint generation region exceeds the 64 megapixel safety limit.');
    }
    if (job.width % 8 !== 0 || job.height % 8 !== 0) {
      throw new Error('Inpaint generation width and height must use the pipeline 8-pixel latent grid.');
    }
    this.jobs.set(job.id, job);
    this.persistJobs();

    try {
      if (!['classic_conditioning', 'flux_fill', 'qwen_image_controlnet', 'native_edit'].includes(settings.inpaintAdapter)) {
        throw new Error(`The ${settings.inpaintAdapter} inpaint provider is not supported by this Umbra build.`);
      }
      const primaryModelIssue = getUmbraUiInpaintPrimaryModelIssue(settings.inpaintAdapter, settings.checkpointName);
      if (primaryModelIssue) throw new Error(primaryModelIssue);
      const requestedRegionalGuidance = Array.isArray(settings.regionalGuidance) ? settings.regionalGuidance : [];
      const requestedControlLayers = Array.isArray(settings.controlLayers) ? settings.controlLayers : [];
      const requestedReferenceLayers = Array.isArray(settings.referenceLayers) ? settings.referenceLayers : [];
      const requestedReferenceMethod = requestedReferenceLayers[0]?.method;
      const referenceLimit = requestedReferenceMethod === 'hidream_o1_reference'
        ? 9
        : requestedReferenceMethod === 'qwen_image_reference' ? 2 : 8;
      const controlLimit = requestedControlLayers[0]?.adapterType === 'z_image_control' ? 4 : 8;
      if (requestedRegionalGuidance.length > 16) throw new Error('The selected pipeline supports at most 16 regional guidance layers.');
      if (requestedControlLayers.length > controlLimit) throw new Error(`The selected provider supports at most ${controlLimit} control layers.`);
      if (requestedReferenceLayers.length > referenceLimit) throw new Error(`The selected provider supports at most ${referenceLimit} reference layers.`);
      validateUmbraUiInpaintLayerProviderContract(
        requestedControlLayers,
        requestedReferenceLayers,
        settings.inpaintAdapter,
        settings.modelFamily,
      );
      const regionalGuidance = requestedRegionalGuidance
        .filter((region) => (
          Number(region.weight) > 0
          && (!!String(region.positivePrompt || '').trim() || !!String(region.negativePrompt || '').trim())
        ));
      const controlLayers = requestedControlLayers
        .filter((control) => Number(control.weight) > 0 && !!String(control.modelName || '').trim());
      const referenceLayers = requestedReferenceLayers
        .filter((reference) => reference.method === 'ip_adapter'
          ? Number(reference.weight) !== 0
          : Number(reference.weight) > 0);
      if (settings.inpaintAdapter !== 'classic_conditioning'
        && settings.inpaintAdapter !== 'native_edit'
        && controlLayers.length > 0) {
        throw new Error(`Control layers are not compatible with the ${settings.inpaintAdapter} provider.`);
      }
      if (settings.inpaintAdapter !== 'classic_conditioning'
        && settings.inpaintAdapter !== 'flux_fill'
        && settings.inpaintAdapter !== 'native_edit'
        && referenceLayers.length > 0) {
        throw new Error(`Reference layers are not compatible with the ${settings.inpaintAdapter} provider.`);
      }
      const [sourceBytesRaw, maskBytesRaw, nodeTypes, regionalMaskBytesRaw, controlImageBytesRaw, referenceImageBytesRaw, referenceMaskBytesRaw] = await Promise.all([
        source.read(),
        mask.read(),
        this.getNodeTypes(),
        Promise.all(regionalGuidance.map((region) => region.mask.read())),
        Promise.all(controlLayers.map((control) => control.image.read())),
        Promise.all(referenceLayers.map((reference) => reference.image.read())),
        Promise.all(referenceLayers.map((reference) => reference.mask?.read() || Promise.resolve(null))),
      ]);
      const sourceBytes = sourceBytesRaw instanceof Uint8Array ? sourceBytesRaw : new Uint8Array(sourceBytesRaw);
      const maskBytes = maskBytesRaw instanceof Uint8Array ? maskBytesRaw : new Uint8Array(maskBytesRaw);
      if (sourceBytes.byteLength <= 0 || maskBytes.byteLength <= 0) throw new Error('The inpaint source or mask is empty.');
      if (sourceBytes.byteLength > MAX_SOURCE_BYTES || maskBytes.byteLength > MAX_SOURCE_BYTES) {
        throw new Error('The inpaint source or mask exceeds the 256 MB limit.');
      }
      const regionalMaskBytes = regionalMaskBytesRaw.map((bytes) => (
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      ));
      if (regionalMaskBytes.some((bytes) => bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_BYTES)) {
        throw new Error('A regional guidance mask is empty or exceeds the 256 MB limit.');
      }
      const controlImageBytes = controlImageBytesRaw.map((bytes) => (
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      ));
      if (controlImageBytes.some((bytes) => bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_BYTES)) {
        throw new Error('A control image is empty or exceeds the 256 MB limit.');
      }
      const referenceImageBytes = referenceImageBytesRaw.map((bytes) => (
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      ));
      if (referenceImageBytes.some((bytes) => bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_BYTES)) {
        throw new Error('A reference image is empty or exceeds the 256 MB limit.');
      }
      const referenceMaskBytes = referenceMaskBytesRaw.map((bytes) => (
        bytes == null ? null : bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
      ));
      if (referenceMaskBytes.some((bytes) => bytes != null && (bytes.byteLength <= 0 || bytes.byteLength > MAX_SOURCE_BYTES))) {
        throw new Error('A reference influence mask is empty or exceeds the 256 MB limit.');
      }
      const requiredNodes = settings.inpaintAdapter === 'native_edit'
        ? []
        : settings.inpaintAdapter === 'qwen_image_controlnet'
        ? ['LoadImage', 'LoadImageMask', 'ControlNetLoader', 'ControlNetInpaintingAliMamaApply', 'VAEEncode', 'SetLatentNoiseMask', 'KSampler', 'VAEDecode', 'ImageCompositeMasked', 'UmbraLabSaveImage']
        : ['LoadImage', 'LoadImageMask', 'InpaintModelConditioning', 'KSampler', 'VAEDecode', 'ImageCompositeMasked', 'UmbraLabSaveImage'];
      for (const required of requiredNodes) {
        if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required inpaint node: ${required}.`);
      }
      if ((Number(settings.maskGrow) > 0 || Number(settings.maskFeather) > 0) && !nodeTypes.has('INPAINT_ExpandMask')) {
        throw new Error('ComfyUI is missing the required mask grow/feather node: INPAINT_ExpandMask.');
      }
      if (Number(settings.colorMatch) > 0) {
        if (settings.inpaintAdapter === 'native_edit') {
          throw new Error('Color matching is not declared by this native edit provider.');
        }
        if (!nodeTypes.has('INPAINT_ColorMatch')) {
          throw new Error('ComfyUI is missing the required color-match node: INPAINT_ColorMatch.');
        }
      }
      if (Number(settings.differentialStrength) < 0.9999) {
        if (settings.inpaintAdapter === 'native_edit') {
          throw new Error('Differential diffusion is not declared by this native edit provider.');
        }
        if (!nodeTypes.has('DifferentialDiffusion')) {
          throw new Error('ComfyUI is missing the required differential-diffusion node.');
        }
      }
      if (settings.softInpaintEnabled) {
        if (settings.inpaintAdapter === 'native_edit') {
          throw new Error('Soft inpaint compositing is not declared by this native edit provider.');
        }
        if (!nodeTypes.has('UmbraSoftInpaintComposite')) {
          throw new Error('ComfyUI is missing the required Umbra soft-inpaint composite node. Restart ComfyUI after updating Umbra Nodes.');
        }
      }
      if (settings.fillMode === 'lama') {
        if (settings.inpaintAdapter !== 'classic_conditioning' && settings.inpaintAdapter !== 'flux_fill') {
          throw new Error(`LaMa/MAT prefill is not compatible with the ${settings.inpaintAdapter} provider.`);
        }
        for (const required of ['INPAINT_LoadInpaintModel', 'INPAINT_InpaintWithModel']) {
          if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required model-infill node: ${required}.`);
        }
        if (!String(settings.inpaintModelName || '').trim()) {
          throw new Error('Choose an installed LaMa or MAT inpaint model before using model infill.');
        }
        const availableInpaintModels = await this.getNodeInputChoices('INPAINT_LoadInpaintModel', 'model_name');
        if (!availableInpaintModels.includes(settings.inpaintModelName)) {
          throw new Error(`The selected inpaint model is not installed: ${settings.inpaintModelName}.`);
        }
      }
      if (settings.inpaintAdapter === 'native_edit' && settings.fillMode !== 'neutral') {
        throw new Error('The selected native edit provider declares neutral source fill only.');
      }
      if ((settings.fillMode === 'telea' || settings.fillMode === 'navier-stokes') && !nodeTypes.has('INPAINT_MaskedFill')) {
        throw new Error('ComfyUI is missing the required OpenCV masked-fill node: INPAINT_MaskedFill.');
      }
      if (settings.fillMode === 'color') {
        if (settings.inpaintAdapter === 'native_edit') {
          throw new Error('Solid-color prefill is not declared by this native edit provider.');
        }
        if (!nodeTypes.has('EmptyImage')) throw new Error('ComfyUI is missing the required color-infill node: EmptyImage.');
      }
      if (settings.fillMode === 'tile') {
        if (settings.inpaintAdapter === 'native_edit') {
          throw new Error('Tile prefill is not declared by this native edit provider.');
        }
        if (!nodeTypes.has('UmbraTileInfill')) throw new Error('Umbra Nodes is missing the required tile-infill node: UmbraTileInfill.');
      }
      if (settings.seamlessX || settings.seamlessY) {
        if (settings.inpaintAdapter !== 'classic_conditioning') {
          throw new Error(`Seamless X/Y is not compatible with the ${settings.inpaintAdapter} provider.`);
        }
        if (!nodeTypes.has('UmbraSeamlessTiling')) {
          throw new Error('Umbra Nodes is missing the required seamless node: UmbraSeamlessTiling.');
        }
      }
      if (settings.outputOnlyMaskedRegions) {
        if (settings.inpaintAdapter === 'native_edit') {
          throw new Error('Masked-only RGBA output is not declared by this native edit provider.');
        }
        for (const required of ['InvertMask', 'JoinImageWithAlpha']) {
          if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required masked-output node: ${required}.`);
        }
      }
      if (settings.semanticCutout) {
        if (!settings.outputOnlyMaskedRegions) {
          throw new Error('Semantic cutout requires masked-only RGBA output.');
        }
        for (const required of [
          'Image Rembg (Remove Background)',
          'SplitImageWithAlpha',
          'MaskComposite',
          'InvertMask',
          'JoinImageWithAlpha',
        ]) {
          if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required semantic-cutout node: ${required}.`);
        }
      }
      if (settings.inpaintAdapter === 'qwen_image_controlnet' && !String(settings.adapterModelName || '').trim()) {
        throw new Error('The Qwen Image inpaint pipeline does not declare its required inpainting ControlNet model.');
      }
      if (settings.inpaintAdapter === 'qwen_image_controlnet') {
        const availableControlNets = await this.getNodeInputChoices('ControlNetLoader', 'control_net_name');
        if (!availableControlNets.includes(settings.adapterModelName)) {
          throw new Error(`The Qwen Image inpainting ControlNet is not installed: ${settings.adapterModelName}.`);
        }
      }
      if (regionalGuidance.length > 0) {
        for (const required of ['CLIPTextEncode', 'ConditioningSetMask', 'ConditioningSetTimestepRange', 'ConditioningCombine']) {
          if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required regional guidance node: ${required}.`);
        }
        if (regionalGuidance.some((region) => region.autoNegative) && !nodeTypes.has('InvertMask')) {
          throw new Error('ComfyUI is missing the required regional auto-negative node: InvertMask.');
        }
      }
      if (controlLayers.length > 0) {
        const sharedControlLayers = controlLayers.filter((control) => (
          control.adapterType === 'controlnet'
          || control.adapterType === 't2i_adapter'
          || control.adapterType === 'control_lora'
        ));
        const animaLlliteLayers = controlLayers.filter((control) => control.adapterType === 'anima_lllite');
        const zImageControlLayers = controlLayers.filter((control) => control.adapterType === 'z_image_control');
        const requireNodes = (requiredNodes: string[], providerLabel: string) => {
          for (const required of requiredNodes) {
            if (!nodeTypes.has(required)) {
              throw new Error(`ComfyUI is missing the required ${providerLabel} node: ${required}.`);
            }
          }
        };
        if (sharedControlLayers.length > 0) {
          requireNodes(['ControlNetLoader', 'ControlNetApplyAdvanced'], 'ControlNet');
          const availableModels = await this.getNodeInputChoices('ControlNetLoader', 'control_net_name');
          const missingModel = sharedControlLayers.find((control) => !availableModels.includes(control.modelName));
          if (missingModel) {
            throw new Error(`The selected control model is not installed: ${missingModel.modelName || '(empty)'}.`);
          }
        }
        if (animaLlliteLayers.length > 0) {
          requireNodes(['AnimaLLLiteApply'], 'Anima LLLite');
          const availableModels = await this.getNodeInputChoices('AnimaLLLiteApply', 'lllite_name');
          const missingModel = animaLlliteLayers.find((control) => !availableModels.includes(control.modelName));
          if (missingModel) {
            throw new Error(`The selected Anima LLLite weights are not installed: ${missingModel.modelName || '(empty)'}.`);
          }
        }
        if (zImageControlLayers.length > 0) {
          requireNodes(['ModelPatchLoader', 'ZImageFunControlnet'], 'Z-Image Control');
          const availableModels = await this.getNodeInputChoices('ModelPatchLoader', 'name');
          const missingModel = zImageControlLayers.find((control) => !availableModels.includes(control.modelName));
          if (missingModel) {
            throw new Error(`The selected model patch is not installed: ${missingModel.modelName || '(empty)'}.`);
          }
        }
        for (const control of controlLayers) {
          const preprocessorNode = CONTROL_PREPROCESSOR_NODES[control.controlType];
          if (preprocessorNode && !nodeTypes.has(preprocessorNode)) {
            throw new Error(`The ${control.controlType} control preprocessor is not installed (${preprocessorNode}).`);
          }
        }
      }
      if (referenceLayers.length > 0 && settings.inpaintAdapter === 'classic_conditioning') {
        const styleReferences = referenceLayers.filter((reference) => reference.method === 'style_model');
        const ipAdapterReferences = referenceLayers.filter((reference) => reference.method === 'ip_adapter');
        if (styleReferences.length > 0) {
          for (const required of ['CLIPVisionLoader', 'CLIPVisionEncode', 'StyleModelLoader', 'StyleModelApply']) {
            if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required style-reference node: ${required}.`);
          }
          const missingResource = styleReferences.find((reference) => (
            !String(reference.modelName || '').trim() || !String(reference.visionModelName || '').trim()
          ));
          if (missingResource) throw new Error(`Choose a style model and vision encoder for ${missingResource.name}.`);
          const [availableStyleModels, availableVisionModels] = await Promise.all([
            this.getNodeInputChoices('StyleModelLoader', 'style_model_name'),
            this.getNodeInputChoices('CLIPVisionLoader', 'clip_name'),
          ]);
          const unavailableResource = styleReferences.find((reference) => (
            !availableStyleModels.includes(reference.modelName)
            || !availableVisionModels.includes(reference.visionModelName)
          ));
          if (unavailableResource) throw new Error(`A style-reference model required by ${unavailableResource.name} is not installed.`);
        }
        if (ipAdapterReferences.length > 0) {
          for (const reference of ipAdapterReferences) validateClassicIpAdapterArchitecture(reference, settings);
          for (const required of ['LoadImage', 'IPAdapterModelLoader', 'CLIPVisionLoader', 'IPAdapterAdvanced']) {
            if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required IP Adapter node: ${required}.`);
          }
          if (ipAdapterReferences.some((reference) => !!reference.mask) && !nodeTypes.has('LoadImageMask')) {
            throw new Error('ComfyUI is missing the required IP Adapter influence-mask node: LoadImageMask.');
          }
          const missingResource = ipAdapterReferences.find((reference) => (
            !String(reference.modelName || '').trim() || !String(reference.visionModelName || '').trim()
          ));
          if (missingResource) throw new Error(`Choose an IP Adapter model and vision encoder for ${missingResource.name}.`);
          const [availableIpAdapterModels, availableVisionModels] = await Promise.all([
            this.getNodeInputChoices('IPAdapterModelLoader', 'ipadapter_file'),
            this.getNodeInputChoices('CLIPVisionLoader', 'clip_name'),
          ]);
          const unavailableResource = ipAdapterReferences.find((reference) => (
            !availableIpAdapterModels.includes(reference.modelName)
            || !availableVisionModels.includes(reference.visionModelName)
          ));
          if (unavailableResource) throw new Error(`An IP Adapter model required by ${unavailableResource.name} is not installed.`);
        }
      }
      if (referenceLayers.length > 0 && settings.inpaintAdapter === 'flux_fill') {
        for (const required of ['LoadImage', 'CLIPVisionLoader', 'CLIPVisionEncode', 'StyleModelLoader', 'StyleModelApply']) {
          if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required FLUX Redux node: ${required}.`);
        }
        const missingResource = referenceLayers.find((reference) => (
          !String(reference.modelName || '').trim() || !String(reference.visionModelName || '').trim()
        ));
        if (missingResource) throw new Error(`Choose a FLUX Redux style model and vision encoder for ${missingResource.name}.`);
        const [availableStyleModels, availableVisionModels] = await Promise.all([
          this.getNodeInputChoices('StyleModelLoader', 'style_model_name'),
          this.getNodeInputChoices('CLIPVisionLoader', 'clip_name'),
        ]);
        const unavailableResource = referenceLayers.find((reference) => (
          !availableStyleModels.includes(reference.modelName)
          || !availableVisionModels.includes(reference.visionModelName)
        ));
        if (unavailableResource) throw new Error(`A FLUX Redux model required by ${unavailableResource.name} is not installed.`);
      }
      if (referenceLayers.length > 0 && settings.inpaintAdapter === 'native_edit') {
        const method = referenceLayers[0]?.method;
        const requiredNodes = method === 'ip_adapter'
          ? ['LoadImage', 'IPAdapterModelLoader', 'CLIPVisionLoader', 'IPAdapterAdvanced']
          : method === 'flux_redux'
          ? ['LoadImage', 'CLIPVisionLoader', 'CLIPVisionEncode', 'StyleModelLoader', 'StyleModelApply']
          : method === 'qwen_image_reference'
          ? ['LoadImage', 'TextEncodeQwenImageEditPlus']
          : method === 'hidream_o1_reference'
            ? ['LoadImage', 'HiDreamO1ReferenceImages']
            : ['LoadImage', 'VAEEncode', 'ReferenceLatent'];
        for (const required of requiredNodes) {
          if (!nodeTypes.has(required)) throw new Error(`ComfyUI is missing the required native reference node: ${required}.`);
        }
        if (method === 'ip_adapter' && referenceLayers.some((reference) => !!reference.mask) && !nodeTypes.has('LoadImageMask')) {
          throw new Error('ComfyUI is missing the required IP Adapter influence-mask node: LoadImageMask.');
        }
        const weightedReference = method === 'flux_redux' || method === 'ip_adapter'
          ? undefined
          : referenceLayers.find((reference) => Math.abs(Number(reference.weight) - 1) > 0.0001);
        if (weightedReference) {
          throw new Error(`${weightedReference.name} uses a weight that the native ReferenceLatent contract does not support. Use 1.0.`);
        }
        if (method === 'flux_redux' || method === 'ip_adapter') {
          const missingResource = referenceLayers.find((reference) => (
            !String(reference.modelName || '').trim() || !String(reference.visionModelName || '').trim()
          ));
          if (missingResource) throw new Error(`Choose a ${method === 'ip_adapter' ? 'IP Adapter model' : 'FLUX Redux style model'} and vision encoder for ${missingResource.name}.`);
          const [availableModels, availableVisionModels] = await Promise.all([
            this.getNodeInputChoices(method === 'ip_adapter' ? 'IPAdapterModelLoader' : 'StyleModelLoader', method === 'ip_adapter' ? 'ipadapter_file' : 'style_model_name'),
            this.getNodeInputChoices('CLIPVisionLoader', 'clip_name'),
          ]);
          const unavailableResource = referenceLayers.find((reference) => (
            !availableModels.includes(reference.modelName) || !availableVisionModels.includes(reference.visionModelName)
          ));
          if (unavailableResource) throw new Error(`A model required by ${unavailableResource.name} is not installed.`);
        }
      }
      const [sourceInputName, maskInputName, regionalMaskInputNames, controlImageInputNames, referenceImageInputNames, referenceMaskInputNames] = await Promise.all([
        this.uploadInput(job.id, 'source', source.name, sourceBytes),
        this.uploadInput(job.id, 'mask', mask.name, maskBytes),
        Promise.all(regionalGuidance.map((region, index) => this.uploadInput(
          job.id,
          `regional_${index + 1}`,
          region.mask.name,
          regionalMaskBytes[index],
        ))),
        Promise.all(controlLayers.map((control, index) => this.uploadInput(
          job.id,
          `control_${index + 1}`,
          control.image.name,
          controlImageBytes[index],
        ))),
        Promise.all(referenceLayers.map((reference, index) => this.uploadInput(
          job.id,
          `reference_${index + 1}`,
          reference.image.name,
          referenceImageBytes[index],
        ))),
        Promise.all(referenceLayers.map((reference, index) => reference.mask && referenceMaskBytes[index]
          ? this.uploadInput(job.id, `reference_mask_${index + 1}`, reference.mask.name, referenceMaskBytes[index]!)
          : Promise.resolve(''))),
      ]);
      const uploadedRegionalGuidance: UploadedRegionalGuidance[] = regionalGuidance.map((region, index) => ({
        id: region.id,
        name: region.name,
        positivePrompt: String(region.positivePrompt || '').trim(),
        negativePrompt: String(region.negativePrompt || '').trim(),
        autoNegative: region.autoNegative === true,
        weight: Math.max(0, Math.min(10, finiteNumberOrFallback(region.weight, 0))),
        beginStepPercent: Math.max(0, Math.min(1, finiteNumberOrFallback(region.beginStepPercent, 0))),
        endStepPercent: Math.max(0, Math.min(1, finiteNumberOrFallback(region.endStepPercent, 1))),
        maskInputName: regionalMaskInputNames[index],
      }));
      const uploadedControlLayers: UploadedControlLayer[] = controlLayers.map((control, index) => ({
        id: control.id,
        name: control.name,
        adapterType: control.adapterType,
        controlMode: control.controlMode,
        controlType: control.controlType,
        modelName: String(control.modelName || '').trim(),
        weight: Math.max(0, Math.min(10, finiteNumberOrFallback(control.weight, 0))),
        beginStepPercent: Math.max(0, Math.min(1, finiteNumberOrFallback(control.beginStepPercent, 0))),
        endStepPercent: Math.max(0, Math.min(1, finiteNumberOrFallback(control.endStepPercent, 1))),
        processorResolution: Math.max(64, Math.min(4096, Math.round(finiteNumberOrFallback(control.processorResolution, 512)))),
        lowThreshold: Math.max(0, Math.min(255, Math.round(finiteNumberOrFallback(control.lowThreshold, 100)))),
        highThreshold: Math.max(0, Math.min(255, Math.round(finiteNumberOrFallback(control.highThreshold, 200)))),
        detectBody: control.detectBody !== false,
        detectFace: control.detectFace !== false,
        detectHands: control.detectHands !== false,
        maxFaces: Math.max(1, Math.min(50, Math.round(finiteNumberOrFallback(control.maxFaces, 10)))),
        minimumConfidence: Math.max(0.1, Math.min(1, finiteNumberOrFallback(control.minimumConfidence, 0.5))),
        scoreThreshold: Math.max(0.01, Math.min(2, finiteNumberOrFallback(control.scoreThreshold, 0.1))),
        distanceThreshold: Math.max(0.01, Math.min(20, finiteNumberOrFallback(control.distanceThreshold, 0.1))),
        normalStrength: Math.max(0, Math.min(Math.PI * 5, finiteNumberOrFallback(control.normalStrength, Math.PI * 2))),
        backgroundThreshold: Math.max(0, Math.min(1, finiteNumberOrFallback(control.backgroundThreshold, 0.1))),
        safeMode: control.safeMode !== false,
        processorSeed: Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.round(finiteNumberOrFallback(control.processorSeed, 0)))),
        imageInputName: controlImageInputNames[index],
      }));
      const uploadedReferenceLayers: UploadedReferenceLayer[] = referenceLayers.map((reference, index) => ({
        id: reference.id,
        name: reference.name,
        method: reference.method,
        modelName: String(reference.modelName || '').trim(),
        visionModelName: String(reference.visionModelName || '').trim(),
        crop: reference.crop === 'none' ? 'none' : 'center',
        strengthType: reference.strengthType === 'attn_bias' ? 'attn_bias' : 'multiply',
        weight: reference.method === 'ip_adapter'
          ? Math.max(-1, Math.min(5, finiteNumberOrFallback(reference.weight, 0)))
          : Math.max(0, Math.min(10, finiteNumberOrFallback(reference.weight, 0))),
        beginStepPercent: Math.max(0, Math.min(1, finiteNumberOrFallback(reference.beginStepPercent, 0))),
        endStepPercent: Math.max(0, Math.min(1, finiteNumberOrFallback(reference.endStepPercent, 1))),
        ipAdapterWeightType: IP_ADAPTER_WEIGHT_TYPES.has(reference.ipAdapterWeightType)
          ? reference.ipAdapterWeightType
          : 'linear',
        ipAdapterCombineEmbeds: IP_ADAPTER_COMBINE_MODES.has(reference.ipAdapterCombineEmbeds)
          ? reference.ipAdapterCombineEmbeds
          : 'concat',
        ipAdapterEmbedsScaling: IP_ADAPTER_SCALING_MODES.has(reference.ipAdapterEmbedsScaling)
          ? reference.ipAdapterEmbedsScaling
          : 'V only',
        imageInputName: referenceImageInputNames[index],
        maskInputName: referenceMaskInputNames[index] || undefined,
      }));

      const queuedItems: UmbraUiInpaintJobItem[] = [];
      for (const item of job.items) {
        try {
          const base = await this.buildBaseWorkflow(settings, item.seed);
          const graph = this.buildWorkflow(base.promptGraph, sourceInputName, maskInputName, uploadedRegionalGuidance, uploadedControlLayers, uploadedReferenceLayers, source.name, settings, item.seed, nodeTypes);
          const response = await fetch(`${this.getComfyBaseUrl()}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: `umbra-ui-inpaint-${job.id}-${item.id}`,
              prompt: graph,
              extra_data: {
                extra_pnginfo: {
                  workflow: graph,
                  umbra_inpaint: {
                    version: 4,
                    source: 'umbra_ui_inpaint',
                    canvasProjectId: settings.canvasProjectId,
                    operationMode: settings.operationMode,
                    workflowId: settings.workflowId,
                    modelFamily: settings.modelFamily,
                    modelSource: settings.modelSource,
                    inpaintAdapter: settings.inpaintAdapter,
                    adapterModelName: settings.adapterModelName,
                    checkpointName: settings.checkpointName,
                    generationRegion: {
                      x: settings.generationRegionX,
                      y: settings.generationRegionY,
                      width: settings.generationRegionWidth,
                      height: settings.generationRegionHeight,
                    },
                    submissionRegion: {
                      x: settings.submissionRegionX,
                      y: settings.submissionRegionY,
                      width: settings.submissionRegionWidth,
                      height: settings.submissionRegionHeight,
                    },
                    processing: {
                      mode: settings.processingScaleMode,
                      requestedWidth: settings.processingWidth,
                      requestedHeight: settings.processingHeight,
                      width: job.width,
                      height: job.height,
                    },
                    sourceName: source.name,
                    prompt,
                    negativePrompt: settings.negativePrompt,
                    seed: item.seed,
                    steps: settings.steps,
                    cfg: settings.cfg,
                    clipSkip: settings.clipSkip,
                    samplerName: settings.samplerName,
                    scheduler: settings.scheduler,
                    denoise: settings.denoise,
                    samples: settings.samples,
                    maskGrow: settings.maskGrow,
                    maskFeather: settings.maskFeather,
                    canvasMaskGrow: settings.canvasMaskGrow,
                    canvasMaskFeather: settings.canvasMaskFeather,
                    contextPadding: settings.contextPadding,
                    processingScaleMode: settings.processingScaleMode,
                    processingWidth: settings.processingWidth,
                    processingHeight: settings.processingHeight,
                    coherenceMode: settings.coherenceMode,
                    coherenceEdgeSize: settings.coherenceEdgeSize,
                    coherenceMinimumDenoise: settings.coherenceMinimumDenoise,
                    fillMode: settings.fillMode,
                    infillColor: settings.infillColor,
                    infillTileSize: settings.infillTileSize,
                    inpaintModelName: settings.inpaintModelName,
                    seamlessX: settings.seamlessX,
                    seamlessY: settings.seamlessY,
                    outputOnlyMaskedRegions: settings.outputOnlyMaskedRegions,
                    semanticCutout: settings.semanticCutout === true,
                    colorMatch: settings.colorMatch,
                    differentialStrength: settings.differentialStrength,
                    softInpaintEnabled: settings.softInpaintEnabled,
                    softInpaintPreservation: settings.softInpaintPreservation,
                    softInpaintTransitionContrast: settings.softInpaintTransitionContrast,
                    softInpaintMaskInfluence: settings.softInpaintMaskInfluence,
                    width: job.width,
                    height: job.height,
                    regionalGuidance: uploadedRegionalGuidance.map((region) => ({
                      id: region.id,
                      name: region.name,
                      positivePrompt: region.positivePrompt,
                      negativePrompt: region.negativePrompt,
                      autoNegative: region.autoNegative,
                      weight: region.weight,
                      beginStepPercent: region.beginStepPercent,
                      endStepPercent: region.endStepPercent,
                    })),
                    controlLayers: uploadedControlLayers.map((control) => ({
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
                    })),
                    referenceLayers: uploadedReferenceLayers.map((reference) => ({
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
                      hasInfluenceMask: !!reference.maskInputName,
                    })),
                  },
                },
              },
            }),
          });
          if (!response.ok) {
            const detail = await response.text().catch(() => '');
            throw new Error(detail || `ComfyUI rejected the inpaint workflow (${response.status}).`);
          }
          const promptId = readPromptId(await response.json().catch(() => ({})));
          if (!promptId) throw new Error('ComfyUI did not return an inpaint prompt id.');
          item.promptId = promptId;
          item.status = 'queued';
          queuedItems.push(item);
        } catch (error: any) {
          item.status = 'failed';
          item.error = String(error?.message || error || 'Failed to queue inpaint sample.');
        }
        job.updatedAt = Date.now();
        this.persistJobs();
      }

      job.failed = job.items.filter((item) => item.status === 'failed').length;
      job.status = queuedItems.length > 0 ? 'queued' : 'failed';
      job.updatedAt = Date.now();
      this.persistJobs();
      if (queuedItems.length > 0) {
        void this.monitor(job, queuedItems).finally(() => this.cleanupStagedInputs(job.id));
      } else {
        await this.cleanupStagedInputs(job.id);
      }
      return cloneJob(job);
    } catch (error: any) {
      const message = String(error?.message || error || 'Failed to stage the inpaint job.');
      for (const item of job.items) {
        if (item.status === 'staging') {
          item.status = 'failed';
          item.error = message;
        }
      }
      job.failed = job.total;
      job.status = 'failed';
      job.updatedAt = Date.now();
      this.persistJobs();
      await this.cleanupStagedInputs(job.id);
      throw error;
    }
  }

  private async uploadInput(jobId: string, role: string, sourceName: string, bytes: Uint8Array): Promise<string> {
    const safeName = `${role}_${sanitizeFilename(sourceName, `${role}.png`)}`;
    const subfolder = `umbra-ui-inpaint/${jobId}`;
    const form = new FormData();
    form.append('image', new Blob([Buffer.from(bytes)]), safeName);
    form.append('type', 'input');
    form.append('subfolder', subfolder);
    form.append('overwrite', 'true');
    const response = await fetch(`${this.getComfyBaseUrl()}/upload/image`, { method: 'POST', body: form });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `ComfyUI rejected the ${role} input (${response.status}).`);
    }
    const payload: any = await response.json().catch(() => ({}));
    const returnedName = String(payload?.name || safeName).trim() || safeName;
    const returnedSubfolder = String(payload?.subfolder || subfolder).trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
    return returnedSubfolder ? `${returnedSubfolder}/${returnedName}` : returnedName;
  }

  private buildWorkflow(
    sourceGraph: Record<string, any>,
    sourceInputName: string,
    maskInputName: string,
    regionalGuidance: UploadedRegionalGuidance[],
    controlLayers: UploadedControlLayer[],
    referenceLayers: UploadedReferenceLayer[],
    sourceName: string,
    settings: UmbraUiInpaintSettings,
    seed: number,
    nodeTypes: Set<string>,
  ): Record<string, any> {
    if (settings.inpaintAdapter === 'native_edit') {
      return this.buildNativeEditWorkflow(
        sourceGraph,
        sourceInputName,
        maskInputName,
        regionalGuidance,
        controlLayers,
        referenceLayers,
        settings,
        seed,
      );
    }
    const regionalContract = resolveUmbraUiInpaintRegionalConditioningContractForAdapter(
      sourceGraph,
      settings.inpaintAdapter,
    );
    if (regionalGuidance.length > 0 && settings.inpaintAdapter !== 'classic_conditioning') {
      if (!regionalContract) {
        throw new Error(`The ${settings.inpaintAdapter} workflow does not declare an exact regional-conditioning contract.`);
      }
      if (regionalGuidance.length > regionalContract.maxLayers) {
        throw new Error(`The ${settings.inpaintAdapter} workflow supports at most ${regionalContract.maxLayers} regional guidance layers.`);
      }
    }
    const bindings = findUmbraInpaintBindings(sourceGraph);
    const retained = collectDependencyClosure(sourceGraph, Array.from(new Set([
      bindings.model[0],
      bindings.vae[0],
      bindings.positive[0],
      bindings.negative[0],
      ...(bindings.clip ? [bindings.clip[0]] : []),
    ])));
    const graph: Record<string, any> = {};
    for (const nodeId of retained) graph[nodeId] = structuredClone(sourceGraph[nodeId]);
    const addNode = createNodeAllocator(graph);
    const ref = (nodeId: string, output = 0): [string, number] => [nodeId, output];
    let modelRef = bindings.model;
    let vaeRef = bindings.vae;
    if (settings.seamlessX || settings.seamlessY) {
      const seamlessId = addNode({
        class_type: 'UmbraSeamlessTiling',
        inputs: {
          model: modelRef,
          vae: vaeRef,
          seamless_x: settings.seamlessX,
          seamless_y: settings.seamlessY,
        },
        _meta: { title: 'Seamless X/Y Model + VAE' },
      });
      modelRef = ref(seamlessId, 0);
      vaeRef = ref(seamlessId, 1);
    }

    const sourceId = addNode({
      class_type: 'LoadImage',
      inputs: { image: sourceInputName },
      _meta: { title: 'Umbra Inpaint Working Image' },
    });
    const maskId = addNode({
      class_type: 'LoadImageMask',
      inputs: { image: maskInputName, channel: 'red' },
      _meta: { title: 'Umbra Inpaint Mask' },
    });

    let maskRef = ref(maskId);
    if (nodeTypes.has('INPAINT_ExpandMask') && (settings.maskGrow > 0 || settings.maskFeather > 0)) {
      const expandedMaskId = addNode({
        class_type: 'INPAINT_ExpandMask',
        inputs: {
          mask: maskRef,
          grow: Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskGrow, 0)))),
          blur: Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskFeather, 0)))),
          blur_type: 'gaussian',
        },
        _meta: { title: 'Grow + Feather Mask' },
      });
      maskRef = ref(expandedMaskId);
    }

    let workingImageRef = ref(sourceId);
    if (settings.fillMode === 'lama') {
      const inpaintModelId = addNode({
        class_type: 'INPAINT_LoadInpaintModel',
        inputs: { model_name: toComfyNodeInputChoice(settings.inpaintModelName) },
        _meta: { title: 'Load LaMa / MAT Infill Model' },
      });
      const modelFillId = addNode({
        class_type: 'INPAINT_InpaintWithModel',
        inputs: {
          inpaint_model: ref(inpaintModelId),
          image: ref(sourceId),
          mask: maskRef,
          seed,
        },
        _meta: { title: 'Model Prefill Masked Area' },
      });
      workingImageRef = ref(modelFillId);
    } else if (settings.fillMode === 'color') {
      const color = /^#[0-9a-f]{6}$/i.test(settings.infillColor)
        ? Number.parseInt(settings.infillColor.slice(1), 16)
        : 0x7f7f7f;
      const colorId = addNode({
        class_type: 'EmptyImage',
        inputs: {
          width: settings.width,
          height: settings.height,
          batch_size: 1,
          color,
        },
        _meta: { title: 'Solid Infill Color' },
      });
      const colorFillId = addNode({
        class_type: 'ImageCompositeMasked',
        inputs: {
          destination: ref(sourceId),
          source: ref(colorId),
          x: 0,
          y: 0,
          resize_source: false,
          mask: maskRef,
        },
        _meta: { title: 'Color Prefill Masked Area' },
      });
      workingImageRef = ref(colorFillId);
    } else if (settings.fillMode === 'tile') {
      const tileFillId = addNode({
        class_type: 'UmbraTileInfill',
        inputs: {
          image: ref(sourceId),
          mask: maskRef,
          tile_size: Math.max(8, Math.min(512, Math.round(finiteNumberOrFallback(settings.infillTileSize, 32)))),
          seed,
        },
        _meta: { title: 'Tile Prefill Masked Area' },
      });
      workingImageRef = ref(tileFillId);
    } else if ((settings.fillMode === 'telea' || settings.fillMode === 'navier-stokes')
      && nodeTypes.has('INPAINT_MaskedFill')) {
      const fillId = addNode({
        class_type: 'INPAINT_MaskedFill',
        inputs: {
          image: ref(sourceId),
          mask: maskRef,
          fill: settings.fillMode,
          falloff: Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskFeather, 0)))),
        },
        _meta: { title: 'Prefill Masked Area' },
      });
      workingImageRef = ref(fillId);
    }
    const conditioningPixelsRef = workingImageRef;

    let positiveConditioningRef = bindings.positive;
    let negativeConditioningRef = bindings.negative;
    const encodeRegionalPrompt = (
      text: string,
      region: UploadedRegionalGuidance,
      polarity: 'Positive' | 'Negative' | 'Auto-Negative',
    ): UmbraUiGraphRef => {
      if (settings.inpaintAdapter === 'classic_conditioning') {
        if (!bindings.clip) {
          throw new Error('The selected locked pipeline does not expose a compatible CLIP binding for regional guidance.');
        }
        const encodeId = addNode({
          class_type: 'CLIPTextEncode',
          inputs: { text, clip: bindings.clip },
          _meta: { title: `${region.name} ${polarity} Prompt` },
        });
        return ref(encodeId);
      }
      if (!regionalContract) {
        throw new Error(`The ${settings.inpaintAdapter} workflow does not declare an exact regional-conditioning contract.`);
      }
      if (regionalContract.method === 'clip_masked_conditioning') {
        const encodeId = addNode({
          class_type: 'CLIPTextEncode',
          inputs: {
            text,
            clip: [regionalContract.clipSourceNodeId, regionalContract.clipSourceOutput],
          },
          _meta: { title: `${region.name} ${polarity} Prompt` },
        });
        return ref(encodeId);
      }
      if (regionalContract.method === 'flux_text_encode_masked_conditioning') {
        const template = graph[regionalContract.positiveEncoderNodeId];
        if (!template || String(template.class_type || '') !== 'CLIPTextEncodeFlux') {
          throw new Error('The FLUX regional encoder template is unavailable.');
        }
        const encoder = structuredClone(template);
        encoder.inputs = encoder.inputs && typeof encoder.inputs === 'object' ? encoder.inputs : {};
        encoder.inputs.clip_l = text;
        encoder.inputs.t5xxl = text;
        const meta = encoder._meta && typeof encoder._meta === 'object' ? { ...encoder._meta } : {};
        delete meta.umbra_role;
        for (const key of Object.keys(meta)) {
          if (key.startsWith('umbra_regional_')) delete meta[key];
        }
        encoder._meta = { ...meta, title: `${region.name} ${polarity} Prompt` };
        return ref(addNode(encoder));
      }
      throw new Error(`The ${regionalContract.method} regional contract is not valid for the ${settings.inpaintAdapter} builder.`);
    };
    const appendRegionalConditioning = (
      current: [string, number],
      text: string,
      regionalMaskRef: [string, number],
      region: UploadedRegionalGuidance,
      polarity: 'Positive' | 'Negative' | 'Auto-Negative',
    ): [string, number] => {
      if (!text) return current;
      let regionalRef = encodeRegionalPrompt(text, region, polarity);
      const begin = Math.max(0, Math.min(1, region.beginStepPercent));
      const end = Math.max(begin, Math.min(1, region.endStepPercent));
      if (begin > 0 || end < 1) {
        const rangeId = addNode({
          class_type: 'ConditioningSetTimestepRange',
          inputs: { conditioning: regionalRef, start: begin, end },
          _meta: { title: `${region.name} Step Range` },
        });
        regionalRef = ref(rangeId);
      }
      const maskedId = addNode({
        class_type: 'ConditioningSetMask',
        inputs: {
          conditioning: regionalRef,
          mask: regionalMaskRef,
          strength: region.weight,
          set_cond_area: 'default',
        },
        _meta: { title: `${region.name} ${polarity} Mask` },
      });
      const combineId = addNode({
        class_type: 'ConditioningCombine',
        inputs: { conditioning_1: current, conditioning_2: ref(maskedId) },
        _meta: { title: `Combine ${region.name} ${polarity}` },
      });
      return ref(combineId);
    };
    for (const region of regionalGuidance) {
      if (region.positivePrompt && regionalContract && !regionalContract.positivePrompt) {
        throw new Error(`The ${settings.inpaintAdapter} workflow does not support positive regional prompts.`);
      }
      if (region.negativePrompt && regionalContract && !regionalContract.negativePrompt) {
        throw new Error(`The ${settings.inpaintAdapter} workflow does not support negative regional prompts.`);
      }
      if (region.autoNegative && regionalContract && !regionalContract.autoNegative) {
        throw new Error(`The ${settings.inpaintAdapter} workflow does not support regional auto-negative conditioning.`);
      }
      const regionalMaskId = addNode({
        class_type: 'LoadImageMask',
        inputs: { image: region.maskInputName, channel: 'red' },
        _meta: { title: `${region.name} Regional Mask` },
      });
      const regionalMaskRef = ref(regionalMaskId);
      positiveConditioningRef = appendRegionalConditioning(
        positiveConditioningRef,
        region.positivePrompt,
        regionalMaskRef,
        region,
        'Positive',
      );
      negativeConditioningRef = appendRegionalConditioning(
        negativeConditioningRef,
        region.negativePrompt,
        regionalMaskRef,
        region,
        'Negative',
      );
      if (region.autoNegative && region.positivePrompt) {
        const invertedMaskId = addNode({
          class_type: 'InvertMask',
          inputs: { mask: regionalMaskRef },
          _meta: { title: `${region.name} Auto-Negative Inverted Mask` },
        });
        negativeConditioningRef = appendRegionalConditioning(
          negativeConditioningRef,
          region.positivePrompt,
          ref(invertedMaskId),
          region,
          'Auto-Negative',
        );
      }
    }

    for (const reference of referenceLayers) {
      if (reference.method === 'ip_adapter') validateClassicIpAdapterArchitecture(reference, settings);
      const imageId = addNode({
        class_type: 'LoadImage',
        inputs: { image: reference.imageInputName },
        _meta: { title: `${reference.name} Reference Image` },
      });
      if (reference.method === 'ip_adapter') {
        const modelLoaderId = addNode({
          class_type: 'IPAdapterModelLoader',
          inputs: { ipadapter_file: toComfyNodeInputChoice(reference.modelName) },
          _meta: { title: `${reference.name} IP Adapter Model` },
        });
        const visionLoaderId = addNode({
          class_type: 'CLIPVisionLoader',
          inputs: { clip_name: toComfyNodeInputChoice(reference.visionModelName) },
          _meta: { title: `${reference.name} IP Adapter Vision` },
        });
        const attentionMaskId = reference.maskInputName
          ? addNode({
            class_type: 'LoadImageMask',
            inputs: { image: reference.maskInputName, channel: 'red' },
            _meta: { title: `${reference.name} IP Adapter Influence Mask` },
          })
          : '';
        const applyId = addNode({
          class_type: 'IPAdapterAdvanced',
          inputs: {
            model: modelRef,
            ipadapter: ref(modelLoaderId),
            image: ref(imageId),
            weight: reference.weight,
            weight_type: reference.ipAdapterWeightType,
            combine_embeds: reference.ipAdapterCombineEmbeds,
            start_at: Math.min(reference.beginStepPercent, reference.endStepPercent),
            end_at: Math.max(reference.beginStepPercent, reference.endStepPercent),
            embeds_scaling: reference.ipAdapterEmbedsScaling,
            clip_vision: ref(visionLoaderId),
            ...(attentionMaskId ? { attn_mask: ref(attentionMaskId) } : {}),
          },
          _meta: { title: `Apply ${reference.name} IP Adapter` },
        });
        modelRef = ref(applyId);
        continue;
      }
      if (reference.method !== 'style_model' && reference.method !== 'flux_redux') {
        throw new Error(`${reference.name} requests an unsupported conditioning reference method: ${reference.method}.`);
      }
      const visionLoaderId = addNode({
        class_type: 'CLIPVisionLoader',
        inputs: { clip_name: toComfyNodeInputChoice(reference.visionModelName) },
        _meta: { title: `${reference.name} Vision Encoder` },
      });
      const visionEncodeId = addNode({
        class_type: 'CLIPVisionEncode',
        inputs: { clip_vision: ref(visionLoaderId), image: ref(imageId), crop: reference.crop },
        _meta: { title: `${reference.name} Vision Features` },
      });
      const styleLoaderId = addNode({
        class_type: 'StyleModelLoader',
        inputs: { style_model_name: toComfyNodeInputChoice(reference.modelName) },
        _meta: { title: `${reference.name} Style Model` },
      });
      const applyId = addNode({
        class_type: 'StyleModelApply',
        inputs: {
          conditioning: positiveConditioningRef,
          style_model: ref(styleLoaderId),
          clip_vision_output: ref(visionEncodeId),
          strength: reference.weight,
          strength_type: reference.strengthType,
        },
        _meta: { title: reference.method === 'flux_redux' ? `Apply ${reference.name} Redux` : `Apply ${reference.name}` },
      });
      positiveConditioningRef = ref(applyId);
    }

    for (const control of controlLayers) {
      if (control.adapterType === 'anima_lllite'
        && normalizeUmbraUiModelFamilyKey(settings.modelFamily) !== 'anima') {
        throw new Error(`${control.name} requires the Anima model family for Anima LLLite.`);
      }
      const controlImageId = addNode({
        class_type: 'LoadImage',
        inputs: { image: control.imageInputName },
        _meta: { title: `${control.name} Control Image` },
      });
      const controlImageRef = appendUmbraUiControlPreprocessorGraph(
        graph,
        ref(controlImageId),
        control,
        `${control.name} ${control.controlType.replace(/_/g, ' ')}`,
      );
      if (control.adapterType === 'anima_lllite') {
        const applyId = addNode({
          class_type: 'AnimaLLLiteApply',
          inputs: {
            model: modelRef,
            lllite_name: toComfyNodeInputChoice(control.modelName),
            image: controlImageRef,
            strength: control.weight,
            start_percent: Math.min(control.beginStepPercent, control.endStepPercent),
            end_percent: Math.max(control.beginStepPercent, control.endStepPercent),
            preserve_wrapper: true,
            mask: maskRef,
          },
          _meta: { title: `Apply ${control.name} Anima LLLite` },
        });
        modelRef = ref(applyId);
        continue;
      }
      const loaderId = addNode({
        class_type: 'ControlNetLoader',
        inputs: { control_net_name: toComfyNodeInputChoice(control.modelName) },
        _meta: { title: `${control.name} ControlNet` },
      });
      const applyId = addNode({
        class_type: 'ControlNetApplyAdvanced',
        inputs: {
          positive: positiveConditioningRef,
          negative: negativeConditioningRef,
          control_net: ref(loaderId),
          image: controlImageRef,
          strength: control.weight,
          start_percent: Math.min(control.beginStepPercent, control.endStepPercent),
          end_percent: Math.max(control.beginStepPercent, control.endStepPercent),
          vae: vaeRef,
        },
        _meta: { title: `Apply ${control.name}` },
      });
      positiveConditioningRef = ref(applyId, 0);
      negativeConditioningRef = ref(applyId, 1);
    }

    if (settings.softInpaintEnabled
      && settings.inpaintAdapter !== 'qwen_image_controlnet'
      && nodeTypes.has('DifferentialDiffusion')
      && Number(settings.differentialStrength) > 0) {
      const differentialId = addNode({
        class_type: 'DifferentialDiffusion',
        inputs: {
          model: modelRef,
          strength: Math.max(0, Math.min(1, finiteNumberOrFallback(settings.differentialStrength, 0))),
        },
        _meta: { title: 'Differential Inpaint Blend' },
      });
      modelRef = ref(differentialId);
    }

    let samplerPositiveRef = positiveConditioningRef;
    let samplerNegativeRef = negativeConditioningRef;
    let samplerLatentRef: UmbraUiGraphRef;
    if (settings.inpaintAdapter === 'qwen_image_controlnet') {
      const controlNetId = addNode({
        class_type: 'ControlNetLoader',
        inputs: { control_net_name: toComfyNodeInputChoice(settings.adapterModelName) },
        _meta: { title: 'Qwen Image Inpainting ControlNet' },
      });
      const applyId = addNode({
        class_type: 'ControlNetInpaintingAliMamaApply',
        inputs: {
          positive: positiveConditioningRef,
          negative: negativeConditioningRef,
          control_net: ref(controlNetId),
          vae: vaeRef,
          image: workingImageRef,
          mask: maskRef,
          strength: 1,
          start_percent: 0,
          end_percent: 1,
        },
        _meta: { title: 'Apply Qwen Image Inpainting ControlNet' },
      });
      samplerPositiveRef = ref(applyId, 0);
      samplerNegativeRef = ref(applyId, 1);
      const encodeId = addNode({
        class_type: 'VAEEncode',
        inputs: { pixels: workingImageRef, vae: vaeRef },
        _meta: { title: 'Encode Qwen Inpaint Source' },
      });
      const noiseMaskId = addNode({
        class_type: 'SetLatentNoiseMask',
        inputs: { samples: ref(encodeId), mask: maskRef },
        _meta: { title: 'Apply Qwen Inpaint Noise Mask' },
      });
      samplerLatentRef = ref(noiseMaskId);
    } else {
      const conditioningId = addNode({
        class_type: 'InpaintModelConditioning',
        inputs: {
          positive: positiveConditioningRef,
          negative: negativeConditioningRef,
          vae: vaeRef,
          pixels: conditioningPixelsRef,
          mask: maskRef,
          noise_mask: true,
        },
        _meta: { title: settings.inpaintAdapter === 'flux_fill' ? 'FLUX Fill Conditioning' : 'Umbra Inpaint Conditioning' },
      });
      samplerPositiveRef = ref(conditioningId, 0);
      samplerNegativeRef = ref(conditioningId, 1);
      samplerLatentRef = ref(conditioningId, 2);
    }

    const samplerId = addNode({
      class_type: 'KSampler',
      inputs: {
        model: modelRef,
        seed,
        steps: Math.max(1, Math.min(10000, Math.round(finiteNumberOrFallback(settings.steps, 35)))),
        cfg: Math.max(0, Math.min(100, finiteNumberOrFallback(settings.cfg, 4))),
        sampler_name: String(settings.samplerName || 'er_sde').trim() || 'er_sde',
        scheduler: String(settings.scheduler || 'simple').trim() || 'simple',
        positive: samplerPositiveRef,
        negative: samplerNegativeRef,
        latent_image: samplerLatentRef,
        denoise: Math.max(0.01, Math.min(1, finiteNumberOrFallback(settings.denoise, 0.8))),
      },
      _meta: { title: 'Umbra Inpaint Sampler' },
    });
    const decodeId = addNode({
      class_type: 'VAEDecode',
      inputs: { samples: ref(samplerId), vae: vaeRef },
      _meta: { title: 'Decode Inpaint Sample' },
    });

    let generatedRef = ref(decodeId);
    if (nodeTypes.has('INPAINT_ColorMatch') && Number(settings.colorMatch) > 0) {
      const colorMatchId = addNode({
        class_type: 'INPAINT_ColorMatch',
        inputs: {
          target: generatedRef,
          reference: ref(sourceId),
          exclude_mask: maskRef,
          strength: Math.max(0, Math.min(1, finiteNumberOrFallback(settings.colorMatch, 0))),
        },
        _meta: { title: 'Match Source Color' },
      });
      generatedRef = ref(colorMatchId);
    }

    let outputRef: UmbraUiGraphRef;
    if (settings.outputOnlyMaskedRegions) {
      const invertedMaskId = addNode({
        class_type: 'InvertMask',
        inputs: { mask: maskRef },
        _meta: { title: 'Transparent Outside Generated Mask' },
      });
      if (settings.semanticCutout) {
        const removeBackgroundId = addNode({
          class_type: 'Image Rembg (Remove Background)',
          inputs: {
            images: generatedRef,
            transparency: true,
            model: 'isnet-anime',
            post_processing: true,
            only_mask: false,
            alpha_matting: true,
            alpha_matting_foreground_threshold: 240,
            alpha_matting_background_threshold: 10,
            alpha_matting_erode_size: 5,
            background_color: 'none',
          },
          _meta: { title: 'Extract Generated Subject' },
        });
        const splitAlphaId = addNode({
          class_type: 'SplitImageWithAlpha',
          inputs: { image: ref(removeBackgroundId) },
          _meta: { title: 'Separate Subject Transparency' },
        });
        const combinedTransparencyId = addNode({
          class_type: 'MaskComposite',
          inputs: {
            destination: ref(invertedMaskId),
            source: ref(splitAlphaId, 1),
            x: 0,
            y: 0,
            operation: 'add',
          },
          _meta: { title: 'Clip Cutout To Generated Region' },
        });
        const alphaId = addNode({
          class_type: 'JoinImageWithAlpha',
          inputs: { image: ref(splitAlphaId, 0), alpha: ref(combinedTransparencyId) },
          _meta: { title: 'Semantic Cutout RGBA Output' },
        });
        outputRef = ref(alphaId);
      } else {
        const alphaId = addNode({
          class_type: 'JoinImageWithAlpha',
          inputs: { image: generatedRef, alpha: ref(invertedMaskId) },
          _meta: { title: 'Masked Region RGBA Output' },
        });
        outputRef = ref(alphaId);
      }
    } else if (settings.softInpaintEnabled && nodeTypes.has('UmbraSoftInpaintComposite')) {
      const compositeId = addNode({
        class_type: 'UmbraSoftInpaintComposite',
        inputs: {
          original: ref(sourceId),
          generated: generatedRef,
          mask: maskRef,
          preservation: Math.max(0, Math.min(1, finiteNumberOrFallback(settings.softInpaintPreservation, 0.5))),
          transition_contrast: Math.max(0.25, Math.min(8, finiteNumberOrFallback(settings.softInpaintTransitionContrast, 2))),
          mask_influence: Math.max(0, Math.min(1, finiteNumberOrFallback(settings.softInpaintMaskInfluence, 0))),
        },
        _meta: { title: 'Adaptive Soft Inpaint Composite' },
      });
      outputRef = ref(compositeId);
    } else {
      const compositeId = addNode({
        class_type: 'ImageCompositeMasked',
        inputs: {
          destination: ref(sourceId),
          source: generatedRef,
          x: 0,
          y: 0,
          resize_source: false,
          mask: maskRef,
        },
        _meta: { title: 'Non-Destructive Inpaint Composite' },
      });
      outputRef = ref(compositeId);
    }
    const sourceStem = sanitizeFilename(sourceName, 'image.png').replace(/\.[^.]+$/, '');
    const outputModeLabel = settings.operationMode === 'outpaint' ? 'Outpaint' : 'Inpaint';
    addNode({
      class_type: 'UmbraLabSaveImage',
      inputs: {
        images: outputRef,
        filename_prefix: `UmbraUI_${outputModeLabel}_${sourceStem}_%date%`,
        positive_prompt: settings.prompt,
        negative_prompt: settings.negativePrompt,
        positive: samplerPositiveRef,
        negative: samplerNegativeRef,
        output_folder: `Umbra UI/${settings.operationMode === 'outpaint' ? 'outpainting' : 'inpainting'}`,
        save_to_yyyy_mm_dd_folder: true,
        save_to_set_subfolder: false,
        set_subfolder: '',
        save_set_to_style_subfolder: '',
        model_name: settings.checkpointName,
        seed,
        steps: Math.max(1, Math.min(10000, Math.round(finiteNumberOrFallback(settings.steps, 35)))),
        cfg: Math.max(0, Math.min(100, finiteNumberOrFallback(settings.cfg, 4))),
        sampler_name: String(settings.samplerName || 'er_sde').trim() || 'er_sde',
        scheduler: String(settings.scheduler || 'simple').trim() || 'simple',
      },
      _meta: { title: 'Umbra UI Inpainting Output' },
    });
    return graph;
  }

  private buildNativeEditWorkflow(
    sourceGraph: Record<string, any>,
    sourceInputName: string,
    maskInputName: string,
    regionalGuidance: UploadedRegionalGuidance[],
    controlLayers: UploadedControlLayer[],
    referenceLayers: UploadedReferenceLayer[],
    settings: UmbraUiInpaintSettings,
    seed: number,
  ): Record<string, any> {
    const graph = structuredClone(sourceGraph);
    const roleOf = (node: any) => String(node?._meta?.umbra_role || node?._meta?.role || '').trim().toLowerCase();
    const findRole = (role: string) => Object.entries(graph).find(([, node]) => roleOf(node) === role);
    const sourceEntry = findRole('inpaint_source');
    const maskEntry = findRole('inpaint_mask');
    if (!sourceEntry) throw new Error('The native edit workflow is missing the required inpaint_source role.');
    if (!maskEntry) throw new Error('The native edit workflow is missing the required inpaint_mask role.');
    const bindImageInput = (entry: [string, any], inputName: string, role: string) => {
      const node = entry[1];
      node.inputs = node.inputs && typeof node.inputs === 'object' ? node.inputs : {};
      const field = ['image', 'source_image', 'mask_image', 'filename'].find((name) => Object.prototype.hasOwnProperty.call(node.inputs, name));
      if (!field) throw new Error(`The native ${role} node does not expose an image input.`);
      node.inputs[field] = inputName;
    };
    bindImageInput(sourceEntry, sourceInputName, 'inpaint_source');
    bindImageInput(maskEntry, maskInputName, 'inpaint_mask');
    const addNode = createNodeAllocator(graph);

    if (referenceLayers.length > 0) {
      const methods = Array.from(new Set(referenceLayers.map((reference) => reference.method)));
      if (methods.length !== 1 || !NATIVE_REFERENCE_METHODS.has(methods[0])) {
        throw new Error('The native edit workflow requires one exact reference method per request.');
      }
      const method = methods[0];
      const loadReferenceImages = () => referenceLayers.map((reference) => ({
        reference,
        imageId: addNode({
          class_type: 'LoadImage',
          inputs: { image: reference.imageInputName },
          _meta: { title: `${reference.name} Native Reference` },
        }),
      }));

      if (method === 'ip_adapter') {
        const sinkEntry = findRole('inpaint_reference_model_sink');
        const sinkMeta = sinkEntry?.[1]?._meta && typeof sinkEntry[1]._meta === 'object' ? sinkEntry[1]._meta : {};
        if (!sinkEntry || String(sinkMeta.umbra_reference_method || '').trim().toLowerCase() !== method) {
          throw new Error('The IP Adapter workflow does not declare an exact model sink.');
        }
        const sinkInputs = sinkEntry[1].inputs && typeof sinkEntry[1].inputs === 'object' ? sinkEntry[1].inputs : {};
        let modelRef = normalizeGraphReference(sinkInputs.model, graph);
        if (!modelRef) throw new Error('The IP Adapter sink does not expose a connected model input.');
        for (const { reference, imageId } of loadReferenceImages()) {
          if (!reference.modelName || !reference.visionModelName) {
            throw new Error(`${reference.name} is missing its IP Adapter model or vision encoder.`);
          }
          const modelLoaderId = addNode({
            class_type: 'IPAdapterModelLoader',
            inputs: { ipadapter_file: toComfyNodeInputChoice(reference.modelName) },
            _meta: { title: `${reference.name} IP Adapter Model` },
          });
          const visionLoaderId = addNode({
            class_type: 'CLIPVisionLoader',
            inputs: { clip_name: toComfyNodeInputChoice(reference.visionModelName) },
            _meta: { title: `${reference.name} IP Adapter Vision` },
          });
          const attentionMaskId = reference.maskInputName
            ? addNode({
              class_type: 'LoadImageMask',
              inputs: { image: reference.maskInputName, channel: 'red' },
              _meta: { title: `${reference.name} IP Adapter Influence Mask` },
            })
            : '';
          const applyId = addNode({
            class_type: 'IPAdapterAdvanced',
            inputs: {
              model: modelRef,
              ipadapter: [modelLoaderId, 0],
              image: [imageId, 0],
              weight: reference.weight,
              weight_type: reference.ipAdapterWeightType,
              combine_embeds: reference.ipAdapterCombineEmbeds,
              start_at: Math.min(reference.beginStepPercent, reference.endStepPercent),
              end_at: Math.max(reference.beginStepPercent, reference.endStepPercent),
              embeds_scaling: reference.ipAdapterEmbedsScaling,
              clip_vision: [visionLoaderId, 0],
              ...(attentionMaskId ? { attn_mask: [attentionMaskId, 0] } : {}),
            },
            _meta: { title: `Apply ${reference.name} IP Adapter` },
          });
          modelRef = [applyId, 0];
        }
        sinkInputs.model = modelRef;
        sinkEntry[1].inputs = sinkInputs;
      } else if (method === 'flux_redux') {
        const sinkEntry = findRole('inpaint_reference_sink');
        const sinkMeta = sinkEntry?.[1]?._meta && typeof sinkEntry[1]._meta === 'object' ? sinkEntry[1]._meta : {};
        if (!sinkEntry || String(sinkMeta.umbra_reference_method || '').trim().toLowerCase() !== method) {
          throw new Error('The FLUX Redux workflow does not declare an exact conditioning sink.');
        }
        const sinkInputs = sinkEntry[1].inputs && typeof sinkEntry[1].inputs === 'object' ? sinkEntry[1].inputs : {};
        const sinkField = Object.prototype.hasOwnProperty.call(sinkInputs, 'positive')
          ? 'positive'
          : Object.prototype.hasOwnProperty.call(sinkInputs, 'conditioning') ? 'conditioning' : '';
        const conditioningRef = normalizeGraphReference(sinkField ? sinkInputs[sinkField] : null, graph);
        if (!conditioningRef) throw new Error('The FLUX Redux sink does not expose a connected positive or conditioning input.');
        let currentConditioning = conditioningRef;
        for (const { reference, imageId } of loadReferenceImages()) {
          if (!reference.modelName || !reference.visionModelName) {
            throw new Error(`${reference.name} is missing its FLUX Redux style model or vision encoder.`);
          }
          const visionLoaderId = addNode({
            class_type: 'CLIPVisionLoader',
            inputs: { clip_name: toComfyNodeInputChoice(reference.visionModelName) },
            _meta: { title: `${reference.name} Vision Encoder` },
          });
          const visionEncodeId = addNode({
            class_type: 'CLIPVisionEncode',
            inputs: { clip_vision: [visionLoaderId, 0], image: [imageId, 0], crop: reference.crop },
            _meta: { title: `${reference.name} Redux Features` },
          });
          const styleLoaderId = addNode({
            class_type: 'StyleModelLoader',
            inputs: { style_model_name: toComfyNodeInputChoice(reference.modelName) },
            _meta: { title: `${reference.name} Redux Model` },
          });
          const applyId = addNode({
            class_type: 'StyleModelApply',
            inputs: {
              conditioning: currentConditioning,
              style_model: [styleLoaderId, 0],
              clip_vision_output: [visionEncodeId, 0],
              strength: reference.weight,
              strength_type: reference.strengthType,
            },
            _meta: { title: `Apply ${reference.name} Redux` },
          });
          currentConditioning = [applyId, 0];
        }
        sinkInputs[sinkField] = currentConditioning;
        sinkEntry[1].inputs = sinkInputs;
      } else if (method === 'qwen_image_reference') {
        if (referenceLayers.length > 2) {
          throw new Error('Qwen Image Edit Plus supports at most two additional reference layers because image1 is reserved for the source image.');
        }
        const positiveEntry = findRole('inpaint_reference_positive_encoder');
        const negativeEntry = findRole('inpaint_reference_negative_encoder');
        if (!positiveEntry || !negativeEntry) {
          throw new Error('The Qwen native edit workflow does not declare paired positive and negative reference encoder roles.');
        }
        const sourceMeta = sourceEntry[1]?._meta && typeof sourceEntry[1]._meta === 'object' ? sourceEntry[1]._meta : {};
        const sourceOutput = Math.max(0, Math.floor(Number(sourceMeta.umbra_output_index) || 0));
        const expectedSource: UmbraUiGraphRef = [sourceEntry[0], sourceOutput];
        const prepareEncoder = (entry: [string, any], label: string) => {
          const node = entry[1];
          const meta = node?._meta && typeof node._meta === 'object' ? node._meta : {};
          if (String(node?.class_type || '') !== 'TextEncodeQwenImageEditPlus'
            || String(meta.umbra_reference_method || '').trim().toLowerCase() !== method) {
            throw new Error(`The Qwen ${label} reference role is not an exact TextEncodeQwenImageEditPlus contract.`);
          }
          const inputs = node.inputs && typeof node.inputs === 'object' ? node.inputs : {};
          const sourceRef = normalizeGraphReference(inputs.image1, graph);
          if (!sourceRef || sourceRef[0] !== expectedSource[0] || sourceRef[1] !== expectedSource[1]) {
            throw new Error(`The Qwen ${label} reference encoder does not reserve image1 for the declared inpaint source.`);
          }
          if (!normalizeGraphReference(inputs.clip, graph) || !normalizeGraphReference(inputs.vae, graph)
            || !Object.prototype.hasOwnProperty.call(inputs, 'prompt')) {
            throw new Error(`The Qwen ${label} reference encoder is missing its connected CLIP, VAE, or prompt binding.`);
          }
          delete inputs.image2;
          delete inputs.image3;
          node.inputs = inputs;
          return inputs;
        };
        const positiveInputs = prepareEncoder(positiveEntry, 'positive');
        const negativeInputs = prepareEncoder(negativeEntry, 'negative');
        loadReferenceImages().forEach(({ imageId }, index) => {
          const field = `image${index + 2}`;
          positiveInputs[field] = [imageId, 0];
          negativeInputs[field] = [imageId, 0];
        });
      } else if (method === 'hidream_o1_reference') {
        if (referenceLayers.length > 9) {
          throw new Error('HiDream-O1 supports at most nine additional reference layers because image_1 is reserved for the editable source.');
        }
        const sinkEntry = findRole('inpaint_reference_sink');
        const sinkMeta = sinkEntry?.[1]?._meta && typeof sinkEntry[1]._meta === 'object' ? sinkEntry[1]._meta : {};
        if (!sinkEntry
          || String(sinkEntry[1]?.class_type || '') !== 'HiDreamO1ReferenceImages'
          || String(sinkMeta.umbra_reference_method || '').trim().toLowerCase() !== method) {
          throw new Error('The HiDream-O1 native edit workflow does not declare an exact reference-images sink.');
        }
        const inputs = sinkEntry[1].inputs && typeof sinkEntry[1].inputs === 'object' ? sinkEntry[1].inputs : {};
        if (!normalizeGraphReference(inputs.positive, graph) || !normalizeGraphReference(inputs.negative, graph)) {
          throw new Error('The HiDream-O1 reference sink does not expose connected positive and negative conditioning inputs.');
        }
        const legacyGroupedImages = inputs.images && typeof inputs.images === 'object' && !Array.isArray(inputs.images)
          ? inputs.images as Record<string, unknown>
          : {};
        const sourceMeta = sourceEntry[1]?._meta && typeof sourceEntry[1]._meta === 'object' ? sourceEntry[1]._meta : {};
        const sourceOutput = Math.max(0, Math.floor(Number(sourceMeta.umbra_output_index) || 0));
        const sourceRef = normalizeGraphReference(
          inputs['images.image_1'] ?? legacyGroupedImages.image_1 ?? inputs.image_1,
          graph,
        );
        if (!sourceRef || sourceRef[0] !== sourceEntry[0] || sourceRef[1] !== sourceOutput) {
          throw new Error('The HiDream-O1 reference sink must reserve image_1 for the declared inpaint source.');
        }
        delete inputs.images;
        delete inputs.image_1;
        inputs['images.image_1'] = sourceRef;
        for (let index = 2; index <= 10; index += 1) {
          delete inputs[`image_${index}`];
          delete inputs[`images.image_${index}`];
        }
        loadReferenceImages().forEach(({ imageId }, index) => {
          inputs[`images.image_${index + 2}`] = [imageId, 0];
        });
        sinkEntry[1].inputs = inputs;
      } else {
        const sinkEntry = findRole('inpaint_reference_sink');
        const vaeEntry = findRole('inpaint_reference_vae');
        if (!sinkEntry || !vaeEntry) {
          throw new Error('The FLUX native edit workflow does not declare its reference sink and VAE roles.');
        }
        const sinkMeta = sinkEntry[1]?._meta && typeof sinkEntry[1]._meta === 'object' ? sinkEntry[1]._meta : {};
        const declaredMethod = String(sinkMeta.umbra_reference_method || '').trim().toLowerCase();
        if (declaredMethod !== method || (method !== 'flux_kontext' && method !== 'flux2_reference')) {
          throw new Error(`The FLUX native edit workflow does not declare the requested ${method} reference method.`);
        }
        const sinkInputs = sinkEntry[1].inputs && typeof sinkEntry[1].inputs === 'object' ? sinkEntry[1].inputs : {};
        const sinkField = Object.prototype.hasOwnProperty.call(sinkInputs, 'positive')
          ? 'positive'
          : Object.prototype.hasOwnProperty.call(sinkInputs, 'conditioning') ? 'conditioning' : '';
        const conditioningRef = normalizeGraphReference(sinkField ? sinkInputs[sinkField] : null, graph);
        if (!conditioningRef) {
          throw new Error('The FLUX native reference sink does not expose a connected positive or conditioning input.');
        }
        const vaeMeta = vaeEntry[1]?._meta && typeof vaeEntry[1]._meta === 'object' ? vaeEntry[1]._meta : {};
        const vaeOutput = Math.max(0, Math.floor(Number(vaeMeta.umbra_output_index) || 0));
        let currentConditioning = conditioningRef;
        for (const { reference, imageId } of loadReferenceImages()) {
          const encodeId = addNode({
            class_type: 'VAEEncode',
            inputs: { pixels: [imageId, 0], vae: [vaeEntry[0], vaeOutput] },
            _meta: { title: `Encode ${reference.name} Reference` },
          });
          const referenceId = addNode({
            class_type: 'ReferenceLatent',
            inputs: { conditioning: currentConditioning, latent: [encodeId, 0] },
            _meta: { title: `Apply ${reference.name} Reference` },
          });
          currentConditioning = [referenceId, 0];
        }
        sinkInputs[sinkField] = currentConditioning;
        sinkEntry[1].inputs = sinkInputs;
      }
    }

    if (regionalGuidance.length > 0) {
      const contract = resolveUmbraUiInpaintRegionalConditioningContractForAdapter(graph, 'native_edit');
      if (!contract) {
        throw new Error('The native edit workflow does not declare an exact regional-conditioning contract.');
      }
      if (regionalGuidance.length > contract.maxLayers) {
        throw new Error(`The native edit workflow supports at most ${contract.maxLayers} regional guidance layers.`);
      }
      const sinkNode = graph[contract.sinkNodeId];
      const sinkInputs = sinkNode?.inputs && typeof sinkNode.inputs === 'object' ? sinkNode.inputs : {};
      let positiveRef = normalizeGraphReference(sinkInputs[contract.positiveSinkInput], graph);
      let negativeRef = contract.negativeSinkInput
        ? normalizeGraphReference(sinkInputs[contract.negativeSinkInput], graph)
        : null;
      if (!positiveRef) throw new Error('The native regional-conditioning sink lost its positive binding.');
      if (contract.negativePrompt && !negativeRef) {
        throw new Error('The native regional-conditioning sink lost its negative binding.');
      }

      const cleanClonedMeta = (node: any, title: string) => {
        const meta = node?._meta && typeof node._meta === 'object' ? { ...node._meta } : {};
        for (const key of Object.keys(meta)) {
          if (key === 'umbra_role' || key.startsWith('umbra_regional_')) delete meta[key];
        }
        return { ...meta, title };
      };
      const encodePrompt = (
        text: string,
        polarity: 'positive' | 'negative',
        regionName: string,
      ): UmbraUiGraphRef => {
        if (contract.method === 'qwen_image_edit_masked_conditioning') {
          const templateId = polarity === 'positive'
            ? contract.positiveEncoderNodeId
            : contract.negativeEncoderNodeId;
          const template = graph[templateId];
          if (!template || String(template.class_type || '') !== 'TextEncodeQwenImageEditPlus') {
            throw new Error(`The native Qwen ${polarity} regional encoder template is unavailable.`);
          }
          const encoder = structuredClone(template);
          encoder.inputs = encoder.inputs && typeof encoder.inputs === 'object' ? encoder.inputs : {};
          encoder.inputs.prompt = text;
          encoder._meta = cleanClonedMeta(encoder, `${regionName} ${polarity === 'positive' ? 'Positive' : 'Negative'} Prompt`);
          return [addNode(encoder), 0];
        }
        if (!contract.clipSourceNodeId) {
          throw new Error('The native regional-conditioning contract does not expose its CLIP source.');
        }
        const encodeId = addNode({
          class_type: 'CLIPTextEncode',
          inputs: {
            text,
            clip: [contract.clipSourceNodeId, contract.clipSourceOutput],
          },
          _meta: { title: `${regionName} ${polarity === 'positive' ? 'Positive' : 'Negative'} Prompt` },
        });
        let encodedRef: UmbraUiGraphRef = [encodeId, 0];
        if (polarity === 'positive' && contract.method === 'flux_guidance_masked_conditioning') {
          const transformTemplate = graph[contract.positiveTransformNodeId];
          if (!transformTemplate || String(transformTemplate.class_type || '') !== 'FluxGuidance') {
            throw new Error('The native FLUX regional guidance transform is unavailable.');
          }
          const transform = structuredClone(transformTemplate);
          transform.inputs = transform.inputs && typeof transform.inputs === 'object' ? transform.inputs : {};
          transform.inputs.conditioning = encodedRef;
          transform._meta = cleanClonedMeta(transform, `${regionName} FLUX Guidance`);
          encodedRef = [addNode(transform), 0];
        }
        return encodedRef;
      };
      const appendRegion = (
        current: UmbraUiGraphRef,
        text: string,
        maskRef: UmbraUiGraphRef,
        region: UploadedRegionalGuidance,
        polarity: 'positive' | 'negative',
        titlePolarity: 'Positive' | 'Negative' | 'Auto-Negative',
      ): UmbraUiGraphRef => {
        if (!text) return current;
        let encodedRef = encodePrompt(text, polarity, region.name);
        const begin = Math.max(0, Math.min(1, region.beginStepPercent));
        const end = Math.max(begin, Math.min(1, region.endStepPercent));
        if (begin > 0 || end < 1) {
          const rangeId = addNode({
            class_type: 'ConditioningSetTimestepRange',
            inputs: { conditioning: encodedRef, start: begin, end },
            _meta: { title: `${region.name} ${titlePolarity} Step Range` },
          });
          encodedRef = [rangeId, 0];
        }
        const maskedId = addNode({
          class_type: 'ConditioningSetMask',
          inputs: {
            conditioning: encodedRef,
            mask: maskRef,
            strength: region.weight,
            set_cond_area: 'default',
          },
          _meta: { title: `${region.name} ${titlePolarity} Mask` },
        });
        const combineId = addNode({
          class_type: 'ConditioningCombine',
          inputs: { conditioning_1: current, conditioning_2: [maskedId, 0] },
          _meta: { title: `Combine ${region.name} ${titlePolarity}` },
        });
        return [combineId, 0];
      };

      for (const region of regionalGuidance) {
        if (region.positivePrompt && !contract.positivePrompt) {
          throw new Error('The native edit workflow does not support positive regional prompts.');
        }
        if (region.negativePrompt && !contract.negativePrompt) {
          throw new Error('The native edit workflow does not support negative regional prompts.');
        }
        if (region.autoNegative && !contract.autoNegative) {
          throw new Error('The native edit workflow does not support regional auto-negative conditioning.');
        }
        const maskId = addNode({
          class_type: 'LoadImageMask',
          inputs: { image: region.maskInputName, channel: 'red' },
          _meta: { title: `${region.name} Regional Mask` },
        });
        const maskRef: UmbraUiGraphRef = [maskId, 0];
        positiveRef = appendRegion(
          positiveRef,
          region.positivePrompt,
          maskRef,
          region,
          'positive',
          'Positive',
        );
        if (region.negativePrompt && negativeRef) {
          negativeRef = appendRegion(
            negativeRef,
            region.negativePrompt,
            maskRef,
            region,
            'negative',
            'Negative',
          );
        }
        if (region.autoNegative && region.positivePrompt && negativeRef) {
          const invertedMaskId = addNode({
            class_type: 'InvertMask',
            inputs: { mask: maskRef },
            _meta: { title: `${region.name} Auto-Negative Inverted Mask` },
          });
          negativeRef = appendRegion(
            negativeRef,
            region.positivePrompt,
            [invertedMaskId, 0],
            region,
            'negative',
            'Auto-Negative',
          );
        }
      }
      sinkInputs[contract.positiveSinkInput] = positiveRef;
      if (contract.negativeSinkInput && negativeRef) sinkInputs[contract.negativeSinkInput] = negativeRef;
      sinkNode.inputs = sinkInputs;
    }

    if (controlLayers.length > 0) {
      const sinkEntry = findRole('inpaint_control_model_sink');
      const vaeEntry = findRole('inpaint_control_vae');
      const sinkMeta = sinkEntry?.[1]?._meta && typeof sinkEntry[1]._meta === 'object' ? sinkEntry[1]._meta : {};
      if (!sinkEntry
        || !vaeEntry
        || String(sinkMeta.umbra_control_adapter || '').trim().toLowerCase() !== 'z_image_control'
        || String(sinkMeta.umbra_control_mode || '').trim().toLowerCase() !== 'balanced') {
        throw new Error('The native edit graph does not declare an exact Z-Image model-patch sink and VAE binding.');
      }
      const sinkInputs = sinkEntry[1].inputs && typeof sinkEntry[1].inputs === 'object' ? sinkEntry[1].inputs : {};
      let modelRef = normalizeGraphReference(sinkInputs.model, graph);
      if (!modelRef) throw new Error('The Z-Image control sink does not expose a connected model input.');
      const vaeMeta = vaeEntry[1]?._meta && typeof vaeEntry[1]._meta === 'object' ? vaeEntry[1]._meta : {};
      const sourceMeta = sourceEntry[1]?._meta && typeof sourceEntry[1]._meta === 'object' ? sourceEntry[1]._meta : {};
      const maskMeta = maskEntry[1]?._meta && typeof maskEntry[1]._meta === 'object' ? maskEntry[1]._meta : {};
      const vaeRef: UmbraUiGraphRef = [vaeEntry[0], Math.max(0, Math.floor(Number(vaeMeta.umbra_output_index) || 0))];
      const sourceRef: UmbraUiGraphRef = [sourceEntry[0], Math.max(0, Math.floor(Number(sourceMeta.umbra_output_index) || 0))];
      const maskRef: UmbraUiGraphRef = [maskEntry[0], Math.max(0, Math.floor(Number(maskMeta.umbra_output_index) || 0))];
      for (const control of controlLayers) {
        if (control.adapterType !== 'z_image_control' || control.controlMode !== 'balanced') {
          throw new Error(`${control.name} is not compatible with the declared Z-Image control contract.`);
        }
        if (Math.abs(control.beginStepPercent) > 0.0001 || Math.abs(control.endStepPercent - 1) > 0.0001) {
          throw new Error(`${control.name} must use the full fixed step range for Z-Image Control.`);
        }
        const imageId = addNode({
          class_type: 'LoadImage',
          inputs: { image: control.imageInputName },
          _meta: { title: `${control.name} Control Image` },
        });
        const imageRef = appendUmbraUiControlPreprocessorGraph(
          graph,
          [imageId, 0],
          control,
          `${control.name} ${control.controlType.replace(/_/g, ' ')}`,
        );
        const patchLoaderId = addNode({
          class_type: 'ModelPatchLoader',
          inputs: { name: toComfyNodeInputChoice(control.modelName) },
          _meta: { title: `${control.name} Z-Image Model Patch` },
        });
        const applyId = addNode({
          class_type: 'ZImageFunControlnet',
          inputs: {
            model: modelRef,
            model_patch: [patchLoaderId, 0],
            vae: vaeRef,
            strength: control.weight,
            image: imageRef,
            inpaint_image: sourceRef,
            mask: maskRef,
          },
          _meta: { title: `Apply ${control.name} Z-Image Control` },
        });
        modelRef = [applyId, 0];
      }
      sinkInputs.model = modelRef;
      sinkEntry[1].inputs = sinkInputs;
    }

    const processorEntry = findRole('inpaint_mask_processor');
    if (processorEntry) {
      const inputs = processorEntry[1].inputs && typeof processorEntry[1].inputs === 'object' ? processorEntry[1].inputs : {};
      if (Object.prototype.hasOwnProperty.call(inputs, 'grow')) inputs.grow = Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskGrow, 0))));
      if (Object.prototype.hasOwnProperty.call(inputs, 'dilate')) inputs.dilate = Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskGrow, 0))));
      if (Object.prototype.hasOwnProperty.call(inputs, 'blur')) inputs.blur = Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskFeather, 0))));
      if (Object.prototype.hasOwnProperty.call(inputs, 'feather')) inputs.feather = Math.max(0, Math.min(2048, Math.round(finiteNumberOrFallback(settings.maskFeather, 0))));
      processorEntry[1].inputs = inputs;
    }

    const samplerEntry = findRole('inpaint_sampler');
    if (samplerEntry) {
      const inputs = samplerEntry[1].inputs && typeof samplerEntry[1].inputs === 'object' ? samplerEntry[1].inputs : {};
      if (Object.prototype.hasOwnProperty.call(inputs, 'seed')) inputs.seed = seed;
      if (Object.prototype.hasOwnProperty.call(inputs, 'noise_seed')) inputs.noise_seed = seed;
      if (Object.prototype.hasOwnProperty.call(inputs, 'denoise')) inputs.denoise = Math.max(0.01, Math.min(1, finiteNumberOrFallback(settings.denoise, 0.8)));
      if (Object.prototype.hasOwnProperty.call(inputs, 'denoise_strength')) inputs.denoise_strength = Math.max(0.01, Math.min(1, finiteNumberOrFallback(settings.denoise, 0.8)));
      samplerEntry[1].inputs = inputs;
    }

    const hasOutput = Object.values(graph).some((node: any) => (
      roleOf(node) === 'inpaint_output'
      || ['UmbraLabSaveImage', 'SaveImage', 'PreviewImage'].includes(String(node?.class_type || ''))
    ));
    if (!hasOutput) throw new Error('The native edit workflow does not expose an inpaint_output or image output node.');
    return graph;
  }

  private async monitor(job: UmbraUiInpaintJob, items: UmbraUiInpaintJobItem[]) {
    if (job.status === 'canceled') return;
    job.status = 'running';
    job.updatedAt = Date.now();
    this.persistJobs();
    await Promise.all(items.map(async (item) => {
      if (job.status === 'canceled' || item.status === 'canceled') return;
      item.status = 'running';
      job.updatedAt = Date.now();
      this.persistJobs();
      try {
        const record = await this.waitForHistory(job, item);
        const executionError = readExecutionError(record);
        const status = String(record?.status?.status_str || '').trim().toLowerCase();
        if (executionError || status === 'error') throw new Error(executionError || 'ComfyUI inpaint execution failed.');
        item.outputs = collectOutputs(record);
        if (item.outputs.length <= 0) throw new Error('ComfyUI finished the inpaint sample without reporting a saved output.');
        item.status = 'completed';
      } catch (error: any) {
        if (job.status !== 'canceled' && item.status !== 'canceled') {
          item.status = 'failed';
          item.error = String(error?.message || error || 'Inpaint sample failed.');
        }
      }
      job.completed = job.items.filter((candidate) => candidate.status === 'completed').length;
      job.failed = job.items.filter((candidate) => candidate.status === 'failed').length;
      job.updatedAt = Date.now();
      this.persistJobs();
    }));
    if (job.status === 'canceled') return;
    job.status = job.completed === job.total
      ? 'completed'
      : job.completed > 0 ? 'partial' : 'failed';
    job.updatedAt = Date.now();
    this.persistJobs();
  }

  private async waitForHistory(job: UmbraUiInpaintJob, item: UmbraUiInpaintJobItem): Promise<any> {
    return this.waitForPromptRecord(
      item.promptId,
      () => job.status === 'canceled' || item.status === 'canceled',
      'inpaint',
    );
  }

  private async waitForPromptRecord(promptId: string, isCanceled: () => boolean, label: string): Promise<any> {
    const startedAt = Date.now();
    let lastError = '';
    let lastQueueCheckAt = 0;
    let missingFromQueueSince = 0;
    while (Date.now() - startedAt < HISTORY_TIMEOUT_MS) {
      if (isCanceled()) throw new Error(`${label} canceled.`);
      try {
        const response = await fetch(`${this.getComfyBaseUrl()}/history/${encodeURIComponent(promptId)}`, { cache: 'no-store' });
        if (response.ok) {
          const record = readHistoryRecord(await response.json().catch(() => ({})), promptId);
          if (record) {
            missingFromQueueSince = 0;
            const status = String(record?.status?.status_str || '').trim().toLowerCase();
            if (readExecutionError(record) || status === 'error' || status === 'success' || status === 'completed' || record?.status?.completed === true) {
              return record;
            }
          }
        } else {
          lastError = `${response.status} ${response.statusText}`.trim();
        }
      } catch (error: any) {
        lastError = String(error?.message || error || 'history request failed');
      }
      const now = Date.now();
      if (now - lastQueueCheckAt >= this.queueCheckIntervalMs) {
        lastQueueCheckAt = now;
        try {
          const queueResponse = await fetch(`${this.getComfyBaseUrl()}/queue`, { cache: 'no-store' });
          if (queueResponse.ok) {
            const queuePromptIds = collectQueuePromptIds(await queueResponse.json().catch(() => ({})));
            if (queuePromptIds.has(promptId)) missingFromQueueSince = 0;
            else if (!missingFromQueueSince) missingFromQueueSince = now;
            else if (now - missingFromQueueSince >= this.orphanedPromptGraceMs) {
              throw new Error(`ComfyUI no longer reports ${label} prompt ${promptId} in history or its active queue.`);
            }
          }
        } catch (error: any) {
          const message = String(error?.message || error || 'queue request failed');
          if (message.startsWith('ComfyUI no longer reports')) throw error;
          lastError = message;
        }
      }
      await Bun.sleep(this.historyPollIntervalMs);
    }
    throw new Error(`Timed out waiting for ComfyUI ${label} ${promptId}.${lastError ? ` ${lastError}` : ''}`);
  }

  private async getNodeTypes(): Promise<Set<string>> {
    if (this.nodeTypesCache && Date.now() - this.nodeTypesCache.fetchedAt < 30_000) {
      return new Set(this.nodeTypesCache.values);
    }
    const response = await fetch(`${this.getComfyBaseUrl()}/object_info`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to inspect ComfyUI inpaint support (${response.status}).`);
    const payload = await response.json().catch(() => ({}));
    const objectInfo = payload && typeof payload === 'object' ? payload as Record<string, any> : {};
    const values = new Set(Object.keys(objectInfo));
    this.nodeTypesCache = { fetchedAt: Date.now(), values, objectInfo };
    return new Set(values);
  }

  private async getNodeInputChoices(nodeType: string, inputName: string): Promise<string[]> {
    await this.getNodeTypes();
    const node = this.nodeTypesCache?.objectInfo?.[nodeType];
    const input = node?.input?.required?.[inputName] ?? node?.input?.optional?.[inputName];
    return readComfyNodeInputChoices(input);
  }

  private prune() {
    const cutoff = Date.now() - JOB_RETENTION_MS;
    let changed = false;
    for (const [jobId, job] of this.jobs) {
      if (job.updatedAt < cutoff) {
        this.jobs.delete(jobId);
        changed = true;
      }
    }
    if (changed) this.persistJobs();
  }

  private hydrateJobs(): {
    resumable: Array<[UmbraUiInpaintJob, UmbraUiInpaintJobItem[]]>;
    changed: boolean;
  } {
    if (!this.jobStatePath) return { resumable: [], changed: false };
    try {
      const payload = JSON.parse(readFileSync(this.jobStatePath, 'utf8'));
      const records = Array.isArray(payload?.jobs) ? payload.jobs : [];
      const resumable: Array<[UmbraUiInpaintJob, UmbraUiInpaintJobItem[]]> = [];
      let changed = false;
      for (const raw of records) {
        if (!raw || typeof raw !== 'object' || !String(raw.id || '').trim() || !Array.isArray(raw.items)) {
          changed = true;
          continue;
        }
        let job: UmbraUiInpaintJob;
        try {
          job = cloneJob(raw as UmbraUiInpaintJob);
        } catch {
          changed = true;
          continue;
        }
        const persistedStatus = job.status;
        const activeItems: UmbraUiInpaintJobItem[] = [];
        if (persistedStatus === 'canceled') {
          for (const item of job.items) {
            if (item.status === 'staging' || item.status === 'queued' || item.status === 'running') {
              item.status = 'canceled';
              item.error ||= 'Canceled by user.';
              changed = true;
            }
          }
        } else {
          for (const item of job.items) {
            if (item.status !== 'staging' && item.status !== 'queued' && item.status !== 'running') continue;
            if (String(item.promptId || '').trim()) {
              if (item.status === 'staging') {
                item.status = 'queued';
                changed = true;
              }
              activeItems.push(item);
              continue;
            }
            item.status = 'failed';
            item.error = persistedStatus === 'staging'
              ? 'Umbra restarted before this sample reached ComfyUI.'
              : 'The persisted ComfyUI prompt id is missing.';
            changed = true;
          }
        }
        const total = job.items.length;
        const completed = job.items.filter((item) => item.status === 'completed').length;
        const failed = job.items.filter((item) => item.status === 'failed').length;
        if (job.total !== total || job.completed !== completed || job.failed !== failed) changed = true;
        job.total = total;
        job.completed = completed;
        job.failed = failed;
        const recoveredStatus: UmbraUiInpaintJobStatus = persistedStatus === 'canceled'
          ? 'canceled'
          : activeItems.length > 0
            ? activeItems.some((item) => item.status === 'running') ? 'running' : 'queued'
            : total > 0 && completed === total
              ? 'completed'
              : completed > 0
                ? 'partial'
                : failed > 0
                  ? 'failed'
                  : job.items.length > 0 && job.items.every((item) => item.status === 'canceled')
                    ? 'canceled'
                    : 'failed';
        if (job.status !== recoveredStatus) {
          job.status = recoveredStatus;
          changed = true;
        }
        this.jobs.set(job.id, job);
        if (activeItems.length > 0) resumable.push([job, activeItems]);
      }
      return { resumable, changed };
    } catch {
      return { resumable: [], changed: false };
    }
  }

  private persistJobs(): void {
    if (!this.jobStatePath) return;
    const jobs = Array.from(this.jobs.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(cloneJob);
    const snapshot = JSON.stringify({ version: 1, jobs }, null, 2);
    const target = this.jobStatePath;
    const temporary = `${target}.${createId('write')}.tmp`;
    const write = async () => {
      await mkdir(dirname(target), { recursive: true });
      await writeFileDurably(temporary, snapshot);
      await replaceFileAtomically(temporary, target, this.atomicReplacementHooks);
    };
    this.persistQueue = this.persistQueue.then(write, write).catch(() => undefined);
  }

  private async cleanupStagedInputs(jobId: string): Promise<void> {
    try {
      const inputRoot = String(this.getComfyInputRoot?.() || '').trim();
      if (!inputRoot || !/^umbra-inpaint-[a-z0-9-]+$/i.test(jobId)) return;
      const stagingRoot = resolve(join(inputRoot, 'umbra-ui-inpaint'));
      const target = resolve(join(stagingRoot, jobId));
      if (!target.startsWith(`${stagingRoot}${sep}`)) return;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await rm(target, { recursive: true, force: true });
          return;
        } catch (error) {
          if (attempt >= 5) throw error;
          await Bun.sleep(500 * (attempt + 1));
        }
      }
    } catch {
      // Staging cleanup is best effort; completed outputs remain authoritative.
    }
  }
}
