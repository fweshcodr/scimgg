import { afterEach, describe, expect, it } from 'vitest';
import { CacheManager } from '../../../cache/CacheManager';
import { toCollisionLocInput } from '../../../core/arena/collisionSpec';
import { hasLineOfSight } from '../../../core/combat/distance';
import { setArenaConfig } from '../../../core/constants';
import { canMoveInDirection } from '../../../core/pathfinder';
import { CollisionFlag } from '../../../rs/collision/CollisionFlag';
import { LocModelType } from '../../../rs/config/loctype/LocModelType';
import type { MapSquareData } from '../../../rs/map/MapLoader';
import { INFERNO_MAP_SQUARE, INFERNO_MAP_SQUARE_OFFSETS } from '../constants';
import { composePillarArena, INFERNO_PILLAR_COLLISION_LOCS, INFERNO_PILLARS, pillarFootprint } from '../pillars';

const WALL_LOC = 1;
const PILLAR_LOC_IDS = new Set(INFERNO_PILLARS.map((pillar) => pillar.locId));

afterEach(() => setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true));

function openSquare(mapX: number, mapY: number): MapSquareData {
  const level = <T>(make: () => T): T[][] => [Array.from({ length: 64 }, () => make())];
  return {
    mapX,
    mapY,
    tileHeights: level(() => new Int32Array(64)),
    tileUnderlays: level(() => new Uint16Array(64).fill(1)),
    tileOverlays: level(() => new Int16Array(64)),
    tileShapes: level(() => new Uint8Array(64)),
    tileRotations: level(() => new Uint8Array(64)),
    tileRenderFlags: level(() => new Uint8Array(64)),
    tileLightOcclusions: level(() => new Uint8Array(64)),
  };
}

/** The production multi-square arena build, fed a synthetic Inferno block with one wall east of (30,32). */
async function buildInfernoArena() {
  const manager = new CacheManager();
  Reflect.set(manager, 'mapLoader', {
    loadMapSquare: async (mapX: number, mapY: number) => openSquare(mapX, mapY),
    loadLocations: async (mapX: number, mapY: number) => ({
      mapX,
      mapY,
      locations:
        mapX === INFERNO_MAP_SQUARE.x && mapY === INFERNO_MAP_SQUARE.y
          ? [{ id: WALL_LOC, localX: 30, localY: 32, type: LocModelType.WALL, rotation: 2, level: 0 }]
          : [],
    }),
  });
  Reflect.set(manager, 'locTypeLoader', {
    load: (id: number) =>
      id === WALL_LOC || PILLAR_LOC_IDS.has(id)
        ? {
            clipType: 1,
            sizeX: PILLAR_LOC_IDS.has(id) ? 3 : 1,
            sizeY: PILLAR_LOC_IDS.has(id) ? 3 : 1,
            blocksProjectile: true,
          }
        : { clipType: 0, sizeX: 1, sizeY: 1, blocksProjectile: false },
  });
  return manager.buildArenaConfig({
    mapX: INFERNO_MAP_SQUARE.x,
    mapY: INFERNO_MAP_SQUARE.y,
    seedX: 30,
    seedY: 32,
    mapSquareOffsets: INFERNO_MAP_SQUARE_OFFSETS,
    extraLocs: INFERNO_PILLAR_COLLISION_LOCS.map(toCollisionLocInput),
  });
}

describe('pillar collision over the cache-built block map', () => {
  it('keeps every static flag where it was and only opens collapsed pillars', async () => {
    const base = await buildInfernoArena();
    if (!base.collisionMap) throw new Error('expected a collision map');
    expect(base.collisionMap.sizeX).toBe(192);
    expect(base.collisionMap.hasFlag(30, 32, CollisionFlag.WALL_EAST)).toBe(true);

    const refined = composePillarArena(base, new Set(['west', 'northEast']));
    const pillarTiles = new Set(
      INFERNO_PILLARS.flatMap((pillar) => pillarFootprint(pillar).map(([x, y]) => `${x},${y}`)),
    );
    for (let x = -64; x < 128; x += 1) {
      for (let y = -64; y < 128; y += 1) {
        if (pillarTiles.has(`${x},${y}`)) continue;
        if (refined.collisionMap?.getFlag(x, y) !== base.collisionMap.getFlag(x, y)) {
          throw new Error(`flag at ${x},${y} changed`);
        }
      }
    }
    expect(refined.collisionMap?.hasFlag(28, 24, CollisionFlag.OBJECT)).toBe(false);
    expect(refined.collisionMap?.hasFlag(18, 38, CollisionFlag.OBJECT)).toBe(true);

    setArenaConfig(refined);
    expect(canMoveInDirection(30, 32, 31, 32)).toBe(false);
    expect(canMoveInDirection(30, 33, 31, 33)).toBe(true);
    expect(hasLineOfSight(29, 32, 33, 32)).toBe(false);
    expect(canMoveInDirection(26, 24, 27, 24)).toBe(true);
    expect(canMoveInDirection(16, 38, 17, 38)).toBe(false);
  });
});
