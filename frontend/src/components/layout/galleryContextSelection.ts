import { galleryPathKey } from '../../lib/galleryPathIdentity';

export type GalleryContextSelectionState = {
  kind?: string;
  targetPath?: unknown;
  paths?: unknown[];
};

export function normalizeGalleryContextPath(value: unknown): string {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
}

export function galleryContextPathsEqual(left: unknown, right: unknown): boolean {
  return galleryPathKey(left) === galleryPathKey(right);
}

export function uniqueGalleryContextPaths(values: unknown[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  for (const value of values) {
    const normalized = normalizeGalleryContextPath(value);
    if (!normalized) continue;
    const key = galleryPathKey(normalized);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(normalized);
  }
  return next;
}

export function resolveGalleryContextSelectionPaths(
  state: GalleryContextSelectionState | null | undefined,
  selectedPathsInput: Iterable<unknown>
): string[] {
  if (!state) return [];
  if (Array.isArray(state.paths) && state.paths.length > 0) {
    return uniqueGalleryContextPaths(state.paths);
  }

  const targetPath = normalizeGalleryContextPath(state.targetPath);
  if (!targetPath) return [];

  const selected = uniqueGalleryContextPaths(Array.from(selectedPathsInput || []));
  if (state.kind === 'media' && selected.some((path) => galleryContextPathsEqual(path, targetPath))) {
    return selected;
  }

  return [targetPath];
}
