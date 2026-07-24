export type UmbraRemoteClientMode = 'desktop' | 'tablet' | 'phone';

const UMBRA_REMOTE_MODE_STORAGE_KEY = 'umbra.remote.clientMode';

export function normalizeUmbraRemoteMode(value: unknown): UmbraRemoteClientMode | null {
  return value === 'desktop' || value === 'tablet' || value === 'phone' ? value : null;
}

export function readUmbraRemoteModeFromUrl(): UmbraRemoteClientMode | null {
  if (typeof window === 'undefined') return null;
  return normalizeUmbraRemoteMode(new URLSearchParams(window.location.search).get('remoteMode'));
}

export function getPreferredUmbraRemoteMode(): UmbraRemoteClientMode {
  if (typeof window === 'undefined') return 'desktop';
  const urlMode = readUmbraRemoteModeFromUrl();
  if (urlMode) return urlMode;
  try {
    const storedMode = normalizeUmbraRemoteMode(window.localStorage.getItem(UMBRA_REMOTE_MODE_STORAGE_KEY));
    if (storedMode) return storedMode;
  } catch {
    // Storage can be unavailable in hardened browser contexts.
  }
  const width = window.innerWidth || 0;
  if (width > 0 && width < 680) return 'phone';
  if (width > 0 && width < 1100) return 'tablet';
  return 'desktop';
}

export function applyUmbraRemoteMode(
  mode: UmbraRemoteClientMode,
  options: { persist?: boolean; updateUrl?: boolean } = {},
): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const { persist = true, updateUrl = true } = options;
  if (persist) {
    try {
      window.localStorage.setItem(UMBRA_REMOTE_MODE_STORAGE_KEY, mode);
    } catch {
      // The live document still receives the selected mode.
    }
  }
  if (updateUrl) {
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set('remoteMode', mode);
    window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }
  document.documentElement.dataset.umbraRemoteMode = mode;
  window.dispatchEvent(new CustomEvent('umbra:remote-mode-change', { detail: { mode } }));
}

export function isUmbraHostBrowser(): boolean {
  if (typeof window === 'undefined') return true;
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function getUmbraRemoteMode(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  return document.documentElement.dataset.umbraRemoteMode
    || readUmbraRemoteModeFromUrl()
    || '';
}

export function isUmbraRemoteClient(): boolean {
  if (typeof window === 'undefined') return false;
  const isHostBrowser = isUmbraHostBrowser();
  if (typeof document !== 'undefined') {
    const flag = document.documentElement.dataset.umbraRemoteClient;
    if (flag === '1') return true;
    if (flag === '0') return !isHostBrowser;
  }
  return !isHostBrowser;
}

export function assertUmbraHostOnlyAction(action = 'This action'): void {
  if (isUmbraRemoteClient()) {
    throw new Error(`${action} is only available from the host PC.`);
  }
}
