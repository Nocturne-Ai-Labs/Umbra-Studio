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
export function remoteFilesystemNavigation(url: URL, resolveInput: (path: string) => string, toClientPath: (path: string) => string): Response | null {
  const policy = currentGalleryPathPolicy();
  const endpoint = url.pathname.replace('/api/gallery-bridge/fs/', '/api/fs/');
  if (!policy || !['/api/fs/list', '/api/fs/list-progressive', '/api/fs/tree', '/api/fs/folder-summary'].includes(endpoint)) return null;
  const input = url.searchParams.get('path');
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
  return Response.json({ path: input, folders, files: [], total: 0, done: true, nextCursor: null, counts: { image: 0, video: 0, audio: 0 }, subfolderCount: folders.length, imageCount: 0, videoCount: 0, totalMediaCount: 0 });
}
