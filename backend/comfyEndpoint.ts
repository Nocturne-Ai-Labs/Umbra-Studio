import { formatUrlHost } from './remoteNetworkAddress';

export interface ComfyEndpoint {
  protocol: 'http:' | 'https:';
  host: string;
  port: number;
}

export function resolveComfyEndpoint(
  rawUrl: string,
  fallbackHost: string,
  fallbackPort: number,
): ComfyEndpoint {
  const fallback: ComfyEndpoint = { protocol: 'http:', host: fallbackHost, port: fallbackPort };
  const value = String(rawUrl || '').trim();
  if (!value) return fallback;
  try {
    const parsed = new URL(value.includes('://') ? value : `http://${value}`);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    // Keep the historical ComfyUI port for HTTP URLs without a port. HTTPS
    // without a port uses its standard port, which URL.port leaves empty.
    const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : fallbackPort;
    return {
      protocol: parsed.protocol,
      host: parsed.hostname || fallbackHost,
      port: Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallbackPort,
    };
  } catch {
    return fallback;
  }
}

export function getComfyHttpBaseUrl(endpoint: ComfyEndpoint): string {
  return new URL(`${endpoint.protocol}//${formatUrlHost(endpoint.host)}:${endpoint.port}`).origin;
}

export function getComfyWebSocketUrl(endpoint: ComfyEndpoint, search = ''): string {
  const url = new URL(getComfyHttpBaseUrl(endpoint));
  url.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/ws';
  url.search = search;
  return url.toString();
}
