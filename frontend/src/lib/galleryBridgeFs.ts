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

async function fetchGalleryFsPage(pathname: string, params: URLSearchParams, init?: RequestInit): Promise<Response> {
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

type GalleryListing = Record<string, unknown> & {
  files?: Record<string, unknown>[];
  folders?: Record<string, unknown>[];
  nextCursor?: number | null;
  done?: boolean;
  total?: number;
};

export async function fetchGalleryFs(pathname: string, params: URLSearchParams, init?: RequestInit): Promise<Response> {
  const response = await fetchGalleryFsPage(pathname, params, init);
  if (!response.ok || pathname !== '/list-progressive'
    || String(init?.method || 'GET').toUpperCase() !== 'GET'
    || Number(params.get('limit')) > 0 || Number(params.get('cursor')) > 0) return response;

  // The main backend returns a full listing, but the standalone Gallery service
  // pages it. Unbounded callers must receive the same complete result from both.
  let page: GalleryListing = await response.clone().json();
  if (page.nextCursor == null && page.done !== false) return response;
  const files = new Map<string | symbol, Record<string, unknown>>();
  const folders = new Map<string | symbol, Record<string, unknown>>();
  const append = (target: typeof files, entries: Record<string, unknown>[] | undefined) => {
    for (const entry of entries || []) {
      const key = String(entry.path ?? entry.relativePath ?? entry.uid ?? entry.id ?? '');
      target.set(key || Symbol(), entry);
    }
  };
  const firstPage = page;
  let total = 0;
  let cursor = 0;
  while (true) {
    init?.signal?.throwIfAborted();
    if (page.missing === true) throw new Error('Folder is currently unavailable');
    append(files, page.files);
    append(folders, page.folders);
    total = Math.max(total, Number(page.total) || 0);
    if (page.nextCursor == null && page.done !== false) break;
    const nextCursor = page.nextCursor;
    if (typeof nextCursor !== 'number' || !Number.isSafeInteger(nextCursor) || nextCursor <= cursor) {
      throw new Error('Gallery returned an invalid continuation cursor. Refresh the folder to retry.');
    }
    cursor = nextCursor;
    const nextParams = new URLSearchParams(params);
    nextParams.set('cursor', String(cursor));
    nextParams.set('limit', '256');
    nextParams.delete('force');
    nextParams.delete('refresh');
    const nextResponse = await fetchGalleryFsPage(pathname, nextParams, init);
    if (!nextResponse.ok) return nextResponse;
    page = await nextResponse.json();
  }
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.delete('transfer-encoding');
  return Response.json({
    ...firstPage,
    files: [...files.values()],
    folders: [...folders.values()],
    total: Math.max(total, files.size),
    done: true,
    nextCursor: null,
  }, { status: response.status, headers });
}

export function normalizeGalleryFsUrl(rawUrl: string): string {
  const url = String(rawUrl || '').trim();
  const baseUrl = galleryFsBaseUrl();
  if (url.startsWith('/api/fs/')) {
    return baseUrl ? `${baseUrl}${url}` : url.replace(/^\/api\/fs/, GALLERY_BRIDGE_FS_PREFIX);
  }
  return url;
}
