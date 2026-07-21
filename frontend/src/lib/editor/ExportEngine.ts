/**
 * ExportEngine — Shared export pipeline logic.
 * Extracted from ExportDialog for reuse by EditorPanel Export tab and BatchExportDialog.
 * Vanilla JS, no React dependencies.
 */

import { WebGLPipeline, EditAdjustments } from '../webgl/WebGLPipeline';
import { WatermarkEngine, WatermarkConfig } from './WatermarkEngine';
import { resolveTemplate, buildContext, DEFAULT_TEMPLATE } from './FilenameTemplate';
import { readUserConfig, writeUserConfig } from '@/lib/userConfig';

export interface ExportSettings {
  format: 'image/png' | 'image/jpeg' | 'image/webp';
  quality: number;       // 0.1 to 1.0 (for JPEG/WebP)
  maxLongestSide: number; // 0 = no resize
  filenameTemplate: string;
  embedMetadata: boolean;
  watermarkConfig: WatermarkConfig;
}

export const FORMAT_LABELS: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
  'image/webp': 'WebP',
};

export const FORMAT_EXTS: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

export function getDefaultExportSettings(): ExportSettings {
  return {
    format: 'image/png',
    quality: 0.92,
    maxLongestSide: 0,
    filenameTemplate: DEFAULT_TEMPLATE,
    embedMetadata: true,
    watermarkConfig: WatermarkEngine.getDefault(),
  };
}

const EXPORT_SETTINGS_LEGACY_STORAGE_KEY = 'umbra_export_settings';
const EXPORT_SETTINGS_CONFIG_KEY = 'editor-export-settings';
let exportSettingsCache: ExportSettings | null = null;
let exportSettingsLoadPromise: Promise<void> | null = null;

function clearLegacyExportSettingsStorage() {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(EXPORT_SETTINGS_LEGACY_STORAGE_KEY);
  } catch {
    // Legacy cleanup only.
  }
}

function loadExportSettingsFromConfig() {
  if (exportSettingsLoadPromise) return exportSettingsLoadPromise;
  exportSettingsLoadPromise = readUserConfig<Partial<ExportSettings>>(EXPORT_SETTINGS_CONFIG_KEY, {})
    .then((settings) => {
      exportSettingsCache = { ...getDefaultExportSettings(), ...settings };
      clearLegacyExportSettingsStorage();
    })
    .finally(() => {
      exportSettingsLoadPromise = null;
    });
  return exportSettingsLoadPromise;
}

export function loadExportSettings(): ExportSettings {
  clearLegacyExportSettingsStorage();
  if (!exportSettingsCache) {
    exportSettingsCache = getDefaultExportSettings();
    void loadExportSettingsFromConfig();
  }
  return exportSettingsCache;
}

export function saveExportSettings(settings: ExportSettings): void {
  exportSettingsCache = { ...getDefaultExportSettings(), ...settings };
  clearLegacyExportSettingsStorage();
  void writeUserConfig(EXPORT_SETTINGS_CONFIG_KEY, exportSettingsCache).catch((error) => {
    console.warn('[ExportEngine] Failed to persist export settings:', error);
  });
}

/**
 * Render and export a single image through the WebGL pipeline.
 */
export async function exportImage(
  imagePath: string,
  imageSrc: string,
  adjustments: EditAdjustments | null,
  settings: ExportSettings,
  counter: number,
  total: number,
  onProgress?: (status: string) => void,
): Promise<{ blob: Blob; filename: string }> {
  onProgress?.('Loading image...');

  // Load the source image
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageSrc;
  });

  onProgress?.('Rendering...');

  // Create offscreen pipeline
  const offscreenCanvas = document.createElement('canvas');
  const pipeline = new WebGLPipeline(offscreenCanvas);
  await pipeline.loadImage(img);

  if (adjustments) {
    pipeline.setAdjustments(adjustments);
  }
  pipeline.render();

  onProgress?.('Encoding...');

  let targetWidth = img.naturalWidth;
  let targetHeight = img.naturalHeight;
  const needsResize = settings.maxLongestSide > 0;
  const needsWatermark = settings.watermarkConfig.enabled;

  let blob: Blob;

  if (needsResize || needsWatermark) {
    if (needsResize) {
      const longest = Math.max(targetWidth, targetHeight);
      const scale = Math.min(settings.maxLongestSide / longest, 1);
      targetWidth = Math.round(targetWidth * scale);
      targetHeight = Math.round(targetHeight * scale);
    }

    const fullBlob = await pipeline.toBlob('image/png', 1);
    const fullBitmap = await createImageBitmap(fullBlob);

    const canvas2d = document.createElement('canvas');
    canvas2d.width = targetWidth;
    canvas2d.height = targetHeight;
    const ctx = canvas2d.getContext('2d')!;
    ctx.drawImage(fullBitmap, 0, 0, targetWidth, targetHeight);
    fullBitmap.close();

    if (needsWatermark) {
      await WatermarkEngine.apply(ctx, targetWidth, targetHeight, settings.watermarkConfig, {
        index: counter,
        total,
      });
    }

    blob = await new Promise<Blob>((resolve, reject) => {
      canvas2d.toBlob(
        (b) => b ? resolve(b) : reject(new Error('toBlob failed')),
        settings.format,
        settings.quality,
      );
    });
  } else {
    blob = await pipeline.toBlob(settings.format, settings.quality);
  }

  pipeline.destroy();

  // Build filename
  const ext = FORMAT_EXTS[settings.format] || '.png';
  const formatName = ext.replace('.', '');
  const tmplCtx = buildContext(imagePath, formatName, counter, total);
  const resolvedName = resolveTemplate(settings.filenameTemplate || DEFAULT_TEMPLATE, tmplCtx);
  const filename = `${resolvedName}${ext}`;

  // Embed metadata if requested
  let downloadBlob = blob;
  if (settings.embedMetadata) {
    try {
      const formData = new FormData();
      formData.append('file', blob, filename);
      formData.append('sourcePath', imagePath);
      const metaRes = await fetch('/api/export/embed-metadata', { method: 'POST', body: formData });
      if (metaRes.ok) {
        downloadBlob = await metaRes.blob();
      }
    } catch { /* fallback to original blob */ }
  }

  return { blob: downloadBlob, filename };
}

/**
 * Trigger a browser download for a blob.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
