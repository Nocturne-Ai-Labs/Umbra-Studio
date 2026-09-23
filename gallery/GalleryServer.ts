import { existsSync, type Dirent } from 'fs';
import * as fs from 'fs/promises';
import { basename, extname, join, relative, resolve, isAbsolute, sep } from 'path';
import { availableParallelism, cpus } from 'os';
import sharp from 'sharp';
import {
  GalleryDb,
  type GalleryIndexedFile,
  type GalleryMetadataSearchMatch,
  type GallerySortBy,
  type GallerySortOrder,
} from './GalleryDb';
import { MetadataParser, type ImageMetadata } from '../backend/MetadataParser';
import { metadataFileRevision } from '../backend/metadataFileRevision';
import { galleryMediaCacheControl } from './GalleryMediaCache';
import { resolveGalleryPublicDir } from './GalleryRuntimePaths';
import { GalleryWarmupScheduler } from './GalleryWarmupScheduler';
import { GalleryFolderRevisions } from './GalleryFolderRevisions';
import { GalleryWorkQueue as AsyncWorkerQueue } from './GalleryWorkQueue';
import { extractVideoFrame } from './GalleryVideoThumbnail';
import { ThumbnailService } from '../backend/ThumbnailService';
import { mediaFileRevision } from '../backend/mediaFileRevision';
import { createHash } from 'node:crypto';
import { resolveSingleByteRange } from '../shared/httpByteRange';
import { createVariantEtag, matchesIfNoneMatch, permitsConditionalRange } from '../shared/httpCache';
import { createGalleryPathAuthorizer } from '../backend/GalleryPathAccess';

const ROOT_DIR = process.env.UMBRA_ROOT || process.cwd();
const HOST = '127.0.0.1';
const PORT = Number(process.env.UMBRA_GALLERY_PORT || 8313);
const BRIDGE_URL = String(process.env.UMBRA_BRIDGE_URL || 'http://127.0.0.1:8212').trim();
const BRIDGE_TOKEN = String(process.env.UMBRA_GALLERY_BRIDGE_TOKEN || '').trim();
const BOOT_PREWARM_ROOTS_RELATIVE = [
  'Tools/ComfyUI/output',
];

const PUBLIC_DIR = resolveGalleryPublicDir(ROOT_DIR, import.meta.dir);

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function traceGalleryService(event: string, payload: Record<string, unknown>, thresholdMs = 250) {
  if (process.env.UMBRA_DIAGNOSTICS !== '1' && process.env.UMBRA_DIAGNOSTICS !== 'true') return;
  const durationMs = Math.round(Number(payload.durationMs || 0) * 10) / 10;
  if (durationMs < thresholdMs && !payload.error && !payload.fallback) return;
  try {
    console.info(`[GalleryTrace] ${JSON.stringify({
      event,
      ...payload,
      durationMs,
      sampledAt: new Date().toISOString(),
    })}`);
  } catch {
    // Best-effort diagnostics only.
  }
}

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif', '.jxl', '.tif', '.tiff', '.svg', '.apng',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v',
]);
const BUN_IMAGE_STILL_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.bmp', '.avif', '.heic', '.heif', '.tif', '.tiff',
]);

const THUMB_SIZE_MAP: Record<string, number> = {
  small: 256,
  medium: 512,
  large: 768,
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.m4v': 'video/x-m4v',
  '.ico': 'image/x-icon',
};

type ThumbCacheEntry = {
  etag: string;
  buffer: Buffer;
  sizePx: number;
  quality: number;
  fitMode: 'cover' | 'contain';
  bytes: number;
};

type FolderSummary = {
  signature?: string;
  path: string;
  subfolderCount: number;
  imageCount: number;
  videoCount: number;
  gifCount: number;
  totalMediaCount: number;
  firstMediaPath: string | null;
  firstMediaType: 'image' | 'gif' | 'video' | null;
};

type FolderSummaryCacheEntry = {
  value: FolderSummary;
  scannedAt: number;
  revision: number;
};

type FolderTreeNode = {
  name: string;
  path: string;
};

type FolderTreeCacheEntry = {
  folders: FolderTreeNode[];
  scannedAt: number;
};

type MetadataCacheEntry = {
  etag: string;
  value: ImageMetadata & {
    type: 'image' | 'video';
    name: string;
    size: number;
    modified: string;
  };
  scannedAt: number;
};

const FOLDER_SUMMARY_CACHE_TTL_MS = 30_000;
const FOLDER_SUMMARY_CACHE_MAX_ENTRIES = 1024;
const FOLDER_SUMMARY_PREWARM_INTERVAL_MS = 1000;
const FOLDER_SUMMARY_PREWARM_CHILD_LIMIT = 48;
const FOLDER_TREE_CACHE_TTL_MS = 120_000;
const FOLDER_TREE_CACHE_MAX_ENTRIES = 1024;
const METADATA_CACHE_TTL_MS = 5 * 60_000;
const METADATA_CACHE_MAX_ENTRIES = 768;
const THUMBNAIL_PREWARM_PAGE_SIZE = 8;
const THUMBNAIL_CACHE_MAX_ENTRIES = 500;
const THUMBNAIL_CACHE_MAX_BYTES = 256 * 1024 * 1024;
const SEARCH_MIN_QUERY_LENGTH = 2;
const SEARCH_CONTAINS_MIN_QUERY_LENGTH = 3;

const thumbnailCache = new Map<string, ThumbCacheEntry>();
let thumbnailCacheBytes = 0;
const thumbnailBuildInFlight = new Map<string, Promise<ThumbCacheEntry>>();
const thumbnailDiskCache = (() => {
  try { return new ThumbnailService(); }
  catch {
    console.warn('[Gallery] Disk thumbnail cache unavailable; using memory only');
    return null;
  }
})();
const folderSummaryCache = new Map<string, FolderSummaryCacheEntry>();
const folderTreeCache = new Map<string, FolderTreeCacheEntry>();
const metadataCache = new Map<string, MetadataCacheEntry>();
const backgroundWarmup = new GalleryWarmupScheduler();
const folderRevisions = new GalleryFolderRevisions();
const recentlyOpenedMediaFolders = new Map<string, number>();
const CPU_THREADS = Math.max(1, Number((typeof availableParallelism === 'function' ? availableParallelism() : cpus().length) || 4));
const TREE_WORKER_CONCURRENCY = Math.max(2, Math.min(4, Math.floor(CPU_THREADS / 3) || 2));
const SIDEBAR_WORKER_CONCURRENCY = Math.max(1, Math.min(2, Math.floor(CPU_THREADS / 6) || 1));
const GALLERY_WORKER_CONCURRENCY = Math.max(1, Math.min(3, Math.floor(CPU_THREADS / 4) || 2));
const FILMSTRIP_WORKER_CONCURRENCY = Math.max(1, Math.min(2, Math.floor(CPU_THREADS / 5) || 1));
const METADATA_WORKER_CONCURRENCY = 1;
const treeWorker = new AsyncWorkerQueue(TREE_WORKER_CONCURRENCY, 256);
const sidebarWorker = new AsyncWorkerQueue(SIDEBAR_WORKER_CONCURRENCY, 128);
const galleryWorker = new AsyncWorkerQueue(GALLERY_WORKER_CONCURRENCY, 160);
const filmstripWorker = new AsyncWorkerQueue(FILMSTRIP_WORKER_CONCURRENCY, 128);
const metadataWorker = new AsyncWorkerQueue(METADATA_WORKER_CONCURRENCY, 64);
const mediaStatWorker = new AsyncWorkerQueue(8, 128);
const galleryDb = new GalleryDb(ROOT_DIR);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

function isMissingFsPathError(error: unknown): boolean {
  const code = String((error as { code?: unknown } | null)?.code || '').trim().toUpperCase();
  return code === 'ENOENT' || code === 'ENOTDIR';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isImagePath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

function isVideoPath(filePath: string): boolean {
  const ext = extname(filePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext);
}

function isSupportedMediaPath(filePath: string): boolean {
  return isImagePath(filePath) || isVideoPath(filePath);
}

function mediaTypeFromPath(filePath: string): 'image' | 'gif' | 'video' {
  const ext = extname(filePath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (ext === '.gif') return 'gif';
  return 'image';
}

function createEmptyFolderSummary(pathValue: string): FolderSummary {
  return {
    path: normalizePath(pathValue),
    subfolderCount: 0,
    imageCount: 0,
    videoCount: 0,
    gifCount: 0,
    totalMediaCount: 0,
    firstMediaPath: null,
    firstMediaType: null,
  };
}

function getFolderSummaryCacheKey(pathValue: string): string {
  return normalizePath(pathValue);
}

function normalizeThumbnailFitMode(value: unknown): 'cover' | 'contain' {
  return String(value || '').trim().toLowerCase() === 'contain' ? 'contain' : 'cover';
}

function getThumbnailCacheKey(filePath: string, sizePx: number, quality: number, fitMode: 'cover' | 'contain'): string {
  return `${filePath}|${sizePx}|${quality}|${fitMode}`;
}

function getCachedThumbnail(cacheKey: string, expectedEtag?: string): ThumbCacheEntry | null {
  const cached = thumbnailCache.get(cacheKey);
  if (!cached || (expectedEtag && cached.etag !== expectedEtag)) return null;
  thumbnailCache.delete(cacheKey);
  thumbnailCache.set(cacheKey, cached);
  return cached;
}

function setCachedThumbnail(cacheKey: string, entry: ThumbCacheEntry) {
  const existing = thumbnailCache.get(cacheKey);
  if (existing) {
    thumbnailCacheBytes = Math.max(0, thumbnailCacheBytes - existing.bytes);
    thumbnailCache.delete(cacheKey);
  }
  thumbnailCache.set(cacheKey, entry);
  thumbnailCacheBytes += entry.bytes;
  pruneThumbnailCache();
}

function pruneThumbnailCache() {
  while (
    thumbnailCache.size > THUMBNAIL_CACHE_MAX_ENTRIES
    || thumbnailCacheBytes > THUMBNAIL_CACHE_MAX_BYTES
  ) {
    const oldestKey = thumbnailCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const oldest = thumbnailCache.get(oldestKey);
    if (oldest) thumbnailCacheBytes = Math.max(0, thumbnailCacheBytes - oldest.bytes);
    thumbnailCache.delete(oldestKey);
  }
}

function buildThumbnailRevisionToken(input: { revision?: string; createdMs?: number; ctimeMs?: number; birthtimeMs?: number; modifiedMs: number; size: number }): string {
  if (typeof input.revision === 'string') return input.revision;
  const createdMs = Math.max(
    0,
    Number(input?.createdMs || input?.ctimeMs || input?.birthtimeMs || 0),
  );
  const modifiedMs = Math.max(0, Number(input?.modifiedMs || 0));
  const size = Math.max(0, Math.trunc(Number(input?.size || 0)));
  return `${createdMs}-${modifiedMs}-${size}`;
}

function buildMediaRevisionToken(input: MediaFileRecord): string {
  return `${input.uid}-${buildThumbnailRevisionToken(input)}`;
}

function getMediaEtag(
  stat: { mtimeMs: number; ctimeMs?: number; birthtimeMs?: number; ino?: number; size: number },
): string {
  return `W/"media-${mediaFileRevision(stat)}"`;
}

function getMetadataCacheKey(filePath: string): string {
  return normalizePath(filePath);
}

function getCachedMetadata(filePath: string, etag: string): MetadataCacheEntry['value'] | null {
  const key = getMetadataCacheKey(filePath);
  const cached = metadataCache.get(key);
  if (!cached) return null;
  if (cached.etag !== etag || Date.now() - cached.scannedAt > METADATA_CACHE_TTL_MS) {
    metadataCache.delete(key);
    return null;
  }
  metadataCache.delete(key);
  metadataCache.set(key, cached);
  return cached.value;
}

function setCachedMetadata(filePath: string, etag: string, value: MetadataCacheEntry['value']) {
  const key = getMetadataCacheKey(filePath);
  if (!key) return;
  metadataCache.set(key, {
    etag,
    value,
    scannedAt: Date.now(),
  });
  while (metadataCache.size > METADATA_CACHE_MAX_ENTRIES) {
    const oldestKey = metadataCache.keys().next().value;
    if (!oldestKey) break;
    metadataCache.delete(oldestKey);
  }
}

function getThumbnailEtag(
  stat: { mtimeMs: number; ctimeMs?: number; birthtimeMs?: number; ino?: number; size: number },
  sizePx: number,
  quality: number,
  fitMode: 'cover' | 'contain',
): string {
  return `W/"thumb-${sizePx}-${quality}-${fitMode}-${mediaFileRevision(stat)}"`;
}

type WorkerLane = 'gallery' | 'filmstrip';

function normalizeWorkerLane(value: unknown): WorkerLane {
  return String(value || '').trim().toLowerCase() === 'filmstrip' ? 'filmstrip' : 'gallery';
}

function getLaneWorker(lane: WorkerLane): AsyncWorkerQueue {
  return lane === 'filmstrip' ? filmstripWorker : galleryWorker;
}

async function computeFolderSummary(dirPath: string): Promise<FolderSummary> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return summarizeFolderEntries(dirPath, entries, true);
}

function summarizeFolderEntries(dirPath: string, entries: Dirent<string>[], monitor = false): FolderSummary {
  const signature = createHash('sha256');
  let subfolderCount = 0;
  let imageCount = 0;
  let videoCount = 0;
  let gifCount = 0;
  let firstMediaPath: string | null = null;
  let firstMediaType: 'image' | 'gif' | 'video' | null = null;

  const sortedEntries = [...entries].sort(compareGalleryEntryNames);

  for (const entry of sortedEntries) {
    if (entry.isDirectory()) {
      signature.update(`d:${entry.name.length}:${entry.name}`);
      subfolderCount += 1;
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isSupportedMediaPath(entry.name)) continue;
    signature.update(`f:${entry.name.length}:${entry.name}`);
    const type = mediaTypeFromPath(entry.name);
    if (!firstMediaPath) {
      firstMediaPath = normalizePath(join(dirPath, entry.name));
      firstMediaType = type;
    }
    if (type === 'video') {
      videoCount += 1;
    } else if (type === 'gif') {
      gifCount += 1;
    } else if (type === 'image') {
      imageCount += 1;
    }
  }

  const namesSignature = signature.digest('hex');
  const folderKey = normalizePath(dirPath);
  const revision = monitor
    ? folderRevisions.observe(folderKey, namesSignature, sortedEntries.filter(entry => entry.isFile() && isSupportedMediaPath(entry.name)).map(entry => join(dirPath, entry.name)))
    : folderRevisions.peek(folderKey);
  return {
    signature: `${namesSignature}:${revision}`,
    path: normalizePath(dirPath),
    subfolderCount,
    imageCount,
    videoCount,
    gifCount,
    totalMediaCount: imageCount + videoCount + gifCount,
    firstMediaPath,
    firstMediaType,
  };
}

function getCachedFolderSummary(pathValue: string): FolderSummary | null {
  const key = getFolderSummaryCacheKey(pathValue);
  const cached = folderSummaryCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.scannedAt > FOLDER_SUMMARY_CACHE_TTL_MS
    || cached.revision !== folderRevisions.peek(key)) {
    folderSummaryCache.delete(key);
    return null;
  }
  folderSummaryCache.delete(key);
  folderSummaryCache.set(key, cached);
  return cached.value;
}

function setCachedFolderSummary(pathValue: string, summary: FolderSummary) {
  const key = getFolderSummaryCacheKey(pathValue);
  folderSummaryCache.delete(key);
  folderSummaryCache.set(key, {
    value: summary,
    scannedAt: Date.now(),
    revision: Number(summary.signature?.split(':').at(-1) || 0),
  });
  while (folderSummaryCache.size > FOLDER_SUMMARY_CACHE_MAX_ENTRIES) {
    folderSummaryCache.delete(folderSummaryCache.keys().next().value!);
  }
}

function getCachedFolderTree(pathValue: string): FolderTreeNode[] | null {
  const key = normalizePath(pathValue);
  const cached = folderTreeCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.scannedAt > FOLDER_TREE_CACHE_TTL_MS) {
    folderTreeCache.delete(key);
    return null;
  }
  folderTreeCache.delete(key);
  folderTreeCache.set(key, cached);
  return cached.folders;
}

function setCachedFolderTree(pathValue: string, folders: FolderTreeNode[]) {
  const key = normalizePath(pathValue);
  if (!key) return;
  folderTreeCache.set(key, {
    folders,
    scannedAt: Date.now(),
  });
  while (folderTreeCache.size > FOLDER_TREE_CACHE_MAX_ENTRIES) {
    const oldestKey = folderTreeCache.keys().next().value;
    if (!oldestKey) break;
    folderTreeCache.delete(oldestKey);
  }
}

function invalidateFolderTree(pathValue: string, includeDescendants = false) {
  const normalized = normalizePath(pathValue);
  if (!normalized) return;
  folderTreeCache.delete(normalized);
  if (!includeDescendants) return;
  const prefix = `${normalized}/`;
  for (const key of Array.from(folderTreeCache.keys())) {
    if (key.startsWith(prefix)) folderTreeCache.delete(key);
  }
}

function invalidateFolderSummary(pathValue: string, includeDescendants = false) {
  const normalized = normalizePath(pathValue);
  if (!normalized) return;
  folderSummaryCache.delete(normalized);
  if (!includeDescendants) return;
  const prefix = `${normalized}/`;
  for (const key of Array.from(folderSummaryCache.keys())) {
    if (key.startsWith(prefix)) folderSummaryCache.delete(key);
  }
}

async function getFolderSummary(pathValue: string, force = false): Promise<FolderSummary> {
  const normalizedPath = normalizePath(pathValue);
  if (!normalizedPath) return createEmptyFolderSummary('');

  if (!force) {
    const cached = getCachedFolderSummary(normalizedPath);
    if (cached) return cached;
  }

  const key = `folder-summary:${normalizedPath}`;
  return sidebarWorker.run(key, async () => {
    const summary = await computeFolderSummary(normalizedPath);
    setCachedFolderSummary(normalizedPath, summary);
    return summary;
  });
}

function scheduleFolderSummaryPrewarm(pathValue: string) {
  const normalizedPath = normalizePath(resolveGalleryPath(pathValue));
  if (!normalizedPath) return;
  const cached = getCachedFolderSummary(normalizedPath);
  if (cached) return;

  sidebarWorker.schedule(`folder-summary:${normalizedPath}`, async () => {
    const summary = await computeFolderSummary(normalizedPath);
    setCachedFolderSummary(normalizedPath, summary);
    return summary;
  });
}

function registerPrewarmRoot(pathValue: string, permanent = false) {
  const normalizedPath = normalizePath(resolveGalleryPath(pathValue));
  if (!normalizedPath) return;
  backgroundWarmup.register(normalizedPath, true, permanent ? 0 : Date.now() + 5 * 60_000);
}

async function prewarmChildFolderSummaries(rootPath: string) {
  registerPrewarmRoot(rootPath);
}

async function getOrBuildThumbnailBuffer(
  filePath: string,
  sizePx: number,
  quality: number,
  fitMode: 'cover' | 'contain',
  lane: WorkerLane = 'gallery',
  expectedEtag?: string,
): Promise<ThumbCacheEntry> {
  const cacheKey = getThumbnailCacheKey(filePath, sizePx, quality, fitMode);
  const cached = getCachedThumbnail(cacheKey, expectedEtag);
  if (cached && (!expectedEtag || cached.etag === expectedEtag)) return cached;

  const laneWorker = getLaneWorker(lane);
  const buildKey = `${cacheKey}:${expectedEtag || 'unversioned'}`;
  return laneWorker.run(`thumb:${buildKey}`, async () => {
    const cachedEntry = getCachedThumbnail(cacheKey, expectedEtag);
    if (cachedEntry && (!expectedEtag || cachedEntry.etag === expectedEtag)) return cachedEntry;

    return buildAndCacheThumbnail(filePath, sizePx, quality, fitMode);
  });
}

async function buildAndCacheThumbnail(
  filePath: string,
  sizePx: number,
  quality: number,
  fitMode: 'cover' | 'contain',
  sourceRetry = 0,
): Promise<ThumbCacheEntry> {
  const cacheKey = getThumbnailCacheKey(filePath, sizePx, quality, fitMode);
  const stat = await fs.stat(filePath);
  const etag = getThumbnailEtag(stat, sizePx, quality, fitMode);
  const reused = getCachedThumbnail(cacheKey, etag);
  if (reused && reused.etag === etag) return reused;

  const buildKey = `${cacheKey}:${etag}`;
  const inFlight = thumbnailBuildInFlight.get(buildKey);
  if (inFlight) return inFlight;
  // Both prefetch and visible requests enter here, including across worker lanes.
  const buildPromise = (async () => {
    try {
      const generate = () => buildThumbnail(filePath, sizePx, quality, fitMode);
      const buffer = thumbnailDiskCache
        ? await thumbnailDiskCache.getOrGenerateDerivedPreview(
          filePath, `gallery-webp-v1:${sizePx}:${quality}:${fitMode}`, mediaFileRevision(stat), generate,
        )
        : await generate();
      const currentStat = await fs.stat(filePath);
      if (getThumbnailEtag(currentStat, sizePx, quality, fitMode) !== etag) {
        throw new Error('Thumbnail source changed during generation');
      }
      const nextEntry: ThumbCacheEntry = { etag, buffer, sizePx, quality, fitMode, bytes: buffer.byteLength };
      setCachedThumbnail(cacheKey, nextEntry);
      return nextEntry;
    } catch (error) {
      const latest = await fs.stat(filePath).catch(() => null);
      if (sourceRetry === 0 && latest && getThumbnailEtag(latest, sizePx, quality, fitMode) !== etag) {
        return buildAndCacheThumbnail(filePath, sizePx, quality, fitMode, sourceRetry + 1);
      }
      throw error;
    }
  })().finally(() => { thumbnailBuildInFlight.delete(buildKey); });
  thumbnailBuildInFlight.set(buildKey, buildPromise);
  return buildPromise;
}

function scheduleThumbnailPrewarm(filePath: string, sizePx: number, quality: number, fitMode: 'cover' | 'contain' = 'cover') {
  if (!isSupportedMediaPath(filePath)) return;
  const cacheKey = getThumbnailCacheKey(filePath, sizePx, quality, fitMode);
  if (getCachedThumbnail(cacheKey)) return;
  galleryWorker.schedule(`thumb:${cacheKey}`, async () => {
    await buildAndCacheThumbnail(filePath, sizePx, quality, fitMode);
    return true;
  });
}

function schedulePageThumbnailPrewarm(files: MediaFileRecord[]) {
  const limit = Math.max(0, Math.min(THUMBNAIL_PREWARM_PAGE_SIZE, files.length));
  for (let index = 0; index < limit; index += 1) {
    const file = files[index];
    if (!file) continue;
    if (file.type !== 'image' && file.type !== 'gif' && file.type !== 'video') continue;
    scheduleThumbnailPrewarm(resolveGalleryPath(file.path), THUMB_SIZE_MAP.small, 70, 'contain');
  }
}

function seedPrewarmRoots() {
  for (const relativeRoot of BOOT_PREWARM_ROOTS_RELATIVE) {
    const resolved = resolve(ROOT_DIR, relativeRoot);
    registerPrewarmRoot(resolved, true);
  }
}

async function isManagedOutputFolder(folder: string): Promise<boolean> {
  const output = resolve(ROOT_DIR, 'Tools/ComfyUI/output');
  const within = (root: string, candidate: string) => {
    const rel = relative(root, candidate).replace(/\\/g, '/');
    return !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../');
  };
  if (!within(output, folder)) return false;
  try {
    // A child junction must not turn managed-output warming into an implicit
    // recursive scan or download of an external/cloud library.
    const realOutput = await fs.realpath(output);
    return within(realOutput, await fs.realpath(folder));
  } catch { return false; }
}

function runPeriodicPrewarmCycle() {
  folderRevisions.retireIdle();
  const busy = [galleryWorker, filmstripWorker, treeWorker, sidebarWorker].some(worker => worker.stats().inFlight > 0);
  void backgroundWarmup.tick(busy, async (folder, cursor) => {
    const insideManagedOutput = await isManagedOutputFolder(folder);
    const entries = await fs.readdir(folder, { withFileTypes: true });
    const directories = entries.filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && !entry.name.startsWith('.'));
    // Rotate through children rather than forever warming the first 48.
    const count = Math.min(16, directories.length);
    if (insideManagedOutput) {
      for (let i = 0; i < count; i++) backgroundWarmup.register(normalizePath(join(folder, directories[(cursor * 16 + i) % directories.length].name)));
    }
    const summary = summarizeFolderEntries(folder, entries);
    setCachedFolderSummary(folder, summary);
    // External folders retain shallow periodic summaries while recently used.
    // Do not hydrate their cloud-only media before an explicit folder listing.
    if (!insideManagedOutput && (recentlyOpenedMediaFolders.get(folder) || 0) < Date.now() - 15 * 60_000) return cursor + 1;
    const media = entries.filter(entry => entry.isFile() && isSupportedMediaPath(entry.name)).sort((a, b) => galleryNameCollator.compare(a.name, b.name));
    // Warm a small visible-page window; never eagerly decode the whole library.
    const offset = media.length ? (Math.floor(cursor / 2) * 2) % Math.min(media.length, 24) : 0;
    const candidates = cursor % 2 === 0
      ? media.slice(Math.max(0, media.length - offset - 2), media.length - offset).reverse()
      : media.slice(offset, offset + 2);
    for (const entry of candidates) {
      if ([galleryWorker, filmstripWorker].some(worker => worker.stats().inFlight > 0)) break;
      const path = join(folder, entry.name);
      const stat = await fs.stat(path);
      const etag = getThumbnailEtag(stat, THUMB_SIZE_MAP.small, 70, 'contain');
      await getOrBuildThumbnailBuffer(path, THUMB_SIZE_MAP.small, 70, 'contain', 'gallery', etag).catch(() => undefined);
    }
    return cursor + 1;
  });
}

function parseSortBy(value: string | null): GallerySortBy {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'modified') return 'modified';
  if (normalized === 'name') return 'name';
  if (normalized === 'custom') return 'custom';
  return 'created';
}

function parseSortOrder(value: string | null): GallerySortOrder {
  return String(value || '').trim().toLowerCase() === 'desc' ? 'desc' : 'asc';
}

type MediaFileRecord = GalleryIndexedFile & { revision?: string; metadataRevision?: string };

type MediaCandidate = {
  name: string;
  absolutePath: string;
  clientPath: string;
  folderPath: string;
};

type SearchFolderResult = {
  name: string;
  path: string;
  rootPath: string;
};

type MetadataSearchPayload = {
  query: string;
  folderPath: string;
  matches: GalleryMetadataSearchMatch[];
  total: number;
};

const galleryNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function compareGalleryEntryNames(a: { name: string }, b: { name: string }): number {
  return galleryNameCollator.compare(a.name, b.name) || a.name.localeCompare(b.name);
}

function compareMediaByName(a: MediaFileRecord, b: MediaFileRecord): number {
  return galleryNameCollator.compare(a.name, b.name);
}

function compareMedia(
  a: MediaFileRecord,
  b: MediaFileRecord,
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
): number {
  let value = 0;
  if (sortBy === 'modified') {
    value = a.modifiedMs - b.modifiedMs;
  } else if (sortBy === 'name') {
    value = compareMediaByName(a, b);
  } else if (sortBy === 'custom') {
    value = a.customOrder - b.customOrder;
  } else {
    value = a.createdMs - b.createdMs;
  }

  if (value === 0) {
    value = compareMediaByName(a, b);
  }
  if (value === 0) {
    value = a.path.localeCompare(b.path);
  }
  return sortOrder === 'desc' ? -value : value;
}

function compareMediaCandidatesByName(a: MediaCandidate, b: MediaCandidate): number {
  const byName = compareGalleryEntryNames(a, b);
  if (byName !== 0) return byName;
  return a.clientPath.localeCompare(b.clientPath);
}

function inventorySignatureFromSortedEntries(
  folders: Array<{ name: string }>,
  mediaCandidates: MediaCandidate[],
): string {
  // Both arrays are already name sorted; merge them in the summary's entry order.
  const hash = createHash('sha256');
  let folderIndex = 0;
  let mediaIndex = 0;
  while (folderIndex < folders.length || mediaIndex < mediaCandidates.length) {
    if (folderIndex < folders.length && (mediaIndex >= mediaCandidates.length
      || compareGalleryEntryNames(folders[folderIndex], mediaCandidates[mediaIndex]) < 0)) {
      const name = folders[folderIndex++].name;
      hash.update(`d:${name.length}:${name}`);
    } else {
      const name = mediaCandidates[mediaIndex++].name;
      hash.update(`f:${name.length}:${name}`);
    }
  }
  return hash.digest('hex');
}

function serializeGalleryFile(file: MediaFileRecord) {
  const revision = file.revision ?? buildMediaRevisionToken(file);
  return {
    uid: file.uid,
    revision,
    name: file.name,
    path: file.path,
    url: `/api/fs/image?path=${encodeURIComponent(file.path)}&rev=${encodeURIComponent(revision)}`,
    thumbnailUrl: `/api/fs/thumbnail?path=${encodeURIComponent(file.path)}&size=small&q=70&rev=${encodeURIComponent(buildThumbnailRevisionToken(file))}&fit=cover`,
    type: file.type,
    size: file.size,
    createdMs: file.createdMs,
    modifiedMs: file.modifiedMs,
    customOrder: file.customOrder,
    width: file.width,
    height: file.height,
    metadataReady: file.metadataReady,
    metadataRevision: file.metadataRevision,
    metadataFormat: file.metadataFormat,
    tags: Array.isArray(file.tags) ? file.tags : [],
    privacyClass: file.privacyClass,
  };
}

async function serializeGalleryFiles(files: MediaFileRecord[], signal?: AbortSignal) {
  const serialized: ReturnType<typeof serializeGalleryFile>[] = [];
  // Indexed search hits may lack a live revision; stat only returned rows, in small batches.
  for (let offset = 0; offset < files.length; offset += 8) {
    signal?.throwIfAborted();
    serialized.push(...await Promise.all(files.slice(offset, offset + 8).map(async file => {
      if (typeof file.revision === 'string') return serializeGalleryFile(file);
      const revision = await fs.stat(resolveGalleryPath(file.path)).then(mediaFileRevision).catch(() => '');
      const metadataRevision = revision
        ? await metadataFileRevision(resolveGalleryPath(file.path), revision).catch(() => '')
        : '';
      return serializeGalleryFile({ ...file, revision, metadataRevision });
    })));
  }
  signal?.throwIfAborted();
  return serialized;
}

function upsertGalleryFiles(folderPath: string, inputs: Awaited<ReturnType<typeof statMediaCandidates>>): MediaFileRecord[] {
  const revisions = new Map(inputs.map(input => [normalizePath(input.path), input]));
  return galleryDb.upsertFolderFiles(folderPath, inputs).map(file => {
    const input = revisions.get(normalizePath(file.path));
    return { ...file, revision: input?.revision, metadataRevision: input?.metadataRevision };
  });
}

function normalizeSearchQuery(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function tokenizeSearchText(value: unknown): string[] {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function textMatchesSearch(text: unknown, needle: string): boolean {
  if (!needle) return true;
  const normalizedText = String(text || '').toLowerCase();
  if (!normalizedText) return false;
  const tokens = tokenizeSearchText(normalizedText);
  if (tokens.some((token) => token.startsWith(needle))) return true;
  return needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && normalizedText.includes(needle);
}

function tagSearchPriority(tags: string[] | undefined, needle: string): number {
  if (!needle) return 0;
  let best = 0;
  for (const tag of tags || []) {
    const normalized = String(tag || '').toLowerCase().trim();
    if (!normalized) continue;
    if (normalized === needle) return 4;
    if (normalized.startsWith(needle)) best = Math.max(best, 3);
    else if (tokenizeSearchText(normalized).some((token) => token.startsWith(needle))) best = Math.max(best, 2);
    else if (needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && normalized.includes(needle)) best = Math.max(best, 1);
  }
  return best;
}

function fileMatchesSearch(file: MediaFileRecord, needle: string): boolean {
  if (!needle) return true;
  if (tagSearchPriority(file.tags, needle) > 0) return true;
  const name = String(file.name || basename(file.path));
  const baseName = name.replace(/\.[^.]+$/, '');
  const folderPath = normalizePath(file.folderPath || normalizePath(join(file.path, '..')));
  return (
    textMatchesSearch(name, needle)
    || textMatchesSearch(baseName, needle)
    || textMatchesSearch(basename(folderPath), needle)
    || (needle.length >= SEARCH_CONTAINS_MIN_QUERY_LENGTH && folderPath.toLowerCase().includes(needle))
  );
}

function compareSearchFiles(a: MediaFileRecord, b: MediaFileRecord, needle: string, sortBy: GallerySortBy, sortOrder: GallerySortOrder): number {
  const tagDelta = tagSearchPriority(b.tags, needle) - tagSearchPriority(a.tags, needle);
  if (tagDelta !== 0) return tagDelta;
  return compareMedia(a, b, sortBy, sortOrder);
}

async function statMediaCandidates(
  candidates: MediaCandidate[],
  folderPath: string,
  signal?: AbortSignal,
) {
  const mediaInputs = await mediaStatWorker.mapSettled(
    candidates, async (entry) => {
      const stat = await fs.lstat(entry.absolutePath);
      if (!stat.isFile()) {
        throw Object.assign(new Error('Media path is no longer a regular file'), { code: 'ENOENT' });
      }
      signal?.throwIfAborted();
      const createdMs = Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
        ? stat.birthtimeMs
        : (Number.isFinite(stat.ctimeMs) && stat.ctimeMs > 0 ? stat.ctimeMs : stat.mtimeMs);
      const modifiedMs = Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : createdMs;
      return {
        path: entry.clientPath,
        folderPath: normalizePath(entry.folderPath || folderPath),
        name: entry.name,
        type: mediaTypeFromPath(entry.name),
        size: Number.isFinite(stat.size) ? Number(stat.size) : 0,
        createdMs,
        modifiedMs,
        revision: mediaFileRevision(stat),
        metadataRevision: await metadataFileRevision(entry.absolutePath, mediaFileRevision(stat)).catch(() => ''),
      };
    }, signal,
  );

  const unavailable = mediaInputs.find((result) => result.status === 'rejected' && !isMissingFsPathError(result.reason));
  if (unavailable?.status === 'rejected') throw unavailable.reason;

  return mediaInputs
    .filter((result): result is PromiseFulfilledResult<{
      path: string;
      folderPath: string;
      name: string;
      type: 'image' | 'gif' | 'video';
      size: number;
      createdMs: number;
      modifiedMs: number;
      revision: string;
      metadataRevision: string;
    }> => result.status === 'fulfilled')
    .map((result) => result.value);
}

function resolveGalleryPath(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (isAbsolute(raw)) return resolve(raw);
  // Match the main API's legacy output alias so thumbnails, metadata and editor
  // handoffs all resolve the same file. Absolute paths remain literal.
  const normalized = raw.replace(/\\/g, '/');
  const mapped = normalized === 'User/Outputs' || normalized.startsWith('User/Outputs/')
    ? `Tools/ComfyUI/output${normalized.slice('User/Outputs'.length)}`
    : normalized;
  return resolve(ROOT_DIR, mapped);
}

type GalleryPathAuthorizer = Awaited<ReturnType<typeof createGalleryPathAuthorizer>>;
let directPathAuthorizer: Promise<GalleryPathAuthorizer> | null = null;
let directPathAuthorizerExpiresAt = 0;

async function getDirectPathAuthorizer(): Promise<GalleryPathAuthorizer> {
  if (directPathAuthorizer && Date.now() < directPathAuthorizerExpiresAt) return directPathAuthorizer;
  directPathAuthorizerExpiresAt = Date.now() + 5000;
  directPathAuthorizer = (async () => {
    const roots = [ROOT_DIR];
    let app: Record<string, unknown> = {};
    try {
      const settings = JSON.parse(await fs.readFile(join(ROOT_DIR, 'User', 'Config', 'settings.json'), 'utf8')) as { app?: unknown };
      if (settings.app && typeof settings.app === 'object' && !Array.isArray(settings.app)) app = settings.app as Record<string, unknown>;
    } catch { /* Default roots remain available when settings cannot be read. */ }
    const addRoot = (value: unknown) => {
      if (typeof value !== 'string' || !value.trim() || value.includes('\0')) return;
      roots.push(resolveGalleryPath(value.replace(/\$\{PROJECT_ROOT\}/g, ROOT_DIR)));
    };
    addRoot(app['library.trashStoragePath'] || 'User/Trash');
    addRoot(app['comfyui.externalOutputPath']);
    if (app['library.enableExternalRoots'] !== false && Array.isArray(app['library.externalRoots'])) {
      for (const root of app['library.externalRoots']) addRoot(root);
    }
    return createGalleryPathAuthorizer(roots);
  })();
  try { return await directPathAuthorizer; }
  catch (error) { directPathAuthorizer = null; throw error; }
}

async function isDirectGalleryPathAllowed(pathValue: string): Promise<boolean> {
  const path = resolveGalleryPath(pathValue);
  if (!path) return false;
  const authorize = await getDirectPathAuthorizer();
  return Boolean(await authorize(path));
}

async function authorizeDirectGalleryFsRequest(req: Request, reqUrl: URL): Promise<Response | null> {
  if (!reqUrl.pathname.startsWith('/api/fs/')
    || (BRIDGE_TOKEN && req.headers.get('x-umbra-gallery-bridge-token') === BRIDGE_TOKEN)) return null;
  const paths: string[] = [];
  if (req.method === 'GET' && reqUrl.pathname === '/api/fs/search') {
    paths.push(...reqUrl.searchParams.getAll('root').concat(reqUrl.searchParams.getAll('roots'))
      .flatMap((value) => String(value || '').split('|')));
  } else if (req.method === 'GET') {
    const path = reqUrl.searchParams.get('path');
    if (path) paths.push(path);
  } else if (req.method === 'POST') {
    const body = await req.clone().json().catch(() => null) as Record<string, unknown> | null;
    if (typeof body?.path === 'string') paths.push(body.path);
    if (Array.isArray(body?.paths)) paths.push(...body.paths.filter((value): value is string => typeof value === 'string'));
    if (Array.isArray(body?.uids)) {
      paths.push(...galleryDb.resolvePathsForUids(body.uids.map((value) => String(value || ''))));
    }
  }
  for (const path of paths) {
    if (!(await isDirectGalleryPathAllowed(path))) return json({ error: 'Access denied' }, 403);
  }
  return null;
}

function createClientPathMapper(inputRoot: string, resolvedRoot: string) {
  const normalizedInputRoot = normalizePath(inputRoot);
  const normalizedResolvedRoot = normalizePath(resolvedRoot);
  const preserveRelativeRoot = Boolean(normalizedInputRoot) && !isAbsolute(normalizedInputRoot);
  return (resolvedPath: string) => {
    const normalizedResolvedPath = normalizePath(resolvedPath);
    if (!preserveRelativeRoot) return normalizedResolvedPath;
    if (normalizedResolvedPath === normalizedResolvedRoot) return normalizedInputRoot;
    const rel = normalizePath(relative(resolvedRoot, resolvedPath));
    if (!rel || rel.startsWith('..')) return normalizedResolvedPath;
    return normalizePath(join(normalizedInputRoot, rel));
  };
}

async function ensureDirectory(pathValue: string): Promise<string> {
  const resolved = resolveGalleryPath(pathValue);
  if (!resolved) throw new Error('Missing path');
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) throw new Error('Path is not a directory');
  return resolved;
}

async function ensureFile(pathValue: string): Promise<string> {
  const resolved = resolveGalleryPath(pathValue);
  if (!resolved) throw new Error('Missing path');
  const stat = await fs.stat(resolved);
  if (!stat.isFile()) throw new Error('Path is not a file');
  return resolved;
}

function resolveStaticFile(pathname: string): string | null {
  const normalized = pathname.replace(/\\/g, '/');
  const candidate = normalized === '/' ? '/index.html' : normalized;
  const resolvedPath = resolve(PUBLIC_DIR, `.${candidate}`);
  const relativePath = relative(PUBLIC_DIR, resolvedPath);
  if (relativePath === '..' || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) return null;
  return resolvedPath;
}

function isLoopbackHost(value: string): boolean {
  const host = String(value || '').trim().toLowerCase().replace(/^\[|\]$/g, '');
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function isTrustedBrowserOrigin(value: string): boolean {
  try {
    const origin = new URL(value);
    const bridgeOrigin = new URL(BRIDGE_URL);
    const isWorkerOrigin = isLoopbackHost(origin.hostname) && Number(origin.port || 80) === PORT;
    const isMainOrigin = isLoopbackHost(origin.hostname)
      && isLoopbackHost(bridgeOrigin.hostname)
      && Number(origin.port || 80) === Number(bridgeOrigin.port || 80);
    return (origin.protocol === 'http:' || origin.protocol === 'https:') && (isWorkerOrigin || isMainOrigin);
  } catch {
    return false;
  }
}

function hasTrustedBrowserReferer(req: Request): boolean {
  const referer = String(req.headers.get('referer') || '').trim();
  if (!referer) return false;
  try {
    return isTrustedBrowserOrigin(new URL(referer).origin);
  } catch {
    return false;
  }
}

function isAdmittedBridgeRequest(req: Request, reqUrl: URL): boolean {
  if (!isLoopbackHost(reqUrl.hostname)) return false;
  const origin = String(req.headers.get('origin') || '').trim();
  if (origin) return isTrustedBrowserOrigin(origin);
  if (BRIDGE_TOKEN && req.headers.get('x-umbra-gallery-bridge-token') === BRIDGE_TOKEN) return true;
  // An iframe navigation can omit Origin while retaining its trusted parent
  // Referer. This keeps localhost/127.0.0.1 aliases usable without admitting
  // a foreign parent that embeds the worker directly.
  if (hasTrustedBrowserReferer(req)) return true;
  // Same-origin static media commonly has no Origin or Referer. Cross-site
  // no-Origin navigations and subresource loads must not reach this API. An
  // absent Fetch Metadata header gives us no evidence of a trusted browser.
  const fetchSite = String(req.headers.get('sec-fetch-site') || '').trim().toLowerCase();
  return fetchSite === 'same-origin' || fetchSite === 'none';
}

function withTrustedCors(req: Request, response: Response): Response {
  const origin = String(req.headers.get('origin') || '').trim();
  if (origin && isTrustedBrowserOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
  }
  return response;
}

function corsPreflight(req: Request, reqUrl: URL): Response {
  if (!isAdmittedBridgeRequest(req, reqUrl)) return json({ error: 'Gallery bridge request denied' }, 403);
  const origin = String(req.headers.get('origin') || '').trim();
  if (!origin || !isTrustedBrowserOrigin(origin)) return json({ error: 'Gallery bridge request denied' }, 403);
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Vary': 'Origin',
    },
  });
}

async function runBunGalleryFsGet(reqUrl: URL, handler: () => Promise<Response> | Response): Promise<Response> {
  const startedAt = nowMs();
  const response = await handler();
  response.headers.set('X-Gallery-Core', 'bun');
  response.headers.set('X-Gallery-Bridge-Ms', String(Math.round((nowMs() - startedAt) * 10) / 10));
  traceGalleryService('bun_fs', {
    path: reqUrl.pathname,
    folderPath: reqUrl.searchParams.get('path') || '',
    status: response.status,
    durationMs: nowMs() - startedAt,
  }, 500);
  return response;
}

async function proxyToMain(req: Request, reqUrl: URL): Promise<Response> {
  if (req.method === 'OPTIONS') return corsPreflight(req, reqUrl);

  const bridgePath = reqUrl.pathname.replace(/^\/bridge/, '') || '/';
  const targetUrl = new URL(`${bridgePath}${reqUrl.search}`, BRIDGE_URL);
  if (targetUrl.origin !== new URL(BRIDGE_URL).origin) {
    return json({ error: 'Gallery bridge target denied' }, 400);
  }
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');
  headers.delete('x-umbra-gallery-bridge-token');

  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(10000),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
  }

  try {
    const upstream = await fetch(targetUrl.toString(), init);
    const responseHeaders = new Headers(upstream.headers);
    return withTrustedCors(req, new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    }));
  } catch (error: any) {
    return json({
      error: error?.message || 'Bridge request failed',
      target: targetUrl.toString(),
    }, 502);
  }
}

async function handleTree(reqUrl: URL): Promise<Response> {
  const startedAt = nowMs();
  const pathValue = reqUrl.searchParams.get('path') || '';
  const force = String(reqUrl.searchParams.get('force') || '').trim() === '1';
  const shallow = reqUrl.searchParams.get('shallow') === '1';
  try {
    const ensureStartedAt = nowMs();
    const dirPath = await ensureDirectory(pathValue);
    const ensureMs = nowMs() - ensureStartedAt;
    const toClientPath = createClientPathMapper(pathValue, dirPath);
    const toResponseFolders = (folders: FolderTreeNode[]) => folders.map((folder) => ({
      name: folder.name,
      path: toClientPath(folder.path),
    }));
    registerPrewarmRoot(dirPath);
    if (force) {
      invalidateFolderTree(dirPath);
      if (!shallow) invalidateFolderSummary(dirPath);
    }

    const cachedFolders = force ? null : getCachedFolderTree(dirPath);
    if (cachedFolders) {
      traceGalleryService('tree', {
        folderPath: normalizePath(pathValue) || dirPath,
        folders: cachedFolders.length,
        ensureMs,
        cacheHit: true,
        durationMs: nowMs() - startedAt,
      });
      return json({ folders: toResponseFolders(cachedFolders) });
    }

    const workerStartedAt = nowMs();
    const folders = await treeWorker.run(`tree:${dirPath}:force:${force ? startedAt : 0}`, async () => {
      const workerCachedFolders = force ? null : getCachedFolderTree(dirPath);
      if (workerCachedFolders) return workerCachedFolders;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const nextFolders = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => ({
          name: entry.name,
          path: join(dirPath, entry.name),
        }))
        .sort((a, b) => galleryNameCollator.compare(a.name, b.name));
      setCachedFolderTree(dirPath, nextFolders);
      return nextFolders;
    });
    const workerMs = nowMs() - workerStartedAt;

    if (!shallow) setTimeout(() => {
      scheduleFolderSummaryPrewarm(dirPath);
      // Child discovery and warming are paced by the background scheduler.
    }, 0);
    traceGalleryService('tree', {
      folderPath: normalizePath(pathValue) || dirPath,
      folders: folders.length,
      ensureMs,
      workerMs,
      cacheHit: false,
      durationMs: nowMs() - startedAt,
    });
    return json({ folders: toResponseFolders(folders) });
  } catch (error: any) {
    if (isMissingFsPathError(error)) {
      const folderPath = normalizePath(pathValue);
      invalidateFolderTree(folderPath, true);
      invalidateFolderSummary(folderPath, true);
      return json({
        folders: [],
        missing: true,
        path: folderPath,
      });
    }
    traceGalleryService('tree_error', {
      folderPath: normalizePath(pathValue),
      error: error?.message || 'Failed to list tree folders',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Failed to list tree folders' }, 400);
  }
}

function createMissingListProgressivePayload(pathValue: string, sortBy: GallerySortBy, sortOrder: GallerySortOrder) {
  const folderPath = normalizePath(pathValue);
  return {
    folders: [],
    files: [],
    done: true,
    nextCursor: null,
    total: 0,
    sortBy,
    sortOrder,
    missing: true,
    path: folderPath,
  };
}

type GalleryDirectorySnapshot = {
  dirPath: string;
  clientFolderPath: string;
  sortBy: GallerySortBy;
  sortOrder: GallerySortOrder;
  fastPage: boolean;
  folders: Array<{ name: string; path: string }>;
  candidates: MediaCandidate[];
  orderedFiles?: MediaFileRecord[];
  candidateCount: number;
  inventorySignature: string;
  expiresAt: number;
};
const directorySnapshots = new Map<string, GalleryDirectorySnapshot>();
const DIRECTORY_SNAPSHOT_TTL_MS = 120_000;

function rememberDirectorySnapshot(snapshot: GalleryDirectorySnapshot): string | undefined {
  for (const [id, entry] of directorySnapshots) {
    if (entry.expiresAt <= Date.now()) directorySnapshots.delete(id);
  }
  const snapshotSize = (entry: GalleryDirectorySnapshot) => entry.orderedFiles?.length || entry.candidates.length;
  if (snapshotSize(snapshot) > 100_000) return undefined;
  let total = snapshotSize(snapshot);
  for (const entry of directorySnapshots.values()) total += snapshotSize(entry);
  while (directorySnapshots.size >= 8 || total > 100_000) {
    const oldest = directorySnapshots.entries().next().value;
    if (!oldest) break;
    total -= snapshotSize(oldest[1]);
    directorySnapshots.delete(oldest[0]);
  }
  const id = `bun:${crypto.randomUUID()}`;
  directorySnapshots.set(id, snapshot);
  return id;
}

async function buildListProgressivePayload(
  dirPath: string,
  clientFolderPath: string,
  cursor: number,
  limit: number,
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
  fastPage: boolean,
  requestedSnapshot?: string,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const traceStartedAt = nowMs();
  let readdirMs = 0;
  let statUpsertMs = 0;
  let pageMs = 0;
  const normalizedClientFolderPath = normalizePath(clientFolderPath) || normalizePath(dirPath);
  const toClientPath = createClientPathMapper(normalizedClientFolderPath, dirPath);
  const readdirStartedAt = nowMs();
  let snapshot = requestedSnapshot ? directorySnapshots.get(requestedSnapshot) : undefined;
  if (requestedSnapshot && (!snapshot || snapshot.expiresAt <= Date.now()
    || snapshot.dirPath !== dirPath || snapshot.clientFolderPath !== normalizedClientFolderPath
    || snapshot.sortBy !== sortBy || snapshot.sortOrder !== sortOrder || snapshot.fastPage !== fastPage)) {
    throw new Error('Gallery listing expired. Refresh the folder to retry.');
  }
  let snapshotId = requestedSnapshot;
  if (!snapshot) {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    signal?.throwIfAborted();
    readdirMs = nowMs() - readdirStartedAt;
    const folders = entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: toClientPath(join(dirPath, entry.name)),
      }))
      .sort(compareGalleryEntryNames);

    const mediaCandidates = entries
      .filter((entry) => entry.isFile() && isSupportedMediaPath(entry.name))
      .map((entry) => ({
        name: entry.name,
        absolutePath: join(dirPath, entry.name),
        clientPath: toClientPath(join(dirPath, entry.name)),
        folderPath: normalizedClientFolderPath,
      }));
    mediaCandidates.sort(compareMediaCandidatesByName);
    const namesSignature = inventorySignatureFromSortedEntries(folders, mediaCandidates);
    snapshot = {
      dirPath, clientFolderPath: normalizedClientFolderPath, sortBy, sortOrder, fastPage,
      folders, candidates: mediaCandidates, candidateCount: mediaCandidates.length,
      inventorySignature: namesSignature,
      expiresAt: Date.now() + DIRECTORY_SNAPSHOT_TTL_MS,
    };
    if (fastPage) snapshotId = rememberDirectorySnapshot(snapshot);
  }
  snapshot.expiresAt = Date.now() + DIRECTORY_SNAPSHOT_TTL_MS;
  const folders = snapshot.folders;
  const mediaCandidates = snapshot.candidates;

  let page: MediaFileRecord[] = [];
  let total = snapshot.candidateCount;
  let nextCursor: number | null = null;

  const pageStartedAt = nowMs();
  if (snapshot.orderedFiles) {
    total = snapshot.orderedFiles.length;
    page = snapshot.orderedFiles.slice(cursor, cursor + limit);
    nextCursor = cursor + page.length < total ? cursor + page.length : null;
  } else if (fastPage) {
    const pageCandidates = sortOrder === 'desc'
      ? mediaCandidates.slice(Math.max(0, total - cursor - limit), Math.max(0, total - cursor)).reverse()
      : mediaCandidates.slice(cursor, cursor + limit);
    const statStartedAt = nowMs();
    const validInputs = await statMediaCandidates(pageCandidates, normalizedClientFolderPath, signal);
    signal?.throwIfAborted();
    const inputsByFolder = new Map<string, typeof validInputs>();
    for (const input of validInputs) {
      const key = normalizePath(input.folderPath || normalizedClientFolderPath);
      const existing = inputsByFolder.get(key) || [];
      existing.push(input);
      inputsByFolder.set(key, existing);
    }
    const mediaFiles: MediaFileRecord[] = [];
    for (const [folderPath, inputs] of inputsByFolder) {
      mediaFiles.push(...upsertGalleryFiles(folderPath, inputs));
    }
    statUpsertMs = nowMs() - statStartedAt;
    mediaFiles.sort((a, b) => compareMedia(a, b, sortBy, sortOrder));
    page = mediaFiles;
    nextCursor = cursor + pageCandidates.length < total ? cursor + pageCandidates.length : null;
  } else {
    const statStartedAt = nowMs();
    const validInputs = await statMediaCandidates(mediaCandidates, normalizedClientFolderPath, signal);
    signal?.throwIfAborted();
    const inputsByFolder = new Map<string, typeof validInputs>();
    for (const input of validInputs) {
      const key = normalizePath(input.folderPath || normalizedClientFolderPath);
      const existing = inputsByFolder.get(key) || [];
      existing.push(input);
      inputsByFolder.set(key, existing);
    }
    const mediaFiles: MediaFileRecord[] = [];
    for (const [folderPath, inputs] of inputsByFolder) {
      mediaFiles.push(...upsertGalleryFiles(folderPath, inputs));
    }
    statUpsertMs = nowMs() - statStartedAt;
    mediaFiles.sort((a, b) => compareMedia(a, b, sortBy, sortOrder));
    total = mediaFiles.length;
    page = mediaFiles.slice(cursor, cursor + limit);
    nextCursor = cursor + page.length < total ? cursor + page.length : null;
    if (nextCursor !== null) {
      snapshot.candidates = [];
      snapshot.orderedFiles = mediaFiles;
      snapshotId = rememberDirectorySnapshot(snapshot);
    }
  }
  pageMs = nowMs() - pageStartedAt;

  if (cursor === 0) {
    scheduleFolderSummaryPrewarm(dirPath);
    for (const folder of folders.slice(0, FOLDER_SUMMARY_PREWARM_CHILD_LIMIT)) {
      scheduleFolderSummaryPrewarm(folder.path);
    }
  }
  if (cursor === 0) schedulePageThumbnailPrewarm(page);
  traceGalleryService('list_build', {
    folderPath: normalizedClientFolderPath,
    cursor,
    limit,
    sortBy,
    sortOrder,
    fastPage,
    folders: folders.length,
    mediaCandidates: snapshot.candidateCount,
    pageFiles: page.length,
    total,
    nextCursor,
    readdirMs,
    statUpsertMs,
    pageMs,
    durationMs: nowMs() - traceStartedAt,
  }, 500);

  return {
    folders,
    files: await serializeGalleryFiles(page, signal),
    inventorySignature: snapshot.inventorySignature,
    done: nextCursor == null,
    nextCursor,
    total,
    sortBy,
    sortOrder,
    ...(snapshotId ? { snapshot: snapshotId } : {}),
  };
}

async function handleListProgressive(reqUrl: URL, signal?: AbortSignal): Promise<Response> {
  const startedAt = nowMs();
  const pathValue = reqUrl.searchParams.get('path') || '';
  try {
    signal?.throwIfAborted();
    const ensureStartedAt = nowMs();
    const dirPath = await ensureDirectory(pathValue);
    signal?.throwIfAborted();
    const ensureMs = nowMs() - ensureStartedAt;
    registerPrewarmRoot(dirPath);
    const mediaFolderKey = normalizePath(dirPath);
    recentlyOpenedMediaFolders.delete(mediaFolderKey);
    recentlyOpenedMediaFolders.set(mediaFolderKey, Date.now());
    while (recentlyOpenedMediaFolders.size > 64) recentlyOpenedMediaFolders.delete(recentlyOpenedMediaFolders.keys().next().value!);
    const cursor = Math.max(0, Number(reqUrl.searchParams.get('cursor') || 0) || 0);
    const limit = clamp(Number(reqUrl.searchParams.get('limit') || 72) || 72, 1, 256);
    const sortBy = parseSortBy(reqUrl.searchParams.get('sortBy'));
    const sortOrder = parseSortOrder(reqUrl.searchParams.get('sortOrder'));
    // A name-ordered slice is only a valid page for name sorting. Time and
    // custom order require the complete set of file stats before slicing.
    const fastPage = String(reqUrl.searchParams.get('fast') || '').trim() === '1' && sortBy === 'name';
    const force = String(reqUrl.searchParams.get('force') || '').trim() === '1';
    if (force && cursor === 0) {
      invalidateFolderTree(dirPath);
      invalidateFolderSummary(dirPath, true);
    }
    const snapshot = cursor > 0 ? reqUrl.searchParams.get('snapshot') || undefined : undefined;
    const requestKey = `list:${dirPath}:${normalizePath(pathValue)}:${sortBy}:${sortOrder}:${cursor}:${limit}:fast:${fastPage ? 1 : 0}:snapshot:${snapshot || ''}:force:${force ? startedAt : 0}`;
    const workerStartedAt = nowMs();
    const payload = await galleryWorker.runCancellable(requestKey, async workSignal => (
      buildListProgressivePayload(dirPath, normalizePath(pathValue) || dirPath, cursor, limit, sortBy, sortOrder, fastPage, snapshot, workSignal)
    ), signal);
    const workerMs = nowMs() - workerStartedAt;
    traceGalleryService('list_progressive', {
      folderPath: normalizePath(pathValue) || dirPath,
      cursor,
      limit,
      sortBy,
      sortOrder,
      fastPage,
      ensureMs,
      workerMs,
      folders: Array.isArray(payload.folders) ? payload.folders.length : 0,
      files: Array.isArray(payload.files) ? payload.files.length : 0,
      total: payload.total,
      nextCursor: payload.nextCursor,
      done: payload.done,
      durationMs: nowMs() - startedAt,
    }, 250);
    return json(payload);
  } catch (error: any) {
    if (signal?.aborted) return new Response(null, { status: 499 });
    if (isMissingFsPathError(error)) {
      const sortBy = parseSortBy(reqUrl.searchParams.get('sortBy'));
      const sortOrder = parseSortOrder(reqUrl.searchParams.get('sortOrder'));
      const folderPath = normalizePath(pathValue);
      invalidateFolderTree(folderPath, true);
      invalidateFolderSummary(folderPath, true);
      return json(createMissingListProgressivePayload(pathValue, sortBy, sortOrder));
    }
    traceGalleryService('list_progressive_error', {
      folderPath: normalizePath(pathValue),
      error: error?.message || 'Failed to list folder contents',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Failed to list folder contents' }, 400);
  }
}

async function handleFolderSummary(reqUrl: URL): Promise<Response> {
  const pathValue = reqUrl.searchParams.get('path') || '';
  const normalizedInputPath = normalizePath(pathValue);
  try {
    const force = String(reqUrl.searchParams.get('force') || '').trim() === '1';
    const dirPath = await ensureDirectory(pathValue);
    registerPrewarmRoot(dirPath);

    const summary = await getFolderSummary(dirPath, force);
    prewarmChildFolderSummaries(dirPath).catch(() => undefined);

    return json({ ...summary, signature: `${summary.signature || ''}:metadata:${galleryDb.getFolderMetadataRevision(dirPath)}` });
  } catch (error: any) {
    if (isMissingFsPathError(error)) {
      return json(createEmptyFolderSummary(normalizedInputPath || pathValue));
    }
    return json({ error: error?.message || 'Failed to summarize folder' }, 400);
  }
}

async function handleSearch(reqUrl: URL, signal?: AbortSignal): Promise<Response> {
  const startedAt = nowMs();
  const query = normalizeSearchQuery(reqUrl.searchParams.get('q') || reqUrl.searchParams.get('query') || '');
  const sortBy = parseSortBy(reqUrl.searchParams.get('sortBy'));
  const sortOrder = parseSortOrder(reqUrl.searchParams.get('sortOrder'));
  const fileLimit = clamp(Number(reqUrl.searchParams.get('limit') || 360) || 360, 1, 1200);
  const folderLimit = clamp(Number(reqUrl.searchParams.get('folderLimit') || 120) || 120, 1, 600);
  const maxFolders = clamp(Number(reqUrl.searchParams.get('maxFolders') || 1800) || 1800, 1, 6000);
  const maxDurationMs = clamp(Number(reqUrl.searchParams.get('maxMs') || 1800) || 1800, 300, 5000);
  const rootValues = reqUrl.searchParams.getAll('root')
    .concat(reqUrl.searchParams.getAll('roots'))
    .flatMap((entry) => String(entry || '').split('|'))
    .map(normalizePath)
    .filter(Boolean);

  if (query.length < SEARCH_MIN_QUERY_LENGTH) {
    return json({
      query,
      files: [],
      folders: [],
      scannedFolders: 0,
      done: true,
    });
  }

  try {
    const resolvedRoots: Array<{
      inputPath: string;
      dirPath: string;
      clientRootPath: string;
      toClientPath: (resolvedPath: string) => string;
    }> = [];
    const seenRoots = new Set<string>();
    for (const rootValue of rootValues) {
      signal?.throwIfAborted();
      try {
        const dirPath = await ensureDirectory(rootValue);
        signal?.throwIfAborted();
        const key = normalizePath(dirPath).toLowerCase();
        if (!key || seenRoots.has(key)) continue;
        seenRoots.add(key);
        registerPrewarmRoot(dirPath);
        const toClientPath = createClientPathMapper(rootValue, dirPath);
        resolvedRoots.push({
          inputPath: rootValue,
          dirPath,
          clientRootPath: normalizePath(rootValue) || normalizePath(dirPath),
          toClientPath,
        });
      } catch {
        // Ignore roots that are currently unavailable; the UI may keep stale external entries.
      }
    }

    signal?.throwIfAborted();
    if (resolvedRoots.length === 0) {
      return json({
        query,
        files: [],
        folders: [],
        scannedFolders: 0,
        done: true,
      });
    }

    const filesByPath = new Map<string, MediaFileRecord>();
    const foldersByPath = new Map<string, SearchFolderResult>();
    // The index can outlive external moves and deletes. Verify hits against
    // disk before they consume the visible result limit, and refresh their
    // current stats/metadata without discarding tags or custom order.
    const authorizeIndexedPath = await createGalleryPathAuthorizer(resolvedRoots.map((root) => root.dirPath));
    const indexedPageSize = Math.max(64, Math.min(256, fileLimit * 3));
    type IndexedInput = Awaited<ReturnType<typeof statMediaCandidates>>[number];
    let bestIndexed: Array<{ file: MediaFileRecord; input: IndexedInput }> = [];
    let indexedOffset = 0;
    let indexedCapped = false;
    while (true) {
      signal?.throwIfAborted();
      if (indexedOffset > 0 && nowMs() - startedAt >= maxDurationMs) {
        indexedCapped = true;
        break;
      }
      const indexedFiles = galleryDb.searchFiles(
        resolvedRoots.map((root) => root.clientRootPath),
        query,
        indexedPageSize,
        indexedOffset,
      );
      indexedOffset += indexedFiles.length;
      if (indexedFiles.length === 0) break;
      const matchingFiles = indexedFiles.filter((file) => fileMatchesSearch(file, query));
      const matchingByPath = new Map(matchingFiles.map((file) => [normalizePath(file.path).toLowerCase(), file]));
      const pageBest: Array<{ file: MediaFileRecord; input: IndexedInput }> = [];
      for (let offset = 0; offset < matchingFiles.length; offset += 64) {
        if (offset > 0 && nowMs() - startedAt >= maxDurationMs) {
          indexedCapped = true;
          break;
        }
        const batch = matchingFiles.slice(offset, offset + 64);
        const authorized = await Promise.all(batch.map(async (file) => {
          const absolutePath = resolveGalleryPath(file.path);
          return await authorizeIndexedPath(absolutePath) ? {
            name: file.name,
            absolutePath,
            clientPath: file.path,
            folderPath: file.folderPath,
          } : null;
        }));
        const permittedCandidates = authorized.filter((candidate): candidate is MediaCandidate => Boolean(candidate));
        for (const input of await statMediaCandidates(permittedCandidates, '', signal)) {
          const indexed = matchingByPath.get(normalizePath(input.path).toLowerCase());
          if (!indexed) continue;
          const file: MediaFileRecord = {
            ...indexed,
            size: input.size,
            createdMs: input.createdMs,
            modifiedMs: input.modifiedMs,
            revision: input.revision,
            metadataRevision: input.metadataRevision,
          };
          if (fileMatchesSearch(file, query)) pageBest.push({ file, input });
        }
      }
      bestIndexed = bestIndexed.concat(pageBest)
        .sort((a, b) => compareSearchFiles(a.file, b.file, query, sortBy, sortOrder))
        .slice(0, fileLimit);
      if (indexedCapped) break;
      if (indexedFiles.length < indexedPageSize) break;
    }
    const indexedInputs = bestIndexed.map((entry) => entry.input);
    const indexedByFolder = new Map<string, typeof indexedInputs>();
    for (const input of indexedInputs) {
      const folder = normalizePath(input.folderPath);
      const items = indexedByFolder.get(folder) || [];
      items.push(input);
      indexedByFolder.set(folder, items);
    }
    for (const [folder, inputs] of indexedByFolder) {
      for (const file of upsertGalleryFiles(folder, inputs)) {
        if (!fileMatchesSearch(file, query)) continue;
        const key = normalizePath(file.path).toLowerCase();
        if (!key || filesByPath.has(key)) continue;
        filesByPath.set(key, file);
      }
    }

    let scannedFolders = 0;
    let capped = indexedCapped;
    const queue: Array<{ absolutePath: string; clientPath: string; rootPath: string; toClientPath: (resolvedPath: string) => string }> = [];
    const seenDirectories = new Set<string>();
    for (const root of resolvedRoots) {
      seenDirectories.add(normalizePath(root.dirPath).toLowerCase());
      queue.push({
        absolutePath: root.dirPath,
        clientPath: root.clientRootPath,
        rootPath: root.clientRootPath,
        toClientPath: root.toClientPath,
      });
      if (textMatchesSearch(basename(root.clientRootPath) || root.clientRootPath, query) || textMatchesSearch(root.clientRootPath, query)) {
        foldersByPath.set(root.clientRootPath.toLowerCase(), {
          name: basename(root.clientRootPath) || root.clientRootPath,
          path: root.clientRootPath,
          rootPath: root.clientRootPath,
        });
      }
    }

    let queueIndex = 0;
    while (queueIndex < queue.length && scannedFolders < maxFolders && nowMs() - startedAt < maxDurationMs) {
      signal?.throwIfAborted();
      const current = queue[queueIndex++];
      if (!current) continue;
      scannedFolders += 1;
      if (!(await authorizeIndexedPath(current.absolutePath))) continue;
      let entries: Dirent<string>[];
      try {
        entries = await fs.readdir(current.absolutePath, { withFileTypes: true });
      } catch {
        continue;
      }

      signal?.throwIfAborted();
      const directories = entries
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => galleryNameCollator.compare(a.name, b.name));
      for (const entry of directories) {
        const absolutePath = join(current.absolutePath, entry.name);
        const absoluteKey = normalizePath(absolutePath).toLowerCase();
        if (!absoluteKey || seenDirectories.has(absoluteKey)) continue;
        seenDirectories.add(absoluteKey);
        const clientPath = current.toClientPath(absolutePath);
        const key = normalizePath(clientPath).toLowerCase();
        if (!key) continue;
        if (foldersByPath.size < folderLimit && (textMatchesSearch(entry.name, query) || textMatchesSearch(clientPath, query))) {
          foldersByPath.set(key, {
            name: entry.name,
            path: normalizePath(clientPath),
            rootPath: current.rootPath,
          });
        }
        queue.push({
          absolutePath,
          clientPath,
          rootPath: current.rootPath,
          toClientPath: current.toClientPath,
        });
      }

      const filenameMatches = entries
        .filter((entry) => entry.isFile() && isSupportedMediaPath(entry.name)
          && (textMatchesSearch(entry.name, query) || textMatchesSearch(current.clientPath, query)))
        .map((entry) => ({
          name: entry.name,
          absolutePath: join(current.absolutePath, entry.name),
          clientPath: current.toClientPath(join(current.absolutePath, entry.name)),
          folderPath: normalizePath(current.clientPath),
        }))
        .filter((candidate) => !filesByPath.has(normalizePath(candidate.clientPath).toLowerCase()));
      for (let offset = 0; offset < filenameMatches.length; offset += 64) {
        if (nowMs() - startedAt >= maxDurationMs) {
          capped = true;
          break;
        }
        const inputs = await statMediaCandidates(filenameMatches.slice(offset, offset + 64), normalizePath(current.clientPath), signal);
        signal?.throwIfAborted();
        const indexed = upsertGalleryFiles(normalizePath(current.clientPath), inputs);
        for (const file of indexed) {
          if (!fileMatchesSearch(file, query)) continue;
          const key = normalizePath(file.path).toLowerCase();
          if (!key) continue;
          filesByPath.set(key, file);
        }
        const bestFiles = Array.from(filesByPath.values())
          .sort((a, b) => compareSearchFiles(a, b, query, sortBy, sortOrder))
          .slice(0, fileLimit);
        filesByPath.clear();
        for (const file of bestFiles) filesByPath.set(normalizePath(file.path).toLowerCase(), file);
      }
      if (capped) break;
    }
    signal?.throwIfAborted();
    if (queueIndex < queue.length) capped = true;

    const files = Array.from(filesByPath.values())
      .filter((file) => fileMatchesSearch(file, query))
      .sort((a, b) => compareSearchFiles(a, b, query, sortBy, sortOrder))
      .slice(0, fileLimit);
    const folders = Array.from(foldersByPath.values())
      .sort((a, b) => galleryNameCollator.compare(a.path, b.path))
      .slice(0, folderLimit);

    traceGalleryService('search', {
      query,
      roots: resolvedRoots.length,
      files: files.length,
      folders: folders.length,
      scannedFolders,
      capped,
      durationMs: nowMs() - startedAt,
    }, 250);

    return json({
      query,
      files: await serializeGalleryFiles(files, signal),
      folders,
      scannedFolders,
      done: !capped,
      sortBy,
      sortOrder,
    });
  } catch (error: any) {
    if (signal?.aborted) return new Response(null, { status: 499 });
    traceGalleryService('search_error', {
      query,
      error: error?.message || 'Gallery search failed',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Gallery search failed' }, 400);
  }
}

async function handleMetadataSearch(reqUrl: URL, signal?: AbortSignal): Promise<Response> {
  const startedAt = nowMs();
  const pathValue = reqUrl.searchParams.get('path') || '';
  const query = String(reqUrl.searchParams.get('q') || reqUrl.searchParams.get('query') || '').replace(/\s+/g, ' ').trim();
  const limit = clamp(Number(reqUrl.searchParams.get('limit') || 2000) || 2000, 1, 5000);
  try {
    if (query.length < 2) {
      return json({
        query,
        folderPath: normalizePath(pathValue),
        matches: [],
        total: 0,
      } satisfies MetadataSearchPayload);
    }
    const dirPath = await ensureDirectory(pathValue);
    registerPrewarmRoot(dirPath);
    const folderPath = normalizePath(pathValue) || normalizePath(dirPath);
    const authorizeMatch = await createGalleryPathAuthorizer([dirPath]);
    const matches: GalleryMetadataSearchMatch[] = [];
    const pageSize = Math.max(64, Math.min(256, limit * 2));
    let indexedOffset = 0;
    while (matches.length < limit) {
      signal?.throwIfAborted();
      if (indexedOffset > 0 && nowMs() - startedAt >= 5000) {
        return json({ error: 'Metadata search timed out; refine the query' }, 503);
      }
      const indexedMatches = galleryDb.searchFolderMetadata(folderPath, query, pageSize, indexedOffset);
      indexedOffset += indexedMatches.length;
      if (indexedMatches.length === 0) break;
      for (let offset = 0; offset < indexedMatches.length; offset += 16) {
        signal?.throwIfAborted();
        const batch = indexedMatches.slice(offset, offset + 16);
        const states = await Promise.all(batch.map(async (match): Promise<'live' | 'missing' | 'denied'> => {
          const path = resolveGalleryPath(match.path);
          if (!(await authorizeMatch(path))) return 'denied';
          try { return (await fs.lstat(path)).isFile() ? 'live' : 'missing'; }
          catch (error) {
            if (isMissingFsPathError(error)) return 'missing';
            throw error;
          }
        }));
        for (let index = 0; index < batch.length && matches.length < limit; index++) {
          if (states[index] === 'live') matches.push(batch[index]);
        }
        if (matches.length >= limit) break;
      }
      if (indexedMatches.length < pageSize) break;
    }
    traceGalleryService('metadata_search', {
      folderPath,
      query,
      matches: matches.length,
      durationMs: nowMs() - startedAt,
    }, 250);
    return json({
      query,
      folderPath,
      matches,
      total: matches.length,
    } satisfies MetadataSearchPayload);
  } catch (error: any) {
    if (signal?.aborted) return new Response(null, { status: 499 });
    traceGalleryService('metadata_search_error', {
      folderPath: normalizePath(pathValue),
      query,
      error: error?.message || 'Failed to search metadata',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Failed to search metadata' }, 400);
  }
}

async function handleMkdir(req: Request): Promise<Response> {
  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawPath = String((payload as { path?: unknown }).path || '').trim();
    if (!rawPath) {
      return json({ error: 'Path required' }, 400);
    }

    const normalizedPath = normalizePath(rawPath);
    const name = normalizedPath.split('/').pop() || '';
    if (!name || name.includes('/') || name.includes('\\') || name === '.' || name === '..') {
      return json({ error: 'Invalid folder name' }, 400);
    }

    const targetPath = resolveGalleryPath(normalizedPath);
    if (!targetPath) {
      return json({ error: 'Invalid path' }, 400);
    }

    const parentPath = normalizePath(join(targetPath, '..'));
    await ensureDirectory(parentPath);
    await fs.mkdir(targetPath, { recursive: true });

    folderSummaryCache.delete(parentPath);
    folderSummaryCache.delete(normalizePath(targetPath));
    invalidateFolderTree(parentPath);
    invalidateFolderTree(targetPath);
    registerPrewarmRoot(parentPath);
    registerPrewarmRoot(targetPath);
    scheduleFolderSummaryPrewarm(parentPath);
    scheduleFolderSummaryPrewarm(targetPath);

    return json({
      success: true,
      path: normalizePath(targetPath),
    });
  } catch (error: any) {
    return json({ error: error?.message || 'Failed to create folder' }, 400);
  }
}

type EmptyFolderCleanupMode = 'preview' | 'delete';

async function collectEmptyFoldersForCleanup(rootPath: string): Promise<string[]> {
  const root = await ensureDirectory(rootPath);
  const emptyFolders: string[] = [];

  const scan = async (folderPath: string): Promise<boolean> => {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    let hasRemainingContent = false;

    for (const entry of entries) {
      const childPath = join(folderPath, entry.name);
      if (entry.isDirectory()) {
        const childIsEmpty = await scan(childPath);
        if (!childIsEmpty) hasRemainingContent = true;
        continue;
      }
      hasRemainingContent = true;
    }

    if (!hasRemainingContent && normalizePath(folderPath) !== normalizePath(root)) {
      emptyFolders.push(normalizePath(folderPath));
      return true;
    }
    return false;
  };

  await scan(root);
  return emptyFolders.sort((a, b) => b.length - a.length || b.localeCompare(a));
}

async function handleEmptyFolders(req: Request, mode: EmptyFolderCleanupMode): Promise<Response> {
  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawPath = String((payload as { path?: unknown }).path || '').trim();
    if (!rawPath) return json({ error: 'Path required' }, 400);

    const rootPath = await ensureDirectory(rawPath);
    const emptyFolders = await collectEmptyFoldersForCleanup(rootPath);
    if (mode === 'preview') {
      return json({
        success: true,
        rootPath: normalizePath(rootPath),
        folders: emptyFolders,
        count: emptyFolders.length,
      });
    }

    const deleted: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];
    for (const folderPath of emptyFolders) {
      try {
        await fs.rmdir(folderPath);
        deleted.push(normalizePath(folderPath));
      } catch (error: any) {
        failed.push({
          path: normalizePath(folderPath),
          error: error?.message || 'Failed to remove folder',
        });
      }
    }

    invalidateFolderTree(rootPath, true);
    invalidateFolderSummary(rootPath, true);
    folderSummaryCache.delete(normalizePath(rootPath));
    registerPrewarmRoot(rootPath);
    scheduleFolderSummaryPrewarm(rootPath);

    return json({
      success: failed.length === 0,
      rootPath: normalizePath(rootPath),
      folders: emptyFolders,
      deleted,
      failed,
      count: emptyFolders.length,
      deletedCount: deleted.length,
      failedCount: failed.length,
    }, failed.length > 0 ? 207 : 200);
  } catch (error: any) {
    return json({ error: error?.message || 'Failed to clean empty folders' }, 400);
  }
}

async function handleReorder(req: Request): Promise<Response> {
  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const folderPathRaw = String((payload as any).path || '').trim();
    if (!folderPathRaw) {
      return json({ error: 'Missing folder path' }, 400);
    }

    const folderPath = await ensureDirectory(folderPathRaw);
    const orderedPathsRaw: unknown[] = Array.isArray((payload as any).orderedPaths) ? (payload as any).orderedPaths : [];
    const orderedPaths = Array.from(new Set(
      orderedPathsRaw
        .map((value: unknown) => normalizePath(String(value || '')))
        .filter(Boolean),
    ));
    const orderedRaw: unknown[] = Array.isArray((payload as any).orderedUids) ? (payload as any).orderedUids : [];
    const fallbackOrderedUids = Array.from(new Set(
      orderedRaw
        .map((value: unknown) => String(value || '').trim())
        .filter(Boolean),
    ));

    const orderedUidsFromPaths = orderedPaths.length > 0
      ? galleryDb.resolveUidsForFolderPaths(folderPath, orderedPaths)
      : [];
    const orderedUids = orderedUidsFromPaths.length > 0 ? orderedUidsFromPaths : fallbackOrderedUids;
    if (orderedUids.length === 0) {
      return json({ error: 'No valid ordered items resolved for reorder' }, 400);
    }
    const merged = galleryDb.reorderFolder(folderPath, orderedUids);
    return json({
      success: true,
      folderPath: normalizePath(folderPath),
      count: merged.length,
    });
  } catch (error: any) {
    return json({ error: error?.message || 'Failed to persist custom order' }, 400);
  }
}

async function handleAddTags(req: Request): Promise<Response> {
  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawUids = Array.isArray((payload as any).uids) ? (payload as any).uids : [];
    const rawTags = Array.isArray((payload as any).tags) ? (payload as any).tags : [];
    const uids = rawUids.map((entry: unknown) => String(entry || '').trim()).filter(Boolean);
    const tags = rawTags.map((entry: unknown) => String(entry || ''));

    if (uids.length === 0) {
      return json({ error: 'Missing uids' }, 400);
    }
    if (tags.length === 0) {
      return json({ error: 'Missing tags' }, 400);
    }

    const tagsByUid = galleryDb.addTagsToFiles(uids, tags);
    const serialized: Record<string, string[]> = {};
    tagsByUid.forEach((uidTags, uid) => {
      serialized[uid] = Array.isArray(uidTags) ? uidTags : [];
    });

    return json({
      success: true,
      updated: Object.keys(serialized).length,
      tagsByUid: serialized,
    });
  } catch (error: any) {
    return json({ error: error?.message || 'Failed to add tags' }, 400);
  }
}

async function handleSetTags(req: Request): Promise<Response> {
  try {
    const payload = await req.json().catch(() => ({} as Record<string, unknown>));
    const rawUids: unknown[] = Array.isArray((payload as any).uids) ? (payload as any).uids : [];
    const rawPaths: unknown[] = Array.isArray((payload as any).paths) ? (payload as any).paths : [];
    const rawTags: unknown[] = Array.isArray((payload as any).tags) ? (payload as any).tags : [];

    const directUids = Array.from(new Set(
      rawUids
        .map((entry: unknown) => String(entry || '').trim())
        .filter(Boolean),
    ));
    const paths = Array.from(new Set(
      rawPaths
        .map((entry: unknown) => normalizePath(String(entry || '')))
        .filter(Boolean),
    ));
    const pathResolvedUids = paths.length > 0
      ? galleryDb.resolveUidsForPaths(paths)
      : [];
    const uids = Array.from(new Set([...directUids, ...pathResolvedUids]));
    const tags = rawTags.map((entry: unknown) => String(entry || ''));

    if (uids.length === 0) {
      return json({ error: 'Missing uids or paths' }, 400);
    }

    const tagsByUid = galleryDb.setTagsForFiles(uids, tags);
    const serialized: Record<string, string[]> = {};
    tagsByUid.forEach((uidTags, uid) => {
      serialized[uid] = Array.isArray(uidTags) ? uidTags : [];
    });

    return json({
      success: true,
      updated: Object.keys(serialized).length,
      tagsByUid: serialized,
    });
  } catch (error: any) {
    return json({ error: error?.message || 'Failed to set tags' }, 400);
  }
}

async function buildBunImageThumbnail(filePath: string, sizePx: number, quality: number, fitMode: 'cover' | 'contain'): Promise<Buffer | null> {
  if (fitMode !== 'contain') return null;
  if (!BUN_IMAGE_STILL_EXTENSIONS.has(extname(filePath).toLowerCase())) return null;
  const BunImage = (globalThis as any)?.Bun?.Image;
  if (typeof BunImage !== 'function') return null;

  try {
    const output = await new BunImage(filePath)
      .resize(sizePx, sizePx, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality })
      .toBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
  } catch {
    return null;
  }
}

async function buildThumbnail(filePath: string, sizePx: number, quality: number, fitMode: 'cover' | 'contain'): Promise<Buffer> {
  const bunThumbnail = await buildBunImageThumbnail(filePath, sizePx, quality, fitMode);
  if (bunThumbnail) return bunThumbnail;

  const normalizedFit = normalizeThumbnailFitMode(fitMode);
  const input = isVideoPath(filePath)
    ? await extractVideoFrame(filePath, sizePx, fitMode)
    : filePath;
  return sharp(input, { failOn: 'none', animated: true })
    .rotate()
    .resize(sizePx, sizePx, {
      fit: normalizedFit,
      position: 'centre',
    })
    .webp({ quality })
    .toBuffer();
}

async function handleThumbnail(req: Request, reqUrl: URL): Promise<Response> {
  const startedAt = nowMs();
  const pathValue = reqUrl.searchParams.get('path') || '';
  try {
    const filePath = await ensureFile(pathValue);
    if (!isSupportedMediaPath(filePath)) {
      return json({ error: 'Unsupported media format' }, 400);
    }

    const sizeKey = String(reqUrl.searchParams.get('size') || 'small').toLowerCase();
    const sizePx = THUMB_SIZE_MAP[sizeKey] || THUMB_SIZE_MAP.small;
    const quality = clamp(Number(reqUrl.searchParams.get('q') || 70) || 70, 35, 95);
    const fitMode = normalizeThumbnailFitMode(reqUrl.searchParams.get('fit'));
    const lane = normalizeWorkerLane(
      reqUrl.searchParams.get('lane')
      || reqUrl.searchParams.get('worker')
      || reqUrl.searchParams.get('source'),
    );

    const stat = await fs.stat(filePath);
    const etag = getThumbnailEtag(stat, sizePx, quality, fitMode);
    const cacheControl = galleryMediaCacheControl(reqUrl.searchParams.get('rev'));

    const ifNoneMatch = req.headers.get('if-none-match') || '';
    if (ifNoneMatch && ifNoneMatch === etag) {
      traceGalleryService('thumbnail', {
        folderPath: normalizePath(pathValue),
        sizeKey,
        quality,
        fitMode,
        lane,
        cacheHit: true,
        status: 304,
        durationMs: nowMs() - startedAt,
      }, 750);
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': cacheControl,
          ETag: etag,
        },
      });
    }

    const cacheKey = getThumbnailCacheKey(filePath, sizePx, quality, fitMode);
    let cacheEntry = thumbnailCache.get(cacheKey);
    const cacheHit = Boolean(cacheEntry && cacheEntry.etag === etag);
    if (!cacheEntry || cacheEntry.etag !== etag) {
      cacheEntry = await getOrBuildThumbnailBuffer(filePath, sizePx, quality, fitMode, lane, etag);
    }
    const responseEtag = cacheEntry?.etag || etag;
    const buffer = cacheEntry?.buffer || Buffer.alloc(0);

    const response = new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': cacheControl,
        ETag: responseEtag,
        'X-Thumbnail-Size': sizeKey,
        'X-Thumbnail-Quality': String(quality),
        'X-Thumbnail-Fit': fitMode,
        'X-Thumbnail-Lane': lane,
        'X-Thumbnail-Source': 'gallery-bridge-local',
      },
    });
    traceGalleryService('thumbnail', {
      folderPath: normalizePath(pathValue),
      sizeKey,
      quality,
      fitMode,
      lane,
      cacheHit,
      bytes: buffer.byteLength,
      durationMs: nowMs() - startedAt,
    }, cacheHit ? 750 : 250);
    return response;
  } catch (error: any) {
    traceGalleryService('thumbnail_error', {
      folderPath: normalizePath(pathValue),
      error: error?.message || 'Failed to render thumbnail',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Failed to render thumbnail' }, 400);
  }
}

async function handleImage(req: Request, reqUrl: URL): Promise<Response> {
  try {
    const pathValue = reqUrl.searchParams.get('path') || '';
    const filePath = await ensureFile(pathValue);
    const lane = normalizeWorkerLane(
      reqUrl.searchParams.get('lane')
      || reqUrl.searchParams.get('worker')
      || reqUrl.searchParams.get('source'),
    );
    const laneWorker = getLaneWorker(lane);
    const stat = await laneWorker.run(`media-open:${filePath}`, async () => {
      const stat = await fs.stat(filePath);
      return {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        ctimeMs: stat.ctimeMs,
        birthtimeMs: stat.birthtimeMs,
      };
    });
    const etag = getMediaEtag(stat);
    const cacheControl = galleryMediaCacheControl(reqUrl.searchParams.get('rev'));
    const ifNoneMatch = req.headers.get('if-none-match') || '';
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const previewMode = reqUrl.searchParams.get('original') === '1' ? '' : String(reqUrl.searchParams.get('preview') || '').trim().toLowerCase();
    const resizeEnabled = String(reqUrl.searchParams.get('gpr') || '1').trim() !== '0';
    const maxLongSide = clamp(Number(reqUrl.searchParams.get('gpm') || 512) || 512, 128, 2048);
    const quality = clamp(Number(reqUrl.searchParams.get('gpq') || 90) || 90, 40, 95);

    if (previewMode === 'grid' && resizeEnabled && BUN_IMAGE_STILL_EXTENSIONS.has(ext)) {
      const previewHeaders = {
        'Content-Type': 'image/webp',
        'Cache-Control': cacheControl,
        ETag: createVariantEtag(etag, `grid-${maxLongSide}-${quality}`),
        'X-Grid-Preview': '1',
        'X-Grid-Preview-Max': String(maxLongSide),
        'X-Grid-Preview-Quality': String(quality),
        'X-Image-Lane': lane,
        'X-Image-Source': 'gallery-bridge-local',
      };
      if (matchesIfNoneMatch(ifNoneMatch, previewHeaders.ETag)) {
        return new Response(null, { status: 304, headers: previewHeaders });
      }
      const preview = await getOrBuildThumbnailBuffer(
        filePath, maxLongSide, quality, 'contain', lane,
        getThumbnailEtag(stat, maxLongSide, quality, 'contain'),
      );
      return new Response(preview.buffer, {
        headers: { ...previewHeaders, 'Content-Length': String(preview.buffer.byteLength) },
      });
    }

    const file = Bun.file(filePath);
    const lastModified = new Date(stat.mtimeMs).toUTCString();
    const baseHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': lastModified,
      'Accept-Ranges': 'bytes',
      'X-Image-Lane': lane,
      'X-Image-Source': 'gallery-bridge-local',
    };
    const range = String(req.headers.get('range') || '').trim();
    if (matchesIfNoneMatch(ifNoneMatch, etag)) {
      return new Response(null, { status: 304, headers: baseHeaders });
    }
    if (range && permitsConditionalRange(req.headers.get('if-range'), etag)) {
      const size = stat.size;
      const bounds = resolveSingleByteRange(range, size);
      if (bounds) {
        const { start, end } = bounds;
        return new Response(file.slice(start, end + 1), {
          status: 206,
          headers: {
            ...baseHeaders,
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${size}`,
          },
        });
      }
      // Ignore Range for empty representations; there is no byte interval to send.
      if (size > 0) {
        return new Response(null, {
          status: 416,
          headers: {
            ...baseHeaders,
            'Content-Range': `bytes */${size}`,
          },
        });
      }
    }

    return new Response(Bun.file(filePath), {
      headers: {
        ...baseHeaders,
        'Content-Length': String(stat.size),
      },
    });
  } catch (error: any) {
    return json({ error: error?.message || 'Failed to load image' }, 404);
  }
}

async function handleMetadata(reqUrl: URL): Promise<Response> {
  const startedAt = nowMs();
  const pathValue = reqUrl.searchParams.get('path') || '';
  try {
    const filePath = await ensureFile(pathValue);
    if (!isSupportedMediaPath(filePath)) {
      return json({ error: 'Unsupported media format' }, 400);
    }

    const stat = await fs.stat(filePath);
    const etag = await metadataFileRevision(filePath, mediaFileRevision(stat));
    const cached = getCachedMetadata(filePath, etag);
    if (cached) {
      traceGalleryService('metadata', {
        folderPath: normalizePath(pathValue),
        cacheHit: true,
        format: cached.format || '',
        durationMs: nowMs() - startedAt,
      }, 500);
      return json(cached);
    }

    const value = await metadataWorker.run(`metadata:${filePath}:${etag}`, async () => {
      const workerCached = getCachedMetadata(filePath, etag);
      if (workerCached) return workerCached;
      const currentRevision = async () => metadataFileRevision(filePath, mediaFileRevision(await fs.stat(filePath)));
      if (await currentRevision() !== etag) throw new Error('Media metadata changed; retry the request');
      const parsed = (await MetadataParser.parse(filePath)) || {};
      if (await currentRevision() !== etag) throw new Error('Media metadata changed; retry the request');
      const mediaKind = mediaTypeFromPath(filePath) === 'video' ? 'video' : 'image';
      const payload: MetadataCacheEntry['value'] = {
        type: mediaKind,
        name: basename(filePath),
        size: stat.size,
        modified: stat.mtime.toISOString(),
        ...parsed,
      };
      setCachedMetadata(filePath, etag, payload);
      return payload;
    });

    traceGalleryService('metadata', {
      folderPath: normalizePath(pathValue),
      cacheHit: false,
      format: value.format || '',
      durationMs: nowMs() - startedAt,
    }, 250);
    return json(value);
  } catch (error: any) {
    traceGalleryService('metadata_error', {
      folderPath: normalizePath(pathValue),
      error: error?.message || 'Failed to scan metadata',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Failed to scan metadata' }, 400);
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: async (req) => {
    const reqUrl = new URL(req.url);

    if (!isAdmittedBridgeRequest(req, reqUrl)) return json({ error: 'Gallery bridge request denied' }, 403);
    if (req.method === 'OPTIONS') return corsPreflight(req, reqUrl);
    const directPathDenial = await authorizeDirectGalleryFsRequest(req, reqUrl);
    if (directPathDenial) return directPathDenial;

    if (reqUrl.pathname === '/health') {
      if (BRIDGE_TOKEN && req.headers.get('x-umbra-gallery-bridge-token') !== BRIDGE_TOKEN) {
        return json({ error: 'Gallery bridge health denied' }, 403);
      }
      return withTrustedCors(req, json({
        ok: true,
        tokenAccepted: BRIDGE_TOKEN.length > 0,
        host: HOST,
        port: PORT,
        rootDir: ROOT_DIR,
        bridgeUrl: BRIDGE_URL,
        publicDir: PUBLIC_DIR,
        queues: {
          tree: treeWorker.stats(),
          sidebar: sidebarWorker.stats(),
          gallery: galleryWorker.stats(),
          filmstrip: filmstripWorker.stats(),
          metadata: metadataWorker.stats(),
        },
        cache: {
          thumbnails: thumbnailCache.size,
          thumbnailBytes: thumbnailCacheBytes,
          thumbnailInFlight: thumbnailBuildInFlight.size,
          folderTrees: folderTreeCache.size,
          folderSummaries: folderSummaryCache.size,
          metadata: metadataCache.size,
          prewarmRoots: backgroundWarmup.size,
        },
        core: {
          engine: 'bun',
          rustEnabled: false,
        },
      }));
    }

    // Local FS APIs run fully in the gallery process.
    if (reqUrl.pathname === '/api/fs/tree' && req.method === 'GET') {
      return withTrustedCors(req, await runBunGalleryFsGet(reqUrl, () => handleTree(reqUrl)));
    }

    if (reqUrl.pathname === '/api/fs/list-progressive' && req.method === 'GET') {
      return withTrustedCors(req, await runBunGalleryFsGet(reqUrl, () => handleListProgressive(reqUrl, req.signal)));
    }

    if (reqUrl.pathname === '/api/fs/folder-summary' && req.method === 'GET') {
      return withTrustedCors(req, await runBunGalleryFsGet(reqUrl, () => handleFolderSummary(reqUrl)));
    }

    if (reqUrl.pathname === '/api/fs/search' && req.method === 'GET') {
      return withTrustedCors(req, await runBunGalleryFsGet(reqUrl, () => handleSearch(reqUrl, req.signal)));
    }

    if (reqUrl.pathname === '/api/fs/metadata-search' && req.method === 'GET') {
      return withTrustedCors(req, await runBunGalleryFsGet(reqUrl, () => handleMetadataSearch(reqUrl, req.signal)));
    }

    if (reqUrl.pathname === '/api/fs/mkdir' && req.method === 'POST') {
      return withTrustedCors(req, await handleMkdir(req));
    }

    if (reqUrl.pathname === '/api/fs/empty-folders/preview' && req.method === 'POST') {
      return withTrustedCors(req, await handleEmptyFolders(req, 'preview'));
    }

    if (reqUrl.pathname === '/api/fs/empty-folders/delete' && req.method === 'POST') {
      return withTrustedCors(req, await handleEmptyFolders(req, 'delete'));
    }

    if (reqUrl.pathname === '/api/fs/reorder' && req.method === 'POST') {
      return withTrustedCors(req, await handleReorder(req));
    }

    if (reqUrl.pathname === '/api/fs/tags/add' && req.method === 'POST') {
      return withTrustedCors(req, await handleAddTags(req));
    }
    if (reqUrl.pathname === '/api/fs/tags/set' && req.method === 'POST') {
      return withTrustedCors(req, await handleSetTags(req));
    }

    if (reqUrl.pathname === '/api/fs/thumbnail' && req.method === 'GET') {
      return withTrustedCors(req, await handleThumbnail(req, reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/image' && req.method === 'GET') {
      return withTrustedCors(req, await handleImage(req, reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/metadata' && req.method === 'GET') {
      return withTrustedCors(req, await runBunGalleryFsGet(reqUrl, () => handleMetadata(reqUrl)));
    }

    // Everything else can still bridge to Umbra main process.
    if (reqUrl.pathname.startsWith('/bridge')) {
      return proxyToMain(req, reqUrl);
    }

    // For non-local API endpoints, forward to Umbra main process.
    // Local FS-heavy gallery APIs are handled above in this process.
    if (reqUrl.pathname.startsWith('/api/')) {
      const bridgeUrl = new URL(req.url);
      bridgeUrl.pathname = `/bridge${reqUrl.pathname}`;
      return proxyToMain(req, bridgeUrl);
    }

    const filePath = resolveStaticFile(reqUrl.pathname);
    if (!filePath) return new Response('Not found', { status: 404 });

    if (!existsSync(filePath)) {
      if (!extname(reqUrl.pathname)) {
        const indexPath = join(PUBLIC_DIR, 'index.html');
        if (existsSync(indexPath)) {
          return new Response(Bun.file(indexPath), {
            headers: { 'Content-Type': MIME_TYPES['.html'], 'Cache-Control': 'no-store' },
          });
        }
      }
      return new Response('Not found', { status: 404 });
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cacheControl = ext === '.html' ? 'no-store' : 'public, max-age=3600';
    return new Response(Bun.file(filePath), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
      },
    });
  },
});

seedPrewarmRoots();
const folderPrewarmTimer = setInterval(() => {
  runPeriodicPrewarmCycle();
}, FOLDER_SUMMARY_PREWARM_INTERVAL_MS);
if (typeof (folderPrewarmTimer as any).unref === 'function') {
  (folderPrewarmTimer as any).unref();
}

process.on('exit', () => {
  clearInterval(folderPrewarmTimer);
  folderRevisions.close();
  backgroundWarmup.close();
  try {
    galleryDb.close();
  } catch {
    // ignore close errors during shutdown
  }
});

console.log(`[GalleryBridge] Serving at http://${HOST}:${PORT}`);
console.log(`[GalleryBridge] Root dir: ${ROOT_DIR}`);
console.log(`[GalleryBridge] Forwarding /bridge/* to ${BRIDGE_URL}`);
console.log(`[GalleryBridge] Local FS endpoints active: /api/fs/tree, /api/fs/list-progressive, /api/fs/folder-summary, /api/fs/search, /api/fs/metadata-search, /api/fs/reorder, /api/fs/tags/add, /api/fs/tags/set, /api/fs/thumbnail, /api/fs/image, /api/fs/metadata`);
console.log(`[GalleryBridge] Static root: ${PUBLIC_DIR}`);
