import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { CollisionMap } from '../../rs/collision/WalkabilityAnalyzer';
import { isInAttackRangeRaw } from '../combat/distance';
import { setArenaConfig, setCollisionMap } from '../constants';
import { playerMoveToNpc, walkBfsPath } from '../movement';

function createEmptyCollisionMap(): CollisionMap {
  const sizeX = 64;
  const sizeY = 64;
  const flags = new Int32Array(sizeX * sizeY);
  return {
    sizeX,
    sizeY,
    flags,
    getFlag: (x: number, y: number): number => {
      if (x < 0 || x >= sizeX || y < 0 || y >= sizeY) return -1;
      return flags[x + y * sizeX];
    },
    hasFlag: (x: number, y: number, flag: number): boolean => {
      if (x < 0 || x >= sizeX || y < 0 || y >= sizeY) return false;
      return (flags[x + y * sizeX] & flag) !== 0;
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

// Yama: SW [29,28], size 5, occupies [29-33, 28-32]
const YAMA_POS: [number, number] = [29, 28];
const YAMA_SIZE = 5;

describe('Attack pathing — BFS branch (collision map active)', () => {
  beforeEach(() => {
    setCollisionMap(createEmptyCollisionMap());
  });
  afterEach(() => setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true));

  describe('ranged: moves max tiles per tick, not just minimum to get in range', () => {
    it('range 10, distance 11, running → moves 2 tiles (not 1)', () => {
      // Player at x=18: edge distance to NPC west side (x=29) = 11
      const result = playerMoveToNpc([18, 28], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position).toEqual([20, 28]);

      const [dx] = edgeDeltas(20, 28, YAMA_POS[0], YAMA_POS[1], YAMA_SIZE);
      expect(dx).toBe(9);
      expect(isInAttackRangeRaw(20, 28, YAMA_POS[0], YAMA_POS[1], YAMA_SIZE, 10)).toBe(true);
    });

    it('range 10, distance 12, running → moves 2 tiles', () => {
      const result = playerMoveToNpc([17, 28], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position).toEqual([19, 28]);
    });

    it('range 10, distance 11, walking → moves 1 tile', () => {
      const result = playerMoveToNpc([18, 28], YAMA_POS, YAMA_SIZE, false);

      expect(result.stepTiles.length).toBe(1);
      expect(result.position).toEqual([19, 28]);
    });

    it('range 10, distance 15, running → moves 2 tiles', () => {
      const result = playerMoveToNpc([14, 28], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position).toEqual([16, 28]);
    });
  });

  describe('melee: does not overshoot onto NPC', () => {
    it('1 tile from adjacent, running → moves 1 tile only (path ends at adjacent)', () => {
      // Player at x=27: 2 tiles from NPC west (29), 1 tile from adjacent (28)
      const result = playerMoveToNpc([27, 28], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(1);
      expect(result.position).toEqual([28, 28]);

      for (const [x, y] of result.stepTiles) {
        expect(x >= 29 && x <= 33 && y >= 28 && y <= 32).toBe(false);
      }
    });

    it('2 tiles from adjacent, running → moves 2 tiles to reach adjacent', () => {
      // Player at x=26: 3 tiles from NPC west (29), 2 from adjacent (28)
      const result = playerMoveToNpc([26, 28], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position).toEqual([28, 28]);
    });

    it('3 tiles from adjacent, running → moves 2 tiles (still approaching)', () => {
      // Player at x=25: path to adjacent = [[26,28],[27,28],[28,28]]
      const result = playerMoveToNpc([25, 28], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position).toEqual([27, 28]);
    });

    it('already adjacent → no movement', () => {
      const result = playerMoveToNpc([28, 30], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(0);
      expect(result.position).toEqual([28, 30]);
    });
  });

  describe('NPC tile guard: never steps onto NPC footprint', () => {
    it('approaching from south, does not enter NPC tiles', () => {
      // Player at [31, 26], NPC south edge at y=28, adjacent is y=27
      const result = playerMoveToNpc([31, 26], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(1);
      expect(result.position).toEqual([31, 27]);

      for (const [x, y] of result.stepTiles) {
        expect(x >= 29 && x <= 33 && y >= 28 && y <= 32).toBe(false);
      }
    });

    it('approaching from east, does not enter NPC tiles', () => {
      // Player at [35, 30], NPC east edge at x=33, adjacent is x=34
      const result = playerMoveToNpc([35, 30], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(1);
      expect(result.position).toEqual([34, 30]);
    });

    it('far ranged approach does not land on NPC at any step', () => {
      const result = playerMoveToNpc([20, 30], YAMA_POS, YAMA_SIZE, true);

      for (const [x, y] of result.stepTiles) {
        const onNpc = x >= 29 && x <= 33 && y >= 28 && y <= 32;
        expect(onNpc).toBe(false);
      }
    });
  });

  describe('escape from under NPC', () => {
    it('2 tiles deep under NPC, running → moves toward nearest edge', () => {
      // Player at [31, 30]: 2 tiles from west edge (29), 2 from east (33),
      // 2 from south (28), 2 from north (32). BFS path traverses NPC tiles to escape.
      const result = playerMoveToNpc([31, 30], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBeGreaterThan(0);
      expect(result.position[0] !== 31 || result.position[1] !== 30).toBe(true);
    });

    it('center of NPC, running → moves 2 tiles toward edge', () => {
      const result = playerMoveToNpc([31, 30], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
    });

    it('multi-tick escape: eventually reaches adjacent tile outside NPC', () => {
      let pos: [number, number] = [31, 30];

      for (let tick = 0; tick < 10; tick++) {
        const underNpc = pos[0] >= 29 && pos[0] <= 33 && pos[1] >= 28 && pos[1] <= 32;
        if (!underNpc) break;
        const result = playerMoveToNpc(pos, YAMA_POS, YAMA_SIZE, true);
        expect(result.stepTiles.length).toBeGreaterThan(0);
        pos = result.position;
      }

      const finalUnderNpc = pos[0] >= 29 && pos[0] <= 33 && pos[1] >= 28 && pos[1] <= 32;
      expect(finalUnderNpc).toBe(false);
    });

    it('1 tile from edge under NPC → escapes in 1 step', () => {
      // Player at [29, 30]: west edge of NPC, 1 tile from adjacent [28,30]
      const result = playerMoveToNpc([29, 30], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBeGreaterThanOrEqual(1);
      const finalUnder =
        result.position[0] >= 29 && result.position[0] <= 33 && result.position[1] >= 28 && result.position[1] <= 32;
      expect(finalUnder).toBe(false);
    });
  });

  describe('multi-tick convergence', () => {
    it('ranged weapon: multiple ticks converge to attack range', () => {
      let pos: [number, number] = [14, 30];
      const range = 10;

      for (let tick = 0; tick < 10; tick++) {
        if (isInAttackRangeRaw(pos[0], pos[1], YAMA_POS[0], YAMA_POS[1], YAMA_SIZE, range)) {
          break;
        }
        const result = playerMoveToNpc(pos, YAMA_POS, YAMA_SIZE, true);
        expect(result.stepTiles.length).toBe(2);
        pos = result.position;
      }

      expect(isInAttackRangeRaw(pos[0], pos[1], YAMA_POS[0], YAMA_POS[1], YAMA_SIZE, range)).toBe(true);
    });

    it('melee weapon: multiple ticks converge to adjacent tile', () => {
      let pos: [number, number] = [20, 28];
      const range = 1;

      for (let tick = 0; tick < 20; tick++) {
        if (isInAttackRangeRaw(pos[0], pos[1], YAMA_POS[0], YAMA_POS[1], YAMA_SIZE, range)) {
          break;
        }
        const result = playerMoveToNpc(pos, YAMA_POS, YAMA_SIZE, true);
        expect(result.stepTiles.length).toBeGreaterThan(0);
        pos = result.position;
      }

      expect(isInAttackRangeRaw(pos[0], pos[1], YAMA_POS[0], YAMA_POS[1], YAMA_SIZE, range)).toBe(true);
      const underNpc = pos[0] >= 29 && pos[0] <= 33 && pos[1] >= 28 && pos[1] <= 32;
      expect(underNpc).toBe(false);
    });
  });

  describe('diagonal approach', () => {
    it('approaching diagonally from SW, running → moves 2 tiles', () => {
      // Player at [20, 20], far SW of Yama at [29,28]
      const result = playerMoveToNpc([20, 20], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position[0]).toBeGreaterThan(20);
      expect(result.position[1]).toBeGreaterThan(20);
    });

    it('approaching diagonally from NE with ranged, running → moves 2 tiles', () => {
      // Player at [44, 42], far NE of Yama
      const result = playerMoveToNpc([44, 42], YAMA_POS, YAMA_SIZE, true);

      expect(result.stepTiles.length).toBe(2);
      expect(result.position[0]).toBeLessThan(44);
      expect(result.position[1]).toBeLessThan(42);
    });
  });
});

describe('walkBfsPath — shared utility', () => {
  it('returns no movement for empty path', () => {
    const result = walkBfsPath([10, 10], [], true);
    expect(result.position).toEqual([10, 10]);
    expect(result.stepTiles).toEqual([]);
  });

  it('running consumes 2 tiles from path', () => {
    const path: [number, number][] = [
      [11, 10],
      [12, 10],
      [13, 10],
    ];
    const result = walkBfsPath([10, 10], path, true);
    expect(result.stepTiles.length).toBe(2);
    expect(result.position).toEqual([12, 10]);
  });

  it('walking consumes 1 tile from path', () => {
    const path: [number, number][] = [
      [11, 10],
      [12, 10],
      [13, 10],
    ];
    const result = walkBfsPath([10, 10], path, false);
    expect(result.stepTiles.length).toBe(1);
    expect(result.position).toEqual([11, 10]);
  });

  it('stops before NPC tiles when npcBounds provided', () => {
    const npcBounds = { minX: 12, minY: 10, maxX: 14, maxY: 12 };
    const path: [number, number][] = [
      [11, 10],
      [12, 10],
    ]; // 2nd tile is on NPC
    const result = walkBfsPath([10, 10], path, true, npcBounds);
    expect(result.stepTiles.length).toBe(1);
    expect(result.position).toEqual([11, 10]);
  });

  it('does not check NPC bounds when none provided', () => {
    const path: [number, number][] = [
      [11, 10],
      [12, 10],
    ];
    const result = walkBfsPath([10, 10], path, true);
    expect(result.stepTiles.length).toBe(2);
    expect(result.position).toEqual([12, 10]);
  });

  it('handles path shorter than tilesPerTick', () => {
    const path: [number, number][] = [[11, 10]];
    const result = walkBfsPath([10, 10], path, true);
    expect(result.stepTiles.length).toBe(1);
    expect(result.position).toEqual([11, 10]);
  });

  it('first tile on NPC → no movement', () => {
    const npcBounds = { minX: 11, minY: 10, maxX: 13, maxY: 12 };
    const path: [number, number][] = [
      [11, 10],
      [12, 10],
    ];
    const result = walkBfsPath([10, 10], path, true, npcBounds);
    expect(result.stepTiles.length).toBe(0);
    expect(result.position).toEqual([10, 10]);
  });
});

function edgeDeltas(px: number, py: number, npcX: number, npcY: number, npcSize: number): [number, number] {
  const maxX = npcX + npcSize - 1;
  const maxY = npcY + npcSize - 1;
  const dx = px < npcX ? npcX - px : px > maxX ? px - maxX : 0;
  const dy = py < npcY ? npcY - py : py > maxY ? py - maxY : 0;
  return [dx, dy];
}
