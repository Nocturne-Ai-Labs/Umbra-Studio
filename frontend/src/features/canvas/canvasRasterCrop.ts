import type { UmbraCanvasRasterEntity, UmbraCanvasRect } from './canvasModel';

export function getUmbraCanvasRasterSourceFrame(entity: UmbraCanvasRasterEntity): UmbraCanvasRect {
  return entity.sourceFrame || { x: 0, y: 0, width: entity.width, height: entity.height };
}

export function normalizeUmbraCanvasRasterCrop(rect: UmbraCanvasRect): UmbraCanvasRect {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.max(1, Math.min(65_536, Math.round(rect.width))),
    height: Math.max(1, Math.min(65_536, Math.round(rect.height))),
  };
}

export function getUmbraCanvasRasterCropPosition(entity: UmbraCanvasRasterEntity, rect: UmbraCanvasRect): { x: number; y: number } {
  const radians = entity.rotation * Math.PI / 180;
  const dx = rect.x * entity.scaleX;
  const dy = rect.y * entity.scaleY;
  return { x: entity.x + Math.cos(radians) * dx - Math.sin(radians) * dy, y: entity.y + Math.sin(radians) * dx + Math.cos(radians) * dy };
}

export function getUmbraCanvasRasterCropRect(
  entity: UmbraCanvasRasterEntity,
  transformed: Pick<UmbraCanvasRasterEntity, 'x' | 'y' | 'width' | 'height' | 'scaleX' | 'scaleY' | 'rotation'>,
): UmbraCanvasRect {
  const radians = -entity.rotation * Math.PI / 180;
  const nodeRadians = transformed.rotation * Math.PI / 180;
  const width = transformed.width * transformed.scaleX;
  const height = transformed.height * transformed.scaleY;
  const corners = [[0, 0], [width, 0], [width, height], [0, height]].map(([x, y]) => {
    const dx = transformed.x + Math.cos(nodeRadians) * x - Math.sin(nodeRadians) * y - entity.x;
    const dy = transformed.y + Math.sin(nodeRadians) * x + Math.cos(nodeRadians) * y - entity.y;
    return { x: (Math.cos(radians) * dx - Math.sin(radians) * dy) / entity.scaleX, y: (Math.sin(radians) * dx + Math.cos(radians) * dy) / entity.scaleY };
  });
  const left = Math.min(...corners.map((corner) => corner.x));
  const top = Math.min(...corners.map((corner) => corner.y));
  return normalizeUmbraCanvasRasterCrop({
    x: left,
    y: top,
    width: Math.max(...corners.map((corner) => corner.x)) - left,
    height: Math.max(...corners.map((corner) => corner.y)) - top,
  });
}

export function cropUmbraCanvasRasterEntity(entity: UmbraCanvasRasterEntity, requested: UmbraCanvasRect): UmbraCanvasRasterEntity {
  const rect = normalizeUmbraCanvasRasterCrop(requested);
  const frame = getUmbraCanvasRasterSourceFrame(entity);
  return {
    ...entity,
    ...getUmbraCanvasRasterCropPosition(entity, rect),
    width: rect.width,
    height: rect.height,
    sourceFrame: { ...frame, x: frame.x - rect.x, y: frame.y - rect.y },
    strokes: entity.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((value, index) => value - (index % 2 === 0 ? rect.x : rect.y)) })),
    revision: entity.revision + 1,
    updatedAt: Date.now(),
  };
}
