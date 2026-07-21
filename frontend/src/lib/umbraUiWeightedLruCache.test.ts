import { describe, expect, test } from 'bun:test';
import { UmbraWeightedLruCache } from './umbraUiWeightedLruCache';

describe('Umbra weighted LRU cache', () => {
  test('evicts the least recently used entry by count', () => {
    const cache = new UmbraWeightedLruCache<string, number>(2, 100);
    cache.set('a', 1, 10);
    cache.set('b', 2, 10);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3, 10);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  test('evicts decoded assets after their measured weight exceeds the budget', () => {
    const cache = new UmbraWeightedLruCache<string, string>(10, 100);
    cache.set('small-a', 'a');
    cache.set('small-b', 'b', 40);
    cache.updateWeight('small-a', 70);
    expect(cache.get('small-b')).toBeUndefined();
    expect(cache.get('small-a')).toBe('a');
    expect(cache.totalWeight).toBe(70);
  });

  test('retains one oversized active asset instead of evicting everything', () => {
    const cache = new UmbraWeightedLruCache<string, string>(10, 100);
    cache.set('old', 'old', 30);
    cache.set('8k', 'large', 300);
    expect(cache.size).toBe(1);
    expect(cache.get('8k')).toBe('large');
    expect(cache.totalWeight).toBe(300);
  });

  test('clear resets entries and accounting', () => {
    const cache = new UmbraWeightedLruCache<string, number>(4, 100);
    cache.set('a', 1, 60);
    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.totalWeight).toBe(0);
  });
});
