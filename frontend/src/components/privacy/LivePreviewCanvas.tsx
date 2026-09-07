import { useLayoutEffect, useRef } from 'react';

export function LivePreviewCanvas({ src, alt, protectedMedia, pixelated }: {
  src: string;
  alt: string;
  protectedMedia: boolean;
  pixelated: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const submitRef = useRef<((source: string) => void) | null>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    let disposed = false;
    let busy = false;
    let pending = '';
    let requested = '';
    let image: HTMLImageElement | null = null;
    let animationFrame: number | null = null;

    // Keep one decoder and only the newest waiting source, never a frame backlog.
    const pump = () => {
      if (disposed || busy || !pending) return;
      const source = pending;
      pending = '';
      busy = true;
      const next = new Image();
      image = next;
      next.decoding = 'async';
      next.src = source;
      const finish = () => {
        image = null;
        busy = false;
        pump();
      };
      void next.decode().then(() => {
        if (disposed) return;
        animationFrame = requestAnimationFrame(() => {
          animationFrame = null;
          if (disposed) return;
          // Do not clear the previous pixels until a replacement is decoded.
          if (canvas.width !== next.naturalWidth) canvas.width = next.naturalWidth;
          if (canvas.height !== next.naturalHeight) canvas.height = next.naturalHeight;
          context.clearRect(0, 0, canvas.width, canvas.height);
          context.drawImage(next, 0, 0);
          finish();
        });
      }).catch(() => {
        if (!disposed) finish();
      });
    };
    submitRef.current = (source) => {
      if (source === requested) return;
      requested = source;
      pending = source;
      pump();
    };
    return () => {
      disposed = true;
      submitRef.current = null;
      pending = '';
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      if (image) image.src = '';
      // Release the bitmap on job changes, unmount, and privacy relock.
      canvas.width = 1;
      canvas.height = 1;
    };
  }, []);

  useLayoutEffect(() => { submitRef.current?.(src); }, [src]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={alt}
      data-umbra-live-preview-frame=""
      data-umbra-media-preview=""
      data-umbra-nsfw-media={protectedMedia ? '' : undefined}
      className="block h-full w-full object-contain"
      style={{ imageRendering: pixelated ? 'pixelated' : 'auto' }}
    />
  );
}
