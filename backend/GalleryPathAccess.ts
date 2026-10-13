import * as fs from 'node:fs/promises';
import { lstatSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { registeredModelPreviewRoot } from './ModelPreviewPathAccess';

export type GalleryPathPolicy = { runtimeRoot: string; sourceRoot?: string; builtinRoots: string[]; allowedRoots: string[]; protectedRoots: string[]; contentAncestorRoots?: string[]; mediaPreviewRoots?: string[] };
const galleryPathPolicy = new AsyncLocalStorage<GalleryPathPolicy | undefined>();
export function withGalleryPathPolicy<T>(policy: GalleryPathPolicy | undefined, operation: () => T): T {
  return galleryPathPolicy.run(policy, operation);
}
export function scopedGalleryRoots(fallback: string[]): string[] {
  return galleryPathPolicy.getStore()?.allowedRoots || fallback;
}
export function currentGalleryPathPolicy(): GalleryPathPolicy | undefined { return galleryPathPolicy.getStore(); }
export function isGalleryPathPolicyAllowed(path: string): boolean {
  const policy = galleryPathPolicy.getStore();
  if (!policy) return true;
  try {
    const candidate = canonicalCandidateSync(path);
    const runtime = canonicalCandidateSync(policy.runtimeRoot);
    // Explicit content folders under User remain usable. Broad runtime/User
    // grants cannot authorize code or folders created after this policy snapshot.
    const userRoot = canonicalCandidateSync(resolve(policy.runtimeRoot, 'User'));
    const roots = isInsidePhysicalRoot(runtime, candidate)
      ? [...policy.builtinRoots, ...policy.allowedRoots.filter(root => {
        const physicalRoot = canonicalCandidateSync(root);
        return physicalRoot !== userRoot && isInsidePhysicalRoot(userRoot, physicalRoot);
      })]
      : policy.allowedRoots;
    const physicalRoots = roots.map(canonicalCandidateSync);
    const previewRoot = policy.mediaPreviewRoots ? registeredModelPreviewRoot(path, policy.mediaPreviewRoots) : null;
    const source = policy.sourceRoot ? canonicalCandidateSync(policy.sourceRoot) : null;
    const declaredRuntimeContent = isInsidePhysicalRoot(runtime, candidate)
      && (Boolean(previewRoot) || physicalRoots.some(root => isInsidePhysicalRoot(runtime, root) && isInsidePhysicalRoot(root, candidate)));
    // A separate runtime may live beneath the source checkout. Only positively
    // granted content physically inside that runtime can cross the source guard;
    // all other protected roots and ancestor mutations remain denied.
    for (const root of policy.protectedRoots) {
      const protectedPath = canonicalCandidateSync(root);
      if (declaredRuntimeContent && policy.contentAncestorRoots?.some(ancestor => !relative(resolve(ancestor), resolve(root)))) continue;
      if (previewRoot && (!relative(resolve(root), resolve(previewRoot))
        || isInsidePhysicalRoot(resolve(policy.runtimeRoot, 'Tools'), resolve(root)) && isInsidePhysicalRoot(resolve(root), resolve(previewRoot)))) continue;
      if (source && policy.sourceRoot && !relative(resolve(policy.sourceRoot), resolve(root))
        && relative(source, runtime) && isInsidePhysicalRoot(source, runtime) && declaredRuntimeContent) continue;
      if (isInsidePhysicalRoot(protectedPath, candidate) || isInsidePhysicalRoot(candidate, protectedPath)) return false;
    }
    return Boolean(previewRoot) || physicalRoots.some(root => isInsidePhysicalRoot(root, candidate));
  } catch { return false; }
}

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

function isInsidePhysicalRoot(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return !rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

// Canonicalize configured roots as well as the candidate so explicitly linked
// roots remain authorized while links escaping those roots do not.
export async function createGalleryPathAuthorizer(allowedRoots: string[]) {
  const physicalRoots = (await Promise.all(allowedRoots.map(root => canonicalCandidate(root).catch(() => null))))
    .filter((root): root is string => Boolean(root));
  return async (path: string): Promise<string | null> => {
    if (!isGalleryPathPolicyAllowed(path)) return null;
    const candidate = await canonicalCandidate(path).catch(() => null);
    if (!candidate) return null;
    for (const physicalRoot of physicalRoots) {
      if (isInsidePhysicalRoot(physicalRoot, candidate)) return candidate;
    }
    return null;
  };
}

export async function resolveAllowedGalleryPath(path: string, allowedRoots: string[]): Promise<string | null> {
  if (!isGalleryPathPolicyAllowed(path)) return null;
  const candidate = await canonicalCandidate(path).catch(() => null);
  if (!candidate) return null;
  for (const root of allowedRoots) {
    const physicalRoot = await canonicalCandidate(root).catch(() => null);
    if (physicalRoot && isInsidePhysicalRoot(physicalRoot, candidate)) return candidate;
  }
  return null;
}

export function resolveAllowedExistingGalleryPath(path: string, allowedRoots: string[]): string | null {
  if (!isGalleryPathPolicyAllowed(path)) return null;
  let candidate: string;
  try { candidate = canonicalCandidateSync(path); }
  catch { return null; }
  for (const root of allowedRoots) {
    let physicalRoot: string;
    try { physicalRoot = canonicalCandidateSync(root); }
    catch { continue; }
    if (isInsidePhysicalRoot(physicalRoot, candidate)) return candidate;
  }
  return null;
}
