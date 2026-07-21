interface UmbraCanvasEncodeWorkerRequest {
  requestId: number;
  bitmap: ImageBitmap;
  type: string;
  quality?: number;
}

interface UmbraCanvasEncodeWorkerSuccess {
  requestId: number;
  success: true;
  blob: Blob;
  width: number;
  height: number;
  elapsedMs: number;
}

interface UmbraCanvasEncodeWorkerFailure {
  requestId: number;
  success: false;
  error: string;
}

type UmbraCanvasEncodeWorkerResponse = UmbraCanvasEncodeWorkerSuccess | UmbraCanvasEncodeWorkerFailure;

self.onmessage = async (event: MessageEvent<UmbraCanvasEncodeWorkerRequest>) => {
  const { bitmap, requestId, type, quality } = event.data;
  const startedAt = performance.now();

  try {
    const canvas = new OffscreenCanvas(Math.max(1, bitmap.width), Math.max(1, bitmap.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The background canvas encoder could not be created.');
    context.drawImage(bitmap, 0, 0);
    const result: UmbraCanvasEncodeWorkerSuccess = {
      requestId,
      success: true,
      blob: await canvas.convertToBlob({ type: type || 'image/png', quality }),
      width: canvas.width,
      height: canvas.height,
      elapsedMs: performance.now() - startedAt,
    };
    self.postMessage(result);
  } catch (reason) {
    const result: UmbraCanvasEncodeWorkerFailure = {
      requestId,
      success: false,
      error: reason instanceof Error ? reason.message : 'The background canvas encoder failed.',
    };
    self.postMessage(result);
  } finally {
    bitmap.close();
  }
};

export type { UmbraCanvasEncodeWorkerRequest, UmbraCanvasEncodeWorkerResponse };
