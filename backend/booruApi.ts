import { dirname } from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';

export interface BooruApiConfig {
  danbooru?: { username: string; apiKey: string };
  gelbooru?: { userId: string; apiKey: string };
  e621?: { username: string; apiKey: string };
  rule34?: { userId: string; apiKey: string };
  civitai?: { apiToken?: string; apiKey?: string };
}

export interface BooruImageResult {
  url: string;
  fullUrl?: string;
  id?: string;
  md5?: string;
  width?: number;
  height?: number;
  score?: number;
  tags?: string[];
  rating?: string;
  fileExt?: string;
}

const BOORU_USER_AGENT = 'UmbraStudio (Data Forge; local application)';

function normalizeRemoteUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('//')) return `https:${raw}`;
  return raw;
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((tag) => String(tag || '').trim()).filter(Boolean);
  return String(value || '').split(/\s+/).map((tag) => tag.trim()).filter(Boolean);
}

function inferFileExtension(url: string, fallback = 'jpg'): string {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    return match?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function unwrapPosts(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.post)) return data.post;
  if (Array.isArray(data?.posts)) return data.posts;
  return [];
}

export function parseDanbooruPosts(data: unknown): BooruImageResult[] {
  return unwrapPosts(data).map((post: any) => {
    const previewUrl = normalizeRemoteUrl(post.preview_file_url || post.large_file_url || post.file_url);
    const fullUrl = normalizeRemoteUrl(post.file_url || post.large_file_url || previewUrl);
    return {
      url: previewUrl,
      fullUrl,
      id: post.id?.toString(),
      md5: post.md5,
      width: Number(post.image_width || post.width || 0),
      height: Number(post.image_height || post.height || 0),
      score: Number(post.score || 0),
      tags: splitTags(post.tag_string),
      rating: post.rating,
      fileExt: String(post.file_ext || inferFileExtension(fullUrl)).toLowerCase(),
    };
  }).filter((post) => post.url);
}

export function parseGelbooruPosts(data: unknown): BooruImageResult[] {
  return unwrapPosts(data).map((post: any) => {
    const previewUrl = normalizeRemoteUrl(post.preview_url || post.sample_url || post.file_url);
    const fullUrl = normalizeRemoteUrl(post.file_url || post.sample_url || previewUrl);
    return {
      url: previewUrl,
      fullUrl,
      id: post.id?.toString(),
      md5: post.md5 || post.hash,
      width: Number(post.width || 0),
      height: Number(post.height || 0),
      score: Number(post.score || 0),
      tags: splitTags(post.tags),
      rating: post.rating,
      fileExt: inferFileExtension(fullUrl),
    };
  }).filter((post) => post.url);
}

export function parseE621Posts(data: unknown): BooruImageResult[] {
  return unwrapPosts(data).map((post: any) => {
    const tagGroups = post.tags && typeof post.tags === 'object'
      ? Object.values(post.tags).flatMap((group) => splitTags(group))
      : splitTags(post.tags);
    const previewUrl = normalizeRemoteUrl(post.preview?.url || post.sample?.url || post.file?.url);
    const fullUrl = normalizeRemoteUrl(post.file?.url || post.sample?.url || previewUrl);
    return {
      url: previewUrl,
      fullUrl,
      id: post.id?.toString(),
      md5: post.file?.md5,
      width: Number(post.file?.width || post.width || 0),
      height: Number(post.file?.height || post.height || 0),
      score: Number(post.score?.total ?? post.score ?? 0),
      tags: Array.from(new Set(tagGroups)),
      rating: post.rating,
      fileExt: String(post.file?.ext || inferFileExtension(fullUrl)).toLowerCase(),
    };
  }).filter((post) => post.url);
}

export function parseRule34Posts(data: unknown): BooruImageResult[] {
  return unwrapPosts(data).map((post: any) => {
    const previewUrl = normalizeRemoteUrl(post.preview_url || post.sample_url || post.file_url);
    const fullUrl = normalizeRemoteUrl(post.file_url || post.sample_url || previewUrl);
    return {
      url: previewUrl,
      fullUrl,
      id: post.id?.toString(),
      md5: post.hash || post.md5,
      width: Number(post.width || 0),
      height: Number(post.height || 0),
      score: Number(post.score || 0),
      tags: splitTags(post.tags),
      rating: post.rating || 'explicit',
      fileExt: inferFileExtension(fullUrl),
    };
  }).filter((post) => post.url);
}

export async function loadApiKeys(configPath: string): Promise<BooruApiConfig> {
  try {
    if (existsSync(configPath)) {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn(`[API Keys] Failed to read ${configPath}:`, error);
  }
  return {};
}

export async function saveApiKeys(configPath: string, config: BooruApiConfig): Promise<void> {
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    await fs.mkdir(configDir, { recursive: true });
  }
  await fs.writeFile(configPath, JSON.stringify(config, null, 2));
}

export async function fetchDanbooruPosts(tags: string, limit: number, page = 1, apiConfig?: BooruApiConfig['danbooru']): Promise<BooruImageResult[]> {
  const baseUrl = 'https://danbooru.donmai.us/posts.json';
  const params = new URLSearchParams({ tags, limit: limit.toString(), page: page.toString() });
  const fullUrl = `${baseUrl}?${params}`;

  const headers: Record<string, string> = { 'User-Agent': BOORU_USER_AGENT, Accept: 'application/json' };
  if (apiConfig?.username && apiConfig?.apiKey) {
    const auth = Buffer.from(`${apiConfig.username}:${apiConfig.apiKey}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }

  const tagCount = tags.trim().split(/\s+/).filter(Boolean).length;
  if (tagCount > 2 && !apiConfig?.apiKey) {
    console.warn(`[Booru] Danbooru: ${tagCount} tags requested but anonymous users limited to 2 tags`);
  }

  console.log(`[Booru] Danbooru fetch: ${fullUrl}`);
  const res = await fetch(fullUrl, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    const errorText = await res.text().catch(() => '');
    console.error(`[Booru] Danbooru error ${res.status}: ${errorText.slice(0, 200)}`);
    throw new Error(`Danbooru API error: ${res.status}`);
  }

  return parseDanbooruPosts(await res.json());
}

export async function fetchGelbooruPosts(tags: string, limit: number, page = 1, apiConfig?: BooruApiConfig['gelbooru']): Promise<BooruImageResult[]> {
  const pid = page - 1;
  let url = `https://gelbooru.com/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tags)}&pid=${pid}&limit=${limit}`;

  if (apiConfig?.apiKey && apiConfig?.userId) {
    url += `&api_key=${apiConfig.apiKey}&user_id=${apiConfig.userId}`;
  }

  console.log(`[Booru] Gelbooru fetch: ${url.replace(/api_key=[^&]+/, 'api_key=***')}`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': BOORU_USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    if (res.status === 401) {
      throw new Error('Gelbooru requires a valid user ID and API key. Add them from Data Forge > Search > Auth.');
    }
    throw new Error(`Gelbooru API error: ${res.status}`);
  }

  const data = await res.json() as any;
  if (data?.success === false) throw new Error(`Gelbooru search failed: ${String(data?.message || 'unknown error')}`);
  return parseGelbooruPosts(data);
}

export async function fetchE621Posts(tags: string, limit: number, page = 1, apiConfig?: BooruApiConfig['e621']): Promise<BooruImageResult[]> {
  const url = `https://e621.net/posts.json?tags=${encodeURIComponent(tags)}&page=${page}&limit=${limit}`;

  const identity = String(apiConfig?.username || 'local-user').replace(/[^a-zA-Z0-9_.-]/g, '') || 'local-user';
  const headers: Record<string, string> = {
    'User-Agent': `UmbraStudio (Data Forge; by ${identity})`,
    Accept: 'application/json',
  };
  if (apiConfig?.username && apiConfig?.apiKey) {
    const auth = Buffer.from(`${apiConfig.username}:${apiConfig.apiKey}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }

  console.log(`[Booru] e621 fetch: ${url}`);
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`e621 API error: ${res.status}`);

  return parseE621Posts(await res.json());
}

export async function fetchRule34Posts(tags: string, limit: number, page = 1, apiConfig?: BooruApiConfig['rule34']): Promise<BooruImageResult[]> {
  let url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(tags)}&pid=${page - 1}&limit=${limit}`;
  if (apiConfig?.userId && apiConfig?.apiKey) {
    url += `&user_id=${encodeURIComponent(apiConfig.userId)}&api_key=${encodeURIComponent(apiConfig.apiKey)}`;
  }

  console.log(`[Booru] rule34 fetch: ${url.replace(/api_key=[^&]+/, 'api_key=***')}`);
  const res = await fetch(url, {
    headers: { 'User-Agent': BOORU_USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Rule34 API error: ${res.status}`);

  const data = await res.json();
  if (typeof data === 'string') {
    const message = data.toLowerCase().includes('authentication')
      ? 'Rule34 requires a valid user ID and API key. Add them from Data Forge > Search > Auth.'
      : `Rule34 search failed: ${data}`;
    throw new Error(message);
  }
  return parseRule34Posts(data);
}
