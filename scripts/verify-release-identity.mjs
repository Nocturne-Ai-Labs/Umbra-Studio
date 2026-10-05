#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Called from the checked-out source before packaging and again before upload.
// Fetch the named remote tag so a stale local tag cannot authorize publication.
try {
  const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
  const tag = process.env.RELEASE_TAG;
  const expectedCommit = process.env.GITHUB_SHA;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version)) {
    throw new Error('package.json must contain a release version.');
  }
  if (tag !== `v${version}`) {
    throw new Error(`Release tag must be v${version}; received ${JSON.stringify(tag ?? '')}.`);
  }
  if (!/^[\da-f]{40}$/i.test(expectedCommit || '')) {
    throw new Error('GITHUB_SHA must identify the exact workflow source commit.');
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const sourceCommit = git('rev-parse', '--verify', 'HEAD^{commit}');
  const workflowCommit = git('rev-parse', '--verify', `${expectedCommit}^{commit}`);
  if (sourceCommit !== workflowCommit) {
    throw new Error('Checked-out source does not match the workflow commit.');
  }
  // An explicit refspec requires the remote tag to exist. It never creates or
  // changes a remote ref; only the disposable CI checkout's local tag is updated.
  git('fetch', '--no-tags', 'origin', `+refs/tags/${tag}:refs/tags/${tag}`);
  const tagCommit = git('rev-parse', '--verify', `refs/tags/${tag}^{commit}`);
  if (tagCommit !== sourceCommit) {
    throw new Error(`Remote tag ${tag} does not point to the built source commit.`);
  }
  console.log(`Verified release identity: ${tag} at ${sourceCommit}`);
} catch (error) {
  console.error(`[release-identity] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
