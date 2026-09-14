import { useState, useEffect, useCallback, useRef } from 'react';

export type ApiSiteId =
  | 'danbooru'
  | 'gelbooru'
  | 'rule34'
  | 'e621';

export interface SiteApiConfig {
  username?: string;
  login?: string;
  userId?: string;
  hasApiKey: boolean;
}

export type ApiKeyConfig = Partial<Record<ApiSiteId, SiteApiConfig>>;

export interface SiteApiUpdate {
  username?: string;
  login?: string;
  userId?: string;
  apiKey?: string;
}

export type ApiKeyUpdate = Partial<Record<ApiSiteId, SiteApiUpdate>>;

function parseApiKeyConfig(data: unknown): ApiKeyConfig {
  const config = data && typeof data === 'object' ? (data as { config?: unknown }).config : null;
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Invalid API-key status response');
  const result: ApiKeyConfig = {};
  for (const site of ['danbooru', 'gelbooru', 'rule34', 'e621'] as const) {
    const entry = (config as Record<string, unknown>)[site];
    if (entry === undefined) continue;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid API-key status response');
    const value = entry as Record<string, unknown>;
    if (typeof value.hasApiKey !== 'boolean'
      || ['username', 'login', 'userId'].some(key => value[key] !== undefined && typeof value[key] !== 'string')) {
      throw new Error('Invalid API-key status response');
    }
    result[site] = {
      hasApiKey: value.hasApiKey,
      ...(typeof value.username === 'string' ? { username: value.username } : {}),
      ...(typeof value.login === 'string' ? { login: value.login } : {}),
      ...(typeof value.userId === 'string' ? { userId: value.userId } : {}),
    };
  }
  return result;
}

export function useApiKeys() {
  const [config, setConfig] = useState<ApiKeyConfig>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);
  const mutationPending = useRef(false);
  const mounted = useRef(true);

  const fetchConfig = useCallback(async (duringMutation = false) => {
    if (!mounted.current || (mutationPending.current && !duringMutation)) return;
    const version = ++requestVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dataset/api-keys', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }
      const data = parseApiKeyConfig(await response.json());
      if (version === requestVersion.current && mounted.current) setConfig(data);
    } catch (err: unknown) {
      if (version === requestVersion.current && mounted.current) setError(err instanceof Error ? err.message : 'Failed to fetch API keys');
    } finally {
      if (version === requestVersion.current && mounted.current) setIsLoading(false);
    }
  }, []);

  const mutateApiKeys = useCallback(async (method: 'POST' | 'DELETE', body: ApiKeyUpdate | { site: ApiSiteId }): Promise<boolean> => {
    if (mutationPending.current || !mounted.current) return false;
    mutationPending.current = true;
    ++requestVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dataset/api-keys', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = response.ok ? await response.json() : null;
      if (result?.success !== true) {
        throw new Error(method === 'POST' ? 'Failed to save API keys' : 'Failed to delete API keys');
      }
      window.dispatchEvent(new Event('umbra:api-keys-changed'));
      if (mounted.current) await fetchConfig(true);
      return true;
    } catch (err: unknown) {
      if (mounted.current) setError(err instanceof Error ? err.message : 'Failed to update API keys');
      return false;
    } finally {
      mutationPending.current = false;
      if (mounted.current) setIsLoading(false);
    }
  }, [fetchConfig]);

  const saveApiKeys = useCallback((update: ApiKeyUpdate) => mutateApiKeys('POST', update), [mutateApiKeys]);
  const deleteApiKeys = useCallback((site: ApiSiteId) => mutateApiKeys('DELETE', { site }), [mutateApiKeys]);

  useEffect(() => {
    mounted.current = true;
    const refresh = () => { void fetchConfig(); };
    refresh();
    window.addEventListener('umbra:api-keys-changed', refresh);
    return () => {
      mounted.current = false;
      ++requestVersion.current;
      window.removeEventListener('umbra:api-keys-changed', refresh);
    };
  }, [fetchConfig]);

  return {
    config,
    isLoading,
    error,
    saveApiKeys,
    deleteApiKeys,
    refetch: fetchConfig,
  };
}
