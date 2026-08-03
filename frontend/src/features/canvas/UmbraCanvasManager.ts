import Konva from 'konva';
import {
  alignUmbraCanvasDimension,
  createUmbraCanvasMaskStroke,
  createUmbraCanvasRasterStroke,
  getUmbraCanvasSpatialBounds,
  isUmbraCanvasDrawableEntity,
  isUmbraCanvasSpatialEntity,
  type UmbraCanvasMaskEntity,
  type UmbraCanvasMaskStroke,
  type UmbraCanvasDrawableEntity,
  type UmbraCanvasProjectDocument,
  type UmbraCanvasRasterEntity,
  type UmbraCanvasRasterStroke,
  type UmbraCanvasRect,
  type UmbraCanvasStagedGeneration,
  type UmbraCanvasViewport,
} from './canvasModel';
import { renderUmbraCanvasRasterSurface } from './canvasRasterRenderer';

interface UmbraCanvasManagerCallbacks {
  onSelectEntity: (entityId: string, additive?: boolean) => void;
  onTransformEntities: (transforms: Array<{
    entityId: string;
    transform: Partial<Pick<UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>>;
  }>) => void;
  onGenerationBboxChange: (bbox: UmbraCanvasRect) => void;
  onViewportChange: (viewport: UmbraCanvasViewport) => void;
  onMaskStroke: (entityId: string, stroke: UmbraCanvasMaskStroke) => void;
  onRasterStroke: (entityId: string, stroke: UmbraCanvasRasterStroke) => void;
  onCreatePath: (worldPoints: number[], closed: boolean) => void;
  onPickColor: (color: string) => void;
}

export type UmbraCanvasTool = 'select' | 'bbox' | 'pan' | 'eyedropper' | 'raster-brush' | 'raster-eraser' | 'mask-brush' | 'mask-eraser' | 'mask-lasso' | 'freehand-shape' | 'polygon-shape';

const GRID_MINOR = 64;
const GRID_MAJOR = 256;

const IMAGE_CACHE = new Map<string, Promise<HTMLImageElement>>();
const RASTER_SURFACE_CACHE = new Map<string, { entityId: string; imageUrl: string; surface: HTMLCanvasElement }>();
const MASK_SURFACE_CACHE = new Map<string, { entityId: string; imageUrl: string; surface: HTMLCanvasElement }>();
const MAX_RASTER_SURFACE_CACHE_ENTRIES = 64;

export function releaseUmbraCanvasImageResource(imageUrl: string): void {
  if (!String(imageUrl || '').startsWith('blob:')) return;
  IMAGE_CACHE.delete(imageUrl);
  for (const [key, entry] of RASTER_SURFACE_CACHE) {
    if (entry.imageUrl === imageUrl) RASTER_SURFACE_CACHE.delete(key);
  }
  for (const [key, entry] of MASK_SURFACE_CACHE) {
    if (entry.imageUrl === imageUrl) MASK_SURFACE_CACHE.delete(key);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = IMAGE_CACHE.get(url);
  if (cached) return cached;
  const pending = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load Canvas image: ${url}`));
    image.src = url;
  });
  IMAGE_CACHE.set(url, pending);
  pending.catch(() => IMAGE_CACHE.delete(url));
  return pending;
}

function loadTransientImage(url: string): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the Canvas sampling preview.'));
    image.src = url;
  });
}

function spatialPreviewScale(entity: Pick<UmbraCanvasRasterEntity | UmbraCanvasMaskEntity, 'scaleX' | 'scaleY'>, viewportScale: number): number {
  const deviceScale = typeof window === 'undefined' ? 1 : Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const desired = Math.max(0.125, Math.min(1, viewportScale * Math.max(Math.abs(entity.scaleX), Math.abs(entity.scaleY)) * deviceScale));
  if (desired > 0.5) return 1;
  if (desired > 0.25) return 0.5;
  if (desired > 0.125) return 0.25;
  return 0.125;
}

function rasterSurfaceFor(image: HTMLImageElement, entity: UmbraCanvasRasterEntity, viewportScale: number): HTMLCanvasElement {
  const previewScale = spatialPreviewScale(entity, viewportScale);
  const key = [entity.id, entity.revision, entity.imageUrl, entity.width, entity.height, previewScale].join(':');
  const cached = RASTER_SURFACE_CACHE.get(key);
  if (cached) {
    RASTER_SURFACE_CACHE.delete(key);
    RASTER_SURFACE_CACHE.set(key, cached);
    return cached.surface;
  }
  for (const [cachedKey, entry] of RASTER_SURFACE_CACHE) {
    if (entry.entityId === entity.id) RASTER_SURFACE_CACHE.delete(cachedKey);
  }
  const surface = renderUmbraCanvasRasterSurface(image, entity, previewScale);
  RASTER_SURFACE_CACHE.set(key, { entityId: entity.id, imageUrl: entity.imageUrl, surface });
  while (RASTER_SURFACE_CACHE.size > MAX_RASTER_SURFACE_CACHE_ENTRIES) {
    const oldest = RASTER_SURFACE_CACHE.keys().next().value as string | undefined;
    if (!oldest) break;
    RASTER_SURFACE_CACHE.delete(oldest);
  }
  return surface;
}

function maskSurfaceFor(image: HTMLImageElement, entity: UmbraCanvasMaskEntity, viewportScale: number): HTMLCanvasElement {
  const previewScale = spatialPreviewScale(entity, viewportScale);
  const key = [entity.id, entity.imageUrl, entity.width, entity.height, previewScale].join(':');
  const cached = MASK_SURFACE_CACHE.get(key);
  if (cached) {
    MASK_SURFACE_CACHE.delete(key);
    MASK_SURFACE_CACHE.set(key, cached);
    return cached.surface;
  }
  for (const [cachedKey, entry] of MASK_SURFACE_CACHE) {
    if (entry.entityId === entity.id) MASK_SURFACE_CACHE.delete(cachedKey);
  }
  const surface = document.createElement('canvas');
  surface.width = Math.max(1, Math.round(entity.width * previewScale));
  surface.height = Math.max(1, Math.round(entity.height * previewScale));
  const context = surface.getContext('2d');
  if (!context) return surface;
  context.drawImage(image, 0, 0, surface.width, surface.height);
  const pixels = context.getImageData(0, 0, surface.width, surface.height);
  let usesAlpha = false;
  for (let offset = 3; offset < pixels.data.length; offset += 4) {
    if (pixels.data[offset] < 250) {
      usesAlpha = true;
      break;
    }
  }
  for (let offset = 0; offset < pixels.data.length; offset += 4) {
    const alpha = pixels.data[offset + 3];
    const luminance = Math.max(pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]);
    pixels.data[offset] = 244;
    pixels.data[offset + 1] = 63;
    pixels.data[offset + 2] = 94;
    pixels.data[offset + 3] = Math.round((usesAlpha ? alpha : luminance * alpha / 255) * 0.72);
  }
  context.putImageData(pixels, 0, 0);
  MASK_SURFACE_CACHE.set(key, { entityId: entity.id, imageUrl: entity.imageUrl, surface });
  while (MASK_SURFACE_CACHE.size > 32) {
    const oldest = MASK_SURFACE_CACHE.keys().next().value as string | undefined;
    if (!oldest) break;
    MASK_SURFACE_CACHE.delete(oldest);
  }
  return surface;
}

export class UmbraCanvasManager {
  private readonly stage: Konva.Stage;
  private readonly gridLayer = new Konva.Layer({ listening: false });
  private readonly backingLayer = new Konva.Layer();
  private readonly activeLayer = new Konva.Layer();
  private readonly foregroundLayer = new Konva.Layer();
  private readonly overlayLayer = new Konva.Layer();
  private readonly gridGroup = new Konva.Group({ listening: false });
  private readonly backingGroup = new Konva.Group();
  private readonly activeGroup = new Konva.Group();
  private readonly foregroundGroup = new Konva.Group();
  private readonly overlayGroup = new Konva.Group();
  private readonly stagingGroup = new Konva.Group({ name: 'staging-preview-plane', listening: false });
  private readonly samplingGroup = new Konva.Group({ name: 'sampling-preview-plane', listening: false });
  private readonly snapGuideGroup = new Konva.Group({ name: 'snap-guide-plane', listening: false });
  private readonly maskGroup = new Konva.Group({ name: 'mask-plane' });
  private readonly entityTransformer = new Konva.Transformer({
    rotateEnabled: true,
    keepRatio: false,
    flipEnabled: true,
    borderStroke: '#67e8f9',
    borderStrokeWidth: 1,
    anchorStroke: '#67e8f9',
    anchorFill: '#071014',
    anchorSize: 9,
  });
  private readonly bboxRect = new Konva.Rect({
    stroke: '#fb7185',
    strokeWidth: 2,
    dash: [8, 5],
    fill: 'rgba(244,63,94,0.06)',
    draggable: true,
    name: 'generation-bbox',
  });
  private readonly bboxTransformer = new Konva.Transformer({
    rotateEnabled: false,
    keepRatio: false,
    flipEnabled: false,
    borderStroke: '#fb7185',
    borderStrokeWidth: 1,
    anchorStroke: '#fb7185',
    anchorFill: '#16080b',
    anchorSize: 8,
    enabledAnchors: ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'],
  });
  private viewport: UmbraCanvasViewport = { x: 0, y: 0, scale: 1 };
  private document: UmbraCanvasProjectDocument | null = null;
  private renderToken = 0;
  private stagingPreviewToken = 0;
  private samplingPreviewToken = 0;
  private tool: UmbraCanvasTool = 'select';
  private spacePressed = false;
  private panning = false;
  private panPointerStart: UmbraCanvasViewport | null = null;
  private panViewportStart: UmbraCanvasViewport | null = null;
  private touchGesture: { distance: number; scale: number; worldX: number; worldY: number } | null = null;
  private maskBrushSize = 64;
  private maskBrushOpacity = 0.72;
  private rasterBrushSize = 64;
  private rasterBrushOpacity = 1;
  private rasterBrushColor = '#ffffff';
  private drawingMask: { entityId: string; points: number[]; line: Konva.Line } | null = null;
  private drawingRaster: { entityId: string; points: number[]; line: Konva.Line } | null = null;
  private drawingShape: { points: number[]; line: Konva.Line } | null = null;
  private polygonPoints: number[] = [];
  private polygonLine: Konva.Line | null = null;
  private previewScaleBucket = 1;
  private previewRefreshTimer: number | null = null;
  private selectedEntityIds = new Set<string>();
  private selectedDragStart: { sourceId: string; sourceX: number; sourceY: number; positions: Map<string, { x: number; y: number }> } | null = null;

  constructor(
    container: HTMLDivElement,
    private readonly callbacks: UmbraCanvasManagerCallbacks,
  ) {
    this.stage = new Konva.Stage({
      container,
      width: Math.max(1, container.clientWidth),
      height: Math.max(1, container.clientHeight),
    });
    this.stage.container().style.touchAction = 'none';
    this.stage.container().tabIndex = 0;
    this.stage.container().setAttribute('role', 'application');
    this.stage.container().setAttribute('aria-label', 'Umbra Canvas editing surface');
    this.gridLayer.add(this.gridGroup);
    this.backingLayer.add(this.backingGroup);
    this.activeLayer.add(this.activeGroup);
    this.foregroundLayer.add(this.foregroundGroup);
    this.overlayLayer.add(this.overlayGroup);
    this.overlayGroup.add(this.stagingGroup, this.samplingGroup, this.maskGroup, this.snapGuideGroup, this.bboxRect, this.bboxTransformer, this.entityTransformer);
    this.stage.add(this.gridLayer, this.backingLayer, this.activeLayer, this.foregroundLayer, this.overlayLayer);
    this.bboxTransformer.nodes([this.bboxRect]);
    this.bindEvents();
    this.setTool('select');
  }

  destroy(): void {
    this.renderToken += 1;
    this.stagingPreviewToken += 1;
    this.samplingPreviewToken += 1;
    if (this.previewRefreshTimer !== null) window.clearTimeout(this.previewRefreshTimer);
    this.stage.destroy();
  }

  resize(width: number, height: number): void {
    this.stage.size({ width: Math.max(1, width), height: Math.max(1, height) });
    this.drawGrid();
    this.stage.batchDraw();
  }

  setSpacePressed(pressed: boolean): void {
    this.spacePressed = pressed;
    this.updateCursor();
  }

  setTool(tool: UmbraCanvasTool): void {
    if (tool !== this.tool && (this.tool === 'polygon-shape' || this.tool === 'freehand-shape')) this.cancelShapeDrawing();
    this.tool = tool;
    const bboxActive = tool === 'bbox';
    this.bboxRect.listening(bboxActive);
    this.bboxRect.draggable(bboxActive);
    this.bboxTransformer.visible(bboxActive);
    this.entityTransformer.visible(tool === 'select');
    for (const node of this.stage.find('.drawable-entity')) node.listening(tool === 'select');
    for (const node of this.stage.find('.mask-entity')) node.listening(tool === 'select');
    this.updateCursor();
    this.stage.batchDraw();
  }

  private updateCursor(): void {
    this.stage.container().style.cursor = this.spacePressed || this.tool === 'pan'
      ? 'grab'
      : this.tool === 'bbox' || this.tool === 'eyedropper' || this.tool === 'mask-brush' || this.tool === 'mask-eraser' || this.tool === 'mask-lasso' || this.tool === 'raster-brush' || this.tool === 'raster-eraser' || this.tool === 'freehand-shape' || this.tool === 'polygon-shape'
        ? 'crosshair'
        : 'default';
  }

  setMaskBrush(size: number, opacity: number): void {
    this.maskBrushSize = Math.max(1, Math.min(2048, Number(size) || 64));
    this.maskBrushOpacity = Math.max(0.01, Math.min(1, Number(opacity) || 0.72));
  }

  setRasterBrush(size: number, opacity: number, color: string): void {
    this.rasterBrushSize = Math.max(1, Math.min(2048, Number(size) || 64));
    this.rasterBrushOpacity = Math.max(0.01, Math.min(1, Number(opacity) || 1));
    this.rasterBrushColor = /^#[0-9a-f]{6}$/i.test(String(color || '')) ? color : '#ffffff';
  }

  setSamplingPreview(preview: {
    imageDataUrl: string;
    bbox: UmbraCanvasRect;
    step: number;
    maxStep: number;
  } | null): void {
    const token = ++this.samplingPreviewToken;
    this.samplingGroup.destroyChildren();
    if (!preview?.imageDataUrl) {
      this.overlayLayer.batchDraw();
      return;
    }
    void loadTransientImage(preview.imageDataUrl).then((image) => {
      if (token !== this.samplingPreviewToken) return;
      const scale = Math.max(0.05, this.viewport.scale);
      const strokeWidth = 2 / scale;
      const progress = preview.maxStep > 0
        ? Math.max(0, Math.min(1, preview.step / preview.maxStep))
        : 0;
      const clip = new Konva.Group({
        clipX: preview.bbox.x,
        clipY: preview.bbox.y,
        clipWidth: preview.bbox.width,
        clipHeight: preview.bbox.height,
        listening: false,
      });
      clip.add(new Konva.Image({
        image,
        ...preview.bbox,
        listening: false,
        perfectDrawEnabled: false,
      }));
      if (progress > 0) {
        const barHeight = Math.max(4 / scale, Math.min(preview.bbox.height, 7 / scale));
        clip.add(
          new Konva.Rect({
            x: preview.bbox.x,
            y: preview.bbox.y + preview.bbox.height - barHeight,
            width: preview.bbox.width,
            height: barHeight,
            fill: 'rgba(0,0,0,0.72)',
            listening: false,
          }),
          new Konva.Rect({
            x: preview.bbox.x,
            y: preview.bbox.y + preview.bbox.height - barHeight,
            width: preview.bbox.width * progress,
            height: barHeight,
            fill: '#22d3ee',
            listening: false,
          }),
        );
      }
      this.samplingGroup.destroyChildren();
      this.samplingGroup.add(
        clip,
        new Konva.Rect({
          ...preview.bbox,
          stroke: '#22d3ee',
          strokeWidth,
          listening: false,
        }),
      );
      this.overlayLayer.batchDraw();
    }).catch(() => {
      if (token !== this.samplingPreviewToken) return;
      this.samplingGroup.destroyChildren();
      this.overlayLayer.batchDraw();
    });
  }

  setStagingPreview(stage: UmbraCanvasStagedGeneration | null, reveal = 1): void {
    const token = ++this.stagingPreviewToken;
    this.stagingGroup.destroyChildren();
    if (!stage) {
      this.overlayLayer.batchDraw();
      return;
    }
    void loadImage(stage.imageUrl).then((image) => {
      if (token !== this.stagingPreviewToken) return;
      this.stagingGroup.destroyChildren();
      const clampedReveal = Math.max(0, Math.min(1, Number(reveal) || 0));
      const previewClip = new Konva.Group({
        clipX: stage.bbox.x,
        clipY: stage.bbox.y,
        clipWidth: stage.bbox.width * clampedReveal,
        clipHeight: stage.bbox.height,
        listening: false,
      });
      previewClip.add(new Konva.Image({
          image,
          x: stage.bbox.x,
          y: stage.bbox.y,
          width: stage.bbox.width,
          height: stage.bbox.height,
          opacity: 1,
          listening: false,
        }));
      this.stagingGroup.add(
        previewClip,
        new Konva.Rect({
          ...stage.bbox,
          stroke: '#67e8f9',
          strokeWidth: 2 / this.viewport.scale,
          dash: [10 / this.viewport.scale, 5 / this.viewport.scale],
          listening: false,
        }),
      );
      if (clampedReveal > 0 && clampedReveal < 1) {
        this.stagingGroup.add(new Konva.Line({
          points: [
            stage.bbox.x + stage.bbox.width * clampedReveal,
            stage.bbox.y,
            stage.bbox.x + stage.bbox.width * clampedReveal,
            stage.bbox.y + stage.bbox.height,
          ],
          stroke: '#ffffff',
          strokeWidth: 2 / this.viewport.scale,
          shadowColor: '#000000',
          shadowBlur: 4 / this.viewport.scale,
          listening: false,
        }));
      }
      this.overlayLayer.batchDraw();
    }).catch(() => {
      if (token !== this.stagingPreviewToken) return;
      this.stagingGroup.destroyChildren();
      this.overlayLayer.batchDraw();
    });
  }

  fitToContent(): void {
    if (!this.document) return;
    const rects = this.document.entities.filter(isUmbraCanvasSpatialEntity).filter((entity) => entity.visible).map(getUmbraCanvasSpatialBounds);
    if (rects.length === 0) rects.push(this.document.generationBbox);
    const left = Math.min(...rects.map((rect) => rect.x));
    const top = Math.min(...rects.map((rect) => rect.y));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    const padding = 72;
    const scale = Math.max(0.05, Math.min(2, Math.min(
      (this.stage.width() - padding * 2) / Math.max(1, right - left),
      (this.stage.height() - padding * 2) / Math.max(1, bottom - top),
    )));
    this.updateViewport({
      scale,
      x: this.stage.width() / 2 - ((left + right) / 2) * scale,
      y: this.stage.height() / 2 - ((top + bottom) / 2) * scale,
    }, true);
  }

  resetView(): void {
    this.updateViewport({ x: 0, y: 0, scale: 1 }, true);
  }

  setViewport(viewport: UmbraCanvasViewport): void {
    this.updateViewport(viewport, false);
  }

  setSelectedEntityIds(entityIds: string[]): void {
    this.selectedEntityIds = new Set(entityIds);
    this.refreshEntityTransformer();
  }

  render(project: UmbraCanvasProjectDocument): void {
    this.document = project;
    this.viewport = project.viewport;
    this.applyViewport();
    this.renderBbox(project.generationBbox);
    void this.renderEntities(project);
  }

  private bindEvents(): void {
    this.stage.on('wheel', (event) => {
      event.evt.preventDefault();
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      const oldScale = this.viewport.scale;
      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const nextScale = Math.max(0.05, Math.min(8, oldScale * (direction > 0 ? 1.1 : 1 / 1.1)));
      const worldX = (pointer.x - this.viewport.x) / oldScale;
      const worldY = (pointer.y - this.viewport.y) / oldScale;
      this.updateViewport({
        scale: nextScale,
        x: pointer.x - worldX * nextScale,
        y: pointer.y - worldY * nextScale,
      }, true);
    });

    this.stage.on('touchstart', (event) => {
      const touchEvent = event.evt as TouchEvent;
      if (touchEvent.touches.length < 2) return;
      touchEvent.preventDefault();
      this.drawingMask?.line.destroy();
      this.drawingRaster?.line.destroy();
      this.drawingShape?.line.destroy();
      this.drawingMask = null;
      this.drawingRaster = null;
      this.drawingShape = null;
      this.panning = false;
      const gesture = this.readTouchGesture(touchEvent.touches);
      if (!gesture) return;
      this.touchGesture = {
        distance: gesture.distance,
        scale: this.viewport.scale,
        worldX: (gesture.centerX - this.viewport.x) / this.viewport.scale,
        worldY: (gesture.centerY - this.viewport.y) / this.viewport.scale,
      };
    });

    this.stage.on('touchmove', (event) => {
      const touchEvent = event.evt as TouchEvent;
      if (!this.touchGesture || touchEvent.touches.length < 2) return;
      touchEvent.preventDefault();
      const gesture = this.readTouchGesture(touchEvent.touches);
      if (!gesture) return;
      const nextScale = Math.max(0.05, Math.min(8, this.touchGesture.scale * gesture.distance / Math.max(1, this.touchGesture.distance)));
      this.updateViewport({
        scale: nextScale,
        x: gesture.centerX - this.touchGesture.worldX * nextScale,
        y: gesture.centerY - this.touchGesture.worldY * nextScale,
      }, false);
    });

    this.stage.on('touchend touchcancel', (event) => {
      const touchEvent = event.evt as TouchEvent;
      if (!this.touchGesture || touchEvent.touches.length >= 2) return;
      this.touchGesture = null;
      this.callbacks.onViewportChange(this.viewport);
    });

    this.stage.on('pointerdown', (event) => {
      this.stage.container().focus({ preventScroll: true });
      if (this.touchGesture || ((event.evt as PointerEvent).pointerType === 'touch' && (event.evt as unknown as TouchEvent).touches?.length >= 2)) return;
      const button = event.evt.button;
      if (this.spacePressed || this.tool === 'pan' || button === 1 || button === 2) {
        event.evt.preventDefault();
        const pointer = this.stage.getPointerPosition();
        if (!pointer) return;
        this.panning = true;
        this.panPointerStart = { x: pointer.x, y: pointer.y, scale: 1 };
        this.panViewportStart = { ...this.viewport };
        this.stage.container().style.cursor = 'grabbing';
        return;
      }
      if ((this.tool === 'mask-brush' || this.tool === 'mask-eraser' || this.tool === 'mask-lasso') && button === 0) {
        event.evt.preventDefault();
        this.beginMaskStroke();
        return;
      }
      if ((this.tool === 'raster-brush' || this.tool === 'raster-eraser') && button === 0) {
        event.evt.preventDefault();
        this.beginRasterStroke();
        return;
      }
      if (this.tool === 'freehand-shape' && button === 0) {
        event.evt.preventDefault();
        this.beginFreehandShape();
        return;
      }
      if (this.tool === 'polygon-shape' && button === 0) {
        event.evt.preventDefault();
        this.addPolygonPoint((event.evt as PointerEvent).detail >= 2);
        return;
      }
      if (this.tool === 'eyedropper' && button === 0) {
        event.evt.preventDefault();
        this.pickColor();
        return;
      }
      if (this.tool === 'select' && event.target === this.stage) this.callbacks.onSelectEntity('', false);
    });

    this.stage.on('pointermove', () => {
      if (this.touchGesture) return;
      if (this.drawingMask) {
        this.continueMaskStroke();
        return;
      }
      if (this.drawingRaster) {
        this.continueRasterStroke();
        return;
      }
      if (this.drawingShape) {
        this.continueFreehandShape();
        return;
      }
      if (this.tool === 'polygon-shape' && this.polygonLine) this.updatePolygonPreview();
      if (!this.panning || !this.panPointerStart || !this.panViewportStart) return;
      const pointer = this.stage.getPointerPosition();
      if (!pointer) return;
      this.updateViewport({
        ...this.panViewportStart,
        x: this.panViewportStart.x + pointer.x - this.panPointerStart.x,
        y: this.panViewportStart.y + pointer.y - this.panPointerStart.y,
      }, false);
    });

    this.stage.on('pointerup pointercancel', () => {
      if (this.touchGesture) return;
      if (this.drawingMask) {
        this.finishMaskStroke();
        return;
      }
      if (this.drawingRaster) {
        this.finishRasterStroke();
        return;
      }
      if (this.drawingShape) {
        this.finishFreehandShape();
        return;
      }
      if (!this.panning) return;
      this.panning = false;
      this.panPointerStart = null;
      this.panViewportStart = null;
      this.updateCursor();
      this.callbacks.onViewportChange(this.viewport);
    });

    this.bboxRect.on('dragmove', () => this.snapGenerationBboxPosition());
    this.bboxRect.on('dragend', () => this.commitBbox());
    this.bboxRect.on('transformend', () => this.commitBbox());
    this.entityTransformer.on('transformend', () => this.commitEntityTransforms(this.entityTransformer.nodes()));
  }

  private readTouchGesture(touches: TouchList): { centerX: number; centerY: number; distance: number } | null {
    if (touches.length < 2) return null;
    const rect = this.stage.container().getBoundingClientRect();
    const left = touches[0];
    const right = touches[1];
    const leftX = left.clientX - rect.left;
    const leftY = left.clientY - rect.top;
    const rightX = right.clientX - rect.left;
    const rightY = right.clientY - rect.top;
    return {
      centerX: (leftX + rightX) / 2,
      centerY: (leftY + rightY) / 2,
      distance: Math.max(1, Math.hypot(rightX - leftX, rightY - leftY)),
    };
  }

  private worldPointer(): { x: number; y: number } | null {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    return {
      x: (pointer.x - this.viewport.x) / this.viewport.scale,
      y: (pointer.y - this.viewport.y) / this.viewport.scale,
    };
  }

  private beginFreehandShape(): void {
    const pointer = this.worldPointer();
    if (!pointer) return;
    const points = [pointer.x, pointer.y, pointer.x, pointer.y];
    const line = new Konva.Line({
      points,
      stroke: this.rasterBrushColor,
      strokeWidth: Math.max(1, this.rasterBrushSize / 8),
      opacity: this.rasterBrushOpacity,
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.2,
      listening: false,
    });
    this.overlayGroup.add(line);
    line.moveToTop();
    this.drawingShape = { points, line };
    this.overlayLayer.batchDraw();
  }

  private continueFreehandShape(): void {
    const drawing = this.drawingShape;
    const pointer = this.worldPointer();
    if (!drawing || !pointer) return;
    const previousX = drawing.points.at(-2) || 0;
    const previousY = drawing.points.at(-1) || 0;
    if (Math.hypot(pointer.x - previousX, pointer.y - previousY) < 2 / this.viewport.scale) return;
    drawing.points.push(pointer.x, pointer.y);
    drawing.line.points(drawing.points);
    this.overlayLayer.batchDraw();
  }

  private finishFreehandShape(): void {
    const drawing = this.drawingShape;
    this.drawingShape = null;
    if (!drawing) return;
    drawing.line.destroy();
    this.overlayLayer.batchDraw();
    if (drawing.points.length >= 4) this.callbacks.onCreatePath(drawing.points, false);
  }

  private addPolygonPoint(commit: boolean): void {
    const pointer = this.worldPointer();
    if (!pointer) return;
    const lastX = this.polygonPoints.at(-2);
    const lastY = this.polygonPoints.at(-1);
    if (lastX !== undefined && Math.hypot(pointer.x - lastX, pointer.y - lastY!) < 1 / this.viewport.scale && !commit) return;
    this.polygonPoints.push(pointer.x, pointer.y);
    if (!this.polygonLine) {
      this.polygonLine = new Konva.Line({
        points: [...this.polygonPoints, pointer.x, pointer.y],
        stroke: this.rasterBrushColor,
        strokeWidth: Math.max(1, this.rasterBrushSize / 8),
        fill: 'rgba(34,211,238,0.14)',
        closed: true,
        lineCap: 'round',
        lineJoin: 'round',
        listening: false,
      });
      this.overlayGroup.add(this.polygonLine);
      this.polygonLine.moveToTop();
    }
    this.updatePolygonPreview();
    if (commit) this.commitPolygon();
  }

  private updatePolygonPreview(): void {
    if (!this.polygonLine) return;
    const pointer = this.worldPointer();
    this.polygonLine.points(pointer ? [...this.polygonPoints, pointer.x, pointer.y] : this.polygonPoints);
    this.overlayLayer.batchDraw();
  }

  commitPolygon(): void {
    if (this.polygonPoints.length < 6) return;
    const points = [...this.polygonPoints];
    this.cancelShapeDrawing();
    this.callbacks.onCreatePath(points, true);
  }

  cancelShapeDrawing(): void {
    this.drawingShape?.line.destroy();
    this.polygonLine?.destroy();
    this.drawingShape = null;
    this.polygonLine = null;
    this.polygonPoints = [];
    this.overlayLayer.batchDraw();
  }

  private activeMask(): UmbraCanvasMaskEntity | null {
    const active = this.document?.entities.find((entity) => entity.id === this.document?.activeEntityId);
    return active?.kind === 'mask' && !active.locked ? active : null;
  }

  private pickColor(): void {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return;
    this.gridLayer.hide();
    this.overlayLayer.hide();
    const canvas = this.stage.toCanvas({ pixelRatio: 1 });
    this.gridLayer.show();
    this.overlayLayer.show();
    this.stage.batchDraw();
    const context = canvas.getContext('2d');
    if (!context) return;
    const pixel = context.getImageData(Math.max(0, Math.floor(pointer.x)), Math.max(0, Math.floor(pointer.y)), 1, 1).data;
    const color = `#${[pixel[0], pixel[1], pixel[2]].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
    this.callbacks.onPickColor(color);
  }

  private activeRaster(): UmbraCanvasRasterEntity | null {
    const active = this.document?.entities.find((entity) => entity.id === this.document?.activeEntityId);
    return active?.kind === 'raster' && !active.locked ? active : null;
  }

  private pointerInEntity(entity: Pick<UmbraCanvasRasterEntity, 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'>): { x: number; y: number } | null {
    const pointer = this.stage.getPointerPosition();
    if (!pointer) return null;
    const worldX = (pointer.x - this.viewport.x) / this.viewport.scale;
    const worldY = (pointer.y - this.viewport.y) / this.viewport.scale;
    const radians = -entity.rotation * Math.PI / 180;
    const offsetX = worldX - entity.x;
    const offsetY = worldY - entity.y;
    return {
      x: (offsetX * Math.cos(radians) - offsetY * Math.sin(radians)) / entity.scaleX,
      y: (offsetX * Math.sin(radians) + offsetY * Math.cos(radians)) / entity.scaleY,
    };
  }

  private pointerInMask(mask: UmbraCanvasMaskEntity): { x: number; y: number } | null {
    return this.pointerInEntity(mask);
  }

  private beginRasterStroke(): void {
    const raster = this.activeRaster();
    if (!raster || (this.tool === 'raster-eraser' && raster.alphaLocked)) return;
    const pointer = this.pointerInEntity(raster);
    if (!pointer) return;
    const points = [pointer.x, pointer.y, pointer.x, pointer.y];
    const line = new Konva.Line({
      x: raster.x,
      y: raster.y,
      scaleX: raster.scaleX,
      scaleY: raster.scaleY,
      rotation: raster.rotation,
      points,
      stroke: this.tool === 'raster-eraser' ? 'rgba(251,113,133,0.78)' : this.rasterBrushColor,
      strokeWidth: this.rasterBrushSize,
      opacity: this.rasterBrushOpacity,
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.25,
      listening: false,
    });
    this.overlayGroup.add(line);
    line.moveToTop();
    this.drawingRaster = { entityId: raster.id, points, line };
    this.overlayLayer.batchDraw();
  }

  private continueRasterStroke(): void {
    const drawing = this.drawingRaster;
    const raster = this.activeRaster();
    if (!drawing || !raster || raster.id !== drawing.entityId) return;
    const pointer = this.pointerInEntity(raster);
    if (!pointer) return;
    const previousX = drawing.points.at(-2) || 0;
    const previousY = drawing.points.at(-1) || 0;
    if (Math.hypot(pointer.x - previousX, pointer.y - previousY) < Math.max(1, this.rasterBrushSize * 0.08)) return;
    drawing.points.push(pointer.x, pointer.y);
    drawing.line.points(drawing.points);
    this.overlayLayer.batchDraw();
  }

  private finishRasterStroke(): void {
    const drawing = this.drawingRaster;
    this.drawingRaster = null;
    if (!drawing) return;
    drawing.line.destroy();
    this.overlayLayer.batchDraw();
    this.callbacks.onRasterStroke(drawing.entityId, createUmbraCanvasRasterStroke({
      mode: this.tool === 'raster-eraser' ? 'erase' : 'paint',
      points: drawing.points,
      size: this.rasterBrushSize,
      opacity: this.rasterBrushOpacity,
      color: this.rasterBrushColor,
    }));
  }

  private beginMaskStroke(): void {
    const mask = this.activeMask();
    if (!mask) return;
    const pointer = this.pointerInMask(mask);
    if (!pointer) return;
    const group = this.maskGroup.findOne(`#${mask.id}`) as Konva.Group | undefined;
    if (!group) return;
    const points = [pointer.x, pointer.y, pointer.x, pointer.y];
    const line = new Konva.Line({
      points,
      stroke: this.tool === 'mask-eraser' ? 'rgba(255,255,255,0.55)' : 'rgba(244,63,94,0.72)',
      strokeWidth: this.maskBrushSize,
      opacity: this.maskBrushOpacity,
      closed: this.tool === 'mask-lasso',
      fill: this.tool === 'mask-lasso' ? 'rgba(244,63,94,0.34)' : undefined,
      lineCap: 'round',
      lineJoin: 'round',
      tension: 0.25,
      listening: false,
    });
    group.add(line);
    this.drawingMask = { entityId: mask.id, points, line };
    this.overlayLayer.batchDraw();
  }

  private continueMaskStroke(): void {
    const drawing = this.drawingMask;
    const mask = this.activeMask();
    if (!drawing || !mask || mask.id !== drawing.entityId) return;
    const pointer = this.pointerInMask(mask);
    if (!pointer) return;
    const previousX = drawing.points.at(-2) || 0;
    const previousY = drawing.points.at(-1) || 0;
    if (Math.hypot(pointer.x - previousX, pointer.y - previousY) < Math.max(1, this.maskBrushSize * 0.08)) return;
    drawing.points.push(pointer.x, pointer.y);
    drawing.line.points(drawing.points);
    this.overlayLayer.batchDraw();
  }

  private finishMaskStroke(): void {
    const drawing = this.drawingMask;
    this.drawingMask = null;
    if (!drawing) return;
    this.callbacks.onMaskStroke(drawing.entityId, createUmbraCanvasMaskStroke({
      mode: this.tool === 'mask-eraser' ? 'erase' : 'paint',
      points: drawing.points,
      size: this.maskBrushSize,
      opacity: this.maskBrushOpacity,
      closed: this.tool === 'mask-lasso',
    }));
  }

  private updateViewport(viewport: UmbraCanvasViewport, notify: boolean): void {
    const nextBucket = viewport.scale > 0.5 ? 1 : viewport.scale > 0.25 ? 0.5 : viewport.scale > 0.125 ? 0.25 : 0.125;
    const bucketChanged = nextBucket !== this.previewScaleBucket;
    this.viewport = viewport;
    this.previewScaleBucket = nextBucket;
    this.applyViewport();
    if (bucketChanged && this.document) {
      if (this.previewRefreshTimer !== null) window.clearTimeout(this.previewRefreshTimer);
      this.previewRefreshTimer = window.setTimeout(() => {
        this.previewRefreshTimer = null;
        if (this.document) void this.renderEntities(this.document);
      }, 120);
    }
    if (notify) this.callbacks.onViewportChange(viewport);
  }

  private applyViewport(): void {
    for (const group of [this.gridGroup, this.backingGroup, this.activeGroup, this.foregroundGroup, this.overlayGroup]) {
      group.position({ x: this.viewport.x, y: this.viewport.y });
      group.scale({ x: this.viewport.scale, y: this.viewport.scale });
    }
    this.drawGrid();
    this.stage.batchDraw();
  }

  private drawGrid(): void {
    this.gridGroup.destroyChildren();
    const scale = this.viewport.scale;
    const left = -this.viewport.x / scale;
    const top = -this.viewport.y / scale;
    const right = left + this.stage.width() / scale;
    const bottom = top + this.stage.height() / scale;
    const spacing = scale < 0.25 ? GRID_MAJOR : GRID_MINOR;
    const startX = Math.floor(left / spacing) * spacing;
    const startY = Math.floor(top / spacing) * spacing;
    for (let x = startX; x <= right + spacing; x += spacing) {
      const major = x % GRID_MAJOR === 0;
      this.gridGroup.add(new Konva.Line({
        points: [x, top - spacing, x, bottom + spacing],
        stroke: major ? 'rgba(103,232,249,0.18)' : 'rgba(255,255,255,0.06)',
        strokeWidth: 1 / scale,
        listening: false,
      }));
      if (major) {
        this.gridGroup.add(new Konva.Text({
          x: x + 5 / scale,
          y: top + 5 / scale,
          text: String(x),
          fontFamily: 'monospace',
          fontSize: 9 / scale,
          fill: 'rgba(103,232,249,0.5)',
          listening: false,
        }));
      }
    }
    for (let y = startY; y <= bottom + spacing; y += spacing) {
      const major = y % GRID_MAJOR === 0;
      this.gridGroup.add(new Konva.Line({
        points: [left - spacing, y, right + spacing, y],
        stroke: major ? 'rgba(103,232,249,0.18)' : 'rgba(255,255,255,0.06)',
        strokeWidth: 1 / scale,
        listening: false,
      }));
      if (major) {
        this.gridGroup.add(new Konva.Text({
          x: left + 5 / scale,
          y: y + 5 / scale,
          text: String(y),
          fontFamily: 'monospace',
          fontSize: 9 / scale,
          fill: 'rgba(103,232,249,0.5)',
          listening: false,
        }));
      }
    }
    this.gridGroup.add(
      new Konva.Line({ points: [0, top - spacing, 0, bottom + spacing], stroke: 'rgba(251,113,133,0.42)', strokeWidth: 1.25 / scale, listening: false }),
      new Konva.Line({ points: [left - spacing, 0, right + spacing, 0], stroke: 'rgba(251,113,133,0.42)', strokeWidth: 1.25 / scale, listening: false }),
    );
    this.gridLayer.batchDraw();
  }

  private renderBbox(bbox: UmbraCanvasRect): void {
    this.bboxRect.setAttrs({ ...bbox, scaleX: 1, scaleY: 1 });
    this.bboxTransformer.forceUpdate();
    this.overlayLayer.batchDraw();
  }

  private commitBbox(): void {
    if (!this.document) return;
    const alignment = this.document.generationAlignment;
    this.bboxRect.setAttrs({
      x: Math.round(this.bboxRect.x() / alignment) * alignment,
      y: Math.round(this.bboxRect.y() / alignment) * alignment,
      width: alignUmbraCanvasDimension(this.bboxRect.width() * Math.abs(this.bboxRect.scaleX()), alignment),
      height: alignUmbraCanvasDimension(this.bboxRect.height() * Math.abs(this.bboxRect.scaleY()), alignment),
      scaleX: 1,
      scaleY: 1,
    });
    this.snapGenerationBboxPosition();
    const bbox = {
      x: Math.round(this.bboxRect.x()),
      y: Math.round(this.bboxRect.y()),
      width: Math.round(this.bboxRect.width()),
      height: Math.round(this.bboxRect.height()),
    };
    this.clearSnapGuides();
    this.bboxTransformer.forceUpdate();
    this.callbacks.onGenerationBboxChange(bbox);
  }

  private clearSnapGuides(): void {
    this.snapGuideGroup.destroyChildren();
    this.overlayLayer.batchDraw();
  }

  private snapGenerationBboxPosition(): void {
    if (!this.document) return;
    const alignment = this.document.generationAlignment;
    const threshold = 8 / Math.max(0.05, this.viewport.scale);
    const width = this.bboxRect.width() * Math.abs(this.bboxRect.scaleX());
    const height = this.bboxRect.height() * Math.abs(this.bboxRect.scaleY());
    const x = Math.round(this.bboxRect.x() / alignment) * alignment;
    const y = Math.round(this.bboxRect.y() / alignment) * alignment;
    const activeX = [x, x + width / 2, x + width];
    const activeY = [y, y + height / 2, y + height];
    let xDelta = 0;
    let yDelta = 0;
    let xDistance = threshold + 1;
    let yDistance = threshold + 1;
    let verticalGuide: number | null = null;
    let horizontalGuide: number | null = null;
    for (const entity of this.document.entities) {
      if (!isUmbraCanvasSpatialEntity(entity) || !entity.visible) continue;
      const bounds = getUmbraCanvasSpatialBounds(entity);
      const targetsX = [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width];
      const targetsY = [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];
      for (const active of activeX) {
        for (const target of targetsX) {
          const activeOffset = active - x;
          const candidateOrigin = Math.round((target - activeOffset) / alignment) * alignment;
          const delta = candidateOrigin - x;
          if (Math.abs(delta) <= threshold && Math.abs(delta) < xDistance) {
            xDelta = delta;
            xDistance = Math.abs(delta);
            verticalGuide = active + delta;
          }
        }
      }
      for (const active of activeY) {
        for (const target of targetsY) {
          const activeOffset = active - y;
          const candidateOrigin = Math.round((target - activeOffset) / alignment) * alignment;
          const delta = candidateOrigin - y;
          if (Math.abs(delta) <= threshold && Math.abs(delta) < yDistance) {
            yDelta = delta;
            yDistance = Math.abs(delta);
            horizontalGuide = active + delta;
          }
        }
      }
    }
    this.bboxRect.position({ x: x + xDelta, y: y + yDelta });
    this.snapGuideGroup.destroyChildren();
    const left = -this.viewport.x / this.viewport.scale;
    const top = -this.viewport.y / this.viewport.scale;
    const right = left + this.stage.width() / this.viewport.scale;
    const bottom = top + this.stage.height() / this.viewport.scale;
    if (verticalGuide !== null) this.snapGuideGroup.add(new Konva.Line({ points: [verticalGuide, top, verticalGuide, bottom], stroke: '#facc15', strokeWidth: 1 / this.viewport.scale, dash: [5 / this.viewport.scale, 4 / this.viewport.scale], listening: false }));
    if (horizontalGuide !== null) this.snapGuideGroup.add(new Konva.Line({ points: [left, horizontalGuide, right, horizontalGuide], stroke: '#facc15', strokeWidth: 1 / this.viewport.scale, dash: [5 / this.viewport.scale, 4 / this.viewport.scale], listening: false }));
    this.overlayLayer.batchDraw();
  }

  private snapDrawableNode(node: Konva.Node, entity: UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity): void {
    if (!this.document) return;
    const threshold = 8 / Math.max(0.05, this.viewport.scale);
    const gridX = Math.round(node.x() / 8) * 8;
    const gridY = Math.round(node.y() / 8) * 8;
    node.position({ x: gridX, y: gridY });
    const nodeBounds = node.getClientRect({ relativeTo: node.getParent() || undefined, skipShadow: true, skipStroke: true });
    const activeX = [nodeBounds.x, nodeBounds.x + nodeBounds.width / 2, nodeBounds.x + nodeBounds.width];
    const activeY = [nodeBounds.y, nodeBounds.y + nodeBounds.height / 2, nodeBounds.y + nodeBounds.height];
    let xDelta = 0;
    let yDelta = 0;
    let xDistance = threshold + 1;
    let yDistance = threshold + 1;
    let verticalGuide: number | null = null;
    let horizontalGuide: number | null = null;
    for (const other of this.document.entities) {
      if (!isUmbraCanvasSpatialEntity(other) || other.id === entity.id || !other.visible || this.selectedEntityIds.has(other.id)) continue;
      const otherBounds = getUmbraCanvasSpatialBounds(other);
      const targetsX = [otherBounds.x, otherBounds.x + otherBounds.width / 2, otherBounds.x + otherBounds.width];
      const targetsY = [otherBounds.y, otherBounds.y + otherBounds.height / 2, otherBounds.y + otherBounds.height];
      for (const active of activeX) {
        for (const target of targetsX) {
          const delta = target - active;
          if (Math.abs(delta) <= threshold && Math.abs(delta) < xDistance) {
            xDelta = delta;
            xDistance = Math.abs(delta);
            verticalGuide = target;
          }
        }
      }
      for (const active of activeY) {
        for (const target of targetsY) {
          const delta = target - active;
          if (Math.abs(delta) <= threshold && Math.abs(delta) < yDistance) {
            yDelta = delta;
            yDistance = Math.abs(delta);
            horizontalGuide = target;
          }
        }
      }
    }
    node.position({ x: gridX + xDelta, y: gridY + yDelta });
    this.snapGuideGroup.destroyChildren();
    const left = -this.viewport.x / this.viewport.scale;
    const top = -this.viewport.y / this.viewport.scale;
    const right = left + this.stage.width() / this.viewport.scale;
    const bottom = top + this.stage.height() / this.viewport.scale;
    if (verticalGuide !== null) this.snapGuideGroup.add(new Konva.Line({ points: [verticalGuide, top, verticalGuide, bottom], stroke: '#facc15', strokeWidth: 1 / this.viewport.scale, dash: [5 / this.viewport.scale, 4 / this.viewport.scale], listening: false }));
    if (horizontalGuide !== null) this.snapGuideGroup.add(new Konva.Line({ points: [left, horizontalGuide, right, horizontalGuide], stroke: '#facc15', strokeWidth: 1 / this.viewport.scale, dash: [5 / this.viewport.scale, 4 / this.viewport.scale], listening: false }));
    this.overlayLayer.batchDraw();
  }

  private refreshEntityTransformer(): void {
    const nodes = this.stage.find((node) => (
      this.selectedEntityIds.has(node.id())
      && (node.hasName('drawable-entity') || node.hasName('mask-entity'))
      && node.isVisible()
      && node.draggable()
    ));
    this.entityTransformer.nodes(nodes);
    this.entityTransformer.visible(this.tool === 'select' && nodes.length > 0);
    this.entityTransformer.forceUpdate();
    this.overlayLayer.batchDraw();
  }

  private beginSelectedDrag(node: Konva.Node): void {
    if (!this.selectedEntityIds.has(node.id())) return;
    const positions = new Map<string, { x: number; y: number }>();
    for (const selected of this.entityTransformer.nodes()) positions.set(selected.id(), { x: selected.x(), y: selected.y() });
    const source = positions.get(node.id());
    if (!source) return;
    this.selectedDragStart = { sourceId: node.id(), sourceX: source.x, sourceY: source.y, positions };
  }

  private moveSelectedDrag(node: Konva.Node, entity: UmbraCanvasDrawableEntity | UmbraCanvasMaskEntity): void {
    this.snapDrawableNode(node, entity);
    const drag = this.selectedDragStart;
    if (!drag || drag.sourceId !== node.id() || drag.positions.size < 2) return;
    const deltaX = node.x() - drag.sourceX;
    const deltaY = node.y() - drag.sourceY;
    for (const selected of this.entityTransformer.nodes()) {
      if (selected.id() === node.id()) continue;
      const origin = drag.positions.get(selected.id());
      if (origin) selected.position({ x: origin.x + deltaX, y: origin.y + deltaY });
    }
    this.entityTransformer.forceUpdate();
    this.stage.batchDraw();
  }

  private commitEntityTransforms(nodes: Konva.Node[]): void {
    const transforms = nodes.map((node) => ({
      entityId: node.id(),
      transform: {
        x: Math.round(node.x()),
        y: Math.round(node.y()),
        scaleX: node.scaleX(),
        scaleY: node.scaleY(),
        rotation: node.rotation(),
      },
    }));
    if (transforms.length > 0) this.callbacks.onTransformEntities(transforms);
  }

  private async renderEntities(project: UmbraCanvasProjectDocument): Promise<void> {
    const token = ++this.renderToken;
    this.backingGroup.destroyChildren();
    this.activeGroup.destroyChildren();
    this.foregroundGroup.destroyChildren();
    this.maskGroup.destroyChildren();
    this.entityTransformer.nodes([]);
    const drawableEntities = project.entities.filter(isUmbraCanvasDrawableEntity);
    const activeIndex = drawableEntities.findIndex((entity) => entity.id === project.activeEntityId);

    for (const mask of project.entities.filter((entity): entity is UmbraCanvasMaskEntity => entity.kind === 'mask')) {
      if (!mask.visible) continue;
      const group = new Konva.Group({
        id: mask.id,
        name: 'mask-entity',
        x: mask.x,
        y: mask.y,
        scaleX: mask.scaleX,
        scaleY: mask.scaleY,
        rotation: mask.rotation,
        width: mask.width,
        height: mask.height,
        clipX: 0,
        clipY: 0,
        clipWidth: mask.width,
        clipHeight: mask.height,
        draggable: !mask.locked,
        listening: this.tool === 'select',
      });
      if (mask.inverted) {
        group.add(new Konva.Rect({
          x: 0,
          y: 0,
          width: mask.width,
          height: mask.height,
          fill: 'rgba(244,63,94,0.25)',
          listening: false,
        }));
      }
      if (mask.imageUrl) {
        const image = await loadImage(mask.imageUrl);
        if (token !== this.renderToken) return;
        group.add(new Konva.Image({
          image: maskSurfaceFor(image, mask, this.viewport.scale),
          width: mask.width,
          height: mask.height,
          globalCompositeOperation: mask.inverted ? 'destination-out' : 'source-over',
          listening: false,
        }));
      }
      for (const stroke of mask.strokes) {
        const erasesOverlay = mask.inverted ? stroke.mode === 'paint' : stroke.mode === 'erase';
        group.add(new Konva.Line({
          points: stroke.points,
          stroke: 'rgba(244,63,94,0.72)',
          strokeWidth: stroke.size,
          opacity: stroke.opacity,
          closed: stroke.closed,
          fill: stroke.closed ? 'rgba(244,63,94,0.38)' : undefined,
          lineCap: 'round',
          lineJoin: 'round',
          tension: 0.25,
          globalCompositeOperation: erasesOverlay ? 'destination-out' : 'source-over',
          listening: false,
        }));
      }
      group.on('pointerdown', (event) => {
        event.cancelBubble = true;
        const pointerEvent = event.evt as PointerEvent;
        this.callbacks.onSelectEntity(mask.id, pointerEvent.shiftKey || pointerEvent.ctrlKey || pointerEvent.metaKey);
      });
      group.on('dragstart', () => this.beginSelectedDrag(group));
      group.on('dragmove', () => this.moveSelectedDrag(group, mask));
      group.on('dragend', () => {
        this.moveSelectedDrag(group, mask);
        this.clearSnapGuides();
        this.commitEntityTransforms(this.selectedDragStart?.positions.has(group.id()) ? this.entityTransformer.nodes() : [group]);
        this.selectedDragStart = null;
      });
      this.maskGroup.add(group);
    }

    for (let index = 0; index < drawableEntities.length; index += 1) {
      const entity = drawableEntities[index];
      if (!entity.visible) continue;
      try {
        let node: Konva.Node;
        if (entity.kind === 'raster') {
          const image = await loadImage(entity.imageUrl);
          if (token !== this.renderToken) return;
          const surface = rasterSurfaceFor(image, entity, this.viewport.scale);
          node = new Konva.Image({
            image: surface,
            width: entity.width,
            height: entity.height,
          });
        } else {
          const group = new Konva.Group({ width: entity.width, height: entity.height });
          if (entity.kind === 'shape') {
            group.add(entity.shape === 'ellipse'
              ? new Konva.Ellipse({
                  x: entity.width / 2,
                  y: entity.height / 2,
                  radiusX: entity.width / 2,
                  radiusY: entity.height / 2,
                  fill: entity.fill,
                  stroke: entity.stroke,
                  strokeWidth: entity.strokeWidth,
                  listening: false,
                })
              : new Konva.Rect({
                  width: entity.width,
                  height: entity.height,
                  fill: entity.fill,
                  stroke: entity.stroke,
                  strokeWidth: entity.strokeWidth,
                  listening: false,
                }));
          } else if (entity.kind === 'text') {
            group.add(new Konva.Text({
              width: entity.width,
              height: entity.height,
              text: entity.text,
              fontFamily: entity.fontFamily,
              fontSize: entity.fontSize,
              fontStyle: entity.fontStyle,
              lineHeight: 1.2,
              align: entity.align,
              fill: entity.fill,
              wrap: 'word',
              listening: false,
            }));
          } else if (entity.kind === 'path') {
            group.add(new Konva.Line({
              points: entity.points,
              closed: entity.closed,
              fill: entity.fillEnabled && entity.closed ? entity.fill : undefined,
              stroke: entity.stroke,
              strokeWidth: entity.strokeWidth,
              lineCap: 'round',
              lineJoin: 'round',
              hitStrokeWidth: Math.max(12, entity.strokeWidth),
            }));
          } else {
            const radians = (entity.angle * Math.PI) / 180;
            const centerX = entity.width / 2;
            const centerY = entity.height / 2;
            const extent = Math.abs(Math.cos(radians)) * entity.width / 2 + Math.abs(Math.sin(radians)) * entity.height / 2;
            group.add(new Konva.Rect({
              width: entity.width,
              height: entity.height,
              fillLinearGradientStartPoint: { x: centerX - Math.cos(radians) * extent, y: centerY - Math.sin(radians) * extent },
              fillLinearGradientEndPoint: { x: centerX + Math.cos(radians) * extent, y: centerY + Math.sin(radians) * extent },
              fillLinearGradientColorStops: [0, entity.startColor, 1, entity.endColor],
              listening: false,
            }));
          }
          node = group;
        }
        node.setAttrs({
          id: entity.id,
          name: entity.kind === 'raster' ? 'drawable-entity raster-entity' : `drawable-entity ${entity.kind}-entity`,
          x: entity.x,
          y: entity.y,
          scaleX: entity.scaleX,
          scaleY: entity.scaleY,
          rotation: entity.rotation,
          opacity: entity.opacity,
          globalCompositeOperation: entity.blendMode,
          draggable: !entity.locked,
          // Direct selection stays available for every visible spatial entity.
          listening: this.tool === 'select',
        });
        node.on('pointerdown', (event) => {
          event.cancelBubble = true;
          const pointerEvent = event.evt as PointerEvent;
          this.callbacks.onSelectEntity(entity.id, pointerEvent.shiftKey || pointerEvent.ctrlKey || pointerEvent.metaKey);
        });
        node.on('dragstart', () => this.beginSelectedDrag(node));
        node.on('dragmove', () => this.moveSelectedDrag(node, entity));
        node.on('dragend', () => {
          this.moveSelectedDrag(node, entity);
          this.clearSnapGuides();
          this.commitEntityTransforms(this.selectedDragStart?.positions.has(node.id()) ? this.entityTransformer.nodes() : [node]);
          this.selectedDragStart = null;
        });
        const target = activeIndex < 0 || index < activeIndex
          ? this.backingGroup
          : index === activeIndex
            ? this.activeGroup
            : this.foregroundGroup;
        target.add(node as Konva.Group | Konva.Shape);
      } catch {
        // A failed asset remains in the layer list and can be repaired later.
      }
    }
    if (token !== this.renderToken) return;
    this.refreshEntityTransformer();
    this.backingLayer.batchDraw();
    this.activeLayer.batchDraw();
    this.foregroundLayer.batchDraw();
    this.overlayLayer.batchDraw();
  }
}
