const ALLOWED_HOST = /(^|\.)civitai\.com$/i;
const SAFE_MEDIA_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/bmp',
  'image/x-ms-bmp', 'image/tiff', 'image/heic', 'image/heif', 'image/jxl',
  'video/mp4', 'video/webm', 'video/quicktime', 'video/mpeg', 'video/ogg',
]);

export function isSafeModelMediaType(value: string): boolean {
  return SAFE_MEDIA_TYPES.has(value.trim().toLowerCase());
}

export function validateModelMediaUrl(value: string): URL {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || (url.port && url.port !== '443')) {
    throw new Error('Unsupported media URL');
  }
  if (!ALLOWED_HOST.test(url.hostname)) throw new Error('Unsupported media host');
  // Older saved snapshots may contain HTTP links. Never transmit credentials over HTTP.
  url.protocol = 'https:';
  return url;
}

export async function fetchModelMedia(
  value: string,
  token = '',
  options: { maxBytes?: number; timeoutMs?: number; signal?: AbortSignal } = {},
): Promise<{ bytes: Buffer; mimeType: string }> {
  const maxBytes = options.maxBytes ?? 80 * 1024 * 1024;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let url = validateModelMediaUrl(value);
  for (let redirects = 0; redirects <= 5; redirects++) {
    const headers = new Headers({ 'User-Agent': 'UmbraStudio', Accept: 'image/*,video/*;q=0.9', 'Accept-Encoding': 'identity' });
    if (url.origin === 'https://civitai.com' && token.trim()) headers.set('Authorization', `Bearer ${token.trim()}`);
    const response = await fetch(url, { headers, signal, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Media redirect is missing its destination');
      const next = new URL(location, url);
      if (next.protocol !== 'https:') throw new Error('Unsupported media URL redirect');
      url = validateModelMediaUrl(next.href);
      continue;
    }
    const mimeType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const size = Number(response.headers.get('content-length') || 0);
    if (!response.ok || !isSafeModelMediaType(mimeType) || size > maxBytes) {
      await response.body?.cancel().catch(() => undefined);
      if (!response.ok) throw new Error(`Media fetch failed (${response.status})`);
      if (!isSafeModelMediaType(mimeType)) throw new Error('Unsupported media content type');
      throw new Error('Media exceeds cache size limit');
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Media stream unavailable');
    const chunks: Uint8Array[] = [];
    let bytesRead = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        bytesRead += next.value.byteLength;
        if (bytesRead > maxBytes) throw new Error('Media exceeds cache size limit');
        chunks.push(next.value);
      }
      if (!bytesRead) throw new Error('Empty media response');
      const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
      if ((!encoding || encoding === 'identity') && size > 0 && bytesRead !== size) throw new Error('Incomplete media response');
      return { bytes: Buffer.concat(chunks, bytesRead), mimeType };
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
  }
  throw new Error('Too many media redirects');
}
