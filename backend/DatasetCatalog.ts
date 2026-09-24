import * as fs from 'fs/promises';
import { isAbsolute, join, relative, sep } from 'path';

const IMAGE_EXTENSION = /\.(jpg|jpeg|png|webp|bmp|gif|avif)$/i;

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function isGone(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT'
    || (error as NodeJS.ErrnoException)?.code === 'ENOTDIR';
}

export async function mapBounded<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(limit))) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  }));
  return results;
}

export async function listDatasetCatalog(datasetsDir: string, summaryOnly = false) {
  await fs.mkdir(datasetsDir, { recursive: true });
  const canonicalRoot = await fs.realpath(datasetsDir);
  const entries = await fs.readdir(datasetsDir, { withFileTypes: true });
  const datasets = await mapBounded(entries.filter(entry => entry.isDirectory()), 4, async (dir) => {
    const datasetPath = join(datasetsDir, dir.name);
    try {
      const canonicalDataset = await fs.realpath(datasetPath);
      if (!isInside(canonicalRoot, canonicalDataset)) return null;
      const [datasetStats, archiveStats, subEntries] = await Promise.all([
        fs.lstat(datasetPath),
        fs.lstat(join(datasetsDir, `${dir.name}.zip`)).catch(error => { if (isGone(error)) return null; throw error; }),
        fs.readdir(datasetPath, { withFileTypes: true }),
      ]);
      if (!datasetStats.isDirectory()) return null;
      const concepts = await mapBounded(subEntries.filter(entry => entry.isDirectory()), 8, async (conceptDir) => {
        const match = conceptDir.name.match(/^(\d+)_(reg_)?(.+)$/);
        if (!match) return null;
        const [, repeatsStr, regPrefix, name] = match;
        const repeats = Number(repeatsStr);
        if (!Number.isSafeInteger(repeats) || repeats < 1) return null;
        const conceptPath = join(datasetPath, conceptDir.name);
        try {
          const canonicalConcept = await fs.realpath(conceptPath);
          if (!isInside(canonicalRoot, canonicalConcept)) return null;
          const [conceptStats, files] = await Promise.all([
            fs.lstat(conceptPath),
            fs.readdir(conceptPath, { withFileTypes: true }),
          ]);
          if (!conceptStats.isDirectory()) return null;
          const imageFiles = files.filter(entry => entry.isFile() && IMAGE_EXTENSION.test(entry.name));
          return {
            name,
            repeats,
            isReg: Boolean(regPrefix),
            folder: conceptDir.name,
            modifiedMs: conceptStats.mtimeMs,
            imageCount: imageFiles.length,
            ...(summaryOnly ? {} : { images: imageFiles.map(entry => ({ filename: entry.name })) }),
          };
        } catch (error) {
          if (isGone(error)) return null;
          throw error;
        }
      });
      return {
        name: dir.name,
        path: datasetPath,
        modifiedMs: datasetStats.mtimeMs,
        archive: archiveStats?.isFile() ? {
          path: join(datasetsDir, `${dir.name}.zip`),
          size: archiveStats.size,
          modifiedMs: archiveStats.mtimeMs,
        } : null,
        concepts: concepts.filter((concept): concept is NonNullable<typeof concept> => concept !== null)
          .sort((a, b) => b.modifiedMs - a.modifiedMs),
      };
    } catch (error) {
      if (isGone(error)) return null;
      throw error;
    }
  });
  return datasets.filter((dataset): dataset is NonNullable<typeof dataset> => dataset !== null)
    .sort((a, b) => b.modifiedMs - a.modifiedMs);
}
