import { describe, expect, test } from 'bun:test';
import {
  DEFAULT_UMBRA_RASTER_FILTER_CONFIG,
  applyUmbraColorMapToRgba,
  applyUmbraRasterFilterToImageData,
} from './umbraUiRasterFilters';

describe('Umbra raster filters', () => {
  test('maps luminance between user-selected shadow and highlight colors', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 77,
      255, 255, 255, 155,
      128, 128, 128, 233,
    ]);

    applyUmbraColorMapToRgba(pixels, '#102030', '#90a0b0');

    expect(Array.from(pixels.slice(0, 4))).toEqual([16, 32, 48, 77]);
    expect(Array.from(pixels.slice(4, 8))).toEqual([144, 160, 176, 155]);
    expect(Array.from(pixels.slice(8, 12))).toEqual([80, 96, 112, 233]);
  });

  test('falls back to the vetted palette for invalid colors', () => {
    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    applyUmbraColorMapToRgba(pixels, 'invalid', 'also-invalid');
    expect(Array.from(pixels)).toEqual([17, 24, 39, 255, 249, 168, 212, 255]);
  });

  test('applies worker-safe pixel filters without changing alpha', () => {
    const pixels = new Uint8ClampedArray([10, 20, 30, 77]);
    applyUmbraRasterFilterToImageData(
      { data: pixels } as ImageData,
      1,
      1,
      { ...DEFAULT_UMBRA_RASTER_FILTER_CONFIG, type: 'invert' },
    );
    expect(Array.from(pixels)).toEqual([245, 235, 225, 77]);
  });

  test('computes canny pixels independently of a DOM canvas context', () => {
    const pixels = new Uint8ClampedArray([
      0, 0, 0, 101, 255, 255, 255, 102, 255, 255, 255, 103,
      0, 0, 0, 111, 255, 255, 255, 212, 255, 255, 255, 113,
      0, 0, 0, 121, 255, 255, 255, 122, 255, 255, 255, 123,
    ]);
    applyUmbraRasterFilterToImageData(
      { data: pixels } as ImageData,
      3,
      3,
      { ...DEFAULT_UMBRA_RASTER_FILTER_CONFIG, type: 'canny', lowThreshold: 80, highThreshold: 160 },
    );
    expect(Array.from(pixels.slice(16, 20))).toEqual([255, 255, 255, 212]);
  });
});
