/** Compare server paths without inferring the server OS from the browser. */
export function galleryPathKey(value: unknown): string {
  const path = String(value || '').replace(/\\/g, '/').trim();
  const normalized = /^[a-z]:\/*$/i.test(path)
    ? `${path.slice(0, 2)}/`
    : path.replace(/\/+$/, '') || (path.startsWith('/') ? '/' : '');
  // Relative paths have no OS identity; preserve the server's spelling.
  return /^[a-z]:($|\/)/i.test(normalized) || normalized.startsWith('//')
    ? normalized.toLowerCase()
    : normalized;
}
