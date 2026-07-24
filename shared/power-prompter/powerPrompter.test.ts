import { describe, expect, test } from 'bun:test';
import {
  createDefaultPowerPrompterCardDocument,
  createPowerPrompterCardNode,
  normalizePowerPrompterGenerationControls,
} from './powerPrompter';
import { buildQueuePromptsFromCards, resolveSeedForQueuePromptGroup } from './queuePromptBuilder';

describe('Power Prompter generation pipeline controls', () => {
  test('uses the selected seed increment between prompt groups', () => {
    const generation = normalizePowerPrompterGenerationControls({
      seed: 500,
      controlAfterGenerate: 'increment',
      seedIncrement: 1000,
    });

    expect(resolveSeedForQueuePromptGroup(generation, 0, 1)).toBe(500);
    expect(resolveSeedForQueuePromptGroup(generation, 1, 1)).toBe(1500);
    expect(resolveSeedForQueuePromptGroup(generation, 3, 1)).toBe(3500);
  });

  test('preserves advanced image stages across shared document normalization', () => {
    const generation = normalizePowerPrompterGenerationControls({
      clipSkip: 2,
      hiresFix: {
        enabled: true,
        upscaler: '4x-AnimeSharp.pth',
        resizeMode: 'dimensions',
        targetWidth: 1923,
        targetHeight: 1081,
        steps: 12,
        denoise: 0.42,
        cfg: 5,
        samplerName: 'dpmpp_2m',
        scheduler: 'karras',
      },
      detailerPipeline: [{
        id: 'face-pass',
        enabled: true,
        label: 'Face pass',
        detectorModel: 'bbox/face_yolov8m.pt',
        guideSize: 768,
        guideSizeFor: 'crop_region',
        maxSize: 1024,
        seedOffset: 4,
        steps: 10,
        cfg: 3.5,
        samplerName: 'euler',
        scheduler: 'simple',
        denoise: 0.2,
        feather: 8,
        noiseMask: true,
        forceInpaint: true,
        bboxThreshold: 0.4,
        bboxDilation: 12,
        bboxCropFactor: 2.4,
        useSam: true,
        samModel: 'sam_vit_b_01ec64.pth',
        samDeviceMode: 'AUTO',
        samDetectionHint: 'center-1',
        samDilation: 0,
        samThreshold: 0.9,
        samBboxExpansion: 0,
        samMaskHintThreshold: 0.7,
        samMaskHintUseNegative: 'False',
        dropSize: 10,
        wildcard: 'detailed face',
        cycle: 1,
        noiseMaskFeather: 16,
        tiledEncode: false,
        tiledDecode: false,
      }],
      outputUpscale: {
        enabled: true,
        modelName: '4x-AnimeSharp.pth',
        maxDimension: 4096,
      },
    });

    expect(generation.clipSkip).toBe(2);
    expect(generation.hiresFix).toMatchObject({
      enabled: true,
      resizeMode: 'dimensions',
      targetWidth: 1920,
      targetHeight: 1080,
      upscaler: '4x-AnimeSharp.pth',
    });
    expect(generation.detailerPipeline).toHaveLength(1);
    expect(generation.detailerPipeline?.[0]).toMatchObject({
      id: 'face-pass',
      detectorModel: 'bbox/face_yolov8m.pt',
      guideSizeFor: 'crop_region',
      useSam: true,
    });
    expect(generation.outputUpscale).toEqual({
      enabled: true,
      modelName: '4x-AnimeSharp.pth',
      maxDimension: 4096,
    });
  });

  test('migrates an older card document to complete image pipeline defaults', () => {
    const generation = normalizePowerPrompterGenerationControls({});

    expect(generation.clipSkip).toBe(1);
    expect(generation.hiresFix?.enabled).toBe(false);
    expect(generation.detailerPipeline?.map((stage) => stage.label)).toEqual([
      'Person',
      'Face',
      'Eyes',
      'Hands',
    ]);
    expect(generation.outputUpscale?.enabled).toBe(false);
    expect(generation.outputUpscale?.modelName).toBe('RealESRGAN_x4plus.safetensors');
  });

  test('retains card identity and text in queued prompt metadata', () => {
    const style = {
      ...createPowerPrompterCardNode('style', 'Style', 'painted anime illustration', 0, 'style-slot'),
      variantName: 'Painted Anime',
    };
    const character = {
      ...createPowerPrompterCardNode('character', 'Character', 'black-haired heroine', 1, 'character-slot'),
      variantName: 'Heroine',
    };
    const document = {
      ...createDefaultPowerPrompterCardDocument('Example.ppcards.json'),
      cards: [style, character],
    };

    const built = buildQueuePromptsFromCards(document, 'prompt');

    expect(built.prompts).toEqual(['painted anime illustration, black-haired heroine']);
    expect(built.promptEntries[0]?.tokens).toEqual([
      {
        slotId: 'style-slot',
        slotLabel: 'Style',
        slotType: 'style',
        variantId: style.id,
        variantName: 'Painted Anime',
        text: 'painted anime illustration',
      },
      {
        slotId: 'character-slot',
        slotLabel: 'Character',
        slotType: 'character',
        variantId: character.id,
        variantName: 'Heroine',
        text: 'black-haired heroine',
      },
    ]);
  });
});
