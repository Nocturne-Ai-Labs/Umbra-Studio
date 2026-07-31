import {
  existsSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { AppUpdateService, compareUmbraVersions, readUmbraAppVersion } from '../backend/AppUpdateService';
import {
  normalizeUmbraUpdateState,
  type UmbraReleaseBuild,
  type UmbraUpdateState,
  type UmbraUpdateWorkerRequest,
} from '../shared/appUpdate';

type UpdaterSession = {
  runtimeRoot: string;
  sourceRoot: string;
  workspaceRoot: string;
  token: string;
  port: number;
  serverPid: number;
  launcherPid: number;
  appPort: number;
  appHost: string;
  createdAt: string;
};

const UMBRA_LISTENER_STOP_TIMEOUT_MS = 8_000;
const UMBRA_SHUTDOWN_REQUEST_TIMEOUT_MS = 3_000;

function readArg(name: string): string {
  const args = Bun.argv.slice(2);
  const index = args.indexOf(name);
  if (index >= 0) return String(args[index + 1] || '');
  const inline = args.find((entry) => entry.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : '';
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function writeJsonAtomic(filePath: string, value: unknown) {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, filePath);
}

function isAuthorized(request: Request, url: URL, session: UpdaterSession): boolean {
  const supplied = url.searchParams.get('token')
    || request.headers.get('x-umbra-updater-token')
    || '';
  return supplied === session.token;
}

function updaterStatePath(session: UpdaterSession): string {
  return join(session.workspaceRoot, 'update-state.json');
}

function readState(service: AppUpdateService, session: UpdaterSession): UmbraUpdateState {
  const workspaceState = updaterStatePath(session);
  try {
    if (existsSync(workspaceState)) {
      return normalizeUmbraUpdateState(JSON.parse(readFileSync(workspaceState, 'utf8')), service.currentVersion);
    }
  } catch {
    // Fall back to the durable copy under User/Config.
  }
  return service.readState();
}

function writeState(service: AppUpdateService, session: UpdaterSession, patch: Partial<UmbraUpdateState>) {
  const next = normalizeUmbraUpdateState({
    ...readState(service, session),
    ...patch,
  }, service.currentVersion);
  writeJsonAtomic(updaterStatePath(session), next);
  try {
    service.writeState(next);
  } catch {
    // User/ can be momentarily unavailable during the atomic root swap.
  }
  return next;
}

async function requestUmbraShutdown(session: UpdaterSession) {
  const host = session.appHost === '::1' ? '[::1]' : '127.0.0.1';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UMBRA_SHUTDOWN_REQUEST_TIMEOUT_MS);
  try {
    await fetch(`http://${host}:${session.appPort}/api/app/updater/shutdown`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
      signal: controller.signal,
    });
  } catch {
    // The external worker still owns the exact server PID and will escalate if
    // the listener did not accept this graceful request.
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForUmbraListenerToStop(session: UpdaterSession): Promise<boolean> {
  const host = session.appHost === '::1' ? '[::1]' : '127.0.0.1';
  const healthUrl = `http://${host}:${session.appPort}/api/healthz/ready`;
  const startedAt = Date.now();
  while (Date.now() - startedAt < UMBRA_LISTENER_STOP_TIMEOUT_MS) {
    try {
      const response = await fetch(healthUrl, { cache: 'no-store' });
      if (!response.ok) return true;
    } catch {
      return true;
    }
    await Bun.sleep(250);
  }
  return false;
}

function appOrigin(session: UpdaterSession): string {
  const host = session.appHost === '::1' ? '[::1]' : '127.0.0.1';
  return `http://${host}:${session.appPort}`;
}

async function isUmbraReady(session: UpdaterSession): Promise<boolean> {
  try {
    const response = await fetch(`${appOrigin(session)}/api/healthz/ready`, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

function scheduleWorkspaceCleanup(workspaceRoot: string) {
  if (process.platform === 'win32') {
    spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-WindowStyle',
      'Hidden',
      '-Command',
      'Start-Sleep -Seconds 3; Remove-Item -LiteralPath $args[0] -Recurse -Force -ErrorAction SilentlyContinue',
      workspaceRoot,
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  spawn('/bin/sh', ['-c', 'sleep 2; rm -rf -- "$1"', 'umbra-updater-cleanup', workspaceRoot], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

async function runWorker(
  service: AppUpdateService,
  session: UpdaterSession,
  release: UmbraReleaseBuild,
  archivePath: string,
) {
  await requestUmbraShutdown(session);
  const listenerStopped = await waitForUmbraListenerToStop(session);
  if (!listenerStopped) {
    console.warn('[UmbraUpdaterApp] Umbra listener remained available after the graceful shutdown window. The worker will force-stop the owned Bun process if needed.');
  }
  const requestPath = join(session.workspaceRoot, 'update-request.json');
  const request: UmbraUpdateWorkerRequest = {
    schemaVersion: 1,
    runtimeRoot: resolve(session.runtimeRoot),
    archivePath: resolve(archivePath),
    workspaceRoot: resolve(session.workspaceRoot),
    requestPath: resolve(requestPath),
    statePath: service.statePath,
    // The worker must retain the live Bun server PID. The listener can stop
    // before Bun exits, and replacing application files while that process is
    // hung is what leaves the updater stranded.
    serverPid: session.serverPid,
    launcherPid: session.launcherPid,
    port: session.appPort,
    bindHost: session.appHost,
    currentVersion: service.currentVersion,
    targetVersion: release.version,
    targetTag: release.tag,
    packageName: release.packageName,
    createdAt: new Date().toISOString(),
    keepWorkspaceAlive: true,
  };
  writeJsonAtomic(requestPath, request);
  const bunName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const worker = spawn(join(session.workspaceRoot, bunName), [
    join(session.workspaceRoot, 'UmbraUpdateWorker.js'),
    '--request',
    requestPath,
  ], {
    cwd: session.workspaceRoot,
    stdio: 'ignore',
    windowsHide: true,
  });
  const code = await new Promise<number>((resolveExit) => {
    worker.once('exit', (value) => resolveExit(value ?? 1));
    worker.once('error', () => resolveExit(1));
  });
  if (code !== 0 && readState(service, session).phase !== 'failed') {
    throw new Error(`The external update worker exited with code ${code}.`);
  }
}

async function runUpdate(service: AppUpdateService, session: UpdaterSession, release: UmbraReleaseBuild) {
  const startedAt = new Date().toISOString();
  let state = writeState(service, session, {
    phase: 'downloading',
    currentVersion: service.currentVersion,
    targetVersion: release.version,
    targetTag: release.tag,
    packageName: release.packageName,
    totalBytes: release.packageBytes,
    processedBytes: 0,
    currentItem: release.packageName,
    startedAt,
    completedAt: null,
    nodeUpdate: 'pending',
    warning: '',
    error: '',
  });
  try {
    let lastProgressAt = 0;
    const downloaded = await service.downloadRelease(
      release,
      session.workspaceRoot,
      (processedBytes, totalBytes) => {
        const now = Date.now();
        if (now - lastProgressAt < 150 && processedBytes < totalBytes) return;
        lastProgressAt = now;
        state = writeState(service, session, {
          ...state,
          phase: 'downloading',
          processedBytes,
          totalBytes: totalBytes || release.packageBytes,
        });
      },
    );
    writeState(service, session, {
      ...state,
      phase: 'stopping',
      processedBytes: downloaded.totalBytes,
      totalBytes: downloaded.totalBytes,
      currentItem: 'Closing Umbra Studio and managed tools',
    });
    await runWorker(service, session, release, downloaded.archivePath);
  } catch (error) {
    writeState(service, session, {
      ...state,
      phase: 'failed',
      completedAt: new Date().toISOString(),
      currentItem: '',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function main() {
  const sessionPath = resolve(readArg('--session'));
  if (!sessionPath || !existsSync(sessionPath)) throw new Error('A valid updater session is required.');
  const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as UpdaterSession;
  if (
    resolve(session.workspaceRoot) !== resolve(join(sessionPath, '..'))
    || resolve(session.runtimeRoot) === resolve(session.workspaceRoot)
  ) {
    throw new Error('The updater session failed path safety validation.');
  }
  const currentVersion = readUmbraAppVersion(session.runtimeRoot, session.sourceRoot);
  const service = new AppUpdateService(session.runtimeRoot, currentVersion);
  const html = readFileSync(join(session.workspaceRoot, 'index.html'), 'utf8');
  let activeUpdate: Promise<void> | null = null;

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: session.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (!isAuthorized(request, url, session)) return json({ success: false, error: 'Unauthorized updater session.' }, 403);
      if (url.pathname === '/api/health') {
        return json({ success: true, port: server.port, currentVersion });
      }
      if (url.pathname === '/api/releases' && request.method === 'GET') {
        try {
          const summary = await service.listReleases({
            refresh: url.searchParams.get('refresh') === 'true',
            includePrerelease: url.searchParams.get('channel') === 'prerelease',
          });
          return json({ success: true, ...summary });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 502);
        }
      }
      if (url.pathname === '/api/state' && request.method === 'GET') {
        return json({ success: true, state: readState(service, session) });
      }
      if (url.pathname === '/api/update' && request.method === 'POST') {
        if (activeUpdate) return json({ success: false, error: 'An update is already running.' }, 409);
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          const tag = String(body.tag || '').trim();
          const summary = await service.listReleases({
            refresh: true,
            includePrerelease: body.includePrerelease === true,
          });
          const release = summary.releases.find((entry) => (
            entry.tag === tag || entry.version === tag.replace(/^v/i, '')
          ));
          if (!release) return json({ success: false, error: 'The selected release is unavailable for this platform.' }, 404);
          if (compareUmbraVersions(release.version, currentVersion) <= 0) {
            return json({ success: false, error: 'Select a release newer than the installed version.' }, 400);
          }
          activeUpdate = runUpdate(service, session, release)
            .catch((error) => console.error('[UmbraUpdaterApp] Update failed:', error))
            .finally(() => {
              activeUpdate = null;
            });
          return json({ success: true, accepted: true, targetVersion: release.version }, 202);
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        }
      }
      if (url.pathname === '/api/relaunch' && request.method === 'POST') {
        const appUrl = `${appOrigin(session)}/`;
        if (await isUmbraReady(session)) {
          setTimeout(() => {
            server.stop(true);
            scheduleWorkspaceCleanup(session.workspaceRoot);
            process.exit(0);
          }, 750);
          return json({ success: true, appUrl, alreadyRunning: true });
        }
        const launcher = process.platform === 'win32'
          ? join(session.runtimeRoot, 'UmbraStudio.exe')
          : join(session.runtimeRoot, 'start-umbra.sh');
        if (!existsSync(launcher)) return json({ success: false, error: 'Umbra launcher is missing.' }, 404);
        spawn(launcher, [], {
          cwd: session.runtimeRoot,
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        }).unref();
        setTimeout(() => {
          server.stop(true);
          scheduleWorkspaceCleanup(session.workspaceRoot);
          process.exit(0);
        }, 750);
        return json({ success: true, appUrl, alreadyRunning: false });
      }
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
            'X-Frame-Options': 'DENY',
          },
        });
      }
      return new Response('Not found', { status: 404 });
    },
  });
  console.log(`[UmbraUpdaterApp] Ready: http://127.0.0.1:${server.port}`);
  const stopAfterIdle = () => {
    setTimeout(() => {
      if (activeUpdate) {
        stopAfterIdle();
        return;
      }
      server.stop(true);
      scheduleWorkspaceCleanup(session.workspaceRoot);
      process.exit(0);
    }, 30 * 60 * 1000);
  };
  stopAfterIdle();
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraUpdaterApp] Fatal:', error);
    process.exit(1);
  });
}
