/**
 * CropTool — Crop overlay with draggable handles, aspect ratio presets, rotation.
 * Renders on a transparent div layered over the WebGL canvas.
 */

import { SliderControl } from './controls/SliderControl';

export interface CropRect {
  x: number;      // 0-1 normalized
  y: number;
  width: number;
  height: number;
  rotation: number; // degrees
}

interface CropToolOptions {
  onChange: (crop: CropRect) => void;
}

const ASPECT_RATIOS = [
  { label: 'Free', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '16:9', value: 16 / 9 },
  { label: '5:4', value: 5 / 4 },
] as const;

type HandleType = 'tl' | 'tr' | 'bl' | 'br' | 'top' | 'bottom' | 'left' | 'right' | 'move' | null;

export class CropTool {
  private root: HTMLDivElement;
  private overlay: HTMLDivElement;
  private options: CropToolOptions;

  private crop: CropRect = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
  private aspectRatio = 0; // 0 = free
  private active = false;

  // Controls
  private controlsContainer: HTMLDivElement;
  private rotationSlider: SliderControl | null = null;

  // Drag state
  private dragging: HandleType = null;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartCrop: CropRect = { ...this.crop };

  // Overlay dimensions (pixels)
  private overlayW = 0;
  private overlayH = 0;

  // Bound handlers
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onMouseUp: () => void;

  constructor(container: HTMLElement, options: CropToolOptions) {
    this.options = options;

    // Root container for controls
    this.root = document.createElement('div');
    this.root.style.cssText = 'padding: 2px 0;';

    // Aspect ratio buttons
    const ratioBar = document.createElement('div');
    ratioBar.style.cssText = 'display: flex; flex-wrap: wrap; gap: 3px; margin-bottom: 8px;';

    for (const ar of ASPECT_RATIOS) {
      const btn = document.createElement('button');
      btn.textContent = ar.label;
      btn.dataset.ratio = String(ar.value);
      btn.style.cssText = `
        padding: 3px 8px; font-size: 10px; border-radius: 4px;
        border: 1px solid #27272a; background: transparent;
        color: #71717a; cursor: pointer; transition: all 0.15s;
      `;
      btn.addEventListener('click', () => {
        this.aspectRatio = ar.value;
        this.updateRatioButtons();
        this.applyAspectRatio();
      });
      ratioBar.appendChild(btn);
    }
    this.root.appendChild(ratioBar);

    // Rotation slider
    this.controlsContainer = document.createElement('div');
    this.root.appendChild(this.controlsContainer);

    this.rotationSlider = new SliderControl(this.controlsContainer, {
      label: 'Rotation',
      min: -45,
      max: 45,
      default: 0,
      step: 0.5,
      value: 0,
      format: v => (v > 0 ? '+' : '') + v.toFixed(1) + '\u00B0',
      onChange: v => {
        this.crop.rotation = v;
        this.emitChange();
        this.drawOverlay();
      },
    });

    // Reset crop button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Crop';
    resetBtn.style.cssText = `
      margin-top: 6px; font-size: 10px; color: #71717a; background: #27272a;
      border: 1px solid #3f3f46; cursor: pointer; padding: 4px 10px;
      border-radius: 4px; transition: all 0.15s; display: block; width: 100%;
    `;
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.borderColor = '#52525b'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.borderColor = '#3f3f46'; });
    resetBtn.addEventListener('click', () => this.reset());
    this.root.appendChild(resetBtn);

    container.appendChild(this.root);

    // Crop overlay (will be appended to viewer container when activated)
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = `
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      z-index: 15; pointer-events: auto; display: none; cursor: crosshair;
    `;

    // Event handlers
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);

    this.overlay.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);

    this.updateRatioButtons();
  }

  /** Mount the overlay onto the viewer container */
  mountOverlay(viewerContainer: HTMLElement): void {
    viewerContainer.appendChild(this.overlay);
  }

  setActive(active: boolean): void {
    this.active = active;
    this.overlay.style.display = active ? 'block' : 'none';
    if (active) this.drawOverlay();
  }

  isActive(): boolean {
    return this.active;
  }

  private updateRatioButtons(): void {
    const buttons = this.root.querySelectorAll('button[data-ratio]') as NodeListOf<HTMLButtonElement>;
    buttons.forEach(btn => {
      const isActive = parseFloat(btn.dataset.ratio!) === this.aspectRatio;
      btn.style.background = isActive ? '#27272a' : 'transparent';
      btn.style.color = isActive ? '#e4e4e7' : '#71717a';
      btn.style.borderColor = isActive ? '#52525b' : '#27272a';
    });
  }

  private applyAspectRatio(): void {
    if (this.aspectRatio === 0) return; // Free
    const ar = this.aspectRatio;

    // Fit within current crop, centered
    let w = this.crop.width;
    let h = w / ar;
    if (h > this.crop.height) {
      h = this.crop.height;
      w = h * ar;
    }

    const cx = this.crop.x + this.crop.width / 2;
    const cy = this.crop.y + this.crop.height / 2;

    this.crop.width = Math.min(1, w);
    this.crop.height = Math.min(1, h);
    this.crop.x = Math.max(0, Math.min(1 - this.crop.width, cx - w / 2));
    this.crop.y = Math.max(0, Math.min(1 - this.crop.height, cy - h / 2));

    this.emitChange();
    this.drawOverlay();
  }

  private drawOverlay(): void {
    if (!this.active) return;

    this.overlayW = this.overlay.clientWidth;
    this.overlayH = this.overlay.clientHeight;
    if (this.overlayW === 0 || this.overlayH === 0) return;

    const c = this.crop;
    const x = c.x * this.overlayW;
    const y = c.y * this.overlayH;
    const w = c.width * this.overlayW;
    const h = c.height * this.overlayH;

    // Build overlay HTML with dark scrim outside crop area
    this.overlay.innerHTML = '';

    // Scrim regions (4 rectangles around the crop)
    const scrimStyle = 'position: absolute; background: rgba(0,0,0,0.6);';
    const regions = [
      { top: 0, left: 0, width: this.overlayW, height: y }, // top
      { top: y + h, left: 0, width: this.overlayW, height: this.overlayH - y - h }, // bottom
      { top: y, left: 0, width: x, height: h }, // left
      { top: y, left: x + w, width: this.overlayW - x - w, height: h }, // right
    ];

    for (const r of regions) {
      const div = document.createElement('div');
      div.style.cssText = `${scrimStyle} top: ${r.top}px; left: ${r.left}px; width: ${r.width}px; height: ${r.height}px;`;
      this.overlay.appendChild(div);
    }

    // Crop border
    const border = document.createElement('div');
    border.style.cssText = `
      position: absolute; top: ${y}px; left: ${x}px; width: ${w}px; height: ${h}px;
      border: 1px solid rgba(255,255,255,0.8); box-sizing: border-box;
    `;

    // Rule of thirds grid
    for (let i = 1; i <= 2; i++) {
      const vLine = document.createElement('div');
      vLine.style.cssText = `position: absolute; top: 0; bottom: 0; left: ${(i / 3) * 100}%; width: 1px; background: rgba(255,255,255,0.2);`;
      border.appendChild(vLine);

      const hLine = document.createElement('div');
      hLine.style.cssText = `position: absolute; left: 0; right: 0; top: ${(i / 3) * 100}%; height: 1px; background: rgba(255,255,255,0.2);`;
      border.appendChild(hLine);
    }

    this.overlay.appendChild(border);

    // Corner handles
    const handleSize = 12;
    const handleStyle = `position: absolute; width: ${handleSize}px; height: ${handleSize}px; background: white; border-radius: 2px;`;
    const corners: { pos: HandleType; top: number; left: number; cursor: string }[] = [
      { pos: 'tl', top: y - handleSize / 2, left: x - handleSize / 2, cursor: 'nwse-resize' },
      { pos: 'tr', top: y - handleSize / 2, left: x + w - handleSize / 2, cursor: 'nesw-resize' },
      { pos: 'bl', top: y + h - handleSize / 2, left: x - handleSize / 2, cursor: 'nesw-resize' },
      { pos: 'br', top: y + h - handleSize / 2, left: x + w - handleSize / 2, cursor: 'nwse-resize' },
    ];

    for (const corner of corners) {
      const handle = document.createElement('div');
      handle.style.cssText = `${handleStyle} top: ${corner.top}px; left: ${corner.left}px; cursor: ${corner.cursor};`;
      handle.dataset.handle = corner.pos!;
      this.overlay.appendChild(handle);
    }
  }

  private getHandleAt(cx: number, cy: number): HandleType {
    const c = this.crop;
    const x = c.x * this.overlayW;
    const y = c.y * this.overlayH;
    const w = c.width * this.overlayW;
    const h = c.height * this.overlayH;
    const margin = 10;

    // Check corners
    if (Math.abs(cx - x) < margin && Math.abs(cy - y) < margin) return 'tl';
    if (Math.abs(cx - (x + w)) < margin && Math.abs(cy - y) < margin) return 'tr';
    if (Math.abs(cx - x) < margin && Math.abs(cy - (y + h)) < margin) return 'bl';
    if (Math.abs(cx - (x + w)) < margin && Math.abs(cy - (y + h)) < margin) return 'br';

    // Check inside crop area (move)
    if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) return 'move';

    return null;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rect = this.overlay.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    this.dragging = this.getHandleAt(cx, cy);
    if (!this.dragging) return;

    this.dragStartX = e.clientX;
    this.dragStartY = e.clientY;
    this.dragStartCrop = { ...this.crop };
    e.preventDefault();
  }

  private onMouseMove(e: MouseEvent): void {
    if (!this.dragging) return;

    const dx = (e.clientX - this.dragStartX) / this.overlayW;
    const dy = (e.clientY - this.dragStartY) / this.overlayH;
    const sc = this.dragStartCrop;

    switch (this.dragging) {
      case 'move':
        this.crop.x = Math.max(0, Math.min(1 - sc.width, sc.x + dx));
        this.crop.y = Math.max(0, Math.min(1 - sc.height, sc.y + dy));
        break;
      case 'br':
        this.crop.width = Math.max(0.05, Math.min(1 - sc.x, sc.width + dx));
        this.crop.height = Math.max(0.05, Math.min(1 - sc.y, sc.height + dy));
        if (this.aspectRatio > 0) this.crop.height = this.crop.width / this.aspectRatio;
        break;
      case 'tl':
        this.crop.x = Math.max(0, Math.min(sc.x + sc.width - 0.05, sc.x + dx));
        this.crop.y = Math.max(0, Math.min(sc.y + sc.height - 0.05, sc.y + dy));
        this.crop.width = sc.x + sc.width - this.crop.x;
        this.crop.height = sc.y + sc.height - this.crop.y;
        if (this.aspectRatio > 0) this.crop.height = this.crop.width / this.aspectRatio;
        break;
      case 'tr':
        this.crop.width = Math.max(0.05, Math.min(1 - sc.x, sc.width + dx));
        this.crop.y = Math.max(0, Math.min(sc.y + sc.height - 0.05, sc.y + dy));
        this.crop.height = sc.y + sc.height - this.crop.y;
        if (this.aspectRatio > 0) this.crop.height = this.crop.width / this.aspectRatio;
        break;
      case 'bl':
        this.crop.x = Math.max(0, Math.min(sc.x + sc.width - 0.05, sc.x + dx));
        this.crop.width = sc.x + sc.width - this.crop.x;
        this.crop.height = Math.max(0.05, Math.min(1 - sc.y, sc.height + dy));
        if (this.aspectRatio > 0) this.crop.height = this.crop.width / this.aspectRatio;
        break;
    }

    this.emitChange();
    this.drawOverlay();
  }

  private onMouseUp(): void {
    this.dragging = null;
  }

  private emitChange(): void {
    this.options.onChange({ ...this.crop });
  }

  setCrop(crop: CropRect, silent = false): void {
    this.crop = { ...crop };
    this.rotationSlider?.setValue(crop.rotation, true);
    if (!silent) this.emitChange();
    this.drawOverlay();
  }

  getCrop(): CropRect {
    return { ...this.crop };
  }

  reset(silent = false): void {
    this.crop = { x: 0, y: 0, width: 1, height: 1, rotation: 0 };
    this.aspectRatio = 0;
    this.rotationSlider?.reset(true);
    this.updateRatioButtons();
    if (!silent) this.emitChange();
    this.drawOverlay();
  }

  destroy(): void {
    this.overlay.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.rotationSlider?.destroy();
    this.overlay.remove();
    this.root.remove();
  }
}
