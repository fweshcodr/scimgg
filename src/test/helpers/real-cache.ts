import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PINNED_CACHE } from '../../../scripts/pinnedCache';
import type { CacheInfo } from '../../rs/cache/CacheInfo';
import { CacheSystem } from '../../rs/cache/CacheSystem';
import { Bzip2 } from '../../rs/compression/Bzip2';
import { ArchiveEnumTypeLoader, type EnumTypeLoader } from '../../rs/config/enumtype/EnumTypeLoader';
import { ArchiveObjTypeLoader, type ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { readCacheZipFiles } from './cacheZipFiles';
import { SETUP_OUTPUTS, skipWithoutSetup } from './setupAssets';

const HELPERS_DIR = dirname(fileURLToPath(import.meta.url));

function getMainRepoRoot(): string {
  try {
    const commonDir = execSync('git rev-parse --path-format=absolute --git-common-dir', {
      cwd: HELPERS_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return join(commonDir, '..');
  } catch {
    return join(HELPERS_DIR, '..', '..', '..');
  }
}

const MAIN_REPO_ROOT = getMainRepoRoot();
const PROJECT_CACHE_DIR = join(MAIN_REPO_ROOT, '.test-cache');
const OPENRS2_CACHE_ID = 2437;
/** Same URL shape as the setup download (`scripts/fetch-cache.ts`). */
const OPENRS2_DOWNLOAD_URL = `https://archive.openrs2.org/caches/runescape/${OPENRS2_CACHE_ID}/disk.zip`;

// Real-cache tests read a 158 MB zip, which takes a while on a slower machine.
export const REAL_CACHE_TEST_TIMEOUT_MS = 60_000;

/**
 * Which real cache a suite runs on.
 *
 * - `golden`: OpenRS2 cache 2437 at `.test-cache/disk.zip`. Suites whose goldens, XTEA keys or
 *   expected values were recorded on that revision; they cannot run on another cache.
 * - `pinned`: the cache `npm run setup` downloads (`.setup-cache/`, scripts/pinnedCache.ts), which
 *   the app itself loads. Suites that assert behavior rather than one revision's bytes.
 */
export type RealCacheKind = 'golden' | 'pinned';

const PINNED_CACHE_ZIP = join(HELPERS_DIR, '..', '..', '..', SETUP_OUTPUTS.fullCache);

/** Prefer the nearest `.test-cache/` at or above the working directory. An override never falls back. */
export function findProjectCacheZip(kind: RealCacheKind = 'golden'): string | null {
  if (kind === 'pinned') return existsSync(PINNED_CACHE_ZIP) ? PINNED_CACHE_ZIP : null;
  if (process.env.SCIM_REAL_CACHE_PATH !== undefined) {
    const path = resolve(process.env.SCIM_REAL_CACHE_PATH);
    return existsSync(path) ? path : null;
  }
  let root = process.cwd();
  while (true) {
    const path = join(root, '.test-cache/disk.zip');
    if (existsSync(path)) return path;
    if (dirname(root) === root) break;
    root = dirname(root);
  }
  const path = join(PROJECT_CACHE_DIR, 'disk.zip');
  return existsSync(path) ? path : null;
}

const reportedSkips = new Set<RealCacheKind>();

/**
 * The single skip rule for real-cache suites: optional locally, mandatory on request
 * (`SCIM_REQUIRE_SETUP=1` for the pinned cache, `SCIM_REQUIRE_REAL_CACHE=1` for the golden one).
 */
function missingGoldenCacheMessage(): string {
  return (
    `the golden test cache (OpenRS2 ${OPENRS2_CACHE_ID}, whose bytes these goldens were recorded on) is not at ` +
    `${process.env.SCIM_REAL_CACHE_PATH ?? '.test-cache/disk.zip'}; download ${OPENRS2_DOWNLOAD_URL} there, ` +
    'or set SCIM_REAL_CACHE_PATH'
  );
}

export function skipWithoutRealCache(kind: RealCacheKind = 'golden'): boolean {
  if (kind === 'pinned') return skipWithoutSetup('fullCache');
  if (findProjectCacheZip(kind)) return false;
  const message = missingGoldenCacheMessage();
  if (process.env.SCIM_REQUIRE_REAL_CACHE === '1') throw new Error(`SCIM_REQUIRE_REAL_CACHE=1 but ${message}.`);
  if (!reportedSkips.has(kind)) {
    reportedSkips.add(kind);
    process.stderr.write(`[skip] ${message}.\n`);
  }
  return true;
}

const CONFIG_INDEX = 2;
const OBJ_ARCHIVE = 10;
const ENUM_ARCHIVE = 8;

const CACHE_INFO: CacheInfo = {
  name: 'osrs-test',
  game: 'oldschool',
  environment: 'live',
  revision: 232,
  timestamp: '2024-01-01',
  size: 0,
};

/** The pinned cache's build (scripts/pinnedCache.ts `PINNED_CACHE`). */
const PINNED_INFO: CacheInfo = {
  ...CACHE_INFO,
  revision: PINNED_CACHE.builds[0].major,
  timestamp: PINNED_CACHE.timestamp,
};

/** Never downloads: a suite that reaches here without the cache has no skip guard, so it fails. */
function requireCacheZip(kind: RealCacheKind): string {
  const existing = findProjectCacheZip(kind);
  if (existing) return existing;
  if (kind === 'pinned') throw new Error('The pinned cache is missing: run `npm run setup`.');
  throw new Error(
    `Cannot open the real cache: ${missingGoldenCacheMessage()}. Guard the suite with skipWithoutRealCache() to skip instead.`,
  );
}

const cachedFiles = new Map<RealCacheKind, Promise<Map<string, ArrayBuffer>>>();

/** Opens the given indices of a real cache; its files are read once per test file. */
export async function openRealCache(
  indices: number[],
  kind: RealCacheKind = 'golden',
): Promise<{ cache: CacheSystem; info: CacheInfo }> {
  let files = cachedFiles.get(kind);
  if (!files) {
    files = (async () => {
      await Bzip2.initWasm();
      return readCacheZipFiles(requireCacheZip(kind));
    })();
    cachedFiles.set(kind, files);
  }
  return {
    cache: CacheSystem.fromMap('dat2', await files, indices),
    info: kind === 'pinned' ? PINNED_INFO : CACHE_INFO,
  };
}

export async function loadCacheLoaders(
  kind: RealCacheKind = 'golden',
): Promise<{ objTypeLoader: ObjTypeLoader; enumTypeLoader: EnumTypeLoader }> {
  const configIndex = (await openRealCache([CONFIG_INDEX], kind)).cache.getIndex(CONFIG_INDEX);
  const objArchive = configIndex.getArchive(OBJ_ARCHIVE);
  const enumArchive = configIndex.getArchive(ENUM_ARCHIVE);
  return {
    objTypeLoader: new ArchiveObjTypeLoader(kind === 'pinned' ? PINNED_INFO : CACHE_INFO, objArchive),
    enumTypeLoader: new ArchiveEnumTypeLoader(kind === 'pinned' ? PINNED_INFO : CACHE_INFO, enumArchive),
  };
}
