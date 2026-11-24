import { describe, expect, it } from 'vitest';
import {
  BASE_YAMA_CONFIG,
  BLOODIED_BLOWS_CONFIG,
  DIVINE_SEVERANCE_CONFIG,
  FORFEIT_BREATH_CONFIG,
  GLYPHIC_ATTENUATION_CONFIG,
  SENSORY_CLOUDING_CONFIG,
  type YamaContractConfig,
} from '../../../../../encounters/yamaP3/contractConfig';
import { YamaEncounter } from '../../../../../encounters/yamaP3/YamaEncounter';
import { isNpcBound, type NpcActor, type NpcDebuffs } from '../../../../actors/NpcActor';
import type { PlayerActor } from '../../../../actors/PlayerActor';
import type { NpcBurnImmunity } from '../../../../actors/types';
import { TickEvents } from '../../../../events/TickEvents';
import { isCoreEvent } from '../../../../events/types';
import { SimulationEngine } from '../../../../SimulationEngine';
import type { WorldState } from '../../../../WorldState';
import { advanceBurnStacks, type BurnSeverity, MAX_ACTIVE_BURN_STACKS } from '../../../burnStacks';
import { CombatSystem } from '../../../CombatSystem';
import { npcFormulaActor } from '../../../npcAttackRequest';
import { applyOnFireSpecialAttackEffects, applySpecialAttackEffects } from '../postHitEffects';
import type { SpecialAttackEffect } from '../types';

function createCombatActors(contract?: YamaContractConfig): {
  readonly engine: SimulationEngine;
  readonly player: PlayerActor;
  readonly target: NpcActor;
} {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(contract), startPos: [31, 37] });
  const world = engine['worldState'];
  const player = world.getPlayer();
  const target = world.getNpcs()[0];
  if (!player || !target) throw new Error('Expected combat actors');
  return { engine, player, target };
}

/**
 * The fixture boss is Yama, who is poison-IMMUNE in the shipped data (/w/Yama
 * `poisonresistance = 100`). Poison cases that are about the poison itself need a target that can
 * actually take it, so they say so here rather than quietly depending on a boss that cannot.
 */
function createPoisonableActors(): { readonly player: PlayerActor; readonly target: NpcActor } {
  const { player, target } = createCombatActors();
  const formulaStats = target.formulaStats;
  if (formulaStats === undefined) throw new Error('expected the fixture NPC to carry formulaStats');
  target.formulaStats = { ...formulaStats, poisonResistance: 0 };
  return { player, target };
}

describe.each([
  BASE_YAMA_CONFIG,
  DIVINE_SEVERANCE_CONFIG,
  FORFEIT_BREATH_CONFIG,
  SENSORY_CLOUDING_CONFIG,
  BLOODIED_BLOWS_CONFIG,
  GLYPHIC_ATTENUATION_CONFIG,
])('Yama Defence drain floor ($kind)', (contract) => {
  const baseDefence = contract.contractId === null ? 225 : 247;
  const maxDrain = baseDefence - 145;

  it('stops live combat Defence and DPS improvements after three Emberlight specials', () => {
    const { engine, player, target } = createCombatActors(contract);
    expect(target.formulaStats?.levels.defence).toBe(baseDefence);
    expect(target.defenceDrainFloor).toBe(145);
    player.equipment.weapon = 29589;
    player.selectedAttackStyleIndex = 0;
    player.equipmentStats = {
      ...player.equipmentStats,
      attackSlash: 100,
      meleeStrength: 100,
      attackSpeed: 4,
    };
    const project = () => {
      const projection = engine.getAdjustedTheoreticalDps();
      if (!projection || projection.baseDefenceRoll === null) throw new Error('Expected live melee projection');
      return { defenceRoll: projection.baseDefenceRoll, accuracy: projection.accuracy, dps: projection.dps };
    };
    const projections = [project()];
    // https://oldschool.runescape.wiki/w/Emberlight?oldid=15320249: floor(225 * 15 / 100) + 1.
    // https://oldschool.runescape.wiki/w/Yama/Strategies?oldid=15354936: three specs reach 145.
    // Contracts keep their 247-based 38-point drain, with the absolute 145 floor as simulator policy.
    const drains = contract.contractId === null ? [34, 68, 80, 80] : [38, 76, 102, 102];
    for (const drain of drains) {
      applySpecialAttackEffects(player, target, 0, [{ effect: 'weaken' }], 0);
      expect(target.debuffs?.defenceDrain).toBe(drain);
      expect(npcFormulaActor(target)?.levels.defence).toBe(baseDefence - drain);
      projections.push(project());
    }
    for (let i = 1; i <= 3; i++) {
      expect(projections[i].defenceRoll).toBeLessThan(projections[i - 1].defenceRoll);
      expect(projections[i].accuracy).toBeGreaterThan(projections[i - 1].accuracy);
      expect(projections[i].dps).toBeGreaterThan(projections[i - 1].dps);
    }
    expect(projections[4]).toEqual(projections[3]);
    expect(projections[3].dps).toBeGreaterThan(0);
    // The scoped floor does not impose a universal Attack/Strength floor.
    expect(target.debuffs?.attackDrain).toBe(4 * (Math.floor((target.formulaStats!.levels.attack * 15) / 100) + 1));
    expect(target.debuffs?.strengthDrain).toBe(4 * (Math.floor((target.formulaStats!.levels.strength * 15) / 100) + 1));
  });

  it.each([
    { name: 'Weaken', effect: { effect: 'weaken' } },
    { name: 'dragon warhammer', effect: { effect: 'drain_defence', percent: 30 } },
    { name: 'elder maul', effect: { effect: 'drain_defence', percent: 35 } },
    { name: 'flat drain', effect: { effect: 'drain_defence', flat: true } },
  ] satisfies {
    name: string;
    effect: SpecialAttackEffect;
  }[])('caps repeated and mixed $name drains without Condemn restoring Defence', ({ effect }) => {
    const { player, target } = createCombatActors(contract);
    applySpecialAttackEffects(player, target, 0, [{ effect: 'condemn' }], 0);
    expect(target.debuffs?.defenceDrain).toBe(contract.contractId === null ? 33 : 37);
    applySpecialAttackEffects(player, target, 0, [{ effect: 'weaken' }], 0);
    expect(target.debuffs?.defenceDrain).toBe(contract.contractId === null ? 67 : 75);
    for (let i = 0; i < 4; i++) {
      applySpecialAttackEffects(player, target, 100, [effect, { effect: 'condemn' }], i);
      expect(target.debuffs?.defenceDrain).toBe(maxDrain);
      expect(npcFormulaActor(target)?.levels.defence).toBe(145);
    }
  });

  it('also clamps Condemn when an NPC floor is above its normal drain', () => {
    const { player, target } = createCombatActors(contract);
    target.defenceDrainFloor = baseDefence - 15;
    applySpecialAttackEffects(player, target, 0, [{ effect: 'condemn' }], 0);
    expect(target.debuffs?.defenceDrain).toBe(15);
    expect(npcFormulaActor(target)?.levels.defence).toBe(baseDefence - 15);
  });
});

describe('applySpecialAttackEffects', () => {
  it('leaves non-Yama NPCs without a floor uncapped', () => {
    const { player, target: template } = createCombatActors();
    const target: NpcActor = {
      ...template,
      id: 'uncapped-demon',
      npcTypeId: 999999,
      archetypeId: 'uncapped-demon',
      defenceDrainFloor: undefined,
    };
    for (const drain of [34, 68, 102, 136]) {
      applySpecialAttackEffects(player, target, 0, [{ effect: 'weaken' }], 0);
      expect(target.debuffs?.defenceDrain).toBe(drain);
      expect(npcFormulaActor(target)?.levels.defence).toBe(225 - drain);
    }
    applySpecialAttackEffects(player, target, 500, [{ effect: 'drain_defence', flat: true }], 0);
    expect(target.debuffs?.defenceDrain).toBe(636);
    expect(npcFormulaActor(target)?.levels.defence).toBe(0);
  });

  it('caps minimum healing and prayer restoration while synchronizing their stat mirrors', () => {
    const { player, target } = createCombatActors();
    player.vitals.hp = 95;
    player.stats.hitpoints.current = 95;
    player.prayerState.points = 97;
    player.stats.prayer.current = 97;

    applySpecialAttackEffects(
      player,
      target,
      4,
      [
        { effect: 'heal_hp', percentOfDamage: 50 },
        { effect: 'restore_prayer', percentOfDamage: 25 },
      ],
      0,
    );

    expect({
      hp: player.vitals.hp,
      mirroredHp: player.stats.hitpoints.current,
      prayer: player.prayerState.points,
      mirroredPrayer: player.stats.prayer.current,
    }).toEqual({ hp: 99, mirroredHp: 99, prayer: 99, mirroredPrayer: 99 });
  });

  it('adds a flat defence drain to an existing drain', () => {
    const { player, target } = createCombatActors();
    target.debuffs = { defenceDrain: 7 };

    applySpecialAttackEffects(player, target, 25, [{ effect: 'drain_defence', flat: true }], 0);

    expect(target.debuffs.defenceDrain).toBe(32);
  });

  it('drains a percentage of current defence after existing drains', () => {
    const { player, target } = createCombatActors();
    target.defenceDrainFloor = undefined; // Generic, uncapped target with synthetic levels.
    if (!target.formulaStats) throw new Error('Expected NPC formula stats');
    target.formulaStats.levels.defence = 100;
    target.debuffs = { defenceDrain: 20 };

    applySpecialAttackEffects(player, target, 1, [{ effect: 'drain_defence', percent: 30 }], 0);

    expect(target.debuffs.defenceDrain).toBe(44);
  });

  it('floors current defence at zero before applying a percentage drain', () => {
    const { player, target } = createCombatActors();
    target.defenceDrainFloor = undefined; // Preserve uncapped overdrained fixtures.
    if (!target.formulaStats) throw new Error('Expected NPC formula stats');
    target.formulaStats.levels.defence = 100;
    target.debuffs = { defenceDrain: 140 };

    applySpecialAttackEffects(player, target, 1, [{ effect: 'drain_defence', percent: 30 }], 0);

    expect(target.debuffs.defenceDrain).toBe(140);
  });

  it('adds base and damage-scaled magic drain to an existing drain', () => {
    const { player, target } = createCombatActors();
    target.debuffs = { magicDrain: 3 };

    applySpecialAttackEffects(player, target, 25, [{ effect: 'drain_magic', base: 2, percentOfDamage: 20 }], 0);

    expect(target.debuffs.magicDrain).toBe(10);
  });

  // An encounter restat has to reach the ACTOR, not only the DPS projection: a percentage
  // drain computed off the dataset and then subtracted from an overridden level is two
  // baselines inside one calculation. The level here is the CONTRACT's 247, not the dataset
  // row's 225 -- the point of the test is that both sides agree on whichever it is.
  it('drains a percentage of the encounter-restatted defence, not the raw dataset row', () => {
    const engine = new SimulationEngine({
      encounter: new YamaEncounter(GLYPHIC_ATTENUATION_CONFIG),
      startPos: [31, 37],
    });
    const world = engine['worldState'];
    const player = world.getPlayer();
    const target = world.getNpcs()[0];
    if (!player || !target) throw new Error('Expected combat actors');

    expect(target.formulaStats?.defensive.crush).toBe(108);
    expect(target.formulaStats?.defensive.stab).toBe(666);
    // The override names ranged defences `light`/`standard`/`heavy`, the actor prefixes them with
    // `ranged`; a mapping slip here silently leaves the dataset value in place.
    expect(target.formulaStats?.defensive.rangedLight).toBe(666);
    expect(target.formulaStats?.defensive.rangedStandard).toBe(666);
    expect(target.formulaStats?.defensive.rangedHeavy).toBe(666);
    expect(target.formulaStats?.levels.defence).toBe(247);
    expect(target.defenceDrainFloor).toBe(145);

    applySpecialAttackEffects(player, target, 1, [{ effect: 'drain_defence', percent: 35 }], 0);

    expect(target.debuffs?.defenceDrain).toBe(Math.floor(247 * 0.35));
    applySpecialAttackEffects(player, target, 1, [{ effect: 'drain_defence', percent: 35 }], 1);
    expect(target.debuffs?.defenceDrain).toBe(102);
    expect(npcFormulaActor(target)?.levels.defence).toBe(145);
    expect(target.formulaStats?.defensive).toMatchObject({
      crush: 108,
      stab: 666,
      rangedLight: 666,
      rangedStandard: 666,
      rangedHeavy: 666,
    });
  });

  it('does not shorten an overlapping bind window', () => {
    const { player, target } = createCombatActors();
    target.debuffs = { boundFromTick: 0, boundUntilTick: 50 };

    applySpecialAttackEffects(player, target, 1, [{ effect: 'bind', durationTicks: 32 }], 10);

    expect(target.debuffs.boundFromTick).toBe(0);
    expect(target.debuffs.boundUntilTick).toBe(50);
  });

  it('delays a bind by delayTicks', () => {
    const { player, target } = createCombatActors();

    applySpecialAttackEffects(player, target, 0, [{ effect: 'bind', delayTicks: 2, durationTicks: 21 }], 100);
    expect(target.debuffs?.boundFromTick).toBe(102);
    expect(target.debuffs?.boundUntilTick).toBe(123);
  });

  it('merges overlapping bind windows', () => {
    const { player, target } = createCombatActors();
    target.debuffs = { boundFromTick: 24, boundUntilTick: 46 };

    applyOnFireSpecialAttackEffects(player, target, [{ effect: 'bind', delayTicks: 2, durationTicks: 22 }], 42);

    expect(target.debuffs.boundFromTick).toBe(24);
    expect(target.debuffs.boundUntilTick).toBe(66);
    expect(isNpcBound(target, 43)).toBe(true);
  });

  it('stops laying burns at the five-stack cap', () => {
    const { player, target } = createCombatActors();
    const burn = { effect: 'burn' as const, pulses: 10, severity: 'normal' as const };

    for (let i = 0; i < 8; i++) {
      applySpecialAttackEffects(player, target, 1, [burn], 100);
    }

    expect(target.burnStacks).toHaveLength(MAX_ACTIVE_BURN_STACKS);
  });

  it('honors burn immunity at or below the burn\u2019s own severity, across the whole matrix', () => {
    const lands = (severity: BurnSeverity, immunity: NpcBurnImmunity | null): boolean => {
      const { player, target } = createCombatActors();
      const formulaStats = target.formulaStats;
      if (formulaStats === undefined) throw new Error('expected the fixture NPC to carry formulaStats');
      target.formulaStats = { ...formulaStats, burnImmunity: immunity };
      applySpecialAttackEffects(player, target, 1, [{ effect: 'burn', pulses: 10, severity }], 100);
      return (target.burnStacks?.length ?? 0) > 0;
    };

    // Burn immunity applies at or below its severity, while incendiary burns bypass it (/w/Burn).
    // The full matrix protects the ordering between the two scales.
    const table: ReadonlyArray<readonly [BurnSeverity, NpcBurnImmunity | null, boolean]> = [
      ['weak', null, true],
      ['weak', 'Weak', false],
      ['weak', 'Normal', false],
      ['weak', 'Strong', false],
      ['normal', null, true],
      ['normal', 'Weak', true],
      ['normal', 'Normal', false],
      ['normal', 'Strong', false],
      ['strong', null, true],
      ['strong', 'Weak', true],
      ['strong', 'Normal', true],
      ['strong', 'Strong', false],
      ['incendiary', null, true],
      ['incendiary', 'Weak', true],
      ['incendiary', 'Normal', true],
      ['incendiary', 'Strong', true],
    ];

    for (const [severity, immunity, expected] of table) {
      expect(lands(severity, immunity), `${severity} burn vs ${immunity ?? 'no'} immunity`).toBe(expected);
    }
  });

  it('lands one burn hitsplat carrying the stack count, not one splat per stack', () => {
    const { player, target } = createCombatActors();
    const burn = { effect: 'burn' as const, pulses: 10, severity: 'normal' as const };
    for (let i = 0; i < 3; i++) applySpecialAttackEffects(player, target, 1, [burn], 100);

    const combat = new CombatSystem();
    const events = new TickEvents();
    const world = {
      tick: 104,
      getNpcs: () => [target],
      actors: new Map([[player.id, player]]),
    } as unknown as WorldState;
    combat.processBurnStacks(world, { events, infiniteHealth: true, onDamageApplied: () => {} }, target);

    const splats = events.flush().filter((event) => isCoreEvent(event, 'hitsplat_spawned'));
    expect(splats).toHaveLength(1);
    expect(splats[0]).toMatchObject({ amount: 3, hitsplatType: 'burn' });
  });

  it('lands a poison hitsplat valued off the severity the pulse spends', () => {
    const { player, target } = createPoisonableActors();
    applySpecialAttackEffects(player, target, 5, [{ effect: 'poison', severity: 20 }], 100);

    const combat = new CombatSystem();
    const events = new TickEvents();
    const world = {
      tick: 130,
      getNpcs: () => [target],
      actors: new Map([[player.id, player]]),
    } as unknown as WorldState;
    combat.processNpcPoison(world, { events, infiniteHealth: true, onDamageApplied: () => {} }, target);

    const splats = events.flush().filter((event) => isCoreEvent(event, 'hitsplat_spawned'));
    expect(splats).toHaveLength(1);
    expect(splats[0]).toMatchObject({ amount: 4, hitsplatType: 'poison' });
  });

  it('burns for ten pulses spanning forty ticks from the hit', () => {
    const { player, target } = createCombatActors();

    applySpecialAttackEffects(player, target, 1, [{ effect: 'burn', pulses: 10, severity: 'normal' }], 100);

    const pulseTicks: number[] = [];
    for (let tick = 100; tick <= 160; tick++) {
      if (advanceBurnStacks(target, tick) !== null) pulseTicks.push(tick - 100);
    }

    // Burns advance in the same tick the hit lands, so a 0 delay would pulse instantly on impact
    // and finish at +36 instead of the wiki's 40.
    expect(pulseTicks).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36, 40]);
  });

  it('drains a percentage of current Attack for Shadow spells', () => {
    const { player, target } = createCombatActors();
    if (!target.formulaStats) throw new Error('Expected NPC formula stats');
    target.formulaStats.levels.attack = 100;

    applySpecialAttackEffects(player, target, 1, [{ effect: 'drain_attack', percent: 15 }], 0);

    expect(target.debuffs?.attackDrain).toBe(15);
  });

  // /w/Shadow_spells refuses the drain once ATTACK is down, and only Attack: reading any drain
  // would let a dragon warhammer spec silently switch every later Shadow cast off.
  it('refuses a Shadow drain onto already-drained Attack but not onto another drained stat', () => {
    const drainOnto = (debuffs: NpcDebuffs): number | undefined => {
      const { player, target } = createCombatActors();
      if (!target.formulaStats) throw new Error('Expected NPC formula stats');
      target.formulaStats.levels.attack = 100;
      target.debuffs = debuffs;
      applySpecialAttackEffects(player, target, 1, [{ effect: 'drain_attack', percent: 10 }], 0);
      return target.debuffs.attackDrain;
    };

    expect(drainOnto({ attackDrain: 4 })).toBe(4);
    expect(drainOnto({ defenceDrain: 40, magicDrain: 40 })).toBe(10);
  });

  it('applies Smoke poison at the spell’s severity, one full period out', () => {
    const { player, target } = createPoisonableActors();

    applySpecialAttackEffects(player, target, 5, [{ effect: 'poison', severity: 20 }], 100);

    expect(target.poison).toEqual({ sourceId: player.id, severity: 20, nextPulseTick: 130 });
  });

  // Reads the SHIPPED dataset, not a hand-built stat block: a correct guard is no use if the
  // generated data marks every monster in the game poisonable, so what this checks is the data
  // reaching the actor, not the comparison.
  it('refuses to poison a boss the shipped monster data marks immune', () => {
    const { player, target } = createCombatActors();

    expect(target.formulaStats?.poisonResistance).toBe(100);
    applySpecialAttackEffects(player, target, 5, [{ effect: 'poison', severity: 20 }], 100);

    expect(target.poison).toBeUndefined();
  });

  it('opens an Ice freeze the tick after the cast and holds it for the full duration', () => {
    const { player, target } = createCombatActors();

    applySpecialAttackEffects(player, target, 1, [{ effect: 'freeze', durationTicks: 32 }], 100);

    // The cast tick's step was already taken (NPCs move before players), so Ice Barrage costs its
    // target exactly 32 steps and it moves again on cast + 33: every ToB Barrage target moving when
    // cast first moves again at +33, or +36 for the capturing player's 35-tick sceptre freezes.
    const blocked: number[] = [];
    for (let tick = 100; tick <= 140; tick++) if (isNpcBound(target, tick)) blocked.push(tick - 100);
    expect(blocked).toEqual(Array.from({ length: 32 }, (_, index) => index + 1));
  });

  it('refuses to re-freeze until five ticks after the previous freeze ends', () => {
    const refreezesAt = (tick: number): boolean => {
      const { player, target } = createCombatActors();
      target.debuffs = { boundFromTick: 10, boundUntilTick: 42 };
      applySpecialAttackEffects(player, target, 1, [{ effect: 'freeze', durationTicks: 32 }], tick);
      return target.debuffs.boundUntilTick !== 42;
    };

    // Frozen through 41, thaws at 42, immune through 46, freezable again at 47 (/w/Ice_spells).
    // Captured casts on the thaw tick and the tick after it freeze nothing: the targets walk on
    // (inferno-waves-1-68 t5661, t5666 on the thaw tick; t3660, t6422 one tick after).
    expect(refreezesAt(41)).toBe(false);
    expect(refreezesAt(42)).toBe(false);
    expect(refreezesAt(43)).toBe(false);
    expect(refreezesAt(46)).toBe(false);
    expect(refreezesAt(47)).toBe(true);
  });

  // Immunity has to hold in BOTH directions. A Zamorak godsword writes the same window through a
  // different effect, so leaving `bind` unchecked let a player refresh a live Ice freeze, or
  // re-bind inside the five ticks the thaw is supposed to protect, just by switching weapon.
  it('refuses a Zamorak godsword bind against a live Ice freeze and its thaw immunity', () => {
    const bindAt = (tick: number): { from?: number; until?: number } => {
      const { player, target } = createCombatActors();
      target.debuffs = { boundFromTick: 10, boundUntilTick: 42 };
      applySpecialAttackEffects(player, target, 30, [{ effect: 'bind', durationTicks: 32 }], tick);
      return { from: target.debuffs.boundFromTick, until: target.debuffs.boundUntilTick };
    };

    expect(bindAt(30)).toEqual({ from: 10, until: 42 });
    expect(bindAt(46)).toEqual({ from: 10, until: 42 });
    expect(bindAt(47)).toEqual({ from: 47, until: 79 });
  });

  // Scorching shackles are SCHEDULED at launch with their own refresh policy, so the immunity check
  // must not reach them; the on-fire path stays a reservation, not a freeze answering to one.
  it('still merges a scheduled Scorching bind that overlaps an existing window', () => {
    const { player, target } = createCombatActors();
    target.debuffs = { boundFromTick: 24, boundUntilTick: 46 };

    applyOnFireSpecialAttackEffects(player, target, [{ effect: 'bind', delayTicks: 2, durationTicks: 22 }], 42);

    expect(target.debuffs).toMatchObject({ boundFromTick: 24, boundUntilTick: 66 });
  });

  it('scales freeze duration by the target’s freeze resistance and rejects a full 100', () => {
    const freezeUntil = (resistance: number): number | undefined => {
      const { player, target } = createCombatActors();
      const formulaStats = target.formulaStats;
      if (formulaStats === undefined) throw new Error('expected the fixture NPC to carry formulaStats');
      target.formulaStats = { ...formulaStats, freezeResistance: resistance };
      applySpecialAttackEffects(player, target, 1, [{ effect: 'freeze', durationTicks: 32 }], 100);
      return target.debuffs?.boundUntilTick;
    };

    expect(freezeUntil(0)).toBe(133);
    expect(freezeUntil(33)).toBe(122);
    expect(freezeUntil(50)).toBe(117);
    expect(freezeUntil(100)).toBeUndefined();
  });
});
