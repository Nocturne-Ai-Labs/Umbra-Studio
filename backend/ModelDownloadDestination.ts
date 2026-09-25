import { lstatSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';

export const MODEL_ARTIFACT_DIR = '.umbra';
export const MODEL_SNAPSHOT_SUFFIX = '.umbra-model.json';

function pathEntryExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function reserveUniqueModelDownloadPath(targetPath: string, reservedDestinations: Set<string>): string {
  const parent = dirname(targetPath);
  const ext = extname(targetPath);
  const stem = basename(targetPath, ext);
  let index = 1;
  let candidate = targetPath;
  while (pathEntryExists(candidate) || pathEntryExists(`${candidate}.part`)
    || pathEntryExists(join(parent, MODEL_ARTIFACT_DIR, `${basename(candidate)}${MODEL_SNAPSHOT_SUFFIX}`))
    || reservedDestinations.has(candidate.toLowerCase())) {
    candidate = join(parent, `${stem} (${index})${ext}`);
    index += 1;
  }
  reservedDestinations.add(candidate.toLowerCase());
  return candidate;
}
