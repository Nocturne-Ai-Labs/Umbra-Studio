import { describe, expect, test } from 'bun:test';
import {
  createUmbraUiLoraEntry,
  getUmbraUiLorasForFamily,
  replaceUmbraUiLorasForFamily,
} from './umbraUiModels';

describe('Umbra UI LoRA model-family isolation', () => {
  test('returns only LoRAs assigned to the active model family', () => {
    const anima = createUmbraUiLoraEntry('Anima/style.safetensors', [], 'anima');
    const qwen = createUmbraUiLoraEntry('Qwen/style.safetensors', [], 'qwenimage');

    expect(getUmbraUiLorasForFamily([anima, qwen], 'QWENIMAGE')).toEqual([qwen]);
  });

  test('replaces one family stack without disturbing other families', () => {
    const anima = createUmbraUiLoraEntry('Anima/style.safetensors', [], 'anima');
    const oldQwen = createUmbraUiLoraEntry('Qwen/old.safetensors', [], 'qwenimage');
    const nextQwen = createUmbraUiLoraEntry('Qwen/new.safetensors');

    const result = replaceUmbraUiLorasForFamily(
      [anima, oldQwen],
      'qwenimage',
      [nextQwen],
    );

    expect(result).toEqual([
      anima,
      { ...nextQwen, modelFamilyKey: 'qwenimage' },
    ]);
  });

  test('does not leak legacy unscoped LoRAs into a model family', () => {
    const legacy = createUmbraUiLoraEntry('legacy.safetensors');

    expect(getUmbraUiLorasForFamily([legacy], 'anima')).toEqual([]);
  });
});
