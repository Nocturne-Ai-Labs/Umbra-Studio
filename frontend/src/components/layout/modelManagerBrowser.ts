export type ModelManagerSortBy = 'name' | 'modified' | 'size' | 'type';
export type ModelManagerView = 'grid' | 'list';

type ModelManagerBrowserEntry = {
  kind: 'folder' | 'file';
  path: string;
  name: string;
  size?: number;
  modifiedMs?: number;
  modelType?: string;
  extension?: string;
  snapshot?: {
    modelName?: string;
    creator?: string;
    baseModel?: string;
    tags?: string[];
    trainedWords?: string[];
  };
};

export function browseModelManagerEntries<T extends ModelManagerBrowserEntry>(
  entries: T[],
  query: string,
  type: string,
  sortBy: ModelManagerSortBy,
  descending: boolean,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  const filtered = entries.filter((entry) => {
    // Keep folders available for navigation while a model type is filtered.
    if (entry.kind === 'file' && type && (entry.modelType || entry.extension || 'Model') !== type) return false;
    if (!needle) return true;
    const snapshot = entry.snapshot;
    return [entry.name, entry.path, entry.modelType, entry.extension, snapshot?.modelName,
      snapshot?.creator, snapshot?.baseModel, ...(snapshot?.tags || []), ...(snapshot?.trainedWords || [])]
      .some((value) => String(value || '').toLocaleLowerCase().includes(needle));
  });
  return filtered.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'folder' ? -1 : 1;
    const byName = left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' });
    let comparison = byName;
    if (left.kind === 'file') {
      if (sortBy === 'size') comparison = (left.size || 0) - (right.size || 0);
      if (sortBy === 'modified') comparison = (left.modifiedMs || 0) - (right.modifiedMs || 0);
      if (sortBy === 'type') comparison = String(left.modelType || left.extension || '').localeCompare(String(right.modelType || right.extension || ''));
    }
    return (comparison || byName) * (descending ? -1 : 1);
  });
}

export function selectModelManagerPaths(
  orderedPaths: string[],
  selected: Set<string>,
  path: string,
  anchor: string,
  modifiers: { toggle?: boolean; range?: boolean },
): Set<string> {
  if (modifiers.range && anchor) {
    const anchorIndex = orderedPaths.indexOf(anchor);
    const targetIndex = orderedPaths.indexOf(path);
    if (anchorIndex >= 0 && targetIndex >= 0) {
      const start = Math.min(anchorIndex, targetIndex);
      const end = Math.max(anchorIndex, targetIndex);
      return new Set([...selected, ...orderedPaths.slice(start, end + 1)]);
    }
  }
  if (modifiers.toggle) {
    const next = new Set(selected);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    return next;
  }
  return new Set([path]);
}
