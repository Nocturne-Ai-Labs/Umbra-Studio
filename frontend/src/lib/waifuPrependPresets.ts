import { readUserConfigStrict, writeUserConfig } from '@/lib/userConfig';

const WAIFU_PREPEND_PRESETS_STORAGE_KEY = 'umbra.waifu.prependPresets';
const WAIFU_PREPEND_PRESETS_CONFIG_KEY = 'waifu-prepend-presets';

type PresetListener = () => void;

const listeners = new Set<PresetListener>();
let presetCache: string[] | null = null;
let loadPromise: Promise<void> | null = null;
let operationQueue: Promise<void> = Promise.resolve();

function serializePresets(operation: () => Promise<void>): Promise<void> {
  const pending = operationQueue.then(operation);
  operationQueue = pending.catch(() => undefined);
  return pending;
}

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
  if (!Array.isArray(input) || input.some((entry) => typeof entry !== 'string')) {
    throw new Error('Invalid saved prepend preset list. Existing presets have not been changed.');
  }
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
  loadPromise = serializePresets(async () => {
    const value = await readUserConfigStrict(WAIFU_PREPEND_PRESETS_CONFIG_KEY, [], AbortSignal.timeout(15_000));
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
  void loadFromConfig().catch((error) => console.warn('[WaifuPrependPresets] Failed to load presets:', error));
  return presetCache;
}

export function getWaifuPrependPresetsSnapshot(): string[] {
  return getOrInitCache();
}

export function setWaifuPrependPresets(update: (current: string[]) => string[]): Promise<void> {
  return serializePresets(async () => {
    const current = sanitizePresetList(await readUserConfigStrict(WAIFU_PREPEND_PRESETS_CONFIG_KEY, [], AbortSignal.timeout(15_000)));
    const next = sanitizePresetList(update([...current]));
    if (!arraysEqual(current, next)) await writeUserConfig(WAIFU_PREPEND_PRESETS_CONFIG_KEY, next);
    const changed = !presetCache || !arraysEqual(presetCache, next);
    if (changed) presetCache = next;
    clearLegacyStorage();
    if (changed) notifyListeners();
  });
}

export function subscribeWaifuPrependPresets(listener: PresetListener): () => void {
  listeners.add(listener);
  void loadFromConfig().catch((error) => console.warn('[WaifuPrependPresets] Failed to load presets:', error));

  return () => {
    listeners.delete(listener);
  };
}
