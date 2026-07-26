import { describe, expect, test } from 'bun:test';
import {
  inferUmbraImageAspectRatio,
  inferUmbraImageBaseResolution,
  resolveUmbraImageDimensions,
} from './umbraUiImageResolution';

const bounds = {
  minimumWidth: 64,
  minimumHeight: 64,
  maximumWidth: 8192,
  maximumHeight: 8192,
  step: 8,
};

describe('Umbra UI image resolution controls', () => {
  test('uses model-friendly SDXL dimensions at the 1024 base resolution', () => {
    expect(resolveUmbraImageDimensions('1:1', 1024, bounds)).toEqual({ width: 1024, height: 1024 });
    expect(resolveUmbraImageDimensions('3:4', 1024, bounds)).toEqual({ width: 896, height: 1152 });
    expect(resolveUmbraImageDimensions('16:9', 1024, bounds)).toEqual({ width: 1344, height: 768 });
  });

  test('scales both axes and respects the pipeline alignment and limits', () => {
    expect(resolveUmbraImageDimensions('3:4', 1536, { ...bounds, step: 64 })).toEqual({
      width: 1344,
      height: 1728,
    });
    expect(resolveUmbraImageDimensions('21:9', 2048, {
      ...bounds,
      maximumWidth: 2048,
      maximumHeight: 2048,
    })).toEqual({ width: 2048, height: 1280 });
  });

  test('infers canonical ratios and a stable square-equivalent base', () => {
    expect(inferUmbraImageAspectRatio(896, 1152)).toBe('3:4');
    expect(inferUmbraImageAspectRatio(1000, 731)).toBe('custom');
    expect(inferUmbraImageBaseResolution(896, 1152)).toBe(1024);
  });
});
