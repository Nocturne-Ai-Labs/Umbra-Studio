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

export function normalizeUmbraVersion(value: unknown): string {
  return String(value || '').trim().replace(/^v/i, '');
}

function umbraVersionParts(value: string): number[] {
  return normalizeUmbraVersion(value)
    .split('.')
    .map((entry) => Number.parseInt(entry.replace(/[^\d].*$/, ''), 10))
    .map((entry) => Number.isFinite(entry) ? entry : 0);
}

export function isKnownUmbraVersion(value: unknown): boolean {
  const normalized = normalizeUmbraVersion(value);
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(normalized)) return false;
  return umbraVersionParts(normalized).some((entry) => entry > 0);
}

export function compareUmbraVersions(left: string, right: string): number {
  const leftParts = umbraVersionParts(left);
  const rightParts = umbraVersionParts(right);
  const length = Math.max(3, leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;
    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
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
