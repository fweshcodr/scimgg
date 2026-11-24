import { describe, expect, it } from 'vitest';
import { hasPrayerRestorationEnhancement, prayerRestoreAmount } from '../../data/prayerRestoration';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { createStatsFromBaseLevels } from '../../types/playerState';
import type { Coordinate } from '../../types/simulation';
import { PrayerType } from '../../types/simulation';
import { SimulationEngine } from '../SimulationEngine';

const PLAYER_START: Coordinate = [31, 37];

type PrayerEngineOptions = {
  readonly potionId: number;
  readonly prayerLevel?: number;
  readonly equipment?: Parameters<SimulationEngine['setEquipment']>[0];
  readonly carriedIds?: readonly number[];
  readonly encounter?: YamaEncounter;
};

function createPrayerEngine({
  potionId,
  prayerLevel = 99,
  equipment = {},
  carriedIds = [],
  encounter = new YamaEncounter(),
}: PrayerEngineOptions): SimulationEngine {
  const engine = new SimulationEngine({ encounter, startPos: PLAYER_START });
  engine.setMechanicsConfig({ yamaMageRange: false, waves: false, fireballs: false, voidFlares: false });
  engine.setPlayerStats(
    createStatsFromBaseLevels({
      attack: 99,
      strength: 99,
      defence: 99,
      ranged: 99,
      magic: 99,
      prayer: prayerLevel,
      hitpoints: 99,
      agility: 99,
    }),
  );
  engine.setEquipment(equipment);
  engine.setInventory([{ id: potionId }, ...carriedIds.map((id) => ({ id }))]);
  engine.prayerState.points = 0;
  engine.stats.prayer.current = 0;
  return engine;
}

function drinkPrayerPotion(engine: SimulationEngine): number {
  engine.queueItemAction(0);
  engine.advanceTick(PLAYER_START);
  return engine.prayerState.points;
}

describe('prayer restoration policy', () => {
  it.each([
    ['Super restore', 'super_restore', 99, false, 32],
    ['enhanced Super restore', 'super_restore', 101, true, 35],
    ['Sanfew serum', 'sanfew', 99, false, 33],
    ['enhanced Sanfew serum', 'sanfew', 101, true, 36],
  ] as const)('calculates %s from base Prayer', (_name, formula, level, enhanced, expectedAmount) => {
    const amount = prayerRestoreAmount(formula, level, enhanced);

    // Then percentage flooring occurs before the flat amount
    expect(amount).toBe(expectedAmount);
  });

  it.each([13202, 25252, 26764])('accepts equipped imbued-ring alias %i', (ringId) => {
    const enhanced = hasPrayerRestorationEnhancement({ equipment: { ring: ringId }, inventory: [] });

    expect(enhanced).toBe(true);
  });

  it('rejects the regular ring and carried imbued rings', () => {
    const regularRing = hasPrayerRestorationEnhancement({ equipment: { ring: 12601 }, inventory: [] });
    const carriedImbuedRing = hasPrayerRestorationEnhancement({ equipment: {}, inventory: [{ id: 13202 }] });

    expect(regularRing).toBe(false);
    expect(carriedImbuedRing).toBe(false);
  });

  it.each([9759, 9760, 13280, 13342])('accepts cape alias %i equipped or carried', (capeId) => {
    const equipped = hasPrayerRestorationEnhancement({ equipment: { cape: capeId }, inventory: [] });
    const carried = hasPrayerRestorationEnhancement({ equipment: {}, inventory: [{ id: capeId }] });

    expect(equipped).toBe(true);
    expect(carried).toBe(true);
  });

  it('accepts a carried holy wrench but rejects an equipped one', () => {
    const carried = hasPrayerRestorationEnhancement({ equipment: {}, inventory: [{ id: 6714 }] });
    const equipped = hasPrayerRestorationEnhancement({ equipment: { cape: 6714 }, inventory: [] });

    expect(carried).toBe(true);
    expect(equipped).toBe(false);
  });

  it('collapses duplicate sources into one boolean', () => {
    const enhanced = hasPrayerRestorationEnhancement({
      equipment: { ring: 13202, cape: 9759 },
      inventory: [{ id: 6714 }, { id: 9760 }],
    });

    expect(enhanced).toBe(true);
  });
});

describe('eligible prayer restoration formulas', () => {
  it.each([
    ['Super restore', 3024, 32],
    ['Sanfew serum', 10925, 33],
  ] as const)('restores the level-99 baseline for %s', (_name, potionId, expectedPoints) => {
    const engine = createPrayerEngine({ potionId });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(expectedPoints);
  });

  it.each([
    ['Super restore', 3024, 35],
    ['Sanfew serum', 10925, 36],
  ] as const)('rounds the enhanced level-101 formula for %s', (_name, potionId, expectedPoints) => {
    const engine = createPrayerEngine({ potionId, prayerLevel: 101, carriedIds: [6714] });

    const points = drinkPrayerPotion(engine);

    // Then the enhanced percentage is floored before adding the flat amount
    expect(points).toBe(expectedPoints);
  });

  it.each([
    ['enhanced Super restore', 3024, 101, [6714], 35],
    ['Sanfew serum', 10925, 99, [], 33],
  ] as const)('keeps Prayer state synchronized after %s', (_name, potionId, prayerLevel, carriedIds, expectedPoints) => {
    // Given a formula restoration whose amount differs from restore_all_stats
    const engine = createPrayerEngine({ potionId, prayerLevel, carriedIds });

    drinkPrayerPotion(engine);

    expect(engine.prayerState.points).toBe(expectedPoints);
    expect(engine.stats.prayer.current).toBe(expectedPoints);
  });
});

describe('prayer restoration enhancement sources', () => {
  it.each([13202, 25252, 26764])('activates for equipped Ring of the gods (i) alias %i', (ringId) => {
    const engine = createPrayerEngine({ potionId: 3024, equipment: { ring: ringId } });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(34);
  });

  it.each([13202, 25252, 26764])('does not activate for carried Ring of the gods (i) alias %i', (ringId) => {
    const engine = createPrayerEngine({ potionId: 3024, carriedIds: [ringId] });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(32);
  });

  it('does not activate for the regular Ring of the gods', () => {
    const engine = createPrayerEngine({ potionId: 3024, equipment: { ring: 12601 } });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(32);
  });

  it.each([9759, 9760, 13280, 13342])('activates for equipped eligible cape alias %i', (capeId) => {
    const engine = createPrayerEngine({ potionId: 3024, equipment: { cape: capeId } });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(34);
  });

  it.each([9759, 9760, 13280, 13342])('activates for carried eligible cape alias %i', (capeId) => {
    const engine = createPrayerEngine({ potionId: 3024, carriedIds: [capeId] });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(34);
  });

  it('activates for a holy wrench carried in inventory only', () => {
    const engine = createPrayerEngine({ potionId: 10925, carriedIds: [6714] });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(35);
  });

  it('does not activate for a holy wrench placed in an equipment slot', () => {
    const engine = createPrayerEngine({ potionId: 3024, equipment: { cape: 6714 } });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(32);
  });

  it('never stacks duplicate eligible sources', () => {
    const engine = createPrayerEngine({
      potionId: 3024,
      equipment: { ring: 13202, cape: 9759 },
      carriedIds: [6714, 9760, 13280],
    });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(34);
  });
});

describe('prayer restoration composition and exclusions', () => {
  it('caps enhanced restoration at maximum Prayer', () => {
    const engine = createPrayerEngine({ potionId: 10925, carriedIds: [6714] });
    engine.prayerState.points = 90;
    engine.stats.prayer.current = 90;

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(99);
  });

  it('does not enhance Forgotten brew prayer restoration', () => {
    const engine = createPrayerEngine({ potionId: 27629, carriedIds: [6714] });

    const points = drinkPrayerPotion(engine);

    expect(points).toBe(11);
  });

  it('does not enhance prayer-regeneration pulses', () => {
    const engine = createPrayerEngine({ potionId: 30125, equipment: { ring: 13202 } });

    drinkPrayerPotion(engine);
    for (let tick = 0; tick < 12; tick++) {
      engine.advanceTick(PLAYER_START);
    }

    expect(engine.prayerState.points).toBe(1);
  });
});

/**
 * Client ops reach the server as one ordered packet stream and each executes
 * inline as it is read, so an op sees every earlier op's mutations. rsmod keeps
 * the "no activation at 0 points" guard and relies purely on that ordering:
 * `PrayerTabScript.enablePrayer` (`if (player.prayerLvl == 0) return`).
 */
describe('same-tick restore then prayer activation', () => {
  it('activates a prayer clicked after a restore dose in the same tick', () => {
    const engine = createPrayerEngine({ potionId: 3024 });

    engine.queueItemAction(0);
    engine.queueProtectionPrayer(PrayerType.ProtectMagic);
    engine.advanceTick(PLAYER_START);

    expect(engine.prayerState.points).toBe(32);
    expect(engine.getState().activePrayer).toBe(PrayerType.ProtectMagic);
    expect(engine.getLastTickEvents().filter((event) => event.type === 'prayer_activation_failed')).toHaveLength(0);
  });

  it('refuses a prayer clicked before the restore dose in the same tick', () => {
    const engine = createPrayerEngine({ potionId: 3024 });

    engine.queueProtectionPrayer(PrayerType.ProtectMagic);
    engine.queueItemAction(0);
    engine.advanceTick(PLAYER_START);

    // Then the prayer op ran while the book was still empty and was rejected
    expect(engine.prayerState.points).toBe(32);
    expect(engine.getState().activePrayer).toBeNull();
    expect(engine.getLastTickEvents().filter((event) => event.type === 'prayer_activation_failed')).toHaveLength(1);
  });
});
