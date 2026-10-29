import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { managedGitForTool, ownedPath } from './ComfyPythonRuntime';

const guidance = 'Fizgig is managed by Umbra. Finish training and close Fizgig, then open Umbra Setup > Advanced > Tools > Fizgig > Update. Setup installs the reviewed version and verifies its dependencies.';
const files = ['update_fizgig.bat', 'update_fizgig_rocm.bat', 'update_fizgig.sh', 'update_fizgig.py', 'install_fizgig_rocm.sh', 'install_fizgig_rocm.bat', 'src/fizgig/web/server.py', 'src/fizgig/web/app_window.py'];
const normalize = (text: string) => text.replaceAll('\r\n', '\n');

/** Small, reversible adapters for the reviewed upstream checkout; never accept arbitrary local edits. */
export function guardedFizgigSource(file: string, original: string): string {
  const source = normalize(original);
  if (file.endsWith('.bat')) return source.replace(/^@echo off\n/i, `@echo off\nif exist "%~dp0.umbra-environment.json" (\n  echo ${guidance.replaceAll('>', '^>')}\n  pause\n  exit /b 1\n)\n`);
  if (file.endsWith('.sh')) return source.replace(/^(#![^\n]+\n)/, `$1if [ -e "$(dirname "$0")/.umbra-environment.json" ]; then\n    printf '%s\\n' '${guidance}'\n    exit 1\nfi\n`);
  if (file === 'update_fizgig.py') return source.replace('HERE = os.path.dirname(os.path.abspath(__file__))\n', `HERE = os.path.dirname(os.path.abspath(__file__))\nif os.path.exists(os.path.join(HERE, ".umbra-environment.json")):\n    print(${JSON.stringify(guidance)})\n    sys.exit(1)\n`);
  if (file.endsWith('/server.py')) return source.replace('    return {"version": v or "unknown", "update": how,', `    if os.path.exists(os.path.join(BASE_DIR, ".umbra-environment.json")):\n        how = ${JSON.stringify(guidance)}\n    return {"version": v or "unknown", "update": how,`);
  return source.replace('def _update_how():\n', `def _update_how():\n    if os.path.exists(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".umbra-environment.json")):\n        return ${JSON.stringify(guidance)}\n`);
}

function plan(root: string) {
  const path = ownedPath(root, 'Tools', 'Fizgig');
  return files.map(file => {
    const target = ownedPath(root, 'Tools', 'Fizgig', file);
    const result = spawnSync(managedGitForTool(path), ['show', `HEAD:${file}`], { cwd: path, encoding: 'utf8', windowsHide: true, timeout: 10000 });
    if (result.status !== 0 || !existsSync(target)) throw new Error(`Cannot protect Fizgig updater: ${file} is missing. Repair Fizgig in Umbra Setup.`);
    const original = normalize(result.stdout);
    const guarded = guardedFizgigSource(file, original);
    const current = normalize(readFileSync(target, 'utf8'));
    if (guarded === original) throw new Error(`Fizgig updater layout changed: ${file}. Review its integration before updating.`);
    if (current !== original && current !== guarded) throw new Error(`Fizgig has local changes in ${file}. Preserve and review them before updating.`);
    return { file, target, original, guarded, current };
  });
}

export function protectFizgigUpdates(root: string) {
  if (!existsSync(ownedPath(root, 'Tools', 'Fizgig', '.umbra-environment.json'))) return;
  const entries = plan(root); // Validate every file before writing any adapter.
  for (const entry of entries) if (entry.current !== entry.guarded) writeFileSync(entry.target, entry.guarded);
}

export function validateFizgigUpdateAdapters(root: string) {
  plan(root);
}

export function restoreFizgigUpdateAdapters(root: string) {
  const path = ownedPath(root, 'Tools', 'Fizgig');
  const entries = plan(root);
  const git = managedGitForTool(path);
  const dirty = spawnSync(git, ['diff', 'HEAD', '--name-only'], { cwd: path, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const staged = spawnSync(git, ['diff', '--cached', '--name-only'], { cwd: path, encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (dirty.status !== 0 || staged.status !== 0 || staged.stdout.trim() || dirty.stdout.trim().split('\n').filter(Boolean).some(file => !files.includes(file.trim()))) throw new Error('Fizgig has local source changes. Preserve and review them before updating.');
  for (const entry of entries) if (entry.current !== entry.original) writeFileSync(entry.target, entry.original);
}
