import { resolve } from 'node:path';

export type UmbraRuntimeHealth = 'absent' | 'owned' | 'foreign';

export async function inspectUmbraRuntimeHealth(
  runtimeRoot: string,
  port: number,
  bindHost = '127.0.0.1',
): Promise<UmbraRuntimeHealth> {
  const host = bindHost === '::1' ? '[::1]' : '127.0.0.1';
  try {
    const response = await fetch(`http://${host}:${port}/api/healthz/ready`, {
      cache: 'no-store', signal: AbortSignal.timeout(1_500),
    });
    const payload = await response.json().catch(() => null) as { runtimeRoot?: unknown } | null;
    if (!payload || typeof payload.runtimeRoot !== 'string' || !payload.runtimeRoot) return 'foreign';
    const normalize = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
    return normalize(payload.runtimeRoot) === normalize(runtimeRoot) ? 'owned' : 'foreign';
  } catch (error) {
    // A hung listener is not evidence that the endpoint is safe to shut down.
    if ((error as Error).name === 'TimeoutError' || (error as Error).name === 'AbortError') return 'foreign';
    return 'absent';
  }
}
