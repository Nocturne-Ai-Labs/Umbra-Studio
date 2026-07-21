import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import {
  createDefaultPowerPrompterCardDocument,
  importLegacyPromptToCardDocument,
  normalizePowerPrompterCardDocument,
  normalizePowerPrompterGenerationControls,
} from '@/lib/powerPrompter';
import {
  createSlotId,
  normalizeBlockLinks,
  normalizeChainCards,
  normalizeChainLinks,
  normalizeVariantTags,
} from '@/lib/powerPrompterChain';
import { clampQueueSetId, normalizeQueueCycleWeights, normalizeQueueSetIds, normalizeRandomSetIds } from './queue/queueCore';
import { composeActivePromptFromCards } from './queue/queuePromptBuilder';

async function fetchTextWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  if (typeof AbortController === 'undefined') {
    return fetch(url);
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

export function getCardDocSignature(document: PowerPrompterCardDocument | null): string {
  if (!document) return '';
  const generation = normalizePowerPrompterGenerationControls(document.generation);
  const payload = document.cards
    .map((card) => ({
      id: card.id,
      slotId: String(card.slotId || '').trim() || createSlotId(card.type, card.label),
      type: card.type,
      label: card.label,
      variantName: String(card.variantName || '').trim(),
      variantTags: normalizeVariantTags((card as any).variantTags),
      skipVariant: (card as any).skipVariant === true,
      text: card.text,
      randomEnabled: card.randomEnabled === true,
      randomSetIds: normalizeRandomSetIds(card.randomSetIds),
      queueEnabled: card.queueEnabled !== false,
      queueSetIds: normalizeQueueSetIds(card.queueSetIds, false),
      queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, normalizeQueueSetIds(card.queueSetIds, false)),
      chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
      blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
      order: card.order,
    }))
    .sort((a, b) => a.order - b.order);
  const deletedCardGroups = document.deletedCardGroups && typeof document.deletedCardGroups === 'object'
    ? Object.values(document.deletedCardGroups)
      .map((group) => ({
        key: String(group?.key || '').trim(),
        type: String(group?.type || '').trim(),
        label: String(group?.label || '').trim(),
        cards: Array.isArray(group?.cards)
          ? group.cards.map((card) => ({
            id: String(card.id || '').trim(),
            type: String(card.type || '').trim(),
            label: String(card.label || '').trim(),
            variantName: String(card.variantName || '').trim(),
            variantTags: normalizeVariantTags((card as any).variantTags),
            skipVariant: (card as any).skipVariant === true,
            text: String(card.text || ''),
            randomEnabled: card.randomEnabled === true,
            randomSetIds: normalizeRandomSetIds(card.randomSetIds),
            queueEnabled: card.queueEnabled !== false,
            queueSetIds: normalizeQueueSetIds(card.queueSetIds, false),
            queueCycleWeights: normalizeQueueCycleWeights((card as any).queueCycleWeights, normalizeQueueSetIds(card.queueSetIds, false)),
            chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
            blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
            order: Number.isFinite(Number(card.order)) ? Math.max(0, Math.floor(Number(card.order))) : 0,
          }))
          : [],
      }))
      .sort((a, b) => a.key.localeCompare(b.key))
    : [];
  return JSON.stringify({
    activeQueueSet: clampQueueSetId(document.activeQueueSet),
    styleSeedMode: String((document as any).styleSeedMode || 'same') === 'different' ? 'different' : 'same',
    generation,
    cards: payload,
    deletedCardGroups,
  });
}

export async function readCardDocument(filePath: string, fallbackText: string): Promise<{
  document: PowerPrompterCardDocument;
  composedText: string;
  fromSidecar: boolean;
  healed: boolean;
  healedPersisted: boolean;
}> {
  let rawFallbackText = String(fallbackText || '');
  try {
    const res = await fetchTextWithTimeout(`/api/powerprompter/cards?file=${encodeURIComponent(filePath)}`);
    if (res.ok) {
      const payload = await res.json();
      const normalized = normalizePowerPrompterCardDocument(payload?.document, filePath);
      const hydrated = {
        ...normalized,
        cards: normalizeChainCards(normalized.cards),
      };
      return {
        document: hydrated,
        composedText: composeActivePromptFromCards(hydrated.cards, hydrated.activeQueueSet),
        fromSidecar: Boolean(payload?.fromSidecar),
        healed: payload?.healed === true,
        healedPersisted: payload?.healed === true,
      };
    }
  } catch (error) {
    console.error('Failed to load Power Prompter card document', error);
  }

  if (String(filePath || '').toLowerCase().endsWith('.ppcards.json')) {
    if (!rawFallbackText.trim()) {
      try {
        const rawRes = await fetchTextWithTimeout(`/api/fs/read?path=${encodeURIComponent(filePath)}`);
        if (rawRes.ok) {
          rawFallbackText = await rawRes.text();
        }
      } catch (error) {
        console.error('Failed to load raw Power Prompter card file', error);
      }
    }
    try {
      const parsed = JSON.parse((rawFallbackText || '{}').replace(/^\uFEFF/, ''));
      const normalized = normalizePowerPrompterCardDocument(parsed, filePath);
      const hydrated = {
        ...normalized,
        cards: normalizeChainCards(normalized.cards),
      };
      const canonical = JSON.stringify(hydrated, null, 2).replace(/\r\n/g, '\n').trim();
      const rawCanonical = rawFallbackText.replace(/\r\n/g, '\n').trim();
      const healed = canonical !== rawCanonical;
      return {
        document: hydrated,
        composedText: composeActivePromptFromCards(hydrated.cards, hydrated.activeQueueSet),
        fromSidecar: false,
        healed,
        healedPersisted: false,
      };
    } catch {
      const fallback = createDefaultPowerPrompterCardDocument(filePath);
      return {
        document: {
          ...fallback,
          cards: normalizeChainCards(fallback.cards),
        },
        composedText: '',
        fromSidecar: false,
        healed: false,
        healedPersisted: false,
      };
    }
  }

  const imported = importLegacyPromptToCardDocument(fallbackText, filePath);
  const hydratedImported = {
    ...imported,
    cards: normalizeChainCards(imported.cards),
  };
  return {
    document: hydratedImported,
    composedText: composeActivePromptFromCards(hydratedImported.cards, hydratedImported.activeQueueSet),
    fromSidecar: false,
    healed: false,
    healedPersisted: false,
  };
}
