import { describe, expect, test } from 'bun:test';
import {
  buildListenerOrigin,
  buildTailscaleServeOrigin,
  formatUrlHost,
  getListenerClientHost,
} from './remoteNetworkAddress';

describe('remote network addresses', () => {
  test('uses IPv4 loopback for IPv4 wildcard listeners', () => {
    expect(getListenerClientHost('0.0.0.0')).toBe('127.0.0.1');
    expect(buildListenerOrigin('0.0.0.0', 8212)).toBe('http://127.0.0.1:8212');
  });

  test('uses bracketed IPv6 loopback for IPv6 listeners', () => {
    expect(getListenerClientHost('::')).toBe('::1');
    expect(getListenerClientHost('::1')).toBe('::1');
    expect(buildListenerOrigin('::', 8212)).toBe('http://[::1]:8212');
    expect(buildListenerOrigin('::1', 8212)).toBe('http://[::1]:8212');
    expect(buildTailscaleServeOrigin('::', 8212)).toBe('http://localhost:8212');
    expect(buildTailscaleServeOrigin('::1', 8212)).toBe('http://localhost:8212');
  });

  test('formats a specific IPv6 listener safely in URLs', () => {
    expect(formatUrlHost('fd7a:115c:a1e0::1')).toBe('[fd7a:115c:a1e0::1]');
    expect(buildListenerOrigin('fd7a:115c:a1e0::1', 8212)).toBe('http://[fd7a:115c:a1e0::1]:8212');
  });
});
