export type TailscaleRuntimeStatus = {
  installed: boolean;
  backendState: string;
  online: boolean;
  connected: boolean;
  health: string[];
  activeIpv4s: string[];
  activeIpv6s: string[];
  activeDnsName: string;
  knownDnsName: string;
};

export type RemoteRuntimeOverrides = {
  bindHost: boolean;
  port: boolean;
};

export type TailscaleServeRuntimeStatus = {
  configured: boolean;
  proxyTargets: string[];
  expectedTarget: string;
  targetMatches: boolean;
};

function normalizeDnsName(value: unknown): string {
  return String(value || '').trim().replace(/\.$/, '');
}

function isTailscaleIpv4(value: string): boolean {
  return /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(value);
}

function isTailscaleIpv6(value: string): boolean {
  return /^fd7a:115c:a1e0:/i.test(value.replace(/^\[/, '').replace(/\]$/, ''));
}

function collectProxyTargets(value: unknown, targets: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const entry of value) collectProxyTargets(entry, targets);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key.toLowerCase() === 'proxy' && typeof entry === 'string' && entry.trim()) {
      targets.add(entry.trim().replace(/\/+$/, ''));
      continue;
    }
    collectProxyTargets(entry, targets);
  }
}

function effectiveUrlPort(parsed: URL): number {
  return Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));
}

function proxyTargetMatchesExpected(target: string, expectedTarget: string): boolean {
  try {
    const parsed = new URL(target);
    const expected = new URL(expectedTarget);
    if (parsed.protocol !== expected.protocol || effectiveUrlPort(parsed) !== effectiveUrlPort(expected)) return false;
    const parsedHost = parsed.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    const expectedHost = expected.hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
    return parsedHost === expectedHost;
  } catch {
    return false;
  }
}

export function parseTailscaleServeStatus(payload: unknown, expectedTargetOrPort: string | number): TailscaleServeRuntimeStatus {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const targets = new Set<string>();
  collectProxyTargets(record, targets);
  const proxyTargets = Array.from(targets);
  const expectedTarget = typeof expectedTargetOrPort === 'number'
    ? `http://127.0.0.1:${expectedTargetOrPort}`
    : String(expectedTargetOrPort || '').trim().replace(/\/+$/, '');
  return {
    configured: Object.keys(record).length > 0,
    proxyTargets,
    expectedTarget,
    targetMatches: Boolean(expectedTarget)
      && proxyTargets.some((target) => proxyTargetMatchesExpected(target, expectedTarget)),
  };
}

export function parseTailscaleStatus(payload: unknown): TailscaleRuntimeStatus {
  const record = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const self = record.Self && typeof record.Self === 'object'
    ? record.Self as Record<string, unknown>
    : {};
  const backendState = String(record.BackendState || 'Unknown').trim() || 'Unknown';
  const online = self.Online === true;
  const connected = backendState.toLowerCase() === 'running' && online;
  const knownDnsName = normalizeDnsName(self.DNSName);
  const health = Array.isArray(record.Health)
    ? record.Health.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const cachedIps = Array.isArray(record.TailscaleIPs)
    ? record.TailscaleIPs.map((value) => String(value || '').trim())
    : [];

  return {
    installed: true,
    backendState,
    online,
    connected,
    health,
    activeIpv4s: connected ? cachedIps.filter(isTailscaleIpv4) : [],
    activeIpv6s: connected ? cachedIps.filter(isTailscaleIpv6) : [],
    activeDnsName: connected ? knownDnsName : '',
    knownDnsName,
  };
}

export function createUnavailableTailscaleStatus(): TailscaleRuntimeStatus {
  return {
    installed: false,
    backendState: 'Unavailable',
    online: false,
    connected: false,
    health: [],
    activeIpv4s: [],
    activeIpv6s: [],
    activeDnsName: '',
    knownDnsName: '',
  };
}

export function shouldRemoteSettingsRequireRestart({
  savedBindHost,
  savedPort,
  activeBindHost,
  activePort,
  runtimeOverrides,
  suppressRestart = false,
}: {
  savedBindHost: string;
  savedPort: number;
  activeBindHost: string;
  activePort: number;
  runtimeOverrides: RemoteRuntimeOverrides;
  suppressRestart?: boolean;
}): boolean {
  if (suppressRestart) return false;
  return (
    (!runtimeOverrides.bindHost && savedBindHost !== activeBindHost)
    || (!runtimeOverrides.port && savedPort !== activePort)
  );
}
