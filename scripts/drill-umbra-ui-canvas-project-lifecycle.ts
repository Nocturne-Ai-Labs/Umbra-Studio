import { randomUUID } from 'crypto';
import { mkdir, rename, rm, writeFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import {
  createUmbraCanvasDocument,
  forkUmbraCanvasDocument,
  UMBRA_CANVAS_DOCUMENT_VERSION,
  umbraCanvasDocumentReducer,
  type UmbraCanvasDocument,
  type UmbraCanvasImageAsset,
} from '../frontend/src/lib/umbraUiCanvasDocument';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8212';
const PNG_BYTES = Uint8Array.from(Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+H9p2AAAAAElFTkSuQmCC',
  'base64',
));

interface ApiResult {
  success?: boolean;
  error?: string;
  project?: UmbraCanvasDocument;
  projects?: Array<{ id: string }>;
  snapshot?: { id: string; name: string };
}

interface LifecycleReport {
  schemaVersion: 1;
  startedAt: string;
  finishedAt: string;
  baseUrl: string;
  projectId: string;
  forkProjectId: string;
  passed: boolean;
  checks: Record<string, boolean>;
  error: string;
}

function parseBaseUrl(): string {
  const argumentIndex = process.argv.indexOf('--base-url');
  const raw = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : DEFAULT_BASE_URL;
  const url = new URL(String(raw || DEFAULT_BASE_URL));
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) {
    throw new Error('Canvas project lifecycle drills are restricted to a loopback Umbra server.');
  }
  return url.origin;
}

async function readApi(response: Response, label: string): Promise<ApiResult> {
  const payload = await response.json().catch(() => ({})) as ApiResult;
  if (!response.ok || payload.success === false) {
    throw new Error(payload.error || `${label} failed with HTTP ${response.status}.`);
  }
  return payload;
}

async function saveProject(
  baseUrl: string,
  document: UmbraCanvasDocument,
  uploadAssetIds: string[] = [],
): Promise<UmbraCanvasDocument> {
  const form = new FormData();
  form.append('document', JSON.stringify(document));
  for (const assetId of uploadAssetIds) {
    const layer = document.layers.find((candidate) => (
      (candidate.kind === 'raster' || candidate.kind === 'control' || candidate.kind === 'reference')
        && candidate.asset.id === assetId
    ));
    if (!layer || (layer.kind !== 'raster' && layer.kind !== 'control' && layer.kind !== 'reference')) {
      throw new Error(`The lifecycle project asset ${assetId} is missing.`);
    }
    form.append(
      `asset:${encodeURIComponent(layer.asset.id)}`,
      new Blob([PNG_BYTES], { type: 'image/png' }),
      layer.asset.name,
    );
  }
  const payload = await readApi(await fetch(
    `${baseUrl}/api/umbra-ui/inpaint/projects/${encodeURIComponent(document.id)}`,
    { method: 'PUT', body: form },
  ), 'Save project');
  if (!payload.project) throw new Error('Save project did not return the stored document.');
  return payload.project;
}

async function rejectedProjectSaveError(
  baseUrl: string,
  document: UmbraCanvasDocument,
): Promise<string> {
  const form = new FormData();
  form.append('document', JSON.stringify(document));
  const response = await fetch(
    `${baseUrl}/api/umbra-ui/inpaint/projects/${encodeURIComponent(document.id)}`,
    { method: 'PUT', body: form },
  );
  const payload = await response.json().catch(() => ({})) as ApiResult;
  if (response.ok || payload.success !== false) {
    throw new Error(`Unsafe canvas ${document.width}x${document.height} was accepted unexpectedly.`);
  }
  return String(payload.error || '').trim();
}

async function deleteProject(baseUrl: string, projectId: string): Promise<void> {
  const response = await fetch(
    `${baseUrl}/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}`,
    { method: 'DELETE' },
  );
  if (response.status === 404) return;
  await readApi(response, 'Delete project');
}

async function projectExists(baseUrl: string, projectId: string): Promise<boolean> {
  const response = await fetch(`${baseUrl}/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}`);
  if (response.status === 404) return false;
  await readApi(response, 'Load project');
  return true;
}

async function writeReport(report: LifecycleReport): Promise<string> {
  const root = resolve(import.meta.dir, '..');
  const reportPath = resolve(
    root,
    'User',
    'UmbraUI',
    'QualificationReports',
    `canvas-project-lifecycle-${report.finishedAt.replace(/[:.]/g, '-')}.json`,
  );
  await mkdir(dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, reportPath);
  return reportPath;
}

async function main(): Promise<void> {
  const baseUrl = parseBaseUrl();
  const startedAt = new Date().toISOString();
  const suffix = randomUUID();
  const projectId = `qualification-canvas-${suffix}`;
  const forkProjectId = `qualification-canvas-fork-${suffix}`;
  const unsafeSideProjectId = `qualification-canvas-unsafe-side-${suffix}`;
  const unsafeAreaProjectId = `qualification-canvas-unsafe-area-${suffix}`;
  const checks: Record<string, boolean> = {};
  let error = '';

  try {
    const rootResponse = await fetch(`${baseUrl}/`);
    if (!rootResponse.ok) throw new Error(`Umbra did not answer at ${baseUrl}.`);

    const asset: UmbraCanvasImageAsset = {
      id: `qualification-asset-${suffix}`,
      name: 'qualification-source.png',
      imageUrl: `blob:${suffix}`,
      path: '',
      width: 1,
      height: 1,
    };
    const initial = createUmbraCanvasDocument(asset, 'Lifecycle Baseline');
    initial.id = projectId;
    const legacyInitial = initial as unknown as Record<string, any>;
    legacyInitial.version = 1;
    delete legacyInitial.generationRegionAspectRatio;
    delete legacyInitial.bookmarkedLayerId;
    for (const layer of legacyInitial.layers) {
      delete layer.opacity;
      delete layer.blendMode;
      if (layer.kind === 'mask') delete layer.purpose;
    }
    const saved = await saveProject(baseUrl, initial, [asset.id]);
    const savedSource = saved.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    if (!savedSource || savedSource.kind !== 'raster') throw new Error('Saved project lost its source layer.');
    const savedMask = saved.layers.find((layer) => layer.kind === 'mask');
    checks.historicalDocumentMigrated = saved.version === UMBRA_CANVAS_DOCUMENT_VERSION
      && saved.generationRegionAspectRatio === 0
      && savedSource.opacity === 1
      && savedSource.blendMode === 'source-over'
      && savedMask?.kind === 'mask'
      && savedMask.purpose === 'inpaint';
    const sourceAssetUrl = new URL(savedSource.asset.imageUrl, baseUrl).href;
    const sourceAssetResponse = await fetch(sourceAssetUrl);
    checks.initialSaveAndAssetReload = sourceAssetResponse.ok
      && (await sourceAssetResponse.arrayBuffer()).byteLength === PNG_BYTES.byteLength;

    const unsafeSide = structuredClone(saved);
    unsafeSide.id = unsafeSideProjectId;
    unsafeSide.width = 16_385;
    unsafeSide.height = 1;
    const unsafeSideError = await rejectedProjectSaveError(baseUrl, unsafeSide);
    checks.oversizedSideRefused = unsafeSideError.includes('16384-pixel interactive canvas side limit')
      && !await projectExists(baseUrl, unsafeSideProjectId);

    const unsafeArea = structuredClone(saved);
    unsafeArea.id = unsafeAreaProjectId;
    unsafeArea.width = 9_000;
    unsafeArea.height = 9_000;
    const unsafeAreaError = await rejectedProjectSaveError(baseUrl, unsafeArea);
    checks.oversizedAreaRefused = unsafeAreaError.includes('64 MP interactive canvas memory limit')
      && !await projectExists(baseUrl, unsafeAreaProjectId);

    const orphanAsset: UmbraCanvasImageAsset = {
      id: `qualification-orphan-${suffix}`,
      name: 'qualification-orphan.png',
      imageUrl: `blob:${suffix}-orphan`,
      path: '',
      width: 1,
      height: 1,
    };
    const withOrphan = umbraCanvasDocumentReducer(saved, {
      type: 'add_raster_layer',
      asset: orphanAsset,
      name: 'Disposable Raster',
    });
    const savedWithOrphan = await saveProject(baseUrl, withOrphan, [orphanAsset.id]);
    const orphanLayer = savedWithOrphan.layers.find((layer) => (
      layer.kind === 'raster' && layer.asset.id === orphanAsset.id
    ));
    if (!orphanLayer || orphanLayer.kind !== 'raster') throw new Error('Disposable raster was not saved.');
    const orphanAssetUrl = new URL(orphanLayer.asset.imageUrl, baseUrl).href;
    const withoutOrphan = umbraCanvasDocumentReducer(savedWithOrphan, {
      type: 'remove_layer',
      layerId: orphanLayer.id,
    });
    const savedWithoutOrphan = await saveProject(baseUrl, withoutOrphan);
    checks.orphanAssetRemoved = (await fetch(orphanAssetUrl)).status === 404;
    checks.reachableSourceRetained = (await fetch(sourceAssetUrl)).ok;

    const snapshotPayload = await readApi(await fetch(
      `${baseUrl}/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/snapshots`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Lifecycle Baseline' }),
      },
    ), 'Create restore point');
    if (!snapshotPayload.snapshot?.id) throw new Error('Create restore point did not return an id.');
    checks.restorePointCreated = snapshotPayload.snapshot.name === 'Lifecycle Baseline';

    const mutated = structuredClone(savedWithoutOrphan);
    mutated.name = 'Lifecycle Mutated';
    mutated.revision += 1;
    mutated.updatedAt = Date.now();
    const savedMutation = await saveProject(baseUrl, mutated);
    checks.mutationSaved = savedMutation.name === 'Lifecycle Mutated';

    const restoredPayload = await readApi(await fetch(
      `${baseUrl}/api/umbra-ui/inpaint/projects/${encodeURIComponent(projectId)}/snapshots/${encodeURIComponent(snapshotPayload.snapshot.id)}/restore`,
      { method: 'POST' },
    ), 'Restore project');
    if (!restoredPayload.project) throw new Error('Restore project did not return a document.');
    checks.restoreRecoveredBaseline = restoredPayload.project.name === 'Lifecycle Baseline';

    const fork = forkUmbraCanvasDocument(restoredPayload.project, 'Lifecycle Fork');
    fork.id = forkProjectId;
    const forkSource = fork.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    if (!forkSource || forkSource.kind !== 'raster') throw new Error('Forked project lost its source layer.');
    forkSource.asset.imageUrl = `blob:${suffix}-fork`;
    forkSource.asset.path = '';
    const savedFork = await saveProject(baseUrl, fork, [forkSource.asset.id]);
    const savedForkSource = savedFork.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    if (!savedForkSource || savedForkSource.kind !== 'raster') throw new Error('Saved fork lost its source layer.');
    checks.forkSavedIndependently = savedFork.id === forkProjectId
      && savedForkSource.asset.imageUrl.includes(encodeURIComponent(forkProjectId));

    await deleteProject(baseUrl, projectId);
    checks.originalDeleted = !await projectExists(baseUrl, projectId);
    const forkAssetResponse = await fetch(new URL(savedForkSource.asset.imageUrl, baseUrl));
    checks.forkSurvivedOriginalDeletion = forkAssetResponse.ok
      && (await forkAssetResponse.arrayBuffer()).byteLength === PNG_BYTES.byteLength;

    await deleteProject(baseUrl, forkProjectId);
    checks.forkDeleted = !await projectExists(baseUrl, forkProjectId);

    const listPayload = await readApi(
      await fetch(`${baseUrl}/api/umbra-ui/inpaint/projects`, { cache: 'no-store' }),
      'List projects',
    );
    const remainingIds = new Set((listPayload.projects || []).map((project) => project.id));
    checks.noDisposableProjectsRemain = !remainingIds.has(projectId) && !remainingIds.has(forkProjectId);
    const failedChecks = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failedChecks.length > 0) throw new Error(`Lifecycle checks failed: ${failedChecks.join(', ')}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    await deleteProject(baseUrl, projectId).catch(() => undefined);
    await deleteProject(baseUrl, forkProjectId).catch(() => undefined);
    await deleteProject(baseUrl, unsafeSideProjectId).catch(() => undefined);
    await deleteProject(baseUrl, unsafeAreaProjectId).catch(() => undefined);
  }

  const finishedAt = new Date().toISOString();
  const report: LifecycleReport = {
    schemaVersion: 1,
    startedAt,
    finishedAt,
    baseUrl,
    projectId,
    forkProjectId,
    passed: !error && Object.values(checks).every(Boolean),
    checks,
    error,
  };
  const reportPath = await writeReport(report);
  if (!report.passed) throw new Error(`${error || 'Canvas project lifecycle drill failed.'}\nReport: ${reportPath}`);
  console.log('PASSED Umbra UI Canvas project lifecycle drill.');
  console.log(`Report: ${reportPath}`);
}

await main();
