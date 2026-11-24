import { describe, expect, it } from 'vitest';
import type { NpcActor } from '../../actors/NpcActor';
import type { NpcCombatState } from '../../actors/types';
import { WorldState } from '../../WorldState';
import { isNpcActionReady, scheduleNpcAction } from '../npcActionClock';
import { notifyNpcOfPlayerAttack, processNpcRetaliations } from '../retaliation';

function createNpc(mode: NonNullable<NpcCombatState['retaliation']>['mode'], nextActionTick: number): NpcActor {
  return {
    id: 'attacker',
    kind: 'npc',
    npcTypeId: 1,
    archetypeId: 'action-clock-fixture',
    alive: true,
    position: [0, 0],
    previousPosition: [0, 0],
    facing: 0,
    size: 1,
    history: new Map(),
    vitals: { hp: 100, maxHp: 100 },
    combat: {
      attackSpeed: 4,
      attackRange: 1,
      attackStyle: 'melee',
      nextActionTick,
      targetId: 'other-target',
      lastAttackTick: null,
      retaliation: { mode, pending: [], lastIncomingAttackTick: null },
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
  };
}

describe('NPC absolute action clock', () => {
  it('leaves readiness unchanged before the scheduled tick', () => {
    const combat = { nextActionTick: 1 };

    const ready = isNpcActionReady(combat, 0);

    expect({ ready, nextActionTick: combat.nextActionTick }).toEqual({ ready: false, nextActionTick: 1 });
  });

  it('becomes ready at the scheduled tick without consuming queries', () => {
    const combat = { nextActionTick: 2 };

    const readiness = Array.from({ length: 4 }, (_, tick) => isNpcActionReady(combat, tick));

    expect(readiness).toEqual([false, false, true, true]);
    expect(combat.nextActionTick).toBe(2);
  });

  it('keeps actors independent when their turns are interleaved', () => {
    const first = { nextActionTick: 1 };
    const second = { nextActionTick: 2 };

    const readiness = Array.from({ length: 3 }, (_, tick) => [
      isNpcActionReady(first, tick),
      isNpcActionReady(second, tick),
    ]);

    expect(readiness).toEqual([
      [false, false],
      [true, false],
      [true, true],
    ]);
  });

  it.each([
    { interval: 1, expected: [0, 1, 2, 3, 4, 5, 6, 7, 8] },
    { interval: 4, expected: [0, 4, 8] },
  ])('acts every $interval ticks when scheduled after each action', ({ interval, expected }) => {
    const combat = { nextActionTick: 0 };
    const actionTicks: number[] = [];

    for (let tick = 0; tick <= 8; tick++) {
      if (!isNpcActionReady(combat, tick)) continue;
      actionTicks.push(tick);
      scheduleNpcAction(combat, tick, interval);
    }

    expect(actionTicks).toEqual(expected);
  });

  describe.each([
    {
      label: 'pre-NPC projectile impact',
      style: 'range',
      accuracySucceeded: true,
      launchTick: 0,
      impactTick: 3,
      standardFirst: 5,
      retargetFirst: 3,
    },
    {
      label: 'post-NPC immediate hit',
      style: 'melee',
      accuracySucceeded: true,
      launchTick: 3,
      impactTick: 3,
      standardFirst: 5,
      retargetFirst: 4,
    },
    {
      label: 'queued standard splash',
      style: 'magic',
      accuracySucceeded: false,
      launchTick: 3,
      impactTick: 6,
      standardFirst: 6,
      retargetFirst: 4,
    },
  ] as const)('$label with an explicitly selected retaliation policy', (hit) => {
    it.each([
      { mode: 'retarget', initialReadiness: 1 },
      { mode: 'retarget', initialReadiness: 9 },
      { mode: 'standard', initialReadiness: 1 },
      { mode: 'one-tick', initialReadiness: 1 },
      { mode: 'standard', initialReadiness: 9 },
      { mode: 'one-tick', initialReadiness: 9 },
    ] as const)('recovers on the expected cadence when mode=$mode and initialReadiness=$initialReadiness', ({
      mode,
      initialReadiness,
    }) => {
      const npc = createNpc(mode, initialReadiness);
      const world = new WorldState();
      world.actors.set(npc.id, npc);
      world.actors.set('player', {
        id: 'player',
        kind: 'player',
        alive: true,
        position: [1, 0],
        previousPosition: [1, 0],
        facing: 0,
        size: 1,
        vitals: { hp: 100, maxHp: 100 },
      });
      const actionTicks: number[] = [];
      const firstActions = {
        standard: Math.max(initialReadiness, hit.standardFirst),
        retarget: Math.max(initialReadiness, hit.retargetFirst),
        'one-tick': 4,
      };
      const firstAction = firstActions[mode];

      for (let tick = 0; tick <= firstAction + 8; tick++) {
        world.tick = tick;
        processNpcRetaliations(world);
        const ready = isNpcActionReady(npc.combat, tick);
        if (ready && npc.combat.targetId === 'player') {
          actionTicks.push(tick);
          npc.combat.lastAttackTick = tick;
          scheduleNpcAction(npc.combat, tick, npc.combat.attackSpeed);
        }
        if (tick === hit.launchTick) {
          notifyNpcOfPlayerAttack(npc, { ...hit, sourceId: 'player' });
        }
      }

      expect(actionTicks).toEqual([firstAction, firstAction + 4, firstAction + 8]);
      expect(npc.combat.retaliation?.pending).toEqual([]);
    });
  });

  it('preserves the cadence when a standard-policy actor is already fighting the player', () => {
    const npc = createNpc('standard', 0);
    npc.combat.targetId = 'player';
    const actionTicks: number[] = [];

    for (let tick = 0; tick <= 8; tick++) {
      if (isNpcActionReady(npc.combat, tick)) {
        actionTicks.push(tick);
        npc.combat.lastAttackTick = tick;
        scheduleNpcAction(npc.combat, tick, npc.combat.attackSpeed);
      }
      if (tick === 3) {
        notifyNpcOfPlayerAttack(npc, {
          sourceId: 'player',
          launchTick: tick,
          impactTick: tick,
          style: 'melee',
          accuracySucceeded: true,
        });
      }
    }

    expect(actionTicks).toEqual([0, 4, 8]);
  });
});
