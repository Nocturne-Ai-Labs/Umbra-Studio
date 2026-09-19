import { readUserConfigWithRetry, writeUserConfig, type UserConfigKey } from './userConfig';

/** Keep early edits until hydration succeeds, and serialize/coalesce preference writes. */
export function createUserPreferenceSession<T>(options: {
  key: UserConfigKey;
  initial: T;
  normalize: (value: unknown) => T;
  apply: (value: T) => void;
  onError: (error: unknown) => void;
}) {
  let value = options.initial;
  let hydrated = false;
  let disposed = false;
  let loading: Promise<void> | null = null;
  let writing: Promise<void> | null = null;
  let dirty = false;
  let acknowledged = '';
  let retryDelay = 1000;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const pending: Array<(value: T) => T> = [];
  const controller = new AbortController();

  function persist(): Promise<void> {
    if (writing) return writing;
    if (!hydrated || disposed || !dirty) return Promise.resolve();
    writing = Promise.resolve().then(async () => {
      while (dirty && !disposed) {
        dirty = false;
        const serialized = JSON.stringify(value);
        if (serialized === acknowledged) continue;
        try {
          await writeUserConfig(options.key, JSON.parse(serialized));
          acknowledged = serialized;
          retryDelay = 1000;
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = null;
        } catch (error) {
          dirty = true;
          options.onError(error);
          if (!disposed && !retryTimer) {
            retryTimer = setTimeout(() => {
              retryTimer = null;
              void persist();
            }, retryDelay);
            retryDelay = Math.min(retryDelay * 2, 30_000);
          }
          break;
        }
      }
    }).finally(() => {
      writing = null;
      if (dirty && !retryTimer && !disposed) void persist();
    });
    return writing;
  }

  function hydrate(): Promise<void> {
    if (hydrated || disposed) return Promise.resolve();
    if (loading) return loading;
    loading = readUserConfigWithRetry<unknown>(options.key, {}, controller.signal, options.onError)
      .then(raw => {
        if (disposed) return;
        let loaded = options.normalize(raw);
        acknowledged = JSON.stringify(loaded);
        for (const edit of pending) loaded = edit(loaded);
        dirty = pending.length > 0;
        pending.length = 0;
        value = loaded;
        hydrated = true;
        options.apply(value);
        void persist();
      })
      .catch(error => { if (!disposed) options.onError(error); })
      .finally(() => { loading = null; });
    return loading;
  }

  return {
    hydrate,
    update(edit: (value: T) => T): void {
      if (disposed) return;
      value = edit(value);
      if (!hydrated) pending.push(edit);
      else dirty = true;
      options.apply(value);
      if (hydrated) void persist();
      else void hydrate();
    },
    async flush(): Promise<void> {
      await hydrate();
      await persist();
    },
    dispose(): void {
      disposed = true;
      controller.abort();
      if (retryTimer) clearTimeout(retryTimer);
      pending.length = 0;
    },
  };
}
