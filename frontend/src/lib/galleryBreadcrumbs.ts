export type GalleryBreadcrumb = { path: string; label: string; parent: string };

const normalize = (path: string) => {
  const value = path.replace(/\\/g, '/').trim();
  return /^[a-z]:\/*$/i.test(value) ? `${value.slice(0, 2)}/` : value.replace(/\/+$/, '') || '/';
};

// Start at a configured library root, never expose arbitrary filesystem ancestors.
export function buildGalleryBreadcrumbs(folder: string, roots: Array<{ path: string; label: string }>): GalleryBreadcrumb[] {
  if (!folder) return [];
  const current = normalize(folder);
  const root = roots.map(entry => ({ ...entry, path: normalize(entry.path) }))
    .filter(entry => current.toLowerCase() === entry.path.toLowerCase()
      || current.toLowerCase().startsWith(`${entry.path.replace(/\/$/, '')}/`.toLowerCase()))
    .sort((a, b) => b.path.length - a.path.length)[0];
  if (!root) return [{ path: current, label: current.split('/').pop() || current, parent: '' }];
  const crumbs: GalleryBreadcrumb[] = [{ path: root.path, label: root.label, parent: '' }];
  let parent = root.path;
  for (const label of current.slice(root.path.length).split('/').filter(Boolean)) {
    const path = `${parent.replace(/\/$/, '')}/${label}`;
    crumbs.push({ path, label, parent });
    parent = path;
  }
  return crumbs;
}
