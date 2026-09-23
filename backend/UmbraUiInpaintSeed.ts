export function resolveUmbraUiInpaintBaseSeed(
  requestedSeed: unknown,
  seedIncrement: number,
  samples: number,
  randomSeed: () => number,
): number {
  const seed = requestedSeed === null || requestedSeed === undefined || requestedSeed === ''
    ? NaN
    : Number(requestedSeed);
  if (!Number.isFinite(seed) || seed < 0) return randomSeed();
  const maximumBase = Number.MAX_SAFE_INTEGER - seedIncrement * Math.max(0, samples - 1);
  return Math.min(maximumBase, Math.floor(seed));
}
