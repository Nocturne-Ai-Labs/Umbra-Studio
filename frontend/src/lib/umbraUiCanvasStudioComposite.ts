import type {
  UmbraCanvasStudioArtboard,
  UmbraCanvasStudioRect,
} from '@/lib/umbraUiStudioProjects';

export interface UmbraCanvasStudioCompositeSlice {
  artboard: UmbraCanvasStudioArtboard;
  intersection: UmbraCanvasStudioRect;
  artboardSource: UmbraCanvasStudioRect;
  destination: UmbraCanvasStudioRect;
}

function intersectRects(
  left: UmbraCanvasStudioRect,
  right: UmbraCanvasStudioRect,
): UmbraCanvasStudioRect | null {
  const x = Math.max(left.x, right.x);
  const y = Math.max(left.y, right.y);
  const rightEdge = Math.min(left.x + left.width, right.x + right.width);
  const bottomEdge = Math.min(left.y + left.height, right.y + right.height);
  if (rightEdge <= x || bottomEdge <= y) return null;
  return { x, y, width: rightEdge - x, height: bottomEdge - y };
}

export function resolveUmbraCanvasStudioCompositeSlices(
  target: UmbraCanvasStudioRect,
  artboards: UmbraCanvasStudioArtboard[],
): UmbraCanvasStudioCompositeSlice[] {
  if (target.width <= 0 || target.height <= 0) return [];

  return artboards
    .filter((artboard) => artboard.visible && artboard.width > 0 && artboard.height > 0)
    .sort((left, right) => (
      left.zIndex - right.zIndex
      || left.createdAt - right.createdAt
      || left.id.localeCompare(right.id)
    ))
    .flatMap((artboard) => {
      const intersection = intersectRects(target, artboard);
      if (!intersection) return [];
      return [{
        artboard,
        intersection,
        artboardSource: {
          x: intersection.x - artboard.x,
          y: intersection.y - artboard.y,
          width: intersection.width,
          height: intersection.height,
        },
        destination: {
          x: intersection.x - target.x,
          y: intersection.y - target.y,
          width: intersection.width,
          height: intersection.height,
        },
      }];
    });
}
