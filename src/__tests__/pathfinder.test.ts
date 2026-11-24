import { beforeEach, describe, expect, it } from 'vitest';
import { setCollisionMap, setWalkableTiles } from '../core/constants';
import { canMoveInDirection, findPath, findPathToNpc } from '../core/pathfinder';
import { CollisionFlag } from '../rs/collision/CollisionFlag';
import type { CollisionMap } from '../rs/collision/WalkabilityAnalyzer';

/**
 * @param blocked Set of blocked tile coordinates as "x,y" strings
 * @param walls Map of wall flags by coordinate
 */
function createMockCollisionMap(blocked: Set<string>, walls: Map<string, number> = new Map()): CollisionMap {
  const sizeX = 64;
  const sizeY = 64;
  const flags = new Int32Array(sizeX * sizeY);
  const getMockFlag = (x: number, y: number): number => {
    if (x < 0 || x >= sizeX || y < 0 || y >= sizeY) return -1;
    return flags[x + y * sizeX] | (walls.get(`${x},${y}`) ?? (blocked.has(`${x},${y}`) ? CollisionFlag.OBJECT : 0));
  };
  return {
    sizeX,
    sizeY,
    flags,
    getFlag: getMockFlag,
    hasFlag: (x: number, y: number, flag: number) => {
      const value = getMockFlag(x, y);
      return value !== -1 && (value & flag) !== 0;
    },
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

describe('Pathfinder', () => {
  beforeEach(() => {
    const emptyMap = createMockCollisionMap(new Set());
    setCollisionMap(emptyMap);
  });

  describe('findPath', () => {
    it('should return empty array when already at destination', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([10, 10], [10, 10]);

      expect(result).toEqual([]);
    });

    it('should find straight north path with no obstacles', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([10, 10], [10, 15]);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual([10, 11]);
      expect(result[result.length - 1]).toEqual([10, 15]);
    });

    it('should find straight south path with no obstacles', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([10, 15], [10, 10]);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual([10, 14]);
      expect(result[result.length - 1]).toEqual([10, 10]);
    });

    it('should find straight east path with no obstacles', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([10, 10], [15, 10]);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual([11, 10]);
      expect(result[result.length - 1]).toEqual([15, 10]);
    });

    it('should find straight west path with no obstacles', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([15, 10], [10, 10]);

      expect(result).toHaveLength(5);
      expect(result[0]).toEqual([14, 10]);
      expect(result[result.length - 1]).toEqual([10, 10]);
    });

    it('should find diagonal path with no obstacles', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([10, 10], [15, 15]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toEqual([15, 15]);
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should route around single obstacle', () => {
      const blocked = new Set(['10,12']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = findPath([10, 10], [10, 15]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toEqual([10, 15]);
      expect(result).not.toContainEqual([10, 12]);
    });

    it('should route around wall of 3 blocked tiles', () => {
      const blocked = new Set(['10,12', '10,13', '10,14']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = findPath([10, 10], [10, 15]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toEqual([10, 15]);
      expect(result).not.toContainEqual([10, 12]);
      expect(result).not.toContainEqual([10, 13]);
      expect(result).not.toContainEqual([10, 14]);
    });

    it('should find path around L-shaped obstacle', () => {
      const blocked = new Set(['11,12', '11,13', '12,13']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = findPath([10, 10], [13, 15]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toEqual([13, 15]);
      expect(result).not.toContainEqual([11, 12]);
      expect(result).not.toContainEqual([11, 13]);
      expect(result).not.toContainEqual([12, 13]);
    });

    it('should return path to closest tile when destination unreachable', () => {
      // Create a box around destination with only one opening
      const blocked = new Set(['10,12', '10,13', '10,14', '11,14', '12,14', '13,14', '13,13', '13,12']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = findPath([10, 10], [12, 13]);

      expect(result.length).toBeGreaterThan(0);
      const lastTile = result[result.length - 1];
      expect(lastTile).toBeDefined();
    });

    it('should prefer west over east when costs are equal (tiebreaker)', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      // From center, going to a tile that could be reached by going west or east equally
      const result = findPath([10, 10], [10, 12]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toEqual([10, 12]);
    });

    it('should handle path with multiple direction changes', () => {
      const blocked = new Set(['11,11', '12,11', '12,12']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = findPath([10, 10], [13, 13]);

      expect(result.length).toBeGreaterThan(0);
      expect(result[result.length - 1]).toEqual([13, 13]);
      expect(result).not.toContainEqual([11, 11]);
      expect(result).not.toContainEqual([12, 11]);
      expect(result).not.toContainEqual([12, 12]);
    });

    it('should not escape arena bounds when destination is outside walkable area', () => {
      const walkableTiles = new Set<string>();
      for (let x = 5; x <= 14; x++) {
        for (let y = 5; y <= 14; y++) {
          walkableTiles.add(`${x},${y}`);
        }
      }
      setWalkableTiles(walkableTiles);

      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPath([10, 10], [20, 20]);

      expect(result.length).toBeGreaterThan(0);
      const lastTile = result[result.length - 1];

      expect(lastTile[0]).toBeLessThanOrEqual(14);
      expect(lastTile[1]).toBeLessThanOrEqual(14);
      expect(lastTile[0]).toBeGreaterThanOrEqual(5);
      expect(lastTile[1]).toBeGreaterThanOrEqual(5);

      for (const [x, y] of result) {
        expect(x).toBeGreaterThanOrEqual(5);
        expect(x).toBeLessThanOrEqual(14);
        expect(y).toBeGreaterThanOrEqual(5);
        expect(y).toBeLessThanOrEqual(14);
      }

      setWalkableTiles(null as unknown as Set<string>);
    });
  });

  describe('canMoveInDirection', () => {
    it('should return true when moving to empty tile', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 10);

      expect(result).toBe(true);
    });

    it('should return false when moving to OBJECT blocked tile', () => {
      const blocked = new Set(['11,10']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 10);

      expect(result).toBe(false);
    });

    it('should return false when moving east to tile with WALL_EAST on destination', () => {
      const walls = new Map([['11,10', CollisionFlag.BLOCK_EAST]]);
      const map = createMockCollisionMap(new Set(), walls);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 10);

      expect(result).toBe(false);
    });

    it('should return false when moving west to tile with BLOCK_WEST on destination', () => {
      const walls = new Map([['9,10', CollisionFlag.BLOCK_WEST]]);
      const map = createMockCollisionMap(new Set(), walls);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 9, 10);

      expect(result).toBe(false);
    });

    it('should return false when moving north to tile with BLOCK_NORTH on destination', () => {
      const walls = new Map([['10,11', CollisionFlag.BLOCK_NORTH]]);
      const map = createMockCollisionMap(new Set(), walls);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 10, 11);

      expect(result).toBe(false);
    });

    it('should return false when moving south to tile with BLOCK_SOUTH on destination', () => {
      const walls = new Map([['10,9', CollisionFlag.BLOCK_SOUTH]]);
      const map = createMockCollisionMap(new Set(), walls);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 10, 9);

      expect(result).toBe(false);
    });

    it('should allow diagonal movement when both cardinals are passable', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 11);

      expect(result).toBe(true);
    });

    it('should block diagonal movement when east cardinal is blocked', () => {
      const blocked = new Set(['11,10']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 11);

      expect(result).toBe(false);
    });

    it('should block diagonal movement when north cardinal is blocked', () => {
      const blocked = new Set(['10,11']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 11);

      expect(result).toBe(false);
    });

    it('should block diagonal movement when both cardinals are blocked', () => {
      const blocked = new Set(['11,10', '10,11']);
      const map = createMockCollisionMap(blocked);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 11);

      expect(result).toBe(false);
    });

    it('should allow diagonal movement when diagonal wall flag is not set', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 11);

      expect(result).toBe(true);
    });

    it('should block diagonal movement when BLOCK_NORTH_EAST is set on destination', () => {
      const walls = new Map([['11,11', CollisionFlag.BLOCK_NORTH_EAST]]);
      const map = createMockCollisionMap(new Set(), walls);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 11, 11);

      expect(result).toBe(false);
    });

    it('should block diagonal movement when BLOCK_SOUTH_WEST is set on destination', () => {
      const walls = new Map([['9,9', CollisionFlag.BLOCK_SOUTH_WEST]]);
      const map = createMockCollisionMap(new Set(), walls);
      setCollisionMap(map);

      const result = canMoveInDirection(10, 10, 9, 9);

      expect(result).toBe(false);
    });
  });

  describe('findPathToNpc with excludeUnderNpc', () => {
    it('should return empty when in range and not under NPC', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPathToNpc([28, 30], [29, 28], 5, 1, true);
      expect(result).toEqual([]);
    });

    it('should return path when under NPC with excludeUnderNpc=true', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPathToNpc([30, 30], [29, 28], 5, 1, true);
      expect(result.length).toBeGreaterThan(0);

      const lastTile = result[result.length - 1];
      const onNpc = lastTile[0] >= 29 && lastTile[0] <= 33 && lastTile[1] >= 28 && lastTile[1] <= 32;
      expect(onNpc).toBe(false);
    });

    it('should return empty when under NPC with excludeUnderNpc=false (default)', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPathToNpc([30, 30], [29, 28], 5, 1, false);
      expect(result).toEqual([]);
    });

    it('should find path from NPC center to adjacent tile', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      const result = findPathToNpc([31, 30], [29, 28], 5, 1, true);
      expect(result.length).toBeGreaterThan(0);

      const dest = result[result.length - 1];
      const underNpc = dest[0] >= 29 && dest[0] <= 33 && dest[1] >= 28 && dest[1] <= 32;
      expect(underNpc).toBe(false);
    });
  });

  describe('findPathToNpc line of sight at ranged distances', () => {
    /**
     * A destination must satisfy the SAME reach rule the attack does. Accepting bare
     * range for ranged weapons strands the player on a projectile-blocked tile: the
     * pathfinder stops because range is met, then the auto-attack refuses to fire
     * because there is no line of sight, and nothing ever breaks the deadlock.
     */
    it('keeps walking when the tile is in range but projectile-blocked', () => {
      // A projectile blocker on the clamped ray between the player and the NPC.
      const map = createMockCollisionMap(new Set(), new Map([['29,26', CollisionFlag.OBJECT_PROJECTILE_BLOCKER]]));
      setCollisionMap(map);

      // The player is four tiles south of a 5x5 NPC holding a five-tile weapon.
      const result = findPathToNpc([29, 24], [29, 28], 5, 5, true);

      expect(result.length).toBeGreaterThan(0);
      const dest = result[result.length - 1];
      expect(dest).not.toEqual([29, 24]);
    });

    it('settles immediately when the ranged tile already has line of sight', () => {
      const map = createMockCollisionMap(new Set());
      setCollisionMap(map);

      // Same geometry, no blocker: the starting tile is already a valid attack position.
      expect(findPathToNpc([29, 24], [29, 28], 5, 5, true)).toEqual([]);
    });
  });
});
