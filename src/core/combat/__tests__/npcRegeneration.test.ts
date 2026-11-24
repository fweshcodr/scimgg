import { describe, expect, it } from 'vitest';
import type { NpcActor } from '../../actors/NpcActor';
import { advanceNpcHitpointRegen, enableNpcHitpointRegen } from '../npcRegeneration';

function makeNpc(hp: number): NpcActor {
  return {
    id: 'target',
    kind: 'npc',
    alive: true,
    position: [10, 10],
    previousPosition: [10, 10],
    facing: 0,
    size: 1,
    vitals: { hp, maxHp: 500 },
    npcTypeId: 1,
    archetypeId: 'test',
    history: new Map(),
    combat: {
      attackSpeed: 4,
      attackRange: 1,
      attackStyle: 'melee',
      nextActionTick: 0,
      lastAttackTick: null,
      targetId: null,
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
  };
}

/** HP after each tick from `from` through `to`, running the clock every tick like the engine. */
function hpTrace(npc: NpcActor, from: number, to: number): Map<number, number> {
  const trace = new Map<number, number>();
  for (let tick = from; tick <= to; tick++) {
    advanceNpcHitpointRegen(npc, tick);
    trace.set(tick, npc.vitals.hp);
  }
  return trace;
}

describe('NPC hitpoint regeneration', () => {
  it('heals 1 HP one hundred ticks after the tick following its addition, then every 100 ticks', () => {
    const npc = makeNpc(400);
    enableNpcHitpointRegen(npc, 7);
    const trace = hpTrace(npc, 7, 7 + 201);
    expect([107, 108, 207, 208].map((tick) => trace.get(tick))).toEqual([400, 401, 401, 402]);
  });

  it('keeps its cadence at full HP, so the heal due then is lost rather than deferred', () => {
    const npc = makeNpc(500);
    enableNpcHitpointRegen(npc, 0);
    hpTrace(npc, 0, 150);
    npc.vitals.hp = 450;
    const trace = hpTrace(npc, 151, 201);
    expect([200, 201].map((tick) => trace.get(tick))).toEqual([450, 451]);
  });

  it('does nothing for NPCs that never opted in, or once dead', () => {
    const plain = makeNpc(400);
    expect(hpTrace(plain, 0, 300).get(300)).toBe(400);
    const dead = makeNpc(400);
    enableNpcHitpointRegen(dead, 0);
    dead.alive = false;
    expect(hpTrace(dead, 0, 300).get(300)).toBe(400);
  });
});
