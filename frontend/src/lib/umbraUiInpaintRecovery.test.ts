import { describe, expect, test } from 'bun:test';
import {
  createUmbraCanvasDocument,
  createUmbraCanvasImageAsset,
  umbraCanvasDocumentReducer,
  type UmbraCanvasPendingJob,
} from './umbraUiCanvasDocument';
import {
  buildUmbraUiInpaintOutputStages,
  classifyUmbraUiInpaintRecoveryError,
  getUmbraUiInpaintTerminalMaterializationIssue,
  getUmbraUiInpaintRecoveryRetryDelay,
  reconcileUmbraUiInpaintJobSnapshot,
  resolveUmbraUiInpaintTerminalTransition,
  selectUmbraUiInpaintRecoveryTarget,
} from './umbraUiInpaintRecovery';
import { UmbraUiInpaintRequestError, type UmbraUiInpaintJob } from './umbraUiInpaint';

function createPendingJob(id: string, createdAt: number): UmbraCanvasPendingJob {
  return {
    id,
    region: { x: 32, y: 48, width: 512, height: 384 },
    maskDataUrl: `blob:${id}-mask`,
    createdAt,
  };
}

function createJob(
  status: UmbraUiInpaintJob['status'],
  options: Partial<UmbraUiInpaintJob> = {},
): UmbraUiInpaintJob {
  const itemStatus = status === 'completed'
    ? 'completed'
    : status === 'canceled'
      ? 'canceled'
      : status === 'failed'
        ? 'failed'
        : status === 'running'
          ? 'running'
          : 'queued';
  return {
    id: 'job-1',
    status,
    sourceName: 'source.png',
    workflowId: 'workflow-1',
    prompt: 'repair the image',
    width: 512,
    height: 384,
    total: 1,
    completed: status === 'completed' ? 1 : 0,
    failed: status === 'failed' ? 1 : 0,
    createdAt: 10,
    updatedAt: 20,
    items: [{
      id: 'item-1',
      seed: 1234,
      status: itemStatus,
      promptId: 'prompt-1',
      outputs: status === 'completed'
        ? [{ filename: 'sample.png', subfolder: 'Umbra UI/Inpaint', type: 'output', fullpath: 'Tools/ComfyUI/output/Umbra UI/Inpaint/sample.png' }]
        : [],
      error: status === 'failed' ? 'provider failed' : '',
    }],
    ...options,
  };
}

describe('Umbra UI inpaint recovery coordination', () => {
  test('recovers only the first pending job when there is no active job', () => {
    const pending = [createPendingJob('job-1', 10), createPendingJob('job-2', 20)];
    expect(selectUmbraUiInpaintRecoveryTarget(pending, null)?.id).toBe('job-1');
    expect(selectUmbraUiInpaintRecoveryTarget(pending, createJob('running'))).toBeNull();
    expect(selectUmbraUiInpaintRecoveryTarget([], null)).toBeNull();
  });

  test('distinguishes aborts, confirmed missing jobs, and retryable failures', () => {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    expect(classifyUmbraUiInpaintRecoveryError(abort)).toBe('aborted');
    expect(classifyUmbraUiInpaintRecoveryError(new UmbraUiInpaintRequestError('missing', 404))).toBe('missing');
    expect(classifyUmbraUiInpaintRecoveryError(new UmbraUiInpaintRequestError('busy', 503))).toBe('retry');
    expect(classifyUmbraUiInpaintRecoveryError(new TypeError('offline'))).toBe('retry');
  });

  test('uses bounded exponential retry delays without dropping the pointer', () => {
    expect([1, 2, 3, 4, 5, 12].map(getUmbraUiInpaintRecoveryRetryDelay)).toEqual([
      2_000,
      4_000,
      8_000,
      10_000,
      10_000,
      10_000,
    ]);
  });

  test('never resurrects a terminal canceled job with a stale running snapshot', () => {
    const canceled = createJob('canceled', { updatedAt: 40 });
    const staleRunning = createJob('running', { updatedAt: 50 });
    expect(reconcileUmbraUiInpaintJobSnapshot(canceled, staleRunning)).toBe(canceled);
  });

  test('accepts terminal snapshots but rejects older or regressive active snapshots', () => {
    const running = createJob('running', { updatedAt: 40 });
    const olderQueued = createJob('queued', { updatedAt: 30 });
    const sameTimeQueued = createJob('queued', { updatedAt: 40 });
    const completed = createJob('completed', { updatedAt: 35 });
    expect(reconcileUmbraUiInpaintJobSnapshot(running, olderQueued)).toBe(running);
    expect(reconcileUmbraUiInpaintJobSnapshot(running, sameTimeQueued)).toBe(running);
    expect(reconcileUmbraUiInpaintJobSnapshot(running, completed)).toBe(completed);
    expect(reconcileUmbraUiInpaintJobSnapshot(null, completed)).toBeNull();
  });

  test('clears only the matching terminal pointer and advances to the next job', () => {
    const pending = [
      createPendingJob('job-1', 10),
      createPendingJob('job-2', 20),
      createPendingJob('job-3', 30),
    ];
    const transition = resolveUmbraUiInpaintTerminalTransition(createJob('completed'), pending);
    expect(transition).toEqual({
      removePendingJobId: 'job-1',
      remainingPendingJobIds: ['job-2', 'job-3'],
      nextPendingJobId: 'job-2',
      shouldClearActiveJob: true,
    });
    expect(resolveUmbraUiInpaintTerminalTransition(createJob('running'), pending)).toBeNull();
  });

  test('keeps unrelated pointers when a middle job is confirmed terminal', () => {
    const pending = [
      createPendingJob('job-1', 10),
      createPendingJob('job-2', 20),
      createPendingJob('job-3', 30),
    ];
    const transition = resolveUmbraUiInpaintTerminalTransition(
      createJob('canceled', { id: 'job-2' }),
      pending,
    );
    expect(transition?.remainingPendingJobIds).toEqual(['job-1', 'job-3']);
    expect(transition?.nextPendingJobId).toBe('job-1');
  });

  test('materializes completed outputs for staging before terminal cleanup', () => {
    const job = createJob('completed');
    const context = {
      region: { x: 32, y: 48, width: 512, height: 384 },
      maskDataUrl: 'blob:job-1-mask',
    };
    const stages = buildUmbraUiInpaintOutputStages(job, context);
    const transition = resolveUmbraUiInpaintTerminalTransition(job, [createPendingJob('job-1', 10)]);
    expect(stages).toHaveLength(1);
    expect(stages[0]).toMatchObject({
      id: 'job-1:item-1:0',
      jobId: 'job-1',
      itemId: 'item-1',
      seed: 1234,
      region: context.region,
      maskDataUrl: context.maskDataUrl,
      asset: {
        path: 'Tools/ComfyUI/output/Umbra UI/Inpaint/sample.png',
        width: 512,
        height: 384,
      },
    });
    expect(transition?.removePendingJobId).toBe('job-1');
    expect(transition?.shouldClearActiveJob).toBe(false);
  });

  test('stages completed samples from a partial job and ignores failed samples', () => {
    const job = createJob('partial', {
      total: 2,
      completed: 1,
      failed: 1,
      items: [
        {
          id: 'item-1',
          seed: 1234,
          status: 'completed',
          promptId: 'prompt-1',
          outputs: [{ filename: 'recovered.png', subfolder: 'Umbra UI/inpainting', type: 'output', fullpath: '' }],
          error: '',
        },
        {
          id: 'item-2',
          seed: 1235,
          status: 'failed',
          promptId: '',
          outputs: [],
          error: 'provider failed',
        },
      ],
    });
    const stages = buildUmbraUiInpaintOutputStages(job, {
      region: { x: 0, y: 0, width: 512, height: 384 },
      maskDataUrl: 'blob:partial-mask',
    });
    expect(stages.map((stage) => stage.id)).toEqual(['job-1:item-1:0']);
    expect(resolveUmbraUiInpaintTerminalTransition(job, [createPendingJob('job-1', 10)])?.removePendingJobId).toBe('job-1');
  });

  test('stages a recovered partial job exactly once and removes only its recovery pointer', () => {
    const job = createJob('partial', {
      total: 2,
      completed: 1,
      failed: 1,
      items: [
        {
          id: 'item-completed',
          seed: 1234,
          status: 'completed',
          promptId: 'prompt-completed',
          outputs: [{ filename: 'recovered.png', subfolder: 'Umbra UI/inpainting', type: 'output', fullpath: '' }],
          error: '',
        },
        {
          id: 'item-failed',
          seed: 1235,
          status: 'failed',
          promptId: 'prompt-failed',
          outputs: [],
          error: 'provider failed',
        },
      ],
    });
    const context = {
      region: { x: 0, y: 0, width: 512, height: 384 },
      maskDataUrl: 'blob:partial-mask',
    };
    const source = createUmbraCanvasImageAsset({
      name: 'source.png',
      path: 'source.png',
      imageUrl: '/source.png',
      width: 512,
      height: 384,
    });
    let document = createUmbraCanvasDocument(source);
    document = umbraCanvasDocumentReducer(document, { type: 'track_pending_job', job: createPendingJob('job-1', 10) })!;
    document = umbraCanvasDocumentReducer(document, { type: 'track_pending_job', job: createPendingJob('job-2', 20) })!;
    const stages = buildUmbraUiInpaintOutputStages(job, context);
    document = umbraCanvasDocumentReducer(document, { type: 'stage_outputs', stages })!;
    document = umbraCanvasDocumentReducer(document, { type: 'stage_outputs', stages })!;
    document = umbraCanvasDocumentReducer(document, { type: 'remove_pending_job', jobId: job.id })!;

    expect(document.staging.map((stage) => stage.id)).toEqual(['job-1:item-completed:0']);
    expect(document.pendingJobs.map((pending) => pending.id)).toEqual(['job-2']);
  });

  test('keeps recovery state when a terminal payload has inconsistent identities or counts', () => {
    const duplicateItems = createJob('partial', {
      total: 2,
      completed: 1,
      failed: 1,
      items: [
        createJob('completed').items[0],
        { ...createJob('failed').items[0], id: 'item-1' },
      ],
    });
    expect(getUmbraUiInpaintTerminalMaterializationIssue(duplicateItems)).toContain('duplicated');
    expect(resolveUmbraUiInpaintTerminalTransition(duplicateItems, [createPendingJob('job-1', 10)])).toBeNull();

    const mismatchedCounts = createJob('partial', {
      total: 2,
      completed: 2,
      failed: 0,
      items: [
        createJob('completed').items[0],
        { ...createJob('failed').items[0], id: 'item-2' },
      ],
    });
    expect(getUmbraUiInpaintTerminalMaterializationIssue(mismatchedCounts)).toContain('completed sample count');
    expect(resolveUmbraUiInpaintTerminalTransition(mismatchedCounts, [createPendingJob('job-1', 10)])).toBeNull();
  });

  test('preserves the recovery pointer when a completed output cannot be staged', () => {
    const job = createJob('completed', {
      items: [{
        id: 'item-1',
        seed: 1234,
        status: 'completed',
        promptId: 'prompt-1',
        outputs: [{ filename: '', subfolder: '', type: 'output', fullpath: '' }],
        error: '',
      }],
    });
    expect(getUmbraUiInpaintTerminalMaterializationIssue(job)).toContain('invalid saved output path');
    expect(buildUmbraUiInpaintOutputStages(job, {
      region: { x: 0, y: 0, width: 512, height: 384 },
      maskDataUrl: 'blob:invalid-mask',
    })).toEqual([]);
    expect(resolveUmbraUiInpaintTerminalTransition(job, [createPendingJob('job-1', 10)])).toBeNull();
  });
});
