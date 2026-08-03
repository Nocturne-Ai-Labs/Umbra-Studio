export const COMFY_VRAM_MODES = [
  'auto',
  'gpu-only',
  'highvram',
  'lowvram',
  'novram',
  'cpu',
] as const;

export type ComfyVramMode = (typeof COMFY_VRAM_MODES)[number];

const COMFY_VRAM_MODE_FLAGS: Record<ComfyVramMode, string | null> = {
  auto: null,
  'gpu-only': '--gpu-only',
  highvram: '--highvram',
  lowvram: '--lowvram',
  novram: '--novram',
  cpu: '--cpu',
};

export function normalizeComfyVramMode(raw: unknown): ComfyVramMode {
  const value = String(raw ?? '').trim().toLowerCase();
  return COMFY_VRAM_MODES.includes(value as ComfyVramMode)
    ? value as ComfyVramMode
    : 'auto';
}

export function getComfyVramLaunchArguments(raw: unknown): string[] {
  const flag = COMFY_VRAM_MODE_FLAGS[normalizeComfyVramMode(raw)];
  return flag ? [flag] : [];
}
