import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { inspectFizgig, assertFizgigStopped } from '../setup/Fizgig';
import { protectFizgigUpdates } from '../setup/FizgigManagedUpdates';
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
  private listenerOwned(port: number, python: string, path: string): number {
    // Recover a managed UI after Studio restarts, only by matching the listener's
    // actual interpreter and absolute entry point. A stored PID is not ownership.
    const script = join(path, 'fizgig.py');
    if (process.platform === 'win32') {
      const encodedPython = Buffer.from(python.replaceAll('\\', '/').toLowerCase()).toString('base64');
      const encodedScript = Buffer.from(script.replaceAll('\\', '/').toLowerCase()).toString('base64');
      const result = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Stop'; $py=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPython}')); $script=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedScript}')); $owners=@(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess -Unique); if($owners.Count -ne 1){exit 1}; $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owners[0]); if(([string]$p.ExecutablePath).Replace('\\','/').ToLowerInvariant() -eq $py -and ([string]$p.CommandLine).Replace('\\','/').ToLowerInvariant().Contains($script)){ $p.ProcessId }`], { encoding: 'utf8', windowsHide: true, timeout: 4000 });
      return result.status === 0 && /^\d+$/.test(result.stdout.trim()) ? Number(result.stdout.trim()) : 0;
    }
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8', timeout: 3000 });
    const pids = [...new Set(result.stdout.trim().split(/\s+/))];
    if (result.status !== 0 || pids.length !== 1 || !/^\d+$/.test(pids[0])) return 0;
    const command = spawnSync('ps', ['-p', pids[0], '-o', 'args='], { encoding: 'utf8', timeout: 3000 });
    return command.status === 0 && command.stdout.includes(python) && command.stdout.includes(script) ? Number(pids[0]) : 0;
  }
  private keyPath() { return ownedPath(this.root, 'Tools', 'Fizgig', '.umbra-session-key'); }
  private restoreKey() {
    try {
      const key = readFileSync(this.keyPath(), 'utf8').trim();
      this.appKey = /^[a-f0-9]{64}$/.test(key) ? key : '';
    } catch { this.appKey = ''; /* Old installations remain visually accessible. */ }
  }
  private async trainingState(url: string): Promise<boolean | null> {
    if (!this.appKey) return null;
    try {
      const response = await fetch(`${url}api/app/busy`, { method: 'POST', redirect: 'error', headers: { 'X-Fizgig-App-Key': this.appKey }, signal: AbortSignal.timeout(2000) });
      if (!response.ok) return null;
      const value = await response.json() as { training?: unknown };
      return typeof value.training === 'boolean' ? value.training : null;
    } catch { return null; }
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
    const pid = listening ? this.listenerOwned(port, tool.python, tool.path) : 0;
    const owned = pid > 0;
    // Never embed or claim an unrelated process solely because it uses our default port.
    const healthy = owned && await probeFizgig(url);
    if (healthy) this.restoreKey();
    const canStop = healthy && await this.trainingState(url) !== null;
    return { installed: tool.installed, ready: tool.ready, running, healthy, owned, canStop, url, port,
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
      await assertFizgigStopped(this.root);
      protectFizgigUpdates(this.root);
      const logs = ownedPath(this.root, 'User', 'Logs'); mkdirSync(logs, { recursive: true });
      const descriptor = openSync(join(logs, 'fizgig.log'), 'a');
      try {
        // Detached lifetime protects training if Studio closes. Stop training/close via Fizgig itself.
        // Explicit host and port prevent upstream's automatic LAN binding and port walking.
        const env: NodeJS.ProcessEnv = { ...process.env, PYTHONUNBUFFERED: '1' };
        for (const key of ['FIZGIG_APP_PARENT', 'FIZGIG_APP_KEY', 'FIZGIG_RESTARTED', 'FIZGIG_PASSWORD', 'FIZGIG_POD', 'RUNPOD_POD_ID', 'VNC_PASSWORD', 'PYTHONHOME', 'PYTHONPATH', 'VIRTUAL_ENV']) delete env[key];
        this.appKey = randomBytes(32).toString('hex');
        const keyFile = this.keyPath();
        const pendingKey = ownedPath(this.root, 'Tools', 'Fizgig', '.umbra-session-key.tmp');
        writeFileSync(pendingKey, this.appKey, { mode: 0o600, flag: 'w' });
        renameSync(pendingKey, keyFile);
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
    const release = claimToolMaintenance(this.root, 'fizgig');
    try {
      const status = await this.status();
      if (!status.owned || !status.healthy || !status.canStop) throw new Error('Cannot verify control of this Fizgig session. It has been left running.');
      const tool = this.cached!.value;
      const pid = this.listenerOwned(status.port, tool.python, tool.path);
      if (!pid) throw new Error('Fizgig process changed. Refresh its status.');
      if (await this.trainingState(status.url) !== false) throw new Error('Finish or pause training in Fizgig before closing it. No training was stopped.');
      if (this.listenerOwned(status.port, tool.python, tool.path) !== pid) throw new Error('Fizgig process changed. Refresh its status.');
      process.kill(pid, 'SIGTERM');
      this.child = null;
      this.appKey = '';
      rmSync(this.keyPath(), { force: true });
      return { success: true };
    } finally { release(); }
  }
}
