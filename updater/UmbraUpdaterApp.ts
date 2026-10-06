import { claimToolMaintenance, readToolMaintenance, trackToolMaintenanceChild } from '../shared/toolMaintenanceLock';
import { writeUpdateJsonAtomic as writeJsonAtomic } from '../shared/updateStateFile';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { AppUpdateService, compareUmbraVersions, readUmbraAppVersion } from '../backend/AppUpdateService';
import {
  createIdleUmbraUpdateState,
  isUmbraUpdateStateActive,
  normalizeUmbraUpdateState,
  recoverInterruptedUmbraUpdateState,
  type UmbraReleaseBuild,
  type UmbraUpdateState,
  type UmbraUpdateWorkerRequest,
} from '../shared/appUpdate';
import {
  hasActiveUmbraUpdaterProcess,
  acquireUmbraUpdaterLease,
  isUmbraUpdaterWorkspace,
  markUmbraUpdaterProcessHeartbeat,
  requestUmbraUpdaterWorkspaceCleanup,
} from '../shared/umbraUpdaterWorkspace';

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
  updaterPid?: number;
  workerPid?: number;
  relaunchPid?: number;
};

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

function localUmbraOrigin(session: UpdaterSession): string {
  const host = session.appHost === '::1' ? '[::1]' : '127.0.0.1';
  return `http://${host}:${session.appPort}`;
}

async function startExternalRelaunch(session: UpdaterSession, sessionPath: string) {
  const bunPath = join(session.workspaceRoot, process.platform === 'win32' ? 'bun.exe' : 'bun');
  const workerPath = join(session.workspaceRoot, 'UmbraRelaunchWorker.js');
  if (!existsSync(bunPath) || !existsSync(workerPath)) {
    throw new Error('The external Umbra Studio relaunch worker is missing.');
  }
  const requestPath = join(session.workspaceRoot, 'relaunch-request.json');
  await writeJsonAtomic(requestPath, {
    schemaVersion: 1,
    runtimeRoot: session.runtimeRoot,
    workspaceRoot: session.workspaceRoot,
    requestPath,
    appPort: session.appPort,
    appHost: session.appHost || '127.0.0.1',
    updaterPid: process.pid,
    createdAt: new Date().toISOString(),
  });
  const child = spawn(bunPath, [workerPath, '--request', requestPath], {
    cwd: session.workspaceRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      UMBRA_ROOT: resolve(session.runtimeRoot),
    },
  });
  const completion = new Promise<number>((resolveExit) => {
    child.once('exit', (code) => resolveExit(code ?? 1));
    child.once('error', () => resolveExit(1));
  });
  if (!child.pid) throw new Error('The external Umbra Studio relaunch worker did not start.');
  session.relaunchPid = child.pid;
  try { await writeJsonAtomic(sessionPath, session); }
  catch { console.warn('[UmbraUpdaterApp] Relaunch started, but its session record could not be refreshed.'); }
  child.unref();
  return { child, completion };
}

function readRelaunchState(session: UpdaterSession): { phase: 'starting' | 'ready' | 'failed'; error: string } {
  try {
    const state = JSON.parse(readFileSync(join(session.workspaceRoot, 'relaunch-state.json'), 'utf8'));
    if (['starting', 'ready', 'failed'].includes(state.phase)) return { phase: state.phase, error: String(state.error || '') };
  } catch { /* The worker has not published its startup status yet. */ }
  return { phase: 'starting', error: '' };
}

function isAuthorized(request: Request, url: URL, session: UpdaterSession): boolean {
  const supplied = url.searchParams.get('token')
    || request.headers.get('x-umbra-updater-token')
    || request.headers.get('x-umbra-setup-token')
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

async function writeState(service: AppUpdateService, session: UpdaterSession, patch: Partial<UmbraUpdateState>) {
  const next = normalizeUmbraUpdateState({
    ...readState(service, session),
    ...patch,
  }, service.currentVersion);
  await writeJsonAtomic(updaterStatePath(session), next);
  try {
    await service.writeState(next);
  } catch {
    // User/ can be momentarily unavailable during the atomic root swap.
  }
  return next;
}

async function runWorker(
  service: AppUpdateService,
  session: UpdaterSession,
  release: UmbraReleaseBuild,
  archivePath: string,
) {
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
  await writeJsonAtomic(requestPath, request);
  const workerProcessLogPath = join(session.workspaceRoot, 'worker-process.log');
  const appendWorkerOutput = (value: unknown) => {
    try {
      appendFileSync(workerProcessLogPath, String(value), 'utf8');
    } catch {
      // The update transaction can briefly move application paths on Windows.
    }
  };
  const bunName = process.platform === 'win32' ? 'bun.exe' : 'bun';
  const worker = spawn(join(session.workspaceRoot, bunName), [
    join(session.workspaceRoot, 'UmbraUpdateWorker.js'),
    '--request',
    requestPath,
  ], {
    cwd: session.workspaceRoot,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  worker.stdout?.on('data', appendWorkerOutput);
  worker.stderr?.on('data', appendWorkerOutput);
  const completion = new Promise<number>((resolveExit) => {
    worker.once('exit', (value) => resolveExit(value ?? 1));
    worker.once('error', () => resolveExit(1));
  });
  session.workerPid = Number(worker.pid || 0);
  if (worker.pid) {
    try { for (const tool of ['comfyui', 'aitoolkit']) trackToolMaintenanceChild(session.runtimeRoot, tool, worker.pid); }
    catch (error) { worker.kill(); await completion; throw error; }
  }
  try { await writeJsonAtomic(join(session.workspaceRoot, 'session.json'), session); }
  catch { appendWorkerOutput('Update worker started, but its session record could not be refreshed.\n'); }
  const code = await completion;
  const state = readState(service, session);
  if (state.phase === 'failed') throw new Error(state.error || 'The external update worker failed.');
  if (code !== 0) {
    throw new Error(`The external update worker exited with code ${code}.`);
  }
  if (state.phase !== 'complete') throw new Error('The external update worker exited before confirming installation. Review the update log and retry.');
}

async function initializeUpdate(service: AppUpdateService, session: UpdaterSession, release: UmbraReleaseBuild) {
  return writeState(service, session, {
    phase: 'downloading',
    currentVersion: service.currentVersion,
    targetVersion: release.version,
    targetTag: release.tag,
    packageName: release.packageName,
    totalBytes: release.packageBytes,
    processedBytes: 0,
    currentItem: release.packageName,
    startedAt: new Date().toISOString(),
    completedAt: null,
    nodeUpdate: 'pending',
    warning: '',
    error: '',
  });
}

async function runUpdate(service: AppUpdateService, session: UpdaterSession, release: UmbraReleaseBuild, initialState: UmbraUpdateState) {
  let state = initialState;
  try {
    // Retries retain earlier logs/recovery copies and never reuse a completed ZIP.
    const downloadRoot = join(session.workspaceRoot, `download-${randomUUID()}`);
    mkdirSync(downloadRoot, { recursive: false });
    let lastProgressAt = 0;
    const downloaded = await service.downloadRelease(
      release,
      downloadRoot,
      async (processedBytes, totalBytes) => {
        const now = Date.now();
        if (now - lastProgressAt < 150 && processedBytes < totalBytes) return;
        lastProgressAt = now;
        state = await writeState(service, session, {
          ...state,
          phase: 'downloading',
          processedBytes,
          totalBytes: totalBytes || release.packageBytes,
        });
      },
    );
    await writeState(service, session, {
      ...state,
      phase: 'stopping',
      processedBytes: downloaded.totalBytes,
      totalBytes: downloaded.totalBytes,
      currentItem: 'Closing Umbra Studio and managed tools',
    });
    await runWorker(service, session, release, downloaded.archivePath);
  } catch (error) {
    await writeState(service, session, {
      phase: 'failed',
      completedAt: new Date().toISOString(),
      currentItem: '',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export type UmbraUpdateControllerOptions = {
  isSetupBusy?: () => boolean;
  onClose: () => void | Promise<void>;
};

/** Mounted by the unified Setup server, which owns authentication and its listener. */
export async function createUmbraUpdateController(sessionFile: string, options: UmbraUpdateControllerOptions) {
  const sessionPath = resolve(sessionFile);
  if (!sessionPath || !existsSync(sessionPath)) throw new Error('A valid updater session is required.');
  const session = JSON.parse(readFileSync(sessionPath, 'utf8')) as UpdaterSession;
  if (
    resolve(session.workspaceRoot) !== resolve(join(sessionPath, '..'))
    || resolve(session.runtimeRoot) === resolve(session.workspaceRoot)
    || !isUmbraUpdaterWorkspace(session.runtimeRoot, session.workspaceRoot)
  ) {
    throw new Error('The updater session failed path safety validation.');
  }
  if (hasActiveUmbraUpdaterProcess(session.runtimeRoot)) {
    throw new Error('Another Updater operation is active for this installation.');
  }
  const releaseLease = acquireUmbraUpdaterLease(session.runtimeRoot, session.workspaceRoot);
  session.updaterPid = process.pid;
  await writeJsonAtomic(sessionPath, session);
  markUmbraUpdaterProcessHeartbeat(session.workspaceRoot, 'updater');
  const heartbeat = setInterval(() => {
    try {
      markUmbraUpdaterProcessHeartbeat(session.workspaceRoot, 'updater');
    } catch {
      // The worker may be completing cleanup as this updater exits.
    }
  }, 2_500);
  heartbeat.unref();
  let currentVersion = readUmbraAppVersion(session.runtimeRoot, session.sourceRoot);
  const startupVersion = currentVersion;
  let installedVersionVerified = currentVersion !== '0.0.0';
  let service = new AppUpdateService(session.runtimeRoot, currentVersion);
  const refreshInstalledVersion = () => {
    const installed = readUmbraAppVersion(session.runtimeRoot, session.sourceRoot);
    installedVersionVerified = installed !== '0.0.0';
    if (!installedVersionVerified) return;
    if (installed !== currentVersion) {
      currentVersion = installed;
      service = new AppUpdateService(session.runtimeRoot, currentVersion);
    }
  };
  let persistedState = service.readState();
  const sessionStartedAt = Date.parse(session.createdAt || '');
  const updateCompletedAt = Date.parse(persistedState.completedAt || '');
  if (
    persistedState.phase === 'complete'
    && Number.isFinite(sessionStartedAt)
    && Number.isFinite(updateCompletedAt)
    && updateCompletedAt <= sessionStartedAt
  ) {
    persistedState = await writeState(service, session, createIdleUmbraUpdateState(currentVersion));
    console.log('[UmbraUpdaterApp] Cleared the completed state from an earlier updater session.');
  }
  if (
    isUmbraUpdateStateActive(persistedState)
    && !hasActiveUmbraUpdaterProcess(session.runtimeRoot, session.workspaceRoot)
  ) {
    await writeState(service, session, recoverInterruptedUmbraUpdateState(persistedState, currentVersion));
    console.warn(`[UmbraUpdaterApp] Recovered abandoned ${persistedState.phase} state from a previous updater session.`);
  }
  let activeUpdate: Promise<void> | null = null;
  let activeRelaunch: Promise<void> | null = null;
  let admittingOperation = false;
  let relaunchState: { phase: 'idle' | 'starting' | 'ready' | 'failed'; error: string } = {
    phase: 'idle',
    error: '',
  };

  const isBusy = () => Boolean(activeUpdate || activeRelaunch || admittingOperation);
  const setupBusy = () => options.isSetupBusy?.() === true;
  return {
    isBusy,
    needsReopen: () => currentVersion !== startupVersion,
    async fetch(request: Request): Promise<Response | null> {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/updates/')) return null;
      url.pathname = '/api/' + url.pathname.slice('/api/updates/'.length);
      if (!isAuthorized(request, url, session)) return json({ success: false, error: 'Unauthorized updater session.' }, 403);
      // The updater and its HTML survive application replacement. Never authorize another install against the startup version.
      if (!activeUpdate && !admittingOperation) refreshInstalledVersion();
      if (url.pathname === '/api/health') {
        return json({ success: true, port: session.port, currentVersion, installedVersionVerified });
      }
      if (url.pathname === '/api/releases' && request.method === 'GET') {
        try {
          const summary = await service.listReleases({
            refresh: url.searchParams.get('refresh') === 'true',
            includePrerelease: url.searchParams.get('channel') === 'prerelease',
          });
          return json({ success: true, ...summary, releases: summary.releases.filter(release => compareUmbraVersions(release.version, currentVersion) > 0), installedVersionVerified });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 502);
        }
      }
      if (url.pathname === '/api/state' && request.method === 'GET') {
        const persisted = readState(service, session);
        const state = !activeUpdate && !admittingOperation
          && isUmbraUpdateStateActive(persisted)
          && !hasActiveUmbraUpdaterProcess(session.runtimeRoot, session.workspaceRoot)
          ? await writeState(service, session, recoverInterruptedUmbraUpdateState(persisted, currentVersion))
          : persisted;
        return json({ success: true, currentVersion, installedVersionVerified, state: { ...state, currentVersion } });
      }
      if (url.pathname === '/api/update' && request.method === 'POST') {
        if (currentVersion !== startupVersion) return json({ success: false, error: 'Close and reopen Setup before installing another Umbra Studio update.' }, 409);
        if (isBusy() || setupBusy()) return json({ success: false, error: 'Finish the current Setup or update operation first.' }, 409);
        admittingOperation = true;
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
          refreshInstalledVersion();
          if (!installedVersionVerified) return json({ success: false, error: 'The installed app version is unavailable. Restore or review its build metadata before installing another release; no reinstall or downgrade was authorized.' }, 409);
          if (compareUmbraVersions(release.version, currentVersion) <= 0) {
            return json({ success: false, error: 'Select a release newer than the installed version.' }, 400);
          }
          // Recheck after fetching releases and hold both root-local tool locks
          // across download/replacement so another Setup process cannot race the update.
          if (setupBusy() || ['comfyui', 'aitoolkit'].some(tool => readToolMaintenance(session.runtimeRoot, tool))) {
            return json({ success: false, error: 'Finish tool maintenance before installing an update.' }, 409);
          }
          const releaseComfy = claimToolMaintenance(session.runtimeRoot, 'comfyui');
          let releaseToolkit: (() => void) | null = null;
          try { releaseToolkit = claimToolMaintenance(session.runtimeRoot, 'aitoolkit'); } catch (error) { releaseComfy(); throw error; }
          // Publish the new attempt before acknowledging it, so polling never
          // mistakes the preceding failed/complete state for this attempt.
          let initialState: UmbraUpdateState;
          try { initialState = await initializeUpdate(service, session, release); }
          catch (error) { releaseToolkit(); releaseComfy(); throw error; }
          activeUpdate = runUpdate(service, session, release, initialState)
            .catch((error) => console.error('[UmbraUpdaterApp] Update failed:', error))
            .finally(() => {
              releaseToolkit!(); releaseComfy();
              activeUpdate = null;
            });
          return json({ success: true, accepted: true, targetVersion: release.version }, 202);
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        } finally { admittingOperation = false; }
      }
      if (url.pathname === '/api/relaunch' && request.method === 'POST') {
        if (activeUpdate || admittingOperation || setupBusy()) return json({ success: false, error: 'Wait for Setup and updates to finish before launching Umbra Studio.' }, 409);
        if (activeRelaunch) return json({ success: false, error: 'Umbra Studio is already starting.' }, 409);
        const state = readState(service, session);
        if (state.phase !== 'complete') {
          return json({ success: false, error: 'Install an update successfully before launching Umbra Studio.' }, 409);
        }
        relaunchState = { phase: 'starting', error: '' };
        admittingOperation = true;
        try {
          await writeJsonAtomic(join(session.workspaceRoot, 'relaunch-state.json'), relaunchState);
          const launched = await startExternalRelaunch(session, sessionPath);
          activeRelaunch = (async () => {
            const timeout = setTimeout(() => launched.child.kill(), 150_000);
            try {
              const code = await launched.completion;
              relaunchState = readRelaunchState(session);
              if (code !== 0 || relaunchState.phase !== 'ready') {
                relaunchState = { phase: 'failed', error: relaunchState.error || 'Umbra Studio did not report ready. Review User/Logs/updater-relaunch.log and retry launching.' };
              }
            } finally { clearTimeout(timeout); }
          })().finally(() => { activeRelaunch = null; });
        } catch (error) {
          relaunchState = {
            phase: 'failed',
            error: error instanceof Error ? error.message : String(error),
          };
          return json({ success: false, error: relaunchState.error }, 500);
        } finally { admittingOperation = false; }
        return json({ success: true, accepted: true, origin: localUmbraOrigin(session) }, 202);
      }
      if (url.pathname === '/api/relaunch-state' && request.method === 'GET') {
        return json({ success: true, ...relaunchState, origin: localUmbraOrigin(session) });
      }
      if (url.pathname === '/api/close' && request.method === 'POST') {
        if (isBusy() || setupBusy()) return json({ success: false, error: 'Wait for the current operation or model setup to finish before closing the updater.' }, 409);
        admittingOperation = true;
        setTimeout(() => { admittingOperation = false; void options.onClose(); }, 250);
        return json({ success: true });
      }
      return new Response('Not found', { status: 404 });
    },
    close() {
      if (isBusy() || setupBusy()) throw new Error('Wait for Setup and updates to finish before closing.');
      clearInterval(heartbeat);
      releaseLease();
      requestUmbraUpdaterWorkspaceCleanup(session.workspaceRoot);
    },
  };
}

// Old direct invocations use the same unified Setup page as the compatibility launcher.
if (import.meta.main) {
  const sessionFile = resolve(readArg('--session'));
  const setupPath = join(sessionFile, '..', 'UmbraSetupApp.js');
  if (!existsSync(setupPath)) throw new Error('Unified Umbra Setup is missing. Start UmbraSetup from the installation folder.');
  const session = JSON.parse(readFileSync(sessionFile, 'utf8')) as UpdaterSession;
  const child = spawn(process.execPath, [setupPath, '--root', session.runtimeRoot, '--source', session.sourceRoot,
    '--ui-source', session.workspaceRoot, '--session', sessionFile, '--port', String(session.port), '--token', session.token,
    '--tab', 'updates', '--no-open'], { cwd: session.workspaceRoot, windowsHide: true, stdio: 'inherit' });
  child.once('error', () => process.exit(1));
  child.once('exit', code => process.exit(code ?? 1));
}
