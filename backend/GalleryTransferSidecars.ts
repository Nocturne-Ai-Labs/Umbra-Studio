import * as fs from 'node:fs/promises';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { copyFileExclusive, moveTreeExclusive } from './FsTransferCopy';
import { isGalleryMediaReadPath } from '../shared/galleryMediaPath';

const SIDECAR_EXTENSIONS = ['.txt', '.json', '.caption', '.yaml', '.yml'];
const pathKey = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
type TransferPair = { source: string; target: string };

// Images have already moved when this runs. Group shared sidecars before moving
// any of them so every successful image receives its associated data.
export async function transferGalleryMediaSidecars(pairs: TransferPair[], mode: 'move' | 'copy', authorize?: (path: string) => Promise<boolean>): Promise<string[]> {
  const groups = new Map<string, { source: string; extension: string; targets: Map<string, string> }>();
  const warnings: string[] = [];
  for (const pair of pairs) {
    const targetStat = await fs.stat(pair.target).catch(() => null);
    if (!targetStat?.isFile()) continue;
    const sourceName = basename(pair.source), targetName = basename(pair.target);
    const sourceBase = sourceName.slice(0, -extname(sourceName).length) || sourceName;
    const targetBase = targetName.slice(0, -extname(targetName).length) || targetName;
    for (const extension of SIDECAR_EXTENSIONS) {
      for (const [sourceLeaf, targetLeaf] of [[sourceBase + extension, targetBase + extension], [sourceName + extension, targetName + extension]]) {
        const source = join(dirname(pair.source), sourceLeaf), target = join(dirname(pair.target), targetLeaf);
        if (pathKey(source) === pathKey(target)) continue;
        const key = pathKey(source);
        let group = groups.get(key);
        if (!group) { group = { source, extension, targets: new Map() }; groups.set(key, group); }
        group.targets.set(pathKey(target), target);
      }
    }
  }
  for (const group of groups.values()) {
    try {
      if (authorize && (!(await authorize(group.source))
        || !(await Promise.all([...group.targets.values()].map(target => authorize(target)))).every(Boolean))) {
        throw new Error('Sidecar resolves outside allowed roots');
      }
      const sourceStat = await fs.lstat(group.source).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'ENOENT') return null;
        throw error;
      });
      if (!sourceStat?.isFile()) continue;
      let keepSource = mode === 'copy';
      if (!keepSource) {
        for (const name of await fs.readdir(dirname(group.source))) {
          if (!isGalleryMediaReadPath(name)) continue;
          const base = name.slice(0, -extname(name).length) || name;
          if (![base + group.extension, name + group.extension].some(leaf => pathKey(join(dirname(group.source), leaf)) === pathKey(group.source))) continue;
          const sibling = await fs.lstat(join(dirname(group.source), name));
          if (sibling.isFile()) { keepSource = true; break; }
        }
      }
      const targets = [...group.targets.values()];
      for (let index = 0; index < targets.length; index++) {
        const target = targets[index];
        await fs.mkdir(dirname(target), { recursive: true });
        if (!keepSource && index === targets.length - 1) await moveTreeExclusive(group.source, target);
        else await copyFileExclusive(group.source, target);
      }
    } catch (error) {
      warnings.push(`Sidecar for ${group.source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return warnings;
}
