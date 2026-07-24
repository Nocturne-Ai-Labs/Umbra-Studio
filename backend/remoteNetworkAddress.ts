function stripIpv6Brackets(host: string): string {
  return host.replace(/^\[/, '').replace(/\]$/, '');
}

export function getListenerClientHost(bindHost: string): string {
  const normalized = String(bindHost || '').trim().toLowerCase();
  if (normalized === '::' || normalized === '::1') return '::1';
  if (normalized === '0.0.0.0' || normalized === '127.0.0.1' || normalized === 'localhost' || !normalized) {
    return '127.0.0.1';
  }
  return stripIpv6Brackets(normalized);
}

export function formatUrlHost(host: string): string {
  const normalized = stripIpv6Brackets(String(host || '').trim());
  return normalized.includes(':') ? `[${normalized}]` : normalized;
}

export function buildListenerOrigin(bindHost: string, port: number): string {
  return `http://${formatUrlHost(getListenerClientHost(bindHost))}:${port}`;
}

export function buildTailscaleServeOrigin(bindHost: string, port: number): string {
  const clientHost = getListenerClientHost(bindHost);
  if (clientHost === '::1') return `http://localhost:${port}`;
  return `http://${formatUrlHost(clientHost)}:${port}`;
}
