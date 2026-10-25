import type { BooruPost, Dataset, SearchTab } from './types';

export type CollectionMediaType = 'image' | 'gif' | 'video';
export interface CollectionOptions {
  minimumScore: string;
  downloadLimit: string;
  mediaTypes: CollectionMediaType[];
}

export const DEFAULT_COLLECTION_OPTIONS: CollectionOptions = {
  minimumScore: '', downloadLimit: '0', mediaTypes: ['image'],
};

export function booruMediaType(post: Pick<BooruPost, 'fileExt'>): CollectionMediaType | null {
  const extension = post.fileExt.toLowerCase().replace(/^\./, '');
  if (extension === 'gif') return 'gif';
  if (['mp4', 'webm'].includes(extension)) return 'video';
  if (['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'].includes(extension)) return 'image';
  return null;
}

export function collectionOptionsError(options: CollectionOptions): string | null {
  if (options.minimumScore.trim() && !Number.isSafeInteger(Number(options.minimumScore))) return 'Minimum score must be a whole number, or leave it blank.';
  const limit = Number(options.downloadLimit);
  if (!Number.isSafeInteger(limit) || limit < 0) return 'Download limit must be a whole number of 0 or more.';
  if (!options.mediaTypes.length) return 'Choose at least one media type.';
  return null;
}

export function filterCollectionPosts(posts: BooruPost[], options: CollectionOptions): BooruPost[] {
  // A batch limit affects queueing, not which search results are visible.
  if (collectionOptionsError({ ...options, downloadLimit: '0' })) return [];
  const minimum = options.minimumScore.trim() ? Number(options.minimumScore) : -Infinity;
  return posts.filter(post => {
    const type = booruMediaType(post);
    return type !== null && options.mediaTypes.includes(type) && Number.isFinite(post.score) && post.score >= minimum;
  }).sort((a, b) => b.score - a.score);
}

export function collectionDownloadBatch(posts: BooruPost[], selected: Set<string>, options: CollectionOptions): BooruPost[] {
  if (collectionOptionsError(options)) return [];
  const eligible = filterCollectionPosts(posts, options).filter(post => selected.has(post.id));
  const limit = Number(options.downloadLimit);
  return limit > 0 ? eligible.slice(0, limit) : eligible;
}

export function validCollectionDestination(destination: SearchTab['downloadDestination'], datasets: Dataset[]): SearchTab['downloadDestination'] {
  const dataset = datasets.find(item => item.name === destination?.dataset);
  if (!dataset || !destination) return undefined;
  const available = new Set(dataset.layout === 'flat' ? [dataset.name] : dataset.concepts.map(folder => folder.folder));
  return { dataset: dataset.name, concepts: destination.concepts.filter(folder => available.has(folder)) };
}

export function collectionSelectionAfterChange(posts: BooruPost[], selected: Set<string>, options: CollectionOptions): Set<string> {
  // Editing a number through an invalid intermediate value must not lose a selection.
  if (collectionOptionsError(options)) return selected;
  const eligible = new Set(filterCollectionPosts(posts, options).map(post => post.id));
  return new Set([...selected].filter(id => eligible.has(id)));
}
