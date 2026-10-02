import { spawnSync } from 'node:child_process';
import { compareUmbraVersions } from '../shared/appUpdate';

type GitResult = { status: number | null; stdout: string; stderr?: string };
type GitRunner = (args: string[], cwd: string) => GitResult;

export function repairManagedComfyCheckout(
  toolDir: string,
  repository: string,
  installedVersion: string,
  minimumVersion: string,
  hooks: { git?: GitRunner; log?: (message: string) => void } = {},
): { previous: string; current: string } {
  const git: GitRunner = hooks.git || ((args, cwd) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || result.error?.message };
  });
  const checked = (args: string[]) => {
    const result = git(args, toolDir);
    if (result.status !== 0) throw new Error(`Managed ComfyUI repair failed: git ${args[0]}. ${result.stderr?.trim() || 'Review Git access and retry.'}`);
    return result.stdout.trim();
  };
  const assertClean = () => {
    if (checked(['status', '--porcelain', '--untracked-files=no'])) throw new Error('ComfyUI contains local tracked changes or modified submodules. They were preserved; review them before repairing the core/frontend bundle.');
  };
  assertClean();
  const previous = checked(['rev-parse', 'HEAD']);
  hooks.log?.(`ComfyUI prior commit retained for recovery: ${previous}`);
  if (compareUmbraVersions(installedVersion || '0.0.0', minimumVersion) >= 0) return { previous, current: previous };
  if (!/^\d+\.\d+\.\d+$/.test(minimumVersion)) throw new Error('The reviewed ComfyUI release version is invalid.');
  checked(['fetch', '--no-tags', repository, `v${minimumVersion}`]);
  const target = checked(['rev-parse', 'FETCH_HEAD']);
  if (git(['merge-base', '--is-ancestor', previous, target], toolDir).status !== 0) {
    // Upstream stable releases can use separate backport branches. Accept that
    // transition only when the untouched installed HEAD is its official release.
    if (!/^\d+\.\d+\.\d+$/.test(installedVersion)) throw new Error('ComfyUI has divergent or local commits. Its version was preserved; review it before retrying.');
    checked(['fetch', '--no-tags', repository, `v${installedVersion}`]);
    if (checked(['rev-parse', 'FETCH_HEAD']) !== previous) throw new Error('ComfyUI has divergent or local commits. Its version was preserved; review it before retrying.');
    hooks.log?.(`Verified official ComfyUI v${installedVersion} release before switching to reviewed v${minimumVersion}.`);
  }
  assertClean();
  if (checked(['rev-parse', 'HEAD']) !== previous) throw new Error('ComfyUI changed during release verification. Its checkout was preserved.');
  // Keep target captured before the installed-release fetch changes FETCH_HEAD.
  // Non-forced checkout still refuses user-owned untracked file collisions.
  checked(['checkout', '--detach', target]);
  return { previous, current: target };
}
