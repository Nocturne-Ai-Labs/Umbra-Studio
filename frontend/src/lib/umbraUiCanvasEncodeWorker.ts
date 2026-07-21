import type {
  UmbraCanvasEncodeWorkerRequest,
  UmbraCanvasEncodeWorkerResponse,
} from '../workers/UmbraCanvasEncodeWorker';

export interface UmbraCanvasEncodeWorkerResult {
  blob: Blob;
  width: number;
  height: number;
  elapsedMs: number;
}

let nextRequestId = 1;

export function canUseUmbraCanvasEncodeWorker(): boolean {
  return typeof window !== 'undefined'
    && typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof OffscreenCanvas.prototype.convertToBlob === 'function'
    && typeof createImageBitmap !== 'undefined';
}

export async function encodeUmbraCanvasInWorker(options: {
  canvas: HTMLCanvasElement;
  type?: string;
  quality?: number;
  signal?: AbortSignal;
}): Promise<UmbraCanvasEncodeWorkerResult> {
  if (!canUseUmbraCanvasEncodeWorker()) {
    throw new Error('Background canvas encoding is unavailable in this browser.');
  }
  if (options.signal?.aborted) throw new DOMException('Canvas encoding was canceled.', 'AbortError');

  const bitmap = await createImageBitmap(options.canvas);
  if (options.signal?.aborted) {
    bitmap.close();
    throw new DOMException('Canvas encoding was canceled.', 'AbortError');
  }

  const worker = new Worker('/assets/UmbraCanvasEncodeWorker.js', { type: 'module' });
  const requestId = nextRequestId++;

  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      options.signal?.removeEventListener('abort', handleAbort);
      worker.terminate();
      callback();
    };
    const handleAbort = () => finish(() => reject(new DOMException('Canvas encoding was canceled.', 'AbortError')));

    worker.onmessage = (event: MessageEvent<UmbraCanvasEncodeWorkerResponse>) => {
      const response = event.data;
      if (response.requestId !== requestId) return;
      if (!response.success) {
        finish(() => reject(new Error(response.error)));
        return;
      }
      finish(() => resolve({
        blob: response.blob,
        width: response.width,
        height: response.height,
        elapsedMs: response.elapsedMs,
      }));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'The background canvas encoder crashed.')));

    if (options.signal?.aborted) {
      bitmap.close();
      handleAbort();
      return;
    }
    options.signal?.addEventListener('abort', handleAbort, { once: true });
    const request: UmbraCanvasEncodeWorkerRequest = {
      requestId,
      bitmap,
      type: options.type || 'image/png',
      quality: options.quality,
    };
    try {
      worker.postMessage(request, [bitmap]);
    } catch (reason) {
      bitmap.close();
      finish(() => reject(reason instanceof Error
        ? reason
        : new Error('The canvas could not be handed to the background encoder.')));
    }
  });
}
