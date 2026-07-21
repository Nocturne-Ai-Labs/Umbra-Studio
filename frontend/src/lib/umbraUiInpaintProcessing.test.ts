import { describe, expect, test } from 'bun:test';
import {
  convertUmbraMaskLuminanceToAlpha,
  encodeUmbraMaskAlphaAsGrayscale,
  resolveUmbraUiInpaintProcessingSize,
} from './umbraUiInpaintProcessing';
import type { UmbraUiPipelineResolutionCapability } from '../../../shared/umbra-ui/pipelineTypes';

const resolution: UmbraUiPipelineResolutionCapability = {
  support: 'adjustable',
  reason: '',
  nodeClassTypes: [],
  defaultWidth: 1024,
  defaultHeight: 1024,
  minimumWidth: 64,
  minimumHeight: 64,
  maximumWidth: 16384,
  maximumHeight: 16384,
  step: 8,
};

describe('Umbra inpaint processing scale', () => {
  test('encodes fractional canvas alpha as an opaque grayscale Comfy mask', () => {
    const pixels = new Uint8ClampedArray([255, 48, 76, 64, 9, 8, 7, 0, 255, 48, 76, 255]);
    encodeUmbraMaskAlphaAsGrayscale(pixels);
    expect(Array.from(pixels)).toEqual([64, 64, 64, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
  });

  test('imports grayscale and transparent images as fractional alpha masks', () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
      128, 128, 128, 128,
      255, 0, 0, 255,
    ]);
    convertUmbraMaskLuminanceToAlpha(pixels);
    expect(Array.from(pixels)).toEqual([
      255, 255, 255, 255,
      255, 255, 255, 0,
      255, 255, 255, 64,
      255, 255, 255, 54,
    ]);
  });

  test('leaves the canvas region untouched when scaling is disabled', () => {
    expect(resolveUmbraUiInpaintProcessingSize(
      { width: 1536, height: 896 },
      { processingScaleMode: 'none', processingWidth: 1024, processingHeight: 1024 },
      resolution,
    )).toMatchObject({ width: 1536, height: 896, scaleX: 1, scaleY: 1, resized: false });
  });

  test('auto mode preserves aspect ratio while targeting the model pixel budget', () => {
    const result = resolveUmbraUiInpaintProcessingSize(
      { width: 2048, height: 1024 },
      { processingScaleMode: 'auto', processingWidth: 1024, processingHeight: 1024 },
      resolution,
    );
    expect(result.width / result.height).toBeCloseTo(2, 2);
    expect(Math.abs((result.width * result.height) - (1024 * 1024)) / (1024 * 1024)).toBeLessThan(0.02);
    expect(result.resized).toBe(true);
  });

  test('manual mode aligns and clamps dimensions to the selected pipeline contract', () => {
    expect(resolveUmbraUiInpaintProcessingSize(
      { width: 1024, height: 1024 },
      { processingScaleMode: 'manual', processingWidth: 1001, processingHeight: 899 },
      { ...resolution, maximumWidth: 960 },
    )).toMatchObject({ width: 960, height: 896, resized: true });
  });

  test('caps pathological manual sizes to the interactive memory budget', () => {
    const result = resolveUmbraUiInpaintProcessingSize(
      { width: 1024, height: 1024 },
      { processingScaleMode: 'manual', processingWidth: 16384, processingHeight: 16384 },
      resolution,
    );
    expect(result.width * result.height).toBeLessThanOrEqual(64 * 1024 * 1024);
    expect(result.limitedByMemory).toBe(true);
  });
});
