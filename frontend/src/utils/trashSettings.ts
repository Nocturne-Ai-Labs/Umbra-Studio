import type { AppSettings } from '@/lib/appSettings';

export type TrashDeleteMode = 'umbra-trash' | 'system-trash' | 'permanent';

export const DEFAULT_TRASH_DELETE_MODE: TrashDeleteMode = 'umbra-trash';
export const DEFAULT_TRASH_AUTO_DELETE_DAYS = 30;
export const MIN_TRASH_AUTO_DELETE_DAYS = 1;
export const MAX_TRASH_AUTO_DELETE_DAYS = 3650;

export function getTrashDeleteMode(settings: Partial<AppSettings> | Record<string, unknown>): TrashDeleteMode {
  const mode = String((settings as Record<string, unknown>)['library.deleteMode'] || '').trim();
  if (mode === 'system-trash' || mode === 'permanent' || mode === 'umbra-trash') {
    return mode;
  }
  return DEFAULT_TRASH_DELETE_MODE;
}

export function getTrashAutoDeleteDays(settings: Partial<AppSettings> | Record<string, unknown>): number {
  const raw = Number((settings as Record<string, unknown>)['library.trashAutoDeleteDays']);
  if (!Number.isFinite(raw)) return DEFAULT_TRASH_AUTO_DELETE_DAYS;
  return Math.min(MAX_TRASH_AUTO_DELETE_DAYS, Math.max(MIN_TRASH_AUTO_DELETE_DAYS, Math.floor(raw)));
}
