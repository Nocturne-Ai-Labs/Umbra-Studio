import { createHash, randomUUID } from 'crypto';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import { basename, extname, join, relative, isAbsolute } from 'path';
import sharp from 'sharp';
import { MetadataParser } from './MetadataParser';
import { classifyUmbraMediaMetadata } from '../shared/nsfwPrivacyClassifier';
import { detectUmbraUiCensorRegions, type UmbraUiCensorDetection } from './UmbraUiCensorDetectorService';
import { applyUmbraUiImageCensor } from './UmbraUiMediaToolsService';
import { renderCensorReviewMask, censorReviewOverlayRegions } from './UmbraUiCensorReviewMask';
import {
  normalizeCensorReviewSettings as settings,
  censorReviewCanApprove,
  censorReviewNeedsDetection,
  summarizeCensorReviewItem,
  type CensorReviewItem,
  type CensorReviewProject,
  type CensorReviewProjectSummary,
  type CensorReviewSettings,
  type CensorReviewRect,
  type CensorReviewStroke,
  type CensorReviewItemSummary,
} from '../shared/umbra-ui/censorReview';

const MAX_BYTES = 256 * 1024 * 1024;
const MAX_PIXELS = 64 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.avif', '.tif', '.tiff']);
type ProjectIndex = { id: string; name: string; createdAt: number; itemIds: string[] };
export class CensorReviewError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
function id(value: string): string {
  if (!/^[a-f0-9-]{36}$/i.test(value)) throw new CensorReviewError('Invalid review identifier.');
  return value;
}
function number(value: unknown, min: number, max: number, fallback: number): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}
export function normalizeCensorReviewGeometry(
  rectangles: unknown,
  strokes: unknown,
): { rectangles: CensorReviewRect[]; strokes: CensorReviewStroke[] } {
  if (!Array.isArray(rectangles) || !Array.isArray(strokes))
    throw new CensorReviewError('Invalid mask edits.');
  if (rectangles.length > 256 || strokes.length > 4000)
    throw new CensorReviewError(
      'This mask exceeds the editing safety limit (256 rectangles or 4000 strokes).',
    );
  let pointCount = 0;
  const seen = new Set<string>();
  const unique = (raw: unknown) => {
    const result = id(String(raw));
    if (seen.has(result)) throw new CensorReviewError('Duplicate mask edit identifier.');
    seen.add(result);
    return result;
  };
  return {
    rectangles: rectangles.map((raw) => {
      if (!raw || typeof raw !== 'object') throw new CensorReviewError('Invalid rectangle.');
      const width = number(raw.width, 0.0001, 1, 0.1),
        height = number(raw.height, 0.0001, 1, 0.1);
      return {
        id: unique(raw.id),
        x: number(raw.x, 0, 1 - width, 0),
        y: number(raw.y, 0, 1 - height, 0),
        width,
        height,
        enabled: raw.enabled !== false,
      };
    }),
    strokes: strokes.map((raw) => {
      if (!raw || typeof raw !== 'object' || !Array.isArray(raw.points) || !raw.points.length)
        throw new CensorReviewError('Invalid brush stroke.');
      pointCount += raw.points.length;
      if (pointCount > 200_000)
        throw new CensorReviewError('This mask exceeds the 200,000-point editing safety limit.');
      return {
        id: unique(raw.id),
        erase: raw.erase === true,
        radius: number(raw.radius, 0.0001, 0.5, 0.01),
        points: raw.points.map((point: unknown) => {
          if (
            !Array.isArray(point) ||
            point.length !== 2 ||
            !point.every((v) => typeof v === 'number' && Number.isFinite(v))
          )
            throw new CensorReviewError('Invalid brush coordinate.');
          return [number(point[0], 0, 1, 0), number(point[1], 0, 1, 0)] as [number, number];
        }),
      };
    }),
  };
}
async function atomicJson(path: string, value: unknown): Promise<void> {
  const tmp = `${path}.${randomUUID()}.partial`;
  try {
    const handle = await fs.open(tmp, 'wx');
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(tmp, path);
  } finally {
    await fs.rm(tmp, { force: true }).catch(() => undefined);
  }
}
async function hash(path: string): Promise<string> {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

export class UmbraUiCensorReviewService {
  readonly directory: string;
  private busy = new Set<string>();
  private computing = false;
  private summaries = new Map<string, { mtime: number; size: number; value: CensorReviewItemSummary }>();
  constructor(
    private rootDir: string,
    private sourceDir: string,
    private detector = detectUmbraUiCensorRegions,
  ) {
    this.directory = join(rootDir, 'User', 'UmbraUI', 'CensorReviews');
  }
  private projectDir(projectId: string) {
    return join(this.directory, id(projectId));
  }
  private itemDir(projectId: string, itemId: string) {
    return join(this.projectDir(projectId), 'items', id(itemId));
  }
  private async owned(path: string): Promise<string> {
    const root = await fs.realpath(this.directory),
      resolved = await fs.realpath(path);
    const child = relative(root, resolved);
    if (isAbsolute(child) || child === '..' || child.startsWith('../') || child.startsWith('..\\'))
      throw new CensorReviewError('Review path is outside its project storage.', 403);
    return resolved;
  }
  private async index(projectId: string): Promise<ProjectIndex> {
    try {
      return JSON.parse(
        await fs.readFile(await this.owned(join(this.projectDir(projectId), 'project.json')), 'utf8'),
      );
    } catch (error: any) {
      if (error.code === 'ENOENT') throw new CensorReviewError('Review project not found.', 404);
      throw error;
    }
  }
  private async locked<T>(key: string, action: () => Promise<T>): Promise<T> {
    if (this.busy.has(key))
      throw new CensorReviewError('This image is busy. Wait for its current operation to finish.', 409);
    this.busy.add(key);
    try {
      return await action();
    } finally {
      this.busy.delete(key);
    }
  }
  private async compute<T>(action: () => Promise<T>): Promise<T> {
    if (this.computing)
      throw new CensorReviewError('A censor operation is already running. Retry when it finishes.', 409);
    this.computing = true;
    try {
      return await action();
    } finally {
      this.computing = false;
    }
  }
  async list(): Promise<CensorReviewProjectSummary[]> {
    await fs.mkdir(this.directory, { recursive: true });
    const entries = await fs.readdir(this.directory, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/i.test(entry.name)) continue;
      try {
        const project = await this.getProject(entry.name);
        rows.push({
          id: project.id,
          name: project.name,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
          itemCount: project.items.length,
          approvedCount: project.items.filter((item) => item.status === 'approved').length,
        });
      } catch {
        rows.push({
          id: entry.name,
          name: `Unavailable project (${entry.name.slice(0, 8)})`,
          createdAt: 0,
          updatedAt: 0,
          itemCount: 0,
          approvedCount: 0,
        });
      }
    }
    return rows.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async create(name: string): Promise<CensorReviewProject> {
    const projectId = randomUUID();
    await fs.mkdir(join(this.projectDir(projectId), 'items'), { recursive: true });
    await atomicJson(join(this.projectDir(projectId), 'project.json'), {
      id: projectId,
      name: String(name || 'Censor review')
        .trim()
        .slice(0, 120),
      createdAt: Date.now(),
      itemIds: [],
    });
    return this.getProject(projectId);
  }
  async rename(projectId: string, name: string): Promise<CensorReviewProject> {
    return this.locked(projectId, async () => {
      const project = await this.index(projectId);
      project.name = String(name || '')
        .trim()
        .slice(0, 120);
      if (!project.name) throw new CensorReviewError('Enter a project name.');
      await atomicJson(join(this.projectDir(projectId), 'project.json'), project);
      return this.getProject(projectId);
    });
  }
  async getProject(projectId: string): Promise<CensorReviewProject> {
    return this.readProject(projectId, false);
  }
  private async readProject(projectId: string, reuseSummaries: boolean): Promise<CensorReviewProject> {
    const project = await this.index(projectId);
    const items = [];
    for (const itemId of project.itemIds) {
      const key = join(this.itemDir(projectId, itemId), 'state.json');
      const cached = this.summaries.get(key);
      // App writes invalidate this cache; imports need not re-stat every prior image.
      if (reuseSummaries && cached) { items.push(cached.value); continue; }
      const path = await this.owned(key);
      const stat = await fs.stat(path);
      if (cached?.mtime === stat.mtimeMs && cached.size === stat.size) items.push(cached.value);
      else {
        const value = summarizeCensorReviewItem(JSON.parse(await fs.readFile(path, 'utf8')));
        if (this.summaries.size >= 10_000) this.summaries.clear();
        this.summaries.set(key, { mtime: stat.mtimeMs, size: stat.size, value });
        items.push(value);
      }
    }
    return {
      id: project.id,
      name: project.name,
      createdAt: project.createdAt,
      updatedAt: Math.max(project.createdAt, ...items.map((item) => item.updatedAt)),
      items,
    };
  }
  async getItem(projectId: string, itemId: string): Promise<CensorReviewItem> {
    if (!(await this.index(projectId)).itemIds.includes(id(itemId)))
      throw new CensorReviewError('Review image not found.', 404);
    return JSON.parse(
      await fs.readFile(await this.owned(join(this.itemDir(projectId, itemId), 'state.json')), 'utf8'),
    );
  }
  async importImage(
    projectId: string,
    source: { path?: string; bytes?: Uint8Array; name: string; tags?: string[] },
    initialSettings?: unknown,
  ): Promise<CensorReviewProject> {
    return this.locked(projectId, async () => {
      const project = await this.index(projectId);
      const extension = extname(source.name).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(extension)) throw new CensorReviewError('Unsupported review image format.');
      const sourceStat = source.path ? await fs.stat(source.path) : null;
      const size = sourceStat?.size ?? source.bytes?.byteLength ?? 0;
      if (size <= 0 || size > MAX_BYTES)
        throw new CensorReviewError('Review source images must be between 1 byte and 256 MB.');
      const itemId = randomUUID(),
        directory = this.itemDir(projectId, itemId);
      await this.owned(join(this.projectDir(projectId), 'items'));
      await fs.mkdir(directory, { recursive: true });
      const sourceFile = `source${extension}`,
        sourcePath = join(directory, sourceFile);
      try {
        if (source.path) await fs.copyFile(source.path, sourcePath);
        else await fs.writeFile(sourcePath, source.bytes!);
        if (source.path) {
          const after = await fs.stat(source.path);
          if (after.size !== size || after.mtimeMs !== sourceStat!.mtimeMs)
            throw new CensorReviewError('Source changed during import. Retry once it has finished writing.');
        }
        const metadata = await sharp(sourcePath, { limitInputPixels: MAX_PIXELS }).metadata();
        const swap = [5, 6, 7, 8].includes(Number(metadata.orientation));
        const width = Number(swap ? metadata.height : metadata.width),
          height = Number(swap ? metadata.width : metadata.height);
        if (
          !width ||
          !height ||
          width > 16384 ||
          height > 16384 ||
          width * height > MAX_PIXELS ||
          (metadata.pages || 1) > 1
        )
          throw new CensorReviewError('Use a still image up to 16,384 pixels per side and 64 megapixels.');
        await sharp(sourcePath)
          .rotate()
          .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(join(directory, 'thumbnail.jpg'));
        const item: CensorReviewItem = {
          id: itemId,
          name: basename(source.name),
          originalPath: source.path || '',
          sourceFile,
          sourceHash: await hash(sourcePath),
          width,
          height,
          sourceBytes: size,
          protectedMedia:
            classifyUmbraMediaMetadata(
              await MetadataParser.parse(sourcePath).catch(() => ({})),
              source.tags,
            ) === 'nsfw',
          revision: 1,
          editRevision: 1,
          renderedEditRevision: null,
          status: 'pending',
          settings: settings(initialSettings),
          regions: [],
          rectangles: [],
          strokes: [],
          detectedCutoff: null,
          detectedPadding: null,
          detectedTargets: [],
          warnings: [],
          error: '',
          previewFile: '',
          maskFile: '',
          censored: false,
          updatedAt: Date.now(),
        };
        await atomicJson(join(directory, 'state.json'), item);
        project.itemIds.push(itemId);
        await atomicJson(join(this.projectDir(projectId), 'project.json'), project);
      } catch (error) {
        await fs.rm(await this.owned(directory), { recursive: true, force: true });
        throw error;
      }
      return this.readProject(projectId, true);
    });
  }
  private checkRevision(item: CensorReviewItem, revision: unknown) {
    if (revision !== item.revision)
      throw new CensorReviewError('This image changed in another session. Reload it before saving.', 409);
  }
  private async persist(projectId: string, item: CensorReviewItem): Promise<CensorReviewItem> {
    item.revision++;
    item.updatedAt = Date.now();
    const path = join(this.itemDir(projectId, item.id), 'state.json');
    this.summaries.delete(path);
    await atomicJson(path, item);
    return item;
  }
  private async discardObsoleteAssets(projectId: string, item: CensorReviewItem): Promise<void> {
    const directory = await this.owned(this.itemDir(projectId, item.id));
    const keep = new Set([
      item.sourceFile,
      'thumbnail.jpg',
      item.previewFile,
      item.maskFile,
      ...item.regions.map((r) => r.maskFile),
    ]);
    for (const name of await fs.readdir(directory)) {
      if (keep.has(name) || !/^[a-f0-9-]{36}(?:-mask)?\.(?:png|jpg|jpeg|webp)$/i.test(name)) continue;
      const path = await this.owned(join(directory, name));
      await fs.unlink(path).catch(() => undefined);
    }
  }
  async saveEdits(
    projectId: string,
    itemId: string,
    input: any,
    resolveOverlay: (path: string) => string,
  ): Promise<CensorReviewItem> {
    return this.locked(`${projectId}/${itemId}`, async () => {
      const item = await this.getItem(projectId, itemId);
      this.checkRevision(item, input.revision);
      const next = settings(input.settings);
      if (next.overlayPath) next.overlayPath = resolveOverlay(next.overlayPath);
      const geometry = normalizeCensorReviewGeometry(input.rectangles, input.strokes);
      const flags = input.regionEnabled && typeof input.regionEnabled === 'object' ? input.regionEnabled : {};
      const regions = item.regions.map((region) => ({
        ...region,
        enabled: typeof flags[region.id] === 'boolean' ? flags[region.id] : region.enabled,
      }));
      if (
        JSON.stringify([next, geometry.rectangles, geometry.strokes, regions]) ===
        JSON.stringify([item.settings, item.rectangles, item.strokes, item.regions])
      )
        return item;
      item.regions = regions;
      item.settings = next;
      item.rectangles = geometry.rectangles;
      item.strokes = geometry.strokes;
      item.editRevision++;
      item.status = 'needs-review';
      item.error = '';
      return this.persist(projectId, item);
    });
  }
  async detect(projectId: string, itemId: string, revision: number): Promise<CensorReviewItem> {
    return this.locked(`${projectId}/${itemId}`, () =>
      this.compute(async () => {
        const item = await this.getItem(projectId, itemId);
        this.checkRevision(item, revision);
        if (!item.settings.targets.length)
          throw new CensorReviewError('Select at least one detection target.');
        try {
          const directory = this.itemDir(projectId, itemId);
          let warnings: string[] = [];
          const detections = await this.detector({
            rootDir: this.rootDir,
            sourceDir: this.sourceDir,
            sourcePath: join(directory, item.sourceFile),
            targets: item.settings.targets,
            threshold: item.settings.cutoff,
            padding: item.settings.padding,
            onWarnings: (value) => {
              warnings = value;
            },
          });
          const regions = [];
          for (const region of detections) {
            const regionId = randomUUID(),
              maskFile = region.maskPngBase64 ? `${regionId}.png` : undefined;
            if (maskFile)
              await fs.writeFile(join(directory, maskFile), Buffer.from(region.maskPngBase64!, 'base64'));
            regions.push({
              id: regionId,
              x: region.x,
              y: region.y,
              width: region.width,
              height: region.height,
              score: region.score,
              target: region.target,
              maskKind: region.maskKind || ('box-fallback' as const),
              maskFile,
              enabled: true,
            });
          }
          item.regions = regions;
          item.warnings = warnings;
          item.error = '';
          item.status = 'needs-review';
          item.editRevision++;
          item.detectedCutoff = item.settings.cutoff;
          item.detectedPadding = item.settings.padding;
          item.detectedTargets = [...item.settings.targets];
          const saved = await this.persist(projectId, item);
          await this.discardObsoleteAssets(projectId, saved).catch(() => undefined);
          return saved;
        } catch (error) {
          item.error = error instanceof Error ? error.message : String(error);
          item.status = 'needs-review';
          await this.persist(projectId, item);
          throw error;
        }
      }),
    );
  }
  async render(projectId: string, itemId: string, revision: number): Promise<CensorReviewItem> {
    return this.locked(`${projectId}/${itemId}`, () =>
      this.compute(async () => {
        const item = await this.getItem(projectId, itemId);
        this.checkRevision(item, revision);
        if (censorReviewNeedsDetection(item))
          throw new CensorReviewError(
            'Run detection with the current settings before rendering, or disable Auto Detect for manual-only work.',
          );
        try {
          const directory = this.itemDir(projectId, itemId);
          const auto: UmbraUiCensorDetection[] = [];
          if (item.settings.autoDetect)
            for (const region of item.regions) {
              if (
                !region.enabled ||
                region.score < item.settings.cutoff ||
                !item.settings.targets.includes(region.target)
              )
                continue;
              auto.push({
                ...region,
                maskPngBase64: region.maskFile
                  ? (await fs.readFile(join(directory, region.maskFile))).toString('base64')
                  : undefined,
              });
            }
          const mask = await renderCensorReviewMask(
            item.width,
            item.height,
            auto,
            item.rectangles,
            item.strokes,
          );
          const token = randomUUID(),
            maskFile = `${token}-mask.png`;
          const previewFile = `${token}.${item.settings.format === 'jpeg' ? 'jpg' : item.settings.format}`;
          await fs.writeFile(join(directory, maskFile), mask.bytes);
          const regions = !mask.hasCoverage
            ? []
            : item.settings.mode === 'overlay'
              ? await censorReviewOverlayRegions(
                  mask.bytes,
                  item.width,
                  item.height,
                  auto,
                  item.rectangles,
                  item.strokes,
                )
              : [{ x: 0, y: 0, width: 1, height: 1, maskPngBase64: mask.bytes.toString('base64') }];
          const censored = await applyUmbraUiImageCensor({
            sourcePath: join(directory, item.sourceFile),
            outputPath: join(directory, previewFile),
            mode: item.settings.mode,
            overlayPath: item.settings.overlayPath || undefined,
            mosaicSize: item.settings.mosaicSize,
            regions,
            exportSettings: item.settings,
          });
          item.previewFile = previewFile;
          item.maskFile = maskFile;
          item.censored = censored;
          item.error = '';
          item.renderedEditRevision = item.editRevision;
          item.status = 'needs-review';
          const saved = await this.persist(projectId, item);
          await this.discardObsoleteAssets(projectId, saved).catch(() => undefined);
          return saved;
        } catch (error) {
          item.error = error instanceof Error ? error.message : String(error);
          item.status = 'needs-review';
          await this.persist(projectId, item);
          throw error;
        }
      }),
    );
  }
  async review(
    projectId: string,
    itemId: string,
    revision: number,
    approve: boolean,
  ): Promise<CensorReviewItem> {
    return this.locked(`${projectId}/${itemId}`, async () => {
      const item = await this.getItem(projectId, itemId);
      this.checkRevision(item, revision);
      if (approve && !censorReviewCanApprove(item))
        throw new CensorReviewError('Render the current edits successfully before approving this image.');
      item.status = approve ? 'approved' : 'needs-review';
      return this.persist(projectId, item);
    });
  }
  async asset(projectId: string, itemId: string, filename: string): Promise<string> {
    if (
      !/^[a-z0-9.-]+$/i.test(filename) ||
      !IMAGE_EXTENSIONS.has(extname(filename).toLowerCase()) ||
      filename.includes('..')
    )
      throw new CensorReviewError('Invalid review asset.');
    const item = await this.getItem(projectId, itemId);
    const allowed = new Set([
      item.sourceFile,
      'thumbnail.jpg',
      item.previewFile,
      item.maskFile,
      ...item.regions.map((region) => region.maskFile),
    ]);
    if (!allowed.has(filename)) throw new CensorReviewError('Review asset not found.', 404);
    return this.owned(join(this.itemDir(projectId, itemId), filename));
  }
  async exportItem(
    projectId: string,
    itemId: string,
    revision: number,
    resolveOutput: (originalPath: string) => string,
    register: (path: string, censored: boolean, protectedMedia: boolean) => Promise<void>,
  ): Promise<{ item: CensorReviewItem; path: string }> {
    return this.locked(`${projectId}/${itemId}`, async () => {
      const item = await this.getItem(projectId, itemId);
      this.checkRevision(item, revision);
      if (item.status !== 'approved' || !censorReviewCanApprove(item))
        throw new CensorReviewError('Only approved, up-to-date images can be exported.');
      const directory = resolveOutput(item.originalPath);
      if (
        item.lastExport?.editRevision === item.editRevision &&
        item.lastExport.directory === directory &&
        (await fs
          .stat(item.lastExport.path)
          .then((s) => s.isFile())
          .catch(() => false))
      ) {
        if (!item.lastExport.registered) {
          await register(item.lastExport.path, item.censored, item.protectedMedia);
          item.lastExport.registered = true;
          await this.persist(projectId, item);
        }
        return { item, path: item.lastExport.path };
      }
      const extension = extname(item.previewFile);
      const stem =
        basename(item.name, extname(item.name))
          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
          .replace(/[. ]+$/, '')
          .slice(0, 140) || 'image';
      await fs.mkdir(directory, { recursive: true });
      let path = '';
      for (let sequence = 0; sequence < 1_000_000; sequence++) {
        const candidate = join(directory, `${stem}-censored${sequence ? `-${sequence}` : ''}${extension}`);
        try {
          const handle = await fs.open(candidate, 'wx');
          await handle.close();
          path = candidate;
          break;
        } catch (error: any) {
          if (error.code !== 'EEXIST') throw error;
        }
      }
      if (!path) throw new CensorReviewError('Could not reserve an export filename.');
      try {
        await fs.copyFile(join(this.itemDir(projectId, itemId), item.previewFile), path);
        item.lastExport = { path, directory, editRevision: item.editRevision, exportedAt: Date.now(), registered: false };
        await this.persist(projectId, item);
      } catch (error) {
        await fs.rm(path, { force: true }).catch(() => undefined);
        throw error;
      }
      // A saved receipt makes Gallery registration retryable without duplicating or deleting the export.
      await register(path, item.censored, item.protectedMedia);
      item.lastExport!.registered = true;
      return { item: await this.persist(projectId, item), path };
    });
  }
}
