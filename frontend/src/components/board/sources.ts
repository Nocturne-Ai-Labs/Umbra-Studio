import type { BooruSource, BooruPost } from './types';

const parseRating = (rating: string): 'safe' | 'questionable' | 'explicit' => {
  if (rating === 's' || rating === 'g' || rating === 'safe' || rating === 'general') return 'safe';
  if (rating === 'q' || rating === 'questionable' || rating === 'sensitive') return 'questionable';
  return 'explicit';
};

const parseNormalizedResults = (source: string, data: any): BooruPost[] => {
  const posts = Array.isArray(data) ? data : [];
  return posts.filter(post => post?.url || post?.fullUrl).map(post => ({
    id: `${source}_${post.id}`,
    source,
    previewUrl: post.url || post.fullUrl,
    fullUrl: post.fullUrl || post.url,
    md5: post.md5 || String(post.id),
    width: Number(post.width || 0),
    height: Number(post.height || 0),
    score: Number(post.score || 0),
    rating: parseRating(post.rating || 'explicit'),
    tags: Array.isArray(post.tags) ? post.tags : [],
    fileExt: post.fileExt || 'jpg',
  }));
};

const parseAutocomplete = (data: any): string[] => (
  Array.isArray(data)
    ? data.map(tag => String(tag?.value || tag?.name || tag || '').trim()).filter(Boolean)
    : []
);

const danbooru: BooruSource = {
  id: 'danbooru',
  name: 'Danbooru',
  icon: 'D',
  color: '#0075f8',
  baseUrl: 'https://danbooru.donmai.us',
  searchUrl: (tags, page, limit) =>
    `/posts.json?tags=${encodeURIComponent(tags)}&page=${page}&limit=${limit}`,
  autocompleteUrl: (query) =>
    `/autocomplete.json?search[query]=${encodeURIComponent(query)}&search[type]=tag_query&limit=10`,
  parseResults: (data: any[]): BooruPost[] =>
    data.filter(post => post.file_url).map(post => ({
      id: `danbooru_${post.id}`,
      source: 'danbooru',
      previewUrl: post.preview_file_url || post.file_url,
      fullUrl: post.file_url,
      md5: post.md5,
      width: post.image_width,
      height: post.image_height,
      score: post.score || 0,
      rating: parseRating(post.rating),
      tags: post.tag_string?.split(' ') || [],
      fileSize: post.file_size,
      fileExt: post.file_ext,
    })),
  parseAutocomplete,
  postUrl: (id) => `https://danbooru.donmai.us/posts/${id}`,
};

const gelbooru: BooruSource = {
  id: 'gelbooru',
  name: 'Gelbooru',
  icon: 'G',
  color: '#5b7cdb',
  baseUrl: 'https://gelbooru.com',
  searchUrl: (tags, page, limit) =>
    `/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tags)}&pid=${Math.max(0, page - 1)}&limit=${limit}`,
  autocompleteUrl: (query) =>
    `/index.php?page=autocomplete2&type=tag_query&term=${encodeURIComponent(query)}&limit=10`,
  parseResults: (data) => parseNormalizedResults('gelbooru', data),
  parseAutocomplete,
  postUrl: (id) => `https://gelbooru.com/index.php?page=post&s=view&id=${id}`,
};

const rule34: BooruSource = {
  id: 'rule34',
  name: 'Rule34',
  icon: 'R',
  color: '#4ea45b',
  baseUrl: 'https://rule34.xxx',
  searchUrl: (tags, page, limit) =>
    `/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tags)}&pid=${Math.max(0, page - 1)}&limit=${limit}`,
  autocompleteUrl: (query) => `/autocomplete.php?q=${encodeURIComponent(query)}`,
  parseResults: (data) => parseNormalizedResults('rule34', data),
  parseAutocomplete,
  postUrl: (id) => `https://rule34.xxx/index.php?page=post&s=view&id=${id}`,
};

const e621: BooruSource = {
  id: 'e621',
  name: 'e621',
  icon: 'E',
  color: '#ed8b35',
  baseUrl: 'https://e621.net',
  searchUrl: (tags, page, limit) =>
    `/posts.json?tags=${encodeURIComponent(tags)}&page=${page}&limit=${limit}`,
  autocompleteUrl: (query) =>
    `/tags.json?search[name_matches]=${encodeURIComponent(`${query}*`)}&search[order]=count&limit=10`,
  parseResults: (data) => parseNormalizedResults('e621', data),
  parseAutocomplete,
  postUrl: (id) => `https://e621.net/posts/${id}`,
};

export const BOORU_SOURCES: Record<string, BooruSource> = {
  danbooru,
  gelbooru,
  rule34,
  e621,
};

export const SOURCE_LIST = [danbooru, gelbooru, rule34, e621];
