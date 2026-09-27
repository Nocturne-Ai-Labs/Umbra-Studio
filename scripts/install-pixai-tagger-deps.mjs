#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const python = process.platform === 'win32'
  ? join(root, 'Runtime', 'PythonHelpers', 'venv', 'Scripts', 'python.exe')
  : join(root, 'Runtime', 'PythonHelpers', 'venv', 'bin', 'python');

if (!existsSync(python)) {
  console.error('Umbra Python helpers are not installed. Run the main Umbra tool setup first.');
  process.exit(1);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, args, { cwd: root, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', (code) => resolve(code === 0));
  });
}

const check = 'import torch, torchvision, timm, transformers; from packaging.version import Version; assert Version(transformers.__version__) >= Version("4.57.6") and Version(transformers.__version__) < Version("5")';
if (!await run(['-c', check])) {
  let torchVersion;
  try {
    torchVersion = execFileSync(python, ['-c', 'import torch; print(torch.__version__)'], {
      cwd: root, encoding: 'utf8', windowsHide: true,
    }).trim();
  } catch {
    throw new Error('Umbra Python helpers need PyTorch. Run the main Umbra tool setup first.');
  }
  const torchPublicVersion = torchVersion.split('+')[0];
  console.log('[pixai-tagger] Installing optional Python dependencies...');
  if (!await run(['-m', 'pip', 'install', 'transformers==4.57.6', 'timm==1.0.30', 'torchvision', `torch==${torchPublicVersion}`])) {
    throw new Error('PixAI Python dependencies could not be installed.');
  }
  const installedTorchVersion = execFileSync(python, ['-c', 'import torch; print(torch.__version__)'], {
    cwd: root, encoding: 'utf8', windowsHide: true,
  }).trim();
  if (installedTorchVersion !== torchVersion) throw new Error('PixAI setup changed the PyTorch build. Restore Umbra Python helpers before tagging.');
  if (!await run(['-c', check])) throw new Error('PixAI Python dependencies did not pass import verification.');
}
console.log('[pixai-tagger] Python dependencies ready.');
