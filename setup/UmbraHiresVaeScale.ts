import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sameGitCheckout } from './GitMaintenance';

const patch = join(import.meta.dir, 'UmbraHiresVaeScale.patch');
function assertCheckout(nodePath: string): void {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: nodePath, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !sameGitCheckout(result.stdout.trim(), nodePath)) throw new Error('Umbra VAE-scale repair requires an independent managed node checkout. Files were preserved.');
}
function apply(nodePath: string, ...args: string[]): boolean {
  return spawnSync('git', ['apply', ...args, patch], { cwd: nodePath, windowsHide: true, stdio: 'ignore' }).status === 0;
}
export function removeUmbraHiresVaeScalePatchForUpdate(nodePath: string): void {
  assertCheckout(nodePath);
  // An upstream/staged fix belongs to the index; only remove our working-tree patch.
  if (apply(nodePath, '--cached', '--reverse', '--check')) return;
  if (apply(nodePath, '--reverse', '--check') && !apply(nodePath, '--reverse')) {
    throw new Error('Could not temporarily remove the Umbra VAE-scale compatibility patch. Node files were preserved.');
  }
}
export function ensureUmbraHiresVaeScalePatch(nodePath: string): void {
  assertCheckout(nodePath);
  if (apply(nodePath, '--reverse', '--check')) return;
  if (!apply(nodePath, '--check') || !apply(nodePath)) {
    throw new Error('Umbra hires VAE-scale compatibility needs review for this node revision. Local changes were preserved.');
  }
}
