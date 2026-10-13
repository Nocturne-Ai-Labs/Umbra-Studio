import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { readRequestTextWithLimit, RequestBodyTooLargeError } from './BoundedRequestBody';
import { parseMangaProject } from '../frontend/src/features/manga/mangaModel';
import { parseMangaImageProvenance } from '../frontend/src/features/manga/mangaImageProvenance';
import { upsertPngTextMetadataBuffer } from './PngTextMetadata';
import sharp from 'sharp';

const MAX_PROJECT = 100_000_000;
const MAX_FONT = 20_000_000;
const PROJECT_SUFFIX = '.umbra-manga.json';
const FONT_TYPES: Record<string, string> = { '.ttf': 'font/ttf', '.otf': 'font/otf', '.woff': 'font/woff', '.woff2': 'font/woff2' };
class MangaFileError extends Error { constructor(message: string, readonly status = 400) { super(message); } }
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
function filename(value: string) {
  if (!value || value.length > 120 || basename(value) !== value || /[<>:"/\\|?*\x00-\x1f]/.test(value) || /[. ]$/.test(value) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value)) throw new MangaFileError('Invalid Manga file name.');
  return value;
}

export class MangaStudioFiles {
  private readonly userRoot: string;
  private readonly fontRoot: string;
  private readonly projectRoot: string;
  private gates = new Map<string, Promise<void>>();
  constructor(userRoot: string) { this.userRoot = resolve(userRoot); this.fontRoot = join(this.userRoot, 'Fonts'); this.projectRoot = join(this.userRoot, 'MangaStudio', 'Projects'); }

  private async directory(target: string): Promise<void> {
    // Reject linked User/Fonts/Projects components before creating or reading files.
    const relative = target.slice(this.userRoot.length);
    if (target !== this.userRoot && !relative.startsWith(sep)) throw new MangaFileError('Invalid Manga storage root.');
    let current = this.userRoot;
    for (const part of ['', ...relative.split(sep).filter(Boolean)]) {
      if (part) current = join(current, part);
      let info = await lstat(current).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
      if (!info) {
        await mkdir(current).catch(error => { if (error.code !== 'EEXIST') throw error; });
        info = await lstat(current);
      }
      if (info.isSymbolicLink() || !info.isDirectory()) throw new MangaFileError('Manga storage folders must not be links.', 403);
    }
    const physicalUser = await realpath(this.userRoot), physicalTarget = await realpath(target);
    if (physicalTarget !== physicalUser && !physicalTarget.startsWith(physicalUser + sep)) throw new MangaFileError('Manga storage escaped User.', 403);
  }
  private async file(root: string, name: string, max: number): Promise<Buffer | null> {
    await this.directory(root);
    const target = join(root, filename(name));
    const info = await lstat(target).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    if (!info) return null;
    if (info.isSymbolicLink() || !info.isFile()) throw new MangaFileError('Linked Manga files are not allowed.', 403);
    if (info.size > max) throw new MangaFileError('Manga file exceeds its supported size.', 413);
    const data = await readFile(target);
    if (data.length > max) throw new MangaFileError('Manga file exceeds its supported size.', 413);
    return data;
  }
  private async locked<T>(name: string, action: () => Promise<T>): Promise<T> {
    // Windows filenames are case-insensitive; aliases must share one revision gate.
    const key = process.platform === 'win32' ? name.toLowerCase() : name;
    const next = (this.gates.get(key) || Promise.resolve()).catch(() => undefined).then(action);
    const done = next.then(() => undefined, () => undefined); this.gates.set(key, done);
    try { return await next; } finally { if (this.gates.get(key) === done) this.gates.delete(key); }
  }
  async fonts() {
    await this.directory(this.fontRoot);
    const fonts: Array<{ id: string; filename: string; label: string; url: string }> = [], issues: string[] = [];
    const seen = new Set<string>();
    for (const entry of await readdir(this.fontRoot, { withFileTypes: true })) {
      if (!FONT_TYPES[extname(entry.name).toLowerCase()]) continue;
      if (fonts.length >= 100) { issues.push('Only the first 100 supported fonts are loaded.'); break; }
      try {
        const bytes = await this.file(this.fontRoot, entry.name, MAX_FONT); if (!bytes) continue;
        const magic = bytes.subarray(0, 4).toString('hex');
        if (!['00010000', '4f54544f', '774f4646', '774f4632', '74727565'].includes(magic)) throw new MangaFileError('Unsupported or invalid font data.');
        const hash = sha(bytes); if (seen.has(hash)) continue; seen.add(hash);
        fonts.push({ id: `user-font:${hash}`, filename: entry.name, label: basename(entry.name, extname(entry.name)), url: `/api/manga/fonts/${hash}` });
      } catch (error) { issues.push(`${entry.name}: ${error instanceof Error ? error.message : 'Font unreadable.'}`); }
    }
    return { fonts, issues, folder: 'User/Fonts' };
  }
  async projects() {
    await this.directory(this.projectRoot);
    const projects = [], issues: string[] = [];
    for (const entry of await readdir(this.projectRoot, { withFileTypes: true })) {
      if (!entry.name.endsWith(PROJECT_SUFFIX)) continue;
      try {
        const result = await this.get(entry.name);
        projects.push({ filename: entry.name, id: result.project.id, name: result.project.name, pages: result.project.pages.length, etag: result.etag });
      } catch (error) { issues.push(`${entry.name}: ${error instanceof Error ? error.message : 'Project unreadable.'}`); }
    }
    return { projects, issues, folder: 'User/MangaStudio/Projects' };
  }
  async get(name: string) {
    if (!name.endsWith(PROJECT_SUFFIX)) throw new MangaFileError('Use a .umbra-manga.json project file.');
    const bytes = await this.file(this.projectRoot, name, MAX_PROJECT);
    if (!bytes) throw new MangaFileError('Saved Manga project not found.', 404);
    return { project: parseMangaProject(JSON.parse(bytes.toString('utf8'))), filename: name, etag: sha(bytes) };
  }
  async save(name: string, raw: unknown, expected: string | null) {
    filename(name);
    if (!name.endsWith(PROJECT_SUFFIX)) throw new MangaFileError('Use a .umbra-manga.json project file.');
    return this.locked(name, async () => {
      const current = await this.file(this.projectRoot, name, MAX_PROJECT);
      if (current && expected !== sha(current) || !current && expected !== null) throw new MangaFileError('This saved project changed elsewhere. Open it again or save a new copy; your current work is preserved.', 409);
      const project = parseMangaProject(raw), data = JSON.stringify(project);
      if (Buffer.byteLength(data) > MAX_PROJECT) throw new MangaFileError('Manga projects support up to 100 MB.', 413);
      const target = join(this.projectRoot, name), temp = join(dirname(target), `.${randomUUID()}.tmp`);
      try { await writeFile(temp, data, { flag: 'wx' }); await rename(temp, target); }
      finally { await rm(temp, { force: true }); }
      return { project, filename: name, etag: sha(data) };
    });
  }
  async handle(req: Request): Promise<Response | null> {
    const url = new URL(req.url), route = url.pathname;
    if (!route.startsWith('/api/manga/')) return null;
    try {
      if (route === '/api/manga/images/stage' && req.method === 'POST') {
        const body = JSON.parse(await readRequestTextWithLimit(req, 32_100_000));
        return Response.json(await this.stageImage(body.imageUrl, body.provenance));
      }
      if (route === '/api/manga/fonts' && req.method === 'GET') return Response.json(await this.fonts());
      if (route.startsWith('/api/manga/fonts/') && req.method === 'GET') {
        const hash = route.slice('/api/manga/fonts/'.length); if (!/^[a-f0-9]{64}$/.test(hash)) throw new MangaFileError('Invalid font identifier.');
        const font = (await this.fonts()).fonts.find(font => font.id === `user-font:${hash}`); if (!font) throw new MangaFileError('Font not found in User/Fonts.', 404);
        const bytes = await this.file(this.fontRoot, font.filename, MAX_FONT); if (!bytes || sha(bytes) !== hash) throw new MangaFileError('Font changed; refresh fonts.', 409);
        return new Response(new Uint8Array(bytes), { headers: { 'Content-Type': FONT_TYPES[extname(font.filename).toLowerCase()], 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' } });
      }
      if (route === '/api/manga/projects' && req.method === 'GET') return Response.json(await this.projects());
      if (route.startsWith('/api/manga/projects/')) {
        const name = decodeURIComponent(route.slice('/api/manga/projects/'.length));
        if (req.method === 'GET') return Response.json(await this.get(name));
        if (req.method === 'PUT') {
          const body = JSON.parse(await readRequestTextWithLimit(req, MAX_PROJECT + 2048));
          if (body.expected !== null && (typeof body.expected !== 'string' || !/^[a-f0-9]{64}$/.test(body.expected))) throw new MangaFileError('A valid saved-project revision is required.');
          return Response.json(await this.save(name, body.project, body.expected));
        }
      }
      return Response.json({ error: 'Unsupported Manga file operation.' }, { status: 405 });
    } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Manga file operation failed.' }, { status: error instanceof MangaFileError ? error.status : error instanceof RequestBodyTooLargeError ? 413 : 400 }); }
  }

  async stageImage(imageUrl: unknown, rawProvenance?: unknown) {
    if (typeof imageUrl !== 'string' || imageUrl.length > 30_000_000) throw new MangaFileError('Use an embedded Manga image up to 20 MB.', 413);
    const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(imageUrl);
    if (!match) throw new MangaFileError('Only embedded PNG, JPEG, WebP and GIF images can be sent to editing tools.');
    let bytes: Buffer = Buffer.from(match[2], 'base64');
    if (bytes.length > 20_000_000 || bytes.toString('base64') !== match[2]) throw new MangaFileError('Invalid or oversized Manga image.');
    const info = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
    if (info.format !== match[1] || !info.width || !info.height || info.width * info.height > 40_000_000) throw new MangaFileError('Invalid Manga image data.');
    // Image editors consume still images; stage the GIF's first frame as PNG.
    const format = match[1] === 'gif' ? 'png' : match[1];
    if (match[1] === 'gif') {
      bytes = await sharp(bytes, { limitInputPixels: 40_000_000 }).png().toBuffer();
      if (bytes.length > 20_000_000) throw new MangaFileError('The GIF first frame exceeds the 20 MB editing limit.', 413);
    }
    if (rawProvenance !== undefined && format === 'png') {
      const metadata = JSON.parse(parseMangaImageProvenance(rawProvenance).metadataJson);
      for (const key of ['workflow','prompt','umbra_api_workflow','umbra_power_prompter','umbra_inpaint','umbra_metadata','positive_prompt','negative_prompt','parameters']) {
        if (metadata[key] !== undefined && metadata[key] !== null) bytes = upsertPngTextMetadataBuffer(bytes,key,typeof metadata[key] === 'string' ? metadata[key] : JSON.stringify(metadata[key]));
      }
    }
    const root = join(this.userRoot, 'MangaStudio', 'Transfers');
    const name = `${sha(bytes)}.${format === 'jpeg' ? 'jpg' : format}`;
    await this.locked('transfer:'+name, async () => {
      await this.directory(root);
      const existing = await this.file(root, name, 32_100_000);
      if (existing) { if (!existing.equals(bytes)) throw new MangaFileError('Manga transfer file changed; remove the conflicting copy before retrying.',409); return; }
      const temporary=join(root, `.${randomUUID()}.tmp`);
      try { await writeFile(temporary,bytes,{flag:'wx'}); await rename(temporary,join(root,name)); }
      finally { await rm(temporary,{force:true}); }
    });
    const path = join(root,name).replace(/\\/g,'/');
    return {path,imageUrl:`/api/fs/image?${new URLSearchParams({path})}`};
  }
}
