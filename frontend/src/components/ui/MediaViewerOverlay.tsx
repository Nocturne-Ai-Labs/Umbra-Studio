import React, { useEffect, useMemo } from 'react';

export type MediaViewerOverlayItem = {
  path: string;
  name: string;
  type: 'image' | 'video' | 'gif';
  url: string;
  stillUrl?: string;
};

interface MediaViewerOverlayProps {
  items: MediaViewerOverlayItem[];
  currentPath: string;
  onClose: () => void;
  onOpenPath: (path: string) => void;
}

function normalizeMediaViewerPath(value: string | null | undefined): string {
  return String(value || '').replace(/\\/g, '/').trim();
}

export function MediaViewerOverlay({
  items,
  currentPath,
  onClose,
  onOpenPath,
}: MediaViewerOverlayProps) {
  const normalizedCurrentPath = normalizeMediaViewerPath(currentPath);

  const normalizedItems = useMemo(() => (
    Array.isArray(items)
      ? items.filter((item) => normalizeMediaViewerPath(item.path) && String(item.url || '').trim())
      : []
  ), [items]);

  const currentIndex = useMemo(() => (
    normalizedCurrentPath
      ? normalizedItems.findIndex((item) => normalizeMediaViewerPath(item.path) === normalizedCurrentPath)
      : -1
  ), [normalizedCurrentPath, normalizedItems]);

  const currentItem = currentIndex >= 0 ? normalizedItems[currentIndex] : null;

  const step = (delta: number) => {
    if (normalizedItems.length <= 0) return;
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + delta + normalizedItems.length) % normalizedItems.length;
    const nextItem = normalizedItems[nextIndex];
    if (!nextItem) return;
    onOpenPath(nextItem.path);
  };

  useEffect(() => {
    if (!currentItem) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [currentItem, onClose, currentIndex, normalizedItems]);

  if (!currentItem) return null;

  const mediaUrl = String(currentItem.url || '').trim();
  const stillUrl = String(currentItem.stillUrl || currentItem.url || '').trim();

  return (
    <div className="fixed inset-x-4 top-16 bottom-4 z-[140] flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        aria-label="Close viewer"
        onClick={onClose}
      />
      <div className="relative z-[141] flex h-full w-full max-w-[1800px] overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-950/96 shadow-2xl">
        <button
          type="button"
          className="absolute left-3 top-1/2 z-[142] -translate-y-1/2 rounded-full border border-zinc-700 bg-black/70 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-black/85"
          onClick={() => step(-1)}
          aria-label="Previous media"
        >
          Prev
        </button>
        <button
          type="button"
          className="absolute right-3 top-1/2 z-[142] -translate-y-1/2 rounded-full border border-zinc-700 bg-black/70 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-black/85"
          onClick={() => step(1)}
          aria-label="Next media"
        >
          Next
        </button>
        <button
          type="button"
          className="absolute right-3 top-3 z-[142] rounded-full border border-zinc-700 bg-black/70 px-3 py-2 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-black/85"
          onClick={onClose}
          aria-label="Close viewer"
        >
          Close
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3 text-sm text-zinc-300">
            <div className="min-w-0 truncate font-medium text-zinc-100">{currentItem.name}</div>
            <div className="shrink-0 text-xs uppercase tracking-[0.18em] text-zinc-400">
              {currentIndex + 1} / {normalizedItems.length}
            </div>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            {currentItem.type === 'video' ? (
              <video
                key={currentItem.path}
                className="max-h-full max-w-full rounded-xl bg-black"
                src={mediaUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
              />
            ) : (
              <img
                key={currentItem.path}
                className="max-h-full max-w-full rounded-xl object-contain"
                src={currentItem.type === 'gif' ? mediaUrl : stillUrl}
                alt={currentItem.name}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaViewerOverlay;
