import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheSystem } from '../../rs/cache/CacheSystem';
import { Bzip2 } from '../../rs/compression/Bzip2';
import { CacheManager, isStoredCacheStale } from '../CacheManager';
import type { CacheMeta, CacheStorage } from '../CacheStorage';
import type { CacheInfo, OpenRS2Client } from '../OpenRS2Client';

/** The indices CacheManager loads; a copy without any of them is incomplete. */
const { LOADED_INDICES } = vi.hoisted(() => ({ LOADED_INDICES: [0, 1, 2, 4, 5, 7, 8, 9, 22] }));

/** A complete stored or extracted file set, optionally without some files. */
function cacheFiles(...omit: string[]): Map<string, ArrayBuffer> {
  const names = [
    'main_file_cache.dat2',
    'main_file_cache.idx255',
    ...LOADED_INDICES.map((i) => `main_file_cache.idx${i}`),
  ];
  return new Map(names.filter((name) => !omit.includes(name)).map((name) => [name, new ArrayBuffer(6)]));
}

vi.mock('jszip', () => ({
  default: {
    loadAsync: vi.fn().mockResolvedValue({
      files: Object.fromEntries(
        ['main_file_cache.dat2', 'main_file_cache.idx255', ...LOADED_INDICES.map((i) => `main_file_cache.idx${i}`)].map(
          (name) => [`cache/${name}`, { dir: false, async: () => new ArrayBuffer(6) }],
        ),
      ),
    }),
  },
}));

vi.mock('../../rs/cache/CacheSystem', () => ({
  CacheSystem: {
    fromMap: vi.fn().mockReturnValue({
      getIndex: vi.fn().mockReturnValue({}),
    }),
  },
}));

vi.mock('../../rs/map/MapLoader', () => ({
  MapLoader: class MockMapLoader {},
}));

describe('CacheManager', () => {
  let mockStorage: CacheStorage;
  let mockClient: OpenRS2Client;
  let manager: CacheManager;

  beforeEach(() => {
    mockStorage = {
      getCacheMeta: vi.fn(),
      deleteCacheMeta: vi.fn(),
      storeCacheFile: vi.fn(),
      storeCacheMeta: vi.fn(),
      deleteOlderCaches: vi.fn(),
      getCacheFile: vi.fn(),
      getCacheFilesParallel: vi.fn().mockImplementation(async (names: string[]) => {
        const result = new Map<string, ArrayBuffer>();
        for (const name of names) {
          if (name === 'main_file_cache.dat2') result.set(name, new ArrayBuffer(1024));
          else if (name === 'main_file_cache.idx255') result.set(name, new ArrayBuffer(6));
          else if (name.startsWith('main_file_cache.idx')) result.set(name, new ArrayBuffer(6));
        }
        return result;
      }),
      getParsed: vi.fn(),
      storeParsed: vi.fn(),
      deleteCache: vi.fn(),
    } as any;

    mockClient = {
      getManifest: vi.fn(),
      downloadCache: vi.fn(),
      downloadKeys: vi.fn().mockResolvedValue([]),
      getDiskZipUrl: vi.fn().mockReturnValue('/osrs-cache/disk.zip'),
    } as any;

    manager = new CacheManager(mockStorage, mockClient);
    // Loader construction needs a real cache; these cases are about the states around it.
    (manager as unknown as { initializeCacheSystem: () => Promise<void> }).initializeCacheSystem = vi.fn(
      async () => {},
    );
  });

  describe('State Transitions', () => {
    it('should start in UNLOADED state', () => {
      const state = manager.getState();
      expect(state.state).toBe('UNLOADED');
    });

    it('should transition UNLOADED → DOWNLOADING → LOADED when cache not in IndexedDB', async () => {
      const states: string[] = [];

      manager.subscribe((state) => {
        states.push(state.state);
      });

      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);
      vi.mocked(mockClient.downloadCache).mockImplementation(async (_id, onProgress) => {
        if (onProgress) {
          onProgress(50, 512);
          onProgress(100, 1024);
        }
        return { data: new ArrayBuffer(1024), matchesManifest: true };
      });
      vi.mocked(mockStorage.storeCacheFile).mockResolvedValue(undefined);
      vi.mocked(mockStorage.storeCacheMeta).mockResolvedValue(undefined);

      await manager.ensureCache();

      expect(states).toContain('UNLOADED');
      expect(states).toContain('DOWNLOADING');
      expect(states).toContain('LOADED');
      expect(manager.getState().state).toBe('LOADED');
    });

    it('should transition to ERROR state on download failure', async () => {
      const states: string[] = [];

      manager.subscribe((state) => {
        states.push(state.state);
      });

      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);
      vi.mocked(mockClient.downloadCache).mockRejectedValue(new Error('Network error'));

      await expect(manager.ensureCache()).rejects.toThrow('Network error');

      expect(states).toContain('UNLOADED');
      expect(states).toContain('DOWNLOADING');
      expect(states).toContain('ERROR');
      expect(manager.getState().state).toBe('ERROR');
      expect(manager.getState().error).toContain('Network error');
    });

    it('re-downloads (not load-from-storage) when the deployed content hash differs from the stored copy', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
        diskZipSha256: 'new-hash',
      };
      const staleMeta: CacheMeta = {
        cacheId: 123,
        buildMajor: 220,
        buildMinor: 1,
        fetchedAt: Date.now(),
        sourceUrl: 'https://archive.openrs2.org/caches/123/disk.zip',
        manifestHash: 'old-hash',
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(staleMeta);
      // Reject the download so we stop before initialization — we only need to
      // prove it re-downloads instead of loading the stale copy.
      vi.mocked(mockClient.downloadCache).mockRejectedValue(new Error('Network error'));

      await expect(manager.ensureCache()).rejects.toThrow('Network error');

      expect(mockClient.downloadCache).toHaveBeenCalled();
      expect(mockStorage.getCacheFilesParallel).not.toHaveBeenCalled();
      // A failed re-download must leave the previous copy intact for a later retry.
      expect(mockStorage.deleteCache).not.toHaveBeenCalled();
    });

    it('should transition ERROR → UNLOADED → DOWNLOADING → LOADED on retry', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);
      vi.mocked(mockClient.downloadCache).mockRejectedValueOnce(new Error('Network error'));

      await expect(manager.ensureCache()).rejects.toThrow('Network error');
      expect(manager.getState().state).toBe('ERROR');

      vi.mocked(mockClient.downloadCache).mockResolvedValueOnce({ data: new ArrayBuffer(1024), matchesManifest: true });
      vi.mocked(mockStorage.storeCacheFile).mockResolvedValue(undefined);
      vi.mocked(mockStorage.storeCacheMeta).mockResolvedValue(undefined);

      await manager.retry();

      expect(manager.getState().state).toBe('LOADED');
    });
  });

  describe('Download Progress', () => {
    it('should track download progress', async () => {
      const progressUpdates: number[] = [];

      manager.subscribe((state) => {
        if (state.downloadProgress) {
          progressUpdates.push(state.downloadProgress.percent);
        }
      });

      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);
      vi.mocked(mockClient.downloadCache).mockImplementation(async (_id, onProgress) => {
        if (onProgress) {
          onProgress(25, 256);
          onProgress(50, 512);
          onProgress(75, 768);
          onProgress(100, 1024);
        }
        return { data: new ArrayBuffer(1024), matchesManifest: true };
      });
      vi.mocked(mockStorage.storeCacheFile).mockResolvedValue(undefined);
      vi.mocked(mockStorage.storeCacheMeta).mockResolvedValue(undefined);

      await manager.ensureCache();

      expect(progressUpdates).toContain(25);
      expect(progressUpdates).toContain(50);
      expect(progressUpdates).toContain(75);
      expect(progressUpdates).toContain(100);
    });

    it('should clear download progress when LOADED', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);
      vi.mocked(mockClient.downloadCache).mockImplementation(async (_id, onProgress) => {
        if (onProgress) {
          onProgress(100, 1024);
        }
        return { data: new ArrayBuffer(1024), matchesManifest: true };
      });
      vi.mocked(mockStorage.storeCacheFile).mockResolvedValue(undefined);
      vi.mocked(mockStorage.storeCacheMeta).mockResolvedValue(undefined);

      await manager.ensureCache();

      const state = manager.getState();
      expect(state.state).toBe('LOADED');
      expect(state.downloadProgress).toBeUndefined();
    });
  });

  describe('Download state', () => {
    it('should return idle state when UNLOADED', () => {
      const downloadState = manager.getDownloadState();
      expect(downloadState.status).toBe('idle');
    });

    it('should return downloading state with progress', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);

      let capturedOnProgress: ((percent: number, receivedBytes: number) => void) | undefined;
      vi.mocked(mockClient.downloadCache).mockImplementation(async (_id, onProgress) => {
        capturedOnProgress = onProgress;
        return new Promise(() => {});
      });

      const ensurePromise = manager.ensureCache();

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (capturedOnProgress) {
        capturedOnProgress(50, 512);
      }

      const downloadState = manager.getDownloadState();
      expect(downloadState.status).toBe('loading');
      if (downloadState.status === 'loading') {
        expect(downloadState.percent).toBe(50);
      }

      ensurePromise.catch(() => {});
    });

    it('should return success state when LOADED', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      const mockMeta: CacheMeta = {
        cacheId: 123,
        buildMajor: 220,
        buildMinor: 1,
        fetchedAt: Date.now(),
        sourceUrl: 'https://archive.openrs2.org/caches/123/disk.zip',
        manifestHash: 'abc123',
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(mockMeta);
      vi.mocked(mockStorage.getCacheFile).mockImplementation(async (name: string) => {
        if (name === 'main_file_cache.dat2') return new ArrayBuffer(1024);
        if (name === 'main_file_cache.idx255') return new ArrayBuffer(6);
        if (name === 'main_file_cache.idx5') return new ArrayBuffer(6);
        return null;
      });

      await manager.ensureCache();

      const downloadState = manager.getDownloadState();
      expect(downloadState.status).toBe('success');
    });

    it('should return error state with message on failure', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(null);
      vi.mocked(mockClient.downloadCache).mockRejectedValue(new Error('Network timeout'));

      await expect(manager.ensureCache()).rejects.toThrow();

      const downloadState = manager.getDownloadState();
      expect(downloadState.status).toBe('error');
      if (downloadState.status === 'error') {
        expect(downloadState.message).toContain('Network timeout');
      }
    });
  });

  describe('API Methods', () => {
    it('should throw error when accessing cache before LOADED', async () => {
      await expect(manager.getBlob('test.dat')).rejects.toThrow('Cache not loaded');
      await expect(manager.getParsed('npctype', 1)).rejects.toThrow('Cache not loaded');
      await expect(manager.setParsed('npctype', 1, {})).rejects.toThrow('Cache not loaded');
    });

    it('should allow cache access when LOADED', async () => {
      const mockCacheInfo: CacheInfo = {
        id: 123,
        scope: 'runescape',
        game: 'oldschool',
        language: 'en',
        environment: 'live',
        timestamp: '2024-01-01T00:00:00Z',
        builds: [{ major: 220, minor: 1 }],
      };

      const mockMeta: CacheMeta = {
        cacheId: 123,
        buildMajor: 220,
        buildMinor: 1,
        fetchedAt: Date.now(),
        sourceUrl: 'https://archive.openrs2.org/caches/123/disk.zip',
        manifestHash: 'abc123',
      };

      vi.mocked(mockClient.getManifest).mockResolvedValue(mockCacheInfo);
      vi.mocked(mockStorage.getCacheMeta).mockResolvedValue(mockMeta);
      vi.mocked(mockStorage.getCacheFile).mockImplementation(async (name: string) => {
        if (name === 'main_file_cache.dat2') return new ArrayBuffer(1024);
        if (name === 'main_file_cache.idx255') return new ArrayBuffer(6);
        if (name === 'main_file_cache.idx5') return new ArrayBuffer(6);
        if (name === 'test.dat') return new ArrayBuffer(1024);
        return null;
      });
      vi.mocked(mockStorage.getParsed).mockResolvedValue({ name: 'Test NPC' });

      await manager.ensureCache();

      const blob = await manager.getBlob('test.dat');
      expect(blob).toBeInstanceOf(ArrayBuffer);

      const parsed = await manager.getParsed('npctype', 1);
      expect(parsed).toEqual({ name: 'Test NPC' });
    });
  });
});

describe('CacheManager install integrity and storage failures', () => {
  const cacheInfo: CacheInfo = {
    id: 2740,
    scope: 'runescape',
    game: 'oldschool',
    language: 'en',
    environment: 'live',
    timestamp: '2026-10-14T10:45:06Z',
    builds: [{ major: 241, minor: 0 }],
    diskZipSha256: 'deployed-hash',
  };
  const storedMeta: CacheMeta = {
    cacheId: 2740,
    buildMajor: 241,
    buildMinor: 0,
    fetchedAt: 0,
    sourceUrl: '/osrs-cache/disk.zip?v=deployed-hash',
    manifestHash: 'deployed-hash',
  };

  let calls: string[];
  let storage: CacheStorage;
  let client: OpenRS2Client;
  let manager: CacheManager;
  let initialize: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    calls = [];
    storage = {
      getCacheMeta: vi.fn().mockResolvedValue(null),
      deleteCacheMeta: vi.fn(async () => {
        calls.push('deleteCacheMeta');
      }),
      deleteCache: vi.fn(),
      storeCacheFile: vi.fn(async (name: string) => {
        calls.push(`store:${name}`);
      }),
      storeCacheMeta: vi.fn(async () => {
        calls.push('storeMeta');
      }),
      deleteOlderCaches: vi.fn(async () => {
        calls.push('deleteOlderCaches');
      }),
      getCacheFile: vi.fn().mockResolvedValue(null),
      getCacheFilesParallel: vi.fn(),
    } as unknown as CacheStorage;
    client = {
      getManifest: vi.fn().mockResolvedValue(cacheInfo),
      downloadCache: vi.fn().mockResolvedValue({ data: new ArrayBuffer(8), matchesManifest: true }),
      getDiskZipUrl: vi.fn().mockReturnValue('/osrs-cache/disk.zip?v=deployed-hash'),
    } as unknown as OpenRS2Client;
    manager = new CacheManager(storage, client);
    // Loader construction needs a real cache; these cases are about what happens around it.
    initialize = vi.fn(async () => {
      calls.push('initialize');
    });
    (manager as unknown as { initializeCacheSystem: typeof initialize }).initializeCacheSystem = initialize;
  });

  it('writes the completion marker only after every file is stored and initialization succeeds', async () => {
    await manager.ensureCache();

    expect(manager.getState().state).toBe('LOADED');
    expect(calls[0]).toBe('deleteCacheMeta');
    expect(calls.slice(1, -3).every((call) => call.startsWith('store:main_file_cache.'))).toBe(true);
    expect(calls.slice(-3)).toEqual(['initialize', 'storeMeta', 'deleteOlderCaches']);
    expect(storage.deleteOlderCaches).toHaveBeenCalledWith(2740);
    expect(storage.storeCacheMeta).toHaveBeenCalledWith(
      expect.objectContaining({ cacheId: 2740, manifestHash: 'deployed-hash' }),
    );
  });

  it('leaves no completion marker when initialization of the download fails', async () => {
    initialize.mockRejectedValueOnce(new Error('Failed to load CONFIG index: bad data'));

    await expect(manager.ensureCache()).rejects.toThrow('Failed to load CONFIG index');

    expect(storage.deleteCacheMeta).toHaveBeenCalledWith(2740);
    expect(storage.storeCacheMeta).not.toHaveBeenCalled();
    expect(storage.deleteOlderCaches).not.toHaveBeenCalled();
    expect(manager.getState()).toMatchObject({ state: 'ERROR', error: 'Failed to load CONFIG index: bad data' });
  });

  it('keeps older caches when the new install could not be marked complete', async () => {
    vi.mocked(storage.storeCacheMeta).mockRejectedValueOnce(new Error('Transaction aborted: QuotaExceededError'));

    await manager.ensureCache();

    expect(manager.getState().state).toBe('LOADED');
    expect(storage.deleteOlderCaches).not.toHaveBeenCalled();
  });

  it('still loads when pruning older caches fails', async () => {
    vi.mocked(storage.deleteOlderCaches).mockRejectedValueOnce(
      new Error('Failed to delete old caches: Internal error.'),
    );

    await manager.ensureCache();

    expect(manager.getState().state).toBe('LOADED');
  });

  it('downloads instead of failing when browser storage cannot be opened', async () => {
    const storageError = new Error('Failed to open database: Internal error.');
    vi.mocked(storage.getCacheMeta).mockRejectedValue(storageError);
    vi.mocked(storage.deleteCacheMeta).mockRejectedValue(storageError);

    await manager.ensureCache();

    expect(manager.getState().state).toBe('LOADED');
    expect(client.downloadCache).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(storage.storeCacheMeta).not.toHaveBeenCalled();
  });

  it('keeps the downloaded copy for the session when storing a file fails part-way', async () => {
    vi.mocked(storage.storeCacheFile).mockRejectedValueOnce(
      new Error('Failed to store cache file: Database deleted by request of the user'),
    );

    await manager.ensureCache();

    expect(manager.getState().state).toBe('LOADED');
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(storage.storeCacheMeta).not.toHaveBeenCalled();
    expect(storage.deleteOlderCaches).not.toHaveBeenCalled();
  });

  it('re-downloads when a stored copy cannot be read back', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue(storedMeta);
    vi.mocked(storage.getCacheFilesParallel).mockRejectedValue(
      new Error('Failed to retrieve cache file main_file_cache.idx203: Database deleted by request of the user'),
    );

    await manager.ensureCache();

    expect(client.downloadCache).toHaveBeenCalledTimes(1);
    expect(manager.getState().state).toBe('LOADED');
  });

  it('re-downloads when the stored copy is missing its index table', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue(storedMeta);
    vi.mocked(storage.getCacheFilesParallel).mockResolvedValue(cacheFiles('main_file_cache.idx255'));

    await manager.ensureCache();

    expect(client.downloadCache).toHaveBeenCalledTimes(1);
  });

  // Initializing a copy without idx2 fails every time, so Retry must not keep rereading it.
  it('re-downloads instead of initializing a stored copy that is missing a loaded index', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue(storedMeta);
    vi.mocked(storage.getCacheFilesParallel).mockResolvedValue(cacheFiles('main_file_cache.idx2'));

    await manager.ensureCache();

    expect(client.downloadCache).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(initialize.mock.calls[0]?.[0].has('main_file_cache.idx2')).toBe(true);
    expect(manager.getState().state).toBe('LOADED');
  });

  it('loads a complete stored copy without downloading', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue(storedMeta);
    vi.mocked(storage.getCacheFilesParallel).mockResolvedValue(cacheFiles());

    await manager.ensureCache();

    expect(client.downloadCache).not.toHaveBeenCalled();
    expect(storage.deleteOlderCaches).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledWith(cacheFiles());
    expect(manager.getState().state).toBe('LOADED');
  });

  it('does not fall back to a download when initializing a complete stored copy fails', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue(storedMeta);
    vi.mocked(storage.getCacheFilesParallel).mockResolvedValue(cacheFiles());
    initialize.mockRejectedValueOnce(new Error('Failed to load bzip2 decoder'));

    await expect(manager.ensureCache()).rejects.toThrow('Failed to load bzip2 decoder');

    expect(client.downloadCache).not.toHaveBeenCalled();
    expect(manager.getState().state).toBe('ERROR');
  });

  it('loads a stored copy that names its data file .dat instead of .dat2', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue(storedMeta);
    const files = cacheFiles('main_file_cache.dat2');
    files.set('main_file_cache.dat', new ArrayBuffer(6));
    vi.mocked(storage.getCacheFilesParallel).mockResolvedValue(files);

    await manager.ensureCache();

    expect(client.downloadCache).not.toHaveBeenCalled();
    expect(initialize).toHaveBeenCalledWith(files);
  });

  it('replaces a same-id copy in place, leaving its other stored data such as XTEA keys alone', async () => {
    vi.mocked(storage.getCacheMeta).mockResolvedValue({ ...storedMeta, manifestHash: 'previous-hash' });

    await manager.ensureCache();

    expect(storage.deleteCacheMeta).toHaveBeenCalledWith(2740);
    expect(storage.deleteCache).not.toHaveBeenCalled();
  });

  it('uses an unverified download for this session only, so the next visit downloads again', async () => {
    vi.mocked(client.downloadCache).mockResolvedValue({ data: new ArrayBuffer(8), matchesManifest: false });

    await manager.ensureCache();

    expect(manager.getState().state).toBe('LOADED');
    expect(initialize).toHaveBeenCalledTimes(1);
    expect(storage.deleteCacheMeta).not.toHaveBeenCalled();
    expect(storage.storeCacheFile).not.toHaveBeenCalled();
    expect(storage.storeCacheMeta).not.toHaveBeenCalled();
    expect(storage.deleteOlderCaches).not.toHaveBeenCalled();

    const nextVisit = new CacheManager(storage, client);
    (nextVisit as unknown as { initializeCacheSystem: typeof initialize }).initializeCacheSystem = initialize;
    await nextVisit.ensureCache();

    expect(client.downloadCache).toHaveBeenCalledTimes(2);
  });

  it('reports a download that fails its checksum as an error, without parsing or storing it', async () => {
    const message =
      'Failed to download cache 2740: disk.zip does not match its published checksum, even after a fresh download';
    vi.mocked(client.downloadCache).mockRejectedValue(new Error(message));

    await expect(manager.ensureCache()).rejects.toThrow(message);

    expect(manager.getState()).toMatchObject({ state: 'ERROR', error: message });
    expect(manager.getDownloadState()).toEqual({ status: 'error', message });
    expect(initialize).not.toHaveBeenCalled();
    expect(storage.storeCacheFile).not.toHaveBeenCalled();
    expect(storage.storeCacheMeta).not.toHaveBeenCalled();
  });
});

describe('isStoredCacheStale (cache-busting policy)', () => {
  const meta = (manifestHash: string): CacheMeta => ({
    cacheId: 2607,
    buildMajor: 238,
    buildMinor: 0,
    fetchedAt: 0,
    sourceUrl: 'https://archive.openrs2.org/caches/2607/disk.zip',
    manifestHash,
  });

  const versionedMeta = (manifestHash: string): CacheMeta => ({
    cacheId: 2607,
    buildMajor: 238,
    buildMinor: 0,
    fetchedAt: 0,
    sourceUrl: `https://example.com/osrs-cache/disk.zip?v=${manifestHash}`,
    manifestHash,
  });

  it('is false when there is no stored copy (download happens anyway)', () => {
    expect(isStoredCacheStale(null, 'abc')).toBe(false);
  });

  it('is false in dev/openrs2 mode where the manifest carries no content hash', () => {
    expect(isStoredCacheStale(meta('abc'), undefined)).toBe(false);
  });

  it('is false when the stored hash matches and the source URL was content-versioned', () => {
    expect(isStoredCacheStale(versionedMeta('abc'), 'abc')).toBe(false);
  });

  it('is true when the stored hash matches but the source URL was not content-versioned', () => {
    expect(isStoredCacheStale(meta('abc'), 'abc')).toBe(true);
  });

  it('is true when the deployed content hash differs (re-trim of the same OpenRS2 id)', () => {
    expect(isStoredCacheStale(meta('abc'), 'def')).toBe(true);
  });

  it('is true for copies stored before hash tracking (empty stored hash) so they re-download once', () => {
    expect(isStoredCacheStale(meta(''), 'def')).toBe(true);
  });
});

describe('CacheManager bzip2 decoder', () => {
  const cacheInfo = (containerCompressions?: string[]): CacheInfo => ({
    id: 2740,
    scope: 'runescape',
    game: 'oldschool',
    language: 'en',
    environment: 'live',
    timestamp: '2026-10-14T10:45:06Z',
    builds: [{ major: 241, minor: 0 }],
    ...(containerCompressions ? { containerCompressions } : {}),
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Runs initialization up to the first container decode and reports whether bzip2 was loaded. */
  async function loadsBzip2(info: CacheInfo | undefined): Promise<boolean> {
    const initWasm = vi.spyOn(Bzip2, 'initWasm').mockResolvedValue();
    vi.mocked(CacheSystem.fromMap).mockImplementationOnce(() => {
      throw new Error('stopped at the first decode');
    });
    const manager = new CacheManager({} as CacheStorage, {} as OpenRS2Client);
    const internals = manager as unknown as {
      cacheInfo?: CacheInfo;
      initializeCacheSystem(files: Map<string, ArrayBuffer>): Promise<void>;
    };
    internals.cacheInfo = info;

    await expect(internals.initializeCacheSystem(new Map())).rejects.toThrow('stopped at the first decode');
    return initWasm.mock.calls.length > 0;
  }

  it('never loads bzip2 for the gzip-only production mirror', async () => {
    expect(await loadsBzip2(cacheInfo(['none', 'gzip']))).toBe(false);
  });

  it('loads bzip2 before decoding the full upstream cache, whose listing declares no compressions', async () => {
    expect(await loadsBzip2(cacheInfo())).toBe(true);
    expect(await loadsBzip2(undefined)).toBe(true);
  });

  // The decoder ships so an artifact or manifest without `containerCompressions` loads.
  it('loads bzip2 for a mirror manifest without containerCompressions', async () => {
    expect(await loadsBzip2({ ...cacheInfo(), diskZipSha256: 'older-deploy' })).toBe(true);
  });

  it('loads bzip2 for a mirror that lists it', async () => {
    expect(await loadsBzip2(cacheInfo(['bzip2', 'gzip']))).toBe(true);
  });
});
