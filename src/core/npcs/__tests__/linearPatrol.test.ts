import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../../types/simulation';
import { calculateLinearPatrolMove, type LinearPatrolRoute, type LinearPatrolState } from '../linearPatrol';

const horizontal = {
  endpoints: [
    [2, 7],
    [6, 7],
  ],
  endpointPauseTicks: 4,
} as const satisfies LinearPatrolRoute;

function actor(position: Coordinate, state: LinearPatrolState) {
  return { id: 'patroller', alive: true, position, state };
}

describe('linear NPC patrol', () => {
  it.each([0, 1] as const)('steps toward endpoint %s when the actor is due without mutating it', (targetEndpoint) => {
    const npc = actor([4, 7], { targetEndpoint, nextMoveTick: 12 });
    const before = structuredClone(npc);

    const result = calculateLinearPatrolMove(npc, horizontal, 12);

    expect(result).toEqual({
      movement: { npcId: 'patroller', path: [[targetEndpoint === 1 ? 5 : 3, 7]] },
      state: { targetEndpoint, nextMoveTick: 13 },
    });
    expect(npc).toEqual(before);
  });

  it.each([0, 1] as const)('reverses with a four-tick pause when arriving at endpoint %s', (targetEndpoint) => {
    const npc = actor([targetEndpoint === 1 ? 5 : 3, 7], { targetEndpoint, nextMoveTick: 12 });

    const arrival = calculateLinearPatrolMove(npc, horizontal, 12);

    expect(arrival).toEqual({
      movement: { npcId: 'patroller', path: [[targetEndpoint === 1 ? 6 : 2, 7]] },
      state: { targetEndpoint: targetEndpoint === 1 ? 0 : 1, nextMoveTick: 17 },
    });
  });

  it.each([13, 14, 15, 16])('stays at the endpoint on stationary tick %s', (tick) => {
    const npc = actor([6, 7], { targetEndpoint: 0, nextMoveTick: 17 });

    const result = calculateLinearPatrolMove(npc, horizontal, tick);

    expect(result).toBeNull();
  });

  it('departs the endpoint when its pause has elapsed', () => {
    const npc = actor([6, 7], { targetEndpoint: 0, nextMoveTick: 17 });

    const result = calculateLinearPatrolMove(npc, horizontal, 17);

    expect(result).toEqual({
      movement: { npcId: 'patroller', path: [[5, 7]] },
      state: { targetEndpoint: 0, nextMoveTick: 18 },
    });
  });

  it('patrols a vertical route in both directions when advanced through both endpoint pauses', () => {
    const route = {
      endpoints: [
        [9, 5],
        [9, 2],
      ],
      endpointPauseTicks: 2,
    } as const satisfies LinearPatrolRoute;
    const npc = actor([9, 4], { targetEndpoint: 1, nextMoveTick: 1 });
    const positions = [npc.position];

    for (let tick = 1; tick <= 10; tick++) {
      const result = calculateLinearPatrolMove(npc, route, tick);
      if (result) {
        const [position] = result.movement.path;
        if (!position) throw new TypeError('Patrol move needs a step');
        npc.position = position;
        npc.state = result.state;
      }
      positions.push(npc.position);
    }

    expect(positions).toEqual([
      [9, 4],
      [9, 3],
      [9, 2],
      [9, 2],
      [9, 2],
      [9, 3],
      [9, 4],
      [9, 5],
      [9, 5],
      [9, 5],
      [9, 4],
    ]);
  });

  it('keeps two actors independent when they share a route but have different movement clocks', () => {
    const first = { ...actor([5, 7], { targetEndpoint: 1, nextMoveTick: 10 }), id: 'first' };
    const second = { ...actor([3, 7], { targetEndpoint: 1, nextMoveTick: 11 }), id: 'second' };

    const results = [
      calculateLinearPatrolMove(first, horizontal, 10),
      calculateLinearPatrolMove(second, horizontal, 10),
      calculateLinearPatrolMove(second, horizontal, 11),
    ];

    expect(results).toEqual([
      { movement: { npcId: 'first', path: [[6, 7]] }, state: { targetEndpoint: 0, nextMoveTick: 15 } },
      null,
      { movement: { npcId: 'second', path: [[4, 7]] }, state: { targetEndpoint: 1, nextMoveTick: 12 } },
    ]);
  });

  it('schedules the next tick when the endpoint pause is zero', () => {
    const npc = actor([5, 7], { targetEndpoint: 1, nextMoveTick: 12 });

    const result = calculateLinearPatrolMove(npc, { ...horizontal, endpointPauseTicks: 0 }, 12);

    expect(result?.state).toEqual({ targetEndpoint: 0, nextMoveTick: 13 });
  });

  it('holds the initial position when the first movement tick is still in the future', () => {
    const npc = actor([4, 7], { targetEndpoint: 1, nextMoveTick: 21 });

    const result = calculateLinearPatrolMove(npc, horizontal, 20);

    expect(result).toBeNull();
  });

  // Movement only: the glyph's definition decides whether it may move (`canNpcActThisTurn`).
  it('computes the move whatever the life state, leaving eligibility to the caller', () => {
    const npc = actor([4, 7], { targetEndpoint: 1, nextMoveTick: 1 });

    const result = calculateLinearPatrolMove({ ...npc, alive: false } as typeof npc, horizontal, 1);

    expect(result).toEqual(calculateLinearPatrolMove(npc, horizontal, 1));
  });
});
