import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import {
  cleanupInactiveUmbraUpdaterWorkspaces,
  resolveUmbraUpdaterCacheRoot,
  isUmbraUpdaterWorkspace,
  requestUmbraUpdaterWorkspaceCleanup,
} from '../shared/umbraUpdaterWorkspace';

const DEFAULT_UPDATER_PORT = 8214;
const READY_TIMEOUT_MS = 20_000;
const ABANDONED_WORKSPACE_AGE_MS = 60_000;

function readArg(name: string, fallback = ''): string {
  const args = Bun.argv.slice(2);
  // Launcher defaults precede forwarded user options; the explicit last value wins.
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const value = args[index];
    if (value === name) return String(args[index + 1] || fallback);
    if (value.startsWith(`${name}=`)) return value.slice(name.length + 1) || fallback;
  }
  return fallback;
}

function hasArg(name: string): boolean {
  return Bun.argv.slice(2).includes(name);
}

function copyRequired(source: string, destination: string) {
  if (!existsSync(source)) throw new Error(`Updater component is missing: ${source}`);
  copyFileSync(source, destination);
}

export async function waitUntilReady(origin: string, token: string, child?: ChildProcess, timeoutMs = READY_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now();
  let launchError: Error | null = null;
  const onError = (error: Error) => { launchError = error; };
  child?.on('error', onError);
  try {
    while (Date.now() - startedAt < timeoutMs) {
      if (launchError) throw launchError;
      if (child && (child.exitCode !== null || child.signalCode !== null)) throw new Error('The standalone updater exited before it became ready. Another Updater may already be open; review its startup log.');
      try {
        const response = await fetch(`${origin}/api/health?token=${encodeURIComponent(token)}`, {
          cache: 'no-store',
          signal: AbortSignal.timeout(Math.max(1, Math.min(1_000, timeoutMs - (Date.now() - startedAt)))),
        });
        const status = await response.json().catch(() => null) as { success?: boolean } | null;
        if (response.ok && status?.success === true) return;
      } catch {
        // The standalone updater is still starting.
      }
      await Bun.sleep(150);
    }
    throw new Error(`The standalone updater did not start on ${origin}.`);
  } finally { child?.off('error', onError); }
}

// Compare the running snapshot, rather than the package version: same-version
// repairs and legacy cached sessions must not be reused after files change.
export function setupSourceFingerprint(sourceRoot: string): string {
  const hash = createHash('sha256');
  for (const file of ['setup/UmbraSetupApp.js', 'setup/index.html', 'setup/models.js', 'setup/onboarding.js',
    'launcher/UmbraUpdateWorker.js', 'updater/UmbraRelaunchWorker.js',
    'updater/update-panel.html', 'updater/update-panel.css', 'updater/update-panel.js', 'updater/update-panel.bundle.js']) {
    hash.update(file + '\0'); hash.update(readFileSync(join(sourceRoot, file))); hash.update('\0');
  }
  return hash.digest('hex');
}

export async function existingUpdaterUrl(runtimeRoot: string, sourceRoot = join(runtimeRoot, 'resources', 'app')): Promise<string> {
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  if (!existsSync(cacheRoot) || !isUmbraUpdaterWorkspace(runtimeRoot, join(cacheRoot, 'session-check'))) return '';
  const fingerprint = setupSourceFingerprint(sourceRoot);
  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^session-[a-z0-9._-]+$/i.test(entry.name)) continue;
    const workspaceRoot = join(cacheRoot, entry.name);
    if (!isUmbraUpdaterWorkspace(runtimeRoot, workspaceRoot)) continue;
    let session: any;
    let status: { success?: boolean; runtimeRoot?: string; sourceFingerprint?: string; needsReopen?: boolean };
    let origin: string;
    try {
      session = JSON.parse(readFileSync(join(workspaceRoot, 'session.json'), 'utf8'));
      if (resolve(session.runtimeRoot) !== runtimeRoot || !Number.isInteger(session.updaterPid) || session.updaterPid <= 0) continue;
      process.kill(session.updaterPid, 0);
      if (!Number.isInteger(session.port) || session.port < 1 || session.port > 65535 || !session.token) continue;
      origin = `http://127.0.0.1:${session.port}`;
      const response = await fetch(`${origin}/api/health?token=${encodeURIComponent(session.token)}`, { cache: 'no-store', signal: AbortSignal.timeout(750) });
      status = await response.json();
      if (!response.ok || status.success !== true || status.runtimeRoot !== runtimeRoot) continue;
    } catch { continue; }
    if (session.sourceFingerprint === fingerprint && resolve(session.sourceRoot) === resolve(sourceRoot)
      && status.sourceFingerprint === fingerprint && !status.needsReopen) return `${origin}/?token=${encodeURIComponent(session.token)}`;
    // Ask the owned session to close. Its admission guard preserves active jobs;
    // never kill an updater or overwrite its live cache snapshot.
    const closing = await fetch(`${origin}/api/close?token=${encodeURIComponent(session.token)}`, { method: 'POST', signal: AbortSignal.timeout(2000) });
    const result = await closing.json() as { success?: boolean; error?: string };
    if (!closing.ok || !result.success) throw new Error(result.error || 'Finish the current Setup operation before reopening the updated Setup.');
    let exited = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await Bun.sleep(100);
      try { process.kill(session.updaterPid, 0); } catch { exited = true; break; }
    }
    if (!exited) throw new Error('The old Setup is still closing. Retry opening Setup.');
  }
  return '';
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

async function availablePort(preferred = 0): Promise<number> {
  return new Promise((ok, fail) => {
    const probe = createServer(); probe.once('error', error => {
      probe.close();
      if (preferred && (error as NodeJS.ErrnoException).code === 'EADDRINUSE') void availablePort().then(ok, fail);
      else fail(error);
    });
    probe.listen(preferred, '127.0.0.1', () => {
      const address = probe.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      probe.close(error => error ? fail(error) : port ? ok(port) : fail(new Error('Could not allocate a Setup port.')));
    });
  });
}

async function main() {
  const runtimeRoot = resolve(readArg('--root', process.env.UMBRA_ROOT || process.cwd()));
  const sourceRoot = resolve(readArg('--source', join(runtimeRoot, 'resources', 'app')));
  const requestedPort = Number(readArg('--port', String(DEFAULT_UPDATER_PORT)));
  const preferredPort = Number.isInteger(requestedPort) && requestedPort >= 0 && requestedPort <= 65535 ? requestedPort : DEFAULT_UPDATER_PORT;
  const token = readArg('--token') || randomUUID();
  const serverPid = Math.max(0, Number.parseInt(readArg('--server-pid', '0'), 10) || 0);
  const launcherPid = Math.max(0, Number.parseInt(readArg('--launcher-pid', '0'), 10) || 0);
  let configuredAppPort = Number(process.env.UMBRA_PORT || 8212);
  try {
    const settings = JSON.parse(readFileSync(join(runtimeRoot, 'User', 'Config', 'settings.json'), 'utf8'));
    if (!process.env.UMBRA_PORT) configuredAppPort = Number(settings.servers?.umbra?.port || 8212);
  } catch { /* Fresh installations use the standard main-app port. */ }
  const appPort = Math.max(1, Number.parseInt(readArg('--app-port', String(configuredAppPort)), 10) || 8212);
  const appHost = readArg('--app-host', '127.0.0.1');
  const requestedTab = readArg('--tab', 'updates');
  const tab = ['tools', 'models', 'updates', 'onboarding'].includes(requestedTab) ? requestedTab : 'onboarding';
  const existing = hasArg('--no-reuse') ? '' : await existingUpdaterUrl(runtimeRoot, sourceRoot);
  if (existing) {
    const url = `${existing}&tab=${tab}`;
    console.log(`UMBRA_UPDATER_URL=${url}`);
    console.log(`[UmbraSetup] Ready: ${url}`);
    if (!hasArg('--no-open')) openBrowser(url);
    return;
  }
  const port = await availablePort(preferredPort);
  cleanupInactiveUmbraUpdaterWorkspaces(runtimeRoot, {
    staleAfterMs: ABANDONED_WORKSPACE_AGE_MS,
  });
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  const workspaceRoot = join(cacheRoot, `session-${Date.now()}-${randomUUID()}`);
  if (!isUmbraUpdaterWorkspace(runtimeRoot, workspaceRoot)) throw new Error('The Updater cache path contains a redirected directory.');
  mkdirSync(cacheRoot, { recursive: true });
  mkdirSync(workspaceRoot, { recursive: false });

  const bunName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const bunPath = join(workspaceRoot, bunName);
  const updaterPath = join(workspaceRoot, 'UmbraSetupApp.js');
  const workerPath = join(workspaceRoot, 'UmbraUpdateWorker.js');
  const relaunchWorkerPath = join(workspaceRoot, 'UmbraRelaunchWorker.js');
  mkdirSync(join(workspaceRoot, 'setup'));
  mkdirSync(join(workspaceRoot, 'updater'));
  copyRequired(process.execPath, bunPath);
  copyRequired(join(sourceRoot, 'setup', 'UmbraSetupApp.js'), updaterPath);
  for (const file of ['index.html', 'models.js', 'onboarding.js']) copyRequired(join(sourceRoot, 'setup', file), join(workspaceRoot, 'setup', file));
  for (const file of ['update-panel.html', 'update-panel.css', 'update-panel.js', 'update-panel.bundle.js']) copyRequired(join(sourceRoot, 'updater', file), join(workspaceRoot, 'updater', file));
  copyRequired(join(sourceRoot, 'launcher', 'UmbraUpdateWorker.js'), workerPath);
  copyRequired(join(sourceRoot, 'updater', 'UmbraRelaunchWorker.js'), relaunchWorkerPath);
  if (process.platform !== 'win32') {
    chmodSync(bunPath, 0o755);
  }

  const sessionPath = join(workspaceRoot, 'session.json');
  const session = {
    runtimeRoot,
    sourceRoot,
    sourceFingerprint: setupSourceFingerprint(sourceRoot),
    workspaceRoot,
    token,
    port,
    serverPid,
    launcherPid,
    appPort,
    appHost,
    createdAt: new Date().toISOString(),
    updaterPid: 0,
    workerPid: 0,
    relaunchPid: 0,
  };
  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, 'utf8');

  const child = spawn(bunPath, [updaterPath, '--session', sessionPath, '--root', runtimeRoot, '--source', sourceRoot,
    '--ui-source', workspaceRoot, '--port', String(port), '--token', token, '--tab', tab, '--no-open'], {
    cwd: workspaceRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
    },
  });
  if (!child.pid) throw new Error('The standalone updater process did not start.');
  const origin = `http://127.0.0.1:${port}`;
  try { await waitUntilReady(origin, token, child); }
  catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
    requestUmbraUpdaterWorkspaceCleanup(workspaceRoot);
    throw error;
  }
  child.unref();
  const updaterUrl = `${origin}/?token=${encodeURIComponent(token)}&tab=${tab}`;
  console.log(`UMBRA_UPDATER_URL=${updaterUrl}`);
  console.log(`[UmbraSetup] Ready: ${updaterUrl}`);
  if (!hasArg('--no-open')) openBrowser(updaterUrl);
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraUpdaterBootstrap] Failed:', error);
    process.exit(1);
  });
}
