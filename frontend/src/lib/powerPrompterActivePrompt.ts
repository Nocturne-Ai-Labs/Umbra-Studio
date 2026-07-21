import type { PowerPrompterCardNode, PowerPrompterCardType } from '@/types/powerPrompter';
import { POWER_PROMPTER_MAX_QUEUE_SETS } from '@/lib/powerPrompter';

interface ActivePromptSlot {
  slotId: string;
  type: PowerPrompterCardType;
  label: string;
  variants: PowerPrompterCardNode[];
}

export interface PowerPrompterActivePromptBlock {
  slotId: string;
  variantId: string;
  cardLabel: string;
  variantLabel: string;
  promptText: string;
}

export interface PowerPrompterVisiblePromptBlock extends PowerPrompterActivePromptBlock {
  visibleText: string;
}

function normalizeCardType(rawType: unknown): PowerPrompterCardType {
  const type = String(rawType || '').trim().toLowerCase();
  if (
    type === 'character'
    || type === 'location'
    || type === 'expression'
    || type === 'action'
    || type === 'style'
    || type === 'custom'
  ) {
    return type;
  }
  return 'custom';
}

function cardTypeLabel(type: PowerPrompterCardType) {
  switch (type) {
    case 'character':
      return 'Character';
    case 'location':
      return 'Location';
    case 'expression':
      return 'Expression';
    case 'action':
      return 'Action';
    case 'style':
      return 'Style';
    default:
      return 'Custom';
  }
}

function normalizeQueueSetIds(rawSets: unknown, fallbackEnabled = true): number[] {
  if (!Array.isArray(rawSets)) return fallbackEnabled ? [1] : [];
  const normalized = Array.from(new Set(
    rawSets
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= POWER_PROMPTER_MAX_QUEUE_SETS)
  )).sort((a, b) => a - b);
  if (normalized.length === 0 && fallbackEnabled) return [1];
  return normalized;
}

function normalizeCardQueueSetIds(card: Pick<PowerPrompterCardNode, 'queueSetIds' | 'queueEnabled'>): number[] {
  const queueSetIds = normalizeQueueSetIds(card.queueSetIds, false);
  if (Array.isArray(card.queueSetIds) || queueSetIds.length > 0 || card.queueEnabled === false) return queueSetIds;
  return [1];
}

function normalizeVariantName(rawName: unknown): string {
  return String(rawName || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function buildSlots(cards: PowerPrompterCardNode[]): ActivePromptSlot[] {
  const normalized = [...(cards || [])]
    .sort((a, b) => {
      const orderDelta = Number(a.order) - Number(b.order);
      if (orderDelta !== 0) return orderDelta;
      return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
    })
    .map((card, idx) => {
      const type = normalizeCardType(card.type);
      const label = String(card.label || '').trim() || cardTypeLabel(type);
      const queueSetIds = normalizeCardQueueSetIds(card);
      return {
        ...card,
        id: String(card.id || '').trim() || `pp-card-${idx + 1}`,
        slotId: String(card.slotId || '').trim() || `${type}-${label.toLowerCase().replace(/\s+/g, '-')}`,
        type,
        label,
        variantName: normalizeVariantName(card.variantName),
        text: String(card.text || ''),
        queueSetIds,
        queueEnabled: queueSetIds.length > 0,
        order: Number.isFinite(Number(card.order)) ? Number(card.order) : idx,
      };
    });

  const slots: ActivePromptSlot[] = [];
  const byId = new Map<string, ActivePromptSlot>();
  for (const card of normalized) {
    const slotId = String(card.slotId || '').trim();
    let slot = byId.get(slotId);
    if (!slot) {
      slot = {
        slotId,
        type: normalizeCardType(card.type),
        label: String(card.label || '').trim() || cardTypeLabel(normalizeCardType(card.type)),
        variants: [],
      };
      byId.set(slotId, slot);
      slots.push(slot);
    }
    slot.variants.push(card);
  }
  return slots;
}

function tokenizePromptForMatch(rawPrompt: string): string[] {
  return String(rawPrompt || '')
    .toLowerCase()
    .split(/\s*,\s*/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function promptTokenPartsMatch(promptTokens: string[], tokenParts: string[]): boolean {
  if (!tokenParts.length) return false;
  return tokenParts.every((part) => promptTokens.includes(part));
}

function getVariantFallbackLabel(variant: PowerPrompterCardNode, index: number): string {
  const normalizedName = normalizeVariantName(variant.variantName);
  return normalizedName || `Position ${Math.max(0, Math.floor(index)) + 1}`;
}

export function buildPowerPrompterActivePromptBlocks(
  cards: PowerPrompterCardNode[],
  promptText: string,
  options?: { setId?: number | null }
): PowerPrompterActivePromptBlock[] {
  const slots = buildSlots(cards);
  const promptTokens = tokenizePromptForMatch(promptText);
  if (promptTokens.length <= 0) return [];
  const setId = typeof options?.setId === 'number' && Number.isFinite(options.setId)
    ? Math.max(1, Math.floor(options.setId))
    : null;

  return slots
    .map((slot) => {
      const candidates = slot.variants
        .map((variant, index) => {
          const text = String(variant.text || '').trim();
          return {
            variant,
            index,
            text,
            tokenParts: tokenizePromptForMatch(text),
            setIds: normalizeQueueSetIds(variant.queueSetIds, false),
          };
        })
        .filter((entry) => entry.text.length > 0);
      if (candidates.length <= 0) return null;

      const matching = candidates.filter((entry) => promptTokenPartsMatch(promptTokens, entry.tokenParts));
      if (matching.length <= 0) return null;
      const ranked = matching
        .slice()
        .sort((left, right) => {
          const leftSetScore = setId !== null && left.setIds.includes(setId) ? 1 : 0;
          const rightSetScore = setId !== null && right.setIds.includes(setId) ? 1 : 0;
          if (leftSetScore !== rightSetScore) return rightSetScore - leftSetScore;
          if (left.tokenParts.length !== right.tokenParts.length) return right.tokenParts.length - left.tokenParts.length;
          if (left.text.length !== right.text.length) return right.text.length - left.text.length;
          return left.index - right.index;
        });
      const selected = ranked[0];
      if (!selected) return null;

      return {
        slotId: slot.slotId,
        variantId: String(selected.variant.id || '').trim() || `${slot.slotId}-${selected.index}`,
        cardLabel: String(slot.label || '').trim() || cardTypeLabel(slot.type),
        variantLabel: getVariantFallbackLabel(selected.variant, selected.index),
        promptText: selected.text,
      } satisfies PowerPrompterActivePromptBlock;
    })
    .filter((entry): entry is PowerPrompterActivePromptBlock => !!entry);
}

export function applyVisiblePromptTextToBlocks(
  blocks: PowerPrompterActivePromptBlock[],
  visiblePromptText: string
): PowerPrompterVisiblePromptBlock[] {
  const source = String(visiblePromptText || '');
  if (!source) return [];
  let cursor = 0;
  const visibleBlocks: PowerPrompterVisiblePromptBlock[] = [];
  for (const block of blocks) {
    if (cursor >= source.length) break;
    const remainingChars = source.length - cursor;
    const visibleCharCount = Math.max(0, Math.min(block.promptText.length, remainingChars));
    const visibleText = block.promptText.slice(0, visibleCharCount);
    if (visibleText) {
      visibleBlocks.push({
        ...block,
        visibleText,
      });
    }
    cursor += visibleCharCount;
    while (cursor < source.length && /[\s,]/.test(source.charAt(cursor))) {
      cursor += 1;
    }
  }
  return visibleBlocks;
}
