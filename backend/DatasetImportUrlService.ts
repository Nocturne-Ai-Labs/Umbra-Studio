import { lookup as resolveHostname } from 'node:dns/promises';
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
): Promise<URL> {
  let url: URL;
  try {
    url = value instanceof URL ? value : new URL(value);
  } catch {
    throw new Error('Invalid image URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only credential-free HTTP image URLs are supported');
  }
  if (allowPrivateNetwork) return url;
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || isPrivateNetworkAddress(hostname)) {
    throw new Error('Remote image import cannot access local or private network addresses');
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error('Remote image host could not be resolved');
  }
  if (!addresses.length || addresses.some(entry => isPrivateNetworkAddress(entry.address))) {
    throw new Error('Remote image import cannot access local or private network addresses');
  }
  return url;
}

async function detectImageContentType(bytes: Buffer): Promise<string> {
  const image = sharp(bytes, { failOn: 'warning', animated: true, limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  if (!metadata.format || !metadata.width || !metadata.height) throw new Error('Dropped URL did not return an image');
  await image.stats();
  return metadata.format === 'jpeg' ? 'image/jpeg' : metadata.format === 'heif' ? 'image/avif' : `image/${metadata.format}`;
}

async function readLimitedImageResponse(response: Response, signal: AbortSignal, maxBytes: number): Promise<{ bytes: Buffer; contentType: string }> {
  const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const declaredSize = Number(response.headers.get('content-length') || 0);
  if (!response.ok || (contentType && !contentType.startsWith('image/')) || declaredSize > maxBytes || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    if (!response.ok) throw new Error(`Failed to download image: ${response.status}`);
    if (contentType && !contentType.startsWith('image/')) throw new Error('Dropped URL did not return an image');
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
    return { bytes, contentType: contentType || await detectImageContentType(bytes) };
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

export async function fetchDatasetImportImage(
  value: string,
  options: { allowPrivateNetwork: boolean; fetch?: HttpFetch; lookup?: HostLookup; timeoutMs?: number; maxBytes?: number } = { allowPrivateNetwork: false },
): Promise<{ bytes: Buffer; contentType: string }> {
  const request = options.fetch || ((url, init) => fetch(url, init));
  const lookup = options.lookup || resolveHostname;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 120_000);
  let url = await validateDatasetImportUrl(value, options.allowPrivateNetwork, lookup);
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
    const response = await request(url, {
      signal,
      redirect: 'manual',
      headers: { 'User-Agent': 'UmbraStudio/1.0 (dataset-builder)', Accept: 'image/*;q=1,*/*;q=0.1', 'Accept-Encoding': 'identity' },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new Error('Image redirect is missing its destination');
      url = await validateDatasetImportUrl(new URL(location, url), options.allowPrivateNetwork, lookup);
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
