/**
 * PresetManager — Save, load, apply, and delete editing presets via API.
 */

import { EditAdjustments } from '../webgl/WebGLPipeline';

export interface Preset {
  id: number;
  name: string;
  category: string;
  adjustments: Partial<EditAdjustments>;
  created_at: number;
  updated_at: number;
}

export class PresetManager {
  async list(): Promise<Preset[]> {
    try {
      const res = await fetch('/api/editor/presets');
      if (!res.ok) return [];
      const data = await res.json();
      return data.presets || [];
    } catch {
      return [];
    }
  }

  async save(name: string, adjustments: EditAdjustments, category = 'custom'): Promise<number | null> {
    try {
      // Strip curve/HSL data if at default to keep presets small
      const stripped = this.stripDefaults(adjustments);
      const res = await fetch('/api/editor/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, adjustments: stripped, category }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.id;
    } catch {
      return null;
    }
  }

  async update(id: number, name: string, adjustments: EditAdjustments, category?: string): Promise<boolean> {
    try {
      const stripped = this.stripDefaults(adjustments);
      const res = await fetch(`/api/editor/presets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, adjustments: stripped, category }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async delete(id: number): Promise<boolean> {
    try {
      const res = await fetch(`/api/editor/presets/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {
      return false;
    }
  }

  /** Strip values that are at default to keep preset JSON small */
  private stripDefaults(adj: EditAdjustments): Partial<EditAdjustments> {
    const result: Record<string, any> = {};
    const keys: (keyof EditAdjustments)[] = [
      'exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks',
      'temperature', 'tint', 'vibrance', 'saturation', 'sharpen', 'clarity',
    ];

    for (const key of keys) {
      if (adj[key] !== 0) result[key] = adj[key];
    }

    if (!adj.hslHue.every(v => v === 0)) result.hslHue = adj.hslHue;
    if (!adj.hslSat.every(v => v === 0)) result.hslSat = adj.hslSat;
    if (!adj.hslLum.every(v => v === 0)) result.hslLum = adj.hslLum;

    const isLinear = (pts: [number, number][]) => pts.length === 2 && pts[0][0] === 0 && pts[0][1] === 0 && pts[1][0] === 1 && pts[1][1] === 1;
    if (!isLinear(adj.curveRGB)) result.curveRGB = adj.curveRGB;
    if (!isLinear(adj.curveRed)) result.curveRed = adj.curveRed;
    if (!isLinear(adj.curveGreen)) result.curveGreen = adj.curveGreen;
    if (!isLinear(adj.curveBlue)) result.curveBlue = adj.curveBlue;

    if (adj.effectLayers.length > 0) {
      result.effectsEnabled = !!adj.effectsEnabled;
      result.effectLayers = adj.effectLayers.map((layer) => ({
        ...layer,
        region: { ...layer.region },
        params: { ...layer.params },
      }));
    }

    return result;
  }
}
