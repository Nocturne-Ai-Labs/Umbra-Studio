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
