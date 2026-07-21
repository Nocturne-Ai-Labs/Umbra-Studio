import { useState, useEffect, useCallback } from 'react';

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

export function useApiKeys() {
  const [config, setConfig] = useState<ApiKeyConfig>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dataset/api-keys');
      if (!response.ok) {
        throw new Error('Failed to fetch API keys');
      }
      const data = await response.json();
      setConfig((data?.config ?? data ?? {}) as ApiKeyConfig);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveApiKeys = useCallback(async (update: ApiKeyUpdate): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dataset/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(update),
      });
      if (!response.ok) {
        throw new Error('Failed to save API keys');
      }
      await fetchConfig();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchConfig]);

  const deleteApiKeys = useCallback(async (site: ApiSiteId): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/dataset/api-keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ site }),
      });
      if (!response.ok) {
        throw new Error('Failed to delete API keys');
      }
      await fetchConfig();
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [fetchConfig]);

  useEffect(() => {
    fetchConfig();
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
