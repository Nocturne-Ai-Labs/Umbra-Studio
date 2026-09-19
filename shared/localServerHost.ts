function isPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  const parts = host.split('.').map(Number);
  if (parts.some(part => part > 255)) return false;
  const [a, b] = parts;
  return a === 10
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || (a === 100 && b >= 64 && b <= 127)
    || a === 127;
}

export function isAllowedLocalServerHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (host === 'localhost' || host === '0.0.0.0') return true;
  if (host.includes(':')) {
    // Validate an actual IPv6 literal before applying address-range rules.
    try {
      const literal = new URL(`http://[${host}]/`).hostname.replace(/^\[|\]$/g, '');
      if (literal === '::1') return true;
      const first = Number.parseInt(literal.split(':')[0], 16);
      return (first >= 0xfc00 && first <= 0xfdff) || (first >= 0xfe80 && first <= 0xfebf);
    } catch {
      return false;
    }
  }
  if (host.endsWith('.local')) return true;
  if (isPrivateIpv4(host)) return true;
  return /^[a-z0-9-]+$/i.test(host);
}
