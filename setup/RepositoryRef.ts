import { execFileSync } from 'node:child_process';

// Explicit fetches populate FETCH_HEAD even when a tag clone has no remote branch.
export function checkoutFetchedRepositoryRef(directory: string, ref: string) {
  const git = (args: string[]) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const fetchedCommit = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']);
  let tagCommit = '';
  try { tagCommit = git(['rev-parse', '--verify', `refs/tags/${ref}^{commit}`]); } catch { /* A branch need not have a tag. */ }
  const args = tagCommit === fetchedCommit
    ? ['checkout', '--detach', fetchedCommit]
    : ['checkout', '-B', ref, fetchedCommit];
  execFileSync('git', args, { cwd: directory, stdio: 'inherit' });
}
