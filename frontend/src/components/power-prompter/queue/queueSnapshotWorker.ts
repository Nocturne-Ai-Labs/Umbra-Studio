import type { MutableRefObject } from 'react';
import type {
  PowerPrompterCardDocument,
  PowerPrompterQueueTraversalMode,
} from '@/types/powerPrompter';
import type { PowerPrompterQueueMode } from './queueCore';
import type { PersistedPausedQueueSnapshot } from './queueCore';
import type {
  BuildPowerPrompterQueueEditorEstimateOptions,
  BuildPowerPrompterQueueEstimateOptions,
  PowerPrompterQueueEstimate,
} from './queueEstimates';
import {
  buildPowerPrompterQueueEditorEstimate,
  buildPowerPrompterQueueEstimate,
} from './queueEstimates';
import { buildQueuePromptsFromCards } from './queuePromptBuilder';

export type QueueSnapshotWorkerPending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  fallback: () => any;
  timer: ReturnType<typeof setTimeout>;
};

export interface QueuePromptBuildWorkerOptions {
  setIdOverride?: number;
  includeAllSets?: boolean;
  traversalMode?: PowerPrompterQueueTraversalMode;
  diversity?: number;
  promptLimit?: number | null;
  shuffleEnabled?: boolean;
  shuffleSeed?: number;
  countOnly?: boolean;
}

export type QueuePromptBuildWorkerResult = ReturnType<typeof buildQueuePromptsFromCards>;

function buildQueueSnapshotSignatureFallback(snapshot: PersistedPausedQueueSnapshot): string {
  return JSON.stringify({
    paused: snapshot.paused === true,
    mode: snapshot.mode,
    activeSetId: snapshot.activeSetId,
    queueTargetType: snapshot.queueTargetType,
    targetBridgeId: snapshot.targetBridgeId,
    dispatchDelayMs: snapshot.dispatchDelayMs,
    requestIds: snapshot.requestIds,
    prompts: snapshot.prompts,
    promptSetIds: snapshot.promptSetIds,
    promptOutputSubfolders: snapshot.promptOutputSubfolders,
    promptStyleNames: snapshot.promptStyleNames,
    promptSeedGroupIds: snapshot.promptSeedGroupIds,
    generationByPrompt: snapshot.generationByPrompt,
  });
}

export function getQueueSnapshotWorker(
  workerRef: MutableRefObject<Worker | null>,
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>
): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (workerRef.current) return workerRef.current;
  try {
    const worker = new Worker('/assets/PowerPrompterQueueWorker.js', { type: 'module' });
    worker.onmessage = (event: MessageEvent<any>) => {
      const payload = event.data || {};
      const requestId = Math.max(0, Math.floor(Number(payload.requestId) || 0));
      const pending = pendingSignatureRef.current.get(requestId);
      if (!pending) return;
      clearTimeout(pending.timer);
      pendingSignatureRef.current.delete(requestId);
      if (payload.type === 'snapshot-signature') {
        pending.resolve(String(payload.signature || ''));
        return;
      }
      if (payload.type === 'prompt-build') {
        pending.resolve(payload.result as QueuePromptBuildWorkerResult);
        return;
      }
      if (payload.type === 'queue-estimate') {
        pending.resolve(payload.result as PowerPrompterQueueEstimate);
        return;
      }
      if (payload.type === 'queue-editor-estimate') {
        pending.resolve(payload.result as PowerPrompterQueueEstimate);
        return;
      }
      try {
        pending.resolve(pending.fallback());
      } catch (error: any) {
        pending.reject(new Error(String(error?.message || payload.error || 'Queue worker failed.')));
      }
    };
    worker.onerror = (event) => {
      for (const [requestId, pending] of Array.from(pendingSignatureRef.current.entries())) {
        clearTimeout(pending.timer);
        try {
          pending.resolve(pending.fallback());
        } catch (error: any) {
          pending.reject(new Error(String(error?.message || event.message || 'Queue worker failed.')));
        }
        pendingSignatureRef.current.delete(requestId);
      }
      worker.terminate();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
    };
    workerRef.current = worker;
    return worker;
  } catch {
    return null;
  }
}

function requestQueueWorkerValue<T>(input: {
  workerRef: MutableRefObject<Worker | null>;
  requestSeqRef: MutableRefObject<number>;
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>;
  timeoutMs?: number;
  message: (requestId: number) => Record<string, any>;
  fallback: () => T;
}): Promise<T> {
  const worker = getQueueSnapshotWorker(input.workerRef, input.pendingSignatureRef);
  if (!worker) return Promise.resolve(input.fallback());
  const requestId = input.requestSeqRef.current + 1;
  input.requestSeqRef.current = requestId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      input.pendingSignatureRef.current.delete(requestId);
      resolve(input.fallback());
    }, Math.max(1000, Math.floor(Number(input.timeoutMs) || 10000)));
    input.pendingSignatureRef.current.set(requestId, { resolve, reject, fallback: input.fallback, timer });
    try {
      worker.postMessage(input.message(requestId));
    } catch (error: any) {
      clearTimeout(timer);
      input.pendingSignatureRef.current.delete(requestId);
      reject(new Error(String(error?.message || error || 'Queue worker failed.')));
    }
  });
}

export function buildQueueSnapshotSignatureOnWorker(input: {
  snapshot: PersistedPausedQueueSnapshot;
  workerRef: MutableRefObject<Worker | null>;
  requestSeqRef: MutableRefObject<number>;
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>;
}): Promise<string> {
  const fallback = () => buildQueueSnapshotSignatureFallback(input.snapshot);
  return requestQueueWorkerValue<string>({
    workerRef: input.workerRef,
    requestSeqRef: input.requestSeqRef,
    pendingSignatureRef: input.pendingSignatureRef,
    timeoutMs: 5000,
    fallback,
    message: (requestId) => ({ type: 'snapshot-signature', requestId, snapshot: input.snapshot }),
  });
}

export function buildQueuePromptsOnWorker(input: {
  document: PowerPrompterCardDocument;
  mode: PowerPrompterQueueMode;
  options?: QueuePromptBuildWorkerOptions;
  workerRef: MutableRefObject<Worker | null>;
  requestSeqRef: MutableRefObject<number>;
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>;
}): Promise<QueuePromptBuildWorkerResult> {
  return fetch('/api/powerprompter/queue-prompts/build', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      document: input.document,
      mode: input.mode,
      options: input.options || {},
    }),
  }).then(async (response) => {
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload?.success === false) {
      throw new Error(String(payload?.error || 'Failed to build queue prompts.'));
    }
    return (payload?.result ?? payload) as QueuePromptBuildWorkerResult;
  });
}

export function buildPowerPrompterQueueEstimateOnWorker(input: BuildPowerPrompterQueueEstimateOptions & {
  workerRef: MutableRefObject<Worker | null>;
  requestSeqRef: MutableRefObject<number>;
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>;
}): Promise<PowerPrompterQueueEstimate> {
  const fallback = () => buildPowerPrompterQueueEstimate(input);
  return requestQueueWorkerValue<PowerPrompterQueueEstimate>({
    workerRef: input.workerRef,
    requestSeqRef: input.requestSeqRef,
    pendingSignatureRef: input.pendingSignatureRef,
    timeoutMs: 15000,
    fallback,
    message: (requestId) => ({
      type: 'queue-estimate',
      requestId,
      input: {
        cardDocument: input.cardDocument,
        queueSetTarget: input.queueSetTarget,
        queueTraversalMode: input.queueTraversalMode,
        queueDiversity: input.queueDiversity,
        queuePromptLimit: input.queuePromptLimit,
        queueShuffleEnabled: input.queueShuffleEnabled,
        queueShuffleSeed: input.queueShuffleSeed,
        estimatedBatchSize: input.estimatedBatchSize,
      },
    }),
  });
}

export function buildPowerPrompterQueueEditorEstimateOnWorker(input: BuildPowerPrompterQueueEditorEstimateOptions & {
  workerRef: MutableRefObject<Worker | null>;
  requestSeqRef: MutableRefObject<number>;
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>;
}): Promise<PowerPrompterQueueEstimate> {
  const fallback = () => buildPowerPrompterQueueEditorEstimate(input);
  return requestQueueWorkerValue<PowerPrompterQueueEstimate>({
    workerRef: input.workerRef,
    requestSeqRef: input.requestSeqRef,
    pendingSignatureRef: input.pendingSignatureRef,
    timeoutMs: 15000,
    fallback,
    message: (requestId) => ({
      type: 'queue-editor-estimate',
      requestId,
      input: {
        queueEditorDocument: input.queueEditorDocument,
        queueEditorDraft: input.queueEditorDraft,
        queueSetTarget: input.queueSetTarget,
        estimatedBatchSize: input.estimatedBatchSize,
      },
    }),
  });
}

export function cleanupQueueSnapshotWorker(
  workerRef: MutableRefObject<Worker | null>,
  pendingSignatureRef: MutableRefObject<Map<number, QueueSnapshotWorkerPending>>
): void {
  for (const pending of pendingSignatureRef.current.values()) {
    clearTimeout(pending.timer);
    pending.reject(new Error('Power Prompter queue worker stopped.'));
  }
  pendingSignatureRef.current.clear();
  workerRef.current?.terminate();
  workerRef.current = null;
}
