import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import { ZipFile } from 'yazl';

export type GalleryArchiveJob = {
  id: string;
  folder: string;
  phase: 'queued' | 'scanning' | 'packing' | 'saving' | 'completed' | 'failed';
  files: number;
  bytes: number;
  processedBytes: number;
  skippedLinks: number;
  currentFile?: string;
  path?: string;
  error?: string;
};

const jobs = new Map<string, GalleryArchiveJob>();
const publishing = new Set<string>();
let archiveQueue = Promise.resolve();
const compressed = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.mp4', '.webm', '.gif', '.zip', '.7z']);

export function getGalleryArchiveJob(id: string) { return jobs.get(id); }

export async function listGalleryArchives(fullPath: string, clientPath: string) {
  const result: Array<{ name: string; path: string; size: number; modified: number }> = [];
  for (const entry of await fs.readdir(fullPath, { withFileTypes: true })) {
    if (!entry.isFile() || extname(entry.name).toLowerCase() !== '.zip' || publishing.has(join(fullPath, entry.name))) continue;
    let stat;
    try { stat = await fs.stat(join(fullPath, entry.name)); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    result.push({ name: entry.name, path: `${clientPath.replace(/[\\/]+$/, '')}/${entry.name}`, size: stat.size, modified: stat.mtimeMs });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export function queueGalleryArchive(fullPath: string, folder: string) {
  const existing = Array.from(jobs.values()).find(job => job.folder === folder && !['completed', 'failed'].includes(job.phase));
  if (existing) return existing;
  for (const [id, job] of jobs) {
    if (jobs.size < 100) break;
    if (['completed', 'failed'].includes(job.phase)) jobs.delete(id);
  }
  if (jobs.size >= 100) throw new Error('Archive queue is full');
  const job: GalleryArchiveJob = { id: crypto.randomUUID(), folder, phase: 'queued', files: 0, bytes: 0, processedBytes: 0, skippedLinks: 0 };
  jobs.set(job.id, job);
  archiveQueue = archiveQueue.then(async () => {
    try { await createGalleryArchive(fullPath, job); }
    catch (error) { job.phase = 'failed'; job.error = error instanceof Error ? error.message : 'ZIP creation failed'; }
  });
  return job;
}

export async function createGalleryArchive(fullPath: string, job: GalleryArchiveJob) {
  const root = await fs.realpath(fullPath);
  if (!(await fs.stat(root)).isDirectory()) throw new Error('Select a folder to archive');
  const label = basename(root).replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'Archive';
  const partial = join(root, `.umbra-archive-${job.id}.partial`);
  const entries: Array<{ path: string; name: string; size: number; mtime: Date; mtimeMs: number; directory: boolean }> = [];
  job.phase = 'scanning';
  const walk = async (directory: string) => {
    const real = await fs.realpath(directory);
    if (real !== root && !real.startsWith(`${root}${sep}`)) throw new Error('Folder link changed outside the selected folder');
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.name.startsWith('.umbra-archive-') && entry.name.endsWith('.partial')) continue;
      if (entry.isSymbolicLink()) { job.skippedLinks++; continue; }
      const stat = await fs.lstat(path);
      if (stat.isSymbolicLink()) { job.skippedLinks++; continue; }
      if (!stat.isFile() && !stat.isDirectory()) continue;
      const name = relative(root, path).split(sep).join('/');
      entries.push({ path, name, size: stat.size, mtime: stat.mtime, mtimeMs: stat.mtimeMs, directory: stat.isDirectory() });
      if (stat.isDirectory()) await walk(path);
      else { job.files++; job.bytes += stat.size; }
    }
  };
  await walk(root);
  const zip = new ZipFile();
  const zipOutput = zip.outputStream as Readable;
  const handle = await fs.open(partial, 'wx');
  const output = handle.createWriteStream();
  const inputs = new Set<Transform>();
  zip.on('error', error => zipOutput.destroy(error));
  const writing = pipeline(zipOutput, output);
  // Attach immediately: disk errors can occur while entries are being prepared.
  void writing.catch(() => {});
  try {
    job.phase = 'packing';
    for (const entry of entries) {
      if (entry.directory) { zip.addEmptyDirectory(entry.name, { mtime: entry.mtime }); continue; }
      zip.addReadStreamLazy(entry.name, { size: entry.size, mtime: entry.mtime, compress: !compressed.has(extname(entry.name).toLowerCase()) }, callback => {
        void (async () => {
          if (zipOutput.destroyed) throw new Error('Archive writing stopped');
          const real = await fs.realpath(entry.path);
          if (!resolve(real).startsWith(`${resolve(root)}${sep}`)) throw new Error('Source link changed outside the selected folder');
          const inputHandle = await fs.open(real, 'r');
          const stat = await inputHandle.stat().catch(async error => {
            await inputHandle.close().catch(() => {});
            throw error;
          });
          if (zipOutput.destroyed || stat.size !== entry.size || stat.mtimeMs !== entry.mtimeMs) {
            await inputHandle.close();
            throw new Error(`Source changed while packing: ${entry.name}`);
          }
          job.currentFile = entry.name;
          const counter = new Transform({
            transform(chunk, _encoding, done) { job.processedBytes += chunk.length; done(null, chunk); },
            flush(done) {
              void fs.stat(entry.path).then(after => {
                done(after.size === entry.size && after.mtimeMs === entry.mtimeMs ? null : new Error(`Source changed while packing: ${entry.name}`));
              }, done);
            },
          });
          inputs.add(counter);
          const source = inputHandle.createReadStream();
          void pipeline(source, counter).catch(error => counter.destroy(error));
          counter.once('close', () => inputs.delete(counter));
          callback(null, counter);
        })().catch(error => callback(error, null!));
      });
    }
    zip.end();
    await writing;
    job.phase = 'saving';
    // Exclusive copy works on cloud drives that do not support hard links.
    // The finished ZIP is never allowed to overwrite an existing archive.
    for (let suffix = 0; ; suffix++) {
      const name = `${label}${suffix ? ` (${suffix})` : ''}.zip`;
      const target = join(root, name);
      publishing.add(target);
      try {
        await fs.copyFile(partial, target, constants.COPYFILE_EXCL);
        job.path = `${job.folder.replace(/[\\/]+$/, '')}/${name}`;
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      } finally { publishing.delete(target); }
    }
    job.phase = 'completed';
    job.currentFile = undefined;
  } finally {
    zipOutput.destroy();
    for (const input of inputs) input.destroy();
    output.destroy();
    await writing.catch(() => {});
    await handle.close().catch(() => {});
    await fs.unlink(partial).catch(() => {});
  }
}
