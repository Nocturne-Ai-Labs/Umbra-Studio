/**
 * SidecarManager — Read/write editor sidecar JSON via API.
 * Storage is server-backed (EditorDb), with legacy .umbra migration handled by API routes.
 * Debounced auto-save to avoid excessive writes during slider dragging.
 */

import { EditAdjustments, DEFAULT_ADJUSTMENTS, EffectLayer } from '../webgl/WebGLPipeline';
import type { CropRect } from './CropTool';

export interface EditSidecar {
  version: 1;
  modified: string;
  // Basic
  exposure: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  // Color
  temperature: number;
  tint: number;
  vibrance: number;
  saturation: number;
  // HSL
  hsl: {
    hue: number[];
    saturation: number[];
    luminance: number[];
  };
  // Curves
  curves: {
    rgb: [number, number][];
    red: [number, number][];
    green: [number, number][];
    blue: [number, number][];
  };
  // Detail
  sharpen: number;
  clarity: number;
  // Effects
  effects?: {
    enabled: boolean;
    layers: EffectLayer[];
  };
  // Geometry
  crop?: CropRect;
  // Organization (mirrored for portability)
  preset?: string;
  tags?: string[];
}

const DEBOUNCE_MS = 500;

export class SidecarManager {
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingWrites = new Map<string, EditSidecar>();

  /** Read sidecar for an image path. Returns null if no sidecar exists. */
  async read(imagePath: string): Promise<EditSidecar | null> {
    try {
      const res = await fetch('/api/editor/sidecar/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: imagePath }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.sidecar) return data.sidecar as EditSidecar;
      return null;
    } catch {
      return null;
    }
  }

  /** Write sidecar for an image path. */
  async write(imagePath: string, sidecar: EditSidecar): Promise<void> {
    try {
      await fetch('/api/editor/sidecar/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: imagePath, sidecar }),
      });
    } catch (err) {
      console.error('[SidecarManager] Write failed:', err);
    }
  }

  /** Delete sidecar for an image path. */
  async delete(imagePath: string): Promise<void> {
    const existing = this.debounceTimers.get(imagePath);
    if (existing) {
      clearTimeout(existing);
      this.debounceTimers.delete(imagePath);
    }
    this.pendingWrites.delete(imagePath);

    try {
      await fetch('/api/editor/sidecar/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: imagePath }),
      });
    } catch (err) {
      console.error('[SidecarManager] Delete failed:', err);
    }
  }

  /** Debounced auto-save. Waits 500ms after last call before writing. */
  scheduleWrite(imagePath: string, sidecar: EditSidecar): void {
    this.pendingWrites.set(imagePath, sidecar);
    const existing = this.debounceTimers.get(imagePath);
    if (existing) clearTimeout(existing);

    this.debounceTimers.set(imagePath, setTimeout(() => {
      this.debounceTimers.delete(imagePath);
      const pending = this.pendingWrites.get(imagePath);
      if (!pending) return;
      this.pendingWrites.delete(imagePath);
      this.write(imagePath, pending);
    }, DEBOUNCE_MS));
  }

  /** Flush all pending writes immediately. */
  async flush(): Promise<void> {
    this.debounceTimers.forEach((timer) => clearTimeout(timer));
    this.debounceTimers.clear();
    const entries = Array.from(this.pendingWrites.entries());
    this.pendingWrites.clear();
    await Promise.all(entries.map(([path, sidecar]) => this.write(path, sidecar)));
  }

  /** Convert EditAdjustments to sidecar format */
  static adjustmentsToSidecar(adj: EditAdjustments, crop?: CropRect): EditSidecar {
    return {
      version: 1,
      modified: new Date().toISOString(),
      exposure: adj.exposure,
      contrast: adj.contrast,
      highlights: adj.highlights,
      shadows: adj.shadows,
      whites: adj.whites,
      blacks: adj.blacks,
      temperature: adj.temperature,
      tint: adj.tint,
      vibrance: adj.vibrance,
      saturation: adj.saturation,
      hsl: {
        hue: [...adj.hslHue],
        saturation: [...adj.hslSat],
        luminance: [...adj.hslLum],
      },
      curves: {
        rgb: adj.curveRGB.map(p => [...p] as [number, number]),
        red: adj.curveRed.map(p => [...p] as [number, number]),
        green: adj.curveGreen.map(p => [...p] as [number, number]),
        blue: adj.curveBlue.map(p => [...p] as [number, number]),
      },
      sharpen: adj.sharpen,
      clarity: adj.clarity,
      effects: {
        enabled: !!adj.effectsEnabled,
        layers: (adj.effectLayers || []).map((layer) => ({
          ...layer,
          region: { ...layer.region },
          params: { ...layer.params },
        })),
      },
      crop: crop && (crop.x !== 0 || crop.y !== 0 || crop.width !== 1 || crop.height !== 1 || crop.rotation !== 0)
        ? { ...crop }
        : undefined,
    };
  }

  /** Convert sidecar to EditAdjustments */
  static sidecarToAdjustments(sc: EditSidecar): EditAdjustments {
    return {
      exposure: sc.exposure ?? 0,
      contrast: sc.contrast ?? 0,
      highlights: sc.highlights ?? 0,
      shadows: sc.shadows ?? 0,
      whites: sc.whites ?? 0,
      blacks: sc.blacks ?? 0,
      temperature: sc.temperature ?? 0,
      tint: sc.tint ?? 0,
      vibrance: sc.vibrance ?? 0,
      saturation: sc.saturation ?? 0,
      hslHue: sc.hsl?.hue ?? [0, 0, 0, 0, 0, 0],
      hslSat: sc.hsl?.saturation ?? [0, 0, 0, 0, 0, 0],
      hslLum: sc.hsl?.luminance ?? [0, 0, 0, 0, 0, 0],
      curveRGB: sc.curves?.rgb ?? [[0, 0], [1, 1]],
      curveRed: sc.curves?.red ?? [[0, 0], [1, 1]],
      curveGreen: sc.curves?.green ?? [[0, 0], [1, 1]],
      curveBlue: sc.curves?.blue ?? [[0, 0], [1, 1]],
      sharpen: sc.sharpen ?? 0,
      clarity: sc.clarity ?? 0,
      effectsEnabled: !!sc.effects?.enabled && Array.isArray(sc.effects?.layers) && sc.effects.layers.length > 0,
      effectLayers: Array.isArray(sc.effects?.layers)
        ? sc.effects.layers.map((layer: any) => ({
            id: String(layer?.id || `fx_${Math.random().toString(36).slice(2, 10)}`),
            kind: layer?.kind || 'vignette',
            enabled: layer?.enabled !== false,
            opacity: typeof layer?.opacity === 'number' ? layer.opacity : 1,
            blendMode: layer?.blendMode || 'normal',
            region: {
              mode: layer?.region?.mode || 'global',
              centerX: typeof layer?.region?.centerX === 'number' ? layer.region.centerX : 0.5,
              centerY: typeof layer?.region?.centerY === 'number' ? layer.region.centerY : 0.5,
              radius: typeof layer?.region?.radius === 'number' ? layer.region.radius : 0.45,
              feather: typeof layer?.region?.feather === 'number' ? layer.region.feather : 0.25,
              angle: typeof layer?.region?.angle === 'number' ? layer.region.angle : 0,
              offset: typeof layer?.region?.offset === 'number' ? layer.region.offset : 0,
              invert: !!layer?.region?.invert,
            },
            params: typeof layer?.params === 'object' && layer.params
              ? { ...layer.params }
              : {},
          }))
        : [],
    };
  }

  /** Check if adjustments are all at default (no edits) */
  static isDefault(adj: EditAdjustments): boolean {
    const d = DEFAULT_ADJUSTMENTS;
    return (
      adj.exposure === d.exposure && adj.contrast === d.contrast &&
      adj.highlights === d.highlights && adj.shadows === d.shadows &&
      adj.whites === d.whites && adj.blacks === d.blacks &&
      adj.temperature === d.temperature && adj.tint === d.tint &&
      adj.vibrance === d.vibrance && adj.saturation === d.saturation &&
      adj.sharpen === d.sharpen && adj.clarity === d.clarity &&
      adj.effectsEnabled === false &&
      (adj.effectLayers?.length ?? 0) === 0 &&
      adj.hslHue.every(v => v === 0) && adj.hslSat.every(v => v === 0) && adj.hslLum.every(v => v === 0) &&
      adj.curveRGB.length === 2 && adj.curveRGB[0][0] === 0 && adj.curveRGB[0][1] === 0 &&
      adj.curveRGB[1][0] === 1 && adj.curveRGB[1][1] === 1 &&
      adj.curveRed.length === 2 && adj.curveGreen.length === 2 && adj.curveBlue.length === 2
    );
  }
}
