import {
  compileUmbraUiPromptSegments,
  type UmbraUiPromptSegment,
} from './umbraUiPromptSegments';

export const UMBRA_UI_PROMPT_HISTORY_LIMIT = 100;

export interface UmbraUiPromptHistoryEntry {
  id: string;
  promptSegments: UmbraUiPromptSegment[];
  negativePrompt: string;
  createdAt: number;
}

function createHistoryId(): string {
  try {
    return `umbra-prompt-history-${crypto.randomUUID()}`;
  } catch {
    return `umbra-prompt-history-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}

function normalizeMetadata(value: unknown): string {
  return String(value || '').trim();
}

function normalizeHistorySegments(value: unknown, entryIndex: number): UmbraUiPromptSegment[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.slice(0, 24).map((rawSegment, segmentIndex) => {
    const segment = rawSegment && typeof rawSegment === 'object'
      ? rawSegment as Record<string, unknown>
      : {};
    const fallbackId = `umbra-history-${entryIndex + 1}-prompt-${segmentIndex + 1}`;
    let id = normalizeMetadata(segment.id) || fallbackId;
    if (seenIds.has(id)) id = `${fallbackId}-${segmentIndex + 1}`;
    seenIds.add(id);
    const label = normalizeMetadata(segment.label);
    const slotType = normalizeMetadata(segment.slotType);
    const variantId = normalizeMetadata(segment.variantId);
    const variantName = normalizeMetadata(segment.variantName);
    return {
      id,
      text: String(segment.text || ''),
      ...(label ? { label } : {}),
      ...(slotType ? { slotType } : {}),
      ...(variantId ? { variantId } : {}),
      ...(variantName ? { variantName } : {}),
    };
  });
}

function promptHistoryEntryKey(
  promptSegments: UmbraUiPromptSegment[],
  negativePrompt: string,
): string {
  const groupedPrompt = promptSegments.map((segment) => ({
    text: String(segment.text || '').replace(/\s+/g, ' ').trim().toLowerCase(),
    label: normalizeMetadata(segment.label).toLowerCase(),
    slotType: normalizeMetadata(segment.slotType).toLowerCase(),
    variantId: normalizeMetadata(segment.variantId).toLowerCase(),
    variantName: normalizeMetadata(segment.variantName).toLowerCase(),
  }));
  return JSON.stringify({
    fields: groupedPrompt,
    negativePrompt: String(negativePrompt || '').replace(/\s+/g, ' ').trim().toLowerCase(),
  });
}

export function normalizeUmbraUiPromptHistory(
  value: unknown,
  limit = UMBRA_UI_PROMPT_HISTORY_LIMIT,
): UmbraUiPromptHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const candidates = value
    .map((rawEntry, index) => {
      const entry = rawEntry && typeof rawEntry === 'object'
        ? rawEntry as Record<string, unknown>
        : {};
      const promptSegments = normalizeHistorySegments(entry.promptSegments, index);
      const negativePrompt = String(entry.negativePrompt || '').trim();
      return {
        id: normalizeMetadata(entry.id),
        promptSegments,
        negativePrompt,
        createdAt: Math.max(0, Number(entry.createdAt) || 0),
        index,
        key: promptHistoryEntryKey(promptSegments, negativePrompt),
      };
    })
    .filter((entry) => !!compileUmbraUiPromptSegments(entry.promptSegments))
    .sort((left, right) => right.createdAt - left.createdAt || left.index - right.index);

  const normalized: UmbraUiPromptHistoryEntry[] = [];
  const seenKeys = new Set<string>();
  const seenIds = new Set<string>();
  const normalizedLimit = Math.max(1, Math.floor(Number(limit) || UMBRA_UI_PROMPT_HISTORY_LIMIT));
  for (const candidate of candidates) {
    if (seenKeys.has(candidate.key)) continue;
    seenKeys.add(candidate.key);
    let id = candidate.id || `umbra-prompt-history-${candidate.createdAt || candidate.index + 1}`;
    if (seenIds.has(id)) id = `${id}-${candidate.index + 1}`;
    seenIds.add(id);
    normalized.push({
      id,
      promptSegments: candidate.promptSegments,
      negativePrompt: candidate.negativePrompt,
      createdAt: candidate.createdAt,
    });
    if (normalized.length >= normalizedLimit) break;
  }
  return normalized;
}

export function recordUmbraUiPromptHistory(
  history: readonly UmbraUiPromptHistoryEntry[] | undefined,
  promptSegments: UmbraUiPromptSegment[],
  negativePrompt: string,
  createdAt = Date.now(),
): UmbraUiPromptHistoryEntry[] {
  const normalizedSegments = normalizeHistorySegments(promptSegments, 0);
  if (!compileUmbraUiPromptSegments(normalizedSegments)) {
    return normalizeUmbraUiPromptHistory(history);
  }
  return normalizeUmbraUiPromptHistory([{
    id: createHistoryId(),
    promptSegments: normalizedSegments,
    negativePrompt: String(negativePrompt || '').trim(),
    createdAt: Math.max(0, Number(createdAt) || Date.now()),
  }, ...(history || [])]);
}

export function mergeUmbraUiPromptHistories(
  ...histories: Array<readonly UmbraUiPromptHistoryEntry[] | null | undefined>
): UmbraUiPromptHistoryEntry[] {
  return normalizeUmbraUiPromptHistory(histories.flatMap((history) => history || []));
}

export function getUmbraUiPromptHistoryFieldCount(entry: UmbraUiPromptHistoryEntry): number {
  return Math.max(1, entry.promptSegments.length);
}
