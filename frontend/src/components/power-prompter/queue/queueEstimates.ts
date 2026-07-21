import type { PowerPrompterCardDocument } from '@/types/powerPrompter';
import {
  QUEUE_DIVERSITY_MIN,
  clampQueueSetId,
} from '@/components/power-prompter/queue/queueCore';
import type { QueueEditorDraft } from '@/components/power-prompter/queue/queueCore';
import { normalizeQueueEditorBuildSettings } from '@/components/power-prompter/queue/queuePersistence';
import { buildQueuePromptsFromCards } from '@/components/power-prompter/queue/queuePromptBuilder';

export interface PowerPrompterQueueEstimate {
  setPrompts: string[];
  setPromptEntries: [];
  setCyclePrompts: string[];
  setCyclePromptEntries: [];
  setPromptCount: number;
  setCyclePromptCount: number;
  setAvailablePromptCount: number;
  setImageCount: number;
  setTruncated: boolean;
  allPromptCount: number;
  allImageCount: number;
  allTruncated: boolean;
  appliedPromptLimit: number;
}

export interface BuildPowerPrompterQueueEstimateOptions {
  cardDocument: PowerPrompterCardDocument;
  queueSetTarget: number;
  queueTraversalMode: string;
  queueDiversity: number;
  queuePromptLimit: number;
  queueShuffleEnabled: boolean;
  queueShuffleSeed?: string;
  estimatedBatchSize: number;
}

export interface BuildPowerPrompterQueueEditorEstimateOptions {
  queueEditorDocument: PowerPrompterCardDocument;
  queueEditorDraft: QueueEditorDraft | null;
  queueSetTarget: number;
  estimatedBatchSize: number;
}

export function createEmptyPowerPrompterQueueEstimate(
  appliedPromptLimit = 0,
  estimatedBatchSize = 1
): PowerPrompterQueueEstimate {
  return {
    setPrompts: [],
    setPromptEntries: [],
    setCyclePrompts: [],
    setCyclePromptEntries: [],
    setPromptCount: 0,
    setCyclePromptCount: 0,
    setAvailablePromptCount: 0,
    setImageCount: 0 * estimatedBatchSize,
    setTruncated: false,
    allPromptCount: 0,
    allImageCount: 0,
    allTruncated: false,
    appliedPromptLimit,
  };
}

export function buildPowerPrompterQueueEstimate({
  cardDocument,
  queueSetTarget,
  queueTraversalMode,
  queueDiversity,
  queuePromptLimit,
  queueShuffleEnabled,
  queueShuffleSeed,
  estimatedBatchSize,
}: BuildPowerPrompterQueueEstimateOptions): PowerPrompterQueueEstimate {
  const setModeAvailableCounted = buildQueuePromptsFromCards(cardDocument, 'selected', {
    setIdOverride: queueSetTarget,
    traversalMode: queueTraversalMode as any,
    diversity: queueDiversity,
    promptLimit: Number.MAX_SAFE_INTEGER,
    shuffleEnabled: queueShuffleEnabled,
    shuffleSeed: queueShuffleSeed,
    countOnly: true,
  });
  const setCounted = buildQueuePromptsFromCards(cardDocument, 'selected', {
    setIdOverride: queueSetTarget,
    traversalMode: queueTraversalMode as any,
    diversity: queueDiversity,
    promptLimit: queuePromptLimit,
    shuffleEnabled: queueShuffleEnabled,
    shuffleSeed: queueShuffleSeed,
    countOnly: true,
  });
  const setCycleCounted = buildQueuePromptsFromCards(cardDocument, 'selected', {
    setIdOverride: queueSetTarget,
    traversalMode: 'cycle',
    diversity: QUEUE_DIVERSITY_MIN,
    promptLimit: queuePromptLimit,
    shuffleEnabled: queueShuffleEnabled,
    shuffleSeed: queueShuffleSeed,
    countOnly: true,
  });
  const allCounted = buildQueuePromptsFromCards(cardDocument, 'variants', {
    setIdOverride: queueSetTarget,
    includeAllSets: true,
    traversalMode: queueTraversalMode as any,
    diversity: queueDiversity,
    promptLimit: queuePromptLimit,
    shuffleEnabled: queueShuffleEnabled,
    shuffleSeed: queueShuffleSeed,
    countOnly: true,
  });
  const setPromptCount = setCounted.estimatedPromptCount ?? 0;
  const allPromptCount = allCounted.estimatedPromptCount ?? 0;
  const setCyclePromptCount = setCycleCounted.estimatedPromptCount ?? 0;
  const setAvailablePromptCount = setModeAvailableCounted.estimatedPromptCount ?? 0;
  return {
    setPrompts: [],
    setPromptEntries: [],
    setCyclePrompts: [],
    setCyclePromptEntries: [],
    setPromptCount,
    setCyclePromptCount,
    setAvailablePromptCount,
    setImageCount: setPromptCount * estimatedBatchSize,
    setTruncated: setCounted.truncated,
    allPromptCount,
    allImageCount: allPromptCount * estimatedBatchSize,
    allTruncated: allCounted.truncated,
    appliedPromptLimit: queuePromptLimit,
  };
}

export function buildPowerPrompterQueueEditorEstimate({
  queueEditorDocument,
  queueEditorDraft,
  queueSetTarget,
  estimatedBatchSize,
}: BuildPowerPrompterQueueEditorEstimateOptions): PowerPrompterQueueEstimate {
  const buildSettings = normalizeQueueEditorBuildSettings(queueEditorDraft?.queueBuildSettings);
  const targetSetId = clampQueueSetId(queueEditorDraft?.activeSetId ?? queueSetTarget);
  const safePromptLimit = buildSettings.promptLimit
    ?? Math.max(1, Math.floor(Number(queueEditorDraft?.originalPromptCount) || 1));
  const setModeAvailableCounted = buildQueuePromptsFromCards(queueEditorDocument, 'selected', {
    setIdOverride: targetSetId,
    traversalMode: buildSettings.traversalMode,
    diversity: buildSettings.diversity,
    promptLimit: Number.MAX_SAFE_INTEGER,
    shuffleEnabled: buildSettings.shuffleEnabled,
    shuffleSeed: buildSettings.shuffleSeed,
    countOnly: true,
  });
  const setCounted = buildQueuePromptsFromCards(queueEditorDocument, 'selected', {
    setIdOverride: targetSetId,
    traversalMode: buildSettings.traversalMode,
    diversity: buildSettings.diversity,
    promptLimit: safePromptLimit,
    shuffleEnabled: buildSettings.shuffleEnabled,
    shuffleSeed: buildSettings.shuffleSeed,
    countOnly: true,
  });
  const setCycleCounted = buildQueuePromptsFromCards(queueEditorDocument, 'selected', {
    setIdOverride: targetSetId,
    traversalMode: 'cycle',
    diversity: QUEUE_DIVERSITY_MIN,
    promptLimit: safePromptLimit,
    shuffleEnabled: buildSettings.shuffleEnabled,
    shuffleSeed: buildSettings.shuffleSeed,
    countOnly: true,
  });
  const allCounted = buildQueuePromptsFromCards(queueEditorDocument, 'variants', {
    setIdOverride: targetSetId,
    includeAllSets: true,
    traversalMode: buildSettings.traversalMode,
    diversity: buildSettings.diversity,
    promptLimit: safePromptLimit,
    shuffleEnabled: buildSettings.shuffleEnabled,
    shuffleSeed: buildSettings.shuffleSeed,
    countOnly: true,
  });
  const setPromptCount = setCounted.estimatedPromptCount ?? 0;
  const allPromptCount = allCounted.estimatedPromptCount ?? 0;
  const setCyclePromptCount = setCycleCounted.estimatedPromptCount ?? 0;
  const setAvailablePromptCount = setModeAvailableCounted.estimatedPromptCount ?? 0;
  return {
    setPrompts: [],
    setPromptEntries: [],
    setCyclePrompts: [],
    setCyclePromptEntries: [],
    setPromptCount,
    setCyclePromptCount,
    setAvailablePromptCount,
    setImageCount: setPromptCount * estimatedBatchSize,
    setTruncated: setCounted.truncated,
    allPromptCount,
    allImageCount: allPromptCount * estimatedBatchSize,
    allTruncated: allCounted.truncated,
    appliedPromptLimit: safePromptLimit,
  };
}
