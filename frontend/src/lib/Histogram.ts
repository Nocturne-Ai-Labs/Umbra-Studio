/**
 * Histogram — RGB + luminance histogram display using Canvas 2D.
 * Reads pixel data from WebGLViewer and computes via Web Worker.
 * Pure vanilla JS, no React dependencies.
 */

import { EventBus } from './EventBus';
import type { HistogramData } from '../workers/HistogramWorker';

export class Histogram {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private eventBus: EventBus;
  private worker: Worker | null = null;
  private visible = false;

  // Cached histogram data
  private data: HistogramData | null = null;

  // Render callback (to get pixel data from viewer)
  private getPixels: (() => { pixels: Uint8Array; width: number; height: number }) | null = null;

  // Debounce timer for rapid updates
  private updateTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(container: HTMLElement, eventBus: EventBus) {
    this.eventBus = eventBus;

    // Create histogram canvas
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 128;
    this.canvas.style.cssText = `
      position: absolute; top: 12px; right: 12px;
      width: 220px; height: 110px;
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(8px);
      z-index: 20;
      pointer-events: none;
      display: none;
      border: 1px solid rgba(255, 255, 255, 0.1);
    `;
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);

    // Initialize worker
    this.initWorker();

    // Listen for render completion to update histogram
    this.eventBus.on('editor:render-complete', this.onRenderComplete.bind(this));
  }

  private initWorker(): void {
    try {
      this.worker = new Worker(
        new URL('../workers/HistogramWorker.ts', import.meta.url),
        { type: 'module' }
      );
      this.worker.onmessage = (e: MessageEvent<HistogramData>) => {
        this.data = e.data;
        this.draw();
      };
    } catch (err) {
      console.warn('[Histogram] Worker init failed, will compute on main thread:', err);
    }
  }

  /** Set the pixel data source function */
  setPixelSource(fn: () => { pixels: Uint8Array; width: number; height: number }): void {
    this.getPixels = fn;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.style.display = visible ? 'block' : 'none';
    if (visible) this.requestUpdate();
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.setVisible(!this.visible);
  }

  private onRenderComplete(): void {
    if (this.visible) this.requestUpdate();
  }

  private requestUpdate(): void {
    // Debounce to avoid computing on every frame during rapid slider drags
    if (this.updateTimer) clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(() => this.computeHistogram(), 50);
  }

  private computeHistogram(): void {
    if (!this.getPixels) return;

    const { pixels, width, height } = this.getPixels();

    if (this.worker) {
      // Offload to worker (transfer the buffer for zero-copy)
      const copy = new Uint8Array(pixels); // Copy since we can't transfer the original
      this.worker.postMessage({ pixels: copy, width, height }, [copy.buffer]);
    } else {
      // Fallback: compute on main thread
      this.computeOnMainThread(pixels, width, height);
    }
  }

  private computeOnMainThread(pixels: Uint8Array, width: number, height: number): void {
    const totalPixels = width * height;
    const r = new Array(256).fill(0);
    const g = new Array(256).fill(0);
    const b = new Array(256).fill(0);
    const lum = new Array(256).fill(0);

    for (let i = 0; i < totalPixels; i++) {
      const offset = i * 4;
      r[pixels[offset]]++;
      g[pixels[offset + 1]]++;
      b[pixels[offset + 2]]++;
      const l = Math.round(0.2126 * pixels[offset] + 0.7152 * pixels[offset + 1] + 0.0722 * pixels[offset + 2]);
      lum[Math.min(255, l)]++;
    }

    let max = 0;
    for (let i = 1; i < 255; i++) {
      max = Math.max(max, r[i], g[i], b[i], lum[i]);
    }

    this.data = { r, g, b, lum, max };
    this.draw();
  }

  private draw(): void {
    if (!this.data) return;

    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const d = this.data;
    const max = d.max || 1;

    // Padding
    const pad = 4;
    const drawW = w - pad * 2;
    const drawH = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    // Draw each channel as a filled area
    const channels: { data: number[]; color: string }[] = [
      { data: d.lum, color: 'rgba(255, 255, 255, 0.25)' },
      { data: d.r, color: 'rgba(255, 80, 80, 0.35)' },
      { data: d.g, color: 'rgba(80, 255, 80, 0.35)' },
      { data: d.b, color: 'rgba(80, 80, 255, 0.35)' },
    ];

    for (const ch of channels) {
      ctx.beginPath();
      ctx.moveTo(pad, h - pad);

      for (let i = 0; i < 256; i++) {
        const x = pad + (i / 255) * drawW;
        const barH = (ch.data[i] / max) * drawH;
        ctx.lineTo(x, h - pad - barH);
      }

      ctx.lineTo(pad + drawW, h - pad);
      ctx.closePath();
      ctx.fillStyle = ch.color;
      ctx.fill();
    }
  }

  destroy(): void {
    if (this.updateTimer) clearTimeout(this.updateTimer);
    if (this.worker) this.worker.terminate();
    this.eventBus.off('editor:render-complete', this.onRenderComplete);
    this.canvas.remove();
  }
}
