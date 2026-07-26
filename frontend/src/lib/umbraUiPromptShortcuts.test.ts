import { describe, expect, test } from 'bun:test';
import {
  applyUmbraPromptWeight,
  isUmbraPromptWeightShortcut,
  isUmbraQueueShortcut,
} from './umbraUiPromptShortcuts';

describe('Umbra UI prompt shortcuts', () => {
  test('weights the comma-delimited token under the caret like Power Prompter', () => {
    const result = applyUmbraPromptWeight('1girl, red jacket, city', 10, 10, 0.1);
    expect(result?.nextValue).toBe('1girl, (red jacket:1.1), city');
    expect(result?.nextValue.slice(result.selectionStart, result.selectionEnd)).toBe('(red jacket:1.1)');
  });

  test('adjusts existing weights and selected token groups', () => {
    expect(applyUmbraPromptWeight('(smile:1.1)', 0, 11, -0.1)?.nextValue).toBe('(smile:1)');
    expect(applyUmbraPromptWeight('red hair, blue eyes', 0, 19, 0.1)?.nextValue)
      .toBe('(red hair:1.1), (blue eyes:1.1)');
  });

  test('recognizes weighting and queue chords without stealing plain Enter', () => {
    expect(isUmbraPromptWeightShortcut({ ctrlKey: true, metaKey: false, shiftKey: true, key: 'ArrowUp' })).toBe(true);
    expect(isUmbraQueueShortcut({ ctrlKey: false, metaKey: true, key: 'Enter' })).toBe(true);
    expect(isUmbraQueueShortcut({ ctrlKey: false, metaKey: false, key: 'Enter' })).toBe(false);
  });
});
