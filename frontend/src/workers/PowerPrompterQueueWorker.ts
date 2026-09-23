import {
  buildPowerPrompterQueueEditorEstimate,
  buildPowerPrompterQueueEstimate,
} from '../components/power-prompter/queue/queueEstimates';
import { buildQueuePromptsFromCards } from '../components/power-prompter/queue/queuePromptBuilder';

type QueueWorkerRequest =
  | {
      type: 'snapshot-signature';
      requestId: number;
      snapshot: any;
    }
  | {
      type: 'prompt-build';
      requestId: number;
      document: any;
      mode: any;
      options?: any;
    }
  | {
      type: 'queue-estimate';
      requestId: number;
      input: any;
    }
  | {
      type: 'queue-editor-estimate';
      requestId: number;
      input: any;
    };

type QueueWorkerResponse =
  | {
      type: 'snapshot-signature';
      requestId: number;
      signature: string;
    }
  | {
      type: 'prompt-build';
      requestId: number;
      result: any;
    }
  | {
      type: 'queue-estimate';
      requestId: number;
      result: any;
    }
  | {
      type: 'queue-editor-estimate';
      requestId: number;
      result: any;
    }
  | {
      type: 'error';
      requestId: number;
      error: string;
    };

function buildSnapshotSignature(snapshot: any): string {
  return JSON.stringify({
    paused: snapshot?.paused === true,
    mode: snapshot?.mode,
    activeSetId: snapshot?.activeSetId,
    queueTargetType: snapshot?.queueTargetType,
    targetBridgeId: snapshot?.targetBridgeId,
    dispatchDelayMs: snapshot?.dispatchDelayMs,
    requestIds: Array.isArray(snapshot?.requestIds) ? snapshot.requestIds : [],
    prompts: Array.isArray(snapshot?.prompts) ? snapshot.prompts : [],
    promptSetIds: Array.isArray(snapshot?.promptSetIds) ? snapshot.promptSetIds : [],
    promptOutputSubfolders: Array.isArray(snapshot?.promptOutputSubfolders) ? snapshot.promptOutputSubfolders : [],
    promptStyleNames: Array.isArray(snapshot?.promptStyleNames) ? snapshot.promptStyleNames : [],
    promptSeedGroupIds: Array.isArray(snapshot?.promptSeedGroupIds) ? snapshot.promptSeedGroupIds : [],
    generationByPrompt: Array.isArray(snapshot?.generationByPrompt) ? snapshot.generationByPrompt : [],
  });
}

self.onmessage = (event: MessageEvent<QueueWorkerRequest>) => {
  const message = event.data;
  if (!message) return;
  try {
    if (message.type === 'prompt-build') {
      const response: QueueWorkerResponse = {
        type: 'prompt-build',
        requestId: message.requestId,
        result: buildQueuePromptsFromCards(message.document, message.mode, message.options),
      };
      (self as any).postMessage(response);
      return;
    }
    if (message.type === 'queue-estimate') {
      const response: QueueWorkerResponse = {
        type: 'queue-estimate',
        requestId: message.requestId,
        result: buildPowerPrompterQueueEstimate(message.input),
      };
      (self as any).postMessage(response);
      return;
    }
    if (message.type === 'queue-editor-estimate') {
      const response: QueueWorkerResponse = {
        type: 'queue-editor-estimate',
        requestId: message.requestId,
        result: buildPowerPrompterQueueEditorEstimate(message.input),
      };
      (self as any).postMessage(response);
      return;
    }
    if (message.type !== 'snapshot-signature') return;
    const response: QueueWorkerResponse = {
      type: 'snapshot-signature',
      requestId: message.requestId,
      signature: buildSnapshotSignature(message.snapshot),
    };
    (self as any).postMessage(response);
  } catch (error: any) {
    const response: QueueWorkerResponse = {
      type: 'error',
      requestId: message.requestId,
      error: String(error?.message || error || 'Queue worker failed.'),
    };
    (self as any).postMessage(response);
  }
};
