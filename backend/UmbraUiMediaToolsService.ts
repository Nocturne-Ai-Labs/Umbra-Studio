import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { basename, dirname, extname } from 'path';
import sharp from 'sharp';
import { resolveUmbraExtendedVideoFfmpeg } from './UmbraUiExtendedVideoService';

const VIDEO_EXTENSIONS = new Set(['.avi', '.m4v', '.mkv', '.mov', '.mp4', '.webm', '.wmv']);

export interface UmbraUiWatermarkPlacement {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export type UmbraUiImageExportFormat = 'png' | 'jpeg' | 'webp';

export interface UmbraUiImageExportSettings {
  resizeEnabled: boolean;
  longEdge: number;
  format: UmbraUiImageExportFormat;
  quality: number;
}

export interface UmbraUiCensorRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type UmbraUiImageCensorMode = 'mosaic' | 'overlay';

function clamp(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(minimum, Math.min(maximum, numeric));
}

function runProcess(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk || '');
      if (stderr.length > 32000) stderr = stderr.slice(-32000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${basename(command)} exited with code ${code}.`));
    });
  });
}

function normalizePlacement(value: UmbraUiWatermarkPlacement): UmbraUiWatermarkPlacement {
  return {
    x: clamp(value.x, 0, 1, 1),
    y: clamp(value.y, 0, 1, 1),
    scale: clamp(value.scale, 0.02, 1, 0.2),
    opacity: clamp(value.opacity, 0.01, 1, 0.7),
  };
}

function normalizeImageExportSettings(value: UmbraUiImageExportSettings): UmbraUiImageExportSettings {
  return {
    resizeEnabled: value.resizeEnabled === true,
    longEdge: Math.round(clamp(value.longEdge, 64, 16384, 1024)),
    format: value.format === 'jpeg' || value.format === 'webp' ? value.format : 'png',
    quality: Math.round(clamp(value.quality, 1, 100, 90)),
  };
}

function normalizeCensorRegion(value: UmbraUiCensorRegion): UmbraUiCensorRegion {
  const width = clamp(value.width, 0.01, 1, 0.35);
  const height = clamp(value.height, 0.01, 1, 0.18);
  return {
    x: clamp(value.x, 0, 1 - width, 0.325),
    y: clamp(value.y, 0, 1 - height, 0.68),
    width,
    height,
  };
}

export function isUmbraUiWatermarkVideo(path: string): boolean {
  return VIDEO_EXTENSIONS.has(extname(path).toLowerCase());
}

async function applyImageWatermark(options: {
  sourcePath: string;
  watermarkPath: string;
  outputPath: string;
  placement: UmbraUiWatermarkPlacement;
  exportSettings: UmbraUiImageExportSettings;
}): Promise<void> {
  const placement = normalizePlacement(options.placement);
  const exportSettings = normalizeImageExportSettings(options.exportSettings);
  const source = sharp(options.sourcePath).rotate();
  const metadata = await source.metadata();
  const originalWidth = Math.max(1, Number(metadata.width) || 1);
  const originalHeight = Math.max(1, Number(metadata.height) || 1);
  const resizeScale = exportSettings.resizeEnabled
    ? exportSettings.longEdge / Math.max(originalWidth, originalHeight)
    : 1;
  const sourceWidth = Math.max(1, Math.round(originalWidth * resizeScale));
  const sourceHeight = Math.max(1, Math.round(originalHeight * resizeScale));
  if (exportSettings.resizeEnabled) {
    source.resize({ width: sourceWidth, height: sourceHeight, fit: 'fill', kernel: sharp.kernel.lanczos3 });
  }
  const watermarkWidth = Math.max(1, Math.round(sourceWidth * placement.scale));
  const watermark = await sharp(options.watermarkPath)
    .rotate()
    .resize({
      width: watermarkWidth,
      height: sourceHeight,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .ensureAlpha()
    .png()
    .toBuffer();
  const watermarkMetadata = await sharp(watermark).metadata();
  const overlayWidth = Math.max(1, Number(watermarkMetadata.width) || watermarkWidth);
  const overlayHeight = Math.max(1, Number(watermarkMetadata.height) || 1);
  const left = Math.round((sourceWidth - overlayWidth) * placement.x);
  const top = Math.round((sourceHeight - overlayHeight) * placement.y);
  const opacityOverlay = Buffer.from(
    `<svg width="${overlayWidth}" height="${overlayHeight}" xmlns="http://www.w3.org/2000/svg">`
      + `<image width="${overlayWidth}" height="${overlayHeight}" opacity="${placement.opacity}" href="data:image/png;base64,${watermark.toString('base64')}"/>`
      + '</svg>',
  );

  await fs.mkdir(dirname(options.outputPath), { recursive: true });
  const output = source.composite([{ input: opacityOverlay, left, top, blend: 'over' }]);
  if (exportSettings.format === 'jpeg') {
    await output.flatten({ background: '#ffffff' }).jpeg({ quality: exportSettings.quality, chromaSubsampling: '4:4:4' }).toFile(options.outputPath);
  } else if (exportSettings.format === 'webp') {
    await output.webp({ quality: exportSettings.quality, smartSubsample: true }).toFile(options.outputPath);
  } else {
    await output.png({ compressionLevel: 9 }).toFile(options.outputPath);
  }
}

async function applyVideoWatermark(options: {
  comfyRoot: string;
  sourcePath: string;
  watermarkPath: string;
  outputPath: string;
  workDirectory: string;
  placement: UmbraUiWatermarkPlacement;
  outputWidth: number;
}): Promise<void> {
  const placement = normalizePlacement(options.placement);
  const outputWidth = Math.round(clamp(options.outputWidth, 64, 7680, 1920) / 2) * 2;
  const watermarkWidth = Math.max(1, Math.round(outputWidth * placement.scale));
  const ffmpeg = resolveUmbraExtendedVideoFfmpeg(options.comfyRoot);
  const filter = [
    `[0:v]scale=w=${outputWidth}:h=-2:flags=lanczos[scaled]`,
    `[1:v]scale=w=${watermarkWidth}:h=-2:flags=lanczos,format=rgba,colorchannelmixer=aa=${placement.opacity.toFixed(4)}[watermark]`,
    `[scaled][watermark]overlay=x=(main_w-overlay_w)*${placement.x.toFixed(4)}:y=(main_h-overlay_h)*${placement.y.toFixed(4)}:format=auto:eof_action=repeat:repeatlast=1[video]`,
  ].join(';');

  await fs.mkdir(dirname(options.outputPath), { recursive: true });
  await runProcess(ffmpeg, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', options.sourcePath,
    '-i', options.watermarkPath,
    '-filter_complex', filter,
    '-map', '[video]',
    '-map', '0:a?',
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    options.outputPath,
  ], options.workDirectory);
}

export async function applyUmbraUiWatermark(options: {
  comfyRoot: string;
  sourcePath: string;
  watermarkPath: string;
  outputPath: string;
  workDirectory: string;
  placement: UmbraUiWatermarkPlacement;
  exportSettings: UmbraUiImageExportSettings;
  outputWidth?: number;
}): Promise<'image' | 'video'> {
  if (isUmbraUiWatermarkVideo(options.sourcePath)) {
    await applyVideoWatermark({ ...options, outputWidth: options.outputWidth || 1920 });
    return 'video';
  }
  await applyImageWatermark(options);
  return 'image';
}

export async function applyUmbraUiImageCensor(options: {
  sourcePath: string;
  outputPath: string;
  mode: UmbraUiImageCensorMode;
  overlayPath?: string;
  region?: UmbraUiCensorRegion;
  regions?: UmbraUiCensorRegion[];
  mosaicSize: number;
  exportSettings: UmbraUiImageExportSettings;
}): Promise<boolean> {
  const exportSettings = normalizeImageExportSettings(options.exportSettings);
  const requestedRegions = options.regions !== undefined
    ? options.regions
    : options.region ? [options.region] : [];
  const regions = requestedRegions.map(normalizeCensorRegion);
  const source = sharp(options.sourcePath).rotate();
  const metadata = await source.metadata();
  const originalWidth = Math.max(1, Number(metadata.width) || 1);
  const originalHeight = Math.max(1, Number(metadata.height) || 1);
  const resizeScale = exportSettings.resizeEnabled
    ? exportSettings.longEdge / Math.max(originalWidth, originalHeight)
    : 1;
  const outputWidth = Math.max(1, Math.round(originalWidth * resizeScale));
  const outputHeight = Math.max(1, Math.round(originalHeight * resizeScale));
  const prepared = await source
    .resize(exportSettings.resizeEnabled ? { width: outputWidth, height: outputHeight, fit: 'fill', kernel: sharp.kernel.lanczos3 } : undefined)
    .ensureAlpha()
    .png()
    .toBuffer();
  const writeOutput = async (image: any) => {
    await fs.mkdir(dirname(options.outputPath), { recursive: true });
    if (exportSettings.format === 'jpeg') {
      await image.flatten({ background: '#ffffff' }).jpeg({ quality: exportSettings.quality, chromaSubsampling: '4:4:4' }).toFile(options.outputPath);
    } else if (exportSettings.format === 'webp') {
      await image.webp({ quality: exportSettings.quality, smartSubsample: true }).toFile(options.outputPath);
    } else {
      await image.png({ compressionLevel: 9 }).toFile(options.outputPath);
    }
  };
  if (regions.length === 0) {
    await writeOutput(sharp(prepared));
    return false;
  }
  const compositeLayers: sharp.OverlayOptions[] = [];
  for (const region of regions) {
    const left = Math.max(0, Math.min(outputWidth - 1, Math.round(outputWidth * region.x)));
    const top = Math.max(0, Math.min(outputHeight - 1, Math.round(outputHeight * region.y)));
    const width = Math.max(1, Math.min(outputWidth - left, Math.round(outputWidth * region.width)));
    const height = Math.max(1, Math.min(outputHeight - top, Math.round(outputHeight * region.height)));
    let censorLayer: Buffer;
    if (options.mode === 'overlay') {
      if (!options.overlayPath) throw new Error('Choose a censor overlay image.');
      censorLayer = await sharp(options.overlayPath)
        .rotate()
        .resize({ width, height, fit: 'fill', kernel: sharp.kernel.nearest })
        .ensureAlpha()
        .png()
        .toBuffer();
    } else {
      const blockSize = Math.round(clamp(options.mosaicSize, 2, 160, 24));
      const reduced = await sharp(prepared)
        .extract({ left, top, width, height })
        .resize({ width: Math.max(1, Math.round(width / blockSize)), height: Math.max(1, Math.round(height / blockSize)), fit: 'fill', kernel: sharp.kernel.nearest })
        .png()
        .toBuffer();
      censorLayer = await sharp(reduced)
        .resize({ width, height, fit: 'fill', kernel: sharp.kernel.nearest })
        .png()
        .toBuffer();
    }
    compositeLayers.push({ input: censorLayer, left, top, blend: 'over' });
  }

  const output = sharp(prepared).composite(compositeLayers);
  await writeOutput(output);
  return true;
}

export async function convertUmbraUiVideoToGif(options: {
  comfyRoot: string;
  sourcePath: string;
  outputPath: string;
  workDirectory: string;
  width: number;
}): Promise<void> {
  const width = Math.round(clamp(options.width, 64, 3840, 720) / 2) * 2;
  const ffmpeg = resolveUmbraExtendedVideoFfmpeg(options.comfyRoot);
  const filter = [
    `scale=${width}:-2:flags=lanczos,split[gif_source][palette_source]`,
    '[palette_source]palettegen=stats_mode=diff[palette]',
    '[gif_source][palette]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
  ].join(';');

  await fs.mkdir(dirname(options.outputPath), { recursive: true });
  await runProcess(ffmpeg, [
    '-hide_banner',
    '-loglevel', 'error',
    '-y',
    '-i', options.sourcePath,
    '-filter_complex', filter,
    '-loop', '0',
    options.outputPath,
  ], options.workDirectory);
}
