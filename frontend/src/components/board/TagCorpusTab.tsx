import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Clock3, DatabaseZap, HardDrive, Loader2, Pause, Play, RefreshCw, ScanLine } from 'lucide-react';

type CorpusTagMatrixTag = {
  tag: string;
  count: number;
  classifiers: string[];
  explicit: boolean;
};

type CorpusTagMatrix = {
  updatedAt: number | null;
  sampledPosts: number;
  cursorId: number | null;
  tags: CorpusTagMatrixTag[];
  cells: number[][];
  maxPairCount: number;
};

type CorpusStatus = {
  state: 'empty' | 'running' | 'paused' | 'completed' | 'failed';
  mode: 'sample' | 'all';
  targetPosts: number;
  availablePosts: number;
  availablePostsCheckedAt: number | null;
  indexedPosts: number;
  scannedPosts: number;
  progress: number;
  minimumScore: number;
  lastPostId: number | null;
  requestCount: number;
  lastBatchSize: number;
  startedAt: number | null;
  updatedAt: number | null;
  completedAt: number | null;
  elapsedMs: number;
  estimatedRemainingMs: number | null;
  databaseBytes: number;
  tagMatrix?: CorpusTagMatrix;
  error: string;
};

type CorpusActivitySample = {
  at: number;
  scannedPosts: number;
  indexedPosts: number;
  scannedDelta: number;
  indexedDelta: number;
  requestDelta: number;
  postsPerSecond: number;
  requestsPerSecond: number;
  lastPostId: number | null;
  lastBatchSize: number;
};

type CorpusSnapshot = {
  at: number;
  scannedPosts: number;
  indexedPosts: number;
  requestCount: number;
};

function formatCorpusDuration(milliseconds: number | null): string {
  if (!milliseconds || milliseconds < 1_000) return '--';
  const totalMinutes = Math.max(1, Math.round(milliseconds / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatCorpusBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gigabytes = bytes / (1024 ** 3);
  if (gigabytes >= 1) return `${gigabytes.toFixed(2)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 ** 2)))} MB`;
}

function formatCorpusRate(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) return '--';
  return `${Math.round(rate).toLocaleString()}/s`;
}

function CorpusLiveMonitor({ status, samples }: { status: CorpusStatus | null; samples: CorpusActivitySample[] }) {
  const numberFormatter = useMemo(() => new Intl.NumberFormat(), []);
  const latest = samples.at(-1);
  const recent = samples.slice(-36);
  const skippedPosts = Math.max(0, (status?.scannedPosts || 0) - (status?.indexedPosts || 0));
  const indexYield = (status?.scannedPosts || 0) > 0
    ? ((status?.indexedPosts || 0) / (status?.scannedPosts || 1)) * 100
    : 0;
  const maxRate = Math.max(1, ...recent.map(sample => sample.postsPerSecond));
  const sparklinePoints = recent.length > 1
    ? recent.map((sample, index) => {
        const x = (index / (recent.length - 1)) * 300;
        const y = 70 - ((sample.postsPerSecond / maxRate) * 62);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ')
    : '';
  const sparklineArea = sparklinePoints ? `0,72 ${sparklinePoints} 300,72` : '';
  const isRunning = status?.state === 'running';
  const tagMatrix = status?.tagMatrix;
  const matrixTags = tagMatrix?.tags || [];
  const matrixReady = matrixTags.length > 0 && (tagMatrix?.cells.length || 0) === matrixTags.length;

  return (
    <section className="min-h-[420px] overflow-hidden rounded-md border border-cyan-300/15 bg-black/25">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-cyan-100">
            <span className={`h-2 w-2 rounded-full ${isRunning ? 'animate-pulse bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.9)]' : 'bg-zinc-600'}`} />
            Live Corpus Ingestion
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Watching Danbooru post metadata flow into the local relation index.
          </p>
        </div>
        <span className={`rounded-sm border px-2 py-1 text-[9px] font-black uppercase ${isRunning
          ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
          : status?.state === 'failed'
            ? 'border-red-300/25 bg-red-500/10 text-red-100'
            : 'border-white/10 text-zinc-500'}`}>
          {status?.state || 'Loading'}
        </span>
      </div>

      <div className="grid grid-cols-2 border-b border-white/10 lg:grid-cols-4">
        {[
          { label: 'Posts scanned', value: numberFormatter.format(status?.scannedPosts || 0), icon: ScanLine },
          { label: 'Posts indexed', value: numberFormatter.format(status?.indexedPosts || 0), icon: DatabaseZap },
          { label: 'Live throughput', value: formatCorpusRate(latest?.postsPerSecond || 0), icon: Activity },
          { label: 'Estimated finish', value: formatCorpusDuration(status?.estimatedRemainingMs || null), icon: Clock3 },
        ].map(metric => (
          <div key={metric.label} className="min-w-0 border-b border-r border-white/[0.07] px-4 py-4 lg:border-b-0">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase text-zinc-600">
              <metric.icon className="h-3.5 w-3.5 text-cyan-300/70" />
              {metric.label}
            </div>
            <div className="mt-2 truncate font-mono text-lg font-bold text-zinc-100">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.8fr)]">
        <div className="min-w-0 border-b border-white/10 p-5 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase text-zinc-300">Throughput history</div>
              <div className="mt-1 text-[10px] text-zinc-600">Actual change measured at every status poll</div>
            </div>
            <div className="text-right font-mono text-[10px] text-zinc-500">
              <div>Peak {formatCorpusRate(maxRate)}</div>
              <div>{(latest?.requestsPerSecond || 0).toFixed(2)} requests/s</div>
            </div>
          </div>

          <div className="relative mt-4 h-28 overflow-hidden border-y border-white/[0.06] bg-[linear-gradient(to_bottom,transparent_24%,rgba(255,255,255,0.04)_25%,transparent_26%,transparent_49%,rgba(255,255,255,0.04)_50%,transparent_51%,transparent_74%,rgba(255,255,255,0.04)_75%,transparent_76%)]">
            {sparklinePoints ? (
              <svg viewBox="0 0 300 72" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-label="Recent corpus ingestion speed">
                <polygon points={sparklineArea} fill="rgba(34, 211, 238, 0.08)" />
                <polyline points={sparklinePoints} fill="none" stroke="rgb(103, 232, 249)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
              </svg>
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] uppercase text-zinc-700">Collecting live samples...</div>
            )}
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[9px] font-black uppercase text-zinc-600">
              <span>Five-way fetch wave</span>
              <span>{numberFormatter.format(latest?.lastBatchSize || status?.lastBatchSize || 0)} posts last batch</span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="h-2 overflow-hidden rounded-sm bg-white/[0.05]">
                  <div
                    className={`h-full origin-left bg-cyan-300/70 ${isRunning ? 'animate-pulse' : ''}`}
                    style={{
                      width: isRunning ? `${Math.max(24, Math.min(100, ((latest?.postsPerSecond || 0) / maxRate) * 100))}%` : '0%',
                      animationDelay: `${index * 110}ms`,
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="h-full bg-cyan-300 transition-[width] duration-500" style={{ width: `${status?.progress || 0}%` }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] text-zinc-600">
            <span>{(status?.progress || 0).toFixed(3)}% complete</span>
            <span>Cursor #{numberFormatter.format(status?.lastPostId || 0)}</span>
            <span>{numberFormatter.format(status?.requestCount || 0)} API requests</span>
          </div>
        </div>

        <div className="min-w-0 p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-black uppercase text-zinc-300">Ingestion events</div>
            <div className="flex items-center gap-1.5 text-[9px] text-zinc-600">
              <HardDrive className="h-3 w-3" /> {formatCorpusBytes(status?.databaseBytes || 0)}
            </div>
          </div>
          <div className="custom-scrollbar mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
            {samples.length > 0 ? [...samples].reverse().slice(0, 8).map(sample => (
              <div key={`${sample.at}-${sample.scannedPosts}`} className="grid grid-cols-[52px_minmax(0,1fr)] gap-2 border-b border-white/[0.06] py-1.5 font-mono text-[9px]">
                <span className="text-zinc-700">{new Date(sample.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                <span className="min-w-0 text-zinc-400">
                  <strong className="text-cyan-200">+{numberFormatter.format(sample.scannedDelta)}</strong> scanned
                  <span className="text-zinc-700"> / </span>
                  <strong className="text-emerald-200">+{numberFormatter.format(sample.indexedDelta)}</strong> indexed
                  <span className="text-zinc-700"> / </span>
                  {formatCorpusRate(sample.postsPerSecond)}
                </span>
              </div>
            )) : (
              <div className="py-8 text-center text-[10px] uppercase text-zinc-700">Waiting for the next completed fetch wave...</div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t border-white/10 pt-4">
            <div>
              <div className="text-[8px] font-black uppercase text-zinc-700">Index yield</div>
              <div className="mt-1 font-mono text-xs text-zinc-300">{indexYield.toFixed(2)}%</div>
            </div>
            <div>
              <div className="text-[8px] font-black uppercase text-zinc-700">Skipped metadata</div>
              <div className="mt-1 font-mono text-xs text-zinc-300">{numberFormatter.format(skippedPosts)}</div>
            </div>
            <div>
              <div className="text-[8px] font-black uppercase text-zinc-700">Elapsed</div>
              <div className="mt-1 font-mono text-xs text-zinc-300">{formatCorpusDuration(status?.elapsedMs || null)}</div>
            </div>
            <div>
              <div className="text-[8px] font-black uppercase text-zinc-700">Current ID</div>
              <div className="mt-1 font-mono text-xs text-zinc-300">{numberFormatter.format(status?.lastPostId || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-white/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-black uppercase text-zinc-300">
              <span className={`h-1.5 w-1.5 rounded-full ${isRunning ? 'animate-pulse bg-cyan-300' : 'bg-zinc-600'}`} />
              Live Tag Matrix
            </div>
            <div className="mt-1 text-[10px] text-zinc-600">Pair frequency from the latest completed fetch wave</div>
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-[9px] text-zinc-600">
            <span>{numberFormatter.format(tagMatrix?.sampledPosts || 0)} sampled posts</span>
            <span>Cursor #{numberFormatter.format(tagMatrix?.cursorId || 0)}</span>
            <span>{tagMatrix?.updatedAt ? new Date(tagMatrix.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--'}</span>
          </div>
        </div>

        {matrixReady ? (
          <div key={tagMatrix?.updatedAt || 0} className="mt-4 grid min-h-0 grid-cols-1 gap-5 2xl:grid-cols-[minmax(560px,1.5fr)_minmax(220px,0.65fr)]">
            <div className="custom-scrollbar min-w-0 overflow-x-auto pb-2">
              <div
                className="grid min-w-[560px] gap-1"
                style={{ gridTemplateColumns: `minmax(118px, 1.25fr) repeat(${matrixTags.length}, minmax(32px, 1fr))` }}
              >
                <div className="flex items-end pb-1 font-mono text-[8px] uppercase text-zinc-700">Tag / Pair</div>
                {matrixTags.map((entry, index) => (
                  <div key={`column-${entry.tag}`} className="min-w-0 pb-1 text-center" title={entry.tag}>
                    <div className="font-mono text-[8px] text-cyan-200/80">{index + 1}</div>
                    <div className="truncate font-mono text-[7px] text-zinc-700">{entry.tag}</div>
                  </div>
                ))}
                {matrixTags.map((rowTag, rowIndex) => (
                  <div key={`row-${rowTag.tag}`} className="contents">
                    <div className="flex min-w-0 items-center gap-2 border-r border-white/[0.06] pr-2" title={rowTag.tag}>
                      <span className="w-4 shrink-0 text-right font-mono text-[8px] text-cyan-200/70">{rowIndex + 1}</span>
                      <span className="truncate font-mono text-[9px] text-zinc-400">{rowTag.tag}</span>
                    </div>
                    {matrixTags.map((columnTag, columnIndex) => {
                      const value = tagMatrix?.cells[rowIndex]?.[columnIndex] || 0;
                      const diagonal = rowIndex === columnIndex;
                      const denominator = diagonal
                        ? Math.max(1, rowTag.count)
                        : Math.max(1, tagMatrix?.maxPairCount || 0);
                      const intensity = value > 0 ? Math.max(0.12, Math.min(0.92, Math.sqrt(value / denominator))) : 0.025;
                      return (
                        <div
                          key={`${rowTag.tag}-${columnTag.tag}`}
                          className="flex aspect-square min-h-8 items-center justify-center rounded-sm border border-white/[0.04] font-mono text-[8px] text-white/80 transition-colors"
                          style={{ backgroundColor: diagonal
                            ? `rgba(251, 146, 60, ${intensity})`
                            : `rgba(34, 211, 238, ${intensity})` }}
                          title={diagonal
                            ? `${rowTag.tag}: ${numberFormatter.format(value)} posts in this wave`
                            : `${rowTag.tag} + ${columnTag.tag}: ${numberFormatter.format(value)} co-occurrences`}
                        >
                          {value > 0 ? numberFormatter.format(value) : ''}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="min-w-0 border-t border-white/10 pt-4 2xl:border-l 2xl:border-t-0 2xl:pl-5 2xl:pt-0">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[9px] font-black uppercase text-zinc-500">Latest tag stream</div>
                <div className="font-mono text-[8px] text-zinc-700">Top {matrixTags.length}</div>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 2xl:grid-cols-1">
                {matrixTags.map((entry, index) => {
                  const width = matrixTags[0]?.count > 0 ? (entry.count / matrixTags[0].count) * 100 : 0;
                  return (
                    <div key={`stream-${entry.tag}`} className="relative h-7 overflow-hidden rounded-sm border border-white/[0.05] bg-white/[0.02]">
                      <div
                        className={`absolute inset-y-0 left-0 ${entry.explicit ? 'bg-rose-400/10' : 'bg-cyan-300/[0.08]'}`}
                        style={{ width: `${width}%` }}
                      />
                      <div className="relative flex h-full items-center gap-2 px-2 font-mono text-[9px]">
                        <span className="w-4 shrink-0 text-zinc-700">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate text-zinc-300">{entry.tag}</span>
                        <span className="shrink-0 text-cyan-200/70">{numberFormatter.format(entry.count)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex min-h-36 items-center justify-center border-y border-white/[0.06] bg-white/[0.015] text-center">
            <div>
              <div className="font-mono text-[10px] uppercase text-zinc-600">Waiting for live tag data</div>
              <div className="mt-1 text-[9px] text-zinc-700">The next completed fetch wave will populate the matrix.</div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function TagCorpusTab() {
  const [corpusStatus, setCorpusStatus] = useState<CorpusStatus | null>(null);
  const [corpusTarget, setCorpusTarget] = useState(2_000_000);
  const [corpusMode, setCorpusMode] = useState<'sample' | 'all'>('all');
  const [corpusMinimumScore, setCorpusMinimumScore] = useState(0);
  const [corpusBusy, setCorpusBusy] = useState(false);
  const [corpusError, setCorpusError] = useState('');
  const [corpusActivity, setCorpusActivity] = useState<CorpusActivitySample[]>([]);
  const previousCorpusSnapshotRef = useRef<CorpusSnapshot | null>(null);

  const loadCorpusStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/booru/corpus/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'Could not load corpus status.');
      const nextStatus = payload.status as CorpusStatus | undefined;
      if (nextStatus) {
        const now = Date.now();
        const previous = previousCorpusSnapshotRef.current;
        if (previous && nextStatus.state === 'running') {
          const elapsedSeconds = Math.max(0.25, (now - previous.at) / 1_000);
          const scannedDelta = Math.max(0, nextStatus.scannedPosts - previous.scannedPosts);
          const indexedDelta = Math.max(0, nextStatus.indexedPosts - previous.indexedPosts);
          const requestDelta = Math.max(0, nextStatus.requestCount - previous.requestCount);
          if (scannedDelta > 0 || indexedDelta > 0 || requestDelta > 0) {
            setCorpusActivity(current => [...current, {
              at: now,
              scannedPosts: nextStatus.scannedPosts,
              indexedPosts: nextStatus.indexedPosts,
              scannedDelta,
              indexedDelta,
              requestDelta,
              postsPerSecond: scannedDelta / elapsedSeconds,
              requestsPerSecond: requestDelta / elapsedSeconds,
              lastPostId: nextStatus.lastPostId,
              lastBatchSize: nextStatus.lastBatchSize,
            }].slice(-60));
          }
        }
        previousCorpusSnapshotRef.current = {
          at: now,
          scannedPosts: nextStatus.scannedPosts,
          indexedPosts: nextStatus.indexedPosts,
          requestCount: nextStatus.requestCount,
        };
      }
      setCorpusStatus(nextStatus || null);
      if (nextStatus && nextStatus.indexedPosts > 0) {
        setCorpusMode(nextStatus.mode);
        setCorpusTarget(nextStatus.targetPosts);
        setCorpusMinimumScore(nextStatus.minimumScore);
      }
      setCorpusError('');
    } catch (error) {
      setCorpusError(error instanceof Error ? error.message : 'Could not load corpus status.');
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    let timer: number | null = null;
    const poll = async () => {
      await loadCorpusStatus();
      if (!disposed) {
        timer = window.setTimeout(() => void poll(), corpusStatus?.state === 'running' ? 2_000 : 8_000);
      }
    };
    void poll();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [corpusStatus?.state, loadCorpusStatus]);

  const runCorpusAction = async (action: 'start' | 'pause' | 'reset', rebuild = false) => {
    setCorpusBusy(true);
    setCorpusError('');
    try {
      const response = await fetch(`/api/booru/corpus/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: action === 'start' ? JSON.stringify({
          targetPosts: corpusTarget,
          allPosts: corpusMode === 'all',
          minimumScore: corpusMinimumScore,
          rebuild,
        }) : '{}',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || `Could not ${action} corpus.`);
      if (rebuild || action === 'reset') {
        setCorpusActivity([]);
        previousCorpusSnapshotRef.current = null;
      }
      setCorpusStatus(payload.status || null);
    } catch (error) {
      setCorpusError(error instanceof Error ? error.message : `Could not ${action} corpus.`);
    } finally {
      setCorpusBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-[var(--umbra-bg)] text-[var(--umbra-text)]" style={{ fontFamily: 'var(--font-family)' }}>
      <aside className="glass-panel custom-scrollbar w-80 shrink-0 overflow-y-auto rounded-none border-y-0 border-l-0 p-4">
        <div className="flex items-center gap-2">
          <DatabaseZap className="h-4 w-4 text-cyan-200" />
          <h2 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-100">Tag Corpus</h2>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Build and monitor the local Danbooru relation index used by tag suggestions.
        </p>

        <div className="mt-5">
          <section className="rounded-md border border-cyan-300/15 bg-cyan-500/[0.035] p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.13em] text-cyan-100">
                  <DatabaseZap className="h-3.5 w-3.5" /> Relation Corpus
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase text-zinc-600">
                  {corpusStatus?.state || 'loading'} / {new Intl.NumberFormat().format(corpusStatus?.indexedPosts || 0)} indexed
                  {(corpusStatus?.scannedPosts || 0) !== (corpusStatus?.indexedPosts || 0)
                    ? ` / ${new Intl.NumberFormat().format(corpusStatus?.scannedPosts || 0)} scanned`
                    : ''}
                </div>
              </div>
              <span className={`rounded-sm border px-1.5 py-1 text-[8px] font-black uppercase tracking-[0.08em] ${corpusStatus?.state === 'running'
                ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100'
                : corpusStatus?.state === 'failed'
                  ? 'border-red-300/25 bg-red-500/10 text-red-100'
                  : 'border-white/10 text-zinc-500'}`}>
                {corpusStatus?.state || 'Unknown'}
              </span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/50">
              <div className="h-full bg-cyan-300 transition-[width] duration-500" style={{ width: `${corpusStatus?.progress || 0}%` }} />
            </div>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[9px] text-zinc-600">
              <span>{(corpusStatus?.progress || 0).toFixed(2)}%</span>
              <span className="text-cyan-200/80">{formatCorpusRate(corpusActivity.at(-1)?.postsPerSecond || 0)}</span>
              <span>ETA {formatCorpusDuration(corpusStatus?.estimatedRemainingMs || null)}</span>
              <span>{formatCorpusBytes(corpusStatus?.databaseBytes || 0)}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                aria-pressed={corpusMode === 'all'}
                disabled={(corpusStatus?.indexedPosts || 0) > 0}
                onClick={() => setCorpusMode('all')}
                className={`h-8 rounded-sm border text-[8px] font-black uppercase tracking-[0.09em] disabled:opacity-45 ${corpusMode === 'all' ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600'}`}
              >
                All Posts
              </button>
              <button
                type="button"
                aria-pressed={corpusMode === 'sample'}
                disabled={(corpusStatus?.indexedPosts || 0) > 0}
                onClick={() => setCorpusMode('sample')}
                className={`h-8 rounded-sm border text-[8px] font-black uppercase tracking-[0.09em] disabled:opacity-45 ${corpusMode === 'sample' ? 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100' : 'border-white/10 text-zinc-600'}`}
              >
                Sample
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              {corpusMode === 'all' ? (
                <div>
                  <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.1em] text-zinc-600">Available Posts</span>
                  <div className="settings-input flex min-h-8 items-center !py-1.5 font-mono text-xs text-cyan-100">
                    {corpusStatus?.availablePosts ? new Intl.NumberFormat().format(corpusStatus.availablePosts) : 'Checking...'}
                  </div>
                </div>
              ) : (
                <label>
                  <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.1em] text-zinc-600">Sample Posts</span>
                  <input
                    type="number"
                    min={10_000}
                    max={50_000_000}
                    step={10_000}
                    value={corpusTarget}
                    disabled={(corpusStatus?.indexedPosts || 0) > 0}
                    onChange={(event) => setCorpusTarget(Math.max(10_000, Math.min(50_000_000, Number(event.target.value) || 2_000_000)))}
                    className="settings-input !py-1.5 text-xs disabled:opacity-45"
                  />
                </label>
              )}
              <label>
                <span className="mb-1 block text-[8px] font-black uppercase tracking-[0.1em] text-zinc-600">Score Floor</span>
                <input
                  type="number"
                  min={0}
                  max={1_000}
                  value={corpusMinimumScore}
                  disabled={(corpusStatus?.indexedPosts || 0) > 0}
                  onChange={(event) => setCorpusMinimumScore(Math.max(0, Math.min(1_000, Number(event.target.value) || 0)))}
                  className="settings-input !py-1.5 text-xs disabled:opacity-45"
                />
              </label>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {corpusStatus?.state === 'running' ? (
                <button
                  type="button"
                  disabled={corpusBusy}
                  onClick={() => void runCorpusAction('pause')}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border border-amber-300/20 bg-amber-500/[0.06] text-[8px] font-black uppercase tracking-[0.09em] text-amber-100 disabled:opacity-40"
                >
                  <Pause className="h-3 w-3" /> Pause
                </button>
              ) : (
                <button
                  type="button"
                  disabled={corpusBusy || corpusStatus?.state === 'completed'}
                  onClick={() => void runCorpusAction('start')}
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border border-emerald-300/25 bg-emerald-500/[0.08] text-[8px] font-black uppercase tracking-[0.09em] text-emerald-100 disabled:opacity-40"
                >
                  {corpusBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                  {(corpusStatus?.indexedPosts || 0) > 0 ? 'Resume' : corpusMode === 'all' ? 'Build All' : 'Build Sample'}
                </button>
              )}
              <button
                type="button"
                disabled={corpusBusy || corpusStatus?.state === 'running'}
                onClick={() => {
                  if (window.confirm('Delete the existing relation corpus and rebuild it from the beginning?')) {
                    void runCorpusAction('start', true);
                  }
                }}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm border border-white/10 text-[8px] font-black uppercase tracking-[0.09em] text-zinc-500 hover:text-zinc-200 disabled:opacity-35"
              >
                <RefreshCw className="h-3 w-3" /> Rebuild
              </button>
            </div>

            {corpusError || corpusStatus?.error ? (
              <div className="mt-2 rounded-sm border border-red-300/15 bg-red-500/[0.05] px-2 py-1.5 text-[9px] leading-4 text-red-200/80">
                {corpusError || corpusStatus?.error}
              </div>
            ) : null}
          </section>
        </div>
      </aside>

      <main className="custom-scrollbar min-w-0 flex-1 overflow-y-auto p-5">
        {(corpusStatus?.indexedPosts || 0) > 0 || corpusStatus?.state === 'running' ? (
          <CorpusLiveMonitor status={corpusStatus} samples={corpusActivity} />
        ) : (
          <div className="flex h-full min-h-[360px] items-center justify-center rounded-md border border-dashed border-white/10 bg-white/[0.02] text-center">
            <div>
              <DatabaseZap className="mx-auto h-8 w-8 text-zinc-600" />
              <div className="mt-3 text-sm font-bold text-zinc-300">No tag corpus yet</div>
              <div className="mt-1 text-xs text-zinc-600">Choose the corpus size and start the local index.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
