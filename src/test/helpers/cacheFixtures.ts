import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import type { CacheInfo } from '../../rs/cache/CacheInfo';
import { CacheSystem } from '../../rs/cache/CacheSystem';
import { Bzip2 } from '../../rs/compression/Bzip2';
import { LocModelLoader } from '../../rs/config/loctype/LocModelLoader';
import { MapLoader } from '../../rs/map/MapLoader';
import { readCacheZipFiles } from './cacheZipFiles';

export { readCacheZipFiles };

export function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** The LOC and map loaders over the project test cache, configured as `CacheManager` builds them. */
export async function openTestCache(zipPath: string): Promise<{ loader: LocModelLoader; maps: MapLoader }> {
  await Bzip2.initWasm();
  // `CacheManager.initializeCacheSystem`'s default revision; sequence decoding depends on it.
  const info: CacheInfo = {
    name: 'osrs',
    game: 'oldschool',
    environment: 'live',
    revision: 232,
    timestamp: '',
    size: 0,
  };
  const cache = CacheSystem.fromMap('dat2', await readCacheZipFiles(zipPath), [0, 1, 2, 5, 7]);
  const config = cache.getIndex(2);
  const loader = new LocModelLoader(
    info,
    config.getArchive(6),
    cache.getIndex(7),
    config.getArchive(12),
    cache.getIndex(0),
    cache.getIndex(1),
  );
  return { loader, maps: new MapLoader(cache.getIndex(5), info.revision) };
}

/** The project test cache for golden generators, which run as tsx ES modules rather than under vitest. */
export async function findTestCacheForGenerator(): Promise<{ path: string; sha256: string }> {
  const { findProjectCacheZip } = await import('./real-cache');
  const path = findProjectCacheZip();
  if (!path) throw new Error('The project test cache (.test-cache/disk.zip) is missing');
  return { path, sha256: sha256File(path) };
}

/**
 * Golden generators record what the checkout at `--renderer-root` draws. The committed goldens are a
 * fixed baseline of per-draw digests that the real-cache suites compare the current renderer with.
 * Regenerating from this tree (`--renderer-root .`) re-pins that baseline to what the current
 * renderer draws, so the goldens then only confirm themselves: do it only after a deliberate drawing
 * change, and review the diff.
 */
export function rendererRootArgument(): string {
  const index = process.argv.indexOf('--renderer-root');
  const root = index >= 0 ? process.argv[index + 1] : undefined;
  if (!root) throw new Error('Missing --renderer-root <checkout to record from, e.g. .>');
  return root;
}

/** The one command that regenerates a golden fixture from this tree, stored in its `regenerate` field. */
export function regenerateCommand(generator: string): string {
  return `npx tsx ${generator} --renderer-root .`;
}

/** Writes a fixture in the formatter's layout, so regenerating it changes only what changed. */
export function writeGoldenFixture(path: string, golden: unknown): void {
  writeFileSync(path, `${JSON.stringify(golden, null, 2)}\n`);
  execFileSync('npx', ['biome', 'format', '--write', path], { stdio: 'inherit' });
  console.log(`Wrote ${path}`);
}
