import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { managedChildPath } from './ManagedToolRequirements';
import { ensureFrameForgePython, ensureSetupGit, managedGitForTool } from './ComfyPythonRuntime';

export const FRAMEFORGE_REPO = 'https://github.com/spacesimeco-hue/Chain-Motion-AI-Video-Editor';
export const FRAMEFORGE_COMMIT = 'a1dce2d34b543ca8ee7f74c3eeee258914e1ee22';
export function frameForgePaths(root: string) {
  const home = managedChildPath(root, 'Tools/FrameForge');
  return { home, app: managedChildPath(home, 'app'), python: managedChildPath(home, process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python'),
    data: managedChildPath(root, 'User/FrameForge'), receipt: managedChildPath(home, 'umbra-install.json'), running: managedChildPath(root, 'User/Config/frameforge-process.json') };
}
export function frameForgeRunning(root: string): boolean {
  const path = frameForgePaths(root).running;
  if (!existsSync(path)) return false;
  try { const { pid } = JSON.parse(readFileSync(path, 'utf8')); if (!Number.isInteger(pid) || pid <= 0) return true; process.kill(pid, 0); return true; }
  catch (error: any) { return error.code !== 'ESRCH'; }
}
export function inspectFrameForge(root: string) {
  const paths = frameForgePaths(root);
  let commit = ''; try { commit = JSON.parse(readFileSync(paths.receipt, 'utf8')).commit; } catch { /* Not installed. */ }
  return { installed: Boolean(commit && existsSync(paths.python) && existsSync(join(paths.app, 'run.py'))), commit,
    updateRequired: commit !== FRAMEFORGE_COMMIT, running: frameForgeRunning(root) };
}
export function frameForgeCommand(command: string, args: string[], cwd: string, log: (line: string) => void = () => {}, onChild?: (pid: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    if (child.pid && onChild) { try { onChild(child.pid); } catch (error) { child.kill(); reject(error); return; } }
    let output = '';
    child.stdout.on('data', chunk => { output += String(chunk); log(String(chunk).trimEnd()); });
    child.stderr.on('data', chunk => log(String(chunk).trimEnd()));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output.trim()) : reject(new Error(`Frame Forge ${args[0]} failed (${code}); review the Setup log.`)));
  });
}
export async function installFrameForge(root: string, log: (line: string) => void, onChild?: (pid: number) => void) {
  if (frameForgeRunning(root)) throw new Error('Stop Frame Forge before installation. Its existing library was preserved.');
  const p = frameForgePaths(root);
  mkdirSync(p.home, { recursive: true });
  await ensureSetupGit(root, log);
  const git = managedGitForTool(p.home);
  const command = (binary: string, args: string[], cwd: string) => frameForgeCommand(binary, args, cwd, log, onChild);
  const run = (args: string[]) => command(git, args, p.app);
  const fresh = !existsSync(p.app);
  if (fresh) await command(git, ['clone', '--', FRAMEFORGE_REPO + '.git', 'app'], p.home);
  const top = await run(['rev-parse', '--show-toplevel']);
  if (top.replaceAll('\\', '/').toLowerCase() !== p.app.replaceAll('\\', '/').toLowerCase()) throw new Error('Frame Forge must have its own checkout. Existing files were preserved.');
  if (await run(['status', '--porcelain', '--untracked-files=no'])) throw new Error('Frame Forge contains local source changes. Review them before updating.');
  const origin = await run(['remote', 'get-url', 'origin']);
  if (origin.replace(/\.git$/, '') !== FRAMEFORGE_REPO) throw new Error('Frame Forge checkout uses a different upstream repository.');
  await run(['fetch', 'origin', FRAMEFORGE_COMMIT]);
  const head = await run(['rev-parse', 'HEAD']);
  if (head !== FRAMEFORGE_COMMIT) {
    if (!fresh) await run(['merge-base', '--is-ancestor', head, FRAMEFORGE_COMMIT]);
    await run(['checkout', '--detach', FRAMEFORGE_COMMIT]);
  }
  const python = await ensureFrameForgePython(p.home, log);
  if (!existsSync(p.python)) await command(python, ['-m', 'venv', join(p.home, '.venv')], p.home);
  await command(p.python, ['-m', 'pip', 'install', '-r', join(p.app, 'requirements.txt')], p.home);
  await command(p.python, ['-c', 'import fastapi,uvicorn,multipart,requests,websocket,imageio_ffmpeg,PIL; print("Frame Forge dependencies verified")'], p.app);
  writeFileSync(p.receipt, JSON.stringify({ commit: FRAMEFORGE_COMMIT, installedAt: new Date().toISOString() }));
  log('Frame Forge installed. Install its H3 Motion Context dependency bundle in Tools; choose generation models separately.');
}
