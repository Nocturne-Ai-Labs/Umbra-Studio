import { describe, expect, test } from 'bun:test';
import {
  isTailscaleOnlyRemoteAccess,
  resolveRemoteListenerHost,
  resolveRemoteRequestAccess,
  resolveSavedRemoteEnabled,
} from './remoteAccessPolicy';

describe('resolveSavedRemoteEnabled', () => {
  test('defaults a fresh installation to disabled', () => {
    expect(resolveSavedRemoteEnabled(undefined, false)).toBe(false);
  });

  test('preserves enabled behavior for legacy saved settings', () => {
    expect(resolveSavedRemoteEnabled(undefined, true)).toBe(true);
  });

  test('honors an explicit saved choice', () => {
    expect(resolveSavedRemoteEnabled(false, true)).toBe(false);
    expect(resolveSavedRemoteEnabled(true, true)).toBe(true);
  });
});

describe('resolveRemoteListenerHost', () => {
  test('forces a disabled remote listener onto loopback', () => {
    expect(resolveRemoteListenerHost(false, '0.0.0.0')).toBe('127.0.0.1');
    expect(resolveRemoteListenerHost(false, '::')).toBe('127.0.0.1');
  });

  test('keeps the configured listener when remote access is enabled', () => {
    expect(resolveRemoteListenerHost(true, '0.0.0.0')).toBe('0.0.0.0');
  });
});

describe('isTailscaleOnlyRemoteAccess', () => {
  test('always restricts published builds to Tailscale', () => {
    expect(isTailscaleOnlyRemoteAccess(true, 'auto')).toBe(true);
  });

  test('restricts a developer build when Private VPN is selected', () => {
    expect(isTailscaleOnlyRemoteAccess(false, 'private-vpn')).toBe(true);
    expect(isTailscaleOnlyRemoteAccess(false, 'auto')).toBe(false);
  });
});

describe('resolveRemoteRequestAccess', () => {
  test('always allows the host browser', () => {
    expect(resolveRemoteRequestAccess({
      enabled: false,
      hostRequest: true,
      tailscaleRequest: false,
      tailscaleOnly: true,
    })).toEqual({ allowed: true, reason: 'allowed' });
  });

  test('rejects every remote client while Umbra Remote is disabled', () => {
    expect(resolveRemoteRequestAccess({
      enabled: false,
      hostRequest: false,
      tailscaleRequest: true,
      tailscaleOnly: true,
    })).toEqual({ allowed: false, reason: 'remote-disabled' });
  });

  test('allows Tailscale but rejects a port-forwarded client in Tailscale-only mode', () => {
    expect(resolveRemoteRequestAccess({
      enabled: true,
      hostRequest: false,
      tailscaleRequest: true,
      tailscaleOnly: true,
    })).toEqual({ allowed: true, reason: 'allowed' });
    expect(resolveRemoteRequestAccess({
      enabled: true,
      hostRequest: false,
      tailscaleRequest: false,
      tailscaleOnly: true,
    })).toEqual({ allowed: false, reason: 'tailscale-required' });
  });
});
