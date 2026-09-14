import { setTimeout as sleep } from 'node:timers/promises';

function isSqliteBusy(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  return /^SQLITE_(BUSY|LOCKED)(_|$)/.test(String(error.code));
}

// Callbacks must be synchronous and atomic: a busy transaction is retried whole.
export function createSqliteWriteQueue(timeoutMs = 5_000) {
  let pending: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(operation: () => T): Promise<T> {
    const result = pending.catch(() => undefined).then(async () => {
      const deadline = performance.now() + timeoutMs;
      let delayMs = 25;
      while (true) {
        try { return operation(); }
        catch (error) {
          const remaining = deadline - performance.now();
          if (!isSqliteBusy(error) || remaining <= 0) throw error;
          await sleep(Math.min(delayMs, remaining));
          delayMs = Math.min(250, delayMs * 2);
        }
      }
    });
    pending = result;
    return result;
  };
}
