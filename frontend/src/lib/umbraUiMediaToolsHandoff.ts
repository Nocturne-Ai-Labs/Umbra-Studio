export type UmbraUiMediaToolsHandoffMode = 'watermark' | 'video-watermark' | 'gif';

export interface UmbraUiMediaToolsHandoff {
  mode: UmbraUiMediaToolsHandoffMode;
  paths: string[];
  previewUrls: Record<string, string>;
  createdAt: number;
}

export const UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY = 'umbra-ui:pending-media-tools-handoff';
export const UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT = 'umbra:umbra-ui-media-tools-handoff';

const IMAGE_EXTENSION_PATTERN = /\.(?:avif|bmp|gif|jpe?g|png|tiff?|webp)$/i;
const VIDEO_EXTENSION_PATTERN = /\.(?:avi|m4v|mkv|mov|mp4|webm|wmv)$/i;

function normalizePath(value: unknown): string {
  return String(value || '').trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/');
}

export function normalizeUmbraUiMediaToolsHandoff(value: unknown): UmbraUiMediaToolsHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const mode = source.mode === 'gif'
    ? 'gif'
    : source.mode === 'video-watermark'
      ? 'video-watermark'
      : source.mode === 'watermark' ? 'watermark' : null;
  if (!mode) return null;
  const acceptedPattern = mode === 'gif' || mode === 'video-watermark'
    ? VIDEO_EXTENSION_PATTERN
    : IMAGE_EXTENSION_PATTERN;
  const seen = new Set<string>();
  const paths = (Array.isArray(source.paths) ? source.paths : [])
    .map(normalizePath)
    .filter((path) => (IMAGE_EXTENSION_PATTERN.test(path) || VIDEO_EXTENSION_PATTERN.test(path)) && acceptedPattern.test(path))
    .filter((path) => {
      const key = path.toLowerCase();
      if (!path || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (paths.length === 0) return null;
  const rawPreviewUrls = source.previewUrls && typeof source.previewUrls === 'object'
    ? source.previewUrls as Record<string, unknown>
    : {};
  const previewUrls = Object.fromEntries(paths.flatMap((path) => {
    const value = String(rawPreviewUrls[path] || '').trim();
    return value && value.length <= 4096 && !value.startsWith('data:') ? [[path, value]] : [];
  }));
  return { mode, paths, previewUrls, createdAt: Number(source.createdAt) || Date.now() };
}

export function stageUmbraUiMediaToolsHandoff(
  mode: UmbraUiMediaToolsHandoffMode,
  paths: string[],
  previewUrls: Record<string, string> = {},
): UmbraUiMediaToolsHandoff {
  const payload = normalizeUmbraUiMediaToolsHandoff({ mode, paths, previewUrls, createdAt: Date.now() });
  if (!payload) throw new Error('Select supported media before opening Extras.');
  try { window.sessionStorage.setItem(UMBRA_UI_MEDIA_TOOLS_HANDOFF_KEY, JSON.stringify(payload)); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent(UMBRA_UI_MEDIA_TOOLS_HANDOFF_EVENT, { detail: payload }));
  return payload;
}
