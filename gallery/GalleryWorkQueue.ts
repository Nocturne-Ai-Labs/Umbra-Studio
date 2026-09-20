type WorkerTask<T> = {
  key: string;
  background: boolean;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

type CancellableWork = {
  controller: AbortController;
  promise: Promise<any>;
  queueKey: string;
  subscribers: number;
  settled: boolean;
};

export class GalleryWorkQueue {
  private readonly concurrency: number;
  private readonly maxQueued: number;
  private readonly queue: WorkerTask<any>[] = [];
  private readonly inFlight = new Map<string, Promise<any>>();
  private readonly cancellable = new Map<string, CancellableWork>();
  private active = 0;
  private backgroundActive = 0;

  constructor(concurrency: number, maxQueued = 512) {
    this.concurrency = Math.max(1, Math.floor(concurrency));
    this.maxQueued = Math.max(this.concurrency, Math.floor(maxQueued));
  }

  run<T>(key: string, run: () => Promise<T>): Promise<T> {
    return this.enqueue(key, run, false);
  }

  runCancellable<T>(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    let work = this.cancellable.get(key);
    if (!work || work.controller.signal.aborted) {
      const current: CancellableWork = { controller: new AbortController(), queueKey: `cancellable:${crypto.randomUUID()}`,
        promise: Promise.resolve(), subscribers: 0, settled: false };
      current.promise = this.run(current.queueKey, () => {
        current.controller.signal.throwIfAborted();
        return run(current.controller.signal);
      }).finally(() => {
        current.settled = true;
        if (this.cancellable.get(key) === current) this.cancellable.delete(key);
      });
      this.cancellable.set(key, current);
      work = current;
    }
    const current = work;
    current.subscribers++;
    return new Promise<T>((resolve, reject) => {
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        signal?.removeEventListener('abort', abort);
        current.subscribers--;
        if (current.subscribers === 0 && !current.settled) {
          current.controller.abort();
          const index = this.queue.findIndex(task => task.key === current.queueKey);
          if (index >= 0) {
            const [waiting] = this.queue.splice(index, 1);
            waiting.reject(current.controller.signal.reason);
            this.pump();
          }
        }
      };
      const abort = () => { release(); reject(signal?.reason); };
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(value => { release(); resolve(value); }, error => { release(); reject(error); });
    });
  }

  async mapSettled<T, R>(items: readonly T[], run: (item: T, index: number) => Promise<R>, signal?: AbortSignal): Promise<PromiseSettledResult<R>[]> {
    signal?.throwIfAborted();
    const results = new Array<PromiseSettledResult<R>>(items.length);
    const batchKey = `batch:${crypto.randomUUID()}`;
    let cursor = 0;
    let failed = false;
    let failure: unknown;
    // Feed a small rolling window into the shared queue, not one promise per file.
    await Promise.all(Array.from({ length: Math.min(this.concurrency, items.length) }, async () => {
      while (!failed && !signal?.aborted) {
        const index = cursor++;
        if (index >= items.length) return;
        try {
          results[index] = await this.run<PromiseSettledResult<R>>(`${batchKey}:${index}`, async () => {
            signal?.throwIfAborted();
            try { return { status: 'fulfilled', value: await run(items[index], index) }; }
            catch (reason) { return { status: 'rejected', reason }; }
          });
        } catch (error) {
          // Admission failure must fail the listing, not masquerade as a missing file.
          failed = true;
          failure = error;
        }
      }
    }));
    signal?.throwIfAborted();
    if (failed) throw failure;
    return results;
  }

  private enqueue<T>(key: string, run: () => Promise<T>, background: boolean): Promise<T> {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return Promise.reject(new Error('Worker task key is required'));
    const existing = this.inFlight.get(normalizedKey);
    if (existing) {
      if (!background) {
        const waiting = this.queue.find(task => task.key === normalizedKey);
        if (waiting) { waiting.background = false; this.pump(); }
      }
      return existing as Promise<T>;
    }
    if (this.queue.length >= this.maxQueued && !background) {
      const speculative = this.queue.findLastIndex(task => task.background);
      if (speculative >= 0) {
        const [discarded] = this.queue.splice(speculative, 1);
        discarded.reject(new Error('Gallery prefetch superseded by a visible request'));
      }
    }
    if (this.queue.length >= this.maxQueued) return Promise.reject(new Error('Gallery worker queue is busy'));
    let task!: WorkerTask<T>;
    const taskPromise = new Promise<T>((resolve, reject) => {
      task = { key: normalizedKey, background, run, resolve, reject };
    }).finally(() => {
      if (this.inFlight.get(normalizedKey) === taskPromise) this.inFlight.delete(normalizedKey);
    });
    this.inFlight.set(normalizedKey, taskPromise);
    this.queue.push(task);
    this.pump();
    return taskPromise;
  }

  schedule<T>(key: string, run: () => Promise<T>) {
    if (this.queue.length >= this.maxQueued) return;
    this.enqueue(key, run, true).catch(() => undefined);
  }

  stats() {
    return { active: this.active, queued: this.queue.length, inFlight: this.inFlight.size,
      concurrency: this.concurrency, maxQueued: this.maxQueued, backgroundActive: this.backgroundActive };
  }

  private pump() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      let index = this.queue.findIndex(task => !task.background);
      // Leave decode capacity available for visible requests. A running native
      // decode cannot be preempted, but queued prefetch must not delay the UI.
      if (index < 0) {
        if (this.backgroundActive > 0) return;
        index = 0;
      }
      const [next] = this.queue.splice(index, 1);
      if (!next) continue;
      this.active += 1;
      if (next.background) this.backgroundActive++;
      Promise.resolve().then(next.run).then(next.resolve).catch(next.reject).finally(() => {
        this.active = Math.max(0, this.active - 1);
        if (next.background) this.backgroundActive--;
        this.pump();
      });
    }
  }
}
