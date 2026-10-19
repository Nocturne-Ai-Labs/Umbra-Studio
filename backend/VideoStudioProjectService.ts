import { mkdir, realpath, lstat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, relative, isAbsolute, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readRequestTextWithLimit } from './BoundedRequestBody';
import { validVideoProjectId, validateVideoProject, type VideoStudioProject } from '../shared/umbra-ui/videoStudioProject';

const MAX_BYTES = 16 * 1024 * 1024;
const validCapture = (id: unknown): id is string => typeof id === 'string' && /^official-dasiwa-[a-z0-9-]+-[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id) && id.length < 200;
export class VideoStudioProjectService {
  private readonly root: string;
  private readonly parent: string;
  private gates = new Map<string, Promise<unknown>>();
  constructor(userRoot: string) {
    this.parent = resolve(userRoot, 'UmbraUI');
    this.root = join(this.parent, 'VideoStudioProjects');
  }
  private async directory() {
    for (const path of [this.parent, this.root]) {
      await mkdir(path, { recursive: true });
      if ((await lstat(path)).isSymbolicLink()) throw new Error('Redirected project folders are not supported.');
    }
  }
  private async read(id: string): Promise<VideoStudioProject | null> {
    if (!validVideoProjectId(id)) throw new Error('Invalid project id.');
    await this.directory();
    const path = join(this.root, id + '.json');
    const info = await lstat(path).catch((e: NodeJS.ErrnoException) => { if (e.code === 'ENOENT') return null; throw e; });
    if (!info) return null;
    if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('Invalid project file.');
    const project = validateVideoProject(JSON.parse(await readFile(path, 'utf8')));
    if (project.id !== id) throw new Error('Project identity mismatch.');
    return project;
  }
  async save(raw: unknown) {
    const project = validateVideoProject(raw);
    const previousGate = this.gates.get(project.id) || Promise.resolve();
    const task = previousGate.catch(() => {}).then(async () => {
      const previous = await this.read(project.id);
      if (project.revision !== (previous?.revision || 0)) throw Object.assign(new Error('This project changed in another window. Reopen it before saving.'), { status: 409 });
      project.revision++;
      project.updatedAt = Date.now();
      const data = JSON.stringify(project);
      if (Buffer.byteLength(data) > MAX_BYTES) throw new Error('Project exceeds the 16 MB limit.');
      const temporary = join(this.root, randomUUID() + '.tmp');
      try {
        await writeFile(temporary, data, { flag: 'wx' });
        await rename(temporary, join(this.root, project.id + '.json'));
      } finally { await rm(temporary, { force: true }); }
      return project;
    });
    this.gates.set(project.id, task);
    try { return await task; } finally { if (this.gates.get(project.id) === task) this.gates.delete(project.id); }
  }

  private async ledger(id: string): Promise<{ captures: string[]; outputs: Array<{ path: string; name: string; type: string }> }> {
    const path = join(this.root, id + '.media.json');
    try {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_BYTES) throw new Error('Invalid project media index.');
      const data = JSON.parse(await readFile(path, 'utf8'));
      if (!Array.isArray(data.captures) || !data.captures.every(validCapture) || !Array.isArray(data.outputs) ||
          !data.outputs.every((o: { path?: unknown; name?: unknown; type?: unknown }) => o && typeof o.path === 'string' && typeof o.name === 'string' && typeof o.type === 'string'))
        throw new Error('Invalid project media index.');
      return data;
    } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { captures: [], outputs: [] }; throw e; }
  }
  private async updateLedger(id: string, update: (data: Awaited<ReturnType<VideoStudioProjectService['ledger']>>) => void) {
    const key = id + ':media', previous = this.gates.get(key) || Promise.resolve();
    const task = previous.catch(() => {}).then(async () => {
      const data = await this.ledger(id); update(data);
      const serialized = JSON.stringify(data);
      if (Buffer.byteLength(serialized) > MAX_BYTES) throw new Error('Project media index exceeds the 16 MB limit.');
      const temporary = join(this.root, randomUUID() + '.tmp');
      try { await writeFile(temporary, serialized, { flag: 'wx' }); await rename(temporary, join(this.root, id + '.media.json')); }
      finally { await rm(temporary, { force: true }); }
    });
    this.gates.set(key, task);
    try { await task; } finally { if (this.gates.get(key) === task) this.gates.delete(key); }
  }
  async registerCapture(id: string, captureId: string) {
    if (!validCapture(captureId) || !await this.read(id)) throw new Error('Invalid project capture.');
    await this.updateLedger(id, data => { if (!data.captures.includes(captureId)) data.captures.push(captureId); });
  }
  async recordOutputs(captureId: string, outputs: Array<{ path: string; name: string; type: string }>) {
    if (!validCapture(captureId) || !outputs.length) return;
    await this.directory();
    for (const file of await readdir(this.root)) {
      const id = file.replace(/\.media\.json$/, '');
      if (!file.endsWith('.media.json') || !validVideoProjectId(id)) continue;
      if (!(await this.ledger(id)).captures.includes(captureId)) continue;
      await this.updateLedger(id, data => {
        data.outputs = Array.from(new Map([...data.outputs, ...outputs.map(o => ({ path: o.path, name: o.name, type: o.type }))].map(o => [o.path, o])).values());
      });
    }
  }
  async media(id: string) {
    const project = await this.read(id);
    if (!project) throw new Error('Project not found.');
    const runtime = dirname(dirname(this.parent));
    const exists = async (path: string, boundary: string) => {
      try {
        const target = await realpath(path), base = await realpath(boundary), rel = relative(base, target);
        return rel !== '..' && !rel.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) && !isAbsolute(rel) && (await lstat(target)).isFile();
      } catch { return false; }
    };
    const inputRoot = join(runtime, 'Tools', 'ComfyUI', 'input');
    const sources = new Map(project.media.map(m => [m.filename, { name: m.name, filename: m.filename, type: m.kind }]));
    for (const shot of project.shots) for (const ref of shot.draft.references)
      if (!sources.has(ref.filename)) sources.set(ref.filename, { name: ref.filename, filename: ref.filename, type: ref.kind });
    const inputs = [];
    for (const source of sources.values()) {
      const path = resolve(inputRoot, source.filename);
      if (await exists(path, inputRoot)) inputs.push({ ...source, path, shots: project.shots.filter(s => s.draft.references.some(r => r.filename === source.filename)).map(s => s.name) });
    }
    const outputs = [];
    for (const output of (await this.ledger(id)).outputs) {
      const path = resolve(runtime, output.path);
      if (await exists(path, runtime)) outputs.push({ ...output, path });
    }
    return { inputs, outputs };
  }
  async handle(req: Request): Promise<Response> {
    try {
      const url = new URL(req.url);
      const suffix = url.pathname.slice('/api/video/projects'.length);
      if (!suffix && req.method === 'GET') {
        await this.directory();
        const projects = [];
        for (const entry of await readdir(this.root)) {
          const id = entry.replace(/\.json$/, '');
          if (!entry.endsWith('.json') || !validVideoProjectId(id)) continue;
          const p = await this.read(id);
          if (p) projects.push({ id: p.id, name: p.name, revision: p.revision, updatedAt: p.updatedAt, shotCount: p.shots.length });
        }
        return Response.json({ projects: projects.sort((a, b) => b.updatedAt - a.updatedAt) });
      }
      const parts = suffix.slice(1).split('/');
      const id = parts[0];
      if (validVideoProjectId(id) && parts.length === 2) {
        if (parts[1] === 'media' && req.method === 'GET') return Response.json(await this.media(id));
        if (parts[1] === 'captures' && req.method === 'POST') {
          const body = JSON.parse(await readRequestTextWithLimit(req, 4096));
          await this.registerCapture(id, body.captureId);
          return Response.json({ success: true });
        }
      }
      if (parts.length !== 1) return Response.json({ error: 'Unknown project operation.' }, { status: 404 });
      if (!validVideoProjectId(id)) return Response.json({ error: 'Invalid project id.' }, { status: 400 });
      if (req.method === 'GET') {
        const project = await this.read(id);
        return Response.json(project ? { project } : { error: 'Project not found.' }, { status: project ? 200 : 404 });
      }
      if (req.method === 'PUT') {
        const body = JSON.parse(await readRequestTextWithLimit(req, MAX_BYTES));
        if (body?.id !== id) throw new Error('Project identity mismatch.');
        return Response.json({ project: await this.save(body) });
      }
      return Response.json({ error: 'Unsupported project operation.' }, { status: 405 });
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : 'Project operation failed.' },
        { status: Number((error as { status?: number }).status) || 400 });
    }
  }
}
