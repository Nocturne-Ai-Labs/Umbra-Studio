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

export async function deletePathsWithSettings(
  paths: string[],
  settings: Partial<AppSettings> | Record<string, unknown>,
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

  if (mode === 'umbra-trash') {
    const autoDeleteDays = getTrashAutoDeleteDays(settings);
    const response = await fetch('/api/trash/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: normalizedPaths, autoDeleteDays }),
    });

    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || 'Trash delete failed');
    }

    const trashItems = Array.isArray(result?.items)
      ? result.items
          .map((item: any) => ({
            trashPath: String(item?.trashPath || ''),
            originalPath: String(item?.originalPath || ''),
          }))
          .filter((item: TrashItemRef) => item.trashPath && item.originalPath)
      : [];
    const failed = Array.isArray(result?.failed)
      ? result.failed
          .map((item: any) => ({
            path: String(item?.path || ''),
            error: String(item?.error || 'Trash delete failed'),
          }))
          .filter((item: { path: string; error: string }) => !!item.path)
      : [];
    const deletedPaths = trashItems.map((item: TrashItemRef) => item.originalPath);

    if (deletedPaths.length === 0 && failed.length > 0) {
      throw new Error(failed[0].error || 'Trash delete failed');
    }

    return {
      mode,
      deletedPaths,
      failed,
      trashItems,
      warning: typeof result?.warning === 'string' ? result.warning : undefined,
    };
  }

  if (mode === 'system-trash') {
    const response = await fetch('/api/trash/system', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: normalizedPaths }),
    });
    const result = await parseJsonSafe(response);
    if (!response.ok) {
      throw new Error(result?.error || 'System trash failed');
    }

    const rawResults = Array.isArray(result?.results) ? result.results : [];
    const deletedPaths = rawResults
      .filter((item: any) => item?.success)
      .map((item: any) => String(item?.path || ''))
      .filter(Boolean);
    const failed = rawResults
      .filter((item: any) => !item?.success)
      .map((item: any) => ({
        path: String(item?.path || ''),
        error: String(item?.error || 'System trash failed'),
      }))
      .filter((item: { path: string; error: string }) => !!item.path);

    if (deletedPaths.length === 0) {
      throw new Error(failed[0]?.error || 'System trash failed');
    }

    return {
      mode,
      deletedPaths,
      failed,
      trashItems: [],
      warning: typeof result?.warning === 'string' ? result.warning : undefined,
    };
  }

  const response = await fetch('/api/trash/delete-direct', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: normalizedPaths }),
  });
  const result = await parseJsonSafe(response);
  if (!response.ok) {
    throw new Error(result?.error || 'Permanent delete failed');
  }

  const rawResults = Array.isArray(result?.results) ? result.results : [];
  const deletedPaths = rawResults
    .filter((item: any) => item?.success)
    .map((item: any) => String(item?.path || ''))
    .filter(Boolean);
  const failed = rawResults
    .filter((item: any) => !item?.success)
    .map((item: any) => ({
      path: String(item?.path || ''),
      error: String(item?.error || 'Permanent delete failed'),
    }))
    .filter((item: { path: string; error: string }) => !!item.path);

  if (deletedPaths.length === 0) {
    throw new Error(failed[0]?.error || 'Permanent delete failed');
  }

  return {
    mode,
    deletedPaths,
    failed,
    trashItems: [],
    warning: typeof result?.warning === 'string' ? result.warning : undefined,
  };
}
