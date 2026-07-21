import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric;
}

function isDesktopMediaProtocolAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window as any)?.umbraDesktop?.platform;
}

export function isUmbraMediaUrl(rawValue: unknown): boolean {
  return String(rawValue || '').trim().toLowerCase().startsWith('umbra-media://');
}

const VIDEO_MEDIA_EXT_PATTERN = /\.(mp4|webm|mov|avi|mkv|m4v|flv|wmv)(?:[?#].*)?$/i;
const GIF_MEDIA_EXT_PATTERN = /\.gif(?:[?#].*)?$/i;

function shouldPreferServerMediaPath(path: string): boolean {
  const normalized = String(path || '').trim().toLowerCase();
  if (!normalized) return false;
  return VIDEO_MEDIA_EXT_PATTERN.test(normalized) || GIF_MEDIA_EXT_PATTERN.test(normalized);
}

export function buildMediaRevisionToken(modified?: unknown, size?: unknown): string {
  const modifiedMs = toFiniteNumber(modified);
  const sizeBytes = toFiniteNumber(size);
  const parts: string[] = [];

  if (modifiedMs !== null && modifiedMs > 0) {
    parts.push(`m${Math.floor(modifiedMs)}`);
  }
  if (sizeBytes !== null && sizeBytes >= 0) {
    parts.push(`s${Math.floor(sizeBytes)}`);
  }

  return parts.join('-');
}

export function buildFsImageUrl(
  path: string,
  revision?: string,
  options?: {
    preferServer?: boolean;
  }
): string {
  const encodedPath = encodeURIComponent(String(path || ''));
  const forceServer = options?.preferServer === true || shouldPreferServerMediaPath(path);
  const useDesktopProtocol = isDesktopMediaProtocolAvailable() && !forceServer;
  const base = useDesktopProtocol
    ? `umbra-media://image?path=${encodedPath}`
    : `/api/fs/image?path=${encodedPath}`;
  const rev = String(revision || '').trim();
  return rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
}

export function buildFsServerImageUrl(
  path: string,
  revision?: string,
): string {
  const encodedPath = encodeURIComponent(String(path || ''));
  const base = `/api/fs/image?path=${encodedPath}`;
  const rev = String(revision || '').trim();
  return rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
}

export function buildFsThumbnailUrl(
  path: string,
  options?: {
    size?: 'small' | 'medium' | 'large';
    quality?: number;
    revision?: string;
    preferServer?: boolean;
  }
): string {
  return buildFsServerThumbnailUrl(path, options);
}

export function buildFsServerThumbnailUrl(
  path: string,
  options?: {
    size?: 'small' | 'medium' | 'large';
    quality?: number;
    revision?: string;
  }
): string {
  const encodedPath = encodeURIComponent(String(path || ''));
  const size = options?.size || 'medium';
  const quality = Number.isFinite(Number(options?.quality)) ? Math.max(1, Math.floor(Number(options?.quality))) : 100;
  const base = `/api/fs/thumbnail?path=${encodedPath}&size=${encodeURIComponent(size)}&q=${quality}`;
  const rev = String(options?.revision || '').trim();
  return rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
}

export function buildFsPreviewUrl(
  path: string,
  options?: {
    size?: 'small' | 'medium' | 'large';
    revision?: string;
  }
): string {
  const encodedPath = encodeURIComponent(String(path || ''));
  const size = options?.size || 'medium';
  const base = `/api/fs/preview?path=${encodedPath}&size=${encodeURIComponent(size)}`;
  const rev = String(options?.revision || '').trim();
  return rev ? `${base}&rev=${encodeURIComponent(rev)}` : base;
}
