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
const defaultPublishBase = path.join(os.homedir(), 'Applications', 'Umbra Studio');
const publishBaseRoot = process.env.UMBRA_LINUX_PUBLISH_ROOT
  ? path.resolve(process.env.UMBRA_LINUX_PUBLISH_ROOT)
  : process.env.UMBRA_PUBLISH_ROOT
    ? path.resolve(process.env.UMBRA_PUBLISH_ROOT)
    : defaultPublishBase;
const publishRoot = path.join(publishBaseRoot, `v${version}`);
const isCleanRelease = process.argv.includes('--clean-release')
  || process.env.UMBRA_WEBAPP_CLEAN_RELEASE === '1';
const bundleDataForgeModels = process.env.UMBRA_BUNDLE_DATA_FORGE_MODELS !== '0';

const PRESERVED_TOP_LEVEL = new Set(['User', 'Tools']);
const SEEDED_RUNTIME_TOP_LEVEL = new Set(['Tools']);
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
  const resolvedBase = path.resolve(publishBaseRoot);
  const resolvedTarget = path.resolve(publishRoot);
  if (path.basename(resolvedTarget) !== `v${version}` || !isInside(resolvedBase, resolvedTarget)) {
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

function resolveLatestRuntimeRoot() {
  const latestPath = path.join(publishBaseRoot, 'latest');
  try {
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
    console.log(`[linux-publish] Seeding ${name}/ from previous latest runtime: ${source}`);
    copyTree(source, target);
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

function updateLatestLink() {
  const latestPath = path.join(publishBaseRoot, 'latest');
  try {
    if (fs.existsSync(latestPath) || fs.lstatSync(latestPath)) fs.rmSync(latestPath, { force: true, recursive: true });
  } catch {
    // replace below
  }
  try {
    fs.symlinkSync(path.resolve(publishRoot), latestPath, 'dir');
  } catch {
    // non-fatal
  }
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
    'resources/app/defaults/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'resources/app/defaults/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'resources/app/defaults/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'resources/app/gallery/GalleryServer.ts',
    'resources/app/launcher/UmbraWebLauncher.ts',
    'resources/app/node_modules',
    'Runtime/Bun/linux/bun',
    'User/PowerPrompter/API Workflows/[Umbra UI] Stable Diffusion Image Pipeline.json',
    'User/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'User/PowerPrompter/Prompts/Intro to Powerprompter.ppcards.json',
    'User/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'install-data-forge-models.sh',
    'start-umbra.sh',
  ];
  for (const relativePath of required) {
    const targetPath = path.join(publishRoot, relativePath);
    if (!fs.existsSync(targetPath)) {
      throw new Error(`[linux-publish] Missing required runtime path: ${targetPath}`);
    }
  }
  if (bundleDataForgeModels) verifyBundledDataForgeModels();
}

function publish() {
  console.log(`[linux-publish] Publishing Linux folder build to ${publishRoot}`);
  console.log(isCleanRelease
    ? '[linux-publish] Clean release mode: wiping target version and shipping clean runtime skeletons.'
    : '[linux-publish] No-bump update mode: preserving existing User/ and Tools/ folders.');
  if (bundleDataForgeModels) {
    run('node', ['scripts/download-waifu-models.mjs'], 'Data Forge WD model preparation');
    run('node', ['scripts/download-caption-models.mjs'], 'Data Forge natural caption model preparation');
  } else {
    console.log('[linux-publish] GitHub-sized package mode: Data Forge model weights will be installed with install-data-forge-models.sh.');
  }

  if (isCleanRelease) safeWipePublishRoot();
  ensureDir(publishRoot);
  seedPersistentRuntimeStateFromLatest();

  run('bun', ['install'], 'dependency install');
  run('bun', ['run', 'webapp:prepare-runtime'], 'runtime preparation');
  run('bun', ['run', 'webapp:prepare-dependencies'], 'runtime dependency preparation');
  run('bun', ['run', 'build:frontend'], 'frontend build');
  run('bun', ['build', 'UmbraServer.ts', '--target=bun', '--outfile', path.join('dist-webapp', 'UmbraServer.js')], 'backend build');

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
  const umbraNodesSource = path.join(root, 'Umbra-Nodes');
  const umbraNodesTarget = path.join(publishRoot, 'Umbra-Nodes');
  if (fs.existsSync(path.join(umbraNodesSource, '__init__.py')) && fs.existsSync(path.join(umbraNodesSource, 'nodes.py'))) {
    copyTree(umbraNodesSource, umbraNodesTarget);
  } else if (fs.existsSync(umbraNodesTarget)
    && (!fs.existsSync(path.join(umbraNodesTarget, '__init__.py')) || !fs.existsSync(path.join(umbraNodesTarget, 'nodes.py')))) {
    safeRemoveInside(publishRoot, umbraNodesTarget);
  }

  try {
    fs.symlinkSync(path.join(publishRoot, 'Tools', 'ComfyUI', 'models'), path.join(publishRoot, 'ComfyUI-Models'), 'dir');
    fs.symlinkSync(path.join(publishRoot, 'Tools', 'ComfyUI', 'output'), path.join(publishRoot, 'ComfyUI-Output'), 'dir');
    fs.symlinkSync(path.join(publishRoot, 'Tools', 'ComfyUI', 'custom_nodes'), path.join(publishRoot, 'ComfyUI-Nodes'), 'dir');
  } catch {
    // Shortcuts are convenience only.
  }

  writeLinuxLauncher();
  writeDataForgeModelInstaller();
  writeDesktopFile();
  fs.writeFileSync(path.join(publishRoot, 'portable-mode'), 'portable linux webapp runtime enabled\n', 'utf-8');
  updateLatestLink();
  verifyPublish();

  console.log(`[linux-publish] Linux portable folder build published: ${publishRoot}`);
}

publish();
