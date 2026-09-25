import { stat } from 'node:fs/promises';
import { basename, extname, isAbsolute, join } from 'node:path';
import { resolveAllowedGalleryPath } from './GalleryPathAccess';
import { copyMediaIntoComfyInput } from './UmbraUiMediaUploadService';

export class UmbraUiStagedMediaError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export async function ensureUmbraUiStagedMedia(options: {
  sourcePath: string;
  filename: string;
  kind: 'image' | 'video' | 'audio';
  inputRoot: string;
  galleryRoots: string[];
  rootDir: string;
  allowedExtensions: ReadonlySet<string>;
}): Promise<{ filename: string; destPath: string; copied: boolean }> {
  const filename = options.filename.trim();
  if (filename) {
    if (filename.length > 255 || basename(filename) !== filename
      || /[<>:"/\\|?*\x00-\x1f]/.test(filename)
      || !options.allowedExtensions.has(extname(filename).toLowerCase())) {
      throw new UmbraUiStagedMediaError(`Invalid staged ${options.kind} name.`, 400);
    }
    const inputPath = await resolveAllowedGalleryPath(join(options.inputRoot, filename), [options.inputRoot]);
    const inputStat = inputPath ? await stat(inputPath).catch(() => null) : null;
    if (inputStat?.isFile()) return { filename, destPath: inputPath!, copied: false };
  }

  const requestedSource = options.sourcePath.trim();
  if (!requestedSource) {
    throw new UmbraUiStagedMediaError(`The staged ${options.kind} is unavailable. Choose or upload it again.`, 409);
  }
  const sourcePath = await resolveAllowedGalleryPath(
    isAbsolute(requestedSource) ? requestedSource : join(options.rootDir, requestedSource),
    options.galleryRoots,
  );
  if (!sourcePath) {
    throw new UmbraUiStagedMediaError(`The staged ${options.kind} is unavailable and its source cannot be restored from Gallery. Choose or upload it again.`, 409);
  }
  const sourceStat = await stat(sourcePath).catch(() => null);
  if (!sourceStat?.isFile() || !options.allowedExtensions.has(extname(sourcePath).toLowerCase())) {
    throw new UmbraUiStagedMediaError(`The source ${options.kind} is unavailable. Choose it again.`, 404);
  }
  const copied = await copyMediaIntoComfyInput(sourcePath, options.inputRoot);
  return { ...copied, copied: true };
}
