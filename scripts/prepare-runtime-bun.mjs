#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

const root = process.cwd();
const platform = process.platform;
const isWindows = platform === 'win32';
const BUNDLED_BUN_VERSION = process.env.UMBRA_BUNDLED_BUN_VERSION || 'canary';

function bunFileName(targetPlatform) {
  return targetPlatform === 'win32' ? 'bun.exe' : 'bun';
}

function runtimeBunPath(targetPlatform) {
  return path.join(root, 'Runtime', 'Bun', targetPlatform, bunFileName(targetPlatform));
}

function getBunVersion(command) {
  const res = spawnSync(command, ['--version'], { encoding: 'utf-8' });
  if (res.status !== 0 || !res.stdout.trim()) return null;
  return res.stdout.trim();
}

function getBunRevision(command) {
  const res = spawnSync(command, ['--revision'], { encoding: 'utf-8' });
  if (res.status !== 0 || !res.stdout.trim()) return null;
  return res.stdout.trim();
}

function bunMatchesRequestedVersion(command) {
  if (!fs.existsSync(command)) return false;
  if (BUNDLED_BUN_VERSION === 'canary') {
    return String(getBunRevision(command) || '').includes('-canary.');
  }
  return getBunVersion(command) === BUNDLED_BUN_VERSION;
}

function copyExecutable(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  if (process.platform !== 'win32') fs.chmodSync(targetPath, 0o755);
}

function findSystemBun() {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const res = spawnSync(finder, ['bun'], { encoding: 'utf-8', shell: process.platform === 'win32' });
  if (res.status !== 0 || !res.stdout.trim()) return null;
  return res.stdout.trim().split(/\r?\n/)[0];
}

function downloadFile(url, destinationPath) {
  const res = spawnSync('curl', ['-L', '-sS', '-o', destinationPath, url], { stdio: 'inherit' });
  if (res.status !== 0 || !fs.existsSync(destinationPath)) {
    throw new Error(`Failed to download ${url}`);
  }
}

function ensureWindowsBun() {
  const targetPath = runtimeBunPath('win32');
  if (bunMatchesRequestedVersion(targetPath)) return;

  const releasePath = BUNDLED_BUN_VERSION === 'canary'
    ? 'canary'
    : `bun-v${BUNDLED_BUN_VERSION}`;
  const zipUrl = `https://github.com/oven-sh/bun/releases/download/${releasePath}/bun-windows-x64.zip`;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'umbra-runtime-bun-win-'));
  const zipPath = path.join(tempDir, 'bun-windows-x64.zip');

  try {
    downloadFile(zipUrl, zipPath);
    const unzipRes = isWindows
      ? spawnSync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Expand-Archive -LiteralPath ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(tempDir)} -Force`,
      ], { stdio: 'inherit' })
      : spawnSync('unzip', ['-o', zipPath, '-d', tempDir], { stdio: 'inherit' });
    if (unzipRes.status !== 0) throw new Error('Failed to extract bun-windows-x64.zip');

    const candidates = [
      path.join(tempDir, 'bun-windows-x64', 'bun.exe'),
      path.join(tempDir, 'bun.exe'),
    ];
    const extractedBun = candidates.find((candidate) => fs.existsSync(candidate));
    if (!extractedBun) throw new Error('bun.exe not found in downloaded archive');
    copyExecutable(extractedBun, targetPath);
    console.log(`Runtime Bun prepared: ${targetPath}`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function ensureCurrentPlatformBun() {
  const targetPath = runtimeBunPath(platform);
  if (fs.existsSync(targetPath)) return;

  if (isWindows) {
    ensureWindowsBun();
    return;
  }

  const systemBun = findSystemBun();
  if (!systemBun || !fs.existsSync(systemBun)) {
    throw new Error('Could not locate Bun in PATH to prepare this platform runtime.');
  }
  copyExecutable(systemBun, targetPath);
  console.log(`Runtime Bun prepared: ${targetPath}`);
}

ensureCurrentPlatformBun();
if (isWindows || process.env.UMBRA_PREPARE_WINDOWS_BUN === '1') {
  ensureWindowsBun();
}
