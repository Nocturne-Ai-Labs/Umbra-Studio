#!/usr/bin/env node
import { spawnSync } from 'child_process';

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error(`[webapp-release] ${label} failed with status ${result.status ?? 1}`);
  }
}

run('node', ['scripts/bump-webapp-version.mjs'], 'version bump');
run('node', ['scripts/build-webapp-folder.mjs', '--clean-release'], 'clean webapp publish');
