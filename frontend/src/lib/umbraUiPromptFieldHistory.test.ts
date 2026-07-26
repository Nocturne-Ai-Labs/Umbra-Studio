import { describe, expect, test } from 'bun:test';
import {
  recordUmbraUiPromptFieldCheckpoint,
  redoUmbraUiPromptField,
  undoUmbraUiPromptField,
} from './umbraUiPromptFieldHistory';

describe('Umbra UI prompt field history', () => {
  test('undoes and redoes a field without involving other prompt fields', () => {
    const history = recordUmbraUiPromptFieldCheckpoint(undefined, 'original prompt');
    const undone = undoUmbraUiPromptField(history, 'replacement prompt');

    expect(undone?.text).toBe('original prompt');
    expect(undone?.history.redo).toEqual(['replacement prompt']);

    const redone = redoUmbraUiPromptField(undone?.history, undone?.text || '');
    expect(redone?.text).toBe('replacement prompt');
    expect(redone?.history.undo).toEqual(['original prompt']);
  });

  test('clears redo history when a new edit branch is recorded', () => {
    const first = recordUmbraUiPromptFieldCheckpoint(undefined, 'one');
    const undone = undoUmbraUiPromptField(first, 'two');
    const branched = recordUmbraUiPromptFieldCheckpoint(undone?.history, 'one');

    expect(branched.redo).toEqual([]);
  });

  test('deduplicates adjacent checkpoints and enforces the supplied limit', () => {
    let history = recordUmbraUiPromptFieldCheckpoint(undefined, 'one', 2);
    history = recordUmbraUiPromptFieldCheckpoint(history, 'one', 2);
    history = recordUmbraUiPromptFieldCheckpoint(history, 'two', 2);
    history = recordUmbraUiPromptFieldCheckpoint(history, 'three', 2);

    expect(history.undo).toEqual(['two', 'three']);
  });
});
