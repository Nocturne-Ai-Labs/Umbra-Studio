import { describe, expect, test } from 'bun:test';
import {
  UMBRA_CANVAS_INTERACTIVE_MAX_PIXELS,
  UMBRA_CANVAS_INTERACTIVE_MAX_SIDE,
  UMBRA_CANVAS_PREVIEW_MAX_PIXELS,
  UMBRA_CANVAS_PREVIEW_MAX_SIDE,
  assertUmbraCanvasInteractiveAllocation,
  resolveUmbraCanvasInteractiveAllocation,
  resolveUmbraCanvasLayerSourceCrop,
  resolveUmbraCanvasPaintBufferRect,
  resolveUmbraCanvasPreviewDisplaySize,
  resolveUmbraCanvasPreviewRaster,
  resolveUmbraCanvasWorldToLayerAssetTransform,
} from './umbraUiCanvasPerformance';

describe('Umbra canvas interactive allocation guard', () => {
  test('accepts an 8K square exactly at the conservative 64 Mi-pixel boundary', () => {
    const allocation = resolveUmbraCanvasInteractiveAllocation(8192, 8192);
    expect(allocation).toMatchObject({
      width: 8192,
      height: 8192,
      pixels: UMBRA_CANVAS_INTERACTIVE_MAX_PIXELS,
      rgbaBytes: 256 * 1024 * 1024,
      allowed: true,
      error: '',
    });
    expect(() => assertUmbraCanvasInteractiveAllocation(8192, 8192)).not.toThrow();
  });

  test('accepts a wide 16K by 4K outpaint canvas at the same area boundary', () => {
    expect(resolveUmbraCanvasInteractiveAllocation(UMBRA_CANVAS_INTERACTIVE_MAX_SIDE, 4096).allowed).toBe(true);
  });

  test('rejects dimensions before a browser canvas can exceed the side limit', () => {
    const allocation = resolveUmbraCanvasInteractiveAllocation(UMBRA_CANVAS_INTERACTIVE_MAX_SIDE + 1, 1024);
    expect(allocation.allowed).toBe(false);
    expect(allocation.error).toContain('interactive canvas side limit');
    expect(() => assertUmbraCanvasInteractiveAllocation(UMBRA_CANVAS_INTERACTIVE_MAX_SIDE + 1, 1024)).toThrow();
  });

  test('rejects an over-budget area with the requested geometry in the error', () => {
    const allocation = resolveUmbraCanvasInteractiveAllocation(8192, 8193);
    expect(allocation.allowed).toBe(false);
    expect(allocation.error).toContain('8192x8193');
    expect(allocation.error).toContain('64 MP');
  });

  test('rejects invalid dimensions without allocating anything', () => {
    expect(resolveUmbraCanvasInteractiveAllocation(Number.NaN, 1024)).toMatchObject({
      pixels: 0,
      rgbaBytes: 0,
      allowed: false,
    });
  });
});

describe('Umbra canvas interactive preview budget', () => {
  test('uses Canvas Studio zoom instead of the fitted viewport size', () => {
    const fitted = resolveUmbraCanvasPreviewDisplaySize(2048, 1024, 640, 320, null);
    const studio = resolveUmbraCanvasPreviewDisplaySize(2048, 1024, 640, 320, 0.75);
    expect(fitted).toEqual({ width: 640, height: 320 });
    expect(studio).toEqual({ width: 1536, height: 768 });
    expect(resolveUmbraCanvasPreviewRaster(2048, 1024, studio.width, studio.height, 2)).toMatchObject({
      width: 2048,
      height: 1024,
      downsampled: false,
    });
  });

  test('keeps a small canvas at native resolution', () => {
    expect(resolveUmbraCanvasPreviewRaster(1024, 1024, 1024, 1024, 1)).toEqual({
      width: 1024,
      height: 1024,
      scale: 1,
      downsampled: false,
      estimatedBytes: 1024 * 1024 * 4,
    });
  });

  test('renders an 8K fit view near its visible device resolution', () => {
    const raster = resolveUmbraCanvasPreviewRaster(8192, 8192, 1000, 1000, 2);
    expect(raster.width).toBe(2000);
    expect(raster.height).toBe(2000);
    expect(raster.downsampled).toBe(true);
    expect(raster.estimatedBytes).toBe(16_000_000);
  });

  test('keeps a 4K fit view sharp without allocating the full source bitmap', () => {
    const raster = resolveUmbraCanvasPreviewRaster(4096, 4096, 1200, 1200, 2);
    expect(raster.width).toBe(2400);
    expect(raster.height).toBe(2400);
    expect(raster.downsampled).toBe(true);
    expect(raster.estimatedBytes).toBe(23_040_000);
  });

  test('caps a deeply zoomed preview by both side and memory budgets', () => {
    const raster = resolveUmbraCanvasPreviewRaster(8192, 8192, 8000, 8000, 2);
    expect(raster.width).toBeLessThanOrEqual(UMBRA_CANVAS_PREVIEW_MAX_SIDE);
    expect(raster.height).toBeLessThanOrEqual(UMBRA_CANVAS_PREVIEW_MAX_SIDE);
    expect(raster.width * raster.height).toBeLessThanOrEqual(UMBRA_CANVAS_PREVIEW_MAX_PIXELS);
  });

  test('preserves wide-canvas aspect ratio while avoiding a full 64 MP allocation', () => {
    const raster = resolveUmbraCanvasPreviewRaster(16384, 4096, 1200, 300, 2);
    expect(raster.width).toBe(2400);
    expect(raster.height).toBe(600);
    expect(raster.width / raster.height).toBe(4);
    expect(raster.estimatedBytes).toBeLessThan(6_000_000);
  });

  test('sanitizes invalid measurements without producing an empty bitmap', () => {
    const raster = resolveUmbraCanvasPreviewRaster(Number.NaN, 0, Number.NaN, -1, Number.NaN);
    expect(raster.width).toBe(1);
    expect(raster.height).toBe(1);
    expect(raster.scale).toBe(1);
  });
});

describe('Umbra canvas paint buffer allocation', () => {
  test('uses only the clipped generation region on an 8K canvas', () => {
    const rect = resolveUmbraCanvasPaintBufferRect(8192, 8192, {
      x: 2048,
      y: 3072,
      width: 1024,
      height: 1024,
    }, true);
    expect(rect).toEqual({ x: 2048, y: 3072, width: 1024, height: 1024 });
    expect(rect.width * rect.height * 4).toBe(4 * 1024 * 1024);
  });

  test('uses the document when clipping is disabled', () => {
    expect(resolveUmbraCanvasPaintBufferRect(4096, 3072, {
      x: 100,
      y: 100,
      width: 512,
      height: 512,
    }, false)).toEqual({ x: 0, y: 0, width: 4096, height: 3072 });
  });

  test('clips an out-of-bounds region before allocation', () => {
    expect(resolveUmbraCanvasPaintBufferRect(1000, 800, {
      x: -50,
      y: 750,
      width: 300,
      height: 200,
    }, true)).toEqual({ x: 0, y: 750, width: 250, height: 50 });
  });
});

describe('Umbra canvas world-to-layer paint transform', () => {
  const map = (matrix: ReturnType<typeof resolveUmbraCanvasWorldToLayerAssetTransform>, x: number, y: number) => ({
    x: matrix.a * x + matrix.c * y + matrix.e,
    y: matrix.b * x + matrix.d * y + matrix.f,
  });

  test('maps translated layer bounds to native asset bounds', () => {
    const matrix = resolveUmbraCanvasWorldToLayerAssetTransform({
      x: 100,
      y: 200,
      width: 400,
      height: 200,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    }, 800, 400);
    expect(map(matrix, 100, 200)).toEqual({ x: 0, y: 0 });
    expect(map(matrix, 500, 400)).toEqual({ x: 800, y: 400 });
  });

  test('inverse maps rotation and mirroring', () => {
    const matrix = resolveUmbraCanvasWorldToLayerAssetTransform({
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      rotation: 90,
      scaleX: -1,
      scaleY: 1,
    }, 200, 100);
    const center = map(matrix, 200, 150);
    expect(center.x).toBeCloseTo(100, 8);
    expect(center.y).toBeCloseTo(50, 8);
    const localLeft = map(matrix, 200, 250);
    expect(localLeft.x).toBeCloseTo(0, 8);
    expect(localLeft.y).toBeCloseTo(50, 8);
  });
});

describe('Umbra canvas region-local layer allocation', () => {
  test('maps a small world viewport to a small unrotated source crop', () => {
    expect(resolveUmbraCanvasLayerSourceCrop({
      x: 0,
      y: 0,
      width: 8192,
      height: 8192,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    }, { x: 2048, y: 3072, width: 1024, height: 768 }, 2)).toEqual({
      x: 2046,
      y: 3070,
      width: 1028,
      height: 772,
    });
  });

  test('inverse maps scale and translation into layer pixels', () => {
    expect(resolveUmbraCanvasLayerSourceCrop({
      x: 100,
      y: 200,
      width: 4000,
      height: 2000,
      rotation: 0,
      scaleX: 2,
      scaleY: 0.5,
    }, { x: 1100, y: 950, width: 1000, height: 250 })).toEqual({
      x: 1500,
      y: 500,
      width: 500,
      height: 500,
    });
  });

  test('returns a conservative crop for rotated layers', () => {
    const crop = resolveUmbraCanvasLayerSourceCrop({
      x: 0,
      y: 0,
      width: 4096,
      height: 4096,
      rotation: 45,
      scaleX: 1,
      scaleY: 1,
    }, { x: 1792, y: 1792, width: 512, height: 512 }, 2);
    expect(crop).not.toBeNull();
    expect(crop!.width).toBeLessThan(800);
    expect(crop!.height).toBeLessThan(800);
    expect(crop!.x).toBeGreaterThan(1600);
  });

  test('returns null when the viewport is outside the layer', () => {
    expect(resolveUmbraCanvasLayerSourceCrop({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    }, { x: 200, y: 200, width: 50, height: 50 })).toBeNull();
  });
});
