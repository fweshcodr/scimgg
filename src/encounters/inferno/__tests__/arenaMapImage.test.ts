import { join } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { skipWithoutSetup } from '../../../test/helpers/setupAssets';
import { arenaTileBox, fitArenaTileSize, INFERNO_ARENA_MAP_IMAGE } from '../arenaMapImage';
import { INFERNO_ARENA_BOUNDS } from '../constants';

const { url, bounds, pixelsPerTile, width, height } = INFERNO_ARENA_MAP_IMAGE;
const file = join(process.cwd(), 'public', url);

/** The image itself is `npm run setup` output (scripts/generate-inferno-arena-map.mts). */
const noMap = skipWithoutSetup('infernoArenaMap');

describe('Inferno arena map image', () => {
  it.each([8, 9, 11, 12])('projects exact tile footprints at %spx without changing SW anchors', (tileSize) => {
    const slot = arenaTileBox([22, 23], 4, tileSize);
    const pillar = arenaTileBox([27, 23], 3, tileSize);
    expect(pillar.left - slot.left - slot.width).toBe(tileSize);
    expect(slot.top + slot.height).toBe(pillar.top + pillar.height);
    expect(arenaTileBox([20, 35], 3, tileSize)).toEqual({
      left: 5 * tileSize,
      top: 11 * tileSize,
      width: 3 * tileSize,
      height: 3 * tileSize,
    });
    expect(arenaTileBox([15, 48], 1, tileSize)).toEqual({ left: 0, top: 0, width: tileSize, height: tileSize });
    expect(arenaTileBox([47, 15], 1, tileSize)).toEqual({
      left: 32 * tileSize,
      top: 33 * tileSize,
      width: tileSize,
      height: tileSize,
    });
    expect(arenaTileBox([22, 23], 2, tileSize).top + 2 * tileSize).toBe(slot.top + slot.height);
  });
  it('fits a common integer tile size without stretching either axis', () => {
    expect(fitArenaTileSize(396, 408)).toBe(12);
    expect(fitArenaTileSize(366, 377)).toBe(11);
    expect(fitArenaTileSize(320, 329)).toBe(9);
    expect(fitArenaTileSize(278, 286)).toBe(8);
    expect(fitArenaTileSize(400, 270)).toBe(7);
  });
  it.skipIf(noMap)('covers the arena and two tiles beyond, at the declared scale', async () => {
    expect(bounds).toEqual({
      minX: INFERNO_ARENA_BOUNDS.minX - 2,
      maxX: INFERNO_ARENA_BOUNDS.maxX + 2,
      minY: INFERNO_ARENA_BOUNDS.minY - 2,
      maxY: INFERNO_ARENA_BOUNDS.maxY + 2,
    });
    expect(pixelsPerTile).toBe(8);
    const metadata = await sharp(file).metadata();
    expect({ format: metadata.format, width: metadata.width, height: metadata.height }).toEqual({
      format: 'webp',
      width,
      height,
    });
    expect([width, height]).toEqual([(47 - 15 + 1) * 8, (48 - 15 + 1) * 8]);
  });

  it.skipIf(noMap)('places the terrain on the arena’s own tiles, north up', async () => {
    // The cache has floor exactly over the arena and nothing beyond, so the opaque pixels locate it.
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let [left, right, top, bottom] = [info.width, -1, info.height, -1];
    for (let row = 0; row < info.height; row++) {
      for (let column = 0; column < info.width; column++) {
        if (data[(row * info.width + column) * 4 + 3] === 0) continue;
        left = Math.min(left, column);
        right = Math.max(right, column);
        top = Math.min(top, row);
        bottom = Math.max(bottom, row);
      }
    }
    const tileOf = (column: number, row: number) => [
      bounds.minX + Math.floor(column / pixelsPerTile),
      bounds.maxY - Math.floor(row / pixelsPerTile),
    ];
    expect(tileOf(left, bottom)).toEqual([INFERNO_ARENA_BOUNDS.minX, INFERNO_ARENA_BOUNDS.minY]);
    expect(tileOf(right, top)).toEqual([INFERNO_ARENA_BOUNDS.maxX, INFERNO_ARENA_BOUNDS.maxY]);
  });
});
