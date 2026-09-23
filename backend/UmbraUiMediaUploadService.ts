import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, join } from 'node:path';

export async function copyMediaIntoComfyInput(sourcePath: string, inputDirectory: string) {
  await fs.mkdir(inputDirectory, { recursive: true });
  const filename = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}-${basename(sourcePath)}`;
  const destPath = join(inputDirectory, filename);
  await fs.copyFile(sourcePath, destPath, constants.COPYFILE_EXCL);
  return { filename, destPath };
}

export async function writeAllUploadedMediaBytes(
  writer: { write(bytes: Uint8Array): Promise<{ bytesWritten: number }> },
  bytes: Uint8Array,
): Promise<number> {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const { bytesWritten } = await writer.write(bytes.subarray(offset));
    if (!Number.isInteger(bytesWritten) || bytesWritten <= 0 || bytesWritten > bytes.byteLength - offset) {
      throw new Error('Media upload file write did not complete.');
    }
    offset += bytesWritten;
  }
  return offset;
}
