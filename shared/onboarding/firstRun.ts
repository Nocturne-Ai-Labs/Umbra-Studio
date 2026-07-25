export const UMBRA_APP_LANGUAGES = ['en', 'ja', 'zh-CN', 'ko'] as const;
export const UMBRA_MIGRATION_EXIT_CODE = 75;

export type UmbraAppLanguage = (typeof UMBRA_APP_LANGUAGES)[number];
export type UmbraFirstRunPhase = 'pending' | 'migrating' | 'complete' | 'failed';
export type UmbraMigrationMode = 'move';

export interface UmbraMigrationSummary {
  sourceRoot: string;
  version: string;
  hasUser: boolean;
  hasTools: boolean;
  hasComfyUI: boolean;
  hasAIToolkit: boolean;
}

export interface UmbraFirstRunState {
  schemaVersion: 1;
  phase: UmbraFirstRunPhase;
  language: UmbraAppLanguage;
  completedAt: string | null;
  migration: {
    mode: UmbraMigrationMode;
    sourceRoot: string;
    startedAt: string | null;
    completedAt: string | null;
    movedUser: boolean;
    movedTools: boolean;
    umbraNodesSynced: boolean;
    totalFiles: number;
    processedFiles: number;
    totalBytes: number;
    processedBytes: number;
    currentItem: string;
    error: string;
  } | null;
}

export interface UmbraMigrationRequest {
  schemaVersion: 1;
  sourceRoot: string;
  destinationRoot: string;
  destinationSourceRoot: string;
  language: UmbraAppLanguage;
  serverPid: number;
  restartOwner: 'launcher' | 'worker';
  createdAt: string;
  requestPath: string;
}

export function normalizeUmbraAppLanguage(
  value: unknown,
  fallback: UmbraAppLanguage = 'en',
): UmbraAppLanguage {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-CN';
  if (normalized === 'ko-kr') return 'ko';
  return (UMBRA_APP_LANGUAGES as readonly string[]).includes(normalized)
    ? normalized as UmbraAppLanguage
    : fallback;
}

export function createPendingFirstRunState(
  language: UmbraAppLanguage = 'en',
): UmbraFirstRunState {
  return {
    schemaVersion: 1,
    phase: 'pending',
    language,
    completedAt: null,
    migration: null,
  };
}

export function normalizeFirstRunState(value: unknown): UmbraFirstRunState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return createPendingFirstRunState();
  }
  const candidate = value as Partial<UmbraFirstRunState>;
  const phase = candidate.phase === 'migrating'
    || candidate.phase === 'complete'
    || candidate.phase === 'failed'
    ? candidate.phase
    : 'pending';
  const migration = candidate.migration && typeof candidate.migration === 'object'
      ? {
        mode: 'move' as const,
        sourceRoot: String(candidate.migration.sourceRoot || '').trim(),
        startedAt: candidate.migration.startedAt ? String(candidate.migration.startedAt) : null,
        completedAt: candidate.migration.completedAt ? String(candidate.migration.completedAt) : null,
        movedUser: candidate.migration.movedUser === true
          || (candidate.migration as Record<string, unknown>).copiedUser === true,
        movedTools: candidate.migration.movedTools === true
          || (candidate.migration as Record<string, unknown>).copiedTools === true,
        umbraNodesSynced: candidate.migration.umbraNodesSynced === true,
        totalFiles: Math.max(0, Math.floor(Number(candidate.migration.totalFiles) || 0)),
        processedFiles: Math.max(0, Math.floor(Number(candidate.migration.processedFiles) || 0)),
        totalBytes: Math.max(0, Number(candidate.migration.totalBytes) || 0),
        processedBytes: Math.max(0, Number(candidate.migration.processedBytes) || 0),
        currentItem: String(candidate.migration.currentItem || ''),
        error: String(candidate.migration.error || ''),
      }
    : null;
  return {
    schemaVersion: 1,
    phase,
    language: normalizeUmbraAppLanguage(candidate.language),
    completedAt: candidate.completedAt ? String(candidate.completedAt) : null,
    migration,
  };
}
