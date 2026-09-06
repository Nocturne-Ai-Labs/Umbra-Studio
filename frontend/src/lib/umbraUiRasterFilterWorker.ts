import type { UmbraRasterFilterConfig } from './umbraUiRasterFilters';
import type {
  UmbraRasterFilterWorkerRequest,
  UmbraRasterFilterWorkerResponse,
} from '../workers/UmbraRasterFilterWorker';

export interface UmbraRasterFilterWorkerResult {
  blob: Blob;
  width: number;
  height: number;
  padding: number;
  elapsedMs: number;
}

let nextRequestId = 1;

export function canUseUmbraRasterFilterWorker(): boolean {
  return typeof window !== 'undefined'
    && typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof OffscreenCanvas.prototype.convertToBlob === 'function'
    && typeof createImageBitmap !== 'undefined';
}

export async function renderUmbraRasterFilterInWorker(options: {
  blob: Blob;
  width: number;
  height: number;
  config: UmbraRasterFilterConfig;
  signal?: AbortSignal;
}): Promise<UmbraRasterFilterWorkerResult> {
  if (!canUseUmbraRasterFilterWorker()) {
    return Promise.reject(new Error('Background raster filtering is unavailable in this browser.'));
  }
  if (options.signal?.aborted) throw new DOMException('Raster filtering was canceled.', 'AbortError');

  const worker = new Worker('/assets/UmbraRasterFilterWorker.js', { type: 'module' });
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
    const handleAbort = () => finish(() => reject(new DOMException('Raster filtering was canceled.', 'AbortError')));

    worker.onmessage = (event: MessageEvent<UmbraRasterFilterWorkerResponse>) => {
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
        padding: response.padding,
        elapsedMs: response.elapsedMs,
      }));
    };
    worker.onerror = (event) => finish(() => reject(new Error(event.message || 'The background raster filter crashed.')));
    worker.onmessageerror = () => finish(() => reject(new Error('The background raster filter returned an unreadable result.')));

    if (options.signal?.aborted) {
      handleAbort();
      return;
    }
    options.signal?.addEventListener('abort', handleAbort, { once: true });
    const request: UmbraRasterFilterWorkerRequest = {
      requestId,
      blob: options.blob,
      width: options.width,
      height: options.height,
      config: options.config,
    };
    try {
      worker.postMessage(request);
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
