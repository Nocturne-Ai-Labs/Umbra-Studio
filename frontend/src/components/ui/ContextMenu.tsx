'use client';

import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight } from 'lucide-react';
import type { ContextMenuItem } from '@/hooks/useContextMenu';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  boundarySelector?: string;
  title?: string;
  subtitle?: string;
  presentation?: 'anchored' | 'touch-sheet';
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
  presentation = 'anchored',
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
  presentation?: 'anchored' | 'touch-sheet';
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
      data-umbra-context-menu-presentation={presentation}
      className={`umbra-context-menu-panel fixed overflow-y-auto ${presentation === 'touch-sheet'
        ? 'umbra-context-menu-touch-sheet min-w-0 max-w-none p-2'
        : 'min-w-[232px] max-w-[min(336px,calc(100vw-16px))] p-1'
      }`}
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
        <div className="umbra-context-menu-header -mx-1 -mt-1 mb-1 px-3 py-2.5">
          {title ? <div className="umbra-context-menu-title truncate">{title}</div> : null}
          {subtitle ? <div className="umbra-context-menu-subtitle mt-0.5 truncate">{subtitle}</div> : null}
        </div>
      ) : null}
      <div className="space-y-0.5">
        {items.map((item, index) => {
          if (item.separator) {
            return <div key={`separator-${index}`} className="umbra-context-menu-separator mx-2 my-1.5" role="separator" />;
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
                data-active={isOpen ? 'true' : 'false'}
                data-danger={item.danger ? 'true' : 'false'}
                className={`umbra-context-menu-item
                  flex w-full items-center gap-2.5 px-2.5 py-2 text-left
                  ${item.disabled
                    ? 'cursor-not-allowed opacity-40'
                    : ''
                  }
                `}
                role="menuitem"
                aria-haspopup={hasChildren ? 'menu' : undefined}
                aria-expanded={hasChildren ? isOpen : undefined}
              >
                <span className="umbra-context-menu-icon flex h-4 w-4 flex-shrink-0 items-center justify-center">
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{item.label}</span>
                  {item.description ? (
                    <span className="umbra-context-menu-description mt-0.5 block truncate">
                      {item.description}
                    </span>
                  ) : null}
                </span>
                {item.badge !== undefined ? (
                  <span className="umbra-context-menu-badge px-1.5 py-0.5">
                    {item.badge}
                  </span>
                ) : null}
                {hasChildren ? <ChevronRight size={14} className="umbra-context-menu-icon shrink-0" /> : null}
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
                      presentation="anchored"
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
  presentation = 'anchored',
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
    if (presentation === 'touch-sheet') {
      setStyle({
        left: 12,
        right: 12,
        bottom: 'max(12px, env(safe-area-inset-bottom))',
        top: 'auto',
        maxHeight: 'min(72dvh, 42rem)',
        visibility: 'visible',
      });
      return;
    }
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
  }, [boundarySelector, isOpen, normalizedItems.length, position, presentation]);

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

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {presentation === 'touch-sheet' ? (
        <div className="umbra-context-menu-touch-scrim fixed inset-0" aria-hidden="true" />
      ) : null}
      <MenuPanel
        items={normalizedItems}
        boundarySelector={boundarySelector}
        depth={0}
        onCloseAll={onClose}
        rootStyle={style}
        rootRef={menuRef}
        title={title}
        subtitle={subtitle}
        presentation={presentation}
      />
    </>,
    document.body,
  );
}
