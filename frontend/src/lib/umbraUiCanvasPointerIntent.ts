export type UmbraCanvasPointerTool =
  | 'pan'
  | 'transform'
  | 'brush'
  | 'erase'
  | 'eyedropper'
  | 'text'
  | 'shape'
  | 'gradient'
  | 'box'
  | 'lasso'
  | 'polygon'
  | 'wand'
  | 'sam'
  | 'region';

export type UmbraCanvasPointerShape = 'rectangle' | 'ellipse' | 'line' | 'polygon' | 'freehand';
export type UmbraCanvasAssistedGuideMode = 'points' | 'box' | 'prompt';
export type UmbraCanvasPointerIntent = 'none' | 'paint' | 'shape_freehand' | 'box' | 'lasso';

export type UmbraCanvasPointerCursor =
  | 'cursor-cell'
  | 'cursor-crosshair'
  | 'cursor-grab'
  | 'cursor-move'
  | 'cursor-text';

export function resolveUmbraCanvasPointerCursor(
  tool: UmbraCanvasPointerTool,
): UmbraCanvasPointerCursor {
  if (tool === 'erase') return 'cursor-cell';
  if (tool === 'text') return 'cursor-text';
  if (tool === 'pan') return 'cursor-grab';
  if (tool === 'transform') return 'cursor-move';
  return 'cursor-crosshair';
}

export function resolveUmbraCanvasPointerIntent(
  tool: UmbraCanvasPointerTool,
  shape: UmbraCanvasPointerShape,
  assistedGuideMode: UmbraCanvasAssistedGuideMode,
): UmbraCanvasPointerIntent {
  if (tool === 'brush' || tool === 'erase') return 'paint';
  if (tool === 'lasso') return 'lasso';
  if (tool === 'shape' && shape === 'freehand') return 'shape_freehand';
  if (
    tool === 'box'
    || tool === 'gradient'
    || tool === 'region'
    || (tool === 'shape' && shape !== 'polygon')
    || (tool === 'sam' && assistedGuideMode === 'box')
  ) return 'box';
  return 'none';
}
