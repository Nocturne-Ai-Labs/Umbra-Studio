export type FilmstripSelectableImage = {
  id: string;
};

export function normalizeFilmstripSelectionId(value: unknown): string {
  return String(value || '').trim();
}

export function createFilmstripPathMatcher(paths: string[]): (path: string) => boolean {
  const exact = new Set<string>();
  const suffixes = new Set<string>();
  for (const value of paths) {
    const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase();
    if (!normalized) continue;
    exact.add(normalized);
    for (let index = normalized.indexOf('/'); index >= 0; index = normalized.indexOf('/', index + 1)) {
      suffixes.add(normalized.slice(index + 1));
    }
  }
  return (value: string) => {
    const normalized = String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').trim().toLowerCase();
    if (!normalized) return false;
    if (exact.has(normalized) || suffixes.has(normalized)) return true;
    for (let index = normalized.indexOf('/'); index >= 0; index = normalized.indexOf('/', index + 1)) {
      if (exact.has(normalized.slice(index + 1))) return true;
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
