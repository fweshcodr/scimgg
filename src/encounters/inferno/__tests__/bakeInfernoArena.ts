import { CacheManager } from '../../../cache/CacheManager';
import { OpenRS2Client } from '../../../cache/OpenRS2Client';
import type { ArenaConfig } from '../../../core/arena/ArenaConfig';
import { toCollisionLocInput } from '../../../core/arena/collisionSpec';
import { CacheSystem } from '../../../rs/cache/CacheSystem';
import { Bzip2 } from '../../../rs/compression/Bzip2';
import { ArchiveLocTypeLoader } from '../../../rs/config/loctype/LocTypeLoader';
import { MapLoader } from '../../../rs/map/MapLoader';
import { ZUK_EXCLUDED_STATIC_LOC_IDS } from '../../zuk/constants';
import { INFERNO_LANDING_TILE, INFERNO_MAP_SQUARE, INFERNO_MAP_SQUARE_OFFSETS } from '../constants';
import { INFERNO_PILLAR_COLLISION_LOCS } from '../pillars';

/**
 * The production bake: `useEncounterManager` -> `CacheManager.buildArenaConfig` with the descriptor's
 * inputs. `xtea` is the l35_83 map key, for a cache whose map squares are encrypted.
 */
export async function bakeInfernoArena(files: Map<string, ArrayBuffer>, xtea?: number[]): Promise<ArenaConfig> {
  await Bzip2.initWasm();
  const cache = CacheSystem.fromMap('dat2', files, [2, 5]);
  const locs = new ArchiveLocTypeLoader(
    { name: 'osrs-test', game: 'oldschool', environment: 'live', revision: 232, timestamp: '2024-01-01', size: 0 },
    cache.getIndex(2).getArchive(6),
  );
  // Nothing is downloaded: the loaders the bake reads are set directly below.
  const manager = new CacheManager(undefined, new OpenRS2Client());
  Reflect.set(manager, 'mapLoader', new MapLoader(cache.getIndex(5)));
  Reflect.set(manager, 'locTypeLoader', locs);
  if (xtea) {
    (Reflect.get(manager, 'xteaKeys') as Map<number, number[]>).set(
      (INFERNO_MAP_SQUARE.x << 8) | INFERNO_MAP_SQUARE.y,
      xtea,
    );
  }
  return manager.buildArenaConfig({
    mapX: INFERNO_MAP_SQUARE.x,
    mapY: INFERNO_MAP_SQUARE.y,
    seedX: INFERNO_LANDING_TILE[0],
    seedY: INFERNO_LANDING_TILE[1],
    mapSquareOffsets: INFERNO_MAP_SQUARE_OFFSETS,
    extraLocs: INFERNO_PILLAR_COLLISION_LOCS.map(toCollisionLocInput),
    excludedStaticLocIds: ZUK_EXCLUDED_STATIC_LOC_IDS,
  });
}
