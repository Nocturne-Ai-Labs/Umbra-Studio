import { createConnection } from 'node:net';

export type ListenerProbe = { host: string; port: number; state: 'closed' | 'listening' | 'unknown'; detail: string };

export async function inspectLoopbackListeners(port: number): Promise<ListenerProbe[]> {
  return Promise.all(['127.0.0.1', '::1'].map(host => new Promise<ListenerProbe>(resolve => {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      resolve({ host, port, state: 'unknown', detail: 'invalid port' });
      return;
    }
    const socket = createConnection({ host, port });
    const finish = (state: ListenerProbe['state'], detail: string) => {
      socket.destroy();
      resolve({ host, port, state, detail });
    };
    socket.once('connect', () => finish('listening', 'connection accepted'));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED' ? 'closed' : 'unknown', error.code || 'connection check failed'));
    socket.setTimeout(1500, () => finish('unknown', 'connection check timed out'));
  })));
}

export function listenerHoldMessage(probes: ListenerProbe[]): string {
  const details = probes.filter(probe => probe.state !== 'closed').map(probe => {
    const address = probe.host.includes(':') ? `[${probe.host}]:${probe.port}` : `${probe.host}:${probe.port}`;
    return probe.state === 'listening' ? `${address} is occupied` : `${address} could not be checked (${probe.detail})`;
  }).join('; ');
  return `Installation paused: ${details}. Another app may own this port. Close Studio and retry. If Studio is already closed, send this message to support. Setup cannot safely continue until the port is free.`;
}
