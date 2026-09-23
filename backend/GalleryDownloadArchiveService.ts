import * as fs from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { type Readable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';

export type GalleryDownloadEntry = {
  name: string;
  mtime: Date;
  size?: number;
  open: () => Readable;
};

function uniqueEntryName(name: string, usedNames: Set<string>): string {
  const leaf = basename(name.replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"\\|?*]+/g, '_').trim();
  const safe = !leaf || leaf === '.' || leaf === '..' ? 'umbra-media' : leaf;
  const extension = extname(safe);
  const base = safe.slice(0, safe.length - extension.length);
  let candidate = safe;
  for (let index = 2; usedNames.has(candidate.toLowerCase()); index++) {
    candidate = `${base || 'umbra-media'} (${index})${extension}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

export async function buildGalleryDownloadArchive(
  tempRoot: string,
  label: 'originals' | 'jpeg-metadata' | 'jpeg-clean' | 'export',
  entries: GalleryDownloadEntry[],
  signal?: AbortSignal,
): Promise<{ zipPath: string; size: number }> {
  signal?.throwIfAborted();
  await fs.mkdir(tempRoot, { recursive: true });
  signal?.throwIfAborted();
  const zipPath = join(tempRoot, `umbra-${label}-${randomUUID()}.zip`);
  const handle = await fs.open(zipPath, 'wx');
  const zip = new ZipFile();
  const zipOutput = zip.outputStream as Readable;
  const output = handle.createWriteStream();
  const inputs = new Map<Readable, Promise<void>>();
  let inputError: unknown;
  const usedNames = new Set<string>();
  zip.on('error', error => zipOutput.destroy(error));
  const writing = pipeline(zipOutput, output, { signal });
  // Observe disk errors immediately, even before the first input opens.
  void writing.catch(() => {});
  let complete = false;
  try {
    for (const entry of entries) {
      signal?.throwIfAborted();
      zip.addReadStreamLazy(uniqueEntryName(entry.name, usedNames), {
        mtime: entry.mtime,
        size: entry.size,
        compress: false,
      }, callback => {
        try {
          signal?.throwIfAborted();
          if (zipOutput.destroyed) throw new Error('Archive writing stopped');
          const source = entry.open();
          // File-backed Sharp transforms expose an unused writable side that
          // never finishes; the archive consumes only their readable side.
          const closing = finished(source, { cleanup: true, writable: false }).catch(error => {
            inputError ??= error;
            zipOutput.destroy(error);
          });
          inputs.set(source, closing);
          void closing.then(() => inputs.delete(source));
          callback(null, source);
        } catch (error) {
          callback(error, null!);
        }
      });
    }
    zip.end();
    await writing;
    await Promise.all(inputs.values());
    if (inputError) throw inputError;
    signal?.throwIfAborted();
    const size = (await fs.stat(zipPath)).size;
    complete = true;
    return { zipPath, size };
  } finally {
    zipOutput.destroy();
    for (const input of inputs.keys()) input.destroy();
    output.destroy();
    await Promise.all([writing.catch(() => {}), ...inputs.values()]);
    await handle.close().catch(() => {});
    if (!complete) await fs.rm(zipPath, { force: true }).catch(() => {});
  }
}

const preparedDownloads = new Map<string, { zipPath: string; size: number; filename: string }>();

function removeExpiredArchive(zipPath: string, attempts = 0): void {
  void fs.rm(zipPath, { force: true }).catch((error: NodeJS.ErrnoException) => {
    // Windows keeps a ZIP locked while the browser streams it. Retry after the
    // reader closes instead of leaving large exports behind indefinitely.
    if (attempts >= 144 || !['EBUSY', 'EPERM', 'EACCES'].includes(error.code || '')) {
      console.warn('[Gallery] Could not remove expired download archive:', zipPath, error);
      return;
    }
    const retry = setTimeout(() => removeExpiredArchive(zipPath, attempts + 1), 10 * 60 * 1000);
    retry.unref?.();
  });
}

function archiveResponse(archive: { zipPath: string; size: number; filename: string }): Response {
  return new Response(Bun.file(archive.zipPath), { headers: {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
    'Content-Length': String(archive.size),
    'Cache-Control': 'no-store',
  } });
}

export function prepareGalleryDownloadResponse(req: Request, archive: { zipPath: string; size: number }, label: string): Response {
  const id = randomUUID();
  const ready = { ...archive, filename: `umbra-${label}-${new Date().toISOString().slice(0, 10)}.zip` };
  const wantsReceipt = req.headers.get('accept')?.includes('application/json');
  if (wantsReceipt) preparedDownloads.set(id, ready);
  const cleanup = setTimeout(() => {
    preparedDownloads.delete(id);
    removeExpiredArchive(archive.zipPath);
  }, 30 * 60 * 1000);
  cleanup.unref?.();
  // Preparing via fetch surfaces errors; a separate GET lets the browser stream
  // a multi-gigabyte archive to disk without buffering it in frontend memory.
  return wantsReceipt
    ? Response.json({ url: `/api/fs/download-archive?id=${id}`, filename: ready.filename, size: archive.size })
    : archiveResponse(ready);
}

export function getPreparedGalleryDownload(id: string): Response {
  const archive = preparedDownloads.get(id);
  return archive ? archiveResponse(archive) : Response.json({ error: 'This download expired. Export the selection again.' }, { status: 404 });
}
