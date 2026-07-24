#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';

const root = process.cwd();
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
const version = pkg.version;
const preferredAppsRoot = path.join('D:', 'Development', 'Apps', 'Umbra Studio');
const defaultPublishRoot = fs.existsSync(path.join('D:', 'Development', 'Apps'))
  ? preferredAppsRoot
  : path.join(process.env.HOME || process.env.USERPROFILE || '~', 'Documents', 'Umbra Studio');
const publishBaseRoot = process.env.UMBRA_PUBLISH_ROOT
  ? path.resolve(process.env.UMBRA_PUBLISH_ROOT)
  : defaultPublishRoot;
const publishFolderVersion = String(process.env.UMBRA_PUBLISH_FOLDER_VERSION || version).trim();
if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(publishFolderVersion)) {
  throw new Error(`[webapp-publish] Invalid UMBRA_PUBLISH_FOLDER_VERSION: ${publishFolderVersion}`);
}
const publishRoot = path.join(publishBaseRoot, `v${publishFolderVersion}`);
const isCleanRelease = process.argv.includes('--clean-release')
  || process.env.UMBRA_WEBAPP_CLEAN_RELEASE === '1';
const bundleDataForgeModels = process.env.UMBRA_BUNDLE_DATA_FORGE_MODELS !== '0';

const PRESERVED_TOP_LEVEL = new Set(['User', 'Tools']);
const SEEDED_RUNTIME_TOP_LEVEL = new Set(['Tools']);
const LEGACY_DESKTOP_NAME = ['elec', 'tron'].join('');
const LEGACY_DESKTOP_ROOT_ARTIFACTS = [
  'chrome_100_percent.pak',
  'chrome_200_percent.pak',
  'd3dcompiler_47.dll',
  'dxcompiler.dll',
  'dxil.dll',
  'ffmpeg.dll',
  'icudtl.dat',
  'libEGL.dll',
  'libGLESv2.dll',
  `LICENSE.${LEGACY_DESKTOP_NAME}.txt`,
  'LICENSES.chromium.html',
  'locales',
  'resources.pak',
  'snapshot_blob.bin',
  'v8_context_snapshot.bin',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll',
];
const SKIP_SOURCE_DIRS = new Set([
  '.git',
  '.snapshots',
  '.bun-tmp',
  `dist-${LEGACY_DESKTOP_NAME}`,
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

function hashText(value) {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 16);
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
    throw new Error(`[webapp-publish] Refusing to remove outside target root: ${resolvedTarget}`);
  }
  const topRelative = path.relative(resolvedParent, resolvedTarget).split(path.sep).filter(Boolean)[0] || '';
  if (PRESERVED_TOP_LEVEL.has(topRelative)) {
    throw new Error(`[webapp-publish] Refusing to remove preserved runtime path: ${resolvedTarget}`);
  }
  fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}

function safeWipePublishRoot() {
  const resolvedBase = path.resolve(publishBaseRoot);
  const resolvedTarget = path.resolve(publishRoot);
  const expectedName = `v${version}`;
  if (path.basename(resolvedTarget) !== expectedName || !isInside(resolvedBase, resolvedTarget)) {
    throw new Error(`[webapp-publish] Refusing to wipe unsafe publish root: ${resolvedTarget}`);
  }
  if (fs.existsSync(resolvedTarget)) {
    console.log(`[webapp-publish] Clean release wipe: ${resolvedTarget}`);
    fs.rmSync(resolvedTarget, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

function isDirectoryEmptyRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return true;
  const stats = fs.lstatSync(dirPath);
  if (!stats.isDirectory()) return false;
  for (const entry of fs.readdirSync(dirPath)) {
    const child = path.join(dirPath, entry);
    const childStats = fs.lstatSync(child);
    if (childStats.isDirectory()) {
      if (!isDirectoryEmptyRecursive(child)) return false;
    } else {
      return false;
    }
  }
  return true;
}

function removeEmptyTopLevelModelsFolder() {
  const target = path.join(publishRoot, 'Models');
  if (!fs.existsSync(target)) return;
  if (!isDirectoryEmptyRecursive(target)) {
    console.log('[webapp-publish] Existing Models/ contains files; leaving it untouched.');
    return;
  }
  console.log('[webapp-publish] Removing empty legacy Models/ folder.');
  safeRemoveInside(publishRoot, target);
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
    fs.cpSync(realSource, target, { force: true, recursive: false });
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
    if (targetStats.isFile()
      && targetStats.size === stats.size
      && targetStats.mtimeMs >= stats.mtimeMs - 1000) {
      return;
    }
  }

  ensureDir(path.dirname(target));
  fs.cpSync(source, target, { force: true, recursive: false, dereference: true });
}

function copyExplicitFile(source, target) {
  if (!fs.existsSync(source)) return;
  const sourceStats = fs.statSync(source);
  if (fs.existsSync(target)) {
    const targetStats = fs.statSync(target);
    if (targetStats.isFile()
      && targetStats.size === sourceStats.size
      && targetStats.mtimeMs >= sourceStats.mtimeMs - 1000) {
      return;
    }
  }
  ensureDir(path.dirname(target));
  fs.cpSync(source, target, { force: true, recursive: false, dereference: true });
}

function hasInstalledRuntimeDependencies(target) {
  const dependencies = Array.isArray(pkg.umbraRuntimeDependencies)
    ? pkg.umbraRuntimeDependencies
    : [];
  return dependencies.length > 0 && dependencies.every((name) => fs.existsSync(path.join(target, name)));
}

function copyNodeModules(source, target) {
  if (!fs.existsSync(source)) return;

  const stamp = dependencyStamp();
  const stampPath = path.join(target, '.umbra-publish-stamp.json');
  if (fs.existsSync(target)) {
    try {
      const current = JSON.parse(fs.readFileSync(stampPath, 'utf-8'));
      if (current?.dependencyStamp === stamp && hasInstalledRuntimeDependencies(target)) {
        console.log('[webapp-publish] node_modules unchanged; keeping existing runtime copy.');
        return;
      }
    } catch {
      if (hasInstalledRuntimeDependencies(target)) {
        fs.writeFileSync(stampPath, JSON.stringify({ dependencyStamp: stamp, adoptedAt: new Date().toISOString() }, null, 2), 'utf-8');
        console.log('[webapp-publish] node_modules already present; adopted existing runtime copy.');
        return;
      }
    }
  }

  if (fs.existsSync(target)) safeRemoveInside(publishRoot, target);
  copyTree(source, target, { allowSkippedSource: true });
  ensureDir(target);
  fs.writeFileSync(stampPath, JSON.stringify({ dependencyStamp: stamp, updatedAt: new Date().toISOString() }, null, 2), 'utf-8');
}

function copyMissingTree(source, target) {
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  copyTree(source, target);
}

function timestampForPath() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function moveToDirtyRuntimeBackup(targetPath, label) {
  if (!fs.existsSync(targetPath)) return;
  const backupRoot = path.join(publishBaseRoot, '.dirty-runtime-backups');
  ensureDir(backupRoot);
  let backupPath = path.join(backupRoot, `v${version}-${label}-${timestampForPath()}`);
  let suffix = 1;
  while (fs.existsSync(backupPath)) {
    backupPath = path.join(backupRoot, `v${version}-${label}-${timestampForPath()}-${suffix}`);
    suffix += 1;
  }
  fs.renameSync(targetPath, backupPath);
  console.log(`[webapp-publish] Moved dirty runtime ${label} to backup: ${backupPath}`);
}

function sanitizeCleanPublishedUserRuntime(userPath) {
  const dirtyRelativePaths = [
    'BrowserData',
    'Config',
    'Gallery',
    'Logs',
    'Outputs',
    'PowerPrompter/Queue',
    'Training',
    '.thumbnails',
  ];

  for (const relativePath of dirtyRelativePaths) {
    const target = path.join(userPath, relativePath);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
}

function prepareCleanPublishedUser() {
  const userPath = path.join(publishRoot, 'User');
  sanitizeCleanPublishedUserRuntime(userPath);

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

function seedBundledDataForgeModels() {
  const modelFamilies = ['WaifuTagger', 'DataForgeCaption'];
  for (const family of modelFamilies) {
    const sourcePath = path.join(root, 'User', 'Models', family);
    if (!fs.existsSync(sourcePath)) {
      throw new Error(`[webapp-publish] Required Data Forge model folder is missing: ${sourcePath}`);
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
  const installerPath = path.join(publishRoot, 'Install-Data-Forge-Models.bat');
  const script = `@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\\Runtime\\Bun\\win32\\bun.exe"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  exit /b 1
)
"%BUN_BIN%" "%CD%\\resources\\app\\scripts\\download-waifu-models.mjs" || exit /b 1
"%BUN_BIN%" "%CD%\\resources\\app\\scripts\\download-caption-models.mjs" || exit /b 1
echo Data Forge models are ready.
`;
  fs.writeFileSync(installerPath, script, 'utf-8');
}

function writeUmbraUiModelInstaller() {
  const installerPath = path.join(publishRoot, 'Install-Umbra-UI-Models.bat');
  const script = `@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\\Runtime\\Bun\\win32\\bun.exe"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  exit /b 1
)
"%BUN_BIN%" "%CD%\\resources\\app\\scripts\\download-umbra-ui-models.mjs" %* || exit /b 1
echo Umbra UI support models are ready.
`;
  fs.writeFileSync(installerPath, script, 'utf-8');
}

function verifyCleanPublishedUser() {
  const userPath = path.join(publishRoot, 'User');
  const dirtyPaths = [
    'User/Config/settings.json',
    'User/Config/umbra-user-settings.json',
    'User/Config/GalleryDb.db',
    'User/Config/GalleryDb.db-shm',
    'User/Config/GalleryDb.db-wal',
    'User/PowerPrompter/Queue',
    'User/Logs/powerprompter-queue-2026-05-17.jsonl',
  ];

  const found = dirtyPaths.filter((relativePath) => fs.existsSync(path.join(publishRoot, relativePath)));
  const queueLogsDir = path.join(publishRoot, 'User', 'Logs');
  if (fs.existsSync(queueLogsDir)) {
    for (const entry of fs.readdirSync(queueLogsDir)) {
      if (/^powerprompter-queue-.*\.jsonl$/i.test(entry)) {
        found.push(`User/Logs/${entry}`);
      }
    }
  }
  if (found.length > 0) {
    throw new Error(`[webapp-publish] Dirty runtime state present in published build: ${found.join(', ')}`);
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
  const visit = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, entry);
      const stats = fs.lstatSync(fullPath);
      if (stats.isDirectory()) {
        visit(fullPath);
        continue;
      }
      const relativePath = path.relative(userPath, fullPath);
      if (!allowedUserFile(relativePath)) {
        unexpectedFiles.push(`User/${relativePath.split(path.sep).join('/')}`);
      }
    }
  };
  visit(userPath);
  if (unexpectedFiles.length > 0) {
    throw new Error(`[webapp-publish] Unexpected User/ files in clean release: ${unexpectedFiles.join(', ')}`);
  }
}

function createShortcutLink(linkPath, targetPath) {
  ensureDir(targetPath);
  try {
    if (fs.existsSync(linkPath) || fs.lstatSync(linkPath)) {
      const current = fs.lstatSync(linkPath);
      if (current.isDirectory() && !current.isSymbolicLink()) return;
      safeRemoveInside(publishRoot, linkPath);
    }
  } catch {
    // Missing or broken link, replace below.
  }
  try {
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(path.resolve(targetPath), linkPath, type);
  } catch {
    // Shortcuts are convenience only.
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    throw new Error(`[webapp-publish] ${label} failed with status ${result.status ?? 1}`);
  }
}

function runNodeScript(args, label) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    throw new Error(`[webapp-publish] ${label} failed with status ${result.status ?? 1}`);
  }
}

function updateLatestLink() {
  const latestLinkPath = path.join(publishBaseRoot, 'latest');
  try {
    if (fs.existsSync(latestLinkPath) || fs.lstatSync(latestLinkPath)) {
      const current = fs.lstatSync(latestLinkPath);
      if (current.isSymbolicLink()) fs.rmSync(latestLinkPath, { force: true });
      else return;
    }
  } catch {
    // Broken link: replace it.
  }
  try {
    fs.symlinkSync(path.resolve(publishRoot), latestLinkPath, process.platform === 'win32' ? 'junction' : 'dir');
  } catch {
    // Non-fatal.
  }
}

function resolveLatestRuntimeRoot() {
  const latestPath = path.join(publishBaseRoot, 'latest');
  try {
    if (!fs.existsSync(latestPath)) return null;
    const resolved = fs.realpathSync(latestPath);
    if (path.resolve(resolved) === path.resolve(publishRoot)) return null;
    if (!isInside(publishBaseRoot, resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

function seedPersistentRuntimeStateFromLatest() {
  if (isCleanRelease) return;
  const latestRoot = resolveLatestRuntimeRoot();
  if (!latestRoot) return;

  for (const name of SEEDED_RUNTIME_TOP_LEVEL) {
    const source = path.join(latestRoot, name);
    const target = path.join(publishRoot, name);
    if (!fs.existsSync(source) || fs.existsSync(target)) continue;
    console.log(`[webapp-publish] Seeding ${name}/ from previous latest runtime: ${source}`);
    copyTree(source, target);
  }
}

function writeWindowsLauncher() {
  const launcherPath = path.join(publishRoot, 'Start-Umbra.bat');
  const script = `@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=Runtime\\Bun\\win32\\bun.exe"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime missing: %BUN_BIN%
  pause
  exit /b 1
)
set "UMBRA_ROOT=%~dp0"
set "UMBRA_TERMINAL_MODE=visible"
set "UMBRA_LAUNCHER_IN_TERMINAL=1"
set "UMBRA_ALREADY_RUNNING_EXIT_CODE=64"
"%BUN_BIN%" "resources\\app\\launcher\\UmbraWebLauncher.ts" %*
set "UMBRA_EXIT=%ERRORLEVEL%"
if "%UMBRA_EXIT%"=="64" exit /b 0
echo.
echo [Umbra] Launcher closed with exit code %UMBRA_EXIT%.
echo Press any key to close this terminal.
pause >nul
exit /b %UMBRA_EXIT%
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
  fs.copyFileSync(launcherPath, path.join(publishRoot, 'UmbraStudio.bat'));
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
  try {
    fs.chmodSync(launcherPath, 0o755);
  } catch {
    // ignore chmod failures on Windows
  }
}

function writePortableMarker() {
  fs.writeFileSync(path.join(publishRoot, 'portable-mode'), 'portable webapp runtime enabled\n', 'utf-8');
}

function removeLegacyDesktopArtifacts() {
  for (const relativePath of LEGACY_DESKTOP_ROOT_ARTIFACTS) {
    const target = path.join(publishRoot, relativePath);
    if (!fs.existsSync(target)) continue;
    safeRemoveInside(publishRoot, target);
  }
}

function verifyBundledDataForgeModels() {
  const manifestPath = path.join(root, 'defaults', 'DataForge', 'model-manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  for (const model of manifest.models || []) {
    for (const expected of model.files || []) {
      const targetPath = path.join(publishRoot, 'User', 'Models', model.family, model.folder, expected.path);
      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size !== expected.bytes) {
        throw new Error(`[webapp-publish] Missing or incomplete bundled model file: ${targetPath}`);
      }
    }
  }
}

function verifyPublish() {
  const required = [
    'public/index.html',
    'resources/app/public/index.html',
    'resources/app/UmbraServer.js',
    'resources/app/UmbraServer.ts',
    'resources/app/backend',
    'resources/app/defaults/DataForge/model-manifest.json',
    'resources/app/defaults/UmbraUI/model-manifest.json',
    'resources/app/defaults/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'resources/app/defaults/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'resources/app/defaults/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'resources/app/gallery/GalleryServer.ts',
    'resources/app/launcher/UmbraWebLauncher.ts',
    'resources/app/node_modules',
    'Runtime/Bun/win32/bun.exe',
    'User/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'User/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'User/PowerPrompter/Prompts/Intro to Powerprompter.ppcards.json',
    'User/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'Install-Data-Forge-Models.bat',
    'Install-Umbra-UI-Models.bat',
    'Start-Umbra.bat',
    'UmbraStudio.bat',
  ];
  if (bundleDataForgeModels) {
    required.push(
      'User/Models/WaifuTagger/wd-vit-tagger-v3/model.onnx',
      'User/Models/WaifuTagger/wd-convnext-tagger-v3/model.onnx',
      'User/Models/WaifuTagger/wd-eva02-large-tagger-v3/model.onnx',
      'User/Models/WaifuTagger/wd-swinv2-tagger-v3/model.onnx',
      'User/Models/DataForgeCaption/Qwen2-VL-2B-Abliterated-Caption-it/model.safetensors',
    );
  }
  for (const relativePath of required) {
    const targetPath = path.join(publishRoot, relativePath);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`[webapp-publish] Missing required runtime path: ${targetPath}`);
    }
  }
  if (bundleDataForgeModels) verifyBundledDataForgeModels();
}

function publish() {
  if (isCleanRelease) {
    safeWipePublishRoot();
  }
  ensureDir(publishRoot);
  console.log(`[webapp-publish] Publishing webapp build to ${publishRoot}`);
  console.log(isCleanRelease
    ? '[webapp-publish] Clean release mode: wiping target version and shipping clean runtime skeletons.'
    : '[webapp-publish] No-bump update mode: preserving existing User/ and Tools/ folders.');
  if (bundleDataForgeModels) {
    run('node', ['scripts/download-waifu-models.mjs'], 'Data Forge WD model preparation');
    run('node', ['scripts/download-caption-models.mjs'], 'Data Forge natural caption model preparation');
  } else {
    console.log('[webapp-publish] GitHub-sized package mode: Data Forge model weights will be installed with Install-Data-Forge-Models.bat.');
  }
  seedPersistentRuntimeStateFromLatest();
  removeEmptyTopLevelModelsFolder();
  removeLegacyDesktopArtifacts();

  run('bun', ['run', 'webapp:prepare-runtime'], 'runtime preparation');
  run('bun', ['run', 'webapp:prepare-dependencies'], 'runtime dependency preparation');
  run('bun', ['run', 'build:frontend'], 'frontend build');
  run('bun', ['build', 'UmbraServer.ts', '--target=bun', '--outfile', path.join('dist-webapp', 'UmbraServer.js')], 'backend build');
  run('bun', ['run', 'webapp:build-launcher'], 'launcher build');

  for (const relativePath of ['public', path.join('resources', 'app', 'public')]) {
    const target = path.join(publishRoot, relativePath);
    if (fs.existsSync(target)) safeRemoveInside(publishRoot, target);
  }

  const packagedAppDir = path.join(publishRoot, 'resources', 'app');
  ensureDir(packagedAppDir);
  const staleManagedPaths = [
    path.join(packagedAppDir, 'frontend', 'node_modules'),
    path.join(packagedAppDir, LEGACY_DESKTOP_NAME),
  ];
  for (const target of staleManagedPaths) {
    if (fs.existsSync(target)) safeRemoveInside(publishRoot, target);
  }

  const appTargets = [
    'backend',
    'gallery',
    'launcher',
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

  copyTree(path.join(root, 'public'), path.join(publishRoot, 'public'));
  copyTree(path.join(root, 'public'), path.join(packagedAppDir, 'public'));
  copyNodeModules(
    path.join(root, 'dist-webapp', 'runtime-dependencies', `${process.platform}-${process.arch}`, 'node_modules'),
    path.join(packagedAppDir, 'node_modules'),
  );
  copyTree(path.join(root, 'Runtime'), path.join(publishRoot, 'Runtime'));
  copyExplicitFile(path.join(root, 'dist-webapp', 'UmbraStudio.exe'), path.join(publishRoot, 'UmbraStudio.exe'));
  runNodeScript(['scripts/patch-windows-exe-icon.mjs', path.join(publishRoot, 'UmbraStudio.exe')], 'published launcher icon patch');
  copyExplicitFile(path.join(root, 'dist-webapp', 'UmbraServer.js'), path.join(packagedAppDir, 'UmbraServer.js'));

  for (const file of ['Credits.md', 'LICENSE', 'NOTICE']) {
    copyTree(path.join(root, file), path.join(publishRoot, file));
  }

  if (isCleanRelease || !fs.existsSync(path.join(publishRoot, 'User'))) {
    prepareCleanPublishedUser();
  } else {
    console.log('[webapp-publish] Existing User/ preserved for no-bump update.');
    ensureBundledUmbraUiWorkflows();
    ensureBundledPowerPrompterStarterCards();
  }
  if (bundleDataForgeModels) seedBundledDataForgeModels();
  else prepareDataForgeModelDestination();
  ensureDir(path.join(publishRoot, 'Tools'));
  const umbraNodesSource = path.join(root, 'Umbra-Nodes');
  const umbraNodesTarget = path.join(publishRoot, 'Umbra-Nodes');
  if (fs.existsSync(path.join(umbraNodesSource, '__init__.py')) && fs.existsSync(path.join(umbraNodesSource, 'nodes.py'))) {
    copyTree(umbraNodesSource, umbraNodesTarget);
  } else if (fs.existsSync(umbraNodesTarget)
    && (!fs.existsSync(path.join(umbraNodesTarget, '__init__.py')) || !fs.existsSync(path.join(umbraNodesTarget, 'nodes.py')))) {
    safeRemoveInside(publishRoot, umbraNodesTarget);
  }

  createShortcutLink(path.join(publishRoot, 'ComfyUI-Models'), path.join(publishRoot, 'Tools', 'ComfyUI', 'models'));
  createShortcutLink(path.join(publishRoot, 'ComfyUI-Output'), path.join(publishRoot, 'Tools', 'ComfyUI', 'output'));
  createShortcutLink(path.join(publishRoot, 'ComfyUI-Nodes'), path.join(publishRoot, 'Tools', 'ComfyUI', 'custom_nodes'));

  writeWindowsLauncher();
  writeLinuxLauncher();
  writeDataForgeModelInstaller();
  writeUmbraUiModelInstaller();
  writePortableMarker();
  updateLatestLink();
  verifyPublish();
  if (isCleanRelease) verifyCleanPublishedUser();

  console.log(`[webapp-publish] Webapp portable build published: ${publishRoot}`);
}

publish();
