import { isDeepStrictEqual } from 'node:util';

// The client receives an environment-selected Comfy endpoint. Echoing that
// read-only value must retain the host's stored setting, not change it.
export function preserveRemoteComfyUrl(
  patch: Record<string, unknown>, current: Record<string, unknown>,
  hostRequest: boolean, environmentUrl?: string,
): Record<string, unknown> {
  if (hostRequest || !environmentUrl || patch['comfyui.url'] !== environmentUrl) return patch;
  const next = { ...patch };
  if (Object.prototype.hasOwnProperty.call(current, 'comfyui.url')) next['comfyui.url'] = current['comfyui.url'];
  else delete next['comfyui.url'];
  return next;
}

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

/** Old browser snapshots must not revoke directory grants during unrelated saves. */
export function validateFilesystemGrantRemoval(
  patch: Record<string, unknown>, current: Record<string, unknown>, explicitFilesystemEdit: boolean,
): string | null {
  if (explicitFilesystemEdit) return null;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(patch, key);
  const pathKey = (value: unknown) => {
    const path = String(value ?? '').trim().replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? path.toLowerCase() : path;
  };
  const roots = (value: unknown) => Array.isArray(value) ? value.map(pathKey).filter(Boolean) : [];
  const previous = roots(current['library.externalRoots']);
  const next = new Set(roots(patch['library.externalRoots']));
  const removesRoot = has('library.externalRoots') && previous.some(root => !next.has(root));
  const disablesRoots = previous.length > 0 && current['library.enableExternalRoots'] !== false
    && patch['library.enableExternalRoots'] === false;
  const changesOutput = has('comfyui.externalOutputPath') && pathKey(current['comfyui.externalOutputPath'])
    && pathKey(patch['comfyui.externalOutputPath']) !== pathKey(current['comfyui.externalOutputPath']);
  if (removesRoot || disablesRoots || changesOutput) {
    return 'An outdated settings save tried to remove saved folder access. Your folders were preserved. Refresh this Studio tab; use Settings > Storage to intentionally change folder access.';
  }
  return null;
}
