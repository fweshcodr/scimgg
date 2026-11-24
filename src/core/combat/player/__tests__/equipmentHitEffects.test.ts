import { describe, expect, it, vi } from 'vitest';
import { getMonsterFormulaStats } from '../../../../data/monsterData';
import type { ActorBase } from '../../../actors/ActorBase';
import type { NpcActor } from '../../../actors/NpcActor';
import type { PlayerActor } from '../../../actors/PlayerActor';
import { TickEvents } from '../../../events/TickEvents';
import { isCoreEvent } from '../../../events/types';
import { markNpcDead } from '../../../npcDeath';
import { WorldState } from '../../../WorldState';
import { advanceBurnStacks, layBurnStack } from '../../burnStacks';
import { type CombatBridge, CombatSystem } from '../../CombatSystem';
import { captureEquipmentHitEffects, resolveEquipmentHitEffects } from '../equipmentHitEffects';

function makePlayer(): PlayerActor {
  return {
    id: 'player',
    kind: 'player',
    alive: true,
    position: [0, 0],
    previousPosition: [0, 0],
    facing: 0,
    vitals: { hp: 99, maxHp: 99 },
    activePrayer: null,
    pendingConflictionAttack: null,
  } as PlayerActor;
}

function layEclipseStack(target: NpcActor, tick: number): void {
  layBurnStack({ target, sourceId: 'player', origin: 'eclipse', severity: 'strong', pulses: 10, tick });
}

function makeNpc(hp = 100): NpcActor {
  return {
    id: 'target',
    kind: 'npc',
    alive: true,
    position: [1, 0],
    previousPosition: [1, 0],
    facing: 0,
    vitals: { hp, maxHp: hp },
    npcTypeId: 7706,
    archetypeId: 'zuk',
    history: new Map(),
    combat: {
      attackSpeed: 4,
      attackStyle: 'magic',
      attackRange: 10,
      nextActionTick: 0,
      targetId: 'player',
      animations: {},
    },
  } as NpcActor;
}

function makeWorld(hp = 100): { readonly world: WorldState; readonly player: PlayerActor; readonly npc: NpcActor } {
  const world = new WorldState();
  const player = makePlayer();
  const npc = makeNpc(hp);
  world.actors = new Map<string, ActorBase>([
    [player.id, player],
    [npc.id, npc],
  ]);
  return { world, player, npc };
}

const eligibleEquipment = { head: 29035, body: 29031, legs: 29033, weapon: 29000 } as const;

describe('Eclipse atlatl burn eligibility', () => {
  it('captures only the full Eclipse set with the atlatl', () => {
    expect(captureEquipmentHitEffects(eligibleEquipment, 'ranged')).toEqual({ eclipseBurn: true });
    expect(captureEquipmentHitEffects({ ...eligibleEquipment, legs: undefined }, 'ranged')).toEqual({
      eclipseBurn: false,
    });
    expect(captureEquipmentHitEffects({ ...eligibleEquipment, weapon: 9185 }, 'ranged')).toEqual({
      eclipseBurn: false,
    });
    expect(captureEquipmentHitEffects(eligibleEquipment, 'magic')).toEqual({ eclipseBurn: false });
  });

  it('procs below 20% but not at the 20% boundary', () => {
    const belowBoundary = makeNpc();
    const atBoundary = makeNpc();

    resolveEquipmentHitEffects({
      snapshot: { eclipseBurn: true },
      accurate: true,
      target: belowBoundary,
      sourceId: 'player',
      impactTick: 10,
      roll: () => 0.199_999,
    });
    resolveEquipmentHitEffects({
      snapshot: { eclipseBurn: true },
      accurate: true,
      target: atBoundary,
      sourceId: 'player',
      impactTick: 10,
      roll: () => 0.2,
    });

    expect(belowBoundary.burnStacks).toHaveLength(1);
    expect(atBoundary.burnStacks).toBeUndefined();
  });

  it('requires an accurate hit and caps independent stacks at five', () => {
    const target = makeNpc();
    const addStack = (accurate: boolean): void => {
      resolveEquipmentHitEffects({
        snapshot: { eclipseBurn: true },
        accurate,
        target,
        sourceId: 'player',
        impactTick: 10,
        roll: () => 0,
      });
    };

    addStack(false);
    for (let index = 0; index < 6; index += 1) addStack(true);

    expect(target.burnStacks).toHaveLength(5);
    expect(target.burnStacks?.every((stack) => stack.pulsesRemaining === 10)).toBe(true);
    expect(target.burnNextPulseTick).toBe(14);
  });

  it('counts a special attack burn against the same cap of five', () => {
    const target = makeNpc();
    // "Up to 5 separate instances of the burn effect can be inflicted at once" (/w/Burn) counts
    // every origin together, so this scorching shackles stack leaves room for only four more.
    layBurnStack({
      target,
      sourceId: 'player',
      origin: 'special-attack',
      severity: 'normal',
      pulses: 6,
      tick: 0,
      firstPulseDelayTicks: 3,
    });

    for (let index = 0; index < 6; index += 1) {
      resolveEquipmentHitEffects({
        snapshot: { eclipseBurn: true },
        accurate: true,
        target,
        sourceId: 'player',
        impactTick: 10,
        roll: () => 0,
      });
    }

    expect(target.burnStacks?.filter((stack) => stack.origin === 'eclipse')).toHaveLength(4);
    expect(target.burnStacks).toHaveLength(5);
    expect(target.burnNextPulseTick).toBe(3);
  });

  it('does not roll a burn against an NPC immune at the eclipse set\u2019s severity', () => {
    const target = makeNpc();
    target.formulaStats = getMonsterFormulaStats(7706) ?? undefined;
    const roll = vi.fn(() => 0);

    resolveEquipmentHitEffects({
      snapshot: { eclipseBurn: true },
      accurate: true,
      target,
      sourceId: 'player',
      impactTick: 10,
      roll,
    });

    expect(target.formulaStats?.burnImmunity).toBe('Strong');
    expect(target.burnStacks).toBeUndefined();
    expect(roll).not.toHaveBeenCalled();
  });

  it('allows a new burn after all ten pulses from the previous stack expire', () => {
    const target = makeNpc();
    layEclipseStack(target, 0);

    for (let tick = 4; tick <= 40; tick += 4) {
      expect(advanceBurnStacks(target, tick)).toEqual({ sourceId: 'player', stackCount: 1 });
    }
    expect(target.burnStacks).toEqual([]);
    expect(target.burnNextPulseTick).toBeUndefined();

    resolveEquipmentHitEffects({
      snapshot: { eclipseBurn: true },
      accurate: true,
      target,
      sourceId: 'player',
      impactTick: 40,
      roll: () => 0,
    });

    expect(target.burnStacks).toEqual([{ origin: 'eclipse', sourceId: 'player', pulsesRemaining: 10 }]);
    expect(target.burnNextPulseTick).toBe(44);
  });

  it('holds one four-tick cadence when a second stack is laid off the beat', () => {
    const target = makeNpc();
    layEclipseStack(target, 0);
    layEclipseStack(target, 2);

    expect(advanceBurnStacks(target, 4)).toEqual({ sourceId: 'player', stackCount: 2 });
    // The late stack's own clock would have fired here, at 2 + 4. A target cannot burn twice
    // inside four ticks, so it spends its pulses on the beat the first stack established.
    expect(advanceBurnStacks(target, 6)).toBeNull();
    expect(advanceBurnStacks(target, 8)).toEqual({ sourceId: 'player', stackCount: 2 });
  });

  it('reproduces the burn ladder in capture inferno-waves-1-68-packet-data.txt', () => {
    // Capture ticks 1938-1970 form an unbroken four-tick grid of 1,1,1,2,2,2,3,3,4 while three
    // further burns land mid-burn. Ticks are shifted to 0 here; the spacing is unchanged.
    const target = makeNpc();
    const pulses: Array<[number, number]> = [];
    layEclipseStack(target, 0);
    for (let tick = 4; tick <= 36; tick += 1) {
      if (tick === 14 || tick === 26 || tick === 34) layEclipseStack(target, tick);
      const pulse = advanceBurnStacks(target, tick);
      if (pulse !== null) pulses.push([tick, pulse.stackCount]);
    }

    expect(pulses).toEqual([
      [4, 1],
      [8, 1],
      [12, 1],
      [16, 2],
      [20, 2],
      [24, 2],
      [28, 3],
      [32, 3],
      [36, 4],
    ]);
  });

  it('ends the burn on death itself, not on the next pulse that notices', () => {
    const target = makeNpc();
    layEclipseStack(target, 0);

    markNpcDead(target, 2);

    // Asserted on the actor rather than through `advanceBurnStacks`, because the driver clears a
    // dead target's stacks anyway. Only clearing at the death boundary survives a revival that
    // happens before the driver runs again.
    expect(target.burnStacks).toEqual([]);
    expect(target.burnNextPulseTick).toBeUndefined();
  });

  it('bills every active stack a pulse, so each still deals its own ten over the burn', () => {
    const target = makeNpc();
    layEclipseStack(target, 0);
    layEclipseStack(target, 2);

    let total = 0;
    for (let tick = 0; tick <= 80; tick += 1) total += advanceBurnStacks(target, tick)?.stackCount ?? 0;

    expect(total).toBe(20);
    expect(target.burnStacks).toEqual([]);
  });
});

describe('Eclipse atlatl burn combat integration', () => {
  it('preserves launch eligibility through a delayed impact', () => {
    const { world, player, npc } = makeWorld();
    const system = new CombatSystem();
    const events = new TickEvents();
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    const bridge: CombatBridge = { events, enablePendingHits: true };

    system.processAttackRequest(
      world,
      {
        attacker: player,
        target: npc,
        attack: {
          style: 'range',
          attackKind: 'range_arrow',
          rolledDamage: 5,
          accuracySucceeded: true,
          impactDelayTicks: 2,
          equipmentHitEffects: captureEquipmentHitEffects(eligibleEquipment, 'ranged'),
        },
      },
      bridge,
    );
    world.tick = 2;
    system.processPendingHits(world, bridge);

    expect(npc.burnStacks).toEqual([{ origin: 'eclipse', sourceId: 'player', pulsesRemaining: 10 }]);
    expect(npc.burnNextPulseTick).toBe(6);
    random.mockRestore();
  });

  it('lands one burn splat carrying the stack count, without XP', () => {
    const { world, npc } = makeWorld();
    const system = new CombatSystem();
    const events = new TickEvents();
    const bridge: CombatBridge = { events };
    layEclipseStack(npc, 0);
    layEclipseStack(npc, 2);

    world.tick = 4;
    system.processBurnStacks(world, bridge, npc);
    const tickFourEvents = events.flush();
    world.tick = 8;
    system.processBurnStacks(world, bridge, npc);
    const tickEightEvents = events.flush();

    expect(npc.vitals.hp).toBe(96);
    expect(tickFourEvents.filter((event) => isCoreEvent(event, 'hit_applied'))).toMatchObject([{ damage: 2 }]);
    expect(tickEightEvents.filter((event) => isCoreEvent(event, 'hit_applied'))).toMatchObject([{ damage: 2 }]);
    expect([...tickFourEvents, ...tickEightEvents].some((event) => isCoreEvent(event, 'xp_drop'))).toBe(false);
    expect(npc.burnStacks).toEqual([
      { origin: 'eclipse', sourceId: 'player', pulsesRemaining: 8 },
      { origin: 'eclipse', sourceId: 'player', pulsesRemaining: 8 },
    ]);
    expect(npc.burnNextPulseTick).toBe(12);
  });

  it('keeps each pulse at one damage when outgoing damage multipliers are active', () => {
    const { world, npc } = makeWorld();
    const system = new CombatSystem();
    const events = new TickEvents();
    layEclipseStack(npc, 0);
    world.tick = 4;

    system.processBurnStacks(
      world,
      {
        events,
        outgoingDamageMultiplier: 0,
        specDamageMultiplier: 0,
      },
      npc,
    );

    expect(npc.vitals.hp).toBe(99);
    expect(events.flush()).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'hit_applied', targetId: 'target', damage: 1 })]),
    );
  });

  it('kills through normal hit, hitsplat, and death events and clears remaining burns', () => {
    const { world, npc } = makeWorld(1);
    const system = new CombatSystem();
    const events = new TickEvents();
    layEclipseStack(npc, 0);
    world.tick = 4;

    system.processBurnStacks(world, { events }, npc);
    const emitted = events.flush();

    expect(npc.alive).toBe(false);
    expect(npc.vitals.hp).toBe(0);
    expect(npc.burnStacks).toEqual([]);
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'hit_applied', damage: 1 }),
        expect.objectContaining({ type: 'hitsplat_spawned', amount: 1 }),
        expect.objectContaining({ type: 'actor_died', actorId: 'target' }),
      ]),
    );
  });
});
