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
  label: 'originals' | 'jpeg-metadata' | 'jpeg-clean',
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
          const closing = finished(source, { cleanup: true }).catch(error => { zipOutput.destroy(error); });
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
