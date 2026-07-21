import { describe, expect, test } from 'bun:test';
import type { UmbraCanvasStudioArtboard, UmbraCanvasStudioViewport } from './umbraUiStudioProjects';
import {
  fitUmbraCanvasStudioArtboards,
  resolveUmbraCanvasStudioArtboardSnap,
  screenToUmbraCanvasStudioWorld,
  snapUmbraCanvasStudioCoordinate,
  zoomUmbraCanvasStudioAtPoint,
} from './umbraUiCanvasStudioViewport';

const viewport: UmbraCanvasStudioViewport = {
  zoom: 1,
  panX: 100,
  panY: 50,
  snapSize: 32,
  snapEnabled: true,
};

function artboard(id: string, x: number, y: number, width: number, height: number): UmbraCanvasStudioArtboard {
  return {
    id,
    documentId: id,
    name: id,
    x,
    y,
    width,
    height,
    zIndex: 0,
    visible: true,
    locked: false,
    regions: [],
    activeRegionId: '',
    createdAt: 1,
    updatedAt: 1,
  };
}

describe('Umbra Canvas Studio viewport math', () => {
  test('keeps the world point beneath the cursor stationary while zooming', () => {
    const cursor = { x: 420, y: 250 };
    const before = screenToUmbraCanvasStudioWorld(cursor, viewport);
    const zoomed = zoomUmbraCanvasStudioAtPoint(viewport, 2, cursor);
    const after = screenToUmbraCanvasStudioWorld(cursor, zoomed);

    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
    expect(zoomed).toEqual({ zoom: 2, panX: -220, panY: -150 });
  });

  test('snaps dragged artboards to the configured light-grid interval', () => {
    expect(snapUmbraCanvasStudioCoordinate(47, 32, true)).toBe(32);
    expect(snapUmbraCanvasStudioCoordinate(49, 32, true)).toBe(64);
    expect(snapUmbraCanvasStudioCoordinate(49.4, 32, false)).toBe(49);
  });

  test('snaps artboards flush side by side and aligns their top edges', () => {
    const moving = artboard('moving', 97, 105, 100, 80);
    const target = artboard('target', 200, 100, 120, 80);
    const snapped = resolveUmbraCanvasStudioArtboardSnap(moving, [moving, target], {
      enabled: true,
      gridSize: 8,
      tolerance: 8,
    });

    expect(snapped.x).toBe(100);
    expect(snapped.y).toBe(100);
    expect(snapped.guides).toEqual([
      { axis: 'x', position: 200, start: 100, end: 180, kind: 'adjacent', targetArtboardId: 'target' },
      { axis: 'y', position: 100, start: 100, end: 320, kind: 'edge', targetArtboardId: 'target' },
    ]);
  });

  test('aligns artboard centers without using unrelated edge anchors', () => {
    const moving = artboard('moving', 56, 300, 96, 100);
    const target = artboard('target', 0, 0, 200, 200);
    const snapped = resolveUmbraCanvasStudioArtboardSnap(moving, [moving, target], {
      enabled: true,
      gridSize: 8,
      tolerance: 8,
    });

    expect(snapped.x).toBe(52);
    expect(snapped.guides.find((guide) => guide.axis === 'x')).toMatchObject({
      position: 100,
      kind: 'center',
      targetArtboardId: 'target',
    });
  });

  test('falls back to grid snapping when no visible artboard alignment is close', () => {
    const moving = artboard('moving', 43, 46, 100, 80);
    const hidden = artboard('hidden', 40, 48, 100, 80);
    hidden.visible = false;
    const snapped = resolveUmbraCanvasStudioArtboardSnap(moving, [moving, hidden, artboard('far', 500, 500, 100, 80)], {
      enabled: true,
      gridSize: 8,
      tolerance: 6,
    });

    expect(snapped).toEqual({ x: 40, y: 48, guides: [] });
  });

  test('disables both grid and alignment snapping with the Studio snap toggle', () => {
    const moving = artboard('moving', 98.6, 102.4, 100, 80);
    const snapped = resolveUmbraCanvasStudioArtboardSnap(moving, [moving, artboard('target', 200, 100, 120, 80)], {
      enabled: false,
      gridSize: 8,
      tolerance: 8,
    });

    expect(snapped).toEqual({ x: 99, y: 102, guides: [] });
  });

  test('fits all visible artboards and preserves their world-space arrangement', () => {
    const fitted = fitUmbraCanvasStudioArtboards([
      artboard('left', -100, 0, 200, 100),
      artboard('right', 300, 200, 100, 200),
    ], { width: 1000, height: 600 }, 50);

    expect(fitted).not.toBeNull();
    expect(fitted?.zoom).toBeCloseTo(1.25, 8);
    expect(fitted?.panX).toBeCloseTo(312.5, 8);
    expect(fitted?.panY).toBeCloseTo(50, 8);
  });

  test('ignores hidden artboards when fitting', () => {
    const hidden = artboard('hidden', 100_000, 100_000, 500, 500);
    hidden.visible = false;
    const fitted = fitUmbraCanvasStudioArtboards([
      artboard('visible', 0, 0, 100, 100),
      hidden,
    ], { width: 500, height: 500 }, 50);

    expect(fitted).toEqual({ zoom: 2, panX: 150, panY: 150 });
  });
});
