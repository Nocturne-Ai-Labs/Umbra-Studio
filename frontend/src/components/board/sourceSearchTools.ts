import { tokenizeSearchTags } from './searchTags';

export interface SourceSearchOptions { sort?: string; rating?: string; score?: string }
export type SourceSearchSettings = Record<string, SourceSearchOptions>;
interface SearchChoice { label: string; value: string }
interface SourceSearchTools { sorts: SearchChoice[]; ratings: SearchChoice[] }

const choice = (label: string, value: string): SearchChoice => ({ label, value });
const booruSorts = [
  choice('Highest score', 'order:score'), choice('Newest', 'order:id_desc'),
  choice('Oldest', 'order:id_asc'), choice('Most favorites', 'order:favcount'),
  choice('Largest', 'order:mpixels'),
];
const dapiSorts = [
  choice('Highest score', 'sort:score:desc'), choice('Newest', 'sort:id:desc'),
  choice('Oldest', 'sort:id:asc'), choice('Recently updated', 'sort:updated:desc'),
  choice('Widest', 'sort:width:desc'), choice('Tallest', 'sort:height:desc'),
];
const ratings = [
  choice('Safe', 'rating:safe'), choice('Questionable', 'rating:questionable'),
  choice('Explicit', 'rating:explicit'),
];

// Reviewed against each provider's search help; e621's ElasticPostQueryBuilder
// confirms its order values. Do not assume all boorus share the same syntax.
export const SOURCE_SEARCH_TOOLS: Record<string, SourceSearchTools> = {
  danbooru: { sorts: booruSorts, ratings: [
    choice('General', 'rating:g'), choice('Sensitive', 'rating:s'),
    choice('Questionable', 'rating:q'), choice('Explicit', 'rating:e'),
  ] },
  e621: { sorts: [...booruSorts, choice('Trending', 'order:hot')], ratings },
  gelbooru: { sorts: [...dapiSorts, choice('Rating', 'sort:rating:desc')], ratings },
  rule34: { sorts: dapiSorts, ratings },
};

export function sourceSearchModifiers(source: string, options: SourceSearchOptions = {}): string[] {
  const tools = SOURCE_SEARCH_TOOLS[source];
  if (!tools) return [];
  return [
    tools.sorts.find(item => item.value === options.sort)?.value,
    tools.ratings.find(item => item.value === options.rating)?.value,
    options.score?.trim() && Number.isSafeInteger(Number(options.score)) ? `score:>=${Number(options.score)}` : '',
  ].filter((value): value is string => !!value);
}

export function buildSourceSearchQuery(tags: string, source: string, options?: SourceSearchOptions): string {
  const modifiers = sourceSearchModifiers(source, options);
  const replaced = new Set(modifiers.map(token => token.split(':')[0]));
  // Selecting a sort supersedes either spelling, but only for this source.
  if (replaced.has('sort') || replaced.has('order')) { replaced.add('sort'); replaced.add('order'); }
  const tokens = tokenizeSearchTags(tags).map(token => token.text)
    .filter(token => !replaced.has(token.split(':')[0].toLowerCase()));
  return [...tokens, ...modifiers].join(' ');
}

export function sourceSearchQueryKey(tags: string, sources: string[], settings?: SourceSearchSettings): string {
  return JSON.stringify([...sources].sort().map(source => [source, buildSourceSearchQuery(tags, source, settings?.[source])]));
}
