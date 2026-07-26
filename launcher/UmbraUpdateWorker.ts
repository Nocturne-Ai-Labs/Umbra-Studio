import {
  chmodSync,
  createWriteStream,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import yauzl from 'yauzl';
import {
  normalizeUmbraUpdateState,
  type UmbraUpdateState,
  type UmbraUpdateWorkerRequest,
} from '../shared/appUpdate';

const UPDATE_WAIT_TIMEOUT_MS = 10 * 60 * 1000;
const STARTUP_HEALTH_TIMEOUT_MS = 2 * 60 * 1000;

function log(request: UmbraUpdateWorkerRequest, message: string) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(`[UmbraUpdater] ${message}`);
  try {
    const logPath = join(request.workspaceRoot, 'update.log');
    const previous = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    writeFileSync(logPath, `${previous}${line}\n`, 'utf8');
  } catch {
    // The update remains functional if logging is unavailable.
  }
}

function writeJsonAtomic(filePath: string, value: unknown) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, filePath);
}

function readState(request: UmbraUpdateWorkerRequest): UmbraUpdateState {
  const workspaceStatePath = join(request.workspaceRoot, 'update-state.json');
  for (const candidate of [workspaceStatePath, request.statePath]) {
    try {
      if (existsSync(candidate)) {
        return normalizeUmbraUpdateState(JSON.parse(readFileSync(candidate, 'utf8')), request.currentVersion);
      }
    } catch {
      // Continue to the next state copy.
    }
  }
  return normalizeUmbraUpdateState({}, request.currentVersion);
}

function writeState(
  request: UmbraUpdateWorkerRequest,
  patch: Partial<UmbraUpdateState>,
): UmbraUpdateState {
  const next = normalizeUmbraUpdateState({
    ...readState(request),
    ...patch,
  }, request.currentVersion);
  writeJsonAtomic(join(request.workspaceRoot, 'update-state.json'), next);
  try {
    writeJsonAtomic(request.statePath, next);
  } catch {
    // User/ is temporarily outside the app root while files are swapped.
  }
  return next;
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

async function waitForProcesses(request: UmbraUpdateWorkerRequest) {
  const pids = [request.serverPid, request.launcherPid]
    .filter((pid, index, all) => pid > 0 && all.indexOf(pid) === index);
  const startedAt = Date.now();
  while (pids.some(isProcessAlive)) {
    if (Date.now() - startedAt > UPDATE_WAIT_TIMEOUT_MS) {
      throw new Error('Umbra did not fully shut down within ten minutes. No application files were replaced.');
    }
    await Bun.sleep(250);
  }
  await Bun.sleep(750);
}

export function safeArchiveEntryName(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\.\/+/, '');
  if (
    !normalized
    || normalized.startsWith('/')
    || /^[a-z]:/i.test(normalized)
    || normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`Release archive contains an unsafe path: ${value}`);
  }
  return normalized;
}

async function extractZip(
  archivePath: string,
  destinationRoot: string,
  request: UmbraUpdateWorkerRequest,
) {
  mkdirSync(destinationRoot, { recursive: true });
  let lastStateWriteAt = 0;
  await new Promise<void>((resolveExtract, rejectExtract) => {
    yauzl.open(archivePath, { lazyEntries: true, autoClose: true }, (openError, archive) => {
      if (openError || !archive) {
        rejectExtract(openError || new Error('Release archive could not be opened.'));
        return;
      }
      let settled = false;
      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        archive.close();
        rejectExtract(error instanceof Error ? error : new Error(String(error)));
      };
      archive.on('error', fail);
      archive.on('end', () => {
        if (settled) return;
        settled = true;
        resolveExtract();
      });
      archive.on('entry', (entry) => {
        let relativePath = '';
        try {
          relativePath = safeArchiveEntryName(entry.fileName);
        } catch (error) {
          fail(error);
          return;
        }
        const destinationPath = resolve(destinationRoot, ...relativePath.split('/'));
        const rel = relative(resolve(destinationRoot), destinationPath);
        if (!rel || rel.startsWith('..') || isAbsolute(rel)) {
          fail(new Error(`Release archive escaped its extraction root: ${entry.fileName}`));
          return;
        }
        const now = Date.now();
        if (now - lastStateWriteAt >= 150) {
          lastStateWriteAt = now;
          writeState(request, { phase: 'extracting', currentItem: relativePath });
        }
        if (/\/$/.test(relativePath)) {
          mkdirSync(destinationPath, { recursive: true });
          archive.readEntry();
          return;
        }
        mkdirSync(dirname(destinationPath), { recursive: true });
        archive.openReadStream(entry, (streamError, input) => {
          if (streamError || !input) {
            fail(streamError || new Error(`Could not extract ${relativePath}.`));
            return;
          }
          const output = createWriteStream(destinationPath, { flags: 'wx' });
          input.on('error', fail);
          output.on('error', fail);
          output.on('close', () => {
            if (process.platform !== 'win32') {
              const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
              if (unixMode) {
                try {
                  chmodSync(destinationPath, unixMode & 0o777);
                } catch {
                  // Known launchers are repaired after extraction.
                }
              }
            }
            archive.readEntry();
          });
          input.pipe(output);
        });
      });
      archive.readEntry();
    });
  });
}

function findPayloadRoot(extractionRoot: string): string {
  if (existsSync(join(extractionRoot, 'resources', 'app', 'package.json'))) return extractionRoot;
  const directories = readdirSync(extractionRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(extractionRoot, entry.name));
  const nested = directories.find((candidate) => existsSync(join(candidate, 'resources', 'app', 'package.json')));
  if (nested) return nested;
  throw new Error('The release package is not a complete Umbra Studio portable build.');
}

function verifyPayload(payloadRoot: string, request: UmbraUpdateWorkerRequest) {
  const required = [
    join(payloadRoot, 'resources', 'app', 'package.json'),
    join(payloadRoot, 'resources', 'app', 'UmbraServer.js'),
    join(payloadRoot, 'resources', 'app', 'launcher', 'UmbraUpdateWorker.js'),
    join(payloadRoot, 'resources', 'app', 'launcher', 'UmbraUpdaterBootstrap.js'),
    join(payloadRoot, 'resources', 'app', 'updater', 'UmbraUpdaterApp.js'),
    join(payloadRoot, 'resources', 'app', 'updater', 'index.html'),
    process.platform === 'win32'
      ? join(payloadRoot, 'UmbraStudio.exe')
      : join(payloadRoot, 'start-umbra.sh'),
    process.platform === 'win32'
      ? join(payloadRoot, 'UmbraUpdater.bat')
      : join(payloadRoot, 'umbra-updater.sh'),
  ];
  const missing = required.filter((candidate) => !existsSync(candidate));
  if (missing.length > 0) {
    throw new Error(`Release package is incomplete: ${missing.map((candidate) => basename(candidate)).join(', ')}`);
  }
  const packageJson = JSON.parse(readFileSync(required[0], 'utf8')) as Record<string, unknown>;
  const packagedVersion = String(packageJson.version || '').trim().replace(/^v/i, '');
  if (packagedVersion !== request.targetVersion.replace(/^v/i, '')) {
    throw new Error(`Release version mismatch: expected ${request.targetVersion}, found ${packagedVersion || 'unknown'}.`);
  }
}

function moveIfPresent(sourcePath: string, destinationPath: string) {
  if (!existsSync(sourcePath)) return false;
  if (existsSync(destinationPath)) rmSync(destinationPath, { recursive: true, force: true });
  mkdirSync(dirname(destinationPath), { recursive: true });
  renameSync(sourcePath, destinationPath);
  return true;
}

export function rollbackSwap(
  request: UmbraUpdateWorkerRequest,
  backupRoot: string,
  preservedRoot: string,
) {
  if (!existsSync(backupRoot)) {
    if (!existsSync(request.runtimeRoot)) {
      throw new Error('The original application root and its backup are both missing.');
    }
    moveIfPresent(join(preservedRoot, 'User'), join(request.runtimeRoot, 'User'));
    moveIfPresent(join(preservedRoot, 'Tools'), join(request.runtimeRoot, 'Tools'));
    return;
  }

  const failedRoot = `${request.runtimeRoot}.failed-${Date.now()}`;
  if (existsSync(request.runtimeRoot)) {
    moveIfPresent(join(request.runtimeRoot, 'User'), join(preservedRoot, 'User'));
    moveIfPresent(join(request.runtimeRoot, 'Tools'), join(preservedRoot, 'Tools'));
    renameSync(request.runtimeRoot, failedRoot);
  }
  if (existsSync(backupRoot)) renameSync(backupRoot, request.runtimeRoot);
  moveIfPresent(join(preservedRoot, 'User'), join(request.runtimeRoot, 'User'));
  moveIfPresent(join(preservedRoot, 'Tools'), join(request.runtimeRoot, 'Tools'));
  if (existsSync(failedRoot)) rmSync(failedRoot, { recursive: true, force: true });
}

export function applyPayload(
  request: UmbraUpdateWorkerRequest,
  payloadRoot: string,
): { backupRoot: string; preservedRoot: string } {
  const parentRoot = dirname(request.runtimeRoot);
  const safeCurrentVersion = request.currentVersion.replace(/[^a-z0-9._-]+/gi, '-');
  const backupRoot = join(parentRoot, `.umbra-backup-${safeCurrentVersion}-${Date.now()}`);
  const preservedRoot = join(request.workspaceRoot, 'preserved');
  mkdirSync(preservedRoot, { recursive: true });

  moveIfPresent(join(request.runtimeRoot, 'User'), join(preservedRoot, 'User'));
  moveIfPresent(join(request.runtimeRoot, 'Tools'), join(preservedRoot, 'Tools'));
  try {
    renameSync(request.runtimeRoot, backupRoot);
    rmSync(join(payloadRoot, 'User'), { recursive: true, force: true });
    rmSync(join(payloadRoot, 'Tools'), { recursive: true, force: true });
    renameSync(payloadRoot, request.runtimeRoot);
    moveIfPresent(join(preservedRoot, 'User'), join(request.runtimeRoot, 'User'));
    moveIfPresent(join(preservedRoot, 'Tools'), join(request.runtimeRoot, 'Tools'));
    mkdirSync(join(request.runtimeRoot, 'User'), { recursive: true });
    mkdirSync(join(request.runtimeRoot, 'Tools'), { recursive: true });
    return { backupRoot, preservedRoot };
  } catch (error) {
    rollbackSwap(request, backupRoot, preservedRoot);
    throw error;
  }
}

function updateUmbraNodes(request: UmbraUpdateWorkerRequest): { status: UmbraUpdateState['nodeUpdate']; warning: string } {
  const comfyRoot = join(request.runtimeRoot, 'Tools', 'ComfyUI');
  if (!existsSync(comfyRoot)) return { status: 'skipped', warning: '' };
  const setupScript = join(request.runtimeRoot, 'resources', 'app', 'setup-tools.ts');
  const bunBinary = process.platform === 'win32'
    ? join(request.runtimeRoot, 'Runtime', 'Bun', 'win32', 'bun.exe')
    : join(request.runtimeRoot, 'Runtime', 'Bun', 'linux', 'bun');
  if (!existsSync(setupScript) || !existsSync(bunBinary)) {
    return { status: 'warning', warning: 'Umbra Nodes could not be checked because its setup runtime is missing.' };
  }
  const result = spawnSync(bunBinary, [setupScript, 'umbra-nodes'], {
    cwd: join(request.runtimeRoot, 'resources', 'app'),
    env: {
      ...process.env,
      UMBRA_ROOT: request.runtimeRoot,
    },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 5 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`.trim();
  if (result.status === 0 && output.includes('UMBRA_VERIFY_OK|setup-tools')) {
    return { status: 'updated', warning: '' };
  }
  return {
    status: 'warning',
    warning: output || 'Umbra Nodes could not be updated. Use ComfyUI custom-node setup after Umbra restarts.',
  };
}

function launcherCommand(request: UmbraUpdateWorkerRequest): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: join(request.runtimeRoot, 'UmbraStudio.exe'), args: [] };
  }
  const launcher = join(request.runtimeRoot, 'start-umbra.sh');
  try {
    chmodSync(launcher, 0o755);
    chmodSync(join(request.runtimeRoot, 'Runtime', 'Bun', 'linux', 'bun'), 0o755);
  } catch {
    // The launch attempt below provides the actionable failure.
  }
  return { command: launcher, args: [] };
}

function healthOrigin(request: UmbraUpdateWorkerRequest): string {
  const host = request.bindHost === '::1' ? '[::1]' : '127.0.0.1';
  return `http://${host}:${request.port}`;
}

async function waitForHealthyRestart(request: UmbraUpdateWorkerRequest): Promise<boolean> {
  const startedAt = Date.now();
  const url = `${healthOrigin(request)}/api/healthz/ready`;
  while (Date.now() - startedAt < STARTUP_HEALTH_TIMEOUT_MS) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (response.ok) {
        const body = await response.json().catch(() => ({})) as Record<string, unknown>;
        if (String(body.runtimeRoot || '').trim().toLowerCase() === request.runtimeRoot.toLowerCase()) return true;
      }
    } catch {
      // The new server is still starting.
    }
    await Bun.sleep(500);
  }
  return false;
}

async function stopLaunchedProcessTree(pid: number) {
  if (!Number.isFinite(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 30_000,
    });
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // The failed launch may already have exited.
      }
    }
  }
  const startedAt = Date.now();
  while (isProcessAlive(pid) && Date.now() - startedAt < 30_000) {
    await Bun.sleep(200);
  }
}

function scheduleWorkspaceCleanup(workspaceRoot: string) {
  if (process.platform === 'win32') {
    spawn('cmd.exe', ['/d', '/c', `ping 127.0.0.1 -n 4 >nul & rmdir /s /q "${workspaceRoot}"`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }
  spawn('/bin/sh', ['-c', `sleep 2; rm -rf -- "$1"`, 'umbra-update-cleanup', workspaceRoot], {
    detached: true,
    stdio: 'ignore',
  }).unref();
}

export async function runUpdateRequest(request: UmbraUpdateWorkerRequest) {
  let backupRoot = '';
  let preservedRoot = '';
  let launchedPid = 0;
  try {
    log(request, `Waiting for Umbra ${request.currentVersion} to close.`);
    await waitForProcesses(request);
    writeState(request, { phase: 'extracting', currentItem: 'Opening release package' });

    const extractionRoot = join(request.workspaceRoot, 'payload');
    await extractZip(request.archivePath, extractionRoot, request);
    const payloadRoot = findPayloadRoot(extractionRoot);
    verifyPayload(payloadRoot, request);

    writeState(request, { phase: 'applying', currentItem: 'Replacing application files' });
    ({ backupRoot, preservedRoot } = applyPayload(request, payloadRoot));
    writeState(request, { phase: 'updating_nodes', currentItem: 'Updating Umbra Nodes' });
    const nodeResult = updateUmbraNodes(request);
    writeState(request, {
      phase: 'restarting',
      nodeUpdate: nodeResult.status,
      warning: nodeResult.warning,
      currentItem: 'Restarting Umbra Studio',
    });

    const launch = launcherCommand(request);
    const launched = spawn(launch.command, launch.args, {
      cwd: request.runtimeRoot,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    });
    launchedPid = launched.pid || 0;
    launched.unref();

    const healthy = await waitForHealthyRestart(request);
    if (!healthy) {
      await stopLaunchedProcessTree(launchedPid);
      launchedPid = 0;
      throw new Error('The updated build did not report ready within two minutes. The previous build was restored.');
    }

    writeState(request, {
      phase: 'complete',
      currentVersion: request.targetVersion,
      completedAt: new Date().toISOString(),
      currentItem: '',
      error: '',
    });
    if (backupRoot && existsSync(backupRoot)) {
      try {
        rmSync(backupRoot, { recursive: true, force: true });
      } catch (cleanupError) {
        log(request, `The update succeeded, but its old-build backup could not be removed: ${
          cleanupError instanceof Error ? cleanupError.message : String(cleanupError)
        }`);
      }
    }
    log(request, `Umbra Studio ${request.targetVersion} is healthy.`);
    if (!request.keepWorkspaceAlive) scheduleWorkspaceCleanup(request.workspaceRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (launchedPid > 0) await stopLaunchedProcessTree(launchedPid);
    try {
      if (backupRoot && existsSync(backupRoot)) rollbackSwap(request, backupRoot, preservedRoot);
    } catch (rollbackError) {
      log(request, `Rollback also failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    writeState(request, {
      phase: 'failed',
      completedAt: new Date().toISOString(),
      currentItem: '',
      error: message,
    });
    log(request, `Update failed: ${message}`);
    const currentLauncher = launcherCommand(request);
    if (existsSync(currentLauncher.command)) {
      spawn(currentLauncher.command, currentLauncher.args, {
        cwd: request.runtimeRoot,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      }).unref();
    }
    throw error;
  }
}

function requestPathFromArgs(argv: string[]): string {
  const index = argv.findIndex((entry) => entry === '--request');
  if (index >= 0) return String(argv[index + 1] || '').trim();
  const inline = argv.find((entry) => entry.startsWith('--request='));
  return inline ? inline.slice('--request='.length).trim() : '';
}

async function main() {
  const requestPath = resolve(requestPathFromArgs(Bun.argv.slice(2)));
  if (!requestPath || !existsSync(requestPath)) throw new Error('A valid update request is required.');
  const request = JSON.parse(readFileSync(requestPath, 'utf8')) as UmbraUpdateWorkerRequest;
  if (
    request.schemaVersion !== 1
    || resolve(request.requestPath) !== requestPath
    || resolve(request.workspaceRoot) !== dirname(requestPath)
    || resolve(request.runtimeRoot) === resolve(request.workspaceRoot)
    || resolve(request.runtimeRoot).startsWith(`${resolve(request.workspaceRoot)}${sep}`)
  ) {
    throw new Error('The update request failed its path safety validation.');
  }
  await runUpdateRequest(request);
}

if (import.meta.main) {
  void main().catch((error) => {
    console.error('[UmbraUpdater] Fatal update error:', error);
    process.exit(1);
  });
}
