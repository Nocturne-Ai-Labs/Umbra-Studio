import { randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  createUmbraCanvasProjectDocument,
  createUmbraCanvasRasterEntity,
  UMBRA_CANVAS_PROJECT_VERSION,
  type UmbraCanvasProjectDocument,
} from '../frontend/src/features/canvas/canvasModel';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8212';
const PNG_BYTES = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+H9p2AAAAAElFTkSuQmCC', 'base64'));

interface ApiPayload {
  success?: boolean;
  error?: string;
  project?: UmbraCanvasProjectDocument;
  projects?: Array<{ id: string }>;
  restorePoint?: { id: string; name: string };
}

function baseUrlArg(): string {
  const index = process.argv.indexOf('--base-url');
  const url = new URL(String(index >= 0 ? process.argv[index + 1] : DEFAULT_BASE_URL));
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) throw new Error('Canvas drills are restricted to a loopback Umbra server.');
  return url.origin;
}

async function api(response: Response, label: string): Promise<ApiPayload> {
  const payload = await response.json().catch(() => ({})) as ApiPayload;
  if (!response.ok || payload.success === false) throw new Error(payload.error || `${label} failed with HTTP ${response.status}.`);
  return payload;
}

async function save(baseUrl: string, project: UmbraCanvasProjectDocument, upload = false): Promise<UmbraCanvasProjectDocument> {
  const form = new FormData();
  form.append('document', JSON.stringify(project));
  if (upload) {
    const raster = project.entities.find((entity) => entity.kind === 'raster');
    if (!raster || raster.kind !== 'raster') throw new Error('The drill raster is missing.');
    form.append(`asset:${encodeURIComponent(raster.id)}`, new Blob([PNG_BYTES], { type: 'image/png' }), 'pixel.png');
  }
  const payload = await api(await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(project.id)}`, { method: 'PUT', body: form }), 'Save Canvas project');
  if (!payload.project) throw new Error('Save Canvas project returned no document.');
  return payload.project;
}

async function remove(baseUrl: string, projectId: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  if (response.status !== 404) await api(response, 'Delete Canvas project');
}

async function writeReport(report: Record<string, unknown>, finishedAt: string): Promise<string> {
  const path = resolve('User', 'UmbraUI', 'QualificationReports', `canvas-v8-lifecycle-${finishedAt.replace(/[:.]/g, '-')}.json`);
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
  return path;
}

async function main(): Promise<void> {
  const baseUrl = baseUrlArg();
  const startedAt = new Date().toISOString();
  const suffix = randomUUID();
  const projectId = `canvas-v8-drill-${suffix}`;
  let forkId = '';
  const checks: Record<string, boolean> = {};
  let error = '';
  try {
    if (!(await fetch(`${baseUrl}/?canvas-revival=1`)).ok) throw new Error('Umbra did not answer on the Canvas drill URL.');
    const project = createUmbraCanvasProjectDocument('Canvas V8 Lifecycle');
    project.id = projectId;
    const raster = createUmbraCanvasRasterEntity({ name: 'Lifecycle Raster', imageUrl: `blob:${suffix}`, width: 1, height: 1 });
    project.entities = [raster];
    project.activeEntityId = raster.id;
    const legacy = project as unknown as Record<string, any>;
    legacy.version = 7;
    delete legacy.entities[0].adjustments;
    let saved = await save(baseUrl, project, true);
    const savedRaster = saved.entities.find((entity) => entity.kind === 'raster');
    checks.v7MigratesToV8 = saved.version === UMBRA_CANVAS_PROJECT_VERSION
      && savedRaster?.kind === 'raster'
      && savedRaster.adjustments.brightness === 0;
    if (!savedRaster || savedRaster.kind !== 'raster') throw new Error('Saved Canvas raster is missing.');
    const assetResponse = await fetch(new URL(savedRaster.imageUrl, baseUrl));
    checks.assetReloads = assetResponse.ok && (await assetResponse.arrayBuffer()).byteLength === PNG_BYTES.byteLength;

    savedRaster.adjustments = { brightness: 25, contrast: -20, saturation: 500, hue: -999, blur: 12 };
    saved = await save(baseUrl, saved);
    const adjusted = saved.entities.find((entity) => entity.kind === 'raster');
    checks.adjustmentsClamp = adjusted?.kind === 'raster'
      && adjusted.adjustments.saturation === 200
      && adjusted.adjustments.hue === -180;

    const restorePayload = await api(await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/restore-points`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Lifecycle Baseline' }),
    }), 'Create restore point');
    const restoreId = restorePayload.restorePoint?.id || '';
    checks.restorePointCreated = Boolean(restoreId);
    saved.name = 'Lifecycle Mutated';
    saved = await save(baseUrl, saved);
    const restored = await api(await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/restore-points/${encodeURIComponent(restoreId)}/restore`, { method: 'POST' }), 'Restore project');
    checks.restoreRecoversBaseline = restored.project?.name === 'Canvas V8 Lifecycle';

    const forked = await api(await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/fork`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Lifecycle Fork' }),
    }), 'Fork project');
    forkId = forked.project?.id || '';
    checks.forkCreated = Boolean(forkId && forkId !== projectId);
    await remove(baseUrl, projectId);
    checks.originalDeleted = (await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}`)).status === 404;
    const forkRaster = forked.project?.entities.find((entity) => entity.kind === 'raster');
    checks.forkAssetSurvives = Boolean(forkRaster?.kind === 'raster' && (await fetch(new URL(forkRaster.imageUrl, baseUrl))).ok);
    await remove(baseUrl, forkId);
    checks.forkDeleted = (await fetch(`${baseUrl}/api/umbra-ui/canvas/projects/${encodeURIComponent(forkId)}`)).status === 404;
    const list = await api(await fetch(`${baseUrl}/api/umbra-ui/canvas/projects`), 'List Canvas projects');
    checks.noDrillProjectsRemain = !(list.projects || []).some((entry) => entry.id === projectId || entry.id === forkId);
    const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name);
    if (failed.length) throw new Error(`Lifecycle checks failed: ${failed.join(', ')}`);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  } finally {
    await remove(baseUrl, projectId).catch(() => undefined);
    if (forkId) await remove(baseUrl, forkId).catch(() => undefined);
  }
  const finishedAt = new Date().toISOString();
  const report = { schemaVersion: 2, startedAt, finishedAt, baseUrl, projectId, forkId, passed: !error && Object.values(checks).every(Boolean), checks, error };
  const reportPath = await writeReport(report, finishedAt);
  if (!report.passed) throw new Error(`${error || 'Canvas v8 lifecycle drill failed.'}\nReport: ${reportPath}`);
  console.log('PASSED Umbra Canvas v8 project lifecycle drill.');
  console.log(`Report: ${reportPath}`);
}

await main();
