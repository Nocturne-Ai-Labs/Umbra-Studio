#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

if (process.platform !== 'linux') {
  throw new Error('[linux-publish] Linux portable folder builds must be run on Linux.');
}

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const defaultPublishRoot = path.join(os.homedir(), 'Applications', 'Umbra Studio');
const hasExplicitPublishRoot = Boolean(
  process.env.UMBRA_LINUX_PUBLISH_ROOT || process.env.UMBRA_PUBLISH_ROOT,
);
const publishRoot = process.env.UMBRA_LINUX_PUBLISH_ROOT
  ? path.resolve(process.env.UMBRA_LINUX_PUBLISH_ROOT)
  : process.env.UMBRA_PUBLISH_ROOT
    ? path.resolve(process.env.UMBRA_PUBLISH_ROOT)
    : defaultPublishRoot;
const isCleanRelease = process.argv.includes('--clean-release')
  || process.env.UMBRA_WEBAPP_CLEAN_RELEASE === '1';
const bundleDataForgeModels = process.env.UMBRA_BUNDLE_DATA_FORGE_MODELS !== '0';

const PRESERVED_TOP_LEVEL = new Set(['User', 'Tools']);
const SKIP_SOURCE_DIRS = new Set([
  '.git',
  '.snapshots',
  '.bun-tmp',
  'dist-webapp',
  'User',
  'Tools',
  'ComfyUI-Models',
  'ComfyUI-Output',
  'ComfyUI-Nodes',
]);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
}

function hashText(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function dependencyStamp() {
  return hashText(JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    runtimeDependencies: pkg.umbraRuntimeDependencies,
    dependencies: Object.fromEntries((pkg.umbraRuntimeDependencies || []).map((name) => [name, pkg.dependencies?.[name]])),
    bunLock: hashFile(path.join(root, 'bun.lock')),
  }));
}

function isInside(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function safeRemoveInside(parent, targetPath) {
  const resolvedParent = path.resolve(parent);
  const resolvedTarget = path.resolve(targetPath);
  if (!isInside(resolvedParent, resolvedTarget)) {
    throw new Error(`[linux-publish] Refusing to remove outside target root: ${resolvedTarget}`);
  }
  const topRelative = path.relative(resolvedParent, resolvedTarget).split(path.sep).filter(Boolean)[0] || '';
  if (PRESERVED_TOP_LEVEL.has(topRelative)) {
    throw new Error(`[linux-publish] Refusing to remove preserved runtime path: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

function safeWipePublishRoot() {
  const resolvedTarget = path.resolve(publishRoot);
  if (
    !hasExplicitPublishRoot
    || path.basename(resolvedTarget).toLowerCase() !== 'umbra studio'
    || resolvedTarget === path.parse(resolvedTarget).root
  ) {
    throw new Error(`[linux-publish] Refusing to wipe unsafe publish root: ${resolvedTarget}`);
  }
    fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

function shouldSkipSourcePath(sourcePath) {
  const relative = path.relative(root, path.resolve(sourcePath)).split(path.sep).join('/');
  const [top] = relative.split('/');
  return SKIP_SOURCE_DIRS.has(top);
}

function copyTree(source, target, options = {}) {
  if (!fs.existsSync(source)) return;
  if (!options.allowSkippedSource && shouldSkipSourcePath(source)) return;

  const stats = fs.lstatSync(source);
  if (stats.isSymbolicLink()) {
    const realSource = fs.realpathSync(source);
    const realStats = fs.statSync(realSource);
    if (realStats.isDirectory()) {
      ensureDir(target);
      for (const entry of fs.readdirSync(realSource)) {
        copyTree(path.join(realSource, entry), path.join(target, entry), options);
      }
      return;
    }
    ensureDir(path.dirname(target));
    fs.copyFileSync(realSource, target);
    return;
  }

  if (stats.isDirectory()) {
    ensureDir(target);
    for (const entry of fs.readdirSync(source)) {
      if (options.skipEntries?.has(entry)) continue;
      copyTree(path.join(source, entry), path.join(target, entry), options);
    }
    return;
  }

  if (fs.existsSync(target)) {
    const targetStats = fs.statSync(target);
    if (targetStats.isFile() && targetStats.size === stats.size && targetStats.mtimeMs >= stats.mtimeMs - 1000) {
      return;
    }
  }
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyNodeModules(source, target) {
  if (!fs.existsSync(source)) return;
  const stamp = dependencyStamp();
  const stampPath = path.join(target, '.umbra-publish-stamp.json');
  try {
    const current = JSON.parse(fs.readFileSync(stampPath, 'utf-8'));
    const runtimeDependencies = Array.isArray(pkg.umbraRuntimeDependencies)
      ? pkg.umbraRuntimeDependencies
      : [];
    const hasRuntimeDependencies = runtimeDependencies.length > 0
      && runtimeDependencies.every((name) => fs.existsSync(path.join(target, name)));
    if (current?.dependencyStamp === stamp && hasRuntimeDependencies) {
      console.log('[linux-publish] node_modules unchanged; keeping existing runtime copy.');
      return;
    }
  } catch {
    // refresh below
  }
  if (fs.existsSync(target)) safeRemoveInside(path.dirname(target), target);
  copyTree(source, target, { allowSkippedSource: true });
  fs.writeFileSync(stampPath, JSON.stringify({ dependencyStamp: stamp, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
}

function copyExplicitFile(source, target) {
  if (!fs.existsSync(source)) return;
  ensureDir(path.dirname(target));
  fs.copyFileSync(source, target);
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    throw new Error(`[linux-publish] ${label} failed with status ${result.status ?? 1}`);
  }
}

function prepareCleanUser() {
  const userPath = path.join(publishRoot, 'User');
  fs.rmSync(userPath, { recursive: true, force: true });
  ensureDir(path.join(userPath, 'Config'));
  ensureDir(path.join(userPath, 'Logs'));
  ensureDir(path.join(userPath, 'Trash'));
  ensureDir(path.join(userPath, 'PowerPrompter'));

  copyTree(
    path.join(root, 'defaults', 'PowerPrompter', 'API Workflows'),
    path.join(userPath, 'PowerPrompter', 'API Workflows'),
  );
  copyTree(
    path.join(root, 'defaults', 'PowerPrompter', 'CSV'),
    path.join(userPath, 'PowerPrompter', 'CSV'),
  );
  copyTree(
    path.join(root, 'defaults', 'PowerPrompter', 'Prompts'),
    path.join(userPath, 'PowerPrompter', 'Prompts'),
  );
}

function verifyCleanPublishedUser() {
  const userPath = path.join(publishRoot, 'User');
  const forbiddenCredentials = path.join(userPath, 'Config', 'api-keys.json');
  if (fs.existsSync(forbiddenCredentials)) {
    throw new Error('[linux-publish] Clean release contains forbidden API credentials: User/Config/api-keys.json');
  }

  const allowedUserFile = (relativePath) => {
    const normalized = relativePath.split(path.sep).join('/');
    return normalized.startsWith('PowerPrompter/API Workflows/')
      || normalized.startsWith('PowerPrompter/CSV/')
      || normalized.startsWith('Models/WaifuTagger/')
      || normalized.startsWith('Models/DataForgeCaption/')
      || normalized.startsWith('PowerPrompter/Prompts/');
  };
  const unexpectedFiles = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }
      const relativePath = path.relative(userPath, fullPath);
      if (!entry.isFile() || !allowedUserFile(relativePath)) {
        unexpectedFiles.push(`User/${relativePath.split(path.sep).join('/')}`);
      }
    }
  };
  visit(userPath);
  if (unexpectedFiles.length > 0) {
    throw new Error(`[linux-publish] Unexpected User/ files in clean release: ${unexpectedFiles.join(', ')}`);
  }
}

function seedBundledDataForgeModels() {
  const modelFamilies = ['WaifuTagger', 'DataForgeCaption'];
  for (const family of modelFamilies) {
    const sourcePath = path.join(root, 'User', 'Models', family);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`[linux-publish] Required Data Forge model folder is missing: ${sourcePath}`);
    }
    copyTree(
      sourcePath,
      path.join(publishRoot, 'User', 'Models', family),
      { allowSkippedSource: true },
    );
  }
}

function prepareDataForgeModelDestination() {
  for (const family of ['WaifuTagger', 'DataForgeCaption']) {
    ensureDir(path.join(publishRoot, 'User', 'Models', family));
  }
}

function ensureBundledUmbraUiWorkflows() {
  const sourceDir = path.join(root, 'defaults', 'PowerPrompter', 'API Workflows');
  const targetDir = path.join(publishRoot, 'User', 'PowerPrompter', 'API Workflows');
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    const targetPath = path.join(targetDir, entry.name);
    if (fs.existsSync(targetPath)) continue;
    copyExplicitFile(path.join(sourceDir, entry.name), targetPath);
  }
}

function ensureBundledPowerPrompterStarterCards() {
  const sourceDir = path.join(root, 'defaults', 'PowerPrompter', 'Prompts');
  const targetDir = path.join(publishRoot, 'User', 'PowerPrompter', 'Prompts');
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.ppcards.json')) continue;
    const targetPath = path.join(targetDir, entry.name);
    if (fs.existsSync(targetPath)) continue;
    copyExplicitFile(path.join(sourceDir, entry.name), targetPath);
  }
}

function writeDataForgeModelInstaller() {
  const installerPath = path.join(publishRoot, 'install-data-forge-models.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime is missing: $BUN_BIN"
  exit 1
fi
"$BUN_BIN" "$PWD/resources/app/scripts/download-waifu-models.mjs"
"$BUN_BIN" "$PWD/resources/app/scripts/download-caption-models.mjs"
echo "Data Forge models are ready."
`;
  fs.writeFileSync(installerPath, script, 'utf-8');
  fs.chmodSync(installerPath, 0o755);
}

function writeUmbraUiModelInstaller() {
  const installerPath = path.join(publishRoot, 'install-umbra-ui-models.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime is missing: $BUN_BIN"
  exit 1
fi
"$BUN_BIN" "$PWD/resources/app/scripts/download-umbra-model-requirements.mjs" "$@"
echo "Umbra UI model requirements are ready."
`;
  fs.writeFileSync(installerPath, script, 'utf-8');
  fs.chmodSync(installerPath, 0o755);
}

function writeUmbraUiSupportModelInstaller() {
  const installerPath = path.join(publishRoot, 'install-umbra-ui-support-models.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime is missing: $BUN_BIN"
  exit 1
fi
"$BUN_BIN" "$PWD/resources/app/scripts/download-umbra-ui-models.mjs" --profile core "$@"
echo "Umbra UI support models are ready."
`;
  fs.writeFileSync(installerPath, script, 'utf-8');
  fs.chmodSync(installerPath, 0o755);
}

function writeModelRequirementsInstaller() {
  const installerPath = path.join(publishRoot, 'install-model-requirements.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime is missing: $BUN_BIN"
  exit 1
fi
"$BUN_BIN" "$PWD/resources/app/scripts/download-umbra-model-requirements.mjs" "$@"
echo "Model requirements are ready."
`;
  fs.writeFileSync(installerPath, script, 'utf-8');
  fs.chmodSync(installerPath, 0o755);
}

function writeLinuxLauncher() {
  const launcherPath = path.join(publishRoot, 'start-umbra.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime missing: $BUN_BIN"
  exit 1
fi
export UMBRA_ROOT="$PWD"
export UMBRA_TERMINAL_MODE=visible
exec "$BUN_BIN" "$PWD/resources/app/launcher/UmbraWebLauncher.ts" --root "$PWD" "$@"
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
  fs.chmodSync(launcherPath, 0o755);
}

function writeLinuxUpdaterLauncher() {
  const launcherPath = path.join(publishRoot, 'umbra-updater.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
UPDATER_BOOTSTRAP="$PWD/resources/app/launcher/UmbraUpdaterBootstrap.js"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime missing: $BUN_BIN"
  exit 1
fi
if [ ! -f "$UPDATER_BOOTSTRAP" ]; then
  echo "[ERROR] Standalone updater missing: $UPDATER_BOOTSTRAP"
  exit 1
fi
exec "$BUN_BIN" "$UPDATER_BOOTSTRAP" --root "$PWD" "$@"
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
  fs.chmodSync(launcherPath, 0o755);
}

function writeLinuxSetupLauncher() {
  const launcherPath = path.join(publishRoot, 'umbra-setup.sh');
  const script = `#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
BUN_BIN="$PWD/Runtime/Bun/linux/bun"
SETUP_APP="$PWD/resources/app/setup/UmbraSetupApp.js"
if [ ! -x "$BUN_BIN" ]; then
  echo "[ERROR] Bundled Bun runtime missing: $BUN_BIN"
  exit 1
fi
if [ ! -f "$SETUP_APP" ]; then
  echo "[ERROR] Standalone setup utility missing: $SETUP_APP"
  exit 1
fi
exec "$BUN_BIN" "$SETUP_APP" --root "$PWD" "$@"
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
  fs.chmodSync(launcherPath, 0o755);
}

function removeWindowsLaunchers() {
  for (const relativePath of ['Start-Umbra.bat', 'UmbraStudio.bat', 'UmbraStudio.exe']) {
    const target = path.join(publishRoot, relativePath);
    if (fs.existsSync(target)) safeRemoveInside(publishRoot, target);
  }
}

function writeDesktopFile() {
  const desktopPath = path.join(publishRoot, 'UmbraStudio.desktop');
  const scriptPath = path.join(publishRoot, 'start-umbra.sh');
  const iconPath = path.join(publishRoot, 'resources', 'app', 'frontend', 'public', 'assets', 'UMBRA-icon.png');
  const desktop = `[Desktop Entry]
Name=Umbra Studio
Exec=${scriptPath}
Icon=${iconPath}
Type=Application
Categories=Graphics;Development;
Terminal=true
`;
  fs.writeFileSync(desktopPath, desktop, 'utf-8');
  fs.chmodSync(desktopPath, 0o755);
}

function verifyBundledDataForgeModels() {
  const manifestPath = path.join(root, 'defaults', 'DataForge', 'model-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const model of manifest.models || []) {
    for (const expected of model.files || []) {
      const targetPath = path.join(publishRoot, 'User', 'Models', model.family, model.folder, expected.path);
      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size !== expected.bytes) {
        throw new Error(`[linux-publish] Missing or incomplete bundled model file: ${targetPath}`);
      }
    }
  }
}

function verifyPublish() {
  const required = [
    'resources/app/UmbraServer.js',
    'resources/app/UmbraServer.ts',
    'resources/app/public/index.html',
    'resources/app/backend',
    'resources/app/defaults/DataForge/model-manifest.json',
    'resources/app/defaults/UmbraUI/model-manifest.json',
    'resources/app/defaults/UmbraUI/model-requirements-manifest.json',
    'resources/app/defaults/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'resources/app/defaults/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'resources/app/defaults/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'resources/app/gallery/GalleryServer.ts',
    'resources/app/launcher/UmbraWebLauncher.ts',
    'resources/app/launcher/UmbraMigrationWorker.ts',
    'resources/app/launcher/UmbraUpdateWorker.js',
    'resources/app/launcher/UmbraUpdaterBootstrap.js',
    'resources/app/updater/UmbraUpdaterApp.js',
    'resources/app/updater/index.html',
    'resources/app/setup/UmbraSetupApp.js',
    'resources/app/setup/index.html',
    'resources/app/backend/FirstRunService.ts',
    'resources/app/shared/onboarding/firstRun.ts',
    'resources/app/node_modules',
    'Runtime/Bun/linux/bun',
    'User/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'User/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'User/PowerPrompter/Prompts/Intro to Powerprompter.ppcards.json',
    'User/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'install-data-forge-models.sh',
    'install-umbra-ui-models.sh',
    'install-umbra-ui-support-models.sh',
    'install-model-requirements.sh',
    'umbra-setup.sh',
    'umbra-updater.sh',
    'start-umbra.sh',
  ];
  for (const relativePath of required) {
    const targetPath = path.join(publishRoot, relativePath);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`[linux-publish] Missing required runtime path: ${targetPath}`);
    }
  }
  if (fs.existsSync(path.join(publishRoot, 'Umbra-Nodes'))) {
    throw new Error('[linux-publish] Bundled Umbra-Nodes payload must not be present; setup installs it from GitHub.');
  }
  const updaterWorker = fs.readFileSync(
    path.join(publishRoot, 'resources', 'app', 'launcher', 'UmbraUpdateWorker.js'),
    'utf8',
  );
  const updaterApp = fs.readFileSync(
    path.join(publishRoot, 'resources', 'app', 'updater', 'UmbraUpdaterApp.js'),
    'utf8',
  );
  const updaterHtml = fs.readFileSync(
    path.join(publishRoot, 'resources', 'app', 'updater', 'index.html'),
    'utf8',
  );
  if (updaterWorker.includes('waitForHealthyRestart') || updaterApp.includes('/api/relaunch')) {
    throw new Error('[linux-publish] Updater must not restart Umbra Studio automatically.');
  }
  if (!updaterApp.includes('/api/close') || !updaterHtml.includes('start Umbra Studio manually')) {
    throw new Error('[linux-publish] Updater manual-restart completion flow is missing.');
  }
  if (bundleDataForgeModels) verifyBundledDataForgeModels();
}

function publish() {
  console.log(`[linux-publish] Publishing Linux folder build to ${publishRoot}`);
  console.log(isCleanRelease
    ? '[linux-publish] Clean release mode: wiping the explicit package root and shipping clean runtime skeletons.'
    : '[linux-publish] No-bump update mode: preserving existing User/ and Tools/ folders.');
  if (bundleDataForgeModels) {
    run('node', ['scripts/download-waifu-models.mjs'], 'Data Forge WD model preparation');
    run('node', ['scripts/download-caption-models.mjs'], 'Data Forge natural caption model preparation');
  } else {
    console.log('[linux-publish] GitHub-sized package mode: Data Forge model weights will be installed with install-data-forge-models.sh.');
  }

  if (isCleanRelease) safeWipePublishRoot();
  ensureDir(publishRoot);
  removeWindowsLaunchers();

  run('bun', ['install'], 'dependency install');
  run('bun', ['run', 'webapp:prepare-runtime'], 'runtime preparation');
  run('bun', ['run', 'webapp:prepare-dependencies'], 'runtime dependency preparation');
  run('bun', ['run', 'build:frontend'], 'frontend build');
  run('bun', ['build', 'UmbraServer.ts', '--target=bun', '--outfile', path.join('dist-webapp', 'UmbraServer.js')], 'backend build');
  run('bun', ['run', 'webapp:build-updater'], 'standalone updater build');
  run('bun', ['run', 'webapp:build-setup'], 'standalone setup build');

  const packagedAppDir = path.join(publishRoot, 'resources', 'app');
  ensureDir(packagedAppDir);

  for (const relativePath of ['public', path.join('resources', 'app', 'public')]) {
    const target = path.join(publishRoot, relativePath);
    if (fs.existsSync(target)) safeRemoveInside(publishRoot, target);
  }

  const appTargets = [
    'backend',
    'gallery',
    'launcher',
    'updater',
    'setup',
    'scripts',
    'shared',
    'defaults',
    'frontend',
    'UmbraServer.ts',
    'setup-tools.ts',
    'manage-tools.ts',
    'package.json',
    'bun.lock',
    'Credits.md',
    'LICENSE',
    'NOTICE',
  ];
  for (const entry of appTargets) {
    const source = path.join(root, entry);
    if (!fs.existsSync(source)) continue;
    const target = path.join(packagedAppDir, entry);
    const options = entry === 'frontend' ? { skipEntries: new Set(['node_modules']) } : {};
    copyTree(source, target, options);
  }

  copyTree(path.join(root, 'public'), path.join(packagedAppDir, 'public'));
  copyNodeModules(
    path.join(root, 'dist-webapp', 'runtime-dependencies', `${process.platform}-${process.arch}`, 'node_modules'),
    path.join(packagedAppDir, 'node_modules'),
  );
  copyTree(path.join(root, 'Runtime', 'Bun', 'linux'), path.join(publishRoot, 'Runtime', 'Bun', 'linux'));
  copyExplicitFile(path.join(root, 'dist-webapp', 'UmbraServer.js'), path.join(packagedAppDir, 'UmbraServer.js'));
  copyExplicitFile(
    path.join(root, 'dist-webapp', 'UmbraUpdateWorker.js'),
    path.join(packagedAppDir, 'launcher', 'UmbraUpdateWorker.js'),
  );
  copyExplicitFile(
    path.join(root, 'dist-webapp', 'UmbraUpdaterBootstrap.js'),
    path.join(packagedAppDir, 'launcher', 'UmbraUpdaterBootstrap.js'),
  );
  copyExplicitFile(
    path.join(root, 'dist-webapp', 'UmbraUpdaterApp.js'),
    path.join(packagedAppDir, 'updater', 'UmbraUpdaterApp.js'),
  );
  copyExplicitFile(
    path.join(root, 'dist-webapp', 'UmbraSetupApp.js'),
    path.join(packagedAppDir, 'setup', 'UmbraSetupApp.js'),
  );

  for (const file of ['Credits.md', 'LICENSE', 'NOTICE']) {
    copyTree(path.join(root, file), path.join(publishRoot, file));
  }

  if (isCleanRelease || !fs.existsSync(path.join(publishRoot, 'User'))) {
    prepareCleanUser();
  } else {
    console.log('[linux-publish] Existing User/ preserved for no-bump update.');
    ensureBundledUmbraUiWorkflows();
    ensureBundledPowerPrompterStarterCards();
  }
  if (bundleDataForgeModels) seedBundledDataForgeModels();
  else prepareDataForgeModelDestination();

  ensureDir(path.join(publishRoot, 'Tools'));
  const umbraNodesTarget = path.join(publishRoot, 'Umbra-Nodes');
  if (fs.existsSync(umbraNodesTarget)) safeRemoveInside(publishRoot, umbraNodesTarget);

  for (const name of ['ComfyUI-Models', 'ComfyUI-Output', 'ComfyUI-Nodes']) {
    const legacyShortcut = path.join(publishRoot, name);
    try {
      if (fs.lstatSync(legacyShortcut).isSymbolicLink()) {
        safeRemoveInside(publishRoot, legacyShortcut);
      }
    } catch {
      // Missing entries and real directories are intentionally left alone.
    }
  }

  writeLinuxLauncher();
  writeLinuxSetupLauncher();
  writeLinuxUpdaterLauncher();
  writeDataForgeModelInstaller();
  writeUmbraUiModelInstaller();
  writeUmbraUiSupportModelInstaller();
  writeModelRequirementsInstaller();
  writeDesktopFile();
  fs.writeFileSync(path.join(publishRoot, 'portable-mode'), 'portable linux webapp runtime enabled\n', 'utf-8');
  verifyPublish();
  if (isCleanRelease) verifyCleanPublishedUser();

  console.log(`[linux-publish] Linux portable folder build published: ${publishRoot}`);
}

publish();
