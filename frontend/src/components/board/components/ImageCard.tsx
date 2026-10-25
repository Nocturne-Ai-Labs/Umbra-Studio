import { useState } from 'react';
import { Check, Star, ZoomIn, Film } from 'lucide-react';
import { BOORU_SOURCES } from '../sources';
import type { BooruPost } from '../types';
import { NsfwPrivacyShield, useNsfwPrivacy } from '@/components/privacy/NsfwPrivacyProvider';
import { isProtectedBooruPost } from '../booruPrivacy';
import { booruMediaType } from '../collectionOptions';

interface ImageCardProps {
  post: BooruPost;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onPreview?: () => void;
}

export function ImageCard({ post, isSelected, onSelect, onPreview }: ImageCardProps) {
  const { locked } = useNsfwPrivacy();
  const protectedMedia = isProtectedBooruPost(post);
  const blocked = locked && protectedMedia;
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const source = BOORU_SOURCES[post.source];
  const mediaType = booruMediaType(post);
  const previewLabel = mediaType === 'video' ? 'Preview video' : mediaType === 'gif' ? 'Preview GIF' : 'Preview image';
  const mediaUrls = [
    post.previewUrl,
    `/api/booru/image-proxy?url=${encodeURIComponent(post.previewUrl)}`,
  ];

  return (
    <div
      data-selected={isSelected}
      className={`umbra-surface-deep group relative isolate aspect-square overflow-hidden rounded-md border transition-all
                  ${isSelected ? 'border-[var(--umbra-accent)] ring-1 ring-[var(--umbra-accent)]' : 'border-white/10'}
                  hover:border-white/24`}
    >
      {/* Checkbox */}
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(!isSelected);
        }}
        className={`absolute left-2 top-2 z-50 flex h-6 w-6 items-center justify-center rounded-md border
                    transition-all ${isSelected
                      ? 'border-[var(--umbra-accent)] bg-[var(--umbra-accent)] text-[var(--umbra-bg)]'
                      : 'border-white/30 bg-black/80 text-zinc-300 hover:border-[var(--umbra-accent)]'}`}
        aria-label={isSelected ? 'Deselect image' : 'Select image'}
      >
        {isSelected && <Check className="w-4 h-4" />}
      </button>

      {/* Source badge */}
      <div
        className="absolute right-2 top-2 z-10 flex h-5 w-5 items-center justify-center rounded border border-white/20 text-xs font-bold text-white shadow-lg"
        style={{ backgroundColor: source?.color || '#666' }}
        title={source?.name}
      >
        {source?.icon || '?'}
      </div>

      {/* Image */}
      {blocked ? null : !hasError ? (
        <img
          data-umbra-nsfw-media={protectedMedia ? '' : undefined}
          src={mediaUrls[Math.min(mediaAttempt, mediaUrls.length - 1)]}
          alt=""
          loading="lazy"
          onLoad={() => setIsLoaded(true)}
          onError={() => {
            if (mediaAttempt < mediaUrls.length - 1) {
              setMediaAttempt(mediaAttempt + 1);
              return;
            }
            setHasError(true);
          }}
          className={`w-full h-full object-cover cursor-pointer transition-opacity
                     ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-zinc-500">
          {mediaType === 'video' ? <><Film size={24} />Open video preview</> : 'Preview unavailable'}
        </div>
      )}

      {/* Loading skeleton */}
      {!blocked && !isLoaded && !hasError && (
        <div className="absolute inset-0 animate-pulse bg-white/10" />
      )}

      <button type="button" aria-label={`${isSelected ? 'Deselect' : 'Select'} thumbnail ${post.id}`} aria-pressed={isSelected}
        onClick={() => onSelect(!isSelected)}
        className="absolute inset-0 z-10 cursor-pointer rounded-md focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--umbra-accent)]" />
      <NsfwPrivacyShield protectedMedia={protectedMedia} compact />
      {mediaType !== 'image' && <span className="pointer-events-none absolute left-2 top-10 rounded bg-black/80 px-1.5 py-0.5 text-[10px] uppercase text-white">{mediaType === 'video' ? 'Video' : post.fileExt}</span>}
      {onPreview && <button type="button" aria-label={previewLabel} title={previewLabel} onClick={onPreview} className="absolute bottom-2 right-2 z-20 flex h-7 w-7 items-center justify-center rounded border border-white/25 bg-black/80 text-white transition-colors hover:border-[var(--umbra-accent)] focus-visible:outline-2 focus-visible:outline-[var(--umbra-accent)]"><ZoomIn size={14} /></button>}

      {/* Score & dimensions overlay */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 pr-11
                      opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <div className="flex items-center justify-between text-xs text-white">
          <div className="flex items-center gap-1">
            <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
            <span>{post.score}</span>
          </div>
          <span className="text-zinc-400">
            {post.width}x{post.height}
          </span>
        </div>
      </div>
    </div>
  );
}
