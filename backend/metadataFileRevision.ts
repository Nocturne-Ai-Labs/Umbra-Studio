import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { mediaFileRevision } from './mediaFileRevision';

export function metadataSidecarPath(filePath: string): string | null {
  const extension = extname(filePath);
  return extension.toLowerCase() === '.png' ? null : join(dirname(filePath), `${basename(filePath, extension)}.png`);
}

// Metadata can change independently of image bytes. Keep this out of thumbnail keys.
export async function metadataFileRevision(filePath: string, sourceRevision: string): Promise<string> {
  const sidecarPath = metadataSidecarPath(filePath);
  if (!sidecarPath) return sourceRevision;
  let sidecarRevision: string | null;
  try {
    sidecarRevision = mediaFileRevision(await stat(sidecarPath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    sidecarRevision = null;
  }
  return JSON.stringify(['metadata-v1', sourceRevision, sidecarRevision]);
}
