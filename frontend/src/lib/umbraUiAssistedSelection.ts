import type {
  UmbraCanvasDocument,
  UmbraCanvasLayer,
  UmbraCanvasMaskLayer,
  UmbraCanvasRasterLayer,
} from './umbraUiCanvasDocument';

export interface UmbraAssistedSelectionPoint {
  x: number;
  y: number;
  positive: boolean;
}

export interface UmbraAssistedSelectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UmbraAssistedSelectionSignatureInput {
  projectId: string;
  guideMode: string;
  sourceMode: 'canvas' | 'layer';
  sourceLayerId: string;
  sourceRevision: string;
  points: UmbraAssistedSelectionPoint[];
  box: UmbraAssistedSelectionBox | null;
  prompt: string;
  modelName: string;
  deviceMode: string;
  threshold: number;
  invert: boolean;
}

function resourceRevision(value: string): string {
  const source = String(value || '');
  return `${source.length}:${source.slice(0, 40)}:${source.slice(-40)}`;
}

function maskSourceKey(mask: UmbraCanvasMaskLayer | undefined): unknown {
  if (!mask) return null;
  return {
    id: mask.id,
    transform: mask.transform,
    data: resourceRevision(mask.dataUrl),
    updatedAt: mask.updatedAt,
  };
}

function rasterSourceKey(documentState: UmbraCanvasDocument, layer: UmbraCanvasRasterLayer): unknown {
  const mask = layer.maskLayerId
    ? documentState.layers.find((candidate): candidate is UmbraCanvasMaskLayer => candidate.id === layer.maskLayerId && candidate.kind === 'mask')
    : undefined;
  return {
    id: layer.id,
    kind: layer.kind,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: layer.transform,
    assetId: layer.asset.id,
    asset: resourceRevision(layer.asset.imageUrl),
    smoothing: layer.smoothing,
    transparencyLocked: layer.transparencyLocked,
    adjustments: layer.adjustments,
    mask: maskSourceKey(mask),
    updatedAt: layer.updatedAt,
  };
}

/**
 * Returns a compact fingerprint for the pixels rendered by Layer source mode.
 * Provider settings and selection destination are intentionally excluded.
 */
export function buildUmbraAssistedSelectionLayerSourceKey(
  documentState: UmbraCanvasDocument | null,
  layer: UmbraCanvasLayer | null,
): string {
  if (!documentState || !layer) return 'missing';
  const canvas = { width: documentState.width, height: documentState.height };
  if (layer.kind === 'raster') {
    return JSON.stringify({ canvas, layer: rasterSourceKey(documentState, layer) });
  }
  if (layer.kind === 'text' || layer.kind === 'gradient') {
    return JSON.stringify({ canvas, layer: { ...layer, visible: true, groupId: undefined } });
  }
  if (layer.kind === 'group') {
    const children = documentState.layers.flatMap((candidate) => {
      if (candidate.groupId !== layer.id || !candidate.visible) return [];
      if (candidate.kind === 'raster') return [rasterSourceKey(documentState, candidate)];
      if (candidate.kind === 'text' || candidate.kind === 'gradient') {
        return [{ ...candidate, groupId: undefined }];
      }
      return [];
    });
    return JSON.stringify({
      canvas,
      group: {
        id: layer.id,
        opacity: layer.opacity,
        blendMode: layer.blendMode,
        updatedAt: layer.updatedAt,
      },
      children,
    });
  }
  if (layer.kind === 'control' || layer.kind === 'reference') {
    return JSON.stringify({
      canvas,
      layer: {
        id: layer.id,
        kind: layer.kind,
        transform: layer.transform,
        assetId: layer.asset.id,
        asset: resourceRevision(layer.asset.imageUrl),
        updatedAt: layer.updatedAt,
      },
    });
  }
  if (layer.kind === 'mask') {
    return JSON.stringify({ canvas, layer: maskSourceKey(layer) });
  }
  const mask = documentState.layers.find((candidate): candidate is UmbraCanvasMaskLayer => (
    candidate.kind === 'mask' && candidate.id === layer.maskLayerId
  ));
  return JSON.stringify({
    canvas,
    layer: {
      id: layer.id,
      kind: layer.kind,
      mask: maskSourceKey(mask),
      updatedAt: layer.updatedAt,
    },
  });
}

export function buildUmbraAssistedSelectionSignature(input: UmbraAssistedSelectionSignatureInput): string {
  return JSON.stringify({
    projectId: input.projectId,
    guideMode: input.guideMode,
    sourceMode: input.sourceMode,
    sourceLayerId: input.sourceMode === 'layer' ? input.sourceLayerId : '',
    sourceRevision: input.sourceRevision,
    points: input.points.map((point) => ({
      x: Math.round(point.x),
      y: Math.round(point.y),
      positive: point.positive,
    })),
    box: input.box ? {
      x: Math.round(input.box.x),
      y: Math.round(input.box.y),
      width: Math.round(input.box.width),
      height: Math.round(input.box.height),
    } : null,
    prompt: input.prompt.trim(),
    modelName: input.modelName,
    deviceMode: input.deviceMode,
    threshold: input.threshold,
    invert: input.invert,
  });
}
