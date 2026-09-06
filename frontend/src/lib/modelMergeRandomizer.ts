export const BLOCK_MIX_RANDOM_MODES = [
  { id: 'light', label: 'Light', spread: 10 },
  { id: 'medium', label: 'Medium', spread: 25 },
  { id: 'heavy', label: 'Heavy', spread: 50 },
] as const;

export type BlockMixRandomMode = typeof BLOCK_MIX_RANDOM_MODES[number]['id'];

export function blockMixRandomRange(ratio: number, mode: BlockMixRandomMode) {
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 100) throw new Error('Global blend must be between 0 and 100.');
  const setting = BLOCK_MIX_RANDOM_MODES.find(item => item.id === mode);
  if (!setting) throw new Error('Unknown block randomization mode.');
  return { min: Math.ceil(Math.max(0, ratio - setting.spread)), max: Math.floor(Math.min(100, ratio + setting.spread)) };
}

export function randomizeBlockMix(values: Record<string, number>, count: number, ratio: number, mode: BlockMixRandomMode, selected: number[] = [], random: () => number = Math.random): Record<string, number> {
  if (!Number.isInteger(count) || count < 1 || count > 4096) throw new Error('Unsupported block count.');
  const { min, max } = blockMixRandomRange(ratio, mode);
  const targets = selected.length ? [...new Set(selected)].filter(index => Number.isInteger(index) && index >= 0 && index < count) : Array.from({ length: count }, (_, index) => index);
  const next = { ...values };
  for (const index of targets) {
    const roll = random();
    if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid random sample.');
    // Sample the bounded interval directly, avoiding piles of clipped endpoint values.
    next[index] = (min + Math.floor(roll * (max - min + 1))) / 100;
  }
  return next;
}
