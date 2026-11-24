// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { log } from '../../util/Logger';
import { NetworkError } from '../networkRetry';
import { OpenRS2Client } from '../OpenRS2Client';

declare const global: typeof globalThis;

/** A buffer that starts like a zip ("PK"); the client itself does not check this. */
function zipBytes(length: number, fill = 0): ArrayBuffer {
  const bytes = new Uint8Array(length).fill(fill);
  bytes[0] = 0x50;
  bytes[1] = 0x4b;
  return bytes.buffer;
}

function bodylessResponse(buffer: ArrayBuffer, contentType: string | null = null) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name: string) => (name === 'Content-Type' ? contentType : null) },
    body: null,
    arrayBuffer: async () => buffer,
  };
}

function jsonResponse(data: unknown) {
  return bodylessResponse(new TextEncoder().encode(JSON.stringify(data)).buffer, 'application/json');
}

function sha256Hex(buffer: ArrayBuffer): string {
  return createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
}

describe('OpenRS2Client', () => {
  let client: OpenRS2Client;

  beforeEach(() => {
    client = new OpenRS2Client('https://test.openrs2.org');
    vi.clearAllMocks();
  });

  describe('downloadCache', () => {
    it('should download cache without progress tracking', async () => {
      const mockBuffer = zipBytes(1024);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => null,
        },
        body: null,
        arrayBuffer: async () => mockBuffer,
      });

      const result = await client.downloadCache(2258);

      expect(fetch).toHaveBeenCalledWith('https://test.openrs2.org/disk.zip', expect.anything());
      expect(result).toEqual({ data: mockBuffer, matchesManifest: true });
    });

    it('should download cache with progress tracking', async () => {
      const chunk1 = new Uint8Array([0x50, 0x4b, 3, 4]);
      const chunk2 = new Uint8Array([5, 6, 7, 8]);
      const chunk3 = new Uint8Array([9, 10]);

      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ done: false, value: chunk1 })
          .mockResolvedValueOnce({ done: false, value: chunk2 })
          .mockResolvedValueOnce({ done: false, value: chunk3 })
          .mockResolvedValueOnce({ done: true, value: undefined }),
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (name: string) => (name === 'Content-Length' ? '10' : null),
        },
        body: {
          getReader: () => mockReader,
        },
      });

      const progressCallback = vi.fn();
      const result = await client.downloadCache(2258, progressCallback);

      expect(result.data.byteLength).toBe(10);
      expect(new Uint8Array(result.data)).toEqual(new Uint8Array([0x50, 0x4b, 3, 4, 5, 6, 7, 8, 9, 10]));

      expect(progressCallback).toHaveBeenCalledWith(40, 4);
      expect(progressCallback).toHaveBeenCalledWith(80, 8);
      expect(progressCallback).toHaveBeenCalledWith(100, 10);
    });

    it('should call progress callback with 100 when no streaming', async () => {
      const mockBuffer = zipBytes(1024);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => null,
        },
        body: null,
        arrayBuffer: async () => mockBuffer,
      });

      const progressCallback = vi.fn();
      await client.downloadCache(2258, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(100, 1024);
      expect(progressCallback).toHaveBeenCalledTimes(1);
    });

    it('should throw error on download failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.downloadCache(2258)).rejects.toThrow('Failed to download cache 2258: 404 Not Found');
    });

    it('should throw error on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.downloadCache(2258)).rejects.toThrow('Failed to download cache 2258: Network error');
    });
  });

  describe('downloadKeys', () => {
    it('should download and return keys', async () => {
      const mockKeys = [
        { mapsquare: 12345, key: [1, 2, 3, 4] },
        { mapsquare: 67890, key: [5, 6, 7, 8] },
      ];

      global.fetch = vi.fn().mockResolvedValue(jsonResponse(mockKeys));

      const result = await client.downloadKeys(2258);

      expect(fetch).toHaveBeenCalledWith('https://test.openrs2.org/keys.json', expect.anything());
      expect(result).toEqual(mockKeys);
    });

    it('should throw error on download failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.downloadKeys(2258)).rejects.toThrow('Failed to download keys for cache 2258: 404 Not Found');
    });

    it('should throw error on invalid response', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(null));

      await expect(client.downloadKeys(2258)).rejects.toThrow('Invalid keys response: expected array');
    });

    it('should throw error on network failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      await expect(client.downloadKeys(2258)).rejects.toThrow('Failed to download keys for cache 2258: Network error');
    });
  });
});

describe('OpenRS2Client manifest and mirror URLs', () => {
  const MIRROR_BASE = '/osrs-cache';
  const manifest = {
    id: 2509,
    scope: 'runescape',
    game: 'oldschool',
    language: 'en',
    environment: 'live' as const,
    timestamp: '2026-04-01T10:45:07.976649Z',
    builds: [{ major: 237, minor: 0 }],
    size: 167043756,
  };
  let client: OpenRS2Client;

  beforeEach(() => {
    client = new OpenRS2Client(MIRROR_BASE);
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('reads the same-origin mirror by default', () => {
      expect(new OpenRS2Client().getDiskZipUrl()).toBe('/osrs-cache/disk.zip');
    });
  });

  describe('getManifest', () => {
    it('fetches manifest.json', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(manifest));

      const cache = await client.getManifest();

      expect(fetch).toHaveBeenCalledWith('/osrs-cache/manifest.json', expect.anything());
      expect(cache.id).toBe(2509);
      expect(cache.builds[0]?.major).toBe(237);
    });

    it('throws when the manifest is missing required fields', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ id: 2509 }));

      await expect(client.getManifest()).rejects.toThrow('Invalid mirror manifest');
    });

    it('throws when the manifest is null', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(null));

      await expect(client.getManifest()).rejects.toThrow('Invalid mirror manifest');
    });

    it('throws when the manifest is an array (wrong shape)', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse([manifest]));

      await expect(client.getManifest()).rejects.toThrow('Invalid mirror manifest');
    });

    it('throws when builds is empty', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ...manifest, builds: [] }));

      await expect(client.getManifest()).rejects.toThrow('Invalid mirror manifest');
    });

    it('throws when builds[0] has no major', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ...manifest, builds: [{ minor: 0 }] }));

      await expect(client.getManifest()).rejects.toThrow('Invalid mirror manifest');
    });

    it('throws when scope is not a string', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse({ ...manifest, scope: 42 }));

      await expect(client.getManifest()).rejects.toThrow('Invalid mirror manifest');
    });

    it('throws on HTTP failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.getManifest()).rejects.toThrow('Failed to fetch the cache manifest: 404 Not Found');
    });
  });

  describe('downloadCache', () => {
    it('fetches /osrs-cache/disk.zip with no id in the URL when no content hash is known', async () => {
      const mockBuffer = zipBytes(2048);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body: null,
        arrayBuffer: async () => mockBuffer,
      });

      const result = await client.downloadCache(2509);

      expect(fetch).toHaveBeenCalledWith('/osrs-cache/disk.zip', expect.anything());
      expect(result).toEqual({ data: mockBuffer, matchesManifest: true });
    });

    it('adds the manifest content hash to mirror disk.zip URLs when known', async () => {
      const mockBuffer = zipBytes(2048);
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body: null,
        arrayBuffer: async () => mockBuffer,
      });

      const hash = sha256Hex(mockBuffer);
      const result = await client.downloadCache(2509, undefined, { diskZipSha256: hash });

      expect(fetch).toHaveBeenCalledWith(`/osrs-cache/disk.zip?v=${hash}`, expect.anything());
      expect(result).toEqual({ data: mockBuffer, matchesManifest: true });
    });

    it('reports the same content-versioned mirror URL used for downloads', () => {
      expect(client.getDiskZipUrl({ diskZipSha256: 'abc123' })).toBe('/osrs-cache/disk.zip?v=abc123');
    });

    it('ignores the id argument, since the mirror holds one cache', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => null },
        body: null,
        arrayBuffer: async () => zipBytes(4),
      });

      await client.downloadCache(9999);

      expect(fetch).toHaveBeenCalledWith('/osrs-cache/disk.zip', expect.anything());
    });
  });

  describe('downloadKeys', () => {
    it('fetches /osrs-cache/keys.json with no id in the URL', async () => {
      const keys = [{ mapsquare: 12345, key: [1, 2, 3, 4] }];
      global.fetch = vi.fn().mockResolvedValue(jsonResponse(keys));

      const result = await client.downloadKeys(2509);

      expect(fetch).toHaveBeenCalledWith('/osrs-cache/keys.json', expect.anything());
      expect(result).toEqual(keys);
    });

    it('accepts an empty array (authoritative empty state from upstream)', async () => {
      global.fetch = vi.fn().mockResolvedValue(jsonResponse([]));

      const result = await client.downloadKeys(2509);

      expect(result).toEqual([]);
    });
  });
});

describe('OpenRS2Client transient failures and response validation', () => {
  const manifest = {
    id: 2740,
    scope: 'runescape',
    game: 'oldschool',
    language: 'en',
    environment: 'live',
    timestamp: '2026-10-14T10:45:06.506210Z',
    builds: [{ major: 241, minor: 0 }],
  };
  let client: OpenRS2Client;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new OpenRS2Client('/osrs-cache');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /** Lets the backoff sleeps elapse while the call under test is pending. */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    const guarded = promise.then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await vi.runAllTimersAsync();
    const result = await guarded;
    if ('error' in result) throw result.error;
    return result.value;
  }

  it('retries the manifest after a transport failure', async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(jsonResponse(manifest));

    const cache = await settle(client.getManifest());

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(cache.id).toBe(2740);
  });

  it('gives up after three attempts with a NetworkError', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('Load failed'));

    const error = await settle(client.getManifest()).catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('Failed to fetch the cache manifest: Load failed');
  });

  /** A fetch whose response never arrives until the request is aborted. */
  function stalledFetch() {
    return vi.fn().mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
  }

  /** A streamed response delivering `chunks`, each after `delayMs`, then stalling if `stallAfter`. */
  function streamedResponse(init: RequestInit, chunks: Uint8Array[], delayMs: number, stallAfter = false) {
    let index = 0;
    const read = () =>
      new Promise((resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        if (index < chunks.length) {
          const value = chunks[index++];
          setTimeout(() => resolve({ done: false, value }), delayMs);
        } else if (!stallAfter) {
          resolve({ done: true, value: undefined });
        }
      });
    return { ok: true, status: 200, headers: { get: () => null }, body: { getReader: () => ({ read }) } };
  }

  it('times out a stalled cache list request and retries it', async () => {
    global.fetch = stalledFetch();

    const error = await settle(client.getManifest()).catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('Failed to fetch the cache manifest: no data received for 60s');
  });

  it('times out a stalled keys.json request and gives up after three attempts', async () => {
    global.fetch = stalledFetch();

    const error = await settle(client.downloadKeys(2740)).catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('Failed to download keys for cache 2740: no data received for 60s');
  });

  it('times out a disk.zip body that stops arriving and gives up after three attempts', async () => {
    global.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) =>
        streamedResponse(init, [new Uint8Array([0x50, 0x4b])], 0, true),
      );

    const error = await settle(client.downloadCache(2740)).catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(3);
    expect(error).toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('Failed to download cache 2740: no data received for 60s');
  });

  it('finishes a slow disk.zip download that keeps receiving bytes, however long it takes', async () => {
    // 40 chunks 50s apart: over half an hour in total, but never 60s without data.
    const chunks = Array.from({ length: 40 }, (_, i) => new Uint8Array([i]));
    global.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) => streamedResponse(init, chunks, 50_000));

    const result = await settle(client.downloadCache(2740));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.data.byteLength).toBe(40);
  });

  it('retries a 503 but not a 404', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: 'Service Unavailable' })
      .mockResolvedValueOnce(jsonResponse(manifest));
    await settle(client.getManifest());
    expect(fetch).toHaveBeenCalledTimes(2);

    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const error = await settle(client.getManifest()).catch((e: unknown) => e);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('Failed to fetch the cache manifest: 404 Not Found');
  });

  it('retries a disk.zip download whose body stream drops mid-transfer', async () => {
    const reader = {
      read: vi
        .fn()
        .mockResolvedValueOnce({ done: false, value: new Uint8Array([0x50, 0x4b, 1]) })
        .mockRejectedValueOnce(new TypeError('Load failed')),
    };
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, headers: { get: () => null }, body: { getReader: () => reader } })
      .mockResolvedValueOnce(bodylessResponse(zipBytes(8)));

    const result = await settle(client.downloadCache(2740));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result.data.byteLength).toBe(8);
  });

  // The label is not authoritative: parsing decides whether the bytes are a cache.
  it('accepts a zip served as text/html and reports the label', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    const zip = zipBytes(16);
    global.fetch = vi.fn().mockResolvedValue(bodylessResponse(zip, 'text/html; charset=utf-8'));

    const result = await settle(client.downloadCache(2740));

    expect(result).toEqual({ data: zip, matchesManifest: true });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('Cache', expect.stringContaining('text/html'));
  });

  it('returns a body without the zip signature for the archive parser to judge', async () => {
    const notZip = new TextEncoder().encode('<!DOCTYPE html>').buffer;
    global.fetch = vi.fn().mockResolvedValue(bodylessResponse(notZip, 'application/octet-stream'));

    const result = await settle(client.downloadCache(2740));

    expect(result.data).toBe(notZip);
  });

  it('accepts a download that matches the manifest sha256', async () => {
    const good = zipBytes(64, 7);
    global.fetch = vi.fn().mockResolvedValue(bodylessResponse(good));

    const result = await settle(client.downloadCache(2740, undefined, { diskZipSha256: sha256Hex(good) }));

    expect(result).toEqual({ data: good, matchesManifest: true });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('re-downloads once from a cache-busted URL when the sha256 does not match', async () => {
    const good = zipBytes(64, 7);
    const corrupt = zipBytes(64, 9);
    const hash = sha256Hex(good);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(bodylessResponse(corrupt))
      .mockResolvedValueOnce(bodylessResponse(good));

    const result = await settle(client.downloadCache(2740, undefined, { diskZipSha256: hash }));

    expect(result).toEqual({ data: good, matchesManifest: true });
    const urls = vi.mocked(fetch).mock.calls.map(([url]) => url);
    expect(urls[0]).toBe(`/osrs-cache/disk.zip?v=${hash}`);
    expect(urls[1]).toMatch(new RegExp(`^/osrs-cache/disk\\.zip\\?v=${hash}&retry=\\d+$`));
  });

  it('rejects bytes that keep failing the sha256 check instead of returning them', async () => {
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    const first = zipBytes(64, 8);
    const second = zipBytes(64, 9);
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(bodylessResponse(first))
      .mockResolvedValueOnce(bodylessResponse(second));

    const error = await settle(
      client.downloadCache(2740, undefined, { diskZipSha256: sha256Hex(zipBytes(64, 7)) }),
    ).catch((e: unknown) => e);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(error).toBeInstanceOf(Error);
    // Not a network failure: retrying the same deployment cannot fix it.
    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as Error).message).toMatch(
      /^Failed to download cache 2740: disk\.zip does not match its published checksum, even after a fresh download/,
    );
  });

  // SubtleCrypto exists only in secure contexts (HTTPS, loopback), so a LAN preview over plain http
  // still loads, but never as a verified copy.
  it('returns the download as unverified, and says so, when SubtleCrypto is unavailable', async () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.stubGlobal('crypto', {});
    const zip = zipBytes(64, 7);
    global.fetch = vi.fn().mockResolvedValue(bodylessResponse(zip));

    const result = await settle(client.downloadCache(2740, undefined, { diskZipSha256: sha256Hex(zip) }));

    expect(result).toEqual({ data: zip, matchesManifest: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith('Cache', expect.stringContaining('SubtleCrypto unavailable'));
    expect(warn).toHaveBeenCalledWith('Cache', expect.stringContaining('disk.zip is unverified'));
  });

  it('returns the download as unverified, and reports it, when hashing itself fails', async () => {
    const error = vi.spyOn(log, 'error').mockImplementation(() => {});
    vi.spyOn(log, 'warn').mockImplementation(() => {});
    vi.stubGlobal('crypto', { subtle: { digest: () => Promise.reject(new Error('OperationError')) } });
    const zip = zipBytes(64, 7);
    global.fetch = vi.fn().mockResolvedValue(bodylessResponse(zip));

    const result = await settle(client.downloadCache(2740, undefined, { diskZipSha256: 'abc' }));

    expect(result).toEqual({ data: zip, matchesManifest: false });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith('Cache', expect.stringContaining('Could not check'), expect.any(Error));
  });
});
