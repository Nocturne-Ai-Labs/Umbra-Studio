import type { Layer as PsdLayer, Psd } from 'ag-psd';
import type {
  UmbraPsdEncodeWorkerRequest,
  UmbraPsdEncodeWorkerResponse,
  UmbraPsdWorkerDocument,
  UmbraPsdWorkerLayer,
} from '../workers/UmbraPsdEncodeWorker';

export interface UmbraPsdEncodeWorkerResult {
  blob: Blob;
  elapsedMs: number;
}

let nextRequestId = 1;

function abortError(): DOMException {
  return new DOMException('PSD export was canceled.', 'AbortError');
}

export function canUseUmbraPsdEncodeWorker(): boolean {
  return typeof window !== 'undefined'
    && typeof Worker !== 'undefined'
    && typeof OffscreenCanvas !== 'undefined'
    && typeof createImageBitmap !== 'undefined';
}

async function serializePsdLayer(
  layer: PsdLayer,
  bitmaps: ImageBitmap[],
  signal?: AbortSignal,
): Promise<UmbraPsdWorkerLayer> {
  if (signal?.aborted) throw abortError();
  const output: UmbraPsdWorkerLayer = {
    name: layer.name,
    left: layer.left,
    top: layer.top,
    right: layer.right,
    bottom: layer.bottom,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    hidden: layer.hidden,
    opened: layer.opened,
    imageData: layer.imageData,
  };
  if (layer.canvas) {
    const bitmap = await createImageBitmap(layer.canvas);
    if (signal?.aborted) {
      bitmap.close();
      throw abortError();
    }
    output.bitmapIndex = bitmaps.push(bitmap) - 1;
  }
  if (layer.children?.length) {
    output.children = [];
    for (const child of layer.children) output.children.push(await serializePsdLayer(child, bitmaps, signal));
  }
  return output;
}

export async function encodeUmbraPsdInWorker(
  psd: Psd,
  options: { signal?: AbortSignal } = {},
): Promise<UmbraPsdEncodeWorkerResult> {
  if (!canUseUmbraPsdEncodeWorker()) throw new Error('Background PSD encoding is unavailable in this browser.');
  if (options.signal?.aborted) throw abortError();

  const bitmaps: ImageBitmap[] = [];
  let transferred = false;
  try {
    const document: UmbraPsdWorkerDocument = {
      width: psd.width,
      height: psd.height,
      channels: psd.channels,
      bitsPerChannel: psd.bitsPerChannel,
      colorMode: psd.colorMode,
      children: [],
    };
    for (const layer of psd.children || []) document.children.push(await serializePsdLayer(layer, bitmaps, options.signal));
    if (options.signal?.aborted) throw abortError();

    const worker = new Worker('/assets/UmbraPsdEncodeWorker.js', { type: 'module' });
    const requestId = nextRequestId++;
    return await new Promise<UmbraPsdEncodeWorkerResult>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        options.signal?.removeEventListener('abort', handleAbort);
        worker.terminate();
        callback();
      };
      const handleAbort = () => finish(() => reject(abortError()));
      worker.onmessage = (event: MessageEvent<UmbraPsdEncodeWorkerResponse>) => {
        const response = event.data;
        if (response.requestId !== requestId) return;
        if (!response.success) {
          finish(() => reject(new Error(response.error)));
          return;
        }
        finish(() => resolve({
          blob: new Blob([response.buffer], { type: 'application/octet-stream' }),
          elapsedMs: response.elapsedMs,
        }));
      };
      worker.onerror = (event) => finish(() => reject(new Error(event.message || 'The background PSD encoder crashed.')));
      options.signal?.addEventListener('abort', handleAbort, { once: true });
      const request: UmbraPsdEncodeWorkerRequest = { requestId, document, bitmaps };
      try {
        worker.postMessage(request, bitmaps);
        transferred = true;
      } catch (reason) {
        finish(() => reject(reason instanceof Error ? reason : new Error('The PSD layers could not be handed to the background encoder.')));
      }
    });
  } finally {
    if (!transferred) for (const bitmap of bitmaps) bitmap.close();
  }
}
