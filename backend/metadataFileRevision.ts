import { stat } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { mediaFileRevision } from './mediaFileRevision';

const VIDEO_METADATA_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v', '.flv', '.wmv', '.gif']);

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
  // Re-index videos previously scanned without their native container tags.
  const parserRevision = VIDEO_METADATA_EXTENSIONS.has(extname(filePath).toLowerCase()) ? 'metadata-video-v2' : 'metadata-v1';
  return JSON.stringify([parserRevision, sourceRevision, sidecarRevision]);
}
