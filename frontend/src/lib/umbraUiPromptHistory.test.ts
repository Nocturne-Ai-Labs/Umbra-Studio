import { describe, expect, test } from 'bun:test';
import {
  getUmbraUiPromptHistoryFieldCount,
  normalizeUmbraUiPromptHistory,
  recordUmbraUiPromptHistory,
  UMBRA_UI_PROMPT_HISTORY_LIMIT,
} from './umbraUiPromptHistory';

describe('Umbra UI prompt history', () => {
  test('preserves the exact prompt field layout and metadata', () => {
    const history = recordUmbraUiPromptHistory([], [
      { id: 'style', text: 'anime style', label: 'Style', slotType: 'style' },
      { id: 'blank', text: '', label: 'Optional detail' },
      { id: 'character', text: '1girl', label: 'Character', variantId: 'char-1', variantName: 'Hero' },
    ], 'blurry', 100);

    expect(history).toHaveLength(1);
    expect(getUmbraUiPromptHistoryFieldCount(history[0])).toBe(3);
    expect(history[0].promptSegments).toEqual([
      { id: 'style', text: 'anime style', label: 'Style', slotType: 'style' },
      { id: 'blank', text: '', label: 'Optional detail' },
      { id: 'character', text: '1girl', label: 'Character', variantId: 'char-1', variantName: 'Hero' },
    ]);
  });

  test('treats different field groupings as different prompt history entries', () => {
    let history = recordUmbraUiPromptHistory([], [
      { id: 'single', text: '1girl, red jacket' },
    ], '', 100);
    history = recordUmbraUiPromptHistory(history, [
      { id: 'subject', text: '1girl' },
      { id: 'clothes', text: 'red jacket' },
    ], '', 200);

    expect(history).toHaveLength(2);
    expect(history.map(getUmbraUiPromptHistoryFieldCount)).toEqual([2, 1]);
  });

  test('moves an exact duplicate to the front and remains bounded', () => {
    let history = recordUmbraUiPromptHistory([], [{ id: 'one', text: 'hero' }], '', 100);
    history = recordUmbraUiPromptHistory(history, [{ id: 'two', text: 'hero' }], '', 200);
    expect(history).toHaveLength(1);
    expect(history[0].createdAt).toBe(200);

    for (let index = 0; index < UMBRA_UI_PROMPT_HISTORY_LIMIT + 5; index += 1) {
      history = recordUmbraUiPromptHistory(
        history,
        [{ id: `prompt-${index}`, text: `unique prompt ${index}` }],
        '',
        300 + index,
      );
    }
    expect(history).toHaveLength(UMBRA_UI_PROMPT_HISTORY_LIMIT);
  });

  test('repairs duplicate field ids without dropping fields', () => {
    const [entry] = normalizeUmbraUiPromptHistory([{
      id: 'entry',
      createdAt: 1,
      negativePrompt: '',
      promptSegments: [
        { id: 'same', text: 'first' },
        { id: 'same', text: 'second' },
      ],
    }]);
    expect(entry.promptSegments).toHaveLength(2);
    expect(new Set(entry.promptSegments.map((segment) => segment.id)).size).toBe(2);
  });
});
