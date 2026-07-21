export function isUmbraHostBrowser(): boolean {
  if (typeof window === 'undefined') return true;
  const host = String(window.location.hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

export function getUmbraRemoteMode(): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  return document.documentElement.dataset.umbraRemoteMode
    || new URLSearchParams(window.location.search).get('remoteMode')
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
