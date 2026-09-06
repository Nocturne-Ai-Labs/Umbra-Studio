// Bound metadata work independently of the number of cards mounted in a picker.
export class ModelInfoRequestCache<T> {
  private cached = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  private waiting: Array<() => void> = [];
  private active = 0;

  constructor(
    private readonly ttl: (value: T) => number = () => 300_000,
    private readonly concurrency = 4,
    private readonly capacity = 512,
    private readonly now = Date.now,
  ) {}

  clear() {
    this.cached.clear();
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.cached.get(key);
    if (cached && cached.expires > this.now()) {
      this.cached.delete(key);
      this.cached.set(key, cached);
      return Promise.resolve(cached.value);
    }
    this.cached.delete(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const result = new Promise<T>((resolve, reject) => {
      this.waiting.push(() => {
        this.active += 1;
        void Promise.resolve().then(load).then((value) => {
          this.cached.set(key, { value, expires: this.now() + this.ttl(value) });
          while (this.cached.size > this.capacity) this.cached.delete(this.cached.keys().next().value!);
          return value;
        }).finally(() => {
          this.pending.delete(key);
          this.active -= 1;
          this.drain();
        }).then(resolve, reject);
      });
    });
    this.pending.set(key, result);
    this.drain();
    return result;
  }

  private drain() {
    while (this.active < this.concurrency && this.waiting.length) this.waiting.shift()!();
  }
}
