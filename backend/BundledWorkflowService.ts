import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
} from 'node:fs';
import { join } from 'node:path';

export interface SeedBundledWorkflowResult {
  copied: string[];
  preserved: string[];
  sourceAvailable: boolean;
}

export function seedBundledWorkflowDirectory(
  sourceDirectory: string,
  targetDirectory: string,
): SeedBundledWorkflowResult {
  const result: SeedBundledWorkflowResult = {
    copied: [],
    preserved: [],
    sourceAvailable: existsSync(sourceDirectory),
  };
  if (!result.sourceAvailable) return result;

  mkdirSync(targetDirectory, { recursive: true });
  const entries = readdirSync(sourceDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }));

  for (const entry of entries) {
    const targetPath = join(targetDirectory, entry.name);
    if (existsSync(targetPath)) {
      result.preserved.push(entry.name);
      continue;
    }
    try {
      copyFileSync(join(sourceDirectory, entry.name), targetPath, constants.COPYFILE_EXCL);
      result.copied.push(entry.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'EEXIST') throw error;
      result.preserved.push(entry.name);
    }
  }
  return result;
}
