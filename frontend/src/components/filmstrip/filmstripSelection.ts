export type FilmstripSelectableImage = {
  id: string;
};

export function normalizeFilmstripSelectionId(value: unknown): string {
  return String(value || '').trim();
}

export function createFilmstripPathMatcher(paths: string[]): (path: string) => boolean {
  const normalize = (value: string) => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase();
  const isAbsolute = (value: string) => /^[a-z]:\//.test(value) || value.startsWith('/');
  const removed = new Set(paths.map(normalize).filter(Boolean));
  const relative = new Set<string>();
  const absoluteSuffixes = new Set<string>();
  for (const path of removed) {
    if (!isAbsolute(path)) {
      if (path.includes('/')) relative.add(path);
      continue;
    }
    for (let index = path.indexOf('/'); index >= 0; index = path.indexOf('/', index + 1)) {
      const suffix = path.slice(index + 1);
      if (suffix.includes('/')) absoluteSuffixes.add(suffix);
    }
  }
  return (value: string) => {
    const normalized = normalize(value);
    if (!normalized) return false;
    if (removed.has(normalized)) return true;
    // Gallery events can mix root-relative and absolute paths. Only bridge those
    // forms when the relative path includes a folder; a shared filename alone
    // must never remove a different item from the strip.
    if (!isAbsolute(normalized)) return absoluteSuffixes.has(normalized);
    for (let index = normalized.indexOf('/'); index >= 0; index = normalized.indexOf('/', index + 1)) {
      if (relative.has(normalized.slice(index + 1))) return true;
    }
    return false;
  };
}

export function getSelectedIdsForTarget<T extends FilmstripSelectableImage>(
  orderedImages: T[],
  selectedIds: Set<string>,
  targetIdInput: string
): string[] {
  const targetId = normalizeFilmstripSelectionId(targetIdInput);
  if (!targetId) return [];
  const normalizedSelectedIds = new Set(
    Array.from(selectedIds || [])
      .map((id) => normalizeFilmstripSelectionId(id))
      .filter(Boolean)
  );
  const orderedSelected = orderedImages
    .map((image) => normalizeFilmstripSelectionId(image.id))
    .filter((id) => id && normalizedSelectedIds.has(id));
  return normalizedSelectedIds.has(targetId) && orderedSelected.length > 0 ? orderedSelected : [targetId];
}

export function resolveFilmstripSelectedImages<T extends FilmstripSelectableImage>(
  allImages: T[],
  orderedImages: T[],
  idsInput: string[]
): T[] {
  const normalizedIds = Array.from(new Set(
    (idsInput || [])
      .map((id) => normalizeFilmstripSelectionId(id))
      .filter(Boolean)
  ));
  if (normalizedIds.length === 0) return [];

  const byId = new Map<string, T>();
  for (const item of allImages) {
    const id = normalizeFilmstripSelectionId(item.id);
    if (id && !byId.has(id)) byId.set(id, item);
  }
  for (const item of orderedImages) {
    const id = normalizeFilmstripSelectionId(item.id);
    if (id && !byId.has(id)) byId.set(id, item);
  }

  const resolved = normalizedIds
    .map((id) => byId.get(id) || null)
    .filter(Boolean) as T[];
  if (resolved.length === normalizedIds.length) return resolved;

  const foundIds = new Set(resolved.map((item) => normalizeFilmstripSelectionId(item.id)));
  const missingIds = new Set(normalizedIds.filter((id) => !foundIds.has(id)));
  return [
    ...resolved,
    ...orderedImages.filter((item) => missingIds.has(normalizeFilmstripSelectionId(item.id))),
  ];
}
