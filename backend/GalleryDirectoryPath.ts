export function normalizeGalleryDirectoryPath(value: unknown): string {
  const path = String(value || '').trim().replace(/\\/g, '/');
  if (!path || path.includes('\0')) return '';
  // A bare drive letter is produced by older Gallery settings. Treat it as
  // the drive root instead of the process's current directory on that drive.
  if (/^[a-z]:\/*$/i.test(path)) return `${path.slice(0, 2)}/`;
  return path.replace(/\/+$/, '') || (path.startsWith('/') ? '/' : '');
}
