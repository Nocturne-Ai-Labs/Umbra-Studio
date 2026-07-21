import type { PowerPrompterCardNode } from '@/types/powerPrompter';
import { sortPowerPrompterCards } from '@/lib/powerPrompter';
import { buildPowerPrompterActivePromptBlocks } from '@/lib/powerPrompterActivePrompt';
import { clampQueueSetId } from './queueCore';
import type {
  QueueManagerSequenceMode,
  QueuePromptBlock,
  QueueRequestGroup,
  QueueRequestMeta,
  QueueStackItem,
} from './queueCore';

export function buildQueuePromptBlocksForItem(
  item: QueueStackItem,
  cards: PowerPrompterCardNode[],
  requestMeta?: QueueRequestMeta | null,
  setIdInput?: number
): QueuePromptBlock[] {
  const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
  const promptEntry = requestMeta?.promptEntries?.[promptIndex] || null;
  const cardByVariantKey = new Map<string, PowerPrompterCardNode>();
  const variantsBySlot = new Map<string, PowerPrompterCardNode[]>();
  sortPowerPrompterCards(cards).forEach((card, index) => {
    const slotId = String(card.slotId || '').trim();
    const variantId = String(card.id || '').trim() || `${slotId}-${index}`;
    if (slotId && variantId) cardByVariantKey.set(`${slotId}:${variantId}`, card);
    if (slotId) {
      const variants = variantsBySlot.get(slotId) || [];
      variants.push(card);
      variantsBySlot.set(slotId, variants);
    }
  });

  const tokenBlocks = Array.isArray(promptEntry?.tokens)
    ? promptEntry.tokens
      .map((token): QueuePromptBlock | null => {
        const slotId = String(token?.slotId || '').trim();
        const variantId = String(token?.variantId || '').trim();
        if (!slotId || !variantId) return null;
        const card = cardByVariantKey.get(`${slotId}:${variantId}`);
        if (!card) return null;
        const variants = variantsBySlot.get(slotId) || [];
        const variantIndex = Math.max(0, variants.findIndex((entry) => String(entry.id || '').trim() === variantId));
        const label = String(card.label || '').trim() || 'Card';
        const variantLabel = String(card.variantName || '').trim() || `Position ${variantIndex + 1}`;
        const promptText = String(card.text || '').trim();
        if (!promptText && (card as any).skipVariant !== true) return null;
        return {
          slotId,
          variantId,
          cardLabel: label,
          variantLabel: (card as any).skipVariant === true && !variantLabel ? 'Skip' : variantLabel,
          promptText: (card as any).skipVariant === true ? '(skip)' : promptText,
        };
      })
      .filter((entry): entry is QueuePromptBlock => !!entry)
    : [];
  if (tokenBlocks.length > 0) return tokenBlocks;
  return buildPowerPrompterActivePromptBlocks(cards, item.prompt, {
    setId: clampQueueSetId(setIdInput ?? requestMeta?.setId ?? 1),
  });
}

export function buildSequencedPendingPromptOrderForGroup(
  group: QueueRequestGroup,
  mode: Exclude<QueueManagerSequenceMode, 'default'>,
  getBlocksForItem: (item: QueueStackItem, setId?: number) => QueuePromptBlock[]
): number[] {
  const modifierPattern = /\b(cloth|clothes|clothing|outfit|dress|shirt|skirt|pants|topless|bottomless|nude|naked|undress|action|pose|position|sex|expression|face|location|setting|effect|cum)\b/i;
  const normalizePart = (value: unknown) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const isSkipText = (value: unknown) => {
    const normalized = normalizePart(value);
    return normalized.length <= 0 || normalized === ',' || normalized === 'skip' || normalized === '(skip)';
  };
  const pendingEntries = group.items
    .filter((item) => !item.exiting && item.status === 'pending')
    .map((item, originalIndex) => {
      const blocks = getBlocksForItem(item, group.setId);
      const modifierBlocks = blocks.filter((block) => modifierPattern.test(`${block.cardLabel} ${block.variantLabel} ${block.promptText}`));
      const primaryBlocks = modifierBlocks.length > 0 ? modifierBlocks : blocks;
      const primarySignature = primaryBlocks
        .map((block) => {
          const text = normalizePart(block.promptText);
          const neutral = isSkipText(text) ? '0' : '1';
          return `${normalizePart(block.cardLabel)}=${neutral}:${normalizePart(block.variantLabel || text)}`;
        })
        .join('|');
      const fullSignature = blocks
        .map((block) => `${normalizePart(block.cardLabel)}=${isSkipText(block.promptText) ? '0:skip' : `1:${normalizePart(block.variantLabel || block.promptText)}`}`)
        .join('|');
      return {
        item,
        originalIndex,
        key: `${primarySignature || '0'}||${normalizePart(item.styleName || item.styleFolderName)}||${fullSignature || normalizePart(item.prompt)}`,
      };
    })
    .sort((left, right) => {
      const keyDelta = left.key.localeCompare(right.key, undefined, { numeric: true, sensitivity: 'base' });
      if (keyDelta !== 0) return keyDelta;
      return left.originalIndex - right.originalIndex;
    });
  if (mode === 'similar') {
    return pendingEntries.map((entry) => Math.max(0, Math.floor(Number(entry.item.promptIndex) || 0)));
  }
  const buckets = pendingEntries.reduce<Array<typeof pendingEntries>>((acc, entry) => {
    const bucket = acc.find((candidate) => candidate[0]?.key === entry.key);
    if (bucket) bucket.push(entry);
    else acc.push([entry]);
    return acc;
  }, []);
  const takeCount = mode === 'balanced' ? 2 : 1;
  const ordered: typeof pendingEntries = [];
  let remaining = buckets.reduce((sum, bucket) => sum + bucket.length, 0);
  while (remaining > 0) {
    for (const bucket of buckets) {
      const chunk = bucket.splice(0, takeCount);
      if (chunk.length <= 0) continue;
      ordered.push(...chunk);
      remaining -= chunk.length;
    }
  }
  return ordered.map((entry) => Math.max(0, Math.floor(Number(entry.item.promptIndex) || 0)));
}

export function captureDefaultPromptItemOrder(group: QueueRequestGroup): string[] {
  return group.items
    .slice()
    .sort((left, right) => left.promptIndex - right.promptIndex)
    .map((item) => String(item.id || '').trim())
    .filter(Boolean);
}

export function buildDefaultPendingPromptOrderForGroup(
  group: QueueRequestGroup,
  defaultOrder: string[]
): number[] {
  return group.items
    .filter((item) => !item.exiting && item.status === 'pending')
    .slice()
    .sort((left, right) => {
      const leftRank = defaultOrder.indexOf(String(left.id || '').trim());
      const rightRank = defaultOrder.indexOf(String(right.id || '').trim());
      const leftResolvedRank = leftRank >= 0 ? leftRank : Number.MAX_SAFE_INTEGER;
      const rightResolvedRank = rightRank >= 0 ? rightRank : Number.MAX_SAFE_INTEGER;
      if (leftResolvedRank !== rightResolvedRank) return leftResolvedRank - rightResolvedRank;
      return left.promptIndex - right.promptIndex;
    })
    .map((item) => Math.max(0, Math.floor(Number(item.promptIndex) || 0)));
}

export function mergePendingPromptOrderIntoGroupOrder(group: QueueRequestGroup, pendingPromptOrder: number[]): number[] {
  const orderedItems = group.items
    .filter((item) => !item.exiting)
    .slice()
    .sort((left, right) => left.promptIndex - right.promptIndex);
  const pendingSet = new Set(
    orderedItems
      .filter((item) => item.status === 'pending')
      .map((item) => Math.max(0, Math.floor(Number(item.promptIndex) || 0)))
  );
  const pendingQueue = pendingPromptOrder.filter((index) => pendingSet.has(index));
  let pendingCursor = 0;
  return orderedItems.map((item) => {
    const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
    if (item.status !== 'pending') return promptIndex;
    const nextIndex = pendingQueue[pendingCursor];
    pendingCursor += 1;
    return nextIndex ?? promptIndex;
  });
}
