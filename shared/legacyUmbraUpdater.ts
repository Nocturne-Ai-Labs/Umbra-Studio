import { lstatSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export const LEGACY_UMBRA_UPDATER_FILES = [
  'UmbraUpdater.bat', 'umbra-updater.sh', 'UmbraUpdater.exe', 'Umbra Updater.exe', 'umbra-updater.desktop',
  'resources/app/updater/UmbraUpdaterApp.js', 'resources/app/updater/index.html',
] as const;

function regularFile(root: string, name: string): boolean {
  let current = root;
  const parts = name.split('/');
  try {
    for (const [index, part] of parts.entries()) {
      current = join(current, part);
      const entry = lstatSync(current);
      if (entry.isSymbolicLink() || (index < parts.length - 1 ? !entry.isDirectory() : !entry.isFile())) return false;
    }
    return true;
  } catch { return false; }
}

export function cleanupLegacyUmbraUpdater(runtimeRoot: string, platform = process.platform): { removed: string[]; warnings: string[] } {
  const root = resolve(runtimeRoot), removed: string[] = [], warnings: string[] = [];
  // This migration owns named application files only, never User/Tools or a redirected installation.
  try {
    for (let current = root; ; current = dirname(current)) {
      const entry = lstatSync(current);
      if (!entry.isDirectory() || entry.isSymbolicLink()) return { removed, warnings: ['Legacy updater cleanup skipped a redirected installation path.'] };
      if (dirname(current) === current) break;
    }
  } catch { return { removed, warnings }; }
  const proof = [platform === 'win32' ? 'UmbraSetup.bat' : 'umbra-setup.sh',
    'resources/app/setup/UmbraSetupApp.js', 'resources/app/setup/index.html',
    'resources/app/launcher/UmbraUpdaterBootstrap.js'];
  if (!proof.every(name => regularFile(root, name))) return { removed, warnings };
  for (const name of LEGACY_UMBRA_UPDATER_FILES) {
    const path = join(root, name);
    try {
      // Refuse links and directories even when their names match a retired launcher.
      if (!regularFile(root, name)) {
        try { lstatSync(path); warnings.push(`Legacy updater cleanup left a non-regular or redirected file: ${name}`); }
        catch { /* Already absent. */ }
        continue;
      }
      unlinkSync(path);
      removed.push(name);
    } catch { warnings.push(`Close the old Umbra Updater and reopen Setup to remove ${name}.`); }
  }
  return { removed, warnings };
}
