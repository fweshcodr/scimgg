import { describe, expect, it } from 'vitest';
import { YamaEncounter } from '../../encounters/yamaP3/YamaEncounter';
import { ObjType } from '../../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { computeTotalWeight } from '../../types/equipmentStats';
import { SimulationEngine } from '../SimulationEngine';
import { calculateRunEnergyDrain, calculateRunEnergyRegen, tickRunEnergy } from '../timers';
import type { WorldState } from '../WorldState';

describe('run energy', () => {
  it.each([
    [3, 24],
    [20, 28],
  ])('pins the assumed partial-graceful rounding at %i%% to %i', (bonus, expected) => {
    expect(calculateRunEnergyRegen(99, bonus)).toBe(expected);
  });

  it.each([
    [99, 0, 40],
    [99, 64, 85],
    [99, 100, 85],
    [99, -10, 40],
    [1, 0, 59],
    // Without the inner floor, this would incorrectly drain 41.
    [99, 1.5, 40],
  ])('Agility %i at %i kg drains %i', (agility, weight, expected) => {
    expect(calculateRunEnergyDrain(weight, agility)).toBe(expected);
  });

  it.each([
    [false, false, 40],
    [true, false, 12],
    [false, true, 34],
    [true, true, 12],
  ])('stamina=%s, ring=%s drains %i', (staminaActive, ringOfEnduranceEquipped, drain) => {
    const context = { isRunning: true, agility: 99, weight: 0, staminaActive, ringOfEnduranceEquipped };
    expect(tickRunEnergy({ energy: 10000 }, context).energy).toBe(10000 - drain);
    expect(tickRunEnergy({ energy: 1 }, context).energy).toBe(0);
  });

  it.each([
    [1, 15],
    [99, 24],
    [109, 25],
  ])('Agility %i regenerates %i', (agility, expected) => {
    expect(calculateRunEnergyRegen(agility)).toBe(expected);
    expect(tickRunEnergy({ energy: 0 }, { isRunning: false, agility, weight: 0 }).energy).toBe(expected);
    expect(tickRunEnergy({ energy: 9999 }, { isRunning: false, agility, weight: 0 }).energy).toBe(10000);
  });
});

function weightLoader(): ObjTypeLoader {
  const items = new Map<number, ObjType>();
  for (const [id, weight, stackable] of [
    [13441, 2000, 0],
    [1, 64000, 1],
    [2, -1000, 0],
  ]) {
    const item = new ObjType(id, {
      name: 'test',
      game: 'oldschool',
      environment: 'test',
      revision: 1,
      timestamp: '2026-01-01T00:00:00Z',
      size: 0,
    });
    item.weight = weight;
    item.stackable = stackable === 1;
    items.set(id, item);
  }
  return {
    load(id) {
      const item = items.get(id);
      if (!item) throw new Error(`Unknown item ${id}`);
      return item;
    },
    getCount: () => items.size,
    clearCache() {},
  };
}

function engineWithNoAttacks(): SimulationEngine {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 37] });
  engine.setMechanicsConfig({
    yamaMageRange: false,
    yamaMelee: false,
    waves: false,
    fireballs: false,
    voidFlares: false,
    infiniteHealth: true,
  });
  return engine;
}

describe('live run-energy inputs', () => {
  it('treats stackable items as weightless both equipped and in inventory', () => {
    expect(computeTotalWeight({ weapon: 1 }, [{ id: 1, quantity: 100000 }], weightLoader())).toBe(0);
    expect(computeTotalWeight({ cape: 2 }, [{ id: 13441 }, { id: 13441 }], weightLoader())).toBe(3);
  });

  it('eating food reduces the next running tick drain without an equipment recalculation', () => {
    const engine = engineWithNoAttacks();
    engine.setObjTypeLoader(weightLoader());
    engine.setInventory([{ id: 13441 }]);
    engine.advanceTick([31, 35]);
    expect(engine.runEnergy.energy).toBe(9959); // 2 kg: floor(62 * 201 / 300) = 41
    engine.queueItemAction(0);
    engine.advanceTick([31, 33]);
    expect(engine.inventory[0]).toBeNull();
    expect(engine.runEnergy.energy).toBe(9919); // current empty inventory: 40, not stale 41
  });

  it.each([
    [undefined, 40],
    [24844, 40],
    [24736, 34],
  ])('ring %s drains %i', (ring, drain) => {
    const engine = engineWithNoAttacks();
    engine.setEquipment({ ring });
    engine.advanceTick([31, 35]);
    expect(engine.runEnergy.energy).toBe(10000 - drain);
  });

  it('uses current Agility rather than its configured base for both drain and regeneration', () => {
    const engine = engineWithNoAttacks();
    engine.stats.agility.current = 1;
    engine.advanceTick([31, 35]);
    expect(engine.runEnergy.energy).toBe(9941);
    engine.advanceTick([31, 35]);
    expect(engine.runEnergy.energy).toBe(9956);
    engine.stats.agility.current = 109;
    engine.advanceTick([31, 35]);
    expect(engine.runEnergy.energy).toBe(9981);
  });

  it.each([12625, 31638])('charged ring doubles stamina-family item %i energy restore without stacking drain', (id) => {
    const engine = engineWithNoAttacks();
    engine.setEquipment({ ring: 24736 });
    engine.setInventory([{ id }]);
    engine.runEnergy.energy = 1000;
    engine.queueItemAction(0);
    engine.advanceTick([31, 35]);
    // Ordinary stamina restores 4000 with the ring; extended restores 8000. Both drain 12.
    expect(engine.runEnergy.energy).toBe(id === 12625 ? 4988 : 8988);
    const player = (Reflect.get(engine, 'worldState') as WorldState).getPlayer()!;
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')?.ticksRemaining).toBe(
      id === 12625 ? 400 : 800,
    );
  });

  it('also applies the ring duration to automatic prepot buffs', () => {
    const engine = engineWithNoAttacks();
    engine.setMechanicsConfig({ autoPrepot: true });
    engine.setEquipment({ ring: 24736 });
    engine.setInventory([{ id: 12625 }]);
    engine.applyPrepotEffects();
    const player = (Reflect.get(engine, 'worldState') as WorldState).getPlayer()!;
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')?.ticksRemaining).toBe(400);
    engine.setEquipment({});
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')).toMatchObject({
      ticksRemaining: 200,
      ringExtended: false,
    });
    engine.setEquipment({ ring: 24736 });
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')?.ticksRemaining).toBe(200);
  });

  it.each([12625, 31638])('halves ring-extended item %i once on unequip, flooring remaining ticks', (id) => {
    const engine = engineWithNoAttacks();
    engine.setEquipment({ ring: 24736 });
    engine.setInventory([{ id }, null]);
    engine.queueItemAction(0);
    engine.advanceTick([31, 37]);
    engine.advanceTick([31, 37]);
    const player = (Reflect.get(engine, 'worldState') as WorldState).getPlayer()!;
    const remaining = id === 12625 ? 399 : 799;
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')).toMatchObject({
      ticksRemaining: remaining,
      ringExtended: true,
    });

    engine.queueUnequip('ring');
    engine.advanceTick([31, 37]);
    expect(player.equipment.ring).toBeUndefined();
    // Equipment ops halve first, then the ordinary timer pass consumes this tick.
    const halved = Math.floor(remaining / 2) - 1;
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')).toMatchObject({
      ticksRemaining: halved,
      ringExtended: false,
    });
    engine.queueEquipFromInventory(1, 24736, 'ring');
    engine.advanceTick([31, 37]);
    expect(player.equipment.ring).toBe(24736);
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')?.ticksRemaining).toBe(halved - 1);
    engine.queueUnequip('ring');
    engine.advanceTick([31, 37]);
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')?.ticksRemaining).toBe(halved - 2);
  });

  it('halves ring-extended stamina when swapping to another ring', () => {
    const engine = engineWithNoAttacks();
    engine.setEquipment({ ring: 24736 });
    engine.setInventory([{ id: 12625 }, { id: 25975 }]);
    engine.queueItemAction(0);
    engine.advanceTick([31, 37]);
    engine.queueEquipFromInventory(1, 25975, 'ring');
    engine.advanceTick([31, 37]);
    const player = (Reflect.get(engine, 'worldState') as WorldState).getPlayer()!;
    expect(player.equipment.ring).toBe(25975);
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')).toMatchObject({
      ticksRemaining: 199,
      ringExtended: false,
    });
  });

  it('never halves ordinary stamina after equipping and removing the ring', () => {
    const engine = engineWithNoAttacks();
    engine.setInventory([{ id: 12625 }, null]);
    engine.queueItemAction(0);
    engine.advanceTick([31, 37]);
    engine.setEquipment({ ring: 24736 });
    engine.queueUnequip('ring');
    engine.advanceTick([31, 37]);
    const player = (Reflect.get(engine, 'worldState') as WorldState).getPlayer()!;
    expect(player.equipment.ring).toBeUndefined();
    expect(player.activeEffects.find((effect) => effect.type === 'stamina')?.ticksRemaining).toBe(199);
  });
});
