import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import {
  normalizePowerPrompterGenerationControls,
  normalizePowerPrompterPromptText,
} from '@/lib/powerPrompter';
import {
  clampQueueSetId,
  normalizeQueueTargetType,
} from './queueCore';
import type {
  PersistedPausedQueueSnapshot,
  PersistedQueueGroupSnapshot,
  PowerPrompterQueueHistoryDocument,
  PowerPrompterQueueHistorySummary,
  QueueEditorBuildSettings,
  QueueRequestMeta,
} from './queueCore';
import {
  createQueueEditorSnapshot,
  getQueueHistoryDateGroupLabel,
  normalizePersistedPausedQueueSnapshot,
  normalizePowerPrompterQueueHistoryStatus,
} from './queuePersistence';

export type PowerPrompterQueueHistoryGroup = {
  key: string;
  label: string;
  items: PowerPrompterQueueHistorySummary[];
};

export type QueueHistorySnapshotBuildFailure =
  | { reason: 'missingMeta'; requestId: string; hasMeta: boolean; promptCount: number }
  | { reason: 'noPrompts'; requestId: string; rawPromptCount: number };

export type QueueHistorySnapshotBuildResult = {
  snapshot: PersistedPausedQueueSnapshot | null;
  failure: QueueHistorySnapshotBuildFailure | null;
};

export function buildQueueHistoryGroups(items: PowerPrompterQueueHistorySummary[]): PowerPrompterQueueHistoryGroup[] {
  const groups: PowerPrompterQueueHistoryGroup[] = [];
  const groupByKey = new Map<string, PowerPrompterQueueHistoryGroup>();
  const uniqueById = new Map<string, PowerPrompterQueueHistorySummary>();
  for (const item of Array.isArray(items) ? items : []) {
    const key = String(item.id || '').trim();
    if (!key) continue;
    const existing = uniqueById.get(key);
    if (!existing || (item.updatedAt || item.createdAt || 0) >= (existing.updatedAt || existing.createdAt || 0)) {
      uniqueById.set(key, item);
    }
  }
  const sortedItems = Array.from(uniqueById.values()).sort((left, right) =>
    (right.updatedAt || right.createdAt || 0) - (left.updatedAt || left.createdAt || 0)
  );
  for (const item of sortedItems) {
    const timestamp = item.updatedAt || item.createdAt || 0;
    const date = Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp) : null;
    const key = date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
      : 'unknown';
    let group = groupByKey.get(key);
    if (!group) {
      group = { key, label: getQueueHistoryDateGroupLabel(timestamp), items: [] };
      groupByKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

export function buildQueueHistorySnapshotForRequest(input: {
  requestId: string;
  meta: QueueRequestMeta | null | undefined;
  cardDocument: PowerPrompterCardDocument;
  currentFile: string | null;
  queueBuildSettings: QueueEditorBuildSettings;
}): QueueHistorySnapshotBuildResult {
  const normalizedRequestId = String(input.requestId || '').trim();
  const meta = input.meta;
  if (!meta || !Array.isArray(meta.prompts) || meta.prompts.length <= 0) {
    return {
      snapshot: null,
      failure: {
        reason: 'missingMeta',
        requestId: normalizedRequestId,
        hasMeta: Boolean(meta),
        promptCount: Array.isArray(meta?.prompts) ? meta.prompts.length : 0,
      },
    };
  }
  const prompts = meta.prompts
    .map((entry) => normalizePowerPrompterPromptText(String(entry || '').trim()))
    .filter(Boolean);
  if (prompts.length <= 0) {
    return {
      snapshot: null,
      failure: {
        reason: 'noPrompts',
        requestId: normalizedRequestId,
        rawPromptCount: meta.prompts.length,
      },
    };
  }
  const activeSetId = clampQueueSetId(meta.setId, 1);
  const groupSnapshot: PersistedQueueGroupSnapshot = {
    id: normalizedRequestId,
    requestId: normalizedRequestId,
    label: `Set ${activeSetId}`,
    mode: meta.mode,
    activeSetId,
    promptStartIndex: 0,
    promptCount: prompts.length,
    promptIndices: prompts.map((_, index) => index),
    editorSnapshot: meta.editorSnapshot || createQueueEditorSnapshot(input.cardDocument, input.currentFile, input.queueBuildSettings),
  };
  return {
    snapshot: normalizePersistedPausedQueueSnapshot({
      version: 1,
      snapshotSchemaVersion: 2,
      savedAt: Date.now(),
      file: input.currentFile || null,
      mode: meta.mode,
      activeSetId,
      queueTargetType: normalizeQueueTargetType(meta.queueTargetType),
      targetBridgeId: String(meta.targetBridgeId || '').trim(),
      requestIds: prompts.map(() => normalizedRequestId),
      prompts,
      promptEntries: meta.promptEntries?.slice(0, prompts.length),
      promptSetIds: prompts.map((_, index) => clampQueueSetId(meta.promptSetIds[index] ?? activeSetId)),
      promptOutputSubfolders: prompts.map((_, index) => String(meta.promptOutputSubfolders[index] || '').trim()),
      promptStyleNames: prompts.map((_, index) => String(meta.promptStyleNames[index] || '').trim()),
      promptSeedGroupIds: prompts.map((_, index) => String(meta.promptSeedGroupIds[index] || `${activeSetId}:${index}`).trim()),
      generation: normalizePowerPrompterGenerationControls(meta.generationByPrompt[0] ?? input.cardDocument.generation),
      generationByPrompt: prompts.map((_, index) => normalizePowerPrompterGenerationControls(meta.generationByPrompt[index])),
      randomApplied: meta.randomApplied === true,
      paused: true,
      dispatchDelayMs: Math.max(0, Math.floor(Number(meta.dispatchDelayMs) || 0)),
      groupSnapshots: [groupSnapshot],
    }),
    failure: null,
  };
}

export function buildOptimisticQueueHistorySummary(input: {
  optimisticId: string;
  baseName: string;
  snapshot: PersistedPausedQueueSnapshot;
  now?: number;
}): PowerPrompterQueueHistorySummary {
  const now = Number.isFinite(Number(input.now)) ? Number(input.now) : Date.now();
  const snapshot = input.snapshot;
  return {
    id: input.optimisticId,
    name: `${input.baseName || 'Power Prompter'} - Set ${snapshot.activeSetId}`,
    createdAt: now,
    updatedAt: now,
    file: snapshot.file,
    promptCount: snapshot.prompts.length,
    completed: 0,
    failed: 0,
    canceled: 0,
    activeSetId: snapshot.activeSetId,
    mode: snapshot.mode,
    status: 'running',
    outputFolders: Array.from(new Set(snapshot.promptOutputSubfolders.map((entry) => String(entry || '').trim()).filter(Boolean))),
    previewImages: [],
    hasEditorSnapshot: Array.isArray(snapshot.groupSnapshots)
      && snapshot.groupSnapshots.some((entry) => !!entry.editorSnapshot),
  };
}

export function applyQueueHistorySummaryPatch<T extends PowerPrompterQueueHistorySummary>(
  summary: T,
  patch: Partial<PowerPrompterQueueHistorySummary>
): T {
  return {
    ...summary,
    ...patch,
    updatedAt: Date.now(),
    completed: Math.max(0, Math.min(summary.promptCount, Math.floor(Number(patch.completed ?? summary.completed) || 0))),
    failed: Math.max(0, Math.min(summary.promptCount, Math.floor(Number(patch.failed ?? summary.failed) || 0))),
    canceled: Math.max(0, Math.min(summary.promptCount, Math.floor(Number(patch.canceled ?? summary.canceled) || 0))),
    status: patch.status ? normalizePowerPrompterQueueHistoryStatus(patch.status) : summary.status,
  };
}

export function findStaleQueueHistoryEntries(
  document: PowerPrompterQueueHistoryDocument,
  items: PowerPrompterQueueHistorySummary[],
  activeHistoryIds: Set<string>
): PowerPrompterQueueHistorySummary[] {
  const fileKey = String(document.file || '').trim();
  return (Array.isArray(items) ? items : []).filter((entry) => {
    if (!entry?.id || entry.id === document.id || activeHistoryIds.has(entry.id)) return false;
    if (entry.status !== 'running' && entry.status !== 'queued') return false;
    if (String(entry.file || '').trim() !== fileKey) return false;
    if (clampQueueSetId(entry.activeSetId) !== clampQueueSetId(document.activeSetId)) return false;
    if (entry.mode !== document.mode) return false;
    return true;
  });
}
