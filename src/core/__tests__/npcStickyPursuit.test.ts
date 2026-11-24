import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../types/simulation';
import {
  createNpcStickyPursuitState,
  isAtStickyPursuitDestination,
  type NpcStickyPursuitProfile,
  pursuePlayerSticky,
  stickyPursuitSteps,
} from '../npcStickyPursuit';

const profile = (overrides: Partial<NpcStickyPursuitProfile> = {}): NpcStickyPursuitProfile => ({
  size: 1,
  maxSteps: 2,
  slotOffset: [0, 1],
  fallbackOffsets: [[0, -1]],
  canOccupy: () => true,
  unreachable: 'hold',
  ...overrides,
});
const without =
  (...tiles: Coordinate[]) =>
  ([x, y]: Coordinate): boolean =>
    !tiles.some((tile) => tile[0] === x && tile[1] === y);

describe('stickyPursuitSteps', () => {
  it('routes to the slot, not the nearest tile in reach, straight steps first, two per tick', () => {
    const state = createNpcStickyPursuitState();
    // Slot [13,17]: three east and seven north, so the search runs north before the diagonals.
    expect(stickyPursuitSteps([10, 10], [13, 16], profile(), state)).toEqual([
      [10, 11],
      [10, 12],
    ]);
    expect(state.remainingSteps).toEqual([
      [10, 13],
      [10, 14],
      [11, 15],
      [12, 16],
      [13, 17],
    ]);
  });

  it('walks a single last step and then holds on the slot', () => {
    const state = createNpcStickyPursuitState();
    expect(stickyPursuitSteps([13, 16], [13, 16], profile(), state)).toEqual([[13, 17]]);
    expect(stickyPursuitSteps([13, 17], [13, 16], profile(), state)).toEqual([]);
  });

  it('crosses the player tile on its way round, since the player does not block', () => {
    expect(stickyPursuitSteps([10, 10], [10, 11], profile(), createNpcStickyPursuitState())).toEqual([
      [10, 11],
      [10, 12],
    ]);
  });

  it('tries the fallbacks in order when a slot cannot be occupied', () => {
    const blocked = profile({
      fallbackOffsets: [
        [-1, 0],
        [0, -1],
      ],
      canOccupy: without([20, 21], [19, 20]),
    });
    expect(stickyPursuitSteps([20, 17], [20, 20], blocked, createNpcStickyPursuitState())).toEqual([
      [20, 18],
      [20, 19],
    ]);
  });

  it('routes into melee reach, or holds, once every slot is unusable', () => {
    const canOccupy = without([20, 21], [20, 19]);
    const player: Coordinate = [20, 20];
    expect(stickyPursuitSteps([16, 20], player, profile({ canOccupy }), createNpcStickyPursuitState())).toEqual([]);
    expect(
      stickyPursuitSteps(
        [16, 20],
        player,
        profile({ canOccupy, unreachable: 'nearest-adjacent' }),
        createNpcStickyPursuitState(),
      ),
    ).toEqual([
      [17, 20],
      [18, 20],
    ]);
  });

  it('keeps walking the last route when the player arrives beside it (no-sol t1801)', () => {
    const state = createNpcStickyPursuitState();
    expect(stickyPursuitSteps([10, 10], [10, 16], profile(), state)).toEqual([
      [10, 11],
      [10, 12],
    ]);
    // The player stepped next to it, so it starts the tick on its slot; the old tail still runs.
    expect(stickyPursuitSteps([10, 12], [10, 11], profile(), state)).toEqual([
      [10, 13],
      [10, 14],
    ]);
    // A fresh route replaces the tail as soon as it is non-empty.
    expect(stickyPursuitSteps([10, 14], [12, 14], profile(), state)).toEqual([
      [11, 14],
      [12, 15],
    ]);
    expect(state.remainingSteps).toEqual([]);
  });

  it('drops a tail that no longer starts beside the NPC', () => {
    const state = { remainingSteps: [[10, 13] as Coordinate, [10, 14] as Coordinate] };
    expect(stickyPursuitSteps([30, 30], [30, 29], profile(), state)).toEqual([]);
    expect(state.remainingSteps).toEqual([]);
  });
});

describe('isAtStickyPursuitDestination', () => {
  const player: Coordinate = [20, 20];

  it('is true only on the slot while the slot is usable', () => {
    expect(isAtStickyPursuitDestination([20, 21], player, profile())).toBe(true);
    // The fallback tile is beside the player too, but the slot is the destination.
    expect(isAtStickyPursuitDestination([20, 19], player, profile())).toBe(false);
    expect(isAtStickyPursuitDestination([21, 20], player, profile())).toBe(false);
  });

  it('follows the fallback the pursuit selects when the slot is unusable', () => {
    const blocked = profile({ canOccupy: without([20, 21]) });
    expect(isAtStickyPursuitDestination([20, 19], player, blocked)).toBe(true);
    expect(stickyPursuitSteps([20, 19], player, blocked, createNpcStickyPursuitState())).toEqual([]);
  });

  it('accepts any tile in melee reach only once every slot is unusable and it is not holding', () => {
    const canOccupy = without([20, 21], [20, 19]);
    expect(isAtStickyPursuitDestination([19, 20], player, profile({ canOccupy }))).toBe(false);
    expect(
      isAtStickyPursuitDestination([19, 20], player, profile({ canOccupy, unreachable: 'nearest-adjacent' })),
    ).toBe(true);
    expect(
      isAtStickyPursuitDestination([19, 21], player, profile({ canOccupy, unreachable: 'nearest-adjacent' })),
    ).toBe(false);
  });
});

describe('pursuePlayerSticky', () => {
  // Movement only: a queued death still walks on its killing tick, so eligibility is the definition's.
  it('requests the steps for an NPC whatever its life state', () => {
    const npc = { id: 'warbander', position: [10, 10] as Coordinate };
    expect(pursuePlayerSticky(npc, [13, 16], profile(), createNpcStickyPursuitState())).toEqual([
      {
        npcId: 'warbander',
        path: [
          [10, 11],
          [10, 12],
        ],
      },
    ]);
    expect(
      pursuePlayerSticky({ ...npc, alive: false } as typeof npc, [13, 16], profile(), createNpcStickyPursuitState()),
    ).toEqual(pursuePlayerSticky(npc, [13, 16], profile(), createNpcStickyPursuitState()));
  });
});
