'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDownAZ,
  ArrowUpAZ,
  CheckSquare,
  ChevronUp,
  Copy,
  FileJson,
  FolderOpen,
  History,
  Image as ImageIcon,
  MoreHorizontal,
  Pin,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Send,
  Tags,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSelectedIdsForTarget, normalizeFilmstripSelectionId } from './filmstripSelection';

export interface FilmstripImage {
  id: string;
  uid?: string;
  name: string;
  path: string;
  url?: string;
  thumbnailUrl?: string;
  type?: 'image' | 'video' | 'gif';
  width?: number;
  height?: number;
  size?: number;
  dateCreated?: string;
  dateModified?: string;
}

export type SortField = 'date' | 'created' | 'name' | 'size' | 'custom';
export type SortDirection = 'asc' | 'desc';
export type WorkspaceType = 'comfyui' | 'library' | 'modelmanager' | 'powerprompter' | 'umbraui' | 'scanner' | 'waifudiffusion' | 'imageinspector' | 'board' | 'remote' | 'localserver';
export type FilmstripReorderPosition = 'before' | 'after';

const GALLERY_DRAG_PATHS_MIME = 'application/x-umbra-gallery-paths';
const filmstripAccentColorCache = new Map<string, string>();
const FILMSTRIP_ACCENT_COLOR_CACHE_LIMIT = 800;

export interface FilmstripProps {
  images: FilmstripImage[];
  recentGenerationImages?: FilmstripImage[];
  recentGenerationExpanded?: boolean;
  onToggleRecentGenerationExpanded?: () => void;
  selectedIds: Set<string>;
  onSelect: (id: string, event: React.MouseEvent) => void;
  onClearSelection: () => void;
  onSelectAll: () => void;
  selectionMode?: boolean;
  onEnterSelectionMode?: () => void;
  onExitSelectionMode?: () => void;
  onDelete?: (ids: string[]) => void;
  onOpen?: (image: FilmstripImage) => void;
  onShowInExplorer?: (ids: string[]) => void;
  onCopyPaths?: (ids: string[]) => void;
  onCopyComfyJson?: (ids: string[]) => void;
  onSendToScanner?: (ids: string[]) => void;
  onOpenWaifuTab?: () => void;
  onSendToWaifu?: (ids: string[]) => void;
  onRename?: (ids: string[]) => void;
  onAddTag?: (ids: string[]) => void;
  onRestoreFromTrash?: (ids: string[]) => void;
  onDeleteForeverFromTrash?: (ids: string[]) => void;
  onContextMenuRequest?: (payload: {
    x: number;
    y: number;
    targetId: string;
    ids: string[];
    images: FilmstripImage[];
  }) => void;
  onReorder?: (draggedId: string, overId: string, position: FilmstripReorderPosition) => void;
  onReorderMany?: (draggedIds: string[], overId: string, position: FilmstripReorderPosition) => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField, direction: SortDirection) => void;
  minHeight?: number;
  maxHeight?: number;
  defaultHeight?: number;
  className?: string;
  activeWorkspace?: WorkspaceType;
  metadataTooltipEnabled?: boolean;
  onSplitStack?: (image: FilmstripImage) => void;
  onSplitBash?: (images: FilmstripImage[]) => void;
  displayMode?: 'strip' | 'grid';
  fillContainer?: boolean;
  onDataChanged?: () => void;
  onHeightChange?: (height: number) => void;
  folderLabel?: string;
  pinnedFolders?: Array<{
    path: string;
    label: string;
    isCurrent?: boolean;
    isDropActive?: boolean;
  }>;
  newestFolders?: Array<{
    path: string;
    label: string;
    isCurrent?: boolean;
  }>;
  onOpenPinnedFolder?: (path: string) => void;
  onOpenNewestFolder?: (path: string) => void;
  onRemovePinnedFolder?: (path: string) => void;
  onPinnedDrop?: (event: DragEvent, destinationPath: string) => void | Promise<void>;
  onPinnedDropTargetChange?: (path: string) => void;
  onRefresh?: () => void;
  onToggleExpanded?: () => void;
  expanded?: boolean;
  onRequestMore?: () => void;
  changeHint?: 'replace' | 'append' | 'remove' | 'reorder' | string;
}

const SORT_OPTIONS: Array<{ field: SortField; label: string }> = [
  { field: 'date', label: 'Modified' },
  { field: 'created', label: 'Created' },
  { field: 'name', label: 'Name' },
  { field: 'size', label: 'Size' },
  { field: 'custom', label: 'Custom' },
];
const STRIP_CARD_SIZE = 104;
const STRIP_CARD_GAP = 8;
const RECENT_GENERATION_CONTROL_WIDTH = 118;
const RECENT_GENERATION_SECTION_GAP = 8;

function clampHeight(value: number, minHeight: number, maxHeight: number): number {
  return Math.max(minHeight, Math.min(maxHeight, value));
}

function normalizePath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').trim();
}

function isTrashPath(value: unknown): boolean {
  const path = normalizePath(value);
  return path === 'User/Trash' || path.startsWith('User/Trash/');
}

function formatBytes(size: unknown): string {
  const bytes = Number(size);
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function imageRevision(image: FilmstripImage): string {
  return [image.dateModified, image.dateCreated, image.size]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('-');
}

function appendRetryParam(url: string, retry: number): string {
  const trimmed = String(url || '').trim();
  if (!trimmed || retry <= 0) return trimmed;
  try {
    const parsed = new URL(trimmed, 'http://umbra.local');
    parsed.searchParams.set('retry', String(retry));
    return parsed.origin === 'http://umbra.local'
      ? `${parsed.pathname}${parsed.search}${parsed.hash}`
      : parsed.toString();
  } catch {
    const withoutRetry = trimmed.replace(/([?&])retry=[^&#]*(&?)/, (_match, prefix, suffix) => (
      suffix ? prefix : ''
    ));
    const separator = withoutRetry.includes('?') ? '&' : '?';
    return `${withoutRetry}${separator}retry=${encodeURIComponent(String(retry))}`;
  }
}

function rememberFilmstripAccentColor(key: string, color: string) {
  if (!key || !color) return;
  if (filmstripAccentColorCache.has(key)) filmstripAccentColorCache.delete(key);
  filmstripAccentColorCache.set(key, color);
  while (filmstripAccentColorCache.size > FILMSTRIP_ACCENT_COLOR_CACHE_LIMIT) {
    const oldest = filmstripAccentColorCache.keys().next().value;
    if (!oldest) break;
    filmstripAccentColorCache.delete(oldest);
  }
}

function sampleFilmstripAccentColor(image: HTMLImageElement): string {
  try {
    const width = Math.max(1, Math.min(20, image.naturalWidth || image.width || 1));
    const height = Math.max(1, Math.min(20, image.naturalHeight || image.height || 1));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return '';
    context.drawImage(image, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height).data;
    let rTotal = 0;
    let gTotal = 0;
    let bTotal = 0;
    let weightTotal = 0;
    for (let index = 0; index < data.length; index += 4) {
      const alpha = data[index + 3] / 255;
      if (alpha < 0.4) continue;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const saturation = max === 0 ? 0 : (max - min) / max;
      if (luminance < 0.08 || luminance > 0.92) continue;
      const weight = alpha * (0.45 + saturation * 1.2) * (1 - Math.abs(luminance - 0.55) * 0.45);
      rTotal += r * weight;
      gTotal += g * weight;
      bTotal += b * weight;
      weightTotal += weight;
    }
    if (weightTotal <= 0) return '';
    return `${Math.round(rTotal / weightTotal)}, ${Math.round(gTotal / weightTotal)}, ${Math.round(bTotal / weightTotal)}`;
  } catch {
    return '';
  }
}

function fallbackThumbnailUrl(image: FilmstripImage, retry = 0): string {
  const path = normalizePath(image.path);
  if (!path) return '';
  const rev = imageRevision(image);
  const base = `/api/fs/thumbnail?path=${encodeURIComponent(path)}&size=small&q=70&fit=cover&lane=filmstrip&defer=1`;
  const versioned = rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
  return appendRetryParam(versioned, retry);
}

function isEditableKeyTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) return false;
  const tagName = element.tagName?.toUpperCase();
  return element.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

type MenuState = {
  x: number;
  y: number;
  targetId: string;
} | null;

type MenuAction = {
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
};

function FilmstripFolderSelector({
  pinnedFolders,
  historyFolders,
  onOpenPinnedFolder,
  onOpenHistoryFolder,
  onRemovePinnedFolder,
  onPinnedDrop,
  onPinnedDropTargetChange,
}: {
  pinnedFolders: NonNullable<FilmstripProps['pinnedFolders']>;
  historyFolders: NonNullable<FilmstripProps['newestFolders']>;
  onOpenPinnedFolder?: (path: string) => void;
  onOpenHistoryFolder?: (path: string) => void;
  onRemovePinnedFolder?: (path: string) => void;
  onPinnedDrop?: (event: DragEvent, destinationPath: string) => void | Promise<void>;
  onPinnedDropTargetChange?: (path: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'pinned' | 'history'>(() => (
    pinnedFolders.length > 0 || historyFolders.length === 0 ? 'pinned' : 'history'
  ));
  const [historyOrder, setHistoryOrder] = useState<string[]>(() => historyFolders.map((folder) => folder.path));
  const selectorRef = useRef<HTMLDivElement | null>(null);
  const panelId = React.useId();
  const totalFolderCount = pinnedFolders.length + historyFolders.length;
  const displayedHistoryFolders = useMemo(() => {
    if (!open) return historyFolders;
    const byPath = new Map(historyFolders.map((folder) => [normalizePath(folder.path).toLowerCase(), folder]));
    const usedPaths = new Set<string>();
    const ordered = historyOrder.flatMap((path) => {
      const key = normalizePath(path).toLowerCase();
      const folder = byPath.get(key);
      if (!folder) return [];
      usedPaths.add(key);
      return [folder];
    });
    for (const folder of historyFolders) {
      const key = normalizePath(folder.path).toLowerCase();
      if (usedPaths.has(key)) continue;
      ordered.push(folder);
    }
    return ordered;
  }, [historyFolders, historyOrder, open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (selectorRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      onPinnedDropTargetChange?.('');
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      onPinnedDropTargetChange?.('');
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onPinnedDropTargetChange, open]);

  const toggleOpen = () => {
    const next = !open;
    if (next) {
      setHistoryOrder(historyFolders.map((folder) => folder.path));
      setView(pinnedFolders.length > 0 || historyFolders.length === 0 ? 'pinned' : 'history');
    }
    if (!next) onPinnedDropTargetChange?.('');
    setOpen(next);
  };

  return (
    <div ref={selectorRef} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        title="Open pinned folders and folder history"
        onClick={toggleOpen}
        onDragEnter={() => {
          if (!open) setHistoryOrder(historyFolders.map((folder) => folder.path));
          setView('pinned');
          setOpen(true);
        }}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded border px-2 text-xs transition-colors',
          open
            ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-white'
            : 'border-zinc-800 bg-zinc-900/70 text-zinc-400 hover:border-zinc-600 hover:text-white',
        )}
      >
        <FolderOpen size={13} />
        <span className="hidden sm:inline">Folders</span>
        <span className="min-w-4 rounded-sm bg-black/30 px-1 text-center text-[10px] text-zinc-400">
          {totalFolderCount}
        </span>
        <ChevronUp size={12} className={cn('transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label="Filmstrip folders"
          className="absolute bottom-[calc(100%+6px)] right-0 z-[10020] w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-zinc-700 bg-zinc-950 shadow-2xl"
        >
          <div className="grid grid-cols-2 gap-1 border-b border-zinc-800 p-1.5" role="tablist" aria-label="Folder list">
            <button
              type="button"
              role="tab"
              aria-selected={view === 'pinned'}
              onClick={() => setView('pinned')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-2 rounded-sm border text-[10px] font-black uppercase tracking-[0.08em] transition-colors',
                view === 'pinned'
                  ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-white'
                  : 'border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-200',
              )}
            >
              <Pin size={12} />
              Pinned
              <span className="text-[9px] text-zinc-500">{pinnedFolders.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'history'}
              onClick={() => setView('history')}
              className={cn(
                'inline-flex h-8 items-center justify-center gap-2 rounded-sm border text-[10px] font-black uppercase tracking-[0.08em] transition-colors',
                view === 'history'
                  ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] text-white'
                  : 'border-transparent text-zinc-500 hover:border-zinc-800 hover:text-zinc-200',
              )}
            >
              <History size={12} />
              History
              <span className="text-[9px] text-zinc-500">{historyFolders.length}</span>
            </button>
          </div>

          <div className="max-h-72 overflow-y-auto p-1.5" role="tabpanel">
            {view === 'pinned' ? (
              pinnedFolders.length > 0 ? pinnedFolders.map((folder) => (
                <div
                  key={folder.path}
                  title={folder.path}
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = event.ctrlKey || event.metaKey ? 'copy' : 'move';
                  }}
                  onDragEnter={() => onPinnedDropTargetChange?.(folder.path)}
                  onDragLeave={() => onPinnedDropTargetChange?.('')}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onPinnedDropTargetChange?.('');
                    void onPinnedDrop?.(event.nativeEvent as DragEvent, folder.path);
                  }}
                  className={cn(
                    'mb-1 flex min-h-11 items-stretch overflow-hidden rounded-sm border last:mb-0',
                    folder.isCurrent
                      ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]'
                      : 'border-zinc-800 bg-zinc-900/45 hover:border-zinc-700 hover:bg-zinc-900/80',
                    folder.isDropActive && 'ring-1 ring-[var(--umbra-accent)]',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpenPinnedFolder?.(folder.path)}
                    className="flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left"
                  >
                    <Pin size={13} className="shrink-0 text-[var(--umbra-accent)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-zinc-200">{folder.label || folder.path}</span>
                      <span className="block truncate text-[10px] text-zinc-600">{folder.path}</span>
                    </span>
                    {folder.isCurrent ? <span className="shrink-0 text-[8px] font-black uppercase text-[var(--umbra-accent)]">Open</span> : null}
                  </button>
                  <button
                    type="button"
                    title="Remove pinned folder"
                    aria-label={`Remove ${folder.label || folder.path} from pinned folders`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemovePinnedFolder?.(folder.path);
                    }}
                    className="inline-flex w-9 shrink-0 items-center justify-center border-l border-zinc-800 text-zinc-600 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <X size={13} />
                  </button>
                </div>
              )) : (
                <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center text-zinc-600">
                  <Pin size={18} />
                  <span className="text-[11px]">No pinned folders</span>
                </div>
              )
            ) : displayedHistoryFolders.length > 0 ? displayedHistoryFolders.map((folder) => (
              <button
                key={folder.path}
                type="button"
                title={folder.path}
                onClick={() => onOpenHistoryFolder?.(folder.path)}
                className={cn(
                  'mb-1 flex min-h-11 w-full items-center gap-2 rounded-sm border px-2.5 py-1.5 text-left last:mb-0',
                  folder.isCurrent
                    ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)]'
                    : 'border-zinc-800 bg-zinc-900/45 hover:border-zinc-700 hover:bg-zinc-900/80',
                )}
              >
                <History size={13} className="shrink-0 text-zinc-500" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-zinc-200">{folder.label || folder.path}</span>
                  <span className="block truncate text-[10px] text-zinc-600">{folder.path}</span>
                </span>
                {folder.isCurrent ? <span className="shrink-0 text-[8px] font-black uppercase text-[var(--umbra-accent)]">Open</span> : null}
              </button>
            )) : (
              <div className="flex min-h-24 flex-col items-center justify-center gap-2 text-center text-zinc-600">
                <History size={18} />
                <span className="text-[11px]">No folder history yet</span>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FilmstripMenu({
  state,
  images,
  selectedIds,
  onClose,
  actions,
}: {
  state: MenuState;
  images: FilmstripImage[];
  selectedIds: Set<string>;
  onClose: () => void;
  actions: MenuAction[];
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state) return;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose, state]);

  useLayoutEffect(() => {
    if (!state || !menuRef.current) return;
    menuRef.current.style.left = `${state.x}px`;
    menuRef.current.style.top = `${state.y}px`;
    menuRef.current.style.visibility = 'hidden';
    const rect = menuRef.current.getBoundingClientRect();
    const boundary = document.querySelector('[data-umbra-context-menu-boundary="workspace"]')?.getBoundingClientRect()
      || new DOMRect(0, 0, window.innerWidth, window.innerHeight);
    const leftEdge = boundary.left + 8;
    const topEdge = boundary.top + 8;
    const rightEdge = Math.max(leftEdge, boundary.right - 8);
    const bottomEdge = Math.max(topEdge, boundary.bottom - 8);
    const openLeft = state.x + rect.width > rightEdge && state.x - rect.width >= leftEdge;
    const openUp = state.y + rect.height > bottomEdge && state.y - rect.height >= topEdge;
    const desiredX = openLeft ? state.x - rect.width : state.x;
    const desiredY = openUp ? state.y - rect.height : state.y;
    const x = Math.min(Math.max(leftEdge, desiredX), Math.max(leftEdge, rightEdge - rect.width));
    const y = Math.min(Math.max(topEdge, desiredY), Math.max(topEdge, bottomEdge - rect.height));
    menuRef.current.style.left = `${x}px`;
    menuRef.current.style.top = `${y}px`;
    menuRef.current.style.maxHeight = `${Math.max(160, bottomEdge - topEdge)}px`;
    menuRef.current.style.visibility = 'visible';
  }, [state, actions.length]);

  if (!state) return null;

  const normalizedTargetId = normalizeFilmstripSelectionId(state.targetId);
  const target = images.find((image) => normalizeFilmstripSelectionId(image.id) === normalizedTargetId);
  const count = getSelectedIdsForTarget(images, selectedIds, state.targetId).length;

  return (
    <div
      ref={menuRef}
      className="fixed z-[10010] w-64 overflow-hidden rounded border border-zinc-700 bg-zinc-950/98 p-1 shadow-2xl backdrop-blur-md"
      style={{ left: state.x, top: state.y, visibility: 'hidden' }}
      role="menu"
    >
      <div className="border-b border-zinc-800 px-2.5 py-2">
        <div className="truncate text-xs font-medium text-zinc-100">{target?.name || 'Selection'}</div>
        <div className="mt-0.5 text-[11px] text-zinc-500">{count} selected</div>
      </div>
      <div className="py-1">
        {actions.map((action, index) => (
          <button
            key={`${action.label}-${index}`}
            type="button"
            disabled={action.disabled}
            onClick={() => {
              if (action.disabled) return;
              action.onClick();
              onClose();
            }}
            className={cn(
              'flex w-full items-center gap-2 rounded-sm px-2.5 py-1.5 text-left text-xs transition-colors',
              action.danger
                ? 'text-red-300 hover:bg-red-500/12 hover:text-red-100'
                : 'text-zinc-300 hover:bg-white/7 hover:text-white',
              action.disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
            )}
            role="menuitem"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center text-zinc-500">
              {action.icon || <MoreHorizontal size={14} />}
            </span>
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilmstripTile({
  image,
  selected,
  displayMode,
  activeWorkspace,
  dropPosition,
  showContextButton,
  selectionMode,
  singleTapOpen,
  onSelect,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  image: FilmstripImage;
  selected: boolean;
  displayMode: 'strip' | 'grid';
  activeWorkspace?: WorkspaceType;
  dropPosition?: FilmstripReorderPosition;
  showContextButton?: boolean;
  selectionMode?: boolean;
  singleTapOpen?: boolean;
  onSelect: (event: React.MouseEvent) => void;
  onOpen: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
  onDragStart: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const retryTimerRef = useRef<number | null>(null);
  const primarySrc = useMemo(() => image.thumbnailUrl || image.url || fallbackThumbnailUrl(image), [
    image.dateCreated,
    image.dateModified,
    image.path,
    image.size,
    image.thumbnailUrl,
    image.url,
  ]);
  const [retry, setRetry] = useState(0);
  const [src, setSrc] = useState(() => primarySrc);
  const [failedPrimary, setFailedPrimary] = useState(false);
  const [imageAccentColor, setImageAccentColor] = useState(() => filmstripAccentColorCache.get(primarySrc) || '');

  useEffect(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setRetry(0);
    setFailedPrimary(false);
    setSrc(primarySrc);
    setImageAccentColor(filmstripAccentColorCache.get(primarySrc) || '');
    return () => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [primarySrc]);

  const fallback = fallbackThumbnailUrl(image, retry);
  const dimensions = image.width && image.height ? `${image.width} x ${image.height}` : '';
  const size = formatBytes(image.size);
  const tooltip = [image.name, normalizePath(image.path), dimensions, size].filter(Boolean).join('\n');
  const isMedia = image.type === 'video' || image.type === 'gif';
  const isLivePreview = normalizePath(image.path).startsWith('umbra-live-generation://');
  const accentStyle: React.CSSProperties = !selected && !isLivePreview && imageAccentColor ? {
    borderColor: `rgba(${imageAccentColor}, 0.34)`,
    background: `linear-gradient(180deg, rgba(${imageAccentColor}, 0.13), rgba(0,0,0,0.34))`,
    boxShadow: `inset 0 1px 0 rgba(${imageAccentColor}, 0.14), 0 0 14px rgba(${imageAccentColor}, 0.09)`,
  } : {};
  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current !== null || retry >= 60) return;
    const delay = Math.min(4000, 450 + retry * 350);
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      setRetry((current) => {
        const next = Math.min(current + 1, 60);
        setSrc(appendRetryParam(primarySrc, next));
        return next;
      });
    }, delay);
  }, [primarySrc, retry]);

  return (
    <button
      type="button"
      draggable={!isLivePreview && !selectionMode && !singleTapOpen}
      data-filmstrip-id={image.id}
      data-active-workspace={activeWorkspace || ''}
      data-umbra-filmstrip-live-preview={isLivePreview ? '1' : '0'}
      title={tooltip}
      data-umbra-filmstrip-selection-mode={selectionMode ? '1' : '0'}
      onClick={(event) => {
        if (singleTapOpen) {
          onOpen();
          return;
        }
        onSelect(event);
      }}
      onDoubleClick={singleTapOpen || selectionMode ? undefined : onOpen}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={accentStyle}
      className={cn(
        'group relative shrink-0 overflow-hidden rounded-lg border bg-black/30 text-left shadow-sm outline-none transition-colors',
        'before:pointer-events-none before:absolute before:inset-0 before:z-10 before:border before:border-white/5',
        displayMode === 'grid' ? 'aspect-square w-full' : 'h-[104px] w-[104px]',
        selected
          ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] shadow-[0_0_0_1px_var(--umbra-accent),0_0_18px_color-mix(in_srgb,var(--umbra-accent)_35%,transparent)]'
          : isLivePreview
            ? 'border-emerald-300/80 bg-emerald-400/10 shadow-[0_0_0_1px_rgba(110,231,183,0.55),0_0_22px_rgba(16,185,129,0.28),inset_0_0_18px_rgba(16,185,129,0.08)] hover:border-emerald-200 hover:bg-emerald-400/15'
            : 'border-white/10 hover:border-white/20 hover:bg-white/[0.04]',
        dropPosition === 'before' && 'ring-2 ring-[var(--umbra-accent)] ring-offset-[-2px] ring-offset-zinc-950',
        dropPosition === 'after' && 'ring-2 ring-[var(--umbra-accent)] ring-offset-2 ring-offset-zinc-950',
        'duration-150 hover:-translate-y-0.5',
        isLivePreview ? 'cursor-pointer' : selectionMode ? 'touch-none select-none' : singleTapOpen ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing',
      )}
    >
      {src ? (
        <img
          src={src}
          alt={image.name}
          loading="lazy"
          decoding="async"
          className="h-full w-full select-none object-cover"
          draggable={false}
          onLoad={(event) => {
            const img = event.currentTarget;
            if (img.naturalWidth <= 2 && img.naturalHeight <= 2) {
              scheduleRetry();
              return;
            }
            if (!isLivePreview) {
              const sampledAccent = filmstripAccentColorCache.get(primarySrc) || sampleFilmstripAccentColor(img);
              if (sampledAccent) {
                rememberFilmstripAccentColor(primarySrc, sampledAccent);
                setImageAccentColor(sampledAccent);
              }
            }
          }}
          onError={() => {
            if (!failedPrimary && image.url && image.url !== src) {
              setFailedPrimary(true);
              setSrc(image.url);
              return;
            }
            if (fallback && fallback !== src) {
              setSrc(fallback);
            }
          }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-zinc-900 text-zinc-600">
          <ImageIcon size={22} />
        </div>
      )}

      {isLivePreview ? (
        <span className="absolute left-1.5 top-1.5 z-20 rounded border border-emerald-300/35 bg-emerald-300/20 px-1.5 py-0.5 text-[10px] font-bold text-emerald-50 shadow-[0_0_12px_rgba(16,185,129,0.35)]">
          LIVE
        </span>
      ) : isMedia ? (
          <span className="absolute left-1.5 top-1.5 z-20 rounded border border-white/10 bg-black/75 px-1.5 py-0.5 text-[10px] font-medium text-zinc-100">
          {image.type === 'video' ? 'VIDEO' : 'GIF'}
        </span>
      ) : null}

      {showContextButton ? (
        <span
          role="button"
          tabIndex={0}
          className="absolute right-1.5 top-1.5 z-30 flex h-7 w-7 items-center justify-center rounded border border-white/10 bg-black/80 text-zinc-300 shadow-sm hover:border-white/25 hover:bg-white/10 hover:text-white"
          aria-label={`Open media menu for ${image.name}`}
          title="Media menu"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onContextMenu(event as unknown as React.MouseEvent);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            event.preventDefault();
            event.stopPropagation();
            onContextMenu(event as unknown as React.MouseEvent);
          }}
        >
          <MoreHorizontal size={15} />
        </span>
      ) : null}

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/92 via-black/55 to-transparent px-1.5 pb-1 pt-5">
        <div className="truncate text-[10px] font-medium text-zinc-100">{image.name}</div>
        {isLivePreview ? (
          <div className="truncate text-[9px] font-semibold text-emerald-200">Streaming preview</div>
        ) : size ? <div className="truncate text-[9px] text-zinc-400">{size}</div> : null}
      </div>
    </button>
  );
}

export function Filmstrip({
  images,
  recentGenerationImages = [],
  recentGenerationExpanded = false,
  onToggleRecentGenerationExpanded,
  selectedIds,
  onSelect,
  onClearSelection,
  onSelectAll,
  selectionMode = false,
  onEnterSelectionMode,
  onExitSelectionMode,
  onDelete,
  onOpen,
  onShowInExplorer,
  onCopyPaths,
  onCopyComfyJson,
  onSendToScanner,
  onOpenWaifuTab,
  onSendToWaifu,
  onRename,
  onAddTag,
  onRestoreFromTrash,
  onDeleteForeverFromTrash,
  onContextMenuRequest,
  onReorder,
  onReorderMany,
  sortField = 'date',
  sortDirection = 'desc',
  onSortChange,
  minHeight = 120,
  maxHeight = 600,
  defaultHeight = 180,
  className = '',
  activeWorkspace,
  displayMode = 'strip',
  fillContainer = false,
  onHeightChange,
  folderLabel = '',
  pinnedFolders = [],
  newestFolders = [],
  onOpenPinnedFolder,
  onOpenNewestFolder,
  onRemovePinnedFolder,
  onPinnedDrop,
  onPinnedDropTargetChange,
  onRefresh,
  onToggleExpanded,
  expanded = false,
  onRequestMore,
}: FilmstripProps) {
  const height = clampHeight(defaultHeight, minHeight, maxHeight);
  const [menuState, setMenuState] = useState<MenuState>(null);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: FilmstripReorderPosition } | null>(null);
  const stripScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollRestoreRef = useRef<{ left: number; top: number; folderLabel: string } | null>(null);
  const lastViewportLoadRequestRef = useRef('');
  const isTouchRemote = typeof document !== 'undefined'
    && (document.documentElement.dataset.umbraRemoteMode === 'phone' || document.documentElement.dataset.umbraRemoteMode === 'tablet');
  const selectedCount = selectedIds.size;
  const visibleRecentGenerationImages = useMemo(
    () => recentGenerationImages.slice(0, recentGenerationExpanded ? 11 : 4),
    [recentGenerationExpanded, recentGenerationImages]
  );
  const recentGenerationSectionWidth = displayMode === 'strip' && visibleRecentGenerationImages.length > 0
    ? RECENT_GENERATION_CONTROL_WIDTH
      + RECENT_GENERATION_SECTION_GAP
      + (visibleRecentGenerationImages.length * (STRIP_CARD_SIZE + STRIP_CARD_GAP))
      + 14
    : 0;
  const stripVirtualizer = useVirtualizer({
    horizontal: true,
    count: images.length,
    getScrollElement: () => stripScrollRef.current,
    getItemKey: (index) => normalizeFilmstripSelectionId(images[index]?.id || images[index]?.path || index),
    estimateSize: () => STRIP_CARD_SIZE + STRIP_CARD_GAP,
    paddingStart: recentGenerationSectionWidth,
    overscan: 8,
  });
  const stripVirtualItems = stripVirtualizer.getVirtualItems();

  const handleStripWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    if (displayMode !== 'strip' || event.ctrlKey) return;
    const node = stripScrollRef.current;
    if (!node) return;
    const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
    if (maxLeft <= 0) return;

    const unitScale = event.deltaMode === 1
      ? 40
      : event.deltaMode === 2
        ? Math.max(1, node.clientWidth)
        : 1;
    const dominantDelta = Math.abs(event.deltaY) >= Math.abs(event.deltaX)
      ? event.deltaY
      : event.deltaX;
    const scrollDelta = dominantDelta * unitScale;
    if (Math.abs(scrollDelta) < 0.5) return;

    const nextLeft = Math.max(0, Math.min(maxLeft, node.scrollLeft + scrollDelta));
    if (Math.abs(nextLeft - node.scrollLeft) < 0.5) return;
    event.preventDefault();
    event.stopPropagation();
    node.scrollLeft = nextLeft;
  }, [displayMode]);

  useLayoutEffect(() => {
    const pending = pendingScrollRestoreRef.current;
    if (pending && pending.folderLabel === folderLabel) {
      pendingScrollRestoreRef.current = null;
      window.requestAnimationFrame(() => {
        const node = stripScrollRef.current;
        if (!node) return;
        const maxLeft = Math.max(0, node.scrollWidth - node.clientWidth);
        const maxTop = Math.max(0, node.scrollHeight - node.clientHeight);
        node.scrollLeft = Math.min(pending.left, maxLeft);
        node.scrollTop = Math.min(pending.top, maxTop);
      });
    } else if (pending) {
      pendingScrollRestoreRef.current = null;
    }

    return () => {
      const node = stripScrollRef.current;
      if (!node) return;
      pendingScrollRestoreRef.current = {
        left: node.scrollLeft,
        top: node.scrollTop,
        folderLabel,
      };
    };
  }, [displayMode, folderLabel]);

  useEffect(() => {
    if (!onRequestMore || displayMode !== 'strip' || images.length <= 0) return;
    const lastVirtualIndex = stripVirtualItems.at(-1)?.index ?? -1;
    if (lastVirtualIndex < 0) return;
    const loadAhead = 10;
    if (images.length - 1 - lastVirtualIndex > loadAhead) return;
    const requestKey = `${folderLabel}|${images.length}`;
    if (lastViewportLoadRequestRef.current === requestKey) return;
    lastViewportLoadRequestRef.current = requestKey;
    onRequestMore();
  }, [displayMode, folderLabel, images.length, onRequestMore, stripVirtualItems]);

  useEffect(() => {
    const effectiveHeight = fillContainer ? Math.max(minHeight, height) : height;
    onHeightChange?.(effectiveHeight);
  }, [fillContainer, height, minHeight, onHeightChange]);

  const orderedSelectionImages = useMemo(() => {
    if (visibleRecentGenerationImages.length === 0) return images;
    const byId = new Map<string, FilmstripImage>();
    for (const image of visibleRecentGenerationImages) {
      const id = normalizeFilmstripSelectionId(image.id);
      if (id && !byId.has(id)) byId.set(id, image);
    }
    for (const image of images) {
      const id = normalizeFilmstripSelectionId(image.id);
      if (id && !byId.has(id)) byId.set(id, image);
    }
    return Array.from(byId.values());
  }, [images, visibleRecentGenerationImages]);

  const selectedIdsForTarget = useCallback((targetId: string) => (
    getSelectedIdsForTarget(orderedSelectionImages, selectedIds, targetId)
  ), [orderedSelectionImages, selectedIds]);
  const normalizedSelectedIds = useMemo(() => new Set(
    Array.from(selectedIds || [])
      .map((id) => normalizeFilmstripSelectionId(id))
      .filter(Boolean)
  ), [selectedIds]);

  const selectedImagesForTarget = useCallback((targetId: string) => {
    const ids = new Set(selectedIdsForTarget(targetId).map((id) => normalizeFilmstripSelectionId(id)));
    return orderedSelectionImages.filter((image) => ids.has(normalizeFilmstripSelectionId(image.id)));
  }, [orderedSelectionImages, selectedIdsForTarget]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableKeyTarget(event.target)) return;
      if (event.key !== 'Delete' && event.key !== 'Backspace') return;
      if (document.querySelector('[data-umbra-gallery-viewer]')) return;
      if (selectedIds.size <= 0) return;
      event.preventDefault();
      event.stopPropagation();
      const ids = images
        .map((image) => image.id)
        .filter((id) => normalizedSelectedIds.has(normalizeFilmstripSelectionId(id)));
      if (ids.length > 0) onDelete?.(ids);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [images, normalizedSelectedIds, onDelete, selectedIds.size]);

  const menuActions = useMemo<MenuAction[]>(() => {
    if (!menuState) return [];
    const targetId = menuState.targetId;
    const ids = selectedIdsForTarget(targetId);
    const selectedImages = selectedImagesForTarget(targetId);
    const selectedPaths = selectedImages.map((image) => normalizePath(image.path)).filter(Boolean);
    const selectedImagePaths = selectedImages
      .filter((image) => image.type !== 'video')
      .map((image) => normalizePath(image.path))
      .filter(Boolean);
    const allTrash = selectedPaths.length > 0 && selectedPaths.every(isTrashPath);
    const normalizedTargetId = normalizeFilmstripSelectionId(targetId);
    const target = images.find((image) => normalizeFilmstripSelectionId(image.id) === normalizedTargetId);

    if (allTrash) {
      return [
        {
          label: ids.length > 1 ? `Restore ${ids.length} Items` : 'Restore',
          icon: <RotateCcw size={14} />,
          disabled: !onRestoreFromTrash,
          onClick: () => onRestoreFromTrash?.(ids),
        },
        {
          label: ids.length > 1 ? `Delete Permanently (${ids.length})` : 'Delete Permanently',
          icon: <Trash2 size={14} />,
          danger: true,
          disabled: !onDeleteForeverFromTrash,
          onClick: () => onDeleteForeverFromTrash?.(ids),
        },
      ];
    }

    const reorderIds = images
      .filter((image) => {
        const imageId = normalizeFilmstripSelectionId(image.id);
        return normalizedSelectedIds.has(imageId) && imageId !== normalizedTargetId;
      })
      .map((image) => image.id);

    return [
      {
        label: 'Open in Gallery',
        icon: <ImageIcon size={14} />,
        disabled: !target || !onOpen,
        onClick: () => target && onOpen?.(target),
      },
      ...(onShowInExplorer ? [{
        label: 'Show in File Explorer',
        icon: <FolderOpen size={14} />,
        disabled: selectedPaths.length === 0,
        onClick: () => onShowInExplorer(ids),
      }] : []),
      {
        label: ids.length > 1 ? `Copy ${ids.length} Paths` : 'Copy Path',
        icon: <Copy size={14} />,
        disabled: !onCopyPaths || selectedPaths.length === 0,
        onClick: () => onCopyPaths?.(ids),
      },
      {
        label: 'Copy Workflow JSON',
        icon: <FileJson size={14} />,
        disabled: !onCopyComfyJson || selectedPaths.length === 0,
        onClick: () => onCopyComfyJson?.(ids),
      },
      {
        label: 'Send to Metadata Scanner',
        icon: <ScanSearch size={14} />,
        disabled: !onSendToScanner || selectedPaths.length === 0,
        onClick: () => onSendToScanner?.(ids),
      },
      {
        label: 'Send to Waifu Diffusion',
        icon: <Send size={14} />,
        disabled: !onSendToWaifu || selectedImagePaths.length === 0,
        onClick: () => {
          onOpenWaifuTab?.();
          onSendToWaifu?.(ids);
        },
      },
      {
        label: reorderIds.length > 1 ? `Reorder ${reorderIds.length} Before` : 'Reorder Selected Before',
        icon: <Undo2 size={14} />,
        disabled: reorderIds.length === 0 || (!onReorder && !onReorderMany),
        onClick: () => {
          if (reorderIds.length > 1 && onReorderMany) onReorderMany(reorderIds, targetId, 'before');
          else if (reorderIds.length === 1) onReorder?.(reorderIds[0], targetId, 'before');
        },
      },
      {
        label: reorderIds.length > 1 ? `Reorder ${reorderIds.length} After` : 'Reorder Selected After',
        icon: <Undo2 size={14} />,
        disabled: reorderIds.length === 0 || (!onReorder && !onReorderMany),
        onClick: () => {
          if (reorderIds.length > 1 && onReorderMany) onReorderMany(reorderIds, targetId, 'after');
          else if (reorderIds.length === 1) onReorder?.(reorderIds[0], targetId, 'after');
        },
      },
      {
        label: 'Rename',
        icon: <MoreHorizontal size={14} />,
        disabled: !onRename || selectedPaths.length === 0,
        onClick: () => onRename?.(ids),
      },
      {
        label: ids.length > 1 ? `Edit Tags (${ids.length})` : 'Edit Tags',
        icon: <Tags size={14} />,
        disabled: !onAddTag || ids.length === 0,
        onClick: () => onAddTag?.(ids),
      },
      {
        label: ids.length > 1 ? `Delete ${ids.length} Items` : 'Delete',
        icon: <Trash2 size={14} />,
        danger: true,
        disabled: !onDelete || ids.length === 0,
        onClick: () => onDelete?.(ids),
      },
    ];
  }, [
    images,
    menuState,
    onAddTag,
    onCopyComfyJson,
    onCopyPaths,
    onDelete,
    onDeleteForeverFromTrash,
    onOpen,
    onOpenWaifuTab,
    onRename,
    onReorder,
    onReorderMany,
    onRestoreFromTrash,
    onSendToScanner,
    onSendToWaifu,
    onShowInExplorer,
    normalizedSelectedIds,
    selectedIdsForTarget,
    selectedImagesForTarget,
  ]);

  const handleDragStart = useCallback((event: React.DragEvent, image: FilmstripImage) => {
    const ids = selectedIdsForTarget(image.id);
    const normalizedIds = new Set(ids.map((id) => normalizeFilmstripSelectionId(id)));
    const selectedImages = images.filter((entry) => normalizedIds.has(normalizeFilmstripSelectionId(entry.id)));
    const paths = selectedImages.map((entry) => normalizePath(entry.path)).filter(Boolean);
    const desktopBridge = (window as unknown as { umbraDesktop?: { startDragOut?: (data: { paths: string[] }) => void } }).umbraDesktop;

    if (event.altKey && desktopBridge?.startDragOut && paths.length > 0) {
      desktopBridge.startDragOut({ paths });
      return;
    }

    const lightImages = selectedImages.map((entry) => ({
      id: entry.id,
      uid: entry.uid,
      name: entry.name,
      path: entry.path,
      relativePath: entry.path,
      url: entry.url,
      thumbnailUrl: entry.thumbnailUrl,
      type: entry.type,
      width: entry.width,
      height: entry.height,
      size: entry.size,
    }));
    const imageId = normalizeFilmstripSelectionId(image.id);
    const lightImage = lightImages.find((entry) => normalizeFilmstripSelectionId(entry.id) === imageId) || lightImages[0] || {
      id: image.id,
      name: image.name,
      path: image.path,
      relativePath: image.path,
      type: image.type,
    };
    const payload = {
      source: 'filmstrip',
      type: ids.length > 1 ? 'multi-select' : 'filmstrip-image',
      image: lightImage,
      images: lightImages,
      paths,
    };

    event.dataTransfer.effectAllowed = 'all';
    event.dataTransfer.setData(GALLERY_DRAG_PATHS_MIME, JSON.stringify(paths));
    event.dataTransfer.setData('application/json', JSON.stringify(payload));
    if (image.url || image.thumbnailUrl) {
      const url = String(image.url || image.thumbnailUrl || '');
      event.dataTransfer.setData('text/plain', url);
      event.dataTransfer.setData('text/uri-list', url);
    }

    setDragIds(ids);
    window.dispatchEvent(new CustomEvent('umbra:filmstrip-drag-start', {
      detail: { count: selectedImages.length, paths },
    }));
  }, [images, selectedIdsForTarget]);

  const handleDropOnTile = useCallback((event: React.DragEvent, targetId: string) => {
    if (dragIds.length <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const position: FilmstripReorderPosition = (event.clientX - rect.left) < (rect.width / 2) ? 'before' : 'after';

    if (dragIds.includes(targetId)) {
      setDragIds([]);
      setDropTarget(null);
      return;
    }

    if (dragIds.length > 1 && onReorderMany) {
      onReorderMany(dragIds, targetId, position);
    } else if (dragIds.length === 1 && onReorder) {
      onReorder(dragIds[0], targetId, position);
    }

    setDragIds([]);
    setDropTarget(null);
  }, [dragIds, onReorder, onReorderMany]);

  const endDrag = useCallback(() => {
    setDragIds([]);
    setDropTarget(null);
    window.dispatchEvent(new CustomEvent('umbra:filmstrip-drag-end'));
  }, []);

  return (
    <div
      className={cn(
        'filmstrip-container relative flex flex-col border-t border-zinc-800 bg-zinc-950/96 text-zinc-100 backdrop-blur-sm',
        className,
      )}
      style={{ height: fillContainer ? '100%' : `${height}px` }}
    >
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-zinc-800/80 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-zinc-800 bg-zinc-900/80 text-zinc-400">
            <ImageIcon size={14} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-xs font-medium text-zinc-200">{folderLabel || 'No folder'}</span>
              <span className="shrink-0 text-[11px] text-zinc-500">
                {images.length} {images.length === 1 ? 'image' : 'images'}
              </span>
              {selectedCount > 0 ? (
                <span className="shrink-0 text-[11px] text-[var(--umbra-accent)]">
                  {selectedCount} selected
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <FilmstripFolderSelector
            pinnedFolders={pinnedFolders}
            historyFolders={newestFolders}
            onOpenPinnedFolder={onOpenPinnedFolder}
            onOpenHistoryFolder={onOpenNewestFolder}
            onRemovePinnedFolder={onRemovePinnedFolder}
            onPinnedDrop={onPinnedDrop}
            onPinnedDropTargetChange={onPinnedDropTargetChange}
          />

          {isTouchRemote ? (
            selectionMode ? (
              <>
                <button
                  type="button"
                  onClick={onExitSelectionMode}
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--umbra-accent)] bg-[var(--umbra-accent-glow)] px-2 py-1 text-xs text-white"
                >
                  <CheckSquare size={13} />
                  Done
                </button>
                <button
                  type="button"
                  onClick={onSelectAll}
                  disabled={images.length === 0}
                  className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  disabled={selectedCount === 0}
                  className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-40"
                >
                  Clear
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={onEnterSelectionMode}
                disabled={images.length === 0}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                <CheckSquare size={13} />
                Select all
              </button>
            )
          ) : selectedCount > 0 ? (
            <button
              type="button"
              onClick={onClearSelection}
              className="rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              Clear
            </button>
          ) : (
            <button
              type="button"
              onClick={onSelectAll}
              disabled={images.length === 0}
              className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-white/5 hover:text-white disabled:opacity-40"
            >
              Select all
            </button>
          )}

          <select
            value={sortField}
            onChange={(event) => onSortChange?.(event.target.value as SortField, sortDirection)}
            className="h-7 rounded border border-zinc-800 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-[var(--umbra-accent)]"
            title="Sort field"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.field} value={option.field}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => onSortChange?.(sortField, sortDirection === 'asc' ? 'desc' : 'asc')}
            className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:bg-white/5 hover:text-white"
            title={sortDirection === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortDirection === 'asc' ? <ArrowUpAZ size={14} /> : <ArrowDownAZ size={14} />}
          </button>

          {onToggleExpanded ? (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="hidden rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white md:inline-flex"
            >
              {expanded ? 'Collapse' : 'Expand'}
            </button>
          ) : null}

          <button
            type="button"
            onClick={onRefresh}
            className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:bg-white/5 hover:text-white"
            title="Refresh filmstrip"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div
        ref={stripScrollRef}
        className={cn(
          'min-h-0 flex-1',
          displayMode === 'grid'
            ? 'overflow-y-auto overflow-x-hidden p-2'
            : 'overflow-x-auto overflow-y-hidden px-3 py-2',
        )}
        onDragLeave={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
          setDropTarget(null);
        }}
        onWheel={handleStripWheel}
      >
        {images.length === 0 && visibleRecentGenerationImages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-zinc-500">
            No images in filmstrip
          </div>
        ) : displayMode === 'strip' ? (
          <div
            className="relative h-full"
            style={{ width: stripVirtualizer.getTotalSize() }}
            data-umbra-virtualized-filmstrip
          >
            {visibleRecentGenerationImages.length > 0 ? (
              <div
                className="absolute left-0 top-0 flex h-full items-stretch gap-2 pr-3"
                style={{ width: recentGenerationSectionWidth }}
                data-umbra-filmstrip-recent-generations=""
              >
                <button
                  type="button"
                  onClick={onToggleRecentGenerationExpanded}
                  className="flex h-[104px] w-[118px] shrink-0 flex-col justify-between rounded-lg border border-emerald-300/30 bg-emerald-400/[0.07] px-2.5 py-2 text-left text-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(16,185,129,0.12)] transition hover:border-emerald-200/55 hover:bg-emerald-400/[0.11]"
                  title={recentGenerationExpanded ? 'Show compact recent generations' : 'Show more recent generations'}
                >
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-emerald-200/85">Generations</span>
                  <span className="text-[18px] font-black leading-none text-emerald-50">
                    {visibleRecentGenerationImages.length}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-200/75">
                    {recentGenerationExpanded ? 'Expanded' : 'Compact'}
                  </span>
                </button>
                <div className="flex h-full items-stretch gap-2">
                  {visibleRecentGenerationImages.map((image) => (
                    <FilmstripTile
                      key={`recent-generation-${image.id}`}
                      image={image}
                      selected={normalizedSelectedIds.has(normalizeFilmstripSelectionId(image.id))}
                      displayMode={displayMode}
                      activeWorkspace={activeWorkspace}
                      showContextButton={isTouchRemote}
                      selectionMode={isTouchRemote && selectionMode}
                      singleTapOpen
                      onSelect={(event) => onSelect(image.id, event)}
                      onOpen={() => onOpen?.(image)}
                      onContextMenu={(event) => {
                        event.preventDefault();
                        if (onContextMenuRequest) {
                          onContextMenuRequest({
                            x: event.clientX,
                            y: event.clientY,
                            targetId: image.id,
                            ids: [image.id],
                            images: [image],
                          });
                        } else {
                          setMenuState({ x: event.clientX, y: event.clientY, targetId: image.id });
                        }
                      }}
                      onDragStart={(event) => event.preventDefault()}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => event.preventDefault()}
                      onDragEnd={endDrag}
                    />
                  ))}
                </div>
                <div className="h-[104px] w-px shrink-0 bg-gradient-to-b from-transparent via-emerald-300/35 to-transparent" />
              </div>
            ) : null}
            {stripVirtualItems.map((virtualItem) => {
              const image = images[virtualItem.index];
              if (!image) return null;
              return (
                <div
                  key={normalizeFilmstripSelectionId(image.id || image.path || virtualItem.key)}
                  className="absolute top-0"
                  style={{ transform: `translateX(${virtualItem.start}px)` }}
                >
                  <FilmstripTile
                    image={image}
                    selected={normalizedSelectedIds.has(normalizeFilmstripSelectionId(image.id))}
                    displayMode={displayMode}
                    activeWorkspace={activeWorkspace}
                    dropPosition={dropTarget?.id === image.id ? dropTarget.position : undefined}
                    showContextButton={isTouchRemote}
                    selectionMode={isTouchRemote && selectionMode}
                    singleTapOpen={isTouchRemote && !selectionMode}
                    onSelect={(event) => onSelect(image.id, event)}
                    onOpen={() => onOpen?.(image)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      if (onContextMenuRequest) {
                        const ids = selectedIdsForTarget(image.id);
                        const idSet = new Set(ids.map((id) => normalizeFilmstripSelectionId(id)));
                        onContextMenuRequest({
                          x: event.clientX,
                          y: event.clientY,
                          targetId: image.id,
                          ids,
                          images: images.filter((entry) => idSet.has(normalizeFilmstripSelectionId(entry.id))),
                        });
                      } else {
                        setMenuState({ x: event.clientX, y: event.clientY, targetId: image.id });
                      }
                    }}
                    onDragStart={(event) => handleDragStart(event, image)}
                    onDragOver={(event) => {
                      if (dragIds.length <= 0) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      const position: FilmstripReorderPosition = (event.clientX - rect.left) < (rect.width / 2) ? 'before' : 'after';
                      setDropTarget({ id: image.id, position });
                    }}
                    onDrop={(event) => handleDropOnTile(event, image.id)}
                    onDragEnd={endDrag}
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <div
            className={cn(
              'grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2',
            )}
          >
            {images.map((image) => (
              <FilmstripTile
                key={image.id}
                image={image}
                selected={normalizedSelectedIds.has(normalizeFilmstripSelectionId(image.id))}
                displayMode={displayMode}
                activeWorkspace={activeWorkspace}
                dropPosition={dropTarget?.id === image.id ? dropTarget.position : undefined}
                showContextButton={isTouchRemote}
                selectionMode={isTouchRemote && selectionMode}
                singleTapOpen={isTouchRemote && !selectionMode}
                onSelect={(event) => onSelect(image.id, event)}
                onOpen={() => onOpen?.(image)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (onContextMenuRequest) {
                    const ids = selectedIdsForTarget(image.id);
                    const idSet = new Set(ids.map((id) => normalizeFilmstripSelectionId(id)));
                    onContextMenuRequest({
                      x: event.clientX,
                      y: event.clientY,
                      targetId: image.id,
                      ids,
                      images: images.filter((entry) => idSet.has(normalizeFilmstripSelectionId(entry.id))),
                    });
                  } else {
                    setMenuState({ x: event.clientX, y: event.clientY, targetId: image.id });
                  }
                }}
                onDragStart={(event) => handleDragStart(event, image)}
                onDragOver={(event) => {
                  if (dragIds.length <= 0) return;
                  event.preventDefault();
                  const rect = event.currentTarget.getBoundingClientRect();
                  const position: FilmstripReorderPosition = (event.clientX - rect.left) < (rect.width / 2) ? 'before' : 'after';
                  setDropTarget({ id: image.id, position });
                }}
                onDrop={(event) => handleDropOnTile(event, image.id)}
                onDragEnd={endDrag}
              />
            ))}
          </div>
        )}
      </div>

      {!onContextMenuRequest ? (
        <FilmstripMenu
          state={menuState}
          images={images}
          selectedIds={selectedIds}
          onClose={() => setMenuState(null)}
          actions={menuActions}
        />
      ) : null}
    </div>
  );
}

export default Filmstrip;
