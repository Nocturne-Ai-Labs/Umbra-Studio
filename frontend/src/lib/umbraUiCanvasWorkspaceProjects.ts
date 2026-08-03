import type { UmbraCanvasProjectDocument } from '@/features/canvas/canvasModel';

export interface UmbraCanvasWorkspaceProjectSummary {
  id: string;
  name: string;
  thumbnailUrl: string;
  entityCount: number;
  generationWidth: number;
  generationHeight: number;
  updatedAt: number;
}

export interface UmbraCanvasWorkspaceRestorePointSummary {
  id: string;
  name: string;
  createdAt: number;
  revision: number;
  entityCount: number;
  stagingCount: number;
}

async function readApi<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || payload.success === false) throw new Error(String(payload.error || fallback));
  return payload as T;
}

function assetFilename(entityName: string, contentType: string): string {
  if (/\.[a-z0-9]{2,5}$/i.test(entityName)) return entityName;
  const extension = contentType === 'image/jpeg'
    ? '.jpg'
    : contentType === 'image/webp'
      ? '.webp'
      : contentType === 'image/avif'
        ? '.avif'
        : '.png';
  return `${entityName || 'canvas-layer'}${extension}`;
}

function pendingMaskAssetKey(jobId: string): string {
  return `pending-mask-${jobId}`;
}

function stagedMaskAssetKey(jobId: string, itemId: string): string {
  return `stage-mask-${jobId}-${itemId}`;
}

async function appendBlobAsset(form: FormData, key: string, url: string, name: string): Promise<void> {
  if (!url || !/^(blob:|data:)/i.test(url)) return;
  const blob = await readCanvasBlob(url, `asset ${name}`);
  form.append(`asset:${encodeURIComponent(key)}`, blob, assetFilename(name, blob.type));
}

async function readCanvasBlob(url: string, label: string): Promise<Blob> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`The source returned ${response.status}.`);
    return await response.blob();
  } catch (error) {
    const detail = error instanceof Error && error.message !== 'Failed to fetch'
      ? ` ${error.message}`
      : '';
    throw new Error(`Could not read Canvas ${label}.${detail} Its temporary image source may no longer be available.`);
  }
}

export async function saveUmbraCanvasWorkspaceProject(
  project: UmbraCanvasProjectDocument,
  thumbnail?: Blob | null,
): Promise<UmbraCanvasProjectDocument> {
  const form = new FormData();
  form.set('document', JSON.stringify(project));
  for (const entity of project.entities) {
    if (entity.kind !== 'raster' && entity.kind !== 'mask') continue;
    if (!entity.imageUrl) continue;
    if (!/^(blob:|data:)/i.test(entity.imageUrl)) continue;
    const blob = await readCanvasBlob(entity.imageUrl, `layer ${entity.name}`);
    form.append(`asset:${encodeURIComponent(entity.id)}`, blob, assetFilename(entity.name, blob.type));
  }
  for (const pending of project.generation.pending) {
    await appendBlobAsset(form, pendingMaskAssetKey(pending.jobId), pending.acceptanceMaskUrl || '', 'pending-acceptance-mask.png');
  }
  for (const stage of project.generation.staging) {
    await appendBlobAsset(form, stagedMaskAssetKey(stage.jobId, stage.itemId), stage.acceptanceMaskUrl || '', 'stage-acceptance-mask.png');
  }
  if (thumbnail) form.append('thumbnail', thumbnail, 'thumbnail.png');
  let response: Response;
  try {
    response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(project.id)}`, {
      method: 'PUT',
      body: form,
    });
  } catch {
    throw new Error('Canvas could not reach the Umbra project save service. Your work remains open and autosave will retry.');
  }
  const payload = await readApi<{ success: true; project: UmbraCanvasProjectDocument }>(response, 'Failed to save the Canvas project.');
  return payload.project;
}

export async function listUmbraCanvasWorkspaceProjects(signal?: AbortSignal): Promise<UmbraCanvasWorkspaceProjectSummary[]> {
  const response = await fetch('/api/umbra-ui/canvas/projects', { signal });
  const payload = await readApi<{ success: true; projects: UmbraCanvasWorkspaceProjectSummary[] }>(response, 'Failed to list Canvas projects.');
  return payload.projects;
}

export async function loadUmbraCanvasWorkspaceProject(projectId: string, signal?: AbortSignal): Promise<UmbraCanvasProjectDocument> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}`, { signal });
  const payload = await readApi<{ success: true; project: UmbraCanvasProjectDocument }>(response, 'Failed to load the Canvas project.');
  return payload.project;
}

export async function deleteUmbraCanvasWorkspaceProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  await readApi<{ success: true }>(response, 'Failed to delete the Canvas project.');
}

export async function forkUmbraCanvasWorkspaceProject(projectId: string, name: string): Promise<UmbraCanvasProjectDocument> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/fork`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const payload = await readApi<{ success: true; project: UmbraCanvasProjectDocument }>(response, 'Failed to copy the Canvas project.');
  return payload.project;
}

export async function listUmbraCanvasWorkspaceRestorePoints(
  projectId: string,
  signal?: AbortSignal,
): Promise<UmbraCanvasWorkspaceRestorePointSummary[]> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/restore-points`, {
    cache: 'no-store',
    signal,
  });
  const payload = await readApi<{ success: true; restorePoints: UmbraCanvasWorkspaceRestorePointSummary[] }>(response, 'Failed to list Canvas restore points.');
  return Array.isArray(payload.restorePoints) ? payload.restorePoints : [];
}

export async function createUmbraCanvasWorkspaceRestorePoint(
  projectId: string,
  name: string,
): Promise<UmbraCanvasWorkspaceRestorePointSummary> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/restore-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const payload = await readApi<{ success: true; restorePoint: UmbraCanvasWorkspaceRestorePointSummary }>(response, 'Failed to create the Canvas restore point.');
  return payload.restorePoint;
}

export async function restoreUmbraCanvasWorkspaceRestorePoint(
  projectId: string,
  restorePointId: string,
): Promise<UmbraCanvasProjectDocument> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/restore-points/${encodeURIComponent(restorePointId)}/restore`, {
    method: 'POST',
  });
  const payload = await readApi<{ success: true; project: UmbraCanvasProjectDocument }>(response, 'Failed to restore the Canvas restore point.');
  return payload.project;
}

export async function deleteUmbraCanvasWorkspaceRestorePoint(projectId: string, restorePointId: string): Promise<void> {
  const response = await fetch(`/api/umbra-ui/canvas/projects/${encodeURIComponent(projectId)}/restore-points/${encodeURIComponent(restorePointId)}`, {
    method: 'DELETE',
  });
  await readApi<{ success: true }>(response, 'Failed to delete the Canvas restore point.');
}
