export function allocateWholePercentages(weights: number[], total = 100): number[] {
  if (weights.length === 0) return [];
  const normalizedWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = weightTotal > 0 ? normalizedWeights : normalizedWeights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0) || effectiveWeights.length;
  const raw = effectiveWeights.map((weight) => (weight / effectiveTotal) * total);
  const values = raw.map((value) => Math.floor(value));
  let remainder = total - values.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let index = 0; index < order.length && remainder > 0; index += 1) {
    values[order[index].index] += 1;
    remainder -= 1;
  }
  return values;
}

export function toggleWildcardOptionEnabled<T extends { id: string; enabled: boolean; chance: number }>(
  options: T[],
  optionId: string,
): T[] {
  if (!options.some((option) => option.id === optionId)) return options;
  const toggled = options.map((option) => option.id === optionId ? { ...option, enabled: !option.enabled } : option);
  const chances = allocateWholePercentages(toggled.filter((option) => option.enabled).map((option) => option.chance));
  let activeIndex = 0;
  return toggled.map((option) => option.enabled ? { ...option, chance: chances[activeIndex++] } : option);
}

export function normalizeStoredWildcardOptionChances<T extends { enabled: boolean; chance: number }>(options: T[]): T[] {
  const enabled = options.filter((option) => option.enabled);
  if (enabled.length === 0 || enabled.some((option) => option.chance > 0)) return options;
  const chances = allocateWholePercentages(enabled.map(() => 1));
  let activeIndex = 0;
  return options.map((option) => option.enabled ? { ...option, chance: chances[activeIndex++] } : option);
}
