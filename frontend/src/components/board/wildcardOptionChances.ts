export function allocateWholePercentages(weights: number[], total = 100): number[] {
  if (weights.length === 0) return [];
  if (!Number.isFinite(total) || total <= 0) return weights.map(() => 0);
  const normalizedWeights = weights.map((weight) => Math.max(0, Number(weight) || 0));
  const weightTotal = normalizedWeights.reduce((sum, weight) => sum + weight, 0);
  const effectiveWeights = weightTotal > 0 ? normalizedWeights : normalizedWeights.map(() => 1);
  const effectiveTotal = effectiveWeights.reduce((sum, weight) => sum + weight, 0) || effectiveWeights.length;
  // More enabled lines than percentage points need fractional chances so a
  // positive line does not become unselectable through integer rounding.
  if (weights.length > total || !Number.isInteger(total)) {
    return effectiveWeights.map((weight) => (weight / effectiveTotal) * total);
  }
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
  if (values.some((value, index) => value === 0 && effectiveWeights[index] > 0)) {
    return raw;
  }
  return values;
}

export function toggleWildcardOptionEnabled<T extends { id: string; enabled: boolean; chance: number }>(
  options: T[],
  optionId: string,
): T[] {
  const current = options.find((option) => option.id === optionId);
  if (!current) return options;
  const toggled = options.map((option) => option.id === optionId ? { ...option, enabled: !option.enabled } : option);
  if (!current.enabled && !(current.chance > 0)) {
    const others = options.filter((option) => option.enabled);
    const enabledCount = others.length + 1;
    const newChance = enabledCount <= 100
      ? Math.max(1, Math.round(100 / enabledCount))
      : 100 / enabledCount;
    const otherChances = allocateWholePercentages(others.map((option) => option.chance), 100 - newChance);
    let otherIndex = 0;
    return toggled.map((option) => {
      if (option.id === optionId) return { ...option, chance: newChance };
      return option.enabled ? { ...option, chance: otherChances[otherIndex++] } : option;
    });
  }
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
