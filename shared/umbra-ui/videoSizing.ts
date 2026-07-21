export type UmbraVideoSizingFamily = 'wan22' | 'ltx23';
export type UmbraVideoSizingUpscaleMode = 'none' | 'lanczos' | 'model' | 'rtx';

export const UMBRA_VIDEO_RESOLUTION_PRESETS = [
  { id: '144p', label: '144p', megapixels: 0.04, group: 'standard' },
  { id: '240p', label: '240p', megapixels: 0.10, group: 'standard' },
  { id: '360p', label: '360p', megapixels: 0.23, group: 'standard' },
  { id: '480p', label: '480p', megapixels: 0.38, group: 'standard' },
  { id: '540p', label: '540p', megapixels: 0.52, group: 'standard' },
  { id: '576p', label: '576p', megapixels: 0.59, group: 'standard' },
  { id: '720p', label: '720p', megapixels: 0.92, group: 'standard' },
  { id: '900p', label: '900p', megapixels: 1.44, group: 'standard' },
  { id: '1080p', label: '1080p', megapixels: 2.07, group: 'standard' },
  { id: '1152p', label: '1152p', megapixels: 2.36, group: 'standard' },
  { id: '1440p', label: '1440p', megapixels: 3.68, group: 'standard' },
  { id: '2160p', label: '2160p', megapixels: 8.29, group: 'standard' },
  { id: '2k', label: '2K', megapixels: 4.19, group: 'standard' },
  { id: '4k', label: '4K', megapixels: 8.29, group: 'standard' },
  { id: '0.26mp', label: '0.26 MP - Preview', megapixels: 0.26, group: 'budget' },
  { id: '0.36mp', label: '0.36 MP - Small', megapixels: 0.36, group: 'budget' },
  { id: '0.52mp', label: '0.52 MP - SD', megapixels: 0.52, group: 'budget' },
  { id: '0.65mp', label: '0.65 MP - Balanced', megapixels: 0.65, group: 'budget' },
  { id: '0.83mp', label: '0.83 MP - HD', megapixels: 0.83, group: 'budget' },
  { id: '1.05mp', label: '1.05 MP - HD+', megapixels: 1.05, group: 'budget' },
  { id: '1.20mp', label: '1.20 MP - HD++', megapixels: 1.2, group: 'budget' },
  { id: '1.35mp', label: '1.35 MP - 2K Lite', megapixels: 1.35, group: 'budget' },
  { id: '1.55mp', label: '1.55 MP - 2K', megapixels: 1.55, group: 'budget' },
  { id: '1.65mp', label: '1.65 MP - 2K+', megapixels: 1.65, group: 'budget' },
  { id: '1.75mp', label: '1.75 MP - QHD', megapixels: 1.75, group: 'budget' },
  { id: '2.10mp', label: '2.10 MP - FHD', megapixels: 2.1, group: 'budget' },
  { id: '3.30mp', label: '3.30 MP - QHD+', megapixels: 3.3, group: 'budget' },
  { id: '4.75mp', label: '4.75 MP - 2K Pro', megapixels: 4.75, group: 'budget' },
  { id: '6.50mp', label: '6.50 MP - Production', megapixels: 6.5, group: 'budget' },
  { id: '8.30mp', label: '8.30 MP - UHD', megapixels: 8.3, group: 'budget' },
] as const;

export type UmbraVideoResolutionPreset = typeof UMBRA_VIDEO_RESOLUTION_PRESETS[number]['id'];

export const UMBRA_VIDEO_ASPECT_PRESETS = [
  { id: '1:1', label: '1:1 Square', width: 1, height: 1 },
  { id: '2:3', label: '2:3 Classic', width: 2, height: 3 },
  { id: '3:4', label: '3:4 Photo', width: 3, height: 4 },
  { id: '5:8', label: '5:8 Tall', width: 5, height: 8 },
  { id: '9:16', label: '9:16 Social', width: 9, height: 16 },
  { id: '9:21', label: '9:21 Cinema', width: 9, height: 21 },
  { id: '3:2', label: '3:2 Landscape', width: 3, height: 2 },
  { id: '4:3', label: '4:3 Landscape', width: 4, height: 3 },
  { id: '8:5', label: '8:5 Landscape', width: 8, height: 5 },
  { id: '16:9', label: '16:9 Landscape', width: 16, height: 9 },
  { id: '21:9', label: '21:9 Cinema', width: 21, height: 9 },
] as const;

export type UmbraVideoAspectPreset = typeof UMBRA_VIDEO_ASPECT_PRESETS[number]['id'];

export interface UmbraVideoTargetInput {
  resolutionPreset: string;
  sourceWidth?: number;
  sourceHeight?: number;
  fallbackAspect?: string;
  divisor?: number;
}

export interface UmbraVideoTargetResult {
  resolutionPreset: UmbraVideoResolutionPreset;
  megapixels: number;
  sourceWidth: number;
  sourceHeight: number;
  usedSourceAspect: boolean;
  targetWidth: number;
  targetHeight: number;
}

export interface UmbraVideoSizingInput {
  width: number;
  height: number;
  family: UmbraVideoSizingFamily;
  ltxTwoStage: boolean;
  upscaleMode: UmbraVideoSizingUpscaleMode;
  upscaleScale: number;
}

export interface UmbraVideoSizingResult {
  targetWidth: number;
  targetHeight: number;
  samplingWidth: number;
  samplingHeight: number;
  decodedWidth: number;
  decodedHeight: number;
  latentScale: number;
  postprocessScale: number;
  requiresFinalResize: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function alignDimension(value: number, multiple: number, min = 64, max = 8192): number {
  const finite = Number.isFinite(value) ? value : min;
  return clamp(Math.round(finite / multiple) * multiple, min, max);
}

function finitePositive(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function inferUmbraVideoResolutionPreset(
  width: unknown,
  height: unknown,
  fallback: UmbraVideoResolutionPreset = '720p',
): UmbraVideoResolutionPreset {
  const resolvedWidth = finitePositive(width);
  const resolvedHeight = finitePositive(height);
  if (!resolvedWidth || !resolvedHeight) return fallback;
  const megapixels = resolvedWidth * resolvedHeight / 1_000_000;
  return UMBRA_VIDEO_RESOLUTION_PRESETS.reduce((nearest, preset) => (
    Math.abs(preset.megapixels - megapixels) < Math.abs(nearest.megapixels - megapixels)
      ? preset
      : nearest
  ), UMBRA_VIDEO_RESOLUTION_PRESETS.find((preset) => preset.id === fallback) || UMBRA_VIDEO_RESOLUTION_PRESETS[6]).id;
}

export function normalizeUmbraVideoResolutionPreset(
  value: unknown,
  fallback: UmbraVideoResolutionPreset = '720p',
): UmbraVideoResolutionPreset {
  const candidate = String(value || '').trim().toLowerCase();
  return UMBRA_VIDEO_RESOLUTION_PRESETS.find((preset) => preset.id === candidate)?.id || fallback;
}

export function normalizeUmbraVideoAspectPreset(
  value: unknown,
  fallback: UmbraVideoAspectPreset = '16:9',
): UmbraVideoAspectPreset {
  const candidate = String(value || '').trim().toLowerCase();
  return UMBRA_VIDEO_ASPECT_PRESETS.find((preset) => preset.id === candidate)?.id || fallback;
}

export function resolveUmbraVideoTargetDimensions(input: UmbraVideoTargetInput): UmbraVideoTargetResult {
  const resolutionPreset = normalizeUmbraVideoResolutionPreset(input.resolutionPreset);
  const preset = UMBRA_VIDEO_RESOLUTION_PRESETS.find((entry) => entry.id === resolutionPreset)
    || UMBRA_VIDEO_RESOLUTION_PRESETS[6];
  const requestedSourceWidth = finitePositive(input.sourceWidth);
  const requestedSourceHeight = finitePositive(input.sourceHeight);
  const usedSourceAspect = requestedSourceWidth > 0 && requestedSourceHeight > 0;
  const fallbackAspect = UMBRA_VIDEO_ASPECT_PRESETS.find((entry) => (
    entry.id === normalizeUmbraVideoAspectPreset(input.fallbackAspect)
  )) || UMBRA_VIDEO_ASPECT_PRESETS[9];
  const sourceWidth = usedSourceAspect ? requestedSourceWidth : fallbackAspect.width;
  const sourceHeight = usedSourceAspect ? requestedSourceHeight : fallbackAspect.height;
  const aspectRatio = sourceWidth / sourceHeight;
  const targetPixels = preset.megapixels * 1_000_000;
  const divisor = clamp(Math.round(finitePositive(input.divisor) || 32), 1, 256);
  const targetWidth = clamp(Math.round(Math.sqrt(targetPixels * aspectRatio) / divisor) * divisor, divisor, 8192);
  const targetHeight = clamp(Math.round(Math.sqrt(targetPixels / aspectRatio) / divisor) * divisor, divisor, 8192);

  return {
    resolutionPreset,
    megapixels: preset.megapixels,
    sourceWidth,
    sourceHeight,
    usedSourceAspect,
    targetWidth,
    targetHeight,
  };
}

export function resolveUmbraVideoSizing(input: UmbraVideoSizingInput): UmbraVideoSizingResult {
  const targetWidth = alignDimension(input.width, 8);
  const targetHeight = alignDimension(input.height, 8);
  const latentScale = input.family === 'ltx23' && input.ltxTwoStage ? 2 : 1;
  const postprocessScale = input.upscaleMode === 'none'
    ? 1
    : clamp(Number(input.upscaleScale) || 2, 1, 4);
  const samplingMultiple = input.family === 'ltx23' ? 8 : 16;
  const samplingWidth = alignDimension(targetWidth / (latentScale * postprocessScale), samplingMultiple);
  const samplingHeight = alignDimension(targetHeight / (latentScale * postprocessScale), samplingMultiple);
  const decodedWidth = samplingWidth * latentScale;
  const decodedHeight = samplingHeight * latentScale;

  return {
    targetWidth,
    targetHeight,
    samplingWidth,
    samplingHeight,
    decodedWidth,
    decodedHeight,
    latentScale,
    postprocessScale,
    requiresFinalResize: decodedWidth !== targetWidth || decodedHeight !== targetHeight,
  };
}
