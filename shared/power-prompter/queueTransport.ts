export const QUEUE_UPLOAD_CHUNK_CHARS = 256 * 1024;
export const QUEUE_UPLOAD_MAX_BYTES = 128 * 1024 * 1024;
export const QUEUE_UPLOAD_TIMEOUT_MS = 60_000;
const encoder = new TextEncoder();
type QueueType = 'queue_request' | 'queue_batch_request';
type Socket = { readyState: number; bufferedAmount: number; send(data: string): unknown };
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const sends = new WeakMap<Socket, Promise<void>>();

/** Control messages remain independent while a large queue is uploaded. */
export function sendQueueUpload(socket: Socket, payload: { type: QueueType; requestId: string; [key: string]: unknown }, active = () => true): Promise<void> {
  const sending = (sends.get(socket) || Promise.resolve()).catch(() => undefined).then(() => upload(socket, payload, active));
  sends.set(socket, sending);
  void sending.finally(() => { if (sends.get(socket) === sending) sends.delete(socket); }).catch(() => undefined);
  return sending;
}

async function upload(socket: Socket, payload: { type: QueueType; requestId: string; [key: string]: unknown }, active: () => boolean): Promise<void> {
  await pause();
  const serialized = JSON.stringify(payload);
  const bytes = encoder.encode(serialized).byteLength;
  if (bytes > QUEUE_UPLOAD_MAX_BYTES) throw new Error('Queue exceeds the 128 MiB upload limit. Submit fewer sets at a time.');
  const transferId = crypto.randomUUID();
  const frame = (message: Record<string, unknown>) => {
    if (socket.readyState !== 1 || !active()) throw new Error('Queue upload interrupted before submission.');
    socket.send(JSON.stringify({ ...message, transferId }));
  };
  const deadline = Date.now() + QUEUE_UPLOAD_TIMEOUT_MS;
  try {
    frame({ type: 'queue_upload_start', requestId: payload.requestId, requestType: payload.type, bytes });
    let index = 0;
    for (let offset = 0; offset < serialized.length; offset += QUEUE_UPLOAD_CHUNK_CHARS) {
      while (socket.bufferedAmount > 1024 * 1024) {
        if (socket.readyState !== 1 || !active() || Date.now() > deadline) throw new Error('Queue upload stalled. Reconnect and retry.');
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      if (Date.now() > deadline) throw new Error('Queue upload timed out before submission.');
      frame({ type: 'queue_upload_chunk', index: index++, text: serialized.slice(offset, offset + QUEUE_UPLOAD_CHUNK_CHARS) });
      await pause();
    }
    frame({ type: 'queue_upload_end', chunks: index });
  } catch (error) {
    if (socket.readyState === 1) {
      try { socket.send(JSON.stringify({ type: 'queue_upload_abort', transferId })); } catch { /* socket already closed */ }
    }
    throw error;
  }
}

interface Upload {
  transferId: string; requestId: string; requestType: QueueType; bytes: number;
  chunks: string[]; received: number; timer: ReturnType<typeof setTimeout>;
}
export type QueueUploadError = { type: 'queue_forwarded' | 'queue_batch_forwarded'; requestId: string; success: false; error: string; acceptedRequestIds: string[] };

/** Reassemble only queue requests, with per-client limits and no partial execution. */
export class QueueUploadReceiver<Client extends object> {
  private uploads = new Map<Client, Upload>();
  constructor(private report: (client: Client, error: QueueUploadError) => void, private timeoutMs = QUEUE_UPLOAD_TIMEOUT_MS) {}
  discard(client: Client) {
    const upload = this.uploads.get(client);
    if (upload) clearTimeout(upload.timer);
    this.uploads.delete(client);
  }
  private fail(client: Client, upload: Pick<Upload, 'requestId' | 'requestType'>, error: string) {
    this.discard(client);
    this.report(client, { type: upload.requestType === 'queue_batch_request' ? 'queue_batch_forwarded' : 'queue_forwarded', requestId: upload.requestId, success: false, error, acceptedRequestIds: [] });
  }
  receive(client: Client, data: any): any | null {
    if (data.type === 'queue_upload_start') {
      if (!['queue_request', 'queue_batch_request'].includes(data.requestType) || typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 256 || typeof data.transferId !== 'string' || !data.transferId || data.transferId.length > 128) return null;
      const old = this.uploads.get(client);
      if (old) this.fail(client, old, 'Queue upload replaced before submission.');
      if (!Number.isSafeInteger(data.bytes) || data.bytes <= 0 || data.bytes > QUEUE_UPLOAD_MAX_BYTES) {
        this.fail(client, data, 'Invalid queue upload size. Maximum is 128 MiB.'); return null;
      }
      const upload: Upload = { transferId: data.transferId, requestId: data.requestId, requestType: data.requestType, bytes: data.bytes, chunks: [], received: 0,
        timer: setTimeout(() => this.fail(client, data, 'Queue upload timed out before submission.'), this.timeoutMs) };
      this.uploads.set(client, upload);
      return null;
    }
    const upload = this.uploads.get(client);
    if (!upload || data.transferId !== upload.transferId) return null;
    if (data.type === 'queue_upload_abort') { this.discard(client); return null; }
    if (data.type === 'queue_upload_chunk') {
      if (data.index !== upload.chunks.length || typeof data.text !== 'string' || !data.text.length || data.text.length > QUEUE_UPLOAD_CHUNK_CHARS) {
        this.fail(client, upload, 'Invalid or out-of-order queue upload chunk.'); return null;
      }
      // UTF-16 length is a conservative floor; exact UTF-8 size is checked after joining.
      upload.received += data.text.length;
      if (upload.received > upload.bytes || upload.chunks.length >= 8192) { this.fail(client, upload, 'Queue upload exceeded its declared size.'); return null; }
      upload.chunks.push(data.text);
      return null;
    }
    if (data.type !== 'queue_upload_end') return null;
    this.discard(client);
    try {
      if (data.chunks !== upload.chunks.length) throw new Error('Incomplete queue upload.');
      const text = upload.chunks.join('');
      if (encoder.encode(text).byteLength !== upload.bytes) throw new Error('Queue upload size mismatch.');
      const payload = JSON.parse(text);
      if (payload?.type !== upload.requestType || payload?.requestId !== upload.requestId) throw new Error('Queue upload request mismatch.');
      return payload;
    } catch (error) {
      this.fail(client, upload, error instanceof Error ? error.message : 'Invalid queue upload.');
      return null;
    }
  }
}
