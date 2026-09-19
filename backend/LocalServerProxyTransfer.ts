/** Bound stalls, not total stream duration: downloads and SSE may stay active indefinitely. */
export async function fetchLocalServerProxy(
  url: string,
  init: RequestInit,
  limits: { headersMs?: number; idleMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const signal = init.signal ? AbortSignal.any([init.signal, controller.signal]) : controller.signal;
  const timeout = setTimeout(() => controller.abort(new Error('Local server response timed out')),
    limits.headersMs ?? (init.method === 'GET' || init.method === 'HEAD' ? 60_000 : 600_000));
  let upstream: Response;
  try { upstream = await fetch(url, { ...init, signal }); }
  finally { clearTimeout(timeout); }
  if (init.method === 'HEAD' || [204, 205, 304].includes(upstream.status)) {
    await upstream.body?.cancel();
    return new Response(null, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
  }
  if (!upstream.body) return upstream;
  const reader = upstream.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(output) {
      const idle = setTimeout(() => controller.abort(new Error('Local server stream stalled')), limits.idleMs ?? 300_000);
      try {
        const chunk = await reader.read();
        if (chunk.done) { output.close(); reader.releaseLock(); }
        else output.enqueue(chunk.value);
      } catch (error) {
        output.error(error);
        void reader.cancel(error).catch(() => {});
      } finally { clearTimeout(idle); }
    },
    async cancel(reason) {
      controller.abort(reason);
      await reader.cancel(reason).catch(() => {});
    },
  }, { highWaterMark: 0 });
  return new Response(body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers });
}

export async function readLocalServerProxyText(
  response: Response,
  limits: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<string> {
  const maxBytes = limits.maxBytes ?? 32 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) return '';
  let expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel(new Error('Local server text response timed out')).catch(() => {});
  }, limits.timeoutMs ?? 60_000);
  try {
    const length = Number(response.headers.get('content-length'));
    if (length > maxBytes) throw new Error('Local server text response is too large');
    const decoder = new TextDecoder();
    const text: string[] = [];
    let bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (expired) throw new Error('Local server text response timed out');
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error('Local server text response is too large');
      text.push(decoder.decode(chunk.value, { stream: true }));
    }
    text.push(decoder.decode());
    return text.join('');
  } catch (error) {
    await reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
