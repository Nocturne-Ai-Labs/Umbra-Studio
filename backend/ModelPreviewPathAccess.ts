import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const inside = (root: string, path: string) => {
  const rel = relative(root, path);
  return !rel || !isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`);
};
const regularFile = (path: string) => {
  const stat = lstatSync(path);
  return stat.isFile() && !stat.isSymbolicLink();
};

// Only registered colocated preview artifacts qualify, never a model weight,
// report, snapshot, or a linked file that happens to use a preview filename.
export function registeredModelPreviewRoot(path: string, roots: string[]): string | null {
  try {
    const artifactDir = dirname(resolve(path));
    const match = basename(path).match(/^(.+)\.umbra-model-thumb\.(?:jpe?g|png|webp|gif|bmp|avif|tiff?|heic|heif|jxl|mp4|webm|mov|mpg|mpeg|ogg|ogv|bin)$/i);
    if (!match || basename(artifactDir) !== '.umbra' || !regularFile(path)) return null;
    const artifactStat = lstatSync(artifactDir);
    if (!artifactStat.isDirectory() || artifactStat.isSymbolicLink()) return null;
    const model = join(dirname(artifactDir), match[1]);
    const snapshot = join(artifactDir, `${match[1]}.umbra-model.json`);
    if (!regularFile(model) || !regularFile(snapshot)) return null;
    const saved = JSON.parse(readFileSync(snapshot, 'utf8'));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
    const physicalPath = realpathSync(path);
    for (const root of roots) {
      let rootStat;
      try { rootStat = lstatSync(root); } catch { continue; }
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) continue;
      const physicalRoot = realpathSync(root);
      if (inside(physicalRoot, physicalPath) && inside(physicalRoot, realpathSync(model))
        && inside(physicalRoot, realpathSync(snapshot))) return root;
    }
  } catch { /* Missing or unresolved artifacts cannot grant access. */ }
  return null;
}
