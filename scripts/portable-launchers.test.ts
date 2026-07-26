import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dir, '..');

describe('portable launcher packaging', () => {
  test('ships the compiled app launcher and dedicated updater launcher in Windows packages', () => {
    const source = readFileSync(join(root, 'scripts', 'build-webapp-folder.mjs'), 'utf8');
    expect(source).toContain("'UmbraStudio.exe'");
    expect(source).toContain("'UmbraUpdater.bat'");
    expect(source).toContain("['Start-Umbra.bat', 'UmbraStudio.bat', 'start-umbra.sh']");
    expect(source).toContain("'resources/app/launcher/UmbraUpdateWorker.js'");
    expect(source).toContain("'resources/app/launcher/UmbraUpdaterBootstrap.js'");
    expect(source).toContain("'resources/app/updater/UmbraUpdaterApp.js'");
    expect(source).toContain("'resources/app/updater/index.html'");
    expect(source).toContain("'webapp:build-updater'");
    expect(source).toContain('function writeUmbraUpdaterLauncher()');
    expect(source).not.toContain('function writeWindowsLauncher()');
    expect(source).not.toContain('function writeLinuxLauncher()');
  });

  test('keeps one shell launcher and removes Windows launchers from Linux packages', () => {
    const source = readFileSync(join(root, 'scripts', 'build-linux-folder.mjs'), 'utf8');
    expect(source).toContain('function writeLinuxLauncher()');
    expect(source).toContain("'start-umbra.sh'");
    expect(source).toContain("'umbra-updater.sh'");
    expect(source).toContain("'resources/app/launcher/UmbraUpdateWorker.js'");
    expect(source).toContain("'resources/app/launcher/UmbraUpdaterBootstrap.js'");
    expect(source).toContain("'resources/app/updater/UmbraUpdaterApp.js'");
    expect(source).toContain("'resources/app/updater/index.html'");
    expect(source).toContain("'webapp:build-updater'");
    expect(source).toContain('function writeLinuxUpdaterLauncher()');
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

  test('supports opt-in Authenticode signing before archiving Windows releases', () => {
    const workflow = readFileSync(join(root, '.github', 'workflows', 'release.yml'), 'utf8');
    const signIndex = workflow.indexOf('name: Sign Umbra Studio launcher');
    const verifyIndex = workflow.indexOf('name: Verify Umbra Studio signature');
    const archiveIndex = workflow.indexOf('name: Archive Windows package');

    expect(workflow).toContain("WINDOWS_SIGNING_ENABLED: ${{ vars.ENABLE_WINDOWS_SIGNING == 'true' }}");
    expect(workflow).toContain("if: env.WINDOWS_SIGNING_ENABLED == 'true'");
    expect(workflow).toContain("if: env.WINDOWS_SIGNING_ENABLED != 'true'");
    expect(workflow).toContain('uses: azure/login@v3');
    expect(workflow).toContain('uses: azure/artifact-signing-action@v2');
    expect(workflow).toContain('files: ${{ github.workspace }}\\release\\windows\\Umbra Studio\\UmbraStudio.exe');
    expect(workflow).toContain('timestamp-rfc3161: http://timestamp.acs.microsoft.com');
    expect(workflow).toContain('Get-AuthenticodeSignature');
    expect(workflow).toContain('WINDOWS_SIGNING_SUBJECT');
    expect(workflow).toContain('Publishing Umbra Studio without Authenticode signing.');
    expect(signIndex).toBeGreaterThan(-1);
    expect(verifyIndex).toBeGreaterThan(signIndex);
    expect(archiveIndex).toBeGreaterThan(verifyIndex);
  });

  test('releases the visible Windows terminal during an external update', () => {
    const source = readFileSync(join(root, 'launcher', 'UmbraWebLauncher.ts'), 'utf8');
    expect(source).toContain("spawn('cmd.exe', ['/d', '/c', executableName, ...args]");
    expect(source).not.toContain("spawn('cmd.exe', ['/d', '/k', executableName, ...args]");
    expect(source).toContain('await exitLauncher(0, false);');
  });
});
