#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`[linux-release] ${label} failed with status ${result.status ?? 1}`);
  }
}

run('node', ['scripts/bump-webapp-version.mjs'], 'version bump');
run('node', ['scripts/build-linux-folder.mjs', '--clean-release'], 'clean Linux publish');
