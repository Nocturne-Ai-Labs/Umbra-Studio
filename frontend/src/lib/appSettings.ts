'use client';

export const APP_SETTINGS_STORAGE_KEY = 'umbralab-settings';
export const LEGACY_APP_SETTINGS_STORAGE_KEY = 'umbralab_settings';
export const APP_SETTINGS_CHANGED_EVENT = 'umbra:app-settings-changed';
export const COMFY_SECURITY_LEVELS = ['strong', 'normal', 'normal-', 'weak'] as const;
export type ComfySecurityLevel = (typeof COMFY_SECURITY_LEVELS)[number];
export const COMFY_ATTENTION_BACKENDS = ['default', 'sage', 'flash', 'pytorch', 'split', 'quad'] as const;
export type ComfyAttentionBackend = (typeof COMFY_ATTENTION_BACKENDS)[number];

export interface AppSettings {
  enableToasts: boolean;
  'oledMode.enabled': boolean;
  'oledMode.idleTime': number;
  'ui.idleFrameCapEnabled': boolean;
  'ui.idleFrameCapIdleTime': number;
  'ui.idleFrameCapFps': number;
  'comfyui.path': string;
  'comfyui.url': string;
  'aitoolkit.path': string;
  'aitoolkit.url': string;
  'comfyui.securityLevel': ComfySecurityLevel;
  'comfyui.attentionBackend': ComfyAttentionBackend;
  'comfyui.autoLaunch': boolean;
  'comfyui.showFilmstrip': boolean;
  'library.metadataHoverTooltips': boolean;
  'comfyui.externalOutputPath': string;
  'library.enableExternalRoots': boolean;
  'library.externalRoots': string[];
  'library.pinnedFolders': string[];
  'library.recentFolders': string[];
  'library.cloudRoots': string[];
  'library.trashStoragePath': string;
  'library.deleteMode': 'umbra-trash' | 'system-trash' | 'permanent';
  'library.trashAutoDeleteDays': number;
  'library.showDefaultOutputRoot': boolean;
  'system.monitorEnabled': boolean;
  'system.monitorGPU': boolean;
  'system.monitorCPU': boolean;
  'system.monitorRAM': boolean;
  'system.monitorDrives': boolean;
  'system.visibleDrives': string[];
  'scanner.autoCopyWorkflow': boolean;
  'scanner.showRawMetadata': boolean;
  'remote.syncUiAcrossDevices': boolean;
  'remote.galleryViewerOriginals': boolean;
  'remote.phoneComfyMenuPosition': string;
  'ui.nsfwThumbnailBlurEnabled': boolean;
  'ui.nsfwThumbnailBlurIntensity': number;
  'appUpdate.mode': 'source' | 'release';
  'appUpdate.releaseChannel': 'stable' | 'beta';
  'appUpdate.feedUrl': string;
  'advanced.diagnosticLogging': boolean;
  'advanced.consoleMaxLogs': number;
  'advanced.enableWebSocket': boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  enableToasts: true,
  'oledMode.enabled': false,
  'oledMode.idleTime': 120,
  'ui.idleFrameCapEnabled': false,
  'ui.idleFrameCapIdleTime': 3,
  'ui.idleFrameCapFps': 18,
  'comfyui.path': '',
  'comfyui.url': 'http://127.0.0.1:8188',
  'aitoolkit.path': '',
  'aitoolkit.url': 'http://127.0.0.1:8675',
  'comfyui.securityLevel': 'normal',
  'comfyui.attentionBackend': 'default',
  'comfyui.autoLaunch': false,
  'comfyui.showFilmstrip': true,
  'library.metadataHoverTooltips': false,
  'comfyui.externalOutputPath': '',
  'library.enableExternalRoots': true,
  'library.externalRoots': [],
  'library.pinnedFolders': [],
  'library.recentFolders': [],
  'library.cloudRoots': [],
  'library.trashStoragePath': '',
  'library.deleteMode': 'umbra-trash',
  'library.trashAutoDeleteDays': 30,
  'library.showDefaultOutputRoot': true,
  'system.monitorEnabled': true,
  'system.monitorGPU': true,
  'system.monitorCPU': true,
  'system.monitorRAM': true,
  'system.monitorDrives': true,
  'system.visibleDrives': [],
  'scanner.autoCopyWorkflow': true,
  'scanner.showRawMetadata': false,
  'remote.syncUiAcrossDevices': true,
  'remote.galleryViewerOriginals': false,
  'remote.phoneComfyMenuPosition': '',
  'ui.nsfwThumbnailBlurEnabled': false,
  'ui.nsfwThumbnailBlurIntensity': 85,
  'appUpdate.mode': 'source',
  'appUpdate.releaseChannel': 'stable',
  'appUpdate.feedUrl': '',
  'advanced.diagnosticLogging': false,
  'advanced.consoleMaxLogs': 1000,
  'advanced.enableWebSocket': true,
};

const BOOLEAN_KEYS: Array<keyof AppSettings> = [
  'enableToasts',
  'oledMode.enabled',
  'ui.idleFrameCapEnabled',
  'comfyui.autoLaunch',
  'comfyui.showFilmstrip',
  'library.metadataHoverTooltips',
  'library.enableExternalRoots',
  'library.showDefaultOutputRoot',
  'system.monitorEnabled',
  'system.monitorGPU',
  'system.monitorCPU',
  'system.monitorRAM',
  'system.monitorDrives',
  'scanner.autoCopyWorkflow',
  'scanner.showRawMetadata',
  'remote.syncUiAcrossDevices',
  'remote.galleryViewerOriginals',
  'ui.nsfwThumbnailBlurEnabled',
  'appUpdate.mode',
  'appUpdate.releaseChannel',
  'appUpdate.feedUrl',
  'advanced.diagnosticLogging',
  'advanced.enableWebSocket',
];

const NUMBER_KEYS: Array<keyof AppSettings> = [
  'oledMode.idleTime',
  'ui.idleFrameCapIdleTime',
  'ui.idleFrameCapFps',
  'library.trashAutoDeleteDays',
  'ui.nsfwThumbnailBlurIntensity',
  'advanced.consoleMaxLogs',
];

const STRING_ARRAY_KEYS: Array<keyof AppSettings> = [
  'system.visibleDrives',
  'library.externalRoots',
  'library.pinnedFolders',
  'library.recentFolders',
  'library.cloudRoots',
];

const STRING_KEYS: Array<keyof AppSettings> = [
  'comfyui.path',
  'comfyui.url',
  'aitoolkit.path',
  'aitoolkit.url',
  'comfyui.securityLevel',
  'comfyui.attentionBackend',
  'comfyui.externalOutputPath',
  'library.trashStoragePath',
  'library.deleteMode',
  'remote.phoneComfyMenuPosition',
  'appUpdate.mode',
  'appUpdate.releaseChannel',
  'appUpdate.feedUrl',
];

function toRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function sanitizeNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function safeParse(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return toRecord(JSON.parse(raw));
  } catch {
    return {};
  }
}

let appSettingsMemoryCache: AppSettings = { ...DEFAULT_APP_SETTINGS };

function clearLegacyBrowserSettingsCache() {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(APP_SETTINGS_STORAGE_KEY);
    window.localStorage.removeItem(LEGACY_APP_SETTINGS_STORAGE_KEY);
  } catch {
    // Browser storage is no longer authoritative.
  }
}

export function normalizeAppSettings(input: unknown): AppSettings {
  const candidate = toRecord(input);
  const normalized: AppSettings = { ...DEFAULT_APP_SETTINGS };

  for (const key of BOOLEAN_KEYS) {
    const value = candidate[key as string];
    if (typeof value === 'boolean') (normalized as any)[key] = value;
  }

  for (const key of NUMBER_KEYS) {
    (normalized as any)[key] = sanitizeNumber(candidate[key as string], DEFAULT_APP_SETTINGS[key] as number);
  }

  for (const key of STRING_KEYS) {
    const value = candidate[key as string];
    if (typeof value === 'string') (normalized as any)[key] = value;
  }

  for (const key of STRING_ARRAY_KEYS) {
    const value = candidate[key as string];
    if (Array.isArray(value)) {
      if (key === 'library.externalRoots' || key === 'library.cloudRoots' || key === 'library.pinnedFolders' || key === 'library.recentFolders') {
        const deduped = new Set<string>();
        for (const item of value) {
          if (typeof item !== 'string') continue;
          const trimmed = item.trim();
          if (!trimmed) continue;
          deduped.add(trimmed);
        }
        (normalized as any)[key] = Array.from(deduped);
      } else {
        (normalized as any)[key] = value.filter((item) => typeof item === 'string');
      }
    }
  }

  if ((normalized['oledMode.idleTime'] as number) < 1) {
    normalized['oledMode.idleTime'] = 1;
  }
  if ((normalized['ui.idleFrameCapIdleTime'] as number) < 1) {
    normalized['ui.idleFrameCapIdleTime'] = 1;
  }
  normalized['ui.idleFrameCapFps'] = Math.min(
    60,
    Math.max(1, Math.round(Number(normalized['ui.idleFrameCapFps'] ?? DEFAULT_APP_SETTINGS['ui.idleFrameCapFps']))),
  );

  if ((normalized['advanced.consoleMaxLogs'] as number) < 100) {
    normalized['advanced.consoleMaxLogs'] = 100;
  }

  const deleteMode = normalized['library.deleteMode'];
  if (deleteMode !== 'umbra-trash' && deleteMode !== 'system-trash' && deleteMode !== 'permanent') {
    normalized['library.deleteMode'] = DEFAULT_APP_SETTINGS['library.deleteMode'];
  }

  const clampedTrashAutoDeleteDays = Math.min(
    3650,
    Math.max(1, Math.floor(normalized['library.trashAutoDeleteDays'] || DEFAULT_APP_SETTINGS['library.trashAutoDeleteDays'])),
  );
  normalized['library.trashAutoDeleteDays'] = clampedTrashAutoDeleteDays;

  if (normalized['appUpdate.mode'] !== 'source' && normalized['appUpdate.mode'] !== 'release') {
    normalized['appUpdate.mode'] = DEFAULT_APP_SETTINGS['appUpdate.mode'];
  }

  if (normalized['appUpdate.releaseChannel'] !== 'stable' && normalized['appUpdate.releaseChannel'] !== 'beta') {
    normalized['appUpdate.releaseChannel'] = DEFAULT_APP_SETTINGS['appUpdate.releaseChannel'];
  }

  normalized['ui.nsfwThumbnailBlurIntensity'] = Math.min(
    100,
    Math.max(0, Math.round(Number(normalized['ui.nsfwThumbnailBlurIntensity'] ?? DEFAULT_APP_SETTINGS['ui.nsfwThumbnailBlurIntensity']))),
  );

  if (!COMFY_SECURITY_LEVELS.includes(normalized['comfyui.securityLevel'])) {
    normalized['comfyui.securityLevel'] = DEFAULT_APP_SETTINGS['comfyui.securityLevel'];
  }
  if (!COMFY_ATTENTION_BACKENDS.includes(normalized['comfyui.attentionBackend'])) {
    normalized['comfyui.attentionBackend'] = DEFAULT_APP_SETTINGS['comfyui.attentionBackend'];
  }

  return normalized;
}

export function loadAppSettings(): AppSettings {
  clearLegacyBrowserSettingsCache();
  return { ...appSettingsMemoryCache };
}

export function hasPersistedAppSettings(): boolean {
  return false;
}

export function saveAppSettings(
  updates: Partial<AppSettings> | AppSettings,
  options: { broadcast?: boolean; replace?: boolean } = {},
): AppSettings {
  const broadcast = options.broadcast !== false;
  const current = options.replace === true ? DEFAULT_APP_SETTINGS : loadAppSettings();
  const merged = normalizeAppSettings({ ...current, ...toRecord(updates) });
  appSettingsMemoryCache = merged;

  if (typeof window !== 'undefined') {
    clearLegacyBrowserSettingsCache();

    if (broadcast) {
      window.dispatchEvent(
        new CustomEvent(APP_SETTINGS_CHANGED_EVENT, {
          detail: { settings: merged },
        }),
      );
    }
  }

  return merged;
}

export function resetAppSettings(): AppSettings {
  clearLegacyBrowserSettingsCache();
  return saveAppSettings(DEFAULT_APP_SETTINGS, { replace: true });
}

export function subscribeToAppSettings(onChange: (settings: AppSettings) => void): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === APP_SETTINGS_STORAGE_KEY || event.key === LEGACY_APP_SETTINGS_STORAGE_KEY) {
      clearLegacyBrowserSettingsCache();
    }
  };

  const handleCustom = (event: Event) => {
    const detail = (event as CustomEvent<{ settings?: AppSettings }>).detail;
    if (detail?.settings) {
      onChange(normalizeAppSettings(detail.settings));
      return;
    }
    onChange(loadAppSettings());
  };

  window.addEventListener('storage', handleStorage);
  window.addEventListener(APP_SETTINGS_CHANGED_EVENT, handleCustom);

  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(APP_SETTINGS_CHANGED_EVENT, handleCustom);
  };
}

export async function fetchAppSettingsFromBackend(): Promise<AppSettings | null> {
  try {
    const response = await fetch('/api/settings', { cache: 'no-store' });
    if (!response.ok) return null;
    const data = await response.json();
    const normalized = normalizeAppSettings(data?.settings || data);
    appSettingsMemoryCache = normalized;
    clearLegacyBrowserSettingsCache();
    return normalized;
  } catch {
    return null;
  }
}

export async function pushAppSettingsToBackend(settings: AppSettings): Promise<void> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ settings }),
  });
  if (!response.ok) {
    throw new Error(`Settings sync failed (${response.status})`);
  }
}
