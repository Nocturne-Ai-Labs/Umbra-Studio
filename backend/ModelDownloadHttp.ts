export function isCivitaiModelDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === 'https://civitai.com'
      && !url.username && !url.password
      && /^\/api\/download\/models\/\d+\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

export async function fetchModelDownload(urlValue: string, token = '', signal?: AbortSignal): Promise<Response> {
  let url = new URL(urlValue);
  const authenticatedOrigin = url.origin === 'https://civitai.com';
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
      throw new Error('Unsupported download URL');
    }
    signal?.throwIfAborted();
    const headers = new Headers({ 'User-Agent': 'UmbraStudio', 'Accept-Encoding': 'identity' });
    if (authenticatedOrigin && url.origin === 'https://civitai.com' && token.trim()) {
      headers.set('Authorization', `Bearer ${token.trim()}`);
    }
    const response = await fetch(url, { headers, signal, redirect: 'manual' });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('Download redirect is missing its destination');
    const next = new URL(location, url);
    if (url.protocol === 'https:' && next.protocol !== 'https:') throw new Error('Insecure download redirect');
    url = next;
  }
  throw new Error('Too many download redirects');
}
