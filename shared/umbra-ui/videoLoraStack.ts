export type UmbraVideoLoraFamily = 'wan22' | 'ltx23' | 'ltx25' | 'minimax_h3';
export type UmbraWanLoraStage = 'both' | 'high' | 'low';

export interface UmbraVideoLoraEntry {
  id: string;
  family: UmbraVideoLoraFamily;
  name: string;
  strength: number;
  enabled: boolean;
  wanStage: UmbraWanLoraStage;
}

export function normalizeUmbraVideoLoraStack(value: unknown): UmbraVideoLoraEntry[] {
  if (!Array.isArray(value)) return [];
  const families = new Set<UmbraVideoLoraFamily>(['wan22', 'ltx23', 'ltx25', 'minimax_h3']);
  const counts = new Map<UmbraVideoLoraFamily, number>();
  const result: UmbraVideoLoraEntry[] = [];
  for (const [index, raw] of value.slice(0, 128).entries()) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const family = item.family as UmbraVideoLoraFamily;
    if (!families.has(family) || (counts.get(family) || 0) >= 8) continue;
    const strength = Number(item.strength);
    const stage = String(item.wanStage || 'both');
    result.push({
      id: String(item.id || `video-lora-${index}`).slice(0, 100),
      family,
      name: String(item.name || '').trim().replace(/\\/g, '/').slice(0, 500),
      strength: Number.isFinite(strength) ? Math.max(-10, Math.min(10, strength)) : 1,
      enabled: item.enabled !== false,
      wanStage: stage === 'high' || stage === 'low' ? stage : 'both',
    });
    counts.set(family, (counts.get(family) || 0) + 1);
  }
  return result;
}
