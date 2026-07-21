export type ComfyConnectionState = 'connected' | 'disconnected' | 'connecting';

export interface ComfyLaunchRuntimeState {
  connection: ComfyConnectionState;
  healthy: boolean;
  booting: boolean;
}

export type ComfyLaunchPhase = 'starting' | 'ready' | 'offline';

export interface ComfyBackendStatusSample {
  running: boolean;
  healthy: boolean;
}

export function reduceComfyLaunchRuntimeState(
  current: ComfyLaunchRuntimeState,
  phase: ComfyLaunchPhase,
): ComfyLaunchRuntimeState {
  if (phase === 'starting') {
    return {
      connection: 'connecting',
      healthy: false,
      booting: true,
    };
  }

  if (phase === 'ready') {
    return {
      connection: 'connected',
      healthy: true,
      booting: false,
    };
  }

  return {
    connection: 'disconnected',
    healthy: false,
    booting: false,
  };
}

export function reconcileComfyLaunchRuntimeState(
  current: ComfyLaunchRuntimeState,
  sample: ComfyBackendStatusSample,
): ComfyLaunchRuntimeState {
  const healthy = sample.running && sample.healthy;
  const explicitLaunchPending = current.booting
    && current.connection === 'connecting'
    && !healthy;

  return {
    connection: explicitLaunchPending
      ? 'connecting'
      : sample.running
        ? 'connected'
        : 'disconnected',
    healthy,
    booting: explicitLaunchPending || (
      sample.running
      && !sample.healthy
      && !current.healthy
    ),
  };
}
