import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  ExternalLink,
  FolderOpen,
  GraduationCap,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Wrench,
} from 'lucide-react';
import { getLocalServerFrameUrl, openLocalServerAppFolder } from '@/lib/localServerApps';
import { useToastStore } from '@/store/useToastStore';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

interface AIToolkitStatus {
  installed: boolean;
  detected: boolean;
  path: string;
  uiPath: string;
  url: string;
  port: number;
  running: boolean;
  healthy: boolean;
  pid: number | null;
  uptime: number;
  ownership: 'owned' | 'external-compatible' | 'none' | string;
  nodeAvailable: boolean;
  nodeVersion: string;
  uiDependenciesInstalled: boolean;
  datasetsPath: string;
}

interface ToolActionResult {
  status: 'running' | 'completed' | 'failed';
  logs?: string[];
  error?: string;
}

const EMPTY_STATUS: AIToolkitStatus = {
  installed: false,
  detected: false,
  path: '',
  uiPath: '',
  url: 'http://127.0.0.1:8675/',
  port: 8675,
  running: false,
  healthy: false,
  pid: null,
  uptime: 0,
  ownership: 'none',
  nodeAvailable: false,
  nodeVersion: '',
  uiDependenciesInstalled: false,
  datasetsPath: '',
};

type BusyAction = 'install' | 'update' | 'launch' | 'stop' | null;

function StatusDot({ status }: { status: AIToolkitStatus }) {
  const color = status.healthy
    ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.75)]'
    : status.running
      ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.6)]'
      : 'bg-zinc-600';
  return <span className={`h-2 w-2 rounded-full ${color}`} aria-hidden="true" />;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds === 999) return '';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function AIToolkitTab({ isActive }: { isActive: boolean }) {
  const addToast = useToastStore((state) => state.addToast);
  const [status, setStatus] = useState<AIToolkitStatus>(EMPTY_STATUS);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState('');
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [actionLogs, setActionLogs] = useState<string[]>([]);
  const [frameMounted, setFrameMounted] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const mountedRef = useRef(true);
  const remoteClient = useMemo(() => isUmbraRemoteClient(), []);
  const frameUrl = useMemo(
    () => getLocalServerFrameUrl(status.url || EMPTY_STATUS.url, remoteClient),
    [remoteClient, status.url],
  );

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const fetchStatus = useCallback(async (quiet = false) => {
    if (!quiet) setStatusLoading(true);
    try {
      const response = await fetch('/api/data-forge/ai-toolkit/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || `Status request failed (${response.status})`);
      if (!mountedRef.current) return null;
      const next = { ...EMPTY_STATUS, ...(payload || {}) } as AIToolkitStatus;
      setStatus(next);
      setStatusError('');
      if (next.healthy) setFrameMounted(true);
      return next;
    } catch (error: any) {
      if (!mountedRef.current) return null;
      setStatusError(String(error?.message || 'AI-Toolkit status is unavailable.'));
      return null;
    } finally {
      if (mountedRef.current && !quiet) setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = window.setInterval(() => void fetchStatus(true), isActive ? 3000 : 15000);
    return () => window.clearInterval(interval);
  }, [fetchStatus, isActive]);

  const runToolAction = useCallback(async (action: 'install' | 'update') => {
    if (remoteClient || busyAction) return;
    setBusyAction(action);
    setActionLogs([]);
    try {
      const response = await fetch('/api/tools/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, tool: 'aitoolkit' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.actionId) {
        throw new Error(payload?.error || `Could not start AI-Toolkit ${action}.`);
      }

      let result: ToolActionResult = { status: 'running' };
      while (result.status === 'running') {
        await new Promise((resolve) => window.setTimeout(resolve, 1000));
        const statusResponse = await fetch(`/api/tools/actions/${payload.actionId}`, { cache: 'no-store' });
        result = await statusResponse.json().catch(() => ({ status: 'failed', error: 'Invalid action response.' }));
        if (!statusResponse.ok) throw new Error(result.error || 'Could not read AI-Toolkit action status.');
        if (mountedRef.current && Array.isArray(result.logs)) setActionLogs(result.logs.slice(-12));
      }
      if (result.status === 'failed') throw new Error(result.error || `AI-Toolkit ${action} failed.`);

      addToast({ message: action === 'install' ? 'AI-Toolkit is ready' : 'AI-Toolkit updated', type: 'success' });
      await fetchStatus();
    } catch (error: any) {
      addToast({ message: String(error?.message || `AI-Toolkit ${action} failed.`), type: 'error' });
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }, [addToast, busyAction, fetchStatus, remoteClient]);

  const launch = useCallback(async () => {
    if (busyAction) return;
    setBusyAction('launch');
    setActionLogs(['Requesting AI-Toolkit launch...']);
    try {
      const startResponse = await fetch('/api/umbrabridge/backend/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'aitoolkit' }),
      });
      const startResult = await startResponse.json().catch(() => null);
      if (!startResponse.ok || startResult?.success === false) {
        throw new Error(startResult?.error || 'AI-Toolkit could not be started.');
      }
      setActionLogs((lines) => [...lines, startResult?.message || 'Waiting for AI-Toolkit...']);

      const readyResponse = await fetch('/api/umbrabridge/backend/wait-ready', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'aitoolkit', timeout: 10 * 60 * 1000 }),
      });
      const readyResult = await readyResponse.json().catch(() => null);
      if (!readyResponse.ok || readyResult?.ready !== true) {
        throw new Error(readyResult?.error || 'AI-Toolkit did not become ready in time.');
      }

      await fetchStatus();
      if (mountedRef.current) {
        setFrameMounted(true);
        setFrameLoaded(false);
        setFrameKey((key) => key + 1);
      }
      addToast({ message: 'AI-Toolkit connected', type: 'success' });
    } catch (error: any) {
      addToast({ message: String(error?.message || 'AI-Toolkit launch failed.'), type: 'error' });
      await fetchStatus(true);
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }, [addToast, busyAction, fetchStatus]);

  const stop = useCallback(async () => {
    if (busyAction) return;
    setBusyAction('stop');
    try {
      const response = await fetch('/api/umbrabridge/backend/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backend: 'aitoolkit' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'AI-Toolkit could not be stopped.');
      if (payload?.external !== true) {
        setFrameMounted(false);
        setFrameLoaded(false);
      }
      await fetchStatus(true);
      addToast({ message: payload?.message || 'AI-Toolkit stopped', type: 'success' });
    } catch (error: any) {
      addToast({ message: String(error?.message || 'AI-Toolkit stop failed.'), type: 'error' });
    } finally {
      if (mountedRef.current) setBusyAction(null);
    }
  }, [addToast, busyAction, fetchStatus]);

  const openFolder = useCallback(async () => {
    if (remoteClient || !status.path) return;
    try {
      await openLocalServerAppFolder(status.path);
    } catch (error: any) {
      addToast({ message: String(error?.message || 'Could not open the AI-Toolkit folder.'), type: 'error' });
    }
  }, [addToast, remoteClient, status.path]);

  const openExternal = useCallback(() => {
    window.open(frameUrl, '_blank', 'noopener,noreferrer');
  }, [frameUrl]);

  const reloadFrame = useCallback(() => {
    setFrameLoaded(false);
    setFrameKey((key) => key + 1);
  }, []);

  const actionBusy = busyAction === 'install' || busyAction === 'update';
  const launchBusy = busyAction === 'launch';
  const isRepairNeeded = status.installed && !status.uiDependenciesInstalled;
  const canLaunch = status.installed && status.nodeAvailable && status.uiDependenciesInstalled;
  const statusLabel = status.healthy ? 'Online' : status.running ? 'Starting' : 'Offline';

  if (!frameMounted) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)]">
        <div className="flex items-center justify-between gap-4 border-b border-white/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-md border border-emerald-400/30 bg-emerald-500/10 text-emerald-300">
              <GraduationCap size={19} />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-black uppercase tracking-[0.14em] text-zinc-100">AI-Toolkit</h2>
              <p className="mt-0.5 truncate text-xs text-zinc-500">LoRA training inside Data Forge</p>
            </div>
          </div>
          <button
            type="button"
            title="Refresh AI-Toolkit status"
            onClick={() => void fetchStatus()}
            disabled={statusLoading}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-white/25 hover:text-zinc-100 disabled:opacity-40"
          >
            <RefreshCw size={15} className={statusLoading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-2xl">
            <div className="flex items-start gap-4 border-b border-white/10 pb-5">
              <GraduationCap size={42} className="mt-1 flex-none text-emerald-300" />
              <div>
                <h3 className="text-2xl font-black uppercase tracking-[0.08em] text-zinc-100">
                  {status.installed ? (status.running ? 'Starting AI-Toolkit' : 'AI-Toolkit is ready to launch') : 'Install AI-Toolkit'}
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                  Train LoRAs with the official AI-Toolkit interface without leaving Data Forge. Umbra keeps its iframe alive while you move between tabs and workspaces.
                </p>
              </div>
            </div>

            <div className="grid gap-3 py-5 sm:grid-cols-2">
              <div className="border-l-2 border-emerald-400/40 pl-3">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">Shared datasets</div>
                <div className="mt-1 break-all text-xs leading-5 text-zinc-500">{status.datasetsPath || 'User/Datasets'}</div>
              </div>
              <div className="border-l-2 border-cyan-400/40 pl-3">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">Host runtime</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500">
                  {status.nodeAvailable ? `Node ${status.nodeVersion}` : 'Node.js 20+ and npm required'}
                </div>
              </div>
            </div>

            {(statusError || (!status.nodeAvailable && !statusLoading)) && (
              <div className="mb-4 flex items-start gap-3 border border-amber-400/25 bg-amber-500/[0.06] px-3 py-3 text-sm text-amber-100">
                <AlertTriangle size={17} className="mt-0.5 flex-none text-amber-300" />
                <span>{statusError || 'Install Node.js 20 or newer on the host before installing or launching AI-Toolkit.'}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!status.installed || isRepairNeeded ? (
                <button
                  type="button"
                  onClick={() => void runToolAction('install')}
                  disabled={remoteClient || actionBusy || !status.nodeAvailable}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-300/40 bg-emerald-500/15 px-4 text-xs font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {actionBusy ? <Loader2 size={15} className="animate-spin" /> : isRepairNeeded ? <Wrench size={15} /> : <Download size={15} />}
                  {isRepairNeeded ? 'Repair Install' : 'Install'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void launch()}
                  disabled={!canLaunch || busyAction !== null}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-emerald-300/40 bg-emerald-500/15 px-4 text-xs font-black uppercase tracking-wider text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {launchBusy || status.running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  {status.running ? 'Connecting' : 'Launch'}
                </button>
              )}

              {status.installed && (
                <button
                  type="button"
                  onClick={() => void runToolAction('update')}
                  disabled={remoteClient || busyAction !== null || status.running}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-white/12 px-4 text-xs font-bold uppercase tracking-wider text-zinc-300 hover:border-white/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <RefreshCw size={15} />
                  Update
                </button>
              )}

              {status.path && !remoteClient && (
                <button
                  type="button"
                  title="Open AI-Toolkit folder"
                  onClick={() => void openFolder()}
                  className="flex h-10 w-10 items-center justify-center rounded-md border border-white/12 text-zinc-400 hover:border-white/25 hover:text-white"
                >
                  <FolderOpen size={16} />
                </button>
              )}
            </div>

            {remoteClient && (
              <p className="mt-3 text-xs text-zinc-500">Install and update actions are available from the host PC. Launching and the embedded workspace remain available remotely.</p>
            )}

            {(busyAction || actionLogs.length > 0) && (
              <pre className="mt-5 max-h-44 overflow-auto border border-white/10 bg-black/35 p-3 text-[11px] leading-5 text-zinc-400">
                {actionLogs.length > 0 ? actionLogs.join('\n') : 'Working...'}
              </pre>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--umbra-bg)]">
      <div className="flex min-h-12 flex-none items-center gap-3 border-b border-white/10 bg-black/35 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusDot status={status} />
          <GraduationCap size={16} className="flex-none text-emerald-300" />
          <span className="text-xs font-black uppercase tracking-[0.12em] text-zinc-100">AI-Toolkit</span>
          <span className="hidden text-xs text-zinc-500 sm:inline">{statusLabel}{formatUptime(status.uptime) ? ` / ${formatUptime(status.uptime)}` : ''}</span>
        </div>
        <div className="min-w-0 flex-1 truncate border-l border-white/10 pl-3 text-xs text-zinc-500">{status.url}</div>
        <button
          type="button"
          title="Reload AI-Toolkit"
          onClick={reloadFrame}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
        >
          <RefreshCw size={14} />
        </button>
        <button
          type="button"
          title="Open AI-Toolkit externally"
          onClick={openExternal}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
        >
          <ExternalLink size={14} />
        </button>
        {!remoteClient && status.path && (
          <button
            type="button"
            title="Open AI-Toolkit folder"
            onClick={() => void openFolder()}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-white/25 hover:text-white"
          >
            <FolderOpen size={14} />
          </button>
        )}
        <button
          type="button"
          title="Stop AI-Toolkit"
          onClick={() => void stop()}
          disabled={busyAction !== null || status.ownership === 'external-compatible'}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-md border border-red-400/20 text-red-300 hover:border-red-300/40 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-35"
        >
          {busyAction === 'stop' ? <Loader2 size={14} className="animate-spin" /> : <Square size={13} />}
        </button>
      </div>

      <div className="relative min-h-0 flex-1 bg-black">
        <iframe
          key={frameKey}
          src={frameUrl}
          title="AI-Toolkit"
          className="h-full w-full border-0 bg-black"
          allow="clipboard-read; clipboard-write"
          onLoad={() => setFrameLoaded(true)}
        />
        {!frameLoaded && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--umbra-bg)]">
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <Loader2 size={18} className="animate-spin text-emerald-300" />
              Loading AI-Toolkit workspace
            </div>
          </div>
        )}
        {!status.healthy && frameLoaded && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 border border-amber-400/25 bg-black/90 px-3 py-2 text-xs text-amber-100">
            <AlertTriangle size={14} className="text-amber-300" />
            Connection interrupted. Umbra is keeping the workspace mounted while it reconnects.
          </div>
        )}
        {status.healthy && frameLoaded && (
          <span className="sr-only"><CheckCircle2 />AI-Toolkit is ready</span>
        )}
      </div>
    </div>
  );
}
