// Match Queue Manager's supported range: Instant through ten minutes.
export function normalizePowerPrompterDispatchDelay(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(600_000, Math.floor(number))) : 0;
}

/** An explicit live change wins over admissions that were already validating. */
export class PowerPrompterDispatchDelayControl {
  revision = 0;
  value = 0;

  update(value: unknown): number {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 600_000) {
      throw new Error('Power Prompter dispatch delay must be between 0 and 600000 milliseconds.');
    }
    this.value = normalizePowerPrompterDispatchDelay(number);
    this.revision += 1;
    return this.value;
  }

  resolve(value: unknown, admissionRevision = this.revision): number {
    return admissionRevision < this.revision || value == null
      ? this.value : normalizePowerPrompterDispatchDelay(value);
  }
}

/**
 * Delay each PP dispatch, including the first in a group. Once started, elapsed
 * wall time counts during pause/priority work, but neither bypasses the gates.
 * Read the delay live so changing to Instant releases an existing wait.
 */
export async function waitForPowerPrompterDispatchDelay(options: {
  getDelayMs: () => number;
  shouldStop: () => boolean;
  waitUntilRunnable: () => Promise<void>;
  runPriorityWork: () => Promise<void>;
  now?: () => number;
  sleep?: (ms: number) => Promise<unknown>;
}): Promise<void> {
  const now = options.now || Date.now;
  const sleep = options.sleep || ((ms: number) => Bun.sleep(ms));
  const startedAt = now();
  while (!options.shouldStop()) {
    await options.waitUntilRunnable();
    if (options.shouldStop()) return;
    await options.runPriorityWork();
    if (options.shouldStop()) return;
    await options.waitUntilRunnable();
    if (options.shouldStop()) return;
    const remaining = normalizePowerPrompterDispatchDelay(options.getDelayMs()) - (now() - startedAt);
    if (remaining <= 0) return;
    await sleep(Math.min(250, remaining));
  }
}
