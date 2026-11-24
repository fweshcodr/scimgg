import { CacheSystem } from '../../rs/cache/CacheSystem';
import { analyzeWalkability } from '../../rs/collision/WalkabilityAnalyzer';
import { Bzip2 } from '../../rs/compression/Bzip2';
import { ArchiveLocTypeLoader } from '../../rs/config/loctype/LocTypeLoader';
import { MapLoader } from '../../rs/map/MapLoader';
import { readCacheZipFiles } from './cacheZipFiles';

export { findProjectCacheZip } from './real-cache';

/**
 * The Fortis Colosseum wave arena as the cache bakes it (mapsquare 28_48, local origin 1792/3072),
 * pillars included and without Sol's dynamic boundary warriors.
 */
export async function loadColosseumWaveArena(cachePath: string): Promise<ReturnType<typeof analyzeWalkability>> {
  await Bzip2.initWasm();
  const files = await readCacheZipFiles(cachePath);
  const cache = CacheSystem.fromMap('dat2', files, [2, 5]);
  const locs = new ArchiveLocTypeLoader(
    { name: 'osrs-test', game: 'oldschool', environment: 'live', revision: 232, timestamp: '2024-01-01', size: 0 },
    cache.getIndex(2).getArchive(6),
  );
  const loader = new MapLoader(cache.getIndex(5));
  const terrain = await loader.loadMapSquare(28, 48);
  // Public map archive key: archive.openrs2.org/caches/2437/keys.json, mapsquare 7216.
  const locations = await loader.loadLocations(28, 48, [-614154723, 1856813096, 1740380664, -1655073354]);
  if (!terrain || !locations) throw new Error('Expected cached Colosseum map square');
  return analyzeWalkability(terrain, locations, (id) => locs.load(id), 0);
}
