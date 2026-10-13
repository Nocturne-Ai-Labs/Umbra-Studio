import { inflateSync } from 'node:zlib';

export const MAX_METADATA_TEXT_BYTES = 16 * 1024 * 1024;

export function decodePngMetadataText(type: string, data: Buffer, remainingBytes: number): { keyword: string; text: string; bytes: number } {
  const separator = data.indexOf(0);
  if (separator < 1 || separator > 79) throw new Error('Invalid PNG metadata keyword');
  const keyword = data.toString('latin1', 0, separator);
  let textStart = separator + 1;
  let compressed = false;
  if (type === 'zTXt') {
    if (data[textStart++] !== 0) throw new Error('Unsupported PNG metadata compression method');
    compressed = true;
  } else if (type === 'iTXt') {
    const flag = data[textStart++], method = data[textStart++];
    if ((flag !== 0 && flag !== 1) || method !== 0) throw new Error('Invalid PNG metadata compression header');
    compressed = flag === 1;
    for (let field = 0; field < 2; field++) {
      const end = data.indexOf(0, textStart);
      if (end < 0) throw new Error('PNG metadata header is truncated');
      textStart = end + 1;
    }
  }
  if (textStart > data.length) throw new Error('PNG metadata header is truncated');
  const encoded = data.subarray(textStart);
  const decoded = compressed
    ? inflateSync(encoded, { maxOutputLength: Math.max(1, remainingBytes) })
    : encoded;
  if (decoded.length > remainingBytes) throw new Error('PNG metadata exceeds the decoded read limit');
  const text = type === 'iTXt'
    ? new TextDecoder('utf-8', { fatal: true }).decode(decoded)
    : decoded.toString('latin1');
  return { keyword, text, bytes: decoded.length };
}
