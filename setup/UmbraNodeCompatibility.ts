import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sameGitCheckout } from './GitMaintenance';
import { ensureUmbraHiresVaeScalePatch, removeUmbraHiresVaeScalePatchForUpdate } from './UmbraHiresVaeScale';

const bridgePatch = join(import.meta.dir, 'UmbraOwnedStudioBridge.patch');

function assertCheckout(nodePath: string): void {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: nodePath, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !sameGitCheckout(result.stdout.trim(), nodePath)) {
    throw new Error('Umbra compatibility repair requires an independent managed node checkout. Files were preserved.');
  }
}

function applyBridge(nodePath: string, ...args: string[]): boolean {
  return spawnSync('git', ['apply', ...args, bridgePatch], { cwd: nodePath, windowsHide: true, stdio: 'ignore' }).status === 0;
}

export function ensureUmbraNodeCompatibility(nodePath: string): void {
  assertCheckout(nodePath);
  const bridgeApplied = applyBridge(nodePath, '--reverse', '--check');
  // Check the new hunk before touching an older VAE-only installation.
  if (!bridgeApplied && !applyBridge(nodePath, '--check')) {
    throw new Error('Umbra owning-Studio bridge compatibility needs review for this node revision. Local changes were preserved.');
  }
  ensureUmbraHiresVaeScalePatch(nodePath);
  if (!bridgeApplied && !applyBridge(nodePath)) {
    throw new Error('Could not install the Umbra owning-Studio bridge patch. Review the node checkout before retrying.');
  }
}

export function removeUmbraNodeCompatibilityForUpdate(nodePath: string): void {
  assertCheckout(nodePath);
  if (!applyBridge(nodePath, '--cached', '--reverse', '--check')
    && applyBridge(nodePath, '--reverse', '--check') && !applyBridge(nodePath, '--reverse')) {
    throw new Error('Could not temporarily remove the Umbra owning-Studio bridge patch. Node files were preserved.');
  }
  removeUmbraHiresVaeScalePatchForUpdate(nodePath);
}
