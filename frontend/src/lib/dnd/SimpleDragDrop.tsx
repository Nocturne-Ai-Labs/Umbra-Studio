/**
 * SimpleDragDrop.tsx - Simplified Drag & Drop System
 * 
 * A clean, maintainable drag and drop implementation using native HTML5 APIs.
 * No external dependencies required.
 */

import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { Upload, Copy, Move, Scan, Check } from 'lucide-react';
import { logDiagnostic } from '@/lib/diagnostics';

// ============================================
// TYPES
// ============================================

export type DragType =
  | 'image'
  | 'library-image'
  | 'filmstrip-image'
  | 'multi-select'
  | 'folder';

export type DropActionType = 'move' | 'copy' | 'interact';

export type WorkspaceType =
  | 'library'
  | 'scanner'
  | 'waifudiffusion'
  | 'comfy'
  | 'board'
  | 'prompter';

export interface DragData {
  type: DragType;
  image?: any;
  images?: any[];
  path?: string;
  source?: string;
}

export interface DropData {
  type: 'workspace' | 'folder' | 'dataset-concept';
  workspaceType?: WorkspaceType;
  actionType?: DropActionType;
  path?: string;
  dataset?: string;
  concept?: string;
  onDrop?: (images: any[]) => Promise<void>;
}

function getDroppedImageUrl(dataTransfer: DataTransfer): string {
  const uriList = dataTransfer.getData('text/uri-list');
  const plainText = dataTransfer.getData('text/plain');
  const mozUrl = dataTransfer.getData('text/x-moz-url');
  const html = dataTransfer.getData('text/html');
  const candidates = [uriList, plainText, mozUrl]
    .flatMap((value) => value.split(/\r?\n/))
    .map((value) => value.trim())
    .filter((value) => value && !value.startsWith('#'));

  const htmlMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i) || html.match(/https?:\/\/[^\s"'<>]+/i);
  if (htmlMatch) {
    candidates.push(htmlMatch[1] || htmlMatch[0]);
  }

  return candidates.find((value) => /^https?:\/\//i.test(value) || /^data:image\//i.test(value)) || '';
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith('image/')) return true;
  return /\.(avif|bmp|gif|jpe?g|png|webp)$/i.test(file.name);
}

function hasExternalImageDrop(dataTransfer: DataTransfer): boolean {
  const types = Array.from(dataTransfer.types || []);
  if (types.some((type) => [
    'Files',
    'text/uri-list',
    'text/plain',
    'text/html',
    'text/x-moz-url',
    'application/x-moz-file',
  ].includes(type))) {
    return true;
  }

  const files = Array.from(dataTransfer.files || []);
  if (files.some(isImageFile)) return true;
  if (getDroppedImageUrl(dataTransfer)) return true;
  return false;
}

function extractExternalImagesFromDrop(dataTransfer: DataTransfer): any[] {
  const fileItems = Array.from(dataTransfer.files || [])
    .filter(isImageFile)
    .map((file) => ({ kind: 'file', file, name: file.name, type: file.type }));

  const url = getDroppedImageUrl(dataTransfer);
  if (url) {
    fileItems.push({ kind: 'url', url });
  }

  return fileItems;
}

// ============================================
// CONTEXT
// ============================================

interface DragDropContextValue {
  isDragging: boolean;
  dragData: DragData | null;
  draggedCount: number;
  setDragData: (data: DragData | null) => void;
  setIsDragging: (dragging: boolean) => void;
  getSelectedImages?: () => any[];
}

const DragDropContext = createContext<DragDropContextValue | null>(null);

export function useDragDropState() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('useDragDropState must be used within DragDropProvider');
  }
  return context;
}

// ============================================
// PROVIDER
// ============================================

interface DragDropProviderProps {
  children: ReactNode;
  onDrop?: (dragData: DragData, dropData: DropData) => Promise<void>;
  getSelectedImages?: () => any[];
}

export function DragDropProvider({ children, onDrop: _onDrop, getSelectedImages }: DragDropProviderProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragData, setDragData] = useState<DragData | null>(null);

  // Calculate dragged count
  const draggedCount = (() => {
    if (!dragData?.image) return 0;
    const selectedImages = getSelectedImages?.() || [];
    if (selectedImages.some((img: any) => img.id === dragData.image.id)) {
      return selectedImages.length;
    }
    return 1;
  })();

  const value: DragDropContextValue = {
    isDragging,
    dragData,
    draggedCount,
    setDragData,
    setIsDragging,
    getSelectedImages,
  };

  return (
    <DragDropContext.Provider value={value}>
      {children}
      {/* DragDebugOverlay disabled for performance - re-enable for debugging */}
      {/* <DragDebugOverlay isDragging={isDragging} dragData={dragData} draggedCount={draggedCount} /> */}
    </DragDropContext.Provider>
  );
}

// ============================================
// DRAGGABLE HOOK
// ============================================

interface UseDraggableOptions {
  type: DragType;
  image?: any;
  images?: any[];
  path?: string;
  disabled?: boolean;
}

export function useDraggable({ type, image, images, path, disabled }: UseDraggableOptions) {
  const { setDragData, setIsDragging } = useDragDropState();
  const nodeRef = useRef<HTMLElement | null>(null);
  const [isDragging, setIsDraggingLocal] = useState(false);

  // Prepare drag data
  const dragDataObj: DragData = {
    type,
    image,
    images,
    path,
  };

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (disabled) return;

    // Set JSON data for internal drags
    e.dataTransfer.setData('application/json', JSON.stringify(dragDataObj));
    e.dataTransfer.effectAllowed = 'all';

    setDragData(dragDataObj);
    setIsDragging(true);
    setIsDraggingLocal(true);
  }, [type, image, images, path, disabled, setDragData, setIsDragging]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    setDragData(null);
    setIsDraggingLocal(false);
  }, [setIsDragging, setDragData]);

  return {
    attributes: {
      role: 'button',
      'aria-pressed': isDragging,
      tabIndex: disabled ? -1 : 0,
      draggable: !disabled,
    },
    listeners: {
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
    },
    setNodeRef: (node: HTMLElement | null) => {
      nodeRef.current = node;
    },
    isDragging,
  };
}

// ============================================
// DROPPABLE HOOK
// ============================================

interface UseDroppableOptions {
  id?: string;
  type: 'workspace' | 'folder' | 'dataset-concept';
  workspaceType?: WorkspaceType;
  actionType?: DropActionType;
  path?: string;
  dataset?: string;
  concept?: string;
  onDrop?: (images: any[]) => Promise<void>;
  disabled?: boolean;
  accepts?: DragType[];
  data?: any;
}

export function useDroppable({
  id: _id,
  type,
  workspaceType,
  actionType,
  path: _path,
  dataset: _dataset,
  concept: _concept,
  onDrop,
  disabled,
  accepts,
  data: _data,
}: UseDroppableOptions) {
  const [isOver, setIsOver] = useState(false);
  const { dragData } = useDragDropState();
  const nodeRef = useRef<HTMLElement | null>(null);

  const readNativeDragData = useCallback((e?: React.DragEvent): DragData | null => {
    if (!e || !e.dataTransfer.types.includes('application/json')) return null;
    try {
      const jsonData = e.dataTransfer.getData('application/json');
      if (!jsonData) return null;
      const parsed = JSON.parse(jsonData);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as DragData;
    } catch {
      return null;
    }
  }, []);

  const canDrop = useCallback((e?: React.DragEvent) => {
    const effectiveDragData = dragData || readNativeDragData(e);
    if (disabled) return false;
    if (!effectiveDragData && e && type === 'dataset-concept' && hasExternalImageDrop(e.dataTransfer)) {
      return true;
    }
    if (!effectiveDragData) return false;
    
    // FOLDER drop zones SHOULD accept grid/filmstrip drags (for moving images to folders)
    // WORKSPACE drop zones should NOT intercept internal reorders
    if (type === 'folder') {
      // Folders can accept drags from grid/filmstrip - that's how you move images!
      // Just check the accepts filter if provided
      if (accepts && !accepts.includes(effectiveDragData.type)) return false;
      return true;
    }
    
    // Non-workspace zones should not intercept filmstrip/grid internal reorders.
    if (type !== 'workspace' && (effectiveDragData.source === 'filmstrip' || effectiveDragData.source === 'grid')) {
      return false;
    }
    
    if (accepts && !accepts.includes(effectiveDragData.type)) return false;
    return true;
  }, [disabled, dragData, accepts, type, readNativeDragData]);

  // Helper to check if drag is internal reorder AND we're not a folder
  // Folders should still accept grid/filmstrip drags for moving images
  const shouldBlockForReorder = useCallback((e: React.DragEvent): boolean => {
    // Folder drop zones should NEVER block - they accept image moves
    if (type === 'folder') {
      return false;
    }
    
    // Workspace drop zones should allow filmstrip/grid drops.
    const effectiveDragData = dragData || readNativeDragData(e);
    if (type !== 'workspace' && (effectiveDragData?.source === 'filmstrip' || effectiveDragData?.source === 'grid')) {
      return true;
    }
    
    return false;
  }, [dragData, type, readNativeDragData]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // Only block for reorder if NOT a folder drop zone
    if (shouldBlockForReorder(e)) {
      return; // Don't preventDefault - let it bubble to the item handlers
    }
    
    const canDropResult = canDrop(e);
    if (!canDropResult) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (actionType === 'move') {
      e.dataTransfer.dropEffect = 'move';
    } else if (actionType === 'copy') {
      e.dataTransfer.dropEffect = 'copy';
    } else {
      e.dataTransfer.dropEffect = 'link';
    }

    if (!isOver) {
      setIsOver(true);
    }
  }, [canDrop, actionType, isOver, shouldBlockForReorder]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    // Only block for reorder if NOT a folder drop zone
    if (shouldBlockForReorder(e)) {
      return;
    }
    
    if (!canDrop(e)) return;
    
    e.preventDefault();
    e.stopPropagation();
    setIsOver(true);
  }, [canDrop, shouldBlockForReorder]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    const hasFiles = e.dataTransfer.files.length > 0;
    const hasJsonData = e.dataTransfer.types.includes('application/json');
    const externalImages = type === 'dataset-concept' ? extractExternalImagesFromDrop(e.dataTransfer) : [];

    if (hasFiles && !hasJsonData && externalImages.length <= 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);

    if (!hasJsonData && externalImages.length > 0) {
      if (onDrop) {
        try {
          await onDrop(externalImages);
        } catch (error) {
          console.error(`[Drop Error ${workspaceType || type}]:`, error);
        }
      }
      return;
    }

    const effectiveDragData = dragData || readNativeDragData(e);
    if (!canDrop(e) || !effectiveDragData) {
      return;
    }

    // CRITICAL: For NON-FOLDER drop zones, ignore internal reorder drags
    // Folder drop zones SHOULD accept grid/filmstrip drags (that's how you move images!)
    // Workspace drop zones should NOT intercept - let reorder handlers work
    if (type !== 'folder' && type !== 'workspace' && (effectiveDragData.source === 'filmstrip' || effectiveDragData.source === 'grid')) {
      logDiagnostic('[DropZone] Ignoring internal reorder drag:', effectiveDragData.source, 'log');
      return;
    }

    const images = extractImagesFromDrag(effectiveDragData);

    if (onDrop && images.length > 0) {
      try {
        await onDrop(images);
      } catch (error) {
        console.error(`[Drop Error ${workspaceType || type}]:`, error);
      }
    }
  }, [canDrop, dragData, workspaceType, type, onDrop, readNativeDragData]);

  return {
    setNodeRef: (node: HTMLElement | null) => {
      nodeRef.current = node;
    },
    isOver,
    ...{
      onDragOver: handleDragOver,
      onDragEnter: handleDragEnter,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    }
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================
// HELPER FUNCTIONS
// ============================================

export function extractImagesFromDrag(dragData: DragData): any[] {
  if (dragData.type === 'multi-select' && Array.isArray(dragData.images)) {
    return dragData.images;
  }
  if (dragData.image) {
    return [dragData.image];
  }
  return [];
}

// ============================================
// DROP ZONE COMPONENT
// ============================================

const ACTION_CONFIG: Record<DropActionType, { icon: typeof Upload; verb: string; colorClass: string }> = {
  move: { icon: Move, verb: 'Move to', colorClass: 'bg-orange-500/20 border-orange-500 text-orange-500' },
  copy: { icon: Copy, verb: 'Copy to', colorClass: 'bg-blue-500/20 border-blue-500 text-blue-500' },
  interact: { icon: Scan, verb: 'Scan in', colorClass: 'bg-violet-500/20 border-violet-500 text-violet-500' },
};

interface DropZoneProps {
  id?: string;
  type: 'workspace' | 'folder' | 'dataset-concept';
  workspaceType?: WorkspaceType;
  actionType?: DropActionType;
  label?: string;
  path?: string;
  dataset?: string;
  concept?: string;
  onDrop?: (images: any[]) => Promise<void>;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
}

export const DropZone = React.memo(function DropZone({
  id,
  type,
  workspaceType,
  actionType = 'copy',
  label,
  path,
  dataset,
  concept,
  onDrop,
  disabled,
  children,
  className = '',
}: DropZoneProps) {
  const [showSuccess, setShowSuccess] = useState(false);
  const { draggedCount } = useDragDropState();

  const { setNodeRef, isOver, ...dropHandlers } = useDroppable({
    id,
    type,
    workspaceType,
    actionType,
    path,
    dataset,
    concept,
    onDrop: async (images) => {
      logDiagnostic(`[DropZone ${workspaceType || type}] onDrop called with images:`, images, 'log');
      if (onDrop) {
        logDiagnostic(`[DropZone ${workspaceType || type}] Calling parent onDrop handler`, undefined, 'log');
        await onDrop(images);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 1200);
      } else {
        logDiagnostic(`[DropZone ${workspaceType || type}] No onDrop handler provided!`, undefined, 'warn');
      }
    },
    disabled,
  });

  const config = ACTION_CONFIG[actionType];
  const Icon = config.icon;
  const displayLabel = label || workspaceType?.toUpperCase() || 'Drop Zone';

  const [bgClass, borderClass, textClass] = config.colorClass.split(' ');

  return (
    <div
      ref={setNodeRef}
      {...dropHandlers}
      data-drop-zone={workspaceType || type}
      data-drop-handler="DropZone"
      className={`relative w-full h-full ${className}`}
    >
      {children}

      {/* Drop Overlay - Different style for folders vs workspaces */}
      {isOver && type === 'folder' && (
          // Subtle folder drop feedback with count badge
          <div className="absolute inset-0 bg-[var(--umbra-accent)]/20 border-2 border-[var(--umbra-accent)] rounded-md z-50 flex items-center justify-end pr-2 pointer-events-none animate-pulse">
            {/* Count Badge */}
            {draggedCount > 0 && (
              <div className="bg-[var(--umbra-accent)] text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg border-2 border-white">
                {draggedCount}
              </div>
            )}
          </div>
        )}
        
        {isOver && type !== 'folder' && (
          // Full overlay for workspace drops
          <div className={`absolute inset-0 ${bgClass} border-4 border-dashed ${borderClass} rounded-lg z-50 flex items-center justify-center backdrop-blur-sm pointer-events-none`}>
            <div className="text-center">
              <Icon className={`w-16 h-16 ${textClass} mx-auto mb-4 animate-bounce`} />
              <p className="text-white text-xl font-bold">
                {config.verb} {displayLabel}
              </p>
              <p className="text-white/60 text-sm mt-1">
                {actionType === 'move' && 'Files will be moved from original location'}
                {actionType === 'copy' && 'Files will be copied (originals unchanged)'}
                {actionType === 'interact' && 'Files will be processed (no changes)'}
              </p>
            </div>
          </div>
        )}

      {/* Subtle Success Feedback */}
      {showSuccess && (
          <div className="absolute top-3 right-3 bg-green-500/20 backdrop-blur-sm border border-green-500/40 px-3 py-1.5 rounded-full shadow-lg z-50 flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-green-400" />
            <span className="text-green-300 text-xs font-medium">
              {actionType === 'move' && 'Moved'}
              {actionType === 'copy' && 'Copied'}
              {actionType === 'interact' && 'Added'}
            </span>
          </div>
        )}
    </div>
  );
});

// ============================================
// DEFAULT DROP HANDLER
// ============================================

export async function defaultDropHandler(
  dragData: DragData,
  dropData: DropData,
  actions: {
    moveImagesToFolder: (images: any[], path: string) => Promise<void>;
    copyToWorkspace: (images: any[], workspace: 'comfy') => Promise<void>;
    moveFolder: (source: string, dest: string) => Promise<void>;
  },
  getSelectedImages: () => any[],
): Promise<void> {
  const images = extractImagesFromDrag(dragData);

  logDiagnostic('[DnD] Default handler:', {
    dragType: dragData.type,
    dropType: dropData.type,
    imageCount: images.length,
  }, 'log');

  // Workspace drops
  if (dropData.type === 'workspace' && dropData.onDrop && images.length > 0) {
    logDiagnostic(`[DnD] Workspace drop (${dropData.workspaceType}):`, { images: images.length }, 'log');
    await dropData.onDrop(images);
    return;
  }

  // Dataset concept drops
  if (dropData.type === 'dataset-concept' && dropData.onDrop && images.length > 0) {
    logDiagnostic('[DnD] Dataset concept drop:', { images: images.length }, 'log');
    await dropData.onDrop(images);
    return;
  }

  // Folder drops - MOVE images
  if (dropData.type === 'folder' && dropData.path && images.length > 0) {
    const selectedImages = getSelectedImages();
    const firstImageId = images[0]?.id;

    logDiagnostic('[DnD] Folder drop - extracted images:', {
      extractedImages: images,
      extractedCount: images.length,
      firstExtracted: images[0],
      selectedImages,
      selectedCount: selectedImages.length,
    }, 'log');

    if (selectedImages.some((img: any) => img.id === firstImageId) && selectedImages.length > 1) {
      logDiagnostic('[DnD] Moving selected images:', { count: selectedImages.length, path: dropData.path }, 'log');
      await actions.moveImagesToFolder(selectedImages, dropData.path);
    } else {
      logDiagnostic('[DnD] Moving images:', { count: images.length, path: dropData.path }, 'log');
      await actions.moveImagesToFolder(images, dropData.path);
    }
    return;
  }

  // Folder to folder drops
  if (dragData.type === 'folder' && dragData.path && dropData.path) {
    if (dragData.path !== dropData.path) {
      logDiagnostic('[DnD] Moving folder:', { source: dragData.path, destination: dropData.path }, 'log');
      await actions.moveFolder(dragData.path, dropData.path);
    }
    return;
  }

  logDiagnostic('[DnD] No handler matched', undefined, 'log');
}
