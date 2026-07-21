import type { UmbraCanvasPointerTool } from './umbraUiCanvasPointerIntent';

export type UmbraCanvasArrowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export type UmbraCanvasKeyboardIntent =
  | { kind: 'none' }
  | { kind: 'stage'; offset: -1 | 1 }
  | { kind: 'layer'; dx: number; dy: number };

export interface UmbraCanvasKeyboardIntentOptions {
  key: string;
  editing: boolean;
  modified: boolean;
  hasPreviewStage: boolean;
  tool: UmbraCanvasPointerTool;
  hasMovableLayer: boolean;
}

const LAYER_NUDGE_OFFSETS: Record<UmbraCanvasArrowKey, { dx: number; dy: number }> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

export function resolveUmbraCanvasKeyboardIntent(
  options: UmbraCanvasKeyboardIntentOptions,
): UmbraCanvasKeyboardIntent {
  if (options.editing || options.modified) return { kind: 'none' };

  if (options.hasPreviewStage) {
    if (options.key === 'ArrowLeft') return { kind: 'stage', offset: -1 };
    if (options.key === 'ArrowRight') return { kind: 'stage', offset: 1 };
    return { kind: 'none' };
  }

  if (options.tool !== 'transform' || !options.hasMovableLayer) return { kind: 'none' };
  const offset = LAYER_NUDGE_OFFSETS[options.key as UmbraCanvasArrowKey];
  return offset ? { kind: 'layer', ...offset } : { kind: 'none' };
}
