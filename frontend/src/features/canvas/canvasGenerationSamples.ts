export const UMBRA_CANVAS_MAX_SAMPLES = 8;

export function resolveUmbraCanvasSampleCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isFinite(count)) return 1;
  return Math.max(1, Math.min(UMBRA_CANVAS_MAX_SAMPLES, Math.round(count)));
}
