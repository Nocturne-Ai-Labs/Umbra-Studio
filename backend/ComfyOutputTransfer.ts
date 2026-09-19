export async function fetchComfyOutput(
  url: string,
  options: { maxBytes: number; timeoutMs?: number },
): Promise<{ bytes: Uint8Array; contentType: string }> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(options.timeoutMs ?? 120_000),
  });
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (!response.ok || declaredSize > options.maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error(`Unable to load the ComfyUI output (${response.status}).`);
    throw new Error('ComfyUI output exceeds the image size limit.');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('ComfyUI returned an empty image output.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > options.maxBytes) throw new Error('ComfyUI output exceeds the image size limit.');
      chunks.push(next.value);
    }
    if (!size) throw new Error('ComfyUI returned an empty image output.');
    const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    if ((!encoding || encoding === 'identity') && declaredSize > 0 && size !== declaredSize) {
      throw new Error('ComfyUI returned an incomplete image output.');
    }
    return {
      bytes: Buffer.concat(chunks, size),
      contentType: String(response.headers.get('content-type') || 'image/png').split(';')[0].trim() || 'image/png',
    };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
