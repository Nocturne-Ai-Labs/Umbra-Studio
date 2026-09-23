export function normalizeUmbraUiPinnedFolder(value: unknown): string {
  const path = String(value || '').trim().replace(/\\/g, '/');
  if (/^[a-z]:\/+$/i.test(path)) return `${path.slice(0, 2)}/`;
  return path.replace(/\/+$/, '') || (path.startsWith('/') ? '/' : '');
}

export function getUmbraUiPinnedFolderLabel(value: string): string {
  const parts = normalizeUmbraUiPinnedFolder(value).split('/').filter(Boolean);
  if (parts.length <= 1) return parts[0] || value;
  return `${parts.at(-1)} - ${parts.at(-2)}`;
}

export function resolveUmbraUiPinnedFolderOption(value: string, folders: readonly string[]): string {
  const selected = normalizeUmbraUiPinnedFolder(value);
  if (!selected) return '';
  const windowsPath = /^[a-z]:\//i.test(selected) || selected.startsWith('//');
  return folders.find((folder) => {
    const option = normalizeUmbraUiPinnedFolder(folder);
    return windowsPath ? option.toLowerCase() === selected.toLowerCase() : option === selected;
  }) || selected;
}
