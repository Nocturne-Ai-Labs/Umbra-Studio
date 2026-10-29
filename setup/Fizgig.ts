import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ensureFizgigPython, ensureSetupGit, ownedPath } from './ComfyPythonRuntime';
import { FIZGIG_REPOSITORY, FIZGIG_REVISION, fizgigPort } from '../shared/fizgig';
import { inspectLoopbackListeners } from '../shared/loopbackListener';
import { protectFizgigUpdates, restoreFizgigUpdateAdapters, validateFizgigUpdateAdapters } from './FizgigManagedUpdates';

export function fizgigPaths(root: string) {
  const path = ownedPath(root, 'Tools', 'Fizgig');
  let environment = 'venv';
  const marker = ownedPath(root, 'Tools', 'Fizgig', '.umbra-environment.json');
  if (existsSync(marker)) {
    const saved = JSON.parse(readFileSync(marker, 'utf8'));
    if (!/^venv(?:-umbra-[a-f0-9-]+)?$/.test(saved.environment)) throw new Error('Invalid Fizgig environment record.');
    environment = saved.environment;
  }
  return { path, marker, python: ownedPath(root, 'Tools', 'Fizgig', environment, ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python'])) };
}

const verifyScript = "import sys; sys.path.insert(0,'src'); import torch, transformers, accelerate, safetensors, PIL, psutil; import fizgig.web.server; print('UMBRA_FIZGIG_OK')";
export function inspectFizgig(root: string, verify = true) {
  const paths = fizgigPaths(root);
  const installed = ['fizgig.py', 'requirements.txt', 'src/fizgig/web/server.py', 'src/fizgig/web/static/index.html'].every(file => existsSync(ownedPath(root, 'Tools', 'Fizgig', file)));
  const result = installed && existsSync(paths.python) && verify ? spawnSync(paths.python, ['-c', "import importlib.util; assert all(importlib.util.find_spec(x) for x in ['torch','transformers','accelerate','safetensors','PIL','psutil']); print('UMBRA_FIZGIG_OK')"], { cwd: paths.path, encoding: 'utf8', windowsHide: true, timeout: 3000 }) : null;
  const ready = !!result && result.status === 0 && result.stdout.includes('UMBRA_FIZGIG_OK');
  return { ...paths, installed, ready, error: ready ? '' : installed ? 'Fizgig dependencies need verification or repair in Umbra Setup.' : 'Install Fizgig in Umbra Setup.' };
}

export async function assertFizgigStopped(root: string) {
  const { path } = fizgigPaths(root);
  // No Fizgig here means a separate trainer elsewhere is not ours to inspect or stop.
  if (!existsSync(path)) return;
  const listener = await inspectLoopbackListeners(fizgigPort());
  if (listener.some(item => item.state !== 'closed')) throw new Error('Close Fizgig and its training workers before maintenance. Its port is occupied or could not be verified.');
  const target = path.replaceAll('\\', '/').toLowerCase() + '/';
  const encoded = Buffer.from(target).toString('base64');
  const result = process.platform === 'win32'
    ? spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; $target=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encoded}')); $active=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ([string]$_.CommandLine).Replace('\\','/').ToLowerInvariant().Contains($target) }).Count -gt 0; if($active){'active'}else{'stopped'}`], { encoding: 'utf8', windowsHide: true, timeout: 10000 })
    : spawnSync('ps', ['-eo', 'args='], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error('Could not verify that Fizgig training has stopped. No files were changed.');
  const active = process.platform === 'win32' ? result.stdout.trim() !== 'stopped' : result.stdout.split('\n').some(line => line.replaceAll('\\', '/').toLowerCase().includes(target));
  if (active) throw new Error('Fizgig or a training worker is still running. Finish training and close it before maintenance.');
}

export async function installFizgig(root: string, log: (line: string) => void) {
  await assertFizgigStopped(root);
  await ensureSetupGit(root, log);
  const basePython = await ensureFizgigPython(root, log);
  const { path, marker } = fizgigPaths(root);
  mkdirSync(ownedPath(root, 'Tools'), { recursive: true });
  const installerEnv = { ...process.env, PYTHONUNBUFFERED: '1', DISABLE_CUDA: '1' };
  // Do not inherit another managed tool's interpreter or dependency constraints.
  for (const key of ['VIRTUAL_ENV', 'PYTHONHOME', 'PYTHONPATH', 'PIP_CONSTRAINT', 'PIP_BUILD_CONSTRAINT', 'UV_CONSTRAINT', 'UV_PROJECT_ENVIRONMENT']) delete (installerEnv as NodeJS.ProcessEnv)[key];
  const run = (command: string, args: string[], cwd = path) => {
    log(`Fizgig: ${args[0]} ${args[1] || ''}`);
    const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true, env: installerEnv });
    if (result.status !== 0) throw new Error('Fizgig installation failed. Review the dependency output above; the previous environment is retained.');
  };
  if (!existsSync(path)) run('git', ['clone', '--no-checkout', FIZGIG_REPOSITORY, path], join(root, 'Tools'));
  const git = (args: string[]) => spawnSync('git', args, { cwd: path, encoding: 'utf8', windowsHide: true, timeout: 15000 });
  const origin = git(['remote', 'get-url', 'origin']);
  if (origin.status !== 0 || origin.stdout.trim().replace(/\.git$/, '') !== FIZGIG_REPOSITORY.replace(/\.git$/, '')) throw new Error('Fizgig folder has a different upstream. Keep it intact and review its origin.');
  if (existsSync(marker)) restoreFizgigUpdateAdapters(root);
  try {
    const previous = git(['rev-parse', '--verify', 'HEAD']);
    const dirty = git(['diff', '--name-only', 'HEAD']);
    // A new --no-checkout clone has no index; checkout is safe only for that fresh path.
    const hasSource = existsSync(join(path, 'fizgig.py'));
    if (hasSource && (dirty.status !== 0 || dirty.stdout.trim() || git(['diff', '--cached', '--name-only']).stdout.trim())) throw new Error('Fizgig has local source changes. Preserve and review them before updating.');
    run('git', ['fetch', 'origin', FIZGIG_REVISION]);
    if (hasSource && previous.stdout.trim() !== FIZGIG_REVISION && git(['merge-base', '--is-ancestor', previous.stdout.trim(), FIZGIG_REVISION]).status !== 0) throw new Error('Installed Fizgig is newer or divergent. Umbra will not downgrade it.');
    if (hasSource && previous.stdout.trim() === FIZGIG_REVISION && inspectFizgig(root).ready) { log('Fizgig is already installed at the reviewed revision.'); return; }
    run('git', ['checkout', '--detach', FIZGIG_REVISION]);
    try {
      validateFizgigUpdateAdapters(root);
      const environment = `venv-umbra-${randomUUID()}`;
      const envPath = ownedPath(root, 'Tools', 'Fizgig', environment);
      run(basePython, ['-m', 'venv', '--copies', envPath]);
      const python = join(envPath, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
      run(python, ['-m', 'pip', 'install', 'uv']);
      // Upstream splits torch's CUDA index from ordinary PyPI dependencies and disables HQQ's optional CUDA build.
      run(python, ['uv_install_deps.py', 'requirements.txt', envPath]);
      run(python, ['-c', verifyScript]);
      const temporary = ownedPath(root, 'Tools', 'Fizgig', '.umbra-environment.json.tmp');
      writeFileSync(temporary, JSON.stringify({ environment, revision: FIZGIG_REVISION }));
      renameSync(temporary, marker);
      log('Fizgig verified. Models are selected separately in its native UI. Previous environments and user_data are preserved.');
    } catch (error) {
      if (hasSource && previous.status === 0) run('git', ['checkout', '--detach', previous.stdout.trim()]);
      throw error;
    }
  } finally {
    protectFizgigUpdates(root);
  }
}
