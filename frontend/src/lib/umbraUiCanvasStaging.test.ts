import { describe, expect, test } from 'bun:test';
import { shouldAutoPreviewUmbraCanvasStage } from './umbraUiCanvasStaging';

describe('Umbra canvas staging auto-switch', () => {
  test('never switches for unrelated or recovered jobs', () => {
    expect(shouldAutoPreviewUmbraCanvasStage('start', false, false)).toBe(false);
    expect(shouldAutoPreviewUmbraCanvasStage('finish', false, true)).toBe(false);
  });

  test('can remain off for a newly submitted job', () => {
    expect(shouldAutoPreviewUmbraCanvasStage('off', true, false)).toBe(false);
    expect(shouldAutoPreviewUmbraCanvasStage('off', true, true)).toBe(false);
  });

  test('switches as soon as the first result arrives in start mode', () => {
    expect(shouldAutoPreviewUmbraCanvasStage('start', true, false)).toBe(true);
    expect(shouldAutoPreviewUmbraCanvasStage('start', true, true)).toBe(true);
  });

  test('waits for terminal batch state in finish mode', () => {
    expect(shouldAutoPreviewUmbraCanvasStage('finish', true, false)).toBe(false);
    expect(shouldAutoPreviewUmbraCanvasStage('finish', true, true)).toBe(true);
  });
});
