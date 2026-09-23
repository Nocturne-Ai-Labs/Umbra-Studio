import { createHash, randomUUID } from 'node:crypto';
import { basename, extname, join, resolve } from 'node:path';
import * as fs from 'node:fs/promises';
import sharp from 'sharp';
import { copyFileExclusive } from './FsTransferCopy';
import {
  buildBooruMediaRequestHeaders, fetchDanbooruPosts, fetchE621Posts,
  fetchGelbooruPosts, fetchRule34Posts,
  type BooruApiConfig, type BooruImageResult,
} from './booruApi';

const MD5 = /^[a-f0-9]{32}$/i;
const MAX_BYTES = 256 * 1024 * 1024;
const activeFiles = new Set<string>();
const providers = { danbooru: fetchDanbooruPosts, gelbooru: fetchGelbooruPosts, e621: fetchE621Posts, rule34: fetchRule34Posts };
type Provider = keyof typeof providers;
export type BooruDownloadSource = { url: string; md5: string; source?: string; postId?: string };
export class BooruSourceUnavailableError extends Error {}

export function normalizeBooruMediaUrl(value: unknown): URL | null {
  try {
    const url = new URL(String(value || '').trim());
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (!['donmai.us', 'gelbooru.com', 'rule34.xxx', 'e621.net']
      .some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) return null;
    return url;
  } catch { return null; }
}

export function booruSourceSidecar(filename: string): string {
  return `.${filename}.booru.json`;
}

function validateFilename(filename: string): void {
  if (filename !== basename(filename) || /[\\/:\0]/.test(filename) || !/\.(png|jpe?g|webp|gif|avif|bmp|mp4|webm)$/i.test(filename)) {
    throw new Error('Invalid dataset media filename.');
  }
}

async function validateImage(path: string, extension = extname(path).slice(1).toLowerCase()): Promise<void> {
  // Video originals are verified by their source checksum; image originals also get a full decode.
  if (extension === 'mp4' || extension === 'webm') return;
  const image = sharp(path, { failOn: 'warning', animated: true, limitInputPixels: 100_000_000 });
  const metadata = await image.metadata();
  const expected = extension === 'jpg' ? 'jpeg' : extension === 'avif' ? 'heif' : extension;
  if (metadata.format !== expected || !metadata.width || !metadata.height) {
    throw new Error('Downloaded image format does not match its filename.');
  }
  await image.stats();
}

async function fileMatches(path: string, md5: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(path);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_BYTES) return false;
    const hash = createHash('md5');
    const handle = await fs.open(path, 'r');
    try { for await (const chunk of handle.createReadStream()) hash.update(chunk); }
    finally { await handle.close(); }
    if (hash.digest('hex') !== md5) return false;
    await validateImage(path);
    return true;
  } catch { return false; }
}

async function fetchOriginal(url: URL, signal: AbortSignal): Promise<Response> {
  for (let redirects = 0; redirects <= 4; redirects++) {
    const response = await fetch(url, {
      headers: buildBooruMediaRequestHeaders(url, 'application/octet-stream,image/*;q=0.9,*/*;q=0.8'),
      redirect: 'manual', signal,
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      const next = location && normalizeBooruMediaUrl(new URL(location, url).href);
      if (!next) throw new Error('The media server redirected outside the supported booru sources.');
      url = next;
      continue;
    }
    if (response.status !== 200) {
      await response.body?.cancel();
      if ([401, 403, 404, 410].includes(response.status)) {
        throw new BooruSourceUnavailableError(`The saved image URL is unavailable (HTTP ${response.status}).`);
      }
      throw new Error(`Image download failed (HTTP ${response.status}).`);
    }
    return response;
  }
  throw new Error('Too many image download redirects.');
}

async function ensureCaption(conceptPath: string, filename: string, tags?: string[]): Promise<void> {
  if (!tags?.length) return;
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw new Error('Dataset tags must be a list of strings.');
  const destination = join(conceptPath, `${basename(filename, extname(filename))}.txt`);
  const existingCaption = async () => {
    const existing = await fs.lstat(destination).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing && !existing.isFile()) throw new Error('The caption destination is not a regular file.');
    return Boolean(existing);
  };
  // Existing captions, including empty ones, may have been edited deliberately.
  if (await existingCaption()) return;
  const temporary = join(conceptPath, `.caption-${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx');
    try {
      await handle.writeFile(tags.join(', '), 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    try {
      await fs.link(temporary, destination);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') { if (await existingCaption()) return; throw error; }
      if (!['ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'EPERM', 'EACCES', 'ENOSYS'].includes(code || '')) throw error;
      // Cloud/portable filesystems may not support links; retain exclusive ownership and cleanup.
      try { await copyFileExclusive(temporary, destination); }
      catch (copyError) {
        if ((copyError as NodeJS.ErrnoException).code !== 'EEXIST' || !await existingCaption()) throw copyError;
      }
    }
  } finally { await fs.unlink(temporary).catch(() => undefined); }
}

export async function downloadBooruOriginal(options: {
  conceptPath: string; filename: string; source: BooruDownloadSource;
  replace?: boolean; tags?: string[]; signal?: AbortSignal;
}): Promise<{ filename: string; revision: number; alreadyExists: boolean }> {
  validateFilename(options.filename);
  const md5 = String(options.source.md5 || '').toLowerCase();
  if (!MD5.test(md5)) throw new Error('The source did not provide a valid image checksum.');
  const url = normalizeBooruMediaUrl(options.source.url);
  if (!url) throw new Error('The image URL is not from a supported Data Forge source.');
  const destination = join(options.conceptPath, options.filename);
  const lock = process.platform === 'win32' ? resolve(destination).toLowerCase() : resolve(destination);
  if (activeFiles.has(lock)) throw new Error('This image is already being downloaded.');
  activeFiles.add(lock);
  const id = randomUUID();
  const temporary = join(options.conceptPath, `.download-${id}.part`);
  const sourceTemporary = join(options.conceptPath, `.source-${id}.tmp`);
  let output: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    const original = await fs.lstat(destination).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (original && !original.isFile()) throw new Error('The destination is not a regular image file.');
    if (original && !options.replace) {
      if (!await fileMatches(destination, md5)) {
        throw new Error('An image with this name already exists and differs from the original. Use Re-download to replace it.');
      }
      options.signal?.throwIfAborted();
      await ensureCaption(options.conceptPath, options.filename, options.tags);
      return { filename: options.filename, revision: original.mtimeMs, alreadyExists: true };
    }
    const signal = AbortSignal.any([AbortSignal.timeout(120_000), ...(options.signal ? [options.signal] : [])]);
    const response = await fetchOriginal(url, signal);
    const contentType = response.headers.get('content-type') || '';
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (/text\/|json|html/i.test(contentType) || declaredSize > MAX_BYTES || !response.body) {
      await response.body?.cancel();
      throw new Error('The server returned an error page or an oversized file instead of an image.');
    }
    const hash = createHash('md5');
    let bytes = 0;
    output = await fs.open(temporary, 'wx');
    for await (const chunk of response.body) {
      signal.throwIfAborted();
      bytes += chunk.length;
      if (bytes > MAX_BYTES) throw new Error('The image exceeds the 256 MB download limit.');
      hash.update(chunk);
      await output.writeFile(chunk);
    }
    await output.sync();
    await output.close();
    output = undefined;
    if (!bytes || (declaredSize && !response.headers.get('content-encoding') && bytes !== declaredSize)) {
      throw new Error('The image download was incomplete. The existing file was kept.');
    }
    if (hash.digest('hex') !== md5) throw new Error('Image checksum mismatch. The existing file was kept.');
    await validateImage(temporary, extname(options.filename).slice(1).toLowerCase());
    signal.throwIfAborted();
    // Do not overwrite a file changed by another operation while this download was running.
    const current = await fs.lstat(destination).catch(error => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (current?.ino !== original?.ino || current?.mtimeMs !== original?.mtimeMs || current?.size !== original?.size) {
      throw new Error('This image changed during the download. Retry to avoid overwriting another edit.');
    }
    const record = { version: 1, url: url.href, md5, source: options.source.source, postId: options.source.postId };
    await fs.writeFile(sourceTemporary, JSON.stringify(record), { flag: 'wx' });
    await fs.rename(temporary, destination);
    // Publish source metadata only after the verified image has been installed.
    // A failed image replacement must leave the old image and its source paired.
    try {
      await fs.rename(sourceTemporary, join(options.conceptPath, booruSourceSidecar(options.filename)));
    } catch (error) {
      // The old source must not be used later to repair a newly replaced image.
      await fs.rm(join(options.conceptPath, booruSourceSidecar(options.filename)), { force: true }).catch(() => undefined);
      throw error;
    }
    await ensureCaption(options.conceptPath, options.filename, options.tags);
    return { filename: options.filename, revision: (await fs.stat(destination)).mtimeMs, alreadyExists: false };
  } finally {
    await output?.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
    await fs.unlink(sourceTemporary).catch(() => undefined);
    activeFiles.delete(lock);
  }
}

export async function resolveBooruRepairSource(
  conceptPath: string, filename: string, config: BooruApiConfig, signal?: AbortSignal,
  lookup: (provider: Provider, md5: string) => Promise<BooruImageResult[]> = (provider, md5) =>
    providers[provider](`md5:${md5}`, 1, 1, config[provider] as never, signal),
  refresh = false,
): Promise<BooruDownloadSource> {
  signal?.throwIfAborted();
  validateFilename(filename);
  let saved: BooruDownloadSource | null = null;
  let sourceContents: string | null = null;
  try { sourceContents = await fs.readFile(join(conceptPath, booruSourceSidecar(filename)), 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('The saved download source is unreadable.'); }
  if (sourceContents !== null) {
    try { saved = JSON.parse(sourceContents); }
    catch {
      // An original MD5 filename can still recover its source if the sidecar was damaged.
      if (!MD5.test(basename(filename, extname(filename)))) throw new Error('The saved download source is unreadable.');
    }
  }
  signal?.throwIfAborted();
  const filenameHash = basename(filename, extname(filename)).toLowerCase();
  // A hash-named image must not be repaired with bytes from a stale sidecar
  // belonging to a different image.
  if (saved && MD5.test(filenameHash) && String(saved.md5 || '').toLowerCase() !== filenameHash) saved = null;
  if (!refresh && saved && MD5.test(saved.md5) && normalizeBooruMediaUrl(saved.url)) return saved;
  const md5 = (saved && MD5.test(saved.md5) ? saved.md5 : filenameHash).toLowerCase();
  if (!MD5.test(md5)) throw new Error('No booru source is saved for this image, and its original hash filename is unavailable.');
  let failed = false;
  const providerOrder = Object.keys(providers) as Provider[];
  if (saved?.source && providerOrder.includes(saved.source as Provider)) {
    providerOrder.splice(providerOrder.indexOf(saved.source as Provider), 1);
    providerOrder.unshift(saved.source as Provider);
  }
  for (const provider of providerOrder) {
    signal?.throwIfAborted();
    try {
      const posts = await lookup(provider, md5);
      signal?.throwIfAborted();
      const post = posts.find(post => post.md5?.toLowerCase() === md5 && normalizeBooruMediaUrl(post.fullUrl));
      if (post?.fullUrl) return { url: post.fullUrl, md5, source: provider, postId: post.id };
    } catch {
      signal?.throwIfAborted();
      failed = true;
    }
  }
  throw new Error(failed
    ? 'Could not recover the original. Check Data Forge source API keys and network access, then retry. The existing file was kept.'
    : 'The original image is no longer available from the supported booru sources. The existing file was kept.');
}
