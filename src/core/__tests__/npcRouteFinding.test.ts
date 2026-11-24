import { afterEach, describe, expect, it } from 'vitest';
import { CollisionFlag } from '../../rs/collision/CollisionFlag';
import type { CollisionMap } from '../../rs/collision/WalkabilityAnalyzer';
import type { Coordinate } from '../../types/simulation';
import { setArenaConfig } from '../constants';
import { findNpcExactTileRoute, findNpcMeleeRoute, findNpcTileRoute } from '../npcRouteFinding';

const OPEN_FOOTPRINT = (): boolean => true;

function installCollision(flagsByTile: ReadonlyMap<string, number>): void {
  const map: CollisionMap = {
    sizeX: 64,
    sizeY: 64,
    flags: new Int32Array(64 * 64),
    getFlag: (x, y) => flagsByTile.get(`${x},${y}`) ?? 0,
    hasFlag: (x, y, flag) => ((flagsByTile.get(`${x},${y}`) ?? 0) & flag) !== 0,
    flag: () => undefined,
    unflag: () => undefined,
  };
  setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: map }, true);
}

describe('findNpcMeleeRoute', () => {
  afterEach(() => {
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
  });

  it('returns every SW-corner step in the cardinal-first exact route', () => {
    const request = {
      source: [10, 10] as Coordinate,
      size: 1,
      destination: [12, 12] as Coordinate,
      canOccupy: OPEN_FOOTPRINT,
    };

    const result = findNpcMeleeRoute(request);

    expect(result).toEqual({
      kind: 'exact',
      steps: [
        [11, 10],
        [12, 11],
      ],
    });
  });

  it('checks the complete square footprint and crossed edges while searching', () => {
    installCollision(new Map([['12,11', CollisionFlag.OBJECT]]));

    const result = findNpcMeleeRoute({
      source: [10, 10],
      size: 2,
      destination: [14, 10],
      canOccupy: OPEN_FOOTPRINT,
    });

    expect(result).toEqual({
      kind: 'exact',
      steps: [
        [11, 9],
        [12, 9],
      ],
    });
  });

  it('selects the shortest BFS route when alternatives have equal rectangle distance', () => {
    const allowed = new Set(['14,10', '13,10', '12,10', '11,11', '13,11']);

    const result = findNpcMeleeRoute({
      source: [14, 10],
      size: 1,
      destination: [12, 12],
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
    });

    expect(result).toEqual({ kind: 'alternative', steps: [[13, 11]] });
  });

  it('does not move near when fallback is disabled', () => {
    const allowed = new Set(['10,10', '11,10']);

    const result = findNpcMeleeRoute({
      source: [10, 10],
      size: 1,
      destination: [14, 10],
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
      moveNear: false,
    });

    expect(result).toEqual({ kind: 'failed' });
  });

  it('represents a successful zero-step alternative independently from failure', () => {
    const source: Coordinate = [10, 10];

    const result = findNpcMeleeRoute({
      source,
      size: 1,
      destination: [12, 12],
      canOccupy: (southWest) => southWest[0] === source[0] && southWest[1] === source[1],
    });

    expect(result).toEqual({ kind: 'alternative', steps: [] });
  });

  it('never selects the player occupied tile as a move-near destination', () => {
    const allowed = new Set(['10,10', '11,11', '12,12']);

    const result = findNpcMeleeRoute({
      source: [10, 10],
      size: 1,
      destination: [12, 12],
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
    });

    expect(result).toEqual({ kind: 'alternative', steps: [[11, 11]] });
  });

  it('searches the full source-centered 128x128 map', () => {
    const source: Coordinate = [100, 100];

    const result = findNpcMeleeRoute({
      source,
      size: 1,
      destination: [140, 100],
      canOccupy: OPEN_FOOTPRINT,
    });

    expect(result.kind).toBe('exact');
    if (result.kind !== 'exact') return;
    expect(result.steps).toHaveLength(39);
    expect(result.steps[0]).toEqual([101, 100]);
    expect(result.steps.at(-1)).toEqual([139, 100]);
  });

  it('applies injected eligibility to each searched edge, not only the first step', () => {
    const allowed = new Set(['10,10', '11,10', '12,10']);

    const result = findNpcMeleeRoute({
      source: [10, 10],
      size: 1,
      destination: [13, 10],
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
      canStep: (current, candidate, size) => size === 1 && current[0] === 10 && candidate[0] === 11,
      moveNear: false,
    });

    expect(result).toEqual({ kind: 'failed' });
  });

  it('does not let injected eligibility bypass static collision', () => {
    installCollision(new Map([['11,10', CollisionFlag.OBJECT]]));
    const allowed = new Set(['10,10', '11,10']);

    const result = findNpcMeleeRoute({
      source: [10, 10],
      size: 1,
      destination: [12, 10],
      canOccupy: (southWest) => allowed.has(southWest.join(',')),
      canStep: () => true,
      moveNear: false,
    });

    expect(result).toEqual({ kind: 'failed' });
  });
});

describe('findNpcTileRoute', () => {
  afterEach(() => setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true));

  it('arrives at the exact SW tile, preferring a clear diagonal-first path rather than melee adjacency', () => {
    expect(findNpcTileRoute({ source: [10, 10], destination: [14, 12], size: 2, canOccupy: OPEN_FOOTPRINT })).toEqual({
      kind: 'exact',
      steps: [
        [11, 11],
        [12, 12],
        [13, 12],
        [14, 12],
      ],
    });
    expect(findNpcTileRoute({ source: [14, 12], destination: [14, 12], size: 2, canOccupy: OPEN_FOOTPRINT })).toEqual({
      kind: 'exact',
      steps: [],
    });
  });

  it('uses the size-aware collision search when the direct route is blocked', () => {
    installCollision(new Map([['12,11', CollisionFlag.OBJECT]]));
    expect(findNpcTileRoute({ source: [10, 10], destination: [14, 10], size: 2, canOccupy: OPEN_FOOTPRINT })).toEqual({
      kind: 'exact',
      steps: [
        [11, 9],
        [12, 9],
        [13, 9],
        [14, 10],
      ],
    });
  });

  it('fails rather than moving near an invalid or unreachable destination', () => {
    expect(
      findNpcTileRoute({ source: [10, 10], destination: [14, 10], size: 2, canOccupy: ([x]) => x === 10 || x === 14 }),
    ).toEqual({ kind: 'failed' });
    expect(findNpcTileRoute({ source: [10, 10], destination: [10.5, 10], size: 2, canOccupy: OPEN_FOOTPRINT })).toEqual(
      { kind: 'failed' },
    );
  });
});

describe('findNpcExactTileRoute', () => {
  afterEach(() => setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true));

  it('keeps the search tie-break where findNpcTileRoute would take its clear diagonal', () => {
    const request = {
      source: [10, 10] as Coordinate,
      destination: [12, 14] as Coordinate,
      size: 1,
      canOccupy: OPEN_FOOTPRINT,
    };
    expect(findNpcExactTileRoute(request)).toEqual({
      kind: 'exact',
      steps: [
        [10, 11],
        [10, 12],
        [11, 13],
        [12, 14],
      ],
    });
    expect(findNpcTileRoute(request)).toEqual({
      kind: 'exact',
      steps: [
        [11, 11],
        [12, 12],
        [12, 13],
        [12, 14],
      ],
    });
  });

  it('is empty on the destination and fails on an unoccupiable one, never moving near', () => {
    expect(
      findNpcExactTileRoute({ source: [12, 14], destination: [12, 14], size: 1, canOccupy: OPEN_FOOTPRINT }),
    ).toEqual({ kind: 'exact', steps: [] });
    expect(
      findNpcExactTileRoute({
        source: [10, 10],
        destination: [12, 14],
        size: 1,
        canOccupy: ([x, y]) => x !== 12 || y !== 14,
      }),
    ).toEqual({ kind: 'failed' });
  });
});
