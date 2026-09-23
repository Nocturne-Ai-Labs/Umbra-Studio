import { resolve, join } from 'node:path';
import { statSync, mkdirSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolveAllowedExistingGalleryPath } from './GalleryPathAccess';

const PINNED_OUTPUT_RECOVERY = 'Select a different output folder or Default dated output, then generate again.';

export async function assertUmbraUiPinnedOutputAvailable(requested: unknown, pins: unknown, resolveCandidate: (value: string) => string, allowedRoots: string[]): Promise<void> {
  const root = resolveAuthorizedPinnedOutputRoot(requested, pins, resolveCandidate, allowedRoots);
  if (!root) return;
  const available = await stat(root).then(entry => entry.isDirectory()).catch(() => false);
  if (!available) throw new Error(`The pinned output folder is unavailable. ${PINNED_OUTPUT_RECOVERY}`);
}

export type UmbraPinnedOutputTask = 'txt2img' | 'img2img' | 'inpainting' | 'canvas' | 'Video' | 'Upscaled' | 'Censored' | 'Watermarked' | 'GIF';

export function resolveUmbraPinnedTaskFolder(requested: unknown, pins: unknown, resolveCandidate: (value: string) => string, task: UmbraPinnedOutputTask, allowedRoots: string[]): string {
  const root = resolveAuthorizedPinnedOutputRoot(requested, pins, resolveCandidate, allowedRoots);
  if (!root) return '';
  try {
    if (!statSync(root).isDirectory()) throw new Error('Not a directory');
  } catch {
    throw new Error(`The pinned output folder is unavailable. ${PINNED_OUTPUT_RECOVERY}`);
  }
  const folder = join(root, task);
  try {
    mkdirSync(folder, { recursive: true });
  } catch {
    throw new Error(`The pinned output folder cannot be written to. ${PINNED_OUTPUT_RECOVERY}`);
  }
  return folder;
}

function resolveAuthorizedPinnedOutputRoot(requested: unknown, pins: unknown, resolveCandidate: (value: string) => string, allowedRoots: string[]): string {
  const root = resolveUmbraUiPinnedOutputFolder(requested, pins, resolveCandidate);
  if (!root) return '';
  const authorizedRoot = resolveAllowedExistingGalleryPath(root, allowedRoots);
  if (!authorizedRoot) throw new Error(`The pinned output folder is outside the currently allowed Gallery roots. ${PINNED_OUTPUT_RECOVERY}`);
  return authorizedRoot;
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

  throw new Error(`The selected Umbra UI output folder is no longer pinned. ${PINNED_OUTPUT_RECOVERY}`);
}
