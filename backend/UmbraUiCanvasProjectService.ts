import { mkdir, open, readFile, readdir, rename, rm, stat } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname, extname, join, resolve, sep } from 'path';

const PROJECT_VERSION = 19;
const MAX_PROJECT_JSON_BYTES = 32 * 1024 * 1024;
const MAX_ASSET_BYTES = 256 * 1024 * 1024;
const MAX_CANVAS_SIDE = 16_384;
const MAX_CANVAS_PIXELS = 64 * 1024 * 1024;
const PROJECT_ASSET_PREFIX = 'umbra-project-asset:';
const IMAGE_EXTENSIONS = new Set(['.avif', '.bmp', '.gif', '.jpeg', '.jpg', '.png', '.tif', '.tiff', '.webp']);
const ATOMIC_BACKUP_MARKER = '.umbra-atomic-backup-';
const LEGACY_ATOMIC_BACKUP_MARKER = '.backup-';

export interface UmbraUiCanvasProjectAssetInput {
  key: string;
  name: string;
  bytes: Uint8Array;
}

export interface UmbraUiCanvasProjectSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  layerCount: number;
  stagingCount: number;
  updatedAt: number;
}

export interface UmbraUiCanvasProjectSnapshotSummary {
  id: string;
  name: string;
  createdAt: number;
  revision: number;
  layerCount: number;
  stagingCount: number;
}

export interface UmbraUiCanvasProjectServiceOptions {
  atomicReplacementHooks?: {
    forceBackupPath?: boolean;
    afterBackupCreated?: (paths: {
      temporaryPath: string;
      finalPath: string;
      backupPath: string;
    }) => void | Promise<void>;
  };
}

function safeId(value: unknown, fallback = ''): string {
  const normalized = String(value || '').trim().replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return normalized || fallback;
}

function safeAssetName(key: string, originalName: string, bytes: Uint8Array): string {
  const extension = extname(String(originalName || '')).toLowerCase();
  const digest = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  return `${safeId(key, 'asset')}-${digest}${IMAGE_EXTENSIONS.has(extension) ? extension : '.png'}`;
}

function safeStoredFilename(value: unknown): string {
  const filename = String(value || '').trim().replace(/\\/g, '/').split('/').pop() || '';
  if (!/^[a-z0-9._-]+$/i.test(filename) || !IMAGE_EXTENSIONS.has(extname(filename).toLowerCase())) return '';
  return filename;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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

function parseAtomicBackupFinalName(filename: string): string {
  const parse = (marker: string, suffixPattern: RegExp) => {
    const markerIndex = filename.lastIndexOf(marker);
    if (markerIndex <= 0) return '';
    const suffix = filename.slice(markerIndex + marker.length);
    return suffixPattern.test(suffix) ? filename.slice(0, markerIndex) : '';
  };
  return parse(ATOMIC_BACKUP_MARKER, /^\d+-[a-z0-9]{4,12}$/i)
    || parse(LEGACY_ATOMIC_BACKUP_MARKER, /^(?:\d+-[a-z0-9]{4,12}|interrupted)$/i);
}

async function isUsableAtomicFile(path: string): Promise<boolean> {
  const entry = await stat(path).catch(() => null);
  if (!entry?.isFile() || entry.size <= 0) return false;
  if (extname(path).toLowerCase() !== '.json') return true;
  try {
    const payload = JSON.parse(await readFile(path, 'utf8'));
    return Boolean(payload && typeof payload === 'object' && !Array.isArray(payload));
  } catch {
    return false;
  }
}

async function replaceFileAtomically(
  temporaryPath: string,
  finalPath: string,
  hooks?: UmbraUiCanvasProjectServiceOptions['atomicReplacementHooks'],
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

async function recoverInterruptedAtomicReplacements(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const backupsByFinalName = new Map<string, string[]>();
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const finalName = parseAtomicBackupFinalName(entry.name);
    if (!finalName) continue;
    const candidates = backupsByFinalName.get(finalName) || [];
    candidates.push(entry.name);
    backupsByFinalName.set(finalName, candidates);
  }

  for (const [finalName, backupNames] of backupsByFinalName) {
    const finalPath = join(directory, finalName);
    const finalUsable = await isUsableAtomicFile(finalPath);
    if (finalUsable) {
      await Promise.all(backupNames.map((name) => rm(join(directory, name), { force: true }).catch(() => undefined)));
      continue;
    }

    const candidates = await Promise.all(backupNames.map(async (name) => ({
      name,
      mtimeMs: await stat(join(directory, name)).then((entry) => entry.mtimeMs).catch(() => 0),
      usable: await isUsableAtomicFile(join(directory, name)),
    })));
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.name.localeCompare(left.name));
    const selected = candidates.find((candidate) => candidate.usable);
    if (!selected) continue;
    await rm(finalPath, { force: true }).catch(() => undefined);
    const restored = await rename(join(directory, selected.name), finalPath).then(() => true).catch(() => false);
    if (!restored) continue;
    await syncFileBestEffort(finalPath);
    await syncContainingDirectoryBestEffort(finalPath);
    await Promise.all(candidates
      .filter((candidate) => candidate.name !== selected.name)
      .map((candidate) => rm(join(directory, candidate.name), { force: true }).catch(() => undefined)));
  }

  const afterRecovery = await readdir(directory, { withFileTypes: true }).catch(() => []);
  await Promise.all(afterRecovery.map(async (entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.tmp')) return;
    await rm(join(directory, entry.name), { force: true }).catch(() => undefined);
  }));
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
}

function collectStoredAssetNames(value: unknown, names: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith(PROJECT_ASSET_PREFIX)) {
      const filename = safeStoredFilename(value.slice(PROJECT_ASSET_PREFIX.length));
      if (filename) names.add(filename);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const child of value) collectStoredAssetNames(child, names);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value as Record<string, unknown>)) collectStoredAssetNames(child, names);
}

function normalizeCurvePoints(value: unknown): Array<[number, number]> {
  const clampByte = (entry: unknown) => Math.max(0, Math.min(255, Math.round(Number(entry) || 0)));
  const points = Array.isArray(value)
    ? value
      .filter((point) => Array.isArray(point) && point.length >= 2)
      .map((point) => [clampByte(point[0]), clampByte(point[1])] as [number, number])
      .sort((left, right) => left[0] - right[0])
      .filter((point, index, source) => index === 0 || point[0] !== source[index - 1]?.[0])
      .slice(0, 32)
    : [];
  if (points.length === 0) return [[0, 0], [255, 255]];
  if (points[0][0] !== 0) points.unshift([0, points[0][1]]);
  if (points.at(-1)?.[0] !== 255) points.push([255, points.at(-1)?.[1] ?? 255]);
  return points;
}

function migrateProjectDocument(rawProject: unknown): Record<string, any> {
  const project = cloneJson(asRecord(rawProject));
  const version = Math.max(1, Math.round(Number(project.version) || 1));
  if (version > PROJECT_VERSION) throw new Error(`Inpaint project version ${version} is newer than this Umbra build supports.`);
  const width = Math.round(Number(project.width));
  const height = Math.round(Number(project.height));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('Canvas dimensions must be finite positive pixel values.');
  }
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE) {
    throw new Error(`${width}x${height} exceeds the ${MAX_CANVAS_SIDE}-pixel interactive canvas side limit.`);
  }
  const pixels = width * height;
  if (pixels > MAX_CANVAS_PIXELS) {
    throw new Error(`${width}x${height} (${(pixels / 1_000_000).toFixed(1)} MP) exceeds the 64 MP interactive canvas memory limit.`);
  }
  project.width = width;
  project.height = height;
  project.version = PROJECT_VERSION;
  project.generationRegionAspectRatio = Math.max(0, Math.min(32, Number(project.generationRegionAspectRatio) || 0));
  project.layers = Array.isArray(project.layers) ? project.layers.map((rawLayer: unknown) => {
    const layer = asRecord(rawLayer);
    const hasPersistedOpacity = Object.prototype.hasOwnProperty.call(layer, 'opacity');
    layer.visible = layer.visible !== false;
    layer.locked = layer.locked === true;
    layer.opacity = hasPersistedOpacity
      ? Math.max(0, Math.min(1, Number(layer.opacity) || 0))
      : 1;
    layer.blendMode = [
      'source-over', 'darken', 'multiply', 'color-burn', 'lighten', 'screen', 'color-dodge', 'overlay',
      'soft-light', 'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
    ].includes(String(layer.blendMode || ''))
      ? layer.blendMode
      : 'source-over';
    layer.groupId = String(layer.groupId || '').trim() || undefined;
    if (layer.kind === 'raster') {
      layer.smoothing = ['none', 'low', 'medium', 'high'].includes(String(layer.smoothing || '')) ? layer.smoothing : 'high';
      layer.transparencyLocked = layer.transparencyLocked === true;
      const adjustments = asRecord(layer.adjustments);
      layer.adjustments = {
        enabled: adjustments.enabled === true,
        mode: adjustments.mode === 'curves' ? 'curves' : 'simple',
        brightness: Math.max(-1, Math.min(1, Number(adjustments.brightness) || 0)),
        contrast: Math.max(-1, Math.min(1, Number(adjustments.contrast) || 0)),
        saturation: Math.max(-1, Math.min(1, Number(adjustments.saturation) || 0)),
        temperature: Math.max(-1, Math.min(1, Number(adjustments.temperature) || 0)),
        tint: Math.max(-1, Math.min(1, Number(adjustments.tint) || 0)),
        sharpness: Math.max(0, Math.min(1, Number(adjustments.sharpness) || 0)),
        curves: {
          master: normalizeCurvePoints(asRecord(adjustments.curves).master),
          r: normalizeCurvePoints(asRecord(adjustments.curves).r),
          g: normalizeCurvePoints(asRecord(adjustments.curves).g),
          b: normalizeCurvePoints(asRecord(adjustments.curves).b),
        },
      };
    }
    if (layer.kind === 'mask') {
      layer.purpose = layer.purpose === 'regional_guidance'
        ? 'regional_guidance'
        : layer.purpose === 'reference'
          ? 'reference'
        : layer.purpose === 'layer'
          ? 'layer'
          : 'inpaint';
      layer.noiseLevel = Math.max(0, Math.min(1, Number(layer.noiseLevel) || 0));
      layer.denoiseLimit = layer.denoiseLimit === undefined ? 1 : Math.max(0, Math.min(1, Number(layer.denoiseLimit) || 0));
    }
    if (layer.kind === 'reference') {
      const referenceMethods = ['style_model', 'ip_adapter', 'flux_redux', 'flux_kontext', 'flux2_reference', 'qwen_image_reference', 'hidream_o1_reference'];
      layer.method = referenceMethods.includes(String(layer.method || '')) ? layer.method : 'style_model';
      layer.crop = layer.crop === 'none' ? 'none' : 'center';
      layer.strengthType = layer.strengthType === 'attn_bias' ? 'attn_bias' : 'multiply';
      layer.weight = layer.method === 'ip_adapter'
        ? Math.max(-1, Math.min(5, Number(layer.weight) || 0))
        : layer.method === 'style_model' || layer.method === 'flux_redux'
          ? Math.max(0, Math.min(10, Number(layer.weight) || 0))
          : 1;
      layer.beginStepPercent = Math.max(0, Math.min(1, Number(layer.beginStepPercent) || 0));
      layer.endStepPercent = Math.max(layer.beginStepPercent, Math.min(1, Number(layer.endStepPercent) || 1));
      const weightTypes = ['linear', 'ease in', 'ease out', 'ease in-out', 'reverse in-out', 'weak input', 'weak output', 'weak middle', 'strong middle', 'style transfer', 'composition', 'strong style transfer', 'style and composition', 'style transfer precise', 'composition precise'];
      const combineModes = ['concat', 'add', 'subtract', 'average', 'norm average'];
      const scalingModes = ['V only', 'K+V', 'K+V w/ C penalty', 'K+mean(V) w/ C penalty'];
      layer.ipAdapterWeightType = weightTypes.includes(String(layer.ipAdapterWeightType || '')) ? layer.ipAdapterWeightType : 'linear';
      layer.ipAdapterCombineEmbeds = combineModes.includes(String(layer.ipAdapterCombineEmbeds || '')) ? layer.ipAdapterCombineEmbeds : 'concat';
      layer.ipAdapterEmbedsScaling = scalingModes.includes(String(layer.ipAdapterEmbedsScaling || '')) ? layer.ipAdapterEmbedsScaling : 'V only';
      layer.maskLayerId = String(layer.maskLayerId || '').trim() || undefined;
      layer.regionLayerId = String(layer.regionLayerId || '').trim() || undefined;
    }
    if (layer.kind === 'regional_guidance') layer.autoNegative = layer.autoNegative === true;
    return layer;
  }) : [];
  const regionalLayerIds = new Set(project.layers
    .filter((layer: Record<string, any>) => layer.kind === 'regional_guidance')
    .map((layer: Record<string, any>) => String(layer.id || '')));
  project.layers = project.layers.map((layer: Record<string, any>) => {
    if (layer.kind !== 'reference') return layer;
    if (layer.method !== 'ip_adapter') return { ...layer, maskLayerId: undefined, regionLayerId: undefined };
    if (layer.regionLayerId && regionalLayerIds.has(layer.regionLayerId)) return { ...layer, maskLayerId: undefined };
    return { ...layer, regionLayerId: undefined };
  });
  const referencedMaskIds = new Set(project.layers.flatMap((layer: Record<string, any>) => (
    typeof layer.maskLayerId === 'string' && layer.maskLayerId ? [layer.maskLayerId] : []
  )));
  project.layers = project.layers.filter((layer: Record<string, any>) => (
    layer.kind !== 'mask' || layer.purpose !== 'reference' || referencedMaskIds.has(layer.id)
  ));
  project.staging = Array.isArray(project.staging) ? project.staging : [];
  project.pendingJobs = Array.isArray(project.pendingJobs) ? project.pendingJobs : [];
  return project;
}

export class UmbraUiCanvasProjectService {
  private readonly root: string;
  private readonly recoveryPromise: Promise<void>;
  private readonly atomicReplacementHooks?: UmbraUiCanvasProjectServiceOptions['atomicReplacementHooks'];

  constructor(userRoot: string, options: UmbraUiCanvasProjectServiceOptions = {}) {
    this.root = resolve(userRoot, 'UmbraUI', 'InpaintProjects');
    this.atomicReplacementHooks = options.atomicReplacementHooks;
    this.recoveryPromise = this.recoverInterruptedTransactions();
  }

  private async recoverInterruptedTransactions(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    const projects = await readdir(this.root, { withFileTypes: true }).catch(() => []);
    await Promise.all(projects.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const projectRoot = join(this.root, entry.name);
      await recoverInterruptedAtomicReplacements(projectRoot);
      await recoverInterruptedAtomicReplacements(join(projectRoot, 'assets'));
      await recoverInterruptedAtomicReplacements(join(projectRoot, 'snapshots'));
    }));
  }

  private projectRoot(projectId: string): string {
    const id = safeId(projectId);
    if (!id) throw new Error('A valid inpaint project id is required.');
    const target = resolve(this.root, id);
    if (target !== this.root && !target.startsWith(`${this.root}${sep}`)) throw new Error('Invalid inpaint project path.');
    return target;
  }

  private projectAssetUrl(projectId: string, filename: string): string {
    return `/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(filename)}`;
  }

  private snapshotRoot(projectId: string): string {
    return join(this.projectRoot(projectId), 'snapshots');
  }

  private snapshotPath(projectId: string, snapshotIdInput: string): string {
    const snapshotId = safeId(snapshotIdInput);
    if (!snapshotId) throw new Error('A valid canvas restore point id is required.');
    const root = resolve(this.snapshotRoot(projectId));
    const target = resolve(root, `${snapshotId}.json`);
    if (!target.startsWith(`${root}${sep}`)) throw new Error('Invalid canvas restore point path.');
    return target;
  }

  private async readSnapshot(projectId: string, snapshotId: string): Promise<Record<string, any> | null> {
    try {
      return asRecord(JSON.parse(await readFile(this.snapshotPath(projectId, snapshotId), 'utf8')));
    } catch {
      return null;
    }
  }

  private async collectSnapshotAssetNames(projectId: string, names: Set<string>): Promise<void> {
    const entries = await readdir(this.snapshotRoot(projectId), { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const snapshot = asRecord(JSON.parse(await readFile(join(this.snapshotRoot(projectId), entry.name), 'utf8')));
        collectStoredAssetNames(snapshot.project, names);
      } catch {
        // Ignore a malformed restore point while preserving normal project saves.
      }
    }
  }

  private hydrateProject(projectId: string, rawProject: unknown): Record<string, any> {
    const project = cloneJson(asRecord(rawProject));
    const hydrate = (value: unknown): unknown => {
      if (typeof value === 'string' && value.startsWith(PROJECT_ASSET_PREFIX)) {
        return this.projectAssetUrl(projectId, value.slice(PROJECT_ASSET_PREFIX.length));
      }
      if (Array.isArray(value)) return value.map(hydrate);
      if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          (value as Record<string, unknown>)[key] = hydrate(child);
        }
      }
      return value;
    };
    return hydrate(project) as Record<string, any>;
  }

  private dehydrateExistingProjectUrl(projectId: string, value: unknown): string {
    const raw = String(value || '').trim();
    const prefix = `/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/assets/`;
    if (raw.startsWith(prefix)) {
      return `${PROJECT_ASSET_PREFIX}${decodeURIComponent(raw.slice(prefix.length).split(/[?#]/, 1)[0] || '')}`;
    }
    return raw;
  }

  private async readStored(projectId: string): Promise<Record<string, any> | null> {
    try {
      const raw = await readFile(join(this.projectRoot(projectId), 'project.json'), 'utf8');
      return asRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(
    projectIdInput: string,
    rawProject: unknown,
    assetInputs: UmbraUiCanvasProjectAssetInput[],
  ): Promise<Record<string, any>> {
    await this.recoveryPromise;
    const projectId = safeId(projectIdInput);
    const source = migrateProjectDocument(rawProject);
    if (!projectId) throw new Error('Unsupported or invalid inpaint project document.');
    const rawJson = JSON.stringify(source);
    if (Buffer.byteLength(rawJson, 'utf8') > MAX_PROJECT_JSON_BYTES) throw new Error('The inpaint project document exceeds the 32 MB limit.');

    const projectRoot = this.projectRoot(projectId);
    const assetsRoot = join(projectRoot, 'assets');
    await mkdir(assetsRoot, { recursive: true });
    const stored = await this.readStored(projectId);
    const project = cloneJson(source);
    project.id = projectId;
    project.version = PROJECT_VERSION;
    project.name = String(project.name || 'Untitled Canvas').trim().slice(0, 240) || 'Untitled Canvas';
    project.layers = Array.isArray(project.layers) ? project.layers : [];
    project.staging = Array.isArray(project.staging) ? project.staging : [];
    project.pendingJobs = Array.isArray(project.pendingJobs) ? project.pendingJobs : [];
    project.updatedAt = Date.now();

    const uploaded = new Map<string, string>();
    const pendingAssetWrites: Array<{ filename: string; bytes: Uint8Array }> = [];
    for (const input of assetInputs) {
      const key = safeId(input.key);
      if (!key || input.bytes.byteLength <= 0) continue;
      if (input.bytes.byteLength > MAX_ASSET_BYTES) throw new Error(`Canvas asset ${key} exceeds the 256 MB limit.`);
      const filename = safeAssetName(key, input.name, input.bytes);
      uploaded.set(key, filename);
      pendingAssetWrites.push({ filename, bytes: input.bytes });
    }

    const storedLayers = new Map(
      (Array.isArray(stored?.layers) ? stored.layers : []).map((layer: any) => [String(layer?.id || ''), layer]),
    );
    const storedStages = new Map(
      (Array.isArray(stored?.staging) ? stored.staging : []).map((stage: any) => [String(stage?.id || ''), stage]),
    );
    const storedPendingJobs = new Map(
      (Array.isArray(stored?.pendingJobs) ? stored.pendingJobs : []).map((job: any) => [String(job?.id || ''), job]),
    );
    const persistAsset = (asset: Record<string, any>, previousAsset: Record<string, any>) => {
      const assetId = safeId(asset.id);
      const uploadedName = uploaded.get(assetId);
      const currentUrl = this.dehydrateExistingProjectUrl(projectId, asset.imageUrl);
      const previousUrl = String(previousAsset?.imageUrl || '');
      if (uploadedName) asset.imageUrl = `${PROJECT_ASSET_PREFIX}${uploadedName}`;
      else if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) asset.imageUrl = currentUrl;
      else if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) asset.imageUrl = previousUrl;
      else if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Canvas asset ${asset.name || assetId} was not uploaded with the project.`);
    };

    for (const layer of project.layers) {
      const previous = asRecord(storedLayers.get(String(layer?.id || '')));
      if (layer?.kind === 'raster' || layer?.kind === 'control' || layer?.kind === 'reference') {
        persistAsset(asRecord(layer.asset), asRecord(previous.asset));
      }
      if (layer?.kind === 'mask') {
        const layerId = safeId(layer.id);
        const uploadedName = uploaded.get(layerId);
        const currentUrl = this.dehydrateExistingProjectUrl(projectId, layer.dataUrl);
        const previousUrl = String(previous.dataUrl || '');
        if (uploadedName) layer.dataUrl = `${PROJECT_ASSET_PREFIX}${uploadedName}`;
        else if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) layer.dataUrl = currentUrl;
        else if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) layer.dataUrl = previousUrl;
        else if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Mask layer ${layer.name || layerId} was not uploaded with the project.`);
      }
    }
    for (const stage of project.staging) {
      const previous = asRecord(storedStages.get(String(stage?.id || '')));
      persistAsset(asRecord(stage.asset), asRecord(previous.asset));
      const stageId = safeId(stage.id);
      const maskKey = safeId(`${stageId}-mask`);
      const uploadedName = uploaded.get(maskKey);
      const currentUrl = this.dehydrateExistingProjectUrl(projectId, stage.maskDataUrl);
      const previousUrl = String(previous.maskDataUrl || '');
      if (uploadedName) stage.maskDataUrl = `${PROJECT_ASSET_PREFIX}${uploadedName}`;
      else if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) stage.maskDataUrl = currentUrl;
      else if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) stage.maskDataUrl = previousUrl;
      else if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Staged mask ${stage.name || stageId} was not uploaded with the project.`);
    }
    for (const job of project.pendingJobs) {
      const previous = asRecord(storedPendingJobs.get(String(job?.id || '')));
      const jobId = safeId(job.id);
      const maskKey = safeId(`${jobId}-pending-mask`);
      const uploadedName = uploaded.get(maskKey);
      const currentUrl = this.dehydrateExistingProjectUrl(projectId, job.maskDataUrl);
      const previousUrl = String(previous.maskDataUrl || '');
      if (uploadedName) job.maskDataUrl = `${PROJECT_ASSET_PREFIX}${uploadedName}`;
      else if (currentUrl.startsWith(PROJECT_ASSET_PREFIX)) job.maskDataUrl = currentUrl;
      else if (previousUrl.startsWith(PROJECT_ASSET_PREFIX)) job.maskDataUrl = previousUrl;
      else if (/^(blob:|data:)/i.test(currentUrl)) throw new Error(`Pending job mask ${jobId} was not uploaded with the project.`);
    }

    const serialized = JSON.stringify(project, null, 2);
    const transactionId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const temporaryPaths = new Set<string>();
    const temporaryPath = join(projectRoot, `project.${transactionId}.tmp`);
    const finalPath = join(projectRoot, 'project.json');
    try {
      for (const asset of pendingAssetWrites) {
        const finalAssetPath = join(assetsRoot, asset.filename);
        const existingSize = await stat(finalAssetPath).then((entry) => entry.size).catch(() => -1);
        if (existingSize === asset.bytes.byteLength) continue;
        const temporaryAssetPath = join(assetsRoot, `.${asset.filename}.${transactionId}.tmp`);
        temporaryPaths.add(temporaryAssetPath);
        await writeFileDurably(temporaryAssetPath, asset.bytes);
        await replaceFileAtomically(temporaryAssetPath, finalAssetPath, this.atomicReplacementHooks);
        temporaryPaths.delete(temporaryAssetPath);
      }
      temporaryPaths.add(temporaryPath);
      await writeFileDurably(temporaryPath, serialized);
      await replaceFileAtomically(temporaryPath, finalPath, this.atomicReplacementHooks);
      temporaryPaths.delete(temporaryPath);
    } catch (error) {
      await Promise.all(Array.from(temporaryPaths, (path) => rm(path, { force: true }).catch(() => undefined)));
      throw error;
    }
    const referencedAssets = new Set<string>();
    collectStoredAssetNames(project, referencedAssets);
    await this.collectSnapshotAssetNames(projectId, referencedAssets);
    const assetEntries = await readdir(assetsRoot, { withFileTypes: true }).catch(() => []);
    await Promise.all(assetEntries.map(async (entry) => {
      if (!entry.isFile() || referencedAssets.has(entry.name)) return;
      await rm(join(assetsRoot, entry.name), { force: true });
    }));
    return this.hydrateProject(projectId, project);
  }

  async get(projectIdInput: string): Promise<Record<string, any> | null> {
    await this.recoveryPromise;
    const projectId = safeId(projectIdInput);
    if (!projectId) return null;
    const stored = await this.readStored(projectId);
    return stored ? this.hydrateProject(projectId, migrateProjectDocument(stored)) : null;
  }

  async list(): Promise<UmbraUiCanvasProjectSummary[]> {
    await this.recoveryPromise;
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    const summaries: UmbraUiCanvasProjectSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const project = await this.readStored(entry.name);
      if (!project) continue;
      const projectId = safeId(project.id, entry.name);
      const layers = Array.isArray(project.layers) ? project.layers : [];
      const staging = Array.isArray(project.staging) ? project.staging : [];
      const previewStageId = String(project.previewStageId || '').trim();
      const previewStage = previewStageId
        ? staging.find((stage: any) => String(stage?.id || '') === previewStageId)
        : null;
      const topVisibleRaster = [...layers]
        .reverse()
        .find((layer: any) => layer?.kind === 'raster' && layer?.visible !== false && layer?.asset?.imageUrl);
      const latestStage = [...staging]
        .filter((stage: any) => stage?.asset?.imageUrl)
        .sort((left: any, right: any) => Number(right?.createdAt) - Number(left?.createdAt))[0];
      const fallbackRaster = layers.find((layer: any) => layer?.kind === 'raster' && layer?.asset?.imageUrl);
      const thumbnailAssetUrl = String(
        previewStage?.asset?.imageUrl
        || topVisibleRaster?.asset?.imageUrl
        || latestStage?.asset?.imageUrl
        || fallbackRaster?.asset?.imageUrl
        || '',
      );
      const thumbnailFilename = thumbnailAssetUrl.startsWith(PROJECT_ASSET_PREFIX)
        ? safeStoredFilename(thumbnailAssetUrl.slice(PROJECT_ASSET_PREFIX.length))
        : '';
      const updatedAt = Number(project.updatedAt) || 0;
      summaries.push({
        id: projectId,
        name: String(project.name || entry.name),
        thumbnailUrl: thumbnailFilename
          ? `${this.projectAssetUrl(projectId, thumbnailFilename)}?thumb=1`
          : '',
        width: Math.max(1, Math.round(Number(project.width) || 1)),
        height: Math.max(1, Math.round(Number(project.height) || 1)),
        layerCount: layers.length,
        stagingCount: staging.length,
        updatedAt,
      });
    }
    return summaries.sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  }

  async listSnapshots(projectIdInput: string): Promise<UmbraUiCanvasProjectSnapshotSummary[]> {
    await this.recoveryPromise;
    const projectId = safeId(projectIdInput);
    if (!projectId) return [];
    const entries = await readdir(this.snapshotRoot(projectId), { withFileTypes: true }).catch(() => []);
    const snapshots: UmbraUiCanvasProjectSnapshotSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const snapshot = asRecord(JSON.parse(await readFile(join(this.snapshotRoot(projectId), entry.name), 'utf8')));
        const project = asRecord(snapshot.project);
        const id = safeId(snapshot.id, entry.name.slice(0, -5));
        if (!id) continue;
        snapshots.push({
          id,
          name: String(snapshot.name || 'Restore Point').trim().slice(0, 160) || 'Restore Point',
          createdAt: Number(snapshot.createdAt) || 0,
          revision: Math.max(0, Math.round(Number(project.revision) || 0)),
          layerCount: Array.isArray(project.layers) ? project.layers.length : 0,
          stagingCount: Array.isArray(project.staging) ? project.staging.length : 0,
        });
      } catch {
        // Ignore malformed restore point records.
      }
    }
    return snapshots.sort((left, right) => right.createdAt - left.createdAt || left.name.localeCompare(right.name));
  }

  async createSnapshot(projectIdInput: string, nameInput: unknown): Promise<UmbraUiCanvasProjectSnapshotSummary> {
    await this.recoveryPromise;
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid inpaint project id is required.');
    const stored = await this.readStored(projectId);
    if (!stored) throw new Error('Save the canvas project before creating a restore point.');
    const createdAt = Date.now();
    const name = String(nameInput || 'Restore Point').trim().slice(0, 160) || 'Restore Point';
    const id = safeId(`${createdAt}-${name}-${Math.random().toString(36).slice(2, 8)}`);
    const root = this.snapshotRoot(projectId);
    await mkdir(root, { recursive: true });
    const snapshot = { id, name, createdAt, project: migrateProjectDocument(stored) };
    const temporaryPath = join(root, `${id}.${createdAt}.tmp`);
    const finalPath = this.snapshotPath(projectId, id);
    try {
      await writeFileDurably(temporaryPath, JSON.stringify(snapshot, null, 2));
      await replaceFileAtomically(temporaryPath, finalPath, this.atomicReplacementHooks);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    const snapshots = await this.listSnapshots(projectId);
    await Promise.all(snapshots.slice(50).map((candidate) => rm(this.snapshotPath(projectId, candidate.id), { force: true })));
    return {
      id,
      name,
      createdAt,
      revision: Math.max(0, Math.round(Number(stored.revision) || 0)),
      layerCount: Array.isArray(stored.layers) ? stored.layers.length : 0,
      stagingCount: Array.isArray(stored.staging) ? stored.staging.length : 0,
    };
  }

  async restoreSnapshot(projectIdInput: string, snapshotIdInput: string): Promise<Record<string, any>> {
    await this.recoveryPromise;
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid inpaint project id is required.');
    const snapshot = await this.readSnapshot(projectId, snapshotIdInput);
    if (!snapshot?.project) throw new Error('The canvas restore point was not found.');
    const project = migrateProjectDocument(snapshot.project);
    project.id = projectId;
    project.updatedAt = Date.now();
    project.revision = Math.max(1, Math.round(Number(project.revision) || 0) + 1);
    const root = this.projectRoot(projectId);
    await mkdir(root, { recursive: true });
    const temporaryPath = join(root, `project.restore.${Date.now()}.tmp`);
    const finalPath = join(root, 'project.json');
    try {
      await writeFileDurably(temporaryPath, JSON.stringify(project, null, 2));
      await replaceFileAtomically(temporaryPath, finalPath, this.atomicReplacementHooks);
    } catch (error) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
      throw error;
    }
    return this.hydrateProject(projectId, project);
  }

  async deleteSnapshot(projectIdInput: string, snapshotIdInput: string): Promise<void> {
    await this.recoveryPromise;
    const projectId = safeId(projectIdInput);
    if (!projectId) throw new Error('A valid inpaint project id is required.');
    await rm(this.snapshotPath(projectId, snapshotIdInput), { force: true });
  }

  async delete(projectIdInput: string): Promise<void> {
    await this.recoveryPromise;
    const projectRoot = this.projectRoot(projectIdInput);
    await rm(projectRoot, { recursive: true, force: true });
  }

  async resolveAsset(projectIdInput: string, filenameInput: string): Promise<{ path: string; size: number } | null> {
    await this.recoveryPromise;
    const projectRoot = this.projectRoot(projectIdInput);
    const filename = safeStoredFilename(filenameInput);
    if (!filename) return null;
    const target = resolve(projectRoot, 'assets', filename);
    const assetsRoot = resolve(projectRoot, 'assets');
    if (target !== assetsRoot && !target.startsWith(`${assetsRoot}${sep}`)) return null;
    try {
      const info = await stat(target);
      return info.isFile() ? { path: target, size: info.size } : null;
    } catch {
      return null;
    }
  }
}
