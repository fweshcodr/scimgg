import { describe, expect, it } from 'vitest';
import { skipWithoutSetup } from '../../../test/helpers/setupAssets';
import { INFERNO_PILLARS, pillarFootprint } from '../pillars';
import {
  INFERNO_PRACTICE_START_TILE,
  parseInfernoStartTile,
  resolveInfernoStartTile,
  serializeInfernoStartTile,
  startTileApplies,
  validateInfernoStartTile,
} from '../startTile';
import { loadInfernoArena } from './infernoArenaFixture';

const STANDING = { west: false, south: false, northEast: false } as const;
const WAVE_30 = { startWave: 30, destroyedPillars: STANDING };

describe('Inferno practice start tile', () => {
  it.skipIf(skipWithoutSetup('infernoArena'))(
    'defaults two tiles north of the north-east pillar’s north wall, at its west column, on open floor',
    () => {
      const northEast = INFERNO_PILLARS.find((pillar) => pillar.key === 'northEast');
      if (!northEast) throw new Error('missing pillar');
      const footprint = pillarFootprint(northEast);
      const [westX] = northEast.position;
      const northY = Math.max(...footprint.map(([, y]) => y));
      expect(INFERNO_PRACTICE_START_TILE).toEqual([westX, northY + 3]);
      // The real arena bake: open floor, as is the tile on the pillar's north wall in between.
      const arena = loadInfernoArena();
      const isOpen = (x: number, y: number) =>
        arena.walkableTiles?.has(`${x},${y}`) === true && arena.collisionMap?.getFlag(x, y) === 0;
      expect(isOpen(...INFERNO_PRACTICE_START_TILE)).toBe(true);
      expect(isOpen(westX, northY + 1)).toBe(true);
      expect(validateInfernoStartTile(INFERNO_PRACTICE_START_TILE, WAVE_30, isOpen)).toEqual({ ok: true });
    },
  );

  it('applies to runs started on waves 2-68 only', () => {
    expect([1, 2, 66, 67, 68, 69].map(startTileApplies)).toEqual([false, true, true, true, true, false]);
  });

  it('stores "x,y" and reads nothing else', () => {
    expect(serializeInfernoStartTile([34, 44])).toBe('34,44');
    expect(parseInfernoStartTile('34,44')).toEqual([34, 44]);
    for (const value of ['', ' 34,44', '34, 44', '34,44,1', '-1,4', '34;44', 3444, undefined]) {
      expect(parseInfernoStartTile(value), String(value)).toBeNull();
    }
  });

  it('validates the arena bounds, the pillars standing at that start, and given terrain', () => {
    expect(validateInfernoStartTile([17, 17], WAVE_30)).toEqual({ ok: true });
    expect(validateInfernoStartTile([45, 46], WAVE_30)).toEqual({ ok: true });
    for (const tile of [
      [16, 30],
      [46, 30],
      [30, 16],
      [30, 47],
      [30.5, 30],
    ] as [number, number][]) {
      expect(validateInfernoStartTile(tile, WAVE_30), String(tile)).toMatchObject({
        ok: false,
        reason: 'out-of-bounds',
      });
    }
    // Every pillar's footprint while it stands; open once destroyed, and from wave 67 (none stand).
    for (const pillar of INFERNO_PILLARS) {
      for (const tile of pillarFootprint(pillar)) {
        expect(validateInfernoStartTile(tile, WAVE_30)).toMatchObject({ ok: false, reason: 'pillar' });
        expect(
          validateInfernoStartTile(tile, { startWave: 30, destroyedPillars: { ...STANDING, [pillar.key]: true } }),
        ).toEqual({ ok: true });
        expect(validateInfernoStartTile(tile, { startWave: 67, destroyedPillars: STANDING })).toEqual({ ok: true });
      }
    }
    expect(validateInfernoStartTile([28, 24], WAVE_30)).toEqual({
      ok: false,
      reason: 'pillar',
      message: 'The start tile [28,24] is under a standing pillar.',
    });
    // Terrain where the caller has it; a pillar's own floor is the pillar check's, not the bake's.
    const closed = (x: number, y: number) => !(x === 24 && y === 30) && !(x === 28 && y === 24);
    expect(validateInfernoStartTile([24, 30], WAVE_30, closed)).toMatchObject({ ok: false, reason: 'blocked' });
    expect(validateInfernoStartTile([28, 24], { startWave: 67, destroyedPillars: STANDING }, closed)).toEqual({
      ok: true,
    });
  });

  it('resolves a stored choice, or the default where it is unset or invalid for that start', () => {
    expect(resolveInfernoStartTile('24,30', WAVE_30)).toEqual([24, 30]);
    expect(resolveInfernoStartTile('28,24', WAVE_30)).toEqual([34, 44]);
    expect(resolveInfernoStartTile('28,24', { startWave: 67, destroyedPillars: STANDING })).toEqual([28, 24]);
    for (const value of ['', 'x', '10,10', undefined])
      expect(resolveInfernoStartTile(value, WAVE_30)).toEqual([34, 44]);
  });
});
