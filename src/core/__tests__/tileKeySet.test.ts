import { describe, expect, it } from 'vitest';
import { TileKeySet, TileKeySetCache } from '../tileKeySet';

function stringSet(coords: [number, number][]): Set<string> {
  return new Set(coords.map(([x, y]) => `${x},${y}`));
}

describe('TileKeySet', () => {
  it('matches the source set for member and non-member tiles', () => {
    const source = stringSet([
      [0, 0],
      [31, 25],
      [63, 63],
    ]);
    const lookup = new TileKeySet(source);

    for (const [x, y] of [
      [0, 0],
      [31, 25],
      [63, 63],
    ] as [number, number][]) {
      expect(lookup.has(x, y)).toBe(true);
    }
    for (const [x, y] of [
      [1, 0],
      [0, 1],
      [30, 25],
      [31, 26],
      [64, 64],
    ] as [number, number][]) {
      expect(lookup.has(x, y)).toBe(false);
    }
  });

  it('does not confuse tiles whose coordinates transpose or concatenate', () => {
    const lookup = new TileKeySet(stringSet([[1, 23]]));

    expect(lookup.has(1, 23)).toBe(true);
    expect(lookup.has(23, 1)).toBe(false);
    expect(lookup.has(12, 3)).toBe(false);
    expect(lookup.has(123, 0)).toBe(false);
  });

  it('handles negative coordinates', () => {
    const lookup = new TileKeySet(
      stringSet([
        [-1, -1],
        [-5, 7],
      ]),
    );

    expect(lookup.has(-1, -1)).toBe(true);
    expect(lookup.has(-5, 7)).toBe(true);
    expect(lookup.has(1, 1)).toBe(false);
    expect(lookup.has(5, -7)).toBe(false);
  });

  it('falls back to the string set for keys it cannot pack', () => {
    const source = new Set(['3,4', '999999,0', 'malformed']);
    const lookup = new TileKeySet(source);

    expect(lookup.has(3, 4)).toBe(true);
    expect(lookup.has(999999, 0)).toBe(true);
    expect(lookup.has(4, 3)).toBe(false);
  });

  it('rejects fractional probes that would stringify onto a member key', () => {
    const lookup = new TileKeySet(stringSet([[2, 3]]));

    expect(lookup.has(2, 3)).toBe(true);
    expect(lookup.has(2.5, 3)).toBe(false);
  });

  it('does not treat non-canonical source spellings as members', () => {
    // `Number()` happily parses all of these, but the source set does not contain
    // the canonical key, so neither may the mirror.
    for (const key of ['01,2', '+1,2', '1.0,2', ' 1,2', '1, 2', '-0,2']) {
      const source = new Set([key]);
      const lookup = new TileKeySet(source);
      expect(lookup.has(1, 2)).toBe(source.has('1,2'));
      expect(lookup.has(0, 2)).toBe(source.has('0,2'));
    }
  });

  it('still answers canonical keys when a non-canonical key is present', () => {
    const lookup = new TileKeySet(new Set(['01,2', '5,6']));

    expect(lookup.has(5, 6)).toBe(true);
    expect(lookup.has(1, 2)).toBe(false);
  });
});

describe('TileKeySetCache', () => {
  it('reuses the mirror for the same source set', () => {
    const cache = new TileKeySetCache();
    const source = stringSet([[1, 1]]);

    expect(cache.get(source)).toBe(cache.get(source));
  });

  it('rebuilds when the source set is replaced', () => {
    const cache = new TileKeySetCache();
    const first = stringSet([[1, 1]]);
    const second = stringSet([[2, 2]]);

    expect(cache.get(first).has(1, 1)).toBe(true);
    expect(cache.get(second).has(1, 1)).toBe(false);
    expect(cache.get(second).has(2, 2)).toBe(true);
  });

  it('rebuilds when the source set changes size in place', () => {
    const cache = new TileKeySetCache();
    const source = stringSet([[1, 1]]);

    expect(cache.get(source).has(4, 4)).toBe(false);
    source.add('4,4');
    expect(cache.get(source).has(4, 4)).toBe(true);
    source.delete('1,1');
    expect(cache.get(source).has(1, 1)).toBe(false);
  });

  it('does NOT see a same-size in-place edit - the documented precondition', () => {
    // Detecting this would need an O(n) scan per probe, which is the cost the
    // mirror exists to remove. Published walkable sets are immutable; this test
    // pins the limitation so the precondition cannot be forgotten silently.
    const cache = new TileKeySetCache();
    const source = stringSet([[1, 1]]);
    expect(cache.get(source).has(1, 1)).toBe(true);

    source.delete('1,1');
    source.add('9,9');

    expect(source.size).toBe(1);
    expect(cache.get(source).has(9, 9)).toBe(false);
    expect(cache.get(source).has(1, 1)).toBe(true);
  });

  it('advances revision on every rebuild and never on a hit', () => {
    const cache = new TileKeySetCache();
    const first = stringSet([[1, 1]]);

    cache.get(first);
    const afterFirst = cache.revision;
    cache.get(first);
    expect(cache.revision).toBe(afterFirst);

    cache.get(stringSet([[2, 2]]));
    expect(cache.revision).toBeGreaterThan(afterFirst);

    const afterSecond = cache.revision;
    cache.clear();
    expect(cache.revision).toBeGreaterThan(afterSecond);
  });

  it('rebuilds after clear()', () => {
    const cache = new TileKeySetCache();
    const source = stringSet([[1, 1]]);
    const first = cache.get(source);

    cache.clear();
    expect(cache.get(source)).not.toBe(first);
    expect(cache.get(source).has(1, 1)).toBe(true);
  });
});
