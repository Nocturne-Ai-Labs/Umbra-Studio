type TrashThumbnailSource = {
  path?: unknown;
  thumbnailUrl?: unknown;
};

type TrashThumbnailOptions = {
  size?: 'small' | 'medium' | 'large';
  quality?: number;
  defer?: boolean;
  retry?: number;
  fallbackRevision?: string;
};

function appendParams(rawUrl: string, params: Record<string, string | number | undefined>): string {
  const hashIndex = rawUrl.indexOf('#');
  const hash = hashIndex >= 0 ? rawUrl.slice(hashIndex) : '';
  const withoutHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
  const [base, rawSearch = ''] = withoutHash.split('?');
  const search = new URLSearchParams(rawSearch);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return `${base}${query ? `?${query}` : ''}${hash}`;
}

export function buildTrashThumbnailUrl(
  source: TrashThumbnailSource,
  options: TrashThumbnailOptions = {},
): string {
  const path = String(source.path || '').replace(/\\/g, '/').trim();
  if (!path) return '';

  const existingUrl = String(source.thumbnailUrl || '').trim();
  const size = options.size || 'small';
  const quality = Number.isFinite(Number(options.quality))
    ? Math.max(1, Math.min(100, Math.floor(Number(options.quality))))
    : 70;
  const baseUrl = existingUrl || `/api/fs/thumbnail?path=${encodeURIComponent(path)}`;
  const existingSearch = new URLSearchParams(baseUrl.split('?')[1]?.split('#')[0] || '');
  const retry = Number(options.retry || 0);

  return appendParams(baseUrl, {
    size,
    q: quality,
    fit: 'contain',
    defer: options.defer ? 1 : undefined,
    retry: retry > 0 ? Math.floor(retry) : undefined,
    rev: existingSearch.has('rev') ? undefined : options.fallbackRevision,
  });
}
