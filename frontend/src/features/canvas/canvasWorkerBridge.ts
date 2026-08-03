import type {
  UmbraCanvasMaskWorkerRequest,
  UmbraCanvasMaskWorkerResponse,
} from '../../workers/UmbraCanvasMaskWorker';

interface PendingMaskRequest {
  resolve: (pixels: Uint8ClampedArray<ArrayBuffer>) => void;
  reject: (reason: Error) => void;
}

let maskWorker: Worker | null = null;
let nextMaskRequestId = 1;
const pendingMaskRequests = new Map<number, PendingMaskRequest>();

export function canUseUmbraCanvasMaskWorker(): boolean {
  return typeof window !== 'undefined' && typeof Worker !== 'undefined';
}

function rejectPendingMaskRequests(reason: Error): void {
  for (const request of pendingMaskRequests.values()) request.reject(reason);
  pendingMaskRequests.clear();
}

function getMaskWorker(): Worker {
  if (maskWorker) return maskWorker;
  const worker = new Worker('/assets/UmbraCanvasMaskWorker.js', { type: 'module' });
  worker.onmessage = (event: MessageEvent<UmbraCanvasMaskWorkerResponse>) => {
    const request = pendingMaskRequests.get(event.data.requestId);
    if (!request) return;
    pendingMaskRequests.delete(event.data.requestId);
    if (event.data.success) request.resolve(event.data.pixels);
    else request.reject(new Error(event.data.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'The Canvas mask worker crashed.');
    rejectPendingMaskRequests(error);
    worker.terminate();
    if (maskWorker === worker) maskWorker = null;
  };
  maskWorker = worker;
  return worker;
}

export function applyUmbraCanvasMaskExtremaInWorker(options: {
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  radius: number;
  maximum: boolean;
}): Promise<Uint8ClampedArray<ArrayBuffer>> {
  if (!canUseUmbraCanvasMaskWorker()) {
    return Promise.reject(new Error('Background Canvas mask processing is unavailable in this browser.'));
  }
  const requestId = nextMaskRequestId++;
  const worker = getMaskWorker();
  return new Promise((resolve, reject) => {
    pendingMaskRequests.set(requestId, { resolve, reject });
    const request: UmbraCanvasMaskWorkerRequest = { requestId, ...options };
    try {
      worker.postMessage(request, [options.pixels.buffer]);
    } catch (reason) {
      pendingMaskRequests.delete(requestId);
      reject(reason instanceof Error ? reason : new Error('The Canvas mask could not be handed to its worker.'));
    }
  });
}
