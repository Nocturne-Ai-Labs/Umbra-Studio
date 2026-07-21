import { describe, expect, test } from 'bun:test';
import {
  buildUmbraAssistedSelectionLayerSourceKey,
  buildUmbraAssistedSelectionSignature,
} from './umbraUiAssistedSelection';
import {
  createUmbraCanvasDocument,
  createUmbraCanvasImageAsset,
  umbraCanvasDocumentReducer,
} from './umbraUiCanvasDocument';

function createSignature(sourceRevision = 'source-a') {
  return buildUmbraAssistedSelectionSignature({
    projectId: 'project-1',
    guideMode: 'points',
    sourceMode: 'canvas',
    sourceLayerId: 'ignored-for-canvas',
    sourceRevision,
    points: [{ x: 10.4, y: 20.6, positive: true }],
    box: null,
    prompt: ' person ',
    modelName: 'sam-vit-b',
    deviceMode: 'CPU',
    threshold: 0.7,
    invert: false,
  });
}

describe('Umbra assisted-selection signatures', () => {
  test('normalizes guides and changes when rendered source content changes', () => {
    expect(createSignature('source-a')).toBe(createSignature('source-a'));
    expect(createSignature('source-a')).not.toBe(createSignature('source-b'));
    expect(createSignature()).toContain('"x":10');
    expect(createSignature()).toContain('"y":21');
    expect(createSignature()).toContain('"prompt":"person"');
  });

  test('tracks raster transforms and private layer-mask pixels', () => {
    const source = createUmbraCanvasImageAsset({
      name: 'source.png',
      path: '',
      imageUrl: 'blob:source-a',
      width: 512,
      height: 512,
    });
    let documentState = createUmbraCanvasDocument(source, 'Assisted Selection');
    documentState = umbraCanvasDocumentReducer(documentState, {
      type: 'add_raster_layer',
      name: 'Paint',
      asset: createUmbraCanvasImageAsset({
        name: 'paint.png',
        path: '',
        imageUrl: 'blob:paint-a',
        width: 512,
        height: 512,
      }),
    });
    const raster = documentState.layers.find((layer) => layer.id === documentState.activeLayerId);
    expect(raster?.kind).toBe('raster');
    if (!raster || raster.kind !== 'raster') throw new Error('Raster fixture was not created.');
    const original = buildUmbraAssistedSelectionLayerSourceKey(documentState, raster);

    const transformed = umbraCanvasDocumentReducer(documentState, {
      type: 'set_layer_transform',
      layerId: raster.id,
      transform: { ...raster.transform, x: raster.transform.x + 24 },
    });
    const transformedRaster = transformed.layers.find((layer) => layer.id === raster.id) || null;
    expect(buildUmbraAssistedSelectionLayerSourceKey(transformed, transformedRaster)).not.toBe(original);

    const masked = umbraCanvasDocumentReducer(documentState, {
      type: 'add_layer_mask',
      rasterLayerId: raster.id,
      dataUrl: 'data:image/png;base64,mask-a',
    });
    const maskedRaster = masked.layers.find((layer) => layer.id === raster.id) || null;
    const maskedKey = buildUmbraAssistedSelectionLayerSourceKey(masked, maskedRaster);
    expect(maskedKey).not.toBe(original);
    const mask = masked.layers.find((layer) => layer.kind === 'mask' && layer.purpose === 'layer');
    expect(mask?.kind).toBe('mask');
    if (!mask || mask.kind !== 'mask') throw new Error('Mask fixture was not created.');
    const repainted = umbraCanvasDocumentReducer(masked, {
      type: 'set_mask_layer_snapshot',
      layerId: mask.id,
      dataUrl: 'data:image/png;base64,mask-b',
    });
    const repaintedRaster = repainted.layers.find((layer) => layer.id === raster.id) || null;
    expect(buildUmbraAssistedSelectionLayerSourceKey(repainted, repaintedRaster)).not.toBe(maskedKey);
  });
});
