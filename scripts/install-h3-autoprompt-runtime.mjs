#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const runtimeDir = join(root, 'Tools', 'LlamaCpp', 'b11146');
const binary = join(runtimeDir, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
const assets = {
  win32: {
    name: 'llama-b11146-bin-win-cpu-x64.zip',
    sha256: '14cf1303ca9ac3abd94816850532f9f9a69ac66fbaca3776fc6f9061c2fac1d1',
  },
  linux: {
    name: 'llama-b11146-bin-ubuntu-x64.tar.gz',
    sha256: 'c150306eb16b5ab696f76a8bdf810c35fd98a24e82158742e6fa28f420ff8410',
  },
};

if (process.arch !== 'x64' || !Object.hasOwn(assets, process.platform)) {
  throw new Error('The optional H3 Auto Prompter runtime currently supports Windows and Linux x64 only.');
}
if (existsSync(binary)) {
  console.log('[h3-autoprompt] Local llama.cpp runtime is installed.');
  process.exit(0);
}
if (process.argv.includes('--check')) throw new Error('The local H3 Auto Prompter runtime is not installed.');
if (existsSync(runtimeDir)) throw new Error('The H3 Auto Prompter runtime folder is incomplete. Repair it before retrying.');

const asset = assets[process.platform];
const url = `https://github.com/ggml-org/llama.cpp/releases/download/b11146/${asset.name}`;
const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
if (!response.ok) throw new Error(`llama.cpp download failed (${response.status}).`);
const bytes = Buffer.from(await response.arrayBuffer());
if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
  throw new Error('llama.cpp archive failed SHA-256 verification.');
}

const toolsDir = join(root, 'Tools', 'LlamaCpp');
const stage = join(toolsDir, `.install-${randomUUID()}`);
await mkdir(stage, { recursive: true });
const archive = join(stage, asset.name);
try {
  await writeFile(archive, bytes);
  const code = await new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xf', archive, '-C', stage], { stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) throw new Error('Could not extract the verified llama.cpp archive.');
  await rm(archive, { force: true });
  const stagedBinary = join(stage, process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
  if (!existsSync(stagedBinary)) throw new Error('The llama.cpp archive did not contain llama-server.');
  await rename(stage, runtimeDir);
  console.log('[h3-autoprompt] Installed pinned llama.cpp CPU runtime.');
} catch (error) {
  await rm(stage, { recursive: true, force: true });
  throw error;
}
