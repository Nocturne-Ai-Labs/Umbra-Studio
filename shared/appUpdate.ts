export const UMBRA_UPDATE_EXIT_CODE = 76;
export const UMBRA_UPDATE_SCHEMA_VERSION = 1;

export type UmbraUpdatePhase =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'staged'
  | 'stopping'
  | 'extracting'
  | 'applying'
  | 'updating_nodes'
  | 'restarting'
  | 'complete'
  | 'failed';

export interface UmbraReleaseBuild {
  tag: string;
  version: string;
  name: string;
  channel: 'stable' | 'prerelease';
  publishedAt: string;
  notes: string;
  releaseUrl: string;
  packageName: string;
  packageUrl: string;
  packageBytes: number;
  sha256: string;
}

export interface UmbraUpdateState {
  schemaVersion: 1;
  phase: UmbraUpdatePhase;
  currentVersion: string;
  targetVersion: string;
  targetTag: string;
  packageName: string;
  totalBytes: number;
  processedBytes: number;
  currentItem: string;
  startedAt: string | null;
  completedAt: string | null;
  nodeUpdate: 'pending' | 'updated' | 'skipped' | 'warning';
  warning: string;
  error: string;
}

export interface UmbraUpdateWorkerRequest {
  schemaVersion: 1;
  runtimeRoot: string;
  archivePath: string;
  workspaceRoot: string;
  requestPath: string;
  statePath: string;
  serverPid: number;
  launcherPid: number;
  port: number;
  bindHost: string;
  currentVersion: string;
  targetVersion: string;
  targetTag: string;
  packageName: string;
  createdAt: string;
  keepWorkspaceAlive?: boolean;
}

export const UMBRA_ACTIVE_UPDATE_PHASES: ReadonlySet<UmbraUpdatePhase> = new Set([
  'checking',
  'downloading',
  'staged',
  'stopping',
  'extracting',
  'applying',
  'updating_nodes',
  'restarting',
]);

export function normalizeUmbraVersion(value: unknown): string {
  return String(value || '').trim().replace(/^v/i, '');
}

function umbraVersionParts(value: string): { core: string[]; prerelease: string[] | null } {
  const version = normalizeUmbraVersion(value).split('+', 1)[0];
  const prereleaseAt = version.indexOf('-');
  return {
    core: (prereleaseAt < 0 ? version : version.slice(0, prereleaseAt)).split('.'),
    prerelease: prereleaseAt < 0 ? null : version.slice(prereleaseAt + 1).split('.'),
  };
}

function compareNumericVersionParts(left: string, right: string): number {
  const a = left.replace(/^0+(?=\d)/, '');
  const b = right.replace(/^0+(?=\d)/, '');
  if (a.length !== b.length) return a.length > b.length ? 1 : -1;
  return a === b ? 0 : a > b ? 1 : -1;
}

export function isKnownUmbraVersion(value: unknown): boolean {
  const normalized = normalizeUmbraVersion(value);
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(normalized)) return false;
  return umbraVersionParts(normalized).core.some((entry) => Number(entry) > 0);
}

export function compareUmbraVersions(left: string, right: string): number {
  const leftParts = umbraVersionParts(left);
  const rightParts = umbraVersionParts(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = compareNumericVersionParts(leftParts.core[index] || '0', rightParts.core[index] || '0');
    if (difference) return difference;
  }
  if (!leftParts.prerelease || !rightParts.prerelease) {
    return leftParts.prerelease ? -1 : rightParts.prerelease ? 1 : 0;
  }
  const length = Math.max(leftParts.prerelease.length, rightParts.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftParts.prerelease[index];
    const b = rightParts.prerelease[index];
    if (a === undefined || b === undefined) return a === undefined ? -1 : 1;
    const aNumeric = /^\d+$/.test(a);
    const bNumeric = /^\d+$/.test(b);
    if (aNumeric && bNumeric) {
      const difference = compareNumericVersionParts(a, b);
      if (difference) return difference;
    } else if (aNumeric !== bNumeric) {
      return aNumeric ? -1 : 1;
    } else if (a !== b) {
      return a > b ? 1 : -1;
    }
  }
  return 0;
}

export function filterNewerUmbraReleases<T extends { version: string }>(
  releases: readonly T[],
  currentVersion: string,
): T[] {
  if (!isKnownUmbraVersion(currentVersion)) return [];
  return releases.filter((release) => (
    isKnownUmbraVersion(release.version)
    && compareUmbraVersions(release.version, currentVersion) > 0
  ));
}

export function createIdleUmbraUpdateState(currentVersion = ''): UmbraUpdateState {
  return {
    schemaVersion: 1,
    phase: 'idle',
    currentVersion,
    targetVersion: '',
    targetTag: '',
    packageName: '',
    totalBytes: 0,
    processedBytes: 0,
    currentItem: '',
    startedAt: null,
    completedAt: null,
    nodeUpdate: 'pending',
    warning: '',
    error: '',
  };
}

export function normalizeUmbraUpdateState(
  value: unknown,
  currentVersion = '',
): UmbraUpdateState {
  const fallback = createIdleUmbraUpdateState(currentVersion);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const source = value as Partial<UmbraUpdateState>;
  const phases: UmbraUpdatePhase[] = [
    'idle',
    'checking',
    'downloading',
    'staged',
    'stopping',
    'extracting',
    'applying',
    'updating_nodes',
    'restarting',
    'complete',
    'failed',
  ];
  const nodeStates: UmbraUpdateState['nodeUpdate'][] = ['pending', 'updated', 'skipped', 'warning'];
  return {
    schemaVersion: 1,
    phase: phases.includes(source.phase as UmbraUpdatePhase)
      ? source.phase as UmbraUpdatePhase
      : fallback.phase,
    currentVersion: String(source.currentVersion || currentVersion || ''),
    targetVersion: String(source.targetVersion || ''),
    targetTag: String(source.targetTag || ''),
    packageName: String(source.packageName || ''),
    totalBytes: Math.max(0, Number(source.totalBytes) || 0),
    processedBytes: Math.max(0, Number(source.processedBytes) || 0),
    currentItem: String(source.currentItem || ''),
    startedAt: source.startedAt ? String(source.startedAt) : null,
    completedAt: source.completedAt ? String(source.completedAt) : null,
    nodeUpdate: nodeStates.includes(source.nodeUpdate as UmbraUpdateState['nodeUpdate'])
      ? source.nodeUpdate as UmbraUpdateState['nodeUpdate']
      : 'pending',
    warning: String(source.warning || ''),
    error: String(source.error || ''),
  };
}

export function isUmbraUpdateStateActive(value: unknown): boolean {
  const phase = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Partial<UmbraUpdateState>).phase
    : undefined;
  return UMBRA_ACTIVE_UPDATE_PHASES.has(phase as UmbraUpdatePhase);
}

export function recoverInterruptedUmbraUpdateState(
  value: unknown,
  currentVersion = '',
  completedAt = new Date().toISOString(),
): UmbraUpdateState {
  const state = normalizeUmbraUpdateState(value, currentVersion);
  if (!isUmbraUpdateStateActive(state)) return state;
  return {
    ...state,
    phase: 'failed',
    currentVersion: normalizeUmbraVersion(currentVersion) || state.currentVersion,
    currentItem: '',
    completedAt,
    warning: '',
    error: 'The previous updater session ended before it completed. No update is running. Select a release and try again.',
  };
}
