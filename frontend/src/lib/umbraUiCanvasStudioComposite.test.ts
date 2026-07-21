import { describe, expect, test } from 'bun:test';
import type { UmbraCanvasStudioArtboard } from './umbraUiStudioProjects';
import { resolveUmbraCanvasStudioCompositeSlices } from './umbraUiCanvasStudioComposite';

function artboard(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  zIndex: number,
): UmbraCanvasStudioArtboard {
  return {
    id,
    documentId: id,
    name: id,
    x,
    y,
    width,
    height,
    zIndex,
    visible: true,
    locked: false,
    regions: [],
    activeRegionId: '',
    createdAt: zIndex + 1,
    updatedAt: zIndex + 1,
  };
}

describe('Umbra Canvas Studio generation compositing', () => {
  test('maps partial world-space overlaps into source and destination slices', () => {
    const slices = resolveUmbraCanvasStudioCompositeSlices(
      { x: 100, y: 80, width: 200, height: 160 },
      [artboard('left', 20, 40, 140, 120, 0)],
    );

    expect(slices).toHaveLength(1);
    expect(slices[0].intersection).toEqual({ x: 100, y: 80, width: 60, height: 80 });
    expect(slices[0].artboardSource).toEqual({ x: 80, y: 40, width: 60, height: 80 });
    expect(slices[0].destination).toEqual({ x: 0, y: 0, width: 60, height: 80 });
  });

  test('renders overlapping artboards from back to front', () => {
    const slices = resolveUmbraCanvasStudioCompositeSlices(
      { x: 0, y: 0, width: 512, height: 512 },
      [
        artboard('top', 0, 0, 512, 512, 20),
        artboard('bottom', 0, 0, 512, 512, -5),
        artboard('middle', 0, 0, 512, 512, 4),
      ],
    );

    expect(slices.map((slice) => slice.artboard.id)).toEqual(['bottom', 'middle', 'top']);
  });

  test('ignores hidden, disjoint, and edge-touching artboards', () => {
    const hidden = artboard('hidden', 0, 0, 100, 100, 0);
    hidden.visible = false;
    const slices = resolveUmbraCanvasStudioCompositeSlices(
      { x: 100, y: 100, width: 100, height: 100 },
      [
        hidden,
        artboard('touching', 0, 100, 100, 100, 1),
        artboard('far', 500, 500, 100, 100, 2),
      ],
    );

    expect(slices).toEqual([]);
  });
});
