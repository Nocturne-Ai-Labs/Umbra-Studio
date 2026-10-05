export type RemoteUrlProbeResult = {
  ok: boolean;
  secure: boolean;
  status: number;
  latencyMs: number;
  setupRequired?: boolean;
  message?: string;
  error?: string;
};

export async function probeRemoteUrl(targetUrl: string, signal: AbortSignal): Promise<RemoteUrlProbeResult> {
  const target = new URL(targetUrl);
  const startedAt = performance.now();
  const response = await fetch(new URL('/api/remote/connectivity', target), {
    cache: 'no-store',
    credentials: 'omit',
    signal,
  });
  const payload = await response.json().catch(() => null);
  const result = {
    secure: target.protocol === 'https:',
    status: response.status,
    latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
  };
  if (!response.ok) return {
    ...result,
    ok: false,
    error: typeof payload?.error === 'string' && payload.error ? payload.error : `HTTP ${response.status}`,
  };
  if (payload?.ok !== true || payload?.service !== 'umbra-remote'
    || typeof payload.authRequired !== 'boolean' || typeof payload.authConfigured !== 'boolean') {
    return { ...result, ok: false, error: 'This URL did not return an Umbra Remote connection probe.' };
  }
  const setupRequired = payload.authRequired && !payload.authConfigured;
  return {
    ...result,
    ok: true,
    setupRequired,
    message: setupRequired
      ? 'Reachable. Create the Remote Access Account in Security before signing in.'
      : payload.authRequired
        ? 'Reachable. Sign in when you open this URL on your remote device.'
        : 'Reachable. Umbra login is disabled for remote access.',
  };
}
