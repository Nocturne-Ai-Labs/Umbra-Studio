import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { dirname, join, resolve, sep } from 'node:path';
import { resolveUmbraWindowsLauncher } from '../shared/portableLauncher';
import {
  isUmbraUpdaterWorkspace,
  markUmbraUpdaterProcessHeartbeat,
  requestUmbraUpdaterWorkspaceCleanup,
} from '../shared/umbraUpdaterWorkspace';

type UmbraRelaunchRequest = {
  schemaVersion: 1;
  runtimeRoot: string;
  workspaceRoot: string;
  requestPath: string;
  appPort: number;
  appHost: string;
  updaterPid: number;
  createdAt: string;
};

type UmbraLaunchHandle = {
  pid: number;
  child?: ChildProcess;
};

const UPDATER_EXIT_TIMEOUT_MS = 30_000;
const UPDATER_EXIT_SETTLE_MS = 5_000;
const LAUNCH_READY_TIMEOUT_MS = 30_000;
const LAUNCH_ATTEMPTS = 3;

function readArg(name: string): string {
  const args = Bun.argv.slice(2);
  const index = args.indexOf(name);
  if (index >= 0) return String(args[index + 1] || '');
  const inline = args.find((entry) => entry.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : '';
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function log(request: UmbraRelaunchRequest, message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(`[UmbraRelaunchWorker] ${message}`);
  try {
    appendFileSync(join(request.workspaceRoot, 'relaunch.log'), `${line}\n`, 'utf8');
  } catch {
    // The launcher cleanup pass may remove the completed workspace during exit.
  }
  try {
    const logRoot = join(request.runtimeRoot, 'User', 'Logs');
    mkdirSync(logRoot, { recursive: true });
    appendFileSync(join(logRoot, 'updater-relaunch.log'), `${line}\n`, 'utf8');
  } catch {
    // Relaunch should not fail only because durable logging is unavailable.
  }
}

async function waitForUpdaterExit(request: UmbraRelaunchRequest) {
  const deadline = Date.now() + UPDATER_EXIT_TIMEOUT_MS;
  while (isProcessAlive(request.updaterPid)) {
    if (Date.now() >= deadline) {
      throw new Error(`Updater PID ${request.updaterPid} did not exit before relaunch.`);
    }
    await Bun.sleep(100);
  }
  await Bun.sleep(UPDATER_EXIT_SETTLE_MS);
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function launchWindowsUmbraStudio(
  request: UmbraRelaunchRequest,
  command: string,
  args: string[],
): UmbraLaunchHandle {
  const runtimeRoot = resolve(request.runtimeRoot);
  const launchArgs = args.map(quotePowerShellLiteral).join(', ');
  const script = [
    "$ErrorActionPreference = 'Stop'",
    `$process = Start-Process -FilePath ${quotePowerShellLiteral(command)} `
      + `-ArgumentList @(${launchArgs}) `
      + `-WorkingDirectory ${quotePowerShellLiteral(runtimeRoot)} -PassThru`,
    '[Console]::Out.Write($process.Id)',
  ].join('; ');
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script,
  ], {
    cwd: runtimeRoot,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15_000,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
      UMBRA_PORT: String(request.appPort),
      UMBRA_HOST: request.appHost || '127.0.0.1',
      UMBRA_UPDATER_RELAUNCH: '1',
      UMBRA_TERMINAL_MODE: 'visible',
      UMBRA_PAUSE_ON_EXIT: '0',
    },
  });
  const pid = Number.parseInt(String(result.stdout || '').trim(), 10);
  if (result.status !== 0 || !Number.isFinite(pid) || pid <= 0) {
    const detail = String(result.stderr || result.stdout || result.error?.message || '').trim();
    throw new Error(`Umbra Studio launcher did not start${detail ? `: ${detail}` : '.'}`);
  }
  return { pid };
}

function launchUmbraStudio(request: UmbraRelaunchRequest): UmbraLaunchHandle {
  const runtimeRoot = resolve(request.runtimeRoot);
  let command = '';
  let args: string[] = [];
  if (process.platform === 'win32') {
    const launcher = resolveUmbraWindowsLauncher(runtimeRoot);
    if (!launcher) throw new Error('Umbra Studio launcher is missing from the updated installation.');
    command = launcher.command;
    args = launcher.args;
    return launchWindowsUmbraStudio(request, command, args);
  } else {
    const launcherPath = join(runtimeRoot, 'start-umbra.sh');
    if (!existsSync(launcherPath)) throw new Error('Umbra Studio launcher is missing from the updated installation.');
    command = '/bin/sh';
    args = [launcherPath];
  }

  const child = spawn(command, args, {
    cwd: runtimeRoot,
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    env: {
      ...process.env,
      UMBRA_ROOT: runtimeRoot,
      UMBRA_PORT: String(request.appPort),
      UMBRA_HOST: request.appHost || '127.0.0.1',
      UMBRA_UPDATER_RELAUNCH: '1',
      UMBRA_TERMINAL_MODE: 'visible',
      UMBRA_PAUSE_ON_EXIT: '0',
    },
  });
  if (!child.pid) throw new Error('Umbra Studio launcher did not start.');
  return { pid: child.pid, child };
}

function stopOwnedLauncher(handle: UmbraLaunchHandle) {
  const pid = handle.pid || 0;
  if (pid <= 0) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
        timeout: 10_000,
      });
    } else {
      handle.child?.kill('SIGTERM');
    }
  } catch {
    // A launcher that exited between readiness checks needs no further cleanup.
  }
}

async function fetchUmbraReady(request: UmbraRelaunchRequest): Promise<boolean> {
  const host = request.appHost === '::1' ? '[::1]' : '127.0.0.1';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(`http://${host}:${request.appPort}/api/healthz/ready`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({})) as { runtimeRoot?: string };
    return resolve(String(payload.runtimeRoot || '')) === resolve(request.runtimeRoot);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

async function waitForLaunchReady(
  request: UmbraRelaunchRequest,
  handle: UmbraLaunchHandle,
): Promise<{ ready: boolean; detail: string }> {
  let exitDetail = '';
  handle.child?.once('exit', (code) => { exitDetail = `launcher exited with code ${code ?? 1}`; });
  handle.child?.once('error', (error) => { exitDetail = `launcher failed: ${error.message}`; });
  const deadline = Date.now() + LAUNCH_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (exitDetail) return { ready: false, detail: exitDetail };
    if (!isProcessAlive(handle.pid)) return { ready: false, detail: 'launcher exited before Umbra reported ready' };
    if (await fetchUmbraReady(request)) return { ready: true, detail: '' };
    await Bun.sleep(250);
  }
  stopOwnedLauncher(handle);
  return { ready: false, detail: 'Umbra Studio did not report ready within 30 seconds' };
}

async function launchWithRetry(request: UmbraRelaunchRequest): Promise<number> {
  let lastFailure = '';
  for (let attempt = 1; attempt <= LAUNCH_ATTEMPTS; attempt += 1) {
    const handle = launchUmbraStudio(request);
    const result = await waitForLaunchReady(request, handle);
    if (result.ready) {
      handle.child?.unref();
      return handle.pid;
    }
    lastFailure = result.detail;
    log(request, `Launch attempt ${attempt}/${LAUNCH_ATTEMPTS} failed: ${result.detail}.`);
    if (attempt < LAUNCH_ATTEMPTS) await Bun.sleep(attempt * 5_000);
  }
  throw new Error(`Umbra Studio did not remain running after ${LAUNCH_ATTEMPTS} attempts (${lastFailure}).`);
}

async function main() {
  const requestPath = resolve(readArg('--request'));
  if (!requestPath || !existsSync(requestPath)) throw new Error('A valid relaunch request is required.');
  const request = JSON.parse(readFileSync(requestPath, 'utf8')) as UmbraRelaunchRequest;
  if (
    request.schemaVersion !== 1
    || resolve(request.requestPath) !== requestPath
    || resolve(request.workspaceRoot) !== dirname(requestPath)
    || !isUmbraUpdaterWorkspace(request.runtimeRoot, request.workspaceRoot)
    || resolve(request.runtimeRoot) === resolve(request.workspaceRoot)
    || resolve(request.runtimeRoot).startsWith(`${resolve(request.workspaceRoot)}${sep}`)
  ) {
    throw new Error('The relaunch request failed its path safety validation.');
  }

  markUmbraUpdaterProcessHeartbeat(request.workspaceRoot, 'relaunch');
  const heartbeat = setInterval(() => {
    try {
      markUmbraUpdaterProcessHeartbeat(request.workspaceRoot, 'relaunch');
    } catch {
      // The launcher may complete workspace cleanup as this worker exits.
    }
  }, 1_000);
  heartbeat.unref();

  log(request, `Waiting for updater PID ${request.updaterPid} to exit.`);
  await waitForUpdaterExit(request);
  try {
    const launcherPid = await launchWithRetry(request);
    log(request, `Started stable Umbra Studio launcher PID ${launcherPid}.`);
  } finally {
    requestUmbraUpdaterWorkspaceCleanup(request.workspaceRoot);
  }
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraRelaunchWorker] Fatal:', error);
    process.exit(1);
  });
}
