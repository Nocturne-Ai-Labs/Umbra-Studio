import { ImageCard } from './ImageCard';
import { Search } from 'lucide-react';
import type { BooruPost } from '../types';

interface ImageGridProps {
  posts: BooruPost[];
  selected: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onImageDoubleClick?: (post: BooruPost, index: number) => void;
  isLoading?: boolean;
  hasSearched?: boolean;
}

export function ImageGrid({
  posts,
  selected,
  onSelect,
  onImageDoubleClick,
  isLoading,
  hasSearched = true,
}: ImageGridProps) {
  if (isLoading && posts.length === 0) {
    return (
      <div role="status" aria-label="Loading search results" className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="umbra-surface-soft rounded border border-white/10 animate-pulse"
            style={{ aspectRatio: '1' }}
          />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex min-h-56 flex-col items-center justify-center gap-3 px-6 text-center text-zinc-500">
        <Search size={26} className="text-[var(--umbra-accent)]" />
        <p className="text-sm font-medium text-zinc-300">{hasSearched ? 'No matching media in the loaded results' : 'Start with a tag search'}</p>
        <p className="max-w-sm text-xs leading-relaxed">{hasSearched ? 'Adjust the score or media filters, load more results, or try another search.' : 'Choose your sources, search for media, then select what to add to your dataset.'}</p>
      </div>
    );
  }

  // Simple grid with smaller thumbnails
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3 p-3">
      {posts.map((post, index) => (
        <ImageCard
          key={post.id}
          post={post}
          isSelected={selected.has(post.id)}
          onSelect={(sel) => onSelect(post.id, sel)}
          onDoubleClick={() => onImageDoubleClick?.(post, index)}
        />
      ))}
    </div>
  );
}
