import JSZip from 'jszip';
import {
  forkUmbraCanvasDocument,
  migrateUmbraCanvasDocument,
  type UmbraCanvasDocument,
  type UmbraCanvasImageAsset,
} from '@/lib/umbraUiCanvasDocument';
import { assertUmbraCanvasInteractiveAllocation } from '@/lib/umbraUiCanvasPerformance';

export interface UmbraCanvasProjectSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  layerCount: number;
  stagingCount: number;
  updatedAt: number;
}

export interface UmbraCanvasProjectSnapshotSummary {
  id: string;
  name: string;
  createdAt: number;
  revision: number;
  layerCount: number;
  stagingCount: number;
}

export interface ImportedUmbraCanvasProject {
  document: UmbraCanvasDocument;
  objectUrls: string[];
}

export interface UmbraCanvasProjectExportProgress {
  phase: 'collecting' | 'compressing';
  completed: number;
  total: number;
  percent: number;
}

export interface UmbraCanvasProjectExportOptions {
  signal?: AbortSignal;
  onProgress?: (progress: UmbraCanvasProjectExportProgress) => void;
}

const ARCHIVE_FORMAT = 'umbra-canvas-project';
const ARCHIVE_VERSION = 1;
const ARCHIVE_ASSET_PREFIX = 'umbra-canvas-archive:';
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

function safeArchiveName(value: string, fallback: string): string {
  const extension = value.trim().replace(/\\/g, '/').split('/').pop()?.match(/\.[a-z0-9]{1,8}$/i)?.[0] || '.png';
  const stem = String(fallback || 'asset').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 120) || 'asset';
  return `${stem}${extension}`;
}

function throwIfProjectExportAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Canvas project export was canceled.', 'AbortError');
}

async function fetchArchiveAsset(imageUrl: string, label: string, signal?: AbortSignal): Promise<Uint8Array> {
  throwIfProjectExportAborted(signal);
  const response = await fetch(imageUrl, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`Could not export canvas asset: ${label}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  throwIfProjectExportAborted(signal);
  if (!bytes.byteLength) throw new Error(`Canvas asset is empty: ${label}`);
  return bytes;
}

export async function exportUmbraCanvasProject(
  document: UmbraCanvasDocument,
  options: UmbraCanvasProjectExportOptions = {},
): Promise<Blob> {
  assertUmbraCanvasInteractiveAllocation(document.width, document.height);
  throwIfProjectExportAborted(options.signal);
  const project = structuredClone(document);
  const zip = new JSZip();
  const archived = new Map<string, string>();
  const totalAssets = project.layers.reduce((total, layer) => (
    total
    + ((layer.kind === 'raster' || layer.kind === 'control' || layer.kind === 'reference') && layer.asset.imageUrl ? 1 : 0)
    + (layer.kind === 'mask' && layer.dataUrl ? 1 : 0)
  ), 0) + project.staging.reduce((total, stage) => (
    total + (stage.asset.imageUrl ? 1 : 0) + (stage.maskDataUrl ? 1 : 0)
  ), 0) + project.pendingJobs.reduce((total, job) => total + (job.maskDataUrl ? 1 : 0), 0);
  let completedAssets = 0;
  const reportAssetCollected = () => {
    completedAssets += 1;
    options.onProgress?.({
      phase: 'collecting',
      completed: completedAssets,
      total: totalAssets,
      percent: totalAssets > 0 ? (completedAssets / totalAssets) * 100 : 100,
    });
  };
  options.onProgress?.({ phase: 'collecting', completed: 0, total: totalAssets, percent: totalAssets > 0 ? 0 : 100 });
  const preserve = async (key: string, name: string, imageUrl: string): Promise<string> => {
    if (!imageUrl) return '';
    throwIfProjectExportAborted(options.signal);
    try {
      const cached = archived.get(key);
      if (cached) return `${ARCHIVE_ASSET_PREFIX}${cached}`;
      const filename = safeArchiveName(name, key);
      const archivePath = `assets/${filename}`;
      zip.file(archivePath, await fetchArchiveAsset(imageUrl, name || key, options.signal));
      archived.set(key, archivePath);
      return `${ARCHIVE_ASSET_PREFIX}${archivePath}`;
    } finally {
      reportAssetCollected();
    }
  };

  for (const layer of project.layers) {
    if (layer.kind === 'raster' || layer.kind === 'control' || layer.kind === 'reference') {
      layer.asset.imageUrl = await preserve(layer.asset.id, layer.asset.name, layer.asset.imageUrl);
      layer.asset.objectUrl = false;
    } else if (layer.kind === 'mask' && layer.dataUrl) {
      layer.dataUrl = await preserve(layer.id, `${layer.name}.png`, layer.dataUrl);
    }
  }
  for (const stage of project.staging) {
    stage.asset.imageUrl = await preserve(stage.asset.id, stage.asset.name, stage.asset.imageUrl);
    stage.asset.objectUrl = false;
    if (stage.maskDataUrl) stage.maskDataUrl = await preserve(`${stage.id}-mask`, `${stage.name}-mask.png`, stage.maskDataUrl);
  }
  for (const job of project.pendingJobs) {
    if (job.maskDataUrl) job.maskDataUrl = await preserve(`${job.id}-pending-mask`, `${job.id}-pending-mask.png`, job.maskDataUrl);
  }

  zip.file('manifest.json', JSON.stringify({
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    projectVersion: project.version,
    name: project.name,
    createdAt: Date.now(),
  }, null, 2));
  zip.file('project.json', JSON.stringify(project, null, 2));
  throwIfProjectExportAborted(options.signal);
  return zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      throwIfProjectExportAborted(options.signal);
      options.onProgress?.({
        phase: 'compressing',
        completed: Math.round(metadata.percent),
        total: 100,
        percent: metadata.percent,
      });
    },
  );
}

export async function importUmbraCanvasProject(file: File | Blob): Promise<ImportedUmbraCanvasProject> {
  if (file.size <= 0) throw new Error('The canvas project archive is empty.');
  if (file.size > MAX_ARCHIVE_BYTES) throw new Error('Canvas project archives are limited to 1 GB.');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestFile = zip.file('manifest.json');
  const projectFile = zip.file('project.json');
  if (!manifestFile || !projectFile) throw new Error('This is not a complete Umbra canvas project archive.');
  const manifest = JSON.parse(await manifestFile.async('string')) as Record<string, unknown>;
  if (manifest.format !== ARCHIVE_FORMAT || Number(manifest.version) > ARCHIVE_VERSION) {
    throw new Error('This canvas project archive format is unsupported or newer than this Umbra build.');
  }
  const rawProject = migrateUmbraCanvasDocument(JSON.parse(await projectFile.async('string')));
  const objectUrls: string[] = [];
  const hydratedAssets = new Map<string, string>();
  const hydrate = async (value: unknown): Promise<unknown> => {
    if (typeof value === 'string' && value.startsWith(ARCHIVE_ASSET_PREFIX)) {
      const archivePath = value.slice(ARCHIVE_ASSET_PREFIX.length).replace(/\\/g, '/');
      if (!archivePath.startsWith('assets/') || archivePath.includes('../')) throw new Error('Canvas project contains an invalid asset path.');
      const existing = hydratedAssets.get(archivePath);
      if (existing) return existing;
      const assetFile = zip.file(archivePath);
      if (!assetFile) throw new Error(`Canvas project asset is missing: ${archivePath}`);
      const archiveBytes = await assetFile.async('uint8array');
      const archiveBuffer = archiveBytes.buffer.slice(
        archiveBytes.byteOffset,
        archiveBytes.byteOffset + archiveBytes.byteLength,
      ) as ArrayBuffer;
      const objectUrl = URL.createObjectURL(new Blob([archiveBuffer], { type: 'image/png' }));
      hydratedAssets.set(archivePath, objectUrl);
      objectUrls.push(objectUrl);
      return objectUrl;
    }
    if (Array.isArray(value)) return Promise.all(value.map(hydrate));
    if (!value || typeof value !== 'object') return value;
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) output[key] = await hydrate(child);
    return output;
  };

  try {
    const hydrated = migrateUmbraCanvasDocument(await hydrate(rawProject));
    return {
      document: forkUmbraCanvasDocument(hydrated, hydrated.name),
      objectUrls,
    };
  } catch (error) {
    for (const objectUrl of objectUrls) URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

function projectAssetPrefix(projectId: string): string {
  return `/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/assets/`;
}

async function readApi<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) throw new Error(String(payload?.error || fallback));
  return payload as T;
}

async function appendAsset(
  form: FormData,
  projectId: string,
  key: string,
  asset: Pick<UmbraCanvasImageAsset, 'name' | 'imageUrl'>,
  appended: Set<string>,
): Promise<void> {
  if (!key || appended.has(key) || !asset.imageUrl || asset.imageUrl.startsWith(projectAssetPrefix(projectId))) return;
  const response = await fetch(asset.imageUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not preserve canvas asset: ${asset.name || key}`);
  const blob = await response.blob();
  if (!blob.size) throw new Error(`Canvas asset is empty: ${asset.name || key}`);
  form.append(`asset:${encodeURIComponent(key)}`, blob, asset.name || `${key}.png`);
  appended.add(key);
}

async function appendMask(
  form: FormData,
  projectId: string,
  key: string,
  imageUrl: string,
  appended: Set<string>,
): Promise<void> {
  if (!key || appended.has(key) || !imageUrl || imageUrl.startsWith(projectAssetPrefix(projectId))) return;
  const response = await fetch(imageUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not preserve canvas mask: ${key}`);
  const blob = await response.blob();
  if (!blob.size) return;
  form.append(`asset:${encodeURIComponent(key)}`, blob, `${key}.png`);
  appended.add(key);
}

export async function saveUmbraCanvasProject(
  document: UmbraCanvasDocument,
  signal?: AbortSignal,
): Promise<UmbraCanvasDocument> {
  assertUmbraCanvasInteractiveAllocation(document.width, document.height);
  const form = new FormData();
  form.append('document', JSON.stringify(document));
  const appended = new Set<string>();
  for (const layer of document.layers) {
    if (layer.kind === 'raster' || layer.kind === 'control' || layer.kind === 'reference') {
      await appendAsset(form, document.id, layer.asset.id, layer.asset, appended);
    }
    if (layer.kind === 'mask' && layer.dataUrl) {
      await appendMask(form, document.id, layer.id, layer.dataUrl, appended);
    }
  }
  for (const stage of document.staging) {
    await appendAsset(form, document.id, stage.asset.id, stage.asset, appended);
    if (stage.maskDataUrl) await appendMask(form, document.id, `${stage.id}-mask`, stage.maskDataUrl, appended);
  }
  for (const job of document.pendingJobs) {
    if (job.maskDataUrl) await appendMask(form, document.id, `${job.id}-pending-mask`, job.maskDataUrl, appended);
  }
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(document.id)}`, {
    method: 'PUT',
    body: form,
    signal,
  });
  const payload = await readApi<{ success: true; project: UmbraCanvasDocument }>(response, 'Failed to save the inpaint project.');
  return migrateUmbraCanvasDocument(payload.project);
}

export async function listUmbraCanvasProjects(signal?: AbortSignal): Promise<UmbraCanvasProjectSummary[]> {
  const response = await fetch('/api/umbra-ui/inpaint/projects', { cache: 'no-store', signal });
  const payload = await readApi<{ success: true; projects: UmbraCanvasProjectSummary[] }>(response, 'Failed to list inpaint projects.');
  return Array.isArray(payload.projects) ? payload.projects : [];
}

export async function loadUmbraCanvasProject(projectId: string, signal?: AbortSignal): Promise<UmbraCanvasDocument> {
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}`, { cache: 'no-store', signal });
  const payload = await readApi<{ success: true; project: UmbraCanvasDocument }>(response, 'Failed to load the inpaint project.');
  return migrateUmbraCanvasDocument(payload.project);
}

export async function deleteUmbraCanvasProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  await readApi<{ success: true }>(response, 'Failed to delete the inpaint project.');
}

export async function listUmbraCanvasProjectSnapshots(projectId: string, signal?: AbortSignal): Promise<UmbraCanvasProjectSnapshotSummary[]> {
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/snapshots`, { cache: 'no-store', signal });
  const payload = await readApi<{ success: true; snapshots: UmbraCanvasProjectSnapshotSummary[] }>(response, 'Failed to list canvas restore points.');
  return Array.isArray(payload.snapshots) ? payload.snapshots : [];
}

export async function createUmbraCanvasProjectSnapshot(projectId: string, name: string): Promise<UmbraCanvasProjectSnapshotSummary> {
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/snapshots`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const payload = await readApi<{ success: true; snapshot: UmbraCanvasProjectSnapshotSummary }>(response, 'Failed to create the canvas restore point.');
  return payload.snapshot;
}

export async function restoreUmbraCanvasProjectSnapshot(projectId: string, snapshotId: string): Promise<UmbraCanvasDocument> {
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}/restore`, { method: 'POST' });
  const payload = await readApi<{ success: true; project: UmbraCanvasDocument }>(response, 'Failed to restore the canvas restore point.');
  return migrateUmbraCanvasDocument(payload.project);
}

export async function deleteUmbraCanvasProjectSnapshot(projectId: string, snapshotId: string): Promise<void> {
  const response = await fetch(`/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotId)}`, { method: 'DELETE' });
  await readApi<{ success: true }>(response, 'Failed to delete the canvas restore point.');
}
