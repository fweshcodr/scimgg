import { describe, expect, it } from 'vitest';
import { getWaveTiles, isWaveTile, type WaveConfig } from '../encounters/yamaP3/waves';

/**
 * Model (see waves.ts): base P3 fires staggered X waves on a 70-tick cycle
 * (deltas [0,14,21]), startDelay 7. Cycle 0 fires only the delta-14 wave, so at
 * ACTIVE_TICK=40 (still cycle 0) exactly one X is on the floor:
 *   delta-14: tp = (40 + 1 - 14 - 7) % 70 = 20, diag = 40
 *   L arm: y - x ∈ {0, 1}   (y - x - diag === -40 | -39)
 *   R arm: x + y ∈ {60, 61} (x + y - diag === 20 | 21)
 * confined to the band y-x ∈ [-19,19], x+y ∈ [40,81].
 */
const ACTIVE_TICK = 40;

describe('isWaveTile', () => {
  it('returns false during the opening of the encounter (before the wave starts)', () => {
    // startDelay 7 + cycle-0 suppression means nothing is dangerous in the first ~30 ticks.
    expect(isWaveTile(30, 30, 2)).toBe(false);
    expect(isWaveTile(25, 25, 5)).toBe(false);
    expect(isWaveTile(20, 15, 19)).toBe(false);
  });

  it('detects a left-arm hit (y - x = 0, layer 0)', () => {
    expect(isWaveTile(25, 25, ACTIVE_TICK)).toBe(true);
  });

  it('detects a right-arm hit (x + y = 60, layer 0)', () => {
    expect(isWaveTile(32, 28, ACTIVE_TICK)).toBe(true);
  });

  it('detects layer 1 hits (left y - x = 1, right x + y = 61)', () => {
    expect(isWaveTile(25, 26, ACTIVE_TICK)).toBe(true);
    expect(isWaveTile(32, 29, ACTIVE_TICK)).toBe(true);
  });

  it('returns false for a tile clear of both arms', () => {
    // On neither diagonal at tick 40 (y-x=10, x+y=70 hits no arm).
    expect(isWaveTile(30, 40, ACTIVE_TICK)).toBe(false);
  });

  it('clips tiles outside the central band even when they sit on an arm', () => {
    // (8,8) is on the L diagonal (8-8-40 === -40) but x+y=16 is south of the
    // band, so it is NOT dangerous — without the band these corners would light
    // up several ticks before the real wall exists.
    expect(8 - 8 - 40).toBe(-40); // sanity: it IS on the raw L line
    expect(isWaveTile(8, 8, ACTIVE_TICK)).toBe(false);
  });

  it('wraps around the 70-tick cycle', () => {
    // ACTIVE_TICK (cycle 0) + 70 lands in cycle 1 at the same phase tick, so the
    // delta-14 wave is at the same position and these tiles are dangerous again.
    expect(isWaveTile(25, 25, ACTIVE_TICK)).toBe(true);
    expect(isWaveTile(25, 25, ACTIVE_TICK + 70)).toBe(true);
    expect(isWaveTile(32, 28, ACTIVE_TICK + 70)).toBe(true);
  });
});

describe('wave random offsets (sigil contracts)', () => {
  const baseConfig: WaveConfig = { randomOffsets: false };
  const offsetConfig: WaveConfig = { randomOffsets: true, seed: 42 };

  it('base config produces identical tiles to no-config default', () => {
    const noConfig = getWaveTiles(ACTIVE_TICK, 17, 44, 0, 45);
    const withBase = getWaveTiles(ACTIVE_TICK, 17, 44, 0, 45, baseConfig);
    expect(withBase.length).toBeGreaterThan(0);
    expect(withBase).toEqual(noConfig);
  });

  it('offset config produces tiles that differ from base for at least one cycle', () => {
    let foundDifference = false;
    for (let tick = 0; tick < 200; tick++) {
      const baseTiles = getWaveTiles(tick, 17, 44, 0, 45, baseConfig);
      const offsetTiles = getWaveTiles(tick, 17, 44, 0, 45, offsetConfig);
      if (baseTiles.length > 0 && offsetTiles.length > 0) {
        const basePositions = new Set(baseTiles.map((t) => `${t.x},${t.y}`));
        for (const t of offsetTiles) {
          if (!basePositions.has(`${t.x},${t.y}`)) {
            foundDifference = true;
            break;
          }
        }
      }
      if (foundDifference) break;
    }
    expect(foundDifference).toBe(true);
  });

  it('same seed produces same offsets (deterministic)', () => {
    const config1: WaveConfig = { randomOffsets: true, seed: 12345 };
    const config2: WaveConfig = { randomOffsets: true, seed: 12345 };
    for (let tick = 0; tick < 130; tick++) {
      const tiles1 = getWaveTiles(tick, 17, 44, 0, 45, config1);
      const tiles2 = getWaveTiles(tick, 17, 44, 0, 45, config2);
      expect(tiles1).toEqual(tiles2);
    }
  });

  it('different seeds produce different offsets', () => {
    const configA: WaveConfig = { randomOffsets: true, seed: 111 };
    const configB: WaveConfig = { randomOffsets: true, seed: 999 };
    let foundDifference = false;
    for (let tick = 0; tick < 400; tick++) {
      const tilesA = getWaveTiles(tick, 17, 44, 0, 45, configA);
      const tilesB = getWaveTiles(tick, 17, 44, 0, 45, configB);
      if (tilesA.length > 0 && tilesB.length > 0) {
        const posA = tilesA
          .map((t) => `${t.x},${t.y}`)
          .sort()
          .join('|');
        const posB = tilesB
          .map((t) => `${t.x},${t.y}`)
          .sort()
          .join('|');
        if (posA !== posB) {
          foundDifference = true;
          break;
        }
      }
      if (foundDifference) break;
    }
    expect(foundDifference).toBe(true);
  });

  it('produces exactly 4 offset variants, one per independent arm flip', () => {
    const variants = new Set<string>();
    const baseTiles = getWaveTiles(ACTIVE_TICK, 17, 44, 0, 45, { randomOffsets: false });
    const baseL = baseTiles.filter((t) => t.waveType === 'L').map((t) => t.y - t.x);
    const baseR = baseTiles.filter((t) => t.waveType === 'R').map((t) => t.x + t.y);

    for (let seed = 0; seed < 1000; seed++) {
      const config: WaveConfig = { randomOffsets: true, seed };
      const tiles = getWaveTiles(ACTIVE_TICK, 17, 44, 0, 45, config);
      const configL = tiles.filter((t) => t.waveType === 'L').map((t) => t.y - t.x);
      const configR = tiles.filter((t) => t.waveType === 'R').map((t) => t.x + t.y);
      const lShift = (configL[0] ?? 0) - (baseL[0] ?? 0);
      const rShift = (configR[0] ?? 0) - (baseR[0] ?? 0);
      variants.add(`${lShift},${rShift}`);
    }

    // The captures flip each arm independently, so both-arms-late is a real variant.
    expect([...variants].sort()).toEqual(['-2,-2', '-2,0', '0,-2', '0,0']);
  });

  it('offset variant changes across cycles (re-rolled each cycle, not fixed for the fight)', () => {
    const config: WaveConfig = { randomOffsets: true, seed: 7 };
    const variants = new Set<string>();
    for (let cycle = 0; cycle < 24; cycle++) {
      const tick = ACTIVE_TICK + cycle * 70;
      const tiles = getWaveTiles(tick, 17, 44, 0, 45, config);
      const baseTiles = getWaveTiles(tick, 17, 44, 0, 45, { randomOffsets: false });
      const l = tiles.filter((t) => t.waveType === 'L').map((t) => t.y - t.x);
      const r = tiles.filter((t) => t.waveType === 'R').map((t) => t.x + t.y);
      const bl = baseTiles.filter((t) => t.waveType === 'L').map((t) => t.y - t.x);
      const br = baseTiles.filter((t) => t.waveType === 'R').map((t) => t.x + t.y);
      if (l.length && r.length && bl.length && br.length) {
        variants.add(`${l[0] - bl[0]},${r[0] - br[0]}`);
      }
    }
    expect(variants.size).toBeGreaterThan(1);
  });
});
