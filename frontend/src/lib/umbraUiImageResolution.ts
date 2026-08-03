export interface UmbraImageResolutionBounds {
  minimumWidth?: number;
  minimumHeight?: number;
  maximumWidth?: number;
  maximumHeight?: number;
  step?: number;
}

export const UMBRA_IMAGE_ASPECT_PRESETS = [
  { id: '1:1', label: '1:1 Square', baseWidth: 1024, baseHeight: 1024 },
  { id: '3:4', label: '3:4 Portrait', baseWidth: 896, baseHeight: 1152 },
  { id: '2:3', label: '2:3 Portrait', baseWidth: 832, baseHeight: 1216 },
  { id: '4:5', label: '4:5 Portrait', baseWidth: 896, baseHeight: 1120 },
  { id: '9:16', label: '9:16 Portrait', baseWidth: 768, baseHeight: 1344 },
  { id: '4:3', label: '4:3 Landscape', baseWidth: 1152, baseHeight: 896 },
  { id: '3:2', label: '3:2 Landscape', baseWidth: 1216, baseHeight: 832 },
  { id: '5:4', label: '5:4 Landscape', baseWidth: 1120, baseHeight: 896 },
  { id: '16:9', label: '16:9 Landscape', baseWidth: 1344, baseHeight: 768 },
  { id: '21:9', label: '21:9 Ultrawide', baseWidth: 1536, baseHeight: 640 },
] as const;

export type UmbraImageAspectPresetId = typeof UMBRA_IMAGE_ASPECT_PRESETS[number]['id'] | 'custom';

function finiteInteger(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : fallback;
}

function alignDimension(value: number, minimum: number, maximum: number, step: number): number {
  const clamped = Math.max(minimum, Math.min(maximum, value));
  const aligned = Math.round(clamped / step) * step;
  return Math.max(minimum, Math.min(maximum, aligned));
}

export function resolveUmbraImageDimensions(
  aspectRatio: UmbraImageAspectPresetId,
  baseResolution: number,
  bounds: UmbraImageResolutionBounds,
): { width: number; height: number } | null {
  const preset = UMBRA_IMAGE_ASPECT_PRESETS.find((entry) => entry.id === aspectRatio);
  if (!preset) return null;
  const step = Math.max(1, finiteInteger(bounds.step, 8));
  const minimumWidth = Math.max(step, finiteInteger(bounds.minimumWidth, 64));
  const minimumHeight = Math.max(step, finiteInteger(bounds.minimumHeight, 64));
  const maximumWidth = Math.max(minimumWidth, finiteInteger(bounds.maximumWidth, 8192));
  const maximumHeight = Math.max(minimumHeight, finiteInteger(bounds.maximumHeight, 8192));
  const longSide = Math.max(512, Math.min(2048, finiteInteger(baseResolution, 1024)));
  const [ratioWidth, ratioHeight] = preset.id.split(':').map(Number);
  const ratio = ratioWidth / ratioHeight;
  const requestedWidth = ratio >= 1 ? longSide : longSide * ratio;
  const requestedHeight = ratio >= 1 ? longSide / ratio : longSide;
  return {
    width: alignDimension(requestedWidth, minimumWidth, maximumWidth, step),
    height: alignDimension(requestedHeight, minimumHeight, maximumHeight, step),
  };
}

export function inferUmbraImageAspectRatio(width: number, height: number): UmbraImageAspectPresetId {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 'custom';
  const ratio = width / height;
  const closest = UMBRA_IMAGE_ASPECT_PRESETS.reduce((best, preset) => {
    const presetRatio = preset.baseWidth / preset.baseHeight;
    const error = Math.abs(Math.log(ratio / presetRatio));
    return error < best.error ? { id: preset.id, error } : best;
  }, { id: 'custom' as UmbraImageAspectPresetId, error: Number.POSITIVE_INFINITY });
  return closest.error <= 0.06 ? closest.id : 'custom';
}

export function inferUmbraImageBaseResolution(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1024;
  const longSide = Math.max(width, height);
  return Math.max(512, Math.min(2048, Math.round(longSide / 64) * 64));
}
