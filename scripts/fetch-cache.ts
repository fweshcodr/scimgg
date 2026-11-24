/**
 * Fetches the one pinned OSRS cache and stages it as the app's cache mirror.
 *
 * The full cache (OpenRS2 cache `PINNED_CACHE.id`, ~213 MB) is downloaded once into
 * `.setup-cache/` and verified against its pinned size and SHA-256; every later run, and every
 * generator in `scripts/setup.ts`, reads that copy offline. The mirror the browser loads is a copy
 * of it in public/osrs-cache/, which `trim-cache.ts` then rewrites in place:
 *   - public/osrs-cache/disk.zip      the cache archive (trimmed afterwards)
 *   - public/osrs-cache/keys.json     XTEA key list (empty for the pinned cache)
 *   - public/osrs-cache/manifest.json metadata (see Manifest)
 *
 * Idempotent: when the mirror verifies as the pinned cache (`verifyMirror`: hashes, upstream pin,
 * keys), trimmed for the current trace spec, nothing is copied. Otherwise - a changed trace spec, or
 * a mirror that does not verify - the full cache is copied over it again so trim-cache re-runs.
 *
 * Flags / env vars:
 *   --force    / OSRS_CACHE_FORCE=1    re-copy the mirror from the full cache even if it is current
 *   --offline  / OSRS_CACHE_OFFLINE=1  never hit the network; fail if the full cache is not on disk
 */

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import type { IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeTraceSpecHash } from './discoverCacheUsage';
import { type DownloadLimits, fetchWithLimits } from './httpsDownload';
import {
  FULL_CACHE_ZIP,
  type Manifest,
  MIRROR_DIR,
  MIRROR_DISK_ZIP_PATH,
  MIRROR_KEYS_PATH,
  MIRROR_MANIFEST_PATH,
  type MirrorPin,
  PINNED_CACHE,
  readExistingManifest,
  sha256File,
  verifyMirror,
} from './pinnedCache';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OPENRS2 = 'https://archive.openrs2.org';
export const PINNED_CACHE_URL = `${OPENRS2}/caches/runescape/${PINNED_CACHE.id}/disk.zip`;

/**
 * The full cache's limits. Idle: a minute without a byte is a dead connection. Deadline: 45 minutes
 * for 203 MB is about 77 KB/s on average, so a slow but working connection finishes and one that
 * merely trickles is abandoned instead of holding setup forever. Size: the pinned file's exact size,
 * since any byte beyond it already means it is not the pinned cache.
 */
export const FULL_CACHE_LIMITS: DownloadLimits = {
  idleMs: 60_000,
  deadlineMs: 45 * 60_000,
  maxBytes: PINNED_CACHE.diskZipBytes,
};

/** What to do when the pinned cache cannot be had from OpenRS2, appended to every such failure. */
export function pinnedCacheRecovery(): string {
  const { id, diskZipBytes, diskZipSha256 } = PINNED_CACHE;
  return [
    `The pinned cache is OpenRS2 cache ${id}: ${PINNED_CACHE_URL}`,
    `(${diskZipBytes} bytes, sha256 ${diskZipSha256}).`,
    'If OpenRS2 is unreachable or no longer serves it, obtain that exact disk.zip another way, place it at',
    `  ${path.relative(REPO_ROOT, FULL_CACHE_ZIP)}`,
    'and re-run `npm run setup` (setup still downloads the item icons and healthbars). A file with any',
    'other size or hash is refused.',
  ].join('\n');
}

/**
 * Stream a remote file to `<finalDest>.tmp`, hashing as it goes so ~200 MB is not re-read. The
 * staging file is removed on any failure, a limit running out included.
 */
export async function downloadToStaging(
  url: string,
  finalDest: string,
  label: string,
  limits: DownloadLimits = FULL_CACHE_LIMITS,
): Promise<{ stagingPath: string; bytes: number; sha256: string }> {
  mkdirSync(path.dirname(finalDest), { recursive: true });
  const tmp = `${finalDest}.tmp`;
  const removeTmp = () => {
    try {
      unlinkSync(tmp);
    } catch {
      /* never created, or already gone */
    }
  };
  removeTmp();

  const writeBody = (res: IncomingMessage) => {
    const totalHeader = res.headers['content-length'];
    const total = typeof totalHeader === 'string' ? parseInt(totalHeader, 10) : null;
    const out = createWriteStream(tmp);
    const hash = createHash('sha256');
    let received = 0;
    let lastLoggedPercent = -10;
    return new Promise<{ bytes: number; sha256: string }>((resolve, reject) => {
      const fail = (err: Error) => {
        // Removed once closed: a stream destroyed before its file opened still creates it.
        if (out.closed) removeTmp();
        else out.once('close', removeTmp).destroy();
        reject(err);
      };
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        hash.update(chunk);
        if (!out.write(chunk)) {
          res.pause();
          out.once('drain', () => res.resume());
        }
        if (total && total > 0) {
          const percent = Math.floor((received / total) * 100);
          if (percent >= lastLoggedPercent + 10) {
            const mb = (received / 1024 / 1024).toFixed(1);
            const totalMb = (total / 1024 / 1024).toFixed(1);
            console.log(`[fetch-cache] ${label}: ${percent}% (${mb} MB / ${totalMb} MB)`);
            lastLoggedPercent = percent;
          }
        }
      });
      res.on('end', () => out.end(() => resolve({ bytes: received, sha256: hash.digest('hex') })));
      res.on('error', fail);
      out.on('error', fail);
    });
  };

  try {
    const { status, value } = await fetchWithLimits(url, limits, writeBody);
    if (!value) throw new Error(`HTTP ${status || 'unknown'} from ${url}`);
    return { stagingPath: tmp, ...value };
  } catch (err) {
    removeTmp();
    throw err;
  }
}

/** The verified full cache on disk, downloading it first unless `offline`. Returns its path. */
export async function ensureFullCache(offline: boolean): Promise<string> {
  const { id, diskZipSha256, diskZipBytes } = PINNED_CACHE;
  if (existsSync(FULL_CACHE_ZIP)) {
    const bytes = statSync(FULL_CACHE_ZIP).size;
    const sha256 = bytes === diskZipBytes ? await sha256File(FULL_CACHE_ZIP) : null;
    if (sha256 === diskZipSha256) return FULL_CACHE_ZIP;
    // Only a verified download is ever renamed into place, so a mismatch here is a file someone put
    // there. It is not deleted: it may be the only copy they have.
    throw new Error(
      `[fetch-cache] ${FULL_CACHE_ZIP} is not the pinned cache ${id} ` +
        `(${bytes} bytes${sha256 ? `, sha256 ${sha256}` : ''}). Move it away and re-run.\n${pinnedCacheRecovery()}`,
    );
  }
  if (offline) {
    throw new Error(`[fetch-cache] --offline, and the pinned cache is not on disk.\n${pinnedCacheRecovery()}`);
  }
  console.log(
    `[fetch-cache] Downloading pinned cache ${id} (${(diskZipBytes / 1024 / 1024).toFixed(0)} MB) from ${PINNED_CACHE_URL}`,
  );
  let staged: Awaited<ReturnType<typeof downloadToStaging>>;
  try {
    staged = await downloadToStaging(PINNED_CACHE_URL, FULL_CACHE_ZIP, 'disk.zip');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`[fetch-cache] Could not download the pinned cache: ${reason}\n${pinnedCacheRecovery()}`);
  }
  if (staged.sha256 !== diskZipSha256 || staged.bytes !== diskZipBytes) {
    unlinkSync(staged.stagingPath);
    throw new Error(
      `[fetch-cache] OpenRS2 served ${staged.bytes} bytes with sha256 ${staged.sha256}, not the pinned cache; ` +
        `it may have re-packed it.\n${pinnedCacheRecovery()}`,
    );
  }
  renameSync(staged.stagingPath, FULL_CACHE_ZIP);
  console.log(`[fetch-cache] Pinned cache ${id} verified and stored at ${FULL_CACHE_ZIP}`);
  return FULL_CACHE_ZIP;
}

export interface MirrorPaths {
  readonly dir: string;
  readonly manifestPath: string;
  readonly diskZipPath: string;
  readonly keysPath: string;
}

const MIRROR_PATHS: MirrorPaths = {
  dir: MIRROR_DIR,
  manifestPath: MIRROR_MANIFEST_PATH,
  diskZipPath: MIRROR_DISK_ZIP_PATH,
  keysPath: MIRROR_KEYS_PATH,
};

/**
 * Keeps the mirror when it verifies as the pinned cache trimmed for `traceSpecHash`, else copies the
 * full cache over it for trim-cache to trim. Returns which it did.
 */
export async function stageMirror(
  fullZip: string,
  {
    force = false,
    traceSpecHash,
    paths = MIRROR_PATHS,
    pin = PINNED_CACHE,
  }: { force?: boolean; traceSpecHash: string; paths?: MirrorPaths; pin?: MirrorPin },
): Promise<'kept' | 'copied'> {
  const existing = readExistingManifest(paths.manifestPath);
  if (!force && existing?.trimmed === true && existing.traceSpecHash === traceSpecHash) {
    const problem = await verifyMirror(existing, { diskZipPath: paths.diskZipPath, keysPath: paths.keysPath, pin });
    if (problem === null) {
      console.log(`[fetch-cache] Mirror already holds cache ${pin.id}, trimmed for the current trace spec.`);
      return 'kept';
    }
    console.log(`[fetch-cache] Mirror is not usable (${problem}); copying it again from the full cache.`);
  }

  // Data files first, manifest (the index) last: a crash in between leaves no manifest, which the
  // next run treats as no mirror and copies again.
  mkdirSync(paths.dir, { recursive: true });
  if (existsSync(paths.manifestPath)) unlinkSync(paths.manifestPath);
  copyFileSync(fullZip, paths.diskZipPath);
  writeFileSync(paths.keysPath, JSON.stringify(pin.keys));
  const { keys: _keys, ...entry } = PINNED_CACHE;
  const manifest: Manifest = {
    ...entry,
    id: pin.id,
    builds: entry.builds.map((build) => ({ ...build })),
    diskZipSha256: pin.diskZipSha256,
    diskZipBytes: pin.diskZipBytes,
    // CacheEntry.size mirrors diskZipBytes so runtime download progress matches reality.
    size: pin.diskZipBytes,
    fetchedAt: new Date().toISOString(),
    source: `${OPENRS2}/caches/runescape/${pin.id}`,
  };
  writeFileSync(paths.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[fetch-cache] Mirror staged from cache ${pin.id}; trim-cache trims it next.`);
  return 'copied';
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force') || process.env.OSRS_CACHE_FORCE === '1';
  const offline = process.argv.includes('--offline') || process.env.OSRS_CACHE_OFFLINE === '1';
  const fullZip = await ensureFullCache(offline);
  await stageMirror(fullZip, { force, traceSpecHash: await computeTraceSpecHash(REPO_ROOT) });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isEntrypoint = !!invokedPath && fileURLToPath(import.meta.url) === invokedPath;

if (isEntrypoint) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
