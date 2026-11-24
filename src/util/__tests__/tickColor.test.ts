import { describe, expect, it } from 'vitest';
import {
  clearTickColor,
  getTickColor,
  resolveTickColor,
  setAllTickColors,
  setTickColor,
  tickCycle,
  uniformTickColor,
} from '../tickColor';

describe('resolveTickColor', () => {
  it('falls through to the gradient for every tick with no override', () => {
    for (let tick = 1; tick <= 4; tick++) {
      expect(resolveTickColor(tick, 4, {})).toBe(getTickColor(tick, 4));
      expect(resolveTickColor(tick, 4, undefined)).toBe(getTickColor(tick, 4));
    }
  });

  it('returns the override for the overridden tick only', () => {
    const overrides = { '2': '#00ff00' };

    expect(resolveTickColor(2, 4, overrides)).toBe('#00ff00');
    expect(resolveTickColor(1, 4, overrides)).toBe(getTickColor(1, 4));
    expect(resolveTickColor(3, 4, overrides)).toBe(getTickColor(3, 4));
  });

  // The sparse map is what lets a cycle-length change re-grade untouched ticks;
  // filling in every tick on the first pick would freeze them at the old length.
  it('re-grades untouched ticks when the cycle length changes, keeping the override fixed', () => {
    const overrides = { '2': '#00ff00' };

    expect(resolveTickColor(3, 4, overrides)).not.toBe(resolveTickColor(3, 8, overrides));
    expect(resolveTickColor(2, 8, overrides)).toBe('#00ff00');
  });
});

describe('tickCycle', () => {
  it('numbers the ticks from 1', () => {
    expect(tickCycle(4)).toEqual([1, 2, 3, 4]);
  });

  it.each([0, -3, Number.NaN])('is empty for a non-positive or unusable max of %s', (max) => {
    expect(tickCycle(max)).toEqual([]);
  });
});

describe('uniformTickColor', () => {
  it('reports the shared color when every tick is overridden to it', () => {
    expect(uniformTickColor(4, { '1': '#00ff00', '2': '#00ff00', '3': '#00ff00', '4': '#00ff00' })).toBe('#00ff00');
  });

  it('is null when one tick differs', () => {
    expect(uniformTickColor(4, { '1': '#00ff00', '2': '#ff0000', '3': '#00ff00', '4': '#00ff00' })).toBeNull();
  });

  it('is null when a tick is still on the gradient', () => {
    expect(uniformTickColor(4, { '1': '#00ff00', '2': '#00ff00', '3': '#00ff00' })).toBeNull();
  });

  it('ignores stale overrides for ticks beyond the current cycle', () => {
    expect(uniformTickColor(2, { '1': '#00ff00', '2': '#00ff00', '9': '#ff0000' })).toBe('#00ff00');
  });

  // Empty cycles must not be vacuously uniform: a corrupted stored tickCounterMax otherwise reports a uniform color that does not exist.
  it.each([0, -1])('is null for an empty cycle of max %s rather than vacuously uniform', (max) => {
    expect(uniformTickColor(max, { '1': '#00ff00' })).toBeNull();
  });
});

describe('tick color map edits', () => {
  it('recolors one tick without touching the others', () => {
    expect(setTickColor({ '1': '#111111' }, 3, '#00ff00')).toEqual({ '1': '#111111', '3': '#00ff00' });
  });

  // Stale keys are what let a player shorten the cycle and get their colors
  // back on lengthening it, so a single edit must not prune them.
  it('keeps overrides above the cycle length on a single edit', () => {
    expect(setTickColor({ '9': '#111111' }, 1, '#00ff00')).toEqual({ '9': '#111111', '1': '#00ff00' });
  });

  it('paints every tick of the cycle', () => {
    expect(setAllTickColors(3, '#00ff00')).toEqual({ '1': '#00ff00', '2': '#00ff00', '3': '#00ff00' });
  });

  // Merging instead would leave 9 red, so lengthening the cycle after a bulk set
  // would reveal a color the player had just painted over.
  it('replaces the map on a bulk set rather than merging into it', () => {
    expect(setAllTickColors(2, '#00ff00')).toEqual({ '1': '#00ff00', '2': '#00ff00' });
    expect(setTickColor({ '9': '#ff0000' }, 1, '#111111')['9']).toBe('#ff0000');
  });

  it('is empty for a bulk set on an unusable cycle length', () => {
    expect(setAllTickColors(0, '#00ff00')).toEqual({});
  });

  it('clears exactly one tick', () => {
    expect(clearTickColor({ '1': '#111111', '2': '#222222' }, 1)).toEqual({ '2': '#222222' });
  });

  it('returns the same object when the tick was already on the gradient', () => {
    const overrides = { '1': '#111111' };

    expect(clearTickColor(overrides, 2)).toBe(overrides);
  });
});
