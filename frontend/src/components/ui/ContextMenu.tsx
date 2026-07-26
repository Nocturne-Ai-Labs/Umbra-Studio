'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { Portal } from './Portal';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  boundarySelector?: string;
  title?: string;
  subtitle?: string;
}

const MENU_MARGIN = 8;
const SUBMENU_GAP = 4;

function getMenuBoundary(selector?: string): DOMRect {
  if (typeof window === 'undefined') {
    return {
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  }
  const element = selector ? document.querySelector(selector) : document.querySelector('[data-umbra-context-menu-boundary="workspace"]');
  if (element) return element.getBoundingClientRect();
  return new DOMRect(0, 0, window.innerWidth, window.innerHeight);
}

function clampMenuPosition(position: { x: number; y: number }, menuRect: DOMRect, boundary: DOMRect) {
  const leftEdge = boundary.left + MENU_MARGIN;
  const topEdge = boundary.top + MENU_MARGIN;
  const rightEdge = Math.max(leftEdge, boundary.right - MENU_MARGIN);
  const bottomEdge = Math.max(topEdge, boundary.bottom - MENU_MARGIN);
  const width = Math.min(menuRect.width || 220, Math.max(220, rightEdge - leftEdge));
  const height = Math.min(menuRect.height || 0, Math.max(0, bottomEdge - topEdge));
  const openLeft = position.x + width > rightEdge && position.x - width >= leftEdge;
  const openUp = position.y + height > bottomEdge && position.y - height >= topEdge;
  const desiredX = openLeft ? position.x - width : position.x;
  const desiredY = openUp ? position.y - height : position.y;
  const x = Math.min(Math.max(leftEdge, desiredX), Math.max(leftEdge, rightEdge - width));
  const y = Math.min(Math.max(topEdge, desiredY), Math.max(topEdge, bottomEdge - height));

  return {
    left: x,
    top: y,
    maxHeight: Math.max(160, bottomEdge - topEdge),
  };
}

function clampSubmenuPosition(anchor: DOMRect, menuRect: DOMRect, boundary: DOMRect) {
  const leftEdge = boundary.left + MENU_MARGIN;
  const topEdge = boundary.top + MENU_MARGIN;
  const rightEdge = Math.max(leftEdge, boundary.right - MENU_MARGIN);
  const bottomEdge = Math.max(topEdge, boundary.bottom - MENU_MARGIN);
  const width = Math.min(menuRect.width || 240, Math.max(220, rightEdge - leftEdge));
  const height = Math.min(menuRect.height || 0, Math.max(0, bottomEdge - topEdge));
  const openLeft = anchor.right + SUBMENU_GAP + width > rightEdge
    && anchor.left - SUBMENU_GAP - width >= leftEdge;
  const desiredX = openLeft
    ? anchor.left - SUBMENU_GAP - width
    : anchor.right + SUBMENU_GAP;
  const desiredY = anchor.top - 6;

  return {
    left: Math.min(Math.max(leftEdge, desiredX), Math.max(leftEdge, rightEdge - width)),
    top: Math.min(Math.max(topEdge, desiredY), Math.max(topEdge, bottomEdge - height)),
    maxHeight: Math.max(160, bottomEdge - topEdge),
  };
}

function normalizeMenuItems(items: ContextMenuItem[]): ContextMenuItem[] {
  const next: ContextMenuItem[] = [];
  for (const item of items) {
    if (item.separator) {
      if (next.length > 0 && !next.at(-1)?.separator) next.push(item);
      continue;
    }
    const children = item.children ? normalizeMenuItems(item.children) : undefined;
    if (item.children && (!children || children.length === 0)) continue;
    next.push(children ? { ...item, children } : item);
  }
  if (next.at(-1)?.separator) next.pop();
  return next;
}

function isMenuCommand(item: ContextMenuItem): item is Exclude<ContextMenuItem, { separator: true }> {
  return !item.separator;
}

function MenuPanel({
  items,
  boundarySelector,
  depth,
  onCloseAll,
  anchorRef,
  onCloseSubmenu,
  rootStyle,
  rootRef,
  title,
  subtitle,
}: {
  items: ContextMenuItem[];
  boundarySelector?: string;
  depth: number;
  onCloseAll: () => void;
  anchorRef?: React.RefObject<HTMLButtonElement>;
  onCloseSubmenu?: () => void;
  rootStyle?: React.CSSProperties;
  rootRef?: React.RefObject<HTMLDivElement>;
  title?: string;
  subtitle?: string;
}) {
  const localRef = useRef<HTMLDivElement | null>(null);
  const panelRef = rootRef || localRef;
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [openIndex, setOpenIndex] = useState(-1);
  const [submenuStyle, setSubmenuStyle] = useState<React.CSSProperties>({
    left: 0,
    top: 0,
    visibility: depth === 0 ? undefined : 'hidden',
  });

  useLayoutEffect(() => {
    if (depth === 0 || !anchorRef?.current || !panelRef.current) return;
    const updatePosition = () => {
      if (!anchorRef.current || !panelRef.current) return;
      const boundary = getMenuBoundary(boundarySelector);
      const anchor = anchorRef.current.getBoundingClientRect();
      const rect = panelRef.current.getBoundingClientRect();
      const next = clampSubmenuPosition(anchor, rect, boundary);
      setSubmenuStyle({
        left: next.left,
        top: next.top,
        maxHeight: next.maxHeight,
        visibility: 'visible',
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [anchorRef, boundarySelector, depth, items.length, panelRef]);

  const focusableIndexes = useMemo(() => (
    items.flatMap((item, index) => (
      isMenuCommand(item) && !item.disabled ? [index] : []
    ))
  ), [items]);
  const focusableIndexKey = focusableIndexes.join(',');

  React.useEffect(() => {
    const firstIndex = focusableIndexes[0];
    if (firstIndex === undefined) return;
    const frame = window.requestAnimationFrame(() => {
      setActiveIndex(firstIndex);
      itemRefs.current[firstIndex]?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [depth, focusableIndexKey]);

  const focusItem = (index: number) => {
    setActiveIndex(index);
    itemRefs.current[index]?.focus();
  };

  const moveFocus = (direction: 1 | -1) => {
    if (focusableIndexes.length === 0) return;
    const currentPosition = focusableIndexes.indexOf(activeIndex);
    const nextPosition = currentPosition < 0
      ? (direction > 0 ? 0 : focusableIndexes.length - 1)
      : (currentPosition + direction + focusableIndexes.length) % focusableIndexes.length;
    focusItem(focusableIndexes[nextPosition]);
  };

  const activateItem = (item: Exclude<ContextMenuItem, { separator: true }>, index: number) => {
    if (item.disabled) return;
    if (item.children?.length) {
      setOpenIndex((current) => current === index ? -1 : index);
      return;
    }
    item.action?.();
    onCloseAll();
  };

  const style = depth === 0 ? rootStyle : submenuStyle;

  return (
    <div
      ref={panelRef}
      data-umbra-context-menu-layer="true"
      className="fixed min-w-[232px] max-w-[min(336px,calc(100vw-16px))] overflow-y-auto rounded-md border border-[var(--umbra-border)] bg-[#05080a]/98 shadow-2xl shadow-black/70 backdrop-blur-xl"
      style={{ ...style, zIndex: 10000 + depth * 2 }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          moveFocus(1);
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          moveFocus(-1);
        } else if (event.key === 'ArrowRight') {
          const item = items[activeIndex];
          if (item && isMenuCommand(item) && item.children?.length) {
            event.preventDefault();
            setOpenIndex(activeIndex);
          }
        } else if (event.key === 'ArrowLeft' && depth > 0) {
          event.preventDefault();
          onCloseSubmenu?.();
        } else if (event.key === 'Enter' || event.key === ' ') {
          const item = items[activeIndex];
          if (item && isMenuCommand(item)) {
            event.preventDefault();
            activateItem(item, activeIndex);
          }
        }
      }}
      role="menu"
      aria-orientation="vertical"
    >
      {depth === 0 && (title || subtitle) ? (
        <div className="border-b border-[var(--umbra-border)] px-3 py-2.5">
          {title ? <div className="truncate text-xs font-bold text-zinc-100">{title}</div> : null}
          {subtitle ? <div className="mt-0.5 truncate text-[10px] uppercase tracking-[0.12em] text-zinc-500">{subtitle}</div> : null}
        </div>
      ) : null}
      <div className="py-1.5">
        {items.map((item, index) => {
          if (item.separator) {
            return <div key={`separator-${index}`} className="mx-2 my-1.5 h-px bg-[var(--umbra-border)]" role="separator" />;
          }
          const hasChildren = Boolean(item.children?.length);
          const isOpen = openIndex === index;
          return (
            <React.Fragment key={`${item.label}-${index}`}>
              <button
                ref={(node) => { itemRefs.current[index] = node; }}
                type="button"
                onClick={() => activateItem(item, index)}
                onPointerEnter={() => {
                  setActiveIndex(index);
                  setOpenIndex(hasChildren ? index : -1);
                }}
                disabled={item.disabled}
                className={`
                  flex min-h-10 w-full items-center gap-3 px-3 py-2 text-left text-sm font-medium transition-colors
                  ${item.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : item.danger
                      ? 'text-red-400 hover:bg-red-500/15 hover:text-red-200'
                      : isOpen
                        ? 'bg-[var(--umbra-accent-glow)] text-white'
                        : 'text-zinc-200 hover:bg-[var(--umbra-accent-glow)] hover:text-white'
                  }
                `}
                role="menuitem"
                aria-haspopup={hasChildren ? 'menu' : undefined}
                aria-expanded={hasChildren ? isOpen : undefined}
              >
                <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center text-zinc-400">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description ? (
                    <span className="mt-0.5 block truncate text-[10px] font-normal text-zinc-500">
                      {item.description}
                    </span>
                  ) : null}
                </span>
                {item.badge !== undefined ? (
                  <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
                    {item.badge}
                  </span>
                ) : null}
                {hasChildren ? <ChevronRight size={14} className="shrink-0 text-zinc-500" /> : null}
              </button>
              {hasChildren && isOpen && typeof document !== 'undefined'
                ? createPortal(
                    <MenuPanel
                      items={item.children!}
                      boundarySelector={boundarySelector}
                      depth={depth + 1}
                      onCloseAll={onCloseAll}
                      anchorRef={{ current: itemRefs.current[index] }}
                      onCloseSubmenu={() => {
                        setOpenIndex(-1);
                        itemRefs.current[index]?.focus();
                      }}
                    />,
                    document.body,
                  )
                : null}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

export function ContextMenu({
  isOpen,
  position,
  items,
  onClose,
  boundarySelector,
  title,
  subtitle,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const normalizedItems = useMemo(() => normalizeMenuItems(items), [items]);
  const [style, setStyle] = useState<React.CSSProperties>(() => ({
    left: position.x,
    top: position.y,
    visibility: 'hidden',
  }));

  useLayoutEffect(() => {
    if (!isOpen || !menuRef.current) return;
    setStyle({
      left: position.x,
      top: position.y,
      visibility: 'hidden',
    });
    const updatePosition = () => {
      if (!menuRef.current) return;
      const boundary = getMenuBoundary(boundarySelector);
      const rect = menuRef.current.getBoundingClientRect();
      const next = clampMenuPosition(position, rect, boundary);
      setStyle({
        left: next.left,
        top: next.top,
        maxHeight: next.maxHeight,
        visibility: 'visible',
      });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [boundarySelector, isOpen, normalizedItems.length, position]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-umbra-context-menu-layer="true"]')) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('[data-umbra-context-menu-layer="true"]')) return;
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('contextmenu', handleContextMenu, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('contextmenu', handleContextMenu, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <Portal>
      <MenuPanel
        items={normalizedItems}
        boundarySelector={boundarySelector}
        depth={0}
        onCloseAll={onClose}
        rootStyle={style}
        rootRef={menuRef}
        title={title}
        subtitle={subtitle}
      />
    </Portal>
  );
}
