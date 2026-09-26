import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff, VolumeX } from 'lucide-react';
import { useNsfwPrivacy } from '@/components/privacy/NsfwPrivacyProvider';
import type { FilmstripImage } from './Filmstrip';

export function filmstripPreviewPosition(anchor: { left: number; top: number; width: number; bottom: number }, viewport: { width: number; height: number }) {
  const margin = 12;
  const width = Math.max(1, Math.min(380, viewport.width - margin * 2));
  const above = anchor.top - margin * 2;
  const below = viewport.height - anchor.bottom - margin * 2;
  const placeAbove = above >= Math.min(320, below);
  const height = Math.max(1, Math.min(420, placeAbove ? above : below));
  return {
    width, height,
    left: Math.max(margin, Math.min(viewport.width - width - margin, anchor.left + anchor.width / 2 - width / 2)),
    top: placeAbove ? anchor.top - height - margin : anchor.bottom + margin,
  };
}

export function FilmstripHoverPreview({ anchor, image, open }: { anchor: RefObject<HTMLButtonElement | null>; image: FilmstripImage; open: boolean }) {
  const { mode, locked } = useNsfwPrivacy();
  const [position, setPosition] = useState<ReturnType<typeof filmstripPreviewPosition> | null>(null);
  const [failed, setFailed] = useState(false);
  const protectedMedia = image.privacyClass === 'nsfw' && (locked || mode !== 'off');
  const video = image.type === 'video';
  const src = image.url || `/api/fs/image?path=${encodeURIComponent(image.path)}&rev=${encodeURIComponent(image.dateModified || image.dateCreated || '')}`;

  useEffect(() => {
    setFailed(false);
  }, [src]);
  useEffect(() => {
    if (!open || protectedMedia) { setPosition(null); return; }
    const element = anchor.current;
    if (element) setPosition(filmstripPreviewPosition(element.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }));
  }, [anchor, open, protectedMedia]);

  if (!open || !position || protectedMedia) return null;
  return createPortal(
    <div role="tooltip" aria-label={`Preview: ${image.name}`} data-filmstrip-hover-preview="" className="pointer-events-none fixed z-[1200] flex flex-col overflow-hidden rounded-md border border-white/20 bg-zinc-950 shadow-2xl" style={position}>
      <div className="relative min-h-0 flex-1 bg-black">
        {failed ? <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-400"><ImageOff size={18} /> Preview unavailable</div> : video ? (
          <video key={src} src={src} autoPlay muted loop playsInline preload="metadata" className="h-full w-full object-contain" onError={() => setFailed(true)} />
        ) : <img src={src} alt={image.name} className="h-full w-full object-contain" decoding="async" onError={() => setFailed(true)} />}
      </div>
      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-white/10 px-2 text-[11px] text-zinc-300">
        <span className="min-w-0 flex-1 truncate">{image.name}</span>
        {video ? <VolumeX size={14} aria-label="Muted" /> : null}
      </div>
    </div>, document.body,
  );
}

export function useFilmstripHoverPreview(identity: string) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setOpen(false);
    setArmed(false);
  }, []);
  const enter = useCallback(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    window.dispatchEvent(new Event('umbra:filmstrip-preview-opening'));
    if (timer.current) clearTimeout(timer.current);
    setArmed(true);
    timer.current = setTimeout(() => { timer.current = null; setOpen(true); }, 350);
  }, []);
  useEffect(() => {
    close();
    return close;
  }, [close, identity]);
  useEffect(() => {
    if (!armed) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    // Dismiss when the anchor moves or a modal/menu opens; never follow the pointer.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
    window.addEventListener('keydown', escape);
    window.addEventListener('umbra:filmstrip-preview-opening', close);
    document.addEventListener('visibilitychange', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('umbra:filmstrip-preview-opening', close);
      document.removeEventListener('visibilitychange', close);
    };
  }, [armed, close]);
  return { open, enter, close };
}
