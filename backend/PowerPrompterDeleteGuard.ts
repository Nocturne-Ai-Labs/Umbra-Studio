import { isAbsolute, relative, sep } from 'node:path';
import { realpath as realpathFs } from 'node:fs/promises';
import { assertPowerPrompterSessionRevision, PowerPrompterSessionConflictError } from './PowerPrompterSessionGate';

export type PowerPrompterTrashMode = 'umbra-trash' | 'system-trash' | 'permanent';

export function powerPrompterTrashModeForPath(pathname: string): PowerPrompterTrashMode | null {
  if (pathname === '/api/trash/delete' || pathname === '/api/fs/trash/move') return 'umbra-trash';
  if (pathname === '/api/trash/system') return 'system-trash';
  if (pathname === '/api/trash/delete-direct') return 'permanent';
  return null;
}

export async function resolvePowerPrompterTrashTargetPaths(
  paths: string[],
  resolveWorkspacePath: (path: string) => { fullPath: string } | null,
  realpath: (path: string) => Promise<string> = realpathFs,
): Promise<Array<{ requestedPath: string; fullPaths: string[] }>> {
  return Promise.all(paths.map(async (requestedPath) => {
    let resolved: { fullPath: string } | null = null;
    try { resolved = resolveWorkspacePath(requestedPath); } catch { /* The trash handler reports invalid paths. */ }
    if (!resolved) return { requestedPath, fullPaths: [] };
    const realPath = await realpath(resolved.fullPath).catch(() => null);
    return { requestedPath, fullPaths: realPath && realPath !== resolved.fullPath ? [resolved.fullPath, realPath] : [resolved.fullPath] };
  }));
}

function isAtOrUnder(parent: string, child: string): boolean {
  const offset = relative(parent, child);
  return offset === '' || (offset !== '..' && !offset.startsWith(`..${sep}`) && !isAbsolute(offset));
}

export function shouldGatePowerPrompterTrash(targetPaths: string[], promptsRoot: string): boolean {
  return targetPaths.some((target) => isAtOrUnder(promptsRoot, target) || isAtOrUnder(target, promptsRoot));
}

export function doesPowerPrompterTrashAffectSession(targetPaths: string[], activeFilePath: string | null): boolean {
  if (!activeFilePath) return false;
  return doesPowerPrompterTrashRemoveActiveFile(targetPaths, activeFilePath)
    || (activeFilePath.toLowerCase().endsWith('.txt')
      && targetPaths.some((target) => isAtOrUnder(target, `${activeFilePath}.ppcards.json`)));
}

export function doesPowerPrompterTrashRemoveActiveFile(targetPaths: string[], activeFilePath: string | null): boolean {
  return !!activeFilePath && targetPaths.some((target) => isAtOrUnder(target, activeFilePath));
}

export function assertPowerPrompterTrashRevision(affectsSession: boolean, currentRevision: number, expectedRevision: unknown): void {
  if (affectsSession) assertPowerPrompterSessionRevision(currentRevision, expectedRevision);
}

function pathKey(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/').replace(/\/+$/, '') : '';
}

export function wereAllPowerPrompterTrashPathsDeleted(
  mode: PowerPrompterTrashMode,
  requestedPaths: string[],
  payload: unknown,
): boolean {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (requestedPaths.length === 0) return false;
  const entries = mode === 'umbra-trash' ? body.items : body.results;
  if (!Array.isArray(entries)) return false;
  const reported = new Map<string, boolean>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const key = pathKey(item.requestedPath ?? (mode === 'umbra-trash' ? item.originalPath : item.path));
    if (!key) continue;
    const success = mode === 'umbra-trash'
      ? typeof item.originalPath === 'string' && !!item.originalPath.trim()
        && typeof item.trashPath === 'string' && !!item.trashPath.trim()
      : item.success === true;
    reported.set(key, reported.has(key) ? false : success);
  }
  return requestedPaths.every((path) => reported.get(pathKey(path)) === true);
}

function responseWithBody(response: Response, body: Record<string, unknown>): Response {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(body), { status: response.status, headers });
}

export async function runGuardedPowerPrompterTrashMutation(options: {
  mode: PowerPrompterTrashMode;
  requestedPaths: string[];
  protectedPaths: string[];
  primaryPaths: string[];
  currentRevision: number;
  expectedRevision: unknown;
  conflictHeaders?: Record<string, string>;
  perform: (allowedPaths: string[]) => Promise<Response>;
  clearSession: () => Promise<void>;
}): Promise<Response> {
  let conflictedPaths: string[] = [];
  try {
    assertPowerPrompterTrashRevision(options.protectedPaths.length > 0, options.currentRevision, options.expectedRevision);
  } catch (error) {
    if (!(error instanceof PowerPrompterSessionConflictError)) throw error;
    conflictedPaths = options.protectedPaths;
  }
  const conflictSet = new Set(conflictedPaths);
  const allowedPaths = options.requestedPaths.filter((path) => !conflictSet.has(path));
  if (!allowedPaths.length) {
    return Response.json({
      success: false,
      error: 'The active Power Prompter document changed. Reload it before deleting.',
      failed: conflictedPaths.map((path) => ({ path, error: 'The active document changed.' })),
    }, { status: 409, headers: options.conflictHeaders });
  }

  const response = await options.perform(allowedPaths);
  if (!response.ok) return response;
  const raw = await response.clone().json().catch(() => null);
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (conflictedPaths.length > 0) {
    const error = 'The active Power Prompter document changed. Reload it before deleting.';
    const conflicts = conflictedPaths.map((path) => ({ path, requestedPath: path, success: false, error }));
    const failed = options.mode === 'umbra-trash'
      ? { failed: [...(Array.isArray(body.failed) ? body.failed : []), ...conflicts] }
      : { results: [...(Array.isArray(body.results) ? body.results : []), ...conflicts] };
    return responseWithBody(response, { ...body, ...failed, success: false });
  }

  if (options.primaryPaths.length > 0
    && wereAllPowerPrompterTrashPathsDeleted(options.mode, options.protectedPaths, body)) {
    await options.clearSession();
    return responseWithBody(response, { ...body, powerPrompterSessionCleared: true });
  }
  return response;
}
