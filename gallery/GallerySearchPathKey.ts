export function gallerySearchPathKey(path: string, caseInsensitive = process.platform === 'win32'): string {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '').trim();
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}
