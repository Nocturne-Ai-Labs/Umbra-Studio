import { describe, expect, test } from 'bun:test';
import { DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE } from './powerPrompter';

describe('packaged Power Prompter detailer defaults', () => {
  test('ships the tuned included detailers and concat prompts', () => {
    expect(DEFAULT_POWER_PROMPTER_DETAILER_PIPELINE.map((stage) => ({
      id: stage.id,
      enabled: stage.enabled,
      detectorModel: stage.detectorModel,
      wildcard: stage.wildcard,
    }))).toEqual([
      {
        id: 'detail-person',
        enabled: true,
        detectorModel: 'segm/person_yolov8m-seg.pt',
        wildcard: '[CONCAT] coherent anatomy, natural body proportions, coherent clothing folds',
      },
      {
        id: 'detail-face',
        enabled: true,
        detectorModel: 'bbox/face_yolov8m.pt',
        wildcard: '',
      },
      {
        id: 'detail-eyes',
        enabled: true,
        detectorModel: 'bbox/Eyes.pt',
        wildcard: '[CONCAT] detailed symmetrical eyes, sharp irises, natural pupils',
      },
      {
        id: 'detail-hands',
        enabled: true,
        detectorModel: 'bbox/hand_yolov8s.pt',
        wildcard: '[CONCAT] detailed hands, anatomically correct hands, five fingers, natural finger spacing',
      },
    ]);
  });

  test('lets bundled starter cards inherit the maintained detailer defaults', async () => {
    const starterPaths = [
      'defaults/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
      'defaults/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    ];

    for (const path of starterPaths) {
      const document = await Bun.file(path).json() as {
        generation?: { detailerPipeline?: unknown };
      };
      expect(document.generation).toBeDefined();
      expect(document.generation).not.toHaveProperty('detailerPipeline');
    }
  });
});
