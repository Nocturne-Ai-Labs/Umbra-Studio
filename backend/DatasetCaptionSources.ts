import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, extname, join } from 'node:path';

export type CaptionSourceKind = 'natural' | 'tags';
export type CaptionAttempt = { at: string; producer: string; settings: Record<string, unknown>; text: string; raw: unknown; error?: string };
export type CaptionRecord = {
  schemaVersion: 1; id: string; media: { filename: string; sha256: string; size: number; mtimeMs: number };
  existingCaption: string; sources: Partial<Record<CaptionSourceKind, CaptionAttempt[]>>;
  priorMedia: Omit<CaptionRecord, 'priorMedia'>[];
};
export type CaptionExportOptions = { mode: 'natural' | 'tags' | 'combined'; order: 'natural-first' | 'tags-first'; separator: '\n\n' | '\n' | ', '; tagPrefix: string; replaceUnderscores: boolean };
const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.avif']);
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
export const captionSourceSidecar = (filename: string) => `${filename}.umbra-caption.json`;
function validName(filename: string) {
  if (filename !== basename(filename) || !IMAGES.has(extname(filename).toLowerCase()) || /[\\/:\x00-\x1f]/.test(filename)) throw new Error('Invalid caption media filename.');
}
async function regular(path: string) {
  const stat = await fs.lstat(path);
  if (!stat.isFile()) throw new Error(`Caption entry is not a regular file: ${basename(path)}`);
  return stat;
}
export async function captionMediaIdentity(conceptPath: string, filename: string) {
  validName(filename);
  const path = join(conceptPath, filename); const stat = await regular(path);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  const after = await regular(path);
  if (stat.size !== after.size || stat.mtimeMs !== after.mtimeMs || stat.ino !== after.ino) throw new Error('Image changed while reading its identity. Retry captioning.');
  return { filename, sha256: hash.digest('hex'), size: stat.size, mtimeMs: stat.mtimeMs };
}
export async function readCaptionRecord(conceptPath: string, filename: string): Promise<CaptionRecord | null> {
  validName(filename); const path = join(conceptPath, captionSourceSidecar(filename));
  let stat;
  try { stat = await regular(path); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  if (stat.size > MAX_RECORD_BYTES) throw new Error('Caption source history exceeds the 8 MiB limit.');
  const record = JSON.parse(await fs.readFile(path, 'utf8')) as CaptionRecord;
  if (record.schemaVersion !== 1 || typeof record.id !== 'string' || !record.id || record.media?.filename !== filename || !/^[a-f0-9]{64}$/.test(record.media.sha256) || !record.sources || typeof record.sources !== 'object' || Array.isArray(record.sources) || !Array.isArray(record.priorMedia)) throw new Error('Invalid caption source record. Preserve it and resolve before regenerating.');
  for (const kind of ['natural', 'tags'] as const) {
    const attempts = record.sources[kind];
    if (attempts && (!Array.isArray(attempts) || attempts.some(x => !x || typeof x.text !== 'string' || typeof x.at !== 'string'))) throw new Error('Invalid caption source history.');
  }
  return record;
}
