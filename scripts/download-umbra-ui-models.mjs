#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HF_BASE = String(process.env.HF_BASE_URL || 'https://huggingface.co').replace(/\/$/, '');

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function readArgs(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    const value = String(process.argv[index + 1] || '').trim();
    if (value) values.push(...value.split(',').map(entry => entry.trim()).filter(Boolean));
  }
  return values;
}

const manifestArgument = readArg('--manifest');
const MANIFEST_PATH = manifestArgument
  ? path.resolve(APP_ROOT, manifestArgument)
  : path.join(APP_ROOT, 'defaults', 'UmbraUI', 'model-manifest.json');
const requestedProfiles = readArgs('--profile');
const requestedProfile = requestedProfiles.length > 0 ? requestedProfiles.join(',') : 'core';
const stateFileName = readArg('--state-file') || 'support-models.json';
const checkOnly = process.argv.includes('--check');
const testDownloads = process.argv.includes('--test-downloads');
const verifyTarget = process.argv.includes('--verify-target');
const manifestOnly = process.argv.includes('--manifest-only');
const listOnly = process.argv.includes('--list');
const comfyRoot = path.resolve(
  readArg('--comfy-root')
  || process.env.UMBRA_COMFYUI_ROOT
  || path.join(process.cwd(), 'Tools', 'ComfyUI'),
);
const modelsRoot = path.join(comfyRoot, 'models');
let cancellationRequested = false;
let activeDownloadController = null;
let cancelInputListener = null;
let cancelInputWasRaw = false;

class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled. The incomplete file was removed.');
    this.name = 'DownloadCancelledError';
  }
}

function requestCancellation() {
  cancellationRequested = true;
  process.stderr.write('\n[umbra-ui-models] Cancelling and removing the incomplete download...\n');
  activeDownloadController?.abort();
}

process.once('SIGINT', requestCancellation);
process.once('SIGTERM', requestCancellation);

function beginCancellationInput() {
  if (!process.stdin.isTTY && process.env.UMBRA_TEST_CANCEL_INPUT !== '1') return;
  cancelInputWasRaw = Boolean(process.stdin.isRaw);
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  cancelInputListener = (chunk) => {
    const bytes = Buffer.from(chunk);
    if (bytes.includes(3) || bytes.includes(0x71) || bytes.includes(0x51)) requestCancellation();
  };
  process.stdin.on('data', cancelInputListener);
  console.log('[umbra-ui-models] Press Q or Ctrl+C to cancel and discard the incomplete download.');
}

function endCancellationInput() {
  if (cancelInputListener) process.stdin.off('data', cancelInputListener);
  cancelInputListener = null;
  process.stdin.setRawMode?.(cancelInputWasRaw);
  process.stdin.pause();
}

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function normalizedRelative(value, label) {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) {
    throw new Error(`Unsafe ${label}: ${value}`);
  }
  return normalized;
}

function normalizedFileName(value, label) {
  const normalized = String(value || '').trim();
  if (!normalized || path.basename(normalized) !== normalized || normalized !== path.normalize(normalized)) {
    throw new Error(`Unsafe ${label}: ${value}`);
  }
  return normalized;
}

function validateManifest(manifest) {
  if (manifest?.schemaVersion !== 1) throw new Error('Unsupported Umbra UI model manifest schema.');
  if (!manifest.profiles || typeof manifest.profiles !== 'object') throw new Error('Model profiles are missing.');
  if (!Array.isArray(manifest.models) || manifest.models.length === 0) throw new Error('No support models are defined.');

  const ids = new Set();
  const destinations = new Set();
  for (const model of manifest.models) {
    if (!model?.id || ids.has(model.id)) throw new Error(`Duplicate or missing model id: ${model?.id || '(empty)'}`);
    ids.add(model.id);
    if (!['automatic', 'manual'].includes(model.installPolicy)) {
      throw new Error(`Invalid installPolicy for ${model.id}`);
    }
    if (!Array.isArray(model.profiles)) throw new Error(`Missing profiles for ${model.id}`);
    for (const profile of model.profiles) {
      if (!manifest.profiles[profile]) throw new Error(`Unknown profile ${profile} on ${model.id}`);
    }
    if (!Array.isArray(model.files) || model.files.length === 0) throw new Error(`No files defined for ${model.id}`);
    for (const file of model.files) {
      const destination = normalizedRelative(file.destination, `${model.id} destination`);
      if (destinations.has(destination.toLowerCase())) throw new Error(`Duplicate model destination: ${destination}`);
      destinations.add(destination.toLowerCase());
      if (model.installPolicy === 'automatic') {
        if (!Number.isSafeInteger(file.bytes) || file.bytes <= 0) throw new Error(`Invalid byte count for ${destination}`);
        if (!/^[a-f0-9]{64}$/i.test(file.sha256 || '')) throw new Error(`Invalid SHA-256 for ${destination}`);
        if (!file.url && !(model.repository && model.revision && file.sourcePath)) {
          throw new Error(`No pinned download source for ${destination}`);
        }
      }
    }
  }
  return manifest;
}

function formatBytes(value) {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)}KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)}MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)}GB`;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

async function verifyFile(filePath, expected) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== expected.bytes) return false;
  return (await sha256File(filePath)).toLowerCase() === expected.sha256.toLowerCase();
}

function downloadUrl(model, file) {
  if (file.url) return file.url;
  const sourcePath = normalizedRelative(file.sourcePath, `${model.id} source`)
    .split('/')
    .map(encodeURIComponent)
    .join('/');
  return `${HF_BASE}/${model.repository}/resolve/${model.revision}/${sourcePath}`;
}

async function downloadFile(url, outputPath, expected) {
  const partialPath = `${outputPath}.part`;
  fs.rmSync(partialPath, { force: true });
  if (cancellationRequested) throw new DownloadCancelledError();

  const headers = { 'User-Agent': 'UmbraStudio-ModelBundler/2.0' };
  const controller = new AbortController();
  activeDownloadController = controller;

  try {
    const response = await fetch(url, { headers, redirect: 'follow', signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);
    let downloaded = 0;
    let lastLogAt = 0;
    const source = Readable.fromWeb(response.body);
    source.on('data', chunk => {
      downloaded += chunk.length;
      const now = Date.now();
      if (now - lastLogAt < 2000) return;
      lastLogAt = now;
      process.stdout.write(`\r      ${formatBytes(downloaded)} ${((downloaded / expected.bytes) * 100).toFixed(1)}%`);
    });
    await pipeline(source, fs.createWriteStream(partialPath, { flags: 'w' }));
    process.stdout.write('\n');
    if (cancellationRequested) throw new DownloadCancelledError();
    const verified = await verifyFile(partialPath, expected);
    if (cancellationRequested) throw new DownloadCancelledError();
    if (!verified) throw new Error(`Integrity check failed for ${expected.destination}`);
    fs.renameSync(partialPath, outputPath);
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    if (cancellationRequested || controller.signal.aborted) throw new DownloadCancelledError();
    throw error;
  } finally {
    if (activeDownloadController === controller) activeDownloadController = null;
  }
}

async function testDownload(url, expected) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'UmbraStudio-ModelBundler/2.0',
      Range: 'bytes=0-0',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);

  const reader = response.body.getReader();
  try {
    const first = await reader.read();
    if (first.done || !first.value?.byteLength) {
      throw new Error(`The download returned no data for ${expected.destination}`);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  console.log(`  accessible ${expected.destination} (HTTP ${response.status})`);
}

function selectedModels(manifest) {
  if (requestedProfiles.includes('all')) return manifest.models.filter(model => model.installPolicy === 'automatic');
  const profiles = requestedProfiles.length > 0 ? requestedProfiles : ['core'];
  for (const profile of profiles) {
    if (!manifest.profiles[profile]) throw new Error(`Unknown model profile: ${profile}`);
  }
  return manifest.models.filter(model => (
    model.installPolicy === 'automatic'
    && model.profiles.some(profile => profiles.includes(profile))
  ));
}

function printManifest(manifest) {
  console.log(`[umbra-ui-models] manifest: ${MANIFEST_PATH}`);
  for (const [id, profile] of Object.entries(manifest.profiles)) {
    const models = manifest.models.filter(model => model.installPolicy === 'automatic' && model.profiles.includes(id));
    const bytes = models.flatMap(model => model.files).reduce((sum, file) => sum + Number(file.bytes || 0), 0);
    console.log(`  ${id}: ${models.length} model groups, ${formatBytes(bytes)} - ${profile.label}`);
  }
  const manual = manifest.models.filter(model => model.installPolicy === 'manual');
  if (manual.length > 0) console.log(`  manual: ${manual.map(model => model.id).join(', ')}`);
}

async function main() {
  const manifest = validateManifest(loadManifest());
  printManifest(manifest);
  if (manifestOnly || listOnly) {
    console.log('UMBRA_VERIFY_OK|umbra-ui-model-manifest');
    return;
  }

  const models = selectedModels(manifest);
  if (models.length === 0) throw new Error(`No automatic models belong to profile ${requestedProfile}`);
  if (verifyTarget) {
    if (!fs.existsSync(comfyRoot)) throw new Error(`ComfyUI is not installed at ${comfyRoot}`);
    console.log(`[umbra-ui-models] target: ${modelsRoot}`);
    console.log(`UMBRA_VERIFY_OK|umbra-ui-model-target|${modelsRoot}`);
    return;
  }
  if (testDownloads) {
    console.log(`[umbra-ui-models] testing download sources for profile: ${requestedProfile}`);
    for (const model of models) {
      console.log(`\n[umbra-ui-models] ${model.id}`);
      for (const expected of model.files) {
        await testDownload(downloadUrl(model, expected), expected);
      }
    }
    console.log('\nUMBRA_VERIFY_OK|umbra-ui-model-downloads');
    return;
  }
  if (!fs.existsSync(comfyRoot)) throw new Error(`ComfyUI is not installed at ${comfyRoot}`);
  fs.mkdirSync(modelsRoot, { recursive: true });
  console.log(`[umbra-ui-models] profile: ${requestedProfile}`);
  console.log(`[umbra-ui-models] target: ${modelsRoot}`);
  beginCancellationInput();

  const missing = [];
  const installed = [];
  for (const model of models) {
    console.log(`\n[umbra-ui-models] ${model.id}`);
    for (const expected of model.files) {
      const destination = normalizedRelative(expected.destination, `${model.id} destination`);
      const outputPath = path.join(modelsRoot, ...destination.split('/'));
      const existingIsValid = await verifyFile(outputPath, expected);
      if (cancellationRequested) throw new DownloadCancelledError();
      if (existingIsValid) {
        console.log(`  verified ${destination} (${formatBytes(expected.bytes)})`);
        installed.push({ modelId: model.id, destination, sha256: expected.sha256 });
        continue;
      }
      if (checkOnly) {
        console.log(`  missing or invalid ${destination}`);
        missing.push(destination);
        continue;
      }
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.rmSync(outputPath, { force: true });
      console.log(`  download ${destination}`);
      await downloadFile(downloadUrl(model, expected), outputPath, expected);
      console.log(`  verified ${destination} (${formatBytes(expected.bytes)})`);
      installed.push({ modelId: model.id, destination, sha256: expected.sha256 });
    }
  }

  if (missing.length > 0) throw new Error(`Missing ${missing.length} support model file(s): ${missing.join(', ')}`);
  const stateDir = path.join(modelsRoot, '.umbra');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, normalizedFileName(stateFileName, 'state file')), `${JSON.stringify({
    schemaVersion: 1,
    manifestSchemaVersion: manifest.schemaVersion,
    profile: requestedProfile,
    verifiedAt: new Date().toISOString(),
    installed,
  }, null, 2)}\n`, 'utf8');
  console.log(`\n[umbra-ui-models] ${requestedProfile} support models are ready.`);
  console.log('UMBRA_VERIFY_OK|umbra-ui-models');
}

main().catch(error => {
  if (error instanceof DownloadCancelledError) {
    console.error(`\n[umbra-ui-models] ${error.message}`);
    process.exitCode = 130;
    return;
  }
  console.error(`\n[umbra-ui-models] failed: ${error?.message || error}`);
  process.exitCode = 1;
}).finally(endCancellationInput);
