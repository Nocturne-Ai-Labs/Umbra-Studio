'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import type { ContextMenuItem } from '@/hooks/useContextMenu';
import { Portal } from './Portal';

interface ContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  items: ContextMenuItem[];
  onClose: () => void;
  boundarySelector?: string;
}

const MENU_MARGIN = 8;

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

export function ContextMenu({ isOpen, position, items, onClose, boundarySelector }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
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
  }, [boundarySelector, isOpen, items.length, position]);

  React.useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && menuRef.current?.contains(target)) return;
      onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && menuRef.current?.contains(target)) return;
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

  const handleItemClick = (item: ContextMenuItem) => {
    if (!item.separator && !item.disabled) {
      item.action();
      onClose();
    }
  };

  return (
    <Portal>
      <div
        ref={menuRef}
        className="fixed z-[10000] min-w-[220px] max-w-[min(320px,calc(100vw-16px))] overflow-y-auto glass-panel border-2 border-[var(--umbra-border)] shadow-2xl backdrop-blur-xl animate-menu"
        style={style}
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        role="menu"
      >
        <div className="py-2">
          {items.map((item, index) => (
            <React.Fragment key={index}>
              {item.separator ? (
                <div className="h-px bg-[var(--umbra-border)] my-2 mx-2" />
              ) : (
                <button
                  onClick={() => handleItemClick(item)}
                  disabled={item.disabled}
                  className={`
                    w-full px-4 py-2.5 text-left text-sm flex items-center gap-3 transition-colors font-medium
                    ${item.disabled
                      ? 'opacity-40 cursor-not-allowed'
                      : item.danger
                        ? 'text-red-400 hover:bg-red-500/20 hover:text-red-300'
                        : 'text-zinc-200 hover:bg-[var(--umbra-accent-glow)] hover:text-white'
                    }
                  `}
                  role="menuitem"
                >
                  {item.icon && (
                    <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                      {item.icon}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </Portal>
  );
}
