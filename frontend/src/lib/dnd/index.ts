/**
 * Drag & Drop System - Central exports
 * 
 * Now using simplified native HTML5 drag and drop implementation
 */

export {
  // Provider
  DragDropProvider,

  // Hooks
  useDraggable,
  useDroppable,
  useDragDropState,

  // Components
  DropZone,

  // Utilities
  extractImagesFromDrag,
  defaultDropHandler,

  // Types
  type DragType,
  type DropActionType,
  type WorkspaceType,
  type DragData,
  type DropData,
} from './SimpleDragDrop';

// Aliases for backwards compatibility
export { useDraggable as useDragItem } from './SimpleDragDrop';
export { useDroppable as useDropZone } from './SimpleDragDrop';
