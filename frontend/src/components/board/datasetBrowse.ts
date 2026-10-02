import type { DatasetImage } from './types';

export type DatasetCaptionFilter = 'all' | 'captioned' | 'uncaptioned';
export type DatasetImageSort = 'source' | 'name';

export function browseDatasetImages(
  images: DatasetImage[],
  query: string,
  captionFilter: DatasetCaptionFilter,
  sort: DatasetImageSort,
  descending: boolean,
): DatasetImage[] {
  const needle = query.trim().toLocaleLowerCase();
  const result = images.filter(image => {
    const captioned = Boolean(image.caption?.trim());
    if (captionFilter === 'captioned' && !captioned) return false;
    if (captionFilter === 'uncaptioned' && captioned) return false;
    return !needle || [image.filename, image.caption || '', ...(image.tags || [])]
      .some(value => value.toLocaleLowerCase().includes(needle));
  });
  if (sort === 'name') result.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  return descending ? result.reverse() : result;
}

export function selectDatasetImageRange(
  orderedNames: string[],
  selected: Set<string>,
  anchor: string | null,
  target: string,
  additive: boolean,
): Set<string> {
  const start = anchor ? orderedNames.indexOf(anchor) : -1;
  const end = orderedNames.indexOf(target);
  const range = start >= 0 && end >= 0
    ? orderedNames.slice(Math.min(start, end), Math.max(start, end) + 1)
    : [target];
  return new Set(additive ? [...selected, ...range] : range);
}
