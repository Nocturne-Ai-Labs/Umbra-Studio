import { lookup as resolveHostname } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const MAX_DATASET_IMPORT_BYTES = 256 * 1024 * 1024;
const MAX_REDIRECTS = 4;

type HostLookup = (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string }>>;
type HttpFetch = (input: URL, init: RequestInit) => Promise<Response>;

function isPrivateIpv4(value: string): boolean {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const [a, b, c, d] = match.slice(1).map(Number);
  if ([a, b, c, d].some(part => part > 255)) return false;
  return a === 0 || a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 198 && (b === 18 || b === 19))
    || a >= 224;
}

function isPrivateIpv6(value: string): boolean {
  const address = value.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];
  const dotted = address.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  const octets = dotted?.[2].split('.').map(Number);
  if (octets && (octets.length !== 4 || octets.some(part => part < 0 || part > 255))) return false;
  const normalized = dotted && octets
    ? `${dotted[1]}${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`
    : address;
  const halves = normalized.split('::');
  if (halves.length > 2) return false;
  const parse = (part: string) => part ? part.split(':').map(segment => /^[0-9a-f]{1,4}$/.test(segment) ? Number.parseInt(segment, 16) : NaN) : [];
  const left = parse(halves[0]);
  const right = parse(halves[1] || '');
  if ([...left, ...right].some(Number.isNaN) || left.length + right.length > 8 || (halves.length === 1 && left.length !== 8)) return false;
  const groups = halves.length === 2
    ? [...left, ...Array(8 - left.length - right.length).fill(0), ...right]
    : left;
  const allZero = groups.every(group => group === 0);
  if (allZero || (groups.slice(0, 7).every(group => group === 0) && groups[7] === 1)) return true;
  if ((groups[0] & 0xfe00) === 0xfc00 || (groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xff00) === 0xff00) return true;
  const mappedPrefix = groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff;
  const compatiblePrefix = groups.slice(0, 6).every(group => group === 0);
  if (!mappedPrefix && !compatiblePrefix) return false;
  const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
  return isPrivateIpv4(ipv4);
}

function isPrivateNetworkAddress(value: string): boolean {
  return isPrivateIpv4(value) || isPrivateIpv6(value);
}

async function validateDatasetImportUrl(
  value: string | URL,
  allowPrivateNetwork: boolean,
  lookup: HostLookup,
): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error('Invalid image URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only credential-free HTTP image URLs are supported');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!allowPrivateNetwork && (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isPrivateNetworkAddress(hostname))) {
    throw new Error('Remote image import cannot access local or private network addresses');
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Remote image host could not be resolved');
  }
  if (!addresses.length || addresses.some(entry => !isIP(entry.address) || (!allowPrivateNetwork && isPrivateNetworkAddress(entry.address)))) {
    throw new Error('Remote image import cannot access local or private network addresses');
  }
  return { url, address: addresses[0].address };
}

function fetchPinnedImage(url: URL, address: string, init: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(url, {
      method: 'GET',
      headers: init.headers as Record<string, string>,
      signal: init.signal as AbortSignal,
      lookup: (_hostname, lookupOptions, callback) => {
        const family = isIP(address) as 4 | 6;
        if (typeof lookupOptions === 'object' && lookupOptions.all) {
          (callback as (error: null, addresses: Array<{ address: string; family: 4 | 6 }>) => void)(null, [{ address, family }]);
        } else {
          callback(null, address, family);
        }
      },
    }, response => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const status = response.statusCode || 502;
      if (status < 200 || status > 599) {
        response.destroy();
        reject(new Error(`Image server returned an unsupported HTTP status: ${status}`));
        return;
      }
      const body = status === 204 || status === 205 || status === 304
        ? null : Readable.toWeb(response) as ReadableStream<Uint8Array>;
      resolve(new Response(body, { status, headers }));
    });
    request.on('error', reject);
    request.end();
  });
}

export async function detectDatasetImportImage(bytes: Buffer): Promise<{ contentType: string; extension: string }> {
  if (!bytes.length || bytes.length > MAX_DATASET_IMPORT_BYTES) {
    throw new Error(bytes.length ? 'Dropped image exceeds the 256 MB import limit' : 'Dropped image was empty');
  }
  const image = sharp(bytes, { failOn: 'warning', animated: true, limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  if (!metadata.format || !metadata.width || !metadata.height) throw new Error('Dropped URL did not return an image');
  const formats: Record<string, { contentType: string; extension: string }> = {
    jpeg: { contentType: 'image/jpeg', extension: '.jpg' },
    png: { contentType: 'image/png', extension: '.png' },
    webp: { contentType: 'image/webp', extension: '.webp' },
    gif: { contentType: 'image/gif', extension: '.gif' },
    bmp: { contentType: 'image/bmp', extension: '.bmp' },
    heif: { contentType: 'image/avif', extension: '.avif' },
  };
  const detected = formats[metadata.format];
  if (!detected) throw new Error('Only JPEG, PNG, WebP, GIF, BMP, and AVIF images can be imported');
  if (metadata.format === 'heif' && metadata.compression !== 'av1') {
    throw new Error('Only AVIF images are supported in this image format');
  }
  await image.stats();
  return detected;
}

async function readLimitedImageResponse(response: Response, signal: AbortSignal, maxBytes: number): Promise<{ bytes: Buffer; contentType: string }> {
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const declaredSize = Number(response.headers.get('content-length') || 0);
  const unsupportedContentType = Boolean(contentType)
    && !contentType.startsWith('image/')
    && contentType !== 'application/octet-stream';
  if (!response.ok || unsupportedContentType || declaredSize > maxBytes || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
    if (unsupportedContentType) throw new Error('Dropped URL did not return an image');
    throw new Error('Dropped image exceeds the 256 MB import limit');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const next = await reader.read();
      if (next.done) break;
      bytesRead += next.value.byteLength;
      if (bytesRead > maxBytes) throw new Error('Dropped image exceeds the 256 MB import limit');
      chunks.push(next.value);
    }
    if (!bytesRead) throw new Error('Dropped image was empty');
    const encoding = response.headers.get('content-encoding')?.trim().toLowerCase();
    if ((!encoding || encoding === 'identity') && declaredSize && bytesRead !== declaredSize) throw new Error('Dropped image download was incomplete');
    const bytes = Buffer.concat(chunks, bytesRead);
    return { bytes, contentType: (await detectDatasetImportImage(bytes)).contentType };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchDatasetImportImage(
  value: string,
  options: { allowPrivateNetwork: boolean; fetch?: HttpFetch; lookup?: HostLookup; timeoutMs?: number; maxBytes?: number; signal?: AbortSignal } = { allowPrivateNetwork: false },
): Promise<{ bytes: Buffer; contentType: string }> {
  const lookup = options.lookup || resolveHostname;
  const signal = options.signal
    ? AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs ?? 120_000)])
    : AbortSignal.timeout(options.timeoutMs ?? 120_000);
  signal.throwIfAborted();
  let target = await validateDatasetImportUrl(value, options.allowPrivateNetwork, lookup);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    signal.throwIfAborted();
    const response = await (options.fetch || ((url, init) => fetchPinnedImage(url, target.address, init)))(target.url, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'UmbraStudio/1.0 (dataset-builder)', Accept: 'image/*;q=1,*/*;q=0.1', 'Accept-Encoding': 'identity' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error('Image redirect is missing its destination');
      target = await validateDatasetImportUrl(new URL(location, target.url), options.allowPrivateNetwork, lookup);
      continue;
    }
    return readLimitedImageResponse(response, signal, options.maxBytes ?? MAX_DATASET_IMPORT_BYTES);
  }
  throw new Error('Too many image redirects');
}

export function decodeDatasetImportDataUrl(value: string): { bytes: Buffer; contentType: string } {
  const match = value.match(/^data:(image\/[^;,]+);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) throw new Error('Invalid image data URL');
  const contentType = match[1].toLowerCase();
  const encoded = match[2].replace(/\s/g, '');
  if (encoded.length > Math.ceil(MAX_DATASET_IMPORT_BYTES * 4 / 3) + 4) throw new Error('Dropped image exceeds the 256 MB import limit');
  const bytes = Buffer.from(encoded, 'base64');
  if (!bytes.length || bytes.length > MAX_DATASET_IMPORT_BYTES) throw new Error(bytes.length ? 'Dropped image exceeds the 256 MB import limit' : 'Dropped image was empty');
  return { bytes, contentType };
}
