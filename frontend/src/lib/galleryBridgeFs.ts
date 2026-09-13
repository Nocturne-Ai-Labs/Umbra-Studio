export const GALLERY_BRIDGE_FS_PREFIX = '/api/gallery-bridge/fs';

export function galleryBridgeFsUrl(pathname: string, params?: URLSearchParams): string {
  return `${GALLERY_BRIDGE_FS_PREFIX}${pathname}${params ? `?${params.toString()}` : ''}`;
}

async function fetchGalleryFsPage(pathname: string, params: URLSearchParams, init?: RequestInit): Promise<Response> {
  init?.signal?.throwIfAborted();
  return fetch(galleryBridgeFsUrl(pathname, params), init);
}

type GalleryListing = Record<string, unknown> & {
  files?: Record<string, unknown>[];
  folders?: Record<string, unknown>[];
  nextCursor?: number | null;
  done?: boolean;
  total?: number;
};

export async function fetchGalleryFs(pathname: string, params: URLSearchParams, init?: RequestInit, onPage?: (page: GalleryListing) => void): Promise<Response> {
  const response = await fetchGalleryFsPage(pathname, params, init);
  if (!response.ok || pathname !== '/list-progressive'
    || String(init?.method || 'GET').toUpperCase() !== 'GET'
    || (!onPage && Number(params.get('limit')) > 0) || Number(params.get('cursor')) > 0) return response;

  // Keep full-list callers compatible while allowing the Gallery to display
  // each accumulated page before the complete listing is ready.
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
    onPage?.({ ...firstPage, files: [...files.values()], folders: [...folders.values()], total,
      done: page.done !== false && page.nextCursor == null, nextCursor: page.nextCursor });
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
  if (url.startsWith('/api/fs/')) {
    return url.replace(/^\/api\/fs/, GALLERY_BRIDGE_FS_PREFIX);
  }
  return url;
}
