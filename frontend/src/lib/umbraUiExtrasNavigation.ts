export type UmbraUiExtrasToolId =
  | 'upscale'
  | 'metadata-scanner'
  | 'visual-analysis'
  | 'censor'
  | 'watermark'
  | 'video-watermark'
  | 'gif';

export const UMBRA_UI_EXTRAS_ACTIVE_TOOL_KEY = 'umbra-ui:extras-active-tool';
export const UMBRA_UI_EXTRAS_TOOL_EVENT = 'umbra:umbra-ui-extras-tool';

const UMBRA_UI_ACTIVE_MODE_STORAGE_KEY = 'umbra-ui:active-mode';
const VALID_EXTRAS_TOOLS = new Set<UmbraUiExtrasToolId>([
  'upscale',
  'metadata-scanner',
  'visual-analysis',
  'censor',
  'watermark',
  'video-watermark',
  'gif',
]);

export function normalizeUmbraUiExtrasTool(value: unknown): UmbraUiExtrasToolId | null {
  const tool = String(value || '').trim() as UmbraUiExtrasToolId;
  return VALID_EXTRAS_TOOLS.has(tool) ? tool : null;
}

export function readPersistedUmbraUiExtrasTool(): UmbraUiExtrasToolId {
  if (typeof window === 'undefined') return 'upscale';
  try {
    return normalizeUmbraUiExtrasTool(window.localStorage.getItem(UMBRA_UI_EXTRAS_ACTIVE_TOOL_KEY)) || 'upscale';
  } catch {
    return 'upscale';
  }
}

export function persistUmbraUiExtrasTool(tool: UmbraUiExtrasToolId): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(UMBRA_UI_EXTRAS_ACTIVE_TOOL_KEY, tool); } catch { /* best effort */ }
}

export function openUmbraUiExtrasTool(tool: UmbraUiExtrasToolId): void {
  if (typeof window === 'undefined') return;
  persistUmbraUiExtrasTool(tool);
  try { window.localStorage.setItem(UMBRA_UI_ACTIVE_MODE_STORAGE_KEY, 'extras'); } catch { /* best effort */ }
  window.dispatchEvent(new CustomEvent(UMBRA_UI_EXTRAS_TOOL_EVENT, { detail: { tool } }));
}
