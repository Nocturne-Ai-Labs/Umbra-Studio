export interface UmbraCanvasMaskWorkerRequest {
  requestId: number;
  pixels: Uint8ClampedArray<ArrayBuffer>;
  width: number;
  height: number;
  radius: number;
  maximum: boolean;
}

export interface UmbraCanvasMaskWorkerSuccess {
  requestId: number;
  success: true;
  pixels: Uint8ClampedArray<ArrayBuffer>;
  elapsedMs: number;
}

export interface UmbraCanvasMaskWorkerFailure {
  requestId: number;
  success: false;
  error: string;
}

export type UmbraCanvasMaskWorkerResponse = UmbraCanvasMaskWorkerSuccess | UmbraCanvasMaskWorkerFailure;

self.onmessage = (event: MessageEvent<UmbraCanvasMaskWorkerRequest>) => {
  const { requestId } = event.data;
  const startedAt = performance.now();
  try {
    const width = Math.max(1, Math.round(event.data.width));
    const height = Math.max(1, Math.round(event.data.height));
    const radius = Math.max(1, Math.min(512, Math.round(event.data.radius)));
    if (event.data.pixels.length !== width * height) throw new Error('The Canvas mask pixel buffer has an invalid size.');
    const pixels = applyUmbraCanvasSlidingExtrema(event.data.pixels, width, height, radius, event.data.maximum);
    const response: UmbraCanvasMaskWorkerSuccess = {
      requestId,
      success: true,
      pixels,
      elapsedMs: performance.now() - startedAt,
    };
    self.postMessage(response, [pixels.buffer]);
  } catch (reason) {
    const response: UmbraCanvasMaskWorkerFailure = {
      requestId,
      success: false,
      error: reason instanceof Error ? reason.message : 'The Canvas mask worker failed.',
    };
    self.postMessage(response);
  }
};
import { applyUmbraCanvasSlidingExtrema } from '../features/canvas/canvasMaskMath';
