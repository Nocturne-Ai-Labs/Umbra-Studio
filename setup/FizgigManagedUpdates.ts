import { join } from 'node:path';
import { existsSync, readFileSync, writeFileSync, symlinkSync, lstatSync, realpathSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { managedGitForTool, ownedPath } from './ComfyPythonRuntime';

const guidance = 'Fizgig is managed by Umbra. Finish training and close Fizgig, then open Umbra Setup > Advanced > Tools > Fizgig > Update. Setup installs the reviewed version and verifies its dependencies.';
const files = ['update_fizgig.bat', 'update_fizgig_rocm.bat', 'update_fizgig.sh', 'update_fizgig.py', 'install_fizgig_rocm.sh', 'install_fizgig_rocm.bat', 'src/fizgig/web/server.py', 'src/fizgig/web/app_window.py'];
const normalize = (text: string) => text.replaceAll('\r\n', '\n');

/** Recognize legacy Umbra edits for removal only. Never install these adapters. */
export function guardedFizgigSource(file: string, original: string): string {
  const source = normalize(original);
  if (file.endsWith('.bat')) return source.replace(/^@echo off\n/i, `@echo off\nif exist "%~dp0.umbra-environment.json" (\n  echo ${guidance.replaceAll('>', '^>')}\n  pause\n  exit /b 1\n)\n`);
  if (file.endsWith('.sh')) return source.replace(/^(#![^\n]+\n)/, `$1if [ -e "$(dirname "$0")/.umbra-environment.json" ]; then\n    printf '%s\\n' '${guidance}'\n    exit 1\nfi\n`);
  if (file === 'update_fizgig.py') return source.replace('HERE = os.path.dirname(os.path.abspath(__file__))\n', `HERE = os.path.dirname(os.path.abspath(__file__))\nif os.path.exists(os.path.join(HERE, ".umbra-environment.json")):\n    print(${JSON.stringify(guidance)})\n    sys.exit(1)\n`);
  if (file.endsWith('/server.py')) return source.replace('    return {"version": v or "unknown", "update": how,', `    if os.path.exists(os.path.join(BASE_DIR, ".umbra-environment.json")):\n        how = ${JSON.stringify(guidance)}\n    return {"version": v or "unknown", "update": how,`);
  return source.replace('def _update_how():\n', `def _update_how():\n    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".umbra-environment.json")):\n        return ${JSON.stringify(guidance)}\n`);
}

/** Restore only exact legacy Umbra modifications; leave all unrelated upstream/user edits intact. */
export function restoreFizgigUpdateAdapters(root: string) {
  const path = ownedPath(root, 'Tools', 'Fizgig');
  const git = managedGitForTool(path);
  const entries: { target: string; original: string }[] = [];
  for (const file of files) {
    const target = ownedPath(root, 'Tools', 'Fizgig', file);
    if (!existsSync(target)) continue;
    const result = spawnSync(git, ['show', `HEAD:${file}`], { cwd: path, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (result.status !== 0) continue;
    const original = normalize(result.stdout);
    const current = normalize(readFileSync(target, 'utf8'));
    if (current === original || current !== guardedFizgigSource(file, original)) continue;
    const staged = spawnSync(git, ['diff', '--cached', '--quiet', '--', file], { cwd: path, windowsHide: true, timeout: 10000 });
    if (staged.status !== 0) continue;
    entries.push({ target, original: result.stdout });
  }
  for (const entry of entries) writeFileSync(entry.target, entry.original);
}

/** Upstream launchers/updaters expect venv. Adapt the installation, not upstream source. */
export function prepareFizgigNativeUpdates(root: string) {
  restoreFizgigUpdateAdapters(root);
  const path = ownedPath(root, 'Tools', 'Fizgig');
  const marker = ownedPath(root, 'Tools', 'Fizgig', '.umbra-environment.json');
  if (!existsSync(marker)) return;
  const { environment } = JSON.parse(readFileSync(marker, 'utf8'));
  if (!/^venv(?:-umbra-[a-f0-9-]+)?$/.test(environment)) throw new Error('Invalid Fizgig environment record.');
  const target = ownedPath(root, 'Tools', 'Fizgig', environment);
  const alias = join(path, 'venv'); // Deliberate native-layout alias; validated below.
  if (environment !== 'venv' && existsSync(target)) {
    if (existsSync(alias) && realpathSync(alias) !== realpathSync(target)) {
      if (!lstatSync(alias).isSymbolicLink()) throw new Error('Fizgig already has a different native venv; preserve it before reconciling environments.');
      const old = realpathSync(alias);
      if (!old.startsWith(path + '/') && !old.startsWith(path + '\\')) throw new Error('Fizgig venv points outside its installation.');
      unlinkSync(alias);
    }
    if (!existsSync(alias)) symlinkSync(target, alias, process.platform === 'win32' ? 'junction' : 'dir');
  }
  // A tracking branch lets the official updater use git pull, while retaining this exact revision.
  const git = managedGitForTool(path);
  const run = (args: string[]) => spawnSync(git, args, { cwd: path, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (run(['symbolic-ref', '-q', 'HEAD']).status === 0) return;
  const upstream = run(['symbolic-ref', 'refs/remotes/origin/HEAD']);
  const ref = upstream.stdout.trim();
  if (upstream.status !== 0 || !ref.startsWith('refs/remotes/origin/')) return;
  const branch = 'umbra-native-updates';
  if (run(['show-ref', '--verify', '--quiet', `refs/heads/${branch}`]).status === 0) {
    if (run(['rev-parse', branch]).stdout.trim() !== run(['rev-parse', 'HEAD']).stdout.trim()) return;
    if (run(['switch', branch]).status !== 0) return;
  } else if (run(['switch', '-c', branch]).status !== 0) return;
  run(['branch', '--set-upstream-to', ref.replace('refs/remotes/', ''), branch]);
}
