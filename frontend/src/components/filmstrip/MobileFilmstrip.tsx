import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDownAZ, ArrowUpAZ, Check, CheckSquare, FolderOpen, GalleryHorizontalEnd, History, Image as ImageIcon, MoreHorizontal, Pin, RefreshCw, SkipForward, SlidersHorizontal } from 'lucide-react';
import { ContextMenu } from '@/components/ui/ContextMenu';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { FilmstripTile, type FilmstripImage, type FilmstripProps, type SortField } from './Filmstrip';
import { normalizeFilmstripSelectionId } from './filmstripSelection';

export const MOBILE_FILMSTRIP_HEIGHT = 72;
const TILE_SPAN = 68;
const SORT_FIELDS: Array<{ field: SortField; label: string }> = [
  { field: 'date', label: 'Modified' }, { field: 'created', label: 'Created' },
  { field: 'name', label: 'Name' }, { field: 'size', label: 'Size' }, { field: 'custom', label: 'Custom' },
];
const parentPath = (path: string) => path.replace(/\\/g, '/').replace(/\/[^/]+$/, '');

// Only the presentation is mobile-specific. Feeds, selection, viewer, metadata,
// generation tracking, and actions remain owned by UmbraFilmstrip/Gallery.
export function MobileFilmstrip(props: FilmstripProps) {
  const {
    images, recentGenerationImages = [], liveGenerationImage, recentGenerationsVisible = true,
    recentGenerationExpanded = false, selectedIds, selectionMode, folderPath = '', folderLabel,
    sortField = 'created', sortDirection = 'asc', pinnedFolders = [], newestFolders = [],
  } = props;
  const scrollRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLButtonElement>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [lastOpenedId, setLastOpenedId] = useState('');
  const recent = useMemo(() => recentGenerationsVisible
    ? recentGenerationImages.slice(0, recentGenerationExpanded ? 11 : 4) : [],
  [recentGenerationImages, recentGenerationExpanded, recentGenerationsVisible]);
  const media = useMemo(() => {
    const unique = new Map<string, FilmstripImage>();
    for (const image of [...(liveGenerationImage ? [liveGenerationImage] : []), ...recent, ...images]) {
      const key = normalizeFilmstripSelectionId(image.id);
      if (!unique.has(key)) unique.set(key, image);
    }
    return [...unique.values()];
  }, [images, recent, liveGenerationImage]);
  const selected = useMemo(() => new Set([...selectedIds].map(normalizeFilmstripSelectionId)), [selectedIds]);
  const selectable = media.filter((image) => image !== liveGenerationImage);
  const selectedMedia = selectable.filter((image) => selected.has(normalizeFilmstripSelectionId(image.id)));
  const target = selectedMedia.at(-1) || selectable.find((image) => image.id === lastOpenedId) || selectable[0];
  const virtualizer = useVirtualizer({
    horizontal: true, count: media.length, getScrollElement: () => scrollRef.current,
    estimateSize: () => TILE_SPAN, getItemKey: (index) => media[index]?.id || index, overscan: 4,
  });

  useEffect(() => { props.onHeightChange?.(MOBILE_FILMSTRIP_HEIGHT); }, [props.onHeightChange]);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [folderPath, recentGenerationsVisible]);

  const openActions = (image: FilmstripImage, position?: { x: number; y: number }) => {
    if (image === liveGenerationImage) return;
    const batch = selected.has(normalizeFilmstripSelectionId(image.id)) ? selectedMedia : [image];
    const anchor = controlsRef.current?.getBoundingClientRect();
    props.onContextMenuRequest?.({
      x: position?.x ?? anchor?.left ?? 8, y: position?.y ?? anchor?.top ?? 8,
      targetId: image.id, ids: batch.map((item) => item.id), images: batch,
    });
  };
  const folders: ContextMenuItem[] = [
    { label: 'Latest generations', icon: <History size={16} />, badge: props.followLatest ? 'Following' : undefined,
      disabled: !props.onOpenLatestFolder, action: props.onOpenLatestFolder },
    { label: 'Open current folder', icon: <FolderOpen size={16} />, disabled: !folderPath, action: () => props.onOpenFolder?.(folderPath) },
    ...pinnedFolders.map((folder): ContextMenuItem => ({
      label: folder.label, i18nSkip: true, icon: <Pin size={16} />, badge: folder.unreadCount || undefined,
      children: [
        { label: 'Browse folder', action: () => props.onOpenPinnedFolder?.(folder.path) },
        { label: 'Open in Gallery', action: () => props.onOpenFolder?.(folder.path) },
        { label: 'Unpin folder', action: () => props.onRemovePinnedFolder?.(folder.path) },
      ],
    })),
    ...newestFolders.map((folder): ContextMenuItem => ({
      label: folder.label, description: folder.path, i18nSkip: true, icon: <History size={16} />,
      badge: folder.unreadCount || undefined, action: () => props.onOpenNewestFolder?.(folder.path),
    })),
    { label: 'Clear folder notifications', disabled: !props.unreadFolderMediaCount, action: () => props.onClearFolderNotifications?.() },
  ];
  const menuItems: ContextMenuItem[] = [
    { label: 'View image', icon: <ImageIcon size={16} />, disabled: !target, action: () => target && props.onOpen?.(target) },
    { label: 'Open image folder', icon: <FolderOpen size={16} />, disabled: !target, action: () => target && props.onOpenFolder?.(parentPath(target.path)) },
    { label: 'Image actions', icon: <MoreHorizontal size={16} />, badge: selectedMedia.length || undefined,
      disabled: !target, action: () => target && openActions(target) },
    { separator: true },
    { label: selectionMode ? 'Done selecting' : 'Select images', icon: <CheckSquare size={16} />,
      disabled: !selectionMode && selectable.length === 0, action: selectionMode ? props.onExitSelectionMode : props.onEnterSelectionMode },
    ...(selectionMode ? [
      { label: 'Select all', action: props.onSelectAll, disabled: selectable.length === 0 },
      { label: 'Clear selection', action: props.onClearSelection, disabled: selectedMedia.length === 0 },
    ] satisfies ContextMenuItem[] : []),
    { label: 'Folders', icon: <FolderOpen size={16} />, badge: props.unreadFolderMediaCount || undefined, children: folders },
    { label: 'Sort', icon: <ArrowDownAZ size={16} />, children: [
      ...SORT_FIELDS.map(({ field, label }): ContextMenuItem => ({
        label, icon: field === sortField ? <Check size={16} /> : undefined,
        action: () => props.onSortChange?.(field, sortDirection),
      })),
      { separator: true },
      { label: sortDirection === 'asc' ? 'Ascending' : 'Descending',
        icon: sortDirection === 'asc' ? <ArrowUpAZ size={16} /> : <ArrowDownAZ size={16} />,
        action: () => props.onSortChange?.(sortField, sortDirection === 'asc' ? 'desc' : 'asc') },
    ] },
    { label: recentGenerationsVisible ? 'Hide recent generations' : 'Show recent generations', icon: <GalleryHorizontalEnd size={16} />,
      action: props.onToggleRecentGenerationsVisible },
    ...(recentGenerationsVisible ? [{
      label: recentGenerationExpanded ? 'Show fewer recent generations' : 'Show more recent generations',
      action: props.onToggleRecentGenerationExpanded,
    }] satisfies ContextMenuItem[] : []),
    { label: props.skipGenerationPending ? 'Skipping generation…' : 'Skip current generation', icon: <SkipForward size={16} />,
      disabled: !props.canSkipGeneration || props.skipGenerationPending, action: props.onSkipGeneration },
    { label: 'Refresh filmstrip', icon: <RefreshCw size={16} />, action: props.onRefresh },
  ];

  return <section aria-label="Generation filmstrip" data-umbra-mobile-filmstrip="" className="glass-panel filmstrip-container flex min-w-0" style={{ height: MOBILE_FILMSTRIP_HEIGHT }}>
    <button ref={controlsRef} type="button" aria-label="Filmstrip controls" aria-haspopup="menu" aria-expanded={Boolean(menuPosition)}
      onClick={() => { const rect = controlsRef.current!.getBoundingClientRect(); setMenuPosition({ x: rect.left, y: rect.top }); }}
      data-active={selectionMode || Boolean(menuPosition) ? '1' : '0'}
      className="umbra-surface-soft relative flex w-11 shrink-0 flex-col items-center justify-center gap-1">
      {selectionMode ? <CheckSquare size={16} /> : <SlidersHorizontal size={16} />}
      <span className="font-mono text-[10px] leading-none tabular-nums">{selectedMedia.length || selectable.length}</span>
      {props.unreadFolderMediaCount ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[var(--umbra-accent)]" /> : null}
    </button>
    <div ref={scrollRef} className="min-w-0 flex-1 touch-pan-x overflow-x-auto overflow-y-hidden p-1" style={{ overscrollBehaviorX: 'contain' }}>
      {media.length ? <div className="relative h-16" style={{ width: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((entry) => {
          const image = media[entry.index];
          return <div key={image.id} className="absolute left-0 top-0" style={{ transform: `translateX(${entry.start}px)` }}>
            <FilmstripTile image={image} selected={selected.has(normalizeFilmstripSelectionId(image.id))} compact
              activeWorkspace={props.activeWorkspace} displayMode="strip" selectionMode={selectionMode}
              singleTapOpen={!selectionMode || image === liveGenerationImage}
              onOpen={() => { setLastOpenedId(image.id); props.onOpen?.(image); }}
              onSelect={(event) => props.onSelect(image.id, event)}
              onContextMenu={(event) => { event.preventDefault(); openActions(image, { x: event.clientX, y: event.clientY }); }}
              onDragStart={(event) => event.preventDefault()} onDragOver={() => {}} onDrop={() => {}} onDragEnd={() => {}} />
          </div>;
        })}
      </div> : <div role="status" className="flex h-full items-center px-2 text-xs text-zinc-500">{props.statusMessage || (props.canSkipGeneration ? 'Generating…' : 'Your generations appear here')}</div>}
    </div>
    {props.statusMessage && media.length > 0 ? <span role="status" className="sr-only">{props.statusMessage}</span> : null}
    <ContextMenu isOpen={Boolean(menuPosition)} position={menuPosition || { x: 0, y: 0 }} items={menuItems}
      onClose={() => setMenuPosition(null)} presentation="touch-sheet" title="Filmstrip"
      subtitle={[folderLabel, selectedMedia.length ? `${selectedMedia.length} selected` : '', props.statusMessage].filter(Boolean).join(' · ')} />
  </section>;
}
