import { describe, expect, test } from 'bun:test';
import { normalizePowerPrompterGenerationControls } from './powerPrompter';

describe('Power Prompter generation pipeline controls', () => {
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
  });
});
