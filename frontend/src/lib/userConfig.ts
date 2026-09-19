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
  | 'umbra-ui-image-controls'
  | 'umbra-ui-prompt-history'
  | 'umbra-ui-lora-presets'
  | 'umbra-ui-video-prompt-history'
  | 'model-manager-browser'
  | 'board-preferences'
  | 'remote-ui-session';

export async function readUserConfig<T>(key: UserConfigKey, fallback: T): Promise<T> {
  try {
    return await readUserConfigStrict(key, fallback);
  } catch {
    return fallback;
  }
}

// Read-modify-write flows must not mistake a failed read for an absent config.
export async function readUserConfigStrict<T>(key: UserConfigKey, fallback: T, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`/api/user-config?key=${encodeURIComponent(key)}`, { cache: 'no-store', signal });
  if (!response.ok) throw new Error(`User config load failed (${response.status})`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !('success' in payload) || payload.success !== true || !('value' in payload) || !Object.hasOwn(payload, 'value')) {
    throw new Error('Invalid user config response');
  }
  return (payload.value ?? fallback) as T;
}

function waitForUserConfigRetry(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delay);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export async function readUserConfigWithRetry<T>(
  key: UserConfigKey,
  fallback: T,
  signal: AbortSignal,
  onRetry?: (error: unknown) => void,
): Promise<T> {
  let delay = 1000;
  let reportedFailure = false;
  while (true) {
    signal.throwIfAborted();
    const request = new AbortController();
    const onAbort = () => request.abort(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    const timeout = setTimeout(() => request.abort(new DOMException('Config load timed out', 'TimeoutError')), 15_000);
    try {
      const value = await readUserConfigStrict(key, fallback, request.signal);
      signal.throwIfAborted();
      return value;
    } catch (error) {
      signal.throwIfAborted();
      if (!reportedFailure) onRetry?.(error);
      reportedFailure = true;
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
    }
    await waitForUserConfigRetry(delay, signal);
    delay = Math.min(delay * 2, 30_000);
  }
}

async function requireUserConfigAcknowledgment(response: Response, key: UserConfigKey, action: 'save' | 'delete'): Promise<void> {
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !('success' in payload) || payload.success !== true
    || !('key' in payload) || payload.key !== key) {
    throw new Error(`User config ${action} was not confirmed. Reload before retrying.`);
  }
}

export async function writeUserConfig(key: UserConfigKey, value: unknown, signal?: AbortSignal): Promise<void> {
  const response = await fetch('/api/user-config', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) {
    throw new Error(`User config save failed (${response.status})`);
  }
  await requireUserConfigAcknowledgment(response, key, 'save');
}

export async function deleteUserConfig(key: UserConfigKey): Promise<void> {
  const response = await fetch(`/api/user-config?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  if (!response.ok) {
    throw new Error(`User config delete failed (${response.status})`);
  }
  await requireUserConfigAcknowledgment(response, key, 'delete');
}
