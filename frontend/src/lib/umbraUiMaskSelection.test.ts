import { describe, expect, test } from 'bun:test';
import { selectUmbraColorRegion } from './umbraUiMaskSelection';

function pixels(colors: Array<[number, number, number, number]>): Uint8ClampedArray {
  return new Uint8ClampedArray(colors.flat());
}

describe('Umbra color-region selection', () => {
  test('selects only the connected matching region', () => {
    const image = pixels([
      [255, 0, 0, 255], [255, 0, 0, 255], [0, 0, 255, 255],
      [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255],
    ]);
    const selected = selectUmbraColorRegion(image, { width: 3, height: 2, x: 0, y: 0, tolerance: 0, contiguous: true });
    expect(Array.from(selected)).toEqual([255, 255, 0, 255, 0, 0]);
  });

  test('can select matching colors across disconnected regions', () => {
    const image = pixels([
      [20, 20, 20, 255], [200, 200, 200, 255], [22, 22, 22, 255],
    ]);
    const selected = selectUmbraColorRegion(image, { width: 3, height: 1, x: 0, y: 0, tolerance: 3, contiguous: false });
    expect(Array.from(selected)).toEqual([255, 0, 255]);
  });

  test('includes alpha in tolerance matching', () => {
    const image = pixels([
      [10, 10, 10, 0], [10, 10, 10, 64],
    ]);
    const selected = selectUmbraColorRegion(image, { width: 2, height: 1, x: 0, y: 0, tolerance: 32, contiguous: false });
    expect(Array.from(selected)).toEqual([255, 0]);
  });
});
