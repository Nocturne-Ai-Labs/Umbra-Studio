export const CIVITAI_PAGE_TIMEOUT_MS = 45_000;
export const CIVITAI_METADATA_TIMEOUT_MS = 5_000;

type PageResult<T> = { ok: boolean; status: number; data: T; details: string };

export async function requestCivitaiPage<T>(
  url: URL,
  headers: Headers,
  options: {
    signal?: AbortSignal;
    timeoutMs?: number;
    attemptTimeoutMs?: number;
    retryDelayMs?: number;
    fetcher?: typeof fetch;
  } = {},
): Promise<PageResult<T>> {
  const budget = AbortSignal.timeout(options.timeoutMs ?? CIVITAI_PAGE_TIMEOUT_MS);
  const overall = options.signal ? AbortSignal.any([budget, options.signal]) : budget;
  const fetcher = options.fetcher ?? fetch;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    overall.throwIfAborted();
    const signal = AbortSignal.any([overall, AbortSignal.timeout(options.attemptTimeoutMs ?? 30_000)]);
    let retryDelay = options.retryDelayMs ?? 750;
    try {
      const response = await fetcher(url, { headers, signal });
      const details = response.ok ? '' : (await response.text()).slice(0, 320);
      const data = response.ok ? await response.json() as T : {} as T;
      if (response.ok || attempt > 0 || !(response.status === 429 || response.status >= 500)) {
        return { ok: response.ok, status: response.status, data, details };
      }
      const retryAfter = response.headers.get('Retry-After');
      if (retryAfter) {
        const seconds = Number(retryAfter);
        const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
        // Do not hold the page open or retry earlier than a long rate-limit window.
        if (delay > 5_000) return { ok: false, status: response.status, data, details };
        if (Number.isFinite(delay)) retryDelay = Math.max(retryDelay, delay);
      }
    } catch (error) {
      if (overall.aborted) throw overall.reason;
      if (attempt > 0 || error instanceof SyntaxError) throw error;
    }
    await new Promise<void>((resolve, reject) => {
      const finish = () => { overall.removeEventListener('abort', abort); resolve(); };
      const timer = setTimeout(finish, retryDelay);
      const abort = () => { clearTimeout(timer); overall.removeEventListener('abort', abort); reject(overall.reason); };
      overall.addEventListener('abort', abort, { once: true });
      if (overall.aborted) abort();
    });
  }
  throw new Error('CivitAI page request failed');
}

export function civitaiPageError(error: unknown): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'CivitAI is taking too long to respond. Please try again.';
  }
  return error instanceof Error ? error.message : 'CivitAI page request failed';
}
