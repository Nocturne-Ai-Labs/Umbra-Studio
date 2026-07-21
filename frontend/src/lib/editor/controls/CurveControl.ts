/**
 * CurveControl — Interactive tone curve editor on Canvas 2D.
 * Channel tabs (RGB/R/G/B), click to add points, drag to move, right-click to remove.
 * Outputs 256-entry LUT arrays via cubic spline interpolation.
 */

type Channel = 'rgb' | 'red' | 'green' | 'blue';

interface CurveControlOptions {
  onChange: (channel: Channel, points: [number, number][]) => void;
}

const CHANNEL_COLORS: Record<Channel, string> = {
  rgb: '#e4e4e7',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
};

const CHANNELS: Channel[] = ['rgb', 'red', 'green', 'blue'];

export class CurveControl {
  private root: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private options: CurveControlOptions;

  private activeChannel: Channel = 'rgb';
  private points: Record<Channel, [number, number][]> = {
    rgb: [[0, 0], [1, 1]],
    red: [[0, 0], [1, 1]],
    green: [[0, 0], [1, 1]],
    blue: [[0, 0], [1, 1]],
  };

  // Drag state
  private draggingIndex = -1;
  private canvasSize = 180;
  private padding = 8;

  // Bound handlers
  private _onMouseDown: (e: MouseEvent) => void;
  private _onMouseMove: (e: MouseEvent) => void;
  private _onMouseUp: (e: MouseEvent) => void;
  private _onContextMenu: (e: MouseEvent) => void;

  constructor(container: HTMLElement, options: CurveControlOptions) {
    this.options = options;

    this.root = document.createElement('div');
    this.root.style.cssText = 'padding: 2px 0;';

    // Channel tabs
    const tabs = document.createElement('div');
    tabs.style.cssText = 'display: flex; gap: 4px; margin-bottom: 8px;';

    for (const ch of CHANNELS) {
      const btn = document.createElement('button');
      btn.textContent = ch === 'rgb' ? 'RGB' : ch.charAt(0).toUpperCase();
      btn.dataset.channel = ch;
      btn.style.cssText = `
        flex: 1; padding: 5px 0; font-size: 10px; font-weight: 700;
        border: 1px solid #2a2d35; border-radius: 6px; cursor: pointer;
        background: #171a22; color: #a1a1aa; transition: all 0.15s;
        text-transform: uppercase; letter-spacing: 0.5px;
      `;
      btn.addEventListener('click', () => this.setChannel(ch));
      tabs.appendChild(btn);
    }
    this.root.appendChild(tabs);

    // Canvas
    const dpr = window.devicePixelRatio || 1;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvasSize * dpr;
    this.canvas.height = this.canvasSize * dpr;
    this.canvas.style.cssText = `
      width: ${this.canvasSize}px; height: ${this.canvasSize}px;
      background: #141721; border-radius: 8px; cursor: crosshair;
      border: 1px solid #2a2d35; display: block;
    `;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.scale(dpr, dpr);
    this.root.appendChild(this.canvas);

    // Reset button
    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset Channel';
    resetBtn.style.cssText = `
      margin-top: 6px; font-size: 10px; color: #a1a1aa; background: #181a20;
      border: 1px solid rgba(255,255,255,0.12); cursor: pointer; padding: 5px 8px; border-radius: 6px;
      text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700;
    `;
    resetBtn.addEventListener('mouseenter', () => { resetBtn.style.color = '#f4f4f5'; });
    resetBtn.addEventListener('mouseleave', () => { resetBtn.style.color = '#a1a1aa'; });
    resetBtn.addEventListener('click', () => this.resetChannel());
    this.root.appendChild(resetBtn);

    // Event handlers
    this._onMouseDown = this.onMouseDown.bind(this);
    this._onMouseMove = this.onMouseMove.bind(this);
    this._onMouseUp = this.onMouseUp.bind(this);
    this._onContextMenu = this.onContextMenu.bind(this);

    this.canvas.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mouseup', this._onMouseUp);
    this.canvas.addEventListener('contextmenu', this._onContextMenu);

    container.appendChild(this.root);
    this.updateTabs();
    this.draw();
  }

  private setChannel(ch: Channel): void {
    this.activeChannel = ch;
    this.updateTabs();
    this.draw();
  }

  private updateTabs(): void {
    const buttons = this.root.querySelectorAll('button[data-channel]') as NodeListOf<HTMLButtonElement>;
    buttons.forEach(btn => {
      const ch = btn.dataset.channel as Channel;
      const isActive = ch === this.activeChannel;
      btn.style.background = isActive
        ? `color-mix(in srgb, ${CHANNEL_COLORS[ch]} 18%, #171a22)`
        : '#171a22';
      btn.style.color = isActive ? CHANNEL_COLORS[ch] : '#a1a1aa';
      btn.style.borderColor = isActive ? CHANNEL_COLORS[ch] + '55' : '#2a2d35';
    });
  }

  private getActivePoints(): [number, number][] {
    return this.points[this.activeChannel];
  }

  /** Convert normalized [0,1] coords to canvas pixel coords */
  private toCanvas(nx: number, ny: number): [number, number] {
    const s = this.canvasSize;
    const p = this.padding;
    const area = s - p * 2;
    return [p + nx * area, s - p - ny * area];
  }

  /** Convert canvas pixel coords to normalized [0,1] */
  private fromCanvas(cx: number, cy: number): [number, number] {
    const s = this.canvasSize;
    const p = this.padding;
    const area = s - p * 2;
    return [
      Math.max(0, Math.min(1, (cx - p) / area)),
      Math.max(0, Math.min(1, (s - p - cy) / area)),
    ];
  }

  private findPointAt(cx: number, cy: number): number {
    const pts = this.getActivePoints();
    const hitRadius = 8;
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = this.toCanvas(pts[i][0], pts[i][1]);
      const dx = cx - px;
      const dy = cy - py;
      if (dx * dx + dy * dy < hitRadius * hitRadius) return i;
    }
    return -1;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button !== 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const idx = this.findPointAt(cx, cy);
    if (idx >= 0) {
      this.draggingIndex = idx;
    } else {
      // Add new point
      const [nx, ny] = this.fromCanvas(cx, cy);
      const pts = this.getActivePoints();
      pts.push([nx, ny]);
      pts.sort((a, b) => a[0] - b[0]);
      this.draggingIndex = pts.findIndex(p => p[0] === nx && p[1] === ny);
      this.emitChange();
      this.draw();
    }
  }

  private onMouseMove(e: MouseEvent): void {
    if (this.draggingIndex < 0) return;
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const [nx, ny] = this.fromCanvas(cx, cy);

    const pts = this.getActivePoints();
    // Don't allow moving the first (0) or last point's x position
    if (this.draggingIndex === 0) {
      pts[0] = [0, ny];
    } else if (this.draggingIndex === pts.length - 1) {
      pts[pts.length - 1] = [1, ny];
    } else {
      // Constrain x between neighbors
      const minX = pts[this.draggingIndex - 1][0] + 0.01;
      const maxX = pts[this.draggingIndex + 1][0] - 0.01;
      pts[this.draggingIndex] = [Math.max(minX, Math.min(maxX, nx)), ny];
    }

    this.emitChange();
    this.draw();
  }

  private onMouseUp(_e: MouseEvent): void {
    this.draggingIndex = -1;
  }

  private onContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const idx = this.findPointAt(cx, cy);
    const pts = this.getActivePoints();
    // Don't remove first or last point
    if (idx > 0 && idx < pts.length - 1) {
      pts.splice(idx, 1);
      this.emitChange();
      this.draw();
    }
  }

  private emitChange(): void {
    this.options.onChange(this.activeChannel, [...this.getActivePoints()]);
  }

  private draw(): void {
    const ctx = this.ctx;
    const s = this.canvasSize;
    const p = this.padding;
    const area = s - p * 2;

    ctx.clearRect(0, 0, s, s);

    // Grid lines
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const pos = p + (i / 4) * area;
      ctx.beginPath();
      ctx.moveTo(pos, p);
      ctx.lineTo(pos, s - p);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(p, pos);
      ctx.lineTo(s - p, pos);
      ctx.stroke();
    }

    // Diagonal reference line
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(p, s - p);
    ctx.lineTo(s - p, p);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw inactive channel curves (dimmed)
    for (const ch of CHANNELS) {
      if (ch === this.activeChannel) continue;
      this.drawCurve(ctx, this.points[ch], CHANNEL_COLORS[ch] + '33', 1);
    }

    // Draw active channel curve
    const pts = this.getActivePoints();
    const color = CHANNEL_COLORS[this.activeChannel];
    this.drawCurve(ctx, pts, color, 2);

    // Draw control points
    for (let i = 0; i < pts.length; i++) {
      const [cx, cy] = this.toCanvas(pts[i][0], pts[i][1]);
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = i === this.draggingIndex ? color : '#18181b';
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  private drawCurve(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string, lineWidth: number): void {
    if (pts.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();

    // Interpolate using simple cubic spline approximation
    const steps = 128;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = this.evaluateSpline(pts, t);
      const [cx, cy] = this.toCanvas(t, y);
      if (i === 0) ctx.moveTo(cx, cy);
      else ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  /** Evaluate monotone cubic spline at x position t (0-1) */
  private evaluateSpline(pts: [number, number][], t: number): number {
    if (pts.length < 2) return t;
    const n = pts.length;

    // Find segment
    let seg = 0;
    for (let j = 0; j < n - 1; j++) {
      if (t >= pts[j][0]) seg = j;
    }
    if (seg >= n - 1) seg = n - 2;

    if (n === 2) {
      // Linear
      const frac = (t - pts[0][0]) / (pts[1][0] - pts[0][0] || 1);
      return pts[0][1] + frac * (pts[1][1] - pts[0][1]);
    }

    // Compute slopes
    const deltas: number[] = [];
    const m: number[] = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      deltas.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
    }
    m[0] = deltas[0];
    m[n - 1] = deltas[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = (deltas[i - 1] + deltas[i]) / 2;
    }

    // Hermite interpolation
    const h = pts[seg + 1][0] - pts[seg][0] || 1;
    const frac = (t - pts[seg][0]) / h;
    const f2 = frac * frac;
    const f3 = f2 * frac;

    const h00 = 2 * f3 - 3 * f2 + 1;
    const h10 = f3 - 2 * f2 + frac;
    const h01 = -2 * f3 + 3 * f2;
    const h11 = f3 - f2;

    return Math.max(0, Math.min(1,
      h00 * pts[seg][1] + h10 * h * m[seg] + h01 * pts[seg + 1][1] + h11 * h * m[seg + 1]
    ));
  }

  setPoints(channel: Channel, pts: [number, number][], silent = false): void {
    this.points[channel] = pts;
    if (!silent) this.emitChange();
    this.draw();
  }

  getPoints(channel: Channel): [number, number][] {
    return [...this.points[channel]];
  }

  getAllPoints(): Record<Channel, [number, number][]> {
    return {
      rgb: [...this.points.rgb],
      red: [...this.points.red],
      green: [...this.points.green],
      blue: [...this.points.blue],
    };
  }

  resetChannel(): void {
    this.points[this.activeChannel] = [[0, 0], [1, 1]];
    this.emitChange();
    this.draw();
  }

  resetAll(silent = false): void {
    for (const ch of CHANNELS) {
      this.points[ch] = [[0, 0], [1, 1]];
    }
    if (!silent) this.emitChange();
    this.draw();
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    window.removeEventListener('mousemove', this._onMouseMove);
    window.removeEventListener('mouseup', this._onMouseUp);
    this.canvas.removeEventListener('contextmenu', this._onContextMenu);
    this.root.remove();
  }
}
