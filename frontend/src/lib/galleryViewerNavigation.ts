export type GalleryViewerNavigationEntry = {
  path?: unknown;
  type?: unknown;
};

function navigationPathKey(value: unknown): string {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Keeps an open viewer attached to its active gallery result set as lazy pages arrive.
 * Isolated viewer sessions are preserved when their current item is not part of that set.
 */
export function reconcileGalleryViewerNavigation<T extends GalleryViewerNavigationEntry>(
  sessionFiles: T[],
  activeFiles: T[],
  currentPath: unknown,
): T[] {
  const currentKey = navigationPathKey(currentPath);
  if (!currentKey || !activeFiles.some((file) => navigationPathKey(file.path) === currentKey)) {
    return sessionFiles;
  }

  const seen = new Set<string>();
  const nextFiles = activeFiles.filter((file) => {
    if (file.type === 'folder') return false;
    const key = navigationPathKey(file.path);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const unchanged = nextFiles.length === sessionFiles.length
    && nextFiles.every((file, index) => (
      navigationPathKey(file.path) === navigationPathKey(sessionFiles[index]?.path)
    ));

  return unchanged ? sessionFiles : nextFiles;
}
