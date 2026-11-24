import { describe, expect, it } from 'vitest';
import type { NpcMovementInfo } from '../../../../core/encounters/types';
import { createNpcStepOccupancyPredicate, TileOccupancy } from '../../../../core/npcOccupancy';
import { WorldState } from '../../../../core/WorldState';
import type { Coordinate } from '../../../../types/simulation';
import { ColosseumRouteRunner } from '../routeRunner';
import { createSolarflare, SOLARFLARE_DAMAGE_SOURCE, SOLARFLARE_TIMING, SolarflareDamageState } from '../solarflare';
import {
  volatilityExplosionCentre,
  volatilityExplosionDamage,
  volatilityExplosionTiles,
  volatilityRingDelay,
} from '../volatility';

const corners = [
  [0, 0],
  [0, 4],
  [4, 4],
  [4, 0],
] as const;

describe('Colosseum corner route runner', () => {
  it.each([
    { tier: 1, interval: 2, nextSide: 13, lap: 52 },
    { tier: 2, interval: 2, nextSide: 8, lap: 32 },
    { tier: 3, interval: 1, nextSide: 5, lap: 20 },
  ] as const)('uses tier $tier step/corner timing without an extra pause', ({ tier, interval, nextSide, lap }) => {
    const route = new ColosseumRouteRunner(corners, SOLARFLARE_TIMING[tier]);
    expect(route.positionAt(-1)).toEqual([0, 0]);
    for (let step = 0; step < 4; step++) {
      expect(route.positionAt(step * interval)).toEqual([0, step + 1]);
    }
    for (let tick = 3 * interval; tick < nextSide; tick++) expect(route.positionAt(tick)).toEqual([0, 4]);
    expect(route.positionAt(nextSide)).toEqual([1, 4]);
    expect(route.lapTicks).toBe(lap);
    expect(route.positionAt(lap - 1)).toEqual([0, 0]);
    for (let tick = 0; tick < lap * 3; tick++) {
      expect(route.positionAt(tick + lap)).toEqual(route.positionAt(tick));
    }
    const exposed = route.positionAt(0);
    exposed[0] = 100;
    expect(route.positionAt(0)).toEqual([0, 1]);
  });

  it('supports unequal sides and rejects empty or diagonal segments', () => {
    const route = new ColosseumRouteRunner(
      [
        [0, 0],
        [0, 2],
        [3, 2],
        [3, 0],
      ],
      { stepInterval: 2, cornerPause: 0 },
    );
    expect(route.lapTicks).toBe(20);
    expect(route.positionAt(2)).toEqual([0, 2]);
    expect(route.positionAt(4)).toEqual([1, 2]);
    expect(
      () =>
        new ColosseumRouteRunner(
          [
            [0, 0],
            [1, 1],
          ],
          SOLARFLARE_TIMING[1],
        ),
    ).toThrow();
    expect(() => new ColosseumRouteRunner([], SOLARFLARE_TIMING[1])).toThrow();
  });

  it('creates inert cache-backed orbs which set no entity collision flags', () => {
    const orb = createSolarflare({ id: 'orb', corners, tier: 1, spawnTick: 3, firstStepTick: 4 });
    expect(orb).toMatchObject({
      npcTypeId: 12826,
      size: 1,
      blocksNpcMovement: false,
      combat: { targetId: null, attackRange: 0 },
    });
    const occupancy = new TileOccupancy();
    const canStep = createNpcStepOccupancyPredicate(occupancy.reconcile([orb]));
    expect(canStep([-1, 0], [0, 0], 1)).toBe(true);
    orb.blocksNpcMovement = true;
    occupancy.reconcile([orb]);
    expect(canStep([-1, 0], [0, 0], 1)).toBe(false);
  });
});

describe('Volatility footprint and ring delay', () => {
  it.each([1, 2, 3] as const)('hits every inside start tile and no outside tile at tier %i', (tier) => {
    const tiles = volatilityExplosionTiles([10, 20], 5, tier);
    for (const tile of tiles) {
      expect(volatilityExplosionDamage([10, 20], 5, tier, tile)).toEqual([
        { baseDamage: [16, 24], attackType: 'typeless', source: 'Volatility', playerPosition: tile },
      ]);
    }
    for (const tile of [
      [7, 20],
      [10, 17],
      [17, 20],
      [10, 27],
    ] as Coordinate[]) {
      expect(volatilityExplosionDamage([10, 20], 5, tier, tile)).toEqual([]);
    }
  });
  it.each([3, 5])('expands a size-%i footprint at all three tiers', (size) => {
    const position: Coordinate = [10, 20];
    const centre = volatilityExplosionCentre(position, size);
    expect(centre).toEqual([10 + Math.floor(size / 2), 20 + Math.floor(size / 2)]);
    for (const tier of [1, 2, 3] as const) {
      const radius = Math.min(tier, 2);
      const side = size + 2 * radius;
      const tiles = volatilityExplosionTiles(position, size, tier);
      expect(tiles).toHaveLength(side * side);
      expect(new Set(tiles.map(String)).size).toBe(side * side);
      expect(tiles[0]).toEqual([10 - radius, 20 - radius]);
      expect(tiles.at(-1)).toEqual([10 + size - 1 + radius, 20 + size - 1 + radius]);
      expect(volatilityRingDelay(centre, centre)).toBe(0);
      expect(volatilityRingDelay(tiles[0]!, centre)).toBe(side - 1);
      expect(volatilityRingDelay([centre[0] + 1, centre[1] - 2], centre)).toBe(4);
    }
    expect(volatilityExplosionTiles(position, size, 3)).toEqual(volatilityExplosionTiles(position, size, 2));
  });
});

describe('Solarflare departure damage', () => {
  const movement = (from: Coordinate, to: Coordinate): NpcMovementInfo => ({
    npcId: 'orb',
    from,
    to,
    moved: from[0] !== to[0] || from[1] !== to[1],
    path: [to],
  });
  const context = (tick: number, playerPos: Coordinate) => ({ tick, playerPos, world: new WorldState() });

  it.each([
    1, 2, 3,
  ] as const)('lands a qualifying departure one tick later at tier %i, regardless of later movement', (tier) => {
    const state = new SolarflareDamageState();
    expect(state.resolveTick(context(4, [0, 0]), [movement([0, 0], [0, 1])], tier)).toEqual([]);
    expect(state.resolveTick(context(5, [9, 9]), [], tier)).toEqual([
      { baseDamage: [10, 20], attackType: 'typeless', source: SOLARFLARE_DAMAGE_SOURCE, playerPosition: [9, 9] },
    ]);
    expect(state.resolveTick(context(6, [0, 0]), [], tier)).toEqual([]);
  });

  it('does not hit arrival-only overlap, corner holds, or a player who left before departure', () => {
    const state = new SolarflareDamageState();
    expect(state.resolveTick(context(4, [0, 1]), [movement([0, 0], [0, 1])], 3)).toEqual([]);
    expect(state.resolveTick(context(5, [0, 1]), [movement([0, 1], [0, 1])], 3)).toEqual([]);
    expect(state.resolveTick(context(6, [9, 9]), [movement([0, 1], [0, 2])], 3)).toEqual([]);
    expect(state.resolveTick(context(7, [9, 9]), [], 3)).toEqual([]);
  });

  it('keeps distinct same-tick departures and clears queued hits on reset', () => {
    const state = new SolarflareDamageState();
    state.resolveTick(context(4, [0, 0]), [movement([0, 0], [0, 1]), movement([0, 0], [1, 0])], 1);
    expect(state.resolveTick(context(5, [9, 9]), [], 1)).toHaveLength(2);
    state.resolveTick(context(6, [0, 0]), [movement([0, 0], [0, 1])], 1);
    state.reset();
    expect(state.resolveTick(context(7, [9, 9]), [], 1)).toEqual([]);
  });
});
