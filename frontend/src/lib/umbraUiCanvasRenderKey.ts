import type { UmbraCanvasDocument } from './umbraUiCanvasDocument';

function resourceRevision(value: string): string {
  const source = String(value || '');
  return `${source.length}:${source.slice(0, 40)}:${source.slice(-40)}`;
}

/**
 * Fingerprints only pixels and compositing properties used by the base visual
 * renderer. Generation metadata and guidance overlays intentionally stay out.
 */
export function buildUmbraCanvasVisualRenderKey(documentState: UmbraCanvasDocument | null): string {
  if (!documentState) return 'empty';
  const rasterMaskLayerIds = new Set(documentState.layers.flatMap((layer) => (
    layer.kind === 'raster' && layer.maskLayerId ? [layer.maskLayerId] : []
  )));
  const layers = documentState.layers.flatMap((layer) => {
    if (layer.kind === 'raster') return [{
      id: layer.id,
      kind: layer.kind,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      groupId: layer.groupId,
      transform: layer.transform,
      asset: resourceRevision(layer.asset.imageUrl),
      maskLayerId: layer.maskLayerId,
      smoothing: layer.smoothing,
      transparencyLocked: layer.transparencyLocked,
      adjustments: layer.adjustments,
      updatedAt: layer.updatedAt,
    }];
    if (layer.kind === 'text' || layer.kind === 'gradient') return [{ ...layer, updatedAt: layer.updatedAt }];
    if (layer.kind === 'group') return [{
      id: layer.id,
      kind: layer.kind,
      visible: layer.visible,
      opacity: layer.opacity,
      blendMode: layer.blendMode,
      updatedAt: layer.updatedAt,
    }];
    if (layer.kind === 'mask' && (layer.frozen || rasterMaskLayerIds.has(layer.id))) return [{
      id: layer.id,
      kind: layer.kind,
      transform: layer.transform,
      data: resourceRevision(layer.dataUrl),
      updatedAt: layer.updatedAt,
    }];
    return [];
  });
  return JSON.stringify([documentState.width, documentState.height, layers]);
}
