#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = process.cwd();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const dependencyNames = Array.isArray(pkg.umbraRuntimeDependencies)
  ? pkg.umbraRuntimeDependencies.filter((name) => typeof name === 'string' && name.trim())
  : [];

if (dependencyNames.length === 0) {
  throw new Error('[runtime-dependencies] package.json must declare umbraRuntimeDependencies.');
}

const dependencies = Object.fromEntries(dependencyNames.map((name) => {
  const installedManifest = path.join(root, 'node_modules', name, 'package.json');
  if (!fs.existsSync(installedManifest)) {
    throw new Error(`[runtime-dependencies] ${name} is not installed. Run bun install first.`);
  }
  const installed = JSON.parse(fs.readFileSync(installedManifest, 'utf-8'));
  if (!installed.version) {
    throw new Error(`[runtime-dependencies] Could not resolve the installed version of ${name}.`);
  }
  return [name, installed.version];
}));

const targetRoot = path.join(root, 'dist-webapp', 'runtime-dependencies', `${process.platform}-${process.arch}`);
const targetNodeModules = path.join(targetRoot, 'node_modules');
const manifest = {
  name: 'umbra-studio-runtime-dependencies',
  private: true,
  version: pkg.version,
  dependencies,
};
const stamp = createHash('sha256')
  .update(JSON.stringify({ platform: process.platform, arch: process.arch, dependencies }))
  .digest('hex');
const stampPath = path.join(targetRoot, '.umbra-runtime-dependencies.json');

function validateRuntime(directory) {
  const script = [
    "const sharp = (await import('sharp')).default;",
    "const output = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#00000000' } }).png().toBuffer();",
    "if (!output?.length) throw new Error('Sharp runtime smoke check produced no output.');",
  ].join(' ');
  const result = spawnSync(process.env.UMBRA_BUILD_BUN || 'bun', ['-e', script], {
    cwd: directory,
    encoding: 'utf-8',
    shell: false,
  });
  return {
    ok: result.status === 0,
    error: String(result.stderr || result.error?.message || '').trim(),
  };
}

try {
  const current = JSON.parse(fs.readFileSync(stampPath, 'utf-8'));
  if (current?.stamp === stamp && fs.existsSync(targetNodeModules) && validateRuntime(targetRoot).ok) {
    console.log(`[runtime-dependencies] Reusing ${targetNodeModules}`);
    process.exit(0);
  }
} catch {
  // Build a fresh platform-specific runtime below.
}

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'umbra-runtime-dependencies-'));
try {
  fs.writeFileSync(path.join(tempRoot, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  const install = spawnSync(process.env.UMBRA_BUILD_BUN || 'bun', ['install', '--production', '--no-progress'], {
    cwd: tempRoot,
    stdio: 'inherit',
    shell: false,
  });
  if (install.status !== 0) {
    throw new Error(`[runtime-dependencies] bun install failed with code ${install.status}.`);
  }
  const validation = validateRuntime(tempRoot);
  if (!validation.ok) {
    throw new Error(`[runtime-dependencies] Sharp failed its platform runtime smoke check.${validation.error ? ` ${validation.error}` : ''}`);
  }

  fs.rmSync(targetRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  fs.mkdirSync(path.dirname(targetRoot), { recursive: true });
  fs.cpSync(tempRoot, targetRoot, { recursive: true, dereference: true });
  fs.writeFileSync(stampPath, `${JSON.stringify({ stamp, platform: process.platform, arch: process.arch, dependencies }, null, 2)}\n`, 'utf-8');
  console.log(`[runtime-dependencies] Prepared ${targetNodeModules}`);
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
