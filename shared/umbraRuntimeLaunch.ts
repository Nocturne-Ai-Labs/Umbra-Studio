import { inspectUmbraRuntimeStatus } from './umbraRuntimeHealth';

export const UMBRA_LAUNCH_READY_TIMEOUT_MS = 120_000;

/** Waiting for identity is read-only; an unverified listener never authorizes launch. */
export async function ensureUmbraRuntimeReady(options: {
  runtimeRoot: string;
  port: number;
  host?: string;
  launch: () => void | Promise<void>;
  timeoutMs?: number;
}): Promise<void> {
  const timeoutMs = options.timeoutMs ?? UMBRA_LAUNCH_READY_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;
  let launched = false;
  let ownedSeen = false;
  while (true) {
    const status = await inspectUmbraRuntimeStatus(options.runtimeRoot, options.port, options.host);
    if (status.health === 'foreign' && !status.retryable) {
      throw new Error('The Umbra listener belongs to another or unverified installation.');
    }
    if (status.ready) return;
    if (Date.now() >= deadline) {
      throw new Error(`Umbra Studio did not report a verified ready state within ${timeoutMs / 1000} seconds. It may still be starting; review its startup log before retrying.`);
    }
    if (status.health === 'owned') ownedSeen = true;
    if (status.health === 'absent' && !launched && !ownedSeen) {
      await options.launch();
      launched = true;
    }
    await Bun.sleep(250);
  }
}
