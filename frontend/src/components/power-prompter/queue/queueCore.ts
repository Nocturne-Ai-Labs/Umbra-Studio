import type { CSSProperties } from 'react';
import type {
  PowerPrompterCardDocument,
  PowerPrompterCardNode,
  PowerPrompterCardType,
  PowerPrompterQueueTraversalMode,
} from '@/types/powerPrompter';
import type { normalizePowerPrompterGenerationControls } from '@/lib/powerPrompter';
import { POWER_PROMPTER_MAX_QUEUE_CYCLE_WEIGHT, POWER_PROMPTER_MAX_QUEUE_SETS } from '@/lib/powerPrompter';
import type { PowerPrompterOutputPreviewItem } from '@/components/layout/PowerPrompterCardChainEditor';

export const QUEUE_MANAGER_DISPATCH_DELAY_OPTIONS = [
  { label: 'Instant', value: 0 },
  { label: '5s', value: 5000 },
  { label: '10s', value: 10000 },
  { label: '15s', value: 15000 },
  { label: '30s', value: 30000 },
  { label: '60s', value: 60000 },
  { label: '120s', value: 120000 },
  { label: '300s', value: 300000 },
  { label: '600s', value: 600000 },
] as const;

export const QUEUE_DIVERSITY_MIN = 0;
export const QUEUE_DIVERSITY_MAX = 100;
export const QUEUE_DIVERSITY_DECIMAL_SCALE = 100;
export const QUEUE_DIVERSITY_STEP = 1 / QUEUE_DIVERSITY_DECIMAL_SCALE;

export const QUEUE_MANAGER_PREVIEW_SPLIT_MIN = 0.34;
export const QUEUE_MANAGER_PREVIEW_SPLIT_MAX = 0.78;
export const DEFAULT_QUEUE_MANAGER_PREVIEW_SPLIT = 0.58;
export const QUEUE_MANAGER_PROMPT_ROW_VISIBILITY_STYLE = {
  contentVisibility: 'auto',
  containIntrinsicSize: '86px',
} as CSSProperties;

export const SET_COLOR_PALETTE = [
  '#22c55e',
  '#38bdf8',
  '#f59e0b',
  '#f43f5e',
  '#14b8a6',
  '#eab308',
  '#3b82f6',
  '#9ca3af',
  '#84cc16',
  '#a78bfa',
];

export type PowerPrompterQueueMode = 'prompt' | 'selected' | 'variants';
export type PowerPrompterPanelMode = 'editor' | 'preset-editor' | 'queue-manager' | 'queue-editor';
export type QueueManagerSequenceMode = 'default' | 'similar' | 'balanced' | 'unique';

export type QueueManagerOutputMenuState = {
  item: PowerPrompterOutputPreviewItem;
  x: number;
  y: number;
};

export type QueueManagerOutputBucket = {
  key: string;
  sortSetOrder: number;
  setLabel: string;
  groupLabel: string;
  styleLabels: string[];
  styleCounts: Array<{ label: string; count: number }>;
  items: PowerPrompterOutputPreviewItem[];
};

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

export type QueueStackItem = {
  id: string;
  requestId: string;
  promptIndex: number;
  prompt: string;
  styleName?: string;
  styleFolderName?: string;
  status: 'pending' | 'running' | 'queued' | 'failed';
  createdAt: number;
  exiting: boolean;
};

export type QueuePromptBlock = {
  slotId: string;
  variantId: string;
  cardLabel: string;
  variantLabel: string;
  promptText: string;
};

export type QueueRequestGroup = {
  requestId: string;
  setId: number;
  mode: PowerPrompterQueueMode;
  items: QueueStackItem[];
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  position: number;
  statusLabel: string;
  progressRatio: number;
  estimatedMsRemaining: number | null;
  firstPromptMs: number | null;
  createdAt: number;
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

export type PowerPrompterQueueTargetType = 'pipeline';

export type QueueRequestMeta = {
  mode: PowerPrompterQueueMode;
  setId: number;
  randomApplied: boolean;
  queueTargetType: PowerPrompterQueueTargetType;
  targetBridgeId: string;
  dispatchDelayMs: number;
  prompts: string[];
  promptEntries?: QueuePromptPreviewEntry[];
  promptSetIds: number[];
  promptOutputSubfolders: string[];
  promptStyleNames: string[];
  promptSeedGroupIds: string[];
  generationByPrompt: ReturnType<typeof normalizePowerPrompterGenerationControls>[];
  editorSnapshot?: PersistedQueueEditorSnapshot;
};

export type QueueEditorDraft = {
  requestId: string;
  label: string;
  mode: PowerPrompterQueueMode;
  activeSetId: number;
  sourceFile: string | null;
  originalPromptCount: number;
  queueBuildSettings: QueueEditorBuildSettings;
  sourceKind?: 'live' | 'history';
  historyDocumentId?: string;
};

export type QueueSetGroup = {
  id: string;
  setId: number;
  groups: QueueRequestGroup[];
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
  position: number;
  statusLabel: string;
  progressRatio: number;
  createdAt: number;
};

export type QueueManagerDragState = {
  kind: 'set' | 'group' | 'prompt';
  setGroupId?: string;
  setId?: number;
  requestId?: string;
  promptIndex?: number;
};

export type QueueVisualState = {
  requestId: string;
  mode: PowerPrompterQueueMode;
  activeSetId: number;
  prompts: string[];
  promptEntries?: QueuePromptPreviewEntry[];
  promptIds: string[];
  promptSeeds: number[];
  activeIndex: number;
  jobProgress: number;
  updatedAt?: number;
};

export type GenerationPreviewState = {
  requestId: string;
  promptId: string;
  promptIndex: number;
  prompt?: string;
  imageDataUrl: string;
  step: number;
  maxStep: number;
  status: 'running' | 'idle';
  updatedAt: number;
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
  generation: ReturnType<typeof normalizePowerPrompterGenerationControls>;
  generationByPrompt: ReturnType<typeof normalizePowerPrompterGenerationControls>[];
  randomApplied: boolean;
  paused: boolean;
  dispatchDelayMs: number;
  groupSnapshots?: PersistedQueueGroupSnapshot[];
};

export type SavedPowerPrompterQueueSummary = {
  id: string;
  name: string;
  savedAt: number;
  file: string | null;
  promptCount: number;
  activeSetId: number;
  mode: PowerPrompterQueueMode;
};

export type SavedPowerPrompterQueueDocument = {
  version: 1;
  id: string;
  name: string;
  savedAt: number;
  snapshot: PersistedPausedQueueSnapshot;
};

export type PowerPrompterQueueHistoryStatus = 'queued' | 'running' | 'completed' | 'canceled' | 'failed' | 'interrupted';

export type PowerPrompterQueueHistoryPreviewImage = {
  id: string;
  path: string;
  name: string;
  type: 'image' | 'video' | 'gif';
  mediaKind?: string;
  promptIndex?: number;
  promptId?: string;
  setId?: number;
  modified?: number;
};

export type PowerPrompterQueueHistorySummary = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  file: string | null;
  promptCount: number;
  completed: number;
  failed: number;
  canceled: number;
  activeSetId: number;
  mode: PowerPrompterQueueMode;
  status: PowerPrompterQueueHistoryStatus;
  outputFolders: string[];
  previewImages: PowerPrompterQueueHistoryPreviewImage[];
  hasEditorSnapshot: boolean;
};

export type PowerPrompterQueueHistoryDocument = PowerPrompterQueueHistorySummary & {
  version: 1;
  snapshot: PersistedPausedQueueSnapshot;
};

export type PowerPrompterQueueSessionState = {
  queueStackItems: QueueStackItem[];
  queueVisualState: QueueVisualState | null;
  generationPreview: GenerationPreviewState | null;
  queuePaused: boolean;
  queueRequestMeta: Map<string, QueueRequestMeta>;
  queueBridgeDispatchedRequestIds: Set<string>;
  restoredPausedQueue: PersistedPausedQueueSnapshot | null;
  completedPromptIndices: Map<string, Set<number>>;
  queuePromptStartedAt: Map<string, number>;
  queueRequestFirstPromptMs: Map<string, number>;
  queuePromptLastActivityAt: Map<string, number>;
  stalledQueuePromptKeys: Set<string>;
  clearedQueueRequestIds: Set<string>;
  staleQueueRequestIds: Set<string>;
  staleQueuePromptKeys: Set<string>;
  staleQueueEventTimers: Map<string, ReturnType<typeof setTimeout>>;
  bridgeQueueState: {
    paused: boolean;
    pendingCount: number;
    activeRequestIds: string[];
    pendingRequestIds: string[];
  };
};

export const powerPrompterQueueSession: PowerPrompterQueueSessionState = {
  queueStackItems: [],
  queueVisualState: null,
  generationPreview: null,
  queuePaused: false,
  queueRequestMeta: new Map<string, QueueRequestMeta>(),
  queueBridgeDispatchedRequestIds: new Set<string>(),
  restoredPausedQueue: null,
  completedPromptIndices: new Map<string, Set<number>>(),
  queuePromptStartedAt: new Map<string, number>(),
  queueRequestFirstPromptMs: new Map<string, number>(),
  queuePromptLastActivityAt: new Map<string, number>(),
  stalledQueuePromptKeys: new Set<string>(),
  clearedQueueRequestIds: new Set<string>(),
  staleQueueRequestIds: new Set<string>(),
  staleQueuePromptKeys: new Set<string>(),
  staleQueueEventTimers: new Map<string, ReturnType<typeof setTimeout>>(),
  bridgeQueueState: {
    paused: false,
    pendingCount: 0,
    activeRequestIds: [],
    pendingRequestIds: [],
  },
};

export function normalizeQueueManagerPreviewSplit(rawValue: unknown): number {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return DEFAULT_QUEUE_MANAGER_PREVIEW_SPLIT;
  return Math.min(QUEUE_MANAGER_PREVIEW_SPLIT_MAX, Math.max(QUEUE_MANAGER_PREVIEW_SPLIT_MIN, numeric));
}

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

export function getQueueDiversityFromTargetCount(cycleCount: number, exhaustiveCount: number, targetCount: number): number {
  const normalizedCycle = Math.max(0, Math.floor(Number(cycleCount) || 0));
  const normalizedExhaustive = Math.max(normalizedCycle, Math.floor(Number(exhaustiveCount) || 0));
  const normalizedTarget = Math.max(normalizedCycle, Math.min(normalizedExhaustive, Math.floor(Number(targetCount) || 0)));
  if (normalizedExhaustive <= normalizedCycle) return QUEUE_DIVERSITY_MIN;
  if (normalizedTarget <= normalizedCycle) return QUEUE_DIVERSITY_MIN;
  if (normalizedTarget >= normalizedExhaustive) return QUEUE_DIVERSITY_MAX;
  const ratio = (normalizedTarget - normalizedCycle) / (normalizedExhaustive - normalizedCycle);
  return normalizeQueueDiversity(ratio * 100, 'cycle');
}

export function getQueueDiversityLabel(diversity: number): string {
  const normalized = normalizeQueueDiversity(diversity);
  if (normalized <= 0) return 'Cycle';
  if (normalized >= 100) return 'Exhaustive';
  if (normalized < 34) return 'Low Variety';
  if (normalized < 67) return 'Balanced';
  return 'High Variety';
}

export function formatQueueDiversityPercent(diversity: number): string {
  return `${normalizeQueueDiversity(diversity).toFixed(2)}%`;
}

export function normalizeQueuePromptLimit(rawValue: unknown): number | null {
  if (rawValue === null || rawValue === undefined || String(rawValue).trim() === '') {
    return null;
  }
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

export function createQueueShuffleSeed(): number {
  return Math.min(Number.MAX_SAFE_INTEGER, Date.now() + Math.floor(Math.random() * 1000000));
}

export function createRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pp-queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createStagedQueueRequestId(): string {
  return `staged-${createRequestId()}`;
}

export function isLocalStagedQueueRequestId(rawValue: unknown): boolean {
  const requestId = String(rawValue || '').trim();
  return requestId.startsWith('staged-') || requestId.startsWith('paused-');
}

function hashQueueSignatureText(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function buildQueueSubmissionSignature(input: {
  file: string | null;
  mode: PowerPrompterQueueMode;
  setId: number;
  traversalMode: PowerPrompterQueueTraversalMode;
  diversity: number;
  promptLimit: number | null;
  shuffleEnabled: boolean;
  shuffleSeed: number;
  prompts: string[];
  promptSetIds: number[];
}): string {
  const promptHash = hashQueueSignatureText(input.prompts.join('\u001f'));
  const setHash = hashQueueSignatureText(input.promptSetIds.join(','));
  return [
    String(input.file || ''),
    input.mode,
    clampQueueSetId(input.setId),
    input.traversalMode,
    normalizeQueueDiversity(input.diversity, input.traversalMode),
    input.promptLimit ?? 'all',
    input.shuffleEnabled ? 'shuffle' : 'ordered',
    input.shuffleSeed,
    input.prompts.length,
    promptHash,
    setHash,
  ].join('|');
}

export function moveArrayEntry<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) return [...items];
  if (fromIndex < 0 || fromIndex >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return [...items];
  next.splice(Math.max(0, Math.min(next.length, toIndex)), 0, moved);
  return next;
}

export function formatQueueEtaDuration(ms: number | null | undefined): string {
  const numeric = Number(ms);
  if (!Number.isFinite(numeric) || numeric < 0) return '';
  const totalSeconds = Math.max(0, Math.ceil(numeric / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function normalizeQueueTargetType(_raw: unknown): PowerPrompterQueueTargetType {
  return 'pipeline';
}

export function hexToRgba(hexColor: string, alpha: number): string {
  const safe = String(hexColor || '').replace('#', '').trim();
  if (safe.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = Number.parseInt(safe.slice(0, 2), 16);
  const g = Number.parseInt(safe.slice(2, 4), 16);
  const b = Number.parseInt(safe.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return `rgba(255,255,255,${alpha})`;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getSetColor(setId: number): string {
  const idx = Math.max(0, Math.floor(Number(setId || 1)) - 1) % SET_COLOR_PALETTE.length;
  return SET_COLOR_PALETTE[idx];
}

export function clampQueueSetId(rawSetId: unknown, fallbackSetId = 1): number {
  const numeric = Number(rawSetId);
  if (!Number.isFinite(numeric)) {
    const fallback = Number(fallbackSetId);
    return Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(Number.isFinite(fallback) ? fallback : 1)));
  }
  return Math.max(1, Math.min(POWER_PROMPTER_MAX_QUEUE_SETS, Math.floor(numeric)));
}

export function applyQueueStackRunningState(items: QueueStackItem[]): QueueStackItem[] {
  let runningAssigned = false;
  return items.map((item) => {
    if (item.exiting || item.status === 'failed' || item.status === 'queued') return item;
    if (item.status === 'running' && !runningAssigned) {
      runningAssigned = true;
      return item;
    }
    return item.status === 'running' ? { ...item, status: 'pending' } : item;
  });
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
