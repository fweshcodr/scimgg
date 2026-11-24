import { describe, expect, it } from 'vitest';
import { PrayerType } from '../../../types/simulation';
import { BYPASS_PROTECTION_PRAYER, calculatePrayerDamage, didPrayCorrectly, resolveDamage } from '../damageCalculation';

describe('damageCalculation', () => {
  describe('calculatePrayerDamage', () => {
    it('returns 0 when baseDamage is 0', () => {
      expect(calculatePrayerDamage(0, 'magic', PrayerType.ProtectMagic)).toBe(0);
    });

    it('returns baseDamage when attackType is missing', () => {
      expect(calculatePrayerDamage(10, undefined, PrayerType.ProtectMagic)).toBe(10);
    });

    it('returns baseDamage when activePrayer is missing', () => {
      expect(calculatePrayerDamage(10, 'magic', null)).toBe(10);
    });

    it('returns baseDamage for typeless attacks', () => {
      expect(calculatePrayerDamage(10, 'typeless', PrayerType.ProtectMagic)).toBe(10);
    });

    it('returns 0 for correct prayer with block reduction', () => {
      expect(calculatePrayerDamage(10, 'magic', PrayerType.ProtectMagic, { type: 'block' })).toBe(0);
    });

    it('caps damage at 3 for correct prayer with cap and baseDamage 10', () => {
      expect(calculatePrayerDamage(10, 'magic', PrayerType.ProtectMagic, { type: 'cap', value: 3 })).toBe(3);
    });

    it('returns min(cap, baseDamage) for correct prayer with cap and baseDamage 2', () => {
      expect(calculatePrayerDamage(2, 'magic', PrayerType.ProtectMagic, { type: 'cap', value: 3 })).toBe(2);
    });

    it('reduces damage by percentage for correct prayer with reduce', () => {
      expect(calculatePrayerDamage(11, 'magic', PrayerType.ProtectMagic, { type: 'reduce', value: 0.5 })).toBe(5);
    });

    it('floors the penetrating share rather than subtracting the floored blocked share', () => {
      const leak = (damage: number, value: number) =>
        calculatePrayerDamage(damage, 'range', PrayerType.ProtectRange, { type: 'reduce', value });

      // Every case below separates the two roundings at the same configured rate, and each is a
      // number the captures or the wiki actually pin. Under the subtract-blocked form these all
      // come out one HIGHER, which can make a wrong rate look right.
      expect(leak(53, 0.12)).toBe(6); // the glyphic captures' largest prayed leak
      expect(leak(46, 0.08)).toBe(3); // "magic and ranged ... max hit of 3" (wiki, Yama § Phase 3)
      expect(leak(56, 0.17)).toBe(9); // both sensory captures' largest prayed leak
      expect(leak(46, 0.48)).toBe(22); // "melee ... up to 22 through prayer" (wiki, Phase 3)

      // THE shape difference, and the measurement that chose it: a low roll leaks NOTHING, where
      // subtracting the blocked share can only ever zero a roll of 0. 20 of 59 prayed autos read
      // 0 on base Yama with no armour, which only this form explains.
      expect(leak(12, 0.08)).toBe(0);
      expect(leak(1, 0.5)).toBe(0);
      // An exact multiple must not gain a point: 8% of 50 is 4, not 5.
      expect(leak(50, 0.08)).toBe(4);
      expect(leak(0, 0.12)).toBe(0);
    });

    it('returns baseDamage for correct prayer with bypass', () => {
      expect(calculatePrayerDamage(10, 'magic', PrayerType.ProtectMagic, { type: 'bypass' })).toBe(10);
    });

    it('returns baseDamage for wrong prayer', () => {
      expect(calculatePrayerDamage(10, 'magic', PrayerType.ProtectRange, { type: 'block' })).toBe(10);
    });

    it('defaults to block reduction when prayerReduction is missing', () => {
      expect(calculatePrayerDamage(10, 'magic', PrayerType.ProtectMagic)).toBe(0);
    });

    it('BYPASS_PROTECTION_PRAYER lets a melee hit through at full damage despite Protect-from-Melee', () => {
      expect(BYPASS_PROTECTION_PRAYER).toEqual({ type: 'bypass' });
      expect(calculatePrayerDamage(30, 'melee', PrayerType.ProtectMelee, BYPASS_PROTECTION_PRAYER)).toBe(30);
      expect(calculatePrayerDamage(30, 'melee', PrayerType.ProtectMelee)).toBe(0);
    });
  });

  describe('didPrayCorrectly', () => {
    it('returns true for magic attack with ProtectMagic', () => {
      expect(didPrayCorrectly('magic', PrayerType.ProtectMagic)).toBe(true);
    });

    it('returns true for range attack with ProtectRange', () => {
      expect(didPrayCorrectly('range', PrayerType.ProtectRange)).toBe(true);
    });

    it('returns true for melee attack with ProtectMelee', () => {
      expect(didPrayCorrectly('melee', PrayerType.ProtectMelee)).toBe(true);
    });

    it('returns false for wrong prayer combinations', () => {
      expect(didPrayCorrectly('magic', PrayerType.ProtectRange)).toBe(false);
      expect(didPrayCorrectly('range', PrayerType.ProtectMelee)).toBe(false);
      expect(didPrayCorrectly('melee', PrayerType.ProtectMagic)).toBe(false);
    });

    it('returns false for null activePrayer', () => {
      expect(didPrayCorrectly('magic', null)).toBe(false);
    });
  });

  describe('resolveDamage', () => {
    it('returns a plain number as-is', () => {
      expect(resolveDamage(42)).toBe(42);
    });

    it('returns 0 for plain 0', () => {
      expect(resolveDamage(0)).toBe(0);
    });

    it('returns min when min equals max', () => {
      expect(resolveDamage([5, 5])).toBe(5);
    });

    it('returns min when min > max (degenerate range)', () => {
      expect(resolveDamage([10, 5])).toBe(10);
    });

    it('returns a value within [min, max] inclusive for a range', () => {
      const results = new Set<number>();
      for (let i = 0; i < 500; i++) {
        results.add(resolveDamage([3, 7]));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(3);
        expect(r).toBeLessThanOrEqual(7);
      }
      expect(results.size).toBeGreaterThanOrEqual(3);
    });

    it('returns a value within [0, maxHit] for typical NPC attack range', () => {
      const results = new Set<number>();
      for (let i = 0; i < 200; i++) {
        results.add(resolveDamage([0, 40]));
      }
      for (const r of results) {
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(40);
      }
      expect(results.size).toBeGreaterThanOrEqual(10);
    });
  });
});
