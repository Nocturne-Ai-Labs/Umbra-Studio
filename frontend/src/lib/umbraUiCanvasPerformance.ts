export const UMBRA_CANVAS_PREVIEW_MAX_SIDE = 4096;
export const UMBRA_CANVAS_PREVIEW_MAX_PIXELS = 12 * 1024 * 1024;
export const UMBRA_CANVAS_PREVIEW_MAX_DEVICE_SCALE = 2;
export const UMBRA_CANVAS_INTERACTIVE_MAX_SIDE = 16_384;
export const UMBRA_CANVAS_INTERACTIVE_MAX_PIXELS = 64 * 1024 * 1024;

export interface UmbraCanvasPreviewRaster {
  width: number;
  height: number;
  scale: number;
  downsampled: boolean;
  estimatedBytes: number;
}

export interface UmbraCanvasPreviewDisplaySize {
  width: number;
  height: number;
}

export interface UmbraCanvasInteractiveAllocation {
  width: number;
  height: number;
  pixels: number;
  megapixels: number;
  rgbaBytes: number;
  allowed: boolean;
  error: string;
}

export interface UmbraCanvasPerformanceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UmbraCanvasPerformanceTransform extends UmbraCanvasPerformanceRect {
  rotation: number;
  scaleX: number;
  scaleY: number;
}

export interface UmbraCanvasAffineTransform {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function positiveFinite(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveUmbraCanvasInteractiveAllocation(
  requestedWidth: number,
  requestedHeight: number,
): UmbraCanvasInteractiveAllocation {
  const width = Math.round(Number(requestedWidth));
  const height = Math.round(Number(requestedHeight));
  const validDimensions = Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1;
  const pixels = validDimensions ? width * height : 0;
  const megapixels = pixels / 1_000_000;
  const rgbaBytes = pixels * 4;
  let error = '';
  if (!validDimensions) {
    error = 'Canvas dimensions must be finite positive pixel values.';
  } else if (width > UMBRA_CANVAS_INTERACTIVE_MAX_SIDE || height > UMBRA_CANVAS_INTERACTIVE_MAX_SIDE) {
    error = `${width}x${height} exceeds the ${UMBRA_CANVAS_INTERACTIVE_MAX_SIDE}-pixel interactive canvas side limit.`;
  } else if (pixels > UMBRA_CANVAS_INTERACTIVE_MAX_PIXELS) {
    error = `${width}x${height} (${megapixels.toFixed(1)} MP) exceeds the 64 MP interactive canvas memory limit.`;
  }
  return {
    width,
    height,
    pixels,
    megapixels,
    rgbaBytes,
    allowed: !error,
    error,
  };
}

export function assertUmbraCanvasInteractiveAllocation(width: number, height: number): void {
  const allocation = resolveUmbraCanvasInteractiveAllocation(width, height);
  if (!allocation.allowed) throw new Error(allocation.error);
}

export function resolveUmbraCanvasPreviewRaster(
  documentWidth: number,
  documentHeight: number,
  displayWidth: number,
  displayHeight: number,
  devicePixelRatio = 1,
): UmbraCanvasPreviewRaster {
  const width = Math.max(1, Math.round(positiveFinite(documentWidth, 1)));
  const height = Math.max(1, Math.round(positiveFinite(documentHeight, 1)));
  const cssWidth = positiveFinite(displayWidth, width);
  const cssHeight = positiveFinite(displayHeight, height);
  const deviceScale = Math.min(
    UMBRA_CANVAS_PREVIEW_MAX_DEVICE_SCALE,
    Math.max(1, positiveFinite(devicePixelRatio, 1)),
  );
  const displayScale = Math.max(cssWidth / width, cssHeight / height) * deviceScale;
  const sideScale = Math.min(
    UMBRA_CANVAS_PREVIEW_MAX_SIDE / width,
    UMBRA_CANVAS_PREVIEW_MAX_SIDE / height,
  );
  const pixelScale = Math.sqrt(UMBRA_CANVAS_PREVIEW_MAX_PIXELS / (width * height));
  const scale = Math.max(1 / Math.max(width, height), Math.min(1, displayScale, sideScale, pixelScale));
  const rasterWidth = Math.max(1, Math.min(width, Math.round(width * scale)));
  const rasterHeight = Math.max(1, Math.min(height, Math.round(height * scale)));
  const effectiveScale = Math.min(rasterWidth / width, rasterHeight / height);

  return {
    width: rasterWidth,
    height: rasterHeight,
    scale: effectiveScale,
    downsampled: rasterWidth < width || rasterHeight < height,
    estimatedBytes: rasterWidth * rasterHeight * 4,
  };
}

export function resolveUmbraCanvasPreviewDisplaySize(
  documentWidth: number,
  documentHeight: number,
  fittedDisplayWidth: number,
  fittedDisplayHeight: number,
  studioZoom: number | null,
): UmbraCanvasPreviewDisplaySize {
  if (studioZoom == null) {
    return {
      width: Math.max(1, Math.round(positiveFinite(fittedDisplayWidth, 1))),
      height: Math.max(1, Math.round(positiveFinite(fittedDisplayHeight, 1))),
    };
  }
  const width = Math.max(1, Math.round(positiveFinite(documentWidth, 1)));
  const height = Math.max(1, Math.round(positiveFinite(documentHeight, 1)));
  const zoom = positiveFinite(studioZoom, 1);
  return {
    width: Math.max(1, Math.round(width * zoom)),
    height: Math.max(1, Math.round(height * zoom)),
  };
}

export function resolveUmbraCanvasLayerSourceCrop(
  transform: UmbraCanvasPerformanceTransform,
  viewport: UmbraCanvasPerformanceRect,
  padding = 0,
): UmbraCanvasPerformanceRect | null {
  const width = Math.max(1, positiveFinite(transform.width, 1));
  const height = Math.max(1, positiveFinite(transform.height, 1));
  const viewportWidth = Math.max(0, Number(viewport.width) || 0);
  const viewportHeight = Math.max(0, Number(viewport.height) || 0);
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  const scaleX = Math.abs(Number(transform.scaleX)) > 1e-6 ? Number(transform.scaleX) : 1e-6;
  const scaleY = Math.abs(Number(transform.scaleY)) > 1e-6 ? Number(transform.scaleY) : 1e-6;
  const radians = (Number(transform.rotation) || 0) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = (Number(transform.x) || 0) + width / 2;
  const centerY = (Number(transform.y) || 0) + height / 2;
  const corners = [
    [viewport.x, viewport.y],
    [viewport.x + viewportWidth, viewport.y],
    [viewport.x, viewport.y + viewportHeight],
    [viewport.x + viewportWidth, viewport.y + viewportHeight],
  ];
  const local = corners.map(([x, y]) => {
    const deltaX = x - centerX;
    const deltaY = y - centerY;
    return {
      x: (cosine * deltaX + sine * deltaY) / scaleX + width / 2,
      y: (-sine * deltaX + cosine * deltaY) / scaleY + height / 2,
    };
  });
  const margin = Math.max(0, Math.ceil(Number(padding) || 0));
  const left = Math.max(0, Math.floor(Math.min(...local.map((point) => point.x))) - margin);
  const top = Math.max(0, Math.floor(Math.min(...local.map((point) => point.y))) - margin);
  const right = Math.min(width, Math.ceil(Math.max(...local.map((point) => point.x))) + margin);
  const bottom = Math.min(height, Math.ceil(Math.max(...local.map((point) => point.y))) + margin);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function resolveUmbraCanvasWorldToLayerAssetTransform(
  transform: UmbraCanvasPerformanceTransform,
  assetWidth: number,
  assetHeight: number,
): UmbraCanvasAffineTransform {
  const width = Math.max(1, positiveFinite(transform.width, 1));
  const height = Math.max(1, positiveFinite(transform.height, 1));
  const outputWidth = Math.max(1, positiveFinite(assetWidth, width));
  const outputHeight = Math.max(1, positiveFinite(assetHeight, height));
  const scaleX = Math.abs(Number(transform.scaleX)) > 1e-6 ? Number(transform.scaleX) : 1e-6;
  const scaleY = Math.abs(Number(transform.scaleY)) > 1e-6 ? Number(transform.scaleY) : 1e-6;
  const radians = (Number(transform.rotation) || 0) * Math.PI / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const centerX = (Number(transform.x) || 0) + width / 2;
  const centerY = (Number(transform.y) || 0) + height / 2;
  const assetScaleX = outputWidth / width;
  const assetScaleY = outputHeight / height;
  return {
    a: assetScaleX * cosine / scaleX,
    b: assetScaleY * -sine / scaleY,
    c: assetScaleX * sine / scaleX,
    d: assetScaleY * cosine / scaleY,
    e: assetScaleX * (width / 2 - (cosine * centerX + sine * centerY) / scaleX),
    f: assetScaleY * (height / 2 - (-sine * centerX + cosine * centerY) / scaleY),
  };
}

export function resolveUmbraCanvasPaintBufferRect(
  documentWidth: number,
  documentHeight: number,
  generationRegion: UmbraCanvasPerformanceRect | null,
  clipToGenerationRegion: boolean,
): UmbraCanvasPerformanceRect {
  const width = Math.max(1, Math.round(positiveFinite(documentWidth, 1)));
  const height = Math.max(1, Math.round(positiveFinite(documentHeight, 1)));
  if (!clipToGenerationRegion || !generationRegion) return { x: 0, y: 0, width, height };
  const left = Math.max(0, Math.min(width - 1, Math.floor(Number(generationRegion.x) || 0)));
  const top = Math.max(0, Math.min(height - 1, Math.floor(Number(generationRegion.y) || 0)));
  const right = Math.max(left + 1, Math.min(width, Math.ceil((Number(generationRegion.x) || 0) + positiveFinite(generationRegion.width, 1))));
  const bottom = Math.max(top + 1, Math.min(height, Math.ceil((Number(generationRegion.y) || 0) + positiveFinite(generationRegion.height, 1))));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
