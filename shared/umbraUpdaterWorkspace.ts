import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';

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
  return Boolean(rel) && !rel.startsWith('..') && !rel.includes(`..${sep}`);
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
  if (!isProcessAlive(pid)) return false;
  try {
    const heartbeatAt = Number.parseInt(readFileSync(heartbeatPath(workspaceRoot, kind), 'utf8'), 10);
    return Number.isFinite(heartbeatAt)
      && Date.now() - heartbeatAt <= UMBRA_UPDATER_HEARTBEAT_MAX_AGE_MS;
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
  if (!existsSync(cacheRoot)) return false;
  const excluded = excludedWorkspaceRoot ? resolve(excludedWorkspaceRoot) : '';

  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^session-[a-z0-9-]+$/i.test(entry.name)) continue;
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
  if (!existsSync(cacheRoot)) return [];
  const staleAfterMs = Math.max(60_000, Number(options.staleAfterMs) || 24 * 60 * 60 * 1000);
  const removed: string[] = [];

  for (const entry of readdirSync(cacheRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^session-[a-z0-9-]+$/i.test(entry.name)) continue;
    const workspaceRoot = resolve(cacheRoot, entry.name);
    if (!isUmbraUpdaterWorkspace(runtimeRoot, workspaceRoot)) continue;
    if (hasActiveWorkspaceProcess(workspaceRoot)) continue;
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
