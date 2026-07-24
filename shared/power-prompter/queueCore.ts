import type {
  PowerPrompterCardDocument,
  PowerPrompterCardType,
  PowerPrompterGenerationControls,
  PowerPrompterQueueTraversalMode,
} from './types';
import { POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, POWER_PROMPTER_MAX_QUEUE_SETS } from './powerPrompter';

export const QUEUE_DIVERSITY_MIN = 0;
export const QUEUE_DIVERSITY_MAX = 100;
export const QUEUE_DIVERSITY_DECIMAL_SCALE = 100;

export type PowerPrompterQueueMode = 'prompt' | 'selected' | 'variants';

export type QueuePromptToken = {
  text: string;
  slotId: string;
  slotLabel: string;
  slotType: PowerPrompterCardType;
  variantId: string;
  variantName: string;
  chainLinks: string[];
  blockLinks: string[];
};

export type QueuePromptBuildEntry = {
  prompt: string;
  tokens: QueuePromptToken[];
};

export type QueuePromptPreviewToken = {
  slotId: string;
  slotLabel?: string;
  slotType?: PowerPrompterCardType;
  variantId: string;
  variantName?: string;
  text?: string;
};

export type QueuePromptPreviewEntry = {
  prompt: string;
  tokens: QueuePromptPreviewToken[];
};

export type QueuePromptStyleMeta = {
  folderName: string;
  styleName: string;
  seedGroupId: string;
};

export type QueueEditorBuildSettings = {
  traversalMode: PowerPrompterQueueTraversalMode;
  diversity: number;
  promptLimit: number | null;
  shuffleEnabled: boolean;
  shuffleSeed: number;
};

export type PersistedQueueEditorSnapshot = {
  version: 1;
  sourceFile: string | null;
  document: PowerPrompterCardDocument;
  queueBuildSettings: QueueEditorBuildSettings;
};

export type PowerPrompterQueueTargetType = 'pipeline';

export type PersistedQueueGroupSnapshot = {
  id: string;
  requestId: string;
  label?: string;
  mode?: PowerPrompterQueueMode;
  activeSetId?: number;
  promptStartIndex: number;
  promptCount: number;
  promptIndices?: number[];
  editorSnapshot?: PersistedQueueEditorSnapshot;
};

export type PersistedPausedQueueSnapshot = {
  version: 1;
  snapshotSchemaVersion?: number;
  savedAt: number;
  file: string | null;
  mode: PowerPrompterQueueMode;
  activeSetId: number;
  queueTargetType: PowerPrompterQueueTargetType;
  targetBridgeId: string;
  requestIds: string[];
  prompts: string[];
  promptEntries?: QueuePromptPreviewEntry[];
  promptSetIds: number[];
  promptOutputSubfolders: string[];
  promptStyleNames: string[];
  promptSeedGroupIds: string[];
  generation: PowerPrompterGenerationControls;
  generationByPrompt: PowerPrompterGenerationControls[];
  randomApplied: boolean;
  paused: boolean;
  dispatchDelayMs: number;
  groupSnapshots?: PersistedQueueGroupSnapshot[];
};

export function normalizeQueueTraversalMode(rawMode: unknown): PowerPrompterQueueTraversalMode {
  const mode = String(rawMode || '').trim().toLowerCase();
  if (mode === 'exhaustive') return 'exhaustive';
  return 'cycle';
}

export function normalizeQueueDiversity(rawValue: unknown, fallbackMode?: unknown): number {
  const numeric = Number(rawValue);
  if (Number.isFinite(numeric)) {
    const clamped = Math.max(QUEUE_DIVERSITY_MIN, Math.min(QUEUE_DIVERSITY_MAX, numeric));
    return Math.round(clamped * QUEUE_DIVERSITY_DECIMAL_SCALE) / QUEUE_DIVERSITY_DECIMAL_SCALE;
  }
  const traversalMode = normalizeQueueTraversalMode(fallbackMode);
  return traversalMode === 'exhaustive' ? QUEUE_DIVERSITY_MAX : QUEUE_DIVERSITY_MIN;
}

export function resolveTraversalModeFromDiversity(diversity: number): PowerPrompterQueueTraversalMode {
  return normalizeQueueDiversity(diversity) >= QUEUE_DIVERSITY_MAX ? 'exhaustive' : 'cycle';
}

export function resolveQueueTraversalMode(rawMode: unknown, diversity: number): PowerPrompterQueueTraversalMode {
  const mode = normalizeQueueTraversalMode(rawMode);
  return mode === 'exhaustive' ? 'exhaustive' : resolveTraversalModeFromDiversity(diversity);
}

export function getQueueDiversityTargetCount(cycleCount: number, exhaustiveCount: number, diversity: number): number {
  const normalizedCycle = Math.max(0, Math.floor(Number(cycleCount) || 0));
  const normalizedExhaustive = Math.max(normalizedCycle, Math.floor(Number(exhaustiveCount) || 0));
  const ratio = normalizeQueueDiversity(diversity) / 100;
  if (ratio <= 0) return normalizedCycle;
  if (ratio >= 1) return normalizedExhaustive;
  return Math.max(
    normalizedCycle,
    Math.min(
      normalizedExhaustive,
      normalizedCycle + Math.round((normalizedExhaustive - normalizedCycle) * ratio)
    )
  );
}

export function normalizeQueuePromptLimit(rawValue: unknown): number | null {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') return null;
  const numeric = Math.floor(Number(rawValue));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.min(Number.MAX_SAFE_INTEGER, numeric);
}

export function stableShuffleQueueTokens<T>(tokens: T[], salt: string, getKey?: (token: T) => string): T[] {
  const hashValue = (input: string) => {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  return [...tokens]
    .map((token, index) => ({
      token,
      index,
      weight: hashValue(`${salt}|${index}|${getKey ? getKey(token) : String(token)}`),
    }))
    .sort((a, b) => {
      if (a.weight !== b.weight) return a.weight - b.weight;
      return a.index - b.index;
    })
    .map((entry) => entry.token);
}

export function clampQueueSetId(rawSetId: unknown, fallbackSetId = 1): number {
  const numeric = Number(rawSetId);
  if (!Number.isFinite(numeric)) {
    const fallback = Number(fallbackSetId);
    return Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number.isFinite(fallback) ? fallback : 1)));
  }
  return Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(numeric)));
}

export function normalizeQueueSetIds(rawSetIds: unknown, fallbackEnabled = true): number[] {
  if (!Array.isArray(rawSetIds)) return fallbackEnabled ? [1] : [];
  const normalized = Array.from(new Set(
    rawSetIds
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .map((value) => Math.floor(value))
      .filter((value) => value >= 1 && value <= POWER_PROMPTER_MAX_QUEUE_SETS)
  )).sort((a, b) => a - b);
  if (normalized.length === 0 && fallbackEnabled) return [1];
  return normalized;
}

export function normalizeRandomSetIds(rawSetIds: unknown): number[] {
  return normalizeQueueSetIds(rawSetIds, false);
}

export function normalizeQueueCycleWeights(rawWeights: unknown, allowedSetIds: number[]): Record<string, number> {
  if (!rawWeights || typeof rawWeights !== 'object' || Array.isArray(rawWeights)) return {};
  const allowed = new Set(allowedSetIds);
  if (allowed.size <= 0) return {};
  const normalized: Record<string, number> = {};
  for (const [rawKey, rawValue] of Object.entries(rawWeights as Record<string, unknown>)) {
    const setId = Math.floor(Number(rawKey));
    if (!Number.isFinite(setId) || !allowed.has(setId)) continue;
    const weight = Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, Math.floor(Number(rawValue) || 1)));
    if (weight <= 1) continue;
    normalized[String(setId)] = weight;
  }
  return normalized;
}
