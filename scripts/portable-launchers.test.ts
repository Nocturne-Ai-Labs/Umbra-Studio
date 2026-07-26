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

  test('does not package root shortcuts for ComfyUI folders', () => {
    const windowsSource = readFileSync(join(root, 'scripts', 'build-webapp-folder.mjs'), 'utf8');
    const linuxSource = readFileSync(join(root, 'scripts', 'build-linux-folder.mjs'), 'utf8');
    const setupSource = readFileSync(join(root, 'setup-tools.ts'), 'utf8');
    const serverSource = readFileSync(join(root, 'UmbraServer.ts'), 'utf8');

    expect(windowsSource).not.toContain('createShortcutLink');
    expect(windowsSource).not.toContain('fs.symlinkSync');
    expect(linuxSource).not.toContain('fs.symlinkSync');
    expect(setupSource).not.toContain('createToolRootShortcuts');
    expect(setupSource).not.toContain('createRootShortcut');
    expect(serverSource).not.toContain('repair_shortcuts');
  });

  test('releases the visible Windows terminal during an external update', () => {
    const source = readFileSync(join(root, 'launcher', 'UmbraWebLauncher.ts'), 'utf8');
    expect(source).toContain("spawn('cmd.exe', ['/d', '/c', executableName, ...args]");
    expect(source).not.toContain("spawn('cmd.exe', ['/d', '/k', executableName, ...args]");
    expect(source).toContain('await exitLauncher(0, false);');
  });
});
