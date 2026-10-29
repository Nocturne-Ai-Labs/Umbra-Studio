import { useCallback, useLayoutEffect, useState, type MutableRefObject } from 'react';

// The browser mounts lazily inside FrozenGalleryBrowser. Observing once when
// its data controller mounts misses that element (and later error retries).
export function useGalleryGridWidth(scrollRef: MutableRefObject<HTMLDivElement | null>) {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: HTMLDivElement | null) => {
    scrollRef.current = element;
    setNode(element);
  }, [scrollRef]);

  useLayoutEffect(() => {
    if (!node) return;
    let disposed = false;
    const measure = () => {
      if (!disposed) setWidth(Math.max(0, Math.floor(node.clientWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => { disposed = true; observer.disconnect(); };
  }, [node]);

  return { width, ref };
}
