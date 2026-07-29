import { describe, expect, test } from 'bun:test';
import { normalizeThemeTextScale } from './useThemeStore';

describe('theme text sizing', () => {
  test('keeps the numeric control on readable five-percent steps', () => {
    expect(normalizeThemeTextScale(113)).toBe(115);
    expect(normalizeThemeTextScale(10)).toBe(85);
    expect(normalizeThemeTextScale(900)).toBe(140);
  });

  test('preserves the default for missing or malformed settings', () => {
    expect(normalizeThemeTextScale(undefined)).toBe(100);
    expect(normalizeThemeTextScale('not-a-size', 105)).toBe(105);
  });
});
