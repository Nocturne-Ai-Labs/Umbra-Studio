import * as fs from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { GalleryFileInput, GalleryMediaType } from '../gallery/GalleryDb';

const IMAGE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.avif', '.heic', '.heif', '.jxl', '.tif', '.tiff', '.svg', '.apng',
]);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v']);

export function galleryFallbackSearchMediaType(name: string): GalleryMediaType | null {
  const extension = extname(name).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (extension === '.gif') return 'gif';
  return IMAGE_EXTENSIONS.has(extension) ? 'image' : null;
}

// Search may run while an external library changes. Confirm indexed hits and
// newly discovered names are still regular files inside the selected roots.
export async function inspectGalleryFallbackSearchMedia(
  absolutePath: string,
  clientPath: string,
  folderPath: string,
  authorize: (path: string) => Promise<string | null>,
): Promise<GalleryFileInput | null> {
  const type = galleryFallbackSearchMediaType(absolutePath);
  if (!type || !(await authorize(absolutePath))) return null;
  const stat = await fs.lstat(absolutePath).catch(() => null);
  if (!stat?.isFile()) return null;
  const createdMs = Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0
    ? stat.birthtimeMs
    : (Number.isFinite(stat.ctimeMs) && stat.ctimeMs > 0 ? stat.ctimeMs : stat.mtimeMs);
  return {
    path: clientPath,
    folderPath,
    name: basename(clientPath),
    type,
    size: Number.isFinite(stat.size) ? stat.size : 0,
    createdMs,
    modifiedMs: Number.isFinite(stat.mtimeMs) ? stat.mtimeMs : createdMs,
  };
}
