import type {
  PowerPrompterCardDocument,
  PowerPrompterCardNode,
  PowerPrompterCardType,
  PowerPrompterQueueTraversalMode,
} from '@/types/powerPrompter';
import {
  getQueueCycleWeightForSet,
  normalizePowerPrompterGenerationControls,
  normalizePowerPrompterPromptText,
  normalizeQueueTraversalRole,
  POWER_PROMPTER_MAX_QUEUE_SETS,
} from '@/lib/powerPrompter';
import {
  buildChainSlots,
  normalizeBlockLinks,
  normalizeChainCards,
  normalizeChainLinks,
} from '@/lib/powerPrompterChain';
import {
  clampQueueSetId,
  normalizeQueueDiversity,
  normalizeQueuePromptLimit,
  normalizeQueueSetIds,
  normalizeQueueTraversalMode,
  resolveQueueTraversalMode,
  stableShuffleQueueTokens,
} from './queueCore';
import type {
  PowerPrompterQueueMode,
  QueuePromptBuildEntry,
  QueuePromptPreviewEntry,
  QueuePromptStyleMeta,
  QueuePromptToken,
} from './queueCore';

const QUEUE_TRAVERSAL_ROLE_RANK = {
  hold: 0,
  cycle: 1,
  fast: 2,
} as const;


export function resolveSeedForQueuePromptGroup(
  generation: ReturnType<typeof normalizePowerPrompterGenerationControls>,
  groupIndex: number,
  shuffleSeed: unknown
): number {
  const baseSeed = Math.max(0, Math.floor(Number(generation.seed) || 0));
  const mode = String(generation.controlAfterGenerate || 'fixed').trim().toLowerCase();
  const normalizedGroupIndex = Math.max(0, Math.floor(Number(groupIndex) || 0));
  const maxSeed = Number.MAX_SAFE_INTEGER;
  if (mode === 'increment') {
    return Math.max(0, Math.min(maxSeed, baseSeed + normalizedGroupIndex));
  }
  if (mode === 'decrement') {
    return Math.max(0, baseSeed - normalizedGroupIndex);
  }
  if (mode === 'randomize') {
    const salt = `${Number(shuffleSeed) || Date.now()}|${baseSeed}|${normalizedGroupIndex}`;
    let hash = 2166136261;
    for (let index = 0; index < salt.length; index += 1) {
      hash ^= salt.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return Math.max(1, hash >>> 0);
  }
  return baseSeed;
}

export function selectTopVariantTextForSet(variants: PowerPrompterCardNode[], setId: number): string {
  for (const variant of variants) {
    const text = String(variant.text || '').trim();
    if (!text) continue;
    const sets = normalizeQueueSetIds(variant.queueSetIds, false);
    if (sets.includes(setId)) return text;
  }
  return '';
}

export function filterBlockedTokens<T extends { variantId: string; blockLinks?: string[] }>(tokens: T[]): T[] {
  const selectedIds = new Set(tokens.map((token) => String(token.variantId || '').trim()).filter(Boolean));
  if (selectedIds.size <= 1) return tokens;
  return tokens.filter((token) => !tokens.some((other) => (
    other.variantId !== token.variantId &&
    normalizeBlockLinks(other.blockLinks, other.variantId).includes(token.variantId)
  )));
}

export function areChainLinkedTokensAllowed(tokens: Array<{ variantId: string; chainLinks: string[] }>): boolean {
  const selectedIds = new Set(tokens.map((token) => String(token.variantId || '').trim()).filter(Boolean));
  if (selectedIds.size <= 0) return true;
  return tokens.every((token) => (
    normalizeChainLinks(token.chainLinks, token.variantId).every((linkedId) => selectedIds.has(linkedId))
  ));
}

function applyChainLinkedTokens<T extends { slotId: string; variantId: string; chainLinks?: string[] }>(
  tokens: T[],
  candidateTokens: T[]
): T[] | null {
  const candidatesById = new Map<string, T>();
  for (const candidate of candidateTokens) {
    const variantId = String(candidate.variantId || '').trim();
    if (variantId && !candidatesById.has(variantId)) candidatesById.set(variantId, candidate);
  }
  if (candidatesById.size <= 0) return tokens;

  let resolved = [...tokens];
  let changed = true;
  let guard = 0;
  while (changed && guard < 32) {
    guard += 1;
    changed = false;
    const selectedIds = new Set(resolved.map((token) => String(token.variantId || '').trim()).filter(Boolean));
    for (const token of [...resolved]) {
      const linkedIds = normalizeChainLinks(token.chainLinks, token.variantId);
      for (const linkedId of linkedIds) {
        if (selectedIds.has(linkedId)) continue;
        const linkedToken = candidatesById.get(linkedId);
        if (!linkedToken) continue;
        const targetSlotId = String(linkedToken.slotId || '').trim();
        const existingIndex = resolved.findIndex((entry) => String(entry.slotId || '').trim() === targetSlotId);
        if (existingIndex >= 0) {
          const existing = resolved[existingIndex];
          const existingVariantId = String(existing.variantId || '').trim();
          if (existingVariantId && existingVariantId !== linkedId && normalizeChainLinks(existing.chainLinks, existingVariantId).length > 0) {
            return null;
          }
          resolved[existingIndex] = linkedToken;
        } else {
          resolved.push(linkedToken);
        }
        selectedIds.add(linkedId);
        changed = true;
      }
    }
  }
  return resolved;
}

export function composeActivePromptFromCards(cards: PowerPrompterCardNode[], setIdOverride?: number): string {
  const hasSetOverride = typeof setIdOverride === 'number' && Number.isFinite(setIdOverride);
  const activeSetId = hasSetOverride ? clampQueueSetId(setIdOverride as number) : null;
  const slots = buildChainSlots(cards);
  const selected = slots
    .flatMap((slot) => {
      if (activeSetId === null) {
        const variant = slot.variants[0];
        return variant ? [{
          text: String(variant.text || '').trim(),
          variantId: String(variant.id || '').trim(),
          chainLinks: normalizeChainLinks((variant as any).chainLinks, String(variant.id || '').trim()),
          blockLinks: normalizeBlockLinks((variant as any).blockLinks, String(variant.id || '').trim()),
        }] : [];
      }
      const variant = slot.variants.find((entry) => {
        const text = String(entry.text || '').trim();
        if (!text) return false;
        return normalizeQueueSetIds(entry.queueSetIds, false).includes(activeSetId);
      });
      return variant ? [{
        text: String(variant.text || '').trim(),
        variantId: String(variant.id || '').trim(),
        chainLinks: normalizeChainLinks((variant as any).chainLinks, String(variant.id || '').trim()),
        blockLinks: normalizeBlockLinks((variant as any).blockLinks, String(variant.id || '').trim()),
      }] : [];
    });
  const candidateTokens = slots.flatMap((slot) => slot.variants.flatMap((variant) => {
    const text = String(variant.text || '').trim();
    if (!text) return [];
    if (activeSetId !== null && !normalizeQueueSetIds(variant.queueSetIds, false).includes(activeSetId)) return [];
    return [{
      text,
      variantId: String(variant.id || '').trim(),
      slotId: slot.slotId,
      chainLinks: normalizeChainLinks((variant as any).chainLinks, String(variant.id || '').trim()),
      blockLinks: normalizeBlockLinks((variant as any).blockLinks, String(variant.id || '').trim()),
    }];
  }));
  const linked = applyChainLinkedTokens(selected, candidateTokens) || [];
  const allowed = filterBlockedTokens(linked);
  return normalizePowerPrompterPromptText(
    allowed
    .map((token) => token.text)
    .filter((value) => value.length > 0)
    .join(', ')
  );
}

export function buildQueuePromptsFromCards(
  document: PowerPrompterCardDocument,
  mode: PowerPrompterQueueMode,
  options?: {
    setIdOverride?: number;
    includeAllSets?: boolean;
    traversalMode?: PowerPrompterQueueTraversalMode;
    diversity?: number;
    promptLimit?: number | null;
    shuffleEnabled?: boolean;
    shuffleSeed?: number;
    countOnly?: boolean;
  }
): {
  prompts: string[];
  promptEntries: QueuePromptPreviewEntry[];
  promptSetIds: number[];
  promptOutputSubfolders: string[];
  promptStyleNames: string[];
  promptSeedGroupIds: string[];
  truncated: boolean;
  warnings: string[];
  randomApplied: boolean;
  estimatedPromptCount?: number;
} {
  const slots = buildChainSlots(document.cards);
  const activeSetId = clampQueueSetId(options?.setIdOverride ?? document.activeQueueSet);
  const requestedTraversalMode = normalizeQueueTraversalMode(options?.traversalMode);
  const diversity = normalizeQueueDiversity(options?.diversity, requestedTraversalMode);
  const traversalMode = resolveQueueTraversalMode(requestedTraversalMode, diversity);
  const styleSeedMode = String((document as any).styleSeedMode || 'same') === 'different' ? 'different' : 'same';
  const shuffleEnabled = options?.shuffleEnabled === true;
  const shuffleSeed = Math.max(0, Math.floor(Number(options?.shuffleSeed) || 0));
  const queuePromptCap = normalizeQueuePromptLimit(options?.promptLimit) ?? Number.POSITIVE_INFINITY;
  const slotVariants = slots.map((slot) => ({
    slotId: slot.slotId,
    type: slot.type,
    label: slot.label,
    variants: slot.variants,
  }));
  type QueuePromptSlotTokenGroup = {
    slotEntry: typeof slotVariants[number];
    slotIndex: number;
    tokens: QueuePromptToken[];
  };
  const isStyleSlot = (slot: { type: PowerPrompterCardType; label: string }) => slot.type === 'style';
  const getSlotTraversalRole = (slotEntry: typeof slotVariants[number]) => (
    normalizeQueueTraversalRole(slotEntry.variants[0]?.queueTraversalRole)
  );
  const orderSlotTokenGroupsForTraversal = (groups: QueuePromptSlotTokenGroup[]): QueuePromptSlotTokenGroup[] => (
    [...groups].sort((left, right) => {
      const leftRole = getSlotTraversalRole(left.slotEntry);
      const rightRole = getSlotTraversalRole(right.slotEntry);
      const roleDelta = QUEUE_TRAVERSAL_ROLE_RANK[leftRole] - QUEUE_TRAVERSAL_ROLE_RANK[rightRole];
      if (roleDelta !== 0) return roleDelta;
      return left.slotIndex - right.slotIndex;
    })
  );
  const styleSlotIndices = slotVariants
    .map((slotEntry, slotIndex) => (isStyleSlot(slotEntry) ? slotIndex : -1))
    .filter((slotIndex) => slotIndex >= 0);
  const primaryStyleSlotIndex = styleSlotIndices.length > 0 ? styleSlotIndices[0] : -1;
  const isSkipVariant = (card: PowerPrompterCardNode) => (card as any).skipVariant === true;
  const getNonEmpty = (variants: PowerPrompterCardNode[]) =>
    variants.filter((card) => isSkipVariant(card) || String(card.text || '').trim().length > 0);
  const getSelectedForSet = (variants: PowerPrompterCardNode[], setId: number) => {
    const nonEmpty = getNonEmpty(variants);
    const inSet = nonEmpty.filter((card) => {
      const sets = normalizeQueueSetIds(card.queueSetIds, false);
      return sets.includes(setId);
    });
    return inSet;
  };
  let documentShuffleSalt = '';
  const getDocumentShuffleSalt = () => {
    if (documentShuffleSalt) return documentShuffleSalt;
    documentShuffleSalt = normalizePowerPrompterPromptText(JSON.stringify({
      shuffleSeed,
      activeQueueSet: document.activeQueueSet,
      cards: normalizeChainCards(document.cards).map((card) => ({
        id: card.id,
        text: card.text,
        skipVariant: (card as any).skipVariant === true,
        queueSetIds: normalizeQueueSetIds(card.queueSetIds, false),
      })),
    }));
    return documentShuffleSalt;
  };
  const getSlotTokenGroupsForSet = (setId: number): QueuePromptSlotTokenGroup[] => slotVariants.map((slotEntry, slotIndex) => {
    const tokens = getSelectedForSet(slotEntry.variants, setId)
      .flatMap((card) => {
        const skipVariant = isSkipVariant(card);
        const token = skipVariant ? '' : String(card.text || '').trim();
        if (!token && !skipVariant) return [];
        const repeatCount = traversalMode === 'exhaustive'
          ? 1
          : getQueueCycleWeightForSet((card as any).queueCycleWeights, setId);
        const queueToken: QueuePromptToken = {
          text: token,
          slotId: slotEntry.slotId,
          slotLabel: slotEntry.label,
          slotType: slotEntry.type,
          variantId: String(card.id || '').trim(),
          variantName: String((card as any).variantName || '').trim(),
          chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
          blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
        };
        return Array.from({ length: repeatCount }, () => queueToken);
      });
    const orderedTokens = shuffleEnabled && tokens.length > 1
      ? stableShuffleQueueTokens(tokens, `${getDocumentShuffleSalt()}|set:${setId}|slot:${slotIndex}`, (token) => `${token.variantId}:${token.text}`)
      : tokens;
    return { slotEntry, slotIndex, tokens: orderedTokens };
  });
  const getSlotTokensForSet = (setId: number) => getSlotTokenGroupsForSet(setId).map((group) => group.tokens);
  const sanitizeOutputSubfolderSegment = (value: string): string => {
    const normalized = String(value || '')
      .trim()
      .replace(/[<>:"|?*]/g, '')
      .replace(/[\\/]+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .slice(0, 80)
      .trim();
    return normalized || 'Style';
  };
  const getStyleTokensForSet = (setId: number): QueuePromptToken[] => {
    const styleEntries = slotVariants
      .filter((slotEntry) => isStyleSlot(slotEntry))
      .flatMap((slotEntry, styleSlotIndex) => getSelectedForSet(slotEntry.variants, setId)
        .flatMap((card, styleVariantIndex) => {
          const skipVariant = isSkipVariant(card);
          const token = skipVariant ? '' : String(card.text || '').trim();
          if (!token && !skipVariant) return [];
          return [{
            text: token,
            slotId: slotEntry.slotId,
            slotLabel: slotEntry.label,
            slotType: slotEntry.type,
            variantId: String(card.id || '').trim(),
            variantName: String((card as any).variantName || '').trim(),
            chainLinks: normalizeChainLinks((card as any).chainLinks, String(card.id || '').trim()),
            blockLinks: normalizeBlockLinks((card as any).blockLinks, String(card.id || '').trim()),
            styleSlotIndex,
            styleVariantIndex,
          } as QueuePromptToken & { styleSlotIndex: number; styleVariantIndex: number }];
        }));
    return shuffleEnabled && styleEntries.length > 1
      ? stableShuffleQueueTokens(styleEntries, `${getDocumentShuffleSalt()}|set:${setId}|style`, (token) => `${token.variantId}:${token.text}`)
      : styleEntries;
  };
  const getStyleFolderName = (styleToken: QueuePromptToken, styleIndex: number): string => (
    String(styleToken.text || '').trim()
      ? sanitizeOutputSubfolderSegment(styleToken.variantName || `Style ${Math.max(0, Math.floor(Number((styleToken as any).styleVariantIndex) || styleIndex)) + 1}`)
      : ''
  );
  const getStyleDisplayName = (styleToken: QueuePromptToken, styleIndex: number): string => (
    String(styleToken.text || '').trim().length <= 0
      ? ''
      : (
        String(styleToken.variantName || '').trim()
        || `Style ${Math.max(0, Math.floor(Number((styleToken as any).styleVariantIndex) || styleIndex)) + 1}`
      )
  );
  const collapseSingleStyleOutputSubfolders = (folders: string[]): string[] => {
    const uniqueFolders = Array.from(new Set(
      folders.map((folder) => String(folder || '').trim()).filter(Boolean)
    ));
    return uniqueFolders.length <= 1 ? folders.map(() => '') : folders;
  };
  const countExhaustivePromptLengths = (lengths: number[]): number => {
    if (lengths.every((length) => Math.max(0, Math.floor(Number(length) || 0)) === 0)) return 0;
    let total = 1;
    for (const lengthRaw of lengths) {
      const factor = Math.max(1, Math.max(0, Math.floor(Number(lengthRaw) || 0)));
      if (!Number.isFinite(total * factor) || total > Number.MAX_SAFE_INTEGER / factor) {
        return Number.MAX_SAFE_INTEGER;
      }
      total *= factor;
    }
    return total;
  };
  const countExhaustivePrompts = (slotTokens: QueuePromptToken[][]): number => {
    return countExhaustivePromptLengths(slotTokens.map((tokens) => tokens.length));
  };
  const buildPromptFromSegments = (segments: string[]): string => normalizePowerPrompterPromptText(
    segments
      .map((segment) => String(segment || '').trim())
      .filter((value) => value.length > 0)
      .join(', ')
  );
  const toPreviewEntry = (entry: QueuePromptBuildEntry): QueuePromptPreviewEntry => ({
    prompt: entry.prompt,
    tokens: entry.tokens
      .map((token) => ({
        slotId: String(token.slotId || '').trim(),
        variantId: String(token.variantId || '').trim(),
      }))
      .filter((token) => token.slotId.length > 0 && token.variantId.length > 0),
  });
  const slotOrderById = new Map(slotVariants.map((slotEntry, slotIndex) => [slotEntry.slotId, slotIndex]));
  const orderTokensForPrompt = (tokens: QueuePromptToken[]): QueuePromptToken[] => (
    [...tokens].sort((left, right) => {
      const leftOrder = slotOrderById.get(left.slotId) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = slotOrderById.get(right.slotId) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder;
    })
  );
  const buildEntryFromTokens = (tokens: QueuePromptToken[], candidateTokens: QueuePromptToken[] = tokens): QueuePromptBuildEntry | null => {
    const linkedTokens = applyChainLinkedTokens(tokens, candidateTokens) || null;
    if (!linkedTokens) return null;
    const filteredTokens = orderTokensForPrompt(filterBlockedTokens(linkedTokens));
    const prompt = buildPromptFromSegments(filteredTokens.map((token) => token.text));
    return prompt ? { prompt, tokens: filteredTokens } : null;
  };
  const buildStyledEntryFromTokens = (baseTokens: QueuePromptToken[], styleToken: QueuePromptToken, candidateTokens: QueuePromptToken[]): QueuePromptBuildEntry | null => {
    if (primaryStyleSlotIndex < 0) return buildEntryFromTokens([...baseTokens, styleToken], candidateTokens);
    const orderedTokens = [...baseTokens];
    let insertIndex = orderedTokens.findIndex((token) => {
      const slotIndex = slotVariants.findIndex((slotEntry) => slotEntry.slotId === token.slotId);
      return slotIndex >= primaryStyleSlotIndex;
    });
    if (insertIndex < 0) insertIndex = orderedTokens.length;
    orderedTokens.splice(insertIndex, 0, styleToken);
    return buildEntryFromTokens(orderedTokens, candidateTokens);
  };
  const buildExhaustiveFromTokens = (slotTokens: QueuePromptToken[][], limit: number): { entries: QueuePromptBuildEntry[]; truncated: boolean } => {
    if (limit <= 0) return { entries: [], truncated: false };
    if (slotTokens.every((tokens) => tokens.length === 0)) {
      return { entries: [], truncated: false };
    }
    const tokenGrid = slotTokens.map((tokens) => (tokens.length > 0 ? tokens : [null]));
    if (tokenGrid.length === 0) return { entries: [], truncated: false };
    const indices = new Array(tokenGrid.length).fill(0);
    const entries: QueuePromptBuildEntry[] = [];
    const promptSet = new Set<string>();
    let truncated = false;
    while (true) {
      const selectedTokens = tokenGrid.flatMap((tokens, slotIndex) => {
        const selected = tokens[indices[slotIndex]];
        return selected ? [selected] : [];
      });
      const entry = buildEntryFromTokens(selectedTokens, slotTokens.flat());
      if (entry && !promptSet.has(entry.prompt)) {
        promptSet.add(entry.prompt);
        entries.push(entry);
        if (entries.length >= limit) {
          truncated = true;
          break;
        }
      }

      let carryIndex = indices.length - 1;
      while (carryIndex >= 0) {
        indices[carryIndex] += 1;
        if (indices[carryIndex] < tokenGrid[carryIndex].length) break;
        indices[carryIndex] = 0;
        carryIndex -= 1;
      }
      if (carryIndex < 0) break;
    }
    return { entries, truncated };
  };
  const buildForSet = (setId: number, limit: number): { entries: QueuePromptBuildEntry[]; prompts: string[]; styleMeta: QueuePromptStyleMeta[]; truncated: boolean } => {
    if (Number.isFinite(limit) && limit <= 0) {
      return { entries: [], prompts: [], styleMeta: [], truncated: true };
    }
    const sampleBuiltQueue = (
      entries: QueuePromptBuildEntry[],
      prompts: string[],
      styleMeta: QueuePromptStyleMeta[],
      finalLimit: number
    ): { entries: QueuePromptBuildEntry[]; prompts: string[]; styleMeta: QueuePromptStyleMeta[]; truncated: boolean } => {
      const safeLimit = Math.max(0, Math.floor(Number(finalLimit) || 0));
      if (!Number.isFinite(finalLimit) || safeLimit <= 0 || prompts.length <= safeLimit) {
        return { entries, prompts, styleMeta, truncated: false };
      }
      return {
        entries: entries.slice(0, safeLimit),
        prompts: prompts.slice(0, safeLimit),
        styleMeta: styleMeta.slice(0, safeLimit),
        truncated: true,
      };
    };
    const slotTokenGroups = getSlotTokenGroupsForSet(setId);
    const baseTokenGroups = orderSlotTokenGroupsForTraversal(
      slotTokenGroups.filter((group) => !isStyleSlot(group.slotEntry))
    );
    const baseSlotTokens = baseTokenGroups.map((group) => group.tokens);
    const styleTokens = getStyleTokensForSet(setId);
    const hasFiniteLimit = Number.isFinite(limit);
    const finalLimit = hasFiniteLimit ? Math.max(0, Math.floor(Number(limit) || 0)) : limit;
    const baseLimit = hasFiniteLimit && styleTokens.length > 0
      ? Math.max(1, Math.ceil(finalLimit / Math.max(1, styleTokens.length)))
      : finalLimit;
    const baseBuilt = buildExhaustiveFromTokens(baseSlotTokens, baseLimit);
    const baseEntries = baseBuilt.entries.length > 0
      ? baseBuilt.entries
      : (styleTokens.length > 0 ? [{ prompt: '', tokens: [] as QueuePromptToken[] }] : []);
    if (styleTokens.length <= 0) {
      const entries = baseEntries.filter((entry) => entry.prompt.length > 0);
      const built = {
        entries,
        prompts: entries.map((entry) => entry.prompt),
        styleMeta: entries.map((_, baseIndex) => ({ folderName: '', styleName: '', seedGroupId: `${setId}:base:${baseIndex}` })),
        truncated: baseBuilt.truncated,
      };
      if (!hasFiniteLimit) {
        const sampled = sampleBuiltQueue(built.entries, built.prompts, built.styleMeta, built.prompts.length);
        return {
          ...sampled,
          truncated: built.truncated || sampled.truncated,
        };
      }
      const sampled = sampleBuiltQueue(built.entries, built.prompts, built.styleMeta, finalLimit);
      return {
        ...sampled,
        truncated: built.truncated || sampled.truncated,
      };
    }
    const entries: QueuePromptBuildEntry[] = [];
    const prompts: string[] = [];
    const styleMeta: QueuePromptStyleMeta[] = [];
    let truncated = baseBuilt.truncated;
    for (let baseIndex = 0; baseIndex < baseEntries.length; baseIndex += 1) {
      const baseEntry = baseEntries[baseIndex];
      for (let styleIndex = 0; styleIndex < styleTokens.length; styleIndex += 1) {
        const styleToken = styleTokens[styleIndex];
        const entry = buildStyledEntryFromTokens(baseEntry.tokens, styleToken, [...baseSlotTokens.flat(), ...styleTokens]);
        if (!entry) continue;
        entries.push(entry);
        prompts.push(entry.prompt);
        styleMeta.push({
          folderName: getStyleFolderName(styleToken, styleIndex),
          styleName: getStyleDisplayName(styleToken, styleIndex),
          seedGroupId: styleSeedMode === 'different'
            ? `${setId}:base:${baseIndex}:style:${String(styleToken.variantId || styleIndex).trim() || styleIndex}`
            : `${setId}:base:${baseIndex}`,
        });
      }
    }
    if (!hasFiniteLimit) {
      const sampled = sampleBuiltQueue(entries, prompts, styleMeta, prompts.length);
      return {
        ...sampled,
        truncated: truncated || sampled.truncated,
      };
    }
    const sampled = sampleBuiltQueue(entries, prompts, styleMeta, finalLimit);
    return {
      ...sampled,
      truncated: truncated || sampled.truncated,
    };
  };
  const countBuiltEntriesFromLengths = (
    slotTokenLengths: number[],
    modeLimit: number
  ): { count: number; truncated: boolean } => {
    const safeLimit = Number.isFinite(modeLimit)
      ? Math.max(0, Math.floor(Number(modeLimit) || 0))
      : Number.MAX_SAFE_INTEGER;
    if (safeLimit <= 0) return { count: 0, truncated: false };
    const total = countExhaustivePromptLengths(slotTokenLengths);
    return {
      count: Math.min(total, safeLimit),
      truncated: total > safeLimit,
    };
  };
  const countForSet = (setId: number, limit: number): { count: number; truncated: boolean } => {
    if (Number.isFinite(limit) && limit <= 0) {
      return { count: 0, truncated: true };
    }
    const baseSlotLengths = orderSlotTokenGroupsForTraversal(
      getSlotTokenGroupsForSet(setId).filter((group) => !isStyleSlot(group.slotEntry))
    ).map((group) => group.tokens.length);
    const styleCount = getStyleTokensForSet(setId).length;
    const hasFiniteLimit = Number.isFinite(limit);
    const finalLimit = hasFiniteLimit ? Math.max(0, Math.floor(Number(limit) || 0)) : Number.MAX_SAFE_INTEGER;
    const baseBuilt = countBuiltEntriesFromLengths(baseSlotLengths, Number.MAX_SAFE_INTEGER);
    const baseEntryCount = baseBuilt.count > 0
      ? baseBuilt.count
      : (styleCount > 0 ? 1 : 0);
    const totalBeforeModeLimit = styleCount > 0
      ? Math.min(Number.MAX_SAFE_INTEGER, baseEntryCount * styleCount)
      : baseEntryCount;
    const effectiveLimit = hasFiniteLimit ? Math.min(finalLimit, totalBeforeModeLimit) : totalBeforeModeLimit;
    return {
      count: Math.max(0, Math.min(totalBeforeModeLimit, effectiveLimit)),
      truncated: baseBuilt.truncated || totalBeforeModeLimit > effectiveLimit,
    };
  };
  const returnCountOnly = (count: number, truncated: boolean) => ({
    prompts: [],
    promptEntries: [],
    promptSetIds: [],
    promptOutputSubfolders: [],
    promptStyleNames: [],
    promptSeedGroupIds: [],
    truncated,
    warnings: [],
    randomApplied: false,
    estimatedPromptCount: Math.max(0, Math.floor(Number(count) || 0)),
  });

  if (mode === 'prompt') {
    const selectedTokens = slots.flatMap((slot) => {
      const selected = slot.variants.find((variant) => {
        const text = String(variant.text || '').trim();
        if (!text) return false;
        return normalizeQueueSetIds(variant.queueSetIds, false).includes(activeSetId);
      });
      if (!selected) return [];
      return [{
        text: String(selected.text || '').trim(),
        slotId: slot.slotId,
        slotLabel: slot.label,
        slotType: slot.type,
        variantId: String(selected.id || '').trim(),
        variantName: String((selected as any).variantName || '').trim(),
        chainLinks: normalizeChainLinks((selected as any).chainLinks, String(selected.id || '').trim()),
        blockLinks: normalizeBlockLinks((selected as any).blockLinks, String(selected.id || '').trim()),
      } as QueuePromptToken];
    });
    const promptEntry = buildEntryFromTokens(selectedTokens, selectedTokens);
    const normalizedPrompt = promptEntry?.prompt || '';
    if (options?.countOnly === true) {
      return returnCountOnly(normalizedPrompt ? 1 : 0, false);
    }
    return {
      prompts: normalizedPrompt ? [normalizedPrompt] : [],
      promptEntries: promptEntry
        ? [toPreviewEntry(promptEntry)]
        : [],
      promptSetIds: normalizedPrompt ? [activeSetId] : [],
      promptOutputSubfolders: normalizedPrompt ? [''] : [],
      promptStyleNames: normalizedPrompt ? [''] : [],
      promptSeedGroupIds: normalizedPrompt ? [`${activeSetId}:prompt:0`] : [],
      truncated: false,
      warnings: [],
      randomApplied: false,
    };
  }

  if (mode === 'selected') {
    if (options?.countOnly === true) {
      const counted = countForSet(activeSetId, queuePromptCap);
      return returnCountOnly(counted.count, counted.truncated);
    }
    const built = buildForSet(activeSetId, queuePromptCap);
    return {
      prompts: built.prompts,
      promptEntries: built.entries.map(toPreviewEntry),
      promptSetIds: built.prompts.map(() => activeSetId),
      promptOutputSubfolders: collapseSingleStyleOutputSubfolders(built.styleMeta.map((entry) => entry.folderName)),
      promptStyleNames: built.styleMeta.map((entry) => entry.styleName),
      promptSeedGroupIds: built.styleMeta.map((entry) => entry.seedGroupId),
      truncated: built.truncated,
      warnings: [],
      randomApplied: false,
    };
  }

  const allSetIds = Array.from({ length: POWER_PROMPTER_MAX_QUEUE_SETS }, (_, idx) => idx + 1);
  const selectedSetIds = Array.from(new Set(
    normalizeChainCards(document.cards).flatMap((card) => normalizeQueueSetIds(card.queueSetIds, false))
  )).sort((a, b) => a - b);
  const setsToQueue = options?.includeAllSets === true
    ? allSetIds
    : (selectedSetIds.length > 0 ? selectedSetIds : [activeSetId]);
  const allocatePromptLimitsBySet = (setIds: number[], totalLimit: number): Map<number, number> | null => {
    if (!Number.isFinite(totalLimit)) return null;
    const safeTotalLimit = Math.max(0, Math.floor(Number(totalLimit) || 0));
    const availableBySet = new Map<number, number>();
    for (const setId of setIds) {
      const available = countForSet(setId, Number.MAX_SAFE_INTEGER).count;
      if (available > 0) availableBySet.set(setId, available);
    }
    const limitBySet = new Map<number, number>();
    const populatedSetIds = Array.from(availableBySet.keys());
    for (const setId of populatedSetIds) limitBySet.set(setId, 0);
    let remainingLimit = safeTotalLimit;
    let activeSetIds = populatedSetIds;
    while (activeSetIds.length > 0 && remainingLimit > 0) {
      const share = Math.max(1, Math.floor(remainingLimit / activeSetIds.length));
      let spentThisPass = 0;
      const nextActiveSetIds: number[] = [];
      for (const setId of activeSetIds) {
        if (remainingLimit <= 0) break;
        const currentLimit = limitBySet.get(setId) || 0;
        const available = availableBySet.get(setId) || 0;
        const remainingForSet = Math.max(0, available - currentLimit);
        if (remainingForSet <= 0) continue;
        const add = Math.min(remainingForSet, share, remainingLimit);
        limitBySet.set(setId, currentLimit + add);
        remainingLimit -= add;
        spentThisPass += add;
        if (remainingForSet > add) nextActiveSetIds.push(setId);
      }
      if (spentThisPass <= 0) break;
      activeSetIds = nextActiveSetIds;
    }
    return limitBySet;
  };
  const allSetPromptLimitBySet = options?.includeAllSets === true
    ? allocatePromptLimitsBySet(setsToQueue, queuePromptCap)
    : null;
  const getLimitForQueuedSet = (setId: number): number | null => {
    if (!allSetPromptLimitBySet) return queuePromptCap;
    return allSetPromptLimitBySet.has(setId) ? (allSetPromptLimitBySet.get(setId) || 0) : null;
  };
  if (options?.countOnly === true) {
    let promptCount = 0;
    let countTruncated = false;
    for (const setId of setsToQueue) {
      const setLimit = getLimitForQueuedSet(setId);
      if (setLimit === null) continue;
      const counted = countForSet(setId, setLimit);
      promptCount += counted.count;
      if (counted.truncated) {
        countTruncated = true;
      }
    }
    return returnCountOnly(promptCount, countTruncated);
  }
  const prompts: string[] = [];
  const promptEntries: QueuePromptPreviewEntry[] = [];
  const promptSetIds: number[] = [];
  const promptOutputSubfolders: string[] = [];
  const promptStyleNames: string[] = [];
  const promptSeedGroupIds: string[] = [];
  const warnings: string[] = [];
  let truncated = false;
  let randomApplied = false;

  for (const setId of setsToQueue) {
    const setLimit = getLimitForQueuedSet(setId);
    if (setLimit === null) continue;
    const built = buildForSet(setId, setLimit);
    prompts.push(...built.prompts);
    promptEntries.push(...built.entries.map(toPreviewEntry));
    promptSetIds.push(...built.prompts.map(() => setId));
    promptOutputSubfolders.push(...built.styleMeta.map((entry) => entry.folderName));
    promptStyleNames.push(...built.styleMeta.map((entry) => entry.styleName));
    promptSeedGroupIds.push(...built.styleMeta.map((entry) => entry.seedGroupId));
    if (built.truncated) {
      truncated = true;
    }
  }

  return {
    prompts,
    promptEntries,
    promptSetIds,
    promptOutputSubfolders: collapseSingleStyleOutputSubfolders(promptOutputSubfolders),
    promptStyleNames,
    promptSeedGroupIds,
    truncated,
    warnings: Array.from(new Set(warnings)),
    randomApplied,
  };
}

