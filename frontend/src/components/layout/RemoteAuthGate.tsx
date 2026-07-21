'use client';

import React from 'react';
import { Eye, EyeOff, Laptop, LockKeyhole, LogIn, Monitor, RefreshCw, ShieldAlert, Smartphone, Tablet } from 'lucide-react';

type RemoteAuthStatus = {
  ok?: boolean;
  remote?: boolean;
  authRequired?: boolean;
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

type RemoteClientMode = 'desktop' | 'tablet' | 'phone';

function readForcedRemoteMode(): RemoteClientMode | null {
  if (typeof window === 'undefined') return null;
  const rawMode = new URLSearchParams(window.location.search).get('remoteMode');
  if (rawMode === 'desktop' || rawMode === 'tablet' || rawMode === 'phone') return rawMode;
  return null;
}

function getPreferredRemoteMode(): RemoteClientMode {
  if (typeof window === 'undefined') return 'desktop';
  const forcedMode = readForcedRemoteMode();
  if (forcedMode) return forcedMode;
  const width = window.innerWidth || 0;
  if (width > 0 && width < 680) return 'phone';
  if (width > 0 && width < 1100) return 'tablet';
  return 'desktop';
}

function getModeIcon(mode: RemoteClientMode) {
  if (mode === 'phone') return Smartphone;
  if (mode === 'tablet') return Tablet;
  return Laptop;
}

function publishRemoteClientState(remote: unknown) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const isRemote = remote === true;
  document.documentElement.dataset.umbraRemoteClient = isRemote ? '1' : '0';
  window.dispatchEvent(new CustomEvent('umbra:remote-client-change', { detail: { remote: isRemote } }));
}

function RemoteAuthGateImpl({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<RemoteAuthStatus | null>(null);
  const [remoteMode, setRemoteMode] = React.useState<RemoteClientMode>(() => getPreferredRemoteMode());
  const [forcedRemoteMode, setForcedRemoteMode] = React.useState<RemoteClientMode | null>(() => readForcedRemoteMode());
  const [entryReady, setEntryReady] = React.useState(false);
  const [username, setUsername] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const usernameEditedRef = React.useRef(false);
  const configuredUsernameRef = React.useRef('');

  const deviceLabel = React.useMemo(() => {
    if (typeof navigator === 'undefined') return 'Remote Browser';
    const platform = navigator.platform || '';
    const userAgent = navigator.userAgent || '';
    if (/iphone/i.test(userAgent)) return 'iPhone';
    if (/ipad/i.test(userAgent)) return 'iPad';
    if (/android/i.test(userAgent)) return 'Android Device';
    if (/win/i.test(platform)) return 'Windows Browser';
    if (/mac/i.test(platform)) return 'Mac Browser';
    if (/linux/i.test(platform)) return 'Linux Browser';
    return 'Remote Browser';
  }, []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/remote/auth/status', { cache: 'no-store', credentials: 'include' });
      const payload = await response.json().catch(() => ({} as RemoteAuthStatus & { error?: string }));
      if (!response.ok) throw new Error(String(payload?.error || 'Remote auth status failed'));
      publishRemoteClientState(payload?.remote);
      setStatus(payload);
      const configuredUsername = String(payload?.username || '').trim();
      if (configuredUsername && configuredUsername !== configuredUsernameRef.current) {
        configuredUsernameRef.current = configuredUsername;
        usernameEditedRef.current = false;
        setUsername(configuredUsername);
      } else if (configuredUsername && !usernameEditedRef.current) {
        setUsername(configuredUsername);
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Remote auth status failed');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncForcedMode = () => {
      const nextForcedMode = readForcedRemoteMode();
      setForcedRemoteMode(nextForcedMode);
      if (nextForcedMode) setRemoteMode(nextForcedMode);
    };
    syncForcedMode();
    window.addEventListener('popstate', syncForcedMode);
    return () => window.removeEventListener('popstate', syncForcedMode);
  }, []);

  React.useEffect(() => {
    if (!status?.remote) {
      setEntryReady(true);
    }
  }, [status?.remote, status?.authenticated]);

  React.useEffect(() => {
    if (status) publishRemoteClientState(status.remote);
    if (typeof document === 'undefined') return;
    if (!status?.remote && !forcedRemoteMode) {
      delete document.documentElement.dataset.umbraRemoteMode;
      window.dispatchEvent(new CustomEvent('umbra:remote-mode-change', { detail: { mode: 'desktop' } }));
      return;
    }
    const nextMode = forcedRemoteMode || remoteMode;
    document.documentElement.dataset.umbraRemoteMode = nextMode;
    window.dispatchEvent(new CustomEvent('umbra:remote-mode-change', { detail: { mode: nextMode } }));
  }, [forcedRemoteMode, remoteMode, status?.remote]);

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/remote/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, deviceLabel }),
      });
      const payload = await response.json().catch(() => ({} as { error?: string; username?: string; reason?: string; passwordLength?: number }));
      if (!response.ok) {
        const configuredUsername = String(payload?.username || '').trim();
        if (configuredUsername && configuredUsername !== username) {
          configuredUsernameRef.current = configuredUsername;
          usernameEditedRef.current = false;
          setUsername(configuredUsername);
        }
        const reason = String(payload?.reason || '').trim();
        const passwordLength = Number.isFinite(Number(payload?.passwordLength)) ? Number(payload.passwordLength) : password.length;
        const detail = reason
          ? ` (${reason.replace(/_/g, ' ')}, password length ${passwordLength})`
          : '';
        throw new Error(`${String(payload?.error || 'Login failed')}${detail}`);
      }
      setPassword('');
      await refresh();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  const continueToApp = () => {
    setEntryReady(true);
  };

  if (loading && !status) {
    return <div className="h-screen w-screen bg-[#050508]" />;
  }

  if (!status?.remote || status.authRequired === false) {
    return <>{children}</>;
  }

  if (status.authenticated && entryReady) {
    return <>{children}</>;
  }

  const isAuthenticated = Boolean(status.authenticated);
  const modeOptions: Array<{ id: RemoteClientMode; label: string; description: string }> = [
    { id: 'desktop', label: 'Desktop/Laptop', description: 'Full workspace density' },
    { id: 'tablet', label: 'Tablet', description: 'Touch-friendly panels' },
    { id: 'phone', label: 'Phone', description: 'Compact remote control' },
  ];
  const ModeIcon = getModeIcon(remoteMode);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-[#050508] px-4 text-zinc-100">
      <div className="w-full max-w-xl rounded-xl border border-white/10 bg-black/45 p-5 shadow-2xl shadow-cyan-950/30">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-300/35 bg-cyan-500/10 text-cyan-100">
            {isAuthenticated ? <ModeIcon size={18} /> : status.configured ? <LockKeyhole size={18} /> : <ShieldAlert size={18} />}
          </div>
          <div>
            <h1 className="text-sm font-black uppercase tracking-[0.2em] text-white">Umbra Remote</h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              {isAuthenticated ? `Signed in as ${status.username || 'remote user'}` : 'Private access requires host credentials'}
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {modeOptions.map((option) => {
            const Icon = getModeIcon(option.id);
            const selected = remoteMode === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setRemoteMode(option.id)}
                className={[
                  'flex min-h-[74px] flex-col items-start justify-between rounded-lg border px-3 py-2 text-left transition',
                  selected
                    ? 'border-cyan-300/45 bg-cyan-500/15 text-cyan-50'
                    : 'border-white/10 bg-black/25 text-zinc-300 hover:border-white/20 hover:bg-white/5',
                ].join(' ')}
              >
                <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em]">
                  <Icon size={14} />
                  {option.label}
                </span>
                <span className="text-[11px] leading-snug text-zinc-500">{option.description}</span>
              </button>
            );
          })}
        </div>

        {!status.configured ? (
          <div className="rounded-lg border border-yellow-300/25 bg-yellow-500/10 p-3 text-sm leading-relaxed text-yellow-50">
            A remote access account has not been configured yet. Open Umbra Remote on the host machine at localhost and create a username/password first.
          </div>
        ) : isAuthenticated ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-emerald-300/25 bg-emerald-500/10 p-3 text-sm leading-relaxed text-emerald-50">
              Remote session restored for {status.device?.label || deviceLabel}. Umbra will use {remoteMode === 'desktop' ? 'Desktop/Laptop' : remoteMode === 'tablet' ? 'Tablet' : 'Phone'} Mode for this connection.
            </div>
            <button
              type="button"
              onClick={continueToApp}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/15 text-xs font-black uppercase tracking-[0.18em] text-cyan-50 hover:bg-cyan-500/20"
            >
              <Monitor size={14} />
              Continue
            </button>
          </div>
        ) : (
          <form onSubmit={login} className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Username</span>
              <input
                value={username}
                onChange={(event) => {
                  usernameEditedRef.current = true;
                  setUsername(event.target.value);
                }}
                className="h-10 w-full rounded-lg border border-white/10 bg-black/40 px-3 text-sm text-white outline-none focus:border-cyan-300/45"
                autoComplete="username"
              />
              {status.username ? (
                <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-zinc-600">
                  <span>Configured account: <span className="font-mono text-cyan-100">{status.username}</span></span>
                  {username !== status.username ? (
                    <button
                      type="button"
                      onClick={() => {
                        usernameEditedRef.current = false;
                        setUsername(status.username || '');
                      }}
                      className="shrink-0 rounded border border-cyan-300/25 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-cyan-100 hover:bg-cyan-500/10"
                    >
                      Use It
                    </button>
                  ) : null}
                </span>
              ) : null}
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">Password</span>
              <div className="flex rounded-lg border border-white/10 bg-black/40 focus-within:border-cyan-300/45">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? 'text' : 'password'}
                  className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm text-white outline-none"
                  autoComplete="current-password"
                  spellCheck={false}
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center text-zinc-500 hover:text-white"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            {error ? (
              <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-500/15 text-xs font-black uppercase tracking-[0.18em] text-cyan-50 hover:bg-cyan-500/20 disabled:opacity-60"
            >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <LogIn size={14} />}
              Sign In
            </button>
            <div className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs leading-relaxed text-zinc-500">
              Signing in registers this browser as a trusted Umbra Remote device for reverse proxy and private network connections.
            </div>
          </form>
        )}

        {error && !status.configured ? (
          <div className="mt-3 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</div>
        ) : null}
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 inline-flex h-8 items-center gap-2 rounded border border-white/10 px-2 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
    </div>
  );
}

export function RemoteAuthGate({ children }: { children: React.ReactNode }) {
  return <RemoteAuthGateImpl>{children}</RemoteAuthGateImpl>;
}

export default RemoteAuthGate;
