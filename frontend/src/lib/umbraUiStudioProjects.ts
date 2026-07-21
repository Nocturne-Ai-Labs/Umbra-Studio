import {
  createUmbraCanvasStudioProject,
  normalizeUmbraCanvasStudioProject,
  UMBRA_CANVAS_STUDIO_SNAP_SIZE,
  type CreateUmbraCanvasStudioProjectOptions,
  type UmbraCanvasStudioProject,
  type UmbraCanvasStudioProjectSummary,
} from '../../../shared/umbra-ui/canvasStudioTypes';
import type { UmbraCanvasDocument } from '@/lib/umbraUiCanvasDocument';

export type {
  UmbraCanvasStudioArtboard,
  UmbraCanvasStudioGenerationSnapshot,
  UmbraCanvasStudioOutputMode,
  UmbraCanvasStudioProject,
  UmbraCanvasStudioProjectSummary,
  UmbraCanvasStudioPromptSegment,
  UmbraCanvasStudioRect,
  UmbraCanvasStudioRegion,
  UmbraCanvasStudioRegionMode,
  UmbraCanvasStudioShelfAsset,
  UmbraCanvasStudioShelfKind,
  UmbraCanvasStudioViewport,
} from '../../../shared/umbra-ui/canvasStudioTypes';

export { UMBRA_CANVAS_STUDIO_SNAP_SIZE };

export interface UmbraCanvasStudioRevisionSummary {
  id: string;
  name: string;
  revision: number;
  artboardCount: number;
  shelfCount: number;
  createdAt: number;
}

async function readApi<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success) throw new Error(String(payload?.error || fallback));
  return payload as T;
}

export function createUmbraStudioProject(
  options: CreateUmbraCanvasStudioProjectOptions = {},
): UmbraCanvasStudioProject {
  return createUmbraCanvasStudioProject(options);
}

export function createUmbraStudioProjectFromCanvas(
  document: UmbraCanvasDocument,
  options: Pick<CreateUmbraCanvasStudioProjectOptions, 'id' | 'name' | 'now'> = {},
): UmbraCanvasStudioProject {
  return createUmbraCanvasStudioProject({
    ...options,
    name: options.name || document.name,
    documentId: document.id,
    artboardName: document.name,
    width: document.width,
    height: document.height,
  });
}

export async function listUmbraStudioProjects(signal?: AbortSignal): Promise<UmbraCanvasStudioProjectSummary[]> {
  const response = await fetch('/api/umbra-ui/canvas-studio/projects', { cache: 'no-store', signal });
  const payload = await readApi<{ success: true; projects: UmbraCanvasStudioProjectSummary[] }>(
    response,
    'Failed to list Canvas Studio projects.',
  );
  return Array.isArray(payload.projects) ? payload.projects : [];
}

export async function loadUmbraStudioProject(projectId: string, signal?: AbortSignal): Promise<UmbraCanvasStudioProject> {
  const response = await fetch(`/api/umbra-ui/canvas-studio/projects/${encodeURIComponent(projectId)}`, {
    cache: 'no-store',
    signal,
  });
  const payload = await readApi<{ success: true; project: UmbraCanvasStudioProject }>(
    response,
    'Failed to load the Canvas Studio project.',
  );
  return normalizeUmbraCanvasStudioProject(payload.project, { projectId });
}

export async function saveUmbraStudioProject(
  project: UmbraCanvasStudioProject,
  signal?: AbortSignal,
): Promise<UmbraCanvasStudioProject> {
  const response = await fetch(`/api/umbra-ui/canvas-studio/projects/${encodeURIComponent(project.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
    signal,
  });
  const payload = await readApi<{ success: true; project: UmbraCanvasStudioProject }>(
    response,
    'Failed to save the Canvas Studio project.',
  );
  return normalizeUmbraCanvasStudioProject(payload.project, { projectId: project.id });
}

export async function deleteUmbraStudioProject(projectId: string): Promise<void> {
  const response = await fetch(`/api/umbra-ui/canvas-studio/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
  await readApi<{ success: true }>(response, 'Failed to delete the Canvas Studio project.');
}

export async function listUmbraStudioProjectRevisions(
  projectId: string,
  signal?: AbortSignal,
): Promise<UmbraCanvasStudioRevisionSummary[]> {
  const response = await fetch(`/api/umbra-ui/canvas-studio/projects/${encodeURIComponent(projectId)}/revisions`, {
    cache: 'no-store',
    signal,
  });
  const payload = await readApi<{ success: true; revisions: UmbraCanvasStudioRevisionSummary[] }>(
    response,
    'Failed to list Canvas Studio revisions.',
  );
  return Array.isArray(payload.revisions) ? payload.revisions : [];
}

export async function restoreUmbraStudioProjectRevision(
  projectId: string,
  revisionId: string,
): Promise<UmbraCanvasStudioProject> {
  const response = await fetch(
    `/api/umbra-ui/canvas-studio/projects/${encodeURIComponent(projectId)}/revisions/${encodeURIComponent(revisionId)}/restore`,
    { method: 'POST' },
  );
  const payload = await readApi<{ success: true; project: UmbraCanvasStudioProject }>(
    response,
    'Failed to restore the Canvas Studio revision.',
  );
  return normalizeUmbraCanvasStudioProject(payload.project, { projectId });
}
