import { lstatSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { resolveAllowedExistingGalleryPath } from './GalleryPathAccess';

function pathKey(path: string): string {
  const normalized = resolve(path).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function isProtectedModelManagerRoot(path: string, roots: string[]): boolean {
  const physicalPath = resolveAllowedExistingGalleryPath(path, roots);
  if (!physicalPath) return false;
  return roots.some(root => {
    const physicalRoot = resolveAllowedExistingGalleryPath(root, [root]);
    return physicalRoot !== null && pathKey(physicalPath) === pathKey(physicalRoot);
  });
}

export function planModelManagerTransferTarget(
  sourceFullPath: string,
  destinationFullPath: string,
  sourceIsDirectory: boolean,
  artifactPaths: string[],
  reservedTargets: Set<string>,
  artifactDirName = '.umbra',
): { targetFullPath: string; artifactTargets: string[] } {
  const sourceName = basename(sourceFullPath);
  const extension = sourceIsDirectory ? '' : extname(sourceName);
  const nameWithoutExtension = extension ? sourceName.slice(0, -extension.length) : sourceName;
  const sourceArtifactDir = pathKey(join(dirname(sourceFullPath), artifactDirName));
  if (artifactPaths.some(path => !basename(path).startsWith(sourceName))) {
    throw new Error('Invalid model artifact name');
  }

  for (let suffix = 0; ; suffix += 1) {
    const targetName = suffix === 0 ? sourceName
      : `${nameWithoutExtension} (${suffix})${extension}`;
    const targetFullPath = join(destinationFullPath, targetName);
    const artifactTargets = artifactPaths.map(artifactPath => {
      const artifactName = basename(artifactPath);
      const renamed = artifactName.startsWith(sourceName)
        ? `${targetName}${artifactName.slice(sourceName.length)}` : artifactName;
      const targetParent = pathKey(dirname(artifactPath)) === sourceArtifactDir
        ? join(destinationFullPath, artifactDirName) : destinationFullPath;
      return join(targetParent, renamed);
    });
    const targets = [targetFullPath, ...artifactTargets];
    if (targets.some(target => pathEntryExists(target) || reservedTargets.has(pathKey(target)))) continue;
    for (const target of targets) reservedTargets.add(pathKey(target));
    return { targetFullPath, artifactTargets };
  }
}
