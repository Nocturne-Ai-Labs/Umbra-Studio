import { useState, useCallback } from 'react';
import { BOORU_SOURCES } from '../sources';
import type { BooruPost } from '../types';

interface SearchOptions {
  sources: string[];
  tags: string;
  page?: number;
  limit?: number;
}

export function useBooru() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Helper to parse rating
  const parseRating = (r: string): 'safe' | 'questionable' | 'explicit' => {
    if (r === 's' || r === 'g' || r === 'safe' || r === 'general') return 'safe';
    if (r === 'q' || r === 'questionable' || r === 'sensitive') return 'questionable';
    return 'explicit';
  };

  // Search multiple sources
  const search = useCallback(async (options: SearchOptions): Promise<BooruPost[]> => {
    const { sources, tags, page = 1, limit = 40 } = options;

    if (!tags.trim()) {
      return [];
    }

    setIsLoading(true);
    setError(null);

    try {
      // Search all enabled sources in parallel
      const results = await Promise.allSettled(
        sources.map(async (sourceId) => {
          const response = await fetch(`/api/booru/search?${new URLSearchParams({
            source: sourceId,
            tags,
            page: String(page),
            limit: String(limit),
          })}`);

          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(`${BOORU_SOURCES[sourceId]?.name || sourceId}: ${payload?.error || response.statusText}`);
          }

          const data = await response.json();

          // Server returns pre-parsed format, map to BooruPost
          const posts = Array.isArray(data) ? data : [];
          return posts.filter((p: any) => p.url || p.fullUrl).map((p: any): BooruPost => ({
            id: `${sourceId}_${p.id}`,
            source: sourceId,
            previewUrl: p.url || p.fullUrl,
            fullUrl: p.fullUrl || p.url,
            md5: p.md5 || p.id, // Use ID as fallback for dedup
            width: p.width || 0,
            height: p.height || 0,
            score: p.score || 0,
            rating: parseRating(p.rating || 's'),
            tags: p.tags || [],
            fileExt: p.fileExt || (p.fullUrl || p.url || '').split('.').pop() || 'jpg',
          }));
        })
      );

      // Combine results from all sources
      let allPosts: BooruPost[] = [];
      const sourceErrors: string[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled') {
          allPosts = allPosts.concat(result.value);
        } else {
          sourceErrors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
        }
      }
      setError(sourceErrors.length > 0 ? sourceErrors.join(' | ') : null);

      // Remove duplicates by ID (unique per source+id combo)
      const seen = new Set<string>();
      allPosts = allPosts.filter(post => {
        // Use the full post.id which includes source prefix
        if (seen.has(post.id)) return false;
        seen.add(post.id);
        return true;
      });

      // Sort by score
      allPosts.sort((a, b) => b.score - a.score);

      return allPosts;
    } catch (err: any) {
      setError(err.message);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Autocomplete tags
  const autocomplete = useCallback(async (
    sourceId: string,
    query: string
  ): Promise<string[]> => {
    if (!query.trim() || query.length < 2) {
      return [];
    }

    try {
      const response = await fetch(`/api/booru/autocomplete?${new URLSearchParams({
        source: sourceId,
        query,
      })}`);

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
