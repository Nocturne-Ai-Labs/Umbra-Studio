import { useState, useCallback } from 'react';
import { BOORU_SOURCES } from '../sources';
import type { BooruPost } from '../types';
import { buildSourceSearchQuery, type SourceSearchSettings } from '../sourceSearchTools';

interface SearchOptions {
  sources: string[];
  tags: string;
  page?: number;
  limit?: number;
  signal?: AbortSignal;
  onPageInfo?: (hasMoreBySource: Record<string, boolean>) => void;
  onError?: (error: string | null) => void;
  sourceSearch?: SourceSearchSettings;
}

export function useBooru() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to parse rating
  const parseRating = (r: string, source: string): 'safe' | 'questionable' | 'explicit' => {
    if (source === 'danbooru' && r === 's') return 'questionable';
    if (r === 's' || r === 'g' || r === 'safe' || r === 'general') return 'safe';
    if (r === 'q' || r === 'questionable' || r === 'sensitive') return 'questionable';
    return 'explicit';
  };

  // Search multiple sources
  const search = useCallback(async (options: SearchOptions): Promise<BooruPost[] | null> => {
    const { sources, tags, page = 1, limit = 40 } = options;

    if (!sources.some(source => buildSourceSearchQuery(tags, source, options.sourceSearch?.[source]).trim())) {
      return [];
    }

    setIsLoading(true);
    setError(null);
    options.onError?.(null);
    const deadline = AbortSignal.timeout(30_000);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;

    try {
      // Search all enabled sources in parallel
      const results = await Promise.allSettled(
        sources.map(async (sourceId) => {
          const response = await fetch(`/api/booru/search?${new URLSearchParams({
            source: sourceId,
            tags: buildSourceSearchQuery(tags, sourceId, options.sourceSearch?.[sourceId]),
            page: String(page),
            limit: String(limit),
          })}`, { signal });

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(`${BOORU_SOURCES[sourceId]?.name || sourceId}: ${payload?.error || response.statusText}`);
          }

          const data = await response.json();

          // Server returns pre-parsed format, map to BooruPost
          if (!Array.isArray(data)) throw new Error(`${BOORU_SOURCES[sourceId]?.name || sourceId}: Invalid search response`);
          const posts = data;
          const mapped = posts.filter((p: any) => p.url || p.fullUrl).map((p: any): BooruPost => ({
            id: `${sourceId}_${p.id}`,
            source: sourceId,
            previewUrl: p.url || p.fullUrl,
            fullUrl: p.fullUrl || p.url,
            md5: p.md5 || p.id, // Use ID as fallback for dedup
            width: p.width || 0,
            height: p.height || 0,
            score: p.score || 0,
            rating: parseRating(p.rating || (sourceId === 'danbooru' ? 'q' : 's'), sourceId),
            tags: p.tags || [],
            fileExt: p.fileExt || (p.fullUrl || p.url || '').split('.').pop() || 'jpg',
          }));
          const more = response.headers.get('X-Umbra-Booru-Has-More');
          return { posts: mapped, sourceId, hasMore: more === 'true' || (more !== 'false' && posts.length >= limit) };
        })
      );
      if (options.signal?.aborted) return null;

      // Combine results from all sources
      let allPosts: BooruPost[] = [];
      const sourceErrors: string[] = [];
      const hasMoreBySource: Record<string, boolean> = {};
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allPosts = allPosts.concat(result.value.posts);
          hasMoreBySource[result.value.sourceId] = result.value.hasMore;
        } else {
          sourceErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      }
      setError(sourceErrors.length > 0 ? sourceErrors.join(' | ') : null);
      options.onError?.(sourceErrors.length > 0 ? sourceErrors.join(' | ') : null);
      // A shared page cursor cannot advance until every selected source succeeds.
      if (sourceErrors.length > 0) return null;
      options.onPageInfo?.(hasMoreBySource);

      // Remove duplicates by ID (unique per source+id combo)
      const seen = new Set<string>();
      allPosts = allPosts.filter(post => {
        // Use the full post.id which includes source prefix
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });

      // Preserve each site's requested order, including across later pages.

      return allPosts;
    } catch (err: any) {
      if (options.signal?.aborted) return null;
      setError(err.message);
      options.onError?.(err.message);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Autocomplete tags
  const autocomplete = useCallback(async (
    sourceId: string,
    query: string,
    signal?: AbortSignal
  ): Promise<string[]> => {
    if (!query.trim() || query.length < 2) {
      return [];
    }

    try {
      const response = await fetch(`/api/booru/autocomplete?${new URLSearchParams({
        source: sourceId,
        query: query.trim().replace(/\s+/g, '_'),
      })}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000) });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const source = BOORU_SOURCES[sourceId];
      return source?.parseAutocomplete(data) || [];
    } catch {
      return [];
    }
  }, []);

  // Download image to dataset
  const downloadImage = useCallback(async (
    post: BooruPost,
    dataset: string,
    concept: string
  ): Promise<boolean> => {
    try {
      const response = await fetch('/api/booru/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: post.fullUrl,
          md5: post.md5,
          ext: post.fileExt,
          tags: post.tags,
          source: post.source,
          postId: post.id,
          dataset,
          concept,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  }, []);

  return {
    search,
    autocomplete,
    downloadImage,
    isLoading,
    error,
  };
}
