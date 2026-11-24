import { describe, expect, it } from 'vitest';
import { type DamageHistoryEntry, PrayerType } from '../../types/simulation';
import { formatSource, getPrayerCell, mapFailedCondition } from '../DeathModal';

const makeEntry = (overrides: Partial<DamageHistoryEntry> = {}): DamageHistoryEntry => ({
  tick: 1,
  source: 'Death',
  targetId: 'player',
  baseDamage: 0,
  attackType: 'melee',
  activePrayer: null,
  prayedCorrectly: null,
  effectiveDamage: 0,
  hpBefore: 99,
  hpAfter: 99,
  ...overrides,
});

describe('DeathModal helpers', () => {
  describe('mapFailedCondition', () => {
    it('maps known and fallback fail conditions', () => {
      expect(mapFailedCondition('Death')).toBe('Slain in combat');
      expect(mapFailedCondition('WaveDamage')).toBe('Consumed by the wave');
      expect(mapFailedCondition('')).toBe('Slain in combat');
      expect(mapFailedCondition('SomethingNew')).toBe('Something New');
    });
  });

  describe('formatSource', () => {
    it('maps known and fallback source labels', () => {
      expect(formatSource('YamaAttack')).toBe('Yama');
      expect(formatSource('VoidFlare')).toBe('Void flare');
      expect(formatSource('ZukSpark')).toBe('Healer spark');
      expect(formatSource('NewSource')).toBe('New Source');
    });
  });

  describe('getPrayerCell', () => {
    it('formats protection prayer labels and defaults', () => {
      expect(getPrayerCell(makeEntry({ activePrayer: PrayerType.ProtectMagic }))).toBe('Mage');
      expect(getPrayerCell(makeEntry({ activePrayer: PrayerType.ProtectRange }))).toBe('Range');
      expect(getPrayerCell(makeEntry({ activePrayer: null, attackType: 'melee' }))).toBe('None');
      expect(getPrayerCell(makeEntry({ activePrayer: null, attackType: 'typeless' }))).toBe('—');
      expect(getPrayerCell(makeEntry({ activePrayer: 'UnknownPrayer' as any }))).toBe('None');
    });
  });
});
