import { describe, expect, test } from 'bun:test';
import {
  createUnavailableTailscaleStatus,
  parseTailscaleServeStatus,
  parseTailscaleStatus,
  shouldRemoteSettingsRequireRestart,
} from './remoteTailscaleStatus';

describe('parseTailscaleStatus', () => {
  test('does not advertise cached identity while Tailscale is stopped', () => {
    const result = parseTailscaleStatus({
      BackendState: 'Stopped',
      TailscaleIPs: ['100.100.10.20'],
      Self: {
        Online: false,
        Active: false,
        DNSName: 'umbra-host.example.ts.net.',
      },
      Health: ['Tailscale is stopped.'],
    });

    expect(result.installed).toBe(true);
    expect(result.connected).toBe(false);
    expect(result.online).toBe(false);
    expect(result.activeIpv4s).toEqual([]);
    expect(result.activeIpv6s).toEqual([]);
    expect(result.activeDnsName).toBe('');
    expect(result.knownDnsName).toBe('umbra-host.example.ts.net');
    expect(result.health).toEqual(['Tailscale is stopped.']);
  });

  test('advertises active identity only when the backend is running and online', () => {
    const result = parseTailscaleStatus({
      BackendState: 'Running',
      TailscaleIPs: ['100.100.10.20', 'fd7a:115c:a1e0::1'],
      Self: {
        Online: true,
        Active: true,
        DNSName: 'umbra-host.example.ts.net.',
      },
    });

    expect(result.connected).toBe(true);
    expect(result.online).toBe(true);
    expect(result.activeIpv4s).toEqual(['100.100.10.20']);
    expect(result.activeIpv6s).toEqual(['fd7a:115c:a1e0::1']);
    expect(result.activeDnsName).toBe('umbra-host.example.ts.net');
  });

  test('does not treat NeedsLogin as connected', () => {
    const result = parseTailscaleStatus({
      BackendState: 'NeedsLogin',
      TailscaleIPs: ['100.100.10.20'],
      Self: {
        Online: true,
        DNSName: 'umbra-host.example.ts.net.',
      },
    });

    expect(result.connected).toBe(false);
    expect(result.activeIpv4s).toEqual([]);
    expect(result.activeIpv6s).toEqual([]);
    expect(result.activeDnsName).toBe('');
  });

  test('provides an explicit unavailable state when the CLI cannot be queried', () => {
    expect(createUnavailableTailscaleStatus()).toEqual({
      installed: false,
      backendState: 'Unavailable',
      online: false,
      connected: false,
      health: [],
      activeIpv4s: [],
      activeIpv6s: [],
      activeDnsName: '',
      knownDnsName: '',
    });
  });
});

describe('shouldRemoteSettingsRequireRestart', () => {
  test('ignores an intentional direct-launch bind and port override', () => {
    expect(shouldRemoteSettingsRequireRestart({
      savedBindHost: '0.0.0.0',
      savedPort: 8212,
      activeBindHost: '127.0.0.1',
      activePort: 8213,
      runtimeOverrides: { bindHost: true, port: true },
    })).toBe(false);
  });

  test('requires restart when launcher-managed settings differ from the active listener', () => {
    expect(shouldRemoteSettingsRequireRestart({
      savedBindHost: '0.0.0.0',
      savedPort: 8212,
      activeBindHost: '127.0.0.1',
      activePort: 8213,
      runtimeOverrides: { bindHost: false, port: false },
    })).toBe(true);
  });

  test('can suppress restart while already using the published Tailscale route', () => {
    expect(shouldRemoteSettingsRequireRestart({
      savedBindHost: '0.0.0.0',
      savedPort: 8212,
      activeBindHost: '127.0.0.1',
      activePort: 8213,
      runtimeOverrides: { bindHost: false, port: false },
      suppressRestart: true,
    })).toBe(false);
  });
});

describe('parseTailscaleServeStatus', () => {
  const createServePayload = (target: string) => ({
    TCP: {
      443: {
        HTTPS: true,
      },
    },
    Web: {
      'host.tailnet.ts.net:443': {
        Handlers: {
          '/': {
            Proxy: target,
          },
        },
      },
    },
  });

  test('recognizes a Serve route that targets the active Umbra port', () => {
    expect(parseTailscaleServeStatus(
      createServePayload('http://127.0.0.1:8213'),
      8213,
    )).toEqual({
      configured: true,
      proxyTargets: ['http://127.0.0.1:8213'],
      expectedTarget: 'http://127.0.0.1:8213',
      targetMatches: true,
    });
  });

  test('does not call a stale Serve target active', () => {
    const status = parseTailscaleServeStatus(
      createServePayload('http://127.0.0.1:8212'),
      8213,
    );
    expect(status.configured).toBe(true);
    expect(status.proxyTargets).toEqual(['http://127.0.0.1:8212']);
    expect(status.targetMatches).toBe(false);
  });

  test('recognizes localhost only when it is the expected proxy target', () => {
    expect(parseTailscaleServeStatus(
      createServePayload('http://localhost:8213/'),
      'http://localhost:8213',
    ).targetMatches).toBe(true);
    expect(parseTailscaleServeStatus(
      createServePayload('http://localhost:8213/'),
      8213,
    ).targetMatches).toBe(false);
  });

  test('requires the localhost Serve target selected for an IPv6-only listener', () => {
    expect(parseTailscaleServeStatus(
      createServePayload('http://127.0.0.1:8213'),
      'http://localhost:8213',
    ).targetMatches).toBe(false);
    expect(parseTailscaleServeStatus(
      createServePayload('http://localhost:8213'),
      'http://localhost:8213',
    ).targetMatches).toBe(true);
  });

  test('reports an empty Serve configuration accurately', () => {
    expect(parseTailscaleServeStatus({}, 8213)).toEqual({
      configured: false,
      proxyTargets: [],
      expectedTarget: 'http://127.0.0.1:8213',
      targetMatches: false,
    });
  });
});
