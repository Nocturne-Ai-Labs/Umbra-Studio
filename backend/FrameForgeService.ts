import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { frameForgePaths, inspectFrameForge, frameForgeCommand, frameForgeRunning } from '../setup/FrameForge';
import { claimToolMaintenance } from '../shared/toolMaintenanceLock';

export class FrameForgeService {
  private child: ChildProcess | null = null;
  private url = '';
  private pending: Promise<string> | null = null;
  private stopping = false;
  constructor(private root: string) {}
  status() { return { ...inspectFrameForge(this.root), url: this.child?.exitCode === null ? this.url : '' }; }
  start(comfyUrl: string): Promise<string> {
    if (this.pending) return this.pending;
    if (this.child?.exitCode === null && this.url) return Promise.resolve(this.url);
    const release = claimToolMaintenance(this.root, 'frameforge');
    this.stopping = false;
    this.pending = this.launch(comfyUrl).finally(() => { this.pending = null; release(); });
    return this.pending;
  }
  private async launch(comfyUrl: string) {
    if (!inspectFrameForge(this.root).installed) throw new Error('Install Frame Forge in Umbra Setup → Tools first.');
    if (frameForgeRunning(this.root)) throw new Error('An existing Frame Forge process is still running. Close it before launching another copy.');
    const p = frameForgePaths(this.root);
    mkdirSync(p.data, { recursive: true });
    // Initialize only a new library through upstream's Store API; never replace saved settings or projects.
    await frameForgeCommand(p.python, ['-c', 'import sys; from pathlib import Path; from editor.store import Store; p=Path(sys.argv[1]); fresh=not (p/"library.json").exists(); s=Store(p);\nif fresh: s.data["settings"]["comfy_url"]=sys.argv[2]; s.save()', p.data, comfyUrl], p.app);
    if (this.stopping) throw new Error('Frame Forge launch was cancelled.');
    const probe = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response() });
    const port = probe.port; probe.stop(true);
    mkdirSync(dirname(p.running), { recursive: true });
    const log = openSync(join(p.data, 'umbra-service.log'), 'a');
    const child = spawn(p.python, ['run.py', '--local-only', '--port', String(port), '--data', p.data], { cwd: p.app, windowsHide: true, stdio: ['ignore', log, log] });
    closeSync(log);
    this.child = child;
    let failure = '';
    child.on('error', error => { failure = error.message; });
    child.once('exit', () => {
      if (this.child === child) { this.child = null; this.url = ''; try { unlinkSync(p.running); } catch { /* Already cleared. */ } }
    });
    if (child.pid) writeFileSync(p.running, JSON.stringify({ pid: child.pid, ownerPid: process.pid, port }));
    const origin = `http://127.0.0.1:${port}`;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (failure || this.stopping || child.exitCode !== null || child.signalCode !== null) break;
      const ready = await fetch(`${origin}/api/hosting`, { signal: AbortSignal.timeout(500) }).then(r => r.ok).catch(() => false);
      if (ready && child.exitCode === null) { this.url = origin; return origin; }
      await Bun.sleep(250);
    }
    await this.stop();
    throw new Error(failure || 'Frame Forge did not start. Review User/FrameForge/umbra-service.log.');
  }
  async stop() {
    this.stopping = true;
    const child = this.child;
    if (!child) return;
    child.kill();
    for (let n = 0; n < 40 && child.exitCode === null && child.signalCode === null; n++) await Bun.sleep(100);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    this.url = '';
  }
}
