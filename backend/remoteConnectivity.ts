export const REMOTE_CONNECTIVITY_PATH = '/api/remote/connectivity';

// The host browser can test this public probe without granting its origin
// access to remote settings, authenticated APIs, or the filesystem.
export function isHostConnectivityProbeOrigin(origin: string, path: string, method: string, port: number): boolean {
  if (path !== REMOTE_CONNECTIVITY_PATH || (method !== 'GET' && method !== 'OPTIONS')) return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && !url.username && !url.password
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      && Number(url.port || 80) === port;
  } catch {
    return false;
  }
}

export function createRemoteConnectivityStatus(authRequired: boolean, authConfigured: boolean) {
  return { ok: true, service: 'umbra-remote', authRequired, authConfigured };
}
