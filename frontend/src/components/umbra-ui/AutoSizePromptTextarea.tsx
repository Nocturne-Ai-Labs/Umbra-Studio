import { forwardRef, useCallback, useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react';

/** Prompt fields follow their contents, including restored values and width changes. */
export const AutoSizePromptTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function AutoSizePromptTextarea({ value, defaultValue, onInput, style, rows = 2, ...props }, forwardedRef) {
    const nodeRef = useRef<HTMLTextAreaElement | null>(null);
    const resize = useCallback(() => {
      const node = nodeRef.current;
      if (!node || node.clientWidth === 0) return;
      const css = getComputedStyle(node);
      const borders = parseFloat(css.borderTopWidth) + parseFloat(css.borderBottomWidth);
      const padding = parseFloat(css.paddingTop) + parseFloat(css.paddingBottom);
      node.style.height = '0px';
      node.style.height = `${Math.ceil(node.scrollHeight + (css.boxSizing === 'border-box' ? borders : -padding))}px`;
    }, []);
    const setRef = useCallback((node: HTMLTextAreaElement | null) => {
      nodeRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }, [forwardedRef]);
    useLayoutEffect(() => { resize(); }, [value, defaultValue, resize]);
    useLayoutEffect(() => {
      const node = nodeRef.current;
      if (!node) return;
      let width = -1;
      const observer = new ResizeObserver(() => {
        const nextWidth = node.clientWidth;
        if (nextWidth !== width) { width = nextWidth; resize(); }
      });
      observer.observe(node);
      let active = true;
      void document.fonts?.ready.then(() => { if (active) resize(); });
      return () => { active = false; observer.disconnect(); };
    }, [resize]);
    return <textarea {...props} ref={setRef} value={value} defaultValue={defaultValue} rows={rows}
      style={{ ...style, resize: 'none', overflowY: 'hidden', maxHeight: 'none' }}
      onInput={event => { resize(); onInput?.(event); }} />;
  },
);
