import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  cleanupInactiveUmbraUpdaterWorkspaces,
  resolveUmbraUpdaterCacheRoot,
} from '../shared/umbraUpdaterWorkspace';

const DEFAULT_UPDATER_PORT = 8214;
const READY_TIMEOUT_MS = 20_000;

function readArg(name: string, fallback = ''): string {
  const args = Bun.argv.slice(2);
  const index = args.indexOf(name);
  if (index >= 0) return String(args[index + 1] || fallback);
  const inline = args.find((entry) => entry.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : fallback;
}

function hasArg(name: string): boolean {
  return Bun.argv.slice(2).includes(name);
}

function copyRequired(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`Updater component is missing: ${source}`);
  copyFileSync(source, destination);
}

async function waitUntilReady(origin: string, token: string): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < READY_TIMEOUT_MS) {
    try {
      const response = await fetch(`${origin}/api/health?token=${encodeURIComponent(token)}`, {
        cache: 'no-store',
      });
      if (response.ok) return;
    } catch {
      // The standalone updater is still starting.
    }
    await Bun.sleep(150);
  }
  throw new Error(`The standalone updater did not start on ${origin}.`);
}

function openBrowser(url: string) {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/d', '/c', 'start', '', url], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  spawn('xdg-open', [url], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

async function main() {
  const runtimeRoot = resolve(readArg('--root', process.env.UMBRA_ROOT || process.cwd()));
  const sourceRoot = resolve(readArg('--source', join(runtimeRoot, 'resources', 'app')));
  const port = Math.max(1, Number.parseInt(readArg('--port', String(DEFAULT_UPDATER_PORT)), 10) || DEFAULT_UPDATER_PORT);
  const token = readArg('--token') || randomUUID();
  const serverPid = Math.max(0, Number.parseInt(readArg('--server-pid', '0'), 10) || 0);
  const launcherPid = Math.max(0, Number.parseInt(readArg('--launcher-pid', '0'), 10) || 0);
  const appPort = Math.max(1, Number.parseInt(readArg('--app-port', '8212'), 10) || 8212);
  const appHost = readArg('--app-host', '127.0.0.1');
  cleanupInactiveUmbraUpdaterWorkspaces(runtimeRoot);
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  mkdirSync(cacheRoot, { recursive: true });
  const workspaceRoot = join(cacheRoot, `session-${Date.now()}-${randomUUID()}`);
  mkdirSync(workspaceRoot, { recursive: false });

  const bunName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const bunPath = join(workspaceRoot, bunName);
  const updaterPath = join(workspaceRoot, 'UmbraUpdaterApp.js');
  const workerPath = join(workspaceRoot, 'UmbraUpdateWorker.js');
  const htmlPath = join(workspaceRoot, 'index.html');
  copyRequired(process.execPath, bunPath);
  copyRequired(join(sourceRoot, 'updater', 'UmbraUpdaterApp.js'), updaterPath);
  copyRequired(join(sourceRoot, 'launcher', 'UmbraUpdateWorker.js'), workerPath);
  copyRequired(join(sourceRoot, 'updater', 'index.html'), htmlPath);
  if (process.platform !== 'win32') {
    chmodSync(bunPath, 0o755);
  }

  const sessionPath = join(workspaceRoot, 'session.json');
  const session = {
    runtimeRoot,
    sourceRoot,
    workspaceRoot,
    token,
    port,
    serverPid,
    launcherPid,
    appPort,
    appHost,
    createdAt: new Date().toISOString(),
    updaterPid: 0,
  };
  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');

  const child = spawn(bunPath, [updaterPath, '--session', sessionPath], {
    cwd: workspaceRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
    },
  });
  if (!child.pid) throw new Error('The standalone updater process did not start.');
  child.unref();

  const origin = `http://127.0.0.1:${port}`;
  await waitUntilReady(origin, token);
  const updaterUrl = `${origin}/?token=${encodeURIComponent(token)}`;
  console.log(`UMBRA_UPDATER_URL=${updaterUrl}`);
  if (!hasArg('--no-open')) openBrowser(updaterUrl);
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraUpdaterBootstrap] Failed:', error);
    process.exit(1);
  });
}
