import { readUmbraProcessIdentity, processIdentityMatches, processIdentityBelongsToRoot, type UmbraProcessIdentity } from './umbraProcessIdentity';
import { createConnection } from 'node:net';
import { inspectLoopbackListeners, listenerHoldMessage } from './loopbackListener';
import { inspectUmbraRuntimeHealth } from './umbraRuntimeHealth';
import { readUmbraShutdownMarker, isUmbraShutdownMarkerForProcess } from './umbraShutdownMarker';

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

export async function isUmbraInstallationListenerClosed(host: string, port: number): Promise<boolean> {
  return new Promise(resolve => {
    const socket = createConnection({ host, port });
    const finish = (closed: boolean) => { socket.destroy(); resolve(closed); };
    socket.once('connect', () => finish(false));
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED'));
    socket.setTimeout(1000, () => finish(false));
  });
}

/** Close only the selected installation before Setup writes into its runtime. */
export async function shutdownUmbraForInstallation(options: {
  runtimeRoot: string; origin: string; serverPid?: number; launcherPid?: number;
  timeoutMs?: number; onProgress?: (message: string) => void;
}): Promise<void> {
  const url = new URL(options.origin);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Setup requires a local Umbra listener.');
  const host = url.hostname === '[::1]' ? '::1' : '127.0.0.1';
  const port = Number(url.port || 80);
  const health = await inspectUmbraRuntimeHealth(options.runtimeRoot, port, host);
  if (health === 'foreign') throw new Error('The Umbra listener belongs to another installation or cannot be verified. No installation started.');
  if (health === 'absent') {
    const probes = await inspectLoopbackListeners(port);
    if (probes.some(probe => probe.state !== 'closed')) throw new Error(listenerHoldMessage(probes));
    const marker = readUmbraShutdownMarker(options.runtimeRoot);
    const pids = marker
      ? [marker.serverPid, ...marker.managedProcessPids, marker.launcherPid || 0]
      : [options.serverPid || 0, options.launcherPid || 0];
    for (const pid of pids) {
      if (!pid || !processAlive(pid)) continue;
      const saved = marker?.processIdentities?.find(identity => identity.pid === pid);
      if (saved && !processIdentityMatches(saved)) continue;
      const identity = readUmbraProcessIdentity(pid);
      if (!identity || processIdentityBelongsToRoot(identity, options.runtimeRoot) || marker?.managedProcessPids.includes(pid)) throw new Error('Umbra is still releasing files. Wait for it to exit and retry installation.');
    }
    return;
  }
  const queueResponse = await fetch(`${options.origin}/api/powerprompter/backend-queue-debug`, { signal: AbortSignal.timeout(5000) });
  const queue = await queueResponse.json() as any;
  if (!queueResponse.ok || queue.success !== true || !Array.isArray(queue.activeTasks) || !Array.isArray(queue.queuedWork)) throw new Error('Generation queue state could not be verified. No installation started.');
  if (queue.activeTasks.length || queue.queuedWork.length || queue.controller?.activeRequestId) throw new Error('Finish or cancel queued generation work before installing.');
  options.onProgress?.('Closing Umbra Studio and its managed tools');
  const started = Date.now();
  const response = await fetch(`${options.origin}/api/app/updater/shutdown`, { method: 'POST', signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Umbra did not accept shutdown. No installation started.');
  const timeout = options.timeoutMs ?? 30_000;
  let ownedProcesses: UmbraProcessIdentity[] | null = null;
  while (Date.now() - started < timeout) {
    const marker = readUmbraShutdownMarker(options.runtimeRoot);
    if (!ownedProcesses && marker && marker.requestedAtMs >= started && isUmbraShutdownMarkerForProcess(marker, marker.serverPid)) {
      // Adopt this shutdown attempt; a reused Setup session may name an older server.
      ownedProcesses = [];
      const serverIdentity = marker.processIdentities?.find(identity => identity.pid === marker.serverPid) || readUmbraProcessIdentity(marker.serverPid);
      if (serverIdentity && !processIdentityBelongsToRoot(serverIdentity, options.runtimeRoot)) throw new Error('The shutdown marker belongs to another installation. No installation started.');
      const parent = !marker.launcherPid && serverIdentity ? readUmbraProcessIdentity(serverIdentity.parentPid) : null;
      const legacyLauncherPid = parent && processIdentityBelongsToRoot(parent, options.runtimeRoot) && /UmbraWebLauncher|UmbraStudio\.bat|start-umbra\.sh/i.test(parent.commandLine) ? parent.pid : 0;
      for (const pid of [...new Set([marker.serverPid, ...marker.managedProcessPids, marker.launcherPid || legacyLauncherPid])]) {
        if (!pid) continue;
        if (pid === process.pid) throw new Error('Setup cannot shut down its own process. No installation started.');
        const identity = marker.processIdentities?.find(entry => entry.pid === pid) || readUmbraProcessIdentity(pid);
        if (identity) ownedProcesses.push(identity);
        else if (processAlive(pid)) throw new Error('Shutdown process identity could not be verified. No installation started.');
      }
    }
    if (ownedProcesses && ownedProcesses.every(identity => !processIdentityMatches(identity)) && await isUmbraInstallationListenerClosed(host, port)) {
      options.onProgress?.('Umbra Studio and managed tools are closed');
      return;
    }
    await Bun.sleep(100);
  }
  throw new Error('Umbra Studio or a managed tool did not exit. Close it and retry; no installation files were written.');
}
