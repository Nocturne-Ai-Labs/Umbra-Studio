#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_ROOT = (
  path.basename(APP_ROOT).toLowerCase() === 'app'
  && path.basename(path.dirname(APP_ROOT)).toLowerCase() === 'resources'
)
  ? path.dirname(path.dirname(APP_ROOT))
  : APP_ROOT;
const MANIFEST_PATH = path.join(APP_ROOT, 'defaults', 'UmbraUI', 'model-requirements-manifest.json');
const DOWNLOADER_PATH = path.join(APP_ROOT, 'scripts', 'download-umbra-ui-models.mjs');

function readValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = String(process.argv[index + 1] || '').trim();
    if (value) values.push(...value.split(',').map(entry => entry.trim()).filter(Boolean));
  }
  return values;
}

const requestedFamilies = [...readValues('--family'), ...readValues('--profile')];
const installAllFamilies = process.argv.includes('--all');
const listOnly = process.argv.includes('--list');
const checkOnly = process.argv.includes('--check');
const testDownloads = process.argv.includes('--test-downloads');
const assumeYes = process.argv.includes('--yes');
const comfyRootArgIndex = process.argv.indexOf('--comfy-root');
const comfyRoot = path.resolve(
  comfyRootArgIndex >= 0
    ? String(process.argv[comfyRootArgIndex + 1] || '').trim()
    : process.env.UMBRA_COMFYUI_ROOT || path.join(RUNTIME_ROOT, 'Tools', 'ComfyUI'),
);

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

function loadManifest() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  if (manifest?.schemaVersion !== 1 || !manifest?.profiles || !Array.isArray(manifest?.models)) {
    throw new Error('The model requirements manifest is invalid.');
  }
  return manifest;
}

function printFamilies(manifest) {
  console.log('\nUmbra Studio model requirements');
  console.log('Choose only the prerequisite resources for model families you plan to use.');
  console.log('Base checkpoints and diffusion models are never downloaded by this tool.\n');
  Object.entries(manifest.profiles).forEach(([id, profile], index) => {
    const models = manifest.models.filter(model => model.profiles.includes(id));
    const bytes = models.flatMap(model => model.files).reduce((sum, file) => sum + Number(file.bytes || 0), 0);
    const suffix = profile.noDownload ? 'no separate download' : formatBytes(bytes);
    console.log(`  ${index + 1}. ${profile.label} (${suffix})`);
    console.log(`     ${profile.description}`);
  });
  console.log('\n  A. Install every downloadable prerequisite');
  console.log('  Q. Quit');
}

function normalizeFamilies(manifest, values) {
  const ids = Object.keys(manifest.profiles);
  if (values.some(value => value.toLowerCase() === 'all')) {
    return ids.filter(id => !manifest.profiles[id].noDownload);
  }
  const selected = [];
  for (const value of values) {
    const id = String(value || '').trim();
    if (!ids.includes(id)) throw new Error(`Unknown model family: ${id}`);
    if (!selected.includes(id)) selected.push(id);
  }
  return selected;
}

async function promptForFamilies(manifest) {
  printFamilies(manifest);
  const ids = Object.keys(manifest.profiles);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question('\nEnter one or more numbers (for example 1,4), A, or Q: ')).trim();
    if (!answer || /^q$/i.test(answer)) return [];
    if (/^a$/i.test(answer)) return normalizeFamilies(manifest, ['all']);
    const selected = answer.split(',').map(value => Number.parseInt(value.trim(), 10));
    if (selected.some(value => !Number.isInteger(value) || value < 1 || value > ids.length)) {
      throw new Error('Choose valid menu numbers separated by commas.');
    }
    return normalizeFamilies(manifest, selected.map(value => ids[value - 1]));
  } finally {
    rl.close();
  }
}

function selectedModels(manifest, families) {
  return manifest.models.filter(model => model.profiles.some(profile => families.includes(profile)));
}

function uniqueFiles(models) {
  const files = new Map();
  for (const model of models) {
    for (const file of model.files) files.set(file.destination.toLowerCase(), file);
  }
  return [...files.values()];
}

function runDownloader(families) {
  const args = [
    DOWNLOADER_PATH,
    '--manifest', path.relative(APP_ROOT, MANIFEST_PATH),
    '--profile', families.join(','),
    '--state-file', 'model-requirements.json',
  ];
  if (checkOnly) args.push('--check');
  if (testDownloads) args.push('--test-downloads');
  args.push('--comfy-root', comfyRoot);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: APP_ROOT, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Prerequisite installer exited with code ${code ?? 'unknown'}.`)));
  });
}

async function main() {
  const manifest = loadManifest();
  if (listOnly) {
    printFamilies(manifest);
    console.log('\nUMBRA_VERIFY_OK|umbra-model-requirements-manifest');
    return;
  }

  const families = installAllFamilies
    ? normalizeFamilies(manifest, ['all'])
    : requestedFamilies.length > 0
    ? normalizeFamilies(manifest, requestedFamilies)
    : await promptForFamilies(manifest);
  if (families.length === 0) {
    console.log('No model requirements selected.');
    return;
  }

  const noDownload = families.filter(id => manifest.profiles[id].noDownload);
  const installFamilies = families.filter(id => !manifest.profiles[id].noDownload);
  if (noDownload.length > 0) {
    console.log(`\n${noDownload.map(id => manifest.profiles[id].label).join(', ')} needs no separate prerequisite download.`);
  }
  if (installFamilies.length === 0) return;

  const files = uniqueFiles(selectedModels(manifest, installFamilies));
  const totalBytes = files.reduce((sum, file) => sum + Number(file.bytes || 0), 0);
  console.log(`\nSelected: ${installFamilies.map(id => manifest.profiles[id].label).join(', ')}`);
  console.log(`Prerequisites: ${files.length} file(s), ${formatBytes(totalBytes)} total`);
  console.log(`Destination: ${path.join(comfyRoot, 'models')} (the exact ComfyUI folder for each file)`);

  if (!checkOnly && !testDownloads && !assumeYes && process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question('Continue? [y/N]: ')).trim();
      if (!/^y(es)?$/i.test(answer)) {
        console.log('Cancelled.');
        return;
      }
    } finally {
      rl.close();
    }
  }

  await runDownloader(installFamilies);
  console.log('\nUmbra model requirements are ready.');
}

main().catch(error => {
  console.error(`\n[umbra-model-requirements] failed: ${error?.message || error}`);
  process.exit(1);
});
