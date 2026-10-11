import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const LEGACY_UPDATER_BRIDGE_MARKER = 'Umbra Setup legacy-updater migration bridge';

// Older cached workers require these filenames before applying any payload.
// They contain no updater UI and are removed by the new Setup/worker after installation.
export function writeLegacyUpdaterCompatibility(publishRoot, platform) {
  if (!['win32', 'linux'].includes(platform)) throw new Error('Unsupported updater migration platform.');
  const root = path.resolve(publishRoot), updater = path.join(root, 'resources', 'app', 'updater');
  fs.mkdirSync(updater, { recursive: true });
  const alias = platform === 'win32' ? 'UmbraUpdater.bat' : 'umbra-updater.sh';
  const launcher = platform === 'win32'
    ? `@rem ${LEGACY_UPDATER_BRIDGE_MARKER}\n@call "%~dp0UmbraSetup.bat" --tab updates %*\n`
    : `#!/usr/bin/env bash\n# ${LEGACY_UPDATER_BRIDGE_MARKER}\nexec "$(dirname "$0")/umbra-setup.sh" --tab updates "$@"\n`;
  fs.writeFileSync(path.join(root, alias), launcher);
  if (platform !== 'win32') fs.chmodSync(path.join(root, alias), 0o755);
  fs.writeFileSync(path.join(updater, 'UmbraUpdaterApp.js'), `// ${LEGACY_UPDATER_BRIDGE_MARKER}\nthrow new Error('Umbra Updater is retired. Open Umbra Setup from the installation folder.');\n`);
  fs.writeFileSync(path.join(updater, 'index.html'), `<!doctype html><!-- ${LEGACY_UPDATER_BRIDGE_MARKER} --><title>Umbra Setup</title><p>Umbra Updater is retired. Open Umbra Setup from the installation folder.</p>\n`);
  const files = [alias, 'resources/app/updater/UmbraUpdaterApp.js', 'resources/app/updater/index.html'];
  const manifest = { schemaVersion: 1, platform, marker: LEGACY_UPDATER_BRIDGE_MARKER, files: Object.fromEntries(files.map(name => { const data = fs.readFileSync(path.join(root, name)); return [name, { bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') }]; })) };
  const setup = path.join(root, 'resources', 'app', 'setup'); fs.mkdirSync(setup, { recursive: true });
  fs.writeFileSync(path.join(setup, 'legacy-updater-bridge.json'), JSON.stringify(manifest, null, 2) + '\n');
}
