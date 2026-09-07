'use client';

import { NsfwPrivacyShield, useNsfwPrivacy } from './NsfwPrivacyProvider';
import { isProtectedLivePreview } from '@/lib/livePreviewPrivacy';

export function LiveGenerationPreview({
  src,
  prompt,
  mimeType,
  onOpen,
  className = 'h-56',
  alt = 'Live generation preview',
}: {
  src: string;
  prompt?: string;
  mimeType?: string;
  onOpen?: () => void;
  className?: string;
  alt?: string;
}) {
  const { locked } = useNsfwPrivacy();
  const protectedMedia = isProtectedLivePreview(prompt);
  const blocked = locked && protectedMedia;
  const video = /^video\//i.test(mimeType || '') || /^data:video\//i.test(src);
  const media = blocked ? null : video ? (
    <video src={src} data-umbra-nsfw-media={protectedMedia ? '' : undefined}
      className="h-full w-full object-contain" autoPlay muted loop playsInline />
  ) : (
    <img src={src} alt={alt} data-umbra-nsfw-media={protectedMedia ? '' : undefined}
      className="h-full w-full object-contain" loading="eager" />
  );

  return (
    <div data-umbra-live-generation-preview="" className={`relative w-full overflow-hidden bg-black ${className}`}>
      {onOpen && !video && !blocked ? (
        <button type="button" onClick={onOpen} className="block h-full w-full" title="Open live generation preview">
          {media}
        </button>
      ) : media}
      <NsfwPrivacyShield protectedMedia={protectedMedia} compact />
    </div>
  );
}
