/**
 * WebGLViewer — Interactive image viewer with zoom/pan, powered by WebGLPipeline.
 * Pure vanilla JS class, no React dependencies.
 */

import { WebGLPipeline, EditAdjustments } from './WebGLPipeline';
import { EventBus } from '../EventBus';
import { isModalOpen } from '../editor/ModalGuard';
import { WatermarkEngine, WatermarkConfig, WatermarkCounterContext } from '../editor/WatermarkEngine';

export class WebGLViewer {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private pipeline: WebGLPipeline;
  private eventBus: EventBus;

  // View state
  private zoom = 1;
  private panX = 0;
  private panY = 0;
  private isFitted = true;

  // Drag state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  // Image state
  private loaded = false;

  // Watermark preview
  private watermarkConfig: WatermarkConfig | null = null;
  private watermarkCounterContext: WatermarkCounterContext = { index: 1, total: 1 };
  private _onWatermarkChanged: ((config: WatermarkConfig) => void) | null = null;
  private _onWatermarkCounterContext: ((data: { index?: number; total?: number; path?: string | null }) => void) | null = null;
  private _onMaskModeSet: ((data: { enabled: boolean }) => void) | null = null;
  private _onMaskToolSet: ((data: { tool?: 'brush' | 'eraser'; brushSize?: number; opacity?: number }) => void) | null = null;
  private _onMaskClear: (() => void) | null = null;
  private _onMaskUndo: (() => void) | null = null;
  private _onMaskRedo: (() => void) | null = null;
  private _onMaskExportRequest: ((data: { requestId: string }) => void) | null = null;
  private _onMaskImport: ((data: { blob: Blob; replace?: boolean }) => void) | null = null;

  // Bound handlers for cleanup
  private _onWheel: (e: WheelEvent) => void;
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onMouseUp: (e: MouseEvent) => void;
  private _onDblClick: (e: MouseEvent) => void;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onResize: () => void;
  private _onAdjustmentsChanged: ((adj: Partial<EditAdjustments>) => void) | null = null;
  private pendingAdjustments: Partial<EditAdjustments> | null = null;
  private renderRafId: number | null = null;

  // Mask brush mode (in-app object removal mask)
  private maskEnabled = false;
  private maskTool: 'brush' | 'eraser' = 'brush';
  private maskBrushSize = 36; // screen pixels
  private maskOpacity = 0.5; // overlay preview opacity
  private maskDrawing = false;
  private maskLastX = 0;
  private maskLastY = 0;
  private maskOverlayCanvas: HTMLCanvasElement;
  private maskOverlayCtx: CanvasRenderingContext2D | null = null;
  private maskDataCanvas: HTMLCanvasElement;
  private maskDataCtx: CanvasRenderingContext2D;
  private viewScale = 1;
  private viewDrawX = 0;
  private viewDrawY = 0;
  private viewDrawW = 0;
  private viewDrawH = 0;
  private _onMaskMouseDown: (e: MouseEvent) => void;
  private _onMaskMouseMove: (e: MouseEvent) => void;
  private _onMaskMouseUp: (_e: MouseEvent) => void;
  private _onMaskMouseLeave: () => void;
  private maskHoverVisible = false;
  private maskHoverScreenX = 0;
  private maskHoverScreenY = 0;
  private maskHistory: ImageData[] = [];
  private maskHistoryIndex = -1;
  private readonly maskHistoryMax = 50;

  constructor(container: HTMLElement, eventBus: EventBus) {
    this.container = container;
    this.eventBus = eventBus;

    // Create the rendering canvas (full resolution, hidden — used by pipeline)
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'none';

    // Create the display canvas (shown to user, CSS-scaled)
    this.displayCanvas = document.createElement('canvas');
    this.displayCanvas.style.position = 'absolute';
    this.displayCanvas.style.top = '0';
    this.displayCanvas.style.left = '0';
    this.displayCanvas.style.width = '100%';
    this.displayCanvas.style.height = '100%';
    this.displayCanvas.style.objectFit = 'contain';
    this.displayCanvas.style.imageRendering = 'auto';
    this.displayCanvas.style.cursor = 'default';

    // Mask overlay canvas (user interaction + overlay preview)
    this.maskOverlayCanvas = document.createElement('canvas');
    this.maskOverlayCanvas.style.position = 'absolute';
    this.maskOverlayCanvas.style.top = '0';
    this.maskOverlayCanvas.style.left = '0';
    this.maskOverlayCanvas.style.width = '100%';
    this.maskOverlayCanvas.style.height = '100%';
    this.maskOverlayCanvas.style.pointerEvents = 'none';
    this.maskOverlayCanvas.style.cursor = 'crosshair';

    // Internal image-space mask buffer (native image dimensions)
    this.maskDataCanvas = document.createElement('canvas');
    this.maskDataCtx = this.maskDataCanvas.getContext('2d', { willReadFrequently: true })!;

    container.style.position = 'relative';
    container.style.overflow = 'hidden';
    container.appendChild(this.canvas);
    container.appendChild(this.displayCanvas);
    container.appendChild(this.maskOverlayCanvas);

    this.pipeline = new WebGLPipeline(this.canvas);

    // Bind event handlers
    this._onWheel = this.onWheel.bind(this);
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onDblClick = this.onDblClick.bind(this);
    this._onKeyDown = this.onKeyDown.bind(this);
    this._onResize = this.updateDisplay.bind(this);
    this._onMaskMouseDown = this.onMaskMouseDown.bind(this);
    this._onMaskMouseMove = this.onMaskMouseMove.bind(this);
    this._onMaskMouseUp = this.onMaskMouseUp.bind(this);
    this._onMaskMouseLeave = this.onMaskMouseLeave.bind(this);

    this.displayCanvas.addEventListener('wheel', this._onWheel, { passive: false });
    this.displayCanvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.displayCanvas.addEventListener('dblclick', this._onDblClick);
    window.addEventListener('keydown', this._onKeyDown);
    this.maskOverlayCanvas.addEventListener('mousedown', this._onMaskMouseDown);
    window.addEventListener('mousemove', this._onMaskMouseMove);
    window.addEventListener('mouseup', this._onMaskMouseUp);
    this.maskOverlayCanvas.addEventListener('mouseleave', this._onMaskMouseLeave);

    this.resizeObserver = new ResizeObserver(this._onResize);
    this.resizeObserver.observe(container);

    // Listen for adjustment changes from editor
    this._onAdjustmentsChanged = (adj: Partial<EditAdjustments>) => {
      this.onAdjustmentsChanged(adj);
    };
    this.eventBus.on('editor:adjustments-changed', this._onAdjustmentsChanged);

    // Listen for watermark config changes (live preview)
    this._onWatermarkChanged = (config: WatermarkConfig) => {
      this.watermarkConfig = config;
      this.updateDisplay();
    };
    this.eventBus.on('editor:watermark-changed', this._onWatermarkChanged);

    this._onWatermarkCounterContext = (data: { index?: number; total?: number }) => {
      const rawTotal = Number(data?.total);
      const rawIndex = Number(data?.index);
      const total = Number.isFinite(rawTotal) ? Math.max(1, Math.floor(rawTotal)) : 1;
      const index = Number.isFinite(rawIndex) ? Math.max(1, Math.floor(rawIndex)) : 1;
      this.watermarkCounterContext = {
        index: Math.min(index, total),
        total,
      };
      this.updateDisplay();
    };
    this.eventBus.on('editor:watermark-counter-context', this._onWatermarkCounterContext);

    this._onMaskModeSet = (data: { enabled: boolean }) => {
      this.maskEnabled = !!data?.enabled;
      this.maskOverlayCanvas.style.pointerEvents = this.maskEnabled ? 'auto' : 'none';
      this.maskHoverVisible = false;
      this.updateDisplay();
    };
    this.eventBus.on('editor:mask-mode:set', this._onMaskModeSet);

    this._onMaskToolSet = (data: { tool?: 'brush' | 'eraser'; brushSize?: number; opacity?: number }) => {
      if (data.tool) this.maskTool = data.tool;
      if (typeof data.brushSize === 'number' && Number.isFinite(data.brushSize)) {
        this.maskBrushSize = Math.max(1, data.brushSize);
      }
      if (typeof data.opacity === 'number' && Number.isFinite(data.opacity)) {
        this.maskOpacity = Math.min(1, Math.max(0, data.opacity));
      }
      this.updateDisplay();
    };
    this.eventBus.on('editor:mask-tool:set', this._onMaskToolSet);

    this._onMaskClear = () => {
      this.clearMask(true);
      this.updateDisplay();
    };
    this.eventBus.on('editor:mask-clear', this._onMaskClear);

    this._onMaskUndo = () => {
      this.maskUndo();
      this.updateDisplay();
    };
    this.eventBus.on('editor:mask-undo', this._onMaskUndo);

    this._onMaskRedo = () => {
      this.maskRedo();
      this.updateDisplay();
    };
    this.eventBus.on('editor:mask-redo', this._onMaskRedo);

    this._onMaskExportRequest = async (data: { requestId: string }) => {
      const blob = await this.exportMaskBlob();
      this.eventBus.emit('editor:mask-export-response', {
        requestId: data?.requestId,
        blob,
        hasMask: this.hasMaskPixels(),
      });
    };
    this.eventBus.on('editor:mask-export-request', this._onMaskExportRequest);

    this._onMaskImport = async (data: { blob: Blob; replace?: boolean }) => {
      if (!data?.blob) return;
      await this.importMaskBlob(data.blob, data.replace !== false);
    };
    this.eventBus.on('editor:mask-import', this._onMaskImport);
  }

  // Display canvas (visible to user)
  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D | null = null;
  private resizeObserver: ResizeObserver;

  async loadImage(src: string): Promise<void> {
    this.loaded = false;

    try {
      await this.pipeline.loadImage(src);
      this.loaded = true;
      const dims = this.pipeline.getImageDimensions();
      this.maskDataCanvas.width = dims.width;
      this.maskDataCanvas.height = dims.height;
      this.clearMask(false);
      this.initMaskHistory();
      this.fitToView();
      this.renderAndDisplay();
    } catch (err) {
      console.error('[WebGLViewer] Failed to load image:', err);
    }
  }

  setAdjustments(adj: Partial<EditAdjustments>): void {
    this.pipeline.setAdjustments(adj);
    if (this.loaded) this.renderAndDisplay();
  }

  getAdjustments(): EditAdjustments {
    return this.pipeline.getAdjustments();
  }

  getPipeline(): WebGLPipeline {
    return this.pipeline;
  }

  private onAdjustmentsChanged(adj: Partial<EditAdjustments>): void {
    this.pendingAdjustments = {
      ...(this.pendingAdjustments || {}),
      ...adj,
    };

    if (this.renderRafId !== null) return;
    this.renderRafId = requestAnimationFrame(() => {
      this.renderRafId = null;
      const next = this.pendingAdjustments;
      this.pendingAdjustments = null;
      if (!next) return;
      this.pipeline.setAdjustments(next);
      if (this.loaded) this.renderAndDisplay();
    });
  }

  private renderAndDisplay(): void {
    if (!this.loaded) return;

    // Run the WebGL pipeline
    this.pipeline.render();

    // Draw the pipeline output onto the display canvas with zoom/pan
    this.updateDisplay();

    // Emit pixel data for histogram
    this.eventBus.emit('editor:render-complete');
  }

  private updateDisplay(): void {
    if (!this.loaded) return;

    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    if (cw === 0 || ch === 0) return;

    // Size display canvas to container
    if (this.displayCanvas.width !== cw || this.displayCanvas.height !== ch) {
      this.displayCanvas.width = cw;
      this.displayCanvas.height = ch;
    }

    if (!this.displayCtx) {
      this.displayCtx = this.displayCanvas.getContext('2d', { alpha: true })!;
    }

    const ctx = this.displayCtx;
    const dims = this.pipeline.getImageDimensions();

    // Calculate fitted size
    const scale = this.isFitted
      ? Math.min(cw / dims.width, ch / dims.height)
      : this.zoom;

    const drawW = dims.width * scale;
    const drawH = dims.height * scale;

    // Center the image, then apply pan offset
    const drawX = (cw - drawW) / 2 + this.panX;
    const drawY = (ch - drawH) / 2 + this.panY;
    this.viewScale = scale;
    this.viewDrawX = drawX;
    this.viewDrawY = drawY;
    this.viewDrawW = drawW;
    this.viewDrawH = drawH;

    ctx.clearRect(0, 0, cw, ch);

    // Draw the pipeline canvas (which contains the rendered image)
    ctx.drawImage(this.canvas, drawX, drawY, drawW, drawH);

    // Draw watermark preview overlay if enabled
    if (this.watermarkConfig?.enabled) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(drawX, drawY, drawW, drawH);
      ctx.clip();
      ctx.translate(drawX, drawY);
      WatermarkEngine.apply(ctx, drawW, drawH, this.watermarkConfig, this.watermarkCounterContext);
      ctx.restore();
    }

    // Update cursor
    this.displayCanvas.style.cursor = scale > Math.min(cw / dims.width, ch / dims.height)
      ? (this.isDragging ? 'grabbing' : 'grab')
      : 'default';

    // Mask preview overlay
    if (this.maskOverlayCanvas.width !== cw || this.maskOverlayCanvas.height !== ch) {
      this.maskOverlayCanvas.width = cw;
      this.maskOverlayCanvas.height = ch;
    }
    if (!this.maskOverlayCtx) {
      this.maskOverlayCtx = this.maskOverlayCanvas.getContext('2d')!;
    }
    const mctx = this.maskOverlayCtx;
    mctx.clearRect(0, 0, cw, ch);
    if (this.maskDataCanvas.width > 0 && this.maskDataCanvas.height > 0) {
      mctx.globalAlpha = this.maskOpacity;
      mctx.drawImage(this.maskDataCanvas, drawX, drawY, drawW, drawH);
      mctx.globalAlpha = 1;
    }

    if (this.maskEnabled) {
      this.maskOverlayCanvas.style.cursor = this.maskTool === 'eraser' ? 'cell' : 'crosshair';
      if (this.maskHoverVisible) {
        mctx.save();
        mctx.beginPath();
        mctx.arc(this.maskHoverScreenX, this.maskHoverScreenY, this.maskBrushSize / 2, 0, Math.PI * 2);
        mctx.strokeStyle = this.maskTool === 'eraser'
          ? 'rgba(251,113,133,0.95)'
          : 'rgba(255,255,255,0.95)';
        mctx.lineWidth = 1.5;
        mctx.setLineDash([6, 4]);
        mctx.stroke();
        mctx.restore();
      }
    }

    // Emit zoom level for UI
    this.eventBus.emit('viewer:zoom-changed', Math.round(scale * 100));
  }

  fitToView(): void {
    this.isFitted = true;
    this.panX = 0;
    this.panY = 0;
    const dims = this.pipeline.getImageDimensions();
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;
    this.zoom = Math.min(cw / dims.width, ch / dims.height);
    this.updateDisplay();
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (!this.loaded) return;

    const dims = this.pipeline.getImageDimensions();
    const cw = this.container.clientWidth;
    const ch = this.container.clientHeight;

    const oldZoom = this.isFitted
      ? Math.min(cw / dims.width, ch / dims.height)
      : this.zoom;

    // Zoom factor
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));

    if (this.isFitted) {
      this.isFitted = false;
    }

    // Zoom toward cursor position
    const rect = this.displayCanvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const centerX = cw / 2 + this.panX;
    const centerY = ch / 2 + this.panY;

    const dx = mouseX - centerX;
    const dy = mouseY - centerY;

    this.panX -= dx * (newZoom / oldZoom - 1);
    this.panY -= dy * (newZoom / oldZoom - 1);

    this.zoom = newZoom;
    this.updateDisplay();
  }

  private onMouseDown(e: MouseEvent): void {
    if (this.maskEnabled) return;
    if (e.button !== 0) return;
    this.isDragging = true;
    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.maskEnabled) return;
    if (!this.isDragging) return;
    this.panX = this.panStartX + (e.clientX - this.dragStartX);
    this.panY = this.panStartY + (e.clientY - this.dragStartY);
    this.updateDisplay();
  }

  private onMouseUp(_e: MouseEvent): void {
    this.isDragging = false;
  }

  private onDblClick(_e: MouseEvent): void {
    if (this.maskEnabled) return;
    if (!this.loaded) return;

    if (this.isFitted) {
      // Zoom to 100%
      this.isFitted = false;
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
    } else {
      this.fitToView();
      return;
    }
    this.updateDisplay();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!this.loaded) return;
    if (isModalOpen()) return;
    const target = e.target as HTMLElement | null;
    const isTyping =
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'SELECT' ||
      !!target?.isContentEditable ||
      !!target?.closest('[contenteditable="true"]') ||
      !!target?.closest('.monaco-editor') ||
      !!target?.closest('.monaco-list') ||
      !!target?.closest('.suggest-widget') ||
      !!target?.closest('.quick-input-widget') ||
      !!target?.closest('.parameter-hints-widget');
    if (isTyping) return;
    if (this.maskEnabled && (e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      e.stopPropagation();
      this.maskUndo();
      this.updateDisplay();
      return;
    }
    if (this.maskEnabled && (
      ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z'))
    )) {
      e.preventDefault();
      e.stopPropagation();
      this.maskRedo();
      this.updateDisplay();
      return;
    }
    if (this.maskEnabled && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      this.maskTool = 'brush';
      this.updateDisplay();
      return;
    }
    if (this.maskEnabled && (e.key === 'x' || e.key === 'X')) {
      e.preventDefault();
      this.maskTool = 'eraser';
      this.updateDisplay();
      return;
    }
    if (e.key === '0') {
      e.preventDefault();
      this.fitToView();
    }
  }

  private screenToImage(x: number, y: number): { x: number; y: number } | null {
    if (!this.loaded) return null;
    if (x < this.viewDrawX || y < this.viewDrawY || x > this.viewDrawX + this.viewDrawW || y > this.viewDrawY + this.viewDrawH) {
      return null;
    }

    const ix = (x - this.viewDrawX) / this.viewScale;
    const iy = (y - this.viewDrawY) / this.viewScale;
    const dims = this.pipeline.getImageDimensions();

    return {
      x: Math.max(0, Math.min(dims.width - 1, ix)),
      y: Math.max(0, Math.min(dims.height - 1, iy)),
    };
  }

  private onMaskMouseDown(e: MouseEvent): void {
    if (!this.maskEnabled || !this.loaded || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = this.maskOverlayCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const p = this.screenToImage(sx, sy);
    if (!p) return;

    this.maskHoverVisible = true;
    this.maskHoverScreenX = sx;
    this.maskHoverScreenY = sy;
    this.maskDrawing = true;
    this.maskLastX = p.x;
    this.maskLastY = p.y;
    this.drawMaskStroke(p.x, p.y);
  }

  private onMaskMouseMove(e: MouseEvent): void {
    if (!this.maskEnabled || !this.loaded) return;

    const rect = this.maskOverlayCanvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const p = this.screenToImage(sx, sy);
    if (!p) {
      this.maskHoverVisible = false;
      this.updateDisplay();
      return;
    }

    this.maskHoverVisible = true;
    this.maskHoverScreenX = sx;
    this.maskHoverScreenY = sy;
    if (this.maskDrawing) {
      this.drawMaskStroke(p.x, p.y);
    } else {
      this.updateDisplay();
    }
  }

  private onMaskMouseUp(_e: MouseEvent): void {
    if (this.maskDrawing) {
      this.saveMaskHistory();
    }
    this.maskDrawing = false;
  }

  private onMaskMouseLeave(): void {
    this.maskHoverVisible = false;
    this.updateDisplay();
  }

  private drawMaskStroke(x: number, y: number): void {
    const lineWidth = Math.max(1, this.maskBrushSize / Math.max(0.001, this.viewScale));
    this.maskDataCtx.beginPath();
    this.maskDataCtx.lineCap = 'round';
    this.maskDataCtx.lineJoin = 'round';
    this.maskDataCtx.lineWidth = lineWidth;

    if (this.maskTool === 'eraser') {
      this.maskDataCtx.globalCompositeOperation = 'destination-out';
      this.maskDataCtx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      this.maskDataCtx.globalCompositeOperation = 'source-over';
      this.maskDataCtx.strokeStyle = 'rgba(255,255,255,1)';
    }

    this.maskDataCtx.moveTo(this.maskLastX, this.maskLastY);
    this.maskDataCtx.lineTo(x, y);
    this.maskDataCtx.stroke();
    this.maskLastX = x;
    this.maskLastY = y;
    this.updateDisplay();
  }

  private clearMask(recordHistory = true): void {
    if (this.maskDataCanvas.width === 0 || this.maskDataCanvas.height === 0) return;
    this.maskDataCtx.clearRect(0, 0, this.maskDataCanvas.width, this.maskDataCanvas.height);
    if (recordHistory) this.saveMaskHistory();
  }

  private initMaskHistory(): void {
    this.maskHistory = [];
    this.maskHistoryIndex = -1;
    this.saveMaskHistory();
  }

  private saveMaskHistory(): void {
    if (this.maskDataCanvas.width === 0 || this.maskDataCanvas.height === 0) return;
    this.maskHistory = this.maskHistory.slice(0, this.maskHistoryIndex + 1);
    const snapshot = this.maskDataCtx.getImageData(0, 0, this.maskDataCanvas.width, this.maskDataCanvas.height);
    this.maskHistory.push(snapshot);
    this.maskHistoryIndex = this.maskHistory.length - 1;
    if (this.maskHistory.length > this.maskHistoryMax) {
      this.maskHistory.shift();
      this.maskHistoryIndex = this.maskHistory.length - 1;
    }
  }

  private maskUndo(): void {
    if (this.maskHistoryIndex <= 0) return;
    this.maskHistoryIndex -= 1;
    const snapshot = this.maskHistory[this.maskHistoryIndex];
    if (snapshot) this.maskDataCtx.putImageData(snapshot, 0, 0);
  }

  private maskRedo(): void {
    if (this.maskHistoryIndex >= this.maskHistory.length - 1) return;
    this.maskHistoryIndex += 1;
    const snapshot = this.maskHistory[this.maskHistoryIndex];
    if (snapshot) this.maskDataCtx.putImageData(snapshot, 0, 0);
  }

  private hasMaskPixels(): boolean {
    if (this.maskDataCanvas.width === 0 || this.maskDataCanvas.height === 0) return false;
    const data = this.maskDataCtx.getImageData(0, 0, this.maskDataCanvas.width, this.maskDataCanvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  }

  private async exportMaskBlob(): Promise<Blob> {
    const w = this.maskDataCanvas.width;
    const h = this.maskDataCanvas.height;
    const out = document.createElement('canvas');
    out.width = Math.max(1, w);
    out.height = Math.max(1, h);
    const octx = out.getContext('2d', { willReadFrequently: true })!;
    const src = this.maskDataCtx.getImageData(0, 0, w, h);
    const dst = octx.createImageData(w, h);

    for (let i = 0; i < src.data.length; i += 4) {
      const a = src.data[i + 3] > 0 ? 255 : 0;
      dst.data[i] = a;
      dst.data[i + 1] = a;
      dst.data[i + 2] = a;
      dst.data[i + 3] = 255;
    }

    octx.putImageData(dst, 0, 0);
    return await new Promise<Blob>((resolve) => {
      out.toBlob((blob) => resolve(blob || new Blob()), 'image/png');
    });
  }

  private async importMaskBlob(blob: Blob, replace = true): Promise<void> {
    if (!this.loaded || this.maskDataCanvas.width === 0 || this.maskDataCanvas.height === 0) return;

    const bitmap = await createImageBitmap(blob);
    const tmp = document.createElement('canvas');
    tmp.width = this.maskDataCanvas.width;
    tmp.height = this.maskDataCanvas.height;
    const tctx = tmp.getContext('2d', { willReadFrequently: true })!;
    tctx.clearRect(0, 0, tmp.width, tmp.height);
    tctx.drawImage(bitmap, 0, 0, tmp.width, tmp.height);
    bitmap.close();

    const src = tctx.getImageData(0, 0, tmp.width, tmp.height).data;
    const dst = this.maskDataCtx.getImageData(0, 0, this.maskDataCanvas.width, this.maskDataCanvas.height);

    for (let i = 0; i < dst.data.length; i += 4) {
      const lum = Math.max(src[i], src[i + 1], src[i + 2], src[i + 3]);
      const a = lum > 127 ? 255 : 0;
      if (replace) {
        dst.data[i] = 255;
        dst.data[i + 1] = 255;
        dst.data[i + 2] = 255;
        dst.data[i + 3] = a;
      } else {
        if (a > 0) {
          dst.data[i] = 255;
          dst.data[i + 1] = 255;
          dst.data[i + 2] = 255;
          dst.data[i + 3] = 255;
        }
      }
    }

    this.maskDataCtx.putImageData(dst, 0, 0);
    this.saveMaskHistory();
    this.updateDisplay();
  }

  /** Read pixels from the rendered output (for histogram) */
  readPixels(): Uint8Array {
    return this.pipeline.readPixels();
  }

  getImageDimensions(): { width: number; height: number } {
    return this.pipeline.getImageDimensions();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  destroy(): void {
    this.displayCanvas.removeEventListener('wheel', this._onWheel);
    this.displayCanvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    window.removeEventListener('mousemove', this._onMaskMouseMove);
    window.removeEventListener('mouseup', this._onMaskMouseUp);
    this.displayCanvas.removeEventListener('dblclick', this._onDblClick);
    window.removeEventListener('keydown', this._onKeyDown);
    this.maskOverlayCanvas.removeEventListener('mousedown', this._onMaskMouseDown);
    this.maskOverlayCanvas.removeEventListener('mouseleave', this._onMaskMouseLeave);
    this.resizeObserver.disconnect();
    if (this.renderRafId !== null) {
      cancelAnimationFrame(this.renderRafId);
      this.renderRafId = null;
    }
    this.pendingAdjustments = null;
    if (this._onAdjustmentsChanged) this.eventBus.off('editor:adjustments-changed', this._onAdjustmentsChanged);
    if (this._onWatermarkChanged) this.eventBus.off('editor:watermark-changed', this._onWatermarkChanged);
    if (this._onWatermarkCounterContext) this.eventBus.off('editor:watermark-counter-context', this._onWatermarkCounterContext);
    if (this._onMaskModeSet) this.eventBus.off('editor:mask-mode:set', this._onMaskModeSet);
    if (this._onMaskToolSet) this.eventBus.off('editor:mask-tool:set', this._onMaskToolSet);
    if (this._onMaskClear) this.eventBus.off('editor:mask-clear', this._onMaskClear);
    if (this._onMaskUndo) this.eventBus.off('editor:mask-undo', this._onMaskUndo);
    if (this._onMaskRedo) this.eventBus.off('editor:mask-redo', this._onMaskRedo);
    if (this._onMaskExportRequest) this.eventBus.off('editor:mask-export-request', this._onMaskExportRequest);
    if (this._onMaskImport) this.eventBus.off('editor:mask-import', this._onMaskImport);
    this.pipeline.destroy();

    if (this.canvas.parentElement) this.canvas.parentElement.removeChild(this.canvas);
    if (this.displayCanvas.parentElement) this.displayCanvas.parentElement.removeChild(this.displayCanvas);
    if (this.maskOverlayCanvas.parentElement) this.maskOverlayCanvas.parentElement.removeChild(this.maskOverlayCanvas);
  }
}
