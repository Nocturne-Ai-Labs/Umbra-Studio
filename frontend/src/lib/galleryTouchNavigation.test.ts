import { describe, expect, test } from 'bun:test';
import { isGalleryDoubleTap } from './galleryTouchNavigation';

describe('Gallery mobile double-tap navigation', () => {
  test('accepts two nearby taps inside the gesture window', () => {
    expect(isGalleryDoubleTap(
      { x: 120, y: 240, at: 1_000 },
      { x: 128, y: 232, at: 1_260 },
    )).toBe(true);
  });

  test('rejects delayed taps and taps that moved across the viewer', () => {
    expect(isGalleryDoubleTap(
      { x: 120, y: 240, at: 1_000 },
      { x: 122, y: 242, at: 1_500 },
    )).toBe(false);
    expect(isGalleryDoubleTap(
      { x: 120, y: 240, at: 1_000 },
      { x: 220, y: 240, at: 1_200 },
    )).toBe(false);
  });
});
