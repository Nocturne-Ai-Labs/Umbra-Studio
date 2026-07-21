'use client';

import { useEffect, useRef } from 'react';
import { useDebugStore } from '@/store/useDebugStore';

export function useDebugTracking() {
  const { config, isRecording, logEvent } = useDebugStore();
  const lastCursorTime = useRef(0);
  const lastCursorPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!config.enabled || !isRecording) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!config.trackCursor) return;

      const now = Date.now();
      if (now - lastCursorTime.current < config.cursorSampleRate) return;

      const velocityX = (e.clientX - lastCursorPos.current.x) / (now - lastCursorTime.current);
      const velocityY = (e.clientY - lastCursorPos.current.y) / (now - lastCursorTime.current);

      logEvent({
        category: 'cursor',
        type: 'move',
        data: {
          x: e.clientX,
          y: e.clientY,
          velocityX,
          velocityY,
          target: (e.target as HTMLElement)?.tagName || 'unknown',
          elementPath: getElementPath(e.target as HTMLElement),
        },
      });

      lastCursorTime.current = now;
      lastCursorPos.current = { x: e.clientX, y: e.clientY };
    };

    const handleClick = (e: MouseEvent) => {
      logEvent({
        category: 'click',
        type: e.type,
        data: {
          x: e.clientX,
          y: e.clientY,
          button: e.button,
          target: (e.target as HTMLElement)?.tagName || 'unknown',
          elementPath: getElementPath(e.target as HTMLElement),
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        },
      });
    };

    const handleKeyboard = (e: KeyboardEvent) => {
      logEvent({
        category: 'keyboard',
        type: e.type,
        data: {
          key: e.key,
          code: e.code,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          repeat: e.repeat,
        },
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('click', handleClick);
    window.addEventListener('contextmenu', handleClick);
    window.addEventListener('keydown', handleKeyboard);
    window.addEventListener('keyup', handleKeyboard);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('click', handleClick);
      window.removeEventListener('contextmenu', handleClick);
      window.removeEventListener('keydown', handleKeyboard);
      window.removeEventListener('keyup', handleKeyboard);
    };
  }, [config, isRecording, logEvent]);
}

function getElementPath(element: HTMLElement | null): string {
  if (!element) return '';

  const path: string[] = [];
  let current: HTMLElement | null = element;

  while (current && current !== document.body) {
    // Ensure we are working with an Element node
    if (!current.tagName) {
        current = current.parentElement;
        continue;
    }

    let selector = current.tagName.toLowerCase();
    if (current.id) selector += `#${current.id}`;
    // Handle both regular HTML className (string) and SVG className (SVGAnimatedString)
    if (current.className) {
      const className = typeof current.className === 'string'
        ? current.className
        : (current.className as any).baseVal || '';
      if (className) selector += `.${className.split(' ').join('.')}`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }

  return path.join(' > ');
}
