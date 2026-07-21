import { describe, expect, test } from 'bun:test';
import {
  createUmbraUiPipelineTargetId,
  normalizeUmbraUiPipelineSelection,
  parseUmbraUiPipelineTargetId,
} from './pipelineTypes';

describe('Umbra UI pipeline selections', () => {
  test('normalizes a Power Prompter text-to-image pipeline', () => {
    expect(normalizeUmbraUiPipelineSelection({
      feature: 'txt2img',
      modelFamily: 'Krea 2',
      modelSource: 'diffusion_model',
    })).toEqual({
      feature: 'txt2img',
      modelFamily: 'Krea 2',
      modelFamilyKey: 'krea2',
      modelSource: 'diffusion_model',
    });
  });

  test('round-trips the queue target id without an API workflow id', () => {
    const selection = normalizeUmbraUiPipelineSelection({
      feature: 'txt2img',
      modelFamily: 'Anima',
      modelSource: 'checkpoint',
    });
    const targetId = createUmbraUiPipelineTargetId(selection);

    expect(targetId).toBe('pipeline:txt2img:anima:checkpoint');
    expect(parseUmbraUiPipelineTargetId(targetId)).toEqual({
      ...selection,
      modelFamily: 'anima',
    });
  });

  test('uses a legacy model family only as a migration fallback', () => {
    expect(normalizeUmbraUiPipelineSelection(null, {
      modelFamily: 'SDXL',
      modelSource: 'checkpoint',
    })).toMatchObject({
      feature: 'txt2img',
      modelFamily: 'SDXL',
      modelFamilyKey: 'stablediffusion',
      modelSource: 'checkpoint',
    });
  });
});
