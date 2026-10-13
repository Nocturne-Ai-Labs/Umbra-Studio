import { isDeepStrictEqual } from 'node:util';

export const HOST_ONLY_SERVICE_SETTING_DEFAULTS: Record<string, unknown> = {
  'comfyui.url': 'http://127.0.0.1:8188',
  'comfyui.path': '',
  'comfyui.securityLevel': 'normal',
  'aitoolkit.url': 'http://127.0.0.1:8675',
  'aitoolkit.path': '',
  'appUpdate.mode': 'source',
  'appUpdate.releaseChannel': 'stable',
  'appUpdate.feedUrl': '',
};

export const HOST_ONLY_FILESYSTEM_SETTING_DEFAULTS: Record<string, unknown> = {
  'library.externalRoots': [],
  'library.enableExternalRoots': true,
  'comfyui.externalOutputPath': '',
  'library.trashStoragePath': '',
};

export function validateHostOnlySettingChanges(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
  hostRequest: boolean,
): string | null {
  if (hostRequest) return null;
  for (const [key, defaultValue] of Object.entries({ ...HOST_ONLY_SERVICE_SETTING_DEFAULTS, ...HOST_ONLY_FILESYSTEM_SETTING_DEFAULTS })) {
    const effectiveCurrent = Object.prototype.hasOwnProperty.call(current, key) ? current[key] : defaultValue;
    // Full-settings saves deserialize fresh arrays even when grants are unchanged.
    if (Object.prototype.hasOwnProperty.call(patch, key) && !isDeepStrictEqual(patch[key], effectiveCurrent)) {
      if (Object.prototype.hasOwnProperty.call(HOST_ONLY_FILESYSTEM_SETTING_DEFAULTS, key)) {
        return 'Host filesystem access settings can only be changed from the host PC.';
      }
      return 'Local service and updater settings can only be changed from the host PC.';
    }
  }
  return null;
}
