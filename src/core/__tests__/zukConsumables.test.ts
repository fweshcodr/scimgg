import { describe, expect, it } from 'vitest';
import { getPrepotEffects, ITEM_ACTIONS } from '../../data/itemEffects';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { createStatsFromBaseLevels } from '../../types/playerState';
import type { Coordinate } from '../../types/simulation';
import { applyEffects } from '../itemActions';
import { SimulationEngine } from '../SimulationEngine';

const PLAYER_START: Coordinate = [31, 37];
const POTION_CHAINS = [
  { name: 'Bastion potion', ids: [22461, 22464, 22467, 22470] },
  { name: 'stamina potion', ids: [12625, 12627, 12629, 12631] },
  { name: 'prayer regeneration potion', ids: [30125, 30128, 30131, 30134] },
  { name: 'Armadyl brew', ids: [31650, 31653, 31656, 31659] },
] as const;

function createEngine(itemId: number): SimulationEngine {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_START });
  engine.setMechanicsConfig({
    yamaMageRange: false,
    waves: false,
    fireballs: false,
    voidFlares: false,
    infiniteHealth: true,
    // These chains assert the vial the last dose leaves behind, which is exactly what the
    // default-on Vial Smasher destroys.
    vialSmasher: false,
  });
  engine.setInventory([{ id: itemId }]);
  return engine;
}

function drinkCurrentSlot(engine: SimulationEngine): void {
  engine.queueItemAction(0);
  engine.advanceTick(engine.getState().playerPosition);
}

function advanceTicks(engine: SimulationEngine, count: number): void {
  for (let tick = 0; tick < count; tick++) {
    engine.advanceTick(engine.getState().playerPosition);
  }
}

describe('Zuk preset consumables', () => {
  it.each(POTION_CHAINS)('drinks every $name dose into an empty vial', ({ ids }) => {
    const engine = createEngine(ids[0]);

    for (let dose = 0; dose < ids.length; dose++) {
      drinkCurrentSlot(engine);
      if (dose < ids.length - 1) advanceTicks(engine, 2);
    }

    expect(engine.inventory[0]).toEqual({ id: 229 });
  });

  it('uses configured base levels for Bastion potion boosts', () => {
    const state = createEngine(22461);
    state.setPlayerStats(
      createStatsFromBaseLevels({
        attack: 70,
        strength: 70,
        defence: 80,
        ranged: 75,
        magic: 70,
        prayer: 70,
        hitpoints: 90,
        agility: 99,
      }),
    );

    drinkCurrentSlot(state);

    // Then its 10% + 4 Ranged and 15% + 5 Defence formulas use those bases
    expect(state.stats.ranged.current).toBe(86);
    expect(state.stats.defence.current).toBe(97);
  });

  it('restores 20% run energy and reduces actual run drain by 70%', () => {
    // Given 50% run energy and a two-tile running destination
    const engine = createEngine(12625);
    engine.runEnergy.energy = 5000;

    engine.queueItemAction(0);
    engine.advanceTick([31, 35]);

    // Then 2000 energy is restored and the normal 40-unit drain is reduced to 12
    expect(engine.runEnergy.energy).toBe(6988);
    expect(ITEM_ACTIONS[12625].effects).toContainEqual({
      op: 'apply_timed_effect',
      effectType: 'stamina',
      durationTicks: 200,
    });
  });

  it('regenerates one Prayer point every 12 ticks for 800 ticks, capped at base Prayer', () => {
    const engine = createEngine(30125);
    engine.setPlayerStats(
      createStatsFromBaseLevels({
        attack: 70,
        strength: 70,
        defence: 70,
        ranged: 70,
        magic: 70,
        prayer: 70,
        hitpoints: 90,
        agility: 99,
      }),
    );
    engine.prayerState.points = 0;
    engine.stats.prayer.current = 0;

    drinkCurrentSlot(engine);
    advanceTicks(engine, 11);

    expect(engine.prayerState.points).toBe(0);
    advanceTicks(engine, 1);
    expect(engine.prayerState.points).toBe(1);
    advanceTicks(engine, 788);
    expect(engine.prayerState.points).toBe(66);

    engine.prayerState.points = 69;
    engine.stats.prayer.current = 69;
    engine.setInventory([{ id: 30125 }]);

    drinkCurrentSlot(engine);
    advanceTicks(engine, 24);

    expect(engine.prayerState.points).toBe(70);
  });

  it('refreshes prayer regeneration instead of stacking duplicate pulses', () => {
    const engine = createEngine(30125);
    engine.prayerState.points = 0;
    engine.stats.prayer.current = 0;
    drinkCurrentSlot(engine);
    advanceTicks(engine, 6);

    engine.setInventory([{ id: 30128 }]);
    drinkCurrentSlot(engine);
    advanceTicks(engine, 12);

    expect(engine.prayerState.points).toBe(1);
  });

  it('uses base HP/Ranged and current drained stats for Armadyl brew', () => {
    const engine = createEngine(31650);
    engine.setPlayerStats(
      createStatsFromBaseLevels({
        attack: 80,
        strength: 75,
        defence: 70,
        ranged: 75,
        magic: 65,
        prayer: 60,
        hitpoints: 90,
        agility: 99,
      }),
    );
    engine.stats.attack.current = 100;
    engine.stats.strength.current = 50;
    engine.stats.defence.current = 20;
    engine.stats.magic.current = 10;

    const result = applyEffects(ITEM_ACTIONS[31650].effects, {
      playerHP: 90,
      maxHP: 90,
      stats: engine.stats,
      poisonState: { poisonVarp: 0, poisonTickCounter: 30, startedTick: null },
      prayerState: engine.prayerState,
      runEnergy: engine.runEnergy,
      specialAttack: engine.specialAttack,
      combatTimers: engine.combatTimers,
      cooldownTracks: { food: 0, potion: 0, combo_food: 0 },
      activeEffects: [],
      currentTick: 0,
    });

    expect(result.playerHP).toBe(101);
    expect(result.stats.ranged.current).toBe(86);
    expect(result.stats.attack.current).toBe(88);
    expect(result.stats.strength.current).toBe(43);
    expect(result.stats.defence.current).toBe(16);
    expect(result.stats.magic.current).toBe(7);
  });

  it('preserves prepot filtering for the new persistent and adverse effects', () => {
    const bastion = ITEM_ACTIONS[22461].effects;
    const stamina = ITEM_ACTIONS[12625].effects;
    const prayerRegeneration = ITEM_ACTIONS[30125].effects;
    const armadylBrew = ITEM_ACTIONS[31650].effects;

    const selected = {
      bastion: getPrepotEffects(bastion),
      stamina: getPrepotEffects(stamina),
      prayerRegeneration: getPrepotEffects(prayerRegeneration),
      armadylBrew: getPrepotEffects(armadylBrew),
    };

    expect(selected.bastion).toHaveLength(2);
    expect(selected.stamina).toEqual([{ op: 'apply_timed_effect', effectType: 'stamina', durationTicks: 200 }]);
    expect(selected.prayerRegeneration).toEqual([
      { op: 'apply_timed_effect', effectType: 'prayer_regeneration', durationTicks: 800 },
    ]);
    expect(selected.armadylBrew).toHaveLength(1);
    expect(selected.armadylBrew[0].op).toBe('boost_formula');
  });
});
