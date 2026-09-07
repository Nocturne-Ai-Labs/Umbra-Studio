import { resolve, join } from 'node:path';
import { existsSync, statSync, mkdirSync } from 'node:fs';

export type UmbraPinnedOutputTask = 'txt2img' | 'img2img' | 'inpainting' | 'canvas' | 'Video' | 'Upscaled' | 'Censored' | 'Watermarked' | 'GIF';

export function resolveUmbraPinnedTaskFolder(requested: unknown, pins: unknown, resolveCandidate: (value: string) => string, task: UmbraPinnedOutputTask): string {
  const root = resolveUmbraUiPinnedOutputFolder(requested, pins, resolveCandidate);
  if (!root) return '';
  if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('The pinned output folder is unavailable.');
  const folder = join(root, task);
  mkdirSync(folder, { recursive: true });
  return folder;
}

function normalizePinnedPathValue(value: unknown): string {
  const normalized = String(value || '').trim().replace(/\\/g, '/');
  return normalized && !normalized.includes('\0') ? normalized : '';
}

function comparablePath(value: string, caseInsensitive: boolean): string {
  const resolved = resolve(value);
  return caseInsensitive ? resolved.toLowerCase() : resolved;
}

export function resolveUmbraUiPinnedOutputFolder(
  requestedFolder: unknown,
  pinnedFolders: unknown,
  resolveCandidate: (value: string) => string,
  caseInsensitive = process.platform === 'win32',
): string {
  const requested = normalizePinnedPathValue(requestedFolder);
  if (!requested) return '';

  const resolvedRequested = resolve(resolveCandidate(requested));
  const requestedKey = comparablePath(resolvedRequested, caseInsensitive);
  const pins = Array.isArray(pinnedFolders) ? pinnedFolders : [];

  for (const rawPinnedFolder of pins) {
    const pinnedFolder = normalizePinnedPathValue(rawPinnedFolder);
    if (!pinnedFolder) continue;
    const resolvedPinnedFolder = resolve(resolveCandidate(pinnedFolder));
    if (comparablePath(resolvedPinnedFolder, caseInsensitive) === requestedKey) {
      return resolvedPinnedFolder;
    }
  }

  throw new Error('The selected Umbra UI output folder is no longer pinned. Pin it in Gallery and choose it again.');
}
