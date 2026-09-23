export function normalizeQueueSetOrders(
  rawOrders: unknown,
  allowedSetIds: number[],
  fallbackOrder: number,
): Record<string, number> {
  const source = rawOrders && typeof rawOrders === 'object' && !Array.isArray(rawOrders)
    ? rawOrders as Record<string, unknown>
    : {};
  const normalized: Record<string, number> = {};
  const fallback = Math.max(0, Math.floor(Number(fallbackOrder) || 0));
  for (const setId of allowedSetIds) {
    const order = Math.floor(Number(source[String(setId)]));
    normalized[String(setId)] = Number.isFinite(order) && order >= 0 ? order : fallback;
  }
  return normalized;
}
