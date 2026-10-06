import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

// Official release artifacts, including headers/libs needed by custom-node builds.
export const COMFY_PYTHON_ARTIFACTS = {
  win32: { url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.13.16%2B20261003-x86_64-pc-windows-msvc-install_only.tar.gz', bytes: 47421192, sha256: '5e100ee3d592ff500f4408a624f054d202e32d9dba8a12b2226bef81083fd778' },
  linux: { url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.13.16%2B20261003-x86_64-unknown-linux-gnu-install_only.tar.gz', bytes: 75271871, sha256: '0a0272910b10417c659a9312fb3f2d7a6d774da7bd510999be7a3ba83273dc1f' },
};
export const AITOOLKIT_PYTHON_ARTIFACTS = {
  win32: { url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.12.15%2B20261003-x86_64-pc-windows-msvc-install_only.tar.gz', bytes: 46509797, sha256: '4b6f0beebbb695a0f3ea237b8c3eaa5bd424f47a7bc25b2fbe3a43390c770f08' },
  linux: { url: 'https://github.com/astral-sh/python-build-standalone/releases/download/20261003/cpython-3.12.15%2B20261003-x86_64-unknown-linux-gnu-install_only.tar.gz', bytes: 66924371, sha256: 'f937814031eab4698ca6d07ec606ede1825768f3f3e99af76d9db3900bee03c5' },
};
export const PORTABLE_GIT_ARTIFACT = { url: 'https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.2/MinGit-2.56.0.2-64-bit.zip', bytes: 39806486, sha256: 'da35e72aa21c005a5a0d298cfbae110bc1609a815730ea0dde84b01a1b3cd3be' };

function managedPythonPatch(version: '3.12' | '3.13'): string {
  const artifacts = version === '3.13' ? COMFY_PYTHON_ARTIFACTS : AITOOLKIT_PYTHON_ARTIFACTS;
  const patch = artifacts.win32.url.match(/cpython-(\d+\.\d+\.\d+)%2B/i)?.[1];
  if (!patch || !artifacts.linux.url.includes(`cpython-${patch}%2B`)) throw new Error('Managed Python platform pins disagree.');
  return patch;
}

export function ownedPath(root: string, ...parts: string[]): string {
  const base = resolve(root), target = resolve(base, ...parts);
  if (!target.startsWith(base + sep)) throw new Error('Runtime path is outside the selected Umbra installation.');
  let current = base;
  if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Redirected runtime roots are unsupported.');
  for (const part of target.slice(base.length + 1).split(sep)) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error(`Redirected runtime path: ${current}`);
  }
  return target;
}

export function inspectComfyPython(toolRoot: string) { return inspectToolPython(toolRoot, '3.13'); }
export function inspectAIToolkitPython(toolRoot: string) { return inspectToolPython(toolRoot, '3.12'); }

export function inspectToolPython(toolRoot: string, target: '3.12' | '3.13') {
  const environments = ['venv', 'env', '.venv'].filter(name => existsSync(join(toolRoot, name)));
  const environment = environments[0] || 'venv';
  const python = join(toolRoot, environment, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  const probe = existsSync(python) ? spawnSync(python, ['-I', '-c', 'import sys,ssl,venv,pip,json; print(json.dumps({"version":sys.version.split()[0],"prefix":sys.prefix,"base":sys.base_prefix}))'], { encoding: 'utf8', windowsHide: true, timeout: 5000 }) : null;
  let version = '';
  try {
    if (probe?.status === 0) {
      const value = JSON.parse(probe.stdout.trim());
      const canonical = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
      if (canonical(value.prefix) === canonical(join(toolRoot, environment))) version = typeof value.version === 'string' ? value.version : '';
    }
  } catch { /* Unverified interpreter. */ }
  const targetVersion = managedPythonPatch(target);
  return { python, environment, version, targetVersion, healthy: Boolean(version), target, upgradeAvailable: version !== targetVersion, multipleEnvironments: environments.length > 1 };
}

export function comfyPackageRoots(root: string): string[] {
  const comfy = ownedPath(root, 'Tools', 'ComfyUI');
  if (process.platform === 'win32') return [ownedPath(comfy, 'venv', 'Lib', 'site-packages')];
  const lib = ownedPath(comfy, 'venv', 'lib');
  return existsSync(lib) ? readdirSync(lib).filter(name => /^python3\.[0-9]+$/.test(name))
    .map(name => ownedPath(comfy, 'venv', 'lib', name, 'site-packages')).filter(existsSync) : [];
}

export function managedGitForTool(toolRoot: string): string {
  let path = resolve(toolRoot);
  for (let depth = 0; depth < 6; depth++, path = dirname(path)) {
    if (basename(path).toLowerCase() !== 'tools') continue;
    const git = ownedPath(dirname(path), 'Runtime', 'Git', 'cmd', 'git.exe');
    if (process.platform === 'win32' && existsSync(git)) return git;
    break;
  }
  return 'git';
}

export async function downloadPinnedRuntime(artifact: { url: string; bytes: number; sha256: string }, destination: string, log: (line: string) => void) {
  const response = await fetch(artifact.url, { signal: AbortSignal.timeout(15 * 60_000) });
  if (!response.ok || !response.body) throw new Error(`Runtime download failed: HTTP ${response.status}`);
  const fd = openSync(destination, 'wx'), hash = createHash('sha256');
  const reader = response.body.getReader();
  let bytes = 0, lastProgress = -1;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > artifact.bytes) throw new Error('Runtime download exceeds its pinned size.');
      hash.update(result.value);
      let offset = 0;
      while (offset < result.value.byteLength) offset += writeSync(fd, result.value, offset);
      const progress = Math.floor(bytes / artifact.bytes * 10) * 10;
      if (progress !== lastProgress) { log(`Runtime download: ${progress}% (${bytes}/${artifact.bytes} bytes)`); lastProgress = progress; }
    }
    if (bytes !== artifact.bytes || hash.digest('hex') !== artifact.sha256) throw new Error('Runtime download checksum/size verification failed. Nothing was installed.');
  } finally { closeSync(fd); await reader.cancel().catch(() => {}); }
}

function checkedCommand(command: string, args: string[], cwd?: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', windowsHide: true, timeout: 180_000 });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr || result.stdout}`);
  return result.stdout;
}

export function ensureComfyPython(root: string, log: (line: string) => void) { return ensureManagedPython(root, '3.13', 'ComfyUI', log); }
export function ensureAIToolkitPython(root: string, log: (line: string) => void) { return ensureManagedPython(root, '3.12', 'AI Toolkit', log); }

async function ensureManagedPython(root: string, version: '3.12' | '3.13', tool: string, log: (line: string) => void): Promise<string> {
  const folder = 'Python' + version.replace('.', '');
  if (process.arch !== 'x64' || !['win32', 'linux'].includes(process.platform)) throw new Error(`Managed ${tool} Python supports Windows/Linux x64.`);
  const artifact = (version === '3.13' ? COMFY_PYTHON_ARTIFACTS : AITOOLKIT_PYTHON_ARTIFACTS)[process.platform as 'win32' | 'linux'];
  const targetVersion = managedPythonPatch(version);
  const executable = process.platform === 'win32' ? 'python.exe' : `bin/python${version}`;
  const verify = (path: string) => {
    const installed = checkedCommand(path, ['-I', '-c', 'import sys,ssl,pip,venv; print(sys.version.split()[0])']).trim();
    if (installed !== targetVersion) throw new Error(`Expected Python ${targetVersion}, found ${installed}.`);
    return installed;
  };
  const legacy = ownedPath(root, 'Runtime', folder, 'python', executable);
  if (existsSync(legacy)) {
    try {
      const receipt = JSON.parse(readFileSync(ownedPath(root, 'Runtime', folder, 'umbra-runtime.json'), 'utf8'));
      if (receipt.sha256 === artifact.sha256) { log(`Managed ${tool} Python ${verify(legacy)}`); return legacy; }
    } catch { log('Existing base interpreter retained; installing a verified versioned runtime.'); }
  }
  // New patch releases get their own base directory. Retained venv backups still
  // refer to the previous base interpreter and must remain runnable for rollback.
  const home = ownedPath(root, 'Runtime', folder, artifact.sha256.slice(0, 12));
  const python = ownedPath(root, 'Runtime', folder, artifact.sha256.slice(0, 12), 'python', executable);
  if (existsSync(home)) { log(`Managed ${tool} Python ${verify(python)}`); return python; }
  const stage = ownedPath(root, 'Runtime', `.${folder.toLowerCase()}-${randomUUID()}`);
  mkdirSync(stage, { recursive: true });
  const archive = join(stage, 'python.tar.gz');
  log(`Downloading checksum-pinned Python ${version} for ${tool}`);
  await downloadPinnedRuntime(artifact, archive, log);
  const entries = checkedCommand('tar', ['-tzf', archive]).split(/\r?\n/).filter(Boolean);
  if (!entries.length || entries.some(name => !name.startsWith('python/') || name.includes('\\') || name.split('/').includes('..'))) throw new Error('Python archive has an unsafe member path.');
  checkedCommand('tar', ['-xzf', archive, '-C', stage]);
  const stagedPython = join(stage, 'python', process.platform === 'win32' ? 'python.exe' : `bin/python${version}`);
  verify(stagedPython);
  writeFileSync(join(stage, 'umbra-runtime.json'), JSON.stringify(artifact));
  // Keep the verified archive/licenses with the runtime; do not replace an in-use base interpreter.
  mkdirSync(ownedPath(root, 'Runtime', folder), { recursive: true });
  renameSync(stage, home);
  log(`Managed ${tool} Python ${verify(python)} installed`);
  return python;
}

export async function ensureSetupGit(root: string, log: (line: string) => void): Promise<void> {
  const home = ownedPath(root, 'Runtime', 'Git');
  const git = ownedPath(root, 'Runtime', 'Git', 'cmd', 'git.exe');
  if (process.platform !== 'win32') return;
  if (!existsSync(git)) {
    const host = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (host.status === 0) return;
    if (existsSync(home)) throw new Error('Managed Git is incomplete. Retain Runtime/Git for diagnosis before retrying.');
    const stage = ownedPath(root, 'Runtime', `.git-${randomUUID()}`);
    mkdirSync(stage, { recursive: true });
    const archive = join(stage, 'MinGit.zip'), extracted = join(stage, 'extracted');
    log('Downloading checksum-pinned portable Git for Setup');
    await downloadPinnedRuntime(PORTABLE_GIT_ARTIFACT, archive, log);
    const entries = checkedCommand('tar', ['-tf', archive]).split(/\r?\n/).filter(Boolean);
    if (!entries.length || entries.some(name => name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.includes('\\') || name.split('/').includes('..'))) throw new Error('Git archive has an unsafe member path.');
    mkdirSync(extracted);
    checkedCommand('tar', ['-xf', archive, '-C', extracted]);
    checkedCommand(join(extracted, 'cmd', 'git.exe'), ['--version']);
    writeFileSync(join(extracted, 'umbra-runtime.json'), JSON.stringify(PORTABLE_GIT_ARTIFACT));
    renameSync(extracted, home);
  }
  checkedCommand(git, ['--version']);
  process.env.PATH = `${dirname(git)}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH || ''}`;
  log('Setup uses Umbra’s managed portable Git');
}
