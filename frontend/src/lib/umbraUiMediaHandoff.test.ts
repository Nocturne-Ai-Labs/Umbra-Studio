import { describe, expect, test } from 'bun:test';
import type { ImageMetadata } from '../utils/metadata';
import {
  buildUmbraUiMediaGenerationSnapshot,
  normalizeUmbraUiMediaHandoff,
  normalizeUmbraUiMediaInpaintSnapshot,
} from './umbraUiMediaHandoff';

describe('Umbra UI media handoff metadata recovery', () => {
  test('recovers the complete v4 scalar inpaint receipt without inventing layer assets', () => {
    const metadata: ImageMetadata = {
      type: 'image',
      positive_prompt: 'portrait, <lora:characters/hero:0.8:0.6>',
      negative_prompt: 'artifact',
      umbra_inpaint: {
        version: 4,
        operationMode: 'outpaint',
        workflowId: 'flux-fill',
        modelFamily: 'FLUX.1',
        modelSource: 'diffusion_model',
        inpaintAdapter: 'flux_fill',
        adapterModelName: 'flux/fill.safetensors',
        checkpointName: 'flux/model.gguf',
        seed: 42,
        steps: 28,
        cfg: 1.2,
        clipSkip: 2,
        samplerName: 'euler',
        scheduler: 'simple',
        denoise: 0.74,
        samples: 3,
        generationRegion: { x: 32, y: 48, width: 768, height: 896 },
        canvasMaskGrow: 8,
        canvasMaskFeather: 4,
        maskGrow: 16,
        maskFeather: 8,
        contextPadding: 64,
        processingScaleMode: 'manual',
        processingWidth: 1280,
        processingHeight: 1536,
        coherenceMode: 'staged',
        coherenceEdgeSize: 24,
        coherenceMinimumDenoise: 0.2,
        seamlessX: true,
        seamlessY: false,
        outputOnlyMaskedRegions: true,
        fillMode: 'tile',
        infillColor: '#ABCDEF',
        infillTileSize: 48,
        inpaintModelName: 'inpaint/MAT.safetensors',
        colorMatch: 0.35,
        differentialStrength: 0.9,
        softInpaintEnabled: true,
        softInpaintPreservation: 0.72,
        softInpaintTransitionContrast: 3.5,
        softInpaintMaskInfluence: 0.18,
        regionalGuidance: [{ id: 'region-1' }],
        controlLayers: [{ id: 'control-1' }, { id: 'control-2' }],
        referenceLayers: [{ id: 'reference-1' }],
      },
    };

    const snapshot = buildUmbraUiMediaGenerationSnapshot(metadata);
    expect(snapshot).toMatchObject({
      positivePrompt: 'portrait',
      negativePrompt: 'artifact',
      modelFamily: 'FLUX.1',
      modelType: 'diffusion_model',
      checkpointName: 'flux/model.gguf',
      seed: 42,
      steps: 28,
      cfg: 1.2,
      clipSkip: 2,
      samplerName: 'euler',
      scheduler: 'simple',
      denoise: 0.74,
      loras: [{ name: 'characters/hero', strengthModel: 0.8, strengthClip: 0.6 }],
      inpaint: {
        receiptVersion: 4,
        operationMode: 'outpaint',
        workflowId: 'flux-fill',
        inpaintAdapter: 'flux_fill',
        generationRegion: { x: 32, y: 48, width: 768, height: 896 },
        samples: 3,
        maskGrow: 8,
        maskFeather: 4,
        contextPadding: 64,
        processingScaleMode: 'manual',
        processingWidth: 1280,
        processingHeight: 1536,
        coherenceMode: 'staged',
        coherenceEdgeSize: 24,
        coherenceMinimumDenoise: 0.2,
        seamlessX: true,
        seamlessY: false,
        outputOnlyMaskedRegions: true,
        fillMode: 'tile',
        infillColor: '#abcdef',
        infillTileSize: 48,
        inpaintModelName: 'inpaint/MAT.safetensors',
        colorMatch: 0.35,
        differentialStrength: 0.9,
        softInpaintEnabled: true,
        softInpaintPreservation: 0.72,
        softInpaintTransitionContrast: 3.5,
        softInpaintMaskInfluence: 0.18,
        regionalGuidanceCount: 1,
        controlLayerCount: 2,
        referenceLayerCount: 1,
      },
    });
  });

  test('supports legacy receipts while preferring v4 canvas-space mask controls', () => {
    expect(normalizeUmbraUiMediaInpaintSnapshot({
      version: 3,
      maskGrow: 17,
      maskFeather: 9,
      fillMode: 'telea',
    })).toMatchObject({
      receiptVersion: 3,
      maskGrow: 17,
      maskFeather: 9,
      fillMode: 'telea',
    });
  });

  test('normalizes persisted handoffs instead of trusting stale session JSON', () => {
    const handoff = normalizeUmbraUiMediaHandoff({
      mode: 'inpaint',
      path: 'C:\\outputs\\image.png',
      imageUrl: '/api/fs/image?path=image.png',
      generation: {
        positivePrompt: 'repair',
        modelType: 'checkpoint',
        steps: 999999,
        cfg: -10,
        loras: [{ name: '..\\hero.safetensors', strengthModel: 99 }],
        inpaint: {
          samples: 999,
          fillMode: 'not-a-provider',
          regionalGuidanceCount: -4,
        },
      },
      createdAt: 123,
    });

    expect(handoff).toMatchObject({
      mode: 'inpaint',
      path: 'C:/outputs/image.png',
      originalSourcePath: 'C:/outputs/image.png',
      createdAt: 123,
      generation: {
        positivePrompt: 'repair',
        steps: 10000,
        cfg: 0,
        loras: [{ name: '../hero.safetensors', strengthModel: 10 }],
        inpaint: {
          samples: 16,
          regionalGuidanceCount: 0,
        },
      },
    });
    expect(handoff?.generation?.inpaint?.fillMode).toBeUndefined();
  });

  test('preserves the immutable original source across flattened inpaint handoffs', () => {
    expect(normalizeUmbraUiMediaHandoff({
      mode: 'img2img',
      path: 'C:\\outputs\\inpaint-canvas.png',
      originalSourcePath: 'D:\\gallery\\original.png',
      imageUrl: '/api/fs/image?path=inpaint-canvas.png',
      createdAt: 789,
    })).toMatchObject({
      mode: 'img2img',
      path: 'C:/outputs/inpaint-canvas.png',
      originalSourcePath: 'D:/gallery/original.png',
      createdAt: 789,
    });
  });

  test('preserves the dedicated VID2VID source role', () => {
    expect(normalizeUmbraUiMediaHandoff({
      mode: 'video',
      path: 'D:\\clips\\source.mp4',
      imageUrl: '/api/fs/image?path=source.mp4',
      videoFrameRole: 'source_video',
      createdAt: 456,
    })).toMatchObject({
      mode: 'video',
      path: 'D:/clips/source.mp4',
      videoFrameRole: 'source_video',
      createdAt: 456,
    });
  });

  test('keeps flattened-canvas layer counts explicit when descriptor arrays are absent', () => {
    expect(normalizeUmbraUiMediaInpaintSnapshot({
      regionalGuidanceCount: 3,
      controlLayerCount: 2,
      referenceLayerCount: 1,
    })).toMatchObject({
      regionalGuidanceCount: 3,
      controlLayerCount: 2,
      referenceLayerCount: 1,
    });
  });
});
