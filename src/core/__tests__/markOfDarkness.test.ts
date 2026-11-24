import { describe, expect, it } from 'vitest';
import { createDefaultTimers, MARK_OF_DARKNESS_COOLDOWN_TICKS } from '../../types/playerState';
import { castMarkOfDarkness, tickCombatTimers } from '../timers';

describe('Mark of Darkness', () => {
  describe('castMarkOfDarkness', () => {
    it('sets duration to magicLevel * 3 ticks without Purging Staff', () => {
      const timers = createDefaultTimers();
      const result = castMarkOfDarkness(99, false, timers);

      expect(result).not.toBeNull();
      expect(result!.markOfDarknessActiveTicks).toBe(99 * 3);
    });

    it('sets duration to magicLevel * 15 ticks with Purging Staff', () => {
      const timers = createDefaultTimers();
      const result = castMarkOfDarkness(99, true, timers);

      expect(result).not.toBeNull();
      expect(result!.markOfDarknessActiveTicks).toBe(99 * 3 * 5);
    });

    it('sets cooldown to MARK_OF_DARKNESS_COOLDOWN_TICKS on cast', () => {
      const timers = createDefaultTimers();
      const result = castMarkOfDarkness(99, false, timers);

      expect(result).not.toBeNull();
      expect(result!.markOfDarknessCooldownTicks).toBe(MARK_OF_DARKNESS_COOLDOWN_TICKS);
    });

    it('returns null when on cooldown', () => {
      const timers = { ...createDefaultTimers(), markOfDarknessCooldownTicks: 5 };
      const result = castMarkOfDarkness(99, false, timers);

      expect(result).toBeNull();
    });

    it('returns null when cooldown is exactly 1 tick remaining', () => {
      const timers = { ...createDefaultTimers(), markOfDarknessCooldownTicks: 1 };
      const result = castMarkOfDarkness(99, false, timers);

      expect(result).toBeNull();
    });

    it('allows recast when cooldown reaches 0', () => {
      const timers = { ...createDefaultTimers(), markOfDarknessCooldownTicks: 0 };
      const result = castMarkOfDarkness(99, false, timers);

      expect(result).not.toBeNull();
      expect(result!.markOfDarknessActiveTicks).toBe(297);
    });

    it('resets duration when recast while already active', () => {
      const timers = {
        ...createDefaultTimers(),
        markOfDarknessActiveTicks: 100,
        markOfDarknessCooldownTicks: 0,
      };

      const result = castMarkOfDarkness(99, false, timers);

      expect(result).not.toBeNull();
      expect(result!.markOfDarknessActiveTicks).toBe(297);
      expect(result!.markOfDarknessCooldownTicks).toBe(MARK_OF_DARKNESS_COOLDOWN_TICKS);
    });

    it('uses base magic level for duration at lower levels', () => {
      const timers = createDefaultTimers();
      const result = castMarkOfDarkness(59, false, timers);

      expect(result).not.toBeNull();
      expect(result!.markOfDarknessActiveTicks).toBe(59 * 3);
    });

    it('snapshots Purging Staff at cast time only', () => {
      const timers = createDefaultTimers();

      const withStaff = castMarkOfDarkness(99, true, timers);
      expect(withStaff!.markOfDarknessActiveTicks).toBe(1485);

      const withoutStaff = castMarkOfDarkness(99, false, timers);
      expect(withoutStaff!.markOfDarknessActiveTicks).toBe(297);
    });
  });

  describe('tickCombatTimers - MoD fields', () => {
    it('decrements markOfDarknessActiveTicks each tick', () => {
      const timers = { ...createDefaultTimers(), markOfDarknessActiveTicks: 100 };
      const ticked = tickCombatTimers(timers);

      expect(ticked.markOfDarknessActiveTicks).toBe(99);
    });

    it('decrements markOfDarknessCooldownTicks each tick', () => {
      const timers = { ...createDefaultTimers(), markOfDarknessCooldownTicks: 5 };
      const ticked = tickCombatTimers(timers);

      expect(ticked.markOfDarknessCooldownTicks).toBe(4);
    });

    it('does not decrement below 0', () => {
      const timers = { ...createDefaultTimers(), markOfDarknessActiveTicks: 0, markOfDarknessCooldownTicks: 0 };
      const ticked = tickCombatTimers(timers);

      expect(ticked.markOfDarknessActiveTicks).toBe(0);
      expect(ticked.markOfDarknessCooldownTicks).toBe(0);
    });

    it('drains full duration over correct number of ticks', () => {
      let timers = { ...createDefaultTimers(), markOfDarknessActiveTicks: 297 };

      for (let i = 0; i < 297; i++) {
        timers = tickCombatTimers(timers);
      }

      expect(timers.markOfDarknessActiveTicks).toBe(0);
    });

    it('cooldown expires and allows recast after correct number of ticks', () => {
      let timers = createDefaultTimers();
      const castResult = castMarkOfDarkness(99, false, timers)!;
      timers = castResult;

      expect(castMarkOfDarkness(99, false, timers)).toBeNull();

      for (let i = 0; i < MARK_OF_DARKNESS_COOLDOWN_TICKS; i++) {
        timers = tickCombatTimers(timers);
      }

      expect(timers.markOfDarknessCooldownTicks).toBe(0);
      expect(castMarkOfDarkness(99, false, timers)).not.toBeNull();
    });
  });
});
