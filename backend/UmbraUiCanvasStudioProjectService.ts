import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import {
  normalizeUmbraCanvasStudioProject,
  type UmbraCanvasStudioProject,
  type UmbraCanvasStudioProjectSummary,
} from '../shared/umbra-ui/canvasStudioTypes';

const MAX_PROJECT_BYTES = 16 * 1024 * 1024;
const MAX_REVISION_BYTES = MAX_PROJECT_BYTES + 1_024;
const MAX_REVISIONS = 50;

export interface UmbraCanvasStudioRevisionSummary {
  id: string;
  name: string;
  revision: number;
  artboardCount: number;
  shelfCount: number;
  createdAt: number;
}

export class UmbraCanvasStudioConflictError extends Error {
  readonly status = 409;
}

function validId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z0-9._-]{1,120}$/i.test(value)
    || value === '.' || value === '..' || value.endsWith('.')
    || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) return '';
  return value;
}

async function writeJsonAtomically(path: string, value: unknown, pretty = true): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(temporary, JSON.stringify(value, null, pretty ? 2 : undefined), 'utf8');
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export class UmbraUiCanvasStudioProjectService {
  private readonly root: string;
  private readonly gates = new Map<string, Promise<void>>();

  constructor(userRoot: string) {
    this.root = resolve(userRoot, 'UmbraUI', 'CanvasStudioProjects');
  }

  private projectRoot(projectId: string): string {
    const id = validId(projectId);
    if (!id) throw new Error('A valid Canvas Studio project id is required.');
    const target = resolve(this.root, id);
    if (!target.startsWith(`${this.root}${sep}`)) throw new Error('Invalid Canvas Studio project path.');
    return target;
  }

  private async locked<T>(projectId: string, action: () => Promise<T>): Promise<T> {
    const prior = this.gates.get(projectId) || Promise.resolve();
    const result = prior.catch(() => undefined).then(action);
    const settled = result.then(() => undefined, () => undefined);
    this.gates.set(projectId, settled);
    try { return await result; }
    finally { if (this.gates.get(projectId) === settled) this.gates.delete(projectId); }
  }

  private async readProject(projectId: string): Promise<UmbraCanvasStudioProject | null> {
    const path = join(this.projectRoot(projectId), 'project.json');
    const file = await stat(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (!file) return null;
    if (!file.isFile() || file.size > MAX_PROJECT_BYTES) throw new Error('The Canvas Studio project file is invalid or oversized.');
    const raw = JSON.parse(await readFile(path, 'utf8')) as { id?: unknown };
    if (raw?.id !== projectId) throw new Error('The Canvas Studio project id does not match its file.');
    return normalizeUmbraCanvasStudioProject(raw, { projectId });
  }

  private async saveProject(projectId: string, rawProject: unknown): Promise<UmbraCanvasStudioProject> {
    const id = validId(projectId);
    if (!id || !rawProject || typeof rawProject !== 'object' || Array.isArray(rawProject)
      || (rawProject as { id?: unknown }).id !== id) {
      throw new Error('The Canvas Studio project id does not match its save target.');
    }
    const rawJson = JSON.stringify(rawProject);
    if (Buffer.byteLength(rawJson, 'utf8') > MAX_PROJECT_BYTES) throw new Error('The Canvas Studio project exceeds the 16 MB limit.');
    const project = normalizeUmbraCanvasStudioProject(rawProject, { projectId: id });
    const previous = await this.readProject(id);
    if (project.revision !== (previous?.revision || 0)) {
      throw new UmbraCanvasStudioConflictError('This Canvas Studio project changed elsewhere. Reload it before saving.');
    }
    project.revision = (previous?.revision || 0) + 1;
    project.updatedAt = Math.max(Date.now(), (previous?.updatedAt || 0) + 1);
    if (Buffer.byteLength(JSON.stringify(project, null, 2), 'utf8') > MAX_PROJECT_BYTES) {
      throw new Error('The Canvas Studio project exceeds the 16 MB limit.');
    }
    const root = this.projectRoot(id);
    if (previous) {
      const revisionId = `r${previous.revision}-${Date.now()}-${randomUUID().slice(0, 8)}`;
      await writeJsonAtomically(join(root, 'revisions', `${revisionId}.json`), {
        id: revisionId,
        createdAt: Date.now(),
        project: previous,
      }, false);
    }
    await writeJsonAtomically(join(root, 'project.json'), project);
    await this.pruneRevisions(id).catch(() => undefined);
    return project;
  }

  private async pruneRevisions(projectId: string): Promise<void> {
    const revisions = await this.listRevisions(projectId);
    await Promise.all(revisions.slice(MAX_REVISIONS).map((revision) => (
      rm(join(this.projectRoot(projectId), 'revisions', `${revision.id}.json`), { force: true })
    )));
  }

  async save(projectId: string, project: unknown): Promise<UmbraCanvasStudioProject> {
    return this.locked(projectId, () => this.saveProject(projectId, project));
  }

  async get(projectId: string): Promise<UmbraCanvasStudioProject | null> {
    return this.locked(projectId, () => this.readProject(projectId));
  }

  async list(): Promise<UmbraCanvasStudioProjectSummary[]> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    const projects = await Promise.all(entries.filter((entry) => entry.isDirectory() && validId(entry.name)).map(async (entry) => {
      const project = await this.get(entry.name).catch(() => null);
      return project ? {
        id: project.id,
        name: project.name,
        artboardCount: project.artboards.length,
        shelfCount: project.shelf.length,
        activeArtboardId: project.activeArtboardId,
        revision: project.revision,
        updatedAt: project.updatedAt,
      } : null;
    }));
    return projects.filter((project): project is UmbraCanvasStudioProjectSummary => !!project)
      .sort((left, right) => right.updatedAt - left.updatedAt || left.name.localeCompare(right.name));
  }

  async delete(projectId: string): Promise<void> {
    await this.locked(projectId, async () => {
      await rm(this.projectRoot(projectId), { recursive: true, force: true });
    });
  }

  async listRevisions(projectId: string): Promise<UmbraCanvasStudioRevisionSummary[]> {
    const folder = join(this.projectRoot(projectId), 'revisions');
    const entries = await readdir(folder, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    const revisions = await Promise.all(entries.filter((entry) => entry.isFile() && /^r\d+-\d+-[a-f0-9]{8}\.json$/.test(entry.name)).map(async (entry) => {
      try {
        const path = join(folder, entry.name);
        const file = await stat(path);
        if (file.size > MAX_REVISION_BYTES) return null;
        const value = JSON.parse(await readFile(path, 'utf8')) as { id?: unknown; createdAt?: unknown; project?: unknown };
        const id = entry.name.slice(0, -5);
        if (value.id !== id) return null;
        const project = normalizeUmbraCanvasStudioProject(value.project, { projectId });
        return {
          id,
          name: project.name,
          revision: project.revision,
          artboardCount: project.artboards.length,
          shelfCount: project.shelf.length,
          createdAt: Number(value.createdAt) || 0,
        };
      } catch { return null; }
    }));
    return revisions.filter((revision): revision is UmbraCanvasStudioRevisionSummary => !!revision)
      .sort((left, right) => right.createdAt - left.createdAt || right.revision - left.revision);
  }

  async restoreRevision(projectId: string, revisionId: string): Promise<UmbraCanvasStudioProject> {
    return this.locked(projectId, async () => {
      if (!/^r\d+-\d+-[a-f0-9]{8}$/.test(revisionId)) throw new Error('Invalid Canvas Studio revision id.');
      const current = await this.readProject(projectId);
      if (!current) throw new Error('The Canvas Studio project was not found.');
      const path = join(this.projectRoot(projectId), 'revisions', `${revisionId}.json`);
      const file = await stat(path);
      if (!file.isFile() || file.size > MAX_REVISION_BYTES) throw new Error('The Canvas Studio revision is invalid.');
      const value = JSON.parse(await readFile(path, 'utf8')) as { id?: unknown; project?: unknown };
      if (value.id !== revisionId || (value.project as { id?: unknown } | null)?.id !== projectId) {
        throw new Error('The Canvas Studio revision does not match this project.');
      }
      return this.saveProject(projectId, { ...(value.project as object), revision: current.revision });
    });
  }
}
