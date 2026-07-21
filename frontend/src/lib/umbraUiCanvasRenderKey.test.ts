import { describe, expect, test } from 'bun:test';
import {
  createUmbraCanvasDocument,
  createUmbraCanvasImageAsset,
  umbraCanvasDocumentReducer,
} from './umbraUiCanvasDocument';
import { buildUmbraCanvasVisualRenderKey } from './umbraUiCanvasRenderKey';

function createDocument() {
  return createUmbraCanvasDocument(createUmbraCanvasImageAsset({
    name: 'source.png',
    path: '',
    imageUrl: 'blob:source',
    width: 512,
    height: 512,
  }), 'Render Key');
}

describe('Umbra Canvas visual render key', () => {
  test('invalidates when an editable raster-layer mask changes', () => {
    let documentState = createDocument();
    documentState = umbraCanvasDocumentReducer(documentState, {
      type: 'add_raster_layer',
      name: 'Paint',
      asset: createUmbraCanvasImageAsset({
        name: 'paint.png',
        path: '',
        imageUrl: 'blob:paint',
        width: 512,
        height: 512,
      }),
    })!;
    const rasterId = documentState.activeLayerId;
    documentState = umbraCanvasDocumentReducer(documentState, {
      type: 'add_layer_mask',
      rasterLayerId: rasterId,
      dataUrl: 'data:image/png;base64,mask-a',
    })!;
    const mask = documentState.layers.find((layer) => layer.kind === 'mask' && layer.purpose === 'layer');
    expect(mask?.kind).toBe('mask');
    if (!mask || mask.kind !== 'mask') throw new Error('Layer-mask fixture was not created.');
    const firstKey = buildUmbraCanvasVisualRenderKey(documentState);
    const repainted = umbraCanvasDocumentReducer(documentState, {
      type: 'set_mask_layer_snapshot',
      layerId: mask.id,
      dataUrl: 'data:image/png;base64,mask-b',
    })!;
    expect(buildUmbraCanvasVisualRenderKey(repainted)).not.toBe(firstKey);
  });

  test('does not invalidate for generation-only settings', () => {
    const documentState = createDocument();
    const firstKey = buildUmbraCanvasVisualRenderKey(documentState);
    const updated = umbraCanvasDocumentReducer(documentState, {
      type: 'set_generation_settings',
      generation: { ...documentState.generation, steps: '44', cfg: '6.5' },
    })!;
    expect(updated.revision).toBe(documentState.revision + 1);
    expect(buildUmbraCanvasVisualRenderKey(updated)).toBe(firstKey);
  });
});
