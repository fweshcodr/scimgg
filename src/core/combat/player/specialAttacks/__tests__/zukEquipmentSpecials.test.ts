import { describe, expect, it, vi } from 'vitest';
import { EQUIPMENT_COMBAT_FAMILIES } from '../../../../../data/equipmentCombatFamilies';
import { YamaEncounter } from '../../../../../encounters/yamaP3/YamaEncounter';
import { createEmptyStats } from '../../../../../types/equipmentStats';
import type { NpcActor } from '../../../../actors/NpcActor';
import type { PlayerActor } from '../../../../actors/PlayerActor';
import { TickEvents } from '../../../../events/TickEvents';
import { SimulationEngine } from '../../../../SimulationEngine';
import type { WorldState } from '../../../../WorldState';
import { CombatSystem } from '../../../CombatSystem';
import { processPlayerAutoAttack } from '../../PlayerAutoAttackSystem';
import { launchPlayerAttack } from '../../playerAttackLaunch';
import { getSpecialAttackDef } from '../registry';

function createCombatActors(): {
  readonly world: WorldState;
  readonly player: PlayerActor;
  readonly target: NpcActor;
} {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: [31, 37] });
  const world = engine['worldState'];
  const player = world.getPlayer();
  const target = world.getNpcs()[0];
  if (!player || !target) throw new Error('Expected combat actors');
  return { world, player, target };
}

function createLaunch(weaponId = 12926): Parameters<typeof launchPlayerAttack>[0] {
  const { world, player, target } = createCombatActors();
  player.equipment.weapon = weaponId;
  player.vitals.hp = 40;
  player.stats.hitpoints.current = 40;
  return {
    player,
    target,
    deps: {
      world,
      combatSystem: new CombatSystem(),
      tickEvents: new TickEvents(),
      infiniteHealth: false,
      combatSupplies: player.combatSupplies,
      onDamageApplied: vi.fn(),
      random: vi.fn(() => 0.999),
    },
    hits: [{ damage: 9, accurate: true, style: 'range', attackKind: 'range_arrow', impactDelayTicks: 3 }],
    expectedHit: 9,
    formulaStyle: 'ranged',
    styleIndex: 0,
    finalStyle: 'range',
    finalSpeed: 4,
    resources: { kind: 'none', source: 'none' },
    conflictionAttack: null,
    spellId: undefined,
    manualCast: false,
    isSpecialAttack: true,
    specialAttackDef: getSpecialAttackDef(weaponId),
    outgoingDamageMultiplier: 1,
    specialAttackDamageMultiplier: 1,
    selectedBranchIndex: null,
  };
}

function advancePendingHits(input: Parameters<typeof launchPlayerAttack>[0], ticks: number): void {
  input.deps.world.tick += ticks;
  input.deps.combatSystem.processPendingHits(input.deps.world, { events: input.deps.tickEvents });
}

describe('Zuk equipment special attacks', () => {
  it.each(EQUIPMENT_COMBAT_FAMILIES)('inherits special configuration without widening family $baseId', ({
    baseId,
    variantIds,
  }) => {
    const expected = getSpecialAttackDef(baseId);
    for (const variantId of variantIds) {
      expect(getSpecialAttackDef(variantId)).toEqual(
        variantId === 28688 ? { ...expected, animationId: 10656 } : expected,
      );
    }
  });

  it.each(
    [12926, 28688].flatMap((weaponId) =>
      [3, 5].flatMap((distance) => [
        { weaponId, distance, requested: true, energy: 100, accepted: true },
        { weaponId, distance, requested: false, energy: 100, accepted: false },
        { weaponId, distance, requested: true, energy: 0, accepted: false },
      ]),
    ),
  )('schedules $weaponId at distance $distance with requested=$requested and energy=$energy', ({
    weaponId,
    distance,
    requested,
    energy,
    accepted,
  }) => {
    const input = createLaunch(weaponId);
    input.player.position = [0, 0];
    input.target.position = [distance, 0];
    input.target.size = 1;
    input.player.attackTarget = input.target.id;
    input.player.attackInteractionActive = true;
    input.player.selectedAttackStyleIndex = 1;
    input.player.equipmentStats = {
      ...createEmptyStats(),
      attackSpeed: 3,
      attackRange: 7,
      attackRanged: 100,
      rangedStrength: 100,
    };
    input.player.specialAttack = { ...input.player.specialAttack, energy };
    input.player.isSpecialAttackActive = requested;
    input.deps.combatSupplies = { ...input.player.combatSupplies, selectedSpell: null, blowpipe: { id: 11230 } };
    input.deps.lookupItemStats = () => createEmptyStats();
    input.deps.random = vi.fn<() => number>().mockReturnValueOnce(0).mockReturnValue(0.999);

    processPlayerAutoAttack(input.player, input.deps);

    const delay = accepted && distance === 5 ? 3 : 2;
    expect(input.deps.world.pendingHits).toMatchObject([
      { impactTick: input.deps.world.tick + delay, usingSpecialAttack: accepted },
    ]);
    expect(input.player.specialAttack.energy).toBe(energy - (accepted ? 50 : 0));
    expect(input.player.equipment.weapon).toBe(weaponId);
    expect(input.player.vitals.hp > 40).toBe(accepted);
    expect(input.deps.random).toHaveBeenCalledTimes(2);
    const hpAfterLaunch = input.player.vitals.hp;
    advancePendingHits(input, delay);
    expect(input.player.vitals.hp).toBe(hpAfterLaunch);
  });

  it('registers Armadyl Eye at 50% energy', () => {
    // The reload clip, as the weapon sweep capture's special (tick 1024) plays it.
    expect(getSpecialAttackDef(11785)).toMatchObject({ energyCost: 50, animationId: 7552 });
  });

  it.each([
    { weaponId: 12926, animationId: 5061 },
    { weaponId: 28688, animationId: 10656 },
  ])('registers Toxic Siphon for $weaponId at 50% with no minimum heal', ({ weaponId, animationId }) => {
    expect(getSpecialAttackDef(weaponId)).toMatchObject({
      energyCost: 50,
      animationId,
      launchHeal: { percentOfDamage: 50, minimumHeal: 0 },
    });
  });

  it.each([
    12926, 28688,
  ])('floors rolled overkill healing for %i at launch without rerolling or impact healing', (weaponId) => {
    const input = createLaunch(weaponId);
    input.target.vitals.hp = 1;

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(44);
    expect(input.player.stats.hitpoints.current).toBe(44);
    expect(input.target.vitals.hp).toBe(1);
    expect(input.deps.world.pendingHits).toMatchObject([{ rolledDamage: 9, impactTick: input.deps.world.tick + 3 }]);
    advancePendingHits(input, 2);
    expect(input.target.vitals.hp).toBe(1);
    expect(input.player.vitals.hp).toBe(44);
    advancePendingHits(input, 1);
    expect(input.target.vitals.hp).toBe(0);
    expect(input.player.vitals.hp).toBe(44);
    expect(input.player.stats.hitpoints.current).toBe(44);
    expect(input.deps.random).not.toHaveBeenCalled();
  });

  it.each([
    { damage: 0, accurate: true },
    { damage: 1, accurate: true },
    { damage: 9, accurate: false },
  ])('heals zero at launch and impact when the roll is $damage and accurate is $accurate', ({ damage, accurate }) => {
    const fixture = createLaunch();
    const input = { ...fixture, hits: [{ ...fixture.hits[0], damage, accurate }] };

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(40);
    advancePendingHits(input, 3);
    expect(input.player.vitals.hp).toBe(40);
    expect(input.player.stats.hitpoints.current).toBe(40);
  });

  it('caps launch healing at maximum HP', () => {
    const input = createLaunch();
    input.player.vitals.hp = input.player.vitals.maxHp - 1;

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(input.player.vitals.maxHp);
    expect(input.player.stats.hitpoints.current).toBe(input.player.vitals.maxHp);
  });

  it('does not remove existing overheal when Toxic Siphon fires', () => {
    const input = createLaunch();
    const overhealedHp = input.player.vitals.maxHp + 10;
    input.player.vitals.hp = overhealedHp;
    input.player.stats.hitpoints.current = overhealedHp;

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(overhealedHp);
    expect(input.player.stats.hitpoints.current).toBe(overhealedHp);
  });

  it('uses sequentially floored launch multipliers before the heal percentage', () => {
    const input = { ...createLaunch(), outgoingDamageMultiplier: 1.5, specialAttackDamageMultiplier: 1.5 };

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(49);
    advancePendingHits(input, 3);
    expect(input.deps.tickEvents.flush().find((event) => event.type === 'hit_applied')).toMatchObject({ damage: 19 });
    expect(input.player.vitals.hp).toBe(49);
  });

  it('does not heal when encounter validation forces the launch to miss', () => {
    const input = createLaunch();
    input.deps.encounterRules = { validateAttack: () => false };

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(40);
    advancePendingHits(input, 3);
    expect(input.player.vitals.hp).toBe(40);
    expect(input.deps.tickEvents.flush().find((event) => event.type === 'hit_applied')).toMatchObject({ damage: 0 });
  });

  it('does not heal when CombatSystem rejects a launch on cooldown', () => {
    const input = createLaunch();
    input.deps.combatSystem.processAttack(input.deps.world, input.player, input.target, {
      events: input.deps.tickEvents,
      getAttackSpeed: () => 4,
      resolveAttack: () => ({ accuracySucceeded: false }),
    });

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(40);
    expect(input.deps.world.pendingHits).toEqual([]);
  });

  it('does not heal an ordinary blowpipe launch', () => {
    const input = { ...createLaunch(), isSpecialAttack: false };

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(40);
    advancePendingHits(input, 3);
    expect(input.player.vitals.hp).toBe(40);
  });

  it('keeps Saradomin godsword healing at delayed impact', () => {
    const input = createLaunch(11806);

    launchPlayerAttack(input);

    expect(input.player.vitals.hp).toBe(40);
    advancePendingHits(input, 2);
    expect(input.player.vitals.hp).toBe(40);
    advancePendingHits(input, 1);
    expect(input.player.vitals.hp).toBe(50);
    expect(input.player.stats.hitpoints.current).toBe(50);
  });
});
