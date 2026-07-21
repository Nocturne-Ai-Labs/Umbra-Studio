/**
 * BatchOperations — Apply tags, presets, and adjustment sidecars to multiple images.
 * Supports copy/paste of adjustments between images.
 */

import { SidecarManager } from './SidecarManager';
import { EditAdjustments, DEFAULT_ADJUSTMENTS } from '../webgl/WebGLPipeline';

export interface BatchTarget {
  path: string;
}

/** Clipboard for copy/paste adjustments between images */
let clipboardAdjustments: EditAdjustments | null = null;

export class BatchOperations {
  private sidecar = new SidecarManager();

  /** Apply a preset's adjustments to multiple images (writes sidecar for each) */
  async applyPreset(targets: BatchTarget[], presetId: number): Promise<void> {
    // Fetch the preset
    const res = await fetch(`/api/editor/presets`);
    if (!res.ok) return;
    const data = await res.json();
    const preset = (data.presets || []).find((p: any) => p.id === presetId);
    if (!preset) return;

    const adjustments = typeof preset.adjustments === 'string'
      ? JSON.parse(preset.adjustments)
      : preset.adjustments;

    // Build a full sidecar from the preset adjustments
    const sidecar = SidecarManager.adjustmentsToSidecar({
      ...DEFAULT_ADJUSTMENTS,
      ...adjustments,
    });
    sidecar.preset = preset.name;

    // Write sidecar to all targets
    await Promise.all(targets.map(t => this.sidecar.write(t.path, sidecar)));
  }

  /** Copy adjustments from a source image to clipboard */
  async copyAdjustments(sourcePath: string): Promise<boolean> {
    const sc = await this.sidecar.read(sourcePath);
    if (!sc) return false;
    clipboardAdjustments = SidecarManager.sidecarToAdjustments(sc);
    return true;
  }

  /** Paste clipboard adjustments to multiple images */
  async pasteAdjustments(targets: BatchTarget[]): Promise<boolean> {
    if (!clipboardAdjustments) return false;
    const sidecar = SidecarManager.adjustmentsToSidecar(clipboardAdjustments);
    await Promise.all(targets.map(t => this.sidecar.write(t.path, sidecar)));
    return true;
  }

  /** Check if clipboard has adjustments */
  hasClipboard(): boolean {
    return clipboardAdjustments !== null;
  }

  /** Get clipboard adjustments for UI display */
  getClipboard(): EditAdjustments | null {
    return clipboardAdjustments
      ? {
          ...clipboardAdjustments,
          effectLayers: clipboardAdjustments.effectLayers.map(layer => ({
            ...layer,
            region: { ...layer.region },
            params: { ...layer.params },
          })),
        }
      : null;
  }

  /** Paste only selected adjustment keys to targets */
  async pasteAdjustmentsSelective(targets: BatchTarget[], filteredAdj: Partial<EditAdjustments>): Promise<boolean> {
    if (!clipboardAdjustments) return false;
    // Merge filtered adjustments into each target's existing sidecar
    for (const t of targets) {
      const existing = await this.sidecar.read(t.path);
      const currentAdj = existing ? SidecarManager.sidecarToAdjustments(existing) : null;
      const merged = { ...(currentAdj || {}), ...filteredAdj } as EditAdjustments;
      if (filteredAdj.effectLayers) {
        merged.effectLayers = filteredAdj.effectLayers.map((layer) => ({
          ...layer,
          region: { ...layer.region },
          params: { ...layer.params },
        }));
      }
      const sidecar = SidecarManager.adjustmentsToSidecar(merged);
      await this.sidecar.write(t.path, sidecar);
    }
    return true;
  }

  /** Clear adjustments (reset) from multiple images */
  async clearAdjustments(targets: BatchTarget[]): Promise<void> {
    await Promise.all(targets.map(t => this.sidecar.delete(t.path)));
  }

  /** Add a tag to multiple images */
  async addTag(targets: BatchTarget[], tagName: string): Promise<void> {
    // Ensure tag exists
    const createRes = await fetch('/api/editor/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: tagName }),
    });
    if (!createRes.ok) return;
    const { id: tagId } = await createRes.json();

    // Add to all targets
    await Promise.all(targets.map(t =>
      fetch('/api/editor/image-tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath: t.path, addTagId: tagId }),
      })
    ));
  }
}
