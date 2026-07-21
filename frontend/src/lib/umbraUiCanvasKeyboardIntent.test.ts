import { describe, expect, test } from 'bun:test';
import { resolveUmbraCanvasKeyboardIntent } from './umbraUiCanvasKeyboardIntent';

const base = {
  key: 'ArrowLeft',
  editing: false,
  modified: false,
  hasPreviewStage: false,
  tool: 'transform' as const,
  hasMovableLayer: true,
};

describe('resolveUmbraCanvasKeyboardIntent', () => {
  test('keeps stage navigation ahead of layer movement', () => {
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, hasPreviewStage: true })).toEqual({ kind: 'stage', offset: -1 });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'ArrowRight', hasPreviewStage: true })).toEqual({ kind: 'stage', offset: 1 });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'ArrowUp', hasPreviewStage: true })).toEqual({ kind: 'none' });
  });

  test('maps every arrow to an exact one-pixel transform nudge', () => {
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'ArrowLeft' })).toEqual({ kind: 'layer', dx: -1, dy: 0 });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'ArrowRight' })).toEqual({ kind: 'layer', dx: 1, dy: 0 });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'ArrowUp' })).toEqual({ kind: 'layer', dx: 0, dy: -1 });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'ArrowDown' })).toEqual({ kind: 'layer', dx: 0, dy: 1 });
  });

  test('does not steal arrows from inputs, modified shortcuts, or other tools', () => {
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, editing: true })).toEqual({ kind: 'none' });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, modified: true })).toEqual({ kind: 'none' });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, tool: 'brush' })).toEqual({ kind: 'none' });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, hasMovableLayer: false })).toEqual({ kind: 'none' });
    expect(resolveUmbraCanvasKeyboardIntent({ ...base, key: 'PageDown' })).toEqual({ kind: 'none' });
  });
});
