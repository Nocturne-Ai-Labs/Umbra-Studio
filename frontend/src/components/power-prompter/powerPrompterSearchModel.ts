import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import type { GlobalSearchSuggestionEntry } from './powerPrompterSupport';

export function buildPowerPrompterGlobalSearchSuggestions(
  cards: PowerPrompterCardDocument['cards']
): GlobalSearchSuggestionEntry[] {
  const byKey = new Map<string, GlobalSearchSuggestionEntry>();
  const addSuggestion = (rawValue: unknown, kind: 'prompt' | 'name') => {
    const value = String(rawValue || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!value) return;
    const lower = value.toLowerCase();
    const key = `${kind}:${lower}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byKey.set(key, { key, kind, value, valueLower: lower, count: 1 });
    }
  };

  for (const card of Array.isArray(cards) ? cards : []) {
    const text = String((card as any).text || '');
    if (!text.trim()) continue;
    addSuggestion(text, 'prompt');
    for (const segment of text.split(/[\r\n,]+/g)) {
      const cleaned = String(segment || '').replace(/\s+/g, ' ').trim();
      if (!cleaned) continue;
      addSuggestion(cleaned, 'prompt');
    }
    const variantName = String((card as any).variantName || '').replace(/\s+/g, ' ').trim();
    if (variantName) {
      addSuggestion(variantName, 'name');
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.count !== b.count) return b.count - a.count;
    return a.value.localeCompare(b.value, undefined, { sensitivity: 'base' });
  });
}

export function filterPowerPrompterGlobalSearchSuggestions(
  suggestions: GlobalSearchSuggestionEntry[],
  queryInput: unknown,
  limit = 80
): GlobalSearchSuggestionEntry[] {
  const query = String(queryInput || '').trim().toLowerCase();
  if (!query) return [];
  const scored = (Array.isArray(suggestions) ? suggestions : [])
    .filter((entry) => entry.valueLower.includes(query))
    .map((entry) => ({
      entry,
      rank: entry.valueLower.startsWith(query) ? 0 : 1,
    }))
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.entry.count !== b.entry.count) return b.entry.count - a.entry.count;
      return a.entry.value.localeCompare(b.entry.value, undefined, { sensitivity: 'base' });
    })
    .map((row) => row.entry);
  return scored.slice(0, Math.max(1, Math.floor(Number(limit) || 80)));
}
