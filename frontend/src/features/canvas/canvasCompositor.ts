import { isUmbraCanvasDrawableEntity } from './canvasModel';
import { canUseUmbraCanvasEncodeWorker, encodeUmbraCanvasInWorker } from '@/lib/umbraUiCanvasEncodeWorker';
import type {
  UmbraCanvasDrawableEntity,
  UmbraCanvasMaskEntity,
  UmbraCanvasProjectDocument,
  UmbraCanvasRasterEntity,
  UmbraCanvasRect,
  UmbraCanvasRegionalGuidanceEntity,
  UmbraCanvasReferenceEntity,
} from './canvasModel';
import { renderUmbraCanvasRasterSurface } from './canvasRasterRenderer';
import { applyUmbraCanvasMaskExtremaInWorker, canUseUmbraCanvasMaskWorker } from './canvasWorkerBridge';
import { applyUmbraCanvasSlidingExtrema } from './canvasMaskMath';

export interface UmbraCanvasCompositeResult {
  sourceBlob: Blob;
  maskBlob: Blob;
  width: number;
  height: number;
  rasterLayerCount: number;
  drawableLayerCount: number;
  maskLayerCount: number;
  automaticMaskPixels: number;
}

export async function composeUmbraCanvasProjectThumbnail(
  project: UmbraCanvasProjectDocument,
  maxSide = 640,
): Promise<Blob | null> {
  const drawableEntities = project.entities.filter((entity): entity is UmbraCanvasDrawableEntity => (
    isUmbraCanvasDrawableEntity(entity) && entity.visible
  ));
  if (drawableEntities.length === 0) return null;
  const bbox = project.generationBbox;
  const scale = Math.min(1, Math.max(64, maxSide) / Math.max(1, bbox.width, bbox.height));
  const width = Math.max(1, Math.round(bbox.width * scale));
  const height = Math.max(1, Math.round(bbox.height * scale));
  const thumbnail = createCanvas(width, height);
  const context = thumbnail.getContext('2d');
  if (!context) throw new Error('The Canvas project thumbnail could not be rendered.');
  context.fillStyle = '#101417';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.save();
  context.scale(scale, scale);
  for (const entity of drawableEntities) {
    if (entity.kind === 'raster') {
      const bitmap = await loadBitmap(entity.imageUrl);
      try {
        drawRaster(context, bitmap, entity, bbox, true);
      } finally {
        bitmap.close();
      }
    } else drawVector(context, entity, bbox);
  }
  context.restore();
  return canvasToPngBlob(thumbnail);
}

function encodeCanvasOnMainThread(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The Canvas generation image could not be encoded.'));
    }, 'image/png');
  });
}

async function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  if (canUseUmbraCanvasEncodeWorker()) {
    return (await encodeUmbraCanvasInWorker({ canvas, type: 'image/png' })).blob;
  }
  return encodeCanvasOnMainThread(canvas);
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`A Canvas layer could not be loaded (${response.status}).`);
  return createImageBitmap(await response.blob());
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawRaster(
  context: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  entity: UmbraCanvasRasterEntity,
  bbox: UmbraCanvasRect,
  preserveBlendMode: boolean,
): void {
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, entity.opacity));
  context.globalCompositeOperation = preserveBlendMode ? entity.blendMode : 'source-over';
  context.translate(entity.x - bbox.x, entity.y - bbox.y);
  context.rotate((entity.rotation * Math.PI) / 180);
  context.scale(entity.scaleX, entity.scaleY);
  const surface = renderUmbraCanvasRasterSurface(bitmap, entity);
  context.drawImage(surface, 0, 0, entity.width, entity.height);
  context.restore();
}

function drawVector(
  context: CanvasRenderingContext2D,
  entity: Exclude<UmbraCanvasDrawableEntity, UmbraCanvasRasterEntity>,
  bbox: UmbraCanvasRect,
): void {
  context.save();
  context.globalAlpha = Math.max(0, Math.min(1, entity.opacity));
  context.globalCompositeOperation = entity.blendMode;
  context.translate(entity.x - bbox.x, entity.y - bbox.y);
  context.rotate((entity.rotation * Math.PI) / 180);
  context.scale(entity.scaleX, entity.scaleY);
  const left = 0;
  const top = 0;
  if (entity.kind === 'shape') {
    context.fillStyle = entity.fill;
    context.strokeStyle = entity.stroke;
    context.lineWidth = Math.max(0, entity.strokeWidth);
    context.beginPath();
    if (entity.shape === 'ellipse') context.ellipse(entity.width / 2, entity.height / 2, entity.width / 2, entity.height / 2, 0, 0, Math.PI * 2);
    else context.rect(left, top, entity.width, entity.height);
    context.fill();
    if (entity.strokeWidth > 0) context.stroke();
  } else if (entity.kind === 'path') {
    context.beginPath();
    for (let index = 0; index < entity.points.length; index += 2) {
      const x = left + entity.points[index];
      const y = top + entity.points[index + 1];
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (entity.closed) context.closePath();
    if (entity.fillEnabled && entity.closed) {
      context.fillStyle = entity.fill;
      context.fill();
    }
    if (entity.strokeWidth > 0) {
      context.strokeStyle = entity.stroke;
      context.lineWidth = entity.strokeWidth;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.stroke();
    }
  } else if (entity.kind === 'gradient') {
    const radians = (entity.angle * Math.PI) / 180;
    const centerX = entity.width / 2;
    const centerY = entity.height / 2;
    const extent = Math.abs(Math.cos(radians)) * entity.width / 2 + Math.abs(Math.sin(radians)) * entity.height / 2;
    const gradient = context.createLinearGradient(
      centerX - Math.cos(radians) * extent,
      centerY - Math.sin(radians) * extent,
      centerX + Math.cos(radians) * extent,
      centerY + Math.sin(radians) * extent,
    );
    gradient.addColorStop(0, entity.startColor);
    gradient.addColorStop(1, entity.endColor);
    context.fillStyle = gradient;
    context.fillRect(left, top, entity.width, entity.height);
  } else {
    context.beginPath();
    context.rect(left, top, entity.width, entity.height);
    context.clip();
    context.fillStyle = entity.fill;
    context.font = `${entity.fontStyle} ${Math.max(1, entity.fontSize)}px ${entity.fontFamily}`;
    context.textBaseline = 'top';
    context.textAlign = entity.align;
    const anchorX = entity.align === 'left' ? left : entity.align === 'right' ? left + entity.width : left + entity.width / 2;
    const lineHeight = entity.fontSize * 1.2;
    const lines: string[] = [];
    for (const paragraph of entity.text.split(/\r?\n/)) {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (words.length === 0) {
        lines.push('');
        continue;
      }
      let line = words.shift() || '';
      for (const word of words) {
        const candidate = `${line} ${word}`;
        if (context.measureText(candidate).width <= entity.width) line = candidate;
        else {
          lines.push(line);
          line = word;
        }
      }
      lines.push(line);
    }
    lines.slice(0, Math.max(1, Math.ceil(entity.height / lineHeight))).forEach((line, index) => {
      context.fillText(line, anchorX, top + index * lineHeight);
    });
  }
  context.restore();
}

async function renderLocalMask(entity: UmbraCanvasMaskEntity): Promise<HTMLCanvasElement> {
  const width = Math.max(1, Math.round(entity.width));
  const height = Math.max(1, Math.round(entity.height));
  const strokesCanvas = createCanvas(width, height);
  const strokesContext = strokesCanvas.getContext('2d');
  if (!strokesContext) throw new Error('The Canvas mask could not be rendered.');
  if (entity.imageUrl) {
    const bitmap = await loadBitmap(entity.imageUrl);
    try {
      strokesContext.drawImage(bitmap, 0, 0, width, height);
      const imported = strokesContext.getImageData(0, 0, width, height);
      let usesAlpha = false;
      for (let offset = 3; offset < imported.data.length; offset += 4) {
        if (imported.data[offset] < 250) {
          usesAlpha = true;
          break;
        }
      }
      for (let offset = 0; offset < imported.data.length; offset += 4) {
        const alpha = imported.data[offset + 3];
        const luminance = Math.max(imported.data[offset], imported.data[offset + 1], imported.data[offset + 2]);
        const selected = usesAlpha ? alpha : Math.round(luminance * alpha / 255);
        imported.data[offset] = 255;
        imported.data[offset + 1] = 255;
        imported.data[offset + 2] = 255;
        imported.data[offset + 3] = selected;
      }
      strokesContext.putImageData(imported, 0, 0);
    } finally {
      bitmap.close();
    }
  }
  for (const stroke of entity.strokes) {
    if (stroke.points.length < 2) continue;
    strokesContext.save();
    strokesContext.globalCompositeOperation = stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    strokesContext.globalAlpha = Math.max(0.01, Math.min(1, stroke.opacity));
    strokesContext.strokeStyle = '#ffffff';
    strokesContext.lineWidth = Math.max(1, stroke.size);
    strokesContext.lineCap = 'round';
    strokesContext.lineJoin = 'round';
    strokesContext.beginPath();
    strokesContext.moveTo(stroke.points[0], stroke.points[1]);
    for (let index = 2; index < stroke.points.length; index += 2) {
      strokesContext.lineTo(stroke.points[index], stroke.points[index + 1]);
    }
    if (stroke.closed && stroke.points.length >= 6) {
      strokesContext.closePath();
      strokesContext.fillStyle = '#ffffff';
      strokesContext.fill();
    } else strokesContext.stroke();
    strokesContext.restore();
  }

  const strokePixels = strokesContext.getImageData(0, 0, width, height);
  let selected = new Uint8ClampedArray(width * height);
  for (let index = 0; index < selected.length; index += 1) {
    const alpha = strokePixels.data[index * 4 + 3];
    selected[index] = entity.inverted ? 255 - alpha : alpha;
  }
  const grow = Math.max(-512, Math.min(512, Math.round(entity.grow)));
  if (grow !== 0) {
    selected = canUseUmbraCanvasMaskWorker()
      ? await applyUmbraCanvasMaskExtremaInWorker({ pixels: selected, width, height, radius: Math.abs(grow), maximum: grow > 0 })
      : applyUmbraCanvasSlidingExtrema(selected, width, height, Math.abs(grow), grow > 0);
  }

  const solidCanvas = createCanvas(width, height);
  const solidContext = solidCanvas.getContext('2d');
  if (!solidContext) throw new Error('The Canvas mask could not be processed.');
  const solidPixels = solidContext.createImageData(width, height);
  for (let index = 0; index < selected.length; index += 1) {
    const offset = index * 4;
    solidPixels.data[offset] = selected[index];
    solidPixels.data[offset + 1] = selected[index];
    solidPixels.data[offset + 2] = selected[index];
    solidPixels.data[offset + 3] = 255;
  }
  solidContext.putImageData(solidPixels, 0, 0);
  if (entity.feather <= 0) return solidCanvas;

  const featheredCanvas = createCanvas(width, height);
  const featheredContext = featheredCanvas.getContext('2d');
  if (!featheredContext) throw new Error('The Canvas mask feather could not be processed.');
  featheredContext.filter = `blur(${Math.max(0, Math.min(512, entity.feather))}px)`;
  featheredContext.drawImage(solidCanvas, 0, 0);
  featheredContext.filter = 'none';
  return featheredCanvas;
}

async function drawMask(
  context: CanvasRenderingContext2D,
  entity: UmbraCanvasMaskEntity,
  bbox: UmbraCanvasRect,
): Promise<void> {
  const localMask = await renderLocalMask(entity);
  const transformed = createCanvas(context.canvas.width, context.canvas.height);
  const transformedContext = transformed.getContext('2d', { willReadFrequently: true });
  if (!transformedContext) throw new Error('The Canvas mask operation could not be rendered.');
  transformedContext.save();
  transformedContext.translate(entity.x - bbox.x, entity.y - bbox.y);
  transformedContext.rotate((entity.rotation * Math.PI) / 180);
  transformedContext.scale(entity.scaleX, entity.scaleY);
  transformedContext.drawImage(localMask, 0, 0, entity.width, entity.height);
  transformedContext.restore();

  const current = context.getImageData(0, 0, context.canvas.width, context.canvas.height);
  const incoming = transformedContext.getImageData(0, 0, transformed.width, transformed.height);
  for (let offset = 0; offset < current.data.length; offset += 4) {
    const left = current.data[offset];
    const right = incoming.data[offset];
    const value = entity.operation === 'subtract'
      ? Math.max(0, left - right)
      : entity.operation === 'intersect'
        ? Math.min(left, right)
        : entity.operation === 'replace'
          ? right
          : Math.max(left, right);
    current.data[offset] = value;
    current.data[offset + 1] = value;
    current.data[offset + 2] = value;
    current.data[offset + 3] = 255;
  }
  context.putImageData(current, 0, 0);
}

export async function composeUmbraCanvasGenerationRegion(
  project: UmbraCanvasProjectDocument,
): Promise<UmbraCanvasCompositeResult> {
  const bbox = project.generationBbox;
  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));
  if (width * height > 64 * 1024 * 1024) {
    throw new Error('The Canvas generation region is too large to render safely.');
  }

  const transparentSource = createCanvas(width, height);
  const transparentContext = transparentSource.getContext('2d', { willReadFrequently: true });
  if (!transparentContext) throw new Error('The Canvas source compositor is unavailable.');
  transparentContext.imageSmoothingEnabled = true;
  transparentContext.imageSmoothingQuality = 'high';

  const drawableEntities = project.entities.filter((entity): entity is UmbraCanvasDrawableEntity => (
    isUmbraCanvasDrawableEntity(entity) && entity.visible && entity.generationEnabled
  ));
  for (const entity of drawableEntities) {
    if (entity.kind === 'raster') {
      const bitmap = await loadBitmap(entity.imageUrl);
      try {
        drawRaster(transparentContext, bitmap, entity, bbox, true);
      } finally {
        bitmap.close();
      }
    } else drawVector(transparentContext, entity, bbox);
  }
  const rasterLayerCount = drawableEntities.filter((entity) => entity.kind === 'raster').length;

  const flattenedSource = createCanvas(width, height);
  const flattenedContext = flattenedSource.getContext('2d');
  if (!flattenedContext) throw new Error('The Canvas source image could not be flattened.');
  flattenedContext.fillStyle = '#000000';
  flattenedContext.fillRect(0, 0, width, height);
  flattenedContext.drawImage(transparentSource, 0, 0);

  const explicitMask = createCanvas(width, height);
  const explicitMaskContext = explicitMask.getContext('2d', { willReadFrequently: true });
  if (!explicitMaskContext) throw new Error('The Canvas generation mask is unavailable.');
  explicitMaskContext.fillStyle = '#000000';
  explicitMaskContext.fillRect(0, 0, width, height);
  const conditioningMaskIds = new Set(project.entities
    .filter((entity): entity is UmbraCanvasRegionalGuidanceEntity | UmbraCanvasReferenceEntity => (
      (entity.kind === 'regional-guidance' || entity.kind === 'reference') && entity.generationEnabled
    ))
    .map((entity) => entity.maskEntityId)
    .filter(Boolean));
  const maskEntities = project.entities.filter((entity): entity is UmbraCanvasMaskEntity => (
    entity.kind === 'mask' && entity.generationEnabled && !conditioningMaskIds.has(entity.id)
  ));
  for (const entity of maskEntities) await drawMask(explicitMaskContext, entity, bbox);

  const sourcePixels = transparentContext.getImageData(0, 0, width, height);
  const maskPixels = explicitMaskContext.getImageData(0, 0, width, height);
  let automaticMaskPixels = 0;
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const automaticMask = 255 - sourcePixels.data[offset + 3];
    if (automaticMask > 0) automaticMaskPixels += 1;
    const explicitValue = Math.max(maskPixels.data[offset], maskPixels.data[offset + 1], maskPixels.data[offset + 2]);
    const value = Math.max(automaticMask, explicitValue);
    maskPixels.data[offset] = value;
    maskPixels.data[offset + 1] = value;
    maskPixels.data[offset + 2] = value;
    maskPixels.data[offset + 3] = 255;
  }
  explicitMaskContext.putImageData(maskPixels, 0, 0);

  const [sourceBlob, maskBlob] = await Promise.all([
    canvasToPngBlob(flattenedSource),
    canvasToPngBlob(explicitMask),
  ]);
  return {
    sourceBlob,
    maskBlob,
    width,
    height,
    rasterLayerCount,
    drawableLayerCount: drawableEntities.length,
    maskLayerCount: maskEntities.length,
    automaticMaskPixels,
  };
}

export async function composeUmbraCanvasDrawableRegionBlob(
  project: UmbraCanvasProjectDocument,
  bbox: UmbraCanvasRect,
): Promise<Blob> {
  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));
  if (width * height > 64 * 1024 * 1024) throw new Error('The Canvas merge region is too large to render safely.');
  const canvas = createCanvas(width, height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The Canvas merge compositor is unavailable.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const drawables = project.entities.filter((entity): entity is UmbraCanvasDrawableEntity => (
    isUmbraCanvasDrawableEntity(entity) && entity.visible && entity.generationEnabled
  ));
  for (const entity of drawables) {
    if (entity.kind === 'raster') {
      const bitmap = await loadBitmap(entity.imageUrl);
      try {
        drawRaster(context, bitmap, entity, bbox, true);
      } finally {
        bitmap.close();
      }
    } else drawVector(context, entity, bbox);
  }
  return canvasToPngBlob(canvas);
}

export async function composeUmbraCanvasAcceptedReplacementBlob(
  generatedImageUrl: string,
  acceptanceMaskUrl: string,
  bbox: UmbraCanvasRect,
): Promise<Blob> {
  const width = Math.max(1, Math.round(bbox.width));
  const height = Math.max(1, Math.round(bbox.height));
  if (width * height > 64 * 1024 * 1024) throw new Error('The staged Canvas region is too large to accept safely.');
  const [generated, mask] = await Promise.all([
    loadBitmap(generatedImageUrl),
    loadBitmap(acceptanceMaskUrl),
  ]);
  try {
    const output = createCanvas(width, height);
    const outputContext = output.getContext('2d', { willReadFrequently: true });
    if (!outputContext) throw new Error('The staged Canvas result could not be composited.');
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = 'high';
    outputContext.drawImage(generated, 0, 0, width, height);

    const maskCanvas = createCanvas(width, height);
    const maskContext = maskCanvas.getContext('2d', { willReadFrequently: true });
    if (!maskContext) throw new Error('The frozen Canvas acceptance mask could not be read.');
    maskContext.imageSmoothingEnabled = true;
    maskContext.imageSmoothingQuality = 'high';
    maskContext.drawImage(mask, 0, 0, width, height);

    const outputPixels = outputContext.getImageData(0, 0, width, height);
    const maskPixels = maskContext.getImageData(0, 0, width, height);
    for (let offset = 0; offset < outputPixels.data.length; offset += 4) {
      const maskValue = Math.max(maskPixels.data[offset], maskPixels.data[offset + 1], maskPixels.data[offset + 2]);
      outputPixels.data[offset + 3] = maskValue;
    }
    outputContext.putImageData(outputPixels, 0, 0);
    return canvasToPngBlob(output);
  } finally {
    generated.close();
    mask.close();
  }
}

export async function composeUmbraCanvasMaskBlob(
  project: UmbraCanvasProjectDocument,
  maskEntityId: string,
): Promise<Blob> {
  const mask = project.entities.find((entity): entity is UmbraCanvasMaskEntity => (
    entity.kind === 'mask' && entity.id === maskEntityId
  ));
  if (!mask) throw new Error('The regional guidance mask no longer exists.');
  const bbox = project.generationBbox;
  const canvas = createCanvas(bbox.width, bbox.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('The regional guidance mask could not be rendered.');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await drawMask(context, { ...mask, operation: 'replace' }, bbox);
  return canvasToPngBlob(canvas);
}

export async function composeUmbraCanvasRasterBlob(
  project: UmbraCanvasProjectDocument,
  rasterEntityId: string,
): Promise<Blob> {
  const raster = project.entities.find((entity): entity is UmbraCanvasRasterEntity => (
    entity.kind === 'raster' && entity.id === rasterEntityId
  ));
  if (!raster) throw new Error('The conditioning image layer no longer exists.');
  const bbox = project.generationBbox;
  const canvas = createCanvas(bbox.width, bbox.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The conditioning image could not be rendered.');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const bitmap = await loadBitmap(raster.imageUrl);
  try {
    drawRaster(context, bitmap, { ...raster, opacity: 1, blendMode: 'source-over' }, bbox, false);
  } finally {
    bitmap.close();
  }
  return canvasToPngBlob(canvas);
}

export async function composeUmbraCanvasRasterCropBlob(
  project: UmbraCanvasProjectDocument,
  rasterEntityId: string,
): Promise<Blob> {
  const raster = project.entities.find((entity): entity is UmbraCanvasRasterEntity => (
    entity.kind === 'raster' && entity.id === rasterEntityId
  ));
  if (!raster) throw new Error('The image layer to crop no longer exists.');
  const bbox = project.generationBbox;
  const canvas = createCanvas(bbox.width, bbox.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('The Canvas crop compositor is unavailable.');
  const bitmap = await loadBitmap(raster.imageUrl);
  try {
    drawRaster(context, bitmap, { ...raster, opacity: 1, blendMode: 'source-over' }, bbox, false);
  } finally {
    bitmap.close();
  }
  return canvasToPngBlob(canvas);
}
