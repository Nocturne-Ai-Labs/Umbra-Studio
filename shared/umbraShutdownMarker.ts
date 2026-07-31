import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export const UMBRA_SHUTDOWN_MARKER_FILENAME = 'umbra-shutdown.json';
export const UMBRA_SHUTDOWN_MARKER_MAX_AGE_MS = 5 * 60 * 1000;

export type UmbraShutdownMarker = {
  schemaVersion: 1;
  serverPid: number;
  managedProcessPids: number[];
  reason: string;
  requestedAtMs: number;
};

function normalizePid(value: unknown): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeManagedPids(value: unknown, serverPid: number): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map(normalizePid)
    .filter((pid) => pid > 0 && pid !== serverPid)));
}

export function resolveUmbraShutdownMarkerPath(runtimeRoot: string): string {
  return join(runtimeRoot, 'Runtime', 'Cache', UMBRA_SHUTDOWN_MARKER_FILENAME);
}

export function createUmbraShutdownMarker(input: {
  serverPid: number;
  managedProcessPids?: number[];
  reason: string;
  requestedAtMs?: number;
}): UmbraShutdownMarker {
  const serverPid = normalizePid(input.serverPid);
  if (!serverPid) throw new Error('A valid Umbra server PID is required for the shutdown marker.');
  return {
    schemaVersion: 1,
    serverPid,
    managedProcessPids: normalizeManagedPids(input.managedProcessPids, serverPid),
    reason: String(input.reason || 'shutdown').trim() || 'shutdown',
    requestedAtMs: Math.max(0, Number(input.requestedAtMs) || Date.now()),
  };
}

export function writeUmbraShutdownMarker(
  runtimeRoot: string,
  input: Parameters<typeof createUmbraShutdownMarker>[0],
): UmbraShutdownMarker {
  const marker = createUmbraShutdownMarker(input);
  const markerPath = resolveUmbraShutdownMarkerPath(runtimeRoot);
  mkdirSync(dirname(markerPath), { recursive: true });
  const temporaryPath = `${markerPath}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(temporaryPath, `${JSON.stringify(marker)}\n`, 'utf8');
  try {
    if (existsSync(markerPath)) unlinkSync(markerPath);
    renameSync(temporaryPath, markerPath);
  } catch (error) {
    try {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    } catch {
      // Preserve the original write error.
    }
    throw error;
  }
  return marker;
}

export function readUmbraShutdownMarker(runtimeRoot: string): UmbraShutdownMarker | null {
  const markerPath = resolveUmbraShutdownMarkerPath(runtimeRoot);
  try {
    if (!existsSync(markerPath)) return null;
    const raw = JSON.parse(readFileSync(markerPath, 'utf8')) as Partial<UmbraShutdownMarker>;
    if (raw.schemaVersion !== 1) return null;
    const serverPid = normalizePid(raw.serverPid);
    if (!serverPid) return null;
    const requestedAtMs = Number(raw.requestedAtMs);
    if (!Number.isFinite(requestedAtMs) || requestedAtMs <= 0) return null;
    return {
      schemaVersion: 1,
      serverPid,
      managedProcessPids: normalizeManagedPids(raw.managedProcessPids, serverPid),
      reason: String(raw.reason || 'shutdown').trim() || 'shutdown',
      requestedAtMs,
    };
  } catch {
    return null;
  }
}

export function clearUmbraShutdownMarker(runtimeRoot: string): void {
  try {
    const markerPath = resolveUmbraShutdownMarkerPath(runtimeRoot);
    if (existsSync(markerPath)) unlinkSync(markerPath);
  } catch {
    // A stale marker will be replaced by the next shutdown request.
  }
}

export function isUmbraShutdownMarkerForProcess(
  marker: UmbraShutdownMarker | null | undefined,
  serverPid: number,
  options: { nowMs?: number; maxAgeMs?: number } = {},
): boolean {
  if (!marker || marker.serverPid !== normalizePid(serverPid)) return false;
  const nowMs = Number(options.nowMs) || Date.now();
  const maxAgeMs = Math.max(0, Number(options.maxAgeMs) || UMBRA_SHUTDOWN_MARKER_MAX_AGE_MS);
  return nowMs >= marker.requestedAtMs && nowMs - marker.requestedAtMs <= maxAgeMs;
}
