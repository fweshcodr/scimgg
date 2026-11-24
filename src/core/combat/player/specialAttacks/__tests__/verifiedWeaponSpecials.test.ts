import { describe, expect, it, vi } from 'vitest';
import { YamaEncounter } from '../../../../../encounters/yamaP3/YamaEncounter';
import { createEmptyStats } from '../../../../../types/equipmentStats';
import { TickEvents } from '../../../../events/TickEvents';
import { SimulationEngine } from '../../../../SimulationEngine';
import { CombatSystem } from '../../../CombatSystem';
import { npcFormulaActor } from '../../../npcAttackRequest';
import { processPlayerAutoAttack } from '../../PlayerAutoAttackSystem';
import { selectPlayerAttackProfile } from '../../playerAttackProfileSelection';
import {
  activateInstantSpecial,
  powerOfDeathMeleeMultiplier,
  resolveInstantSpecialActivation,
} from '../instantSpecial';
import { applySpecialAttackEffects } from '../postHitEffects';

function fixture(weaponId: number, normalYama = false) {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 37] });
  const world = engine['worldState'];
  const player = world.getPlayer();
  const target = world.getNpcs()[0];
  if (!player || !target || !target.formulaStats) throw new TypeError('Missing actors');
  player.equipment.weapon = weaponId;
  player.position = [0, 0];
  target.position = [1, 0];
  target.size = 1;
  if (!normalYama) {
    // These synthetic 80-level targets exercise generic effects, not normal Yama's floor.
    target.defenceDrainFloor = undefined;
    target.formulaStats = {
      ...target.formulaStats,
      freezeResistance: 0,
      poisonResistance: 0,
      attributes: [],
      levels: { ...target.formulaStats.levels, attack: 80, strength: 80, defence: 80, magic: 80 },
    };
  }
  player.attackTarget = target.id;
  player.attackInteractionActive = true;
  player.isSpecialAttackActive = true;
  player.specialAttack = { ...player.specialAttack, energy: 100 };
  player.equipmentStats = {
    ...createEmptyStats(),
    attackSlash: 100,
    attackStab: 100,
    attackMagic: 100,
    meleeStrength: 176,
    attackRange: 7,
    attackSpeed: 4,
  };
  const deps = {
    world,
    combatSystem: new CombatSystem(),
    tickEvents: new TickEvents(),
    infiniteHealth: false,
    combatSupplies: player.combatSupplies,
    onDamageApplied: vi.fn(),
    random: vi.fn<() => number>().mockReturnValueOnce(0).mockReturnValue(0.5),
    lookupItemStats: () => createEmptyStats(),
  };
  return { engine, player, target, world, deps };
}

describe('verified weapon special attacks', () => {
  it.each([
    true,
    false,
  ])('item self-damage preserves Power of Death only while its staff is equipped (%s)', (equipped) => {
    const { engine, player, world } = fixture(11791);
    player.attackTarget = null;
    activateInstantSpecial(player, world.tick);
    const until = player.powerOfDeathUntilTick;
    if (!equipped) engine.setEquipment({ weapon: 4151 });
    engine.setInventory([{ id: 7510 }]);
    const hp = player.vitals.hp;
    engine.queueItemAction(0, 'guzzle');
    engine.advanceTick(player.position);
    expect(player.vitals.hp).toBeLessThan(hp);
    expect(player.powerOfDeathUntilTick).toBe(equipped ? until : undefined);
    engine.setEquipment({ weapon: 11791 });
    expect(powerOfDeathMeleeMultiplier(player, world.tick)).toBe(equipped ? 0.5 : 1);
  });

  it.each([
    { energy: 100, multiplier: 1, remaining: 0, activated: true },
    { energy: 99, multiplier: 1, remaining: 99, activated: false },
    { energy: 50, multiplier: 0.5, remaining: 0, activated: true },
  ])('shares instant special affordability and cost at $energy energy and $multiplier cost', ({
    energy,
    multiplier,
    remaining,
    activated,
  }) => {
    const { player } = fixture(11791);
    player.specialAttack = { ...player.specialAttack, energy };
    const projected = resolveInstantSpecialActivation(11791, player.specialAttack, multiplier);
    expect(projected).toMatchObject({ specialAttack: { energy: remaining }, activated });
    expect(player.specialAttack.energy).toBe(energy);
    activateInstantSpecial(player, 7, multiplier);
    expect(player.isSpecialAttackActive).toBe(false);
    expect(player.specialAttack).toEqual(projected?.specialAttack);
    expect(player.powerOfDeathUntilTick).toBe(activated ? 107 : undefined);
  });

  it('consumes the engine special toggle immediately without a combat target', () => {
    const { engine, player } = fixture(11791);
    player.attackTarget = null;
    player.isSpecialAttackActive = false;
    engine.applyAction({ type: 'specialAttackToggle' });
    engine.advanceTick(player.position);
    expect(player.powerOfDeathUntilTick).toBeDefined();
    expect(player.specialAttack.energy).toBe(0);
    expect(player.isSpecialAttackActive).toBe(false);
  });
  it.each([
    29589, 27665, 27679, 27676, 11808, 20374, 27690, 4151, 12773, 12774, 26482, 12006, 26484, 4587,
  ])('launches %i and spends its energy', (weaponId) => {
    // Given a valid target and sufficient energy.
    const { player, deps, world } = fixture(weaponId);
    // When the queued special fires.
    processPlayerAutoAttack(player, deps);
    // Then the real attack pipeline accepts it.
    expect(player.specialAttack.energy).toBe(weaponId === 4587 ? 45 : 50);
    expect(world.pendingHits).toMatchObject([{ usingSpecialAttack: true }]);
  });

  it.each([false, true])('stacks Emberlight base drains with demon=%s', (demon) => {
    const { player, target } = fixture(29589);
    if (!target.formulaStats) throw new TypeError('Missing stats');
    target.formulaStats.attributes = demon ? ['demon'] : [];
    target.debuffs = { attackDrain: 10, strengthDrain: 10, defenceDrain: 10 };
    applySpecialAttackEffects(player, target, 0, [{ effect: 'weaken' }], 0);
    expect(npcFormulaActor(target)?.levels).toMatchObject({
      attack: demon ? 57 : 65,
      strength: demon ? 57 : 65,
      defence: demon ? 57 : 65,
    });
  });

  it.each([0, 5, 12, 20])('Condemn respects an existing %i-point drain', (drain) => {
    const { player, target } = fixture(27665);
    target.debuffs = { defenceDrain: drain, magicDrain: drain };
    applySpecialAttackEffects(player, target, 0, [{ effect: 'condemn' }], 0);
    expect(npcFormulaActor(target)?.levels).toMatchObject({
      defence: 80 - Math.max(12, drain),
      magic: 80 - Math.max(12, drain),
    });
  });

  it('uses Condemn without the runes of the selected autocast spell', () => {
    const { player, deps, world } = fixture(27679);
    player.selectedAttackStyleIndex = 4;
    player.stats.magic.current = 99;
    player.combatSupplies = { ...player.combatSupplies, selectedSpell: 'Fire Surge' };
    deps.combatSupplies = player.combatSupplies;
    processPlayerAutoAttack(player, deps);
    expect(world.pendingHits).toMatchObject([{ style: 'magic', usingSpecialAttack: true, rolledDamage: 20 }]);
    expect(player.specialAttack.energy).toBe(50);
  });

  it.each([0.49, 0.5])('freezes on a missed tentacle hit and rolls poison at %s', (roll) => {
    const { player, target, deps } = fixture(12006);
    deps.random = vi.fn<() => number>().mockReturnValueOnce(0.999999).mockReturnValue(roll);
    processPlayerAutoAttack(player, deps);
    expect(target.debuffs).toMatchObject({ boundFromTick: 1, boundUntilTick: 9 });
    expect(target.poison !== undefined).toBe(roll < 0.5);
  });

  it('guarantees Voidwaker accuracy with a half-to-three-halves melee damage range', () => {
    const profile = selectPlayerAttackProfile({ weaponId: 27690, targetSize: 1, isSpecialAttack: true });
    expect(profile).toMatchObject({
      kind: 'singleHit',
      maxHit: { kind: 'base' },
      hit: {
        accuracy: { kind: 'guaranteed' },
        damage: {
          minimum: { ratio: { numerator: 1, denominator: 2 } },
          maximum: { ratio: { numerator: 3, denominator: 2 } },
        },
      },
    });
  });

  // Frozen from the swing tick + 1, like an Ice spell: the weapon sweep capture's warbander stands
  // still from t988 after the t987 special.
  it.each([true, false])('applies Ice Cleave only on a successful hit (%s)', (accurate) => {
    const { player, target, world, deps } = fixture(11808);
    deps.random = vi
      .fn<() => number>()
      .mockReturnValueOnce(accurate ? 0 : 0.999999)
      .mockReturnValue(0.5);
    processPlayerAutoAttack(player, deps);
    world.tick = 10;
    deps.combatSystem.processPendingHits(world, { events: deps.tickEvents });
    expect(target.debuffs?.boundUntilTick).toBe(accurate ? 33 : undefined);
  });

  it.each([29589, 27665])('applies %i drains on an accurate hit reduced to zero', (weaponId) => {
    const { player, target, world, deps } = fixture(weaponId);
    processPlayerAutoAttack(player, { ...deps, encounterRules: { outgoingDamageMultiplier: 0 } });
    world.tick = 10;
    deps.combatSystem.processPendingHits(world, { events: deps.tickEvents });
    expect(target.debuffs?.defenceDrain).toBe(weaponId === 29589 ? 5 : 12);
  });

  it.each([
    { weaponId: 29589, accurate: true, damageMultiplier: 0, drain: 34 },
    { weaponId: 29589, accurate: false, damageMultiplier: 1, drain: 0 },
    { weaponId: 13576, accurate: true, damageMultiplier: 0, drain: 0 },
    { weaponId: 13576, accurate: true, damageMultiplier: 1, drain: 67 },
  ])('preserves normal Yama hit gating for $weaponId, accurate=$accurate, damage=$damageMultiplier', ({
    weaponId,
    accurate,
    damageMultiplier,
    drain,
  }) => {
    const { player, target, world, deps } = fixture(weaponId, true);
    deps.random = vi
      .fn<() => number>()
      .mockReturnValueOnce(accurate ? 0 : 0.999999)
      .mockReturnValue(0.5);
    processPlayerAutoAttack(player, { ...deps, encounterRules: { outgoingDamageMultiplier: damageMultiplier } });
    world.tick = 10;
    deps.combatSystem.processPendingHits(world, { events: deps.tickEvents });
    expect(target.debuffs?.defenceDrain ?? 0).toBe(drain);
    expect(npcFormulaActor(target)?.levels.defence).toBe(225 - drain);
  });

  it.each([11791, 12904, 22296, 24144])('activates Power of Death for %i without an attack target', (weaponId) => {
    const { player, world } = fixture(weaponId);
    player.attackTarget = null;
    activateInstantSpecial(player, 7);
    expect(player.powerOfDeathUntilTick).toBe(107);
    expect(player.specialAttack.energy).toBe(0);
    expect(world.pendingHits).toEqual([]);
  });

  it('does not refresh Power of Death without enough energy', () => {
    const { player } = fixture(11791);
    player.specialAttack.energy = 99;
    player.powerOfDeathUntilTick = 50;
    activateInstantSpecial(player, 7);
    expect(player.powerOfDeathUntilTick).toBe(50);
    expect(player.specialAttack.energy).toBe(99);
  });

  it.each([
    { tick: 99, weaponId: 11791, style: 'melee', damage: 10, active: true },
    { tick: 100, weaponId: 11791, style: 'melee', damage: 21, active: true },
    { tick: 99, weaponId: 11791, style: 'magic', damage: 21, active: true },
    { tick: 99, weaponId: 4151, style: 'melee', damage: 21, active: false },
    { tick: 99, weaponId: 4151, style: 'magic', damage: 21, active: false },
  ] as const)('mitigates Power of Death damage for $style at $tick with weapon $weaponId', ({
    tick,
    weaponId,
    style,
    damage,
    active,
  }) => {
    const { player, target, world, deps } = fixture(11791);
    activateInstantSpecial(player, 0);
    player.equipment.weapon = weaponId;
    player.activePrayer = null;
    player.equipment.shield = undefined;
    const hp = player.vitals.hp;
    world.tick = tick;
    deps.combatSystem.processSupplementalHitRequest(
      world,
      {
        attacker: target,
        target: player,
        attack: {
          style,
          attackKind: style === 'melee' ? 'melee_slash' : 'magic_fire',
          rolledDamage: 21,
          accuracySucceeded: true,
          impactDelayTicks: 0,
        },
      },
      { events: deps.tickEvents },
    );
    expect(hp - player.vitals.hp).toBe(damage);
    expect(player.powerOfDeathUntilTick !== undefined).toBe(active);
  });
});
