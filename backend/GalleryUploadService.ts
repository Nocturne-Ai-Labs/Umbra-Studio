import * as fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { copyFileExclusive } from './FsTransferCopy';
import { resolveAllowedGalleryPath } from './GalleryPathAccess';

export type GalleryUploadStrategy = 'keepBoth' | 'replace' | 'skip';
export type GalleryUploadRequest = {
  directory: string;
  name: string;
  strategy: GalleryUploadStrategy;
} & ({ contentBase64: string; stagedPath?: never } | { stagedPath: string; contentBase64?: never });

const MAX_UPLOAD_NAME_LENGTH = 255;

function filenameLength(name: string): number {
  return process.platform === 'win32' ? name.length : Buffer.byteLength(name, 'utf8');
}

function numberedUploadName(stem: string, extension: string, counter: number): string {
  if (counter === 0) return `${stem}${extension}`;
  const suffix = ` (${counter})${extension}`;
  const available = MAX_UPLOAD_NAME_LENGTH - filenameLength(suffix);
  if (available < 1) throw new Error('Upload filename is too long to keep both files');
  const characters = Array.from(stem);
  while (characters.length && filenameLength(characters.join('')) > available) characters.pop();
  if (!characters.length) throw new Error('Upload filename is too long to keep both files');
  return `${characters.join('')}${suffix}`;
}

export function isGalleryUploadFilename(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
    && filenameLength(name) <= MAX_UPLOAD_NAME_LENGTH
    && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}

export function isGalleryUploadStrategy(value: unknown): value is GalleryUploadStrategy {
  return value === 'keepBoth' || value === 'replace' || value === 'skip';
}

export async function prepareGalleryUploadDirectory(destination: string, allowedRoots: string[]): Promise<string> {
  const candidate = await resolveAllowedGalleryPath(destination, allowedRoots);
  if (!candidate) throw new Error('Upload destination resolves outside allowed roots');
  await fs.mkdir(candidate, { recursive: true });
  await assertUploadDirectory(candidate);
  return candidate;
}

export async function compareGalleryUploadDuplicate(existingPath: string, existingSize: number, uploaded: File): Promise<boolean> {
  if (existingSize !== uploaded.size) return false;

  const existingHash = createHash('sha256');
  for await (const chunk of createReadStream(existingPath)) existingHash.update(chunk);

  const uploadedHash = createHash('sha256');
  const reader = uploaded.stream().getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      uploadedHash.update(value);
    }
  } finally {
    reader.releaseLock();
  }
  return existingHash.digest('hex') === uploadedHash.digest('hex');
}

async function assertUploadDirectory(directory: string): Promise<void> {
  if (relative(resolve(directory), await fs.realpath(directory)) !== '') {
    throw new Error('Upload destination changed during upload');
  }
}

export async function stageGalleryUploadFile(directory: string, file: File): Promise<string> {
  await assertUploadDirectory(directory);
  const stagedPath = join(directory, `.umbra-upload-${randomUUID()}.part`);
  const handle = await fs.open(stagedPath, 'wx');
  let completed = false;
  try {
    const reader = file.stream().getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        await handle.writeFile(value);
      }
    } finally {
      reader.releaseLock();
    }
    await assertUploadDirectory(directory);
    await handle.close();
    completed = true;
    return stagedPath;
  } finally {
    if (!completed) {
      await handle.close().catch(() => undefined);
      await fs.rm(stagedPath, { force: true }).catch(() => undefined);
    }
  }
}

export async function publishGalleryUpload(input: GalleryUploadRequest): Promise<{ path?: string; skipped?: boolean }> {
  if (!isGalleryUploadFilename(input.name) || !isGalleryUploadStrategy(input.strategy)) throw new Error('Invalid upload filename or strategy');
  if (input.strategy === 'skip') return { skipped: true };
  await assertUploadDirectory(input.directory);
  if ((typeof input.stagedPath === 'string') === (typeof input.contentBase64 === 'string')
    || input.stagedPath === '') {
    throw new Error('Upload requires exactly one content source');
  }
  const temporaryPath = input.stagedPath || join(input.directory, `.umbra-upload-${randomUUID()}.part`);
  if (input.stagedPath) {
    const resolvedStage = resolve(input.stagedPath);
    if (dirname(resolvedStage) !== resolve(input.directory)
      || !/^\.umbra-upload-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.part$/i.test(basename(resolvedStage))
      || !(await fs.lstat(resolvedStage)).isFile()
      || await fs.realpath(resolvedStage) !== resolvedStage) {
      throw new Error('Invalid staged upload');
    }
  }
  const extension = extname(input.name);
  const stem = input.name.slice(0, input.name.length - extension.length);
  try {
    if (input.contentBase64 !== undefined) {
      await fs.writeFile(temporaryPath, Buffer.from(input.contentBase64, 'base64'), { flag: 'wx' });
    }
    await assertUploadDirectory(input.directory);
    if (input.strategy === 'replace') {
      const target = join(input.directory, input.name);
      const existing = await fs.lstat(target).catch((error) => {
        if (error?.code === 'ENOENT') return null;
        throw error;
      });
      if (existing && !existing.isFile()) throw new Error('Cannot replace a folder or linked file with an upload');
      // Preserve the previous file if staging or replacement fails.
      await fs.rename(temporaryPath, target);
      return { path: target };
    }
    for (let counter = 0; counter < 10000; counter++) {
      const target = join(input.directory, numberedUploadName(stem, extension, counter));
      try {
        try { await fs.link(temporaryPath, target); }
        catch (error: any) {
          if (!['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM', 'ENOSYS', 'EMLINK'].includes(error?.code)) throw error;
          await copyFileExclusive(temporaryPath, target);
        }
        return { path: target };
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
      }
    }
    throw new Error('Too many existing files with this name. Rename the upload and retry.');
  } finally {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined);
  }
}
