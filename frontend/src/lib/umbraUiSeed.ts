import type {
  PowerPrompterSeedControlMode,
  PowerPrompterSeedIncrement,
} from '@/types/powerPrompter';

export const UMBRA_UI_MAX_SEED = Number.MAX_SAFE_INTEGER;
export const UMBRA_UI_SEED_INCREMENT_OPTIONS: PowerPrompterSeedIncrement[] = [1, 100, 1000];

export function normalizeUmbraUiSeed(rawSeed: unknown, fallback = 0): number {
  const seed = Number(rawSeed);
  if (!Number.isFinite(seed)) return Math.max(0, Math.min(UMBRA_UI_MAX_SEED, Math.floor(fallback)));
  return Math.max(0, Math.min(UMBRA_UI_MAX_SEED, Math.floor(seed)));
}

export function normalizeUmbraUiSeedMode(rawMode: unknown): PowerPrompterSeedControlMode {
  const mode = String(rawMode || '').trim().toLowerCase();
  if (mode === 'increment' || mode === 'decrement' || mode === 'randomize') return mode;
  return 'fixed';
}

export function normalizeUmbraUiSeedIncrement(rawIncrement: unknown): PowerPrompterSeedIncrement {
  const increment = Number(rawIncrement);
  return UMBRA_UI_SEED_INCREMENT_OPTIONS.includes(increment as PowerPrompterSeedIncrement)
    ? increment as PowerPrompterSeedIncrement
    : 1;
}

export function createUmbraUiRandomSeed(random: () => number = Math.random): number {
  const sample = Number(random());
  const normalizedSample = Number.isFinite(sample) ? Math.max(0, Math.min(0.9999999999999999, sample)) : 0;
  return Math.max(1, Math.floor(normalizedSample * UMBRA_UI_MAX_SEED));
}

export function resolveUmbraUiQueueSeed(
  rawSeed: unknown,
  rawMode: unknown,
  random: () => number = Math.random,
): number {
  const mode = normalizeUmbraUiSeedMode(rawMode);
  return mode === 'randomize' ? createUmbraUiRandomSeed(random) : normalizeUmbraUiSeed(rawSeed);
}

export function advanceUmbraUiSeed(
  queuedSeed: unknown,
  rawMode: unknown,
  rawIncrement: unknown = 1,
  rawCount: unknown = 1,
  random: () => number = Math.random,
): number {
  const seed = normalizeUmbraUiSeed(queuedSeed);
  const mode = normalizeUmbraUiSeedMode(rawMode);
  if (mode === 'increment') {
    const count = Math.max(1, Math.floor(Number(rawCount) || 1));
    return Math.min(
      UMBRA_UI_MAX_SEED,
      seed + normalizeUmbraUiSeedIncrement(rawIncrement) * count,
    );
  }
  if (mode === 'decrement') return Math.max(0, seed - 1);
  if (mode === 'randomize') return createUmbraUiRandomSeed(random);
  return seed;
}
