import {
  applyUmbraRasterFilterToImageData,
  type UmbraRasterFilterConfig,
} from '../lib/umbraUiRasterFilters';

interface UmbraRasterFilterWorkerRequest {
  requestId: number;
  blob: Blob;
  width: number;
  height: number;
  config: UmbraRasterFilterConfig;
}

interface UmbraRasterFilterWorkerSuccess {
  requestId: number;
  success: true;
  blob: Blob;
  width: number;
  height: number;
  padding: number;
  elapsedMs: number;
}

interface UmbraRasterFilterWorkerFailure {
  requestId: number;
  success: false;
  error: string;
}

type UmbraRasterFilterWorkerResponse = UmbraRasterFilterWorkerSuccess | UmbraRasterFilterWorkerFailure;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

self.onmessage = async (event: MessageEvent<UmbraRasterFilterWorkerRequest>) => {
  const { blob, config, requestId } = event.data;
  const startedAt = performance.now();
  let source: ImageBitmap | null = null;

  try {
    source = await createImageBitmap(blob);
    const sourceWidth = Math.max(1, Math.round(event.data.width || source.width));
    const sourceHeight = Math.max(1, Math.round(event.data.height || source.height));
    const padding = config.type === 'blur' ? Math.ceil(clamp(config.blurRadius, 0, 128) * 3) : 0;
    const canvas = new OffscreenCanvas(sourceWidth + padding * 2, sourceHeight + padding * 2);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('The background filter canvas could not be created.');

    if (config.type === 'blur') {
      context.filter = `blur(${clamp(config.blurRadius, 0, 128)}px)`;
      context.drawImage(source, padding, padding, sourceWidth, sourceHeight);
      context.filter = 'none';
    } else if (config.type === 'pixelate') {
      const size = Math.max(1, Math.round(clamp(config.pixelSize, 1, 256)));
      const reduced = new OffscreenCanvas(
        Math.max(1, Math.ceil(sourceWidth / size)),
        Math.max(1, Math.ceil(sourceHeight / size)),
      );
      const reducedContext = reduced.getContext('2d');
      if (!reducedContext) throw new Error('The background pixelation canvas could not be created.');
      reducedContext.imageSmoothingEnabled = false;
      reducedContext.drawImage(source, 0, 0, reduced.width, reduced.height);
      context.imageSmoothingEnabled = false;
      context.drawImage(reduced, 0, 0, reduced.width, reduced.height, 0, 0, sourceWidth, sourceHeight);
    } else {
      context.drawImage(source, 0, 0, sourceWidth, sourceHeight);
      const pixels = context.getImageData(0, 0, sourceWidth, sourceHeight);
      applyUmbraRasterFilterToImageData(pixels, sourceWidth, sourceHeight, config);
      context.putImageData(pixels, 0, 0);
    }

    const result: UmbraRasterFilterWorkerSuccess = {
      requestId,
      success: true,
      blob: await canvas.convertToBlob({ type: 'image/png' }),
      width: canvas.width,
      height: canvas.height,
      padding,
      elapsedMs: performance.now() - startedAt,
    };
    self.postMessage(result);
  } catch (reason) {
    const result: UmbraRasterFilterWorkerFailure = {
      requestId,
      success: false,
      error: reason instanceof Error ? reason.message : 'The background raster filter failed.',
    };
    self.postMessage(result);
  } finally {
    source?.close();
  }
};

export type { UmbraRasterFilterWorkerRequest, UmbraRasterFilterWorkerResponse };
