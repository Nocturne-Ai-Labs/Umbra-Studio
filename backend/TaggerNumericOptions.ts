export function parseTaggerNumber(value: unknown, fallback: number, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' && typeof value !== 'string') return fallback;
  if (typeof value === 'string' && !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, integer ? Math.floor(parsed) : parsed));
}
