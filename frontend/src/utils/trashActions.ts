import type { AppSettings } from '@/lib/appSettings';
import { isUmbraRemoteClient } from '@/utils/hostOnly';
import { getTrashAutoDeleteDays, getTrashDeleteMode, type TrashDeleteMode } from '@/utils/trashSettings';

export interface TrashItemRef {
  trashPath: string;
  originalPath: string;
}

export interface DeleteExecutionResult {
  mode: TrashDeleteMode;
  deletedPaths: string[];
  failed: Array<{ path: string; error: string }>;
  trashItems: TrashItemRef[];
  powerPrompterSessionCleared?: boolean;
  warning?: string;
}

function normalizeDeletePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const path of paths) {
    const value = String(path || '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

async function parseJsonSafe(response: Response): Promise<any> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

function collectDeleteResults(requested: string[], entries: unknown[]) {
  const key = (value: string) => value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const reported = new Map<string, Record<string, unknown> | null>();
  for (const value of entries) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const path = entry.requestedPath === undefined ? entry.path : entry.requestedPath;
    if (typeof path !== 'string' || !path.trim()) continue;
    const pathKey = key(path);
    reported.set(pathKey, reported.has(pathKey) ? null : entry);
  }
  const deletedPaths: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  const confirmed: Record<string, unknown>[] = [];
  for (const path of requested) {
    const entry = reported.get(key(path));
    if (entry?.success === true) { deletedPaths.push(path); confirmed.push(entry); }
    else failed.push({ path, error: typeof entry?.error === 'string' && entry.error ? entry.error : 'Deletion was not confirmed. Refresh Gallery before retrying.' });
  }
  return { deletedPaths, failed, confirmed };
}

export function validateTrashRestoreResult(payload: unknown, requestedPaths: string[]) {
  const key = (value: string) => value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const reported = new Map<string, Record<string, unknown> | null>();
  for (const [values, success] of [[body.restored, true], [body.failed, false]] as const) {
    if (!Array.isArray(values)) continue;
    for (const entry of values) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.trashPath !== 'string') continue;
      const pathKey = key(entry.trashPath);
      reported.set(pathKey, reported.has(pathKey) ? null : { ...entry, success });
    }
  }
  const restored: Array<{ trashPath: string; restoredPath: string; type?: 'file' | 'folder' }> = [];
  const failed: Array<{ trashPath: string; error: string }> = [];
  for (const trashPath of [...new Set(requestedPaths.map(key).filter(Boolean))]) {
    const entry = reported.get(trashPath);
    if (entry?.success === true && typeof entry.restoredPath === 'string' && entry.restoredPath.trim()) {
      restored.push({ trashPath, restoredPath: entry.restoredPath, type: entry.type === 'file' || entry.type === 'folder' ? entry.type : undefined });
    } else {
      failed.push({ trashPath, error: typeof entry?.error === 'string' && entry.error ? entry.error : 'Restore was not confirmed. Refresh Trash before retrying.' });
    }
  }
  if (!restored.length) throw new Error(failed[0]?.error || 'Restore was not confirmed.');
  return { restored, failed, warning: typeof body.warning === 'string' ? body.warning : undefined };
}

export function validateEmptyTrashResult(payload: unknown): void {
  const body = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  if (body.success === true) return;
  const failed = Array.isArray(body.failed) ? body.failed : [];
  const first = failed[0] && typeof failed[0] === 'object'
    ? failed[0] as Record<string, unknown>
    : {};
  const message = typeof first.error === 'string' && first.error.trim()
    ? first.error.trim()
    : typeof body.error === 'string' && body.error.trim()
      ? body.error.trim()
      : 'Some Trash items could not be deleted';
  throw new Error(failed.length > 1 ? `${message} (+${failed.length - 1} more)` : message);
}

export async function permanentlyDeleteTrashPaths(paths: string[]): Promise<Pick<DeleteExecutionResult, 'deletedPaths' | 'failed' | 'warning'>> {
  const requested = normalizeDeletePaths(paths);
  if (!requested.length) return { deletedPaths: [], failed: [] };
  const response = await fetch('/api/trash/permanent-delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: requested }),
  });
  const payload = await parseJsonSafe(response);
  if (!response.ok) throw new Error(String(payload?.error || 'Failed to permanently delete from trash'));
  const key = (value: string) => value.trim().replace(/\\/g, '/').replace(/\/+$/, '');
  const results = new Map<string, { success?: boolean; error?: unknown }>();
  if (Array.isArray(payload?.results)) {
    for (const item of payload.results) {
      if (item && typeof item.path === 'string') results.set(key(item.path), item);
    }
  }
  const deletedPaths: string[] = [];
  const failed: Array<{ path: string; error: string }> = [];
  for (const path of requested) {
    const result = results.get(key(path));
    if (result?.success === true) deletedPaths.push(path);
    else failed.push({ path, error: String(result?.error || 'Deletion was not confirmed.') });
  }
  return { deletedPaths, failed, warning: typeof payload?.warning === 'string' ? payload.warning : undefined };
}

export async function deletePathsWithSettings(
  paths: string[],
  settings: Partial<AppSettings> | Record<string, unknown>,
  options?: { expectedRevision?: number },
): Promise<DeleteExecutionResult> {
  const normalizedPaths = normalizeDeletePaths(paths);
  if (normalizedPaths.length === 0) {
    return {
      mode: getTrashDeleteMode(settings),
      deletedPaths: [],
      failed: [],
      trashItems: [],
    };
  }

  const mode: TrashDeleteMode = isUmbraRemoteClient() ? 'umbra-trash' : getTrashDeleteMode(settings);
  const expectedRevision = Number.isSafeInteger(options?.expectedRevision)
    ? options?.expectedRevision
    : undefined;

  if (mode === 'umbra-trash') {
    const autoDeleteDays = getTrashAutoDeleteDays(settings);
    const response = await fetch('/api/trash/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: normalizedPaths, autoDeleteDays, expectedRevision }),
    });

    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || 'Trash delete failed');
    }

    const entries = Array.isArray(result?.items) ? result.items.map((item: any) => ({
      path: item?.originalPath,
      requestedPath: item?.requestedPath,
      originalPath: item?.originalPath,
      trashPath: item?.trashPath,
      success: typeof item?.originalPath === 'string' && !!item.originalPath.trim()
        && typeof item?.trashPath === 'string' && !!item.trashPath.trim(),
    })) : [];
    if (Array.isArray(result?.failed)) entries.push(...result.failed.map((item: any) => ({ path: item?.path, error: item?.error, success: false })));
    const { deletedPaths, failed, confirmed } = collectDeleteResults(normalizedPaths, entries);
    const trashItems = confirmed.map((item) => ({ originalPath: item.originalPath as string, trashPath: item.trashPath as string }));
    if (deletedPaths.length === 0) throw new Error(failed[0]?.error || 'Trash delete failed');

    return {
      mode,
      deletedPaths,
      failed,
      trashItems,
      powerPrompterSessionCleared: result?.powerPrompterSessionCleared === true,
      warning: typeof result?.warning === 'string' ? result.warning : undefined,
    };
  }

  if (mode === 'system-trash') {
    const response = await fetch('/api/trash/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: normalizedPaths, expectedRevision }),
    });
    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || 'System trash failed');
    }

    const { deletedPaths, failed } = collectDeleteResults(normalizedPaths, Array.isArray(result?.results) ? result.results : []);

    if (deletedPaths.length === 0) {
      throw new Error(failed[0]?.error || 'System trash failed');
    }

    return {
      mode,
      deletedPaths,
      failed,
      trashItems: [],
      powerPrompterSessionCleared: result?.powerPrompterSessionCleared === true,
      warning: typeof result?.warning === 'string' ? result.warning : undefined,
    };
  }

  const response = await fetch('/api/trash/delete-direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: normalizedPaths, expectedRevision }),
  });
  const result = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(result?.error || 'Permanent delete failed');
  }

  const { deletedPaths, failed } = collectDeleteResults(normalizedPaths, Array.isArray(result?.results) ? result.results : []);

  if (deletedPaths.length === 0) {
    throw new Error(failed[0]?.error || 'Permanent delete failed');
  }

  return {
    mode,
    deletedPaths,
    failed,
    trashItems: [],
    powerPrompterSessionCleared: result?.powerPrompterSessionCleared === true,
    warning: typeof result?.warning === 'string' ? result.warning : undefined,
  };
}
