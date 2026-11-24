/**
 * The one OSRS cache this checkout is built from, and where its two local copies live: the
 * verified full cache under `.setup-cache/` and the trimmed mirror the browser loads from
 * public/osrs-cache/. Kept free of heavy imports so `--check`, the dev diagnostic and tests can
 * read it without loading the trimmer.
 */
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MIRROR_DIR = path.join(REPO_ROOT, 'public', 'osrs-cache');
export const MIRROR_MANIFEST_PATH = path.join(MIRROR_DIR, 'manifest.json');
export const MIRROR_DISK_ZIP_PATH = path.join(MIRROR_DIR, 'disk.zip');
export const MIRROR_KEYS_PATH = path.join(MIRROR_DIR, 'keys.json');

export interface Build {
  major: number;
  minor: number | null;
}

export interface CacheEntry {
  id: number;
  scope: string;
  game: string;
  language: string;
  environment: string;
  timestamp: string;
  builds: Build[];
  size?: number;
}

/**
 * The cache every generated asset and the runtime mirror come from: OpenRS2's archive entry for
 * the live game on 2026-11-18 (build 242). `diskZipSha256` and `diskZipBytes` are of its
 * `/caches/runescape/<id>/disk.zip`; OpenRS2 lists no XTEA keys for it, so `keys` is empty.
 */
export const PINNED_CACHE = {
  id: 2772,
  scope: 'runescape',
  game: 'oldschool',
  language: 'en',
  environment: 'live',
  timestamp: '2026-11-18T14:45:05.401534Z',
  builds: [{ major: 242, minor: null }],
  diskZipSha256: 'c7ee7ba49204e62d1d6bddf9f363a456027989f739fdf633d511a102eca826c9',
  diskZipBytes: 212_842_727,
  keys: [] as unknown[],
} as const;

/** The verified full cache, kept outside public/ so it is never served or trimmed. */
export const FULL_CACHE_DIR = path.join(REPO_ROOT, '.setup-cache');
export const FULL_CACHE_ZIP = path.join(FULL_CACHE_DIR, `openrs2-${PINNED_CACHE.id}-disk.zip`);

/**
 * Superset of CacheEntry written to public/osrs-cache/manifest.json.
 * Runtime OpenRS2Client reads this and wraps it as a CacheInfo in prod.
 */
export interface Manifest extends CacheEntry {
  fetchedAt: string;
  diskZipSha256: string;
  diskZipBytes: number;
  source: string;
  /**
   * Fingerprint of the trimmer's trace inputs (source-declared cache deps + data
   * files), written by trim-cache. When the current source no longer matches this,
   * the trimmed mirror is stale and is copied again from the full cache so trim-cache re-runs.
   */
  traceSpecHash?: string;
  trimmed?: boolean;
  /** Written by trim-cache: the full cache the trimmed disk.zip was cut from. */
  trimmedFromSha256?: string;
  trimmedFromBytes?: number;
}

export function readExistingManifest(manifestPath: string = MIRROR_MANIFEST_PATH): Manifest | null {
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8')) as Manifest;
  } catch (err) {
    console.warn('[fetch-cache] Existing manifest unreadable:', err);
    return null;
  }
}

/**
 * The cheap presence check, for the dev server's instant notice only: both files exist and the zip
 * has the length the manifest names. A corrupt zip of the right length passes; `verifyMirror` is
 * what decides whether a mirror may be accepted or reused.
 */
export function isMirrorConsistent(
  manifest: Manifest,
  diskZipPath: string = MIRROR_DISK_ZIP_PATH,
  keysPath: string = MIRROR_KEYS_PATH,
): boolean {
  if (!existsSync(diskZipPath) || !existsSync(keysPath)) return false;
  try {
    const actualSize = statSync(diskZipPath).size;
    if (actualSize !== manifest.diskZipBytes) {
      console.warn(
        `[fetch-cache] Local mirror is inconsistent: manifest.diskZipBytes=${manifest.diskZipBytes} ` +
          `but disk.zip is ${actualSize} bytes.`,
      );
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function sha256File(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/** The part of the pin a mirror is checked against; tests substitute their own small cache. */
export interface MirrorPin {
  readonly id: number;
  readonly diskZipSha256: string;
  readonly diskZipBytes: number;
  readonly keys: readonly unknown[];
}

/**
 * Why the mirror cannot be accepted or reused, or null when it is the pinned cache:
 *   - the manifest names the pinned cache, and the full cache it came from has the pinned size and
 *     SHA-256 (`trimmedFrom*` once trimmed; the manifest's own hash before, when it is a straight copy);
 *   - disk.zip has the size and SHA-256 the manifest records;
 *   - keys.json is the pinned key list.
 * Hashes the whole zip, so it is for `setup --check` and setup itself, not the dev server's notice.
 */
export async function verifyMirror(
  manifest: Manifest,
  {
    diskZipPath = MIRROR_DISK_ZIP_PATH,
    keysPath = MIRROR_KEYS_PATH,
    pin = PINNED_CACHE,
  }: { diskZipPath?: string; keysPath?: string; pin?: MirrorPin } = {},
): Promise<string | null> {
  if (manifest.id !== pin.id) return `its manifest names cache ${manifest.id}, not the pinned ${pin.id}`;
  const [fromSha, fromBytes] = manifest.trimmed
    ? [manifest.trimmedFromSha256, manifest.trimmedFromBytes]
    : [manifest.diskZipSha256, manifest.diskZipBytes];
  if (fromSha !== pin.diskZipSha256 || fromBytes !== pin.diskZipBytes) {
    return `its manifest records upstream sha256 ${fromSha ?? 'none'} (${fromBytes ?? '?'} bytes), not the pinned ${pin.diskZipSha256}`;
  }
  if (!existsSync(diskZipPath)) return 'disk.zip is missing';
  const bytes = statSync(diskZipPath).size;
  if (bytes !== manifest.diskZipBytes)
    return `disk.zip is ${bytes} bytes, not the ${manifest.diskZipBytes} its manifest records`;
  const sha = await sha256File(diskZipPath);
  if (sha !== manifest.diskZipSha256)
    return `disk.zip has sha256 ${sha}, not the ${manifest.diskZipSha256} its manifest records`;
  if (!existsSync(keysPath)) return 'keys.json is missing';
  let keys: unknown;
  try {
    keys = JSON.parse(readFileSync(keysPath, 'utf-8'));
  } catch {
    return 'keys.json is not valid JSON';
  }
  if (JSON.stringify(keys) !== JSON.stringify(pin.keys)) return 'keys.json is not the pinned key list';
  return null;
}
