import {
  getPreferredUmbraRemoteMode,
  type UmbraRemoteClientMode,
} from '@/utils/hostOnly';

const DEVICE_UI_RESUME_PREFIX = 'umbra.device-ui-resume.v1';

interface DeviceUiResumeEnvelope<T> {
  version: 1;
  updatedAt: number;
  value: T;
}

function getStorageKey(scope: string, mode: UmbraRemoteClientMode): string {
  return `${DEVICE_UI_RESUME_PREFIX}:${mode}:${scope}`;
}

export function readDeviceUiResume<T>(
  scope: string,
  mode: UmbraRemoteClientMode = getPreferredUmbraRemoteMode(),
): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(getStorageKey(scope, mode)) || 'null') as
      | DeviceUiResumeEnvelope<T>
      | null;
    return parsed?.version === 1 && parsed.value != null ? parsed.value : null;
  } catch {
    return null;
  }
}

export function writeDeviceUiResume<T>(
  scope: string,
  value: T,
  mode: UmbraRemoteClientMode = getPreferredUmbraRemoteMode(),
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStorageKey(scope, mode), JSON.stringify({
      version: 1,
      updatedAt: Date.now(),
      value,
    } satisfies DeviceUiResumeEnvelope<T>));
  } catch {
    // Resume state is best effort in private or storage-restricted browsers.
  }
}

