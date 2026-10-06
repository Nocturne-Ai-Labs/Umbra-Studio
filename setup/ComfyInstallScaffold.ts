import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Gallery/generation browsing may create input/output folders before Setup.
// Adopt only empty directories; unknown files, checkouts and links stay protected.
export function isComfyInstallScaffold(root: string): boolean {
  let remaining = 1000;
  const emptyDirectories = (directory: string): boolean => {
    if (--remaining < 0) return false;
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    return readdirSync(directory).every(name => emptyDirectories(join(directory, name)));
  };
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    return readdirSync(root).every(name => ['input', 'output'].includes(name)
      && emptyDirectories(join(root, name)));
  } catch {
    return false;
  }
}
