import { readdirSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { currentGalleryPathPolicy, isGalleryPathPolicyAllowed, type GalleryPathPolicy } from './GalleryPathAccess';

export function createRemoteFilesystemPolicy(runtimeRoot: string, sourceRoot: string, extraRoots: string[]): GalleryPathPolicy {
  const user = join(runtimeRoot, 'User');
  const comfy = join(runtimeRoot, 'Tools', 'ComfyUI');
  const builtinRoots = [
    ...['Outputs', 'Output', 'PowerPrompter', 'MangaStudio', 'Fonts', 'UmbraUI', 'Datasets', 'Trash', 'FontforWatermark'].map(name => join(user, name)),
    join(user, 'Temp', 'ImageInspector'), join(user, 'ComfyUI', 'input'),
    ...['output', 'input', 'temp'].map(name => join(comfy, name)),
  ];
  const protectedRoots = ['Config', 'Cache', 'Logs', 'Models'].map(name => join(user, name));
  // Source and installed tools stay protected regardless of a configured root or alias.
  for (const [directory, exceptions] of [
    [runtimeRoot, ['User', 'Tools']],
    [join(runtimeRoot, 'Tools'), ['ComfyUI']],
    [comfy, ['output', 'input', 'temp']],
  ] as const) {
    try { for (const entry of readdirSync(directory)) if (!exceptions.some(name => name === entry || process.platform === 'win32' && name.toLowerCase() === entry.toLowerCase())) protectedRoots.push(join(directory, entry)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  protectedRoots.push(join(runtimeRoot, 'Runtime'), join(comfy, 'models'), join(comfy, 'user'), join(comfy, 'custom_nodes'));
  const key = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  if (key(sourceRoot) !== key(runtimeRoot)) protectedRoots.push(sourceRoot);
  return { runtimeRoot, builtinRoots, allowedRoots: [...builtinRoots, ...extraRoots], protectedRoots };
}

export function isRemoteFilesystemRoute(path: string): boolean {
  return path.startsWith('/api/fs/') || path.startsWith('/api/gallery-bridge/fs/');
}

// Ancestors are navigation-only virtual folders, never writable/exportable roots.
export async function remoteFilesystemNavigation(url: URL, resolveInput: (path: string) => string, toClientPath: (path: string) => string, readContentTree?: (url: URL) => Promise<Response>): Promise<Response | null> {
  const policy = currentGalleryPathPolicy();
  const endpoint = url.pathname.replace('/api/gallery-bridge/fs/', '/api/fs/');
  if (!policy || !['/api/fs/list', '/api/fs/list-progressive', '/api/fs/tree', '/api/fs/folder-summary'].includes(endpoint)) return null;
  // Empty list/tree paths mean the configured output folder in the real
  // handlers, not the runtime root. Folder-summary requires an explicit path.
  const input = (url.searchParams.get('path') || '').trim();
  if (!input) return null;
  const folder = resolveInput(input);
  const children = new Map<string, string>();
  const contentRoots = policy.allowedRoots.filter(isGalleryPathPolicyAllowed);
  for (const root of contentRoots) {
    const rel = relative(folder, root);
    if (!rel || isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) continue;
    children.set(rel.split(sep)[0], join(folder, rel.split(sep)[0]));
  }
  // Only intermediate folders need a synthetic listing; data roots use real handlers.
  if (!children.size || contentRoots.some(root => {
    const rel = relative(root, folder);
    return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
  })) return null;
  const folders = [...children.values()].map(path => ({ name: basename(path), path: toClientPath(path), relativePath: toClientPath(path), hasChildren: true, created: 0, modified: 0 }));
  if (endpoint === '/api/fs/tree') {
    const requestedDepth = Number.parseInt(url.searchParams.get('maxDepth') || '0', 10);
    const maxDepth = Number.isFinite(requestedDepth) ? Math.max(0, Math.min(8, requestedDepth)) : 0;
    const inside = (root: string, path: string) => {
      const rel = relative(root, path);
      return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
    };
    const readBranch = async (directory: string, depth: number): Promise<Record<string, unknown>[]> => {
      if (contentRoots.some(root => inside(root, directory))) {
        if (!readContentTree) return [];
        const childUrl = new URL(url);
        childUrl.searchParams.set('path', directory);
        childUrl.searchParams.set('maxDepth', String(maxDepth - depth));
        const response = await readContentTree(childUrl);
        if (!response.ok) throw new Error('Could not load an authorized content tree');
        const payload = await response.json();
        return Array.isArray(payload.folders) ? payload.folders : [];
      }
      const branches = new Set<string>();
      for (const root of contentRoots) {
        if (inside(directory, root) && directory !== root) branches.add(join(directory, relative(directory, root).split(sep)[0]));
      }
      return Promise.all([...branches].map(async path => {
        const nested = depth < maxDepth ? await readBranch(path, depth + 1) : [];
        return { name: basename(path), path: toClientPath(path), relativePath: toClientPath(path), hasChildren: nested.length > 0 || depth >= maxDepth, ...(nested.length ? { children: nested } : {}) };
      }));
    };
    return Response.json({ folders: await readBranch(folder, 0) });
  }
  if (endpoint === '/api/fs/folder-summary') return Response.json({ path: input, subfolderCount: folders.length, imageCount: 0, videoCount: 0, totalMediaCount: 0 });
  const filter = url.searchParams.get('filter');
  return Response.json({
    path: input, folders, files: [], total: 0,
    ...(endpoint === '/api/fs/list-progressive' ? { done: true, nextCursor: null, sortBy: url.searchParams.get('sortBy') || 'created', sortOrder: url.searchParams.get('sortOrder') === 'desc' ? 'desc' : 'asc' } : {}),
    ...(['text', 'font', 'all'].includes(filter || '') ? {} : { counts: { media: 0, image: 0, gif: 0, video: 0 } }),
  });
}
