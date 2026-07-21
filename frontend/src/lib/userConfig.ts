export type UserConfigKey =
  | 'waifu-prepend-presets'
  | 'powerprompter-card-clipboard'
  | 'editor-export-settings'
  | 'editor-watermark-settings'
  | 'library-preferences'
  | 'gallery-ui-session'
  | 'powerprompter-ui'
  | 'powerprompter-presets'
  | 'powerprompter-thumbnail-overrides'
  | 'local-server-apps'
  | 'umbra-ui-agent-instructions'
  | 'model-manager-browser'
  | 'board-preferences'
  | 'remote-ui-session';

export async function readUserConfig<T>(key: UserConfigKey, fallback: T): Promise<T> {
  try {
    const response = await fetch(`/api/user-config?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
    if (!response.ok) return fallback;
    const payload = await response.json();
    return (payload?.value ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function writeUserConfig(key: UserConfigKey, value: unknown): Promise<void> {
  const response = await fetch('/api/user-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) {
    throw new Error(`User config save failed (${response.status})`);
  }
}

export async function deleteUserConfig(key: UserConfigKey): Promise<void> {
  const response = await fetch(`/api/user-config?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`User config delete failed (${response.status})`);
  }
}
