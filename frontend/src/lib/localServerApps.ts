import { readUserConfig, writeUserConfig } from '@/lib/userConfig';
import { isUmbraRemoteClient } from '@/utils/hostOnly';

export interface LocalServerApp {
  id: string;
  name: string;
  url: string;
  folderPath?: string;
  createdAt: number;
  updatedAt: number;
  order: number;
}

export type LocalServerHealth = 'unknown' | 'online' | 'offline';

const LOCAL_SERVER_APPS_CONFIG_KEY = 'local-server-apps' as const;
const MAX_LOCAL_SERVER_APPS = 48;
const MAX_NAME_LENGTH = 48;
const MAX_URL_LENGTH = 512;
const MAX_FOLDER_PATH_LENGTH = 1024;

function createLocalServerId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `local-server-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || (a === 100 && b >= 64 && b <= 127)
    || a === 127;
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;
  if (host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:')) return true;
  if (host.endsWith('.local')) return true;
  if (isPrivateIpv4(host)) return true;
  if (/^[a-z0-9-]+$/i.test(host) && !host.includes('.')) return true;
  return false;
}

export function validateLocalServerUrl(rawUrl: string): { ok: true; url: string } | { ok: false; error: string } {
  const value = String(rawUrl || '').trim();
  if (!value) return { ok: false, error: 'Enter a local server URL.' };
  if (value.length > MAX_URL_LENGTH) return { ok: false, error: 'Local server URL is too long.' };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: 'Use a full URL like http://127.0.0.1:3000.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Local server apps require http:// or https:// URLs.' };
  }
  if (!isLocalHostname(parsed.hostname)) {
    return { ok: false, error: 'Only localhost, private LAN, and .local URLs are allowed.' };
  }
  parsed.hash = '';
  return { ok: true, url: parsed.toString() };
}

export function normalizeLocalServerFolderPath(rawPath: unknown): string {
  const value = String(rawPath || '').trim();
  if (!value) return '';
  return value.slice(0, MAX_FOLDER_PATH_LENGTH);
}

export function normalizeLocalServerApps(rawValue: unknown): LocalServerApp[] {
  const rawList = Array.isArray(rawValue)
    ? rawValue
    : Array.isArray((rawValue as any)?.apps)
      ? (rawValue as any).apps
      : [];
  const seen = new Set<string>();
  const now = Date.now();
  return rawList
    .map((raw, index) => {
      const item = raw as Partial<LocalServerApp> | null | undefined;
      if (!item || typeof item !== 'object') return null;
      const validated = validateLocalServerUrl(String(item.url || ''));
      if (!validated.ok) return null;
      const id = String(item.id || '').trim() || createLocalServerId();
      if (seen.has(id)) return null;
      seen.add(id);
      const name = String(item.name || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
        || new URL(validated.url).host;
      const folderPath = normalizeLocalServerFolderPath((item as any).folderPath);
      const createdAt = Math.max(0, Math.floor(Number(item.createdAt) || now));
      const updatedAt = Math.max(createdAt, Math.floor(Number(item.updatedAt) || createdAt));
      const order = Number.isFinite(Number(item.order)) ? Math.floor(Number(item.order)) : index;
      const normalized: LocalServerApp = {
        id,
        name,
        url: validated.url,
        createdAt,
        updatedAt,
        order,
      };
      if (folderPath) normalized.folderPath = folderPath;
      return normalized;
    })
    .filter((entry): entry is LocalServerApp => !!entry)
    .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
    .slice(0, MAX_LOCAL_SERVER_APPS)
    .map((entry, index) => ({ ...entry, order: index }));
}

export async function loadLocalServerApps(): Promise<LocalServerApp[]> {
  const value = await readUserConfig<unknown>(LOCAL_SERVER_APPS_CONFIG_KEY, []);
  return normalizeLocalServerApps(value);
}

export async function saveLocalServerApps(apps: LocalServerApp[]): Promise<LocalServerApp[]> {
  const normalized = normalizeLocalServerApps(apps);
  await writeUserConfig(LOCAL_SERVER_APPS_CONFIG_KEY, normalized);
  window.dispatchEvent(new CustomEvent('umbra:local-server-apps-changed', { detail: { apps: normalized } }));
  return normalized;
}

export function buildLocalServerApp(input: { name: string; url: string; folderPath?: string }, existing?: LocalServerApp): LocalServerApp {
  const validated = validateLocalServerUrl(input.url);
  if (!validated.ok) throw new Error(validated.error);
  const now = Date.now();
  const name = String(input.name || '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH)
    || new URL(validated.url).host;
  const folderPath = normalizeLocalServerFolderPath(input.folderPath);
  const app: LocalServerApp = {
    id: existing?.id || createLocalServerId(),
    name,
    url: validated.url,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    order: existing?.order ?? 0,
  };
  if (folderPath) app.folderPath = folderPath;
  return app;
}

function base64UrlEncode(value: string): string {
  const encoded = btoa(value);
  return encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function getLocalServerProxyUrl(rawUrl: string): string | null {
  const validated = validateLocalServerUrl(rawUrl);
  if (!validated.ok) return null;
  const parsed = new URL(validated.url);
  const originToken = base64UrlEncode(parsed.origin);
  return `/api/local-server-proxy/${originToken}${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function getLocalServerFrameUrl(rawUrl: string, useHostProxy = isUmbraRemoteClient()): string {
  const validated = validateLocalServerUrl(rawUrl);
  if (!validated.ok) return rawUrl;
  if (!useHostProxy) return validated.url;
  return getLocalServerProxyUrl(validated.url) || validated.url;
}

export async function probeLocalServerUrl(url: string, timeoutMs = 3500, useHostProxy = isUmbraRemoteClient()): Promise<LocalServerHealth> {
  const validated = validateLocalServerUrl(url);
  if (!validated.ok) return 'offline';
  if (useHostProxy) {
    try {
      const response = await fetch(`/api/local-server-proxy/health?url=${encodeURIComponent(validated.url)}`, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) return 'offline';
      const payload = await response.json().catch(() => null);
      return payload?.online === true ? 'online' : 'offline';
    } catch {
      return 'offline';
    }
  }
  const attempt = async (method: 'HEAD' | 'GET') => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      await fetch(validated.url, {
        method,
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal,
      });
      return 'online';
    } finally {
      window.clearTimeout(timer);
    }
  };
  try {
    return await attempt('HEAD');
  } catch {
    try {
      return await attempt('GET');
    } catch {
      return 'offline';
    }
  }
}

export async function openLocalServerAppFolder(path: string): Promise<{ success: boolean; fullPath?: string }> {
  const folderPath = normalizeLocalServerFolderPath(path);
  if (!folderPath) throw new Error('No app folder is set for this local server.');
  const response = await fetch('/api/local-server-apps/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: folderPath }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success === false) {
    throw new Error(String(payload?.error || `Failed to open app folder (${response.status})`));
  }
  return payload;
}
