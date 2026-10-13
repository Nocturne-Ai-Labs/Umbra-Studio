import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { MAX_METADATA_TEXT_BYTES } from './PngMetadataText';

const XMP = Buffer.from('http://ns.adobe.com/xap/1.0/\0');
const EXTENDED_XMP = Buffer.from('http://ns.adobe.com/xmp/extension/\0');
const NAMESPACE = 'urn:umbra-studio:generation-metadata:1';
const XML_START = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:umbra="${NAMESPACE}"`;
const XML_END = '</rdf:Description></rdf:RDF></x:xmpmeta>';

// Inspect only marker headers, then pass scan data through without buffering
// pixels. Writers count retained APP1 metadata as well as newly added packets.
export class JpegMetadataWireBudget {
  private mode: 'signature' | 'prefix' | 'marker' | 'length' | 'payload' | 'scan' = 'signature';
  private signatureBytes = 0;
  private marker = 0;
  private markerCount = 0;
  private lengthBytes = 0;
  private length = 0;
  private remaining = 0;
  private wireBytes = 0;
  consume(bytes: Buffer): void {
    let offset = 0;
    while (offset < bytes.length && this.mode !== 'scan') {
      if (this.mode === 'payload') {
        const count = Math.min(this.remaining, bytes.length - offset);
        offset += count; this.remaining -= count;
        if (!this.remaining) this.mode = this.marker === 0xda ? 'scan' : 'prefix';
        continue;
      }
      const byte = bytes[offset++];
      if (this.mode === 'signature') {
        if (byte !== (this.signatureBytes++ === 0 ? 0xff : 0xd8)) throw new Error('Invalid JPEG export signature');
        if (this.signatureBytes === 2) this.mode = 'prefix';
      } else if (this.mode === 'prefix') {
        if (byte !== 0xff) throw new Error('Invalid JPEG export marker');
        this.mode = 'marker';
      } else if (this.mode === 'marker') {
        if (++this.markerCount > 100_000) throw new Error('JPEG export exceeds the marker limit');
        if (byte === 0xff) continue;
        if (byte === 0 || byte === 0xd8) throw new Error('Invalid JPEG export marker');
        if (byte === 0xd9) { this.mode = 'scan'; continue; }
        if (byte === 1 || byte >= 0xd0 && byte <= 0xd7) { this.mode = 'prefix'; continue; }
        this.marker = byte; this.length = 0; this.lengthBytes = 0; this.mode = 'length';
      } else {
        this.length = this.length * 256 + byte;
        if (++this.lengthBytes !== 2) continue;
        if (this.length < 2) throw new Error('Invalid JPEG export segment length');
        if (this.marker === 0xe1) {
          this.wireBytes += this.length;
          if (this.wireBytes > MAX_METADATA_TEXT_BYTES) throw new Error('JPEG metadata exceeds the wire limit');
        }
        this.remaining = this.length - 2;
        this.mode = this.remaining ? 'payload' : this.marker === 0xda ? 'scan' : 'prefix';
      }
    }
  }
  finish(): void { if (this.mode !== 'scan') throw new Error('JPEG export metadata is truncated'); }
}

function app1(payload: Buffer): Buffer {
  if (payload.length > 65533) throw new Error('JPEG metadata segment is too large');
  const header = Buffer.from([0xff, 0xe1, 0, 0]);
  header.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([header, payload]);
}

// Adobe's ExtendedXMP framing avoids the 64KiB APP1 ceiling without discarding
// a large Power Prompter restore snapshot. MD5 here identifies the XMP packet.
export function createJpegGenerationMetadata(chunks: Record<string, string>): Buffer[] {
  const json = Buffer.from(JSON.stringify(chunks), 'utf8');
  if (json.length > MAX_METADATA_TEXT_BYTES) throw new Error('Generation metadata exceeds the decoded limit');
  const packet = Buffer.from(`${XML_START}><umbra:chunks>${json.toString('base64')}</umbra:chunks>${XML_END}`, 'utf8');
  let segments: Buffer[];
  if (packet.length + XMP.length <= 65533) {
    segments = [app1(Buffer.concat([XMP, packet]))];
  } else {
    const guid = createHash('md5').update(packet).digest('hex').toUpperCase();
    const main = `${XML_START} xmlns:xmpNote="http://ns.adobe.com/xmp/note/"><xmpNote:HasExtendedXMP>${guid}</xmpNote:HasExtendedXMP>${XML_END}`;
    segments = [app1(Buffer.concat([XMP, Buffer.from(main)]))];
    const portionSize = 65533 - EXTENDED_XMP.length - 40;
    for (let offset = 0; offset < packet.length; offset += portionSize) {
      const sizes = Buffer.alloc(8);
      sizes.writeUInt32BE(packet.length, 0); sizes.writeUInt32BE(offset, 4);
      segments.push(app1(Buffer.concat([EXTENDED_XMP, Buffer.from(guid), sizes, packet.subarray(offset, offset + portionSize)])));
    }
  }
  if (segments.reduce((sum, segment) => sum + segment.length, 0) > MAX_METADATA_TEXT_BYTES) throw new Error('Generation metadata exceeds the wire limit');
  return segments;
}

async function readExactly(handle: FileHandle, size: number, position: number): Promise<Buffer> {
  const bytes = Buffer.alloc(size);
  for (let offset = 0; offset < size;) {
    const read = await handle.read(bytes, offset, size - offset, position + offset);
    if (!read.bytesRead) throw new Error('JPEG metadata is truncated');
    offset += read.bytesRead;
  }
  return bytes;
}

function imageDescription(payload: Buffer): string {
  if (!payload.subarray(0, 6).equals(Buffer.from('Exif\0\0'))) return '';
  const tiff = payload.subarray(6);
  const endian = tiff.toString('ascii', 0, 2);
  if (tiff.length < 8 || (endian !== 'II' && endian !== 'MM')) throw new Error('Invalid JPEG EXIF header');
  const u16 = (offset: number) => endian === 'II' ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  const u32 = (offset: number) => endian === 'II' ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  if (u16(2) !== 42) throw new Error('Invalid JPEG EXIF signature');
  const offset = u32(4);
  if (offset + 2 > tiff.length) throw new Error('JPEG EXIF directory is truncated');
  const count = u16(offset);
  if (offset + 2 + count * 12 > tiff.length) throw new Error('JPEG EXIF entries are truncated');
  for (let index = 0; index < count; index++) {
    const entry = offset + 2 + index * 12;
    if (u16(entry) !== 0x010e || u16(entry + 2) !== 2) continue;
    const length = u32(entry + 4), start = length <= 4 ? entry + 8 : u32(entry + 8);
    if (start + length > tiff.length) throw new Error('JPEG EXIF text is truncated');
    return tiff.toString('latin1', start, start + length).replace(/\0+$/, '');
  }
  return '';
}

export async function readJpegMetadataText(handle: FileHandle): Promise<Record<string, string>> {
  const chunks: Record<string, string> = {};
  const size = (await handle.stat()).size;
  if (!(await readExactly(handle, 2, 0)).equals(Buffer.from([0xff, 0xd8]))) throw new Error('Invalid JPEG signature');
  let offset = 2, wireBytes = 0, finished = false;
  const packets: Buffer[] = [];
  const extended = new Map<string, { length: number; portions: Map<number, Buffer> }>();
  for (let markerCount = 0; markerCount < 100_000; markerCount++) {
    if (offset >= size || (await readExactly(handle, 1, offset++))[0] !== 0xff) throw new Error('Invalid JPEG marker');
    let marker = (await readExactly(handle, 1, offset++))[0];
    while (marker === 0xff) {
      if (++markerCount >= 100_000) throw new Error('JPEG exceeds the marker limit');
      marker = (await readExactly(handle, 1, offset++))[0];
    }
    if (marker === 0xd9) { finished = true; break; }
    if (marker === 0 || marker === 0xd8) throw new Error('Invalid JPEG marker');
    if (marker === 1 || marker >= 0xd0 && marker <= 0xd7) continue;
    const length = (await readExactly(handle, 2, offset)).readUInt16BE();
    if (length < 2 || offset + length > size) throw new Error('JPEG metadata is truncated');
    if (marker === 0xda) { finished = true; break; }
    if (marker === 0xe1) {
      wireBytes += length;
      if (wireBytes > MAX_METADATA_TEXT_BYTES) throw new Error('JPEG metadata exceeds the wire limit');
      const payload = await readExactly(handle, length - 2, offset + 2);
      if (payload.subarray(0, XMP.length).equals(XMP)) packets.push(payload.subarray(XMP.length));
      else if (payload.subarray(0, EXTENDED_XMP.length).equals(EXTENDED_XMP)) {
        const header = EXTENDED_XMP.length;
        if (payload.length < header + 40) throw new Error('Extended XMP header is truncated');
        const guid = payload.toString('ascii', header, header + 32);
        const total = payload.readUInt32BE(header + 32), start = payload.readUInt32BE(header + 36);
        const portion = payload.subarray(header + 40);
        if (!/^[A-F0-9]{32}$/.test(guid) || total > MAX_METADATA_TEXT_BYTES || start + portion.length > total) throw new Error('Invalid extended XMP bounds');
        const entry = extended.get(guid) || { length: total, portions: new Map<number, Buffer>() };
        if (entry.length !== total || entry.portions.has(start) && !entry.portions.get(start)!.equals(portion)) throw new Error('Conflicting extended XMP portions');
        entry.portions.set(start, portion); extended.set(guid, entry);
      } else {
        const text = imageDescription(payload);
        if (/^Steps: /m.test(text) && !chunks.parameters) chunks.parameters = text;
      }
    }
    offset += length;
  }
  if (!finished) throw new Error('JPEG metadata exceeds the marker limit');
  // The first Umbra packet is the newly embedded one; older retained XMP must
  // not override it when an already annotated JPEG is exported again.
  const packet = packets.find(bytes => bytes.includes(Buffer.from(NAMESPACE)));
  if (!packet) return chunks;
  let xml = new TextDecoder('utf-8', { fatal: true }).decode(packet);
  const guid = xml.match(/<xmpNote:HasExtendedXMP>([A-F0-9]{32})<\/xmpNote:HasExtendedXMP>/)?.[1];
  if (guid) {
    const entry = extended.get(guid);
    if (!entry) throw new Error('Extended XMP is missing');
    let cursor = 0; const portions: Buffer[] = [];
    for (const [start, bytes] of [...entry.portions].sort(([a], [b]) => a - b)) {
      if (start !== cursor) throw new Error('Extended XMP has missing or overlapping portions');
      cursor += bytes.length; portions.push(bytes);
    }
    if (cursor !== entry.length) throw new Error('Extended XMP is truncated');
    const joined = Buffer.concat(portions, cursor);
    if (createHash('md5').update(joined).digest('hex').toUpperCase() !== guid) throw new Error('Extended XMP content mismatch');
    xml = new TextDecoder('utf-8', { fatal: true }).decode(joined);
  }
  const encoded = xml.match(/<umbra:chunks>([A-Za-z0-9+/]*={0,2})<\/umbra:chunks>/)?.[1];
  if (!encoded || encoded.length % 4) throw new Error('Invalid Umbra XMP metadata');
  if (encoded.length > Math.ceil(MAX_METADATA_TEXT_BYTES / 3) * 4) throw new Error('JPEG metadata exceeds the decoded limit');
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length > MAX_METADATA_TEXT_BYTES) throw new Error('JPEG metadata exceeds the decoded limit');
  const record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decoded));
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('Invalid Umbra XMP record');
  for (const [key, value] of Object.entries(record)) if (typeof value === 'string') chunks[key] = value;
  return chunks;
}
