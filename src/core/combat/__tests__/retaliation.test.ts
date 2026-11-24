import { describe, expect, it } from 'vitest';
import { LobbyEncounter } from '../../../encounters/lobby/LobbyEncounter';
import type { NpcActor } from '../../actors/NpcActor';
import type { DamageType } from '../../actors/types';
import type { EncounterContext, EncounterTickResult } from '../../encounters/types';
import { TickEvents } from '../../events/TickEvents';
import { markNpcDead } from '../../npcDeath';
import { SimulationEngine } from '../../SimulationEngine';
import { WorldState } from '../../WorldState';
import type { CombatSystem } from '../CombatSystem';
import { isFlinchable } from '../flinch';
import { isNpcActionReady, scheduleNpcAction } from '../npcActionClock';
import { createNpcRetaliation, notifyNpcOfPlayerAttack, processNpcRetaliations } from '../retaliation';

const PLAYER_START = [31, 25] as const;

function createFixtureNpc(id = 'attacker'): NpcActor {
  return {
    id,
    kind: 'npc',
    npcTypeId: 1,
    archetypeId: 'retaliation-fixture',
    alive: true,
    position: [30, 25],
    previousPosition: [30, 25],
    facing: 0,
    size: 1,
    history: new Map(),
    vitals: { hp: 100, maxHp: 100 },
    combat: {
      attackSpeed: 4,
      attackRange: 1,
      attackStyle: 'melee',
      nextActionTick: 0,
      targetId: 'other-target',
      lastAttackTick: null,
      retaliation: createNpcRetaliation(),
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
  };
}

class RetaliationFixtureEncounter extends LobbyEncounter {
  override createNpcs(): NpcActor[] {
    return [createFixtureNpc()];
  }

  processNpcTick(npc: NpcActor, ctx: EncounterContext): EncounterTickResult {
    if (!isNpcActionReady(npc.combat, ctx.tick) || npc.combat.targetId !== 'player')
      return { environmentalDamages: [] };
    scheduleNpcAction(npc.combat, ctx.tick, npc.combat.attackSpeed);
    return {
      environmentalDamages: [],
      npcAttacks: [
        {
          attackerId: npc.id,
          targetId: 'player',
          style: 'melee',
          attackKind: 'melee_slash',
          rolledDamage: 0,
          accuracySucceeded: true,
          impactDelayTicks: 0,
          sourceDeathPolicy: 'cancel-before-impact',
        },
      ],
    };
  }
}

function fixture() {
  const engine = new SimulationEngine({ encounter: new RetaliationFixtureEncounter() });
  engine.setMechanicsConfig({ infiniteHealth: true });
  const world: unknown = Reflect.get(engine, 'worldState');
  if (!(world instanceof WorldState)) throw new Error('Expected engine world');
  const player = world.getPlayer();
  const npc = world.getNpc('attacker');
  if (!player || !npc) throw new Error('Expected player and attacker');
  for (let tick = 0; tick < 5; tick++) engine.advanceTick([...PLAYER_START]);
  npc.combat.nextActionTick = 0;
  // The engine's own system: the hits it queues are drained by the engine, which only services
  // entries its CombatSystem enqueued. Callers opt each commit into the pending-hit queue.
  const combat = Reflect.get(engine, 'combatSystem') as CombatSystem;
  return { engine, world, player, npc, combat };
}

describe('NPC retaliation from committed player attacks', () => {
  it.each(['dead-source', 'missing-source', 'dead-target'] as const)('drops pending reactions for %s', (condition) => {
    const { world, player, npc } = fixture();
    notifyNpcOfPlayerAttack(npc, {
      sourceId: player.id,
      launchTick: 5,
      impactTick: 8,
      style: 'range',
      accuracySucceeded: true,
    });
    switch (condition) {
      case 'dead-source':
        player.alive = false;
        break;
      case 'missing-source':
        world.actors.delete(player.id);
        break;
      case 'dead-target':
        npc.alive = false;
        break;
      default: {
        const exhaustive: never = condition;
        throw new TypeError(`Unknown condition: ${exhaustive}`);
      }
    }
    world.tick = 8;

    processNpcRetaliations(world);

    expect(npc.combat).toMatchObject({
      nextActionTick: 0,
      targetId: 'other-target',
      retaliation: { pending: [], lastIncomingAttackTick: null },
    });
  });

  it('leaves non-opted-in actors untouched', () => {
    const npc = createFixtureNpc();
    delete npc.combat.retaliation;
    const before = structuredClone(npc.combat);

    notifyNpcOfPlayerAttack(npc, {
      sourceId: 'player',
      launchTick: 5,
      impactTick: 8,
      style: 'magic',
      accuracySucceeded: false,
    });

    expect(npc.combat).toEqual(before);
  });
  it.each([
    { label: 'immediate melee', style: 'melee', accuracySucceeded: true, impactDelay: 0 },
    { label: 'magic splash', style: 'magic', accuracySucceeded: false, impactDelay: 3 },
  ] as const)('keeps first response under repeated $label hits', ({ style, accuracySucceeded, impactDelay }) => {
    const { world, npc } = fixture();

    for (const tick of [0, 0, 1, 2]) {
      world.tick = tick;
      processNpcRetaliations(world);
      notifyNpcOfPlayerAttack(npc, {
        sourceId: 'player',
        launchTick: tick,
        impactTick: tick + impactDelay,
        style,
        accuracySucceeded,
      });
    }

    world.tick = 3;
    processNpcRetaliations(world);
    expect(npc.combat.nextActionTick).toBe(style === 'magic' ? 3 : 2);
    expect(npc.combat.lastAttackTick).toBeNull();
    expect(npc.combat.retaliation?.lastIncomingAttackTick).toBe(style === 'magic' ? 3 : 2);
  });

  it.each([4, 6, 8])('preserves an existing %s-tick delay on eligible engagement', (delay) => {
    const npc = createFixtureNpc();
    npc.combat.nextActionTick = delay;

    notifyNpcOfPlayerAttack(npc, {
      sourceId: 'player',
      launchTick: 0,
      impactTick: 0,
      style: 'melee',
      accuracySucceeded: true,
    });

    expect(npc.combat.nextActionTick).toBe(delay);
    expect(npc.combat.targetId).toBe('player');
    expect(npc.combat.lastAttackTick).toBeNull();
    expect(isFlinchable(npc.combat, delay + 8, 'player')).toBe(false);
    expect(isFlinchable(npc.combat, delay + 9, 'player')).toBe(true);
  });

  it('records projectile engagement only at impact and handles duplicate notifications before the NPC turn', () => {
    const { world, player, npc } = fixture();
    for (let duplicate = 0; duplicate < 2; duplicate++) {
      notifyNpcOfPlayerAttack(npc, {
        sourceId: player.id,
        launchTick: 5,
        impactTick: 8,
        style: 'range',
        accuracySucceeded: true,
      });
    }
    expect(npc.combat.retaliation?.lastIncomingAttackTick).toBeNull();
    expect(npc.combat.targetId).toBe('other-target');
    world.tick = 8;

    processNpcRetaliations(world);

    expect(npc.combat.nextActionTick).toBe(10);
    expect(npc.combat.lastAttackTick).toBeNull();
    expect(npc.combat.retaliation?.lastIncomingAttackTick).toBe(8);
    expect(npc.combat.retaliation?.pending).toEqual([]);
  });

  it('records incoming metadata without extending combat eligibility and permits a later retag', () => {
    const npc = createFixtureNpc();
    for (const tick of [0, 8]) {
      notifyNpcOfPlayerAttack(npc, {
        sourceId: 'player',
        launchTick: tick,
        impactTick: tick,
        style: 'melee',
        accuracySucceeded: true,
      });
    }
    expect(npc.combat.retaliation?.lastIncomingAttackTick).toBe(8);
    expect(isFlinchable(npc.combat, 10, 'player')).toBe(false);
    expect(isFlinchable(npc.combat, 11, 'player')).toBe(true);
    npc.combat.targetId = 'other-target';
    npc.combat.nextActionTick = 0;

    notifyNpcOfPlayerAttack(npc, {
      sourceId: 'player',
      launchTick: 9,
      impactTick: 9,
      style: 'melee',
      accuracySucceeded: true,
    });

    expect(npc.combat.nextActionTick).toBe(11);
    expect(npc.combat.targetId).toBe('player');
    expect(npc.combat.lastAttackTick).toBeNull();
  });

  it('clears incoming engagement and pending retaliation on death without fabricating an outgoing attack', () => {
    const npc = createFixtureNpc();
    for (const impactTick of [0, 3]) {
      notifyNpcOfPlayerAttack(npc, {
        sourceId: 'player',
        launchTick: 0,
        impactTick,
        style: 'range',
        accuracySucceeded: true,
      });
    }

    markNpcDead(npc, 1);

    expect(npc.combat.retaliation).toMatchObject({ lastIncomingAttackTick: null, pending: [] });
    expect(npc.combat.lastAttackTick).toBeNull();
  });

  it.each([false, true])('reconstructs fresh engagement on reset with replay config=%s', (replay) => {
    const { engine, npc } = fixture();
    const runConfig = replay ? engine.getRunConfig() : undefined;
    notifyNpcOfPlayerAttack(npc, {
      sourceId: 'player',
      launchTick: 5,
      impactTick: 5,
      style: 'melee',
      accuracySucceeded: true,
    });

    engine.reset([...PLAYER_START], runConfig);

    const world: unknown = Reflect.get(engine, 'worldState');
    if (!(world instanceof WorldState)) throw new Error('Expected engine world');
    const freshNpc = world.getNpc(npc.id);
    expect(freshNpc).toBeDefined();
    expect(freshNpc).not.toBe(npc);
    expect(freshNpc?.combat).toMatchObject({
      lastAttackTick: null,
      retaliation: { lastIncomingAttackTick: null, pending: [] },
    });
  });

  it.each([
    { mode: 'retarget', delay: 0, expected: 5 },
    { mode: 'retarget', delay: 3, expected: 5 },
    { mode: 'one-tick', delay: 0, expected: 6 },
    { mode: 'one-tick', delay: 3, expected: 9 },
  ] as const)('preserves $mode readiness behavior with delay=$delay', ({ mode, delay, expected }) => {
    const { world, player, npc } = fixture();
    npc.combat.nextActionTick = 5;
    npc.combat.retaliation = { mode, pending: [], lastIncomingAttackTick: 4 };

    notifyNpcOfPlayerAttack(npc, {
      sourceId: player.id,
      launchTick: 5,
      impactTick: 5 + delay,
      style: 'range',
      accuracySucceeded: true,
    });
    world.tick = 5 + delay;
    processNpcRetaliations(world);

    expect(npc.combat.nextActionTick).toBe(expected);
    expect(npc.combat.targetId).toBe(player.id);
    expect(npc.combat.lastAttackTick).toBeNull();
  });

  it.each([
    { label: 'immediate melee', style: 'melee', accurate: true, delay: 0, readiness: 0, expected: 7 },
    { label: 'magic splash', style: 'magic', accurate: false, delay: 3, readiness: 0, expected: 8 },
    { label: 'accurate projectile', style: 'range', accurate: true, delay: 3, readiness: 0, expected: 10 },
    { label: 'missed projectile', style: 'range', accurate: false, delay: 3, readiness: 0, expected: 10 },
    { label: 'accurate spell', style: 'magic', accurate: true, delay: 3, readiness: 0, expected: 10 },
    { label: 'immediate melee', style: 'melee', accurate: true, delay: 0, readiness: 9, expected: 9 },
    { label: 'magic splash', style: 'magic', accurate: false, delay: 3, readiness: 9, expected: 9 },
    { label: 'accurate projectile', style: 'range', accurate: true, delay: 3, readiness: 12, expected: 12 },
    { label: 'missed projectile', style: 'range', accurate: false, delay: 3, readiness: 12, expected: 12 },
    { label: 'accurate spell', style: 'magic', accurate: true, delay: 3, readiness: 12, expected: 12 },
  ] satisfies {
    label: string;
    style: DamageType;
    accurate: boolean;
    delay: number;
    readiness: number;
    expected: number;
  }[])('preserves first attack and subsequent cadence for $label with readiness=$readiness', ({
    style,
    accurate,
    delay,
    readiness,
    expected,
  }) => {
    const { engine, world, player, npc, combat } = fixture();
    npc.combat.nextActionTick = readiness;

    combat.processAttackRequest(
      world,
      {
        attacker: player,
        target: npc,
        attack: {
          style,
          attackKind: 'magic_fire',
          rolledDamage: 0,
          accuracySucceeded: accurate,
          impactDelayTicks: delay,
        },
      },
      { events: new TickEvents(), enablePendingHits: true },
    );

    const attackTicks: number[] = [];
    for (let tick = engine.currentTick + 1; tick <= expected + 4; tick++) {
      engine.advanceTick([...PLAYER_START]);
      if (
        engine
          .getLastTickEvents()
          .some((event) => event.type === 'attack_started' && event.sourceId === npc.id && event.targetId === player.id)
      ) {
        attackTicks.push(engine.currentTick);
      }
    }
    expect(attackTicks).toEqual([expected, expected + 4]);
    expect(npc.combat.retaliation?.pending).toEqual([]);
  });

  it('notifies a supplemental target without another launch event', () => {
    const { world, player, npc, combat } = fixture();
    const events = new TickEvents();

    combat.processSupplementalHitRequest(
      world,
      {
        attacker: player,
        target: npc,
        attack: {
          style: 'magic',
          attackKind: 'magic_fire',
          rolledDamage: 0,
          accuracySucceeded: false,
          impactDelayTicks: 3,
        },
      },
      { events, enablePendingHits: true },
    );

    expect(npc.combat.targetId).toBe('other-target');
    expect(npc.combat.retaliation?.pending).toEqual([{ tick: 6, sourceId: player.id }]);
    expect(events.flush().filter((event) => event.type === 'attack_started')).toEqual([]);
  });

  it('does not notify a target for a rejected attack', () => {
    const { world, player, npc, combat } = fixture();
    player.alive = false;

    expect(
      combat.processAttackRequest(
        world,
        {
          attacker: player,
          target: npc,
          attack: {
            style: 'magic',
            attackKind: 'magic_fire',
            rolledDamage: 0,
            accuracySucceeded: false,
            impactDelayTicks: 3,
          },
        },
        { events: new TickEvents(), enablePendingHits: true },
      ),
    ).toBe(false);

    expect(npc.combat.targetId).toBe('other-target');
    expect(npc.combat.retaliation?.pending).toEqual([]);
  });

  it('records an NPC attack timestamp only after a successful commit', () => {
    class TwoAttacksEncounter extends RetaliationFixtureEncounter {
      override createNpcs(): NpcActor[] {
        const target = createFixtureNpc('other-target');
        target.archetypeId = 'target-fixture';
        return [target, createFixtureNpc('first'), createFixtureNpc('second')];
      }

      prepareNpcBand(ctx: EncounterContext): void {
        const target = ctx.world.getNpc('other-target');
        if (!target) throw new Error('Expected target');
        target.vitals.hp = 1;
      }

      override processNpcTick(npc: NpcActor): EncounterTickResult {
        if (npc.archetypeId !== 'retaliation-fixture') return { environmentalDamages: [] };
        return {
          environmentalDamages: [],
          npcAttacks: [
            {
              attackerId: npc.id,
              targetId: 'other-target',
              style: 'melee',
              attackKind: 'melee_slash',
              rolledDamage: 2,
              accuracySucceeded: true,
              impactDelayTicks: 0,
              sourceDeathPolicy: 'cancel-before-impact',
            },
          ],
        };
      }
    }
    const engine = new SimulationEngine({ encounter: new TwoAttacksEncounter() });
    engine.advanceTick([...PLAYER_START]);

    const world: unknown = Reflect.get(engine, 'worldState');
    if (!(world instanceof WorldState)) throw new Error('Expected world');
    expect(
      world
        .getNpcs()
        .filter((npc) => npc.archetypeId === 'retaliation-fixture')
        .map((npc) => npc.combat.lastAttackTick),
    ).toEqual([1, null]);
  });
});
