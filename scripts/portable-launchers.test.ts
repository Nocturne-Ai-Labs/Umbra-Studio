import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('portable launcher packaging', () => {
  test('ships only the compiled launcher in Windows packages', () => {
    const source = readFileSync(join(root, 'scripts', 'build-webapp-folder.mjs'), 'utf8');
    expect(source).toContain("'UmbraStudio.exe'");
    expect(source).toContain("['Start-Umbra.bat', 'UmbraStudio.bat', 'start-umbra.sh']");
    expect(source).toContain("'resources/app/launcher/UmbraUpdateWorker.js'");
    expect(source).toContain("'webapp:build-update-worker'");
    expect(source).not.toContain('function writeWindowsLauncher()');
    expect(source).not.toContain('function writeLinuxLauncher()');
  });

  test('keeps one shell launcher and removes Windows launchers from Linux packages', () => {
    const source = readFileSync(join(root, 'scripts', 'build-linux-folder.mjs'), 'utf8');
    expect(source).toContain('function writeLinuxLauncher()');
    expect(source).toContain("'start-umbra.sh'");
    expect(source).toContain("'resources/app/launcher/UmbraUpdateWorker.js'");
    expect(source).toContain("'webapp:build-update-worker'");
    expect(source).toContain("['Start-Umbra.bat', 'UmbraStudio.bat', 'UmbraStudio.exe']");
  });

  test('releases the visible Windows terminal during an external update', () => {
    const source = readFileSync(join(root, 'launcher', 'UmbraWebLauncher.ts'), 'utf8');
    expect(source).toContain("spawn('cmd.exe', ['/d', '/c', executableName, ...args]");
    expect(source).not.toContain("spawn('cmd.exe', ['/d', '/k', executableName, ...args]");
    expect(source).toContain('await exitLauncher(0, false);');
  });
});
