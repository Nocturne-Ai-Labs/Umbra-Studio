import type { UmbraCanvasRect } from './canvasModel';

export function snapUmbraCanvasLayers(
  bounds: UmbraCanvasRect,
  targets: UmbraCanvasRect[],
  origin: { x: number; y: number },
  viewportScale: number,
) {
  const threshold = 8 / Math.max(0.05, viewportScale);
  const snapAxis = (start: number, size: number, axis: 'x' | 'y') => {
    let distance = threshold + 1;
    let delta = Math.round(origin[axis] / 8) * 8 - origin[axis];
    let guide: number | null = null;
    for (const target of targets) {
      const targetSize = axis === 'x' ? target.width : target.height;
      for (const anchor of [start, start + size / 2, start + size]) {
        for (const stop of [target[axis], target[axis] + targetSize / 2, target[axis] + targetSize]) {
          const offset = stop - anchor;
          if (Math.abs(offset) <= threshold && Math.abs(offset) < distance) {
            delta = offset;
            distance = Math.abs(offset);
            guide = stop;
          }
        }
      }
    }
    return { delta, guide };
  };
  const horizontal = snapAxis(bounds.x, bounds.width, 'x');
  const vertical = snapAxis(bounds.y, bounds.height, 'y');
  return { xDelta: horizontal.delta, yDelta: vertical.delta, verticalGuide: horizontal.guide, horizontalGuide: vertical.guide };
}
