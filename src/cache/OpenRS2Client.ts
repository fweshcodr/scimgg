/**
 * Reads the app's own copy of the pinned OpenRS2 cache at /osrs-cache, which `npm run setup`
 * writes (scripts/fetch-cache.ts, then trim-cache.ts). Dev and production load the same files:
 * there is exactly one cache, so ids drop out of the URLs.
 */

import { log } from '../util/Logger';
import { fetchBody, fetchJson, NetworkError, retryTransient } from './networkRetry';

const MIRROR_BASE_URL = '/osrs-cache';

/** Prefixes the message while keeping the network/non-network distinction callers report on. */
function withContext(error: unknown, context: string): Error {
  const message = `${context}: ${error instanceof Error ? error.message : 'Unknown error'}`;
  return error instanceof NetworkError ? new NetworkError(message) : new Error(message);
}

/**
 * Whether `data` hashes to `expectedHex`, or null when this page cannot hash at all: SubtleCrypto
 * is only exposed to secure contexts (HTTPS and loopback), so a LAN preview over plain http has
 * none. Rejects if hashing itself fails.
 */
async function matchesSha256(data: ArrayBuffer, expectedHex: string): Promise<boolean | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    log.warn('Cache', 'SubtleCrypto unavailable (it needs HTTPS or localhost); disk.zip cannot be verified');
    return null;
  }
  const digest = new Uint8Array(await subtle.digest('SHA-256', data));
  const actualHex = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return actualHex === expectedHex.toLowerCase();
}

export interface CacheInfo {
  id: number;
  scope: string;
  game: string;
  language: string;
  environment: string;
  timestamp: string;
  builds: Array<{
    major: number;
    minor: number;
  }>;
  size?: number;
  /**
   * SHA-256 of the served disk.zip (manifest.json, written by scripts/fetch-cache.ts and
   * trim-cache.ts). Used to cache-bust:
   * the OpenRS2 `id` is unchanged when we re-trim the same upstream cache, but
   * this hash changes whenever the served content does. downloadCache() also
   * checks the downloaded bytes against it (see {@link DownloadedCache}).
   */
  diskZipSha256?: string;
  /**
   * Every container compression in the served disk.zip (`'none'`, `'gzip'`, `'bzip2'`), as
   * scripts/trim-cache.ts records it. See {@link cacheNeedsBzip2}.
   */
  containerCompressions?: readonly string[];
}

/**
 * Whether decoding this cache needs the bzip2 WebAssembly decoder: yes unless the manifest lists
 * the cache's compressions without bzip2. The trimmed mirror never contains bzip2; an untrimmed
 * copy of the full cache does, and declares nothing.
 */
export function cacheNeedsBzip2(info: Pick<CacheInfo, 'containerCompressions'> | undefined): boolean {
  const compressions = info?.containerCompressions;
  return !Array.isArray(compressions) || compressions.includes('bzip2');
}

export interface XteaEntry {
  mapsquare: number;
  key: number[];
}

export type KeysData = XteaEntry[];

export interface DownloadedCache {
  readonly data: ArrayBuffer;
  /**
   * False when the bytes are unverified: the manifest names a `diskZipSha256` but this page could
   * not hash them (no SubtleCrypto outside a secure context, or hashing failed). Such a copy is
   * still usable if it parses, but is kept for the session only so the next visit downloads again.
   * Bytes that hash to anything else are never returned: downloadCache() rejects them.
   */
  readonly matchesManifest: boolean;
}

export interface DownloadCacheOptions {
  readonly estimatedTotalBytes?: number;
  readonly diskZipSha256?: string;
}

function isValidManifest(value: unknown): value is CacheInfo {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== 'number') return false;
  if (typeof m.scope !== 'string') return false;
  if (typeof m.game !== 'string') return false;
  if (typeof m.language !== 'string') return false;
  if (typeof m.environment !== 'string') return false;
  if (typeof m.timestamp !== 'string') return false;
  if (!Array.isArray(m.builds) || m.builds.length === 0) return false;
  const firstBuild = m.builds[0] as Record<string, unknown> | undefined;
  if (!firstBuild || typeof firstBuild.major !== 'number') return false;
  return true;
}

export class OpenRS2Client {
  constructor(private readonly baseUrl: string = MIRROR_BASE_URL) {}

  getDiskZipUrl(options: Pick<DownloadCacheOptions, 'diskZipSha256'> = {}): string {
    const diskZipVersion = options.diskZipSha256 ? `?v=${encodeURIComponent(options.diskZipSha256)}` : '';
    return `${this.baseUrl}/disk.zip${diskZipVersion}`;
  }

  /** The mirror's manifest.json. Same-origin, so HTTP caching is all the caching it needs. */
  async getManifest(): Promise<CacheInfo> {
    try {
      const data = await retryTransient(() => fetchJson(`${this.baseUrl}/manifest.json`));
      if (!isValidManifest(data)) {
        throw new Error('Invalid mirror manifest: missing id, builds, or timestamp');
      }
      return data;
    } catch (error) {
      throw withContext(error, 'Failed to fetch the cache manifest');
    }
  }

  /**
   * A copy that fails the checksum is downloaded once more from a URL nothing has cached; if that
   * fails too, the download rejects rather than parse bytes that are not the published cache. A copy
   * that cannot be hashed is reported as unverified and returned with `matchesManifest: false`.
   *
   * @param onProgress - Called with (percent, receivedBytes) where percent is 0-100.
   */
  async downloadCache(
    id: number,
    onProgress?: (percent: number, receivedBytes: number) => void,
    options: DownloadCacheOptions = {},
  ): Promise<DownloadedCache> {
    try {
      const url = this.getDiskZipUrl(options);
      const download = (from: string) => retryTransient(() => this.fetchDiskZip(from, onProgress, options));

      let data = await download(url);
      const expectedSha256 = options.diskZipSha256;
      if (!expectedSha256) return { data, matchesManifest: true };
      const check = async (): Promise<boolean | null> => {
        try {
          return await matchesSha256(data, expectedSha256);
        } catch (error) {
          log.error('Cache', 'Could not check disk.zip against its published checksum:', error);
          return null;
        }
      };
      let matches = await check();
      if (matches === false) {
        // A bad copy can sit in the HTTP cache under the versioned URL, so the one
        // re-download uses a URL nothing has cached.
        log.warn('Cache', `disk.zip did not match manifest sha256 ${expectedSha256}; re-downloading once`);
        data = await download(`${url}${url.includes('?') ? '&' : '?'}retry=${Date.now()}`);
        matches = await check();
      }
      if (matches === false) {
        throw new Error(
          'disk.zip does not match its published checksum, even after a fresh download, so it was not loaded. ' +
            'Reload to try again; if it persists, the deployed disk.zip and manifest.json disagree (re-run `npm run setup`).',
        );
      }
      if (matches === null) {
        log.warn('Cache', 'disk.zip is unverified; using it for this session only, without saving it');
        return { data, matchesManifest: false };
      }
      return { data, matchesManifest: true };
    } catch (error) {
      throw withContext(error, `Failed to download cache ${id}`);
    }
  }

  private async fetchDiskZip(
    url: string,
    onProgress: ((percent: number, receivedBytes: number) => void) | undefined,
    options: DownloadCacheOptions,
  ): Promise<ArrayBuffer> {
    const { bytes, contentType } = await fetchBody(url, {
      onProgress: (receivedBytes, totalBytes) => {
        const estimatedTotal = totalBytes ?? (options.estimatedTotalBytes || 160 * 1024 * 1024);
        const percent = Math.round((receivedBytes / estimatedTotal) * 100);
        onProgress?.(totalBytes ? percent : Math.min(99, percent), receivedBytes);
      },
    });
    // The label is not authoritative (some servers and proxies mislabel files); parsing
    // the archive decides. A real HTML page still fails there as a corrupt archive.
    if (contentType?.includes('text/html')) {
      log.error('Cache', `disk.zip was served as ${contentType}; trying to read it as a zip anyway`);
    }
    return bytes;
  }

  async downloadKeys(id: number): Promise<KeysData> {
    try {
      const data = await retryTransient(() => fetchJson(`${this.baseUrl}/keys.json`));
      if (!Array.isArray(data)) {
        throw new Error('Invalid keys response: expected array');
      }
      return data as KeysData;
    } catch (error) {
      throw withContext(error, `Failed to download keys for cache ${id}`);
    }
  }
}
