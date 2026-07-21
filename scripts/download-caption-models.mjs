#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const ROOT = process.cwd();
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS_ROOT = path.join(ROOT, 'User', 'Models', 'DataForgeCaption');
const MANIFEST_PATH = path.join(APP_ROOT, 'defaults', 'DataForge', 'model-manifest.json');
const HF_BASE = process.env.HF_BASE_URL || 'https://huggingface.co';

function loadModel() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const model = manifest.models?.find(candidate => candidate.family === 'DataForgeCaption');
  if (!model) throw new Error(`No DataForgeCaption model was found in ${MANIFEST_PATH}`);
  return model;
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
  const partialSize = fs.existsSync(partialPath) ? fs.statSync(partialPath).size : 0;
  const headers = { 'User-Agent': 'UmbraStudio-ModelBundler/2.0' };
  if (partialSize > 0 && partialSize < expected.bytes) headers.Range = `bytes=${partialSize}-`;

  const response = await fetch(url, { headers, redirect: 'follow' });
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} for ${url}`);
  const canResume = partialSize > 0 && response.status === 206;
  let downloaded = canResume ? partialSize : 0;
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
    await pipeline(source, fs.createWriteStream(partialPath, { flags: canResume ? 'a' : 'w' }));
    process.stdout.write('\n');
    if (!(await verifyFile(partialPath, expected))) {
      throw new Error(`Integrity check failed for ${expected.path}`);
    }
    fs.renameSync(partialPath, outputPath);
  } catch (error) {
    if (fs.existsSync(partialPath) && fs.statSync(partialPath).size >= expected.bytes) {
      fs.rmSync(partialPath, { force: true });
    }
    throw error;
  }
}

async function ensureFile(model, expected, modelDir) {
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
  const model = loadModel();
  const modelDir = path.join(MODELS_ROOT, model.folder);
  fs.mkdirSync(modelDir, { recursive: true });
  console.log(`[caption-models] ${model.repository}@${model.revision}`);
  console.log(`[caption-models] target: ${modelDir}`);
  for (const expected of model.files) await ensureFile(model, expected, modelDir);
  fs.writeFileSync(path.join(modelDir, 'umbra-model.json'), `${JSON.stringify({
    repository: model.repository,
    revision: model.revision,
    purpose: model.purpose,
    license: model.license,
  }, null, 2)}\n`, 'utf8');
  console.log('[caption-models] pinned natural caption model is ready.');
}

main().catch(error => {
  console.error(`[caption-models] failed: ${error?.message || error}`);
  process.exit(1);
});
