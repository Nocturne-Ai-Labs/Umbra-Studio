import * as fs from 'node:fs/promises';

// Matches the largest caption the concept image listing will display.
export const MAX_DATASET_CAPTION_BYTES = 1024 * 1024;
// JSON.stringify can turn a one-byte control character into a six-byte \u escape.
export const MAX_DATASET_CAPTION_REQUEST_BYTES = MAX_DATASET_CAPTION_BYTES * 6 + 8 * 1024;

export class DatasetCaptionTooLargeError extends Error {
  constructor() {
    super('Dataset caption exceeds the 1 MiB limit.');
    this.name = 'DatasetCaptionTooLargeError';
  }
}

export function checkDatasetCaptionSize(text: string): string {
  if (Buffer.byteLength(text, 'utf8') > MAX_DATASET_CAPTION_BYTES) {
    throw new DatasetCaptionTooLargeError();
  }
  return text;
}

export async function readExistingDatasetCaption(path: string): Promise<string> {
  const stat = await fs.lstat(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (!stat) return '';
  if (!stat.isFile()) throw new Error('Dataset caption is not a regular file.');
  if (stat.size > MAX_DATASET_CAPTION_BYTES) throw new DatasetCaptionTooLargeError();
  return checkDatasetCaptionSize(await fs.readFile(path, 'utf8'));
}
