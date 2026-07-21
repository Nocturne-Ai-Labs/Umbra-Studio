export class UmbraWeightedLruCache<Key, Value> {
  private readonly entries = new Map<Key, { value: Value; weight: number }>();
  private totalWeightValue = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxWeight: number,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  get totalWeight(): number {
    return this.totalWeightValue;
  }

  get(key: Key): Value | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: Key, value: Value, weight = 0): void {
    this.delete(key);
    const normalizedWeight = Math.max(0, Number.isFinite(weight) ? weight : 0);
    this.entries.set(key, { value, weight: normalizedWeight });
    this.totalWeightValue += normalizedWeight;
    this.prune();
  }

  updateWeight(key: Key, weight: number): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.totalWeightValue -= entry.weight;
    entry.weight = Math.max(0, Number.isFinite(weight) ? weight : 0);
    this.totalWeightValue += entry.weight;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.prune();
  }

  delete(key: Key): boolean {
    const entry = this.entries.get(key);
    if (!entry) return false;
    this.totalWeightValue -= entry.weight;
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.totalWeightValue = 0;
  }

  private prune(): void {
    const entryLimit = Math.max(1, Math.round(this.maxEntries) || 1);
    const weightLimit = Math.max(0, Number.isFinite(this.maxWeight) ? this.maxWeight : 0);
    while (
      this.entries.size > 1
      && (this.entries.size > entryLimit || this.totalWeightValue > weightLimit)
    ) {
      const oldestKey = this.entries.keys().next().value as Key | undefined;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
    }
  }
}
