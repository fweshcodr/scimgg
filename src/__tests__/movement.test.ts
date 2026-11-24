import { afterEach, describe, expect, it } from 'vitest';
import { setArenaConfig } from '../core/constants';
import type { MovementResult } from '../core/movement';
import { playerMoveAutopath, walkBfsPath } from '../core/movement';
import { CollisionFlag } from '../rs/collision/CollisionFlag';
import { createCollisionMap } from '../rs/collision/WalkabilityAnalyzer';

describe('Movement Algorithms', () => {
  describe('playerMoveAutopath (no arena constraints installed)', () => {
    it('generates path for diagonal movement', () => {
      const path: MovementResult = playerMoveAutopath([10, 10], [15, 15]);
      expect(path.position).toEqual([12, 12]); // Running moves 2 tiles
      expect(path.stepTiles).toEqual([
        [11, 11],
        [12, 12],
      ]);
    });

    it('reaches target immediately for distance 2', () => {
      const path = playerMoveAutopath([15, 6], [17, 6]);
      expect(path.position).toEqual([17, 6]);
      expect(path.stepTiles.length).toBe(2);
    });

    it('returns single position when target is adjacent', () => {
      const path = playerMoveAutopath([10, 10], [11, 10]);
      expect(path.stepTiles).toEqual([[11, 10]]);
      expect(path.position).toEqual([11, 10]);
    });

    it('runs two tiles toward a distant target', () => {
      const path = playerMoveAutopath([1, 1], [25, 20]);
      expect(path.stepTiles).toHaveLength(2);
    });

    it('walks one tile per tick', () => {
      const path = playerMoveAutopath([10, 10], [15, 15], false);
      expect(path.stepTiles).toEqual([[11, 11]]);
    });

    it('stops at target when reached', () => {
      const path = playerMoveAutopath([10, 10], [12, 10]);
      expect(path.position).toEqual([12, 10]);
    });

    it('handles same position', () => {
      const path = playerMoveAutopath([10, 10], [10, 10]);
      expect(path.stepTiles).toEqual([]);
      expect(path.position).toEqual([10, 10]);
    });

    it('handles cardinal movement', () => {
      const path = playerMoveAutopath([10, 10], [10, 15]);
      expect(path.position).toEqual([10, 12]); // Running moves 2 tiles
    });

    it('handles negative direction', () => {
      const path = playerMoveAutopath([15, 15], [10, 10]);
      expect(path.position).toEqual([13, 13]); // Running moves 2 tiles
    });
  });
  describe('walkBfsPath run steps', () => {
    it('takes 2 steps for valid run combo (E+E = (2,0))', () => {
      const result = walkBfsPath(
        [10, 10],
        [
          [11, 10],
          [12, 10],
        ], // E, E → combined (2,0) ✓
        true,
      );
      expect(result.stepTiles).toEqual([
        [11, 10],
        [12, 10],
      ]);
      expect(result.position).toEqual([12, 10]);
    });

    it('takes 2 steps for valid run combo (NE+NE = (2,2))', () => {
      const result = walkBfsPath(
        [10, 10],
        [
          [11, 11],
          [12, 12],
        ], // NE, NE → combined (2,2) ✓
        true,
      );
      expect(result.stepTiles).toEqual([
        [11, 11],
        [12, 12],
      ]);
      expect(result.position).toEqual([12, 12]);
    });

    it('takes 2 steps for valid L-shape run (N+NE = (1,2))', () => {
      const result = walkBfsPath(
        [10, 10],
        [
          [10, 11],
          [11, 12],
        ], // N, NE → combined (1,2) ✓
        true,
      );
      expect(result.stepTiles).toEqual([
        [10, 11],
        [11, 12],
      ]);
      expect(result.position).toEqual([11, 12]);
    });

    // Every captured player run with a one-tile diagonal net move ends on the far tile (389 across
    // 25 captures), and NPC run lines print such pairs: colosseum-no-sol:27314 `step1=south, step2=west`.
    const turns: [string, [number, number][]][] = [
      [
        'N+E',
        [
          [10, 11],
          [11, 11],
        ],
      ],
      [
        'E+S',
        [
          [11, 10],
          [11, 9],
        ],
      ],
      [
        'S+W',
        [
          [10, 9],
          [9, 9],
        ],
      ],
    ];
    it.each(turns)('runs both perpendicular cardinals (%s) in one tick', (_label, path) => {
      const result = walkBfsPath([10, 10], path, true);
      expect(result.stepTiles).toEqual(path);
      expect(result.position).toEqual(path[1]);
    });

    it('walking always takes 1 step regardless of delta', () => {
      const result = walkBfsPath(
        [10, 10],
        [
          [10, 11],
          [11, 11],
        ], // N, E — would be invalid run, but walking
        false,
      );
      expect(result.stepTiles).toEqual([[10, 11]]);
      expect(result.position).toEqual([10, 11]);
    });

    it('stops a run before NPC bounds', () => {
      const npcBounds = { minX: 12, minY: 12, maxX: 16, maxY: 16 };
      // Path: E, E toward NPC — valid run (2,0) but second step is on NPC
      const result = walkBfsPath(
        [10, 12],
        [
          [11, 12],
          [12, 12],
        ], // 2nd step is on NPC
        true,
        npcBounds,
      );
      expect(result.stepTiles).toEqual([[11, 12]]);
      expect(result.position).toEqual([11, 12]);
    });
  });

  // capture inferno-waves-1-68-packet-data.txt:3299 t653: `run` (2274,5354) -> (2273,5353),
  // local (34,42) -> (33,41), round the NW corner of the north-east pillar (SW anchor (34,39), 3x3).
  // The diagonal would cut the pillar's corner tile (34,41), so the route is west then south, and
  // the capture ends the tick on the far tile. All 161 such Inferno runs have exactly one blocked
  // orthogonal neighbor; 208 single diagonal steps elsewhere have both open.
  describe('running round a pillar corner (capture P t653)', () => {
    afterEach(() => setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true));

    it('cannot cut the corner, and runs the two-step detour in one tick', () => {
      const collision = createCollisionMap(64, 64);
      for (let x = 34; x < 37; x++) for (let y = 39; y < 42; y++) collision.flag(x, y, CollisionFlag.OBJECT);
      setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: collision }, true);

      const result = playerMoveAutopath([34, 42], [33, 41], true);

      expect(result.stepTiles).toEqual([
        [33, 42],
        [33, 41],
      ]);
    });
  });
});
