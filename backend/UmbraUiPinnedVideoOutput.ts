import { copyFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

// Keep ComfyUI's original for history/continuation; publish a completed copy only.
export async function publishPinnedVideoOutput(source: string, directory: string, promptId: string): Promise<string> {
  if (!/\.(mp4|webm|mov|mkv|gif|avi|m4v)$/i.test(source)) return source;
  await mkdir(directory, { recursive: true });
  const extension = extname(source);
  const stem = basename(source, extension);
  const id = promptId.replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
  if (!id) throw new Error('Cannot route video output without its job ID.');
  const sourceId = createHash('sha256').update(source).digest('hex').slice(0, 10);
  const destination = join(directory, `${stem}_${id}_${sourceId}${extension}`);
  try {
    const existing = await stat(destination);
    if (existing.size === (await stat(source)).size) return destination;
    throw new Error('A different video already exists at the pinned destination.');
  } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await copyFile(source, temporary);
    await rename(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
  return destination;
}
