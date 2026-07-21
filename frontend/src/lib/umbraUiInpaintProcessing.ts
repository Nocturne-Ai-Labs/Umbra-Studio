import type {
  UmbraCanvasGenerationSettings,
  UmbraCanvasRect,
} from './umbraUiCanvasDocument';
import type { UmbraUiPipelineResolutionCapability } from '../../../shared/umbra-ui/pipelineTypes';

const MAX_PROCESSING_PIXELS = 64 * 1024 * 1024;

export interface UmbraUiInpaintProcessingSize {
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  resized: boolean;
  limitedByMemory: boolean;
}

export function encodeUmbraMaskAlphaAsGrayscale(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const value = pixels[index + 3];
    pixels[index] = value;
    pixels[index + 1] = value;
    pixels[index + 2] = value;
    pixels[index + 3] = 255;
  }
}

export function convertUmbraMaskLuminanceToAlpha(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    const luminance = Math.round(
      pixels[index] * 0.2126
      + pixels[index + 1] * 0.7152
      + pixels[index + 2] * 0.0722,
    );
    const alpha = Math.round((luminance * pixels[index + 3]) / 255);
    pixels[index] = 255;
    pixels[index + 1] = 255;
    pixels[index + 2] = 255;
    pixels[index + 3] = alpha;
  }
}

function finite(value: unknown, fallback: number): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function alignDimension(value: number, minimum: number, maximum: number, step: number): number {
  const clamped = Math.max(minimum, Math.min(maximum, Math.round(value)));
  const aligned = Math.round(clamped / step) * step;
  return Math.max(minimum, Math.min(maximum, aligned));
}

function limitArea(width: number, height: number, step: number): { width: number; height: number; limited: boolean } {
  if (width * height <= MAX_PROCESSING_PIXELS) return { width, height, limited: false };
  const scale = Math.sqrt(MAX_PROCESSING_PIXELS / Math.max(1, width * height));
  return {
    width: Math.max(step, Math.floor((width * scale) / step) * step),
    height: Math.max(step, Math.floor((height * scale) / step) * step),
    limited: true,
  };
}

export function resolveUmbraUiInpaintProcessingSize(
  region: Pick<UmbraCanvasRect, 'width' | 'height'>,
  generation: Pick<UmbraCanvasGenerationSettings, 'processingScaleMode' | 'processingWidth' | 'processingHeight'>,
  resolution: UmbraUiPipelineResolutionCapability,
): UmbraUiInpaintProcessingSize {
  const sourceWidth = Math.max(1, Math.round(finite(region.width, 1)));
  const sourceHeight = Math.max(1, Math.round(finite(region.height, 1)));
  if (generation.processingScaleMode === 'none') {
    return {
      width: sourceWidth,
      height: sourceHeight,
      scaleX: 1,
      scaleY: 1,
      resized: false,
      limitedByMemory: false,
    };
  }

  const step = Math.max(1, Math.round(finite(resolution.step, 8)));
  const minimumWidth = Math.max(step, Math.round(finite(resolution.minimumWidth, 64)));
  const minimumHeight = Math.max(step, Math.round(finite(resolution.minimumHeight, 64)));
  const maximumWidth = Math.max(minimumWidth, Math.round(finite(resolution.maximumWidth, 16384)));
  const maximumHeight = Math.max(minimumHeight, Math.round(finite(resolution.maximumHeight, 16384)));

  let requestedWidth = generation.processingWidth;
  let requestedHeight = generation.processingHeight;
  if (generation.processingScaleMode === 'auto') {
    const targetWidth = Math.max(minimumWidth, finite(resolution.defaultWidth, 1024));
    const targetHeight = Math.max(minimumHeight, finite(resolution.defaultHeight, 1024));
    const scale = Math.sqrt((targetWidth * targetHeight) / Math.max(1, sourceWidth * sourceHeight));
    requestedWidth = sourceWidth * scale;
    requestedHeight = sourceHeight * scale;
  }

  let alignedWidth = alignDimension(requestedWidth, minimumWidth, maximumWidth, step);
  let alignedHeight = alignDimension(requestedHeight, minimumHeight, maximumHeight, step);
  if (generation.processingScaleMode === 'auto') {
    const aspect = sourceWidth / sourceHeight;
    const targetArea = requestedWidth * requestedHeight;
    const candidates = [
      { width: alignedWidth, height: alignedHeight },
      {
        width: alignDimension(alignedHeight * aspect, minimumWidth, maximumWidth, step),
        height: alignedHeight,
      },
      {
        width: alignedWidth,
        height: alignDimension(alignedWidth / aspect, minimumHeight, maximumHeight, step),
      },
    ];
    const score = (candidate: { width: number; height: number }) => (
      Math.abs((candidate.width / candidate.height) - aspect) / Math.max(0.0001, aspect)
      + Math.abs((candidate.width * candidate.height) - targetArea) / Math.max(1, targetArea) * 0.1
    );
    const best = candidates.sort((left, right) => score(left) - score(right))[0];
    alignedWidth = best.width;
    alignedHeight = best.height;
  }
  const limited = limitArea(alignedWidth, alignedHeight, step);
  return {
    width: limited.width,
    height: limited.height,
    scaleX: limited.width / sourceWidth,
    scaleY: limited.height / sourceHeight,
    resized: limited.width !== sourceWidth || limited.height !== sourceHeight,
    limitedByMemory: limited.limited,
  };
}
