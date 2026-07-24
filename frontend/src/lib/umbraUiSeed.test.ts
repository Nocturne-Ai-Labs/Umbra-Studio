import { describe, expect, test } from 'bun:test';
import {
  UMBRA_UI_MAX_SEED,
  advanceUmbraUiSeed,
  normalizeUmbraUiSeed,
  normalizeUmbraUiSeedIncrement,
  normalizeUmbraUiSeedMode,
  resolveUmbraUiQueueSeed,
} from './umbraUiSeed';

describe('Umbra UI seed controls', () => {
  test('normalizes seeds and modes', () => {
    expect(normalizeUmbraUiSeed('42.9')).toBe(42);
    expect(normalizeUmbraUiSeed(-1)).toBe(0);
    expect(normalizeUmbraUiSeed(UMBRA_UI_MAX_SEED + 100)).toBe(UMBRA_UI_MAX_SEED);
    expect(normalizeUmbraUiSeedMode('increment')).toBe('increment');
    expect(normalizeUmbraUiSeedMode('unknown')).toBe('fixed');
    expect(normalizeUmbraUiSeedIncrement(1)).toBe(1);
    expect(normalizeUmbraUiSeedIncrement(100)).toBe(100);
    expect(normalizeUmbraUiSeedIncrement(1000)).toBe(1000);
    expect(normalizeUmbraUiSeedIncrement(10_000)).toBe(1);
  });

  test('advances fixed, increment, and decrement modes', () => {
    expect(advanceUmbraUiSeed(10, 'fixed')).toBe(10);
    expect(advanceUmbraUiSeed(10, 'increment')).toBe(11);
    expect(advanceUmbraUiSeed(10, 'increment', 100)).toBe(110);
    expect(advanceUmbraUiSeed(10, 'increment', 1000, 3)).toBe(3010);
    expect(advanceUmbraUiSeed(10, 'decrement')).toBe(9);
    expect(advanceUmbraUiSeed(0, 'decrement')).toBe(0);
    expect(advanceUmbraUiSeed(UMBRA_UI_MAX_SEED - 10, 'increment', 1000)).toBe(UMBRA_UI_MAX_SEED);
  });

  test('resolves a fresh seed in randomize mode', () => {
    expect(resolveUmbraUiQueueSeed(10, 'randomize', () => 0.5)).toBe(Math.floor(UMBRA_UI_MAX_SEED * 0.5));
    expect(resolveUmbraUiQueueSeed(10, 'increment', () => 0.5)).toBe(10);
  });
});
