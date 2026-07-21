import type { PowerPrompterOutputPreviewItem } from '@/components/layout/PowerPrompterCardChainEditor';
import {
  clampQueueSetId,
} from '@/components/power-prompter/queue/queueCore';
import type {
  QueueManagerOutputBucket,
  QueueRequestGroup,
  QueueRequestMeta,
  QueueSetGroup,
  QueueStackItem,
  QueueVisualState,
} from '@/components/power-prompter/queue/queueCore';
import { getQueuePromptEventKey } from '@/components/power-prompter/queue/queueProgression';
import { getQueueManagerOutputBucketMeta } from '@/components/power-prompter/powerPrompterSupport';

export interface BuildQueueRequestGroupsOptions {
  queueStackItems: QueueStackItem[];
  queueRequestMeta: Map<string, QueueRequestMeta>;
  queueVisualState: QueueVisualState | null;
  clearedQueueRequestIds: Set<string>;
  completedPromptIndices: Map<string, Set<number>>;
  queuePromptStartedAt: Map<string, number>;
  queueRequestFirstPromptMs: Map<string, number>;
  queueDispatchDelayMs: number;
  queuePaused: boolean;
}

export interface ActiveQueuePosition {
  position: number;
  total: number;
  remaining: number;
}

export interface QueueTrackerSummary {
  totalLabel: string;
  nextLabel: string;
}

export function hasBackendQueueSnapshotMismatch({
  backendRequestIds,
  localStackItems,
  visualRequestId,
}: {
  backendRequestIds: Iterable<string>;
  localStackItems: QueueStackItem[];
  visualRequestId?: string | null;
}): boolean {
  const backendIds = new Set(
    Array.from(backendRequestIds || [])
      .map((requestId) => String(requestId || '').trim())
      .filter(Boolean)
  );
  const localLiveRequestIds = new Set(
    (localStackItems || [])
      .filter((item) => !item.exiting && (item.status === 'pending' || item.status === 'running'))
      .map((item) => String(item.requestId || '').trim())
      .filter(Boolean)
  );
  const normalizedVisualRequestId = String(visualRequestId || '').trim();
  return Array.from(localLiveRequestIds).some((requestId) => !backendIds.has(requestId))
    || (!!normalizedVisualRequestId && !backendIds.has(normalizedVisualRequestId));
}

export function getStaleBackendDrivenRequestIds({
  backendRequestIds,
  localStackItems,
  visualRequestId,
  isStagedRequestId,
}: {
  backendRequestIds: Iterable<string>;
  localStackItems: QueueStackItem[];
  visualRequestId?: string | null;
  isStagedRequestId?: (requestId: string) => boolean;
}): string[] {
  const backendIds = new Set(
    Array.from(backendRequestIds || [])
      .map((requestId) => String(requestId || '').trim())
      .filter(Boolean)
  );
  const isStaged = isStagedRequestId || (() => false);
  const stale = new Set<string>();
  for (const item of localStackItems || []) {
    const requestId = String(item.requestId || '').trim();
    if (!requestId || item.exiting || (item.status !== 'pending' && item.status !== 'running')) continue;
    if (backendIds.has(requestId) || isStaged(requestId)) continue;
    stale.add(requestId);
  }
  const normalizedVisualRequestId = String(visualRequestId || '').trim();
  if (
    normalizedVisualRequestId
    && !backendIds.has(normalizedVisualRequestId)
    && !isStaged(normalizedVisualRequestId)
  ) {
    stale.add(normalizedVisualRequestId);
  }
  return Array.from(stale);
}

export function buildQueueRequestGroups({
  queueStackItems,
  queueRequestMeta,
  queueVisualState,
  clearedQueueRequestIds,
  completedPromptIndices,
  queuePromptStartedAt,
  queueRequestFirstPromptMs,
  queueDispatchDelayMs,
  queuePaused,
}: BuildQueueRequestGroupsOptions): QueueRequestGroup[] {
  const byRequest = new Map<string, { createdAt: number; items: QueueStackItem[] }>();

  for (const item of queueStackItems) {
    const requestId = String(item.requestId || '').trim();
    if (!requestId) continue;
    if (item.exiting) continue;
    if (item.status !== 'pending' && item.status !== 'running') continue;
    const existing = byRequest.get(requestId);
    if (existing) {
      existing.items.push(item);
    } else {
      byRequest.set(requestId, { createdAt: Number(item.createdAt) || Date.now(), items: [item] });
    }
  }

  const groups: QueueRequestGroup[] = [];
  for (const [requestId, payload] of byRequest.entries()) {
    const groupItems = [...payload.items].sort((a, b) => {
      const createdDelta = (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
      if (createdDelta !== 0) return createdDelta;
      return Math.max(0, Math.floor(Number(a.promptIndex) || 0)) - Math.max(0, Math.floor(Number(b.promptIndex) || 0));
    });
    const activeGroupItems = groupItems;
    const meta = queueRequestMeta.get(requestId);
    const visual = queueVisualState && queueVisualState.requestId === requestId ? queueVisualState : null;
    const total = Math.max(
      1,
      Number(meta?.prompts?.length)
      || Number(visual?.prompts?.length)
      || activeGroupItems.length
      || groupItems.length
      || 0
    );
    const activePromptIndexToPosition = new Map<number, number>();
    activeGroupItems.forEach((item) => {
      const promptIndex = Math.max(0, Math.floor(Number(item.promptIndex) || 0));
      if (!activePromptIndexToPosition.has(promptIndex)) {
        activePromptIndexToPosition.set(promptIndex, Math.max(1, Math.min(total, promptIndex + 1)));
      }
    });
    const liveRunningPosition = (() => {
      const runningItem = activeGroupItems.find((item) => item.status === 'running');
      if (!runningItem) return 0;
      const promptIndex = Math.max(0, Math.floor(Number(runningItem.promptIndex) || 0));
      return activePromptIndexToPosition.get(promptIndex) || 0;
    })();
    const livePendingPosition = (() => {
      const pendingItem = activeGroupItems.find((item) => item.status === 'pending');
      if (!pendingItem) return 0;
      const promptIndex = Math.max(0, Math.floor(Number(pendingItem.promptIndex) || 0));
      return activePromptIndexToPosition.get(promptIndex) || 0;
    })();
    let running = 0;
    let pending = 0;
    for (const item of groupItems) {
      if (item.status === 'running') running += 1;
      else if (item.status === 'pending') pending += 1;
    }
    const completed = Math.max(0, Math.min(total, completedPromptIndices.get(requestId)?.size || 0));
    const failed = 0;
    if (clearedQueueRequestIds.has(requestId) && pending <= 0 && running <= 0) {
      continue;
    }
    const visualPosition = liveRunningPosition
      || livePendingPosition
      || (visual ? Math.max(1, Math.min(total, Math.floor(Number(visual.activeIndex) || 0) + 1)) : 0)
      || Math.max(1, Math.min(total, completed + failed + (running > 0 || pending > 0 ? 1 : 0)));
    const hasActiveWork = running > 0 || pending > 0;
    const progressUnits = hasActiveWork
      ? Math.max(completed + failed, visualPosition)
      : Math.max(0, completed + failed);
    const progressRatio = Math.max(0, Math.min(1, progressUnits / Math.max(1, total)));
    const firstPromptMs = queueRequestFirstPromptMs.get(requestId) ?? null;
    const completedOutputUnits = Math.max(0, Math.min(total, completed + failed));
    const remainingOutputUnits = Math.max(0, total - completedOutputUnits);
    const runningHasStarted = groupItems.some((item) => {
      if (item.exiting || item.status !== 'running') return false;
      return queuePromptStartedAt.has(getQueuePromptEventKey(item.requestId, item.promptIndex));
    });
    const dispatchDelayMs = Math.max(0, Math.floor(Number(meta?.dispatchDelayMs ?? queueDispatchDelayMs) || 0));
    const dispatchDelayUnits = dispatchDelayMs > 0 && remainingOutputUnits > 0
      ? Math.max(0, remainingOutputUnits - (running > 0 && runningHasStarted ? 1 : 0))
      : 0;
    const estimatedMsRemaining = firstPromptMs && remainingOutputUnits > 0
      ? Math.max(0, (remainingOutputUnits * firstPromptMs) + (dispatchDelayUnits * dispatchDelayMs))
      : (firstPromptMs && remainingOutputUnits <= 0 ? 0 : null);
    let statusLabel = 'Queued';
    if (running > 0) statusLabel = queuePaused ? 'Pausing' : 'Running';
    else if (pending > 0) statusLabel = queuePaused ? 'Paused' : 'Waiting';
    else if (failed > 0 && completed <= 0) statusLabel = 'Failed';
    else if (completed > 0) statusLabel = 'Done';

    groups.push({
      requestId,
      setId: clampQueueSetId(meta?.setId ?? visual?.activeSetId ?? 1),
      mode: meta?.mode || visual?.mode || 'selected',
      items: groupItems,
      total,
      completed,
      failed,
      running,
      pending,
      position: visualPosition,
      statusLabel,
      progressRatio,
      estimatedMsRemaining,
      firstPromptMs,
      createdAt: payload.createdAt,
    });
  }

  return groups.sort((a, b) => a.createdAt - b.createdAt);
}

export function buildQueueSetGroups(queueRequestGroups: QueueRequestGroup[], queuePaused: boolean): QueueSetGroup[] {
  const buckets: Array<{
    id: string;
    setId: number;
    groups: QueueRequestGroup[];
    total: number;
    completed: number;
    failed: number;
    running: number;
    pending: number;
    progressUnits: number;
    createdAt: number;
  }> = [];
  let activeBucket: (typeof buckets)[number] | null = null;

  for (const group of queueRequestGroups) {
    const setId = clampQueueSetId(group.setId);
    if (activeBucket && activeBucket.setId === setId) {
      activeBucket.groups.push(group);
      activeBucket.total += group.total;
      activeBucket.completed += group.completed;
      activeBucket.failed += group.failed;
      activeBucket.running += group.running;
      activeBucket.pending += group.pending;
      activeBucket.progressUnits += (group.progressRatio * group.total);
      activeBucket.createdAt = Math.min(activeBucket.createdAt, group.createdAt);
    } else {
      activeBucket = {
        id: `set-run-${setId}-${group.requestId}`,
        setId,
        groups: [group],
        total: group.total,
        completed: group.completed,
        failed: group.failed,
        running: group.running,
        pending: group.pending,
        progressUnits: group.progressRatio * group.total,
        createdAt: group.createdAt,
      };
      buckets.push(activeBucket);
    }
  }

  return buckets
    .map((bucket) => {
      const total = Math.max(1, bucket.total);
      const progressRatio = Math.max(0, Math.min(1, bucket.progressUnits / total));
      const hasActiveWork = bucket.running > 0 || bucket.pending > 0;
      const position = hasActiveWork
        ? Math.max(1, Math.min(total, Math.floor(bucket.progressUnits) + 1))
        : Math.max(0, Math.min(total, Math.round(bucket.progressUnits)));
      let statusLabel = 'Queued';
      if (bucket.running > 0) statusLabel = queuePaused ? 'Pausing' : 'Running';
      else if (bucket.pending > 0) statusLabel = queuePaused ? 'Paused' : 'Waiting';
      else if (bucket.failed > 0 && bucket.completed <= 0) statusLabel = 'Failed';
      else if (bucket.completed > 0) statusLabel = 'Done';
      return {
        id: bucket.id,
        setId: bucket.setId,
        groups: bucket.groups.sort((a, b) => a.createdAt - b.createdAt),
        total,
        completed: bucket.completed,
        failed: bucket.failed,
        running: bucket.running,
        pending: bucket.pending,
        position,
        statusLabel,
        progressRatio,
        createdAt: bucket.createdAt,
      } satisfies QueueSetGroup;
    });
}

export function buildQueueManagerStyleOptions(queueStackItems: QueueStackItem[]) {
  const byName = new Map<string, { name: string; count: number; running: number; pending: number; done: number; failed: number }>();
  for (const item of queueStackItems) {
    const name = String(item.styleName || item.styleFolderName || '').trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const existing = byName.get(key) || { name, count: 0, running: 0, pending: 0, done: 0, failed: 0 };
    existing.count += 1;
    if (!item.exiting && item.status === 'running') existing.running += 1;
    else if (!item.exiting && item.status === 'pending') existing.pending += 1;
    else if (item.status === 'queued') existing.done += 1;
    else if (item.status === 'failed') existing.failed += 1;
    byName.set(key, existing);
  }
  return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function buildActiveQueuePosition(queueVisualState: QueueVisualState | null): ActiveQueuePosition | null {
  if (!queueVisualState || queueVisualState.prompts.length <= 0) return null;
  const total = Math.max(1, queueVisualState.prompts.length);
  const position = Math.max(1, Math.min(total, Math.floor(queueVisualState.activeIndex || 0) + 1));
  return {
    position,
    total,
    remaining: Math.max(0, total - position),
  };
}

export function getQueueManagerActivePromptText(
  activeQueueItem: QueueStackItem | null,
  queueVisualState: QueueVisualState | null
): string {
  const activePrompt = String(activeQueueItem?.prompt || '').trim();
  if (activePrompt) return activePrompt;
  if (queueVisualState && queueVisualState.prompts.length > 0) {
    const activeIndex = Math.max(0, Math.min(queueVisualState.prompts.length - 1, Math.floor(queueVisualState.activeIndex || 0)));
    const queuedPrompt = String(queueVisualState.prompts[activeIndex] || '').trim();
    if (queuedPrompt) return queuedPrompt;
  }
  return '';
}

export function buildQueueManagerOutputBuckets(queueManagerMediaItems: PowerPrompterOutputPreviewItem[]): QueueManagerOutputBucket[] {
  const bucketMap = new Map<string, QueueManagerOutputBucket>();
  const addStyleCounts = (bucket: QueueManagerOutputBucket, styleLabels: string[]) => {
    for (const styleLabelRaw of styleLabels) {
      const styleLabel = String(styleLabelRaw || '').trim();
      if (!styleLabel) continue;
      const existingStyle = bucket.styleCounts.find((entry) => entry.label.toLowerCase() === styleLabel.toLowerCase());
      if (existingStyle) {
        existingStyle.count += 1;
      } else {
        bucket.styleCounts.push({ label: styleLabel, count: 1 });
      }
    }
    bucket.styleCounts.sort((a, b) => a.label.localeCompare(b.label));
  };
  queueManagerMediaItems.forEach((item) => {
    const meta = getQueueManagerOutputBucketMeta(item.path);
    const existing = bucketMap.get(meta.key);
    if (existing) {
      existing.items.push(item);
      for (const styleLabel of meta.styleLabels) {
        if (!existing.styleLabels.some((entry) => entry.toLowerCase() === styleLabel.toLowerCase())) {
          existing.styleLabels.push(styleLabel);
        }
      }
      addStyleCounts(existing, meta.styleLabels);
      return;
    }
    const bucket: QueueManagerOutputBucket = {
      key: meta.key,
      sortSetOrder: meta.setOrder,
      setLabel: meta.setLabel,
      groupLabel: meta.groupLabel,
      styleLabels: [...meta.styleLabels],
      styleCounts: [],
      items: [item],
    };
    addStyleCounts(bucket, meta.styleLabels);
    bucketMap.set(meta.key, bucket);
  });
  return Array.from(bucketMap.values()).sort((a, b) => {
    if (a.sortSetOrder !== b.sortSetOrder) return a.sortSetOrder - b.sortSetOrder;
    return a.key.localeCompare(b.key);
  });
}

export function buildQueueSummaryCounts(queueStackItems: QueueStackItem[]) {
  const counts = { queued: 0, running: 0, pending: 0, failed: 0 };
  for (const item of queueStackItems) {
    if (!item.exiting && item.status === 'queued') counts.queued += 1;
    else if (!item.exiting && item.status === 'running') counts.running += 1;
    else if (!item.exiting && item.status === 'pending') counts.pending += 1;
    else if (item.status === 'failed') counts.failed += 1;
  }
  return counts;
}

export function buildQueueTrackerSummary(
  queueSetGroups: QueueSetGroup[],
  queueRequestGroups?: QueueRequestGroup[],
): QueueTrackerSummary {
  const setGroupTotals = new Map<number, number>();
  for (const setGroup of queueSetGroups) {
    setGroupTotals.set(setGroup.setId, setGroup.groups.length);
  }
  const setGroupSeen = new Map<number, number>();
  const sourceGroups = Array.isArray(queueRequestGroups) && queueRequestGroups.length > 0
    ? queueRequestGroups
    : queueSetGroups.flatMap((setGroup) => setGroup.groups);
  const orderedGroups = sourceGroups.map((group) => {
    const setId = group.setId;
    const nextSeen = (setGroupSeen.get(setId) || 0) + 1;
    setGroupSeen.set(setId, nextSeen);
    return {
      setId,
      group,
      setGroupIndex: nextSeen - 1,
      setGroupTotal: setGroupTotals.get(setId) || nextSeen,
    };
  });
  if (orderedGroups.length <= 0) {
    return {
      totalLabel: '',
      nextLabel: '',
    };
  }
  const runningIndex = orderedGroups.findIndex(({ group }) => group.running > 0);
  const pendingIndex = orderedGroups.findIndex(({ group }) => group.pending > 0);
  const activeIndex = runningIndex >= 0 ? runningIndex : pendingIndex;
  const currentIndex = activeIndex >= 0 ? activeIndex : 0;
  const current = orderedGroups[currentIndex];
  const next = orderedGroups[currentIndex + 1] || null;
  return {
    totalLabel: `Queue ${currentIndex + 1}/${orderedGroups.length} · Set ${current.setId} Group ${current.setGroupIndex + 1}/${current.setGroupTotal}`,
    nextLabel: next
      ? `Next Set ${next.setId} Group ${next.setGroupIndex + 1}/${next.setGroupTotal}`
      : (current.group.running > 0 || current.group.pending > 0 ? 'Final Group In Queue' : 'Queue Complete'),
  };
}
