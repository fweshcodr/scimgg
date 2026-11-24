/**
 * IndexedDB wrapper for storing and retrieving OSRS cache files.
 */

import { log } from '../util/Logger';

const DB_NAME = 'osrs-yama-cache';
const DB_VERSION = 2;
let persistentStorageRequested = false;

export interface CacheMeta {
  cacheId: number;
  buildMajor: number;
  buildMinor: number;
  fetchedAt: number;
  sourceUrl: string;
  manifestHash: string;
}

export interface BlobEntry {
  path: string;
  cacheId: number;
  data: ArrayBuffer;
  size: number;
}

export interface ParsedEntry {
  cacheId: number;
  kind: string;
  id: number;
  data: any;
}

export class CacheStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;
  /**
   * Lets a connection's own close/versionchange handler tell whether the promise it
   * is trying to evict is still the current one. Without it, a handler firing after
   * a later reopen would drop a perfectly good connection.
   */
  private dbGeneration = 0;

  constructor() {
    this.requestPersistentStorage();
  }

  private async requestPersistentStorage(): Promise<void> {
    if (persistentStorageRequested) return;
    persistentStorageRequested = true;

    if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        if (!isPersisted) {
          log.debug('CacheStorage', 'Persistent storage not granted. Cache may be evicted under storage pressure.');
        }
      } catch (error) {
        log.warn('CacheStorage', 'Failed to request persistent storage:', error);
      }
    }
  }

  private openDatabase(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    const generation = ++this.dbGeneration;
    const invalidate = () => {
      if (this.dbGeneration === generation) this.dbPromise = null;
    };

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        invalidate();
        reject(new Error(`Failed to open database: ${request.error?.message}`));
      };

      // DB_VERSION is the only version this code opens, so an upgrade only ever starts from an
      // empty database and creates every store.
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        db.createObjectStore('meta', { keyPath: 'cacheId' });
        db.createObjectStore('blobs', { keyPath: ['cacheId', 'path'] });
        const parsedStore = db.createObjectStore('parsed', { keyPath: ['cacheId', 'kind', 'id'] });
        parsedStore.createIndex('byCacheId', 'cacheId', { unique: false });
      };

      request.onsuccess = () => {
        const db = request.result;
        // Nothing else drops this cached connection when the browser closes it out
        // from under us — another tab upgrading the version, the user clearing site
        // data, Safari reclaiming storage under pressure. Without these two handlers
        // the promise keeps resolving to a dead handle and every later transaction()
        // throws InvalidStateError for the rest of the session.
        db.onversionchange = () => {
          db.close();
          invalidate();
        };
        db.onclose = invalidate;
        resolve(db);
      };
    });

    this.dbPromise = this.dbPromise.catch((error) => {
      invalidate();
      throw error;
    });

    return this.dbPromise;
  }

  async storeCacheFile(name: string, data: ArrayBuffer, cacheId: number = 0): Promise<void> {
    try {
      const db = await this.openDatabase();

      return new Promise((resolve, reject) => {
        const transaction = db.transaction('blobs', 'readwrite');
        const store = transaction.objectStore('blobs');

        const entry: BlobEntry = {
          path: name,
          cacheId,
          data,
          size: data.byteLength,
        };

        const request = store.put(entry);

        request.onerror = () => {
          if (request.error?.name === 'QuotaExceededError') {
            reject(new Error(`Storage quota exceeded while storing ${name} (${data.byteLength} bytes)`));
          } else {
            reject(new Error(`Failed to store cache file: ${request.error?.message}`));
          }
        };

        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message}`));
        // A commit-time failure (quota exhausted on flush) aborts without any request
        // error, so without this the promise would never settle and the load would hang.
        transaction.onabort = () => reject(new Error(`Transaction aborted: ${transaction.error?.message}`));
      });
    } catch (error) {
      if (error instanceof Error && error.message.includes('quota')) {
        throw error;
      }
      throw new Error(`Failed to store cache file: ${error}`);
    }
  }

  async getCacheFile(name: string, cacheId: number = 0): Promise<ArrayBuffer | null> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blobs', 'readonly');
      const store = transaction.objectStore('blobs');
      const request = store.get([cacheId, name]);

      request.onerror = () => {
        reject(new Error(`Failed to retrieve cache file: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const entry = request.result as BlobEntry | undefined;
        resolve(entry ? entry.data : null);
      };
    });
  }

  /** Uses a single transaction for better performance. */
  async getCacheFilesParallel(
    names: string[],
    onProgress?: (completed: number, total: number) => void,
    cacheId: number = 0,
  ): Promise<Map<string, ArrayBuffer>> {
    const db = await this.openDatabase();
    const results = new Map<string, ArrayBuffer>();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blobs', 'readonly');
      const store = transaction.objectStore('blobs');

      let completed = 0;
      const total = names.length;

      for (const name of names) {
        const request = store.get([cacheId, name]);

        request.onerror = () => {
          reject(new Error(`Failed to retrieve cache file ${name}: ${request.error?.message}`));
        };

        request.onsuccess = () => {
          const entry = request.result as BlobEntry | undefined;
          if (entry) {
            results.set(name, entry.data);
          }
          completed++;
          if (onProgress) {
            onProgress(completed, total);
          }
          if (completed === total) {
            resolve(results);
          }
        };
      }

      if (names.length === 0) {
        resolve(results);
      }

      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message}`));
    });
  }

  async hasCacheFile(name: string, cacheId: number = 0): Promise<boolean> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('blobs', 'readonly');
      const store = transaction.objectStore('blobs');
      const request = store.getKey([cacheId, name]);

      request.onerror = () => {
        reject(new Error(`Failed to check cache file: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result !== undefined);
      };
    });
  }

  async storeCacheMeta(meta: CacheMeta): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('meta', 'readwrite');
      const store = transaction.objectStore('meta');
      const request = store.put(meta);

      request.onerror = () => {
        reject(new Error(`Failed to store cache metadata: ${request.error?.message}`));
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      transaction.onabort = () => reject(new Error(`Transaction aborted: ${transaction.error?.message}`));
    });
  }

  async getCacheMeta(cacheId: number): Promise<CacheMeta | null> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('meta', 'readonly');
      const store = transaction.objectStore('meta');
      const request = store.get(cacheId);

      request.onerror = () => {
        reject(new Error(`Failed to retrieve cache metadata: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result || null);
      };
    });
  }

  async storeParsed(cacheId: number, kind: string, id: number, data: any): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('parsed', 'readwrite');
      const store = transaction.objectStore('parsed');

      const entry: ParsedEntry = {
        cacheId,
        kind,
        id,
        data,
      };

      const request = store.put(entry);

      request.onerror = () => {
        reject(new Error(`Failed to store parsed data: ${request.error?.message}`));
      };

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      transaction.onabort = () => reject(new Error(`Transaction aborted: ${transaction.error?.message}`));
    });
  }

  async getParsed(cacheId: number, kind: string, id: number): Promise<any> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('parsed', 'readonly');
      const store = transaction.objectStore('parsed');
      const request = store.get([cacheId, kind, id]);

      request.onerror = () => {
        reject(new Error(`Failed to retrieve parsed data: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const entry = request.result as ParsedEntry | undefined;
        resolve(entry ? entry.data : null);
      };
    });
  }

  /**
   * Removes only the completion marker, so a reinstall of the same id overwrites its files
   * in place and keeps everything else stored under it (such as its XTEA keys).
   */
  async deleteCacheMeta(cacheId: number): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction('meta', 'readwrite');
      transaction.objectStore('meta').delete(cacheId);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to delete cache metadata: ${transaction.error?.message}`));
      transaction.onabort = () => reject(new Error(`Failed to delete cache metadata: ${transaction.error?.message}`));
    });
  }

  async deleteCache(cacheId: number): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['meta', 'blobs', 'parsed'], 'readwrite');

      transaction.objectStore('meta').delete(cacheId);
      // Array keys order element-wise and any array sorts above any string, so every
      // compound [cacheId, ...] key of this cache lies between [cacheId] and [cacheId, []].
      // A key range never reads the blobs' data back into memory.
      const thisCache = IDBKeyRange.bound([cacheId], [cacheId, []]);
      transaction.objectStore('blobs').delete(thisCache);
      transaction.objectStore('parsed').delete(thisCache);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to delete cache: ${transaction.error?.message}`));
      transaction.onabort = () => reject(new Error(`Failed to delete cache: ${transaction.error?.message}`));
    });
  }

  /**
   * Deletes everything stored under a cache id lower than `installedCacheId`, including
   * blobs left without meta by an interrupted install. Newer ids are kept: they may belong
   * to another tab or a later deploy.
   */
  async deleteOlderCaches(installedCacheId: number): Promise<void> {
    const db = await this.openDatabase();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['meta', 'blobs', 'parsed'], 'readwrite');
      transaction.objectStore('meta').delete(IDBKeyRange.upperBound(installedCacheId, true));
      // [installedCacheId] sorts below every [installedCacheId, ...] key (see deleteCache()).
      const olderCaches = IDBKeyRange.upperBound([installedCacheId], true);
      transaction.objectStore('blobs').delete(olderCaches);
      transaction.objectStore('parsed').delete(olderCaches);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(new Error(`Failed to delete old caches: ${transaction.error?.message}`));
      transaction.onabort = () => reject(new Error(`Failed to delete old caches: ${transaction.error?.message}`));
    });
  }

  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }
}
