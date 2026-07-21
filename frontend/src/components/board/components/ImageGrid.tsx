import { ImageCard } from './ImageCard';
import type { BooruPost } from '../types';

interface ImageGridProps {
  posts: BooruPost[];
  selected: Set<string>;
  onSelect: (id: string, selected: boolean) => void;
  onImageClick?: (post: BooruPost) => void;
  onImageDoubleClick?: (post: BooruPost, index: number) => void;
  isLoading?: boolean;
}

export function ImageGrid({
  posts,
  selected,
  onSelect,
  onImageClick,
  onImageDoubleClick,
  isLoading,
}: ImageGridProps) {
  if (isLoading && posts.length === 0) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 p-4">
        {Array.from({ length: 24 }).map((_, i) => (
          <div
            key={i}
            className="bg-zinc-800 rounded-lg animate-pulse"
            style={{ aspectRatio: '1' }}
          />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500">
        <p>No results. Try a different search.</p>
      </div>
    );
  }

  // Simple grid with smaller thumbnails
  return (
    <div className="p-3 grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 xl:grid-cols-12 gap-2">
      {posts.map((post, index) => (
        <ImageCard
          key={post.id}
          post={post}
          isSelected={selected.has(post.id)}
          onSelect={(sel) => onSelect(post.id, sel)}
          onClick={() => onImageClick?.(post)}
          onDoubleClick={() => onImageDoubleClick?.(post, index)}
        />
      ))}
    </div>
  );
}
