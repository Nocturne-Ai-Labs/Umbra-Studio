import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const GGUF_REQUIREMENT = /^\s*llama-cpp-python(?:[<=>!~;\s]|$)/i;

export function installDaSiWaRequirements(python: string, requirementsPath: string, markerPath: string, log: (message: string) => void): boolean {
  const requirements = readFileSync(requirementsPath, 'utf-8');
  const hash = Bun.hash(requirements).toString();
  let coreReady = false;
  try { coreReady = readFileSync(markerPath, 'utf-8').trim() === hash; } catch { /* Install or refresh the core dependencies. */ }

  if (!coreReady) {
    const tempDir = mkdtempSync(join(tmpdir(), 'umbra-dasiwa-'));
    try {
      const corePath = join(tempDir, 'requirements.txt');
      writeFileSync(corePath, requirements.split(/\r?\n/).filter((line) => !GGUF_REQUIREMENT.test(line)).join('\n'));
      const install = spawnSync(python, ['-m', 'pip', 'install', '-r', corePath], { stdio: 'inherit' });
      if (install.status !== 0) return false;
      writeFileSync(markerPath, `${hash}\n`);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  const installed = spawnSync(python, ['-c', 'from importlib.metadata import version; print(version("llama-cpp-python"))'], { encoding: 'utf-8' });
  const installedVersion = installed.status === 0 ? installed.stdout.trim().match(/^(\d+)\.(\d+)\.(\d+)/) : null;
  if (installedVersion && (Number(installedVersion[1]) > 0 || Number(installedVersion[2]) > 3
    || (Number(installedVersion[2]) === 3 && Number(installedVersion[3]) >= 26))) return true;

  const torch = spawnSync(python, ['-c', 'import torch; print(torch.version.cuda or "")'], { encoding: 'utf-8' });
  const cuda = torch.status === 0 ? torch.stdout.trim() : '';
  const wheelArgs = ['-m', 'pip', 'install', 'llama-cpp-python>=0.3.26', '--only-binary=llama-cpp-python'];
  if (process.platform === 'win32' && cuda !== '13.0') {
    log('DaSiWa Director is ready; local GGUF Prompt Forge needs a matching prebuilt llama-cpp-python wheel or another Forge backend.');
    return true;
  }
  if (process.platform === 'win32') {
    wheelArgs.push('--extra-index-url', 'https://abetlen.github.io/llama-cpp-python/whl/cu130');
  }
  const wheel = spawnSync(python, wheelArgs, { stdio: 'inherit' });
  if (wheel.status !== 0) {
    log('DaSiWa Director is ready; local GGUF Prompt Forge could not install a prebuilt llama-cpp-python wheel.');
  }
  return true;
}
