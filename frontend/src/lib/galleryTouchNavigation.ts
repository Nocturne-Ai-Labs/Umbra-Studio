export interface GalleryTapSample {
  x: number;
  y: number;
  at: number;
}

export function isGalleryDoubleTap(
  previous: GalleryTapSample | null,
  current: GalleryTapSample,
  options: {
    maxDelayMs?: number;
    maxDistancePx?: number;
  } = {},
): boolean {
  if (!previous) return false;
  const maxDelayMs = options.maxDelayMs ?? 340;
  const maxDistancePx = options.maxDistancePx ?? 36;
  const delayMs = current.at - previous.at;
  if (delayMs <= 0 || delayMs > maxDelayMs) return false;
  return Math.hypot(current.x - previous.x, current.y - previous.y) <= maxDistancePx;
}
