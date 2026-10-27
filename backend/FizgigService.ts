import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { inspectFizgig } from '../setup/Fizgig';
import { ownedPath } from '../setup/ComfyPythonRuntime';
import { fizgigPort } from '../shared/fizgig';
import { inspectLoopbackListeners } from '../shared/loopbackListener';
import { claimToolMaintenance, readToolMaintenance } from '../shared/toolMaintenanceLock';

export async function probeFizgig(url: string, request: typeof fetch = fetch) {
  try {
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(1500) });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('text/html')) return false;
    return (await response.text()).slice(0, 8192).includes('name="fizgig-token"');
  } catch { return false; }
}

export class FizgigService {
  private child: ChildProcess | null = null;
  private starting = false;
  private appKey = '';
  private cached: { at: number; value: ReturnType<typeof inspectFizgig> } | null = null;
  constructor(private root: string) {}
  private listenerOwned(port: number, python: string, path: string) {
    if (this.child && this.child.exitCode === null && !this.child.killed) return true;
    // Recover a managed UI after Studio restarts, only by matching the listener's
    // actual interpreter and absolute entry point. A stored PID is not ownership.
    const script = join(path, 'fizgig.py');
    if (process.platform === 'win32') {
      const encodedPython = Buffer.from(python.replaceAll('\\', '/').toLowerCase()).toString('base64');
      const encodedScript = Buffer.from(script.replaceAll('\\', '/').toLowerCase()).toString('base64');
      const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; $py=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPython}')); $script=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedScript}')); $owners=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); if($owners.Count -ne 1){exit 1}; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owners[0]); if(([string]$p.ExecutablePath).Replace('\\','/').ToLowerInvariant() -eq $py -and ([string]$p.CommandLine).Replace('\\','/').ToLowerInvariant().Contains($script)){ 'owned' }`], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      return result.status === 0 && result.stdout.trim() === 'owned';
    }
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 3000 });
    const pids = [...new Set(result.stdout.trim().split(/\s+/))];
    if (result.status !== 0 || pids.length !== 1 || !/^\d+$/.test(pids[0])) return false;
    const command = spawnSync('ps', ['-p', pids[0], '-o', 'args='], { encoding: 'utf8', timeout: 3000 });
    return command.status === 0 && command.stdout.includes(python) && command.stdout.includes(script);
  }
  async status() {
    if (!this.cached || Date.now() - this.cached.at > 15000) this.cached = { at: Date.now(), value: inspectFizgig(this.root) };
    const tool = this.cached.value;
    const port = fizgigPort();
    const url = `http://127.0.0.1:${port}/`;
    const probes = await inspectLoopbackListeners(port);
    const listening = probes.some(probe => probe.state === 'listening');
    const childAlive = !!this.child && this.child.exitCode === null && !this.child.killed;
    const running = listening || childAlive;
    const owned = listening && this.listenerOwned(port, tool.python, tool.path);
    // Never embed or claim an unrelated process solely because it uses our default port.
    const healthy = owned && await probeFizgig(url);
    return { installed: tool.installed, ready: tool.ready, running, healthy, owned, canStop: !!this.child && !!this.appKey, url, port,
      error: !tool.ready ? tool.error : listening && !owned ? 'This port is occupied by an independently started process. Use that trainer directly; Umbra will not stop or adopt it.' : '',
      maintenance: !!readToolMaintenance(this.root, 'fizgig') };
  }
  async launch() {
    if (this.starting || (this.child && this.child.exitCode === null && !this.child.killed)) throw new Error('Fizgig is already starting or running.');
    const release = claimToolMaintenance(this.root, 'fizgig');
    this.starting = true;
    try {
      this.cached = null;
      const status = await this.status();
      if (status.owned) return status;
      if (!status.ready) throw new Error(status.error);
      if ((await inspectLoopbackListeners(status.port)).some(probe => probe.state !== 'closed')) throw new Error('Fizgig port is busy or unverified. No existing process was changed.');
      const tool = this.cached!.value;
      const logs = ownedPath(this.root, 'User', 'Logs'); mkdirSync(logs, { recursive: true });
      const descriptor = openSync(join(logs, 'fizgig.log'), 'a');
      try {
        // Detached lifetime protects training if Studio closes. Stop training/close via Fizgig itself.
        // Explicit host and port prevent upstream's automatic LAN binding and port walking.
        const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: '1' };
        for (const key of ['FIZGIG_APP_PARENT', 'FIZGIG_APP_KEY', 'FIZGIG_RESTARTED', 'FIZGIG_PASSWORD', 'FIZGIG_POD', 'RUNPOD_POD_ID', 'VNC_PASSWORD', 'PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV']) delete env[key];
        this.appKey = randomBytes(32).toString('hex');
        env.FIZGIG_APP_KEY = this.appKey;
        this.child = spawn(tool.python, [join(tool.path, 'fizgig.py'), '--web', '--host', '127.0.0.1', '--port', String(status.port)], {
          cwd: tool.path, env, windowsHide: true, detached: true, stdio: ['ignore', descriptor, descriptor],
        });
        const child = this.child;
        child.on('error', () => { if (this.child === child) this.child = null; });
        child.on('exit', () => { if (this.child === child) this.child = null; });
        child.unref();
      } finally { closeSync(descriptor); }
      return { success: true, starting: true };
    } finally { this.starting = false; release(); }
  }
  async stop() {
    const child = this.child;
    if (!child || !this.appKey || child.exitCode !== null) throw new Error('This Fizgig process was not launched by this Studio session. Close it from its original session.');
    const status = await this.status();
    if (!status.owned || !status.healthy) throw new Error('Cannot verify the Fizgig process. It has been left running.');
    const response = await fetch(`${status.url}api/app/busy`, { method: 'POST', headers: { 'X-Fizgig-App-Key': this.appKey }, signal: AbortSignal.timeout(2000) });
    const busy = await response.json() as { training?: boolean };
    if (!response.ok || busy.training !== false) throw new Error('Finish or pause training in Fizgig before closing it. No training was stopped.');
    if (this.child !== child) throw new Error('Fizgig process changed. Refresh its status.');
    child.kill('SIGTERM');
    return { success: true };
  }
}
