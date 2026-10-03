import { writeUpdateJsonAtomic as writeJsonAtomic } from '../shared/updateStateFile';
import {
  appendFileSync,
  existsSync,
  readFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inspectManagedDependencies } from './ManagedDependencyStatus';
import { invalidateManagedPythonSetupEvidence, prepareManagedDependencyInstallPolicy } from './ManagedDependencyInstallPolicy';
import { assertManagedDependencyRepairIdle, createManagedWorkflowRepairPlan, managedRepairStepArgs, managedRepairStatePath, managedWorkflowRepairPlans, preflightManagedWorkflowRepair, readManagedRepairState, runManagedWorkflowRepair, type ManagedRepairState } from './ManagedDependencyRepair';
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

type DependencyAction = {
  id: string;
  kind: 'comfyui' | 'node' | 'package' | 'workflow';
  target: string;
  phase: 'running' | 'complete' | 'failed';
  lines: string[];
  error: string;
};

function bundledBun(session: UpdaterSession): string {
  return join(session.runtimeRoot, 'Runtime', 'Bun', process.platform, process.platform === 'win32' ? 'bun.exe' : 'bun');
}

function freeLocalPort(): Promise<number> {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer();
    probe.once('error', rejectPort);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      probe.close((error) => error ? rejectPort(error) : resolvePort(port));
    });
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
  child.once('error', (error) => {
    console.error('[UmbraUpdaterApp] Relaunch worker failed:', error);
  });
  if (!child.pid) throw new Error('The external Umbra Studio relaunch worker did not start.');
  session.relaunchPid = child.pid;
  try { await writeJsonAtomic(sessionPath, session); }
  catch { console.warn('[UmbraUpdaterApp] Relaunch started, but its session record could not be refreshed.'); }
  child.unref();
  return child.pid;
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
  try { await writeJsonAtomic(join(session.workspaceRoot, 'session.json'), session); }
  catch { appendWorkerOutput('Update worker started, but its session record could not be refreshed.\n'); }
  const code = await completion;
  if (code !== 0 && readState(service, session).phase !== 'failed') {
    throw new Error(`The external update worker exited with code ${code}.`);
  }
}

async function runUpdate(service: AppUpdateService, session: UpdaterSession, release: UmbraReleaseBuild) {
  const startedAt = new Date().toISOString();
  let state = await writeState(service, session, {
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
      ...state,
      phase: 'failed',
      completedAt: new Date().toISOString(),
      currentItem: '',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

async function runDependencyAction(session: UpdaterSession, action: DependencyAction, args: string[]): Promise<void> {
  const bunPath = bundledBun(session);
  const scriptPath = join(session.sourceRoot, 'setup-tools.ts');
  if (!existsSync(bunPath) || !existsSync(scriptPath)) throw new Error('Managed setup tools are missing from this installation.');
  const before = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
  const policy = prepareManagedDependencyInstallPolicy(session.runtimeRoot, before.features.flatMap((feature) => feature.runtimePackages));
  try {
    const pythonVerified = action.kind === 'comfyui' ? before.comfyui.pythonDependencies.verified
      : before.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === action.target)).every((node) => node.pythonDependencies.verified);
    if (action.kind !== 'package' && !pythonVerified) invalidateManagedPythonSetupEvidence(session.runtimeRoot, action.target);
    const child = spawn(bunPath, [scriptPath, ...args], {
      cwd: session.runtimeRoot,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, UMBRA_ROOT: session.runtimeRoot, UMBRA_SOURCE_ROOT: session.sourceRoot,
        PIP_CONSTRAINT: pathToFileURL(policy.path).href },
    });
    let output = '';
    const append = (chunk: unknown) => {
      output = (output + String(chunk)).slice(-100_000);
      action.lines = output.split(/\r?\n/).filter(Boolean).slice(-80);
    };
    child.stdout?.on('data', append);
    child.stderr?.on('data', append);
    const code = await new Promise<number>((resolveExit, rejectExit) => {
      child.once('error', rejectExit);
      child.once('exit', (value) => resolveExit(value ?? 1));
    });
    if (code !== 0 || !output.includes('UMBRA_VERIFY_OK|setup-tools')) {
      throw new Error(`Managed ${action.target} setup failed (exit ${code}). Review the log and retry.`);
    }
    const status = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
    if (action.kind === 'package') {
      if (!status.backgroundCompatibility.verified) throw new Error(status.backgroundCompatibility.detail);
    } else if (action.kind === 'node') {
      const requirements = status.features.flatMap((feature) => feature.customNodes.filter((node) => node.name === action.target));
      const failed = requirements.filter((node) => !node.filesVerified || !node.pythonDependencies.verified);
      if (!requirements.length || failed.length) {
        throw new Error(`Managed ${action.target} verification failed. ${failed.map((node) => node.reason || node.pythonDependencies.detail).join(' ')}`);
      }
    } else if (status.comfyui.minimumRequired && compareUmbraVersions(status.comfyui.version, status.comfyui.minimumRequired) < 0) {
      throw new Error(`ComfyUI ${status.comfyui.minimumRequired}+ is still required by the declared workflows. Review the setup log.`);
    } else if (action.kind === 'comfyui' && status.comfyui.minimumFrontendRequired
      && compareUmbraVersions(status.comfyui.frontendVersion || '0.0.0', status.comfyui.minimumFrontendRequired) < 0) {
      throw new Error(`ComfyUI frontend ${status.comfyui.minimumFrontendRequired}+ is still required. Repair the core/frontend bundle and review the setup log.`);
    } else if (!status.comfyui.filesVerified || !status.comfyui.pythonDependencies.verified) {
      throw new Error('Managed ComfyUI files or Python Setup installation remain unverified. Review the setup log and explicitly retry.');
    }
    action.lines.push('Managed files verified. Restart managed ComfyUI and refresh its frontend before opening the workflow. Runtime node registration is checked when the workflow runs.');
  } finally { policy.cleanup(); }
}

async function openModelSetup(session: UpdaterSession): Promise<{ url: string; child: ReturnType<typeof spawn> }> {
  const bunPath = bundledBun(session);
  const scriptPath = join(session.sourceRoot, 'setup', 'UmbraSetupApp.js');
  if (!existsSync(bunPath) || !existsSync(scriptPath)) throw new Error('Umbra Setup is missing from this installation.');
  const port = await freeLocalPort();
  const token = randomUUID();
  const child = spawn(bunPath, [scriptPath, '--root', session.runtimeRoot, '--source', session.sourceRoot,
    '--port', String(port), '--token', token, '--tab', 'models', '--pack', 'requirements', '--no-open'], {
    cwd: session.runtimeRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env, UMBRA_ROOT: session.runtimeRoot, UMBRA_SOURCE_ROOT: session.sourceRoot },
  });
  let launchError: Error | null = null;
  child.once('error', (error) => { launchError = error; });
  const url = `http://127.0.0.1:${port}/?token=${encodeURIComponent(token)}&tab=models&pack=requirements`;
  try {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (launchError) throw launchError;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error('Umbra Setup exited before its model installer was ready.');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health?token=${encodeURIComponent(token)}`, { signal: AbortSignal.timeout(500) });
        if (response.ok) return { url, child };
      } catch { /* Setup is still starting. */ }
      await Bun.sleep(100);
    }
    throw new Error('Umbra Setup did not become ready.');
  } catch (error) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
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
    || !isUmbraUpdaterWorkspace(session.runtimeRoot, session.workspaceRoot)
  ) {
    throw new Error('The updater session failed path safety validation.');
  }
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
  const html = readFileSync(join(session.workspaceRoot, 'index.html'), 'utf8');
  let activeUpdate: Promise<void> | null = null;
  let activeRelaunch: Promise<void> | null = null;
  let activeDependency: Promise<void> | null = null;
  let dependencyAction: DependencyAction | null = null;
  let managedRepairState = readManagedRepairState(session.runtimeRoot);
  const persistManagedRepair = async (state: ManagedRepairState) => { managedRepairState = state; await writeJsonAtomic(managedRepairStatePath(session.runtimeRoot), state); };
  const assertDependencyIdle = () => assertManagedDependencyRepairIdle({ runtimeRoot: session.runtimeRoot, origin: localUmbraOrigin(session), serverPid: session.serverPid });
  let modelSetup: { url: string; child: ReturnType<typeof spawn> } | null = null;
  const modelSetupRunning = () => Boolean(modelSetup?.child.exitCode === null && modelSetup.child.signalCode === null && !modelSetup.child.killed);
  let admittingOperation = false;
  let relaunchState: { phase: 'idle' | 'starting' | 'ready' | 'failed'; error: string } = {
    phase: 'idle',
    error: '',
  };

  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: session.port,
    async fetch(request) {
      const url = new URL(request.url);
      if (!isAuthorized(request, url, session)) return json({ success: false, error: 'Unauthorized updater session.' }, 403);
      // The updater and its HTML survive application replacement. Never authorize another install against the startup version.
      if (!activeUpdate && !admittingOperation) refreshInstalledVersion();
      if (url.pathname === '/api/health') {
        return json({ success: true, port: server.port, currentVersion, installedVersionVerified });
      }
      if (url.pathname === '/api/releases' && request.method === 'GET') {
        try {
          const summary = await service.listReleases({
            refresh: url.searchParams.get('refresh') === 'true',
            includePrerelease: url.searchParams.get('channel') === 'prerelease',
          });
          return json({ success: true, ...summary, installedVersionVerified });
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
      if (url.pathname === '/api/dependencies' && request.method === 'GET') {
        try {
          const status = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
          return json({ success: true, currentVersion, installedVersionVerified, ...status, action: dependencyAction, repairState: managedRepairState,
            repairPlans: managedWorkflowRepairPlans(status), modelSetupRunning: modelSetupRunning() });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        }
      }
      if (url.pathname === '/api/dependencies/repair' && request.method === 'POST') {
        if (activeUpdate || activeRelaunch || activeDependency || admittingOperation || modelSetupRunning()) return json({ success: false, error: 'Finish the current operation first.' }, 409);
        if (!['idle', 'complete'].includes(readState(service, session).phase)) return json({ success: false, error: 'Complete the app update before repairing workflow dependencies.' }, 409);
        admittingOperation = true;
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          const status = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
          const plan = createManagedWorkflowRepairPlan(status, String(body.featureId || ''));
          if (body.planId !== plan.id) return json({ success: false, error: 'Review and approve the current managed dependency plan before installing.' }, 409);
          await assertDependencyIdle();
          const prior = managedRepairState;
          const state: ManagedRepairState = prior?.planId === plan.id && prior.featureId === plan.featureId
            ? { ...prior, completedTargets: [...prior.completedTargets], priorVersions: { ...prior.priorVersions }, priorCommits: { ...prior.priorCommits }, lines: [...prior.lines] }
            : { schemaVersion: 1, planId: plan.id, featureId: plan.featureId, phase: 'held', completedTargets: [], priorVersions: {}, lines: [], error: '', updatedAt: new Date().toISOString() };
          const action: DependencyAction = { id: randomUUID(), kind: 'workflow', target: plan.label, phase: 'running', lines: [], error: '' };
          dependencyAction = action;
          activeDependency = runManagedWorkflowRepair(plan, state, {
            assertIdle: assertDependencyIdle, persist: persistManagedRepair,
            inspect: () => inspectManagedDependencies(session.sourceRoot, session.runtimeRoot),
            install: async (step) => {
              action.kind = step.kind; action.target = step.target;
              try { await runDependencyAction(session, action, managedRepairStepArgs(step)); }
              finally { state.lines.push(...action.lines.slice(-20)); }
            },
          }).then(() => { action.phase = 'complete'; action.lines = state.lines; })
            .catch((error) => { action.phase = 'failed'; action.error = error instanceof Error ? error.message : String(error); action.lines = state.lines; })
            .finally(() => { activeDependency = null; });
          return json({ success: true, accepted: true, action, repairState: state }, 202);
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 409); }
        finally { admittingOperation = false; }
      }
      if (url.pathname === '/api/dependencies/preflight' && request.method === 'POST') {
        if (activeUpdate || activeRelaunch || activeDependency || admittingOperation || modelSetupRunning()) return json({ success: false, error: 'Finish the current operation before refreshing readiness.' }, 409);
        admittingOperation = true;
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          const status = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
          const plan = createManagedWorkflowRepairPlan(status, String(body.featureId || ''));
          if ((plan.featureId === 'all-managed-dependencies' || body.planId !== undefined) && body.planId !== plan.id) {
            return json({ success: false, error: 'Review the current managed dependency plan before refreshing readiness.' }, 409);
          }
          const issues = await preflightManagedWorkflowRepair(plan, status, localUmbraOrigin(session));
          if (createManagedWorkflowRepairPlan(inspectManagedDependencies(session.sourceRoot, session.runtimeRoot), plan.featureId).id !== plan.id) {
            return json({ success: false, error: 'Managed requirements changed during preflight. Review the current plan.' }, 409);
          }
          if (managedRepairState?.planId === plan.id) {
            await persistManagedRepair({ ...managedRepairState, phase: issues.length ? 'preflight-held' : 'preflight-passed',
              error: issues.join(' '), updatedAt: new Date().toISOString() });
          }
          return json({ success: true, planId: plan.id, filesVerified: plan.filesVerified, runtimeReadiness: issues.length ? 'held' : 'ready',
            ready: issues.length === 0, issues, qualification: 'Installed files and owned runtime class readiness only. Native GPU execution and quality remain unqualified; queue Resume is explicit.' });
        } catch (error) { return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 409); }
        finally { admittingOperation = false; }
      }
      if (url.pathname === '/api/dependencies/action' && request.method === 'POST') {
        if (activeUpdate || activeRelaunch || activeDependency || admittingOperation || modelSetupRunning()) {
          return json({ success: false, error: 'Finish the current updater or model setup operation first.' }, 409);
        }
        if (!['idle', 'complete'].includes(readState(service, session).phase)) {
          return json({ success: false, error: 'Finish the Umbra Studio update before managing its dependencies.' }, 409);
        }
        admittingOperation = true;
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          const kind = body.kind;
          const target = String(body.target || '');
          const status = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
          let args: string[];
          if (kind === 'comfyui' && target === 'ComfyUI') {
            args = ['managed-comfyui'];
          } else if (kind === 'node' && status.features.some((feature) => feature.customNodes.some((node) => node.name === target))) {
            args = ['comfy-node', target];
          } else {
            return json({ success: false, error: 'This managed dependency is not declared by the installed Umbra Studio build.' }, 400);
          }
          await assertDependencyIdle();
          const action: DependencyAction = { id: randomUUID(), kind, target, phase: 'running', lines: [], error: '' };
          dependencyAction = action;
          activeDependency = runDependencyAction(session, action, args)
            .then(() => { action.phase = 'complete'; })
            .catch((error) => {
              action.phase = 'failed';
              action.error = error instanceof Error ? error.message : String(error);
              console.error('[UmbraUpdaterApp] Dependency action failed:', error);
            })
            .finally(() => { activeDependency = null; });
          return json({ success: true, accepted: true, action }, 202);
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        } finally { admittingOperation = false; }
      }
      if (url.pathname === '/api/dependencies/model-setup' && request.method === 'POST') {
        if (activeUpdate || activeRelaunch || activeDependency || admittingOperation) {
          return json({ success: false, error: 'Finish the current updater operation first.' }, 409);
        }
        if (!['idle', 'complete'].includes(readState(service, session).phase)) {
          return json({ success: false, error: 'Finish the Umbra Studio update before opening its model installer.' }, 409);
        }
        admittingOperation = true;
        try {
          const body = await request.json().catch(() => ({})) as Record<string, unknown>;
          const profile = String(body.profile || '');
          const status = inspectManagedDependencies(session.sourceRoot, session.runtimeRoot);
          if (!status.features.some((feature) => feature.modelProfiles.includes(profile))) {
            return json({ success: false, error: 'The selected model profile is not declared by this Umbra Studio build.' }, 400);
          }
          if (!modelSetupRunning()) modelSetup = await openModelSetup(session);
          return json({ success: true, url: `${modelSetup!.url}&profiles=${encodeURIComponent(profile)}` });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        } finally { admittingOperation = false; }
      }
      if (url.pathname === '/api/dependencies/model-setup/close' && request.method === 'POST') {
        if (!modelSetupRunning()) return json({ success: true });
        try {
          const setupUrl = new URL(modelSetup!.url);
          const response = await fetch(`${setupUrl.origin}/api/close?token=${encodeURIComponent(setupUrl.searchParams.get('token') || '')}`, {
            method: 'POST', signal: AbortSignal.timeout(2_000),
          });
          const result = await response.json() as { error?: string };
          if (!response.ok) return json({ success: false, error: result.error || 'The model installer could not close.' }, response.status);
          return json({ success: true });
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        }
      }
      if (url.pathname === '/api/update' && request.method === 'POST') {
        if (activeUpdate || activeRelaunch || activeDependency || admittingOperation || modelSetupRunning()) return json({ success: false, error: 'An updater or model setup operation is already running.' }, 409);
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
          activeUpdate = runUpdate(service, session, release)
            .catch((error) => console.error('[UmbraUpdaterApp] Update failed:', error))
            .finally(() => {
              activeUpdate = null;
            });
          return json({ success: true, accepted: true, targetVersion: release.version }, 202);
        } catch (error) {
          return json({ success: false, error: error instanceof Error ? error.message : String(error) }, 500);
        } finally { admittingOperation = false; }
      }
      if (url.pathname === '/api/relaunch' && request.method === 'POST') {
        if (activeUpdate || activeDependency || admittingOperation || modelSetupRunning()) return json({ success: false, error: 'Wait for the current update or model setup to finish before launching Umbra Studio.' }, 409);
        if (activeRelaunch) return json({ success: false, error: 'Umbra Studio is already starting.' }, 409);
        const state = readState(service, session);
        if (state.phase !== 'complete') {
          return json({ success: false, error: 'Install an update successfully before launching Umbra Studio.' }, 409);
        }
        relaunchState = { phase: 'starting', error: '' };
        admittingOperation = true;
        try {
          await startExternalRelaunch(session, sessionPath);
        } catch (error) {
          relaunchState = {
            phase: 'failed',
            error: error instanceof Error ? error.message : String(error),
          };
          return json({ success: false, error: relaunchState.error }, 500);
        } finally { admittingOperation = false; }
        activeRelaunch = (async () => {
          await Bun.sleep(350);
          try {
            await server.stop(true);
          } finally {
            process.exit(0);
          }
        })();
        return json({ success: true, accepted: true, origin: localUmbraOrigin(session) }, 202);
      }
      if (url.pathname === '/api/relaunch-state' && request.method === 'GET') {
        return json({ success: true, ...relaunchState });
      }
      if (url.pathname === '/api/close' && request.method === 'POST') {
        if (activeUpdate || activeRelaunch || activeDependency || admittingOperation || modelSetupRunning()) return json({ success: false, error: 'Wait for the current operation or model setup to finish before closing the updater.' }, 409);
        admittingOperation = true;
        setTimeout(async () => {
          await server.stop(true);
          requestUmbraUpdaterWorkspaceCleanup(session.workspaceRoot);
          process.exit(0);
        }, 250);
        return json({ success: true });
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
    setTimeout(async () => {
      if (activeUpdate || activeRelaunch || activeDependency || admittingOperation || modelSetupRunning()) {
        stopAfterIdle();
        return;
      }
      await server.stop(true);
      requestUmbraUpdaterWorkspaceCleanup(session.workspaceRoot);
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
