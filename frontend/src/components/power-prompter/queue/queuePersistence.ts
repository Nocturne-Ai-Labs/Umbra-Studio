import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import {
  normalizePowerPrompterCardDocument,
  normalizePowerPrompterGenerationControls,
  normalizePowerPrompterPromptText,
} from '@/lib/powerPrompter';
import { normalizeChainCards } from '@/lib/powerPrompterChain';
import {
  clampQueueSetId,
  normalizeQueueDiversity,
  normalizeQueuePromptLimit,
  normalizeQueueTargetType,
  normalizeQueueTraversalMode,
} from './queueCore';
import type {
  PersistedPausedQueueSnapshot,
  PersistedQueueEditorSnapshot,
  PersistedQueueGroupSnapshot,
  PowerPrompterQueueHistoryPreviewImage,
  PowerPrompterQueueHistoryDocument,
  PowerPrompterQueueHistoryStatus,
  PowerPrompterQueueHistorySummary,
  PowerPrompterQueueMode,
  PowerPrompterQueueTargetType,
  QueueEditorBuildSettings,
  QueuePromptPreviewEntry,
  QueuePromptPreviewToken,
  QueueStackItem,
  QueueVisualState,
  SavedPowerPrompterQueueDocument,
  SavedPowerPrompterQueueSummary,
} from './queueCore';

const POWER_PROMPTER_PAUSED_QUEUE_STORAGE_KEY = 'umbra.powerPrompter.pausedQueueSnapshot';
export const POWER_PROMPTER_QUEUE_HISTORY_PREVIEW_IMAGE_LIMIT = 20;

function normalizeQueueHistoryPreviewPath(rawValue: unknown): string {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  const lower = value.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://') || lower.startsWith('data:') || lower.startsWith('blob:')) {
    return '';
  }
  return value.replace(/\\/g, '/');
}

function deriveQueueHistoryPreviewName(path: string, rawValue: unknown): string {
  const explicit = String(rawValue || '').trim();
  if (explicit) return explicit;
  const basename = path.split(/[\\/]/).pop() || '';
  return basename || 'Output preview';
}

function normalizeQueueHistoryPreviewType(rawValue: unknown, path: string): PowerPrompterQueueHistoryPreviewImage['type'] {
  const value = String(rawValue || '').trim().toLowerCase();
  if (value === 'video' || value === 'gif') return value;
  if (/\.gif(?:[?#].*)?$/i.test(path)) return 'gif';
  if (/\.(mp4|webm|mov|avi|mkv|m4v)(?:[?#].*)?$/i.test(path)) return 'video';
  return 'image';
}

function normalizeOptionalFiniteInteger(rawValue: unknown): number | undefined {
  const numeric = Math.floor(Number(rawValue));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function hasPersistedQueueEditorSnapshot(rawSnapshot: unknown): boolean {
  if (!rawSnapshot || typeof rawSnapshot !== 'object') return false;
  const groupSnapshots = (rawSnapshot as any).groupSnapshots;
  if (!Array.isArray(groupSnapshots)) return false;
  return groupSnapshots.some((entry: any) => !!normalizeQueueEditorSnapshot(entry?.editorSnapshot));
}

export function normalizePowerPrompterQueueHistoryPreviewImages(
  rawValue: unknown,
  limit = POWER_PROMPTER_QUEUE_HISTORY_PREVIEW_IMAGE_LIMIT
): PowerPrompterQueueHistoryPreviewImage[] {
  if (!Array.isArray(rawValue)) return [];
  const normalized: PowerPrompterQueueHistoryPreviewImage[] = [];
  const seenPaths = new Set<string>();
  const maxCount = Math.max(0, Math.floor(Number(limit) || 0));
  for (const entry of rawValue) {
    if (normalized.length >= maxCount) break;
    if (!entry || typeof entry !== 'object') continue;
    const value = entry as Record<string, unknown>;
    const path = normalizeQueueHistoryPreviewPath(value.path || value.fullpath || value.fullPath);
    if (!path) continue;
    const pathKey = path.toLowerCase();
    if (seenPaths.has(pathKey)) continue;
    seenPaths.add(pathKey);
    const type = normalizeQueueHistoryPreviewType(value.type || value.mediaKind, path);
    const promptIndex = normalizeOptionalFiniteInteger(value.promptIndex);
    const setId = normalizeOptionalFiniteInteger(value.setId ?? value.promptSetId);
    const modified = Number(value.modified ?? value.mtime ?? value.updatedAt);
    const id = String(value.id || value.promptId || path).trim() || path;
    const mediaKind = String(value.mediaKind || value.type || '').trim();
    const promptId = String(value.promptId || '').trim();
    normalized.push({
      id,
      path,
      name: deriveQueueHistoryPreviewName(path, value.name || value.filename),
      type,
      ...(mediaKind ? { mediaKind } : {}),
      ...(promptIndex !== undefined && promptIndex >= 0 ? { promptIndex } : {}),
      ...(promptId ? { promptId } : {}),
      ...(setId !== undefined && setId >= 1 ? { setId } : {}),
      ...(Number.isFinite(modified) && modified > 0 ? { modified } : {}),
    });
  }
  return normalized;
}

export function normalizeQueueEditorBuildSettings(rawValue: unknown): QueueEditorBuildSettings {
  const value = rawValue && typeof rawValue === 'object' ? rawValue as Record<string, unknown> : {};
  const traversalMode = normalizeQueueTraversalMode(value.traversalMode);
  return {
    traversalMode,
    diversity: normalizeQueueDiversity(value.diversity, traversalMode),
    promptLimit: normalizeQueuePromptLimit(value.promptLimit),
    shuffleEnabled: value.shuffleEnabled === true,
    shuffleSeed: Math.max(0, Math.floor(Number(value.shuffleSeed) || 0)),
  };
}

export function createQueueEditorSnapshot(
  document: PowerPrompterCardDocument,
  sourceFile: string | null,
  buildSettings: QueueEditorBuildSettings
): PersistedQueueEditorSnapshot {
  const normalizedDocument = normalizePowerPrompterCardDocument(document, sourceFile);
  return {
    version: 1,
    sourceFile,
    document: {
      ...normalizedDocument,
      cards: normalizeChainCards(normalizedDocument.cards),
      generation: normalizePowerPrompterGenerationControls(normalizedDocument.generation),
    },
    queueBuildSettings: normalizeQueueEditorBuildSettings(buildSettings),
  };
}

export function normalizeQueueEditorSnapshot(rawValue: unknown): PersistedQueueEditorSnapshot | undefined {
  if (!rawValue || typeof rawValue !== 'object') return undefined;
  const value = rawValue as Record<string, unknown>;
  const sourceFile = typeof value.sourceFile === 'string' ? String(value.sourceFile).trim() || null : null;
  const rawDocument = value.document && typeof value.document === 'object'
    ? value.document
    : {
      version: 1,
      file: sourceFile,
      cards: Array.isArray(value.cards) ? value.cards : [],
      generation: value.generation,
      activeQueueSet: value.activeSetId,
      styleSeedMode: value.styleSeedMode,
      deletedCardGroups: value.deletedCardGroups,
    };
  return createQueueEditorSnapshot(
    normalizePowerPrompterCardDocument(rawDocument, sourceFile),
    sourceFile,
    normalizeQueueEditorBuildSettings(value.queueBuildSettings)
  );
}

export function normalizePersistedQueueGroupSnapshots(
  rawValue: unknown,
  requestIds: string[],
  promptCount: number
): PersistedQueueGroupSnapshot[] {
  if (!Array.isArray(rawValue) || promptCount <= 0) return [];
  return rawValue
    .map((entry: any): PersistedQueueGroupSnapshot | null => {
      if (!entry || typeof entry !== 'object') return null;
      const requestId = String(entry.requestId || '').trim();
      if (!requestId) return null;
      const fallbackIndices = requestIds
        .map((candidate, index) => (candidate === requestId ? index : -1))
        .filter((index) => index >= 0);
      const rawPromptIndices: number[] = (Array.isArray(entry.promptIndices) ? entry.promptIndices : fallbackIndices)
        .map((value: unknown) => Math.floor(Number(value)))
        .filter((value: number) => Number.isFinite(value) && value >= 0 && value < promptCount);
      const promptIndices = Array.from(new Set<number>(rawPromptIndices));
      const firstIndex = promptIndices[0] ?? fallbackIndices[0] ?? 0;
      const promptStartIndex = Math.max(0, Math.min(promptCount - 1, Math.floor(Number(entry.promptStartIndex) || firstIndex)));
      const normalizedMode = String(entry.mode || '') === 'prompt' || String(entry.mode || '') === 'variants'
        ? String(entry.mode) as PowerPrompterQueueMode
        : (String(entry.mode || '') === 'selected' ? 'selected' : undefined);
      return {
        id: String(entry.id || requestId).trim() || requestId,
        requestId,
        ...(String(entry.label || '').trim() ? { label: String(entry.label || '').trim() } : {}),
        ...(normalizedMode ? { mode: normalizedMode } : {}),
        ...(entry.activeSetId !== undefined ? { activeSetId: clampQueueSetId(entry.activeSetId) } : {}),
        promptStartIndex,
        promptCount: Math.max(0, Math.floor(Number(entry.promptCount) || promptIndices.length || fallbackIndices.length)),
        ...(promptIndices.length > 0 ? { promptIndices } : {}),
        ...(normalizeQueueEditorSnapshot(entry.editorSnapshot) ? { editorSnapshot: normalizeQueueEditorSnapshot(entry.editorSnapshot) } : {}),
      };
    })
    .filter((entry: PersistedQueueGroupSnapshot | null): entry is PersistedQueueGroupSnapshot => !!entry);
}

export function normalizePersistedPausedQueueSnapshot(rawValue: unknown): PersistedPausedQueueSnapshot | null {
  try {
    const parsed = rawValue && typeof rawValue === 'object' ? rawValue : JSON.parse(String(rawValue || 'null'));
    if (!parsed || typeof parsed !== 'object') return null;
    const prompts: string[] = Array.isArray((parsed as any).prompts)
      ? (parsed as any).prompts.map((entry: unknown) => normalizePowerPrompterPromptText(String(entry || '').trim())).filter(Boolean)
      : [];
    if (prompts.length <= 0) return null;
    const promptSetIds = prompts.map((_, index) => clampQueueSetId((parsed as any).promptSetIds?.[index] ?? (parsed as any).activeSetId ?? 1));
    const promptOutputSubfolders = prompts.map((_, index) => String((parsed as any).promptOutputSubfolders?.[index] || '').trim());
    const promptStyleNames = prompts.map((_, index) => String((parsed as any).promptStyleNames?.[index] || '').trim());
    const promptSeedGroupIds = prompts.map((_, index) => String((parsed as any).promptSeedGroupIds?.[index] || `${promptSetIds[index]}:${index}`).trim());
    const rawGenerationByPrompt = Array.isArray((parsed as any).generationByPrompt)
      ? (parsed as any).generationByPrompt
      : [];
    const fallbackGeneration = normalizePowerPrompterGenerationControls((parsed as any).generation);
    const generationByPrompt = prompts.map((_, index) =>
      normalizePowerPrompterGenerationControls(rawGenerationByPrompt[index] ?? fallbackGeneration)
    );
    const generation = normalizePowerPrompterGenerationControls(generationByPrompt[0] ?? fallbackGeneration);
    const rawRequestIds = Array.isArray((parsed as any).requestIds)
      ? (parsed as any).requestIds
        .map((entry: unknown) => String(entry || '').trim())
        .filter((entry: string) => entry.length > 0)
      : [];
    const savedAt = Number((parsed as any).savedAt) || Date.now();
    const fallbackRequestId = rawRequestIds[0] || `paused-${savedAt}`;
    const requestIds = prompts.map((_, index) => rawRequestIds[index] || fallbackRequestId);
    const groupSnapshots = normalizePersistedQueueGroupSnapshots((parsed as any).groupSnapshots, requestIds, prompts.length);
    const rawPromptEntries = Array.isArray((parsed as any).promptEntries)
      ? (parsed as any).promptEntries
      : null;
    const promptEntries = rawPromptEntries
      ? prompts.map((prompt, index): QueuePromptPreviewEntry => {
        const entry = rawPromptEntries[index];
        return {
          prompt: normalizePowerPrompterPromptText(String(entry?.prompt || prompt || '').trim()),
          tokens: Array.isArray(entry?.tokens)
            ? entry.tokens
              .map((token: any): QueuePromptPreviewToken => ({
                slotId: String(token?.slotId || '').trim(),
                variantId: String(token?.variantId || '').trim(),
              }))
              .filter((token: QueuePromptPreviewToken) => token.slotId.length > 0 && token.variantId.length > 0)
            : [],
        };
      })
      : undefined;
    return {
      version: 1,
      ...(groupSnapshots.length > 0 ? { snapshotSchemaVersion: 2 } : {}),
      savedAt,
      file: typeof (parsed as any).file === 'string' ? String((parsed as any).file) : null,
      mode: String((parsed as any).mode || '') === 'variants' ? 'variants' : (String((parsed as any).mode || '') === 'selected' ? 'selected' : 'prompt'),
      activeSetId: clampQueueSetId((parsed as any).activeSetId, 1),
      queueTargetType: normalizeQueueTargetType((parsed as any).queueTargetType),
      targetBridgeId: String((parsed as any).targetBridgeId || '').trim(),
      requestIds,
      prompts,
      ...(promptEntries ? { promptEntries } : {}),
      promptSetIds,
      promptOutputSubfolders,
      promptStyleNames,
      promptSeedGroupIds,
      generation,
      generationByPrompt,
      randomApplied: (parsed as any).randomApplied === true,
      paused: (parsed as any).paused === true,
      dispatchDelayMs: Math.max(0, Math.floor(Number((parsed as any).dispatchDelayMs) || 0)),
      ...(groupSnapshots.length > 0 ? { groupSnapshots } : {}),
    };
  } catch {
    return null;
  }
}

export function clearLegacyPersistedPausedQueueSnapshot(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(POWER_PROMPTER_PAUSED_QUEUE_STORAGE_KEY);
  } catch {
    // Legacy cleanup only.
  }
}

export async function readPersistedPausedQueueSnapshot(): Promise<PersistedPausedQueueSnapshot | null> {
  clearLegacyPersistedPausedQueueSnapshot();
  return null;
}

export async function writePersistedPausedQueueSnapshot(snapshot: PersistedPausedQueueSnapshot | null) {
  void snapshot;
  clearLegacyPersistedPausedQueueSnapshot();
}

export function normalizeSavedPowerPrompterQueueSummary(rawValue: unknown): SavedPowerPrompterQueueSummary | null {
  if (!rawValue || typeof rawValue !== 'object') return null;
  const entry = rawValue as Partial<SavedPowerPrompterQueueSummary>;
  const id = String(entry.id || '').trim();
  if (!id) return null;
  const promptCount = Math.max(0, Math.floor(Number(entry.promptCount) || 0));
  return {
    id,
    name: String(entry.name || id).trim() || id,
    savedAt: Number(entry.savedAt) || 0,
    file: typeof entry.file === 'string' ? entry.file : null,
    promptCount,
    activeSetId: clampQueueSetId(entry.activeSetId, 1),
    mode: String(entry.mode || '') === 'variants' ? 'variants' : (String(entry.mode || '') === 'selected' ? 'selected' : 'prompt'),
  };
}

export function normalizeSavedPowerPrompterQueueDocument(rawValue: unknown): SavedPowerPrompterQueueDocument | null {
  if (!rawValue || typeof rawValue !== 'object') return null;
  const entry = rawValue as Partial<SavedPowerPrompterQueueDocument>;
  const id = String(entry.id || '').trim();
  if (!id) return null;
  const snapshot = normalizePersistedPausedQueueSnapshot((entry as any).snapshot);
  if (!snapshot) return null;
  return {
    version: 1,
    id,
    name: String(entry.name || id).trim() || id,
    savedAt: Number(entry.savedAt) || snapshot.savedAt || Date.now(),
    snapshot: {
      ...snapshot,
      paused: true,
    },
  };
}

export function normalizePowerPrompterQueueHistoryStatus(rawValue: unknown): PowerPrompterQueueHistoryStatus {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (
    normalized === 'queued'
    || normalized === 'running'
    || normalized === 'completed'
    || normalized === 'canceled'
    || normalized === 'failed'
    || normalized === 'interrupted'
  ) {
    return normalized;
  }
  return 'queued';
}

export function normalizePowerPrompterQueueHistorySummary(rawValue: unknown): PowerPrompterQueueHistorySummary | null {
  if (!rawValue || typeof rawValue !== 'object') return null;
  const entry = rawValue as Partial<PowerPrompterQueueHistorySummary>;
  const id = String(entry.id || '').trim();
  if (!id) return null;
  const promptCount = Math.max(0, Math.floor(Number(entry.promptCount) || 0));
  const rawSnapshot = (rawValue as any).snapshot;
  return {
    id,
    name: String(entry.name || id).trim() || id,
    createdAt: Number(entry.createdAt) || 0,
    updatedAt: Number(entry.updatedAt) || Number(entry.createdAt) || 0,
    file: typeof entry.file === 'string' ? entry.file : null,
    promptCount,
    completed: Math.max(0, Math.min(promptCount, Math.floor(Number(entry.completed) || 0))),
    failed: Math.max(0, Math.min(promptCount, Math.floor(Number(entry.failed) || 0))),
    canceled: Math.max(0, Math.min(promptCount, Math.floor(Number(entry.canceled) || 0))),
    activeSetId: clampQueueSetId(entry.activeSetId, 1),
    mode: String(entry.mode || '') === 'variants' ? 'variants' : (String(entry.mode || '') === 'selected' ? 'selected' : 'prompt'),
    status: normalizePowerPrompterQueueHistoryStatus(entry.status),
    outputFolders: Array.isArray(entry.outputFolders)
      ? entry.outputFolders.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    previewImages: normalizePowerPrompterQueueHistoryPreviewImages((rawValue as any).previewImages),
    hasEditorSnapshot: entry.hasEditorSnapshot === true || hasPersistedQueueEditorSnapshot(rawSnapshot),
  };
}

export function normalizePowerPrompterQueueHistoryDocument(rawValue: unknown): PowerPrompterQueueHistoryDocument | null {
  const summary = normalizePowerPrompterQueueHistorySummary(rawValue);
  if (!summary || !rawValue || typeof rawValue !== 'object') return null;
  const snapshot = normalizePersistedPausedQueueSnapshot((rawValue as any).snapshot);
  if (!snapshot) return null;
  return {
    version: 1,
    ...summary,
    hasEditorSnapshot: summary.hasEditorSnapshot || hasPersistedQueueEditorSnapshot(snapshot),
    snapshot: {
      ...snapshot,
      paused: true,
    },
  };
}

export function getQueueHistoryDateGroupLabel(timestamp: number): string {
  const numeric = Number(timestamp);
  if (!Number.isFinite(numeric) || numeric <= 0) return 'Unknown Date';
  const date = new Date(numeric);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (left: Date, right: Date) =>
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
  if (sameDay(date, today)) return 'Today';
  if (sameDay(date, yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

export function buildPausedQueueSnapshotFromVisualState(
  visual: QueueVisualState | null,
  stackItems: QueueStackItem[],
  fallbackSetId: number,
  fallbackMode: PowerPrompterQueueMode,
  fallbackQueueTargetType: PowerPrompterQueueTargetType,
  fallbackTargetBridgeId: string,
  fallbackGeneration: ReturnType<typeof normalizePowerPrompterGenerationControls>,
  options?: {
    paused?: boolean;
    dispatchDelayMs?: number;
    file?: string | null;
    randomApplied?: boolean;
  }
): PersistedPausedQueueSnapshot | null {
  if (!visual || !Array.isArray(visual.prompts) || visual.prompts.length <= 0) return null;
  const requestId = String(visual.requestId || '').trim();
  const fallbackNormalizedSetId = clampQueueSetId(fallbackSetId, 1);
  const activeSetId = clampQueueSetId(visual.activeSetId ?? fallbackSetId, fallbackNormalizedSetId);
  const recoverableIndices = stackItems
    .filter((item) =>
      !item.exiting
      && (item.status === 'pending' || item.status === 'running')
      && String(item.requestId || '').trim() === requestId
    )
    .sort((a, b) => a.promptIndex - b.promptIndex)
    .map((item) => Math.max(0, Math.floor(Number(item.promptIndex) || 0)));
  const candidateIndices = recoverableIndices.length > 0
    ? recoverableIndices
    : visual.prompts
      .map((_, idx) => idx)
      .filter((idx) => idx >= Math.max(0, Math.floor(Number(visual.activeIndex) || 0)));
  const prompts = candidateIndices
    .map((idx) => normalizePowerPrompterPromptText(String(visual.prompts[idx] || '').trim()))
    .filter(Boolean);
  if (prompts.length <= 0) return null;
  return {
    version: 1,
    savedAt: Date.now(),
    file: options?.file ?? null,
    mode: visual.mode || fallbackMode,
    activeSetId,
    queueTargetType: normalizeQueueTargetType(fallbackQueueTargetType),
    targetBridgeId: String(fallbackTargetBridgeId || '').trim(),
    requestIds: requestId ? [requestId] : [],
    prompts,
    promptSetIds: prompts.map(() => activeSetId),
    promptOutputSubfolders: prompts.map(() => ''),
    promptStyleNames: prompts.map(() => ''),
    promptSeedGroupIds: prompts.map((_, index) => `${activeSetId}:${index}`),
    generation: normalizePowerPrompterGenerationControls(fallbackGeneration),
    generationByPrompt: prompts.map(() => normalizePowerPrompterGenerationControls(fallbackGeneration)),
    randomApplied: options?.randomApplied === true,
    paused: options?.paused === true,
    dispatchDelayMs: Math.max(0, Math.floor(Number(options?.dispatchDelayMs) || 0)),
  };
}
