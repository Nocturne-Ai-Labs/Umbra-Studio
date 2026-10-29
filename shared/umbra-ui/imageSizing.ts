export const IMAGE_MEGAPIXEL_PRESETS = [1, 1.25, 1.5, 2, 3, 4] as const;
export const IMAGE_ASPECT_RATIOS = ['1:1', '3:4', '2:3', '4:5', '9:16', '4:3', '3:2', '5:4', '16:9', '21:9', '2:1', '1:2'] as const;
export interface ImageSizingBounds { step?: number; minimumWidth?: number; minimumHeight?: number; maximumWidth?: number; maximumHeight?: number }
export function imageMegapixels(width: number, height: number): number { return width * height / 1_000_000; }
export function imageAspectRatio(width: number, height: number): string {
  if (!(width > 0 && height > 0)) return '1:1';
  let best = 'custom', error = Infinity;
  for (const ratio of IMAGE_ASPECT_RATIOS) {
    const [w, h] = ratio.split(':').map(Number), distance = Math.abs(Math.log((width / height) / (w / h)));
    if (distance < error) { error = distance; best = ratio; }
  }
  return error < 0.025 ? best : 'custom';
}
export function inferImageMegapixels(width: number, height: number): number {
  const actual = imageMegapixels(width, height);
  if (!Number.isFinite(actual) || actual <= 0) return 1;
  const nearest = IMAGE_MEGAPIXEL_PRESETS.reduce<number>((best, value) => Math.abs(value - actual) < Math.abs(best - actual) ? value : best, 1);
  return Math.abs(nearest - actual) / nearest < 0.015 ? nearest : Math.round(actual * 1000) / 1000;
}
/** Pixel area stays constant across ratios. Only declared pipeline bounds apply. */
export function resolveImageMegapixels(megapixels: number, ratio: number, bounds: ImageSizingBounds = {}) {
  if (!Number.isFinite(megapixels) || megapixels <= 0 || !Number.isFinite(ratio) || ratio <= 0) throw new Error('Choose a positive pixel budget and aspect ratio.');
  const step = Math.max(1, Math.round(bounds.step || 8));
  const align = (value: number, minimum = 64, maximum = Number.MAX_SAFE_INTEGER) => {
    const min = Math.ceil(minimum / step) * step, max = Math.floor(maximum / step) * step;
    if (max < min) throw new Error('This pipeline has incompatible dimension limits.');
    const result = Math.max(min, Math.min(max, Math.round(value / step) * step));
    if (!Number.isSafeInteger(result)) throw new Error('Choose a finite image size.');
    return result;
  };
  return {
    width: align(Math.sqrt(megapixels * 1_000_000 * ratio), bounds.minimumWidth, bounds.maximumWidth),
    height: align(Math.sqrt(megapixels * 1_000_000 / ratio), bounds.minimumHeight, bounds.maximumHeight),
  };
}
