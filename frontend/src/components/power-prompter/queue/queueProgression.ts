import type { QueueStackItem } from './queueCore';

export type NormalizedGenerationPreviewEvent = {
  requestId: string;
  promptId: string;
  promptIndex: number;
  imageDataUrl: string;
  step: number;
  maxStep: number;
};

export type NormalizedQueueProgressEvent = {
  requestId: string;
  promptIndex: number;
  promptId: string;
  hasPromptSeed: boolean;
  promptSeed: number;
};

export type NormalizedJobProgressEvent = {
  requestId: string;
  promptIndex: number;
  progressRaw: number;
  progressMaxRaw: number;
  progress: number;
};

export type NormalizedQueueResultEvent = {
  requestId: string;
  success: boolean;
  errorMessage: string;
  promptIds: string[];
  promptSeeds: number[];
};

export type NormalizedBridgeQueueState = {
  paused: boolean;
  pendingCount: number;
  activeRequestIds: string[];
  pendingRequestIds: string[];
};

export function normalizeRequestId(rawValue: unknown): string {
  return String(rawValue || '').trim();
}

export function normalizeRequestIdList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(
    input
      .map(normalizeRequestId)
      .filter((entry) => entry.length > 0)
  ));
}

export function getQueuePromptEventKey(requestIdInput: unknown, promptIndexInput: unknown): string {
  const requestId = normalizeRequestId(requestIdInput);
  const promptIndexRaw = Number(promptIndexInput);
  if (!requestId || !Number.isFinite(promptIndexRaw)) return '';
  return `${requestId}:${Math.max(0, Math.floor(promptIndexRaw))}`;
}

export function normalizeQueueEventPromptIndex(
  requestIdInput: unknown,
  promptIndexInput: unknown,
  options?: {
    promptCount?: number;
    runningPromptIndex?: number | null;
  }
): number {
  const requestId = normalizeRequestId(requestIdInput);
  const numeric = Number(promptIndexInput);
  const promptIndex = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
  if (!requestId) return promptIndex;
  const promptCount = Math.max(0, Math.floor(Number(options?.promptCount) || 0));
  if (promptCount <= 0 || promptIndex < promptCount) return promptIndex;
  const runningPromptIndex = Number(options?.runningPromptIndex);
  if (Number.isFinite(runningPromptIndex)) return Math.max(0, Math.floor(runningPromptIndex));
  return Math.max(0, promptCount - 1);
}

export function findRunningPromptIndex(items: QueueStackItem[], requestIdInput: unknown): number | null {
  const requestId = normalizeRequestId(requestIdInput);
  if (!requestId) return null;
  const runningItem = items.find((item) =>
    normalizeRequestId(item.requestId) === requestId
    && !item.exiting
    && item.status === 'running'
  );
  if (!runningItem) return null;
  return Math.max(0, Math.floor(Number(runningItem.promptIndex) || 0));
}

export function normalizeGenerationPreviewEvent(
  payload: Record<string, unknown>,
  promptIndex: number
): NormalizedGenerationPreviewEvent | null {
  const imageDataUrl = String(payload.imageDataUrl || payload.imageUrl || '').trim();
  if (!imageDataUrl) return null;
  const stepRaw = Number(payload.step ?? payload.progress);
  const maxStepRaw = Number(payload.maxStep ?? payload.progressMax ?? payload.max ?? payload.total);
  return {
    requestId: normalizeRequestId(payload.requestId),
    promptId: String(payload.promptId || '').trim(),
    promptIndex,
    imageDataUrl,
    step: Number.isFinite(stepRaw) ? Math.max(0, Math.floor(stepRaw)) : 0,
    maxStep: Number.isFinite(maxStepRaw) ? Math.max(0, Math.floor(maxStepRaw)) : 0,
  };
}

export function normalizeQueueProgressEvent(
  payload: Record<string, unknown>,
  promptIndex: number
): NormalizedQueueProgressEvent | null {
  const requestId = normalizeRequestId(payload.requestId);
  if (!requestId || promptIndex < 0) return null;
  const promptSeedRaw = Number(payload.seed);
  const hasPromptSeed = Number.isFinite(promptSeedRaw);
  return {
    requestId,
    promptIndex,
    promptId: String(payload.promptId || '').trim(),
    hasPromptSeed,
    promptSeed: hasPromptSeed ? Math.max(0, Math.floor(promptSeedRaw)) : 0,
  };
}

export function normalizeJobProgressEvent(
  payload: Record<string, unknown>,
  promptIndex: number
): NormalizedJobProgressEvent | null {
  const progressRaw = Number(payload.progress ?? payload.step);
  const progressMaxRaw = Number(payload.progressMax ?? payload.maxStep ?? payload.max ?? payload.total);
  if (!Number.isFinite(progressRaw)) return null;
  let normalizedProgress = progressRaw;
  if (Number.isFinite(progressMaxRaw) && progressMaxRaw > 0 && progressRaw > 1) {
    normalizedProgress = progressRaw / progressMaxRaw;
  } else if (progressRaw > 1 && progressRaw <= 100) {
    normalizedProgress = progressRaw / 100;
  }
  return {
    requestId: normalizeRequestId(payload.requestId),
    promptIndex,
    progressRaw,
    progressMaxRaw,
    progress: Math.max(0, Math.min(1, normalizedProgress)),
  };
}

export function normalizeQueueResultEvent(payload: Record<string, unknown>): NormalizedQueueResultEvent | null {
  const requestId = normalizeRequestId(payload.requestId);
  if (!requestId) return null;
  return {
    requestId,
    success: payload.success !== false,
    errorMessage: String(payload.error || (payload.success === false ? 'Queue failed.' : '')).trim(),
    promptIds: Array.isArray(payload.promptIds)
      ? payload.promptIds.map((entry: unknown) => String(entry || '').trim())
      : [],
    promptSeeds: Array.isArray(payload.promptSeeds)
      ? payload.promptSeeds.map((entry: unknown) => {
        const numeric = Number(entry);
        if (!Number.isFinite(numeric)) return 0;
        return Math.max(0, Math.floor(numeric));
      })
      : [],
  };
}

export function normalizeBridgeQueueState(
  payload: Record<string, unknown>,
  retiredRequestIds?: Set<string>
): NormalizedBridgeQueueState {
  const retired = retiredRequestIds || new Set<string>();
  const activeRequestIds = normalizeRequestIdList(payload.activeRequestIds)
    .filter((requestId) => !retired.has(requestId));
  const pendingRequestIds = normalizeRequestIdList(payload.pendingRequestIds)
    .filter((requestId) => !retired.has(requestId));
  return {
    paused: payload.paused === true,
    pendingCount: Math.max(0, Math.floor(Number(payload.pendingCount) || 0)),
    activeRequestIds,
    pendingRequestIds,
  };
}
