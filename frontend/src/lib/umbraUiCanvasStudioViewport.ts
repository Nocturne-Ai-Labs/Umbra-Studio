import type {
  UmbraCanvasStudioArtboard,
  UmbraCanvasStudioViewport,
} from '@/lib/umbraUiStudioProjects';

export interface UmbraCanvasStudioPoint {
  x: number;
  y: number;
}

export interface UmbraCanvasStudioViewportSize {
  width: number;
  height: number;
}

export type UmbraCanvasStudioAlignmentGuideKind = 'edge' | 'center' | 'adjacent';

export interface UmbraCanvasStudioAlignmentGuide {
  axis: 'x' | 'y';
  position: number;
  start: number;
  end: number;
  kind: UmbraCanvasStudioAlignmentGuideKind;
  targetArtboardId: string;
}

export interface UmbraCanvasStudioArtboardSnapResult {
  x: number;
  y: number;
  guides: UmbraCanvasStudioAlignmentGuide[];
}

export interface UmbraCanvasStudioArtboardSnapOptions {
  enabled: boolean;
  gridSize: number;
  tolerance: number;
}

export const UMBRA_CANVAS_STUDIO_MIN_ZOOM = 0.05;
export const UMBRA_CANVAS_STUDIO_MAX_ZOOM = 8;
export const UMBRA_CANVAS_STUDIO_ALIGNMENT_SNAP_PX = 8;

export function clampUmbraCanvasStudioZoom(value: number): number {
  const numeric = Number.isFinite(value) ? value : 1;
  return Math.max(UMBRA_CANVAS_STUDIO_MIN_ZOOM, Math.min(UMBRA_CANVAS_STUDIO_MAX_ZOOM, numeric));
}

export function screenToUmbraCanvasStudioWorld(
  point: UmbraCanvasStudioPoint,
  viewport: Pick<UmbraCanvasStudioViewport, 'panX' | 'panY' | 'zoom'>,
): UmbraCanvasStudioPoint {
  const zoom = clampUmbraCanvasStudioZoom(viewport.zoom);
  return {
    x: (point.x - viewport.panX) / zoom,
    y: (point.y - viewport.panY) / zoom,
  };
}

export function zoomUmbraCanvasStudioAtPoint(
  viewport: UmbraCanvasStudioViewport,
  nextZoomValue: number,
  point: UmbraCanvasStudioPoint,
): Pick<UmbraCanvasStudioViewport, 'zoom' | 'panX' | 'panY'> {
  const worldPoint = screenToUmbraCanvasStudioWorld(point, viewport);
  const zoom = clampUmbraCanvasStudioZoom(nextZoomValue);
  return {
    zoom,
    panX: point.x - worldPoint.x * zoom,
    panY: point.y - worldPoint.y * zoom,
  };
}

export function snapUmbraCanvasStudioCoordinate(value: number, size: number, enabled: boolean): number {
  if (!enabled) return Math.round(value);
  const step = Math.max(1, Math.round(size));
  return Math.round(value / step) * step;
}

interface UmbraCanvasStudioAxisSnapCandidate {
  coordinate: number;
  guidePosition: number;
  kind: UmbraCanvasStudioAlignmentGuideKind;
  priority: number;
  target: UmbraCanvasStudioArtboard;
}

function closestAxisSnap(
  rawCoordinate: number,
  tolerance: number,
  candidates: UmbraCanvasStudioAxisSnapCandidate[],
): UmbraCanvasStudioAxisSnapCandidate | null {
  let best: UmbraCanvasStudioAxisSnapCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate.coordinate - rawCoordinate);
    if (distance > tolerance) continue;
    if (
      distance < bestDistance - 0.001
      || (Math.abs(distance - bestDistance) <= 0.001 && candidate.priority < (best?.priority ?? Number.POSITIVE_INFINITY))
    ) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

export function resolveUmbraCanvasStudioArtboardSnap(
  moving: Pick<UmbraCanvasStudioArtboard, 'id' | 'x' | 'y' | 'width' | 'height'>,
  artboards: UmbraCanvasStudioArtboard[],
  options: UmbraCanvasStudioArtboardSnapOptions,
): UmbraCanvasStudioArtboardSnapResult {
  const rawX = Number.isFinite(moving.x) ? moving.x : 0;
  const rawY = Number.isFinite(moving.y) ? moving.y : 0;
  const width = Math.max(1, Math.round(Number(moving.width) || 1));
  const height = Math.max(1, Math.round(Number(moving.height) || 1));
  const gridX = snapUmbraCanvasStudioCoordinate(rawX, options.gridSize, options.enabled);
  const gridY = snapUmbraCanvasStudioCoordinate(rawY, options.gridSize, options.enabled);
  if (!options.enabled) return { x: gridX, y: gridY, guides: [] };

  const targets = artboards.filter((artboard) => (
    artboard.id !== moving.id
    && artboard.visible
    && artboard.width > 0
    && artboard.height > 0
  ));
  const xCandidates: UmbraCanvasStudioAxisSnapCandidate[] = [];
  const yCandidates: UmbraCanvasStudioAxisSnapCandidate[] = [];
  for (const target of targets) {
    const left = target.x;
    const centerX = target.x + target.width / 2;
    const right = target.x + target.width;
    const top = target.y;
    const centerY = target.y + target.height / 2;
    const bottom = target.y + target.height;
    const addX = (targetPosition: number, movingOffset: number, kind: UmbraCanvasStudioAlignmentGuideKind, priority: number) => {
      const coordinate = Math.round(targetPosition - movingOffset);
      xCandidates.push({ coordinate, guidePosition: coordinate + movingOffset, kind, priority, target });
    };
    const addY = (targetPosition: number, movingOffset: number, kind: UmbraCanvasStudioAlignmentGuideKind, priority: number) => {
      const coordinate = Math.round(targetPosition - movingOffset);
      yCandidates.push({ coordinate, guidePosition: coordinate + movingOffset, kind, priority, target });
    };

    addX(left, 0, 'edge', 0);
    addX(right, width, 'edge', 0);
    addX(centerX, width / 2, 'center', 1);
    addX(right, 0, 'adjacent', 2);
    addX(left, width, 'adjacent', 2);
    addY(top, 0, 'edge', 0);
    addY(bottom, height, 'edge', 0);
    addY(centerY, height / 2, 'center', 1);
    addY(bottom, 0, 'adjacent', 2);
    addY(top, height, 'adjacent', 2);
  }

  const tolerance = Math.max(0, Number(options.tolerance) || 0);
  const xSnap = closestAxisSnap(rawX, tolerance, xCandidates);
  const ySnap = closestAxisSnap(rawY, tolerance, yCandidates);
  const x = xSnap?.coordinate ?? gridX;
  const y = ySnap?.coordinate ?? gridY;
  const guides: UmbraCanvasStudioAlignmentGuide[] = [];
  if (xSnap) {
    guides.push({
      axis: 'x',
      position: xSnap.guidePosition,
      start: Math.min(y, xSnap.target.y),
      end: Math.max(y + height, xSnap.target.y + xSnap.target.height),
      kind: xSnap.kind,
      targetArtboardId: xSnap.target.id,
    });
  }
  if (ySnap) {
    guides.push({
      axis: 'y',
      position: ySnap.guidePosition,
      start: Math.min(x, ySnap.target.x),
      end: Math.max(x + width, ySnap.target.x + ySnap.target.width),
      kind: ySnap.kind,
      targetArtboardId: ySnap.target.id,
    });
  }
  return { x, y, guides };
}

export function fitUmbraCanvasStudioArtboards(
  artboards: UmbraCanvasStudioArtboard[],
  viewportSize: UmbraCanvasStudioViewportSize,
  padding = 64,
): Pick<UmbraCanvasStudioViewport, 'zoom' | 'panX' | 'panY'> | null {
  const visible = artboards.filter((artboard) => artboard.visible && artboard.width > 0 && artboard.height > 0);
  if (visible.length <= 0 || viewportSize.width <= 1 || viewportSize.height <= 1) return null;

  const minX = Math.min(...visible.map((artboard) => artboard.x));
  const minY = Math.min(...visible.map((artboard) => artboard.y));
  const maxX = Math.max(...visible.map((artboard) => artboard.x + artboard.width));
  const maxY = Math.max(...visible.map((artboard) => artboard.y + artboard.height));
  const contentWidth = Math.max(1, maxX - minX);
  const contentHeight = Math.max(1, maxY - minY);
  const availableWidth = Math.max(1, viewportSize.width - padding * 2);
  const availableHeight = Math.max(1, viewportSize.height - padding * 2);
  const zoom = clampUmbraCanvasStudioZoom(Math.min(2, availableWidth / contentWidth, availableHeight / contentHeight));

  return {
    zoom,
    panX: (viewportSize.width - contentWidth * zoom) / 2 - minX * zoom,
    panY: (viewportSize.height - contentHeight * zoom) / 2 - minY * zoom,
  };
}
