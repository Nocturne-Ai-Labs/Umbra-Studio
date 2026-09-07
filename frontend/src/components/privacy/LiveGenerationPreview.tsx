'use client';

import { useState } from 'react';
import { Grid2X2 } from 'lucide-react';
import { NsfwPrivacyShield, useNsfwPrivacy } from './NsfwPrivacyProvider';
import { isProtectedLivePreview } from '@/lib/livePreviewPrivacy';
import { LivePreviewCanvas } from './LivePreviewCanvas';

export function LiveGenerationPreview({
  src,
  prompt,
  mimeType,
  onOpen,
  className = 'h-56',
  alt = 'Live generation preview',
  streamKey,
  showRenderingControl = false,
}: {
  src: string;
  prompt?: string;
  mimeType?: string;
  onOpen?: () => void;
  className?: string;
  alt?: string;
  streamKey?: string;
  showRenderingControl?: boolean;
}) {
  const { locked } = useNsfwPrivacy();
  const [pixelated, setPixelated] = useState(true);
  const protectedMedia = isProtectedLivePreview(prompt);
  const blocked = locked && protectedMedia;
  const video = /^video\//i.test(mimeType || '') || /^data:video\//i.test(src);
  const media = blocked || !src ? null : video ? (
    <video src={src} data-umbra-nsfw-media={protectedMedia ? '' : undefined}
      className="h-full w-full object-contain" autoPlay muted loop playsInline />
  ) : (
    <LivePreviewCanvas key={JSON.stringify([streamKey, prompt])} src={src} alt={alt}
      protectedMedia={protectedMedia} pixelated={pixelated} />
  );

  return (
    <div data-umbra-live-generation-preview="" className={`relative w-full overflow-hidden bg-black ${className}`}>
      {onOpen && !video && !blocked ? (
        <button type="button" onClick={onOpen} className="block h-full w-full" title="Open live generation preview">
          {media}
        </button>
      ) : media}
      {showRenderingControl && !video && !blocked && src ? (
        <button type="button" onClick={() => setPixelated((current) => !current)}
          aria-label="Pixel preview" aria-pressed={pixelated}
          title={pixelated ? 'Use smooth preview' : 'Use pixel preview'}
          className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded border border-white/20 bg-black/80 text-white hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <Grid2X2 size={16} />
        </button>
      ) : null}
      <NsfwPrivacyShield protectedMedia={protectedMedia} compact />
    </div>
  );
}
