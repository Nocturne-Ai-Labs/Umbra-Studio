import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { spawn } from 'child_process';
import { basename, extname, join, relative, resolve, isAbsolute } from 'path';
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
import { galleryMediaCacheControl } from './GalleryMediaCache';

const ROOT_DIR = process.env.UMBRA_ROOT || process.cwd();
const HOST = String(process.env.UMBRA_GALLERY_HOST || '127.0.0.1').trim();
const PORT = Number(process.env.UMBRA_GALLERY_PORT || 8313);
const BRIDGE_URL = String(process.env.UMBRA_BRIDGE_URL || 'http://127.0.0.1:8212').trim();
const BOOT_PREWARM_ROOTS_RELATIVE = [
  'Tools/ComfyUI/output',
];

const runtimePublic = resolve(ROOT_DIR, 'gallery', 'public');
const sourcePublic = resolve(import.meta.dir, 'public');
const PUBLIC_DIR = existsSync(runtimePublic) ? runtimePublic : sourcePublic;

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

type WorkerTask<T> = {
  key: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

class AsyncWorkerQueue {
  private readonly concurrency: number;
  private readonly maxQueued: number;
  private readonly queue: WorkerTask<any>[] = [];
  private readonly inFlight = new Map<string, Promise<any>>();
  private active = 0;

  constructor(concurrency: number, maxQueued = 512) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.maxQueued = Math.max(this.concurrency, Math.floor(maxQueued));
  }

  run<T>(key: string, run: () => Promise<T>): Promise<T> {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) {
      return Promise.reject(new Error('Worker task key is required'));
    }

    const existing = this.inFlight.get(normalizedKey);
    if (existing) return existing as Promise<T>;

    const taskPromise = new Promise<T>((resolve, reject) => {
      if (this.queue.length >= this.maxQueued) {
        reject(new Error('Gallery worker queue is busy'));
        return;
      }
      this.queue.push({ key: normalizedKey, run, resolve, reject });
      this.pump();
    });

    this.inFlight.set(normalizedKey, taskPromise);
    return taskPromise.finally(() => {
      this.inFlight.delete(normalizedKey);
    });
  }

  schedule<T>(key: string, run: () => Promise<T>) {
    if (this.queue.length >= this.maxQueued) return;
    this.run(key, run).catch(() => undefined);
  }

  stats() {
    return {
      active: this.active,
      queued: this.queue.length,
      inFlight: this.inFlight.size,
      concurrency: this.concurrency,
      maxQueued: this.maxQueued,
    };
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (!next) continue;

      this.active += 1;
      Promise.resolve()
        .then(next.run)
        .then((value) => next.resolve(value))
        .catch((error) => next.reject(error))
        .finally(() => {
          this.active = Math.max(0, this.active - 1);
          this.pump();
        });
    }
  }
}

const FOLDER_SUMMARY_CACHE_TTL_MS = 30_000;
const FOLDER_SUMMARY_PREWARM_INTERVAL_MS = 60_000;
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
const folderSummaryCache = new Map<string, FolderSummaryCacheEntry>();
const folderTreeCache = new Map<string, FolderTreeCacheEntry>();
const metadataCache = new Map<string, MetadataCacheEntry>();
const prewarmRoots = new Set<string>();
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
const galleryDb = new GalleryDb(ROOT_DIR);

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Origin',
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

function buildThumbnailRevisionToken(input: { createdMs?: number; ctimeMs?: number; birthtimeMs?: number; modifiedMs: number; size: number }): string {
  const createdMs = Math.max(
    0,
    Math.trunc(Number(input?.createdMs || input?.ctimeMs || input?.birthtimeMs || 0)),
  );
  const modifiedMs = Math.max(0, Math.trunc(Number(input?.modifiedMs || 0)));
  const size = Math.max(0, Math.trunc(Number(input?.size || 0)));
  return `${createdMs}-${modifiedMs}-${size}`;
}

function buildMediaRevisionToken(input: MediaFileRecord): string {
  return `${input.uid}-${buildThumbnailRevisionToken(input)}`;
}

function getMediaEtag(
  stat: { mtimeMs: number; ctimeMs?: number; birthtimeMs?: number; size: number },
): string {
  const changeMs = Number.isFinite(stat?.ctimeMs) && Number(stat.ctimeMs) > 0
    ? Number(stat.ctimeMs)
    : (Number.isFinite(stat?.birthtimeMs) && Number(stat.birthtimeMs) > 0
      ? Number(stat.birthtimeMs)
      : Number(stat.mtimeMs));
  return `W/"media-${Math.trunc(changeMs)}-${Math.trunc(stat.mtimeMs)}-${stat.size}"`;
}

function getMetadataCacheKey(filePath: string): string {
  return normalizePath(filePath).toLowerCase();
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
  stat: { mtimeMs: number; ctimeMs?: number; birthtimeMs?: number; size: number },
  sizePx: number,
  quality: number,
  fitMode: 'cover' | 'contain',
): string {
  const changeMs = Number.isFinite(stat?.ctimeMs) && Number(stat.ctimeMs) > 0
    ? Number(stat.ctimeMs)
    : (Number.isFinite(stat?.birthtimeMs) && Number(stat.birthtimeMs) > 0
      ? Number(stat.birthtimeMs)
      : Number(stat.mtimeMs));
  return `W/"thumb-${sizePx}-${quality}-${fitMode}-${Math.trunc(changeMs)}-${Math.trunc(stat.mtimeMs)}-${stat.size}"`;
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
  let subfolderCount = 0;
  let imageCount = 0;
  let videoCount = 0;
  let gifCount = 0;
  let firstMediaPath: string | null = null;
  let firstMediaType: 'image' | 'gif' | 'video' | null = null;

  const sortedEntries = [...entries].sort((a, b) => (
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  ));

  for (const entry of sortedEntries) {
    if (entry.isDirectory()) {
      subfolderCount += 1;
      continue;
    }
    if (!entry.isFile()) continue;
    if (!isSupportedMediaPath(entry.name)) continue;
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

  return {
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
  if (Date.now() - cached.scannedAt > FOLDER_SUMMARY_CACHE_TTL_MS) return null;
  return cached.value;
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
    folderSummaryCache.set(normalizedPath, {
      value: summary,
      scannedAt: Date.now(),
    });
    return summary;
  });
}

function scheduleFolderSummaryPrewarm(pathValue: string) {
  const normalizedPath = normalizePath(pathValue);
  if (!normalizedPath) return;
  const cached = getCachedFolderSummary(normalizedPath);
  if (cached) return;

  sidebarWorker.schedule(`folder-summary:${normalizedPath}`, async () => {
    const summary = await computeFolderSummary(normalizedPath);
    folderSummaryCache.set(normalizedPath, {
      value: summary,
      scannedAt: Date.now(),
    });
    return summary;
  });
}

function registerPrewarmRoot(pathValue: string) {
  const normalizedPath = normalizePath(pathValue);
  if (!normalizedPath) return;
  prewarmRoots.add(normalizedPath);
}

async function prewarmChildFolderSummaries(rootPath: string) {
  const normalizedRoot = normalizePath(rootPath);
  if (!normalizedRoot) return;
  let entries: Awaited<ReturnType<typeof fs.readdir>> = [];
  try {
    entries = await fs.readdir(normalizedRoot, { withFileTypes: true });
  } catch {
    return;
  }

  let scheduled = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (scheduled >= FOLDER_SUMMARY_PREWARM_CHILD_LIMIT) break;
    scheduleFolderSummaryPrewarm(join(normalizedRoot, entry.name));
    scheduled += 1;
  }
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
  return laneWorker.run(`thumb:${cacheKey}`, async () => {
    const cachedEntry = getCachedThumbnail(cacheKey, expectedEtag);
    if (cachedEntry && (!expectedEtag || cachedEntry.etag === expectedEtag)) return cachedEntry;

    const inFlight = thumbnailBuildInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const buildPromise = buildAndCacheThumbnail(filePath, sizePx, quality, fitMode)
      .finally(() => {
        thumbnailBuildInFlight.delete(cacheKey);
      });
    thumbnailBuildInFlight.set(cacheKey, buildPromise);
    return buildPromise;
  });
}

async function buildAndCacheThumbnail(
  filePath: string,
  sizePx: number,
  quality: number,
  fitMode: 'cover' | 'contain',
): Promise<ThumbCacheEntry> {
  const cacheKey = getThumbnailCacheKey(filePath, sizePx, quality, fitMode);
  const stat = await fs.stat(filePath);
  const etag = getThumbnailEtag(stat, sizePx, quality, fitMode);
  const reused = getCachedThumbnail(cacheKey, etag);
  if (reused && reused.etag === etag) return reused;

  const buffer = await buildThumbnail(filePath, sizePx, quality, fitMode);
  const nextEntry: ThumbCacheEntry = { etag, buffer, sizePx, quality, fitMode, bytes: buffer.byteLength };
  setCachedThumbnail(cacheKey, nextEntry);
  return nextEntry;
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
    scheduleThumbnailPrewarm(file.path, THUMB_SIZE_MAP.small, 70);
  }
}

function seedPrewarmRoots() {
  for (const relativeRoot of BOOT_PREWARM_ROOTS_RELATIVE) {
    const resolved = resolve(ROOT_DIR, relativeRoot);
    if (!existsSync(resolved)) continue;
    registerPrewarmRoot(resolved);
    scheduleFolderSummaryPrewarm(resolved);
    prewarmChildFolderSummaries(resolved).catch(() => undefined);
  }
}

function runPeriodicPrewarmCycle() {
  for (const rootPath of prewarmRoots) {
    scheduleFolderSummaryPrewarm(rootPath);
    prewarmChildFolderSummaries(rootPath).catch(() => undefined);
  }
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

type MediaFileRecord = GalleryIndexedFile;

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

function compareMediaByName(a: MediaFileRecord, b: MediaFileRecord): number {
  return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
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
  const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  if (byName !== 0) return byName;
  return a.clientPath.localeCompare(b.clientPath);
}

function serializeGalleryFile(file: MediaFileRecord) {
  const revision = buildMediaRevisionToken(file);
  return {
    uid: file.uid,
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
    metadataFormat: file.metadataFormat,
    tags: Array.isArray(file.tags) ? file.tags : [],
  };
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
) {
  const mediaInputs = await Promise.allSettled(
    candidates.map(async (entry) => {
      const stat = await fs.stat(entry.absolutePath);
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
      };
    }),
  );

  return mediaInputs
    .filter((result): result is PromiseFulfilledResult<{
      path: string;
      folderPath: string;
      name: string;
      type: 'image' | 'gif' | 'video';
      size: number;
      createdMs: number;
      modifiedMs: number;
    }> => result.status === 'fulfilled')
    .map((result) => result.value);
}

function resolveGalleryPath(input: string): string {
  const raw = String(input || '').trim();
  if (!raw) return '';
  if (isAbsolute(raw)) return resolve(raw);
  return resolve(ROOT_DIR, raw);
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
  const publicLower = `${PUBLIC_DIR}`.toLowerCase();
  const resolvedLower = `${resolvedPath}`.toLowerCase();
  if (!resolvedLower.startsWith(publicLower)) return null;
  return resolvedPath;
}

function corsPreflight(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
  if (req.method === 'OPTIONS') return corsPreflight();

  const bridgePath = reqUrl.pathname.replace(/^\/bridge/, '') || '/';
  const targetUrl = new URL(`${bridgePath}${reqUrl.search}`, BRIDGE_URL);
  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('origin');
  headers.delete('referer');

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
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Vary', 'Origin');
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
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
  try {
    const ensureStartedAt = nowMs();
    const dirPath = await ensureDirectory(pathValue);
    const ensureMs = nowMs() - ensureStartedAt;
    const toClientPath = createClientPathMapper(pathValue, dirPath);
    registerPrewarmRoot(dirPath);
    if (force) {
      invalidateFolderTree(dirPath);
      invalidateFolderSummary(dirPath);
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
      return json({ folders: cachedFolders });
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
          path: toClientPath(join(dirPath, entry.name)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
      setCachedFolderTree(dirPath, nextFolders);
      return nextFolders;
    });
    const workerMs = nowMs() - workerStartedAt;

    setTimeout(() => {
      scheduleFolderSummaryPrewarm(dirPath);
      for (const folder of folders) {
        scheduleFolderSummaryPrewarm(folder.path);
      }
    }, 0);
    traceGalleryService('tree', {
      folderPath: normalizePath(pathValue) || dirPath,
      folders: folders.length,
      ensureMs,
      workerMs,
      cacheHit: false,
      durationMs: nowMs() - startedAt,
    });
    return json({ folders });
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

async function buildListProgressivePayload(
  dirPath: string,
  clientFolderPath: string,
  cursor: number,
  limit: number,
  sortBy: GallerySortBy,
  sortOrder: GallerySortOrder,
  fastPage: boolean,
) {
  const traceStartedAt = nowMs();
  let readdirMs = 0;
  let statUpsertMs = 0;
  let pageMs = 0;
  const normalizedClientFolderPath = normalizePath(clientFolderPath) || normalizePath(dirPath);
  const toClientPath = createClientPathMapper(normalizedClientFolderPath, dirPath);
  const readdirStartedAt = nowMs();
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  readdirMs = nowMs() - readdirStartedAt;
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: toClientPath(join(dirPath, entry.name)),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

  const mediaCandidates = entries
    .filter((entry) => entry.isFile() && isSupportedMediaPath(entry.name))
    .map((entry) => ({
      name: entry.name,
      absolutePath: join(dirPath, entry.name),
      clientPath: toClientPath(join(dirPath, entry.name)),
      folderPath: normalizedClientFolderPath,
    }));

  let page: MediaFileRecord[] = [];
  let total = mediaCandidates.length;
  let nextCursor: number | null = null;

  const pageStartedAt = nowMs();
  if (fastPage) {
    const orderedCandidates = [...mediaCandidates].sort(compareMediaCandidatesByName);
    if (sortOrder === 'desc') orderedCandidates.reverse();
    const pageCandidates = orderedCandidates.slice(cursor, cursor + limit);
    const statStartedAt = nowMs();
    const validInputs = await statMediaCandidates(pageCandidates, normalizedClientFolderPath);
    const inputsByFolder = new Map<string, typeof validInputs>();
    for (const input of validInputs) {
      const key = normalizePath(input.folderPath || normalizedClientFolderPath);
      const existing = inputsByFolder.get(key) || [];
      existing.push(input);
      inputsByFolder.set(key, existing);
    }
    const mediaFiles: MediaFileRecord[] = [];
    for (const [folderPath, inputs] of inputsByFolder) {
      mediaFiles.push(...galleryDb.upsertFolderFiles(folderPath, inputs));
    }
    statUpsertMs = nowMs() - statStartedAt;
    mediaFiles.sort((a, b) => compareMedia(a, b, sortBy, sortOrder));
    page = mediaFiles;
    nextCursor = cursor + pageCandidates.length < total ? cursor + pageCandidates.length : null;
  } else {
    const statStartedAt = nowMs();
    const validInputs = await statMediaCandidates(mediaCandidates, normalizedClientFolderPath);
    const inputsByFolder = new Map<string, typeof validInputs>();
    for (const input of validInputs) {
      const key = normalizePath(input.folderPath || normalizedClientFolderPath);
      const existing = inputsByFolder.get(key) || [];
      existing.push(input);
      inputsByFolder.set(key, existing);
    }
    const mediaFiles: MediaFileRecord[] = [];
    for (const [folderPath, inputs] of inputsByFolder) {
      mediaFiles.push(...galleryDb.upsertFolderFiles(folderPath, inputs));
    }
    statUpsertMs = nowMs() - statStartedAt;
    mediaFiles.sort((a, b) => compareMedia(a, b, sortBy, sortOrder));
    total = mediaFiles.length;
    page = mediaFiles.slice(cursor, cursor + limit);
    nextCursor = cursor + page.length < total ? cursor + page.length : null;
  }
  pageMs = nowMs() - pageStartedAt;

  scheduleFolderSummaryPrewarm(dirPath);
  for (const folder of folders.slice(0, FOLDER_SUMMARY_PREWARM_CHILD_LIMIT)) {
    scheduleFolderSummaryPrewarm(folder.path);
  }
  if (!fastPage) schedulePageThumbnailPrewarm(page);
  traceGalleryService('list_build', {
    folderPath: normalizedClientFolderPath,
    cursor,
    limit,
    sortBy,
    sortOrder,
    fastPage,
    folders: folders.length,
    mediaCandidates: mediaCandidates.length,
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
    files: page.map(serializeGalleryFile),
    done: nextCursor == null,
    nextCursor,
    total,
    sortBy,
    sortOrder,
  };
}

async function handleListProgressive(reqUrl: URL): Promise<Response> {
  const startedAt = nowMs();
  const pathValue = reqUrl.searchParams.get('path') || '';
  try {
    const ensureStartedAt = nowMs();
    const dirPath = await ensureDirectory(pathValue);
    const ensureMs = nowMs() - ensureStartedAt;
    registerPrewarmRoot(dirPath);
    const cursor = Math.max(0, Number(reqUrl.searchParams.get('cursor') || 0) || 0);
    const limit = clamp(Number(reqUrl.searchParams.get('limit') || 72) || 72, 1, 256);
    const sortBy = parseSortBy(reqUrl.searchParams.get('sortBy'));
    const sortOrder = parseSortOrder(reqUrl.searchParams.get('sortOrder'));
    const fastPage = String(reqUrl.searchParams.get('fast') || '').trim() === '1';
    const force = String(reqUrl.searchParams.get('force') || '').trim() === '1';
    if (force && cursor === 0) {
      invalidateFolderTree(dirPath);
      invalidateFolderSummary(dirPath, true);
    }
    const requestKey = `list:${dirPath}:${sortBy}:${sortOrder}:${cursor}:${limit}:fast:${fastPage ? 1 : 0}:force:${force ? startedAt : 0}`;
    const workerStartedAt = nowMs();
    const payload = await galleryWorker.run(requestKey, async () => (
      buildListProgressivePayload(dirPath, normalizePath(pathValue) || dirPath, cursor, limit, sortBy, sortOrder, fastPage)
    ));
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

    return json(summary);
  } catch (error: any) {
    if (isMissingFsPathError(error)) {
      return json(createEmptyFolderSummary(normalizedInputPath || pathValue));
    }
    return json({ error: error?.message || 'Failed to summarize folder' }, 400);
  }
}

async function handleSearch(reqUrl: URL): Promise<Response> {
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
      try {
        const dirPath = await ensureDirectory(rootValue);
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
    const indexedFiles = galleryDb.searchFiles(
      resolvedRoots.map((root) => root.clientRootPath),
      query,
      fileLimit * 3,
    );
    for (const file of indexedFiles) {
      if (!fileMatchesSearch(file, query)) continue;
      const key = normalizePath(file.path).toLowerCase();
      if (!key || filesByPath.has(key)) continue;
      filesByPath.set(key, file);
      if (filesByPath.size >= fileLimit) break;
    }

    let scannedFolders = 0;
    let capped = false;
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

    while (queue.length > 0 && scannedFolders < maxFolders && nowMs() - startedAt < maxDurationMs) {
      const current = queue.shift();
      if (!current) continue;
      scannedFolders += 1;
      let entries: Awaited<ReturnType<typeof fs.readdir>>;
      try {
        entries = await fs.readdir(current.absolutePath, { withFileTypes: true });
      } catch {
        continue;
      }

      const directories = entries
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
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

      if (filesByPath.size >= fileLimit) continue;
      const filenameMatches = entries
        .filter((entry) => entry.isFile() && isSupportedMediaPath(entry.name) && textMatchesSearch(entry.name, query))
        .map((entry) => ({
          name: entry.name,
          absolutePath: join(current.absolutePath, entry.name),
          clientPath: current.toClientPath(join(current.absolutePath, entry.name)),
          folderPath: normalizePath(current.clientPath),
        }))
        .filter((candidate) => !filesByPath.has(normalizePath(candidate.clientPath).toLowerCase()))
        .slice(0, Math.max(0, fileLimit - filesByPath.size));
      if (filenameMatches.length > 0) {
        const inputs = await statMediaCandidates(filenameMatches, normalizePath(current.clientPath));
        const indexed = galleryDb.upsertFolderFiles(normalizePath(current.clientPath), inputs);
        for (const file of indexed) {
          if (!fileMatchesSearch(file, query)) continue;
          const key = normalizePath(file.path).toLowerCase();
          if (!key || filesByPath.has(key)) continue;
          filesByPath.set(key, file);
          if (filesByPath.size >= fileLimit) break;
        }
      }
      if (filesByPath.size >= fileLimit && foldersByPath.size >= folderLimit) break;
    }
    if (queue.length > 0) capped = true;

    const files = Array.from(filesByPath.values())
      .filter((file) => fileMatchesSearch(file, query))
      .sort((a, b) => compareSearchFiles(a, b, query, sortBy, sortOrder))
      .slice(0, fileLimit);
    const folders = Array.from(foldersByPath.values())
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }))
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
      files: files.map(serializeGalleryFile),
      folders,
      scannedFolders,
      done: !capped,
      sortBy,
      sortOrder,
    });
  } catch (error: any) {
    traceGalleryService('search_error', {
      query,
      error: error?.message || 'Gallery search failed',
      durationMs: nowMs() - startedAt,
    }, 0);
    return json({ error: error?.message || 'Gallery search failed' }, 400);
  }
}

async function handleMetadataSearch(reqUrl: URL): Promise<Response> {
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
    const matches = galleryDb.searchFolderMetadata(folderPath, query, limit);
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
    const orderedPathsRaw = Array.isArray((payload as any).orderedPaths) ? (payload as any).orderedPaths : [];
    const orderedPaths = Array.from(new Set(
      orderedPathsRaw
        .map((value: unknown) => normalizePath(String(value || '')))
        .filter(Boolean),
    ));
    const orderedRaw = Array.isArray((payload as any).orderedUids) ? (payload as any).orderedUids : [];
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
    const rawUids = Array.isArray((payload as any).uids) ? (payload as any).uids : [];
    const rawPaths = Array.isArray((payload as any).paths) ? (payload as any).paths : [];
    const rawTags = Array.isArray((payload as any).tags) ? (payload as any).tags : [];

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

async function extractVideoFrame(filePath: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-hide_banner',
      '-loglevel', 'error',
      '-ss', '0.15',
      '-i', filePath,
      '-frames:v', '1',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      'pipe:1',
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    let settled = false;
    const finish = (error: Error | null, buffer?: Buffer) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }
      resolve(buffer || Buffer.alloc(0));
    };
    const timer = setTimeout(() => {
      try {
        ffmpeg.kill();
      } catch {
        // ignore kill failures on timeout
      }
      finish(new Error('Timed out while extracting video thumbnail'));
    }, 10000);

    ffmpeg.stdout.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    ffmpeg.stderr.on('data', (chunk) => {
      errors.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    ffmpeg.on('error', (error) => {
      finish(error instanceof Error ? error : new Error(String(error || 'ffmpeg failed')));
    });
    ffmpeg.on('close', (code) => {
      if (code !== 0 || chunks.length === 0) {
        const detail = Buffer.concat(errors).toString('utf8').trim();
        finish(new Error(detail || `Failed to extract video thumbnail (exit ${code ?? 'unknown'})`));
        return;
      }
      finish(null, Buffer.concat(chunks));
    });
  });
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
    ? await extractVideoFrame(filePath)
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
          'Cache-Control': 'public, max-age=31536000, immutable',
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
        'Cache-Control': 'public, max-age=31536000, immutable',
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
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        headers: {
          'Cache-Control': cacheControl,
          ETag: etag,
          'X-Image-Lane': lane,
          'X-Image-Source': 'gallery-bridge-local',
        },
      });
    }
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const previewMode = String(reqUrl.searchParams.get('preview') || '').trim().toLowerCase();
    const resizeEnabled = String(reqUrl.searchParams.get('gpr') || '1').trim() !== '0';
    const maxLongSide = clamp(Number(reqUrl.searchParams.get('gpm') || 512) || 512, 128, 2048);
    const quality = clamp(Number(reqUrl.searchParams.get('gpq') || 90) || 90, 40, 95);

    if (previewMode === 'grid' && resizeEnabled && BUN_IMAGE_STILL_EXTENSIONS.has(ext)) {
      const preview = await getOrBuildThumbnailBuffer(filePath, maxLongSide, quality, 'contain', lane);
      const previewEtag = `${etag}-grid-${maxLongSide}-${quality}`;
      return new Response(preview.buffer, {
        headers: {
          'Content-Type': 'image/webp',
          'Content-Length': String(preview.buffer.byteLength),
          'Cache-Control': cacheControl,
          ETag: previewEtag,
          'X-Grid-Preview': '1',
          'X-Grid-Preview-Max': String(maxLongSide),
          'X-Grid-Preview-Quality': String(quality),
          'X-Image-Lane': lane,
          'X-Image-Source': 'gallery-bridge-local',
        },
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
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/i.exec(range);
      if (match) {
        const size = stat.size;
        let start = match[1] ? Number.parseInt(match[1], 10) : Number.NaN;
        let end = match[2] ? Number.parseInt(match[2], 10) : Number.NaN;
        if (!Number.isFinite(start) && Number.isFinite(end)) {
          start = Math.max(0, size - end);
          end = size - 1;
        } else {
          if (!Number.isFinite(start)) start = 0;
          if (!Number.isFinite(end)) end = size - 1;
        }
        start = Math.max(0, Math.min(size - 1, Math.floor(start)));
        end = Math.max(start, Math.min(size - 1, Math.floor(end)));
        if (size > 0 && start <= end) {
          return new Response(file.slice(start, end + 1), {
            status: 206,
            headers: {
              ...baseHeaders,
              'Content-Length': String(end - start + 1),
              'Content-Range': `bytes ${start}-${end}/${size}`,
            },
          });
        }
      }
      return new Response(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          'Content-Range': `bytes */${stat.size}`,
        },
      });
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
    const etag = getMediaEtag(stat);
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
      const parsed = (await MetadataParser.parse(filePath)) || {};
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

    if (req.method === 'OPTIONS') return corsPreflight();

    if (reqUrl.pathname === '/health') {
      return json({
        ok: true,
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
          prewarmRoots: prewarmRoots.size,
        },
        core: {
          engine: 'bun',
          rustEnabled: false,
        },
      });
    }

    // Local FS APIs run fully in the gallery process.
    if (reqUrl.pathname === '/api/fs/tree' && req.method === 'GET') {
      return runBunGalleryFsGet(reqUrl, () => handleTree(reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/list-progressive' && req.method === 'GET') {
      return runBunGalleryFsGet(reqUrl, () => handleListProgressive(reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/folder-summary' && req.method === 'GET') {
      return runBunGalleryFsGet(reqUrl, () => handleFolderSummary(reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/search' && req.method === 'GET') {
      return runBunGalleryFsGet(reqUrl, () => handleSearch(reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/metadata-search' && req.method === 'GET') {
      return runBunGalleryFsGet(reqUrl, () => handleMetadataSearch(reqUrl));
    }

    if (reqUrl.pathname === '/api/fs/mkdir' && req.method === 'POST') {
      return handleMkdir(req);
    }

    if (reqUrl.pathname === '/api/fs/empty-folders/preview' && req.method === 'POST') {
      return handleEmptyFolders(req, 'preview');
    }

    if (reqUrl.pathname === '/api/fs/empty-folders/delete' && req.method === 'POST') {
      return handleEmptyFolders(req, 'delete');
    }

    if (reqUrl.pathname === '/api/fs/reorder' && req.method === 'POST') {
      return handleReorder(req);
    }

    if (reqUrl.pathname === '/api/fs/tags/add' && req.method === 'POST') {
      return handleAddTags(req);
    }
    if (reqUrl.pathname === '/api/fs/tags/set' && req.method === 'POST') {
      return handleSetTags(req);
    }

    if (reqUrl.pathname === '/api/fs/thumbnail' && req.method === 'GET') {
      return handleThumbnail(req, reqUrl);
    }

    if (reqUrl.pathname === '/api/fs/image' && req.method === 'GET') {
      return handleImage(req, reqUrl);
    }

    if (reqUrl.pathname === '/api/fs/metadata' && req.method === 'GET') {
      return runBunGalleryFsGet(reqUrl, () => handleMetadata(reqUrl));
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
