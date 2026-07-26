import { describe, expect, test } from 'bun:test';
import {
  createDefaultPowerPrompterCardDocument,
  normalizePowerPrompterCardDocument,
} from './powerPrompter';
import {
  applyUmbraUiGenerationControlsToPowerPrompterDocument,
  normalizeUmbraUiGenerationControlsHandoff,
} from './umbraUiGenerationControlsHandoff';

describe('Umbra UI generation controls handoff', () => {
  test('normalizes the complete TXT2IMG control payload for Power Prompter', () => {
    const handoff = normalizeUmbraUiGenerationControlsHandoff({
      modelFamily: 'Flux',
      pipelineName: 'Umbra Flux TXT2IMG',
      generation: {
        outputOwner: 'power_prompter',
        outputMode: 'txt2img',
        modelType: 'gguf',
        checkpointName: 'flux/model.gguf',
        workflowResources: {
          vae: 'ae.safetensors',
          text_encoder: 'clip_l.safetensors',
        },
        negativePrompt: 'low quality',
        seed: 42,
        controlAfterGenerate: 'increment',
        seedIncrement: 100,
        steps: 24,
        cfg: 3.5,
        clipSkip: 1,
        samplerName: 'euler',
        scheduler: 'simple',
        aspectRatio: 'custom',
        width: 1216,
        height: 832,
        batchSize: 3,
        hiresFix: {
          enabled: true,
          upscaler: 'Latent',
          resizeMode: 'scale',
          scaleBy: 1.5,
          targetWidth: 0,
          targetHeight: 0,
          steps: 12,
          denoise: 0.3,
          cfg: 3.5,
          samplerName: 'use_same',
          scheduler: 'use_same',
        },
        detailerPipeline: [],
        outputUpscale: {
          enabled: false,
          modelName: '4x-AnimeSharp.pth',
          maxDimension: 3840,
        },
        loras: [{
          id: 'lora-1',
          name: 'styles/ink.safetensors',
          enabled: true,
          strengthModel: 0.8,
          strengthClip: 0.7,
        }],
      },
      createdAt: 123,
    });

    expect(handoff).not.toBeNull();
    expect(handoff?.modelFamily).toBe('Flux');
    expect(handoff?.pipelineName).toBe('Umbra Flux TXT2IMG');
    expect(handoff?.generation).toMatchObject({
      outputOwner: 'power_prompter',
      outputMode: 'txt2img',
      modelType: 'gguf',
      checkpointName: 'flux/model.gguf',
      seed: 42,
      controlAfterGenerate: 'increment',
      seedIncrement: 100,
      width: 1216,
      height: 832,
      batchSize: 3,
    });
    expect(handoff?.generation.workflowResources).toEqual({
      vae: 'ae.safetensors',
      text_encoder: 'clip_l.safetensors',
    });
    expect(handoff?.generation.hiresFix?.enabled).toBe(true);
    expect(handoff?.generation.loras[0]).toMatchObject({
      name: 'styles/ink.safetensors',
      strengthModel: 0.8,
      strengthClip: 0.7,
    });
  });

  test('rejects a handoff without a model family', () => {
    expect(normalizeUmbraUiGenerationControlsHandoff({
      generation: { checkpointName: 'model.safetensors' },
    })).toBeNull();
  });

  test('updates pipeline controls without changing cards or active sets', () => {
    const document = createDefaultPowerPrompterCardDocument('example.ppcards.json');
    document.activeQueueSet = 3;
    document.cards = [{
      id: 'variant-1',
      slotId: 'style',
      type: 'style',
      label: 'Style',
      variantName: 'Ink',
      variantTags: ['ink'],
      text: 'ink illustration',
      randomEnabled: false,
      randomSetIds: [],
      queueEnabled: true,
      queueSetIds: [2, 3],
      order: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }];

    const normalizedDocument = normalizePowerPrompterCardDocument(document, 'example.ppcards.json');
    const next = applyUmbraUiGenerationControlsToPowerPrompterDocument(normalizedDocument, {
      modelFamily: 'Anima',
      pipelineName: 'Anima TXT2IMG',
      generation: {
        modelType: 'checkpoint',
        checkpointName: 'anima.safetensors',
        width: 896,
        height: 1152,
        batchSize: 4,
      },
    }, 'example.ppcards.json');

    expect(next?.modelType).toBe('Anima');
    expect(next?.pipeline).toMatchObject({
      feature: 'txt2img',
      modelFamily: 'Anima',
      modelSource: 'checkpoint',
    });
    expect(next?.generation).toMatchObject({
      outputOwner: 'power_prompter',
      outputMode: 'txt2img',
      checkpointName: 'anima.safetensors',
      width: 896,
      height: 1152,
      batchSize: 4,
    });
    expect(next?.activeQueueSet).toBe(3);
    expect(next?.cards).toEqual(normalizedDocument.cards);
  });
});
