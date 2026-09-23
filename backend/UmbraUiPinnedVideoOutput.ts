import { copyFile, link, mkdir, rm, stat } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { join, basename, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolveAllowedExistingGalleryPath } from './GalleryPathAccess';

const publications = new Map<string, Promise<string>>();

// ComfyUI history usually returns filename/subfolder/type without a full path.
// Resolve those entries against the configured Comfy install, which can live
// outside the Umbra runtime root.
export function resolvePinnedVideoSourcePath(
  output: Record<string, unknown>,
  runtimeRoot: string,
  configuredComfyRoot: string,
): string {
  const direct = String(output.fullpath || output.fullPath || output.path || '').trim();
  if (direct) return isAbsolute(direct) ? resolve(direct) : resolve(runtimeRoot, direct);
  const filename = basename(String(output.filename || output.name || '').trim());
  if (!filename) return '';
  const type = String(output.type || '').trim().toLowerCase();
  const folder = type === 'temp' ? 'temp' : type === 'input' ? 'input' : 'output';
  const base = join(configuredComfyRoot || join(runtimeRoot, 'Tools', 'ComfyUI'), folder);
  const subfolder = String(output.subfolder || '').trim().replace(/\\/g, '/');
  const source = resolve(base, subfolder, filename);
  const child = relative(base, source);
  if (!child || child === '..' || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error('ComfyUI history returned an invalid video output path.');
  }
  return source;
}

async function videoDigest(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

// Keep ComfyUI's original for history/continuation; publish a completed copy only.
export async function publishPinnedVideoOutput(source: string, directory: string, promptId: string, pinnedTaskRoot: string): Promise<string> {
  if (!/\.(mp4|webm|mov|mkv|gif|avi|m4v)$/i.test(source)) return source;
  const key = JSON.stringify([source, directory, promptId, pinnedTaskRoot]);
  const active = publications.get(key);
  if (active) return active;
  const publication = publishVerifiedVideo(source, directory, promptId, pinnedTaskRoot)
    .finally(() => { if (publications.get(key) === publication) publications.delete(key); });
  publications.set(key, publication);
  return publication;
}

async function publishVerifiedVideo(source: string, directory: string, promptId: string, pinnedTaskRoot: string): Promise<string> {
  await mkdir(directory, { recursive: true });
  const authorizedDirectory = resolveAllowedExistingGalleryPath(directory, [pinnedTaskRoot]);
  if (!authorizedDirectory) throw new Error('The dated video output folder is outside the selected pinned folder.');
  const extension = extname(source);
  const stem = basename(source, extension);
  const id = promptId.replace(/[^a-z0-9_-]/gi, '').slice(0, 80);
  if (!id) throw new Error('Cannot route video output without its job ID.');
  const sourceId = createHash('sha256').update(source).digest('hex').slice(0, 10);
  const name = `${stem}_${id}_${sourceId}`;
  const before = await stat(source);
  if (!before.isFile() || before.size === 0) throw new Error('The source video is empty or unavailable.');
  const digest = await videoDigest(source);
  const temporary = join(authorizedDirectory, `${name}.${randomUUID()}.tmp`);
  let staged = false;
  try {
    let index = 0;
    for (let attempt = 0; attempt < 1000; attempt++) {
      const destination = join(authorizedDirectory, `${name}${index ? `_${index}` : ''}${extension}`);
      try {
        const existing = await stat(destination);
        if (existing.isFile() && existing.size === before.size && await videoDigest(destination) === digest) return destination;
        index++;
        continue;
      } catch (error: any) { if (error?.code !== 'ENOENT') throw error; }

      if (!staged) {
        await copyFile(source, temporary, constants.COPYFILE_EXCL);
        staged = true;
        const after = await stat(source);
        if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || await videoDigest(temporary) !== digest) {
          throw new Error('The source video changed while copying. Please retry.');
        }
      }
      try {
        try { await link(temporary, destination); }
        catch (error: any) {
          if (!['EPERM', 'ENOTSUP', 'EOPNOTSUPP', 'EXDEV', 'ENOSYS'].includes(error?.code)) throw error;
          await copyFile(temporary, destination, constants.COPYFILE_EXCL);
        }
        return destination;
      } catch (error: any) {
        if (error?.code !== 'EEXIST') throw error;
        // Inspect a racing publisher's output before selecting another name.
      }
    }
    throw new Error('Too many conflicting pinned video outputs. Choose another folder.');
  } finally {
    await rm(temporary, { force: true }).catch(error => console.warn('[PinnedVideo] Staging cleanup failed:', error));
  }
}
