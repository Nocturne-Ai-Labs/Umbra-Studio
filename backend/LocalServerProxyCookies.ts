import { createHash } from 'node:crypto';

// Browser cookies belong to Umbra's origin, so each proxied app needs its own
// name and path scope before any cookie can cross the proxy boundary.
function proxyCookiePrefix(token: string): string {
  const scope = createHash('sha256').update(token).digest('hex').slice(0, 32);
  return `umbra_local_${scope}_`;
}

export function getLocalServerProxyCookieHeader(cookieHeader: string | null, token: string): string {
  if (!cookieHeader) return '';
  const prefix = proxyCookiePrefix(token);
  return cookieHeader.split(';').flatMap((part) => {
    const pair = part.trim();
    const separator = pair.indexOf('=');
    if (separator <= prefix.length || !pair.startsWith(prefix)) return [];
    return [pair.slice(prefix.length)];
  }).join('; ');
}

export function rewriteLocalServerProxySetCookies(headers: Headers, token: string, proxyRoot: string, requestPath: string): void {
  const upstreamCookies = headers.getSetCookie();
  headers.delete('set-cookie');
  const prefix = proxyCookiePrefix(token);
  for (const cookie of upstreamCookies) {
    const parts = cookie.split(';');
    const pair = parts.shift()?.trim() || '';
    const separator = pair.indexOf('=');
    if (separator <= 0) continue;
    const name = pair.slice(0, separator);
    if (/[\s;=]/.test(name)) continue;
    let hasPath = false;
    const attributes = parts.flatMap((part) => {
      const attribute = part.trim();
      if (/^domain\s*=/i.test(attribute)) return [];
      if (/^path\s*=/i.test(attribute)) {
        hasPath = true;
        const path = attribute.slice(attribute.indexOf('=') + 1).trim();
        // Invalid or ambiguous paths must still remain inside this app's scope.
        const safePath = path.startsWith('/') && !/\\|(?:^|\/)\.\.?($|\/)/.test(path) ? path : '/';
        return [`Path=${proxyRoot}${safePath === '/' ? '' : safePath}`];
      }
      return attribute ? [attribute] : [];
    });
    // Without a slash after the token, the browser's default path would span
    // every proxied app rather than this one.
    if (!hasPath && requestPath === proxyRoot) attributes.push(`Path=${proxyRoot}`);
    headers.append('set-cookie', `${prefix}${pair}${attributes.length ? `; ${attributes.join('; ')}` : ''}`);
  }
}
