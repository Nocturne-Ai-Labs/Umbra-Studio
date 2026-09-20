import * as fs from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

async function canonicalCandidate(path: string): Promise<string> {
  let parent = resolve(path);
  const missing: string[] = [];
  while (true) {
    try { return resolve(await fs.realpath(parent), ...missing); }
    catch (error: any) {
      if (error?.code !== 'ENOENT' || dirname(parent) === parent) throw error;
      missing.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
}

// Canonicalize configured roots as well as the candidate so explicitly linked
// roots remain authorized while links escaping those roots do not.
export async function createGalleryPathAuthorizer(allowedRoots: string[]) {
  const physicalRoots = (await Promise.all(allowedRoots.map(root => canonicalCandidate(root).catch(() => null))))
    .filter((root): root is string => Boolean(root));
  return async (path: string): Promise<string | null> => {
    const candidate = await canonicalCandidate(path);
    for (const physicalRoot of physicalRoots) {
      const rel = relative(physicalRoot, candidate);
      if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) return candidate;
    }
    return null;
  };
}

export async function resolveAllowedGalleryPath(path: string, allowedRoots: string[]): Promise<string | null> {
  return (await createGalleryPathAuthorizer(allowedRoots))(path);
}
