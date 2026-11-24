import { describe, expect, it } from 'vitest';
import { createDefaultPrayerState, type DamageHistoryEntry } from '../../types/simulation';
import { deriveVictoryStats, type VictoryStatSource } from '../VictoryModalStats';

function makeDamage(overrides: Partial<DamageHistoryEntry>): DamageHistoryEntry {
  return {
    tick: 1,
    source: 'PlayerAttack',
    targetId: 'yama',
    baseDamage: 0,
    attackType: 'melee',
    activePrayer: null,
    prayedCorrectly: null,
    effectiveDamage: 0,
    hpBefore: 100,
    hpAfter: 100,
    ...overrides,
  };
}

function makeSource(overrides: Partial<VictoryStatSource> = {}): VictoryStatSource {
  return {
    encounterOutcome: {
      phase: 'victory',
      decisiveTick: 125,
      completionTick: 134,
      primaryActorId: 'yama',
      completionActorIds: ['yama'],
    },
    damageHistory: [],
    playerHP: 42,
    maxHP: 99,
    prayerState: { ...createDefaultPrayerState(), points: 17 },
    ...overrides,
  };
}

describe('deriveVictoryStats', () => {
  it('derives the kill clock from the encounter defeat tick', () => {
    const source = makeSource();

    const stats = deriveVictoryStats(source);

    // Then: 600ms ticks are formatted using the app clock convention.
    expect(stats?.killTime).toBe('1:15');
  });

  it('totals actual player damage from target HP deltas', () => {
    const source = makeSource({
      damageHistory: [
        makeDamage({ effectiveDamage: 80, hpBefore: 100, hpAfter: 60 }),
        makeDamage({ effectiveDamage: 70, hpBefore: 60, hpAfter: 0 }),
        makeDamage({ targetId: 'other_target', effectiveDamage: 20, hpBefore: 20, hpAfter: 0 }),
      ],
    });

    const stats = deriveVictoryStats(source);

    // Then: dealt damage is the boss's actual 100 HP loss, not 150 rolled damage.
    expect(stats?.damageDealt).toBe(100);
  });

  it('totals damage from every player-targeted history entry', () => {
    const source = makeSource({
      damageHistory: [
        makeDamage({ source: 'YamaAttack', targetId: 'player', effectiveDamage: 7, hpBefore: 42, hpAfter: 35 }),
        makeDamage({ source: 'LaserDamage', targetId: 'player', effectiveDamage: 11, hpBefore: 35, hpAfter: 24 }),
        makeDamage({ effectiveDamage: 25, hpBefore: 100, hpAfter: 75 }),
      ],
    });

    const stats = deriveVictoryStats(source);

    // Then: only hits whose target is the player count as damage taken.
    expect(stats?.damageTaken).toBe(18);
  });

  it('reads remaining HP and prayer directly from the simulation snapshot', () => {
    const source = makeSource();

    const stats = deriveVictoryStats(source);

    expect(stats?.hpRemaining).toBe('42 / 99');
    expect(stats?.prayerRemaining).toBe('17 / 99');
  });

  it('returns no ledger before the encounter has a defeat tick', () => {
    const source = makeSource({ encounterOutcome: { phase: 'active' } });

    const stats = deriveVictoryStats(source);

    expect(stats).toBeNull();
  });

  it('excludes damage dealt to non-completion actors such as void flares', () => {
    const source = makeSource({
      encounterOutcome: {
        phase: 'victory',
        decisiveTick: 100,
        completionTick: 107,
        primaryActorId: 'yama',
        completionActorIds: ['yama'],
      },
      damageHistory: [
        makeDamage({ targetId: 'yama', effectiveDamage: 60, hpBefore: 60, hpAfter: 0 }),
        makeDamage({ targetId: 'void_flare_1', effectiveDamage: 30, hpBefore: 30, hpAfter: 0 }),
      ],
    });

    const stats = deriveVictoryStats(source);

    // Then: only Yama's HP loss counts; the flare add is excluded.
    expect(stats?.damageDealt).toBe(60);
  });
});
