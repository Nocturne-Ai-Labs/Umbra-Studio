import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { downloadPinnedRuntime, ownedPath } from './ComfyPythonRuntime';

const SAGE_WINDOWS = {
  '12': { url: 'https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post6/sageattention-2.2.0%2Bcu128torch2.10.0andhigher.post6-cp310-abi3-win_amd64.whl', bytes: 16871451, sha256: '103e06df49486daa87c3338bf2490ada2b074da1422f2b90566a8f2f81a6b76e' },
  '13': { url: 'https://github.com/woct0rdho/SageAttention/releases/download/v2.2.0-windows.post6/sageattention-2.2.0%2Bcu130torch2.10.0andhigher.post6-cp310-abi3-win_amd64.whl', bytes: 16656067, sha256: '1635283f5c01ec3cda58a784d0d7eabbcaffaf9511d1b263db4750e1ed7958bb' },
};

export function sageMigrationWheel(version: string, torch: string, cuda: string, platform = process.platform) {
  const [major, minor] = torch.split('.').map(Number);
  if (platform !== 'win32' || version.split('+')[0] !== '2.2.0' || !(major > 2 || major === 2 && minor >= 10)) return null;
  return SAGE_WINDOWS[cuda.split('.')[0] as keyof typeof SAGE_WINDOWS] || null;
}

export async function restoreComfyAttention(root: string, python: string, name: string, version: string, log: (line: string) => void) {
  const comfy = ownedPath(root, 'Tools', 'ComfyUI');
  let requirement = `${name}==${version}`;
  if (name === 'sageattention' && process.platform === 'win32') {
    const probe = spawnSync(python, ['-I', '-c', 'import torch,json; print(json.dumps({"version":torch.__version__,"cuda":torch.version.cuda or "cpu"}))'], { encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    if (probe.status !== 0) throw new Error('PyTorch ABI could not be verified for SageAttention migration.');
    const torch = JSON.parse(probe.stdout), artifact = sageMigrationWheel(version, torch.version, torch.cuda);
    if (artifact) {
      const cache = ownedPath(root, 'Runtime', 'Attention', artifact.sha256.slice(0, 12)); mkdirSync(cache, { recursive: true });
      requirement = join(cache, decodeURIComponent(new URL(artifact.url).pathname.split('/').pop()!));
      if (!existsSync(requirement)) await downloadPinnedRuntime(artifact, requirement, log);
      const content = readFileSync(requirement);
      if (content.length !== artifact.bytes || createHash('sha256').update(content).digest('hex') !== artifact.sha256) throw new Error('SageAttention cached wheel checksum failed.');
      log('Restoring SageAttention 2.2.0 with a verified Python / PyTorch stable-ABI Windows build.');
    }
  }
  // Reinstall only the accelerator. Core and Triton dependencies are installed and
  // verified separately; pip must not replace the selected CUDA Torch build.
  const install = spawnSync(python, ['-m', 'pip', 'install', '--no-deps', '--only-binary=:all:', requirement], { cwd: comfy, stdio: 'inherit', windowsHide: true });
  if (install.status !== 0) throw new Error(`${name} ${version} has no compatible Python 3.13 wheel. Previous environment will be restored.`);
}
