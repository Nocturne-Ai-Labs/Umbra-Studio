import {
  createUmbraCanvasImageAsset,
  type UmbraCanvasPendingJob,
  type UmbraCanvasRect,
  type UmbraCanvasStage,
} from './umbraUiCanvasDocument';
import {
  buildUmbraUiInpaintOutputPath,
  buildUmbraUiInpaintOutputUrl,
  isUmbraUiInpaintJobTerminal,
  UmbraUiInpaintRequestError,
  type UmbraUiInpaintJob,
} from './umbraUiInpaint';

export interface UmbraUiInpaintStageContext {
  region: UmbraCanvasRect;
  maskDataUrl: string;
}

export type UmbraUiInpaintRecoveryErrorDisposition = 'aborted' | 'missing' | 'retry';

export interface UmbraUiInpaintTerminalTransition {
  removePendingJobId: string;
  remainingPendingJobIds: string[];
  nextPendingJobId: string;
  shouldClearActiveJob: boolean;
}

const ACTIVE_STATUS_RANK: Record<UmbraUiInpaintJob['status'], number> = {
  staging: 0,
  queued: 1,
  running: 2,
  completed: 3,
  partial: 3,
  failed: 3,
  canceled: 3,
};

export function selectUmbraUiInpaintRecoveryTarget(
  pendingJobs: readonly UmbraCanvasPendingJob[],
  activeJob: UmbraUiInpaintJob | null,
): UmbraCanvasPendingJob | null {
  if (activeJob || pendingJobs.length === 0) return null;
  return pendingJobs[0] || null;
}

export function classifyUmbraUiInpaintRecoveryError(error: unknown): UmbraUiInpaintRecoveryErrorDisposition {
  const name = error && typeof error === 'object' && 'name' in error
    ? String((error as { name?: unknown }).name || '')
    : '';
  if (name === 'AbortError') return 'aborted';
  if (error instanceof UmbraUiInpaintRequestError && error.status === 404) return 'missing';
  return 'retry';
}

export function getUmbraUiInpaintRecoveryRetryDelay(attempts: number): number {
  const safeAttempts = Math.max(1, Math.floor(Number(attempts) || 1));
  return Math.min(10_000, 1000 * 2 ** Math.min(safeAttempts, 4));
}

export function reconcileUmbraUiInpaintJobSnapshot(
  current: UmbraUiInpaintJob | null,
  incoming: UmbraUiInpaintJob,
): UmbraUiInpaintJob | null {
  if (!current || current.id !== incoming.id) return current;
  if (isUmbraUiInpaintJobTerminal(current)) return current;
  if (isUmbraUiInpaintJobTerminal(incoming)) return incoming;
  if (incoming.updatedAt < current.updatedAt) return current;

  if (incoming.updatedAt === current.updatedAt) {
    const currentProgress = current.completed + current.failed;
    const incomingProgress = incoming.completed + incoming.failed;
    if (incomingProgress < currentProgress) return current;
    if (incomingProgress === currentProgress && ACTIVE_STATUS_RANK[incoming.status] < ACTIVE_STATUS_RANK[current.status]) {
      return current;
    }
  }

  return incoming;
}

export function resolveUmbraUiInpaintTerminalTransition(
  job: UmbraUiInpaintJob,
  pendingJobs: readonly Pick<UmbraCanvasPendingJob, 'id'>[],
): UmbraUiInpaintTerminalTransition | null {
  if (!isUmbraUiInpaintJobTerminal(job)) return null;
  if (getUmbraUiInpaintTerminalMaterializationIssue(job)) return null;
  const remainingPendingJobIds = pendingJobs
    .filter((pending) => pending.id !== job.id)
    .map((pending) => pending.id);
  return {
    removePendingJobId: job.id,
    remainingPendingJobIds,
    nextPendingJobId: remainingPendingJobIds[0] || '',
    shouldClearActiveJob: remainingPendingJobIds.length > 0,
  };
}

export function getUmbraUiInpaintTerminalMaterializationIssue(job: UmbraUiInpaintJob): string {
  if (!isUmbraUiInpaintJobTerminal(job)) return '';
  if (!Number.isInteger(job.total) || job.total <= 0 || job.total !== job.items.length) {
    return 'The terminal job total does not match its persisted sample records.';
  }

  const itemIds = new Set<string>();
  const outputPaths = new Set<string>();
  let completed = 0;
  let failed = 0;
  let canceled = 0;
  for (const item of job.items) {
    const itemId = String(item.id || '').trim();
    if (!itemId) return 'A persisted sample is missing its stable identity.';
    if (itemIds.has(itemId)) return `Persisted sample identity ${itemId} is duplicated.`;
    itemIds.add(itemId);

    if (item.status === 'completed') completed += 1;
    else if (item.status === 'failed') failed += 1;
    else if (item.status === 'canceled') canceled += 1;
    else return `Terminal sample ${itemId} is still marked ${item.status}.`;
  }

  if (completed !== job.completed) {
    return 'The completed sample count does not match the persisted sample records.';
  }
  if (failed !== job.failed) {
    return 'The failed sample count does not match the persisted sample records.';
  }
  if (completed + failed + canceled !== job.total) {
    return 'The terminal sample states do not account for the complete job.';
  }
  if (job.status === 'completed' && completed !== job.total) {
    return 'The completed job still contains non-completed samples.';
  }
  if (job.status === 'partial' && (completed <= 0 || completed >= job.total)) {
    return 'The partial job does not contain both completed and unfinished samples.';
  }
  if (job.status === 'failed' && (completed > 0 || failed <= 0)) {
    return 'The failed job has inconsistent terminal sample states.';
  }

  const completedItems = job.items.filter((item) => item.status === 'completed');
  for (const item of completedItems) {
    if (item.outputs.length <= 0) return `Completed sample ${item.id} has no saved output to stage.`;
    for (const output of item.outputs) {
      const path = buildUmbraUiInpaintOutputPath(output);
      if (!path) return `Completed sample ${item.id} has an invalid saved output path.`;
      const pathKey = path.replace(/\\/g, '/').toLowerCase();
      if (outputPaths.has(pathKey)) return `Saved output ${path} is duplicated in the terminal job.`;
      outputPaths.add(pathKey);
    }
  }
  return '';
}

export function buildUmbraUiInpaintOutputStages(
  job: UmbraUiInpaintJob,
  context: UmbraUiInpaintStageContext,
): UmbraCanvasStage[] {
  const stages: UmbraCanvasStage[] = [];
  for (const item of job.items) {
    if (item.status !== 'completed') continue;
    for (let outputIndex = 0; outputIndex < item.outputs.length; outputIndex += 1) {
      const output = item.outputs[outputIndex];
      const path = buildUmbraUiInpaintOutputPath(output);
      if (!path) continue;
      stages.push({
        id: `${job.id}:${item.id}:${outputIndex}`,
        jobId: job.id,
        itemId: item.id,
        name: output.filename || `Sample ${item.id}`,
        asset: createUmbraCanvasImageAsset({
          name: output.filename || `Sample ${item.id}`,
          path,
          imageUrl: buildUmbraUiInpaintOutputUrl(output, job.updatedAt),
          width: context.region.width,
          height: context.region.height,
          seed: item.seed,
        }),
        seed: item.seed,
        region: context.region,
        maskDataUrl: context.maskDataUrl,
        createdAt: job.updatedAt,
      });
    }
  }
  return stages;
}
