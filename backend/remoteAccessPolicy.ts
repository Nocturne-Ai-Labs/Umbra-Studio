export type RemoteRequestAccessReason =
  | 'allowed'
  | 'remote-disabled'
  | 'tailscale-required';

export type RemoteRequestAccessDecision = {
  allowed: boolean;
  reason: RemoteRequestAccessReason;
};

export function resolveSavedRemoteEnabled(
  value: unknown,
  hasExistingSettings: boolean,
): boolean {
  if (typeof value === 'boolean') return value;
  return hasExistingSettings;
}

export function resolveRemoteListenerHost(
  enabled: boolean,
  configuredHost: string | undefined,
): string | undefined {
  return enabled ? configuredHost : '127.0.0.1';
}

export function isTailscaleOnlyRemoteAccess(
  publishedBuild: boolean,
  preferredMode: string | undefined,
): boolean {
  return publishedBuild || preferredMode === 'private-vpn';
}

export function resolveRemoteRequestAccess({
  enabled,
  hostRequest,
  tailscaleRequest,
  tailscaleOnly,
}: {
  enabled: boolean;
  hostRequest: boolean;
  tailscaleRequest: boolean;
  tailscaleOnly: boolean;
}): RemoteRequestAccessDecision {
  if (hostRequest) return { allowed: true, reason: 'allowed' };
  if (!enabled) return { allowed: false, reason: 'remote-disabled' };
  if (tailscaleOnly && !tailscaleRequest) {
    return { allowed: false, reason: 'tailscale-required' };
  }
  return { allowed: true, reason: 'allowed' };
}
