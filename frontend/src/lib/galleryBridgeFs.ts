import { logDiagnostic } from '@/lib/diagnostics';

export const GALLERY_BRIDGE_FS_PREFIX = '/api/gallery-bridge/fs';
export const GALLERY_DIRECT_BASE_URLS = ['http://127.0.0.1:8313', 'http://localhost:8313'] as const;

let galleryDirectBaseUrl = '';

function isLoopbackBrowserHost(): boolean {
  if (typeof window === 'undefined') return true;
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function galleryFsBaseUrl(): string {
  return galleryDirectBaseUrl || '';
}

export function setGalleryDirectBaseUrl(value: unknown): boolean {
  if (!isLoopbackBrowserHost()) return false;
  const baseUrl = String(value || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return false;
  if (!GALLERY_DIRECT_BASE_URLS.some((candidate) => candidate === baseUrl)) return false;
  if (galleryDirectBaseUrl === baseUrl) return false;
  galleryDirectBaseUrl = baseUrl;
  return true;
}

export function clearGalleryDirectBaseUrl(): void {
  galleryDirectBaseUrl = '';
}

export function galleryBridgeFsUrl(pathname: string, params?: URLSearchParams): string {
  const baseUrl = galleryFsBaseUrl();
  const prefix = baseUrl ? `${baseUrl}/api/fs` : GALLERY_BRIDGE_FS_PREFIX;
  return `${prefix}${pathname}${params ? `?${params.toString()}` : ''}`;
}

function isAbortLike(error: unknown, signal?: AbortSignal | null): boolean {
  if (signal?.aborted) return true;
  if (!error || typeof error !== 'object') return false;
  const record = error as { name?: unknown; message?: unknown };
  return record.name === 'AbortError' || String(record.message || '').toLowerCase().includes('abort');
}

export async function fetchGalleryFs(pathname: string, params: URLSearchParams, init?: RequestInit): Promise<Response> {
  const directBaseUrl = galleryFsBaseUrl();
  const method = String(init?.method || 'GET').toUpperCase();
  const signal = init?.signal ?? null;
  const canUseDirectBridge = isLoopbackBrowserHost();
  const directCandidates = directBaseUrl
    ? (canUseDirectBridge ? [directBaseUrl] : [])
    : (canUseDirectBridge && method === 'GET' ? [...GALLERY_DIRECT_BASE_URLS] : []);

  for (const baseUrl of directCandidates) {
    try {
      const response = await fetch(`${baseUrl}/api/fs${pathname}${params ? `?${params.toString()}` : ''}`, init);
      setGalleryDirectBaseUrl(baseUrl);
      return response;
    } catch (error) {
      if (isAbortLike(error, signal)) throw error;
      if (directBaseUrl) clearGalleryDirectBaseUrl();
      logDiagnostic('[Umbra Gallery FS]', {
        event: 'direct_gallery_fetch_failed',
        pathname,
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      }, 'warn');
    }
  }

  if (signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  return fetch(`${GALLERY_BRIDGE_FS_PREFIX}${pathname}${params ? `?${params.toString()}` : ''}`, init);
}

export function normalizeGalleryFsUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim();
  const baseUrl = galleryFsBaseUrl();
  if (url.startsWith('/api/fs/')) {
    return baseUrl ? `${baseUrl}${url}` : url.replace(/^\/api\/fs/, GALLERY_BRIDGE_FS_PREFIX);
  }
  return url;
}
