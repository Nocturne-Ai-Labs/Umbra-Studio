import { isLocalStagedQueueRequestId } from './queueCore';

type QueueRow = { requestId: string; exiting: boolean };

export function hasQueueSnapshotForCurrentSocket(
  websocketReady: boolean,
  currentSocket: object | null,
  snapshotSocket: object | null,
  pendingBatchAdmissions = 0,
): boolean {
  return websocketReady && currentSocket !== null && currentSocket === snapshotSocket
    && pendingBatchAdmissions <= 0;
}

export function shouldBlockStageForPausedBackendQueue(
  paused: boolean,
  backendRequestIds: ReadonlySet<string>,
): boolean {
  return paused && backendRequestIds.size > 0;
}

export function shouldBlockLocalStageWithBackendQueue(
  willAppendToBackendQueue: boolean,
  backendRequestIds: ReadonlySet<string>,
): boolean {
  return !willAppendToBackendQueue && backendRequestIds.size > 0;
}

export function planLocalQueueStage<T extends QueueRow>(input: {
  currentItems: readonly T[];
  stagedItems: readonly T[];
  paused: boolean;
  backendRequestIds: ReadonlySet<string>;
}): { preserveExisting: boolean; items: T[] } {
  const preserveExisting = input.backendRequestIds.size > 0 || (
    input.paused && input.currentItems.some((item) =>
      !item.exiting && isLocalStagedQueueRequestId(item.requestId)
    )
  );
  return {
    preserveExisting,
    items: preserveExisting
      ? [...input.currentItems, ...input.stagedItems]
      : [...input.stagedItems],
  };
}

export function isLocalOnlyPausedQueue(input: {
  paused: boolean;
  visualRequestId: string;
  hasVisualMeta: boolean;
  hasSnapshot: boolean;
  backendRequestIds: ReadonlySet<string>;
}): boolean {
  if (!input.paused || input.backendRequestIds.size > 0) return false;
  const looksLikePausedVisual = input.visualRequestId.startsWith('paused-');
  const looksLikeStagedVisual = input.visualRequestId.startsWith('staged-');
  return (input.hasSnapshot || looksLikePausedVisual || looksLikeStagedVisual)
    && (!input.hasVisualMeta || looksLikePausedVisual || looksLikeStagedVisual);
}

export function collectQueueControlRequestIds(input: {
  items: readonly { requestId: string }[];
  visualRequestId: string;
  pendingRequestIds: Iterable<string>;
  metadataRequestIds: Iterable<string>;
  backendRequestIds: Iterable<string>;
}): string[] {
  const ids = new Set<string>();
  const add = (value: string) => {
    const id = String(value || '').trim();
    if (id) ids.add(id);
  };
  for (const item of input.items) add(item.requestId);
  add(input.visualRequestId);
  for (const id of input.pendingRequestIds) add(id);
  for (const id of input.metadataRequestIds) add(id);
  for (const id of input.backendRequestIds) add(id);
  return [...ids];
}

export function hasOnlyLocalStagedQueue(staged: boolean, backendRequestIds: ReadonlySet<string>): boolean {
  return staged && backendRequestIds.size === 0;
}

export function resolveActiveQueueControlRequestId(
  visualRequestId: string,
  backendActivePromptRequestIds: ReadonlySet<string>,
  bridgeActiveRequestIds: readonly string[],
): string {
  const requestId = String(visualRequestId || '').trim();
  return requestId && (
    backendActivePromptRequestIds.has(requestId)
    || bridgeActiveRequestIds.some((id) => String(id || '').trim() === requestId)
  ) ? requestId : '';
}

type BackendQueueControlResult = {
  success?: boolean;
  backendHandled?: boolean;
  noSubmittedPrompt?: boolean;
  requestIds?: unknown;
  clearedRequestIds?: unknown;
  canceledBatchRequestIds?: unknown;
};

function affectedQueueControlRequestIds(result: BackendQueueControlResult, action: 'cancel' | 'clear'): Set<string> {
  const raw = action === 'clear' ? result.clearedRequestIds : result.requestIds;
  return new Set(Array.isArray(raw) ? raw.map((entry) => String(entry || '').trim()).filter(Boolean) : []);
}

export function hasAcknowledgedPendingBatchControl(input: {
  result: BackendQueueControlResult;
  action: 'cancel' | 'clear';
  pendingBatchRequestId: string;
  pendingBatchGroupRequestIds: Iterable<string>;
}): boolean {
  if (!input.pendingBatchRequestId) return true;
  if (input.result.success !== true || input.result.backendHandled !== true) return false;
  const canceledBatchIds = Array.isArray(input.result.canceledBatchRequestIds)
    ? input.result.canceledBatchRequestIds
    : [];
  if (canceledBatchIds.includes(input.pendingBatchRequestId)) return true;
  const affected = affectedQueueControlRequestIds(input.result, input.action);
  const groupIds = Array.from(input.pendingBatchGroupRequestIds);
  return groupIds.length > 0 && groupIds.every((requestId) => affected.has(requestId));
}

export function hasAcknowledgedUnsubmittedQueueControl(input: {
  result: BackendQueueControlResult;
  action: 'cancel' | 'clear';
  backendRequestIds: Iterable<string>;
  pendingBatchRequestId: string;
  pendingBatchGroupRequestIds: Iterable<string>;
}): boolean {
  const { result } = input;
  if (result.success !== true || result.backendHandled !== true || result.noSubmittedPrompt !== true) return false;
  const affected = affectedQueueControlRequestIds(result, input.action);
  for (const requestId of input.backendRequestIds) {
    if (!affected.has(requestId)) return false;
  }
  return hasAcknowledgedPendingBatchControl(input);
}

export function resolveQueueStartStopDisposition(input: {
  startSequence: number;
  confirmedStopSequence: number;
  failedStopSequence: number;
  stopInFlight: boolean;
}): { suppressStartError: boolean; restorePaused: boolean; keepStopBusy: boolean } {
  const suppressStartError = input.startSequence > 0
    && input.confirmedStopSequence === input.startSequence;
  return {
    suppressStartError,
    restorePaused: suppressStartError && input.failedStopSequence === input.startSequence,
    keepStopBusy: input.stopInFlight,
  };
}
