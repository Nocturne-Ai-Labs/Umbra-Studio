export type CatalogSort = 'posts-desc' | 'posts-asc' | 'name-asc' | 'name-desc';
export function normalizeCatalogSort(value: unknown): CatalogSort | null {
  return ['posts-desc', 'posts-asc', 'name-asc', 'name-desc'].includes(String(value)) ? value as CatalogSort : null;
}
type CatalogEntry = { tag: string; count?: number; sourceId?: string; type?: string };
export function compareCatalogEntries(left: CatalogEntry, right: CatalogEntry, sort: CatalogSort): number {
  const nameOrder = left.tag.localeCompare(right.tag, undefined, { sensitivity: 'base' });
  if (sort === 'posts-desc' || sort === 'posts-asc') {
    const leftKnown = Number.isFinite(left.count);
    const rightKnown = Number.isFinite(right.count);
    if (leftKnown !== rightKnown) return leftKnown ? -1 : 1;
    if (leftKnown && rightKnown && left.count !== right.count) {
      return sort === 'posts-desc' ? right.count! - left.count! : left.count! - right.count!;
    }
  } else if (nameOrder) return sort === 'name-desc' ? -nameOrder : nameOrder;
  return nameOrder || left.tag.localeCompare(right.tag) || String(left.sourceId || '').localeCompare(String(right.sourceId || '')) || String(left.type || '').localeCompare(String(right.type || ''));
}
