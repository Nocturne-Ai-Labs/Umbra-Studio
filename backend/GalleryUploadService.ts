import * as fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { copyFileExclusive } from './FsTransferCopy';

export type GalleryUploadStrategy = 'keepBoth' | 'replace' | 'skip';
export interface GalleryUploadRequest {
  directory: string;
  name: string;
  strategy: GalleryUploadStrategy;
  contentBase64: string;
}

export function isGalleryUploadFilename(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
    && !/[<>:"/\\|?*\x00-\x1f]/.test(name) && !/[. ]$/.test(name)
    && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
}

export function isGalleryUploadStrategy(value: unknown): value is GalleryUploadStrategy {
  return value === 'keepBoth' || value === 'replace' || value === 'skip';
}

async function canonicalCandidate(path: string): Promise<string> {
  let parent = resolve(path);
  const missing: string[] = [];
  while (true) {
    try { return resolve(await fs.realpath(parent), ...missing); }
    catch (error: any) {
      if (error?.code !== 'ENOENT' || dirname(parent) === parent) throw error;
      missing.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
}

export async function prepareGalleryUploadDirectory(destination: string, allowedRoots: string[]): Promise<string> {
  const candidate = await canonicalCandidate(destination);
  let allowed = false;
  for (const root of allowedRoots) {
    const physicalRoot = await canonicalCandidate(root).catch(() => null);
    if (!physicalRoot) continue;
    const rel = relative(physicalRoot, candidate);
    if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) { allowed = true; break; }
  }
  if (!allowed) throw new Error('Upload destination resolves outside allowed roots');
  await fs.mkdir(candidate, { recursive: true });
  await assertUploadDirectory(candidate);
  return candidate;
}

async function assertUploadDirectory(directory: string): Promise<void> {
  if (relative(resolve(directory), await fs.realpath(directory)) !== '') {
    throw new Error('Upload destination changed during upload');
  }
}

export async function publishGalleryUpload(input: GalleryUploadRequest): Promise<{ path?: string; skipped?: boolean }> {
  if (!isGalleryUploadFilename(input.name) || !isGalleryUploadStrategy(input.strategy)) throw new Error('Invalid upload filename or strategy');
  if (input.strategy === 'skip') return { skipped: true };
  await assertUploadDirectory(input.directory);
  const temporaryPath = join(input.directory, `.umbra-upload-${randomUUID()}.part`);
  const extension = extname(input.name);
  const stem = input.name.slice(0, input.name.length - extension.length);
  try {
    await fs.writeFile(temporaryPath, Buffer.from(input.contentBase64, 'base64'), { flag: 'wx' });
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
      const target = join(input.directory, counter ? `${stem} (${counter})${extension}` : input.name);
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
