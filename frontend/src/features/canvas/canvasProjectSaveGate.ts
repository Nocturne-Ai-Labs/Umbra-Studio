interface CanvasProjectRevision {
  id: string;
  revision: number;
}

// An autosave may already be persisting an older revision when Generate requests a save.
// Wait for it, then save once more if the caller still owns the same project state.
export async function saveUmbraCanvasRequiredRevision<T extends CanvasProjectRevision>(
  required: CanvasProjectRevision,
  save: () => Promise<T | null>,
  canRetry: () => boolean,
): Promise<T | null> {
  const saved = await save();
  if (!saved || (saved.id === required.id && saved.revision >= required.revision) || !canRetry()) return saved;
  return save();
}

/** Backend normalization can reorder object keys without changing the draft. */
export function areCanvasDraftSettingsEqual(left: unknown, right: unknown): boolean {
  const canonical = (value: unknown) => JSON.stringify(value, (_key, entry) => entry && typeof entry === 'object' && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
  return canonical(left) === canonical(right);
}
