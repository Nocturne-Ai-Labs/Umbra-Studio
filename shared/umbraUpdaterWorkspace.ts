import {
  existsSync,
  closeSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const UMBRA_UPDATER_CACHE_RELATIVE_PATH = join('User', 'Cache', 'UmbraUpdater');
export const UMBRA_UPDATER_CLEANUP_MARKER = 'cleanup-requested';
export const UMBRA_UPDATER_HEARTBEAT_MAX_AGE_MS = 15_000;

type UpdaterSessionRecord = {
  updaterPid?: unknown;
  workerPid?: unknown;
  relaunchPid?: unknown;
};

export function resolveUmbraUpdaterCacheRoot(runtimeRoot: string): string {
  return resolve(runtimeRoot, UMBRA_UPDATER_CACHE_RELATIVE_PATH);
}

export function isUmbraUpdaterWorkspace(runtimeRoot: string, workspaceRoot: string): boolean {
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  const workspace = resolve(workspaceRoot);
  const rel = relative(cacheRoot, workspace);
  if (!rel || isAbsolute(rel) || rel.startsWith('..') || rel.includes(`..${sep}`)) return false;
  // Never follow a redirected cache or session while replacing or cleaning app files.
  let current = resolve(runtimeRoot);
  for (const part of relative(current, workspace).split(sep)) {
    current = join(current, part);
    try { if (lstatSync(current).isSymbolicLink()) return false; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false; }
  }
  return true;
}

export function acquireUmbraUpdaterLease(runtimeRoot: string, workspaceRoot: string): () => void {
  if (!isUmbraUpdaterWorkspace(runtimeRoot, workspaceRoot)) throw new Error('Unsafe updater workspace.');
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  mkdirSync(cacheRoot, { recursive: true });
  const lockPath = join(cacheRoot, 'updater.lock');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let descriptor: number;
    try { descriptor = openSync(lockPath, 'wx'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const stat = lstatSync(lockPath);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Unsafe updater lock.');
      let ownerPid = 0;
      try { ownerPid = Number(JSON.parse(readFileSync(lockPath, 'utf8')).pid) || 0; } catch { /* An owner may still be recording its lease. */ }
      if (ownerPid === process.pid || isProcessAlive(ownerPid) || (!ownerPid && Date.now() - stat.mtimeMs < 60_000)) {
        throw new Error('Another Updater is already open for this installation. Use its window or close it before trying again.');
      }
      // Compare identity before reclaiming a dead process's lease.
      const current = lstatSync(lockPath);
      if (current.dev === stat.dev && current.ino === stat.ino && current.mtimeMs === stat.mtimeMs) unlinkSync(lockPath);
      continue;
    }
    const owned = fstatSync(descriptor);
    try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, workspaceRoot: resolve(workspaceRoot) })); }
    finally { closeSync(descriptor); }
    const release = () => {
      try {
        const current = lstatSync(lockPath);
        if (current.dev === owned.dev && current.ino === owned.ino) unlinkSync(lockPath);
      } catch { /* A completed session may already have released its lease. */ }
    };
    process.once('exit', release);
    return release;
  }
  throw new Error('The Updater lease changed while starting. Try again.');
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

type UmbraUpdaterProcessKind = 'updater' | 'worker' | 'relaunch';

function heartbeatPath(workspaceRoot: string, kind: UmbraUpdaterProcessKind): string {
  return join(workspaceRoot, `${kind}-heartbeat`);
}

export function markUmbraUpdaterProcessHeartbeat(
  workspaceRoot: string,
  kind: UmbraUpdaterProcessKind,
) {
  writeFileSync(heartbeatPath(workspaceRoot, kind), `${Date.now()}\n`, 'utf8');
}

function isUmbraUpdaterProcessActive(
  workspaceRoot: string,
  kind: UmbraUpdaterProcessKind,
  pid: number,
): boolean {
  if (pid === process.pid) return true;
  if (!isProcessAlive(pid)) return false;
  try {
    const heartbeatAt = Number.parseInt(readFileSync(heartbeatPath(workspaceRoot, kind), 'utf8'), 10);
    // Synchronous installers can pause heartbeats for minutes. A live recorded
    // process must retain its workspace even when a cleanup marker is present.
    return Number.isFinite(heartbeatAt) && heartbeatAt > 0;
  } catch {
    return false;
  }
}

function hasActiveWorkspaceProcess(workspaceRoot: string): boolean {
  let session: UpdaterSessionRecord;
  try {
    session = JSON.parse(readFileSync(join(workspaceRoot, 'session.json'), 'utf8')) as UpdaterSessionRecord;
  } catch {
    return false;
  }
  const updaterPid = Math.max(0, Math.floor(Number(session.updaterPid) || 0));
  const workerPid = Math.max(0, Math.floor(Number(session.workerPid) || 0));
  const relaunchPid = Math.max(0, Math.floor(Number(session.relaunchPid) || 0));
  return isUmbraUpdaterProcessActive(workspaceRoot, 'updater', updaterPid)
    || isUmbraUpdaterProcessActive(workspaceRoot, 'worker', workerPid)
    || isUmbraUpdaterProcessActive(workspaceRoot, 'relaunch', relaunchPid);
}

export function hasActiveUmbraUpdaterProcess(
  runtimeRoot: string,
  excludedWorkspaceRoot = '',
): boolean {
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  if (!existsSync(cacheRoot) || !isUmbraUpdaterWorkspace(runtimeRoot, join(cacheRoot, 'session-check'))) return false;
  const excluded = excludedWorkspaceRoot ? resolve(excludedWorkspaceRoot) : '';

  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^session-[a-z0-9._-]+$/i.test(entry.name)) continue;
    const workspaceRoot = resolve(cacheRoot, entry.name);
    if (workspaceRoot === excluded || !isUmbraUpdaterWorkspace(runtimeRoot, workspaceRoot)) continue;
    if (hasActiveWorkspaceProcess(workspaceRoot)) return true;
  }
  return false;
}

export function requestUmbraUpdaterWorkspaceCleanup(workspaceRoot: string) {
  writeFileSync(join(workspaceRoot, UMBRA_UPDATER_CLEANUP_MARKER), `${new Date().toISOString()}\n`, 'utf8');
}

export function cleanupInactiveUmbraUpdaterWorkspaces(
  runtimeRoot: string,
  options: { staleAfterMs?: number } = {},
): string[] {
  const cacheRoot = resolveUmbraUpdaterCacheRoot(runtimeRoot);
  if (!existsSync(cacheRoot) || !isUmbraUpdaterWorkspace(runtimeRoot, join(cacheRoot, 'session-check'))) return [];
  const staleAfterMs = Math.max(60_000, Number(options.staleAfterMs) || 24 * 60 * 60 * 1000);
  const removed: string[] = [];

  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^session-[a-z0-9._-]+$/i.test(entry.name)) continue;
    const workspaceRoot = resolve(cacheRoot, entry.name);
    if (!isUmbraUpdaterWorkspace(runtimeRoot, workspaceRoot)) continue;
    if (hasActiveWorkspaceProcess(workspaceRoot)) continue;
    // Recovery copies may be the only remaining original app or user directories.
    try {
      if (readdirSync(workspaceRoot).some((name) => /^(?:backup-|failed-app-|preserved$)/i.test(name))) continue;
    } catch {
      continue;
    }
    const cleanupRequested = existsSync(join(workspaceRoot, UMBRA_UPDATER_CLEANUP_MARKER));
    let stale = false;
    try {
      stale = Date.now() - statSync(workspaceRoot).mtimeMs >= staleAfterMs;
    } catch {
      stale = true;
    }
    if (!cleanupRequested && !stale) continue;
    rmSync(workspaceRoot, { recursive: true, force: true });
    if (!existsSync(workspaceRoot)) removed.push(basename(workspaceRoot));
  }
  return removed;
}
