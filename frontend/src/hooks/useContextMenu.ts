'use client';

import { useState, useCallback, useEffect } from 'react';

export type ContextMenuItem = 
  | {
      label: string;
      icon?: React.ReactNode;
      action: () => void;
      separator?: false;
      danger?: boolean;
      disabled?: boolean;
    }
  | {
      separator: true;
      label?: never;
      icon?: never;
      action?: never;
      danger?: never;
      disabled?: never;
    };

export function useContextMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [targetPath, setTargetPath] = useState<string | null>(null);

  const show = useCallback((event: React.MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();

    // Calculate position (ensure menu stays in viewport)
    const x = Math.min(event.clientX, window.innerWidth - 250);
    const y = Math.min(event.clientY, window.innerHeight - 300);

    setPosition({ x, y });
    setTargetPath(path);
    setIsOpen(true);
  }, []);

  const hide = useCallback(() => {
    setIsOpen(false);
    setTimeout(() => setTargetPath(null), 200); // Delay to allow exit animation
  }, []);

  // Close on click outside
  useEffect(() => {
    if (isOpen) {
      const handleClick = () => hide();
      const handleContextMenu = (e: MouseEvent) => {
        e.preventDefault();
        hide();
      };

      document.addEventListener('click', handleClick);
      document.addEventListener('contextmenu', handleContextMenu);

      return () => {
        document.removeEventListener('click', handleClick);
        document.removeEventListener('contextmenu', handleContextMenu);
      };
    }
  }, [isOpen, hide]);

  // Close on Escape
  useEffect(() => {
    if (isOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') hide();
      };
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, hide]);

  return { isOpen, position, targetPath, show, hide };
}
