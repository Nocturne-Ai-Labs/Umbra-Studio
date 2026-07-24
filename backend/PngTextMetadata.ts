import { readFile, writeFile } from 'fs/promises';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CHUNK_HEADER_BYTES = 8;
const PNG_CHUNK_CRC_BYTES = 4;
const MAX_PNG_CHUNK_BYTES = 256 * 1024 * 1024;

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = (value >>> 8) ^ table[(value ^ byte) & 0xff];
  }
  return (value ^ 0xffffffff) >>> 0;
}

function readKeyword(type: string, data: Buffer): string {
  if (type !== 'tEXt' && type !== 'iTXt') return '';
  const separator = data.indexOf(0);
  if (separator <= 0) return '';
  return data.subarray(0, separator).toString('latin1');
}

function createChunk(type: string, data: Buffer): Buffer {
  if (type.length !== 4) throw new Error(`Invalid PNG chunk type: ${type}`);
  const typeBytes = Buffer.from(type, 'ascii');
  const lengthBytes = Buffer.allocUnsafe(4);
  lengthBytes.writeUInt32BE(data.length, 0);
  const crcBytes = Buffer.allocUnsafe(4);
  crcBytes.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
  return Buffer.concat([lengthBytes, typeBytes, data, crcBytes]);
}

function createInternationalTextChunk(keyword: string, value: string): Buffer {
  const normalizedKeyword = String(keyword || '').trim();
  if (!normalizedKeyword || normalizedKeyword.length > 79 || /[^\x20-\x7e]/.test(normalizedKeyword)) {
    throw new Error('PNG metadata keyword must be 1-79 printable ASCII characters.');
  }
  const data = Buffer.concat([
    Buffer.from(normalizedKeyword, 'latin1'),
    Buffer.from([0, 0, 0, 0, 0]),
    Buffer.from(String(value ?? ''), 'utf8'),
  ]);
  return createChunk('iTXt', data);
}

export function upsertPngTextMetadataBuffer(
  pngBytes: Uint8Array,
  keyword: string,
  value: string,
): Buffer {
  const input = Buffer.from(pngBytes);
  if (input.length < PNG_SIGNATURE.length || !input.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new Error('The selected file is not a PNG image.');
  }

  const chunks: Buffer[] = [input.subarray(0, PNG_SIGNATURE.length)];
  const replacementChunk = createInternationalTextChunk(keyword, value);
  let offset = PNG_SIGNATURE.length;
  let foundEnd = false;

  while (offset + PNG_CHUNK_HEADER_BYTES + PNG_CHUNK_CRC_BYTES <= input.length) {
    const dataLength = input.readUInt32BE(offset);
    if (dataLength > MAX_PNG_CHUNK_BYTES) throw new Error('PNG chunk is too large to process safely.');
    const chunkEnd = offset + PNG_CHUNK_HEADER_BYTES + dataLength + PNG_CHUNK_CRC_BYTES;
    if (chunkEnd > input.length) throw new Error('PNG metadata is truncated.');

    const type = input.subarray(offset + 4, offset + 8).toString('ascii');
    const data = input.subarray(offset + PNG_CHUNK_HEADER_BYTES, offset + PNG_CHUNK_HEADER_BYTES + dataLength);
    if (type === 'IEND') {
      chunks.push(replacementChunk);
      chunks.push(input.subarray(offset, chunkEnd));
      foundEnd = true;
      offset = chunkEnd;
      break;
    }

    if (!((type === 'tEXt' || type === 'iTXt') && readKeyword(type, data) === keyword)) {
      chunks.push(input.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
  }

  if (!foundEnd) throw new Error('PNG is missing its IEND chunk.');
  if (offset < input.length) chunks.push(input.subarray(offset));
  return Buffer.concat(chunks);
}

export async function upsertPngTextMetadata(
  filePath: string,
  keyword: string,
  value: string,
): Promise<{ bytesBefore: number; bytesAfter: number }> {
  const input = await readFile(filePath);
  const output = upsertPngTextMetadataBuffer(input, keyword, value);
  await writeFile(filePath, output);
  return {
    bytesBefore: input.length,
    bytesAfter: output.length,
  };
}
