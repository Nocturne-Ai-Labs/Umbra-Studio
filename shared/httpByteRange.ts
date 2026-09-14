/** Resolve the single byte-range form supported by Gallery media endpoints. */
export function resolveSingleByteRange(value: string, size: number): { start: number; end: number } | null {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null;
  // Range numerals can exceed Number's precision even for a small local file.
  const length = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return null;
    return { start: suffix >= length ? 0 : Number(length - suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const requestedEnd = match[2] ? BigInt(match[2]) : length - 1n;
  if (start >= length || requestedEnd < start) return null;
  return { start: Number(start), end: Number(requestedEnd < length ? requestedEnd : length - 1n) };
}
