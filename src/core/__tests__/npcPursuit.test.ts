import { describe, expect, it, vi } from 'vitest';
import type { Coordinate } from '../../types/simulation';
import { createNpcStepOccupancyPredicate, TileOccupancy } from '../npcOccupancy';
import { type NpcPursuitRequest, npcPursuitPath, pursuePlayer } from '../npcPursuit';

const OPEN_FOOTPRINT = (): boolean => true;

describe('npcPursuitPath', () => {
  it('uses the cardinal-first tie-break for equal-length melee routes', () => {
    const request = {
      bossSW: [10, 10] as Coordinate,
      size: 1,
      player: [12, 12] as Coordinate,
      rng: () => 0,
      maxSpeed: 8,
      canOccupy: OPEN_FOOTPRINT,
      underFootprint: 'random-cardinal',
      unreachable: 'nearest-reachable',
    } satisfies NpcPursuitRequest;

    const path = npcPursuitPath(request);

    expect(path).toEqual([
      [11, 10],
      [12, 11],
    ]);
  });

  it('moves near when explicitly selected and every exact melee arrival is unreachable', () => {
    const allowed = new Set(['10,10', '11,10']);

    const path = npcPursuitPath({
      bossSW: [10, 10],
      size: 1,
      player: [14, 10],
      underFootprint: 'random-cardinal',
      unreachable: 'nearest-reachable',
      rng: () => 0,
      maxSpeed: 8,
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
    });

    expect(path).toEqual([[11, 10]]);
  });

  it('keeps the separately modeled under-footprint sidestep', () => {
    const randomValues = [0.25, 0.25];
    let randomIndex = 0;

    const path = npcPursuitPath({
      bossSW: [10, 10],
      size: 2,
      player: [11, 11],
      underFootprint: 'random-cardinal',
      unreachable: 'nearest-reachable',
      rng: () => randomValues[randomIndex++] ?? 0,
      maxSpeed: 1,
      canOccupy: OPEN_FOOTPRINT,
    });

    expect(path).toEqual([[11, 10]]);
  });

  it('slices the ordered route to the NPC maximum speed', () => {
    const request = {
      bossSW: [10, 10] as Coordinate,
      size: 1,
      player: [15, 10] as Coordinate,
      rng: () => 0,
      maxSpeed: 2,
      canOccupy: OPEN_FOOTPRINT,
      underFootprint: 'random-cardinal',
      unreachable: 'nearest-reachable',
    } satisfies NpcPursuitRequest;

    const path = npcPursuitPath(request);

    expect(path).toEqual([
      [11, 10],
      [12, 10],
    ]);
  });

  it('holds without consuming RNG under the target when explicitly selected', () => {
    const rng = vi.fn(() => 0);

    const path = npcPursuitPath({
      bossSW: [10, 10],
      size: 2,
      player: [11, 11],
      maxSpeed: 1,
      canOccupy: OPEN_FOOTPRINT,
      rng,
      underFootprint: 'hold',
      unreachable: 'hold',
    });

    expect(path).toEqual([]);
    expect(rng).not.toHaveBeenCalled();
  });

  it('holds rather than moving near an unreachable target when explicitly selected', () => {
    const allowed = new Set(['10,10', '11,10']);

    const path = npcPursuitPath({
      bossSW: [10, 10],
      size: 1,
      player: [14, 10],
      maxSpeed: 1,
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
      rng: () => 0,
      underFootprint: 'hold',
      unreachable: 'hold',
    });

    expect(path).toEqual([]);
  });

  it('does not reroll a random cardinal step rejected by injected eligibility', () => {
    const rng = vi.fn(() => 0);

    const path = npcPursuitPath({
      bossSW: [10, 10],
      size: 2,
      player: [11, 11],
      maxSpeed: 1,
      canOccupy: OPEN_FOOTPRINT,
      rng,
      underFootprint: 'random-cardinal',
      unreachable: 'hold',
      canStep: () => false,
    });

    expect(path).toEqual([]);
    expect(rng).toHaveBeenCalledTimes(2);
  });
});

describe('pursuePlayer', () => {
  // Movement only: eligibility (`canNpcActThisTurn`) belongs to the caller, so `alive` is not read.
  it('submits the movement for an NPC whatever its life state', () => {
    const npc = { id: 'dead-npc', position: [10, 10] as Coordinate, alive: false };

    const movement = pursuePlayer(npc, [15, 10], () => 0, {
      underFootprint: 'hold',
      unreachable: 'hold',
      size: 1,
      maxSpeed: 1,
      canOccupy: OPEN_FOOTPRINT,
    });

    expect(movement).toEqual([{ npcId: 'dead-npc', path: [[11, 10]] }]);
  });

  it('forwards footprint step eligibility through the movement-request adapter', () => {
    const healer = { id: 'healer', position: [24, 39] satisfies Coordinate, size: 1, alive: true };
    const jad = { id: 'jad', position: [25, 35] satisfies Coordinate, size: 5, alive: true };
    const canStep = createNpcStepOccupancyPredicate(new TileOccupancy().reconcile([healer, jad]));

    const movement = pursuePlayer(healer, [25, 41], () => 0, {
      size: 1,
      maxSpeed: 2,
      canOccupy: OPEN_FOOTPRINT,
      canStep,
      underFootprint: 'hold',
      unreachable: 'hold',
    });

    expect(movement).toEqual([
      {
        npcId: healer.id,
        path: [
          [24, 40],
          [25, 40],
        ],
      },
    ]);
  });

  it.each([
    { rolls: [0.25, 0.25], expected: [11, 10] },
    { rolls: [0.25, 0.75], expected: [9, 10] },
    { rolls: [0.75, 0.25], expected: [10, 11] },
    { rolls: [0.75, 0.75], expected: [10, 9] },
  ])('preserves the random-cardinal profile output for rolls $rolls', ({ rolls, expected }) => {
    const npc = { id: 'boss', position: [10, 10] satisfies Coordinate, alive: true };
    let index = 0;
    const rng = () => rolls[index++];

    const movement = pursuePlayer(npc, [11, 11], rng, {
      size: 2,
      maxSpeed: 1,
      canOccupy: OPEN_FOOTPRINT,
      underFootprint: 'random-cardinal',
      unreachable: 'nearest-reachable',
    });

    expect(movement).toEqual([{ npcId: npc.id, path: [expected] }]);
    expect(index).toBe(2);
  });

  it.each(['nearest-reachable', 'hold'] as const)('forwards the %s unreachable profile policy', (unreachable) => {
    const npc = { id: 'boss', position: [10, 10] satisfies Coordinate, alive: true };
    const allowed = new Set(['10,10', '11,10']);

    const movement = pursuePlayer(npc, [14, 10], () => 0, {
      size: 1,
      maxSpeed: 1,
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
      underFootprint: 'hold',
      unreachable,
    });

    expect(movement).toEqual(unreachable === 'hold' ? [] : [{ npcId: npc.id, path: [[11, 10]] }]);
  });
});
