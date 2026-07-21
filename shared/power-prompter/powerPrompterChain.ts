import type {
  PowerPrompterCardNode,
  PowerPrompterCardType,
} from './types';
import { sortPowerPrompterCards } from './powerPrompter';
import {
  normalizeQueueCycleWeights,
  normalizeQueueSetIds,
  normalizeRandomSetIds,
} from './queueCore';

export interface PrompterChainSlot {
  slotId: string;
  type: PowerPrompterCardType;
  label: string;
  variants: PowerPrompterCardNode[];
}

export function createCardId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pp-card-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createSlotId(type: PowerPrompterCardType, label: string): string {
  const normalizedLabel = String(label || type)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || String(type);
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `pp-slot-${normalizedLabel}-${crypto.randomUUID()}`;
  }
  return `pp-slot-${normalizedLabel}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeVariantTag(rawTag: unknown): string {
  return String(rawTag || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 32);
}

export function normalizeVariantTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const rawTag of rawTags) {
    const tag = normalizeVariantTag(rawTag);
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(tag);
    if (normalized.length >= 16) break;
  }
  return normalized;
}

export function normalizeChainLinks(rawLinks: unknown, selfId = ''): string[] {
  if (!Array.isArray(rawLinks)) return [];
  const selfKey = String(selfId || '').trim();
  return Array.from(new Set(
    rawLinks
      .map((entry) => String(entry || '').trim())
      .filter((entry) => entry.length > 0 && entry !== selfKey)
  ));
}

export function normalizeBlockLinks(rawLinks: unknown, selfId = ''): string[] {
  return normalizeChainLinks(rawLinks, selfId);
}

function normalizeCardQueueSetIds(card: Pick<PowerPrompterCardNode, 'queueSetIds' | 'queueEnabled'>, fallbackSetId = 1): number[] {
  const queueSetIds = normalizeQueueSetIds(card.queueSetIds, false);
  if (Array.isArray(card.queueSetIds) || queueSetIds.length > 0 || card.queueEnabled === false) return queueSetIds;
  return normalizeQueueSetIds([fallbackSetId], true);
}

export function normalizeChainCards(cards: PowerPrompterCardNode[]): PowerPrompterCardNode[] {
  const now = new Date().toISOString();
  return sortPowerPrompterCards(cards).map((card, idx) => {
    const label = String(card.label || '').trim() || (card.type === 'custom' ? 'Custom' : card.type[0].toUpperCase() + card.type.slice(1));
    const queueSetIds = normalizeCardQueueSetIds(card);
    const randomSetIds = normalizeRandomSetIds(card.randomSetIds);
    const queueCycleWeights = normalizeQueueCycleWeights((card as any).queueCycleWeights, queueSetIds);
    const id = String(card.id || '').trim() || createCardId();
    return {
      ...card,
      id,
      slotId: String(card.slotId || '').trim() || createSlotId(card.type, label),
      label,
      variantName: String(card.variantName || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      variantTags: normalizeVariantTags((card as any).variantTags),
      skipVariant: (card as any).skipVariant === true,
      text: String(card.text || ''),
      randomEnabled: card.randomEnabled === true,
      randomSetIds,
      queueSetIds,
      queueCycleWeights,
      chainLinks: normalizeChainLinks((card as any).chainLinks, id),
      blockLinks: normalizeBlockLinks((card as any).blockLinks, id),
      queueEnabled: queueSetIds.length > 0,
      order: idx,
      createdAt: String(card.createdAt || now),
      updatedAt: String(card.updatedAt || now),
    };
  });
}

export function buildChainSlots(cards: PowerPrompterCardNode[]): PrompterChainSlot[] {
  const normalized = normalizeChainCards(cards);
  const slots: PrompterChainSlot[] = [];
  const byId = new Map<string, PrompterChainSlot>();

  for (const card of normalized) {
    const slotId = String(card.slotId || '').trim() || createSlotId(card.type, card.label);
    let slot = byId.get(slotId);
    if (!slot) {
      slot = {
        slotId,
        type: card.type,
        label: card.label,
        variants: [],
      };
      byId.set(slotId, slot);
      slots.push(slot);
    }
    slot.variants.push({ ...card, slotId });
  }

  for (const slot of slots) {
    slot.variants = sortPowerPrompterCards(slot.variants);
  }
  return slots;
}

export function flattenChainSlots(slots: PrompterChainSlot[]): PowerPrompterCardNode[] {
  const now = new Date().toISOString();
  const flattened: PowerPrompterCardNode[] = [];
  for (const slot of slots) {
    for (const variant of slot.variants) {
      const queueSetIds = normalizeCardQueueSetIds(variant);
      const randomSetIds = normalizeRandomSetIds(variant.randomSetIds);
      const queueCycleWeights = normalizeQueueCycleWeights((variant as any).queueCycleWeights, queueSetIds);
      const id = String(variant.id || '').trim() || createCardId();
      flattened.push({
        ...variant,
        id,
        slotId: String(slot.slotId || '').trim() || createSlotId(slot.type, slot.label),
        type: slot.type,
      label: String(slot.label || '').trim() || (slot.type === 'custom' ? 'Custom' : slot.type[0].toUpperCase() + slot.type.slice(1)),
      variantName: String(variant.variantName || '').trim().replace(/\s+/g, ' ').slice(0, 80),
      variantTags: normalizeVariantTags((variant as any).variantTags),
      skipVariant: (variant as any).skipVariant === true,
      text: String(variant.text || ''),
        randomEnabled: variant.randomEnabled === true,
        randomSetIds,
        queueSetIds,
        queueCycleWeights,
        chainLinks: normalizeChainLinks((variant as any).chainLinks, id),
        blockLinks: normalizeBlockLinks((variant as any).blockLinks, id),
        queueEnabled: queueSetIds.length > 0,
        createdAt: String(variant.createdAt || now),
        updatedAt: String(variant.updatedAt || now),
        order: flattened.length,
      });
    }
  }
  return flattened;
}
