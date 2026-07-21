import { describe, expect, test } from 'bun:test';
import {
  createUmbraCanvasDocument,
  createUmbraCanvasImageAsset,
  forkUmbraCanvasDocument,
  fitUmbraCanvasRectToAspectRatio,
  fitUmbraCanvasTransformToRect,
  getUmbraCanvasGenerationRegion,
  migrateUmbraCanvasDocument,
  recordUmbraCanvasPromptHistory,
  UMBRA_CANVAS_DOCUMENT_VERSION,
  UMBRA_CANVAS_PROMPT_HISTORY_LIMIT,
  umbraCanvasDocumentReducer,
  validateUmbraCanvasDocument,
  type UmbraCanvasDocument,
  type UmbraCanvasStage,
} from './umbraUiCanvasDocument';

function createDocument(): UmbraCanvasDocument {
  return createUmbraCanvasDocument(createUmbraCanvasImageAsset({
    name: 'source.png',
    path: 'D:/source.png',
    imageUrl: '/source.png',
    width: 1024,
    height: 768,
  }));
}

function createStage(): UmbraCanvasStage {
  return {
    id: 'stage-1',
    jobId: 'job-1',
    itemId: 'item-1',
    name: 'Generated region',
    asset: createUmbraCanvasImageAsset({
      name: 'generated.png',
      path: 'D:/generated.png',
      imageUrl: '/generated.png',
      width: 512,
      height: 384,
      seed: 42,
    }),
    seed: 42,
    region: { x: 128, y: 96, width: 512, height: 384 },
    maskDataUrl: 'data:image/png;base64,mask',
    createdAt: 1,
  };
}

describe('Umbra canvas document', () => {
  test('creates an immutable source and editable inpaint mask', () => {
    const document = createDocument();
    expect(document.layers).toHaveLength(2);
    expect(document.layers[0].kind).toBe('raster');
    expect(document.layers[0].locked).toBe(true);
    expect(document.layers[1].kind).toBe('mask');
    expect(document.layers[1]).toMatchObject({ visible: true, enabled: true });
    expect(validateUmbraCanvasDocument(document)).toEqual([]);
  });

  test('replaces the immutable source asset without changing document or layer identity', () => {
    const document = createDocument();
    const source = document.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    if (!source || source.kind !== 'raster') throw new Error('Source layer is missing.');
    const replacement = createUmbraCanvasImageAsset({
      name: 'corrected.png',
      path: 'D:/corrected.png',
      imageUrl: '/corrected.png',
      width: 1536,
      height: 1024,
    });
    const replaced = umbraCanvasDocumentReducer(document, { type: 'replace_source_asset', asset: replacement })!;
    const nextSource = replaced.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    expect(replaced.id).toBe(document.id);
    expect(nextSource?.id).toBe(source.id);
    expect(nextSource).toMatchObject({ asset: replacement, locked: true });
    expect(replaced.width).toBe(document.width);
    expect(replaced.height).toBe(document.height);
    expect(validateUmbraCanvasDocument(replaced)).toEqual([]);
  });

  test('flips the complete canvas, layers, and generation region as one edit', () => {
    const document = umbraCanvasDocumentReducer(createDocument(), {
      type: 'add_raster_layer',
      name: 'Character',
      asset: createUmbraCanvasImageAsset({
        name: 'character.png',
        path: 'D:/character.png',
        imageUrl: '/character.png',
        width: 200,
        height: 100,
      }),
      transform: { x: 100, y: 50, width: 200, height: 100, rotation: 30 },
    })!;
    const withRegion = umbraCanvasDocumentReducer(document, {
      type: 'set_generation_region',
      region: { x: 300, y: 200, width: 400, height: 200 },
    })!;
    const flipped = umbraCanvasDocumentReducer(withRegion, {
      type: 'transform_canvas',
      operation: 'flip_horizontal',
    })!;
    const source = flipped.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const character = flipped.layers.find((layer) => layer.kind === 'raster' && layer.name === 'Character');
    expect(flipped.revision).toBe(withRegion.revision + 1);
    expect(flipped.width).toBe(1024);
    expect(flipped.height).toBe(768);
    expect(source?.transform).toMatchObject({ x: 0, scaleX: -1, rotation: 0 });
    expect(character?.transform).toMatchObject({ x: 724, y: 50, rotation: -30, scaleX: -1 });
    expect(flipped.generationRegion).toEqual({ x: 324, y: 200, width: 400, height: 200 });
    expect(validateUmbraCanvasDocument(flipped)).toEqual([]);
  });

  test('rotates the complete canvas and inverts the region aspect lock', () => {
    const document = umbraCanvasDocumentReducer(createDocument(), {
      type: 'set_generation_region',
      region: { x: 300, y: 200, width: 400, height: 200 },
    })!;
    const locked = umbraCanvasDocumentReducer(document, {
      type: 'set_generation_region_aspect_ratio',
      ratio: 2,
    })!;
    const rotated = umbraCanvasDocumentReducer(locked, {
      type: 'transform_canvas',
      operation: 'rotate_right',
      maskSnapshots: [{ layerId: locked.activeMaskLayerId, dataUrl: 'blob:rotated-mask' }],
    })!;
    const source = rotated.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const activeMask = rotated.layers.find((layer) => layer.id === rotated.activeMaskLayerId);
    expect(rotated.revision).toBe(locked.revision + 1);
    expect(rotated.width).toBe(768);
    expect(rotated.height).toBe(1024);
    expect(source?.transform).toMatchObject({ x: -128, y: 128, rotation: 90 });
    expect(activeMask).toMatchObject({
      kind: 'mask',
      dataUrl: 'blob:rotated-mask',
      transform: { x: 0, y: 0, width: 768, height: 1024, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    expect(rotated.generationRegionAspectRatio).toBe(0.5);
    expect(rotated.generationRegion).toEqual({ x: 368, y: 300, width: 200, height: 400 });
    expect(validateUmbraCanvasDocument(rotated)).toEqual([]);
  });

  test('adds a transparent cutout while preserving the hidden original layers', () => {
    const document = createDocument();
    const source = document.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const cutoutAsset = createUmbraCanvasImageAsset({
      name: 'character-cutout.png',
      path: '',
      imageUrl: 'blob:character-cutout',
      width: 1024,
      height: 768,
      objectUrl: true,
    });
    const cutoutDocument = umbraCanvasDocumentReducer(document, {
      type: 'add_cutout_layer',
      name: 'Character Cutout',
      asset: cutoutAsset,
    })!;
    const preservedSource = cutoutDocument.layers.find((layer) => layer.id === source?.id);
    const cutout = cutoutDocument.layers.find((layer) => layer.kind === 'raster' && layer.role === 'cutout');
    expect(cutoutDocument.layers).toHaveLength(document.layers.length + 1);
    expect(preservedSource).toMatchObject({ id: source?.id, visible: false, locked: true });
    expect(cutout).toMatchObject({
      name: 'Character Cutout',
      visible: true,
      transform: { x: 0, y: 0, width: 1024, height: 768 },
    });
    expect(cutoutDocument.activeLayerId).toBe(cutout?.id);
    expect(validateUmbraCanvasDocument(cutoutDocument)).toEqual([]);
  });

  test('normalizes generation regions to canvas bounds', () => {
    const document = createDocument();
    const next = umbraCanvasDocumentReducer(document, {
      type: 'set_generation_region',
      region: { x: 900, y: 700, width: 500, height: 500 },
    })!;
    expect(next.generationRegion).toEqual({ x: 900, y: 700, width: 124, height: 68 });
    expect(getUmbraCanvasGenerationRegion(next)).toEqual(next.generationRegion);
  });

  test('persists and enforces generation-region aspect locks', () => {
    const document = createDocument();
    const locked = umbraCanvasDocumentReducer(document, { type: 'set_generation_region_aspect_ratio', ratio: 16 / 9 })!;
    const withRegion = umbraCanvasDocumentReducer(locked, {
      type: 'set_generation_region',
      region: { x: 100, y: 100, width: 600, height: 600 },
    })!;
    expect(withRegion.generationRegionAspectRatio).toBeCloseTo(16 / 9, 6);
    expect((withRegion.generationRegion!.width / withRegion.generationRegion!.height)).toBeCloseTo(16 / 9, 2);
    const fitted = fitUmbraCanvasRectToAspectRatio({ x: 900, y: 700, width: 400, height: 400 }, 1024, 768, 1);
    expect(fitted.x + fitted.width).toBeLessThanOrEqual(1024);
    expect(fitted.y + fitted.height).toBeLessThanOrEqual(768);
    expect(migrateUmbraCanvasDocument(withRegion).generationRegionAspectRatio).toBeCloseTo(16 / 9, 6);
  });

  test('swaps generation-region dimensions and inverts its aspect lock atomically', () => {
    const document = umbraCanvasDocumentReducer(createDocument(), {
      type: 'set_generation_region',
      region: { x: 300, y: 200, width: 400, height: 200 },
    })!;
    const locked = umbraCanvasDocumentReducer(document, {
      type: 'set_generation_region_aspect_ratio',
      ratio: 2,
    })!;
    const swapped = umbraCanvasDocumentReducer(locked, { type: 'swap_generation_region_dimensions' })!;
    expect(swapped.revision).toBe(locked.revision + 1);
    expect(swapped.generationRegionAspectRatio).toBe(0.5);
    expect(swapped.generationRegion).toMatchObject({ width: 200, height: 400 });
    expect(swapped.generationRegion!.x + swapped.generationRegion!.width / 2).toBeCloseTo(
      locked.generationRegion!.x + locked.generationRegion!.width / 2,
      6,
    );
    expect(swapped.generationRegion!.y + swapped.generationRegion!.height / 2).toBeCloseTo(
      locked.generationRegion!.y + locked.generationRegion!.height / 2,
      6,
    );
  });

  test('fits transformed layers to a target using contain, cover, or fill', () => {
    const transform = { x: 0, y: 0, width: 400, height: 200, rotation: 17, scaleX: -1, scaleY: 1 };
    const target = { x: 100, y: 50, width: 300, height: 300 };

    expect(fitUmbraCanvasTransformToRect(transform, target, 'contain')).toEqual({
      x: 100,
      y: 125,
      width: 300,
      height: 150,
      rotation: 0,
      scaleX: -1,
      scaleY: 1,
    });
    expect(fitUmbraCanvasTransformToRect(transform, target, 'cover')).toEqual({
      x: -50,
      y: 50,
      width: 600,
      height: 300,
      rotation: 0,
      scaleX: -1,
      scaleY: 1,
    });
    expect(fitUmbraCanvasTransformToRect(transform, target, 'fill')).toEqual({
      x: 100,
      y: 50,
      width: 300,
      height: 300,
      rotation: 0,
      scaleX: -1,
      scaleY: 1,
    });
  });

  test('accepts staged output as an opaque backend-composited replacement', () => {
    const document = createDocument();
    const staged = umbraCanvasDocumentReducer(document, {
      type: 'stage_outputs',
      stages: [createStage()],
      previewStageId: 'stage-1',
    })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1' })!;
    const generated = accepted.layers.find((layer) => layer.kind === 'raster' && layer.role === 'generated');
    expect(generated?.kind).toBe('raster');
    expect(generated?.transform).toMatchObject({ x: 128, y: 96, width: 512, height: 384 });
    expect(generated?.maskLayerId).toBeUndefined();
    expect(accepted.layers.filter((layer) => layer.kind === 'mask')).toHaveLength(1);
    expect(accepted.staging).toHaveLength(0);
    expect(accepted.previewStageId).toBe('');
    expect(validateUmbraCanvasDocument(accepted)).toEqual([]);
  });

  test('removing a masked generated layer also removes its private frozen mask', () => {
    const document = createDocument();
    const staged = umbraCanvasDocumentReducer(document, { type: 'stage_outputs', stages: [createStage()] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1', mode: 'new_layer' })!;
    const generated = accepted.layers.find((layer) => layer.kind === 'raster' && layer.role === 'generated');
    const removed = umbraCanvasDocumentReducer(accepted, { type: 'remove_layer', layerId: generated!.id })!;
    expect(removed.layers.some((layer) => layer.id === generated!.id)).toBe(false);
    expect(removed.layers.some((layer) => layer.id === generated!.maskLayerId)).toBe(false);
    expect(validateUmbraCanvasDocument(removed)).toEqual([]);
  });

  test('accepts a staged output as a separate masked layer', () => {
    const staged = umbraCanvasDocumentReducer(createDocument(), { type: 'stage_outputs', stages: [createStage()] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1', mode: 'new_layer' })!;
    const generated = accepted.layers.find((layer) => layer.kind === 'raster' && layer.role === 'generated');
    expect(generated?.kind === 'raster' ? generated.maskLayerId : '').toBeTruthy();
    expect(accepted.layers.filter((layer) => layer.kind === 'mask')).toHaveLength(2);
  });

  test('accepts and discards staged samples as atomic batches', () => {
    const secondStage = {
      ...createStage(),
      id: 'stage-2',
      itemId: 'item-2',
      seed: 84,
      asset: createUmbraCanvasImageAsset({ name: 'generated-2.png', path: 'D:/generated-2.png', imageUrl: '/generated-2.png', width: 512, height: 384, seed: 84 }),
    };
    const staged = umbraCanvasDocumentReducer(createDocument(), { type: 'stage_outputs', stages: [createStage(), secondStage] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stages', stageIds: ['stage-1', 'stage-2'], mode: 'new_layer' })!;
    expect(accepted.staging).toHaveLength(0);
    expect(accepted.layers.filter((layer) => layer.kind === 'raster' && layer.role === 'generated')).toHaveLength(2);
    const restaged = umbraCanvasDocumentReducer(createDocument(), { type: 'stage_outputs', stages: [createStage(), secondStage], previewStageId: 'stage-2' })!;
    const discarded = umbraCanvasDocumentReducer(restaged, { type: 'discard_stages', stageIds: ['stage-1', 'stage-2'] })!;
    expect(discarded.staging).toHaveLength(0);
    expect(discarded.previewStageId).toBe('');
  });

  test('advances staged preview deterministically after accept or discard', () => {
    const secondStage = {
      ...createStage(),
      id: 'stage-2',
      itemId: 'item-2',
      createdAt: 2,
      asset: createUmbraCanvasImageAsset({ name: 'generated-2.png', path: 'D:/generated-2.png', imageUrl: '/generated-2.png', width: 512, height: 384, seed: 84 }),
    };
    const thirdStage = {
      ...createStage(),
      id: 'stage-3',
      itemId: 'item-3',
      createdAt: 3,
      asset: createUmbraCanvasImageAsset({ name: 'generated-3.png', path: 'D:/generated-3.png', imageUrl: '/generated-3.png', width: 512, height: 384, seed: 126 }),
    };
    const staged = umbraCanvasDocumentReducer(createDocument(), {
      type: 'stage_outputs',
      stages: [createStage(), secondStage, thirdStage],
      previewStageId: 'stage-2',
    })!;
    const discarded = umbraCanvasDocumentReducer(staged, { type: 'discard_stage', stageId: 'stage-2' })!;
    expect(discarded.previewStageId).toBe('stage-1');
    const accepted = umbraCanvasDocumentReducer(discarded, { type: 'accept_stage', stageId: 'stage-1' })!;
    expect(accepted.previewStageId).toBe('stage-3');
  });

  test('ignores stale preview ids and repairs malformed staging records during migration', () => {
    const document = createDocument();
    const stage = createStage();
    const migrated = migrateUmbraCanvasDocument({
      ...document,
      staging: [stage, { ...stage }, { ...stage, id: '', asset: { ...stage.asset, imageUrl: '' } }],
      previewStageId: 'missing-stage',
      pendingJobs: [
        { id: 'job-1', region: stage.region, maskDataUrl: stage.maskDataUrl, createdAt: 1 },
        { id: 'job-1', region: stage.region, maskDataUrl: stage.maskDataUrl, createdAt: 2 },
      ],
    });
    expect(migrated.staging.map((entry) => entry.id)).toEqual(['stage-1']);
    expect(migrated.pendingJobs.map((entry) => entry.id)).toEqual(['job-1']);
    expect(migrated.previewStageId).toBe('');
    expect(validateUmbraCanvasDocument(migrated)).toEqual([]);
  });

  test('preserves pinned staging state across backend refreshes', () => {
    const staged = umbraCanvasDocumentReducer(createDocument(), { type: 'stage_outputs', stages: [createStage()] })!;
    const pinned = umbraCanvasDocumentReducer(staged, { type: 'toggle_stage_pin', stageId: 'stage-1' })!;
    const refreshed = umbraCanvasDocumentReducer(pinned, { type: 'stage_outputs', stages: [{ ...createStage(), createdAt: 2 }] })!;
    expect(refreshed.staging[0]).toMatchObject({ id: 'stage-1', pinned: true, createdAt: 2 });
  });

  test('records Gallery receipts idempotently and preserves them across backend refreshes', () => {
    const staged = umbraCanvasDocumentReducer(createDocument(), { type: 'stage_outputs', stages: [createStage()] })!;
    const saved = umbraCanvasDocumentReducer(staged, {
      type: 'mark_stages_gallery_saved',
      receipts: [
        { stageId: 'stage-1', path: 'D:/gallery/canvas-stage.png', savedAt: 1234 },
        { stageId: 'missing-stage', path: 'D:/gallery/missing.png', savedAt: 1234 },
      ],
    })!;
    expect(saved.revision).toBe(staged.revision + 1);
    expect(saved.staging[0]).toMatchObject({
      id: 'stage-1',
      galleryPath: 'D:/gallery/canvas-stage.png',
      gallerySavedAt: 1234,
    });

    const unchanged = umbraCanvasDocumentReducer(saved, {
      type: 'mark_stages_gallery_saved',
      receipts: [{ stageId: 'stage-1', path: 'D:/gallery/canvas-stage.png', savedAt: 1234 }],
    })!;
    expect(unchanged).toBe(saved);

    const refreshed = umbraCanvasDocumentReducer(saved, {
      type: 'stage_outputs',
      stages: [{ ...createStage(), createdAt: 2 }],
    })!;
    expect(refreshed.staging[0]).toMatchObject({
      createdAt: 2,
      galleryPath: 'D:/gallery/canvas-stage.png',
      gallerySavedAt: 1234,
    });
  });

  test('normalizes persisted Gallery receipts during migration', () => {
    const stage = createStage();
    const migrated = migrateUmbraCanvasDocument({
      ...createDocument(),
      version: 17,
      staging: [{ ...stage, galleryPath: '  D:/gallery/stage.png  ', gallerySavedAt: '5678' }],
    });
    expect(migrated.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(migrated.staging[0]).toMatchObject({
      galleryPath: 'D:/gallery/stage.png',
      gallerySavedAt: 5678,
    });
  });

  test('migrates version 18 projects with an empty prompt history', () => {
    const legacy = structuredClone(createDocument()) as any;
    legacy.version = 18;
    delete legacy.generation.promptHistory;
    const migrated = migrateUmbraCanvasDocument(legacy);
    expect(migrated.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(migrated.generation.promptHistory).toEqual([]);
  });

  test('records bounded project prompt history and moves duplicate prompts to the front', () => {
    let history = recordUmbraCanvasPromptHistory([], [{ id: 'base', text: 'hero, sunset' }], 'blurry', 100);
    history = recordUmbraCanvasPromptHistory(history, [{ id: 'revised', text: 'hero, sunset' }], 'blurry', 200);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ createdAt: 200, negativePrompt: 'blurry' });

    for (let index = 0; index < UMBRA_CANVAS_PROMPT_HISTORY_LIMIT + 5; index += 1) {
      history = recordUmbraCanvasPromptHistory(
        history,
        [{ id: `prompt-${index}`, text: `unique prompt ${index}` }],
        '',
        300 + index,
      );
    }
    expect(history).toHaveLength(UMBRA_CANVAS_PROMPT_HISTORY_LIMIT);
    expect(history[0].promptSegments[0].text).toBe(`unique prompt ${UMBRA_CANVAS_PROMPT_HISTORY_LIMIT + 4}`);
    expect(history.at(-1)?.promptSegments[0].text).toBe('unique prompt 5');
    expect(recordUmbraCanvasPromptHistory(history, [{ id: 'empty', text: '   ' }], '', 999)).toEqual(history);
  });

  test('preserves the editable mask when accepting a stage in preserve-mask mode', () => {
    const document = createDocument();
    const masked = umbraCanvasDocumentReducer(document, { type: 'set_mask_snapshot', dataUrl: 'data:image/png;base64,active-mask' })!;
    const staged = umbraCanvasDocumentReducer(masked, { type: 'stage_outputs', stages: [createStage()] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1', preserveMask: true })!;
    expect(accepted.activeMaskLayerId).toBe(masked.activeMaskLayerId);
    const activeMask = accepted.layers.find((layer) => layer.id === accepted.activeMaskLayerId);
    expect(activeMask?.kind === 'mask' ? activeMask.dataUrl : '').toBe('data:image/png;base64,active-mask');
  });

  test('switches between multiple editable masks and keeps one when the active mask is removed', () => {
    const document = createDocument();
    const withSecond = umbraCanvasDocumentReducer(document, { type: 'add_inpaint_mask', name: 'Alternate Mask' })!;
    const secondMaskId = withSecond.activeMaskLayerId;
    const switched = umbraCanvasDocumentReducer(withSecond, { type: 'set_active_mask', layerId: document.activeMaskLayerId })!;
    expect(switched.activeMaskLayerId).toBe(document.activeMaskLayerId);
    const removed = umbraCanvasDocumentReducer(switched, { type: 'remove_layer', layerId: document.activeMaskLayerId })!;
    expect(removed.activeMaskLayerId).toBe(secondMaskId);
    expect(removed.layers.some((layer) => layer.id === document.activeMaskLayerId)).toBe(false);
  });

  test('keeps locked masks immutable and leaves private guidance mask enablement parent-owned', () => {
    const document = createDocument();
    const populated = umbraCanvasDocumentReducer(document, {
      type: 'set_mask_snapshot',
      dataUrl: 'blob:before-lock',
    })!;
    const locked = umbraCanvasDocumentReducer(populated, {
      type: 'toggle_layer_lock',
      layerId: populated.activeMaskLayerId,
    })!;
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'set_mask_snapshot',
      dataUrl: 'blob:after-lock',
    })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'set_mask_layer_snapshot',
      layerId: locked.activeMaskLayerId,
      dataUrl: 'blob:after-lock-direct',
    })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'crop_mask_to_region',
      layerId: locked.activeMaskLayerId,
      dataUrl: 'blob:after-lock-crop',
    })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'update_inpaint_mask',
      layerId: locked.activeMaskLayerId,
      changes: { noiseLevel: 0.75 },
    })).toBe(locked);

    const withRegion = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_guidance',
      name: 'Face',
      dataUrl: 'blob:face-mask',
    })!;
    const region = withRegion.layers.find((layer) => layer.kind === 'regional_guidance');
    if (!region || region.kind !== 'regional_guidance') throw new Error('Regional guidance was not created.');
    expect(umbraCanvasDocumentReducer(withRegion, {
      type: 'toggle_layer_enabled',
      layerId: region.maskLayerId,
    })).toBe(withRegion);
    const disabledRegion = umbraCanvasDocumentReducer(withRegion, {
      type: 'toggle_layer_enabled',
      layerId: region.id,
    })!;
    expect(disabledRegion.layers.find((layer) => layer.id === region.id)).toMatchObject({ enabled: false });
  });

  test('duplicates an editable inpaint mask as an independent active mask', () => {
    const document = createDocument();
    const originalMask = document.layers.find((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint');
    const populated = umbraCanvasDocumentReducer(document, {
      type: 'set_mask_layer_snapshot',
      layerId: originalMask!.id,
      dataUrl: 'blob:painted-mask',
    })!;
    const duplicated = umbraCanvasDocumentReducer(populated, { type: 'duplicate_layer', layerId: originalMask!.id })!;
    const editableMasks = duplicated.layers.filter((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen);
    expect(editableMasks).toHaveLength(2);
    expect(duplicated.activeMaskLayerId).not.toBe(originalMask!.id);
    expect(duplicated.layers.find((layer) => layer.id === duplicated.activeMaskLayerId)).toMatchObject({
      name: `${originalMask!.name} Copy`,
      dataUrl: 'blob:painted-mask',
      locked: false,
    });
    expect(validateUmbraCanvasDocument(duplicated)).toEqual([]);
  });

  test('bakes an inpaint-mask transform into its snapshot and restores editable full-canvas geometry', () => {
    const document = createDocument();
    const transformed = umbraCanvasDocumentReducer(document, {
      type: 'set_layer_transform',
      layerId: document.activeMaskLayerId,
      transform: { x: 120, y: 90, width: 512, height: 384, rotation: 15 },
    })!;
    const baked = umbraCanvasDocumentReducer(transformed, {
      type: 'bake_inpaint_mask_transform',
      layerId: document.activeMaskLayerId,
      dataUrl: 'blob:baked-mask',
    })!;
    expect(baked.layers.find((layer) => layer.id === document.activeMaskLayerId)).toMatchObject({
      dataUrl: 'blob:baked-mask',
      transform: { x: 0, y: 0, width: 1024, height: 768, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    expect(validateUmbraCanvasDocument(baked)).toEqual([]);
  });

  test('crops editable and regional masks atomically into full-canvas identity geometry', () => {
    const document = createDocument();
    const activeMaskId = document.activeMaskLayerId;
    const moved = umbraCanvasDocumentReducer(document, {
      type: 'set_layer_transform',
      layerId: activeMaskId,
      transform: { x: 12, y: 18, width: 128, height: 96, rotation: 7 },
    })!;
    const cropped = umbraCanvasDocumentReducer(moved, {
      type: 'crop_mask_to_region',
      layerId: activeMaskId,
      dataUrl: 'blob:cropped-inpaint-mask',
    })!;
    expect(cropped.layers.find((layer) => layer.id === activeMaskId)).toMatchObject({
      kind: 'mask',
      dataUrl: 'blob:cropped-inpaint-mask',
      transform: { x: 0, y: 0, width: document.width, height: document.height, rotation: 0, scaleX: 1, scaleY: 1 },
    });

    const withRegion = umbraCanvasDocumentReducer(cropped, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:regional-mask',
      name: 'Face',
    })!;
    const region = withRegion.layers.find((layer) => layer.kind === 'regional_guidance');
    if (!region || region.kind !== 'regional_guidance') throw new Error('Regional guidance was not created.');
    const unlockedRegionMask = umbraCanvasDocumentReducer(withRegion, {
      type: 'toggle_layer_lock',
      layerId: region.maskLayerId,
    })!;
    const croppedRegion = umbraCanvasDocumentReducer(unlockedRegionMask, {
      type: 'crop_mask_to_region',
      layerId: region.maskLayerId,
      dataUrl: 'blob:cropped-regional-mask',
    })!;
    expect(croppedRegion.layers.find((layer) => layer.id === region.maskLayerId)).toMatchObject({
      kind: 'mask',
      purpose: 'regional_guidance',
      frozen: true,
      dataUrl: 'blob:cropped-regional-mask',
      transform: { x: 0, y: 0, width: document.width, height: document.height, rotation: 0, scaleX: 1, scaleY: 1 },
    });
    expect(validateUmbraCanvasDocument(croppedRegion)).toEqual([]);
  });

  test('clamps per-mask noise and denoise limits', () => {
    const document = createDocument();
    const updated = umbraCanvasDocumentReducer(document, {
      type: 'update_inpaint_mask',
      layerId: document.activeMaskLayerId,
      changes: { noiseLevel: 2, denoiseLimit: -1 },
    })!;
    const mask = updated.layers.find((layer) => layer.id === updated.activeMaskLayerId);
    expect(mask?.kind === 'mask' ? mask.noiseLevel : -1).toBe(1);
    expect(mask?.kind === 'mask' ? mask.denoiseLimit : -1).toBe(0);
  });

  test('migrates persisted mask modifiers without losing their values', () => {
    const document = createDocument();
    const mask = document.layers.find((layer) => layer.id === document.activeMaskLayerId);
    if (mask?.kind !== 'mask') throw new Error('Expected an editable mask.');
    const migrated = migrateUmbraCanvasDocument({
      ...document,
      version: 3,
      layers: document.layers.map((layer) => layer.id === mask.id
        ? { ...layer, noiseLevel: 0.35, denoiseLimit: 0.72 }
        : layer),
    });
    const migratedMask = migrated.layers.find((layer) => layer.id === migrated.activeMaskLayerId);
    expect(migratedMask?.kind === 'mask' ? migratedMask.noiseLevel : -1).toBe(0.35);
    expect(migratedMask?.kind === 'mask' ? migratedMask.denoiseLimit : -1).toBe(0.72);
  });

  test('persists independent mask overlay colors and fill patterns without changing mask data', () => {
    const document = createDocument();
    const originalMask = document.layers.find((layer) => layer.id === document.activeMaskLayerId);
    expect(originalMask).toMatchObject({ kind: 'mask', overlayColor: '#ff304c', overlayStyle: 'solid' });
    const updated = umbraCanvasDocumentReducer(document, {
      type: 'update_mask_overlay',
      layerId: document.activeMaskLayerId,
      changes: { overlayColor: '#12ABEF', overlayStyle: 'crosshatch' },
    })!;
    const updatedMask = updated.layers.find((layer) => layer.id === updated.activeMaskLayerId);
    expect(updatedMask).toMatchObject({
      kind: 'mask',
      dataUrl: originalMask?.kind === 'mask' ? originalMask.dataUrl : '',
      overlayColor: '#12abef',
      overlayStyle: 'crosshatch',
    });
    expect(validateUmbraCanvasDocument(updated)).toEqual([]);
  });

  test('migrates legacy mask overlays to purpose-specific defaults', () => {
    const document = createDocument();
    const withRegion = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:regional-mask',
      name: 'Subject',
    })!;
    const legacy = structuredClone(withRegion) as any;
    legacy.version = 13;
    for (const layer of legacy.layers) {
      if (layer.kind !== 'mask') continue;
      delete layer.overlayColor;
      delete layer.overlayStyle;
    }
    const migrated = migrateUmbraCanvasDocument(legacy);
    const inpaintMask = migrated.layers.find((layer) => layer.id === migrated.activeMaskLayerId);
    const regionalMask = migrated.layers.find((layer) => layer.kind === 'mask' && layer.purpose === 'regional_guidance');
    expect(inpaintMask).toMatchObject({ overlayColor: '#ff304c', overlayStyle: 'solid' });
    expect(regionalMask).toMatchObject({ overlayColor: '#a855f7', overlayStyle: 'solid' });
    expect(migrated.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(validateUmbraCanvasDocument(migrated)).toEqual([]);
  });

  test('canvas expansion translates existing content and preserves the active mask bounds', () => {
    const document = createDocument();
    const resized = umbraCanvasDocumentReducer(document, {
      type: 'resize_canvas',
      width: 1280,
      height: 960,
      translateX: 128,
      translateY: 96,
    })!;
    const source = resized.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const mask = resized.layers.find((layer) => layer.id === resized.activeMaskLayerId);
    expect(source?.transform).toMatchObject({ x: 128, y: 96 });
    expect(mask?.transform).toMatchObject({ x: 0, y: 0, width: 1280, height: 960 });
  });

  test('crops a canvas by translating content and clearing the generation region', () => {
    const document = umbraCanvasDocumentReducer(createDocument(), {
      type: 'set_generation_region',
      region: { x: 128, y: 96, width: 512, height: 384 },
    })!;
    const cropped = umbraCanvasDocumentReducer(document, {
      type: 'resize_canvas',
      width: 512,
      height: 384,
      translateX: -128,
      translateY: -96,
      clearGenerationRegion: true,
    })!;
    const source = cropped.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    expect(cropped).toMatchObject({ width: 512, height: 384, generationRegion: null });
    expect(source?.transform).toMatchObject({ x: -128, y: -96 });
  });

  test('resamples a centered crop while preserving layered geometry and resetting the generation region', () => {
    const document = umbraCanvasDocumentReducer(createDocument(), {
      type: 'set_generation_region',
      region: { x: 128, y: 96, width: 512, height: 384 },
    })!;
    const imported = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Imported',
      asset: createUmbraCanvasImageAsset({
        name: 'imported.png',
        path: '',
        imageUrl: 'blob:imported-resample',
        width: 256,
        height: 256,
      }),
    })!;
    const positioned = umbraCanvasDocumentReducer(imported, {
      type: 'set_layer_transform',
      layerId: imported.activeLayerId,
      transform: { x: 256, y: 128, width: 256, height: 256 },
    })!;
    const resized = umbraCanvasDocumentReducer(positioned, {
      type: 'resample_canvas',
      width: 512,
      height: 512,
      sourceRect: { x: 128, y: 0, width: 768, height: 768 },
    })!;
    const source = resized.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const mask = resized.layers.find((layer) => layer.id === resized.activeMaskLayerId);
    const overlay = resized.layers.find((layer) => layer.id === positioned.activeLayerId);
    expect(resized).toMatchObject({ width: 512, height: 512, generationRegion: null, generationRegionAspectRatio: 0 });
    expect(source?.transform).toMatchObject({ x: -85.33333333333333, y: 0, width: 682.6666666666666, height: 512 });
    expect(mask?.transform).toMatchObject({ x: 0, y: 0, width: 512, height: 512 });
    expect(overlay?.transform).toMatchObject({
      x: 85.33333333333333,
      y: 85.33333333333333,
      width: 170.66666666666666,
      height: 170.66666666666666,
    });
    expect(validateUmbraCanvasDocument(resized)).toEqual([]);
  });

  test('adds and transforms independent raster layers', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Extracted pixels',
      asset: createUmbraCanvasImageAsset({
        name: 'extract.png',
        path: '',
        imageUrl: 'blob:extract',
        width: 512,
        height: 384,
      }),
    })!;
    const layerId = added.activeLayerId;
    const transformed = umbraCanvasDocumentReducer(added, {
      type: 'set_layer_transform',
      layerId,
      transform: { x: 24, y: 48, width: 640, height: 480, rotation: 15, scaleX: -1 },
    })!;
    const blended = umbraCanvasDocumentReducer(transformed, {
      type: 'set_layer_blend_mode',
      layerId,
      blendMode: 'overlay',
    })!;
    const smoothed = umbraCanvasDocumentReducer(blended, { type: 'set_raster_smoothing', layerId, smoothing: 'none' })!;
    const layer = smoothed.layers.find((candidate) => candidate.id === layerId);
    expect(layer?.transform).toMatchObject({ x: 24, y: 48, width: 640, height: 480, rotation: 15, scaleX: -1 });
    expect(layer?.blendMode).toBe('overlay');
    expect(layer?.kind === 'raster' ? layer.smoothing : '').toBe('none');
    expect(validateUmbraCanvasDocument(smoothed)).toEqual([]);
  });

  test('resets compatible layer transforms to intrinsic geometry while preserving their center', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Imported',
      asset: createUmbraCanvasImageAsset({
        name: 'imported.png',
        path: '',
        imageUrl: 'blob:imported',
        width: 512,
        height: 384,
      }),
    })!;
    const transformed = umbraCanvasDocumentReducer(added, {
      type: 'set_layer_transform',
      layerId: added.activeLayerId,
      transform: { x: 24, y: 48, width: 640, height: 480, rotation: 15, scaleX: -1, scaleY: 2 },
    })!;
    const reset = umbraCanvasDocumentReducer(transformed, {
      type: 'reset_layer_transform',
      layerId: transformed.activeLayerId,
    })!;
    expect(reset.revision).toBe(transformed.revision + 1);
    expect(reset.layers.find((layer) => layer.id === reset.activeLayerId)?.transform).toEqual({
      x: 88,
      y: 96,
      width: 512,
      height: 384,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    });
    expect(umbraCanvasDocumentReducer(reset, { type: 'reset_layer_transform', layerId: reset.activeLayerId })).toBe(reset);
  });

  test('refuses to reset source and locked layer transforms', () => {
    const document = createDocument();
    expect(umbraCanvasDocumentReducer(document, {
      type: 'reset_layer_transform',
      layerId: document.layers[0].id,
    })).toBe(document);

    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_text_layer',
      text: 'Locked title',
      transform: { x: 10, y: 20, width: 300, height: 100, rotation: 25 },
    })!;
    const locked = umbraCanvasDocumentReducer(added, { type: 'toggle_layer_lock', layerId: added.activeLayerId })!;
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'reset_layer_transform',
      layerId: locked.activeLayerId,
    })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'set_layer_transform',
      layerId: locked.activeLayerId,
      transform: { x: 250 },
    })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'update_text_layer',
      layerId: locked.activeLayerId,
      changes: { text: 'Changed while locked' },
    })).toBe(locked);
  });

  test('attaches, edits, and detaches an independent raster layer mask', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Imported',
      asset: createUmbraCanvasImageAsset({ name: 'imported.png', path: '', imageUrl: 'blob:imported', width: 512, height: 384 }),
    })!;
    const rasterId = added.activeLayerId;
    const masked = umbraCanvasDocumentReducer(added, {
      type: 'add_layer_mask',
      rasterLayerId: rasterId,
      dataUrl: 'blob:reveal-all-mask',
    })!;
    const raster = masked.layers.find((layer) => layer.id === rasterId);
    const mask = masked.layers.find((layer) => layer.id === (raster?.kind === 'raster' ? raster.maskLayerId : ''));
    expect(mask).toMatchObject({ kind: 'mask', purpose: 'layer', frozen: false, dataUrl: 'blob:reveal-all-mask' });
    const edited = umbraCanvasDocumentReducer(masked, { type: 'set_mask_layer_snapshot', layerId: mask!.id, dataUrl: 'blob:edited-mask' })!;
    expect(edited.layers.find((layer) => layer.id === mask!.id)).toMatchObject({ dataUrl: 'blob:edited-mask' });
    const detached = umbraCanvasDocumentReducer(edited, { type: 'detach_layer_mask', rasterLayerId: rasterId })!;
    expect(detached.layers.some((layer) => layer.id === mask!.id)).toBe(false);
    expect(detached.layers.find((layer) => layer.id === rasterId)).toMatchObject({ maskLayerId: undefined });
    expect(validateUmbraCanvasDocument(detached)).toEqual([]);
  });

  test('duplicates private raster masks instead of sharing their state', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Paint',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: 'blob:paint', width: 1024, height: 768 }),
    })!;
    const rasterId = added.activeLayerId;
    const masked = umbraCanvasDocumentReducer(added, { type: 'add_layer_mask', rasterLayerId: rasterId, dataUrl: 'blob:mask' })!;
    const duplicated = umbraCanvasDocumentReducer(masked, { type: 'duplicate_layer', layerId: rasterId })!;
    const original = duplicated.layers.find((layer) => layer.id === rasterId);
    const copy = duplicated.layers.find((layer) => layer.id === duplicated.activeLayerId);
    expect(copy).toMatchObject({ kind: 'raster', name: 'Paint Copy' });
    expect(copy?.kind === 'raster' ? copy.maskLayerId : '').not.toBe(original?.kind === 'raster' ? original.maskLayerId : '');
    expect(duplicated.layers.find((layer) => layer.id === (copy?.kind === 'raster' ? copy.maskLayerId : ''))).toMatchObject({ kind: 'mask', dataUrl: 'blob:mask' });
    const sourceDuplicate = umbraCanvasDocumentReducer(duplicated, { type: 'duplicate_layer', layerId: document.layers[0].id })!;
    expect(sourceDuplicate).toBe(duplicated);
    expect(validateUmbraCanvasDocument(duplicated)).toEqual([]);
  });

  test('merges a visual layer down while preserving the immutable source', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Paint',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: 'blob:paint', width: 1024, height: 768 }),
    })!;
    const merged = umbraCanvasDocumentReducer(added, {
      type: 'merge_down',
      upperLayerId: added.activeLayerId,
      lowerLayerId: document.layers[0].id,
      name: 'Merged Paint',
      asset: createUmbraCanvasImageAsset({ name: 'merged.png', path: '', imageUrl: 'blob:merged', width: 1024, height: 768 }),
    })!;
    const source = merged.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const result = merged.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    expect(source).toMatchObject({ id: document.layers[0].id, visible: false, locked: true });
    expect(result).toMatchObject({ name: 'Merged Paint', asset: { imageUrl: 'blob:merged' } });
    expect(merged.layers.some((layer) => layer.id === added.activeLayerId)).toBe(false);
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('creates a populated editable mask from converted visual content', () => {
    const document = createDocument();
    const withMask = umbraCanvasDocumentReducer(document, {
      type: 'add_inpaint_mask',
      name: 'Converted Mask',
      dataUrl: 'blob:converted-mask',
    })!;
    const mask = withMask.layers.find((layer) => layer.id === withMask.activeMaskLayerId);
    expect(mask).toMatchObject({ kind: 'mask', name: 'Converted Mask', dataUrl: 'blob:converted-mask', frozen: false });
  });

  test('converts a masked raster into a raw control atomically while preserving its public stack position', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Pose Paint',
      asset: createUmbraCanvasImageAsset({ name: 'pose.png', path: '', imageUrl: 'blob:pose', width: 512, height: 384 }),
      transform: { x: 120, y: 80, width: 512, height: 384 },
    })!;
    const rasterId = added.activeLayerId;
    const masked = umbraCanvasDocumentReducer(added, {
      type: 'add_layer_mask',
      rasterLayerId: rasterId,
      dataUrl: 'blob:private-mask',
    })!;
    const raster = masked.layers.find((layer) => layer.id === rasterId);
    const privateMaskId = raster?.kind === 'raster' ? raster.maskLayerId : '';
    const publicOrder = masked.layers.filter((layer) => layer.id !== privateMaskId).map((layer) => layer.id);
    const renderedAsset = createUmbraCanvasImageAsset({ name: 'pose-rendered.png', path: '', imageUrl: 'blob:pose-rendered', width: 1024, height: 768 });
    const converted = umbraCanvasDocumentReducer(masked, {
      type: 'convert_raster_to_control',
      layerId: rasterId,
      asset: renderedAsset,
      modelName: 'pose-control.safetensors',
    })!;
    expect(converted.layers.map((layer) => layer.id)).toEqual(publicOrder);
    expect(converted.layers.some((layer) => layer.id === privateMaskId)).toBe(false);
    expect(converted.layers.find((layer) => layer.id === rasterId)).toMatchObject({
      kind: 'control',
      controlType: 'raw',
      modelName: 'pose-control.safetensors',
      asset: { imageUrl: 'blob:pose-rendered' },
      transform: { x: 0, y: 0, width: 1024, height: 768 },
    });
    expect(validateUmbraCanvasDocument(converted)).toEqual([]);
  });

  test('converts a control into an imported raster while preserving its image transform and identity', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      name: 'Depth Control',
      controlType: 'depth',
      transform: { x: 64, y: 48, width: 640, height: 480, rotation: 12 },
      asset: createUmbraCanvasImageAsset({ name: 'depth.png', path: '', imageUrl: 'blob:depth', width: 640, height: 480 }),
    })!;
    const controlId = added.activeLayerId;
    const originalIndex = added.layers.findIndex((layer) => layer.id === controlId);
    const converted = umbraCanvasDocumentReducer(added, { type: 'convert_control_to_raster', layerId: controlId })!;
    expect(converted.layers.findIndex((layer) => layer.id === controlId)).toBe(originalIndex);
    expect(converted.layers.find((layer) => layer.id === controlId)).toMatchObject({
      kind: 'raster',
      role: 'imported',
      asset: { imageUrl: 'blob:depth' },
      transform: { x: 64, y: 48, width: 640, height: 480, rotation: 12 },
    });
    expect(validateUmbraCanvasDocument(converted)).toEqual([]);
  });

  test('replaces visual layers with editable masks or regional guidance without leaving private masks behind', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      name: 'Silhouette',
      asset: createUmbraCanvasImageAsset({ name: 'silhouette.png', path: '', imageUrl: 'blob:silhouette', width: 1024, height: 768 }),
    })!;
    const rasterId = added.activeLayerId;
    const masked = umbraCanvasDocumentReducer(added, { type: 'add_layer_mask', rasterLayerId: rasterId, dataUrl: 'blob:old-private-mask' })!;
    const raster = masked.layers.find((layer) => layer.id === rasterId);
    const oldPrivateMaskId = raster?.kind === 'raster' ? raster.maskLayerId : '';
    const convertedMask = umbraCanvasDocumentReducer(masked, {
      type: 'convert_layer_to_inpaint_mask',
      layerId: rasterId,
      dataUrl: 'blob:converted-mask',
    })!;
    expect(convertedMask.activeLayerId).toBe(rasterId);
    expect(convertedMask.activeMaskLayerId).toBe(rasterId);
    expect(convertedMask.layers.some((layer) => layer.id === oldPrivateMaskId)).toBe(false);
    expect(convertedMask.layers.find((layer) => layer.id === rasterId)).toMatchObject({
      kind: 'mask',
      purpose: 'inpaint',
      frozen: false,
      dataUrl: 'blob:converted-mask',
    });

    const withGradient = umbraCanvasDocumentReducer(convertedMask, { type: 'add_gradient_layer', name: 'Lighting Shape' })!;
    const gradientId = withGradient.activeLayerId;
    const convertedRegion = umbraCanvasDocumentReducer(withGradient, {
      type: 'convert_layer_to_regional_guidance',
      layerId: gradientId,
      dataUrl: 'blob:regional-shape',
    })!;
    const region = convertedRegion.layers.find((layer) => layer.id === gradientId);
    expect(region).toMatchObject({ kind: 'regional_guidance', enabled: true });
    expect(convertedRegion.layers.find((layer) => layer.id === (region?.kind === 'regional_guidance' ? region.maskLayerId : ''))).toMatchObject({
      kind: 'mask',
      purpose: 'regional_guidance',
      frozen: true,
      dataUrl: 'blob:regional-shape',
    });
    expect(validateUmbraCanvasDocument(convertedRegion)).toEqual([]);
  });

  test('converts the last editable mask to a region and creates a replacement active mask', () => {
    const document = createDocument();
    const originalMask = document.layers.find((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint');
    const populated = umbraCanvasDocumentReducer(document, {
      type: 'set_mask_layer_snapshot',
      layerId: originalMask!.id,
      dataUrl: 'blob:face-mask',
    })!;
    const converted = umbraCanvasDocumentReducer(populated, {
      type: 'convert_inpaint_mask_to_regional_guidance',
      layerId: originalMask!.id,
      name: 'Face',
    })!;
    const region = converted.layers.find((layer) => layer.id === originalMask!.id);
    expect(region).toMatchObject({ kind: 'regional_guidance', name: 'Face' });
    expect(converted.activeLayerId).toBe(originalMask!.id);
    expect(converted.activeMaskLayerId).not.toBe(originalMask!.id);
    expect(converted.layers.find((layer) => layer.id === converted.activeMaskLayerId)).toMatchObject({
      kind: 'mask',
      purpose: 'inpaint',
      frozen: false,
      dataUrl: '',
    });
    expect(converted.layers.find((layer) => layer.id === (region?.kind === 'regional_guidance' ? region.maskLayerId : ''))).toMatchObject({
      dataUrl: 'blob:face-mask',
      purpose: 'regional_guidance',
    });
    expect(validateUmbraCanvasDocument(converted)).toEqual([]);
  });

  test('converts regional guidance back to an editable mask and detaches linked references', () => {
    const document = createDocument();
    const withRegion = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:region-mask',
      name: 'Subject',
    })!;
    const region = withRegion.layers.find((layer) => layer.kind === 'regional_guidance');
    const withReference = umbraCanvasDocumentReducer(withRegion, {
      type: 'add_reference_layer',
      method: 'ip_adapter',
      asset: createUmbraCanvasImageAsset({ name: 'reference.png', path: '', imageUrl: 'blob:reference', width: 512, height: 512 }),
    })!;
    const referenceId = withReference.activeLayerId;
    const linked = umbraCanvasDocumentReducer(withReference, {
      type: 'link_reference_region',
      layerId: referenceId,
      regionLayerId: region!.id,
    })!;
    const converted = umbraCanvasDocumentReducer(linked, {
      type: 'convert_regional_guidance_to_inpaint_mask',
      layerId: region!.id,
    })!;
    expect(converted.layers.find((layer) => layer.id === region!.id)).toMatchObject({
      kind: 'mask',
      purpose: 'inpaint',
      dataUrl: 'blob:region-mask',
      frozen: false,
    });
    expect(converted.layers.some((layer) => layer.id === region!.maskLayerId)).toBe(false);
    expect(converted.layers.find((layer) => layer.id === referenceId)).toMatchObject({ regionLayerId: undefined });
    expect(converted.activeMaskLayerId).toBe(region!.id);
    expect(validateUmbraCanvasDocument(converted)).toEqual([]);
  });

  test('creates regional guidance with a private mask and removes both atomically', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:regional-mask',
      name: 'Face region',
      positivePrompt: 'detailed eyes',
      autoNegative: true,
    })!;
    const region = added.layers.find((layer) => layer.kind === 'regional_guidance');
    expect(region?.kind).toBe('regional_guidance');
    expect(region?.positivePrompt).toBe('detailed eyes');
    expect(region?.autoNegative).toBe(true);
    expect(added.layers.find((layer) => layer.id === region?.maskLayerId)).toMatchObject({
      kind: 'mask',
      purpose: 'regional_guidance',
    });
    const updated = umbraCanvasDocumentReducer(added, {
      type: 'update_regional_guidance',
      layerId: region!.id,
      changes: { autoNegative: false, weight: 1.5, beginStepPercent: 0.2, endStepPercent: 0.8 },
    })!;
    expect(updated.layers.find((layer) => layer.id === region?.id)).toMatchObject({
      weight: 1.5,
      autoNegative: false,
      beginStepPercent: 0.2,
      endStepPercent: 0.8,
    });
    const unlockedMask = umbraCanvasDocumentReducer(updated, { type: 'toggle_layer_lock', layerId: region!.maskLayerId })!;
    const replacedMask = umbraCanvasDocumentReducer(unlockedMask, { type: 'set_mask_layer_snapshot', layerId: region!.maskLayerId, dataUrl: 'blob:replacement-mask' })!;
    expect(replacedMask.layers.find((layer) => layer.id === region!.maskLayerId)).toMatchObject({ dataUrl: 'blob:replacement-mask' });
    const removed = umbraCanvasDocumentReducer(replacedMask, { type: 'remove_layer', layerId: region!.id })!;
    expect(removed.layers.some((layer) => layer.id === region?.id)).toBe(false);
    expect(removed.layers.some((layer) => layer.id === region?.maskLayerId)).toBe(false);
    expect(validateUmbraCanvasDocument(removed)).toEqual([]);
  });

  test('keeps regional guidance and its private mask transforms synchronized', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:regional-mask',
      name: 'Subject',
    })!;
    const region = added.layers.find((layer) => layer.kind === 'regional_guidance');
    const transformed = umbraCanvasDocumentReducer(added, {
      type: 'set_layer_transform',
      layerId: region!.id,
      transform: { x: 80, y: 40, width: 640, height: 512, rotation: 8 },
    })!;
    expect(transformed.layers.find((layer) => layer.id === region!.id)?.transform).toMatchObject({ x: 80, y: 40, width: 640, height: 512, rotation: 8 });
    expect(transformed.layers.find((layer) => layer.id === region!.maskLayerId)?.transform).toMatchObject({ x: 80, y: 40, width: 640, height: 512, rotation: 8 });
    const moved = umbraCanvasDocumentReducer(transformed, {
      type: 'set_layers_transforms',
      transforms: [{ layerId: region!.id, transform: { x: 160, y: 96 } }],
    })!;
    expect(moved.layers.find((layer) => layer.id === region!.id)?.transform).toMatchObject({ x: 160, y: 96 });
    expect(moved.layers.find((layer) => layer.id === region!.maskLayerId)?.transform).toMatchObject({ x: 160, y: 96 });
    expect(validateUmbraCanvasDocument(moved)).toEqual([]);
  });

  test('merges editable masks down into one active mask', () => {
    const document = createDocument();
    const firstMaskId = document.activeMaskLayerId;
    const withSecond = umbraCanvasDocumentReducer(document, { type: 'add_inpaint_mask', name: 'Second Mask', dataUrl: 'blob:second' })!;
    const merged = umbraCanvasDocumentReducer(withSecond, {
      type: 'merge_inpaint_masks_down',
      upperLayerId: withSecond.activeMaskLayerId,
      lowerLayerId: firstMaskId,
      dataUrl: 'blob:merged-mask',
    })!;
    const masks = merged.layers.filter((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen);
    expect(masks).toHaveLength(1);
    expect(masks[0]).toMatchObject({ dataUrl: 'blob:merged-mask', enabled: true, frozen: false });
    expect(merged.activeMaskLayerId).toBe(masks[0]!.id);
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('merges every visible editable mask of the active type in one edit', () => {
    const document = createDocument();
    const withSecond = umbraCanvasDocumentReducer(document, { type: 'add_inpaint_mask', name: 'Second Mask', dataUrl: 'blob:second' })!;
    const withThird = umbraCanvasDocumentReducer(withSecond, { type: 'add_inpaint_mask', name: 'Third Mask', dataUrl: 'blob:third' })!;
    const maskIds = withThird.layers
      .filter((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen)
      .map((layer) => layer.id);
    const merged = umbraCanvasDocumentReducer(withThird, {
      type: 'merge_visible_inpaint_masks',
      layerIds: maskIds,
      dataUrl: 'blob:merged-visible-masks',
    })!;
    const masks = merged.layers.filter((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen);
    expect(masks).toHaveLength(1);
    expect(masks[0]).toMatchObject({ dataUrl: 'blob:merged-visible-masks', enabled: true, frozen: false });
    expect(merged.activeLayerId).toBe(masks[0]!.id);
    expect(merged.activeMaskLayerId).toBe(masks[0]!.id);
    expect(merged.revision).toBe(withThird.revision + 1);
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('merges regional guidance down and remaps linked reference regions', () => {
    const document = createDocument();
    const first = umbraCanvasDocumentReducer(document, { type: 'add_regional_guidance', name: 'Lower Region', dataUrl: 'blob:lower-region' })!;
    const lower = first.layers.find((layer) => layer.kind === 'regional_guidance');
    const second = umbraCanvasDocumentReducer(first, { type: 'add_regional_guidance', name: 'Upper Region', dataUrl: 'blob:upper-region' })!;
    const upper = second.layers.filter((layer) => layer.kind === 'regional_guidance').at(-1);
    const withReference = umbraCanvasDocumentReducer(second, {
      type: 'add_reference_layer',
      method: 'ip_adapter',
      asset: createUmbraCanvasImageAsset({ name: 'reference.png', path: '', imageUrl: 'blob:reference', width: 512, height: 512 }),
    })!;
    const referenceId = withReference.activeLayerId;
    const linked = umbraCanvasDocumentReducer(withReference, { type: 'link_reference_region', layerId: referenceId, regionLayerId: lower!.id })!;
    const merged = umbraCanvasDocumentReducer(linked, {
      type: 'merge_regional_guidance_down',
      upperLayerId: upper!.id,
      lowerLayerId: lower!.id,
      dataUrl: 'blob:merged-region',
    })!;
    const regions = merged.layers.filter((layer) => layer.kind === 'regional_guidance');
    expect(regions).toHaveLength(1);
    expect(merged.layers.find((layer) => layer.id === regions[0]!.maskLayerId)).toMatchObject({ dataUrl: 'blob:merged-region', purpose: 'regional_guidance' });
    expect(merged.layers.find((layer) => layer.id === referenceId)).toMatchObject({ regionLayerId: regions[0]!.id });
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('merges visible regional guidance and remaps every linked reference', () => {
    const document = createDocument();
    const first = umbraCanvasDocumentReducer(document, { type: 'add_regional_guidance', name: 'First Region', dataUrl: 'blob:first-region' })!;
    const second = umbraCanvasDocumentReducer(first, { type: 'add_regional_guidance', name: 'Second Region', dataUrl: 'blob:second-region' })!;
    const third = umbraCanvasDocumentReducer(second, { type: 'add_regional_guidance', name: 'Third Region', dataUrl: 'blob:third-region' })!;
    const regionIds = third.layers.filter((layer) => layer.kind === 'regional_guidance').map((layer) => layer.id);
    const withReference = umbraCanvasDocumentReducer(third, {
      type: 'add_reference_layer',
      method: 'ip_adapter',
      asset: createUmbraCanvasImageAsset({ name: 'reference.png', path: '', imageUrl: 'blob:reference', width: 512, height: 512 }),
    })!;
    const referenceId = withReference.activeLayerId;
    const linked = umbraCanvasDocumentReducer(withReference, {
      type: 'link_reference_region',
      layerId: referenceId,
      regionLayerId: regionIds[1]!,
    })!;
    const merged = umbraCanvasDocumentReducer(linked, {
      type: 'merge_visible_regional_guidance',
      layerIds: regionIds,
      dataUrl: 'blob:merged-visible-regions',
    })!;
    const regions = merged.layers.filter((layer) => layer.kind === 'regional_guidance');
    expect(regions).toHaveLength(1);
    expect(merged.layers.find((layer) => layer.id === regions[0]!.maskLayerId)).toMatchObject({
      dataUrl: 'blob:merged-visible-regions',
      purpose: 'regional_guidance',
      frozen: true,
    });
    expect(merged.layers.find((layer) => layer.id === referenceId)).toMatchObject({ regionLayerId: regions[0]!.id });
    expect(merged.revision).toBe(linked.revision + 1);
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('adds a configurable control layer without changing raster composition', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      name: 'Pose guide',
      modelName: 'control-pose.safetensors',
      controlType: 'pose',
      enabled: true,
      transform: { x: 128, y: 96, width: 512, height: 384 },
      asset: createUmbraCanvasImageAsset({
        name: 'pose-source.png',
        path: '',
        imageUrl: 'blob:pose-source',
        width: 1024,
        height: 768,
      }),
    })!;
    const control = added.layers.find((layer) => layer.kind === 'control');
    expect(control).toMatchObject({
      name: 'Pose guide',
      adapterType: 'controlnet',
      controlMode: 'balanced',
      modelName: 'control-pose.safetensors',
      controlType: 'pose',
      lightnessToAlpha: true,
      weight: 1,
      maxFaces: 10,
      minimumConfidence: 0.5,
      scoreThreshold: 0.1,
      distanceThreshold: 0.1,
      normalStrength: Math.PI * 2,
      backgroundThreshold: 0.1,
      safeMode: true,
      processorSeed: 0,
      transform: { x: 128, y: 96, width: 512, height: 384 },
    });
    const updated = umbraCanvasDocumentReducer(added, {
      type: 'update_control_layer',
      layerId: control!.id,
      changes: {
        weight: 0.65,
        beginStepPercent: 0.1,
        endStepPercent: 0.7,
        detectFace: false,
        maxFaces: 99,
        minimumConfidence: 0,
        scoreThreshold: 4,
        distanceThreshold: 99,
        normalStrength: 99,
        backgroundThreshold: -1,
        safeMode: false,
        processorSeed: -50,
        lightnessToAlpha: false,
      },
    })!;
    expect(updated.layers.find((layer) => layer.id === control!.id)).toMatchObject({
      weight: 0.65,
      beginStepPercent: 0.1,
      endStepPercent: 0.7,
      detectFace: false,
      maxFaces: 50,
      minimumConfidence: 0.1,
      scoreThreshold: 2,
      distanceThreshold: 20,
      normalStrength: Math.PI * 5,
      backgroundThreshold: 0,
      safeMode: false,
      processorSeed: 0,
      lightnessToAlpha: false,
    });
    const baked = umbraCanvasDocumentReducer(updated, {
      type: 'bake_control_preprocessor',
      layerId: control!.id,
      name: 'Pose guide (baked)',
      asset: createUmbraCanvasImageAsset({
        name: 'pose-baked.png',
        path: '',
        imageUrl: 'blob:pose-baked',
        width: 512,
        height: 512,
      }),
    })!;
    expect(baked.layers.find((layer) => layer.id === control!.id)).toMatchObject({
      name: 'Pose guide (baked)',
      controlType: 'raw',
      asset: { imageUrl: 'blob:pose-baked' },
      transform: { x: 128, y: 96, width: 512, height: 384 },
    });
    expect(validateUmbraCanvasDocument(baked)).toEqual([]);

    const incompatibleShuffle = umbraCanvasDocumentReducer(added, {
      type: 'update_control_layer',
      layerId: control!.id,
      changes: { controlType: 'content_shuffle', adapterType: 'controlnet' },
    })!;
    expect(validateUmbraCanvasDocument(incompatibleShuffle)).toContain('Content Shuffle requires a T2I Adapter on Pose guide');
    const compatibleShuffle = umbraCanvasDocumentReducer(incompatibleShuffle, {
      type: 'update_control_layer',
      layerId: control!.id,
      changes: { adapterType: 't2i_adapter', processorSeed: 42 },
    })!;
    expect(validateUmbraCanvasDocument(compatibleShuffle)).toEqual([]);
    expect(compatibleShuffle.layers.find((layer) => layer.id === control!.id)).toMatchObject({
      controlType: 'content_shuffle',
      adapterType: 't2i_adapter',
      processorSeed: 42,
    });
    const hidden = umbraCanvasDocumentReducer(baked, { type: 'toggle_layer', layerId: control!.id })!;
    expect(hidden.layers.find((layer) => layer.id === control!.id)).toMatchObject({ visible: false, enabled: true });
    const disabled = umbraCanvasDocumentReducer(hidden, { type: 'toggle_layer_enabled', layerId: control!.id })!;
    expect(disabled.layers.find((layer) => layer.id === control!.id)).toMatchObject({ visible: false, enabled: false });
  });

  test('migrates legacy control overlays with the lightness transparency effect enabled', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      asset: createUmbraCanvasImageAsset({ name: 'edges.png', path: '', imageUrl: 'blob:edges', width: 512, height: 512 }),
    })!;
    const legacy = structuredClone(added) as any;
    legacy.version = 16;
    const control = legacy.layers.find((layer: any) => layer.kind === 'control');
    delete control.lightnessToAlpha;
    const migrated = migrateUmbraCanvasDocument(legacy);
    expect(migrated.layers.find((layer) => layer.id === control.id)).toMatchObject({ lightnessToAlpha: true });
  });

  test('applies filters to controls without losing guidance settings and prevents preprocessor double-runs', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      controlType: 'pose',
      modelName: 'pose-control.safetensors',
      transform: { x: 40, y: 60, width: 512, height: 512 },
      asset: createUmbraCanvasImageAsset({ name: 'pose.png', path: '', imageUrl: 'blob:pose', width: 512, height: 512 }),
    })!;
    const controlId = added.activeLayerId;
    const locallyFiltered = umbraCanvasDocumentReducer(added, {
      type: 'apply_control_filter',
      layerId: controlId,
      name: 'Pose Inverted',
      asset: createUmbraCanvasImageAsset({ name: 'pose-inverted.png', path: '', imageUrl: 'blob:pose-inverted', width: 512, height: 512 }),
      transform: { x: 32, y: 52, width: 528, height: 528, rotation: 0, scaleX: 1, scaleY: 1 },
    })!;
    expect(locallyFiltered.layers.find((layer) => layer.id === controlId)).toMatchObject({
      kind: 'control',
      name: 'Pose Inverted',
      controlType: 'pose',
      modelName: 'pose-control.safetensors',
      asset: { imageUrl: 'blob:pose-inverted' },
      transform: { x: 32, y: 52, width: 528, height: 528 },
    });
    const modelFiltered = umbraCanvasDocumentReducer(locallyFiltered, {
      type: 'apply_control_filter',
      layerId: controlId,
      asset: createUmbraCanvasImageAsset({ name: 'pose-baked.png', path: '', imageUrl: 'blob:pose-baked', width: 512, height: 512 }),
      transform: locallyFiltered.layers.find((layer) => layer.id === controlId)!.transform,
      resetPreprocessor: true,
    })!;
    expect(modelFiltered.layers.find((layer) => layer.id === controlId)).toMatchObject({
      kind: 'control',
      controlType: 'raw',
      modelName: 'pose-control.safetensors',
      asset: { imageUrl: 'blob:pose-baked' },
    });
    expect(validateUmbraCanvasDocument(modelFiltered)).toEqual([]);
  });

  test('merges control layers down into one raw provider-compatible control', () => {
    const document = createDocument();
    const lowerDocument = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      name: 'Lower Control',
      modelName: 'control.safetensors',
      controlType: 'canny',
      asset: createUmbraCanvasImageAsset({ name: 'lower.png', path: '', imageUrl: 'blob:lower', width: 512, height: 512 }),
    })!;
    const lowerId = lowerDocument.activeLayerId;
    const upperDocument = umbraCanvasDocumentReducer(lowerDocument, {
      type: 'add_control_layer',
      name: 'Upper Control',
      modelName: 'control.safetensors',
      controlType: 'depth',
      asset: createUmbraCanvasImageAsset({ name: 'upper.png', path: '', imageUrl: 'blob:upper', width: 512, height: 512 }),
    })!;
    const merged = umbraCanvasDocumentReducer(upperDocument, {
      type: 'merge_control_down',
      upperLayerId: upperDocument.activeLayerId,
      lowerLayerId: lowerId,
      asset: createUmbraCanvasImageAsset({ name: 'merged.png', path: '', imageUrl: 'blob:merged', width: 1024, height: 768 }),
    })!;
    const controls = merged.layers.filter((layer) => layer.kind === 'control');
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({
      controlType: 'raw',
      modelName: 'control.safetensors',
      asset: { imageUrl: 'blob:merged' },
      transform: { x: 0, y: 0, width: 1024, height: 768 },
    });
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('merges every visible control into one raw control while preserving top settings', () => {
    const document = createDocument();
    const first = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      name: 'First Control',
      modelName: 'control.safetensors',
      controlType: 'canny',
      asset: createUmbraCanvasImageAsset({ name: 'first.png', path: '', imageUrl: 'blob:first', width: 512, height: 512 }),
    })!;
    const second = umbraCanvasDocumentReducer(first, {
      type: 'add_control_layer',
      name: 'Second Control',
      modelName: 'control.safetensors',
      controlType: 'depth',
      asset: createUmbraCanvasImageAsset({ name: 'second.png', path: '', imageUrl: 'blob:second', width: 512, height: 512 }),
    })!;
    const third = umbraCanvasDocumentReducer(second, {
      type: 'add_control_layer',
      name: 'Third Control',
      modelName: 'top-control.safetensors',
      controlType: 'pose',
      asset: createUmbraCanvasImageAsset({ name: 'third.png', path: '', imageUrl: 'blob:third', width: 512, height: 512 }),
    })!;
    const configured = umbraCanvasDocumentReducer(third, {
      type: 'update_control_layer',
      layerId: third.activeLayerId,
      changes: { weight: 0.63, beginStepPercent: 0.2, endStepPercent: 0.9 },
    })!;
    const withUnrelated = umbraCanvasDocumentReducer(configured, { type: 'add_text_layer', name: 'Keep Me', text: 'unrelated' })!;
    const unrelatedId = withUnrelated.activeLayerId;
    const controlIds = withUnrelated.layers.filter((layer) => layer.kind === 'control').map((layer) => layer.id);
    const merged = umbraCanvasDocumentReducer(withUnrelated, {
      type: 'merge_visible_controls',
      layerIds: [...controlIds, unrelatedId],
      asset: createUmbraCanvasImageAsset({ name: 'merged.png', path: '', imageUrl: 'blob:merged-visible-controls', width: 1024, height: 768 }),
    })!;
    const controls = merged.layers.filter((layer) => layer.kind === 'control');
    expect(controls).toHaveLength(1);
    expect(controls[0]).toMatchObject({
      controlType: 'raw',
      modelName: 'top-control.safetensors',
      weight: 0.63,
      beginStepPercent: 0.2,
      endStepPercent: 0.9,
      asset: { imageUrl: 'blob:merged-visible-controls' },
      transform: { x: 0, y: 0, width: 1024, height: 768 },
    });
    expect(merged.layers.find((layer) => layer.id === unrelatedId)).toMatchObject({ kind: 'text', text: 'unrelated' });
    expect(merged.revision).toBe(withUnrelated.revision + 1);
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('migrates legacy guidance visibility into an independent generation-enabled state', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:regional-mask',
      name: 'Legacy Region',
    })!;
    const legacy = structuredClone(added) as any;
    legacy.version = 15;
    const region = legacy.layers.find((layer: any) => layer.kind === 'regional_guidance');
    region.visible = false;
    delete region.enabled;
    const migrated = migrateUmbraCanvasDocument(legacy);
    expect(migrated.layers.find((layer) => layer.id === region.id)).toMatchObject({ visible: false, enabled: false });
  });

  test('keeps native Z-Image controls on their fixed full step range', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      adapterType: 'z_image_control',
      asset: createUmbraCanvasImageAsset({ name: 'control.png', path: '', imageUrl: 'blob:control', width: 512, height: 512 }),
    })!;
    const updated = umbraCanvasDocumentReducer(added, {
      type: 'update_control_layer',
      layerId: added.activeLayerId,
      changes: { beginStepPercent: 0.3, endStepPercent: 0.6 },
    })!;
    expect(updated.layers.find((layer) => layer.id === added.activeLayerId)).toMatchObject({
      adapterType: 'z_image_control',
      beginStepPercent: 0,
      endStepPercent: 1,
    });
  });

  test('adds a native style reference layer with explicit model resources', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_reference_layer',
      name: 'Palette reference',
      modelName: 'style-model.safetensors',
      visionModelName: 'clip-vision.safetensors',
      transform: { x: 64, y: 32, width: 640, height: 512 },
      asset: createUmbraCanvasImageAsset({
        name: 'reference.png',
        path: '',
        imageUrl: 'blob:reference',
        width: 768,
        height: 768,
      }),
    })!;
    const reference = added.layers.find((layer) => layer.kind === 'reference');
    expect(reference).toMatchObject({
      method: 'style_model',
      modelName: 'style-model.safetensors',
      visionModelName: 'clip-vision.safetensors',
      crop: 'center',
      weight: 1,
      transform: { x: 64, y: 32, width: 640, height: 512 },
    });
    const updated = umbraCanvasDocumentReducer(added, {
      type: 'update_reference_layer',
      layerId: reference!.id,
      changes: { weight: 0.45, crop: 'none', strengthType: 'attn_bias' },
    })!;
    expect(updated.layers.find((layer) => layer.id === reference!.id)).toMatchObject({
      weight: 0.45,
      crop: 'none',
      strengthType: 'attn_bias',
    });
    expect(validateUmbraCanvasDocument(updated)).toEqual([]);
  });

  test('replaces reference pixels and bounds without changing guidance settings', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_reference_layer',
      method: 'ip_adapter',
      name: 'Pose reference',
      modelName: 'ip-adapter.safetensors',
      visionModelName: 'clip-vision.safetensors',
      asset: createUmbraCanvasImageAsset({
        name: 'reference.png',
        path: '',
        imageUrl: 'blob:reference',
        width: 768,
        height: 768,
      }),
    })!;
    const configured = umbraCanvasDocumentReducer(added, {
      type: 'update_reference_layer',
      layerId: added.activeLayerId,
      changes: {
        crop: 'none',
        weight: 0.72,
        beginStepPercent: 0.1,
        endStepPercent: 0.85,
        ipAdapterWeightType: 'composition precise',
        ipAdapterCombineEmbeds: 'norm average',
        ipAdapterEmbedsScaling: 'K+mean(V) w/ C penalty',
      },
    })!;
    const replacementAsset = createUmbraCanvasImageAsset({
      name: 'reference-trimmed.png',
      path: '',
      imageUrl: 'blob:reference-trimmed',
      width: 320,
      height: 240,
    });
    const replaced = umbraCanvasDocumentReducer(configured, {
      type: 'replace_reference_asset',
      layerId: added.activeLayerId,
      name: 'Pose reference Trimmed',
      asset: replacementAsset,
      transform: { x: 48, y: 96, width: 320, height: 240, rotation: 0, scaleX: 1, scaleY: 1 },
    })!;

    expect(replaced.layers.find((layer) => layer.id === added.activeLayerId)).toMatchObject({
      name: 'Pose reference Trimmed',
      asset: replacementAsset,
      transform: { x: 48, y: 96, width: 320, height: 240, rotation: 0, scaleX: 1, scaleY: 1 },
      method: 'ip_adapter',
      modelName: 'ip-adapter.safetensors',
      visionModelName: 'clip-vision.safetensors',
      crop: 'none',
      weight: 0.72,
      beginStepPercent: 0.1,
      endStepPercent: 0.85,
      ipAdapterWeightType: 'composition precise',
      ipAdapterCombineEmbeds: 'norm average',
      ipAdapterEmbedsScaling: 'K+mean(V) w/ C penalty',
    });
    expect(validateUmbraCanvasDocument(replaced)).toEqual([]);
  });

  test('creates a regional IP Adapter reference and influence region atomically', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_regional_reference_layer',
      name: 'Face Reference',
      modelName: 'ip-adapter.safetensors',
      visionModelName: 'clip-vision.safetensors',
      regionDataUrl: 'blob:face-region-mask',
      transform: { x: 96, y: 80, width: 320, height: 384 },
      asset: createUmbraCanvasImageAsset({
        name: 'face-reference.png',
        path: '',
        imageUrl: 'blob:face-reference',
        width: 320,
        height: 384,
      }),
    })!;
    const reference = added.layers.find((layer) => layer.kind === 'reference');
    const region = added.layers.find((layer) => layer.kind === 'regional_guidance');
    const mask = region?.kind === 'regional_guidance'
      ? added.layers.find((layer) => layer.id === region.maskLayerId)
      : null;

    expect(reference).toMatchObject({
      name: 'Face Reference',
      method: 'ip_adapter',
      modelName: 'ip-adapter.safetensors',
      visionModelName: 'clip-vision.safetensors',
      regionLayerId: region?.id,
      transform: { x: 96, y: 80, width: 320, height: 384 },
    });
    expect(region).toMatchObject({
      name: 'Face Reference Region',
      positivePrompt: '',
      negativePrompt: '',
      enabled: true,
    });
    expect(mask).toMatchObject({
      dataUrl: 'blob:face-region-mask',
      purpose: 'regional_guidance',
      frozen: true,
      visible: false,
    });
    expect(added.activeLayerId).toBe(reference?.id);
    expect(added.revision).toBe(document.revision + 1);
    expect(validateUmbraCanvasDocument(added)).toEqual([]);
  });

  test('persists full IP Adapter timing and embedding controls', () => {
    const document = createDocument();
    const added = umbraCanvasDocumentReducer(document, {
      type: 'add_reference_layer',
      method: 'ip_adapter',
      asset: createUmbraCanvasImageAsset({ name: 'reference.png', path: '', imageUrl: 'blob:reference', width: 512, height: 512 }),
    })!;
    const updated = umbraCanvasDocumentReducer(added, {
      type: 'update_reference_layer',
      layerId: added.activeLayerId,
      changes: {
        weight: 0.85,
        beginStepPercent: 0.15,
        endStepPercent: 0.8,
        ipAdapterWeightType: 'composition precise',
        ipAdapterCombineEmbeds: 'norm average',
        ipAdapterEmbedsScaling: 'K+mean(V) w/ C penalty',
      },
    })!;
    const withMask = umbraCanvasDocumentReducer(updated, {
      type: 'attach_reference_mask',
      layerId: added.activeLayerId,
      dataUrl: 'blob:ip-mask',
    })!;
    const reference = withMask.layers.find((layer) => layer.id === added.activeLayerId);
    expect(reference?.kind).toBe('reference');
    expect(typeof (reference && 'maskLayerId' in reference ? reference.maskLayerId : '')).toBe('string');
    const duplicated = umbraCanvasDocumentReducer(withMask, { type: 'duplicate_layer', layerId: added.activeLayerId })!;
    const references = duplicated.layers.filter((layer) => layer.kind === 'reference');
    expect(references).toHaveLength(2);
    expect(references[0].maskLayerId).not.toBe(references[1].maskLayerId);
    const detached = umbraCanvasDocumentReducer(duplicated, { type: 'detach_reference_mask', layerId: references[0].id })!;
    expect(detached.layers.find((layer) => layer.id === references[0].id)).toMatchObject({ maskLayerId: undefined });
    expect(validateUmbraCanvasDocument(detached)).toEqual([]);
    const withRegion = umbraCanvasDocumentReducer(detached, {
      type: 'add_regional_guidance',
      dataUrl: 'blob:regional-influence',
      name: 'Face Region',
      positivePrompt: 'detailed face',
    })!;
    const region = withRegion.layers.find((layer) => layer.kind === 'regional_guidance');
    const linked = umbraCanvasDocumentReducer(withRegion, {
      type: 'link_reference_region',
      layerId: references[0].id,
      regionLayerId: region!.id,
    })!;
    expect(linked.layers.find((layer) => layer.id === references[0].id)).toMatchObject({ regionLayerId: region!.id, maskLayerId: undefined });
    expect(validateUmbraCanvasDocument(linked)).toEqual([]);
    expect(migrateUmbraCanvasDocument(linked).layers.find((layer) => layer.id === references[0].id)).toMatchObject({ regionLayerId: region!.id });
    const removedRegion = umbraCanvasDocumentReducer(linked, { type: 'remove_layer', layerId: region!.id })!;
    expect(removedRegion.layers.find((layer) => layer.id === references[0].id)).toMatchObject({ regionLayerId: undefined });
    expect(validateUmbraCanvasDocument(removedRegion)).toEqual([]);
    const migratedReference = migrateUmbraCanvasDocument(withMask).layers.find((layer) => layer.id === added.activeLayerId);
    expect(migratedReference).toMatchObject({
      method: 'ip_adapter',
      weight: 0.85,
      beginStepPercent: 0.15,
      endStepPercent: 0.8,
      ipAdapterWeightType: 'composition precise',
      ipAdapterCombineEmbeds: 'norm average',
      ipAdapterEmbedsScaling: 'K+mean(V) w/ C penalty',
    });
    expect(typeof (migratedReference && 'maskLayerId' in migratedReference ? migratedReference.maskLayerId : '')).toBe('string');
  });

  test('preserves declared control providers and reference methods across migration', () => {
    const document = createDocument();
    const withControl = umbraCanvasDocumentReducer(document, {
      type: 'add_control_layer',
      adapterType: 'control_lora',
      controlMode: 'more_control',
      asset: createUmbraCanvasImageAsset({
        name: 'control.png',
        path: '',
        imageUrl: 'blob:control',
        width: 512,
        height: 512,
      }),
    })!;
    const withReference = umbraCanvasDocumentReducer(withControl, {
      type: 'add_reference_layer',
      method: 'flux_redux',
      asset: createUmbraCanvasImageAsset({
        name: 'reference.png',
        path: '',
        imageUrl: 'blob:reference',
        width: 512,
        height: 512,
      }),
    })!;
    const weightedReference = umbraCanvasDocumentReducer(withReference, {
      type: 'update_reference_layer',
      layerId: withReference.activeLayerId,
      changes: { weight: 0.65 },
    })!;
    const migrated = migrateUmbraCanvasDocument(weightedReference);
    expect(migrated.layers.find((layer) => layer.kind === 'control')).toMatchObject({
      adapterType: 'control_lora',
      controlMode: 'more_control',
    });
    expect(migrated.layers.find((layer) => layer.kind === 'reference')).toMatchObject({
      method: 'flux_redux',
      weight: 0.65,
    });

    const legacy = structuredClone(weightedReference) as any;
    const legacyControl = legacy.layers.find((layer: any) => layer.kind === 'control');
    const legacyReference = legacy.layers.find((layer: any) => layer.kind === 'reference');
    delete legacyControl.adapterType;
    delete legacyControl.controlMode;
    legacyReference.method = 'unknown_reference_method';
    const migratedLegacy = migrateUmbraCanvasDocument(legacy);
    expect(migratedLegacy.layers.find((layer) => layer.kind === 'control')).toMatchObject({
      adapterType: 'controlnet',
      controlMode: 'balanced',
    });
    expect(migratedLegacy.layers.find((layer) => layer.kind === 'reference')).toMatchObject({
      method: 'style_model',
    });
  });

  test('groups visual layers without flattening them', () => {
    const document = createDocument();
    const withGroup = umbraCanvasDocumentReducer(document, { type: 'add_group_layer', name: 'Character' })!;
    const groupId = withGroup.activeLayerId;
    const withText = umbraCanvasDocumentReducer(withGroup, { type: 'add_text_layer', text: 'Hello' })!;
    const textId = withText.activeLayerId;
    const grouped = umbraCanvasDocumentReducer(withText, { type: 'set_layer_group', layerId: textId, groupId })!;
    expect(grouped.layers.find((layer) => layer.id === textId)?.groupId).toBe(groupId);
    const removed = umbraCanvasDocumentReducer(grouped, { type: 'remove_layer', layerId: groupId })!;
    expect(removed.layers.find((layer) => layer.id === textId)?.groupId).toBeUndefined();
    expect(validateUmbraCanvasDocument(removed)).toEqual([]);
  });

  test('persists a quick-switch bookmark and clears it when its layer is removed', () => {
    const document = createDocument();
    const withText = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'Bookmark me' })!;
    const textId = withText.activeLayerId;
    const bookmarked = umbraCanvasDocumentReducer(withText, { type: 'set_bookmarked_layer', layerId: textId })!;
    expect(bookmarked.bookmarkedLayerId).toBe(textId);
    expect(migrateUmbraCanvasDocument(structuredClone(bookmarked)).bookmarkedLayerId).toBe(textId);
    const removed = umbraCanvasDocumentReducer(bookmarked, { type: 'remove_layer', layerId: textId })!;
    expect(removed.bookmarkedLayerId).toBe('');
    expect(validateUmbraCanvasDocument(removed)).toEqual([]);

    const legacy = structuredClone(document) as any;
    delete legacy.bookmarkedLayerId;
    expect(migrateUmbraCanvasDocument(legacy).bookmarkedLayerId).toBe('');
  });

  test('groups multiple selected visual layers atomically without grouping the immutable source', () => {
    const document = createDocument();
    const withText = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'Character' })!;
    const textId = withText.activeLayerId;
    const withGradient = umbraCanvasDocumentReducer(withText, { type: 'add_gradient_layer' })!;
    const gradientId = withGradient.activeLayerId;
    const grouped = umbraCanvasDocumentReducer(withGradient, {
      type: 'group_layers',
      layerIds: [document.layers[0].id, textId, gradientId],
      name: 'Character Stack',
    })!;
    const group = grouped.layers.find((layer) => layer.kind === 'group' && layer.name === 'Character Stack');
    expect(group?.kind).toBe('group');
    expect(grouped.activeLayerId).toBe(group?.id);
    expect(grouped.layers.find((layer) => layer.id === textId)?.groupId).toBe(group?.id);
    expect(grouped.layers.find((layer) => layer.id === gradientId)?.groupId).toBe(group?.id);
    expect(grouped.layers.find((layer) => layer.id === document.layers[0].id)?.groupId).toBeUndefined();
    expect(validateUmbraCanvasDocument(grouped)).toEqual([]);
  });

  test('merges selected visual layers while retaining the hidden immutable source and unrelated layers', () => {
    const document = createDocument();
    const staged = umbraCanvasDocumentReducer(document, { type: 'stage_outputs', stages: [createStage()] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1', mode: 'new_layer' })!;
    const generated = accepted.layers.find((layer) => layer.kind === 'raster' && layer.role === 'generated');
    const withText = umbraCanvasDocumentReducer(accepted, { type: 'add_text_layer', text: 'Keep me' })!;
    const textId = withText.activeLayerId;
    const merged = umbraCanvasDocumentReducer(withText, {
      type: 'merge_selected',
      layerIds: [document.layers[0].id, generated!.id],
      name: 'Selected Merge',
      asset: createUmbraCanvasImageAsset({ name: 'selected-merge.png', path: '', imageUrl: 'blob:selected-merge', width: 1024, height: 768 }),
    })!;
    const source = merged.layers.find((layer) => layer.id === document.layers[0].id);
    const result = merged.layers.find((layer) => layer.id === merged.activeLayerId);
    expect(source).toMatchObject({ kind: 'raster', role: 'source', visible: false, locked: true });
    expect(result).toMatchObject({ kind: 'raster', role: 'paint', name: 'Selected Merge' });
    expect(merged.layers.some((layer) => layer.id === generated!.id)).toBe(false);
    expect(merged.layers.some((layer) => layer.id === generated!.maskLayerId)).toBe(false);
    expect(merged.layers.some((layer) => layer.id === textId)).toBe(true);
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('combines two raster layers non-destructively while preserving their masks', () => {
    const document = createDocument();
    const staged = umbraCanvasDocumentReducer(document, { type: 'stage_outputs', stages: [createStage()] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1' })!;
    const generated = accepted.layers.find((layer) => layer.kind === 'raster' && layer.role === 'generated');
    const withMask = umbraCanvasDocumentReducer(accepted, {
      type: 'add_layer_mask',
      rasterLayerId: generated!.id,
      dataUrl: 'data:image/png;base64,layer-mask',
    })!;
    const maskedGenerated = withMask.layers.find((layer) => layer.id === generated!.id);
    expect(maskedGenerated?.kind).toBe('raster');
    const generatedMaskId = maskedGenerated?.kind === 'raster' ? maskedGenerated.maskLayerId : '';
    const result = umbraCanvasDocumentReducer(withMask, {
      type: 'boolean_raster_layers',
      lowerLayerId: document.layers[0].id,
      upperLayerId: generated!.id,
      operation: 'exclude',
      name: 'Source Exclude Generated',
      asset: createUmbraCanvasImageAsset({ name: 'boolean.png', path: '', imageUrl: 'blob:boolean', width: 1024, height: 768 }),
    })!;
    expect(result.layers.find((layer) => layer.id === document.layers[0].id)).toMatchObject({ visible: false, role: 'source' });
    expect(result.layers.find((layer) => layer.id === generated!.id)).toMatchObject({ visible: false, role: 'generated' });
    expect(result.layers.find((layer) => layer.id === generatedMaskId)).toMatchObject({ kind: 'mask', purpose: 'layer' });
    expect(result.layers.find((layer) => layer.id === result.activeLayerId)).toMatchObject({
      kind: 'raster',
      role: 'paint',
      name: 'Source Exclude Generated',
    });
    expect(withMask.layers.find((layer) => layer.id === document.layers[0].id)?.visible).toBe(true);
    expect(validateUmbraCanvasDocument(result)).toEqual([]);
  });

  test('adds editable text and gradient layers', () => {
    const document = createDocument();
    const withText = umbraCanvasDocumentReducer(document, {
      type: 'add_text_layer',
      text: 'Umbra',
      transform: { x: 720, y: 620, width: 400, height: 240 },
    })!;
    const textId = withText.activeLayerId;
    const edited = umbraCanvasDocumentReducer(withText, {
      type: 'update_text_layer',
      layerId: textId,
      changes: { fontSize: 96, color: '#ff304c', align: 'right', underline: true, strikethrough: true },
    })!;
    const withGradient = umbraCanvasDocumentReducer(edited, { type: 'add_gradient_layer', gradientType: 'radial' })!;
    const gradientId = withGradient.activeLayerId;
    const updated = umbraCanvasDocumentReducer(withGradient, {
      type: 'update_gradient_layer',
      layerId: gradientId,
      changes: { radius: 0.75, clipEnabled: false, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ff304c' }] },
    })!;
    expect(updated.layers.find((layer) => layer.id === textId)).toMatchObject({
      kind: 'text',
      fontSize: 96,
      align: 'right',
      underline: true,
      strikethrough: true,
      transform: { x: 624, y: 528, width: 400, height: 240 },
    });
    expect(updated.layers.find((layer) => layer.id === gradientId)).toMatchObject({ kind: 'gradient', gradientType: 'radial', radius: 0.75, clipEnabled: false });
    expect(validateUmbraCanvasDocument(updated)).toEqual([]);
  });

  test('migrates legacy gradients to explicit endpoints without changing their unclipped appearance', () => {
    const document = createDocument();
    const withGradient = umbraCanvasDocumentReducer(document, { type: 'add_gradient_layer' })!;
    const legacy = structuredClone(withGradient) as any;
    legacy.version = 12;
    const gradient = legacy.layers.find((layer: any) => layer.kind === 'gradient');
    gradient.angle = 90;
    delete gradient.startX;
    delete gradient.startY;
    delete gradient.endX;
    delete gradient.endY;
    delete gradient.clipEnabled;

    const migrated = migrateUmbraCanvasDocument(legacy);
    const migratedGradient = migrated.layers.find((layer) => layer.kind === 'gradient');
    expect(migrated.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(migratedGradient).toMatchObject({ kind: 'gradient', angle: 90, clipEnabled: false });
    if (!migratedGradient || migratedGradient.kind !== 'gradient') throw new Error('Gradient was not migrated.');
    expect(migratedGradient.startX).toBeCloseTo(0.5);
    expect(migratedGradient.endX).toBeCloseTo(0.5);
    expect(migratedGradient.startY).toBeLessThan(migratedGradient.endY);
    expect(validateUmbraCanvasDocument(migrated)).toEqual([]);
  });

  test('reorders layers directly without allowing content beneath the immutable source', () => {
    const document = createDocument();
    const withFirst = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'First' })!;
    const firstId = withFirst.activeLayerId;
    const withSecond = umbraCanvasDocumentReducer(withFirst, { type: 'add_text_layer', text: 'Second' })!;
    const secondId = withSecond.activeLayerId;
    const reordered = umbraCanvasDocumentReducer(withSecond, {
      type: 'reorder_layer',
      layerId: firstId,
      targetLayerId: secondId,
      placement: 'after',
    })!;
    expect(reordered.layers.findIndex((layer) => layer.id === firstId)).toBeGreaterThan(reordered.layers.findIndex((layer) => layer.id === secondId));
    const protectedSource = umbraCanvasDocumentReducer(reordered, {
      type: 'reorder_layer',
      layerId: secondId,
      targetLayerId: document.layers[0].id,
      placement: 'before',
    })!;
    expect(protectedSource.layers[0].id).toBe(document.layers[0].id);
    const moveProtected = umbraCanvasDocumentReducer(protectedSource, { type: 'move_layer', layerId: secondId, direction: 'down' })!;
    expect(moveProtected.layers[0].id).toBe(document.layers[0].id);
    expect(validateUmbraCanvasDocument(moveProtected)).toEqual([]);
  });

  test('moves layers directly to the front or protected back of the stack', () => {
    const document = createDocument();
    const withFirst = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'First' })!;
    const firstId = withFirst.activeLayerId;
    const withSecond = umbraCanvasDocumentReducer(withFirst, { type: 'add_gradient_layer' })!;
    const secondId = withSecond.activeLayerId;
    const withThird = umbraCanvasDocumentReducer(withSecond, { type: 'add_text_layer', text: 'Third' })!;
    const thirdId = withThird.activeLayerId;

    const movedToFront = umbraCanvasDocumentReducer(withThird, {
      type: 'move_layer',
      layerId: firstId,
      direction: 'front',
    })!;
    expect(movedToFront.layers.at(-1)?.id).toBe(firstId);
    expect(movedToFront.layers.findIndex((layer) => layer.id === firstId)).toBeGreaterThan(movedToFront.layers.findIndex((layer) => layer.id === thirdId));

    const movedToBack = umbraCanvasDocumentReducer(movedToFront, {
      type: 'move_layer',
      layerId: firstId,
      direction: 'back',
    })!;
    expect(movedToBack.layers[0].id).toBe(document.layers[0].id);
    expect(movedToBack.layers[1].id).toBe(firstId);
    expect(movedToBack.layers.findIndex((layer) => layer.id === firstId)).toBeLessThan(movedToBack.layers.findIndex((layer) => layer.id === secondId));

    const protectedSource = umbraCanvasDocumentReducer(movedToBack, {
      type: 'move_layer',
      layerId: document.layers[0].id,
      direction: 'front',
    })!;
    expect(protectedSource).toBe(movedToBack);
    expect(validateUmbraCanvasDocument(protectedSource)).toEqual([]);
  });

  test('moves multiple unlocked layers atomically while preserving locked layers', () => {
    const document = createDocument();
    const withFirst = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'First' })!;
    const firstId = withFirst.activeLayerId;
    const withSecond = umbraCanvasDocumentReducer(withFirst, { type: 'add_gradient_layer' })!;
    const secondId = withSecond.activeLayerId;
    const locked = umbraCanvasDocumentReducer(withSecond, { type: 'toggle_layer_lock', layerId: secondId })!;
    const moved = umbraCanvasDocumentReducer(locked, {
      type: 'set_layers_transforms',
      transforms: [
        { layerId: firstId, transform: { x: 48, y: 64 } },
        { layerId: secondId, transform: { x: 96, y: 128 } },
        { layerId: document.layers[0].id, transform: { x: 200, y: 200 } },
      ],
    })!;
    expect(moved.layers.find((layer) => layer.id === firstId)?.transform).toMatchObject({ x: 48, y: 64 });
    expect(moved.layers.find((layer) => layer.id === secondId)?.transform).toMatchObject(withSecond.layers.find((layer) => layer.id === secondId)!.transform);
    expect(moved.layers.find((layer) => layer.id === document.layers[0].id)?.transform).toMatchObject({ x: 0, y: 0 });
    expect(validateUmbraCanvasDocument(moved)).toEqual([]);
  });

  test('merges a group into one undoable raster replacement', () => {
    const document = createDocument();
    const grouped = umbraCanvasDocumentReducer(document, { type: 'add_group_layer', name: 'Details' })!;
    const groupId = grouped.activeLayerId;
    const withText = umbraCanvasDocumentReducer(grouped, { type: 'add_text_layer', text: 'Eyes' })!;
    const assigned = umbraCanvasDocumentReducer(withText, { type: 'set_layer_group', layerId: withText.activeLayerId, groupId })!;
    const merged = umbraCanvasDocumentReducer(assigned, {
      type: 'merge_group',
      groupId,
      asset: createUmbraCanvasImageAsset({ name: 'merged.png', path: '', imageUrl: 'blob:merged', width: 1024, height: 768 }),
    })!;
    expect(merged.layers.some((layer) => layer.id === groupId || layer.kind === 'text')).toBe(false);
    expect(merged.layers.find((layer) => layer.id === merged.activeLayerId)).toMatchObject({ kind: 'raster', role: 'paint' });
    expect(validateUmbraCanvasDocument(merged)).toEqual([]);
  });

  test('flattens visual content while retaining a hidden immutable source', () => {
    const withText = umbraCanvasDocumentReducer(createDocument(), { type: 'add_text_layer', text: 'Overlay' })!;
    const flattened = umbraCanvasDocumentReducer(withText, {
      type: 'flatten_visible',
      asset: createUmbraCanvasImageAsset({ name: 'flat.png', path: '', imageUrl: 'blob:flat', width: 1024, height: 768 }),
    })!;
    const source = flattened.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    const output = flattened.layers.find((layer) => layer.id === flattened.activeLayerId);
    expect(source).toMatchObject({ locked: true, visible: false });
    expect(flattened.layers.some((layer) => layer.kind === 'text')).toBe(false);
    expect(output).toMatchObject({ kind: 'raster', role: 'paint' });
    expect(validateUmbraCanvasDocument(flattened)).toEqual([]);
  });

  test('migrates version 1 projects without dropping existing layers', () => {
    const legacy = { ...createDocument(), version: 1 } as unknown;
    const migrated = migrateUmbraCanvasDocument(legacy);
    expect(migrated.version).toBe(UMBRA_CANVAS_DOCUMENT_VERSION);
    expect(migrated.layers).toHaveLength(2);
    expect(validateUmbraCanvasDocument(migrated)).toEqual([]);
  });

  test('refuses unsafe document geometry at create, migration, and reducer boundaries', () => {
    const unsafeAsset = createUmbraCanvasImageAsset({
      name: 'unsafe.png',
      path: '',
      imageUrl: '/unsafe.png',
      width: 16_385,
      height: 1,
    });
    expect(() => createUmbraCanvasDocument(unsafeAsset)).toThrow('16384-pixel interactive canvas side limit');

    const oversized = structuredClone(createDocument()) as any;
    oversized.width = 9_000;
    oversized.height = 9_000;
    expect(() => migrateUmbraCanvasDocument(oversized)).toThrow('64 MP interactive canvas memory limit');

    const current = createDocument();
    expect(umbraCanvasDocumentReducer(current, {
      type: 'resize_canvas',
      width: 20_000,
      height: 1,
      translateX: 0,
      translateY: 0,
    })).toBe(current);
  });

  test('migrates scale-before-processing settings and supplies safe defaults', () => {
    const legacy = structuredClone(createDocument()) as any;
    legacy.version = 5;
    delete legacy.generation.processingScaleMode;
    delete legacy.generation.processingWidth;
    delete legacy.generation.processingHeight;
    delete legacy.generation.coherenceMode;
    delete legacy.generation.coherenceEdgeSize;
    delete legacy.generation.coherenceMinimumDenoise;
    delete legacy.generation.seamlessX;
    delete legacy.generation.seamlessY;
    delete legacy.generation.inpaintModelName;
    delete legacy.generation.outputOnlyMaskedRegions;
    delete legacy.generation.infillColor;
    delete legacy.generation.infillTileSize;
    delete legacy.generation.softInpaintEnabled;
    delete legacy.generation.softInpaintPreservation;
    delete legacy.generation.softInpaintTransitionContrast;
    delete legacy.generation.softInpaintMaskInfluence;
    const migrated = migrateUmbraCanvasDocument(legacy);
    expect(migrated.generation).toMatchObject({
      processingScaleMode: 'none',
      processingWidth: 1024,
      processingHeight: 1024,
      coherenceMode: 'none',
      coherenceEdgeSize: 16,
      coherenceMinimumDenoise: 0,
      seamlessX: false,
      seamlessY: false,
      inpaintModelName: '',
      outputOnlyMaskedRegions: false,
      infillColor: '#7f7f7f',
      infillTileSize: 32,
      softInpaintEnabled: true,
      softInpaintPreservation: 0.5,
      softInpaintTransitionContrast: 2,
      softInpaintMaskInfluence: 0,
    });

    const configured = migrateUmbraCanvasDocument({
      ...migrated,
      generation: {
        ...migrated.generation,
        processingScaleMode: 'manual',
        processingWidth: 99999,
        processingHeight: 32,
        coherenceMode: 'staged',
        coherenceEdgeSize: 9999,
        coherenceMinimumDenoise: 2,
        seamlessX: true,
        seamlessY: true,
        fillMode: 'lama',
        infillColor: '#aabbcc',
        infillTileSize: 999,
        inpaintModelName: 'lama/big-lama.pt',
        outputOnlyMaskedRegions: true,
        softInpaintEnabled: false,
        softInpaintPreservation: 2,
        softInpaintTransitionContrast: 99,
        softInpaintMaskInfluence: -1,
      },
    });
    expect(configured.generation).toMatchObject({
      processingScaleMode: 'manual',
      processingWidth: 16384,
      processingHeight: 64,
      coherenceMode: 'staged',
      coherenceEdgeSize: 2048,
      coherenceMinimumDenoise: 1,
      seamlessX: true,
      seamlessY: true,
      fillMode: 'lama',
      infillColor: '#aabbcc',
      infillTileSize: 512,
      inpaintModelName: 'lama/big-lama.pt',
      outputOnlyMaskedRegions: true,
      softInpaintEnabled: false,
      softInpaintPreservation: 1,
      softInpaintTransitionContrast: 8,
      softInpaintMaskInfluence: 0,
    });
  });

  test('forks a project without mutating its layer graph', () => {
    const document = createDocument();
    const fork = forkUmbraCanvasDocument(document, 'Alternate Edit');
    expect(fork.id).not.toBe(document.id);
    expect(fork.name).toBe('Alternate Edit');
    expect(fork.layers).toEqual(document.layers);
    expect(fork.layers).not.toBe(document.layers);
  });

  test('stores generation controls without adding them to the visual layer graph', () => {
    const document = createDocument();
    const next = umbraCanvasDocumentReducer(document, {
      type: 'set_generation_settings',
      generation: {
        ...document.generation,
        modelFamily: 'Flux',
        modelSource: 'gguf',
        checkpointName: 'flux-fill.gguf',
        promptSegments: [{ id: 'prompt-1', text: 'repair the coat' }],
        activePromptSegmentId: 'prompt-1',
        denoise: 0.65,
        samples: 3,
        processingScaleMode: 'manual',
        processingWidth: 1280,
        processingHeight: 768,
      },
    })!;
    expect(next.layers).toEqual(document.layers);
    expect(next.generation).toMatchObject({
      modelFamily: 'Flux',
      modelSource: 'gguf',
      checkpointName: 'flux-fill.gguf',
      denoise: 0.65,
      samples: 3,
      processingScaleMode: 'manual',
      processingWidth: 1280,
      processingHeight: 768,
    });
  });

  test('keeps raster adjustments non-destructive and clamps their ranges', () => {
    const document = createDocument();
    const withPaint = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint.png', width: 1024, height: 768 }),
      name: 'Paint',
      role: 'paint',
    })!;
    const paint = withPaint.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    if (!paint) throw new Error('Paint layer is missing.');
    const next = umbraCanvasDocumentReducer(withPaint, {
      type: 'update_raster_adjustments',
      layerId: paint.id,
      changes: { enabled: true, brightness: 4, tint: -4, sharpness: 2 },
    })!;
    const adjusted = next.layers.find((layer) => layer.id === paint.id);
    expect(adjusted?.kind).toBe('raster');
    if (adjusted?.kind !== 'raster') throw new Error('Adjusted raster layer is missing.');
    expect(adjusted.asset).toEqual(paint.asset);
    expect(adjusted.adjustments).toMatchObject({ enabled: true, brightness: 1, tint: -1, sharpness: 1 });
  });

  test('normalizes and persists non-destructive RGB curves', () => {
    const document = createDocument();
    const withPaint = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint.png', width: 1024, height: 768 }),
      name: 'Paint',
      role: 'paint',
    })!;
    const paint = withPaint.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    if (!paint) throw new Error('Paint layer is missing.');
    const next = umbraCanvasDocumentReducer(withPaint, {
      type: 'update_raster_adjustments',
      layerId: paint.id,
      changes: {
        enabled: true,
        mode: 'curves',
        curves: {
          master: [[255, 300], [128, 160], [0, -20]],
          r: [[0, 0], [255, 255]],
          g: [],
          b: [[64, 80]],
        },
      },
    })!;
    const adjusted = next.layers.find((layer) => layer.id === paint.id);
    if (adjusted?.kind !== 'raster') throw new Error('Adjusted raster layer is missing.');
    expect(adjusted.adjustments.mode).toBe('curves');
    expect(adjusted.adjustments.curves.master).toEqual([[0, 0], [128, 160], [255, 255]]);
    expect(adjusted.adjustments.curves.g).toEqual([[0, 0], [255, 255]]);
    expect(adjusted.adjustments.curves.b).toEqual([[0, 80], [64, 80], [255, 80]]);
    const migrated = migrateUmbraCanvasDocument(next);
    const migratedPaint = migrated.layers.find((layer) => layer.id === paint.id);
    expect(migratedPaint?.kind === 'raster' ? migratedPaint.adjustments.curves : null).toEqual(adjusted.adjustments.curves);
  });

  test('replaces editable paint assets while keeping the immutable source untouched', () => {
    const document = createDocument();
    const paintAsset = createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint.png', width: 1024, height: 768 });
    const withPaint = umbraCanvasDocumentReducer(document, { type: 'add_raster_layer', asset: paintAsset, name: 'Paint', role: 'paint' })!;
    const paintLayer = withPaint.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    if (!paintLayer) throw new Error('Paint layer is missing.');
    const replacement = createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint-v2.png', width: 1024, height: 768 });
    const updated = umbraCanvasDocumentReducer(withPaint, { type: 'replace_raster_asset', layerId: paintLayer.id, asset: replacement })!;
    expect(updated.layers.find((layer) => layer.id === paintLayer.id && layer.kind === 'raster')?.asset.imageUrl).toBe('/paint-v2.png');
    const source = updated.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    expect(source?.kind === 'raster' ? source.asset.imageUrl : '').toBe('/source.png');
  });

  test('applies a raster filter to an editable raster without mutating the immutable source asset', () => {
    const document = createDocument();
    const source = document.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    if (!source || source.kind !== 'raster') throw new Error('Source layer is missing.');
    const withPaint = umbraCanvasDocumentReducer(document, {
      type: 'add_raster_layer',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint.png', width: 1024, height: 768 }),
      name: 'Paint',
      role: 'paint',
    })!;
    const paint = withPaint.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    if (!paint) throw new Error('Paint layer is missing.');
    const filteredAsset = createUmbraCanvasImageAsset({ name: 'filtered.png', path: '', imageUrl: 'blob:filtered', width: 1054, height: 798 });
    const filtered = umbraCanvasDocumentReducer(withPaint, {
      type: 'apply_raster_filter',
      layerId: paint.id,
      asset: filteredAsset,
      name: 'Paint Blur',
      transform: { x: -15, y: -15, width: 1054, height: 798, rotation: 0, scaleX: 1, scaleY: 1 },
    })!;
    const retainedSource = filtered.layers.find((layer) => layer.id === source.id);
    const result = filtered.layers.find((layer) => layer.id === paint.id);
    expect(retainedSource).toMatchObject({ visible: true, asset: { imageUrl: '/source.png' } });
    expect(result).toMatchObject({ name: 'Paint Blur', asset: { imageUrl: 'blob:filtered' }, transform: { x: -15, y: -15 } });
    expect(validateUmbraCanvasDocument(filtered)).toEqual([]);
  });

  test('rejects locked layer content, settings, transforms, reordering, duplication, and deletion', () => {
    const withText = umbraCanvasDocumentReducer(createDocument(), { type: 'add_text_layer', text: 'Locked text' })!;
    const textId = withText.activeLayerId;
    const withGradient = umbraCanvasDocumentReducer(withText, { type: 'add_gradient_layer' })!;
    const gradientId = withGradient.activeLayerId;
    const locked = umbraCanvasDocumentReducer(withGradient, { type: 'toggle_layer_lock', layerId: textId })!;

    expect(umbraCanvasDocumentReducer(locked, { type: 'update_text_layer', layerId: textId, changes: { text: 'Changed' } })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, { type: 'set_layer_opacity', layerId: textId, opacity: 0.25 })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, { type: 'set_layer_name', layerId: textId, name: 'Renamed' })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, { type: 'set_layer_transform', layerId: textId, transform: { x: 40 } })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, { type: 'move_layer', layerId: textId, direction: 'front' })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'reorder_layer',
      layerId: textId,
      targetLayerId: gradientId,
      placement: 'after',
    })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, { type: 'duplicate_layer', layerId: textId })).toBe(locked);
    expect(umbraCanvasDocumentReducer(locked, { type: 'remove_layer', layerId: textId })).toBe(locked);

    const hidden = umbraCanvasDocumentReducer(locked, { type: 'toggle_layer', layerId: textId })!;
    expect(hidden.layers.find((layer) => layer.id === textId)).toMatchObject({ locked: true, visible: false });
    const unlocked = umbraCanvasDocumentReducer(hidden, { type: 'toggle_layer_lock', layerId: textId })!;
    const edited = umbraCanvasDocumentReducer(unlocked, { type: 'update_text_layer', layerId: textId, changes: { text: 'Changed' } })!;
    expect(edited.layers.find((layer) => layer.id === textId)).toMatchObject({ locked: false, visible: false, text: 'Changed' });
  });

  test('repairs and preserves the immutable source lock while allowing source visibility changes', () => {
    const document = createDocument();
    const source = document.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source');
    if (!source || source.kind !== 'raster') throw new Error('Source layer is missing.');
    const tampered = structuredClone(document);
    const tamperedSource = tampered.layers.find((layer) => layer.id === source.id)!;
    tamperedSource.locked = false;

    const migrated = migrateUmbraCanvasDocument(tampered);
    expect(migrated.layers.find((layer) => layer.id === source.id)).toMatchObject({ locked: true });
    const replaced = umbraCanvasDocumentReducer(document, { type: 'replace_document', document: tampered })!;
    expect(replaced.layers.find((layer) => layer.id === source.id)).toMatchObject({ locked: true });
    expect(umbraCanvasDocumentReducer(replaced, { type: 'toggle_layer_lock', layerId: source.id })).toBe(replaced);
    expect(umbraCanvasDocumentReducer(replaced, { type: 'set_layer_name', layerId: source.id, name: 'Editable Original' })).toBe(replaced);
    expect(umbraCanvasDocumentReducer(replaced, {
      type: 'update_raster_adjustments',
      layerId: source.id,
      changes: { enabled: true, brightness: 1 },
    })).toBe(replaced);
    expect(umbraCanvasDocumentReducer(replaced, {
      type: 'apply_raster_filter',
      layerId: source.id,
      asset: createUmbraCanvasImageAsset({ name: 'filtered.png', path: '', imageUrl: 'blob:filtered', width: 1024, height: 768 }),
      transform: source.transform,
    })).toBe(replaced);
    const hidden = umbraCanvasDocumentReducer(replaced, { type: 'toggle_layer', layerId: source.id })!;
    expect(hidden.layers.find((layer) => layer.id === source.id)).toMatchObject({ locked: true, visible: false });
  });

  test('rejects raster filters while an editable raster layer is locked', () => {
    const withPaint = umbraCanvasDocumentReducer(createDocument(), {
      type: 'add_raster_layer',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint.png', width: 1024, height: 768 }),
      name: 'Paint',
      role: 'paint',
    })!;
    const paint = withPaint.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    if (!paint || paint.kind !== 'raster') throw new Error('Paint layer is missing.');
    const locked = umbraCanvasDocumentReducer(withPaint, { type: 'toggle_layer_lock', layerId: paint.id })!;
    expect(umbraCanvasDocumentReducer(locked, {
      type: 'apply_raster_filter',
      layerId: paint.id,
      asset: createUmbraCanvasImageAsset({ name: 'filtered.png', path: '', imageUrl: 'blob:filtered', width: 1024, height: 768 }),
      transform: paint.transform,
    })).toBe(locked);
  });

  test('flattens only effectively visible visual layers and preserves hidden group content', () => {
    let document = umbraCanvasDocumentReducer(createDocument(), { type: 'add_group_layer', name: 'Hidden Group' })!;
    const groupId = document.activeLayerId;
    document = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'Hidden by group' })!;
    const groupedTextId = document.activeLayerId;
    document = umbraCanvasDocumentReducer(document, { type: 'set_layer_group', layerId: groupedTextId, groupId })!;
    document = umbraCanvasDocumentReducer(document, { type: 'toggle_layer', layerId: groupId })!;
    document = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'Explicitly hidden' })!;
    const hiddenTextId = document.activeLayerId;
    document = umbraCanvasDocumentReducer(document, { type: 'toggle_layer', layerId: hiddenTextId })!;
    document = umbraCanvasDocumentReducer(document, { type: 'add_text_layer', text: 'Visible overlay' })!;
    const visibleTextId = document.activeLayerId;

    const flattened = umbraCanvasDocumentReducer(document, {
      type: 'flatten_visible',
      asset: createUmbraCanvasImageAsset({ name: 'flat.png', path: '', imageUrl: 'blob:flat', width: 1024, height: 768 }),
    })!;
    expect(flattened.layers.some((layer) => layer.id === visibleTextId)).toBe(false);
    expect(flattened.layers.find((layer) => layer.id === hiddenTextId)).toMatchObject({ visible: false });
    expect(flattened.layers.find((layer) => layer.id === groupedTextId)).toMatchObject({ groupId });
    expect(flattened.layers.find((layer) => layer.id === groupId)).toMatchObject({ kind: 'group', visible: false });
    expect(flattened.layers.find((layer) => layer.kind === 'raster' && layer.role === 'source')).toMatchObject({ locked: true, visible: false });
    expect(flattened.layers.find((layer) => layer.id === flattened.activeLayerId)).toMatchObject({ kind: 'raster', role: 'paint' });
    expect(validateUmbraCanvasDocument(flattened)).toEqual([]);
  });

  test('refuses to flatten visible locked layers or children of a locked group', () => {
    let document = umbraCanvasDocumentReducer(createDocument(), { type: 'add_text_layer', text: 'Protected overlay' })!;
    const textId = document.activeLayerId;
    document = umbraCanvasDocumentReducer(document, { type: 'toggle_layer_lock', layerId: textId })!;
    const flattenAction = {
      type: 'flatten_visible' as const,
      asset: createUmbraCanvasImageAsset({ name: 'flat.png', path: '', imageUrl: 'blob:flat', width: 1024, height: 768 }),
    };
    expect(umbraCanvasDocumentReducer(document, flattenAction)).toBe(document);

    document = umbraCanvasDocumentReducer(document, { type: 'toggle_layer_lock', layerId: textId })!;
    document = umbraCanvasDocumentReducer(document, { type: 'add_group_layer', name: 'Protected Group' })!;
    const groupId = document.activeLayerId;
    document = umbraCanvasDocumentReducer(document, { type: 'set_layer_group', layerId: textId, groupId })!;
    document = umbraCanvasDocumentReducer(document, { type: 'toggle_layer_lock', layerId: groupId })!;
    expect(umbraCanvasDocumentReducer(document, flattenAction)).toBe(document);
  });

  test('normalizes IP Adapter timing ranges regardless of which endpoint changes', () => {
    const withReference = umbraCanvasDocumentReducer(createDocument(), {
      type: 'add_reference_layer',
      asset: createUmbraCanvasImageAsset({ name: 'reference.png', path: '', imageUrl: '/reference.png', width: 512, height: 512 }),
      method: 'ip_adapter',
    })!;
    const referenceId = withReference.activeLayerId;
    const shortened = umbraCanvasDocumentReducer(withReference, {
      type: 'update_reference_layer',
      layerId: referenceId,
      changes: { endStepPercent: 0.4 },
    })!;
    const raisedStart = umbraCanvasDocumentReducer(shortened, {
      type: 'update_reference_layer',
      layerId: referenceId,
      changes: { beginStepPercent: 0.8 },
    })!;
    expect(raisedStart.layers.find((layer) => layer.id === referenceId)).toMatchObject({ beginStepPercent: 0.8, endStepPercent: 0.8 });
    const loweredEnd = umbraCanvasDocumentReducer(raisedStart, {
      type: 'update_reference_layer',
      layerId: referenceId,
      changes: { endStepPercent: 0.2 },
    })!;
    expect(loweredEnd.layers.find((layer) => layer.id === referenceId)).toMatchObject({ beginStepPercent: 0.2, endStepPercent: 0.2 });
    const reversedPair = umbraCanvasDocumentReducer(loweredEnd, {
      type: 'update_reference_layer',
      layerId: referenceId,
      changes: { beginStepPercent: 0.9, endStepPercent: 0.1 },
    })!;
    expect(reversedPair.layers.find((layer) => layer.id === referenceId)).toMatchObject({ beginStepPercent: 0.1, endStepPercent: 0.9 });
    expect(validateUmbraCanvasDocument(reversedPair)).toEqual([]);
  });

  test('replaces the final editable mask with a clean working mask when deleted', () => {
    const document = createDocument();
    const populated = umbraCanvasDocumentReducer(document, {
      type: 'set_mask_snapshot',
      dataUrl: 'blob:painted-mask',
    })!;
    const removed = umbraCanvasDocumentReducer(populated, { type: 'remove_layer', layerId: populated.activeMaskLayerId })!;
    const masks = removed.layers.filter((layer) => layer.kind === 'mask' && layer.purpose === 'inpaint' && !layer.frozen);
    expect(masks).toHaveLength(1);
    expect(removed.activeMaskLayerId).not.toBe(populated.activeMaskLayerId);
    expect(masks[0]).toMatchObject({ id: removed.activeMaskLayerId, dataUrl: '', name: 'Inpaint Mask' });
    expect(validateUmbraCanvasDocument(removed)).toEqual([]);
  });

  test('keeps group duplication and attached or frozen mask deletion as reducer-safe no-ops', () => {
    const document = createDocument();
    const withGroup = umbraCanvasDocumentReducer(document, { type: 'add_group_layer', name: 'Details' })!;
    expect(umbraCanvasDocumentReducer(withGroup, { type: 'duplicate_layer', layerId: withGroup.activeLayerId })).toBe(withGroup);

    const withPaint = umbraCanvasDocumentReducer(withGroup, {
      type: 'add_raster_layer',
      asset: createUmbraCanvasImageAsset({ name: 'paint.png', path: '', imageUrl: '/paint.png', width: 1024, height: 768 }),
      name: 'Paint',
      role: 'paint',
    })!;
    const paint = withPaint.layers.find((layer) => layer.kind === 'raster' && layer.role === 'paint');
    if (!paint || paint.kind !== 'raster') throw new Error('Paint layer is missing.');
    const withMask = umbraCanvasDocumentReducer(withPaint, {
      type: 'add_layer_mask',
      rasterLayerId: paint.id,
      dataUrl: 'blob:layer-mask',
    })!;
    const maskedPaint = withMask.layers.find((layer) => layer.id === paint.id);
    if (!maskedPaint || maskedPaint.kind !== 'raster' || !maskedPaint.maskLayerId) throw new Error('Attached mask is missing.');
    expect(umbraCanvasDocumentReducer(withMask, { type: 'remove_layer', layerId: maskedPaint.maskLayerId })).toBe(withMask);

    const staged = umbraCanvasDocumentReducer(withMask, { type: 'stage_outputs', stages: [createStage()] })!;
    const accepted = umbraCanvasDocumentReducer(staged, { type: 'accept_stage', stageId: 'stage-1', mode: 'new_layer' })!;
    const generated = accepted.layers.find((layer) => layer.kind === 'raster' && layer.role === 'generated');
    if (!generated || generated.kind !== 'raster' || !generated.maskLayerId) throw new Error('Frozen generated mask is missing.');
    expect(umbraCanvasDocumentReducer(accepted, { type: 'remove_layer', layerId: generated.maskLayerId })).toBe(accepted);
  });

  test('tracks recoverable generation jobs inside the project document', () => {
    const document = createDocument();
    const tracked = umbraCanvasDocumentReducer(document, {
      type: 'track_pending_job',
      job: {
        id: 'job-1',
        region: { x: 128, y: 96, width: 512, height: 384 },
        maskDataUrl: 'blob:pending-mask',
        createdAt: 10,
      },
    })!;
    expect(tracked.pendingJobs).toHaveLength(1);
    const removed = umbraCanvasDocumentReducer(tracked, { type: 'remove_pending_job', jobId: 'job-1' })!;
    expect(removed.pendingJobs).toEqual([]);
    expect(validateUmbraCanvasDocument(removed)).toEqual([]);
  });
});
