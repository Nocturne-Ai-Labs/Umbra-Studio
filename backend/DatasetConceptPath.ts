import { existsSync, readdirSync } from 'node:fs';
import { basename } from 'node:path';

const CONCEPT_FOLDER = /^\d+_(?:reg_)?[^/\\]+$/;
const IMAGE_FILE = /\.(?:jpg|jpeg|png|webp|bmp|gif|avif)$/i;

export function isFlatDatasetConcept(datasetPath: string): boolean {
  if (CONCEPT_FOLDER.test(basename(datasetPath))) return true;
  try {
    const entries = readdirSync(datasetPath, { withFileTypes: true });
    if (entries.some(entry => entry.isFile() && IMAGE_FILE.test(entry.name))) return true;
    return !entries.some(entry => entry.isDirectory() && CONCEPT_FOLDER.test(entry.name));
  } catch {
    return false;
  }
}

export function resolveDatasetConceptPath(
  datasetName: string,
  conceptFolder: string,
  resolveDatasetPathSafe: (...segments: string[]) => string | null,
): string | null {
  const datasetPath = resolveDatasetPathSafe(datasetName);
  if (!datasetPath) return null;
  const nestedPath = resolveDatasetPathSafe(datasetName, conceptFolder);
  if (!nestedPath) return null;
  if (existsSync(nestedPath)) return nestedPath;
  if (conceptFolder === datasetName && isFlatDatasetConcept(datasetPath)) return datasetPath;
  return nestedPath;
}

export function datasetConceptImagePath(datasetName: string, conceptFolder: string, filename: string, flat: boolean): string {
  return flat
    ? `/User/Datasets/${datasetName}/${filename}`
    : `/User/Datasets/${datasetName}/${conceptFolder}/${filename}`;
}
