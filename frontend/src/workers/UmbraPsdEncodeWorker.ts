import { writePsd, type BlendMode, type Layer, type Psd, type PixelData } from 'ag-psd';

export interface UmbraPsdWorkerLayer {
  name?: string;
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  opacity?: number;
  blendMode?: BlendMode;
  hidden?: boolean;
  opened?: boolean;
  bitmapIndex?: number;
  imageData?: PixelData;
  children?: UmbraPsdWorkerLayer[];
}

export interface UmbraPsdWorkerDocument {
  width: number;
  height: number;
  channels?: number;
  bitsPerChannel?: number;
  colorMode?: Psd['colorMode'];
  children: UmbraPsdWorkerLayer[];
}

export interface UmbraPsdEncodeWorkerRequest {
  requestId: number;
  document: UmbraPsdWorkerDocument;
  bitmaps: ImageBitmap[];
}

interface UmbraPsdEncodeWorkerSuccess {
  requestId: number;
  success: true;
  buffer: ArrayBuffer;
  elapsedMs: number;
}

interface UmbraPsdEncodeWorkerFailure {
  requestId: number;
  success: false;
  error: string;
}

export type UmbraPsdEncodeWorkerResponse = UmbraPsdEncodeWorkerSuccess | UmbraPsdEncodeWorkerFailure;

function bitmapToPixelData(bitmap: ImageBitmap): PixelData {
  const canvas = new OffscreenCanvas(Math.max(1, bitmap.width), Math.max(1, bitmap.height));
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The PSD encoder could not create a layer surface.');
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  return { data: pixels.data, width: pixels.width, height: pixels.height };
}

function hydrateLayer(layer: UmbraPsdWorkerLayer, bitmaps: ImageBitmap[]): Layer {
  const bitmapIndex = layer.bitmapIndex;
  const output: Layer = {
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
    children: layer.children?.map((child) => hydrateLayer(child, bitmaps)),
  };
  if (typeof bitmapIndex === 'number') {
    const bitmap = bitmaps[bitmapIndex];
    if (!bitmap) throw new Error(`PSD layer bitmap ${bitmapIndex} is missing.`);
    output.imageData = bitmapToPixelData(bitmap);
  }
  return output;
}

self.onmessage = (event: MessageEvent<UmbraPsdEncodeWorkerRequest>) => {
  const { requestId, document, bitmaps } = event.data;
  const startedAt = performance.now();
  try {
    const psd: Psd = {
      width: document.width,
      height: document.height,
      channels: document.channels,
      bitsPerChannel: document.bitsPerChannel,
      colorMode: document.colorMode,
      children: document.children.map((layer) => hydrateLayer(layer, bitmaps)),
    };
    const buffer = writePsd(psd, { generateThumbnail: false });
    const response: UmbraPsdEncodeWorkerSuccess = {
      requestId,
      success: true,
      buffer,
      elapsedMs: performance.now() - startedAt,
    };
    self.postMessage(response, [buffer]);
  } catch (reason) {
    const response: UmbraPsdEncodeWorkerFailure = {
      requestId,
      success: false,
      error: reason instanceof Error ? reason.message : 'The background PSD encoder failed.',
    };
    self.postMessage(response);
  } finally {
    for (const bitmap of bitmaps) bitmap.close();
  }
};
