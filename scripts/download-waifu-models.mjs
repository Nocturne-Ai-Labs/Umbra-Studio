#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_ROOT = path.join(ROOT, 'User', 'Models', 'WaifuTagger');
const MANIFEST_PATH = path.join(APP_ROOT, 'defaults', 'DataForge', 'model-manifest.json');
const HF_BASE = process.env.HF_BASE_URL || 'https://huggingface.co';

function loadModels() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const models = manifest.models?.filter(model => model.family === 'WaifuTagger') || [];
  if (models.length === 0) throw new Error(`No WaifuTagger models were found in ${MANIFEST_PATH}`);
  return models;
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

async function verifyFile(filePath, expected, verifyHash = true) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size !== expected.bytes) return false;
  if (!verifyHash) return true;
  return (await sha256File(filePath)).toLowerCase() === expected.sha256.toLowerCase();
}

async function downloadFile(url, outputPath, expected) {
  const partialPath = `${outputPath}.part`;
  fs.rmSync(partialPath, { force: true });
  const response = await fetch(url, {
    headers: { 'User-Agent': 'UmbraStudio-ModelBundler/2.0' },
    redirect: 'follow',
  });
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

  try {
    await pipeline(source, fs.createWriteStream(partialPath));
    process.stdout.write('\n');
    if (!(await verifyFile(partialPath, expected))) {
      throw new Error(`Integrity check failed for ${expected.path}`);
    }
    fs.renameSync(partialPath, outputPath);
  } catch (error) {
    fs.rmSync(partialPath, { force: true });
    throw error;
  }
}

async function ensureModelFile(model, expected, modelDir) {
  const outputPath = path.join(modelDir, expected.path);
  if (await verifyFile(outputPath, expected)) {
    console.log(`  verified ${expected.path} (${formatBytes(expected.bytes)})`);
    return;
  }
  fs.rmSync(outputPath, { force: true });
  const url = `${HF_BASE}/${model.repository}/resolve/${model.revision}/${expected.path}`;
  console.log(`  download ${expected.path}`);
  await downloadFile(url, outputPath, expected);
  console.log(`  verified ${expected.path} (${formatBytes(expected.bytes)})`);
}

async function main() {
  fs.mkdirSync(MODELS_ROOT, { recursive: true });
  console.log(`[waifu-models] target: ${MODELS_ROOT}`);
  for (const model of loadModels()) {
    const modelDir = path.join(MODELS_ROOT, model.folder);
    fs.mkdirSync(modelDir, { recursive: true });
    console.log(`\n[waifu-models] ${model.repository}@${model.revision}`);
    for (const expected of model.files) await ensureModelFile(model, expected, modelDir);
    fs.writeFileSync(path.join(modelDir, 'umbra-model.json'), `${JSON.stringify({
      repository: model.repository,
      revision: model.revision,
      license: model.license,
      purpose: model.purpose,
    }, null, 2)}\n`, 'utf8');
  }
  console.log('\n[waifu-models] all pinned models are ready.');
}

main().catch(error => {
  console.error(`\n[waifu-models] failed: ${error?.message || error}`);
  process.exit(1);
});
