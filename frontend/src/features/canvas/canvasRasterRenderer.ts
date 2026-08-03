import { normalizeUmbraCanvasRasterAdjustments, type UmbraCanvasRasterEntity } from './canvasModel';

function traceStroke(context: CanvasRenderingContext2D, points: number[]): void {
  if (points.length < 2) return;
  context.beginPath();
  context.moveTo(points[0], points[1]);
  for (let index = 2; index < points.length; index += 2) {
    context.lineTo(points[index], points[index + 1]);
  }
  context.stroke();
}

export function renderUmbraCanvasRasterSurface(
  source: CanvasImageSource,
  entity: UmbraCanvasRasterEntity,
  previewScale = 1,
): HTMLCanvasElement {
  const scale = Math.max(0.0625, Math.min(1, Number(previewScale) || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(entity.width * scale));
  canvas.height = Math.max(1, Math.round(entity.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The Canvas raster editor is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.scale(scale, scale);
  context.drawImage(source, 0, 0, entity.width, entity.height);
  for (const stroke of entity.strokes || []) {
    if (stroke.points.length < 2) continue;
    if (stroke.mode === 'erase' && entity.alphaLocked) continue;
    context.save();
    context.globalAlpha = Math.max(0.01, Math.min(1, stroke.opacity));
    context.globalCompositeOperation = stroke.mode === 'erase'
      ? 'destination-out'
      : entity.alphaLocked ? 'source-atop' : 'source-over';
    context.strokeStyle = stroke.color || '#ffffff';
    context.lineWidth = Math.max(1, stroke.size);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    traceStroke(context, stroke.points);
    context.restore();
  }
  const adjustments = normalizeUmbraCanvasRasterAdjustments(entity.adjustments);
  if (adjustments.brightness === 0 && adjustments.contrast === 0 && adjustments.saturation === 0 && adjustments.hue === 0 && adjustments.blur === 0) {
    return canvas;
  }
  const adjusted = document.createElement('canvas');
  adjusted.width = canvas.width;
  adjusted.height = canvas.height;
  const adjustedContext = adjusted.getContext('2d');
  if (!adjustedContext) throw new Error('The Canvas raster adjustment renderer is unavailable.');
  adjustedContext.imageSmoothingEnabled = true;
  adjustedContext.imageSmoothingQuality = 'high';
  adjustedContext.filter = [
    `brightness(${100 + adjustments.brightness}%)`,
    `contrast(${100 + adjustments.contrast}%)`,
    `saturate(${100 + adjustments.saturation}%)`,
    `hue-rotate(${adjustments.hue}deg)`,
    `blur(${adjustments.blur * scale}px)`,
  ].join(' ');
  adjustedContext.drawImage(canvas, 0, 0);
  adjustedContext.filter = 'none';
  return adjusted;
}
