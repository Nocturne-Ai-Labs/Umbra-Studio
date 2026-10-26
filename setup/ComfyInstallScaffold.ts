import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Gallery/generation browsing may create input/output folders before Setup.
// Studio also writes the Manager security preference before ComfyUI is installed.
// Preserve that one generated file; unknown files, checkouts and links stay protected.
export function isComfyInstallScaffold(root: string): boolean {
  let remaining = 1000;
  const emptyDirectories = (directory: string): boolean => {
    if (--remaining < 0) return false;
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    return readdirSync(directory).every(name => emptyDirectories(join(directory, name)));
  };
  const managerPreference = (directory: string, parts: string[]): boolean => {
    if (--remaining < 0) return false;
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink()) return false;
    if (!parts.length) {
      return stat.isFile() && stat.size <= 1024
        && /^\[default\]\r?\nsecurity_level\s*=\s*(?:strong|normal|normal-|weak)\s*$/.test(readFileSync(directory, 'utf8'));
    }
    if (!stat.isDirectory()) return false;
    return readdirSync(directory).every(name => name === parts[0]
      && managerPreference(join(directory, name), parts.slice(1)));
  };
  try {
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return false;
    return readdirSync(root).every(name => name === 'user'
      ? managerPreference(join(root, name), ['__manager', 'config.ini'])
      : ['input', 'output'].includes(name) && emptyDirectories(join(root, name)));
  } catch {
    return false;
  }
}
