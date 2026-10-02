import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { managedChildPath, type ManagedNodeRequirement } from './ManagedToolRequirements';

type GitResult = { status: number | null; stdout: string; stderr?: string };
type GitRunner = (args: string[], cwd: string) => GitResult;
export type ManagedNodeRepairHooks = {
  git?: GitRunner;
  beforeUpdate?: (nodePath: string) => void;
  afterUpdate?: (nodePath: string) => void;
  log?: (message: string) => void;
};

export function repairManagedNodeCheckout(
  nodesRoot: string,
  node: { name: string; repo: string },
  requirements: ManagedNodeRequirement[],
  hooks: ManagedNodeRepairHooks = {},
): string {
  if (!requirements.length || requirements.some((requirement) => requirement.name !== node.name)) {
    throw new Error('The custom node has no declared managed requirement.');
  }
  const nodePath = managedChildPath(nodesRoot, node.name);
  const git: GitRunner = hooks.git || ((args, cwd) => {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
    return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || result.error?.message };
  });
  const checked = (args: string[], cwd = nodePath) => {
    const result = git(args, cwd);
    if (result.status !== 0) throw new Error(`Managed ${node.name} repair failed: git ${args[0]}. ${result.stderr?.trim() || 'Review Git access and retry.'}`);
    return result.stdout.trim();
  };
  const cloned = !existsSync(nodePath);
  if (cloned) {
    checked(['clone', '--no-checkout', '--', node.repo, node.name], nodesRoot);
  }
  const topLevel = git(['rev-parse', '--show-toplevel'], nodePath);
  if (topLevel.status !== 0 || resolve(topLevel.stdout.trim()).toLowerCase() !== resolve(nodePath).toLowerCase()) {
    throw new Error(`${node.name} is not an independent Git checkout. Its local files were preserved.`);
  }
  const head = checked(['rev-parse', 'HEAD']);
  const commits = [...new Set(requirements.map((requirement) => requirement.minimumCommit))];
  const contains = (ancestor: string, descendant: string) => ancestor === descendant
    || git(['merge-base', '--is-ancestor', ancestor, descendant], nodePath).status === 0;
  if (commits.every((commit) => contains(commit, head)) && existsSync(managedChildPath(nodePath, '__init__.py'))) {
    hooks.afterUpdate?.(nodePath);
    hooks.log?.(`${node.name}: installed commit already includes all reviewed requirements.`);
    return head;
  }
  for (const commit of commits) checked(['fetch', 'origin', commit]);
  const target = commits.find((candidate) => commits.every((commit) => contains(commit, candidate)));
  if (!target) throw new Error(`${node.name} has incompatible managed pins; update Umbra Studio before repairing this suite.`);
  if (!cloned && !contains(head, target)) throw new Error(`${node.name} has local or divergent commits. Its checkout was preserved; review it before retrying.`);

  let patchRemoved = false;
  try {
    if (!cloned) hooks.beforeUpdate?.(nodePath);
    patchRemoved = true;
    if (!cloned && checked(['status', '--porcelain', '--untracked-files=no'])) {
      throw new Error(`${node.name} contains local tracked changes. Save or review them before retrying; Setup did not overwrite them.`);
    }
    // A non-forced checkout also refuses collisions with user-owned untracked files.
    checked(['checkout', '--detach', target]);
    hooks.log?.(`${node.name}: installed reviewed commit ${target}.`);
    return target;
  } finally {
    if (patchRemoved) hooks.afterUpdate?.(nodePath);
  }
}
