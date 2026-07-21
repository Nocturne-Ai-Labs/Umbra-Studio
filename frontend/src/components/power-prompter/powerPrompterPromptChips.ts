import type { PowerPrompterLoraEntry } from '@/types/powerPrompter';
import { clampQueueSetId, normalizeQueueSetIds } from './queue/queueCore';

export function normalizeSearchChip(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

export function normalizeLoraSyntaxName(rawName: unknown): string {
  return String(rawName || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '');
}

export function parsePromptChipsFromText(rawText: unknown): string[] {
  const source = String(rawText || '');
  if (!source.trim()) return [];
  return source
    .split(',')
    .map((entry) => normalizeSearchChip(entry))
    .filter((entry) => entry.length > 0);
}

export function normalizeLoraChipToken(rawChip: unknown): string {
  const token = String(rawChip || '').trim();
  if (!token) return '';
  const match = token.match(/^<\s*lora\s*:\s*([^:>]+?)\s*:\s*[-+]?(?:\d+\.?\d*|\.\d+)(?:\s*:\s*[-+]?(?:\d+\.?\d*|\.\d+))?\s*>$/i);
  if (!match) return '';
  const normalizedName = normalizeLoraSyntaxName(match[1]);
  if (!normalizedName) return '';
  return normalizeSearchChip(`<lora:${normalizedName}>`);
}


export function normalizeLoraQueueSetIds(rawSetIds: unknown, fallbackEnabled = true): number[] {
  return normalizeQueueSetIds(rawSetIds, fallbackEnabled);
}

export function filterLorasForSet(rawLoras: unknown, setId: number): PowerPrompterLoraEntry[] {
  if (!Array.isArray(rawLoras)) return [];
  const targetSetId = clampQueueSetId(setId, 1);
  return rawLoras
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => entry as Partial<PowerPrompterLoraEntry>)
    .filter((entry) => entry.enabled !== false && entry.queueEnabled !== false)
    .map((entry) => {
      const normalizedSetIds = normalizeLoraQueueSetIds(entry.queueSetIds, entry.queueEnabled !== false);
      return {
        id: String(entry.id || '').trim(),
        name: String(entry.name || '').trim(),
        strengthModel: Number(entry.strengthModel),
        strengthClip: Number(entry.strengthClip),
        enabled: entry.enabled !== false,
        queueEnabled: normalizedSetIds.length > 0,
        queueSetIds: normalizedSetIds,
      } as PowerPrompterLoraEntry;
    })
    .filter((entry) => entry.name.length > 0 && entry.queueEnabled !== false)
    .filter((entry) => normalizeLoraQueueSetIds(entry.queueSetIds, false).includes(targetSetId));
}
