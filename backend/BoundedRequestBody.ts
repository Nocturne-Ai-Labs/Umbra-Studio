export class RequestBodyTooLargeError extends Error {}

export async function readRequestTextWithLimit(req: Request, maxBytes: number): Promise<string> {
  if (Number(req.headers.get('content-length')) > maxBytes) throw new RequestBodyTooLargeError('Request body is too large.');
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new RequestBodyTooLargeError('Request body is too large.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, bytes).toString('utf8');
}
