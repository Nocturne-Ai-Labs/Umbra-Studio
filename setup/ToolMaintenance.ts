import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { inspectComfyPython, inspectAIToolkitPython } from './ComfyPythonRuntime';

export type MaintenanceTool = 'comfyui' | 'aitoolkit';
const folders = { comfyui: 'ComfyUI', aitoolkit: 'AI-Toolkit' };

export function toolMaintenanceArgs(tool: unknown, action: unknown, ref: unknown = ''): string[] {
  if (tool !== 'comfyui' && tool !== 'aitoolkit') throw new Error('Choose ComfyUI or AI Toolkit.');
  if (action === 'install') return [tool];
  if (action === 'update') return [`update-${tool}`];
  if (action === 'update_python') return [`update-python-${tool}`];
  if (action === 'update_pytorch') return [`update-pytorch-${tool}`];
  if (tool === 'comfyui') {
    if (action === 'install_core') return ['managed-comfyui'];
    if (action === 'nodes_only') return ['comfy-nodes-only'];
    if (action === 'custom_nodes') return ['comfy-nodes'];
    if (action === 'h3_nodes') return ['comfy-h3-nodes'];
    if (action === 'install_sageattention') return ['install-sageattention-comfyui'];
    if (action === 'set_comfyui_version' && typeof ref === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(ref) && !ref.includes('..')) return ['set-comfyui-version', ref];
  }
  throw new Error('Choose a supported tool maintenance action.');
}

export function inspectToolMaintenance(root: string) {
  return (Object.keys(folders) as MaintenanceTool[]).map(id => {
    const path = join(root, 'Tools', folders[id]);
    const installed = existsSync(join(path, id === 'comfyui' ? 'main.py' : 'run.py'));
    const managedGit = join(root, 'Runtime', 'Git', 'cmd', 'git.exe');
    const git = installed ? spawnSync(process.platform === 'win32' && existsSync(managedGit) ? managedGit : 'git', ['-C', path, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', windowsHide: true, timeout: 3000 }) : null;
    return { id, name: id === 'comfyui' ? 'ComfyUI' : 'AI Toolkit', path, installed, commit: git?.status === 0 ? git.stdout.trim() : '',
      python: installed ? (id === 'comfyui' ? inspectComfyPython(path) : inspectAIToolkitPython(path)) : null };
  });
}

export async function assertAIToolkitStopped(root: string): Promise<void> {
  const settingsFile = join(root, 'User', 'Config', 'settings.json');
  const settings = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8').replace(/^\uFEFF/, '')) : {};
  const configured = settings.app?.['aitoolkit.url'];
  const endpoint = new URL(configured || `http://127.0.0.1:${process.env.UMBRA_AITOOLKIT_PORT || settings.servers?.aitoolkit?.port || 8675}`);
  if (endpoint.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)) throw new Error('AI Toolkit maintenance requires a local managed endpoint.');
  const port = Number(endpoint.port || 80);
  const closed = await new Promise<boolean>(ok => {
    const socket = createConnection({ host: endpoint.hostname.replace(/[\[\]]/g, ''), port });
    const finish = (value: boolean) => { socket.destroy(); ok(value); };
    socket.once('connect', () => finish(false));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED'));
    socket.setTimeout(1500, () => finish(false));
  });
  if (!closed) throw new Error('Stop AI Toolkit through Umbra before installing or updating it. Its configured port is still in use or could not be verified.');
  const path = join(root, 'Tools', 'AI-Toolkit');
  const canonical = (value: string) => value.replace(/\\/g, '/').toLowerCase();
  const target = canonical(existsSync(path) ? realpathSync(path) : path) + '/';
  if (process.platform === 'win32') {
    // Return a bounded result, rather than serializing every host command line.
    // Large Windows process inventories can otherwise truncate the JSON pipe.
    const encodedTarget = Buffer.from(target, 'utf8').toString('base64');
    const command = `$ErrorActionPreference='Stop'; $target=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedTarget}')); $active=@(Get-CimInstance Win32_Process | Where-Object { $_.ProcessId -ne $PID -and ([string]$_.CommandLine).Replace('\\','/').ToLowerInvariant().Contains($target) }).Count -gt 0; if($active){[Console]::WriteLine('active')}else{[Console]::WriteLine('stopped')}`;
    const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (result.status !== 0 || !['active', 'stopped'].includes(result.stdout.trim())) throw new Error('AI Toolkit process shutdown could not be verified. Stop the toolkit and training workers, then retry.');
    if (result.stdout.trim() === 'active') throw new Error('Stop AI Toolkit and its training workers before installing or updating it.');
    return;
  }
  const result = spawnSync('ps', ['-eo', 'args='], { encoding: 'utf8', timeout: 5000 });
  if (result.status !== 0) throw new Error('AI Toolkit process shutdown could not be verified.');
  if (result.stdout.split(/\r?\n/).some(line => canonical(line).includes(target))) throw new Error('Stop AI Toolkit and its training workers before installing or updating it.');
}
