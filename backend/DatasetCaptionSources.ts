import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { checkDatasetCaptionSize } from './DatasetCaptionFile';

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
export async function saveCaptionAttempt(conceptPath: string, filename: string, media: CaptionRecord['media'], kind: CaptionSourceKind, attempt: CaptionAttempt, existingCaption: string) {
  const currentMedia = await captionMediaIdentity(conceptPath, filename);
  if (media.sha256 !== currentMedia.sha256) throw new Error('Image changed during caption generation. Output was not associated with the changed image.');
  let record = await readCaptionRecord(conceptPath, filename);
  if (record && record.media.sha256 !== media.sha256) {
    const { priorMedia, ...previous } = record;
    record = { schemaVersion: 1, id: randomUUID(), media: currentMedia, existingCaption, sources: {}, priorMedia: [...priorMedia, previous] };
  }
  record ||= { schemaVersion: 1, id: randomUUID(), media: currentMedia, existingCaption, sources: {}, priorMedia: [] };
  record.media = currentMedia;
  record.sources[kind] = [...(record.sources[kind] || []), { ...attempt, text: checkDatasetCaptionSize(attempt.text) }];
  const serialized = JSON.stringify(record, null, 2);
  if (Buffer.byteLength(serialized) > MAX_RECORD_BYTES) throw new Error('Caption source history is full. Preserve/export it before another generation.');
  const target = join(conceptPath, captionSourceSidecar(filename)); const temp = join(conceptPath, `.caption-${randomUUID()}.tmp`);
  try { await fs.writeFile(temp, serialized, { flag: 'wx' }); await fs.rename(temp, target); }
  finally { await fs.unlink(temp).catch(() => undefined); }
  return record;
}
export function normalizeCaptionExportOptions(input: unknown): CaptionExportOptions {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Choose caption export settings.');
  const value = input as Record<string, unknown>;
  if (!['natural', 'tags', 'combined'].includes(String(value.mode))) throw new Error('Choose a caption export mode.');
  if (!['natural-first', 'tags-first'].includes(String(value.order))) throw new Error('Choose a combination order.');
  if (!['\n\n', '\n', ', '].includes(String(value.separator))) throw new Error('Choose a caption separator.');
  if (typeof value.tagPrefix !== 'string' || value.tagPrefix.length > 80 || /[\x00-\x1f]/.test(value.tagPrefix)) throw new Error('Tag label must be at most 80 characters, on one line.');
  return { mode: value.mode as CaptionExportOptions['mode'], order: value.order as CaptionExportOptions['order'], separator: value.separator as CaptionExportOptions['separator'], tagPrefix: value.tagPrefix, replaceUnderscores: value.replaceUnderscores === true };
}
export function composeDatasetCaption(record: CaptionRecord, options: CaptionExportOptions): string {
  const latest = (kind: CaptionSourceKind) => {
    const source = record.sources[kind]?.at(-1);
    if (!source || source.error || !source.text.trim()) throw new Error(`${kind === 'natural' ? 'Description' : 'Tags'} missing or latest generation failed.`);
    return source.text.trim();
  };
  const natural = options.mode !== 'tags' ? latest('natural') : '';
  const rawTags = options.mode !== 'natural' ? latest('tags') : '';
  const tags = options.replaceUnderscores ? rawTags.replace(/_/g, ' ') : rawTags;
  if (options.mode === 'natural') return checkDatasetCaptionSize(natural);
  if (options.mode === 'tags') return checkDatasetCaptionSize(tags);
  const tagSegment = options.tagPrefix + tags;
  return checkDatasetCaptionSize((options.order === 'natural-first' ? [natural, tagSegment] : [tagSegment, natural]).join(options.separator));
}
export async function previewCaptionExport(datasetPath: string, options: CaptionExportOptions) {
  const entries: { path: string; output: string; caption: string; recordId: string; sha256: string; error?: string }[] = [];
  const warnings: string[] = [];
  const fingerprint = createHash('sha256').update(JSON.stringify(options)); let textBytes = 0;
  async function walk(directory: string, depth = 0) {
    if (depth > 8) throw new Error('Dataset nesting exceeds export limit.');
    for (const dirent of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, dirent.name);
      if (dirent.isSymbolicLink()) throw new Error('Linked dataset entries are not supported in caption exports.');
      if (dirent.isDirectory()) { await walk(full, depth + 1); continue; }
      if (dirent.isFile() && dirent.name.endsWith('.umbra-caption.json')) {
        const mediaPath = full.slice(0, -'.umbra-caption.json'.length);
        const media = await fs.lstat(mediaPath).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
        if (!media?.isFile()) warnings.push(`Source record without media was excluded: ${relative(datasetPath, full).replace(/\\/g, '/')}`);
      }
      if (!dirent.isFile() || !IMAGES.has(extname(dirent.name).toLowerCase())) continue;
      if (entries.length >= 20000) throw new Error('Export at most 20,000 images at a time.');
      const path = relative(datasetPath, full).replace(/\\/g, '/');
      // A unique name per source path avoids ambiguous image.jpg/image.png sidecars.
      const output = createHash('sha256').update(path).digest('hex') + extname(dirent.name).toLowerCase();
      const entry = { path, output, caption: '', recordId: '', sha256: '' } as typeof entries[number];
      try {
        const media = await captionMediaIdentity(directory, dirent.name); entry.sha256 = media.sha256;
        const record = await readCaptionRecord(directory, dirent.name);
        fingerprint.update(JSON.stringify([path, media.sha256, record]));
        if (!record) throw new Error('No paired caption source record. Generate the required source(s) first; existing .txt was not inferred as prose or tags.');
        if (record.media.sha256 !== media.sha256) throw new Error('Image bytes changed since captioning. Regenerate sources for this image.');
        entry.recordId = record.id; entry.caption = composeDatasetCaption(record, options);
      } catch (error) { entry.error = error instanceof Error ? error.message : String(error); }
      textBytes += Buffer.byteLength(entry.caption);
      if (textBytes > 16 * 1024 * 1024) throw new Error('Caption preview exceeds 16 MiB. Split this dataset before exporting.');
      entries.push(entry);
    }
  }
  await walk(datasetPath);
  if (!entries.length) throw new Error('No images found in this dataset.');
  fingerprint.update(JSON.stringify(warnings));
  return { revision: fingerprint.digest('hex'), options, total: entries.length, ready: entries.filter(x => !x.error).length, entries, warnings,
    trainer: { caption_ext: '.txt', shuffle_tokens: false, token_dropout_rate: 0, note: 'AI Toolkit reads one .txt beside each image. Keep shuffle_tokens false and token_dropout_rate 0 for prose/combined captions. Caption dropout drops the whole caption; the loader can adjust comma spacing. Concept folders are flattened; repeats/weights must be configured in the trainer. Tokenizer truncation is not validated.' } };
}
export async function exportDatasetCaptions(datasetPath: string, exportsRoot: string, options: CaptionExportOptions, revision: string) {
  const preview = await previewCaptionExport(datasetPath, options);
  if (preview.revision !== revision) throw new Error('Dataset or caption sources changed. Review a fresh preview before exporting.');
  if (preview.ready !== preview.total) throw new Error('Resolve missing, failed or mismatched sources before exporting.');
  for (let parent = resolve(exportsRoot); ; parent = dirname(parent)) {
    const stat = await fs.lstat(parent).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error; });
    if (stat?.isSymbolicLink()) throw new Error('Linked export paths are not supported.');
    if (dirname(parent) === parent) break;
  }
  await fs.mkdir(exportsRoot, { recursive: true });
  if (!(await fs.lstat(exportsRoot)).isDirectory() || (await fs.lstat(exportsRoot)).isSymbolicLink()) throw new Error('Export root must be an owned directory.');
  const output = join(exportsRoot, `${basename(datasetPath)}-${randomUUID()}`);
  await fs.mkdir(output); const images = join(output, 'images'); await fs.mkdir(images);
  const records = join(output, 'source-records'); await fs.mkdir(records);
  const incomplete = join(output, 'EXPORT-INCOMPLETE.txt');
  await fs.writeFile(incomplete, 'Export in progress or interrupted. Do not use for training until caption-export.json is present and this marker is gone.', { flag: 'wx' });
  try {
    for (const entry of preview.entries) {
      const source = join(datasetPath, entry.path); await regular(source);
      await fs.copyFile(source, join(images, entry.output), 1);
      const copied = await captionMediaIdentity(images, entry.output);
      if (copied.sha256 !== entry.sha256) throw new Error('Image changed while exporting. Review again.');
      await fs.writeFile(join(images, entry.output.slice(0, -extname(entry.output).length) + '.txt'), entry.caption, { flag: 'wx' });
      const recordPath = join(datasetPath, entry.path + '.umbra-caption.json'); await regular(recordPath);
      await fs.copyFile(recordPath, join(records, entry.output + '.json'), 1);
    }
    // Recheck sources as well as media after copying; do not publish a stale review.
    if ((await previewCaptionExport(datasetPath, options)).revision !== revision) throw new Error('Caption sources changed while exporting. Review again.');
    await fs.writeFile(join(output, 'caption-export.json'), JSON.stringify({ schemaVersion: 1, ...preview, entries: preview.entries.map(entry => ({ ...entry, sourceRecord: `source-records/${entry.output}.json` })), createdAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
    await fs.unlink(incomplete);
    return { outputPath: output, imagesPath: images, total: preview.total };
  } catch (error) {
    // Keep the uniquely owned partial export for diagnosis; never report it ready.
    await fs.writeFile(join(output, 'EXPORT-FAILED.txt'), 'Export incomplete. Do not use for training. ' + String(error));
    throw new Error(`Export incomplete; source data unchanged. ${String(error)}`);
  }
}
