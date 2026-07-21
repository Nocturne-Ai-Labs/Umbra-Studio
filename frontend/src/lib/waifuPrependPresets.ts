import { readUserConfig, writeUserConfig } from '@/lib/userConfig';

const WAIFU_PREPEND_PRESETS_STORAGE_KEY = 'umbra.waifu.prependPresets';
const WAIFU_PREPEND_PRESETS_CONFIG_KEY = 'waifu-prepend-presets';

type PresetListener = () => void;

const listeners = new Set<PresetListener>();
let presetCache: string[] | null = null;
let loadPromise: Promise<void> | null = null;

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function normalizeWaifuPreset(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ');
}

function sanitizePresetList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned: string[] = [];
  const seen = new Set<string>();
  for (const entry of input) {
    const preset = normalizeWaifuPreset(String(entry || ''));
    if (!preset) continue;
    const key = preset.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(preset);
  }
  return cleaned;
}

function clearLegacyStorage(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.removeItem(WAIFU_PREPEND_PRESETS_STORAGE_KEY);
  } catch {
    // Legacy cleanup only.
  }
}

function loadFromConfig(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = readUserConfig<unknown[]>(WAIFU_PREPEND_PRESETS_CONFIG_KEY, [])
    .then((value) => {
      const next = sanitizePresetList(value);
      const current = presetCache || [];
      clearLegacyStorage();
      if (arraysEqual(current, next)) return;
      presetCache = next;
      notifyListeners();
    })
    .finally(() => {
      loadPromise = null;
    });
  return loadPromise;
}

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

function getOrInitCache(): string[] {
  if (presetCache) return presetCache;
  presetCache = [];
  void loadFromConfig();
  return presetCache;
}

export function getWaifuPrependPresetsSnapshot(): string[] {
  return getOrInitCache();
}

export function setWaifuPrependPresets(nextPresets: string[]): void {
  const sanitizedNext = sanitizePresetList(nextPresets);
  const current = getOrInitCache();
  if (arraysEqual(current, sanitizedNext)) return;
  presetCache = sanitizedNext;
  clearLegacyStorage();
  void writeUserConfig(WAIFU_PREPEND_PRESETS_CONFIG_KEY, sanitizedNext).catch((error) => {
    console.warn('[WaifuPrependPresets] Failed to persist presets:', error);
  });
  notifyListeners();
}

export function subscribeWaifuPrependPresets(listener: PresetListener): () => void {
  listeners.add(listener);
  void loadFromConfig();

  return () => {
    listeners.delete(listener);
  };
}
