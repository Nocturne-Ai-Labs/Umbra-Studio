import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const patchPath = join(import.meta.dir, 'DaSiWaForgeCompute.patch');
const legacyPatchPath = join(import.meta.dir, 'DaSiWaForgeCompute.legacy.patch');
const previousPatchPath = join(import.meta.dir, 'DaSiWaForgeCompute.previous.patch');
const previousPatches = [previousPatchPath, legacyPatchPath];

function gitApply(nodePath: string, patch: string, ...args: string[]): boolean {
    return spawnSync('git', ['apply', ...args, patch], {
        cwd: nodePath,
        stdio: 'ignore',
    }).status === 0;
}

export function removeDaSiWaForgeComputePatchForUpdate(nodePath: string): void {
    for (const patch of [patchPath, ...previousPatches]) {
        if (!gitApply(nodePath, patch, '--reverse', '--check')) continue;
        if (!gitApply(nodePath, patch, '--reverse')) {
            throw new Error('Could not temporarily remove the Umbra H3 Forge patch. DaSiWa was not updated.');
        }
        return;
    }
}

export function ensureDaSiWaForgeComputePatch(nodePath: string): void {
    if (!existsSync(join(nodePath, '.git'))) {
        throw new Error('DaSiWa is not a managed Git checkout; its local files were left unchanged.');
    }
    if (!existsSync(join(nodePath, 'nodes', 'h3_forge.py'))) {
        throw new Error('DaSiWa H3 Prompt Forge is missing from this custom node installation.');
    }
    if (gitApply(nodePath, patchPath, '--reverse', '--check')) return;
    const previous = previousPatches.find((patch) => gitApply(nodePath, patch, '--reverse', '--check'));
    if (previous && !gitApply(nodePath, previous, '--reverse')) {
        throw new Error('Could not migrate the previous Umbra H3 Forge patch. Local files were preserved.');
    }
    if (!gitApply(nodePath, patchPath, '--check') || !gitApply(nodePath, patchPath)) {
        if (previous && !gitApply(nodePath, previous)) {
            throw new Error('Could not restore the previous Umbra H3 Forge patch after migration failed. Reinstall the managed DaSiWa H3 nodes.');
        }
        throw new Error('DaSiWa H3 Prompt Forge changed upstream; Umbra Llama support needs review before this node can be used.');
    }
}
