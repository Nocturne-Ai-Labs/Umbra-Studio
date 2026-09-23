type HttpFetch = (input: URL, init: RequestInit) => Promise<Response>;

// AI-Toolkit's UI exposes its authenticated state at /api/auth. A bare open
// port or a generic 200 page can belong to an unrelated local application.
export async function probeAIToolkit(url: string, request: HttpFetch = fetch, timeoutMs = 1200, authToken?: string): Promise<boolean> {
  try {
    const target = new URL('/api/auth', url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') return false;
    const response = await request(target, {
      method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      ...(authToken ? { headers: { Authorization: `Bearer ${authToken}` } } : {}),
    });
    if (!response.ok || !(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > 64 * 1024) {
      await response.body?.cancel().catch(() => undefined);
      return false;
    }
    const reader = response.body?.getReader();
    if (!reader) return false;
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > 64 * 1024) return false;
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    const result = JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size).toString('utf8'));
    return result && typeof result === 'object' && !Array.isArray(result) && result.isAuthenticated === true;
  } catch {
    return false;
  }
}
