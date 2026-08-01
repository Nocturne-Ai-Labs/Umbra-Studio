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
const hasExplicitPublishRoot = Boolean(process.env.UMBRA_PUBLISH_ROOT);
const publishRoot = process.env.UMBRA_PUBLISH_ROOT
  ? path.resolve(process.env.UMBRA_PUBLISH_ROOT)
  : defaultPublishRoot;
const isCleanRelease = process.argv.includes('--clean-release')
  || process.env.UMBRA_WEBAPP_CLEAN_RELEASE === '1';
const bundleDataForgeModels = process.env.UMBRA_BUNDLE_DATA_FORGE_MODELS !== '0';

const primaryWindowsLauncher = 'UmbraStudio.bat';

const PRESERVED_TOP_LEVEL = new Set(['User', 'Tools']);
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
  const resolvedTarget = path.resolve(publishRoot);
  if (
    !hasExplicitPublishRoot
    || path.basename(resolvedTarget).toLowerCase() !== 'umbra studio'
    || resolvedTarget === path.parse(resolvedTarget).root
  ) {
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
  const backupRoot = path.join(publishRoot, '.dirty-runtime-backups');
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

function windowsInstallerScript({ title, commands, successMessage }) {
  return `@echo off
setlocal EnableExtensions
title ${title}
set "APP_ROOT=%~dp0"
cd /d "%APP_ROOT%"
set "EXIT_CODE=0"
set "BUN_BIN=%APP_ROOT%Runtime\\Bun\\win32\\bun.exe"

echo ============================================================
echo ${title}
echo ============================================================
echo App root: %APP_ROOT%
echo.

if not exist "%BUN_BIN%" (
  echo [ERROR] The bundled Bun runtime is missing:
  echo         %BUN_BIN%
  echo.
  echo Your antivirus may have quarantined bun.exe. Repair or extract
  echo Umbra Studio again, then add the Umbra Studio folder as an exception.
  set "EXIT_CODE=2"
  goto :finish
)

"%BUN_BIN%" --version >nul 2>&1
if errorlevel 1 (
  echo [ERROR] The bundled Bun runtime exists but Windows could not start it:
  echo         %BUN_BIN%
  echo.
  echo Check Windows Security or third-party antivirus quarantine history.
  set "EXIT_CODE=3"
  goto :finish
)

${commands}
if errorlevel 1 (
  set "EXIT_CODE=%ERRORLEVEL%"
  echo.
  echo [ERROR] The installer stopped with exit code %ERRORLEVEL%.
  goto :finish
)

echo.
echo ${successMessage}

:finish
if not "%EXIT_CODE%"=="0" echo Installer exit code: %EXIT_CODE%
if "%~1"=="" (
  echo.
  echo Press any key to close this window.
  pause >nul
)
exit /b %EXIT_CODE%
`;
}

function writeDataForgeModelInstaller() {
  const installerPath = path.join(publishRoot, 'Install-Data-Forge-Models.bat');
  const script = windowsInstallerScript({
    title: 'Umbra Studio - Data Forge Model Installer',
    commands: `set "INSTALLER=%APP_ROOT%resources\\app\\scripts\\download-waifu-models.mjs"
if not exist "%INSTALLER%" (
  echo [ERROR] The Data Forge installer is missing:
  echo         %INSTALLER%
  set "EXIT_CODE=4"
  goto :finish
)
"%BUN_BIN%" "%INSTALLER%"
if errorlevel 1 (
  set "EXIT_CODE=%ERRORLEVEL%"
  goto :finish
)
set "INSTALLER=%APP_ROOT%resources\\app\\scripts\\download-caption-models.mjs"
if not exist "%INSTALLER%" (
  echo [ERROR] The Data Forge caption installer is missing:
  echo         %INSTALLER%
  set "EXIT_CODE=4"
  goto :finish
)
"%BUN_BIN%" "%INSTALLER%"
`,
    successMessage: 'Data Forge models are ready.',
  });
  fs.writeFileSync(installerPath, script, 'utf-8');
}

function writeUmbraUiModelInstaller() {
  const installerPath = path.join(publishRoot, 'Install-Umbra-UI-Models.bat');
  const script = windowsInstallerScript({
    title: 'Umbra Studio - Model Requirements Installer',
    commands: `set "INSTALLER=%APP_ROOT%resources\\app\\scripts\\download-umbra-model-requirements.mjs"
if not exist "%INSTALLER%" (
  echo [ERROR] The model requirements installer is missing:
  echo         %INSTALLER%
  set "EXIT_CODE=4"
  goto :finish
)
"%BUN_BIN%" "%INSTALLER%" %*`,
    successMessage: 'Umbra UI model requirements are ready.',
  });
  fs.writeFileSync(installerPath, script, 'utf-8');
}

function writeUmbraUiSupportModelInstaller() {
  const installerPath = path.join(publishRoot, 'Install-Umbra-UI-Support-Models.bat');
  const script = windowsInstallerScript({
    title: 'Umbra Studio - Support Model Installer',
    commands: `set "INSTALLER=%APP_ROOT%resources\\app\\scripts\\download-umbra-ui-models.mjs"
if not exist "%INSTALLER%" (
  echo [ERROR] The support-model installer is missing:
  echo         %INSTALLER%
  set "EXIT_CODE=4"
  goto :finish
)
"%BUN_BIN%" "%INSTALLER%" --profile core %*`,
    successMessage: 'Umbra UI support models are ready.',
  });
  fs.writeFileSync(installerPath, script, 'utf-8');
}

function writeModelRequirementsInstaller() {
  const installerPath = path.join(publishRoot, 'Install-Model-Requirements.bat');
  const script = windowsInstallerScript({
    title: 'Umbra Studio - Model Requirements Installer',
    commands: `set "INSTALLER=%APP_ROOT%resources\\app\\scripts\\download-umbra-model-requirements.mjs"
if not exist "%INSTALLER%" (
  echo [ERROR] The model requirements installer is missing:
  echo         %INSTALLER%
  set "EXIT_CODE=4"
  goto :finish
)
"%BUN_BIN%" "%INSTALLER%" %*`,
    successMessage: 'Model requirements are ready.',
  });
  fs.writeFileSync(installerPath, script, 'utf-8');
}

function verifyCleanPublishedUser() {
  const userPath = path.join(publishRoot, 'User');
  const dirtyPaths = [
    'User/Config/api-keys.json',
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

function removeLegacyRootShortcut(linkPath) {
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink()) {
      safeRemoveInside(publishRoot, linkPath);
    }
  } catch {
    // Missing entries and real directories are intentionally left alone.
  }
}

function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) {
    throw new Error(`[webapp-publish] ${label} failed with status ${result.status ?? 1}`);
  }
}

function removeRedundantLaunchers() {
  for (const relativePath of ['Start-Umbra.bat', 'UmbraStudio.bat', 'UmbraStudio.exe', 'start-umbra.sh']) {
    const target = path.join(publishRoot, relativePath);
    if (fs.existsSync(target)) safeRemoveInside(publishRoot, target);
  }
}

function writePortableMarker() {
  fs.writeFileSync(path.join(publishRoot, 'portable-mode'), 'portable webapp runtime enabled\n', 'utf-8');
}

function writeUmbraStudioBatchLauncher() {
  const launcherPath = path.join(publishRoot, 'UmbraStudio.bat');
  const script = `@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\\Runtime\\Bun\\win32\\bun.exe"
set "WEB_LAUNCHER=%CD%\\resources\\app\\launcher\\UmbraWebLauncher.ts"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  pause
  exit /b 1
)
if not exist "%WEB_LAUNCHER%" (
  echo [ERROR] Umbra Studio launcher is missing: %WEB_LAUNCHER%
  pause
  exit /b 1
)
"%BUN_BIN%" "%WEB_LAUNCHER%" --root "%CD%" %*
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" pause
exit /b %EXIT_CODE%
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
}

function writeUmbraUpdaterLauncher() {
  const launcherPath = path.join(publishRoot, 'UmbraUpdater.bat');
  const script = `@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\\Runtime\\Bun\\win32\\bun.exe"
set "UPDATER_BOOTSTRAP=%CD%\\resources\\app\\launcher\\UmbraUpdaterBootstrap.js"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  pause
  exit /b 1
)
if not exist "%UPDATER_BOOTSTRAP%" (
  echo [ERROR] Standalone updater is missing: %UPDATER_BOOTSTRAP%
  pause
  exit /b 1
)
"%BUN_BIN%" "%UPDATER_BOOTSTRAP%" --root "%CD%"
if errorlevel 1 pause
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
}

function writeUmbraSetupLauncher() {
  const launcherPath = path.join(publishRoot, 'UmbraSetup.bat');
  const script = `@echo off
setlocal
cd /d "%~dp0"
set "BUN_BIN=%CD%\\Runtime\\Bun\\win32\\bun.exe"
set "SETUP_APP=%CD%\\resources\\app\\setup\\UmbraSetupApp.js"
if not exist "%BUN_BIN%" (
  echo [ERROR] Bundled Bun runtime is missing: %BUN_BIN%
  pause
  exit /b 1
)
if not exist "%SETUP_APP%" (
  echo [ERROR] Standalone setup utility is missing: %SETUP_APP%
  pause
  exit /b 1
)
"%BUN_BIN%" "%SETUP_APP%" --root "%CD%"
if errorlevel 1 pause
`;
  fs.writeFileSync(launcherPath, script, 'utf-8');
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
    'resources/app/defaults/UmbraUI/model-requirements-manifest.json',
    'resources/app/defaults/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'resources/app/defaults/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'resources/app/defaults/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'resources/app/gallery/GalleryServer.ts',
    'resources/app/launcher/UmbraWebLauncher.ts',
    'resources/app/shared/umbraUpdaterWorkspace.ts',
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
    'Runtime/Bun/win32/bun.exe',
    'User/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'User/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'User/PowerPrompter/Prompts/Intro to Powerprompter.ppcards.json',
    'User/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'Install-Data-Forge-Models.bat',
    'Install-Umbra-UI-Models.bat',
    'Install-Umbra-UI-Support-Models.bat',
    'Install-Model-Requirements.bat',
    primaryWindowsLauncher,
    'UmbraSetup.bat',
    'UmbraUpdater.bat',
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
  if (fs.existsSync(path.join(publishRoot, 'Umbra-Nodes'))) {
    throw new Error('[webapp-publish] Bundled Umbra-Nodes payload must not be present; setup installs it from GitHub.');
  }
  if (fs.existsSync(path.join(publishRoot, 'UmbraStudio.exe'))) {
    throw new Error('[webapp-publish] BAT-only Windows packages must not include UmbraStudio.exe.');
  }
  if (bundleDataForgeModels) verifyBundledDataForgeModels();
}

function publish() {
  if (isCleanRelease) {
    safeWipePublishRoot();
  }
  ensureDir(publishRoot);
  console.log(`[webapp-publish] Publishing webapp build to ${publishRoot}`);
  console.log('[webapp-publish] Windows launcher: UmbraStudio.bat.');
  console.log(isCleanRelease
    ? '[webapp-publish] Clean release mode: wiping the explicit package root and shipping clean runtime skeletons.'
    : '[webapp-publish] No-bump update mode: preserving existing User/ and Tools/ folders.');
  if (bundleDataForgeModels) {
    run('node', ['scripts/download-waifu-models.mjs'], 'Data Forge WD model preparation');
    run('node', ['scripts/download-caption-models.mjs'], 'Data Forge natural caption model preparation');
  } else {
    console.log('[webapp-publish] GitHub-sized package mode: Data Forge model weights will be installed with Install-Data-Forge-Models.bat.');
  }
  removeEmptyTopLevelModelsFolder();
  removeLegacyDesktopArtifacts();
  removeRedundantLaunchers();

  run('bun', ['run', 'webapp:prepare-runtime'], 'runtime preparation');
  run('bun', ['run', 'webapp:prepare-dependencies'], 'runtime dependency preparation');
  run('bun', ['run', 'build:frontend'], 'frontend build');
  run('bun', ['build', 'UmbraServer.ts', '--target=bun', '--outfile', path.join('dist-webapp', 'UmbraServer.js')], 'backend build');
  run('bun', ['run', 'webapp:build-updater'], 'standalone updater build');
  run('bun', ['run', 'webapp:build-setup'], 'standalone setup build');

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

  copyTree(path.join(root, 'public'), path.join(publishRoot, 'public'));
  copyTree(path.join(root, 'public'), path.join(packagedAppDir, 'public'));
  copyNodeModules(
    path.join(root, 'dist-webapp', 'runtime-dependencies', `${process.platform}-${process.arch}`, 'node_modules'),
    path.join(packagedAppDir, 'node_modules'),
  );
  copyTree(path.join(root, 'Runtime'), path.join(publishRoot, 'Runtime'));
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
    prepareCleanPublishedUser();
  } else {
    console.log('[webapp-publish] Existing User/ preserved for no-bump update.');
    ensureBundledUmbraUiWorkflows();
    ensureBundledPowerPrompterStarterCards();
  }
  if (bundleDataForgeModels) seedBundledDataForgeModels();
  else prepareDataForgeModelDestination();
  ensureDir(path.join(publishRoot, 'Tools'));
  const umbraNodesTarget = path.join(publishRoot, 'Umbra-Nodes');
  if (fs.existsSync(umbraNodesTarget)) safeRemoveInside(publishRoot, umbraNodesTarget);

  for (const name of ['ComfyUI-Models', 'ComfyUI-Output', 'ComfyUI-Nodes']) {
    removeLegacyRootShortcut(path.join(publishRoot, name));
  }

  writeDataForgeModelInstaller();
  writeUmbraUiModelInstaller();
  writeUmbraUiSupportModelInstaller();
  writeModelRequirementsInstaller();
  writeUmbraStudioBatchLauncher();
  writeUmbraSetupLauncher();
  writeUmbraUpdaterLauncher();
  writePortableMarker();
  verifyPublish();
  if (isCleanRelease) verifyCleanPublishedUser();

  console.log(`[webapp-publish] Webapp portable build published: ${publishRoot}`);
}

publish();
