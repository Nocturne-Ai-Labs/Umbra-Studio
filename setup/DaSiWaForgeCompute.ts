import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const patchPath = join(import.meta.dir, 'DaSiWaForgeCompute.patch');

function gitApply(nodePath: string, ...args: string[]): boolean {
    return spawnSync('git', ['apply', ...args, patchPath], {
        cwd: nodePath,
        stdio: 'ignore',
    }).status === 0;
}

export function removeDaSiWaForgeComputePatchForUpdate(nodePath: string): void {
    if (gitApply(nodePath, '--reverse', '--check') && !gitApply(nodePath, '--reverse')) {
        throw new Error('Could not temporarily remove the Umbra H3 Forge device patch. DaSiWa was not updated.');
    }
}

export function ensureDaSiWaForgeComputePatch(nodePath: string): void {
    if (!existsSync(join(nodePath, '.git'))) {
        throw new Error('DaSiWa is not a managed Git checkout; its local files were left unchanged.');
    }
    if (!existsSync(join(nodePath, 'nodes', 'h3_forge.py'))) {
        throw new Error('DaSiWa H3 Prompt Forge is missing from this custom node installation.');
    }
    if (gitApply(nodePath, '--reverse', '--check')) return;
    if (!gitApply(nodePath, '--check') || !gitApply(nodePath)) {
        throw new Error('DaSiWa H3 Prompt Forge changed upstream; Umbra CPU/GPU support needs review before this node can be used.');
    }
}
