import { afterEach, describe, expect, it } from 'vitest';
import { CollisionFlag } from '../../rs/collision/CollisionFlag';
import type { CollisionMap } from '../../rs/collision/WalkabilityAnalyzer';
import { setArenaConfig } from '../constants';
import { canNpcTakeCardinalStep, canNpcTakeStep } from '../npcMovementCollision';

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

const DIAGONAL_CASES = [
  {
    name: 'south-west',
    candidate: [9, 9],
    diagonalBlocker: CollisionFlag.WALL_NORTH_EAST,
    cardinalIntermediates: [
      { tile: [9, 10], blocker: CollisionFlag.WALL_EAST },
      { tile: [10, 9], blocker: CollisionFlag.WALL_NORTH },
    ],
    outerCorner2x2: [9, 9],
    strips3x3: [
      { tile: [11, 9], blocker: CollisionFlag.WALL_EAST },
      { tile: [9, 11], blocker: CollisionFlag.WALL_NORTH },
    ],
  },
  {
    name: 'north-west',
    candidate: [9, 11],
    diagonalBlocker: CollisionFlag.WALL_SOUTH_EAST,
    cardinalIntermediates: [
      { tile: [9, 10], blocker: CollisionFlag.WALL_EAST },
      { tile: [10, 11], blocker: CollisionFlag.WALL_SOUTH },
    ],
    outerCorner2x2: [9, 12],
    strips3x3: [
      { tile: [11, 13], blocker: CollisionFlag.WALL_EAST },
      { tile: [9, 11], blocker: CollisionFlag.WALL_SOUTH_EAST },
    ],
  },
  {
    name: 'south-east',
    candidate: [11, 9],
    diagonalBlocker: CollisionFlag.WALL_NORTH_WEST,
    cardinalIntermediates: [
      { tile: [11, 10], blocker: CollisionFlag.WALL_WEST },
      { tile: [10, 9], blocker: CollisionFlag.WALL_NORTH },
    ],
    outerCorner2x2: [12, 9],
    strips3x3: [
      { tile: [11, 9], blocker: CollisionFlag.WALL_WEST },
      { tile: [13, 11], blocker: CollisionFlag.WALL_NORTH },
    ],
  },
  {
    name: 'north-east',
    candidate: [11, 11],
    diagonalBlocker: CollisionFlag.WALL_SOUTH_WEST,
    cardinalIntermediates: [
      { tile: [11, 10], blocker: CollisionFlag.WALL_WEST },
      { tile: [10, 11], blocker: CollisionFlag.WALL_SOUTH },
    ],
    outerCorner2x2: [12, 12],
    strips3x3: [
      { tile: [11, 13], blocker: CollisionFlag.WALL_WEST },
      { tile: [13, 11], blocker: CollisionFlag.WALL_SOUTH },
    ],
  },
] as const;

describe('canNpcTakeStep', () => {
  afterEach(() => {
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
  });

  it('checks the complete leading edge of a non-square cardinal footprint', () => {
    // Given: a 3x2 NPC whose upper east destination tile is blocked.
    installCollision(new Map([['13,11', CollisionFlag.OBJECT]]));

    expect(canNpcTakeStep([10, 10], [11, 10], { width: 3, height: 2 })).toBe(false);
  });

  it('checks both leading edges of a non-square diagonal footprint', () => {
    // Given: the south-west corner is clear but a tile on the north leading edge is blocked.
    installCollision(new Map([['12,12', CollisionFlag.OBJECT]]));

    expect(canNpcTakeStep([10, 10], [11, 11], { width: 3, height: 2 })).toBe(false);
  });

  it('allows a clear diagonal step for an arbitrary footprint', () => {
    installCollision(new Map());

    expect(canNpcTakeStep([10, 10], [9, 9], { width: 4, height: 2 })).toBe(true);
  });

  for (const diagonal of DIAGONAL_CASES) {
    describe(diagonal.name, () => {
      it('checks the 1x1 diagonal destination mask', () => {
        installCollision(new Map([[diagonal.candidate.join(','), diagonal.diagonalBlocker]]));

        expect(canNpcTakeStep([10, 10], [diagonal.candidate[0], diagonal.candidate[1]], { width: 1, height: 1 })).toBe(
          false,
        );
      });

      for (const [index, intermediate] of diagonal.cardinalIntermediates.entries()) {
        it(`checks 1x1 cardinal intermediate ${index + 1}`, () => {
          installCollision(new Map([[intermediate.tile.join(','), intermediate.blocker]]));

          expect(
            canNpcTakeStep([10, 10], [diagonal.candidate[0], diagonal.candidate[1]], { width: 1, height: 1 }),
          ).toBe(false);
        });
      }

      it('checks the 2x2 outer diagonal corner', () => {
        installCollision(new Map([[diagonal.outerCorner2x2.join(','), diagonal.diagonalBlocker]]));

        expect(canNpcTakeStep([10, 10], [diagonal.candidate[0], diagonal.candidate[1]], { width: 2, height: 2 })).toBe(
          false,
        );
      });

      for (const [index, strip] of diagonal.strips3x3.entries()) {
        it(`checks 3x3 compound edge strip ${index + 1}`, () => {
          installCollision(new Map([[strip.tile.join(','), strip.blocker]]));

          expect(
            canNpcTakeStep([10, 10], [diagonal.candidate[0], diagonal.candidate[1]], { width: 3, height: 3 }),
          ).toBe(false);
        });
      }
    });
  }

  it('preserves the cardinal-only API contract', () => {
    installCollision(new Map());

    expect(canNpcTakeCardinalStep([10, 10], [11, 10], 2)).toBe(true);
    expect(canNpcTakeCardinalStep([10, 10], [11, 11], 2)).toBe(false);
  });

  it('keeps cardinal-only movement on the existing leading-edge rule', () => {
    installCollision(new Map([['12,10', CollisionFlag.WALL_WEST]]));

    expect(canNpcTakeCardinalStep([10, 10], [11, 10], 2)).toBe(false);
  });
});
