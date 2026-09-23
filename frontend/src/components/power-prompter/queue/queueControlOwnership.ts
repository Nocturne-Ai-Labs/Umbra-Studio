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
