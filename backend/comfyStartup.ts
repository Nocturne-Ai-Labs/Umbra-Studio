export interface ComfyStartResult {
  success: boolean;
  error?: string;
  message?: string;
}

// Manual launch and startup share one flight and the existing ownership checks.
export function createComfyStartup<T extends ComfyStartResult>(launch: () => Promise<T>) {
  let inFlight: Promise<T> | null = null;
  let startupAttempted = false;
  let error: string | null = null;

  const start = (): Promise<T> => {
    if (inFlight) return inFlight;
    error = null;
    inFlight = Promise.resolve().then(launch).then((result) => {
      if (!result.success) error = result.error || result.message || 'ComfyUI failed to start.';
      return result;
    }).catch((cause: unknown) => {
      error = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    }).finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    start,
    autoStart(enabled: unknown): Promise<T> | null {
      if (startupAttempted) return null;
      startupAttempted = true;
      return enabled === true ? start() : null;
    },
    fail(message: string) { error = message; },
    clearError() { error = null; },
    getState() { return { pending: inFlight !== null, error }; },
  };
}

export function validateComfyAutoStartSetting(
  patch: Record<string, unknown>,
  current: Record<string, unknown>,
  hostRequest: boolean,
): string | null {
  if (!Object.prototype.hasOwnProperty.call(patch, 'comfyui.autoStart')) return null;
  const value = patch['comfyui.autoStart'];
  if (typeof value !== 'boolean') return 'ComfyUI automatic startup must be a boolean.';
  if (!hostRequest && value !== (current['comfyui.autoStart'] === true)) {
    return 'ComfyUI automatic startup can only be changed from the host PC.';
  }
  return null;
}

/** A spawned Python process is not proof that its HTTP server is accepting work. */
export async function waitForComfyStartup(options: {
  probe: () => Promise<boolean>;
  active: () => boolean;
  failure?: () => string | null;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<ComfyStartResult> {
  const timeoutMs = options.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeoutMs;
  while (options.active()) {
    const healthy = await options.probe();
    // Stop/replacement can happen while a probe is in flight.
    if (!options.active()) break;
    if (healthy) return { success: true, message: 'Ready' };
    const failure = options.failure?.();
    if (failure) return { success: false, error: failure };
    if (Date.now() >= deadline) {
      return { success: false, error: `ComfyUI has not become ready after ${timeoutMs / 1000} seconds. Check its startup log. If startup has stalled, stop ComfyUI and launch it again.` };
    }
    await Bun.sleep(options.pollMs ?? 500);
  }
  return { success: false, error: 'ComfyUI startup was stopped or its process exited before the server became ready.' };
}

export function isComfyStartupTransportFailure(line: string): boolean {
  return /Accept failed on a socket|IocpProactor\.accept/.test(line);
}
