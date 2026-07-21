'use client';

import React from 'react';
import {
  Activity,
  CheckCircle2,
  Copy,
  Edit3,
  ExternalLink,
  Globe2,
  LockKeyhole,
  Network,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Wifi,
  LogOut,
  Play,
  Settings2,
  Trash2,
} from 'lucide-react';
import * as QRCode from 'qrcode';
import { useStore } from '@/store/useStore';
import { cn } from '@/lib/utils';

type RemoteStatus = {
  ok?: boolean;
  bindHost?: string;
  port?: number;
  localUrl?: string;
  remoteEnabled?: boolean;
  selectedUrl?: string | null;
  urls?: string[];
  lanUrls?: string[];
  tailscaleUrls?: string[];
  tailscaleHttpsUrls?: string[];
  suggestedTailscaleHttpsUrls?: string[];
  tailscaleDnsName?: string;
  tailscaleServeEnabled?: boolean;
  tailscaleServeCommand?: string;
  httpUrlsHidden?: boolean;
  hiddenHttpUrls?: string[];
  settings?: {
    bindHost?: string;
    port?: number;
    preferredMode?: string;
    tailscaleHttpsUrl?: string;
    preferHttps?: boolean;
    hideHttpWhenHttpsAvailable?: boolean;
    requireRemoteAuth?: boolean;
    sessionTtlDays?: number;
    storagePath?: string;
    active?: {
      bindHost?: string;
      port?: number;
    };
    pendingRestart?: boolean;
  };
  accessModes?: Array<{
    id?: string;
    label?: string;
    available?: boolean;
    recommended?: boolean;
    provider?: string;
  }>;
  security?: {
    transport?: string;
    recommended?: string;
    appAuthEnabled?: boolean;
  };
  auth?: {
    remote?: boolean;
    configured?: boolean;
    authenticated?: boolean;
    username?: string | null;
    storagePath?: string;
    device?: {
      trusted?: boolean;
      label?: string;
      lastAuthenticatedAt?: number;
    } | null;
    trustedDeviceCount?: number;
  };
};

type RemoteTab = 'connection' | 'security' | 'diagnostics' | 'guide';

type RemoteDevice = {
  id: string;
  label: string;
  trusted: boolean;
  userAgent: string;
  remoteAddress: string;
  createdAt: number;
  lastSeenAt: number;
  lastAuthenticatedAt: number;
};

type RemoteUrlTestResult = {
  ok?: boolean;
  secure?: boolean;
  status?: number;
  latencyMs?: number;
  error?: string;
  testing?: boolean;
};

type RemoteTelemetrySnapshot = {
  ok?: boolean;
  now?: number;
  recentWindowMs?: number;
  clients?: Array<{
    clientId: string;
    clientLabel: string;
    mode: string;
    url: string;
    remoteAddress: string;
    live?: boolean;
    recentWindowMs?: number;
    viewport?: { width?: number; height?: number; devicePixelRatio?: number };
    lastSeenAt: number;
    idleMs: number;
    eventCount: number;
    pingCount: number;
    lastRttMs?: number;
    rttAvgMs: number;
    rttMaxMs: number;
    interactionCount: number;
    interactionAvgMs: number;
    interactionMaxMs: number;
    resourceCount: number;
    resourceBytes: number;
    resourceAvgMs: number;
    resourceMaxMs: number;
    longTaskCount: number;
    longTaskTotalMs: number;
  }>;
  recentEvents?: Array<{
    at?: number;
    clientLabel?: string;
    type?: string;
    mode?: string;
    path?: string;
    durationMs?: number;
    bytes?: number;
  }>;
  websocketClients?: Record<string, number>;
  websocketTraffic?: Array<{
    endpoint: string;
    messagesIn: number;
    messagesOut: number;
    bytesIn: number;
    bytesOut: number;
    idleMs: number;
  }>;
};

const REMOTE_TABS: Array<{
  id: RemoteTab;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'connection', label: 'Connection', description: 'URLs, bind, ports, HTTPS, and connection mode.', icon: Network },
  { id: 'security', label: 'Security', description: 'Remote account, trusted devices, and sessions.', icon: LockKeyhole },
  { id: 'diagnostics', label: 'Diagnostics', description: 'Latency, transfers, websocket traffic, and slow events.', icon: Activity },
  { id: 'guide', label: 'Guide', description: 'Recommended remote paths and safety checklist.', icon: ShieldCheck },
];

function getCurrentBrowserUrl(): string {
  if (typeof window === 'undefined') return '';
  return window.location.href;
}

function describeUrl(url: string): { label: string; tone: 'tailscale' | 'local' | 'other' } {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') return { label: 'Local', tone: 'local' };
    if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(parsed.hostname)) return { label: 'Tailscale', tone: 'tailscale' };
    if (parsed.hostname.endsWith('.ts.net')) return { label: 'Tailscale', tone: 'tailscale' };
  } catch {
    // Fall through to the generic label.
  }
  return { label: 'Remote', tone: 'other' };
}

function UrlRow({
  url,
  primary = false,
  testResult,
  onTest,
}: {
  url: string;
  primary?: boolean;
  testResult?: RemoteUrlTestResult;
  onTest?: (url: string) => void;
}) {
  const showToast = useStore((state) => state.showToast);
  const descriptor = describeUrl(url);
  const secure = (() => {
    try {
      return new URL(url).protocol === 'https:';
    } catch {
      return false;
    }
  })();
  const badgeLabel = secure ? 'HTTPS' : descriptor.tone === 'tailscale' ? 'Tailscale' : 'Current';
  const copyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast('Remote URL copied', 'success');
    } catch {
      showToast('Could not copy URL', 'error');
    }
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-3 rounded-lg border bg-black/25 px-3 py-2',
        primary ? 'border-cyan-300/35 shadow-[0_0_18px_rgba(0,255,255,0.12)]' : 'border-white/10',
      )}
    >
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
          descriptor.tone === 'tailscale' && 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100',
          descriptor.tone === 'local' && 'border-zinc-500/35 bg-zinc-500/10 text-zinc-200',
          descriptor.tone === 'other' && 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100',
        )}
      >
        {descriptor.tone === 'tailscale' ? <LockKeyhole size={15} /> : <Globe2 size={15} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{descriptor.label}</span>
          {primary ? (
            <span className={cn(
              'rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest',
              secure ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100' : 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100',
            )}>
              {badgeLabel}
            </span>
          ) : null}
          {testResult ? (
            <span className={cn(
              'rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest',
              testResult.testing && 'border-cyan-300/30 bg-cyan-500/10 text-cyan-100',
              !testResult.testing && testResult.ok && 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
              !testResult.testing && testResult.ok === false && 'border-red-300/30 bg-red-500/10 text-red-100',
            )}>
              {testResult.testing ? 'Testing' : testResult.ok ? `${testResult.status || 200} ${testResult.latencyMs || 0}ms` : 'Failed'}
            </span>
          ) : null}
        </div>
        <div className="truncate font-mono text-xs text-zinc-100">{url}</div>
        {testResult?.error ? <div className="truncate text-[10px] text-red-200">{testResult.error}</div> : null}
      </div>
      {onTest ? (
        <button
          type="button"
          onClick={() => onTest(url)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-emerald-300/40 hover:bg-emerald-500/10 hover:text-emerald-100"
          title="Test URL"
          aria-label="Test URL"
        >
          <Play size={13} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={copyUrl}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-cyan-300/40 hover:bg-cyan-500/10 hover:text-cyan-100"
        title="Copy URL"
        aria-label="Copy URL"
      >
        <Copy size={14} />
      </button>
      <button
        type="button"
        onClick={() => window.open(url, '_blank', 'noopener,noreferrer')}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/10 text-zinc-400 hover:border-white/25 hover:bg-white/5 hover:text-white"
        title="Open URL"
        aria-label="Open URL"
      >
        <ExternalLink size={14} />
      </button>
    </div>
  );
}

function formatBytes(bytes: number): string {
  const value = Math.max(0, Number(bytes) || 0);
  if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${Math.round(value)} B`;
}

function metricTone(value: number, warn: number, bad: number): string {
  if (!Number.isFinite(value) || value <= 0) return 'text-zinc-500';
  if (value >= bad) return 'text-red-100';
  if (value >= warn) return 'text-yellow-100';
  return 'text-emerald-100';
}

export function UmbraRemoteWorkspace() {
  const showToast = useStore((state) => state.showToast);
  const setAppSetting = useStore((state) => state.setAppSetting);
  const syncUiAcrossDevices = useStore((state) => state.appSettings['remote.syncUiAcrossDevices'] !== false);
  const remoteViewerOriginals = useStore((state) => state.appSettings['remote.galleryViewerOriginals'] === true);
  const [status, setStatus] = React.useState<RemoteStatus | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [authUsername, setAuthUsername] = React.useState('');
  const [authPassword, setAuthPassword] = React.useState('');
  const [authSaving, setAuthSaving] = React.useState(false);
  const [pairLinkSaving, setPairLinkSaving] = React.useState(false);
  const [editingAuthCredentials, setEditingAuthCredentials] = React.useState(false);
  const [bindHost, setBindHost] = React.useState('0.0.0.0');
  const [port, setPort] = React.useState('8212');
  const [tailscaleHttpsUrl, setTailscaleHttpsUrl] = React.useState('');
  const [preferHttps, setPreferHttps] = React.useState(true);
  const [hideHttpWhenHttpsAvailable, setHideHttpWhenHttpsAvailable] = React.useState(true);
  const [requireRemoteAuth, setRequireRemoteAuth] = React.useState(true);
  const [sessionTtlDays, setSessionTtlDays] = React.useState('7');
  const [settingsSaving, setSettingsSaving] = React.useState(false);
  const [urlTests, setUrlTests] = React.useState<Record<string, RemoteUrlTestResult>>({});
  const [devices, setDevices] = React.useState<RemoteDevice[]>([]);
  const [deviceLabels, setDeviceLabels] = React.useState<Record<string, string>>({});
  const [devicesLoading, setDevicesLoading] = React.useState(false);
  const [tailscaleServeRunning, setTailscaleServeRunning] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<RemoteTab>('connection');
  const [tailscaleServeNotice, setTailscaleServeNotice] = React.useState<{
    code?: string;
    message?: string;
    details?: string;
    enableUrl?: string;
  } | null>(null);
  const [qrDataUrl, setQrDataUrl] = React.useState('');
  const [telemetry, setTelemetry] = React.useState<RemoteTelemetrySnapshot | null>(null);
  const currentUrl = getCurrentBrowserUrl();
  const telemetryClients = React.useMemo(() => {
    const clients = telemetry?.clients || [];
    const liveClients = clients.filter((client) => client.live || (client.idleMs || 0) < 30_000);
    return liveClients.length ? liveClients : clients.slice(0, 2);
  }, [telemetry?.clients]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/remote/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({} as RemoteStatus & { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Remote status failed'));
      setStatus(payload);
      if (payload.auth?.configured && !editingAuthCredentials) {
        setAuthUsername(payload.auth.username || '');
      }
      setBindHost(payload.settings?.bindHost || payload.bindHost || '0.0.0.0');
      setPort(String(payload.settings?.port || payload.port || 8212));
      setTailscaleHttpsUrl(payload.settings?.tailscaleHttpsUrl || payload.suggestedTailscaleHttpsUrls?.[0] || payload.tailscaleHttpsUrls?.[0] || '');
      setPreferHttps(payload.settings?.preferHttps !== false);
      setHideHttpWhenHttpsAvailable(payload.settings?.hideHttpWhenHttpsAvailable !== false);
      setRequireRemoteAuth(payload.settings?.requireRemoteAuth !== false);
      setSessionTtlDays(String(payload.settings?.sessionTtlDays || 7));
    } catch (remoteError) {
      const message = remoteError instanceof Error ? remoteError.message : 'Remote status failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [editingAuthCredentials]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const refreshDevices = React.useCallback(async () => {
    setDevicesLoading(true);
    try {
      const response = await fetch('/api/remote/devices', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({} as { devices?: RemoteDevice[]; error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Trusted devices failed to load'));
      const nextDevices = payload.devices || [];
      setDevices(nextDevices);
      setDeviceLabels(Object.fromEntries(nextDevices.map((device) => [device.id, device.label || 'Remote Browser'])));
    } catch (deviceError) {
      setError(deviceError instanceof Error ? deviceError.message : 'Trusted devices failed to load');
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (status?.auth?.configured) void refreshDevices();
  }, [refreshDevices, status?.auth?.configured]);

  const refreshTelemetry = React.useCallback(async () => {
    try {
      const response = await fetch('/api/remote/metrics', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({} as RemoteTelemetrySnapshot));
      if (response.ok) setTelemetry(payload);
    } catch {
      // Telemetry is observational only.
    }
  }, []);

  React.useEffect(() => {
    void refreshTelemetry();
    const timer = window.setInterval(() => void refreshTelemetry(), 5000);
    return () => window.clearInterval(timer);
  }, [refreshTelemetry]);

  const privateVpnUrls = React.useMemo(() => {
    const values = new Set<string>();
    if (status?.remoteEnabled) {
      for (const url of status?.tailscaleHttpsUrls || []) values.add(url);
      for (const url of status?.tailscaleUrls || []) values.add(url);
    }
    return Array.from(values);
  }, [status]);

  const privateVpnConnectionCount = status?.tailscaleDnsName || privateVpnUrls.length > 0 ? 1 : 0;
  const tailscaleHttpsSuggested = Boolean((status?.suggestedTailscaleHttpsUrls || []).length || status?.tailscaleDnsName);

  const remoteUrls = React.useMemo(() => {
    const values = new Set<string>();
    if (status?.remoteEnabled) {
      for (const url of status?.urls || []) values.add(url);
    }
    return Array.from(values);
  }, [status]);

  const localTestingUrls = React.useMemo(() => {
    const values = new Set<string>();
    if (currentUrl) values.add(currentUrl);
    if (status?.localUrl) values.add(status.localUrl);
    return Array.from(values);
  }, [currentUrl, status]);

  const openRemoteReady = Boolean(status?.remoteReady || remoteUrls.length > 0);
  const tailscaleReady = privateVpnUrls.length > 0;
  const authConfigured = Boolean(status?.auth?.configured);
  const authEditable = !status?.auth?.remote;

  React.useEffect(() => {
    const selectedUrl = status?.selectedUrl || '';
    if (!selectedUrl) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(selectedUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 180,
      color: {
        dark: '#e5ffff',
        light: '#050508',
      },
    }).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    }).catch(() => {
      if (!cancelled) setQrDataUrl('');
    });
    return () => {
      cancelled = true;
    };
  }, [status?.selectedUrl]);

  const copyTailscaleServeCommand = async () => {
    const command = status?.tailscaleServeCommand || `tailscale serve --bg http://127.0.0.1:${status?.port || 8212}`;
    try {
      await navigator.clipboard.writeText(command);
      showToast('Tailscale Serve command copied', 'success');
    } catch {
      showToast('Could not copy command', 'error');
    }
  };

  const runTailscaleServe = async () => {
    setTailscaleServeRunning(true);
    setError(null);
    setTailscaleServeNotice(null);
    try {
      const response = await fetch('/api/remote/tailscale/serve', { method: 'POST' });
      const payload = await response.json().catch(() => ({} as {
        error?: string;
        message?: string;
        details?: string;
        code?: string;
        enableUrl?: string;
      }));
      if (!response.ok) {
        if (payload?.code === 'TAILSCALE_SERVE_NOT_ENABLED') {
          setTailscaleServeNotice({
            code: payload.code,
            message: payload.message || 'Tailscale Serve is not enabled yet.',
            details: payload.details,
            enableUrl: payload.enableUrl,
          });
          showToast('Tailscale Serve needs tailnet approval', 'error');
          return;
        }
        throw new Error(String(payload?.message || payload?.error || 'Tailscale Serve failed'));
      }
      await refresh();
      showToast('Tailscale HTTPS enabled', 'success');
    } catch (serveError) {
      setTailscaleServeNotice({
        code: 'TAILSCALE_SERVE_FAILED',
        message: serveError instanceof Error ? serveError.message : 'Tailscale Serve failed',
        details: 'Copy the command and run it from an administrator terminal if automatic setup cannot run it.',
      });
    } finally {
      setTailscaleServeRunning(false);
    }
  };

  const testRemoteUrl = async (targetUrl: string) => {
    setUrlTests((current) => ({ ...current, [targetUrl]: { ...(current[targetUrl] || {}), testing: true } }));
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 5000);
    try {
      const checkUrl = new URL('/api/healthz/live', targetUrl).toString();
      const response = await fetch(checkUrl, {
        cache: 'no-store',
        credentials: 'include',
        signal: controller.signal,
      });
      const payload: RemoteUrlTestResult = {
        ok: response.ok,
        secure: new URL(targetUrl).protocol === 'https:',
        status: response.status,
        latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
        error: response.ok ? undefined : `HTTP ${response.status}`,
      };
      setUrlTests((current) => ({
        ...current,
        [targetUrl]: { ...payload, testing: false },
      }));
      showToast(payload.ok ? 'Remote URL is reachable' : 'Remote URL test failed', payload.ok ? 'success' : 'error');
    } catch (testError) {
      setUrlTests((current) => ({
        ...current,
        [targetUrl]: {
          ok: false,
          testing: false,
          latencyMs: Math.max(0, Math.round(performance.now() - startedAt)),
          error: testError instanceof Error ? testError.message : 'Test failed',
        },
      }));
      showToast('Remote URL test failed', 'error');
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const copyBestRemoteUrl = async () => {
    const bestUrl = status?.selectedUrl || remoteUrls[0] || status?.localUrl || currentUrl;
    if (!bestUrl) {
      showToast('Remote URL not detected', 'error');
      return;
    }
    try {
      await navigator.clipboard.writeText(bestUrl);
      showToast('Remote URL copied', 'success');
    } catch {
      showToast('Could not copy remote URL', 'error');
    }
  };

  const copyPairLink = async () => {
    const bestUrl = status?.selectedUrl || remoteUrls[0] || status?.localUrl || currentUrl;
    if (!bestUrl) {
      showToast('Remote URL not detected', 'error');
      return;
    }
    setPairLinkSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/remote/auth/pair-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceLabel: 'Paired remote browser' }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string; path?: string }));
      if (!response.ok || !payload.path) throw new Error(String(payload?.error || 'Could not create pair link'));
      const pairUrl = new URL(payload.path, bestUrl).toString();
      await navigator.clipboard.writeText(pairUrl);
      showToast('Remote pair link copied. Open it on the other device within 10 minutes.', 'success');
    } catch (pairError) {
      setError(pairError instanceof Error ? pairError.message : 'Could not create pair link');
      showToast('Could not create pair link', 'error');
    } finally {
      setPairLinkSaving(false);
    }
  };

  const saveRemoteCredentials = async (event: React.FormEvent) => {
    event.preventDefault();
    setAuthSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/remote/auth/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authUsername, password: authPassword, deviceLabel: 'Host Browser' }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to save remote credentials'));
      setAuthPassword('');
      setEditingAuthCredentials(false);
      await refresh();
      showToast('Umbra Remote account saved', 'success');
    } catch (setupError) {
      setError(setupError instanceof Error ? setupError.message : 'Failed to save remote credentials');
    } finally {
      setAuthSaving(false);
    }
  };

  const logoutRemoteSessions = async () => {
    setAuthSaving(true);
    setError(null);
    try {
      await fetch('/api/remote/auth/logout', { method: 'POST' });
      await refresh();
      showToast('Remote session cleared on this browser', 'success');
    } catch {
      showToast('Could not clear remote session', 'error');
    } finally {
      setAuthSaving(false);
    }
  };

  const startEditingRemoteCredentials = () => {
    setAuthUsername(status?.auth?.username || '');
    setAuthPassword('');
    setEditingAuthCredentials(true);
  };

  const cancelEditingRemoteCredentials = () => {
    setAuthUsername(status?.auth?.username || '');
    setAuthPassword('');
    setEditingAuthCredentials(false);
  };

  const renameDevice = async (device: RemoteDevice) => {
    const label = (deviceLabels[device.id] || '').trim();
    if (!label) {
      showToast('Device label is required', 'error');
      return;
    }
    try {
      const response = await fetch('/api/remote/devices/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: device.id, label }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not rename device'));
      await refreshDevices();
      showToast('Trusted device renamed', 'success');
    } catch (renameError) {
      setError(renameError instanceof Error ? renameError.message : 'Could not rename device');
    }
  };

  const revokeDevice = async (device: RemoteDevice) => {
    try {
      const response = await fetch('/api/remote/devices/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: device.id }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Could not revoke device'));
      await refresh();
      await refreshDevices();
      showToast('Trusted device revoked', 'success');
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : 'Could not revoke device');
    }
  };

  const saveRemoteSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    setSettingsSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/remote/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bindHost,
          port: Number(port),
          preferredMode: 'private-vpn',
          tailscaleHttpsUrl,
          preferHttps,
          hideHttpWhenHttpsAvailable,
          requireRemoteAuth,
          sessionTtlDays: Number(sessionTtlDays),
        }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Failed to save remote settings'));
      await refresh();
      showToast('Remote connection settings saved', 'success');
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : 'Failed to save remote settings');
    } finally {
      setSettingsSaving(false);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--umbra-bg)] text-[var(--umbra-text)]">
      <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/20 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-500/10 text-cyan-100 shadow-[0_0_24px_rgba(0,255,255,0.12)]">
            <Wifi size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-white">Umbra Remote</h2>
            <p className="mt-0.5 text-xs text-zinc-500">
              Open remote studio access through Tailscale
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={copyBestRemoteUrl}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-cyan-300/30 bg-cyan-500/10 px-3 text-xs font-bold uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/15"
          >
            <Copy size={14} />
            Copy Best URL
          </button>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-zinc-400 hover:bg-white/5 hover:text-white"
            title="Refresh"
            aria-label="Refresh"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-5 py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">
          <div
            className={cn(
              'rounded-xl border px-4 py-3',
              openRemoteReady
                ? 'border-emerald-300/25 bg-emerald-500/10'
                : 'border-yellow-400/30 bg-yellow-500/10',
            )}
          >
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border',
                  openRemoteReady
                    ? 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100'
                    : 'border-yellow-300/35 bg-yellow-500/10 text-yellow-100',
                )}
              >
                {openRemoteReady ? <ShieldCheck size={17} /> : <ShieldAlert size={17} />}
              </div>
              <div className="min-w-0">
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">
                  {openRemoteReady ? 'Remote Ready' : 'Remote Not Listening'}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-zinc-300">
                  {openRemoteReady
                    ? 'Umbra Remote is available through your Tailscale tailnet. Use the URL shown below.'
                    : 'Umbra is waiting for a Tailscale route. Enable Tailscale Serve or use the tailnet IP.'}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-4">
            {[
              ['Auth', authConfigured ? 'Configured' : 'Missing', authConfigured],
              ['HTTPS', status?.selectedUrl?.startsWith('https://') ? 'Preferred' : 'Not selected', Boolean(status?.selectedUrl?.startsWith('https://'))],
              ['Tailscale', status?.tailscaleDnsName || 'Not detected', Boolean(status?.tailscaleDnsName)],
              ['Restart', status?.settings?.pendingRestart ? 'Required' : 'Clean', !status?.settings?.pendingRestart],
            ].map(([label, value, good]) => (
              <div key={String(label)} className={cn(
                'rounded-xl border bg-black/20 p-3',
                good ? 'border-emerald-300/20' : 'border-yellow-300/25',
              )}>
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">{label}</div>
                <div className={cn('mt-1 truncate text-sm font-bold', good ? 'text-emerald-100' : 'text-yellow-100')}>{value}</div>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-2">
            <div className="grid gap-2 md:grid-cols-4">
              {REMOTE_TABS.map((tab) => {
                const Icon = tab.icon;
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      'flex min-h-16 items-start gap-3 rounded-lg border px-3 py-3 text-left transition',
                      active
                        ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-50 shadow-[0_0_20px_rgba(0,255,255,0.08)]'
                        : 'border-white/10 bg-black/20 text-zinc-400 hover:border-white/20 hover:bg-white/[0.04] hover:text-white',
                    )}
                  >
                    <Icon size={16} className={cn('mt-0.5 shrink-0', active ? 'text-cyan-100' : 'text-zinc-500')} />
                    <span className="min-w-0">
                      <span className="block text-xs font-black uppercase tracking-[0.16em]">{tab.label}</span>
                      <span className="mt-1 block text-[11px] leading-snug text-zinc-500">{tab.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {activeTab === 'connection' ? (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-xl border border-white/10 bg-black/20 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-zinc-500">
                <CheckCircle2 size={13} className="text-emerald-300" />
                Server
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Bind</span>
                  <span className="font-mono text-zinc-100">{status?.bindHost || 'unknown'}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Port</span>
                  <span className="font-mono text-zinc-100">{status?.port || 8212}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-zinc-500">Remote</span>
                  <span className={status?.remoteEnabled ? 'text-emerald-200' : 'text-yellow-200'}>
                    {status?.remoteEnabled ? 'Listening' : 'Local only'}
                  </span>
                </div>
              </div>
            </div>

            <div
              className={cn(
                'rounded-xl border p-4',
                tailscaleReady ? 'border-emerald-300/25 bg-emerald-500/10' : 'border-red-400/30 bg-red-500/10',
              )}
            >
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                <ShieldCheck size={13} />
                Tailscale
              </div>
              <div className="text-2xl font-black text-white">{privateVpnConnectionCount}</div>
              <p className="mt-1 text-xs text-zinc-500">
                {tailscaleReady
                  ? 'One Tailscale connection path detected; HTTPS is preferred when enabled.'
                  : 'Start Tailscale on this host, then refresh.'}
              </p>
            </div>

            <div className="rounded-xl border border-yellow-300/20 bg-yellow-500/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-yellow-100">
                <ShieldAlert size={13} />
                Security
              </div>
              <div className="text-sm font-bold text-yellow-50">{authConfigured ? 'Password enabled' : 'Password not set'}</div>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {authConfigured
                  ? `Remote clients use the ${status?.auth?.username || 'Umbra Remote'} account at the remote sign-in screen.`
                  : 'Create a remote access account before using Umbra Remote from another device.'}
              </p>
              {authConfigured ? (
                <div className="mt-3 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-400">
                  Trusted devices: <span className="font-mono text-cyan-100">{status?.auth?.trustedDeviceCount || 0}</span>
                  {status?.auth?.device?.trusted ? (
                    <span className="ml-2 text-emerald-200">This browser is trusted as {status.auth.device.label || 'Remote Browser'}.</span>
                  ) : (
                    <span className="ml-2 text-zinc-500">Remote browsers are saved after login.</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
          ) : null}

          {activeTab === 'diagnostics' ? (
          <div className="rounded-xl border border-cyan-300/20 bg-black/20 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-cyan-100">
                  <Activity size={13} />
                  Remote Session Telemetry
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  Live client-side latency, interaction delay, resource transfer, and websocket traffic. Client metrics use the last {Math.round((telemetry?.recentWindowMs || 60_000) / 1000)} seconds so old startup stalls do not pollute the current read.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void refreshTelemetry()}
                className="inline-flex h-8 items-center gap-2 rounded border border-white/10 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>

            <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-2">
                {telemetryClients.length ? telemetryClients.map((client) => (
                  <div key={client.clientId} className="rounded-lg border border-white/10 bg-black/25 p-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black uppercase tracking-[0.16em] text-white">{client.clientLabel}</div>
                        <div className="truncate font-mono text-[10px] text-zinc-500">{client.mode} | {client.url || 'unknown'} | idle {Math.round((client.idleMs || 0) / 1000)}s</div>
                      </div>
                      <span className={cn(
                        'rounded border px-2 py-1 text-[10px] font-black uppercase tracking-widest',
                        (client.idleMs || 0) < 12_000 ? 'border-emerald-300/25 bg-emerald-500/10 text-emerald-100' : 'border-zinc-500/25 bg-zinc-500/10 text-zinc-400',
                      )}>
                        {client.live || (client.idleMs || 0) < 12_000 ? 'Live' : 'Idle'}
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-4">
                      <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Current Ping</div>
                        <div className={cn('mt-1 text-lg font-black', metricTone(client.lastRttMs ?? client.rttAvgMs, 90, 180))}>{client.lastRttMs ?? client.rttAvgMs ?? 0}ms</div>
                        <div className="text-[10px] text-zinc-600">avg {client.rttAvgMs || 0}ms | max {client.rttMaxMs || 0}ms</div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Recent Input</div>
                        <div className={cn('mt-1 text-lg font-black', metricTone(client.interactionAvgMs, 80, 160))}>{client.interactionAvgMs || 0}ms</div>
                        <div className="text-[10px] text-zinc-600">max {client.interactionMaxMs || 0}ms</div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Recent Transfers</div>
                        <div className="mt-1 text-lg font-black text-cyan-100">{formatBytes(client.resourceBytes || 0)}</div>
                        <div className="text-[10px] text-zinc-600">{client.resourceCount || 0} samples</div>
                      </div>
                      <div className="rounded border border-white/10 bg-black/30 px-3 py-2">
                        <div className="text-[9px] font-black uppercase tracking-[0.18em] text-zinc-500">Recent Long Tasks</div>
                        <div className={cn('mt-1 text-lg font-black', metricTone(client.longTaskTotalMs, 300, 1000))}>{client.longTaskCount || 0}</div>
                        <div className="text-[10px] text-zinc-600">{Math.round(client.longTaskTotalMs || 0)}ms total</div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-4 text-sm text-zinc-500">
                    No remote telemetry samples yet. Open Umbra from a remote browser and interact for a few seconds.
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">WebSockets</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(telemetry?.websocketClients || {}).map(([name, count]) => (
                      <div key={name} className="flex justify-between gap-2 rounded border border-white/10 bg-black/30 px-2 py-1">
                        <span className="text-zinc-500">{name}</span>
                        <span className="font-mono text-cyan-100">{count}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1">
                    {(telemetry?.websocketTraffic || []).slice(0, 5).map((entry) => (
                      <div key={entry.endpoint} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px]">
                        <div className="truncate font-mono text-zinc-300">{entry.endpoint}</div>
                        <div className="mt-0.5 text-zinc-600">
                          in {entry.messagesIn} / {formatBytes(entry.bytesIn)} | out {entry.messagesOut} / {formatBytes(entry.bytesOut)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                  <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-400">Recent Slow/Heavy Events</div>
                  <div className="max-h-48 space-y-1 overflow-y-auto custom-scrollbar">
                    {(telemetry?.recentEvents || []).slice(0, 12).map((event, index) => (
                      <div key={`${event.at || 0}-${index}`} className="rounded border border-white/10 bg-black/30 px-2 py-1 text-[10px]">
                        <div className="flex justify-between gap-2">
                          <span className="font-bold text-zinc-200">{event.type || 'event'}</span>
                          <span className="font-mono text-zinc-500">
                            {event.durationMs ? `${Math.round(event.durationMs)}ms` : ''}
                            {event.bytes ? ` ${formatBytes(event.bytes)}` : ''}
                          </span>
                        </div>
                        {event.path ? <div className="truncate font-mono text-zinc-600">{event.path}</div> : null}
                      </div>
                    ))}
                    {!(telemetry?.recentEvents || []).length ? (
                      <div className="rounded border border-white/10 bg-black/30 px-2 py-3 text-xs text-zinc-600">No events yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          ) : null}

          {activeTab === 'connection' ? (
          <form onSubmit={saveRemoteSettings} className="rounded-xl border border-cyan-300/20 bg-black/20 p-4">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Connection Settings</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Saved at {status?.settings?.storagePath || 'User/Config/UmbraRemote/settings.json'}.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {status?.settings?.pendingRestart ? (
                  <span className="rounded border border-yellow-300/30 bg-yellow-500/10 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-yellow-100">
                    Restart Required
                  </span>
                ) : null}
                <button
                  type="submit"
                  disabled={settingsSaving}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-500/15 px-3 text-xs font-black uppercase tracking-[0.18em] text-cyan-50 hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  Save Settings
                </button>
              </div>
            </div>

            <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_0.5fr]">
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Bind Address</span>
                <select
                  value={bindHost}
                  onChange={(event) => setBindHost(event.target.value)}
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-300/45"
                >
                  <option value="127.0.0.1">Local only - 127.0.0.1</option>
                  <option value="0.0.0.0">All IPv4 interfaces - 0.0.0.0</option>
                  <option value="::">All IPv6 interfaces - ::</option>
                </select>
                <span className="mt-1 block text-xs text-zinc-600">Listener changes apply after restart. Current: {status?.settings?.active?.bindHost || status?.bindHost || 'unknown'}.</span>
              </label>
              <label className="block">
                <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Port</span>
                <input
                  value={port}
                  onChange={(event) => setPort(event.target.value.replace(/[^\d]/g, '').slice(0, 5))}
                  className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 font-mono text-sm text-white outline-none focus:border-cyan-300/45"
                />
                <span className="mt-1 block text-xs text-zinc-600">Current: {status?.settings?.active?.port || status?.port || 8212}.</span>
              </label>
            </div>

            <div className="mb-4 rounded-lg border border-emerald-300/20 bg-emerald-500/5 p-3">
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-100">HTTPS Front Door</h4>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Use Tailscale Serve for HTTPS inside your tailnet, forwarding to Umbra at http://127.0.0.1:{status?.port || 8212}.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={runTailscaleServe}
                    disabled={tailscaleServeRunning}
                    className="inline-flex h-8 items-center rounded border border-emerald-300/25 bg-emerald-500/10 px-2 text-[10px] font-black uppercase tracking-widest text-emerald-100 hover:bg-emerald-500/15 disabled:opacity-60"
                  >
                    {tailscaleServeRunning ? 'Running' : 'Enable'}
                  </button>
                  <button
                    type="button"
                    onClick={copyTailscaleServeCommand}
                    className="inline-flex h-8 items-center rounded border border-white/10 px-2 text-[10px] font-black uppercase tracking-widest text-zinc-300 hover:bg-white/5 hover:text-white"
                  >
                    Copy Cmd
                  </button>
                </div>
              </div>
              <div className="grid gap-3 lg:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Tailscale HTTPS URL</span>
                  <input
                    value={tailscaleHttpsUrl}
                    onChange={(event) => setTailscaleHttpsUrl(event.target.value)}
                    placeholder={status?.tailscaleDnsName ? `https://${status.tailscaleDnsName}` : 'https://machine.tailnet.ts.net'}
                    className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 font-mono text-sm text-white outline-none focus:border-emerald-300/45"
                  />
                <span className="mt-1 block text-xs text-zinc-600">Requires Tailscale Serve or another TLS listener on the MagicDNS name.</span>
              </label>
              <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Tailscale Serve</div>
                <div className="mt-1 truncate font-mono text-xs text-emerald-100">{status?.tailscaleServeCommand || `tailscale serve --bg http://127.0.0.1:${status?.port || 8212}`}</div>
                <div className="mt-1 text-xs text-zinc-600">
                  {status?.tailscaleServeEnabled
                    ? 'Active. Auto can use the HTTPS MagicDNS URL.'
                    : tailscaleHttpsSuggested
                      ? 'Not active yet. Auto will use the Tailscale IP fallback until Serve is enabled.'
                      : 'Run once on the host to expose Umbra as HTTPS inside your tailnet.'}
                </div>
              </div>
            </div>
              {tailscaleServeNotice ? (
                <div className="mt-3 rounded-lg border border-yellow-300/25 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-50">
                  <div className="font-bold">{tailscaleServeNotice.message || 'Tailscale Serve needs attention.'}</div>
                  {tailscaleServeNotice.details ? <div className="mt-1 text-xs text-yellow-100/80">{tailscaleServeNotice.details}</div> : null}
                  {tailscaleServeNotice.enableUrl ? (
                    <button
                      type="button"
                      onClick={() => window.open(tailscaleServeNotice.enableUrl, '_blank', 'noopener,noreferrer')}
                      className="mt-2 inline-flex h-8 items-center gap-2 rounded border border-yellow-300/30 bg-yellow-500/10 px-2 text-xs font-black uppercase tracking-widest text-yellow-50 hover:bg-yellow-500/15"
                    >
                      <ExternalLink size={13} />
                      Open Tailscale Approval
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-xs leading-relaxed text-emerald-100">
              Umbra Remote now uses Tailscale only. Non-tailnet connection settings are not exposed here.
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_260px]">
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 px-3 py-3 text-sm leading-relaxed text-emerald-50">
                Remote access is limited to loopback on the host and Tailscale clients. Tailscale Serve is the recommended HTTPS path.
              </div>
              <div className="space-y-3 rounded-lg border border-white/10 bg-black/25 p-3">
                <label className="flex items-start gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={preferHttps}
                    onChange={(event) => setPreferHttps(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-bold text-zinc-100">Prefer HTTPS URLs</span>
                    <span className="text-xs text-zinc-600">Prefer Tailscale Serve HTTPS before raw tailnet IP URLs.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={hideHttpWhenHttpsAvailable}
                    onChange={(event) => setHideHttpWhenHttpsAvailable(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-bold text-zinc-100">Hide HTTP when HTTPS is ready</span>
                    <span className="text-xs text-zinc-600">Stop showing or copying raw HTTP remote URLs once an HTTPS front door is available.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={requireRemoteAuth}
                    onChange={(event) => setRequireRemoteAuth(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-bold text-zinc-100">Require Umbra login remotely</span>
                    <span className="text-xs text-zinc-600">Keep enabled unless another authenticated gateway protects Umbra.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={syncUiAcrossDevices}
                    onChange={(event) => setAppSetting('remote.syncUiAcrossDevices', event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-bold text-zinc-100">Sync UI across devices</span>
                    <span className="text-xs text-zinc-600">Remote clients follow the same app, gallery folder, and Power Prompter file through the host session.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm text-zinc-300">
                  <input
                    type="checkbox"
                    checked={remoteViewerOriginals}
                    onChange={(event) => setAppSetting('remote.galleryViewerOriginals', event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block font-bold text-zinc-100">Load original images in remote viewer</span>
                    <span className="text-xs text-zinc-600">Use source files in the media viewer instead of compressed WebP previews. Downloads always use originals.</span>
                  </span>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Session Days</span>
                  <input
                    value={sessionTtlDays}
                    onChange={(event) => setSessionTtlDays(event.target.value.replace(/[^\d]/g, '').slice(0, 2))}
                    className="h-9 w-full rounded-lg border border-white/10 bg-black/40 px-3 font-mono text-sm text-white outline-none focus:border-cyan-300/45"
                  />
                </label>
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm">
              <span className="text-zinc-500">Selected URL</span>
              <span className="ml-2 font-mono text-cyan-100">{status?.selectedUrl || 'None yet'}</span>
            </div>
          </form>
          ) : null}

          {activeTab === 'security' ? (
          <div
            className={cn(
              'rounded-xl border bg-black/20 p-4',
              authConfigured ? 'border-emerald-300/20' : 'border-yellow-300/25',
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Remote Access Account</h3>
                <p className="mt-1 text-xs text-zinc-500">
                  Creates the username and password remote clients enter at the Umbra Remote sign-in screen.
                </p>
                <p className="mt-1 text-[11px] text-zinc-600">
                  Stored locally at {status?.auth?.storagePath || 'User/Config/UmbraRemote/auth.json'}.
                </p>
              </div>
              {authConfigured && authEditable ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={editingAuthCredentials ? cancelEditingRemoteCredentials : startEditingRemoteCredentials}
                    disabled={authSaving}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-cyan-300/25 px-2 text-xs text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-60"
                  >
                    <Edit3 size={13} />
                    {editingAuthCredentials ? 'Cancel Edit' : 'Change Account'}
                  </button>
                  <button
                    type="button"
                    onClick={logoutRemoteSessions}
                    disabled={authSaving}
                    className="inline-flex h-8 items-center gap-2 rounded-lg border border-white/10 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white disabled:opacity-60"
                  >
                    <LogOut size={13} />
                    Clear This Session
                  </button>
                </div>
              ) : null}
            </div>

            {!authEditable ? (
              <div className="mb-3 rounded-lg border border-yellow-300/25 bg-yellow-500/10 px-3 py-2 text-xs leading-relaxed text-yellow-50">
                Account setup is host-only. Open Umbra Remote from <span className="font-mono text-yellow-100">http://127.0.0.1:8212</span> on the main PC to change these credentials.
              </div>
            ) : null}

            {authEditable && (!authConfigured || editingAuthCredentials) ? (
              <form onSubmit={saveRemoteCredentials} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Username</span>
                  <input
                    value={authUsername}
                    onChange={(event) => setAuthUsername(event.target.value)}
                    className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-300/45"
                    autoComplete="username"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Password</span>
                  <input
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    type="password"
                    className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-300/45"
                    autoComplete="new-password"
                  />
                </label>
                <button
                  type="submit"
                  disabled={authSaving}
                  className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-500/15 px-4 text-xs font-black uppercase tracking-[0.18em] text-cyan-50 hover:bg-cyan-500/20 disabled:opacity-60"
                >
                  {editingAuthCredentials ? 'Update Account' : 'Save Account'}
                </button>
              </form>
            ) : (
              <div className="rounded-lg border border-emerald-300/20 bg-emerald-500/10 p-3 text-sm text-emerald-50">
                <div>
                  Remote access account is configured for {status?.auth?.username || 'this host'}. Remote browsers can sign in normally, or use a short-lived pair link from this host.
                </div>
                {authEditable ? (
                  <button
                    type="button"
                    onClick={copyPairLink}
                    disabled={pairLinkSaving}
                    className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-3 text-xs font-black uppercase tracking-[0.16em] text-emerald-50 hover:bg-emerald-500/20 disabled:opacity-60"
                  >
                    <Copy size={13} />
                    {pairLinkSaving ? 'Creating Pair Link...' : 'Copy Pair Link'}
                  </button>
                ) : null}
              </div>
            )}
            {authConfigured ? (
              <div className="mt-4 rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300">Trusted Devices</h4>
                    <p className="mt-1 text-xs text-zinc-600">Rename or revoke saved remote browsers.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refreshDevices()}
                    className="inline-flex h-8 items-center gap-2 rounded border border-white/10 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
                  >
                    <RefreshCw size={12} className={devicesLoading ? 'animate-spin' : ''} />
                    Refresh
                  </button>
                </div>
                <div className="space-y-2">
                  {devices.map((device) => (
                    <div key={device.id} className="grid gap-2 rounded-lg border border-white/10 bg-black/30 p-2 lg:grid-cols-[1fr_auto]">
                      <div className="min-w-0">
                        <input
                          value={deviceLabels[device.id] || ''}
                          onChange={(event) => setDeviceLabels((current) => ({ ...current, [device.id]: event.target.value }))}
                          className="h-8 w-full rounded border border-white/10 bg-black/40 px-2 text-sm text-white outline-none focus:border-cyan-300/45"
                        />
                        <div className="mt-1 truncate text-[10px] text-zinc-600">
                          {device.remoteAddress || 'remote'} | {new Date(device.lastAuthenticatedAt || device.lastSeenAt || device.createdAt).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void renameDevice(device)}
                          className="flex h-8 w-8 items-center justify-center rounded border border-cyan-300/25 text-cyan-100 hover:bg-cyan-500/10"
                          title="Rename device"
                          aria-label="Rename device"
                        >
                          <Edit3 size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void revokeDevice(device)}
                          className="flex h-8 w-8 items-center justify-center rounded border border-red-300/25 text-red-100 hover:bg-red-500/10"
                          title="Revoke device"
                          aria-label="Revoke device"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {!devices.length ? (
                    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-3 text-sm text-zinc-500">
                      No trusted remote devices yet. The next successful remote login will create one.
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
          ) : null}

          {activeTab === 'connection' ? (
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Remote URLs</h3>
              <p className="mt-1 text-xs text-zinc-500">
                Use these from another device signed into your Tailscale tailnet.
              </p>
              {status?.httpUrlsHidden ? (
                <p className="mt-1 text-xs text-emerald-200">
                  HTTPS is ready, so {status.hiddenHttpUrls?.length || 'raw'} HTTP remote URL{(status.hiddenHttpUrls?.length || 0) === 1 ? '' : 's'} are hidden from copy/QR.
                </p>
              ) : null}
            </div>
            {error ? (
              <div className="mb-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">{error}</div>
            ) : null}
            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="space-y-2">
                {remoteUrls.map((url) => (
                  <UrlRow key={url} url={url} primary testResult={urlTests[url]} onTest={testRemoteUrl} />
                ))}
                {!remoteUrls.length && !loading ? (
                  <div className="rounded-lg border border-yellow-400/30 bg-yellow-500/10 px-3 py-4 text-sm text-yellow-100">
                    No Tailscale URL detected. Confirm Tailscale is running, enable Tailscale Serve or bind Umbra to a tailnet-reachable interface, then refresh this panel.
                  </div>
                ) : null}
              </div>
              <div className="rounded-lg border border-white/10 bg-black/25 p-3">
                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Selected URL QR</div>
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="Selected remote URL QR code" className="mx-auto h-44 w-44 rounded border border-white/10 bg-black" />
                ) : (
                  <div className="flex h-44 items-center justify-center rounded border border-white/10 text-xs text-zinc-600">No URL</div>
                )}
                <div className="mt-2 break-all font-mono text-[10px] text-cyan-100">{status?.selectedUrl || 'None'}</div>
              </div>
            </div>
          </div>
          ) : null}

          {activeTab === 'guide' ? (
          <>
          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Tailscale Path</h3>
              <p className="mt-1 text-xs text-zinc-500">Umbra Remote stays on your private tailnet. Tailscale Serve is the preferred HTTPS front door.</p>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {[
                ['Tailscale Serve', 'HTTPS MagicDNS URL inside your tailnet, forwarding to Umbra on localhost.'],
                ['Tailnet IP', 'Raw 100.x tailnet URL when Umbra is bound to a reachable interface.'],
              ].map(([title, description]) => (
              <div key={title} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                <div className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-300">{title}</div>
                <div className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</div>
              </div>
            ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="mb-3">
              <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Local URLs</h3>
              <p className="mt-1 text-xs text-zinc-500">Useful on this host while configuring Remote.</p>
            </div>
            <div className="space-y-2">
              {localTestingUrls.map((url) => (
                <UrlRow key={url} url={url} primary={url === currentUrl} testResult={urlTests[url]} onTest={testRemoteUrl} />
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-4">
            <h3 className="text-xs font-black uppercase tracking-[0.18em] text-white">Remote Mode Checklist</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {[
                'Tailscale is required for Umbra Remote access.',
                'Remote clients must sign in with the Umbra Remote username and password.',
                'Tailscale Serve gives you an HTTPS MagicDNS URL inside your tailnet.',
                'Non-tailnet clients are not part of this Remote setup.',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-zinc-300">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
          </>
          ) : null}
        </div>
      </main>
    </section>
  );
}

export default UmbraRemoteWorkspace;
