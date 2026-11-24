import { describe, expect, it } from 'vitest';
import {
  DEFAULT_YAMA_ATTACK_PATTERN,
  getFireballAngle,
  getFireballBurstStartsVertical,
  getFireballInstanceId,
} from '../encounters/yamaP3/constants';
import {
  getExplosionTiles,
  getFireballFallProgress,
  getFireballPerfectDodgeTiles,
  getFireballPhasesForTick,
  getThreeFireballPositions,
  isFireballPerfectDodgePosition,
} from '../encounters/yamaP3/fireball';
import type { Coordinate } from '../types/simulation';

describe('Fireball System', () => {
  describe('getFireballFallProgress', () => {
    it('returns falling phase for ticks 0-2 into phase', () => {
      expect(getFireballFallProgress(4, 4).phase).toBe('falling');
      expect(getFireballFallProgress(4, 5).phase).toBe('falling');
      expect(getFireballFallProgress(4, 6).phase).toBe('falling');
    });

    it('returns impact phase at tick 3 into phase', () => {
      expect(getFireballFallProgress(4, 7).phase).toBe('impact');
    });

    it('returns explosion phase at tick 4 into phase', () => {
      expect(getFireballFallProgress(4, 8).phase).toBe('explosion');
    });

    it('returns done phase after tick 4 into phase', () => {
      expect(getFireballFallProgress(4, 9).phase).toBe('done');
      expect(getFireballFallProgress(4, 14).phase).toBe('done');
    });
  });

  describe('getExplosionTiles', () => {
    const center: Coordinate = [10, 10];

    describe('horizontal angle', () => {
      it('returns 31 total explosion tiles', () => {
        const tiles = getExplosionTiles(center, 'horizontal');
        expect(tiles).toHaveLength(31);
      });

      it('includes full column at x=cx-3 (7 tiles tall)', () => {
        const tiles = getExplosionTiles(center, 'horizontal');
        for (let y = 7; y <= 13; y++) {
          expect(tiles).toContainEqual([7, y]);
        }
      });

      it('includes full column at x=cx+3 (7 tiles tall)', () => {
        const tiles = getExplosionTiles(center, 'horizontal');
        for (let y = 7; y <= 13; y++) {
          expect(tiles).toContainEqual([13, y]);
        }
      });

      it('includes center tile', () => {
        const tiles = getExplosionTiles(center, 'horizontal');
        expect(tiles).toContainEqual([10, 10]);
      });

      it('includes inner column tiles at cx±1', () => {
        const tiles = getExplosionTiles(center, 'horizontal');
        expect(tiles).toContainEqual([9, 9]);
        expect(tiles).toContainEqual([9, 10]);
        expect(tiles).toContainEqual([9, 11]);
        expect(tiles).toContainEqual([11, 9]);
        expect(tiles).toContainEqual([11, 10]);
        expect(tiles).toContainEqual([11, 11]);
      });
    });

    describe('vertical angle', () => {
      it('returns 31 total explosion tiles', () => {
        const tiles = getExplosionTiles(center, 'vertical');
        expect(tiles).toHaveLength(31);
      });

      it('includes full row at y=cy-3 (7 tiles wide)', () => {
        const tiles = getExplosionTiles(center, 'vertical');
        for (let x = 7; x <= 13; x++) {
          expect(tiles).toContainEqual([x, 7]);
        }
      });

      it('includes full row at y=cy+3 (7 tiles wide)', () => {
        const tiles = getExplosionTiles(center, 'vertical');
        for (let x = 7; x <= 13; x++) {
          expect(tiles).toContainEqual([x, 13]);
        }
      });

      it('includes center tile', () => {
        const tiles = getExplosionTiles(center, 'vertical');
        expect(tiles).toContainEqual([10, 10]);
      });

      it('includes inner row tiles at cy±1', () => {
        const tiles = getExplosionTiles(center, 'vertical');
        expect(tiles).toContainEqual([9, 9]);
        expect(tiles).toContainEqual([10, 9]);
        expect(tiles).toContainEqual([11, 9]);
        expect(tiles).toContainEqual([9, 11]);
        expect(tiles).toContainEqual([10, 11]);
        expect(tiles).toContainEqual([11, 11]);
      });
    });
  });

  describe('getThreeFireballPositions', () => {
    it('returns correct positions for vertical angle', () => {
      const positions = getThreeFireballPositions([10, 10], 'vertical');
      expect(positions.center).toEqual([10, 10]);
      expect(positions.side1).toEqual([10, 7]);
      expect(positions.side2).toEqual([10, 13]);
    });

    it('returns correct positions for horizontal angle', () => {
      const positions = getThreeFireballPositions([10, 10], 'horizontal');
      expect(positions.center).toEqual([10, 10]);
      expect(positions.side1).toEqual([7, 10]);
      expect(positions.side2).toEqual([13, 10]);
    });

    it('returns correct positions for diagonal angle', () => {
      const positions = getThreeFireballPositions([10, 10], 'diagonal');
      expect(positions.center).toEqual([10, 10]);
      expect(positions.side1).toEqual([8, 12]);
      expect(positions.side2).toEqual([12, 8]);
    });
  });

  describe('hourglass pattern', () => {
    it('horizontal: tiles form bowtie (wide at left/right columns, narrow center)', () => {
      const center: Coordinate = [10, 10];
      const allTiles = getExplosionTiles(center, 'horizontal');

      expect(allTiles).toHaveLength(31);

      // HORIZONTAL pattern: columns expand outward (wide at x±3, narrow at center x)
      // X.....X   <- row -3: tiles at cx-3 and cx+3 only (2 tiles)
      // XX...XX   <- row -2: tiles at cx-3,cx-2 and cx+2,cx+3 (4 tiles)
      // XXX.XXX   <- row -1: tiles at cx-3,cx-2,cx-1 and cx+1,cx+2,cx+3 (6 tiles)
      // XXXXXXX   <- row 0: all 7 tiles (center row - but only 1 at cx)
      // XXX.XXX   <- row +1: 6 tiles
      // XX...XX   <- row +2: 4 tiles
      // X.....X   <- row +3: 2 tiles
      const hourglassPattern = [
        // Column cx-3 (x=7): all 7 rows
        [7, 7],
        [7, 8],
        [7, 9],
        [7, 10],
        [7, 11],
        [7, 12],
        [7, 13],
        // Column cx-2 (x=8): rows ±2
        [8, 8],
        [8, 9],
        [8, 10],
        [8, 11],
        [8, 12],
        // Column cx-1 (x=9): rows ±1
        [9, 9],
        [9, 10],
        [9, 11],
        // Column cx (x=10): center only
        [10, 10],
        // Column cx+1 (x=11): rows ±1
        [11, 9],
        [11, 10],
        [11, 11],
        // Column cx+2 (x=12): rows ±2
        [12, 8],
        [12, 9],
        [12, 10],
        [12, 11],
        [12, 12],
        // Column cx+3 (x=13): all 7 rows
        [13, 7],
        [13, 8],
        [13, 9],
        [13, 10],
        [13, 11],
        [13, 12],
        [13, 13],
      ];

      hourglassPattern.forEach((tile) => {
        expect(allTiles).toContainEqual(tile);
      });
    });

    it('vertical: tiles form bowtie (wide at top/bottom rows, narrow center)', () => {
      const center: Coordinate = [10, 10];
      const allTiles = getExplosionTiles(center, 'vertical');

      expect(allTiles).toHaveLength(31);

      // VERTICAL pattern: rows expand outward (wide at y±3, narrow at center y)
      // Same shape as horizontal but rotated 90 degrees
      const hourglassPattern = [
        // Row cy-3 (y=7): all 7 columns
        [7, 7],
        [8, 7],
        [9, 7],
        [10, 7],
        [11, 7],
        [12, 7],
        [13, 7],
        // Row cy-2 (y=8): cols ±2
        [8, 8],
        [9, 8],
        [10, 8],
        [11, 8],
        [12, 8],
        // Row cy-1 (y=9): cols ±1
        [9, 9],
        [10, 9],
        [11, 9],
        // Row cy (y=10): center only
        [10, 10],
        // Row cy+1 (y=11): cols ±1
        [9, 11],
        [10, 11],
        [11, 11],
        // Row cy+2 (y=12): cols ±2
        [8, 12],
        [9, 12],
        [10, 12],
        [11, 12],
        [12, 12],
        // Row cy+3 (y=13): all 7 columns
        [7, 13],
        [8, 13],
        [9, 13],
        [10, 13],
        [11, 13],
        [12, 13],
        [13, 13],
      ];

      hourglassPattern.forEach((tile) => {
        expect(allTiles).toContainEqual(tile);
      });
    });
  });

  describe('getFireballPerfectDodgeTiles', () => {
    const center: Coordinate = [10, 10];

    it('horizontal: returns two perpendicular tiles (N/S of center)', () => {
      const tiles = getFireballPerfectDodgeTiles(center, 'horizontal');
      expect(tiles).toHaveLength(2);
      expect(tiles).toContainEqual([10, 11]);
      expect(tiles).toContainEqual([10, 9]);
    });

    it('vertical: returns two perpendicular tiles (E/W of center)', () => {
      const tiles = getFireballPerfectDodgeTiles(center, 'vertical');
      expect(tiles).toHaveLength(2);
      expect(tiles).toContainEqual([11, 10]);
      expect(tiles).toContainEqual([9, 10]);
    });

    it('diagonal: returns two NE-SW perpendicular tiles', () => {
      // Line direction (+1,-1); perpendicular axis (+1,+1) / (-1,-1).
      const tiles = getFireballPerfectDodgeTiles(center, 'diagonal');
      expect(tiles).toHaveLength(2);
      expect(tiles).toContainEqual([11, 11]);
      expect(tiles).toContainEqual([9, 9]);
    });

    it('diagonal-alt: returns two NW-SE perpendicular tiles', () => {
      // Line direction (+1,+1); perpendicular axis (+1,-1) / (-1,+1).
      const tiles = getFireballPerfectDodgeTiles(center, 'diagonal-alt');
      expect(tiles).toHaveLength(2);
      expect(tiles).toContainEqual([11, 9]);
      expect(tiles).toContainEqual([9, 11]);
    });

    it('all perfect-dodge tiles sit outside the explosion AoE', () => {
      const angles = ['horizontal', 'vertical', 'diagonal', 'diagonal-alt'] as const;
      for (const angle of angles) {
        const explosion = getExplosionTiles(center, angle);
        const dodgeTiles = getFireballPerfectDodgeTiles(center, angle);
        for (const dodge of dodgeTiles) {
          const overlaps = explosion.some((tile) => tile[0] === dodge[0] && tile[1] === dodge[1]);
          expect(overlaps).toBe(false);
        }
      }
    });
  });

  describe('isFireballPerfectDodgePosition', () => {
    const center: Coordinate = [20, 20];

    it('returns true when player stands on a perpendicular tile', () => {
      expect(isFireballPerfectDodgePosition([20, 21], center, 'horizontal')).toBe(true);
      expect(isFireballPerfectDodgePosition([20, 19], center, 'horizontal')).toBe(true);
      expect(isFireballPerfectDodgePosition([21, 20], center, 'vertical')).toBe(true);
      expect(isFireballPerfectDodgePosition([19, 20], center, 'vertical')).toBe(true);
      expect(isFireballPerfectDodgePosition([21, 21], center, 'diagonal')).toBe(true);
      expect(isFireballPerfectDodgePosition([19, 19], center, 'diagonal')).toBe(true);
      expect(isFireballPerfectDodgePosition([21, 19], center, 'diagonal-alt')).toBe(true);
      expect(isFireballPerfectDodgePosition([19, 21], center, 'diagonal-alt')).toBe(true);
    });

    it('returns false when player stands on the center', () => {
      expect(isFireballPerfectDodgePosition([20, 20], center, 'horizontal')).toBe(false);
      expect(isFireballPerfectDodgePosition([20, 20], center, 'vertical')).toBe(false);
      expect(isFireballPerfectDodgePosition([20, 20], center, 'diagonal')).toBe(false);
      expect(isFireballPerfectDodgePosition([20, 20], center, 'diagonal-alt')).toBe(false);
    });

    it('returns false when player stands 2 tiles away (too far)', () => {
      expect(isFireballPerfectDodgePosition([20, 22], center, 'horizontal')).toBe(false);
      expect(isFireballPerfectDodgePosition([22, 20], center, 'vertical')).toBe(false);
      expect(isFireballPerfectDodgePosition([22, 22], center, 'diagonal')).toBe(false);
    });

    it('returns false when player stands on an in-line (non-perpendicular) neighbor', () => {
      // For a horizontal fireball line, (cx±1, cy) is INSIDE the explosion AoE.
      expect(isFireballPerfectDodgePosition([21, 20], center, 'horizontal')).toBe(false);
      expect(isFireballPerfectDodgePosition([19, 20], center, 'horizontal')).toBe(false);
      // For a vertical line, (cx, cy±1) is INSIDE the explosion AoE.
      expect(isFireballPerfectDodgePosition([20, 21], center, 'vertical')).toBe(false);
      expect(isFireballPerfectDodgePosition([20, 19], center, 'vertical')).toBe(false);
    });

    it('returns false when player stands on a diagonal tile that is NOT perpendicular', () => {
      // For diagonal (NW-SE line), the non-perpendicular diagonal tiles are in the AoE.
      expect(isFireballPerfectDodgePosition([21, 19], center, 'diagonal')).toBe(false);
      expect(isFireballPerfectDodgePosition([19, 21], center, 'diagonal')).toBe(false);
      // For diagonal-alt (NE-SW line), the non-perpendicular diagonal tiles are in the AoE.
      expect(isFireballPerfectDodgePosition([21, 21], center, 'diagonal-alt')).toBe(false);
      expect(isFireballPerfectDodgePosition([19, 19], center, 'diagonal-alt')).toBe(false);
    });
  });
});

describe('Cycle-Aware Fireball Phases', () => {
  // Burst start orientation is an avalanche hash of (burstIndex ^ seed) — see
  // getFireballBurstStartsVertical. V_SEED=0 → bursts 0..7: V H V H H V V H.
  // H_SEED=1 → burst 0 starts horizontal.
  const V_SEED = 0;
  const H_SEED = 1;

  describe('getFireballPhasesForTick', () => {
    it('returns Set 1 at tick 7 (falling start)', () => {
      const phases = getFireballPhasesForTick(7, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(1);
      expect(phases[0].startTick).toBe(7);
      expect(phases[0].endTick).toBe(11);
      expect(phases[0].angle).toBe('vertical');
    });

    it('returns Set 1 + Set 2 at tick 10 (overlap)', () => {
      const phases = getFireballPhasesForTick(10, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(2);
      expect(phases.map((p) => p.startTick).sort((a, b) => a - b)).toEqual([7, 10]);
    });

    it('returns Set 2 + Set 3 at tick 13 (overlap)', () => {
      const phases = getFireballPhasesForTick(13, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(2);
      expect(phases.map((p) => p.startTick).sort((a, b) => a - b)).toEqual([10, 13]);
    });

    it('returns only Set 3 at tick 16', () => {
      const phases = getFireballPhasesForTick(16, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(1);
      expect(phases[0].startTick).toBe(13);
    });

    it('returns empty between bursts (tick 18)', () => {
      expect(getFireballPhasesForTick(18, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN)).toHaveLength(0);
    });

    it('returns Set 1 at tick 28 (burst 2)', () => {
      const phases = getFireballPhasesForTick(28, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(1);
      expect(phases[0].startTick).toBe(28);
    });

    it('returns Set 1 at tick 56 (burst 3)', () => {
      const phases = getFireballPhasesForTick(56, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(1);
      expect(phases[0].startTick).toBe(56);
    });

    it('returns Set 1 at tick 77 (cycle 2 start)', () => {
      const phases = getFireballPhasesForTick(77, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(phases).toHaveLength(1);
      expect(phases[0].startTick).toBe(77);
    });

    it('returns empty before cycle start', () => {
      expect(getFireballPhasesForTick(3, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN)).toHaveLength(0);
      expect(getFireballPhasesForTick(6, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN)).toHaveLength(0);
    });

    it('returns empty at tick 20 (between bursts)', () => {
      expect(getFireballPhasesForTick(20, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN)).toHaveLength(0);
    });
  });

  describe('angle rotation', () => {
    it('V-start burst: V → diagonal → H', () => {
      expect(getFireballBurstStartsVertical(0, V_SEED)).toBe(true);
      expect(getFireballAngle(0, 0, V_SEED)).toBe('vertical');
      expect(getFireballAngle(0, 1, V_SEED)).toBe('diagonal');
      expect(getFireballAngle(0, 2, V_SEED)).toBe('horizontal');
    });

    it('H-start burst: H → diagonal → V', () => {
      expect(getFireballBurstStartsVertical(0, H_SEED)).toBe(false);
      expect(getFireballAngle(0, 0, H_SEED)).toBe('horizontal');
      expect(getFireballAngle(0, 1, H_SEED)).toBe('diagonal');
      expect(getFireballAngle(0, 2, H_SEED)).toBe('vertical');
    });

    it('bursts pick V/H pseudo-randomly, NOT strict alternation', () => {
      const starts = Array.from({ length: 8 }, (_, i) => getFireballBurstStartsVertical(i, V_SEED));
      expect(starts).toEqual([true, false, true, false, false, true, true, false]);

      // A `% 2` hash would force strict V/H/V/H alternation.
      // Bursts 3 & 4 are both horizontal (and 5 & 6 both vertical) — impossible
      // under alternation, proving each burst is independently mixed.
      expect(starts[3]).toBe(starts[4]);
      expect(starts[5]).toBe(starts[6]);

      // Within a burst, the angle still rotates start → diagonal → opposite.
      expect(getFireballAngle(1, 0, V_SEED)).toBe('horizontal');
      expect(getFireballAngle(1, 1, V_SEED)).toBe('diagonal');
      expect(getFireballAngle(1, 2, V_SEED)).toBe('vertical');
    });
  });

  describe('pinned burst start (practice setting)', () => {
    it("'random' reproduces the unpinned per-burst coin flip exactly", () => {
      for (let burst = 0; burst < 16; burst++) {
        expect(getFireballBurstStartsVertical(burst, V_SEED, 'random')).toBe(
          getFireballBurstStartsVertical(burst, V_SEED),
        );
        for (let set = 0; set < 3; set++) {
          expect(getFireballAngle(burst, set, V_SEED, 'random')).toBe(getFireballAngle(burst, set, V_SEED));
        }
      }
    });

    it('pins every burst to the chosen axis regardless of seed or burst index', () => {
      for (const seed of [V_SEED, H_SEED, 0xdeadbeef, 12345]) {
        for (let burst = 0; burst < 16; burst++) {
          expect(getFireballAngle(burst, 0, seed, 'vertical')).toBe('vertical');
          expect(getFireballAngle(burst, 0, seed, 'horizontal')).toBe('horizontal');
        }
      }
    });

    it('still rotates start → diagonal → opposite, so a pinned burst fires all three angles', () => {
      expect([0, 1, 2].map((set) => getFireballAngle(3, set, H_SEED, 'vertical'))).toEqual([
        'vertical',
        'diagonal',
        'horizontal',
      ]);
      expect([0, 1, 2].map((set) => getFireballAngle(3, set, V_SEED, 'horizontal'))).toEqual([
        'horizontal',
        'diagonal',
        'vertical',
      ]);
    });

    it('pins scheduled phases, leaving tick scheduling and instance ids untouched', () => {
      // Tick 7 is burst 0 set 0; V_SEED would otherwise start it vertical.
      const pinned = getFireballPhasesForTick(7, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN, 'horizontal');
      const unpinned = getFireballPhasesForTick(7, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
      expect(pinned).toHaveLength(unpinned.length);
      expect(pinned[0].angle).toBe('horizontal');
      expect(unpinned[0].angle).toBe('vertical');
      expect(pinned[0].startTick).toBe(unpinned[0].startTick);
      expect(pinned[0].instanceId).toBe(unpinned[0].instanceId);
    });

    it('pins every scheduled burst opener across a full cycle', () => {
      const openers: string[] = [];
      for (let tick = 0; tick < 140; tick++) {
        for (const phase of getFireballPhasesForTick(tick, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN, 'vertical')) {
          if (phase.startTick === tick && phase.instanceId % 3 === 0) openers.push(phase.angle);
        }
      }
      expect(openers.length).toBeGreaterThan(0);
      expect(openers.every((angle) => angle === 'vertical')).toBe(true);
    });
  });

  describe('duo side', () => {
    it("'player1' matches the unset call for every burst and set", () => {
      for (let burst = 0; burst < 16; burst++) {
        for (let set = 0; set < 3; set++) {
          expect(getFireballAngle(burst, set, V_SEED, 'random', 'player1')).toBe(getFireballAngle(burst, set, V_SEED));
        }
      }
    });

    it("player 2 swaps only the burst's diagonal, keeping opener and closer", () => {
      expect([0, 1, 2].map((set) => getFireballAngle(0, set, V_SEED, 'random', 'player2'))).toEqual([
        'vertical',
        'diagonal-alt',
        'horizontal',
      ]);
      expect([0, 1, 2].map((set) => getFireballAngle(0, set, H_SEED, 'random', 'player2'))).toEqual([
        'horizontal',
        'diagonal-alt',
        'vertical',
      ]);
    });

    it('composes with a pinned opening axis', () => {
      expect([0, 1, 2].map((set) => getFireballAngle(3, set, H_SEED, 'vertical', 'player2'))).toEqual([
        'vertical',
        'diagonal-alt',
        'horizontal',
      ]);
    });

    it('leaves the per-burst coin flip and scheduling untouched', () => {
      for (let tick = 0; tick < 140; tick++) {
        const duo = getFireballPhasesForTick(tick, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN, () => ({
          start: 'random',
          side: 'player2',
        }));
        const solo = getFireballPhasesForTick(tick, V_SEED, DEFAULT_YAMA_ATTACK_PATTERN);
        expect(duo.map((p) => [p.startTick, p.endTick, p.instanceId])).toEqual(
          solo.map((p) => [p.startTick, p.endTick, p.instanceId]),
        );
        expect(duo.map((p) => (p.angle === 'diagonal-alt' ? 'diagonal' : p.angle))).toEqual(solo.map((p) => p.angle));
      }
    });
  });

  describe('instance IDs', () => {
    it('cycle 0 burst 0 set 0 = 0', () => {
      expect(getFireballInstanceId(0, 0, 0)).toBe(0);
    });

    it('cycle 0 burst 2 set 2 = 8', () => {
      expect(getFireballInstanceId(0, 2, 2)).toBe(8);
    });

    it('cycle 1 burst 0 set 0 = 9', () => {
      expect(getFireballInstanceId(1, 0, 0)).toBe(9);
    });

    it('IDs are unique across first 3 cycles', () => {
      const ids = new Set<number>();
      for (let c = 0; c < 3; c++) {
        for (let b = 0; b < 3; b++) {
          for (let s = 0; s < 3; s++) {
            ids.add(getFireballInstanceId(c, b, s));
          }
        }
      }
      expect(ids.size).toBe(27);
    });
  });
});
