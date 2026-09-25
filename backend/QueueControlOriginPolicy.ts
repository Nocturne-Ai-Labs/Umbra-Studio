/** Browser queue controls must come from an Umbra address, not another local site. */
export interface QueueControlOriginPolicyInput {
  origin: string | null;
  host: string | null;
  listenerPort: number;
  /** Caller-vetted local interface addresses that serve Umbra (for LAN mode). */
  localHosts?: Iterable<string>;
  /** Configured public origins, including any trusted Tailscale Serve origin. */
  remoteOrigins?: Iterable<string>;
}

export function requiresQueueControlBrowserOrigin(path: string): boolean {
  return path === '/ws/prompter'
    || path.startsWith('/api/powerprompter/queue')
    || path === '/api/powerprompter/backend-queue-debug'
    || path === '/api/umbra-ui/queue/control'
    || path === '/api/umbra-ui/inpaint/jobs'
    || path.startsWith('/api/umbra-ui/inpaint/jobs/')
    || path === '/api/umbra-ui/upscale/jobs'
    || path.startsWith('/api/umbra-ui/upscale/jobs/');
}

function parseOrigin(value: string): URL | null {
  try {
    const url = new URL(value);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:')
      || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function parseHost(value: string): URL | null {
  if (!value || /[\\/?#@\s]/.test(value)) return null;
  try {
    const url = new URL(`http://${value}`);
    if (!url.hostname || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) return null;
    return url;
  } catch {
    return null;
  }
}

function hostname(value: string): string {
  return value.toLowerCase().replace(/^\[|\]$/g, '');
}

function isLoopbackHostname(value: string): boolean {
  return value === 'localhost' || value === '::1' || value === '127.0.0.1';
}

/**
 * An absent Origin is a native-client handshake. Existing peer and remote-session
 * authentication still apply. Browser handshakes require a vetted target Host.
 */
export function isAllowedQueueControlBrowserOrigin(input: QueueControlOriginPolicyInput): boolean {
  if (input.origin == null) return true;
  const origin = parseOrigin(input.origin.trim());
  const target = parseHost(String(input.host || '').trim());
  if (!origin || !target || !Number.isSafeInteger(input.listenerPort)) return false;

  const targetHostname = hostname(target.hostname);
  const localHostnames = new Set(Array.from(input.localHosts || [], (value) => hostname(String(value).trim())));
  const localTarget = (isLoopbackHostname(targetHostname) || localHostnames.has(targetHostname))
    && Number(target.port || (origin.protocol === 'https:' ? 443 : 80)) === input.listenerPort;
  const remoteOrigins = new Set(Array.from(input.remoteOrigins || [], (value) => parseOrigin(String(value).trim())?.origin)
    .filter((value): value is string => !!value));
  const remoteTarget = Array.from(remoteOrigins).some((value) => new URL(value).host === target.host);
  if (!localTarget && !remoteTarget) return false;

  // Local browser tabs use the exact Umbra address and port. A configured
  // remote origin can also reach a local target through a trusted front door.
  if (localTarget && origin.host === target.host) return true;
  if (remoteOrigins.has(origin.origin) && (localTarget || remoteTarget && origin.host === target.host)) return true;
  return false;
}
