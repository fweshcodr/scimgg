import { afterEach, describe, expect, it } from 'vitest';
import { CollisionFlag } from '../../../rs/collision/CollisionFlag';
import type { CollisionMap } from '../../../rs/collision/WalkabilityAnalyzer';
import type { Coordinate } from '../../../types/simulation';
import { setArenaConfig } from '../../constants';
import type { MeleeReach } from '../attackTypes';
import { hasAttackReach, isFootprintInAttackRange, isInAttackRange } from '../distance';

function collisionMapWithFlags(flagsByTile: ReadonlyMap<string, number>): CollisionMap {
  return {
    sizeX: 64,
    sizeY: 64,
    flags: new Int32Array(64 * 64),
    getFlag: (x, y) => flagsByTile.get(`${x},${y}`) ?? 0,
    hasFlag: (x, y, flag) => ((flagsByTile.get(`${x},${y}`) ?? 0) & flag) !== 0,
    flag: () => undefined,
    unflag: () => undefined,
  };
}

describe('isFootprintInAttackRange', () => {
  afterEach(() => {
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
  });

  const scalarEquivalenceCases = [
    {
      name: 'in range',
      source: [10, 10] as const,
      target: [13, 10] as const,
      targetSize: 2,
      attackRange: 3,
      flags: new Map<string, number>(),
      expected: true,
    },
    {
      name: 'out of range',
      source: [10, 10] as const,
      target: [14, 10] as const,
      targetSize: 2,
      attackRange: 2,
      flags: new Map<string, number>(),
      expected: false,
    },
    {
      name: 'overlapping footprints',
      source: [11, 11] as const,
      target: [10, 10] as const,
      targetSize: 3,
      attackRange: 1,
      flags: new Map<string, number>(),
      expected: true,
    },
    {
      name: 'cardinal melee adjacency',
      source: [9, 10] as const,
      target: [10, 10] as const,
      targetSize: 2,
      attackRange: 1,
      flags: new Map<string, number>(),
      expected: true,
    },
    {
      name: 'diagonal-only melee adjacency',
      source: [9, 9] as const,
      target: [10, 10] as const,
      targetSize: 2,
      attackRange: 1,
      flags: new Map<string, number>(),
      expected: false,
    },
    {
      name: 'wall-blocked melee edge',
      source: [9, 10] as const,
      target: [10, 10] as const,
      targetSize: 1,
      attackRange: 1,
      flags: new Map<string, number>([['9,10', CollisionFlag.WALL_EAST]]),
      expected: false,
    },
    {
      name: 'projectile-blocked line of sight',
      source: [10, 10] as const,
      target: [14, 10] as const,
      targetSize: 2,
      attackRange: 5,
      flags: new Map<string, number>([['12,10', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]]),
      expected: false,
    },
  ] as const;

  it.each(scalarEquivalenceCases)('keeps the scalar and footprint APIs equivalent: $name', (testCase) => {
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(testCase.flags),
    });

    const scalarResult = hasAttackReach(
      testCase.source[0],
      testCase.source[1],
      testCase.target[0],
      testCase.target[1],
      testCase.targetSize,
      testCase.attackRange,
    );
    const footprintResult = isFootprintInAttackRange(
      { southWest: testCase.source, width: 1, height: 1 },
      { southWest: testCase.target, width: testCase.targetSize, height: testCase.targetSize },
      { attackRange: testCase.attackRange, checkCollision: true },
    );

    expect({ scalarResult, footprintResult }).toEqual({
      scalarResult: testCase.expected,
      footprintResult: testCase.expected,
    });
  });

  it('measures range between arbitrary rectangular footprint edges', () => {
    // Given: a 3x2 source and 2x4 target separated by two tiles east-to-west.
    const source = { southWest: [10, 10] as const, width: 3, height: 2 };
    const target = { southWest: [14, 9] as const, width: 2, height: 4 };

    // When/Then: edge distance, not south-west anchor distance, controls eligibility.
    expect(isFootprintInAttackRange(source, target, { attackRange: 2 })).toBe(true);
    expect(isFootprintInAttackRange(source, target, { attackRange: 1 })).toBe(false);
  });

  it('rejects diagonal-only melee reach between rectangles', () => {
    // Given: two footprints touch only across a diagonal tile gap.
    const source = { southWest: [10, 10] as const, width: 2, height: 2 };
    const target = { southWest: [12, 12] as const, width: 3, height: 1 };

    // When/Then: range-one melee requires a shared cardinal interaction edge.
    expect(isFootprintInAttackRange(source, target, { attackRange: 1, checkCollision: true })).toBe(false);
  });

  it('allows melee when any tile along the shared interaction edge is wall-free', () => {
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(new Map([['11,10', CollisionFlag.WALL_EAST]])),
    });
    const source = { southWest: [10, 10] as const, width: 2, height: 2 };
    const target = { southWest: [12, 10] as const, width: 2, height: 2 };

    expect(isFootprintInAttackRange(source, target, { attackRange: 1, checkCollision: true })).toBe(true);
  });

  it('rejects melee when every tile along the shared interaction edge is walled', () => {
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(
        new Map([
          ['11,10', CollisionFlag.WALL_EAST],
          ['11,11', CollisionFlag.WALL_EAST],
        ]),
      ),
    });
    const source = { southWest: [10, 10] as const, width: 2, height: 2 };
    const target = { southWest: [12, 10] as const, width: 2, height: 2 };

    expect(isFootprintInAttackRange(source, target, { attackRange: 1, checkCollision: true })).toBe(false);
  });

  it('uses projectile collision for non-melee range deterministically', () => {
    // Given: an object projectile blocker spans the only line between two 1x1 footprints.
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(new Map([['12,10', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])),
    });
    const source = { southWest: [10, 10] as const, width: 1, height: 1 };
    const target = { southWest: [14, 10] as const, width: 1, height: 1 };

    // When/Then: repeated checks choose the same collision result without randomness.
    expect(isFootprintInAttackRange(source, target, { attackRange: 5, checkCollision: true })).toBe(false);
    expect(isFootprintInAttackRange(source, target, { attackRange: 5, checkCollision: true })).toBe(false);
  });

  /**
   * OSRS rays ONE line between the two rectangles' closest points, clamping each toward
   * the other. Searching every source/target tile pair
   * instead grants line of sight the moment any corner of a large footprint is exposed.
   */
  it('rays only the clamped closest points, not every source/target tile pair', () => {
    // Given: a blocker on the single line between the two rectangles' facing edges,
    // while their outer corners see each other freely.
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(new Map([['12,10', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])),
    });
    const source = { southWest: [8, 10] as const, width: 3, height: 3 };
    const target = { southWest: [14, 10] as const, width: 3, height: 3 };

    // When/Then: the clamped ray (10,10) -> (14,10) is blocked, so the attack is denied
    // even though e.g. (8,12) -> (16,12) is wide open.
    expect(isFootprintInAttackRange(source, target, { attackRange: 6, checkCollision: true })).toBe(false);
  });

  it('clamps overlapping axes to a shared coordinate so aligned footprints ray straight', () => {
    // Given: two footprints that overlap on Y, with a blocker on the shared-row line.
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(new Map([['12,11', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])),
    });
    const source = { southWest: [8, 11] as const, width: 3, height: 3 };
    const target = { southWest: [14, 9] as const, width: 3, height: 5 };

    // When/Then: both ends clamp to y=11, the low edge of the Y overlap, and the ray hits.
    expect(isFootprintInAttackRange(source, target, { attackRange: 6, checkCollision: true })).toBe(false);
  });

  it('grants line of sight between fully overlapping footprints', () => {
    // Given: the source stands inside the target, every tile a projectile blocker.
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(
        new Map([
          ['10,10', CollisionFlag.OBJECT_PROJECTILE_BLOCKER],
          ['11,11', CollisionFlag.OBJECT_PROJECTILE_BLOCKER],
        ]),
      ),
    });
    const source = { southWest: [10, 10] as const, width: 1, height: 1 };
    const target = { southWest: [10, 10] as const, width: 3, height: 3 };

    // When/Then: both endpoints clamp onto the same tile, so the ray is degenerate.
    expect(isFootprintInAttackRange(source, target, { attackRange: 5, checkCollision: true })).toBe(true);
  });
});

describe('player range-1 diagonal melee reach', () => {
  afterEach(() => {
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
  });

  // A 5x5 target at [30,30]: [29,29] touches its south-west corner diagonally, [28,28] is two tiles out.
  const TARGET: Coordinate = [30, 30];
  const SIZE = 5;
  const reach = (x: number, y: number, meleeReach?: MeleeReach) =>
    hasAttackReach(x, y, TARGET[0], TARGET[1], SIZE, 1, meleeReach);

  it('reaches the diagonally adjacent corner tile only when diagonal reach is granted', () => {
    expect(reach(29, 29, 'diagonal')).toBe(true);
    expect(reach(35, 35, 'diagonal')).toBe(true);
    expect(reach(29, 29)).toBe(false);
    expect(reach(29, 29, 'cardinal')).toBe(false);
    expect(isInAttackRange([29, 29], TARGET, SIZE, 1, true, 'diagonal')).toBe(true);
    expect(isInAttackRange([29, 29], TARGET, SIZE, 1, false, 'diagonal')).toBe(true);
    expect(isInAttackRange([29, 29], TARGET, SIZE, 1, true)).toBe(false);
  });

  it('never extends range-1 diagonal reach to a two-tile diagonal', () => {
    expect(reach(28, 28, 'diagonal')).toBe(false);
    expect(reach(28, 29, 'diagonal')).toBe(false);
    expect(isInAttackRange([28, 28], TARGET, SIZE, 1, true, 'diagonal')).toBe(false);
  });

  it('keeps cardinal adjacency eligible under either reach', () => {
    expect(reach(29, 30)).toBe(true);
    expect(reach(29, 30, 'diagonal')).toBe(true);
  });

  it('obstructs diagonal reach by line of sight, matching the footprint API', () => {
    // The clamped ray (29,29) -> (30,30) enters (29,30) before the target corner.
    setArenaConfig({
      bounds: null,
      walkableTiles: null,
      collisionMap: collisionMapWithFlags(new Map([['29,30', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])),
    });

    expect(reach(29, 29, 'diagonal')).toBe(false);
    expect(
      isFootprintInAttackRange(
        { southWest: [29, 29], width: 1, height: 1 },
        { southWest: TARGET, width: SIZE, height: SIZE },
        { attackRange: 1, checkCollision: true, meleeReach: 'diagonal' },
      ),
    ).toBe(false);
  });
});
