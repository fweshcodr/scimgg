import { describe, expect, it } from 'vitest';
import {
  combatLevelFromBaseStats,
  createDefaultStats,
  createStatsFromBaseLevels,
  type PlayerBaseStats,
  type PlayerStats,
} from '../playerState';

const STARTING_LEVELS: PlayerBaseStats = {
  attack: 1,
  strength: 1,
  defence: 1,
  ranged: 1,
  magic: 1,
  prayer: 1,
  hitpoints: 10,
  agility: 99,
};

const RANGED_PURE_LEVELS: PlayerBaseStats = { ...STARTING_LEVELS, ranged: 99 };
const MAGIC_PURE_LEVELS: PlayerBaseStats = { ...STARTING_LEVELS, magic: 99 };

describe('combatLevelFromBaseStats', () => {
  it('reaches 126 on a maxed account', () => {
    expect(combatLevelFromBaseStats(createDefaultStats())).toBe(126);
  });

  it('reports 3 on a fresh account', () => {
    expect(combatLevelFromBaseStats(createStatsFromBaseLevels(STARTING_LEVELS))).toBe(3);
  });

  // 99 Ranged is odd, so `0.325 * 1.5 * ranged` answers 51 here where the game answers 50.
  it('halves an odd Ranged level before the multiplier', () => {
    expect(combatLevelFromBaseStats(createStatsFromBaseLevels(RANGED_PURE_LEVELS))).toBe(50);
  });

  it('halves an odd Magic level before the multiplier', () => {
    expect(combatLevelFromBaseStats(createStatsFromBaseLevels(MAGIC_PURE_LEVELS))).toBe(50);
  });

  // An unfloored `prayer / 2` answers 66 here.
  it('floors an odd Prayer level before the base contribution', () => {
    const levels: PlayerBaseStats = {
      attack: 6,
      strength: 7,
      defence: 99,
      ranged: 1,
      magic: 1,
      prayer: 99,
      hitpoints: 99,
      agility: 99,
    };

    expect(combatLevelFromBaseStats(createStatsFromBaseLevels(levels))).toBe(65);
  });

  // Reading `current` instead of `max` answers 67 for these stats.
  it('ignores boosted current levels', () => {
    const boosted: PlayerStats = {
      ...createStatsFromBaseLevels(RANGED_PURE_LEVELS),
      attack: { current: 99, max: 1 },
      strength: { current: 99, max: 1 },
      hitpoints: { current: 60, max: 10 },
    };

    expect(combatLevelFromBaseStats(boosted)).toBe(50);
  });
});
