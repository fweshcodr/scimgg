import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CollisionFlag } from '../../../rs/collision/CollisionFlag';
import type { CollisionMap } from '../../../rs/collision/WalkabilityAnalyzer';
import { setCollisionMap } from '../../constants';
import {
  chebyshevDistanceToRect,
  hasDirectReach,
  hasLineOfSight,
  hasLineOfSightToNpc,
  isInAttackRange,
  isInAttackRangeRaw,
  isUnderNpc,
  isUnderNpcRaw,
} from '../distance';

describe('isInAttackRangeRaw', () => {
  it('should match isInAttackRange for same inputs', () => {
    const cases: [number, number, number, number, number, number][] = [
      [31, 25, 29, 28, 5, 10],
      [31, 25, 29, 28, 5, 1],
      [29, 28, 29, 28, 5, 1],
      [34, 33, 29, 28, 5, 1],
      [35, 33, 29, 28, 5, 1],
      [0, 0, 5, 5, 3, 2],
    ];
    for (const [px, py, nx, ny, size, range] of cases) {
      const coordResult = isInAttackRange([px, py], [nx, ny], size, range);
      const rawResult = isInAttackRangeRaw(px, py, nx, ny, size, range);
      expect(rawResult).toBe(coordResult);
    }
  });

  it('should return true when player is adjacent to NPC edge', () => {
    expect(isInAttackRangeRaw(28, 30, 29, 28, 5, 1)).toBe(true);
  });

  it('should return false when player is diagonal at range 1', () => {
    expect(isInAttackRangeRaw(28, 27, 29, 28, 5, 1)).toBe(false);
  });

  it('should return true when player is on NPC tile', () => {
    expect(isInAttackRangeRaw(30, 30, 29, 28, 5, 1)).toBe(true);
  });
});

describe('chebyshevDistanceToRect', () => {
  it('should return 0 when inside rect', () => {
    expect(chebyshevDistanceToRect(30, 30, 29, 28, 5)).toBe(0);
  });

  it('should return distance to nearest edge', () => {
    expect(chebyshevDistanceToRect(26, 30, 29, 28, 5)).toBe(3);
  });
});

describe('isUnderNpcRaw', () => {
  it('should return true for tile inside NPC footprint', () => {
    expect(isUnderNpcRaw(30, 30, 29, 28, 5)).toBe(true);
  });

  it('should return true for SW corner tile', () => {
    expect(isUnderNpcRaw(29, 28, 29, 28, 5)).toBe(true);
  });

  it('should return true for NE corner tile', () => {
    expect(isUnderNpcRaw(33, 32, 29, 28, 5)).toBe(true);
  });

  it('should return false for tile adjacent west of NPC', () => {
    expect(isUnderNpcRaw(28, 30, 29, 28, 5)).toBe(false);
  });

  it('should return false for tile adjacent south of NPC', () => {
    expect(isUnderNpcRaw(30, 27, 29, 28, 5)).toBe(false);
  });

  it('should return false for tile one east of NPC', () => {
    expect(isUnderNpcRaw(34, 30, 29, 28, 5)).toBe(false);
  });

  it('should return false for tile one north of NPC', () => {
    expect(isUnderNpcRaw(30, 33, 29, 28, 5)).toBe(false);
  });
});

describe('isUnderNpc', () => {
  it('should match isUnderNpcRaw for coordinate inputs', () => {
    expect(isUnderNpc([30, 30], [29, 28], 5)).toBe(true);
    expect(isUnderNpc([28, 30], [29, 28], 5)).toBe(false);
  });
});

function createWallCollisionMap(walls: Map<string, number>): CollisionMap {
  const sizeX = 64;
  const sizeY = 64;
  const flags = new Int32Array(sizeX * sizeY);
  return {
    sizeX,
    sizeY,
    flags,
    getFlag: (x: number, y: number) => flags[x + y * sizeX] | (walls.get(`${x},${y}`) ?? 0),
    hasFlag: (x: number, y: number, flag: number) =>
      ((flags[x + y * sizeX] | (walls.get(`${x},${y}`) ?? 0)) & flag) !== 0,
    flag(x: number, y: number, flag: number): void {
      if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
        flags[x + y * sizeX] |= flag;
      }
    },
    unflag(x: number, y: number, flag: number): void {
      if (x >= 0 && x < sizeX && y >= 0 && y < sizeY) {
        flags[x + y * sizeX] &= ~flag;
      }
    },
  };
}

function emptyCollisionMap(): CollisionMap {
  return createWallCollisionMap(new Map());
}

describe('hasDirectReach', () => {
  afterEach(() => {
    setCollisionMap(emptyCollisionMap());
  });

  describe('without walls (geometry only)', () => {
    beforeEach(() => {
      setCollisionMap(emptyCollisionMap());
    });

    it('returns true when player is inside NPC footprint', () => {
      expect(hasDirectReach(10, 10, 10, 10, 1)).toBe(true);
    });

    it('returns true for cardinal adjacency (west)', () => {
      expect(hasDirectReach(9, 10, 10, 10, 1)).toBe(true);
    });

    it('returns true for cardinal adjacency (east)', () => {
      expect(hasDirectReach(11, 10, 10, 10, 1)).toBe(true);
    });

    it('returns true for cardinal adjacency (south)', () => {
      expect(hasDirectReach(10, 9, 10, 10, 1)).toBe(true);
    });

    it('returns true for cardinal adjacency (north)', () => {
      expect(hasDirectReach(10, 11, 10, 10, 1)).toBe(true);
    });

    it('returns true for diagonal adjacency (SW)', () => {
      expect(hasDirectReach(9, 9, 10, 10, 1)).toBe(true);
    });

    it('returns true for diagonal adjacency (NE)', () => {
      expect(hasDirectReach(11, 11, 10, 10, 1)).toBe(true);
    });

    it('returns false when 2 tiles away', () => {
      expect(hasDirectReach(8, 10, 10, 10, 1)).toBe(false);
    });

    it('returns false when 2 tiles away diagonally', () => {
      expect(hasDirectReach(8, 8, 10, 10, 1)).toBe(false);
    });

    // 5x5 NPC (Yama) at SW corner (29, 28), occupies [29-33, 28-32]
    it('returns true for player inside 5x5 NPC', () => {
      expect(hasDirectReach(31, 30, 29, 28, 5)).toBe(true);
    });

    it('returns true for cardinal adjacency to 5x5 west edge', () => {
      expect(hasDirectReach(28, 30, 29, 28, 5)).toBe(true);
    });

    it('returns true for cardinal adjacency to 5x5 south edge', () => {
      expect(hasDirectReach(31, 27, 29, 28, 5)).toBe(true);
    });

    it('returns true for cardinal adjacency to 5x5 east edge', () => {
      expect(hasDirectReach(34, 30, 29, 28, 5)).toBe(true);
    });

    it('returns true for cardinal adjacency to 5x5 north edge', () => {
      expect(hasDirectReach(31, 33, 29, 28, 5)).toBe(true);
    });

    it('returns true for diagonal adjacency to 5x5 SW corner', () => {
      expect(hasDirectReach(28, 27, 29, 28, 5)).toBe(true);
    });

    it('returns true for diagonal adjacency to 5x5 NE corner', () => {
      expect(hasDirectReach(34, 33, 29, 28, 5)).toBe(true);
    });

    it('returns false when 2 tiles west of 5x5', () => {
      expect(hasDirectReach(27, 30, 29, 28, 5)).toBe(false);
    });
  });

  describe('with walls (OSRS parity)', () => {
    it('blocks cardinal reach through a wall (east wall between player and NPC)', () => {
      // Wall on east side of (9, 10) blocks movement east
      const walls = new Map<string, number>([['9,10', CollisionFlag.WALL_EAST]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 10, 10, 10, 1)).toBe(false);
    });

    it('blocks cardinal reach when NPC side has west wall', () => {
      const walls = new Map<string, number>([['10,10', CollisionFlag.WALL_WEST]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 10, 10, 10, 1)).toBe(false);
    });

    it('blocks cardinal reach through north wall', () => {
      // Wall on south side of player tile
      const walls = new Map<string, number>([['10,11', CollisionFlag.WALL_SOUTH]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(10, 11, 10, 10, 1)).toBe(false);
    });

    it('allows reach when wall is in unrelated direction', () => {
      // North wall on player tile — doesn't block east movement
      const walls = new Map<string, number>([['9,10', CollisionFlag.WALL_NORTH]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 10, 10, 10, 1)).toBe(true);
    });

    it('blocks diagonal when both L-paths have walls', () => {
      // Block horiz-first path: east wall on (9,9)
      // Block vert-first path: north wall on (9,9)
      const walls = new Map<string, number>([['9,9', CollisionFlag.WALL_EAST | CollisionFlag.WALL_NORTH]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 9, 10, 10, 1)).toBe(false);
    });

    it('allows diagonal when horiz-first L-path is clear', () => {
      // Block vert-first path only: north wall on (9,9)
      const walls = new Map<string, number>([['9,9', CollisionFlag.WALL_NORTH]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 9, 10, 10, 1)).toBe(true);
    });

    it('allows diagonal when vert-first L-path is clear', () => {
      // Block horiz-first path only: east wall on (9,9)
      const walls = new Map<string, number>([['9,9', CollisionFlag.WALL_EAST]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 9, 10, 10, 1)).toBe(true);
    });

    it('blocks diagonal when horiz-first intermediate has wall', () => {
      // Horiz-first: (9,9)→(10,9)→(10,10). Block north wall on (10,9)
      // Vert-first: (9,9)→(9,10)→(10,10). Block east wall on (9,10)
      const walls = new Map<string, number>([
        ['10,9', CollisionFlag.WALL_NORTH],
        ['9,10', CollisionFlag.WALL_EAST],
      ]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(hasDirectReach(9, 9, 10, 10, 1)).toBe(false);
    });

    it('blocks melee attack through wall via isInAttackRange with checkWalls', () => {
      // Wall blocks east on player tile
      const walls = new Map<string, number>([['28,30', CollisionFlag.WALL_EAST]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(isInAttackRange([28, 30], [29, 28], 5, 1, false)).toBe(true);
      expect(isInAttackRange([28, 30], [29, 28], 5, 1, true)).toBe(false);
    });

    it('does not check walls for ranged attacks (range > 1)', () => {
      // Wall blocks east on player tile — but range is 10, so no wall check
      const walls = new Map<string, number>([['28,30', CollisionFlag.WALL_EAST]]);
      setCollisionMap(createWallCollisionMap(walls));
      expect(isInAttackRange([28, 30], [29, 28], 5, 10, true)).toBe(true);
    });
  });
});

/**
 * Line of sight is a port of RuneLite's `WorldArea.hasLineOfSight`
 * (RuneLite WorldArea.java:553).
 * It consults ONLY the projectile/LOS flags — `BLOCK_LINE_OF_SIGHT_FULL` (0x20000, our
 * `OBJECT_PROJECTILE_BLOCKER`) and the directional `BLOCK_LINE_OF_SIGHT_*` walls.
 *
 * The floor flags are movement-only: RuneLite names them `BLOCK_MOVEMENT_FLOOR`
 * (0x200000) and `BLOCK_MOVEMENT_FLOOR_DECORATION` (0x40000). Folding `FLOOR_BLOCKED`
 * into the `BLOCK_*_PROJECTILE` masks or into `hasLineOfSight` makes every ranged attack
 * across blocked terrain fail and leaves TzKal-Zuk permanently unattackable.
 */
describe('hasLineOfSight — floor flags are movement-only', () => {
  afterEach(() => {
    setCollisionMap(emptyCollisionMap());
  });

  it('crosses an intervening FLOOR tile', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,12', CollisionFlag.FLOOR]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(true);
  });

  it('crosses an intervening FLOOR_DECORATION tile', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,12', CollisionFlag.FLOOR_DECORATION]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(true);
  });

  it('lands on a destination carrying both floor flags', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,14', CollisionFlag.FLOOR_BLOCKED]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(true);
  });
});

describe('hasLineOfSight — projectile blockers still block', () => {
  afterEach(() => {
    setCollisionMap(emptyCollisionMap());
  });

  it('blocks on an intervening OBJECT_PROJECTILE_BLOCKER', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,12', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(false);
  });

  // RuneLite tests the destination with the same mask, so a blocker on the target tile counts.
  it('blocks on a destination OBJECT_PROJECTILE_BLOCKER', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,14', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(false);
  });

  // Traveling north, the blocking edge is the entered tile's SOUTH wall.
  it('blocks on the incoming directional wall', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,12', CollisionFlag.WALL_SOUTH_PROJECTILE_BLOCKER]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(false);
  });

  it('ignores a projectile wall facing the other way', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,12', CollisionFlag.WALL_NORTH_PROJECTILE_BLOCKER]])));
    expect(hasLineOfSight(10, 10, 10, 14)).toBe(true);
  });

  // RuneLite breaks the exact-45° tie with `dxAbs > dyAbs`, so an equal-length ray walks
  // the y axis and enters (10,11) — the x-major reading would step through (11,10) instead.
  it('walks the y axis on an exact 45-degree ray', () => {
    setCollisionMap(createWallCollisionMap(new Map([['10,11', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]])));
    expect(hasLineOfSight(10, 10, 12, 12)).toBe(false);
  });
});

describe('hasLineOfSightToNpc — TzKal-Zuk across the Inferno terrain band', () => {
  afterEach(() => {
    setCollisionMap(emptyCollisionMap());
  });

  /**
   * Ground truth from the wave-69 capture: Zuk is a stationary 7×7 whose SW corner
   * is sim (28,52), and the player takes the whole kill from y=44..46, shooting north across
   * the y=47..51 gap. Every tile at y>=47 — the gap AND Zuk's own footprint — is a terrain
   * FLOOR tile in the cache.
   */
  it('sees the boss even though the gap and his footprint are all FLOOR', () => {
    const terrain = new Map<string, number>();
    for (let x = 20; x <= 40; x++) {
      for (let y = 47; y <= 58; y++) terrain.set(`${x},${y}`, CollisionFlag.FLOOR);
    }
    setCollisionMap(createWallCollisionMap(terrain));

    for (const playerY of [44, 45, 46]) {
      expect(hasLineOfSightToNpc(31, playerY, 28, 52, 7)).toBe(true);
      expect(isInAttackRange([31, playerY], [28, 52], 7, 10, true)).toBe(true);
    }
  });

  it('is still blocked when a real projectile blocker sits in the gap', () => {
    const terrain = new Map<string, number>();
    for (let x = 20; x <= 40; x++) {
      for (let y = 47; y <= 58; y++) terrain.set(`${x},${y}`, CollisionFlag.OBJECT_PROJECTILE_BLOCKER);
    }
    setCollisionMap(createWallCollisionMap(terrain));

    expect(hasLineOfSightToNpc(31, 46, 28, 52, 7)).toBe(false);
  });

  /**
   * OSRS rays a single endpoint: the source tile clamped into the target rectangle
   * (the clamped ray endpoint). Blocking only that endpoint must
   * deny the attack no matter how much of the rest of the footprint is exposed.
   */
  it('rays only the clamped endpoint, not whichever footprint tile happens to be exposed', () => {
    const terrain = new Map<string, number>();
    terrain.set('31,52', CollisionFlag.OBJECT_PROJECTILE_BLOCKER);
    setCollisionMap(createWallCollisionMap(terrain));

    // (31,46) clamps to (31,52) — blocked — while all 48 other Zuk tiles are wide open.
    expect(hasLineOfSight(31, 46, 34, 52)).toBe(true);
    expect(hasLineOfSightToNpc(31, 46, 28, 52, 7)).toBe(false);
    expect(isInAttackRange([31, 46], [28, 52], 7, 10, true)).toBe(false);
  });

  it('clamps per axis, so a target the source overlaps on one axis rays straight down the other', () => {
    const terrain = new Map<string, number>();
    terrain.set('30,50', CollisionFlag.OBJECT_PROJECTILE_BLOCKER);
    setCollisionMap(createWallCollisionMap(terrain));

    // x=30 lies inside 28..34, so the endpoint keeps x and clamps y to 52: a due-north ray.
    expect(hasLineOfSightToNpc(30, 46, 28, 52, 7)).toBe(false);
    // x=33 rays past the blocker instead.
    expect(hasLineOfSightToNpc(33, 46, 28, 52, 7)).toBe(true);
  });

  it('always has line of sight to a footprint the source stands inside', () => {
    const terrain = new Map<string, number>();
    for (let x = 28; x <= 34; x++) {
      for (let y = 52; y <= 58; y++) terrain.set(`${x},${y}`, CollisionFlag.OBJECT_PROJECTILE_BLOCKER);
    }
    setCollisionMap(createWallCollisionMap(terrain));

    // Endpoint clamps onto the source tile itself, so the ray is degenerate.
    expect(hasLineOfSightToNpc(31, 55, 28, 52, 7)).toBe(true);
  });
});
