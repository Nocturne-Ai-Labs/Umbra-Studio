import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { copyFileExclusive } from './FsTransferCopy';
import { booruSourceSidecar } from './BooruDownloadService';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif'];

export async function saveDatasetImportedImage(conceptPath: string, baseName: string, extension: string, bytes: Buffer): Promise<string> {
  const temporary = join(conceptPath, `.import-${randomUUID()}.tmp`);
  try {
    const handle = await fs.open(temporary, 'wx');
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
    for (let counter = 0; counter < 10_000; counter += 1) {
      const stem = `${baseName}${counter ? `_${counter}` : ''}`;
      const reservation = join(conceptPath, `.import-${stem}.lock`);
      try {
        const reservationHandle = await fs.open(reservation, 'wx');
        await reservationHandle.close();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'EEXIST') continue;
        throw error;
      }
      try {
        const occupiedNames = new Set(
          [
            ...IMAGE_EXTENSIONS.map(ext => `${stem}${ext}`),
            `${stem}.txt`, `${stem}.json`,
            `${stem}${extension}.txt`, `${stem}${extension}.json`,
            booruSourceSidecar(`${stem}${extension}`),
          ].map(name => name.toLowerCase()),
        );
        if ((await fs.readdir(conceptPath)).some(name => occupiedNames.has(name.toLowerCase()))) continue;
        const filename = `${stem}${extension}`;
        const destination = join(conceptPath, filename);
        try {
          await fs.link(temporary, destination);
          return filename;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (code === 'EEXIST') continue;
          if (!['EPERM', 'EOPNOTSUPP', 'ENOTSUP', 'ENOSYS', 'EXDEV'].includes(code || '')) throw error;
          try { await copyFileExclusive(temporary, destination); return filename; }
          catch (copyError) {
            if ((copyError as NodeJS.ErrnoException).code === 'EEXIST') continue;
            throw copyError;
          }
        }
      } finally {
        await fs.rm(reservation, { force: true });
      }
    }
    throw new Error('Too many images with this name are already in the concept.');
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}
