#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { isPrivateDevelopmentSource } from './release-source-policy.mjs';

const root = process.cwd();
const outputArgIndex = process.argv.indexOf('--output');
const outputValue = outputArgIndex >= 0 ? process.argv[outputArgIndex + 1] : process.env.UMBRA_REPOSITORY_SOURCE_ROOT;

if (!outputValue) {
  throw new Error('Choose a clean target with --output <folder> or UMBRA_REPOSITORY_SOURCE_ROOT.');
}

const outputRoot = path.resolve(outputValue);
const relativeToRoot = path.relative(root, outputRoot);
if (!relativeToRoot || (!relativeToRoot.startsWith('..') && !path.isAbsolute(relativeToRoot))) {
  throw new Error('Repository output must be outside the development source folder.');
}

const SOURCE_DIRECTORIES = [
  '.github',
  'backend',
  'defaults',
  'frontend',
  'gallery',
  'launcher',
  'scripts',
  'shared',
  'setup',
  'updater',
];

const SOURCE_FILES = [
  '.gitattributes',
  '.gitignore',
  'AGENTS.md',
  'bun.lock',
  'CHANGELOG.md',
  'Credits.md',
  'install-tools.bat',
  'install-tools.sh',
  'install.bat',
  'install.sh',
  'LICENSE',
  'manage-tools.ts',
  'NOTICE',
  'package.json',
  'PUBLISHING.md',
  'README.md',
  'REQUIREMENTS.md',
  'setup-tools.ts',
  'start_umbra.bat',
  'start_umbra.sh',
  'tsconfig.json',
  'UmbraServer.ts',
  'UmbraSetup.bat',
  'UmbraStudio',
  'UmbraStudio.bat',
  'UmbraUpdater.bat',
  'umbra-setup.sh',
  'umbra-updater.sh',
  'UMBRA_UI_TOUR.md',
];

const RUNTIME_SKELETON_LEAF_DIRECTORIES = [
  'Tools',
  'User/Cache',
  'User/CheckpointMetadata',
  'User/ComfyUI/input',
  'User/Config/UmbraRemote',
  'User/Config/UmbraUI',
  'User/DanbooruTags',
  'User/Datasets',
  'User/FontforWatermark',
  'User/Logs',
  'User/Models/DataForgeCaption',
  'User/Models/WaifuTagger',
  'User/Outputs',
  'User/PowerPrompter/API Workflows',
  'User/PowerPrompter/Backups/PPCards',
  'User/PowerPrompter/CSV/Characters',
  'User/PowerPrompter/CSV/tags',
  'User/PowerPrompter/Presets',
  'User/PowerPrompter/Prompts',
  'User/PowerPrompter/Wildcards',
  'User/PowerPrompter/Queue/History',
  'User/Recovery/Replaced Sources',
  'User/Temp',
  'User/Trash',
  'User/UmbraUI/Agent',
  'User/UmbraUI/InpaintProjects',
  'User/UmbraUI/Queue',
];

const USER_SKELETON_README = `# User Runtime Directory

This directory is intentionally empty in source control. Umbra Studio writes
user-owned configuration, datasets, models, outputs, Power Prompter files,
training jobs, and Umbra UI projects into the folders below at runtime.

Only placeholder files belong in the repository. Never commit personal media,
model weights, databases, API keys, generated outputs, or installed tools.

The top-level \`Models/\` directory is legacy and intentionally omitted. Umbra
models belong in \`User/Models/\`; ComfyUI models belong in
\`Tools/ComfyUI/models/\` after ComfyUI is installed.
`;

const SKIP_NAMES = new Set([
  '.bun-tmp',
  'tsconfig.tsbuildinfo',
  '.codex',
  '.git',
  '.tmp',
  '__pycache__',
  'dist',
  'dist-webapp',
  'node_modules',
  'public',
]);

function isTestSourceName(name) {
  return /\.test\./i.test(name) || /^test-.*\.(?:[cm]?[jt]sx?)$/i.test(name);
}

function isPrivateWildcardAuthoringScript(name) {
  return /^generate-.*wildcard.*\.mjs$/i.test(name);
}

function copyTree(source, target, allowGeneratedPublic = false) {
  if (isPrivateDevelopmentSource(path.relative(root, source))) return;
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) throw new Error(`Refusing to copy symlink into repository source: ${source}`);
  if (stat.isFile()) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const environmentFile = /^\.env(?:\.|$)/i.test(entry.name);
    if (
      environmentFile
      || isTestSourceName(entry.name)
      || isPrivateWildcardAuthoringScript(entry.name)
      || (SKIP_NAMES.has(entry.name) && !(allowGeneratedPublic && entry.name === 'public'))
    ) continue;
    copyTree(path.join(source, entry.name), path.join(target, entry.name), allowGeneratedPublic);
  }
}

function ensureEmptyOutput() {
  if (!fs.existsSync(outputRoot)) {
    fs.mkdirSync(outputRoot, { recursive: true });
    return;
  }
  if (fs.readdirSync(outputRoot).length > 0) {
    throw new Error(`Repository output is not empty: ${outputRoot}`);
  }
}

function writeRuntimeSkeleton() {
  for (const relativeDirectory of RUNTIME_SKELETON_LEAF_DIRECTORIES) {
    const target = path.join(outputRoot, relativeDirectory);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, '.gitkeep'), '', 'utf8');
  }
  fs.writeFileSync(path.join(outputRoot, 'User', 'README.md'), USER_SKELETON_README, 'utf8');
}

function verifyOutput() {
  const required = [
    'CHANGELOG.md',
    '.github/assets/nocturne-labs-icon.png',
    '.github/assets/nocturne-labs-banner.png',
    '.github/workflows/release.yml',
    'defaults/PowerPrompter/Prompts/Anime Girls Starter.ppcards.json',
    'defaults/PowerPrompter/Prompts/Intro to Powerprompter.ppcards.json',
    'defaults/PowerPrompter/Prompts/Krea 2 Art Starter.ppcards.json',
    'frontend/public/assets/UMBRA.ico',
    'scripts/build-webapp-folder.mjs',
    'scripts/build-linux-folder.mjs',
    'REQUIREMENTS.md',
    'UMBRA_UI_TOUR.md',
    'Tools/.gitkeep',
    'User/README.md',
    'User/Models/DataForgeCaption/.gitkeep',
    'User/Models/WaifuTagger/.gitkeep',
    'User/PowerPrompter/Prompts/.gitkeep',
    'User/UmbraUI/InpaintProjects/.gitkeep',
    'UmbraServer.ts',
  ];
  for (const relativePath of required) {
    if (!fs.existsSync(path.join(outputRoot, relativePath))) {
      throw new Error(`Clean repository source is missing ${relativePath}`);
    }
  }

  for (const forbidden of ['Models', 'Runtime', 'Umbra-Nodes', 'node_modules', 'public', 'dist-webapp', '.snapshots', 'defaults/PowerPrompter/Wildcards']) {
    if (fs.existsSync(path.join(outputRoot, forbidden))) {
      throw new Error(`Clean repository source contains forbidden runtime path: ${forbidden}`);
    }
  }
  if (fs.existsSync(path.join(outputRoot, 'User', 'Config', 'api-keys.json'))) {
    throw new Error('Clean repository source contains forbidden API credentials: User/Config/api-keys.json');
  }

  const allowedRuntimeFiles = new Set([
    'User/README.md',
    ...RUNTIME_SKELETON_LEAF_DIRECTORIES.map((directory) => `${directory}/.gitkeep`),
  ]);
  const unexpectedRuntimeFiles = [];
  for (const runtimeRoot of ['User', 'Tools']) {
    const walkRuntime = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walkRuntime(fullPath);
          continue;
        }
        const relativePath = path.relative(outputRoot, fullPath).split(path.sep).join('/');
        if (!entry.isFile() || !allowedRuntimeFiles.has(relativePath)) {
          unexpectedRuntimeFiles.push(relativePath);
        }
      }
    };
    walkRuntime(path.join(outputRoot, runtimeRoot));
  }
  if (unexpectedRuntimeFiles.length > 0) {
    throw new Error(`Clean repository source contains runtime data: ${unexpectedRuntimeFiles.join(', ')}`);
  }

  const oversized = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && fs.statSync(fullPath).size > 100 * 1024 * 1024) {
        oversized.push(path.relative(outputRoot, fullPath));
      }
    }
  };
  walk(outputRoot);
  if (oversized.length > 0) throw new Error(`Clean repository source contains files over 100 MB: ${oversized.join(', ')}`);

  const environmentFiles = [];
  const findEnvironmentFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) findEnvironmentFiles(fullPath);
      else if (entry.isFile() && /^\.env(?:\.|$)/i.test(entry.name)) {
        environmentFiles.push(path.relative(outputRoot, fullPath));
      }
    }
  };
  findEnvironmentFiles(outputRoot);
  if (environmentFiles.length > 0) {
    throw new Error(`Clean repository source contains environment files: ${environmentFiles.join(', ')}`);
  }

  const testFiles = [];
  const findTestFiles = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) findTestFiles(fullPath);
      else if (entry.isFile() && isTestSourceName(entry.name)) {
        testFiles.push(path.relative(outputRoot, fullPath));
      }
    }
  };
  findTestFiles(outputRoot);
  if (testFiles.length > 0) {
    throw new Error(`Clean repository source contains internal test files: ${testFiles.join(', ')}`);
  }

  const privateWildcardScripts = [];
  const scriptsRoot = path.join(outputRoot, 'scripts');
  for (const entry of fs.readdirSync(scriptsRoot, { withFileTypes: true })) {
    if (entry.isFile() && isPrivateWildcardAuthoringScript(entry.name)) {
      privateWildcardScripts.push(`scripts/${entry.name}`);
    }
  }
  if (privateWildcardScripts.length > 0) {
    throw new Error(`Clean repository source contains private wildcard authoring scripts: ${privateWildcardScripts.join(', ')}`);
  }
}

ensureEmptyOutput();
for (const directory of SOURCE_DIRECTORIES) {
  const source = path.join(root, directory);
  if (!fs.existsSync(source)) throw new Error(`Required source directory is missing: ${source}`);
  copyTree(source, path.join(outputRoot, directory), directory === 'frontend');
}
for (const file of SOURCE_FILES) {
  const source = path.join(root, file);
  if (!fs.existsSync(source)) throw new Error(`Required source file is missing: ${source}`);
  copyTree(source, path.join(outputRoot, file));
}
writeRuntimeSkeleton();
verifyOutput();
console.log(`[repository-source] Clean source is ready: ${outputRoot}`);
