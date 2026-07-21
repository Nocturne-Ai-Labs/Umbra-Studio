import { describe, expect, test } from 'bun:test';
import {
  reconcileComfyLaunchRuntimeState,
  reduceComfyLaunchRuntimeState,
} from './comfyLaunchState';

describe('ComfyUI launch runtime state', () => {
  test('marks startup as connecting without pretending the server is healthy', () => {
    expect(reduceComfyLaunchRuntimeState({
      connection: 'disconnected',
      healthy: false,
      booting: false,
    }, 'starting')).toEqual({
      connection: 'connecting',
      healthy: false,
      booting: true,
    });
  });

  test('lets the successful readiness probe atomically mount the iframe', () => {
    expect(reduceComfyLaunchRuntimeState({
      connection: 'connecting',
      healthy: false,
      booting: true,
    }, 'ready')).toEqual({
      connection: 'connected',
      healthy: true,
      booting: false,
    });
  });

  test('clears stale ready state after a confirmed offline transition', () => {
    expect(reduceComfyLaunchRuntimeState({
      connection: 'connected',
      healthy: true,
      booting: false,
    }, 'offline')).toEqual({
      connection: 'disconnected',
      healthy: false,
      booting: false,
    });
  });

  test('does not let an early offline sample cancel an explicit launch', () => {
    expect(reconcileComfyLaunchRuntimeState({
      connection: 'connecting',
      healthy: false,
      booting: true,
    }, {
      running: false,
      healthy: false,
    })).toEqual({
      connection: 'connecting',
      healthy: false,
      booting: true,
    });
  });

  test('keeps auto-detected process startup distinct from an explicit launch', () => {
    expect(reconcileComfyLaunchRuntimeState({
      connection: 'disconnected',
      healthy: false,
      booting: false,
    }, {
      running: true,
      healthy: false,
    })).toEqual({
      connection: 'connected',
      healthy: false,
      booting: true,
    });
  });
});
