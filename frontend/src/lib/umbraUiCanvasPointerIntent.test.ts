import { describe, expect, test } from 'bun:test';
import {
  resolveUmbraCanvasPointerCursor,
  resolveUmbraCanvasPointerIntent,
  type UmbraCanvasPointerTool,
} from './umbraUiCanvasPointerIntent';

describe('resolveUmbraCanvasPointerCursor', () => {
  test('keeps a visible cursor over every canvas tool', () => {
    const tools: UmbraCanvasPointerTool[] = [
      'pan',
      'transform',
      'brush',
      'erase',
      'eyedropper',
      'text',
      'shape',
      'gradient',
      'box',
      'lasso',
      'polygon',
      'wand',
      'sam',
      'region',
    ];

    for (const tool of tools) {
      expect(resolveUmbraCanvasPointerCursor(tool)).not.toBe('cursor-none');
    }
    expect(resolveUmbraCanvasPointerCursor('brush')).toBe('cursor-crosshair');
    expect(resolveUmbraCanvasPointerCursor('erase')).toBe('cursor-cell');
    expect(resolveUmbraCanvasPointerCursor('text')).toBe('cursor-text');
  });
});

describe('resolveUmbraCanvasPointerIntent', () => {
  test('only paint tools begin freehand paint gestures', () => {
    expect(resolveUmbraCanvasPointerIntent('brush', 'rectangle', 'points')).toBe('paint');
    expect(resolveUmbraCanvasPointerIntent('erase', 'rectangle', 'points')).toBe('paint');
  });

  test('routes bounded and lasso tools to their explicit gestures', () => {
    expect(resolveUmbraCanvasPointerIntent('box', 'rectangle', 'points')).toBe('box');
    expect(resolveUmbraCanvasPointerIntent('gradient', 'rectangle', 'points')).toBe('box');
    expect(resolveUmbraCanvasPointerIntent('region', 'rectangle', 'points')).toBe('box');
    expect(resolveUmbraCanvasPointerIntent('lasso', 'rectangle', 'points')).toBe('lasso');
    expect(resolveUmbraCanvasPointerIntent('shape', 'freehand', 'points')).toBe('shape_freehand');
    expect(resolveUmbraCanvasPointerIntent('shape', 'ellipse', 'points')).toBe('box');
    expect(resolveUmbraCanvasPointerIntent('sam', 'rectangle', 'box')).toBe('box');
  });

  test('navigation and tools with dedicated click handlers cannot mutate pixels by fallthrough', () => {
    const safeTools: UmbraCanvasPointerTool[] = [
      'pan',
      'transform',
      'eyedropper',
      'text',
      'polygon',
      'wand',
    ];
    for (const tool of safeTools) {
      expect(resolveUmbraCanvasPointerIntent(tool, 'rectangle', 'points')).toBe('none');
    }
    expect(resolveUmbraCanvasPointerIntent('shape', 'polygon', 'points')).toBe('none');
    expect(resolveUmbraCanvasPointerIntent('sam', 'rectangle', 'points')).toBe('none');
    expect(resolveUmbraCanvasPointerIntent('sam', 'rectangle', 'prompt')).toBe('none');
  });
});
