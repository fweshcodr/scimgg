import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type CacheMeta, CacheStorage } from '../CacheStorage';

describe('CacheStorage', () => {
  let storage: CacheStorage;

  beforeEach(() => {
    storage = new CacheStorage();
  });

  afterEach(async () => {
    await storage.close();
    indexedDB.deleteDatabase('osrs-yama-cache');
  });

  describe('storeCacheFile and getCacheFile', () => {
    it('should store and retrieve a small cache file', async () => {
      const fileName = 'test.dat';
      const data = new ArrayBuffer(1024);
      const view = new Uint8Array(data);
      view[0] = 0xab;
      view[1] = 0xcd;
      view[1023] = 0xef;

      await storage.storeCacheFile(fileName, data);

      const retrieved = await storage.getCacheFile(fileName);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.byteLength).toBe(1024);

      const retrievedView = new Uint8Array(retrieved!);
      expect(retrievedView[0]).toBe(0xab);
      expect(retrievedView[1]).toBe(0xcd);
      expect(retrievedView[1023]).toBe(0xef);
    });

    it('should store and retrieve a 10 MB file with byte verification', async () => {
      const fileName = 'large_file.dat2';
      const sizeBytes = 10 * 1024 * 1024;
      const data = new ArrayBuffer(sizeBytes);
      const view = new Uint8Array(data);

      view[0] = 0x01;
      view[1] = 0x02;
      view[sizeBytes - 2] = 0xfe;
      view[sizeBytes - 1] = 0xff;

      for (let i = 1; i < 1000; i++) {
        view[i * 1000] = i % 256;
      }

      await storage.storeCacheFile(fileName, data);

      const retrieved = await storage.getCacheFile(fileName);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.byteLength).toBe(sizeBytes);

      const retrievedView = new Uint8Array(retrieved!);
      expect(retrievedView[0]).toBe(0x01);
      expect(retrievedView[1]).toBe(0x02);
      expect(retrievedView[sizeBytes - 2]).toBe(0xfe);
      expect(retrievedView[sizeBytes - 1]).toBe(0xff);

      for (let i = 1; i < 1000; i++) {
        expect(retrievedView[i * 1000]).toBe(i % 256);
      }
    });

    it('should return null for non-existent file', async () => {
      const retrieved = await storage.getCacheFile('nonexistent.dat');
      expect(retrieved).toBeNull();
    });

    it('should overwrite existing file with same name', async () => {
      const fileName = 'overwrite.dat';
      const data1 = new ArrayBuffer(100);
      const view1 = new Uint8Array(data1);
      view1[0] = 0x11;

      await storage.storeCacheFile(fileName, data1);

      const data2 = new ArrayBuffer(200);
      const view2 = new Uint8Array(data2);
      view2[0] = 0x22;

      await storage.storeCacheFile(fileName, data2);

      const retrieved = await storage.getCacheFile(fileName);
      expect(retrieved!.byteLength).toBe(200);
      const retrievedView = new Uint8Array(retrieved!);
      expect(retrievedView[0]).toBe(0x22);
    });
  });

  describe('hasCacheFile', () => {
    it('should return false for non-existent file', async () => {
      const exists = await storage.hasCacheFile('nonexistent.dat');
      expect(exists).toBe(false);
    });

    it('should return true after storing a file', async () => {
      const fileName = 'exists.dat';
      const data = new ArrayBuffer(100);

      await storage.storeCacheFile(fileName, data);

      const exists = await storage.hasCacheFile(fileName);
      expect(exists).toBe(true);
    });

    it('should return true immediately after storage', async () => {
      const fileName = 'immediate.dat';
      const data = new ArrayBuffer(100);

      await storage.storeCacheFile(fileName, data);
      const exists = await storage.hasCacheFile(fileName);

      expect(exists).toBe(true);
    });
  });

  describe('quota exceeded handling', () => {
    it('should handle quota exceeded errors gracefully', async () => {
      const fileName = 'quota_test.dat';
      const data = new ArrayBuffer(1024);

      try {
        await storage.storeCacheFile(fileName, data);
        expect(true).toBe(true);
      } catch (error) {
        if (error instanceof Error && error.message.includes('quota')) {
          expect(error.message).toMatch(/quota/i);
        } else {
          throw error;
        }
      }
    });
  });

  describe('cache metadata', () => {
    it('should store and retrieve cache metadata', async () => {
      const meta: CacheMeta = {
        cacheId: 2258,
        buildMajor: 232,
        buildMinor: 0,
        fetchedAt: Date.now(),
        sourceUrl: 'https://archive.openrs2.org/caches/2258/disk.zip',
        manifestHash: 'sha256:test123',
      };

      await storage.storeCacheMeta(meta);

      const retrieved = await storage.getCacheMeta(2258);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.cacheId).toBe(2258);
      expect(retrieved!.buildMajor).toBe(232);
      expect(retrieved!.buildMinor).toBe(0);
      expect(retrieved!.sourceUrl).toBe('https://archive.openrs2.org/caches/2258/disk.zip');
      expect(retrieved!.manifestHash).toBe('sha256:test123');
    });

    it('should return null for non-existent cache metadata', async () => {
      const retrieved = await storage.getCacheMeta(9999);
      expect(retrieved).toBeNull();
    });

    it('should overwrite existing metadata with same cacheId', async () => {
      const meta1: CacheMeta = {
        cacheId: 2258,
        buildMajor: 232,
        buildMinor: 0,
        fetchedAt: 1000,
        sourceUrl: 'url1',
        manifestHash: 'hash1',
      };

      await storage.storeCacheMeta(meta1);

      const meta2: CacheMeta = {
        cacheId: 2258,
        buildMajor: 233,
        buildMinor: 1,
        fetchedAt: 2000,
        sourceUrl: 'url2',
        manifestHash: 'hash2',
      };

      await storage.storeCacheMeta(meta2);

      const retrieved = await storage.getCacheMeta(2258);
      expect(retrieved!.buildMajor).toBe(233);
      expect(retrieved!.buildMinor).toBe(1);
      expect(retrieved!.sourceUrl).toBe('url2');
    });
  });

  describe('parsed data storage', () => {
    it('should store and retrieve parsed data', async () => {
      const parsedData = {
        name: 'TzKal-Zuk',
        models: [1, 2, 3],
        combatLevel: 1400,
      };

      await storage.storeParsed(2258, 'npctype', 14176, parsedData);

      const retrieved = await storage.getParsed(2258, 'npctype', 14176);
      expect(retrieved).not.toBeNull();
      expect(retrieved.name).toBe('TzKal-Zuk');
      expect(retrieved.models).toEqual([1, 2, 3]);
      expect(retrieved.combatLevel).toBe(1400);
    });

    it('should return null for non-existent parsed data', async () => {
      const retrieved = await storage.getParsed(2258, 'npctype', 99999);
      expect(retrieved).toBeNull();
    });

    it('should handle different kinds with same id', async () => {
      await storage.storeParsed(2258, 'npctype', 100, { type: 'npc' });
      await storage.storeParsed(2258, 'texture', 100, { type: 'texture' });

      const npc = await storage.getParsed(2258, 'npctype', 100);
      const texture = await storage.getParsed(2258, 'texture', 100);

      expect(npc.type).toBe('npc');
      expect(texture.type).toBe('texture');
    });

    it('should handle different cache IDs with same kind and id', async () => {
      await storage.storeParsed(2258, 'npctype', 100, { cache: 2258 });
      await storage.storeParsed(2259, 'npctype', 100, { cache: 2259 });

      const data1 = await storage.getParsed(2258, 'npctype', 100);
      const data2 = await storage.getParsed(2259, 'npctype', 100);

      expect(data1.cache).toBe(2258);
      expect(data2.cache).toBe(2259);
    });
  });

  describe('deleteCache', () => {
    it('should delete all data for a specific cache ID', async () => {
      const meta: CacheMeta = {
        cacheId: 2258,
        buildMajor: 232,
        buildMinor: 0,
        fetchedAt: Date.now(),
        sourceUrl: 'https://test.com',
        manifestHash: 'hash',
      };

      await storage.storeCacheMeta(meta);
      await storage.storeCacheFile('test.dat', new ArrayBuffer(100), 2258);
      await storage.storeParsed(2258, 'npctype', 100, { data: 'test' });

      await storage.deleteCache(2258);

      const retrievedMeta = await storage.getCacheMeta(2258);
      const retrievedFile = await storage.getCacheFile('test.dat');
      const retrievedParsed = await storage.getParsed(2258, 'npctype', 100);

      expect(retrievedMeta).toBeNull();
      expect(retrievedFile).toBeNull();
      expect(retrievedParsed).toBeNull();
    });

    it('should not affect other cache IDs', async () => {
      await storage.storeCacheMeta({
        cacheId: 2258,
        buildMajor: 232,
        buildMinor: 0,
        fetchedAt: Date.now(),
        sourceUrl: 'url1',
        manifestHash: 'hash1',
      });

      await storage.storeCacheMeta({
        cacheId: 2259,
        buildMajor: 233,
        buildMinor: 0,
        fetchedAt: Date.now(),
        sourceUrl: 'url2',
        manifestHash: 'hash2',
      });

      await storage.storeCacheFile('file1.dat', new ArrayBuffer(100), 2258);
      await storage.storeCacheFile('file2.dat', new ArrayBuffer(100), 2259);

      await storage.deleteCache(2258);

      const meta2259 = await storage.getCacheMeta(2259);
      const file2259 = await storage.getCacheFile('file2.dat', 2259);

      expect(meta2259).not.toBeNull();
      expect(file2259).not.toBeNull();
    });

    it('removes only the given cache when its neighbors share file names and parsed keys', async () => {
      for (const cacheId of [2257, 2258, 2259]) {
        await storage.storeCacheMeta({
          cacheId,
          buildMajor: 232,
          buildMinor: 0,
          fetchedAt: 0,
          sourceUrl: `url${cacheId}`,
          manifestHash: `hash${cacheId}`,
        });
        await storage.storeCacheFile('main_file_cache.dat2', new ArrayBuffer(8), cacheId);
        await storage.storeCacheFile('main_file_cache.idx255', new ArrayBuffer(6), cacheId);
        await storage.storeParsed(cacheId, 'npctype', 1, { cacheId });
      }

      await storage.deleteCache(2258);

      expect(await storage.getCacheMeta(2258)).toBeNull();
      expect(await storage.getCacheFile('main_file_cache.dat2', 2258)).toBeNull();
      expect(await storage.getCacheFile('main_file_cache.idx255', 2258)).toBeNull();
      expect(await storage.getParsed(2258, 'npctype', 1)).toBeNull();
      for (const cacheId of [2257, 2259]) {
        expect(await storage.getCacheMeta(cacheId)).not.toBeNull();
        expect(await storage.getCacheFile('main_file_cache.dat2', cacheId)).not.toBeNull();
        expect(await storage.getCacheFile('main_file_cache.idx255', cacheId)).not.toBeNull();
        expect(await storage.getParsed(cacheId, 'npctype', 1)).toEqual({ cacheId });
      }
    });
  });

  describe('pruning and replacement', () => {
    const metaFor = (cacheId: number): CacheMeta => ({
      cacheId,
      buildMajor: 241,
      buildMinor: 0,
      fetchedAt: 0,
      sourceUrl: `url${cacheId}`,
      manifestHash: `hash${cacheId}`,
    });

    async function storeCopy(cacheId: number): Promise<void> {
      await storage.storeCacheMeta(metaFor(cacheId));
      await storage.storeCacheFile('main_file_cache.dat2', new ArrayBuffer(8), cacheId);
      await storage.storeCacheFile(`xtea_keys_${cacheId}.json`, new ArrayBuffer(4), cacheId);
      await storage.storeParsed(cacheId, 'npctype', 1, { cacheId });
    }

    async function expectCopy(cacheId: number, present: boolean): Promise<void> {
      const check = (value: unknown) => (present ? expect(value).not.toBeNull() : expect(value).toBeNull());
      check(await storage.getCacheMeta(cacheId));
      check(await storage.getCacheFile('main_file_cache.dat2', cacheId));
      check(await storage.getCacheFile(`xtea_keys_${cacheId}.json`, cacheId));
      check(await storage.getParsed(cacheId, 'npctype', 1));
    }

    it('deleteOlderCaches removes lower cache ids and keeps the installed and newer ones', async () => {
      for (const cacheId of [2720, 2740, 2760]) await storeCopy(cacheId);
      // An interrupted install leaves blobs without any meta record.
      await storage.storeCacheFile('main_file_cache.idx255', new ArrayBuffer(6), 2700);

      await storage.deleteOlderCaches(2740);

      await expectCopy(2720, false);
      expect(await storage.getCacheFile('main_file_cache.idx255', 2700)).toBeNull();
      await expectCopy(2740, true);
      await expectCopy(2760, true);
    });

    it("deleteCacheMeta drops only the completion marker, keeping that id's files and XTEA keys", async () => {
      await storeCopy(2740);

      await storage.deleteCacheMeta(2740);

      expect(await storage.getCacheMeta(2740)).toBeNull();
      expect(await storage.getCacheFile('main_file_cache.dat2', 2740)).not.toBeNull();
      expect(await storage.getCacheFile('xtea_keys_2740.json', 2740)).not.toBeNull();
    });
  });

  describe('multiple cache IDs', () => {
    it('should handle files with same name but different cache IDs', async () => {
      const data1 = new ArrayBuffer(100);
      const view1 = new Uint8Array(data1);
      view1[0] = 0x01;

      const data2 = new ArrayBuffer(200);
      const view2 = new Uint8Array(data2);
      view2[0] = 0x02;

      await storage.storeCacheFile('main_file_cache.dat2', data1, 2258);
      await storage.storeCacheFile('main_file_cache.dat2', data2, 2259);

      const retrieved1 = await storage.getCacheFile('main_file_cache.dat2', 2258);
      const retrieved2 = await storage.getCacheFile('main_file_cache.dat2', 2259);

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();

      const retrievedView1 = new Uint8Array(retrieved1!);
      const retrievedView2 = new Uint8Array(retrieved2!);
      expect(retrievedView1[0]).toBe(0x01);
      expect(retrievedView2[0]).toBe(0x02);
    });
  });

  describe('connection invalidation', () => {
    it('reopens after the browser closes the connection out from under it', async () => {
      await storage.storeCacheFile('before_close.dat', new ArrayBuffer(8));

      const open = (storage as unknown as { openDatabase(): Promise<IDBDatabase> }).openDatabase.bind(storage);
      const db = await open();
      const onclose = db.onclose;
      // Asserted, not optional-called: `db.onclose?.()` on an unassigned handler is a
      // silent no-op, and the store below would then still succeed through the
      // original connection — the test would pass with the production fix deleted.
      expect(onclose).toBeTypeOf('function');

      db.close();
      // Invoked directly rather than through dispatchEvent, which fake-indexeddb
      // only accepts for its own internal FakeEvent instances.
      onclose?.call(db, new Event('close'));

      expect(await open()).not.toBe(db);
      await expect(storage.storeCacheFile('after_close.dat', new ArrayBuffer(8))).resolves.toBeUndefined();
      expect(await storage.getCacheFile('before_close.dat')).not.toBeNull();
    });

    it('reopens after another tab triggers a versionchange', async () => {
      const open = (storage as unknown as { openDatabase(): Promise<IDBDatabase> }).openDatabase.bind(storage);
      const db = await open();
      const onversionchange = db.onversionchange;
      expect(onversionchange).toBeTypeOf('function');

      onversionchange?.call(db, new IDBVersionChangeEvent('versionchange'));

      expect(await open()).not.toBe(db);
      await expect(storage.storeCacheFile('after_versionchange.dat', new ArrayBuffer(8))).resolves.toBeUndefined();
    });

    it('does not let a stale handler evict the connection that replaced it', async () => {
      const open = (storage as unknown as { openDatabase(): Promise<IDBDatabase> }).openDatabase.bind(storage);
      const first = await open();
      const staleOnClose = first.onclose;

      first.close();
      staleOnClose?.call(first, new Event('close'));
      const second = await open();
      staleOnClose?.call(first, new Event('close'));

      expect(await open()).toBe(second);
      await expect(storage.storeCacheFile('after_stale.dat', new ArrayBuffer(8))).resolves.toBeUndefined();
    });
  });

  describe('database initialization', () => {
    it('should create database with correct schema', async () => {
      await storage.storeCacheFile('init_test.dat', new ArrayBuffer(10));

      const dbRequest = indexedDB.open('osrs-yama-cache', 2);

      await new Promise<void>((resolve, reject) => {
        dbRequest.onsuccess = () => {
          const db = dbRequest.result;

          expect(db.objectStoreNames.contains('meta')).toBe(true);
          expect(db.objectStoreNames.contains('blobs')).toBe(true);
          expect(db.objectStoreNames.contains('parsed')).toBe(true);

          const tx = db.transaction(['meta', 'blobs', 'parsed'], 'readonly');
          expect(tx.objectStore('meta').keyPath).toBe('cacheId');
          expect(tx.objectStore('blobs').keyPath).toEqual(['cacheId', 'path']);
          expect(tx.objectStore('parsed').keyPath).toEqual(['cacheId', 'kind', 'id']);

          db.close();
          resolve();
        };

        dbRequest.onerror = () => reject(dbRequest.error);
      });
    });
  });
});
