import { createUmbraUiLoraEntry, type UmbraUiLoraEntry } from './umbraUiModels';

export interface UmbraLoraPreset {
  id: string;
  name: string;
  thumbnail: string;
  loras: UmbraUiLoraEntry[];
  updatedAt: number;
}

export function createLoraPresetId(): string {
  return `lora-preset-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

export function instantiateLoraPreset(loras: UmbraUiLoraEntry[]): UmbraUiLoraEntry[] {
  return loras.map((lora) => ({
    ...createUmbraUiLoraEntry(lora.name, lora.trainedTags, '', {
      thumbnailUrl: lora.thumbnailUrl,
      thumbnailUrls: lora.thumbnailUrls,
      civitaiUrl: lora.civitaiUrl,
    }, lora.triggerWords),
    enabled: lora.enabled,
    strengthModel: lora.strengthModel,
    strengthClip: lora.strengthClip,
  }));
}

async function loadLibrary(): Promise<{ presets: UmbraLoraPreset[]; revision: number }> {
  // A failed read must not become an empty library that a later save overwrites.
  const response = await fetch('/api/user-config?key=umbra-ui-lora-presets', { cache: 'no-store' });
  if (!response.ok) throw new Error('Unable to load LoRA presets. Please retry.');
  const { value } = await response.json();
  if (value == null) return { presets: [], revision: 0 };
  if (value.version !== 1 || !Array.isArray(value.presets)) throw new Error('Unsupported LoRA preset library.');
  return { presets: value.presets, revision: Number(value.revision) || 0 };
}

export async function loadLoraPresets(): Promise<UmbraLoraPreset[]> {
  return (await loadLibrary()).presets;
}

export async function saveLoraPreset(preset: UmbraLoraPreset, remove = false): Promise<UmbraLoraPreset[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await loadLibrary();
    const next = current.presets.filter((entry) => entry.id !== preset.id);
    if (!remove) next.unshift(preset);
    const response = await fetch('/api/user-config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'umbra-ui-lora-presets', value: { version: 1, revision: current.revision + 1, presets: next } }),
    });
    if (response.status === 409) continue;
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new Error(result?.error || 'Unable to save LoRA preset.');
    }
    return next;
  }
  throw new Error('Preset library is busy. Please retry.');
}

export async function createLoraPresetThumbnail(file: File): Promise<string> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Thumbnail source must be smaller than 20 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    const ratio = Math.min(1, 256 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not prepare thumbnail.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/webp', 0.8);
  } finally {
    bitmap.close();
  }
}
