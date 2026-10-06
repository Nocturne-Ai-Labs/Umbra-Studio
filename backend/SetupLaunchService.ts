import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

let active: { root: string; url: string; child: ReturnType<typeof spawn> } | null = null;
let pending: Promise<string> | null = null;

export async function openToolsSetup(runtimeRoot: string, sourceRoot: string): Promise<string> {
  if (active?.root === runtimeRoot && active.child.exitCode === null) {
    const url = new URL('/api/health', active.url);
    url.searchParams.set('token', new URL(active.url).searchParams.get('token') || '');
    const health = await fetch(url, { signal: AbortSignal.timeout(1500) }).then(response => response.json()).catch(() => null) as any;
    if (health?.runtimeRoot === runtimeRoot) return active.url;
  }
  if (pending) return pending;
  pending = new Promise<string>((ok, fail) => {
    const bundled = join(sourceRoot, 'setup', 'UmbraSetupApp.js');
    const script = existsSync(bundled) ? bundled : join(sourceRoot, 'setup', 'UmbraSetupApp.ts');
    const child = spawn(process.execPath, [script, '--root', runtimeRoot, '--source', sourceRoot, '--port', '0', '--tab', 'tools', '--token', randomUUID(), '--no-open'],
      { cwd: runtimeRoot, env: { ...process.env, UMBRA_ROOT: runtimeRoot }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const timer = setTimeout(() => { child.kill(); fail(new Error('Umbra Setup did not become ready.')); }, 15000);
    child.once('error', error => { clearTimeout(timer); fail(error); });
    child.once('exit', () => { clearTimeout(timer); if (active?.child === child) active = null; fail(new Error('Umbra Setup closed before becoming ready.')); });
    child.stderr?.resume();
    child.stdout?.on('data', chunk => {
      output = (output + String(chunk)).slice(-8192);
      const match = output.match(/\[UmbraSetup\] Ready: (http:\/\/127\.0\.0\.1:\d+\/\?[^\s]+)/);
      if (!match) return;
      clearTimeout(timer); active = { root: runtimeRoot, url: match[1], child }; ok(match[1]);
    });
  });
  try { return await pending; } finally { pending = null; }
}
