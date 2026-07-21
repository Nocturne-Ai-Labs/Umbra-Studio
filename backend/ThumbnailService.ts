/**
 * Thumbnail Generation Service
 * Generates and caches thumbnails for images and videos
 * Includes precaching on startup and 2GB cache limit
 */

import { join, extname } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { unlink, readdir, readFile, writeFile } from 'fs/promises';
import { createHash } from 'crypto';

// Sizes in pixels (width)
const SIZES = {
  small: 256,
  medium: 640,
  large: 1024,
} as const;

const FULL_QUALITY = 100;

type ThumbnailSize = keyof typeof SIZES;
type ThumbnailFormat = 'webp' | 'jpeg';

// 2GB cache limit
const MAX_CACHE_SIZE_BYTES = 2 * 1024 * 1024 * 1024;
const CACHE_KEY_VERSION = 'v2';
const MAX_MEMORY_CACHE_BYTES = 96 * 1024 * 1024;
const MAX_MEMORY_CACHE_ENTRIES = 320;
const CACHE_LIMIT_ENFORCE_MIN_INTERVAL_MS = 60_000;
const MAX_GENERATION_CONCURRENCY = Math.max(
  1,
  Math.min(6, Number.parseInt(process.env.UMBRA_THUMBNAIL_GENERATION_CONCURRENCY || '3', 10) || 3),
);

// Supported image and video extensions
const VIDEO_EXTS = ['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv'];
const BUN_IMAGE_STILL_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.avif', '.heic', '.heif', '.tif', '.tiff']);

interface MemoryCacheEntry {
  buffer: Buffer;
  size: number;
  touchedAt: number;
}

function resolveDefaultThumbnailCacheDir(): string {
  const explicit = process.env.UMBRA_THUMBNAIL_CACHE_DIR?.trim();
  if (explicit) return explicit;

  const sharedCacheRoot = process.env.UMBRA_CACHE_DIR?.trim();
  if (sharedCacheRoot) return join(sharedCacheRoot, 'thumbnails');

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA?.trim() || join(homedir(), 'AppData', 'Local');
    return join(localAppData, 'Umbra Studio', 'Cache', 'thumbnails');
  }

  const xdgCache = process.env.XDG_CACHE_HOME?.trim();
  if (xdgCache) return join(xdgCache, 'Umbra Studio', 'thumbnails');

  return join(homedir(), '.cache', 'Umbra Studio', 'thumbnails');
}

export class ThumbnailService {
  private cacheDir: string;
  private sharp: typeof import('sharp') | null = null;
  private sharpLoadAttempted = false;
  private isPrecaching = false;
  private precacheProgress = { total: 0, completed: 0, skipped: 0 };
  private memoryCache = new Map<string, MemoryCacheEntry>();
  private memoryCacheSizeBytes = 0;
  private pendingGenerations = new Map<string, Promise<Buffer | null>>();
  private cacheLimitEnforceInFlight = false;
  private lastCacheLimitEnforceAt = 0;
  private activeGenerationCount = 0;
  private generationQueue: Array<() => void> = [];

  constructor(cacheDir: string = resolveDefaultThumbnailCacheDir()) {
    this.cacheDir = cacheDir;
    if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });
  }

  /**
   * Lazily load sharp to avoid startup crashes if not installed
   */
  private async getSharp(): Promise<typeof import('sharp') | null> {
    if (this.sharp) return this.sharp;
    if (this.sharpLoadAttempted) return null;

    this.sharpLoadAttempted = true;
    try {
      const sharpModule = await import('sharp');
      this.sharp = sharpModule.default;
      console.log('[ThumbnailService] Sharp loaded successfully');
      return this.sharp;
    } catch (error) {
      console.warn('[ThumbnailService] Sharp not available, thumbnails will redirect to originals');
      return null;
    }
  }

  private getBunImageConstructor(): any | null {
    const ctor = (globalThis as any)?.Bun?.Image;
    return typeof ctor === 'function' ? ctor : null;
  }

  private canUseBunImageFastPath(imagePath: string): boolean {
    const ext = extname(imagePath).toLowerCase();
    return BUN_IMAGE_STILL_EXTS.has(ext);
  }

  private async generateBunImageThumbnail(
    imagePath: string,
    targetWidth: number,
    format: 'webp' | 'jpeg',
    quality: number,
  ): Promise<Buffer | null> {
    const BunImage = this.getBunImageConstructor();
    if (!BunImage || !this.canUseBunImageFastPath(imagePath)) return null;

    try {
      const image = new BunImage(imagePath);
      const resized = image.resize(targetWidth, targetWidth, {
        fit: 'inside',
        withoutEnlargement: true,
      });
      const encoder = format === 'jpeg' ? resized.jpeg({ quality }) : resized.webp({ quality });
      const output = await encoder.toBuffer();
      return Buffer.isBuffer(output) ? output : Buffer.from(output);
    } catch {
      return null;
    }
  }

  /**
   * Generate a cache key from the file path and options
   */
  private getSourceHash(imagePath: string): string {
    return createHash('md5')
      .update(`${CACHE_KEY_VERSION}|${imagePath}`)
      .digest('hex')
      .slice(0, 12);
  }

  private getSourceCachePrefix(imagePath: string): string {
    return `${this.getSourceHash(imagePath)}_`;
  }

  private getCacheKey(
    imagePath: string,
    size: ThumbnailSize,
    format: ThumbnailFormat,
    revision = 'base',
    quality = FULL_QUALITY,
  ): string {
    const hash = createHash('md5')
      .update(`${CACHE_KEY_VERSION}|${imagePath}|${revision}|${size}|${format}|q${quality}`)
      .digest('hex')
      .slice(0, 12);
    const sourceHash = this.getSourceHash(imagePath);
    return `${sourceHash}_${hash}_${size}.${format}`;
  }

  /**
   * Get the cache file path for a thumbnail
   */
  private getCachePath(cacheKey: string): string {
    return join(this.cacheDir, cacheKey);
  }

  private normalizeQuality(input: unknown, fallback = FULL_QUALITY): number {
    return Number.isFinite(Number(input))
      ? Math.max(1, Math.min(100, Math.floor(Number(input))))
      : fallback;
  }

  private getThumbnailCacheDescriptor(
    imagePath: string,
    options: {
      size: ThumbnailSize;
      quality?: number;
      format?: ThumbnailFormat;
      sidecar?: any;
    },
  ): { cacheKey: string; cachePath: string } | null {
    const { size, format = 'webp', sidecar = null } = options;
    const quality = this.normalizeQuality(options.quality);
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(imagePath);
    } catch {
      return null;
    }

    const ext = extname(imagePath).toLowerCase();
    const baseRevision = `m${Math.max(0, Math.floor(stats.mtimeMs))}-s${Math.max(0, Math.floor(stats.size))}`;
    const revision = VIDEO_EXTS.includes(ext)
      ? baseRevision
      : `${baseRevision}-${this.getSidecarHash(sidecar)}`;
    const cacheKey = this.getCacheKey(imagePath, size, format, revision, quality);
    return {
      cacheKey,
      cachePath: this.getCachePath(cacheKey),
    };
  }

  private getSidecarHash(sidecar: any): string {
    if (!sidecar || typeof sidecar !== 'object') return 'plain';
    try {
      return createHash('md5')
        .update(JSON.stringify(sidecar))
        .digest('hex')
        .slice(0, 10);
    } catch {
      return 'plain';
    }
  }

  private hasActiveSidecarAdjustments(sidecar: any): boolean {
    if (!sidecar || typeof sidecar !== 'object') return false;

    const num = (value: any): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    if (
      Math.abs(num(sidecar.exposure)) > 0.001 ||
      Math.abs(num(sidecar.contrast)) > 0.001 ||
      Math.abs(num(sidecar.saturation)) > 0.001 ||
      Math.abs(num(sidecar.vibrance)) > 0.001 ||
      Math.abs(num(sidecar.temperature)) > 0.001 ||
      Math.abs(num(sidecar.tint)) > 0.001 ||
      Math.abs(num(sidecar.sharpen)) > 0.001
    ) {
      return true;
    }

    const activeLayers = (sidecar?.effects?.enabled && Array.isArray(sidecar?.effects?.layers))
      ? sidecar.effects.layers.filter((layer: any) => layer?.enabled !== false)
      : [];

    return activeLayers.length > 0;
  }

  private getMemoryCache(cacheKey: string): Buffer | null {
    const entry = this.memoryCache.get(cacheKey);
    if (!entry) return null;
    entry.touchedAt = Date.now();
    return entry.buffer;
  }

  private setMemoryCache(cacheKey: string, buffer: Buffer): void {
    const nextSize = buffer.byteLength;
    if (!Number.isFinite(nextSize) || nextSize <= 0) return;

    const existing = this.memoryCache.get(cacheKey);
    if (existing) {
      this.memoryCacheSizeBytes -= existing.size;
    }

    this.memoryCache.set(cacheKey, {
      buffer,
      size: nextSize,
      touchedAt: Date.now(),
    });
    this.memoryCacheSizeBytes += nextSize;
    this.pruneMemoryCache();
  }

  private pruneMemoryCache(): void {
    if (
      this.memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES &&
      this.memoryCacheSizeBytes <= MAX_MEMORY_CACHE_BYTES
    ) {
      return;
    }

    const entries = Array.from(this.memoryCache.entries())
      .sort((a, b) => a[1].touchedAt - b[1].touchedAt);

    for (const [cacheKey, entry] of entries) {
      if (
        this.memoryCache.size <= MAX_MEMORY_CACHE_ENTRIES &&
        this.memoryCacheSizeBytes <= MAX_MEMORY_CACHE_BYTES
      ) {
        break;
      }
      this.memoryCache.delete(cacheKey);
      this.memoryCacheSizeBytes = Math.max(0, this.memoryCacheSizeBytes - entry.size);
    }
  }

  private async readCachedBuffer(cacheKey: string, cachePath: string): Promise<Buffer | null> {
    const cachedInMemory = this.getMemoryCache(cacheKey);
    if (cachedInMemory) return cachedInMemory;

    if (!existsSync(cachePath)) return null;

    try {
      const buffer = await readFile(cachePath);
      this.setMemoryCache(cacheKey, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  async readCachedThumbnail(
    imagePath: string,
    options: {
      size: ThumbnailSize;
      quality?: number;
      format?: ThumbnailFormat;
      sidecar?: any;
    },
  ): Promise<Buffer | null> {
    const descriptor = this.getThumbnailCacheDescriptor(imagePath, options);
    if (!descriptor) return null;
    return this.readCachedBuffer(descriptor.cacheKey, descriptor.cachePath);
  }

  enqueueThumbnailGeneration(
    imagePath: string,
    options: {
      size: ThumbnailSize;
      quality?: number;
      format?: ThumbnailFormat;
      sidecar?: any;
    },
  ): void {
    const descriptor = this.getThumbnailCacheDescriptor(imagePath, options);
    if (descriptor && this.pendingGenerations.has(descriptor.cacheKey)) return;
    void this.generateThumbnail(imagePath, options).catch(() => null);
  }

  private async getOrGenerate(
    cacheKey: string,
    generate: () => Promise<Buffer | null>,
  ): Promise<Buffer | null> {
    const existing = this.pendingGenerations.get(cacheKey);
    if (existing) return existing;

    const nextPromise = (async () => {
      try {
        return await generate();
      } finally {
        this.pendingGenerations.delete(cacheKey);
      }
    })();

    this.pendingGenerations.set(cacheKey, nextPromise);
    return nextPromise;
  }

  private async withGenerationSlot<T>(task: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      const acquire = () => {
        this.activeGenerationCount += 1;
        resolve();
      };
      if (this.activeGenerationCount < MAX_GENERATION_CONCURRENCY) {
        acquire();
        return;
      }
      this.generationQueue.push(acquire);
    });

    try {
      return await task();
    } finally {
      this.activeGenerationCount = Math.max(0, this.activeGenerationCount - 1);
      const next = this.generationQueue.shift();
      if (next) next();
    }
  }

  private scheduleCacheLimitEnforcement(): void {
    const now = Date.now();
    if (this.cacheLimitEnforceInFlight) return;
    if (now - this.lastCacheLimitEnforceAt < CACHE_LIMIT_ENFORCE_MIN_INTERVAL_MS) return;

    this.cacheLimitEnforceInFlight = true;
    this.lastCacheLimitEnforceAt = now;
    this.enforceCacheLimit()
      .catch(() => undefined)
      .finally(() => {
        this.cacheLimitEnforceInFlight = false;
      });
  }

  /**
   * Enforce cache size limit by removing oldest files
   */
  async enforceCacheLimit(): Promise<void> {
    try {
      const files = await readdir(this.cacheDir);
      const fileStats: Array<{ path: string; mtime: number; size: number }> = [];
      let totalSize = 0;

      // Collect file stats
      for (const file of files) {
        const filePath = join(this.cacheDir, file);
        try {
          const stats = statSync(filePath);
          fileStats.push({
            path: filePath,
            mtime: stats.mtimeMs,
            size: stats.size,
          });
          totalSize += stats.size;
        } catch { }
      }

      // If under limit, nothing to do
      if (totalSize <= MAX_CACHE_SIZE_BYTES) return;

      // Sort by modification time, oldest first
      fileStats.sort((a, b) => a.mtime - b.mtime);

      // Remove oldest files until under limit
      let bytesToFree = totalSize - MAX_CACHE_SIZE_BYTES;
      let filesRemoved = 0;

      for (const file of fileStats) {
        if (bytesToFree <= 0) break;

        try {
          await unlink(file.path);
          bytesToFree -= file.size;
          filesRemoved++;
        } catch { }
      }

      if (filesRemoved > 0) {
        console.log(`[ThumbnailService] Cache cleanup: removed ${filesRemoved} files to stay under 2GB limit`);
      }
    } catch (error) {
      console.error('[ThumbnailService] Failed to enforce cache limit:', error);
    }
  }

  /**
   * Generate a thumbnail for an image
   */
  async generateThumbnail(
    imagePath: string,
    options: {
      size: ThumbnailSize;
      quality?: number;
      format?: ThumbnailFormat;
      sidecar?: any;
    } = { size: 'medium', quality: FULL_QUALITY, format: 'webp' }
  ): Promise<Buffer | null> {
    const { size, format = 'webp', sidecar = null } = options;
    const quality = this.normalizeQuality(options.quality);
    const hasActiveSidecar = this.hasActiveSidecarAdjustments(sidecar);

    // Check if it's a video file - skip (handled separately)
    const ext = extname(imagePath).toLowerCase();
    if (VIDEO_EXTS.includes(ext)) {
      return this.generateVideoThumbnail(imagePath, options);
    }

    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(imagePath);
    } catch {
      return null;
    }

    const revision = `m${Math.max(0, Math.floor(stats.mtimeMs))}-s${Math.max(0, Math.floor(stats.size))}-${this.getSidecarHash(sidecar)}`;
    const cacheKey = this.getCacheKey(imagePath, size, format, revision, quality);
    const cachePath = this.getCachePath(cacheKey);

    // Check cache first
    const cached = await this.readCachedBuffer(cacheKey, cachePath);
    if (cached) {
      return cached;
    }

    return this.getOrGenerate(cacheKey, () => this.withGenerationSlot(async () => {
      const targetWidth = SIZES[size];
      let thumbnail: Buffer;

      if (!hasActiveSidecar) {
        const bunThumbnail = await this.generateBunImageThumbnail(imagePath, targetWidth, format, quality);
        if (bunThumbnail) {
          this.setMemoryCache(cacheKey, bunThumbnail);
          writeFile(cachePath, bunThumbnail).catch(() => { /* best effort */ });
          this.scheduleCacheLimitEnforcement();
          return bunThumbnail;
        }
      }

      const sharp = await this.getSharp();
      if (!sharp) {
        return null; // Will fallback to original
      }

      if (!hasActiveSidecar) {
        // Fast path for unedited assets: single resize+encode pass.
        const fastPipeline = sharp(imagePath)
          .rotate()
          .resize(targetWidth, targetWidth, {
            fit: 'inside',
            withoutEnlargement: true,
            fastShrinkOnLoad: true,
          });

        thumbnail = format === 'webp'
          ? await fastPipeline
              .webp({
                quality,
                nearLossless: false,
                effort: 3,
                alphaQuality: quality,
              })
              .toBuffer()
          : await fastPipeline
              .jpeg({
                quality,
                mozjpeg: true,
                chromaSubsampling: '4:2:0',
              })
              .toBuffer();
      } else {
        let pipeline: any = sharp(imagePath).rotate(); // Auto-rotate based on EXIF
        pipeline = this.applySidecarAdjustments(pipeline, sidecar);

        let resizedBuffer = await pipeline
          .resize(targetWidth, targetWidth, {
            fit: 'inside',
            withoutEnlargement: true,
            fastShrinkOnLoad: true,
          })
          .png()
          .toBuffer();

        resizedBuffer = await this.applySupportedEffectsToBuffer(sharp, resizedBuffer, sidecar);

        thumbnail = format === 'webp'
          ? await sharp(resizedBuffer)
              .webp({
                quality,
                nearLossless: true,
                effort: 6,
                alphaQuality: FULL_QUALITY
              })
              .toBuffer()
          : await sharp(resizedBuffer)
              .jpeg({
                quality,
                mozjpeg: true,
                chromaSubsampling: '4:4:4'
              })
              .toBuffer();
      }

      this.setMemoryCache(cacheKey, thumbnail);
      writeFile(cachePath, thumbnail).catch(() => { /* best effort */ });
      this.scheduleCacheLimitEnforcement();

      return thumbnail;
    })).catch((error) => {
      console.error(`[ThumbnailService] Failed to generate thumbnail for ${imagePath}:`, error);
      return null;
    });
  }

  async generateGridPreview(
    imagePath: string,
    options: {
      maxLongSide?: number;
      quality?: number;
      format?: 'webp' | 'jpeg';
    } = {},
  ): Promise<Buffer | null> {
    const ext = extname(imagePath).toLowerCase();
    if (VIDEO_EXTS.includes(ext) || ext === '.gif' || ext === '.svg') {
      return null;
    }

    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(imagePath);
    } catch {
      return null;
    }

    const maxLongSide = Number.isFinite(Number(options.maxLongSide))
      ? Math.max(128, Math.min(2048, Math.round(Number(options.maxLongSide))))
      : 512;
    const format = options.format === 'jpeg' ? 'jpeg' : 'webp';
    const quality = Number.isFinite(Number(options.quality))
      ? Math.max(1, Math.min(100, Math.floor(Number(options.quality))))
      : 90;
    const revision = `m${Math.max(0, Math.floor(stats.mtimeMs))}-s${Math.max(0, Math.floor(stats.size))}`;
    const sourceHash = this.getSourceHash(imagePath);
    const cacheKey = `${sourceHash}_${createHash('md5')
      .update(`${CACHE_KEY_VERSION}|grid|${imagePath}|${revision}|${maxLongSide}|${quality}|${format}`)
      .digest('hex')
      .slice(0, 12)}_grid-${maxLongSide}.${format}`;
    const cachePath = this.getCachePath(cacheKey);

    const cached = await this.readCachedBuffer(cacheKey, cachePath);
    if (cached) {
      return cached;
    }

    const sharp = await this.getSharp();
    if (!sharp) {
      return null;
    }

    return this.getOrGenerate(cacheKey, async () => {
      const bunPreview = await this.generateBunImageThumbnail(imagePath, maxLongSide, format, quality);
      if (bunPreview) {
        this.setMemoryCache(cacheKey, bunPreview);
        writeFile(cachePath, bunPreview).catch(() => { /* best effort */ });
        this.scheduleCacheLimitEnforcement();
        return bunPreview;
      }

      const base = sharp(imagePath).rotate().resize(maxLongSide, maxLongSide, {
        fit: 'inside',
        withoutEnlargement: true,
        fastShrinkOnLoad: true,
      });

      const preview = format === 'jpeg'
        ? await base
            .jpeg({
              quality,
              mozjpeg: true,
              chromaSubsampling: '4:4:4',
            })
            .toBuffer()
        : await base
            .webp({
              quality,
              effort: 4,
              nearLossless: false,
              alphaQuality: quality,
            })
            .toBuffer();

      this.setMemoryCache(cacheKey, preview);
      writeFile(cachePath, preview).catch(() => { /* best effort */ });
      this.scheduleCacheLimitEnforcement();
      return preview;
    }).catch((error) => {
      console.error(`[ThumbnailService] Failed to generate grid preview for ${imagePath}:`, error);
      return null;
    });
  }

  async generateOriginalWebpPreview(
    imagePath: string,
    options: {
      quality?: number;
    } = {},
  ): Promise<Buffer | null> {
    const ext = extname(imagePath).toLowerCase();
    if (VIDEO_EXTS.includes(ext) || ext === '.gif' || ext === '.svg') {
      return null;
    }

    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(imagePath);
    } catch {
      return null;
    }

    const quality = Number.isFinite(Number(options.quality))
      ? Math.max(1, Math.min(100, Math.floor(Number(options.quality))))
      : 100;
    const revision = `m${Math.max(0, Math.floor(stats.mtimeMs))}-s${Math.max(0, Math.floor(stats.size))}`;
    const sourceHash = this.getSourceHash(imagePath);
    const cacheKey = `${sourceHash}_${createHash('md5')
      .update(`${CACHE_KEY_VERSION}|viewer-webp|${imagePath}|${revision}|${quality}`)
      .digest('hex')
      .slice(0, 12)}_viewer-original-q${quality}.webp`;
    const cachePath = this.getCachePath(cacheKey);

    const cached = await this.readCachedBuffer(cacheKey, cachePath);
    if (cached) {
      return cached;
    }

    const sharp = await this.getSharp();
    if (!sharp) {
      return null;
    }

    return this.getOrGenerate(cacheKey, async () => {
      const preview = await sharp(imagePath)
        .rotate()
        .webp({
          quality,
          effort: 6,
          lossless: quality >= 100,
          nearLossless: quality < 100 && quality >= 96,
          alphaQuality: quality,
        })
        .toBuffer();

      this.setMemoryCache(cacheKey, preview);
      writeFile(cachePath, preview).catch(() => { /* best effort */ });
      this.scheduleCacheLimitEnforcement();
      return preview;
    }).catch((error) => {
      console.error(`[ThumbnailService] Failed to generate original WebP preview for ${imagePath}:`, error);
      return null;
    });
  }

  private applySidecarAdjustments(pipeline: any, sidecar: any): any {
    if (!sidecar || typeof sidecar !== 'object') return pipeline;

    const num = (value: any, fallback = 0): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(max, Math.max(min, value));

    const exposure = num(sidecar.exposure, 0);
    const contrast = num(sidecar.contrast, 0);
    const saturation = num(sidecar.saturation, 0);
    const vibrance = num(sidecar.vibrance, 0);
    const temperature = num(sidecar.temperature, 0);
    const tint = num(sidecar.tint, 0);
    const sharpen = num(sidecar.sharpen, 0);

    if (
      Math.abs(exposure) > 0.001 ||
      Math.abs(saturation) > 0.001 ||
      Math.abs(vibrance) > 0.001
    ) {
      const brightness = clamp(Math.pow(2, exposure * 0.75), 0.2, 4.0);
      const saturationMul = clamp(1 + (saturation + vibrance * 0.55) / 100, 0, 3.0);
      pipeline = pipeline.modulate({ brightness, saturation: saturationMul });
    }

    if (Math.abs(contrast) > 0.001) {
      const a = clamp(1 + contrast / 100, 0.2, 3.0);
      const b = 128 * (1 - a);
      pipeline = pipeline.linear(a, b);
    }

    if (Math.abs(temperature) > 0.001 || Math.abs(tint) > 0.001) {
      const rGain = clamp(1 + temperature / 320 - tint / 620, 0.25, 2.0);
      const gGain = clamp(1 + tint / 520, 0.25, 2.0);
      const bGain = clamp(1 - temperature / 320 - tint / 620, 0.25, 2.0);
      pipeline = pipeline.recomb([
        [rGain, 0, 0],
        [0, gGain, 0],
        [0, 0, bGain],
      ]);
    }

    if (sharpen > 0.001) {
      const sigma = clamp(1 + sharpen / 55, 1, 4.5);
      pipeline = pipeline.sharpen(sigma);
    }

    return pipeline;
  }

  private async applySupportedEffectsToBuffer(sharpLib: any, inputBuffer: Buffer, sidecar: any): Promise<Buffer> {
    const layers = (sidecar?.effects?.enabled && Array.isArray(sidecar?.effects?.layers))
      ? sidecar.effects.layers.filter((layer: any) => layer?.enabled !== false)
      : [];
    if (!layers.length) return inputBuffer;

    const num = (value: any, fallback = 0): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const clamp = (value: number, min: number, max: number): number =>
      Math.min(max, Math.max(min, value));
    const blendFromLayer = (layer: any): 'over' | 'multiply' | 'screen' => {
      if (layer?.blendMode === 'multiply') return 'multiply';
      if (layer?.blendMode === 'screen') return 'screen';
      return 'over';
    };

    let current = sharpLib(inputBuffer);
    const meta = await current.metadata();
    const width = Math.max(1, meta.width || 1);
    const height = Math.max(1, meta.height || 1);

    for (const layer of layers) {
      const kind = String(layer?.kind || '');
      const opacity = clamp(num(layer?.opacity, 1), 0, 1);
      const params = (layer?.params && typeof layer.params === 'object') ? layer.params : {};

      if (kind === 'pixelate') {
        const pxSize = clamp(Math.round(num(params.size, num(params.amount, 18))), 2, 120);
        const pxW = Math.max(1, Math.round(width / pxSize));
        const pxH = Math.max(1, Math.round(height / pxSize));
        current = current
          .resize(pxW, pxH, { fit: 'fill', kernel: 'nearest' })
          .resize(width, height, { fit: 'fill', kernel: 'nearest' });
        continue;
      }

      if (kind === 'vignette') {
        const amount = clamp(num(params.amount, num(params.strength, 0.5)), 0, 1);
        const softness = clamp(num(params.softness, 0.5), 0.05, 1);
        const edgeOpacity = clamp(amount * opacity, 0, 1);
        const innerStop = clamp(18 + (1 - softness) * 46, 10, 76);
        const outerStop = clamp(innerStop + softness * 20, innerStop + 6, 98);
        const vignetteSvg = `
          <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
            <defs>
              <radialGradient id="v" cx="50%" cy="50%" r="70%">
                <stop offset="${innerStop}%" stop-color="rgba(0,0,0,0)" />
                <stop offset="${outerStop}%" stop-color="rgba(0,0,0,${(edgeOpacity * 0.72).toFixed(3)})" />
                <stop offset="100%" stop-color="rgba(0,0,0,${edgeOpacity.toFixed(3)})" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width="${width}" height="${height}" fill="url(#v)" />
          </svg>
        `;
        current = current.composite([{ input: Buffer.from(vignetteSvg), blend: blendFromLayer(layer) }]);
        continue;
      }

      if (kind === 'film_grain') {
        const intensity = clamp(num(params.intensity, num(params.amount, 0.35)), 0, 1);
        const alpha = clamp(opacity * intensity * 0.8, 0, 1);
        if (alpha <= 0.001) continue;

        const noise = Buffer.alloc(width * height * 4);
        const spread = 80 * intensity;
        const a = Math.round(alpha * 255);
        for (let i = 0; i < noise.length; i += 4) {
          const base = Math.round(clamp(128 + (Math.random() * 2 - 1) * spread, 0, 255));
          noise[i] = base;
          noise[i + 1] = base;
          noise[i + 2] = base;
          noise[i + 3] = a;
        }
        const noisePng = await sharpLib(noise, {
          raw: { width, height, channels: 4 },
        }).png().toBuffer();
        current = current.composite([{ input: noisePng, blend: blendFromLayer(layer) }]);
      }
    }

    return current.png().toBuffer();
  }

  /**
   * Generate an animated preview for a video (low fps, short duration)
   * Returns a small webm/mp4 clip for hover previews
   */
  async generateVideoPreview(
    videoPath: string,
    options: {
      size?: ThumbnailSize;
      duration?: number; // seconds
      fps?: number;
    } = {}
  ): Promise<Buffer | null> {
    const { size = 'medium', duration = 4, fps = 8 } = options;
    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(videoPath);
    } catch {
      return null;
    }
    const revision = `preview-m${Math.max(0, Math.floor(stats.mtimeMs))}-s${Math.max(0, Math.floor(stats.size))}-d${duration}-f${fps}`;
    const cacheKey = this.getCacheKey(videoPath, size, 'webp', revision, FULL_QUALITY).replace(/\.webp$/, '.webm');
    const cachePath = this.getCachePath(cacheKey);

    const cached = await this.readCachedBuffer(cacheKey, cachePath);
    if (cached) return cached;

    try {
      return this.getOrGenerate(cacheKey, () => this.withGenerationSlot(async () => {
        const { spawn } = await import('child_process');
        const targetWidth = SIZES[size];

        return new Promise<Buffer | null>((resolve) => {
          // Generate preview: start at 1s, low fps, short duration, small size
          const ffmpegProcess = spawn('ffmpeg', [
            '-ss', '1',                          // Start at 1 second
            '-i', videoPath,
            '-t', String(duration),              // Duration in seconds
            '-vf', `scale=${targetWidth}:-2,fps=${fps}`, // Scale and reduce fps
            '-an',                               // No audio
            '-c:v', 'libvpx-vp9',               // VP9 codec for webm
            '-b:v', '200k',                      // Low bitrate
            '-crf', '40',                        // Quality (higher = smaller)
            '-f', 'webm',
            'pipe:1'
          ], {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          const chunks: Buffer[] = [];

          ffmpegProcess.stdout.on('data', (chunk) => chunks.push(chunk));

          ffmpegProcess.on('close', (code) => {
            if (code !== 0 || chunks.length === 0) {
              console.error(`[ThumbnailService] Preview generation failed for ${videoPath}`);
              resolve(null);
              return;
            }

            const preview = Buffer.concat(chunks);
            this.setMemoryCache(cacheKey, preview);
            writeFile(cachePath, preview).catch(() => { /* best effort */ });
            this.scheduleCacheLimitEnforcement();
            console.log(`[ThumbnailService] Generated preview for ${videoPath}: ${Math.round(preview.length / 1024)}KB`);
            resolve(preview);
          });

          ffmpegProcess.on('error', (err) => {
            console.error(`[ThumbnailService] FFmpeg error:`, err);
            resolve(null);
          });

          // Timeout after 30 seconds for longer videos
          setTimeout(() => {
            ffmpegProcess.kill();
            resolve(null);
          }, 30000);
        });
      }));
    } catch (error) {
      console.error(`[ThumbnailService] Failed to generate video preview for ${videoPath}:`, error);
      return null;
    }
  }

  /**
   * Generate a thumbnail for a video using ffmpeg
   */
  async generateVideoThumbnail(
    videoPath: string,
    options: {
      size: ThumbnailSize;
      quality?: number;
      format?: ThumbnailFormat
    } = { size: 'medium', quality: FULL_QUALITY, format: 'webp' }
  ): Promise<Buffer | null> {
    const { size, format = 'webp' } = options;
    const quality = this.normalizeQuality(options.quality);

    let stats: ReturnType<typeof statSync>;
    try {
      stats = statSync(videoPath);
    } catch {
      return null;
    }

    const revision = `m${Math.max(0, Math.floor(stats.mtimeMs))}-s${Math.max(0, Math.floor(stats.size))}`;
    const cacheKey = this.getCacheKey(videoPath, size, format, revision, quality);
    const cachePath = this.getCachePath(cacheKey);

    const cached = await this.readCachedBuffer(cacheKey, cachePath);
    if (cached) return cached;

    try {
      return this.getOrGenerate(cacheKey, () => this.withGenerationSlot(async () => {
        const { spawn } = await import('child_process');
        const targetWidth = SIZES[size];

        // Extract frame at 1 second using ffmpeg
        const ffmpegArgs = [
          '-ss', '1',
          '-i', videoPath,
          '-vframes', '1',
          '-vf', `scale=${targetWidth}:-1`,
          '-f', 'image2pipe',
        ];

        if (format === 'webp') {
          ffmpegArgs.push(
            '-vcodec', 'libwebp',
            '-q:v', String(quality),
            '-compression_level', '6'
          );
        } else {
          ffmpegArgs.push(
            '-vcodec', 'mjpeg',
            '-q:v', '1'
          );
        }

        ffmpegArgs.push('pipe:1');

        return new Promise<Buffer | null>((resolve) => {
          const ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
            stdio: ['pipe', 'pipe', 'pipe']
          });
          const chunks: Buffer[] = [];

          ffmpegProcess.stdout.on('data', (chunk) => chunks.push(chunk));

          ffmpegProcess.on('close', async (code) => {
            if (code !== 0 || chunks.length === 0) {
              resolve(null);
              return;
            }

            const thumbnail = Buffer.concat(chunks);

            this.setMemoryCache(cacheKey, thumbnail);
            writeFile(cachePath, thumbnail).catch(() => { /* best effort */ });
            this.scheduleCacheLimitEnforcement();

            resolve(thumbnail);
          });

          ffmpegProcess.on('error', () => resolve(null));

          // Timeout after 10 seconds
          setTimeout(() => {
            ffmpegProcess.kill();
            resolve(null);
          }, 10000);
        });
      }));
    } catch (error) {
      console.error(`[ThumbnailService] Failed to generate video thumbnail for ${videoPath}:`, error);
      return null;
    }
  }

  /**
   * Precache thumbnails for all media files in a directory
   * Runs in background, non-blocking
   */
  async precacheDirectory(
    _dirPath: string,
    _options: {
      recursive?: boolean;
      size?: ThumbnailSize;
      concurrency?: number;
      onProgress?: (completed: number, total: number, skipped: number) => void;
    } = {}
  ): Promise<{ total: number; generated: number; skipped: number; errors: number }> {
    // Precaching disabled by request
    return { total: 0, generated: 0, skipped: 0, errors: 0 };
  }

  /**
   * Get precaching progress
   */
  getPrecacheProgress(): { isPrecaching: boolean; total: number; completed: number; skipped: number } {
    return {
      isPrecaching: this.isPrecaching,
      ...this.precacheProgress,
    };
  }

  /**
   * Clear cache for a specific image or all cache
   */
  async clearCacheForPaths(imagePaths: string[]): Promise<void> {
    const prefixes = Array.from(new Set(
      imagePaths
        .map((imagePath) => String(imagePath || '').trim())
        .filter(Boolean)
        .map((imagePath) => this.getSourceCachePrefix(imagePath))
    ));
    if (prefixes.length === 0) return;

    const matchesPrefix = (cacheKey: string) => prefixes.some((prefix) => cacheKey.startsWith(prefix));
    for (const [cacheKey, entry] of Array.from(this.memoryCache.entries())) {
      if (!matchesPrefix(cacheKey)) continue;
      this.memoryCache.delete(cacheKey);
      this.memoryCacheSizeBytes = Math.max(0, this.memoryCacheSizeBytes - entry.size);
    }
    this.pendingGenerations.forEach((_promise, cacheKey) => {
      if (matchesPrefix(cacheKey)) {
        this.pendingGenerations.delete(cacheKey);
      }
    });

    try {
      const files = await readdir(this.cacheDir);
      await Promise.all(
        files
          .filter((file) => matchesPrefix(file))
          .map((file) => unlink(join(this.cacheDir, file)).catch(() => { }))
      );
    } catch { }
  }

  async clearCache(imagePath?: string): Promise<void> {
    if (imagePath) {
      await this.clearCacheForPaths([imagePath]);
    } else {
      this.memoryCache.clear();
      this.memoryCacheSizeBytes = 0;
      this.pendingGenerations.clear();
      // Clear all cache
      try {
        const files = await readdir(this.cacheDir);
        await Promise.all(
          files.map(file => unlink(join(this.cacheDir, file)).catch(() => { }))
        );
      } catch { }
    }
  }

  private collectCacheFiles(): Array<{ path: string; name: string }> {
    try {
      return readdirSync(this.cacheDir).map((file) => ({
        path: join(this.cacheDir, file),
        name: file,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { count: number; sizeBytes: number; sizeMB: number; maxSizeMB: number; percentUsed: number; memoryCount: number; memorySizeMB: number } {
    try {
      const files = this.collectCacheFiles();
      let totalSize = 0;

      for (const file of files) {
        try {
          const stats = statSync(file.path);
          totalSize += stats.size;
        } catch { }
      }

      const sizeMB = Math.round(totalSize / (1024 * 1024));
      const maxSizeMB = Math.round(MAX_CACHE_SIZE_BYTES / (1024 * 1024));
      const memorySizeMB = Math.round(this.memoryCacheSizeBytes / (1024 * 1024));

      return {
        count: files.length,
        sizeBytes: totalSize,
        sizeMB,
        maxSizeMB,
        percentUsed: Math.round((totalSize / MAX_CACHE_SIZE_BYTES) * 100),
        memoryCount: this.memoryCache.size,
        memorySizeMB,
      };
    } catch {
      return { count: 0, sizeBytes: 0, sizeMB: 0, maxSizeMB: 2048, percentUsed: 0, memoryCount: 0, memorySizeMB: 0 };
    }
  }
}
