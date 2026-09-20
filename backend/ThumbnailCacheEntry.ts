import { createHash } from 'node:crypto';

const MAGIC = Buffer.from('UMBTHM01');
const HEADER_SIZE = MAGIC.length + 32;

function digest(cacheKey: string, payload: Buffer): Buffer {
  return createHash('sha256').update(cacheKey).update('\0').update(payload).digest();
}

// The key binding also rejects a valid preview accidentally stored under another key.
export function encodeThumbnailCacheEntry(cacheKey: string, payload: Buffer): Buffer {
  return Buffer.concat([MAGIC, digest(cacheKey, payload), payload]);
}

export function decodeThumbnailCacheEntry(cacheKey: string, stored: Buffer): Buffer | null {
  if (stored.length <= HEADER_SIZE || !stored.subarray(0, MAGIC.length).equals(MAGIC)) return null;
  const payload = stored.subarray(HEADER_SIZE);
  return stored.subarray(MAGIC.length, HEADER_SIZE).equals(digest(cacheKey, payload)) ? payload : null;
}
