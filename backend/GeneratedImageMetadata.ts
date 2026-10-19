import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { extname } from 'node:path';
import { upsertPngTextMetadata } from './PngTextMetadata';
import { embedJpegGenerationMetadata } from './GenerationMetadataExport';

/** Stamp output identifiers without re-encoding pixels or altering JPEG quality. */
export async function stampGeneratedImageMetadata(path: string, key: string, value: string): Promise<void> {
  const extension = extname(path).toLowerCase();
  if (extension === '.png') return upsertPngTextMetadata(path, key, value);
  if (extension !== '.jpeg' && extension !== '.jpg') return;
  const image = await readFile(path);
  const temporary = `${path}.${randomUUID()}.metadata.tmp`;
  try {
    await writeFile(temporary, embedJpegGenerationMetadata(image, { [key]: value }), { flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
