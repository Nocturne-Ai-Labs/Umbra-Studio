import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existingUpdaterUrl } from '../launcher/UmbraUpdaterBootstrap';

export type SetupTab = 'tools' | 'models' | 'updates' | 'onboarding';

let active: { root: string; url: string; child: ReturnType<typeof spawn> } | null = null;
let pending: Promise<string> | null = null;

export async function openUmbraSetup(runtimeRoot: string, sourceRoot: string, appPort = Number(process.env.UMBRA_PORT || 8212), tab: SetupTab = 'tools'): Promise<string> {
  const withTab = (value: string) => { const url = new URL(value); url.searchParams.set('tab', tab); return url.toString(); };
  const packaged = existsSync(join(sourceRoot, 'launcher', 'UmbraUpdaterBootstrap.js')) && existsSync(join(sourceRoot, 'setup', 'UmbraSetupApp.js'));
  if (packaged) { const existing = await existingUpdaterUrl(runtimeRoot, sourceRoot); if (existing) return withTab(existing); }
  if (!packaged && active?.root === runtimeRoot && active.child.exitCode === null) {
    const url = new URL('/api/health', active.url);
    url.searchParams.set('token', new URL(active.url).searchParams.get('token') || '');
    const health = await fetch(url, { signal: AbortSignal.timeout(1500) }).then(response => response.json()).catch(() => null) as any;
    if (health?.runtimeRoot === runtimeRoot) return withTab(active.url);
  }
  if (pending) return withTab(await pending);
  pending = new Promise<string>((ok, fail) => {
    const bundled = join(sourceRoot, 'setup', 'UmbraSetupApp.js');
    const bootstrap = join(sourceRoot, 'launcher', 'UmbraUpdaterBootstrap.js');
    const packaged = existsSync(bootstrap) && existsSync(bundled);
    const script = packaged ? bootstrap : existsSync(bundled) ? bundled : join(sourceRoot, 'setup', 'UmbraSetupApp.ts');
    const child = spawn(process.execPath, [script, '--root', runtimeRoot, '--source', sourceRoot, '--port', '0', '--tab', tab, '--token', randomUUID(),
      ...(packaged ? ['--server-pid', String(process.pid), '--launcher-pid', String(process.env.UMBRA_WEB_LAUNCHER === '1' ? process.ppid : 0),
        '--app-port', String(appPort)] : []), '--no-open'],
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
  try { return withTab(await pending); } finally { pending = null; }
}

export const openToolsSetup = (runtimeRoot: string, sourceRoot: string, appPort?: number) => openUmbraSetup(runtimeRoot, sourceRoot, appPort, 'tools');
