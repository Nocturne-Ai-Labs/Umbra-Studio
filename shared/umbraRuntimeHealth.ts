import { resolve } from 'node:path';

export type UmbraRuntimeHealth = 'absent' | 'owned' | 'foreign';

export async function inspectUmbraRuntimeHealth(
  runtimeRoot: string,
  port: number,
  bindHost = '127.0.0.1',
): Promise<UmbraRuntimeHealth> {
  // Ownership must remain available while tool discovery is still warming up.
  return (await inspectUmbraRuntimeEndpoint(runtimeRoot, port, bindHost, '/api/healthz')).health;
}

export async function inspectUmbraRuntimeStatus(
  runtimeRoot: string,
  port: number,
  bindHost = '127.0.0.1',
): Promise<{ health: UmbraRuntimeHealth; ready: boolean; retryable?: boolean }> {
  return inspectUmbraRuntimeEndpoint(runtimeRoot, port, bindHost, '/api/healthz/ready');
}

async function inspectUmbraRuntimeEndpoint(
  runtimeRoot: string,
  port: number,
  bindHost: string,
  endpoint: '/api/healthz' | '/api/healthz/ready',
): Promise<{ health: UmbraRuntimeHealth; ready: boolean; retryable?: boolean }> {
  const host = bindHost === '::1' ? '[::1]' : '127.0.0.1';
  try {
    const response = await fetch(`http://${host}:${port}${endpoint}`, {
      cache: 'no-store', signal: AbortSignal.timeout(1_500),
    });
    const payload = await response.json().catch(() => null) as { runtimeRoot?: unknown } | null;
    if (!payload || typeof payload.runtimeRoot !== 'string' || !payload.runtimeRoot) return { health: 'foreign', ready: false };
    const normalize = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
    const health = normalize(payload.runtimeRoot) === normalize(runtimeRoot) ? 'owned' : 'foreign';
    return { health, ready: health === 'owned' && response.ok };
  } catch (error) {
    // A hung listener is not evidence that the endpoint is safe to shut down.
    if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError') return { health: 'foreign', ready: false, retryable: true };
    return { health: 'absent', ready: false };
  }
}
