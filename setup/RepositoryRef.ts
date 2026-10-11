import { execFileSync } from 'node:child_process';

// Explicit fetches populate FETCH_HEAD even when a tag clone has no remote branch.
export function checkoutFetchedRepositoryRef(directory: string, ref: string) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const fetchedCommit = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  let tagCommit = '';
  try { tagCommit = git(['rev-parse', '--verify', `refs/tags/${ref}^{commit}`]); } catch { /* A branch need not have a tag. */ }
  let previous = '';
  try { previous = git(['rev-parse', '--verify', 'HEAD']); } catch { /* A newly initialized checkout has no commit yet. */ }
  if (previous) {
    if (previous === fetchedCommit) return;
    try { git(['merge-base', '--is-ancestor', previous, fetchedCommit]); }
    catch { throw new Error('The fetched source diverges from this checkout. Local commits and tracked files were preserved; review the branch before retrying.'); }
    // A branch rewrite is not routine maintenance. Fast-forward also refuses
    // conflicting local edits and untracked collisions without an autostash.
    execFileSync('git', ['merge', '--ff-only', fetchedCommit], { cwd: directory, stdio: 'inherit' });
    return;
  }
  execFileSync('git', tagCommit === fetchedCommit ? ['checkout', '--detach', fetchedCommit]
    : ['checkout', '-b', ref, fetchedCommit], { cwd: directory, stdio: 'inherit' });
}
