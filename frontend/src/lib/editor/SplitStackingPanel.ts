import JSZip from 'jszip';
import { EventBus } from '../EventBus';
import { emitFolderTreeChanged } from '@/utils/folderTreeEvents';
import { loadAppSettings } from '@/lib/appSettings';

type SplitMode = 'stack' | 'bash' | null;

interface SplitZone {
  y: number;
  height: number;
  imageIndex?: number;
}

export class SplitStackingPanel {
  private container: HTMLElement;
  private eventBus: EventBus;

  private currentPath: string | null = null;
  private multiEditPaths: string[] = [];

  private mode: SplitMode = null;
  private sourceImage: HTMLImageElement | null = null;
  private sourceImages: HTMLImageElement[] = [];
  private sourcePaths: string[] = [];
  private outputBasePath: string | null = null;

  private zones: SplitZone[] = [];
  private gapSize = 40;
  private minZoneHeight = 80;
  private imageHeight = 0;

  private selectedZone = -1;
  private hoveredZone = -1;
  private draggingDivider = -2; // -2 none, -1 top, 0..5 internal, 6 bottom
  private dragStartY = 0;
  private dragStartPositions: { zones: SplitZone[] } | null = null;

  private root: HTMLDivElement;
  private instructionEl: HTMLDivElement;
  private controlsEl: HTMLDivElement;
  private modeLabelEl: HTMLDivElement;
  private openBtn: HTMLButtonElement;

  private overlayEl: HTMLDivElement | null = null;
  private baseCanvas: HTMLCanvasElement | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private baseCtx: CanvasRenderingContext2D | null = null;
  private overlayCtx: CanvasRenderingContext2D | null = null;
  private scale = 1;
  private resizeHandler: (() => void) | null = null;

  constructor(container: HTMLElement, eventBus: EventBus) {
    this.container = container;
    this.eventBus = eventBus;

    this.root = document.createElement('div');
    this.root.style.cssText = 'padding: 12px 14px;';

    this.modeLabelEl = document.createElement('div');
    this.modeLabelEl.style.cssText = `
      font-size: 10px; color: #ec4899; text-transform: uppercase;
      letter-spacing: 0.8px; margin-bottom: 10px; font-weight: 700;
    `;
    this.modeLabelEl.textContent = 'Split Tools';
    this.root.appendChild(this.modeLabelEl);

    this.instructionEl = document.createElement('div');
    this.instructionEl.style.cssText = `
      border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;
      padding: 12px; background: rgba(255,255,255,0.03);
      font-size: 12px; color: #a1a1aa; line-height: 1.45; margin-bottom: 12px;
    `;
    this.root.appendChild(this.instructionEl);

    this.controlsEl = document.createElement('div');
    this.controlsEl.style.cssText = 'display: none;';

    this.openBtn = document.createElement('button');
    this.openBtn.style.cssText = `
      width: 100%; padding: 8px 10px; border-radius: 6px; border: none;
      background: var(--umbra-accent, #6366f1); color: white;
      font-size: 12px; font-weight: 700; cursor: pointer;
    `;
    this.openBtn.addEventListener('click', () => this.openEditor());
    this.controlsEl.appendChild(this.openBtn);

    const help = document.createElement('div');
    help.style.cssText = 'font-size: 11px; color: #71717a; margin-top: 8px; line-height: 1.4;';
    help.textContent = 'Split Stacking: 1 image -> 4 outputs. Split Bashing: 4 images -> 1 combined output.';
    this.controlsEl.appendChild(help);

    this.root.appendChild(this.controlsEl);
    this.container.appendChild(this.root);

    this.updatePanelUI();
  }

  setSelection(currentPath: string | null, multiEditPaths: string[]): void {
    this.currentPath = currentPath;
    this.multiEditPaths = multiEditPaths;
    this.detectMode();
    this.updatePanelUI();
  }

  openForSelection(currentPath: string | null, multiEditPaths: string[]): void {
    this.setSelection(currentPath, multiEditPaths);
    if (!this.mode) return;
    void this.openEditor();
  }

  openSplitStack(currentPath: string | null): void {
    if (!this.isCompatibleImagePath(currentPath)) return;
    this.currentPath = currentPath;
    this.multiEditPaths = [];
    this.mode = 'stack';
    this.updatePanelUI();
    void this.openEditor();
  }

  openSplitBash(multiEditPaths: string[]): void {
    const validPaths = multiEditPaths.filter((path) => this.isCompatibleImagePath(path));
    if (validPaths.length !== 4) return;
    this.currentPath = validPaths[0] ?? null;
    this.multiEditPaths = validPaths;
    this.mode = 'bash';
    this.updatePanelUI();
    void this.openEditor();
  }

  destroy(): void {
    this.closeEditor();
    this.root.remove();
  }

  private isCompatibleImagePath(path: string | null | undefined): boolean {
    if (!path) return false;
    const lower = path.toLowerCase();
    return !(
      lower.endsWith('.gif') ||
      lower.endsWith('.mp4') ||
      lower.endsWith('.webm') ||
      lower.endsWith('.mov') ||
      lower.endsWith('.avi') ||
      lower.endsWith('.mkv')
    );
  }

  private detectMode(): SplitMode {
    const validMulti = this.multiEditPaths.filter((p) => this.isCompatibleImagePath(p));
    if (validMulti.length === 4) {
      this.mode = 'bash';
      return this.mode;
    }

    if (this.isCompatibleImagePath(this.currentPath)) {
      this.mode = 'stack';
      return this.mode;
    }

    this.mode = null;
    return this.mode;
  }

  private updatePanelUI(): void {
    if (this.mode === 'stack') {
      this.modeLabelEl.textContent = 'Split Stacking (1 -> 4)';
      this.instructionEl.innerHTML = '<strong style="color:#22c55e;">Ready:</strong> 1 image selected. Open editor to split into 4 slices.';
      this.controlsEl.style.display = 'block';
      this.openBtn.textContent = 'Open Split Editor';
      return;
    }

    if (this.mode === 'bash') {
      this.modeLabelEl.textContent = 'Split Bashing (4 -> 1)';
      this.instructionEl.innerHTML = '<strong style="color:#22c55e;">Ready:</strong> 4 images selected. Open editor to compose into one image.';
      this.controlsEl.style.display = 'block';
      this.openBtn.textContent = 'Open Bash Editor';
      return;
    }

    this.modeLabelEl.textContent = 'Split Tools';
    this.controlsEl.style.display = 'none';
    this.instructionEl.innerHTML = 'Select <strong>1 image</strong> for Split Stacking or <strong>4 images</strong> for Split Bashing. Video/GIF are ignored.';
  }

  private async openEditor(): Promise<void> {
    if (!this.mode) return;

    if (this.mode === 'stack') {
      const path = this.currentPath;
      if (!path) return;
      const img = await this.loadImage(path);
      if (!img) return;
      this.sourceImage = img;
      this.sourceImages = [];
      this.sourcePaths = [path];
      this.outputBasePath = this.getParentPath(path);
    } else {
      const paths = this.multiEditPaths.filter((p) => this.isCompatibleImagePath(p)).slice(0, 4);
      const images: HTMLImageElement[] = [];
      for (const path of paths) {
        const img = await this.loadImage(path);
        if (img) images.push(img);
      }
      if (images.length !== 4) return;
      this.sourceImages = images;
      this.sourceImage = null;
      this.sourcePaths = paths;

      const dirs = paths.map((p) => this.getParentPath(p));
      const uniqueDirs = Array.from(new Set(dirs));
      this.outputBasePath = uniqueDirs.length === 1 ? uniqueDirs[0] : this.findCommonAncestor(uniqueDirs);
    }

    this.initializeZones();
    this.createOverlay();
  }

  private createOverlay(): void {
    this.closeEditor();

    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 10000;
      background: #0a0a0f; display: flex; flex-direction: column;
    `;

    const title = this.mode === 'stack' ? 'Split Stacking' : 'Split Bashing';
    const subtitle = this.mode === 'stack' ? '1 -> 4 Images' : '4 -> 1 Image';

    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display:flex; align-items:center; justify-content:space-between; gap:12px;
      padding: 10px 16px; border-bottom: 1px solid rgba(255,255,255,0.1);
      background: rgba(0,0,0,0.65); flex-wrap: wrap;
    `;

    const titleWrap = document.createElement('div');
    titleWrap.innerHTML = `
      <div style="font-size:15px; font-weight:700; color:#ec4899;">${title}</div>
      <div style="font-size:11px; color:#71717a;">${subtitle}</div>
    `;
    toolbar.appendChild(titleWrap);

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap: wrap;';

    const gapLabel = document.createElement('span');
    gapLabel.textContent = 'Gap';
    gapLabel.style.cssText = 'font-size:11px; color:#a1a1aa;';

    const gapSlider = document.createElement('input');
    gapSlider.type = 'range';
    gapSlider.min = '0';
    gapSlider.max = '100';
    gapSlider.value = String(this.gapSize);
    gapSlider.style.cssText = 'width: 100px; accent-color: #ec4899;';

    const gapValue = document.createElement('span');
    gapValue.textContent = `${this.gapSize}px`;
    gapValue.style.cssText = 'font-size:11px; color:#e4e4e7; min-width:44px;';

    gapSlider.addEventListener('input', () => {
      this.gapSize = parseInt(gapSlider.value, 10) || 0;
      gapValue.textContent = `${this.gapSize}px`;
      this.recalculateZones();
      this.render();
    });

    const resetBtn = this.createToolbarButton('Reset');
    resetBtn.addEventListener('click', () => this.resetToEqual());

    const downloadBtn = this.createToolbarButton('Download ZIP');
    downloadBtn.addEventListener('click', () => this.downloadZip());

    const saveBtn = this.createToolbarButton('Save to Folder', true);
    saveBtn.addEventListener('click', () => this.saveToFolder());

    const closeBtn = this.createToolbarButton('Close');
    closeBtn.addEventListener('click', () => this.closeEditor());

    controls.appendChild(gapLabel);
    controls.appendChild(gapSlider);
    controls.appendChild(gapValue);
    controls.appendChild(resetBtn);
    controls.appendChild(downloadBtn);
    controls.appendChild(saveBtn);
    controls.appendChild(closeBtn);
    toolbar.appendChild(controls);
    overlay.appendChild(toolbar);

    const viewport = document.createElement('div');
    viewport.id = 'split-editor-viewport';
    viewport.style.cssText = `
      flex:1; min-height:0; display:flex; align-items:center; justify-content:center;
      padding: 16px; overflow:hidden;
    `;

    const canvasWrap = document.createElement('div');
    canvasWrap.id = 'split-editor-canvas-wrap';
    canvasWrap.style.cssText = 'position: relative; transform-origin: center center;';

    this.baseCanvas = document.createElement('canvas');
    this.baseCanvas.style.cssText = 'display:block; border-radius:4px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);';
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.cssText = 'position:absolute; inset:0; border-radius:4px;';

    canvasWrap.appendChild(this.baseCanvas);
    canvasWrap.appendChild(this.overlayCanvas);
    viewport.appendChild(canvasWrap);
    overlay.appendChild(viewport);

    const info = document.createElement('div');
    info.id = 'split-editor-info';
    info.style.cssText = `
      padding: 8px 12px; border-top: 1px solid rgba(255,255,255,0.1);
      font-size: 12px; color: #71717a; text-align:center;
    `;
    info.textContent = 'Hover zones for size details. Drag red lines to adjust.';
    overlay.appendChild(info);

    document.body.appendChild(overlay);
    this.overlayEl = overlay;
    this.baseCtx = this.baseCanvas.getContext('2d');
    this.overlayCtx = this.overlayCanvas.getContext('2d');

    this.setupCanvases();
    this.bindCanvasEvents();
    this.resizeHandler = () => this.updateCanvasTransform();
    window.addEventListener('resize', this.resizeHandler);
  }

  private createToolbarButton(label: string, primary = false): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
      padding: 6px 10px; border-radius: 6px; cursor: pointer;
      font-size: 11px; font-weight: 700; transition: all 0.15s;
      border: 1px solid ${primary ? 'rgba(34,197,94,0.6)' : 'rgba(255,255,255,0.2)'};
      color: ${primary ? '#4ade80' : '#d4d4d8'};
      background: ${primary ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.08)'};
    `;
    return btn;
  }

  private closeEditor(): void {
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    if (this.overlayEl) {
      this.overlayEl.remove();
      this.overlayEl = null;
    }
    this.baseCanvas = null;
    this.overlayCanvas = null;
    this.baseCtx = null;
    this.overlayCtx = null;
    this.selectedZone = -1;
    this.hoveredZone = -1;
    this.draggingDivider = -2;
  }

  private setupCanvases(): void {
    if (!this.baseCanvas || !this.overlayCanvas) return;

    let width = 1;
    let height = 1;
    if (this.mode === 'stack' && this.sourceImage) {
      width = this.sourceImage.naturalWidth;
      height = this.sourceImage.naturalHeight;
    } else if (this.mode === 'bash' && this.sourceImages.length === 4) {
      width = Math.max(...this.sourceImages.map((img) => img.naturalWidth));
      height = this.zones.reduce((sum, z) => sum + z.height, 0) + this.gapSize * 3;
    }

    this.baseCanvas.width = Math.max(1, Math.round(width));
    this.baseCanvas.height = Math.max(1, Math.round(height));
    this.overlayCanvas.width = this.baseCanvas.width;
    this.overlayCanvas.height = this.baseCanvas.height;

    this.render();
  }

  private updateCanvasTransform(): void {
    if (!this.overlayEl) return;
    const viewport = this.overlayEl.querySelector('#split-editor-viewport') as HTMLElement | null;
    const wrap = this.overlayEl.querySelector('#split-editor-canvas-wrap') as HTMLElement | null;
    if (!viewport || !wrap || !this.baseCanvas) return;

    const vw = Math.max(1, viewport.clientWidth - 24);
    const vh = Math.max(1, viewport.clientHeight - 24);
    const sx = vw / this.baseCanvas.width;
    const sy = vh / this.baseCanvas.height;
    this.scale = Math.min(sx, sy, 1);
    wrap.style.transform = `scale(${this.scale})`;
  }

  private bindCanvasEvents(): void {
    if (!this.overlayCanvas) return;
    this.overlayCanvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.overlayCanvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
    this.overlayCanvas.addEventListener('mouseup', () => this.onMouseUp());
    this.overlayCanvas.addEventListener('mouseleave', () => this.onMouseLeave());
  }

  private initializeZones(): void {
    this.zones = [];
    if (this.mode === 'stack' && this.sourceImage) {
      this.imageHeight = this.sourceImage.naturalHeight;
      const totalGap = this.gapSize * 3;
      const zoneHeight = (this.imageHeight - totalGap) / 4;
      let y = 0;
      for (let i = 0; i < 4; i++) {
        this.zones.push({ y, height: zoneHeight });
        y += zoneHeight + (i < 3 ? this.gapSize : 0);
      }
      return;
    }

    if (this.mode === 'bash' && this.sourceImages.length === 4) {
      const baseHeight = Math.max(...this.sourceImages.map((img) => img.naturalHeight)) / 4;
      let y = 0;
      for (let i = 0; i < 4; i++) {
        this.zones.push({ y, height: baseHeight, imageIndex: i });
        y += baseHeight + (i < 3 ? this.gapSize : 0);
      }
      this.imageHeight = y;
    }
  }

  private recalculateZones(): void {
    if (this.zones.length !== 4) return;
    let y = this.zones[0].y;
    for (let i = 0; i < 4; i++) {
      this.zones[i].y = y;
      y += this.zones[i].height + (i < 3 ? this.gapSize : 0);
    }

    if (this.mode === 'bash') {
      this.imageHeight = this.zones.reduce((sum, z) => sum + z.height, 0) + this.gapSize * 3;
      if (this.baseCanvas && this.overlayCanvas) {
        this.baseCanvas.height = Math.max(1, Math.round(this.imageHeight));
        this.overlayCanvas.height = this.baseCanvas.height;
      }
    }
  }

  private resetToEqual(): void {
    this.initializeZones();
    this.setupCanvases();
  }

  private render(): void {
    this.renderBase();
    this.renderOverlay();
    this.updateCanvasTransform();
  }

  private renderBase(): void {
    if (!this.baseCtx || !this.baseCanvas) return;
    const ctx = this.baseCtx;
    const w = this.baseCanvas.width;
    const h = this.baseCanvas.height;
    ctx.clearRect(0, 0, w, h);

    if (this.mode === 'stack' && this.sourceImage) {
      ctx.drawImage(this.sourceImage, 0, 0, w, h);
      return;
    }

    if (this.mode === 'bash' && this.sourceImages.length === 4) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < this.zones.length; i++) {
        const zone = this.zones[i];
        const img = this.sourceImages[zone.imageIndex ?? i];
        if (!img) continue;

        const srcAspect = img.naturalWidth / img.naturalHeight;
        const dstAspect = w / zone.height;
        let srcX = 0;
        let srcY = 0;
        let srcW = img.naturalWidth;
        let srcH = img.naturalHeight;
        if (srcAspect > dstAspect) {
          srcW = img.naturalHeight * dstAspect;
          srcX = (img.naturalWidth - srcW) / 2;
        } else {
          srcH = img.naturalWidth / dstAspect;
          srcY = (img.naturalHeight - srcH) / 2;
        }
        ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, zone.y, w, zone.height);
      }
    }
  }

  private renderOverlay(): void {
    if (!this.overlayCtx || !this.overlayCanvas || this.zones.length !== 4) return;
    const ctx = this.overlayCtx;
    const w = this.overlayCanvas.width;
    const h = this.overlayCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Draw cropped gaps
    if (this.zones[0].y > 0) {
      this.drawHatchedArea(0, 0, w, this.zones[0].y);
    }
    for (let i = 0; i < 3; i++) {
      const start = this.zones[i].y + this.zones[i].height;
      const end = this.zones[i + 1].y;
      if (end > start) {
        this.drawHatchedArea(0, start, w, end - start);
      }
    }
    const zone4End = this.zones[3].y + this.zones[3].height;
    if (zone4End < this.imageHeight) {
      this.drawHatchedArea(0, zone4End, w, this.imageHeight - zone4End);
    }

    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.beginPath();
      ctx.arc(38, zone.y + zone.height / 2, 20, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = i === this.selectedZone ? '#22c55e' : '#00f2ea';
      ctx.fillText(String(i + 1), 38, zone.y + zone.height / 2);

      ctx.strokeStyle = i === this.selectedZone ? '#22c55e' : i === this.hoveredZone ? '#00f2ea' : 'rgba(0,242,234,0.4)';
      ctx.lineWidth = i === this.selectedZone || i === this.hoveredZone ? 3 : 2;
      ctx.strokeRect(3, zone.y + 3, w - 6, zone.height - 6);
    }

    this.drawDividerLine(-1, this.zones[0].y, w);
    for (let i = 0; i < 3; i++) {
      const top = this.zones[i].y + this.zones[i].height;
      const bottom = this.zones[i + 1].y;
      this.drawDividerLine(i * 2, top, w);
      this.drawDividerLine(i * 2 + 1, bottom, w);
    }
    this.drawDividerLine(6, this.zones[3].y + this.zones[3].height, w);
  }

  private drawHatchedArea(x: number, y: number, w: number, h: number): void {
    if (!this.overlayCtx || h <= 0) return;
    const ctx = this.overlayCtx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const spacing = 12;
    for (let i = -h; i < w + h; i += spacing) {
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i + h, y + h);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawDividerLine(id: number, y: number, width: number): void {
    if (!this.overlayCtx) return;
    const ctx = this.overlayCtx;
    ctx.strokeStyle = this.draggingDivider === id ? '#facc15' : '#ff6b6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    this.drawHandle(width / 2, y);
  }

  private drawHandle(x: number, y: number): void {
    if (!this.overlayCtx) return;
    const ctx = this.overlayCtx;
    ctx.fillStyle = '#ff6b6b';
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private getMousePos(e: MouseEvent): { x: number; y: number } {
    if (!this.overlayCanvas) return { x: 0, y: 0 };
    const rect = this.overlayCanvas.getBoundingClientRect();
    const scaleX = this.overlayCanvas.width / rect.width;
    const scaleY = this.overlayCanvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.overlayCanvas) return;
    const pos = this.getMousePos(e);
    if (this.draggingDivider >= -1) {
      this.handleDrag(pos.y);
      return;
    }

    const divider = this.getDividerAtY(pos.y);
    this.overlayCanvas.style.cursor = divider >= -1 ? 'ns-resize' : 'pointer';
    const oldHover = this.hoveredZone;
    this.hoveredZone = this.getZoneAtY(pos.y);
    if (oldHover !== this.hoveredZone) {
      this.renderOverlay();
      this.updateInfoText();
    }
  }

  private onMouseDown(e: MouseEvent): void {
    const pos = this.getMousePos(e);
    const divider = this.getDividerAtY(pos.y);
    if (divider >= -1) {
      this.draggingDivider = divider;
      this.dragStartY = pos.y;
      this.dragStartPositions = { zones: this.zones.map((z) => ({ ...z })) };
      return;
    }
    const zone = this.getZoneAtY(pos.y);
    if (zone >= 0) {
      this.selectedZone = zone;
      this.renderOverlay();
      this.updateInfoText();
    }
  }

  private onMouseUp(): void {
    this.draggingDivider = -2;
  }

  private onMouseLeave(): void {
    if (this.draggingDivider < -1) {
      this.hoveredZone = -1;
      this.renderOverlay();
      this.updateInfoText();
    }
  }

  private getDividerAtY(y: number): number {
    if (this.zones.length !== 4) return -2;
    const threshold = 20;
    const top = this.zones[0].y;
    if (Math.abs(y - top) < threshold) return -1;

    for (let i = 0; i < 3; i++) {
      const gapStart = this.zones[i].y + this.zones[i].height;
      const gapEnd = this.zones[i + 1].y;
      if (Math.abs(y - gapStart) < threshold) return i * 2;
      if (Math.abs(y - gapEnd) < threshold) return i * 2 + 1;
    }

    const bottom = this.zones[3].y + this.zones[3].height;
    if (Math.abs(y - bottom) < threshold) return 6;
    return -2;
  }

  private getZoneAtY(y: number): number {
    for (let i = 0; i < this.zones.length; i++) {
      const z = this.zones[i];
      if (y >= z.y && y < z.y + z.height) return i;
    }
    return -1;
  }

  private handleDrag(y: number): void {
    if (!this.dragStartPositions || this.zones.length !== 4) return;
    const delta = y - this.dragStartY;
    const orig = this.dragStartPositions.zones;

    if (this.draggingDivider === -1) {
      const newY = Math.max(0, orig[0].y + delta);
      const origBottom = orig[0].y + orig[0].height;
      const newHeight = origBottom - newY;
      if (newHeight < this.minZoneHeight) return;
      this.zones[0].y = newY;
      this.zones[0].height = newHeight;
      this.render();
      this.updateInfoText();
      return;
    }

    if (this.draggingDivider === 6) {
      const newBottom = orig[3].y + orig[3].height + delta;
      const newHeight = newBottom - this.zones[3].y;
      if (newHeight < this.minZoneHeight) return;
      if (newBottom > this.imageHeight) return;
      this.zones[3].height = newHeight;
      this.render();
      this.updateInfoText();
      return;
    }

    const gapIndex = Math.floor(this.draggingDivider / 2);
    const isTopLine = this.draggingDivider % 2 === 0;
    if (isTopLine) {
      const zoneIdx = gapIndex;
      const newHeight = orig[zoneIdx].height + delta;
      if (newHeight < this.minZoneHeight) return;
      this.zones[zoneIdx].height = newHeight;
    } else {
      const zoneIdx = gapIndex + 1;
      const origBottom = orig[zoneIdx].y + orig[zoneIdx].height;
      const newY = orig[zoneIdx].y + delta;
      const newHeight = origBottom - newY;
      if (newHeight < this.minZoneHeight) return;
      this.zones[zoneIdx].y = newY;
      this.zones[zoneIdx].height = newHeight;
    }

    this.render();
    this.updateInfoText();
  }

  private updateInfoText(): void {
    if (!this.overlayEl) return;
    const info = this.overlayEl.querySelector('#split-editor-info') as HTMLElement | null;
    if (!info) return;

    const idx = this.selectedZone >= 0 ? this.selectedZone : this.hoveredZone;
    if (idx < 0 || idx >= this.zones.length) {
      info.textContent = 'Hover zones for size details. Drag red lines to adjust.';
      return;
    }

    const width = this.mode === 'stack' && this.sourceImage
      ? this.sourceImage.naturalWidth
      : Math.max(...this.sourceImages.map((img) => img.naturalWidth));
    info.textContent = `Zone ${idx + 1}: ${Math.round(width)} x ${Math.round(this.zones[idx].height)} px`;
  }

  private async downloadZip(): Promise<void> {
    const blobs = await this.generateImages();
    if (blobs.length === 0) return;

    const zip = new JSZip();
    if (this.mode === 'stack') {
      blobs.forEach((blob, idx) => zip.file(`split_${idx + 1}.png`, blob));
    } else {
      zip.file('combined.png', blobs[0]);
    }

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.mode === 'stack' ? 'Split Stack.zip' : 'Split Bash.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  private async saveToFolder(): Promise<void> {
    try {
      const defaultPath = this.outputBasePath || this.getParentPath(this.sourcePaths[0] || '');
      const configuredOutputPath = String(loadAppSettings()['comfyui.externalOutputPath'] || '').trim();
      const startDir = defaultPath || configuredOutputPath || 'Tools/ComfyUI/output';

      const selectedBasePath = await this.browseForOutputFolder(startDir);
      if (!selectedBasePath) return;

      const folderName = this.mode === 'stack' ? 'Split Stacked' : 'Split Bashed';
      const folderPath = `${selectedBasePath.replace(/[\\/]+$/, '')}/${folderName}`;

      const mkdirRes = await fetch('/api/fs/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: folderPath }),
      });
      if (!mkdirRes.ok) {
        const err = await mkdirRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to create output folder');
      }

      let startNum = 1;
      try {
        const res = await fetch(`/api/fs/list?path=${encodeURIComponent(folderPath)}`);
        if (res.ok) {
          const data = await res.json();
          const files = Array.isArray(data.files) ? data.files : [];
          const nums = files
            .map((f: any) => String(f.name || '').match(/(\d+)\.png$/))
            .filter(Boolean)
            .map((m: any) => parseInt(m[1], 10))
            .filter((n: number) => Number.isFinite(n));
          if (nums.length > 0) startNum = Math.max(...nums) + 1;
        }
      } catch {
        // Keep default numbering
      }

      const blobs = await this.generateImages();
      if (this.mode === 'stack') {
        for (let i = 0; i < blobs.length; i++) {
          const num = String(startNum + i).padStart(3, '0');
          await this.saveBlob(blobs[i], `${folderPath}/split_${num}.png`);
        }
      } else {
        const num = String(startNum).padStart(3, '0');
        await this.saveBlob(blobs[0], `${folderPath}/combined_${num}.png`);
      }

      this.eventBus.emit('editor:split-complete', { folderPath, mode: this.mode });
      emitFolderTreeChanged([folderPath], 'split-save');
    } catch (err) {
      console.error('[Split] Save to folder failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to save split output');
    }
  }

  private async browseForOutputFolder(startDir: string): Promise<string | null> {
    try {
      const res = await fetch('/api/export/browse-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDir }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Folder picker failed');
      }
      const data = await res.json();
      const chosen = String(data?.path || '').trim();
      return chosen || null;
    } catch (err) {
      console.error('[Split] Folder picker failed:', err);
      return null;
    }
  }

  private async generateImages(): Promise<Blob[]> {
    if (this.mode === 'stack') return this.generateStackImages();
    if (this.mode === 'bash') return this.generateBashImage();
    return [];
  }

  private async generateStackImages(): Promise<Blob[]> {
    if (!this.sourceImage) return [];
    const width = this.sourceImage.naturalWidth;
    const blobs: Blob[] = [];

    for (const zone of this.zones) {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = Math.max(1, Math.round(zone.height));
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;

      ctx.drawImage(
        this.sourceImage,
        0, zone.y, width, zone.height,
        0, 0, width, zone.height,
      );

      const blob = await this.canvasToBlob(canvas);
      if (blob) blobs.push(blob);
    }
    return blobs;
  }

  private async generateBashImage(): Promise<Blob[]> {
    if (this.sourceImages.length !== 4) return [];
    const maxWidth = Math.max(...this.sourceImages.map((img) => img.naturalWidth));
    const totalHeight = this.zones.reduce((sum, z) => sum + z.height, 0) + this.gapSize * 3;

    const canvas = document.createElement('canvas');
    canvas.width = maxWidth;
    canvas.height = Math.max(1, Math.round(totalHeight));
    const ctx = canvas.getContext('2d');
    if (!ctx) return [];

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < this.zones.length; i++) {
      const zone = this.zones[i];
      const img = this.sourceImages[zone.imageIndex ?? i];
      if (!img) continue;

      const srcAspect = img.naturalWidth / img.naturalHeight;
      const dstAspect = maxWidth / zone.height;
      let srcX = 0;
      let srcY = 0;
      let srcW = img.naturalWidth;
      let srcH = img.naturalHeight;

      if (srcAspect > dstAspect) {
        srcW = img.naturalHeight * dstAspect;
        srcX = (img.naturalWidth - srcW) / 2;
      } else {
        srcH = img.naturalWidth / dstAspect;
        srcY = (img.naturalHeight - srcH) / 2;
      }

      ctx.drawImage(img, srcX, srcY, srcW, srcH, 0, zone.y, maxWidth, zone.height);
    }

    const blob = await this.canvasToBlob(canvas);
    return blob ? [blob] : [];
  }

  private async saveBlob(blob: Blob, path: string): Promise<void> {
    const base64 = await this.blobToBase64(blob);
    const res = await fetch('/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        content: base64,
        encoding: 'base64',
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to save file: ${path}`);
    }
  }

  private canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const data = String(reader.result || '');
        const base64 = data.includes(',') ? data.split(',')[1] : data;
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private loadImage(path: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `/api/fs/read?path=${encodeURIComponent(path)}`;
    });
  }

  private getParentPath(path: string): string {
    const normalized = String(path ?? '').replace(/\\/g, '/');
    const idx = normalized.lastIndexOf('/');
    return idx > 0 ? normalized.slice(0, idx) : '';
  }

  private findCommonAncestor(paths: string[]): string {
    if (paths.length === 0) return '';
    if (paths.length === 1) return String(paths[0] ?? '');
    const normalizedPaths = paths.map((p) => String(p ?? '').replace(/\\/g, '/'));
    const allUnixAbsolute = normalizedPaths.every((p) => p.startsWith('/'));
    const splitPaths = normalizedPaths.map((p) => p.split('/').filter(Boolean));
    const common: string[] = [];
    const minLen = Math.min(...splitPaths.map((parts) => parts.length));
    for (let i = 0; i < minLen; i++) {
      const part = splitPaths[0][i];
      if (splitPaths.every((parts) => parts[i] === part)) {
        common.push(part);
      } else {
        break;
      }
    }
    const joined = common.join('/');
    return allUnixAbsolute && joined ? `/${joined}` : joined;
  }
}
