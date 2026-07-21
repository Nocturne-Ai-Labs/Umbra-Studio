import { useState } from 'react';
import { Check, Star } from 'lucide-react';
import { BOORU_SOURCES } from '../sources';
import type { BooruPost } from '../types';

interface ImageCardProps {
  post: BooruPost;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onClick?: () => void;
  onDoubleClick?: () => void;
}

export function ImageCard({ post, isSelected, onSelect, onClick, onDoubleClick }: ImageCardProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [mediaAttempt, setMediaAttempt] = useState(0);
  const source = BOORU_SOURCES[post.source];
  const mediaUrls = [
    post.previewUrl,
    `/api/booru/image-proxy?url=${encodeURIComponent(post.previewUrl)}`,
  ];

  return (
    <div
      className={`umbra-surface-deep group relative aspect-square overflow-hidden rounded-md border transition-all
                  ${isSelected ? 'border-cyan-400/70 ring-1 ring-cyan-400/30 shadow-[0_0_18px_rgba(34,211,238,0.16)]' : 'border-white/10'}
                  hover:border-white/24`}
    >
      {/* Checkbox */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onSelect(!isSelected);
        }}
        className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border
                    transition-all ${isSelected
                      ? 'border-cyan-300/70 bg-cyan-500/30 text-cyan-50'
                      : 'border-white/20 bg-black/65 text-zinc-500 hover:border-cyan-400/55 hover:text-cyan-200'}`}
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
      {!hasError ? (
        <img
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
          onClick={onClick}
          onDoubleClick={onDoubleClick}
          className={`w-full h-full object-cover cursor-pointer transition-opacity
                     ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
          Failed to load
        </div>
      )}

      {/* Loading skeleton */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 animate-pulse bg-white/10" />
      )}

      {/* Score & dimensions overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2
                      opacity-0 group-hover:opacity-100 transition-opacity">
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
