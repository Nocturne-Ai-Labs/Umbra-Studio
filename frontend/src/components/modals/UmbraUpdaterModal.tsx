'use client';

import React from 'react';
import {
  compareUmbraVersions,
  filterNewerUmbraReleases,
  isKnownUmbraVersion,
} from '../../../../shared/appUpdate';
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type ReleaseBuild = {
  tag: string;
  version: string;
  name: string;
  channel: 'stable' | 'prerelease';
  publishedAt: string;
  notes: string;
  releaseUrl: string;
  packageName: string;
  packageBytes: number;
  sha256: string;
};

type ReleaseSummary = {
  currentVersion: string;
  updateCount: number;
  latestVersion: string;
  releases: ReleaseBuild[];
  portableUpdaterAvailable: boolean;
  hostActionsAvailable: boolean;
};

type UpdateState = {
  phase:
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
  currentVersion: string;
  targetVersion: string;
  targetTag: string;
  packageName: string;
  totalBytes: number;
  processedBytes: number;
  currentItem: string;
  nodeUpdate: 'pending' | 'updated' | 'skipped' | 'warning';
  warning: string;
  error: string;
};

const ACTIVE_PHASES = new Set<UpdateState['phase']>([
  'checking',
  'downloading',
  'staged',
  'stopping',
  'extracting',
  'applying',
  'updating_nodes',
  'restarting',
]);

function formatBytes(value: number): string {
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let result = bytes / 1024;
  let unitIndex = 0;
  while (result >= 1024 && unitIndex < units.length - 1) {
    result /= 1024;
    unitIndex += 1;
  }
  return `${result.toFixed(result >= 100 ? 0 : result >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDate(value: string): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function phaseLabel(state: UpdateState): string {
  switch (state.phase) {
    case 'downloading': return 'Downloading release';
    case 'staged': return 'Verifying package';
    case 'stopping': return 'Stopping Umbra and managed tools';
    case 'extracting': return 'Extracting complete application';
    case 'applying': return 'Replacing application files';
    case 'updating_nodes': return 'Updating Umbra Nodes';
    case 'restarting': return 'Restarting Umbra Studio';
    case 'complete': return 'Update complete';
    case 'failed': return 'Update failed';
    default: return 'Ready to update';
  }
}

export interface UmbraUpdaterModalProps {
  open: boolean;
  onClose: () => void;
  onUpdateCountChange?: (count: number) => void;
}

export function UmbraUpdaterModal({
  open,
  onClose,
  onUpdateCountChange,
}: UmbraUpdaterModalProps) {
  const [summary, setSummary] = React.useState<ReleaseSummary | null>(null);
  const [selectedTag, setSelectedTag] = React.useState('');
  const [updateState, setUpdateState] = React.useState<UpdateState | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [starting, setStarting] = React.useState(false);
  const [reconnecting, setReconnecting] = React.useState(false);
  const [error, setError] = React.useState('');

  const loadReleases = React.useCallback(async (refresh = false) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/app/releases${refresh ? '?refresh=true' : ''}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Failed to load releases.');
      const received = payload as ReleaseSummary;
      const embeddedVersion = String(import.meta.env.UMBRA_APP_VERSION || '').trim();
      const currentVersion = isKnownUmbraVersion(embeddedVersion)
        ? embeddedVersion
        : received.currentVersion;
      const next: ReleaseSummary = {
        ...received,
        currentVersion,
        updateCount: filterNewerUmbraReleases(received.releases, currentVersion).length,
      };
      setSummary(next);
      onUpdateCountChange?.(Math.max(0, Number(next.updateCount) || 0));
      setSelectedTag((current) => {
        if (current && next.releases.some((entry) => entry.tag === current)) return current;
        return next.releases.find((entry) => compareUmbraVersions(entry.version, next.currentVersion) > 0)?.tag
          || next.releases[0]?.tag
          || '';
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load releases.');
    } finally {
      setLoading(false);
    }
  }, [onUpdateCountChange]);

  const loadState = React.useCallback(async () => {
    const response = await fetch('/api/app/update/state', { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Failed to load update state.');
    setUpdateState(payload.state as UpdateState);
    return payload.state as UpdateState;
  }, []);

  React.useEffect(() => {
    if (!open) return;
    void loadReleases();
    void loadState().catch(() => undefined);
  }, [loadReleases, loadState, open]);

  React.useEffect(() => {
    if (!open || !updateState || !ACTIVE_PHASES.has(updateState.phase) || reconnecting) return;
    const timer = window.setInterval(() => {
      void loadState().catch(() => setReconnecting(true));
    }, 500);
    return () => window.clearInterval(timer);
  }, [loadState, open, reconnecting, updateState]);

  React.useEffect(() => {
    if (!open || (!reconnecting && updateState?.phase !== 'stopping')) return;
    setReconnecting(true);
    let canceled = false;
    const reconnect = async () => {
      while (!canceled) {
        try {
          const response = await fetch('/api/healthz/ready', { cache: 'no-store' });
          if (response.ok) {
            window.setTimeout(() => window.location.reload(), 600);
            return;
          }
        } catch {
          // The updater currently owns the application root.
        }
        await new Promise((resolve) => window.setTimeout(resolve, 800));
      }
    };
    void reconnect();
    return () => {
      canceled = true;
    };
  }, [open, reconnecting, updateState?.phase]);

  const selectedRelease = React.useMemo(
    () => summary?.releases.find((entry) => entry.tag === selectedTag) || null,
    [selectedTag, summary],
  );
  const newerSelected = Boolean(
    selectedRelease
    && summary
    && compareUmbraVersions(selectedRelease.version, summary.currentVersion) > 0,
  );
  const active = Boolean(updateState && ACTIVE_PHASES.has(updateState.phase));
  const progress = updateState && updateState.totalBytes > 0
    ? Math.max(0, Math.min(100, (updateState.processedBytes / updateState.totalBytes) * 100))
    : 0;

  const startUpdate = async () => {
    if (!selectedRelease || !newerSelected || starting) return;
    setStarting(true);
    setError('');
    sessionStorage.setItem('umbra-update-resume', '1');
    try {
      const response = await fetch('/api/app/update/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: selectedRelease.tag }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || 'Failed to start update.');
      await loadState();
    } catch (startError) {
      sessionStorage.removeItem('umbra-update-resume');
      setError(startError instanceof Error ? startError.message : 'Failed to start update.');
    } finally {
      setStarting(false);
    }
  };

  const close = () => {
    if (active || reconnecting) return;
    sessionStorage.removeItem('umbra-update-resume');
    onClose();
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/85 p-3 backdrop-blur-md sm:p-6">
      <div className="flex h-[min(880px,94vh)] w-full max-w-6xl flex-col overflow-hidden border border-[var(--umbra-accent)]/60 bg-[#07090b] shadow-2xl">
        <header className="flex min-h-16 items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.2em] text-[var(--umbra-accent)]">
              Umbra Studio Updater
            </div>
            <h2 className="truncate text-lg font-black text-white sm:text-2xl">
              Builds and release notes
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadReleases(true)}
              disabled={loading || active}
              className="inline-flex h-10 w-10 items-center justify-center border border-white/10 text-zinc-300 hover:border-white/25 hover:text-white disabled:opacity-40"
              title="Refresh releases"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={active || reconnecting}
              className="inline-flex h-10 w-10 items-center justify-center border border-white/10 text-zinc-300 hover:border-red-400/40 hover:text-red-300 disabled:opacity-30"
              title="Close updater"
            >
              <X size={17} />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="max-h-52 overflow-y-auto border-b border-white/10 bg-black/25 p-3 md:max-h-none md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center justify-between px-1 font-mono text-[9px] font-bold uppercase tracking-[0.16em] text-zinc-500">
              <span>Available builds</span>
              <span>Current {summary?.currentVersion || '...'}</span>
            </div>
            <div className="space-y-1.5">
              {summary?.releases.map((release) => {
                const isSelected = release.tag === selectedTag;
                const isNewer = compareUmbraVersions(release.version, summary.currentVersion) > 0;
                return (
                  <button
                    key={release.tag}
                    type="button"
                    onClick={() => setSelectedTag(release.tag)}
                    disabled={active}
                    className={cn(
                      'flex w-full items-center justify-between border px-3 py-3 text-left transition-colors',
                      isSelected
                        ? 'border-[var(--umbra-accent)]/60 bg-[var(--umbra-accent)]/12 text-white'
                        : 'border-white/8 bg-white/[0.02] text-zinc-400 hover:border-white/20 hover:text-zinc-200',
                    )}
                  >
                    <span>
                      <span className="block font-mono text-xs font-black">v{release.version}</span>
                      <span className="mt-1 block text-[9px] uppercase tracking-wider text-zinc-600">
                        {formatDate(release.publishedAt)}
                      </span>
                    </span>
                    {isNewer ? (
                      <span className="border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-1 font-mono text-[8px] font-black text-emerald-300">
                        UPDATE
                      </span>
                    ) : release.version === summary.currentVersion ? (
                      <span className="font-mono text-[8px] font-black text-zinc-500">INSTALLED</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          <main className="min-h-0 overflow-y-auto p-4 sm:p-6">
            {selectedRelease ? (
              <div className="mx-auto max-w-3xl space-y-5">
                <section className="border border-white/10 bg-white/[0.025] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-zinc-500">
                        Selected build
                      </div>
                      <h3 className="mt-1 text-xl font-black text-white">{selectedRelease.name}</h3>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px] text-zinc-500">
                        <span>{selectedRelease.packageName}</span>
                        <span>{formatBytes(selectedRelease.packageBytes)}</span>
                        <span>{formatDate(selectedRelease.publishedAt)}</span>
                      </div>
                    </div>
                    {selectedRelease.releaseUrl ? (
                      <a
                        href={selectedRelease.releaseUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-9 items-center gap-2 border border-white/10 px-3 font-mono text-[9px] font-black uppercase tracking-wider text-zinc-300 hover:border-white/25 hover:text-white"
                      >
                        <ExternalLink size={13} />
                        GitHub
                      </a>
                    ) : null}
                  </div>
                </section>

                {(active || updateState?.phase === 'complete' || updateState?.phase === 'failed' || reconnecting) ? (
                  <section className={cn(
                    'border p-4',
                    updateState?.phase === 'failed'
                      ? 'border-red-400/35 bg-red-500/8'
                      : 'border-[var(--umbra-accent)]/35 bg-[var(--umbra-accent)]/8',
                  )}>
                    <div className="flex items-center gap-3">
                      {updateState?.phase === 'complete' ? (
                        <CheckCircle2 size={20} className="text-emerald-300" />
                      ) : updateState?.phase === 'failed' ? (
                        <X size={20} className="text-red-300" />
                      ) : (
                        <Loader2 size={20} className="animate-spin text-[var(--umbra-accent)]" />
                      )}
                      <div>
                        <div className="text-sm font-black text-white">
                          {reconnecting ? 'Updater has control' : phaseLabel(updateState || {
                            phase: 'idle',
                          } as UpdateState)}
                        </div>
                        <div className="mt-0.5 font-mono text-[9px] text-zinc-500">
                          {reconnecting
                            ? 'Umbra will reconnect automatically after the new build is healthy.'
                            : updateState?.currentItem || 'Preparing'}
                        </div>
                      </div>
                    </div>
                    {updateState?.phase === 'downloading' ? (
                      <div className="mt-4">
                        <div className="mb-1 flex justify-between font-mono text-[9px] text-zinc-500">
                          <span>{formatBytes(updateState.processedBytes)}</span>
                          <span>{formatBytes(updateState.totalBytes)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden bg-white/8">
                          <div className="h-full bg-[var(--umbra-accent)] transition-[width]" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    ) : null}
                    {updateState?.warning ? (
                      <p className="mt-3 text-xs text-amber-200">{updateState.warning}</p>
                    ) : null}
                    {updateState?.error ? (
                      <p className="mt-3 text-xs text-red-200">{updateState.error}</p>
                    ) : null}
                  </section>
                ) : null}

                <section>
                  <div className="mb-2 font-mono text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                    Changelog
                  </div>
                  <div className="min-h-48 whitespace-pre-wrap border border-white/10 bg-black/30 p-4 text-sm leading-6 text-zinc-300">
                    {selectedRelease.notes || 'No release notes were provided for this build.'}
                  </div>
                </section>

                <section className="grid gap-2 sm:grid-cols-3">
                  <div className="flex items-center gap-2 border border-white/8 p-3 text-xs text-zinc-400">
                    <ShieldCheck size={15} className="text-emerald-300" />
                    User and Tools preserved
                  </div>
                  <div className="flex items-center gap-2 border border-white/8 p-3 text-xs text-zinc-400">
                    <Download size={15} className="text-cyan-300" />
                    Complete package replacement
                  </div>
                  <div className="flex items-center gap-2 border border-white/8 p-3 text-xs text-zinc-400">
                    <RotateCcw size={15} className="text-amber-300" />
                    Automatic restart
                  </div>
                </section>
              </div>
            ) : (
              <div className="flex h-full min-h-64 items-center justify-center text-sm text-zinc-500">
                {loading ? 'Loading release builds...' : 'No compatible release builds were found.'}
              </div>
            )}
          </main>
        </div>

        <footer className="flex flex-col gap-3 border-t border-white/10 bg-black/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="min-h-5 text-xs">
            {error ? (
              <span className="text-red-300">{error}</span>
            ) : !summary?.portableUpdaterAvailable ? (
              <span className="text-amber-300">Self-update is available only in a packaged portable build.</span>
            ) : !summary.hostActionsAvailable ? (
              <span className="text-amber-300">Start updates from the Umbra host PC.</span>
            ) : newerSelected ? (
              <span className="text-zinc-500">Umbra and managed tools will close during installation.</span>
            ) : (
              <span className="text-zinc-500">Select a build newer than the installed version.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void startUpdate()}
            disabled={
              !newerSelected
              || !summary?.portableUpdaterAvailable
              || !summary.hostActionsAvailable
              || active
              || reconnecting
              || starting
            }
            className="inline-flex min-h-11 items-center justify-center gap-2 border border-[var(--umbra-accent)]/60 bg-[var(--umbra-accent)]/15 px-5 font-mono text-[10px] font-black uppercase tracking-[0.14em] text-white hover:bg-[var(--umbra-accent)]/25 disabled:cursor-not-allowed disabled:opacity-35"
          >
            {starting || active || reconnecting ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            {reconnecting ? 'Restarting' : active ? phaseLabel(updateState!) : `Update to v${selectedRelease?.version || ''}`}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
