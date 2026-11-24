import { describe, expect, it } from 'vitest';
import {
  COMPACT_ORB_IDS,
  COMPACT_ORB_LABELS,
  COMPACT_ORBS_LAYOUT_LABELS,
  COMPACT_ORBS_LAYOUTS,
  type CompactOrbId,
  DEFAULT_COMPACT_ORBS_LAYOUT,
  DEFAULT_COMPACT_ORBS_ORDER,
  isCompactOrbsOrder,
  isDefaultCompactOrbsOrder,
  normalizeCompactOrbsLayout,
  normalizeCompactOrbsOrder,
  swapCompactOrbs,
} from '../compactOrbs';

describe('normalizeCompactOrbsLayout', () => {
  it.each(COMPACT_ORBS_LAYOUTS)('keeps the known layout %s', (layout) => {
    expect(normalizeCompactOrbsLayout(layout)).toBe(layout);
  });

  it.each([undefined, null, '', 'diagonal', 42, {}, ['vertical']])('falls back to the default for %s', (value) => {
    expect(normalizeCompactOrbsLayout(value)).toBe(DEFAULT_COMPACT_ORBS_LAYOUT);
  });
});

describe('normalizeCompactOrbsOrder', () => {
  it('keeps a valid stored order as-is', () => {
    const stored: CompactOrbId[] = ['special', 'run', 'prayer', 'hitpoints'];
    expect(normalizeCompactOrbsOrder(stored)).toEqual(stored);
  });

  it('appends missing orbs in canonical order', () => {
    expect(normalizeCompactOrbsOrder(['special'])).toEqual(['special', 'hitpoints', 'prayer', 'run']);
  });

  it('drops duplicates, keeping the first occurrence', () => {
    expect(normalizeCompactOrbsOrder(['run', 'run', 'prayer'])).toEqual(['run', 'prayer', 'hitpoints', 'special']);
  });

  it('drops unknown entries', () => {
    expect(normalizeCompactOrbsOrder(['run', 'woodcutting', null, 7, 'prayer'])).toEqual([
      'run',
      'prayer',
      'hitpoints',
      'special',
    ]);
  });

  it.each([undefined, null, 'run', 42, {}])('returns the canonical order for the non-array %s', (value) => {
    expect(normalizeCompactOrbsOrder(value)).toEqual([...DEFAULT_COMPACT_ORBS_ORDER]);
  });

  it('always returns a permutation of every orb id', () => {
    for (const value of [undefined, [], ['run', 'run', 'run'], ['nope'], ['special', 'special', 'prayer']]) {
      const result = normalizeCompactOrbsOrder(value);
      expect(isCompactOrbsOrder(result)).toBe(true);
    }
  });

  it('returns a fresh array so callers cannot mutate the default', () => {
    const first = normalizeCompactOrbsOrder(undefined);
    first[0] = 'special';
    expect(normalizeCompactOrbsOrder(undefined)).toEqual([...DEFAULT_COMPACT_ORBS_ORDER]);
  });
});

describe('swapCompactOrbs', () => {
  it('swaps two slots', () => {
    expect(swapCompactOrbs(DEFAULT_COMPACT_ORBS_ORDER, 0, 3)).toEqual(['special', 'prayer', 'run', 'hitpoints']);
  });

  it('is a no-op when both slots are the same', () => {
    expect(swapCompactOrbs(DEFAULT_COMPACT_ORBS_ORDER, 2, 2)).toEqual([...DEFAULT_COMPACT_ORBS_ORDER]);
  });

  it.each([
    [-1, 2],
    [0, 4],
    [4, 0],
    [0, -1],
  ])('is a no-op for out-of-range slots %s, %s', (a, b) => {
    expect(swapCompactOrbs(DEFAULT_COMPACT_ORBS_ORDER, a, b)).toEqual([...DEFAULT_COMPACT_ORBS_ORDER]);
  });

  it('does not mutate the input', () => {
    const input: CompactOrbId[] = [...DEFAULT_COMPACT_ORBS_ORDER];
    swapCompactOrbs(input, 0, 1);
    expect(input).toEqual([...DEFAULT_COMPACT_ORBS_ORDER]);
  });

  it('preserves the permutation invariant', () => {
    expect(isCompactOrbsOrder(swapCompactOrbs(DEFAULT_COMPACT_ORBS_ORDER, 1, 3))).toBe(true);
  });
});

describe('isCompactOrbsOrder', () => {
  it('accepts any permutation', () => {
    expect(isCompactOrbsOrder(['run', 'special', 'hitpoints', 'prayer'])).toBe(true);
  });

  it.each([
    [[], 'empty'],
    [['hitpoints', 'prayer', 'run'], 'missing an orb'],
    [['hitpoints', 'hitpoints', 'prayer', 'run'], 'duplicated'],
    [['hitpoints', 'prayer', 'run', 'special', 'special'], 'too long'],
  ])('rejects %s (%s)', (order) => {
    expect(isCompactOrbsOrder(order as CompactOrbId[])).toBe(false);
  });
});

describe('isDefaultCompactOrbsOrder', () => {
  it('accepts the canonical order', () => {
    expect(isDefaultCompactOrbsOrder([...DEFAULT_COMPACT_ORBS_ORDER])).toBe(true);
  });

  it('rejects a reordered permutation', () => {
    expect(isDefaultCompactOrbsOrder(['prayer', 'hitpoints', 'run', 'special'])).toBe(false);
  });

  it('rejects a short order', () => {
    expect(isDefaultCompactOrbsOrder(['hitpoints', 'prayer'])).toBe(false);
  });
});

describe('labels', () => {
  it('names every orb', () => {
    for (const id of COMPACT_ORB_IDS) {
      expect(COMPACT_ORB_LABELS[id]).toBeTruthy();
    }
  });

  it('names every layout', () => {
    for (const layout of COMPACT_ORBS_LAYOUTS) {
      expect(COMPACT_ORBS_LAYOUT_LABELS[layout]).toBeTruthy();
    }
  });
});
