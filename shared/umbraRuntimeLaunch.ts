import { inspectUmbraRuntimeStatus } from './umbraRuntimeHealth';

/** Waiting for identity is read-only; an unverified listener never authorizes launch. */
export async function ensureUmbraRuntimeReady(options: {
  runtimeRoot: string;
  port: number;
  host?: string;
  launch: () => void;
  timeoutMs?: number;
}): Promise<void> {
  const deadline = Date.now() + (options.timeoutMs ?? 30_000);
  let launched = false;
  let ownedSeen = false;
  while (true) {
    const status = await inspectUmbraRuntimeStatus(options.runtimeRoot, options.port, options.host);
    if (status.health === 'foreign' && !status.retryable) {
      throw new Error('The Umbra listener belongs to another or unverified installation.');
    }
    if (status.ready) return;
    if (Date.now() >= deadline) {
      throw new Error('Umbra Studio did not report a verified ready state within 30 seconds. Review its startup log and retry.');
    }
    if (status.health === 'owned') ownedSeen = true;
    if (status.health === 'absent' && !launched && !ownedSeen) {
      options.launch();
      launched = true;
    }
    await Bun.sleep(250);
  }
}
