import * as fs from 'node:fs/promises';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

async function canonicalCandidate(path: string): Promise<string> {
  let parent = resolve(path);
  const missing: string[] = [];
  while (true) {
    try { return resolve(await fs.realpath(parent), ...missing); }
    catch (error: any) {
      if (error?.code !== 'ENOENT' || dirname(parent) === parent) throw error;
      const entry = await fs.lstat(parent).catch(() => null);
      if (entry?.isSymbolicLink()) throw new Error('Unresolved symbolic link');
      missing.unshift(basename(parent));
      parent = dirname(parent);
    }
  }
}

function canonicalCandidateSync(path: string): string {
  let parent = resolve(path);
  const missing: string[] = [];
  while (true) {
    try { return resolve(realpathSync(parent), ...missing); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(parent) === parent) throw error;
      let entry;
      try {
        entry = lstatSync(parent);
      } catch (linkError) {
        if ((linkError as NodeJS.ErrnoException).code !== 'ENOENT') throw linkError;
      }
      if (entry?.isSymbolicLink()) throw new Error('Unresolved symbolic link');
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
    const candidate = await canonicalCandidate(path).catch(() => null);
    if (!candidate) return null;
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

export function resolveAllowedExistingGalleryPath(path: string, allowedRoots: string[]): string | null {
  let candidate: string;
  try { candidate = canonicalCandidateSync(path); }
  catch { return null; }
  for (const root of allowedRoots) {
    let physicalRoot: string;
    try { physicalRoot = canonicalCandidateSync(root); }
    catch { continue; }
    const rel = relative(physicalRoot, candidate);
    if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`))) return candidate;
  }
  return null;
}
