import type { CacheStorage } from '../../cache/CacheStorage';
import { SectorCluster } from './store/SectorCluster';

export const DAT_FILE_NAME = 'main_file_cache.dat';
export const DAT2_FILE_NAME = 'main_file_cache.dat2';
export const INDEX_FILE_PREFIX = 'main_file_cache.idx';
export const META_FILE_NAME = 'main_file_cache.idx255';
export const DAT_INDEX_COUNT = 5;

export class CacheFiles {
  static async loadFromStorage(
    storage: CacheStorage,
    indicesToLoad: number[] = [],
    cacheId: number = 0,
  ): Promise<CacheFiles> {
    const files = new Map<string, ArrayBuffer>();

    const dataFile =
      (await storage.getCacheFile(DAT2_FILE_NAME, cacheId)) ?? (await storage.getCacheFile(DAT_FILE_NAME, cacheId));

    if (!dataFile) {
      throw new Error('main_file_cache data file not found in storage');
    }

    const isDat2 = await storage.hasCacheFile(DAT2_FILE_NAME, cacheId);
    files.set(isDat2 ? DAT2_FILE_NAME : DAT_FILE_NAME, dataFile);

    const metaFile = await storage.getCacheFile(META_FILE_NAME, cacheId);
    if (metaFile) {
      files.set(META_FILE_NAME, metaFile);

      const indexCount = metaFile.byteLength / SectorCluster.SIZE;
      const indicesToCheck = indicesToLoad.length > 0 ? indicesToLoad : Array.from({ length: indexCount }, (_, i) => i);

      for (const indexId of indicesToCheck) {
        const indexFileName = INDEX_FILE_PREFIX + indexId;
        const indexFile = await storage.getCacheFile(indexFileName, cacheId);
        if (indexFile) {
          files.set(indexFileName, indexFile);
        }
      }
    } else {
      for (let i = 0; i < DAT_INDEX_COUNT; i++) {
        const indexFileName = INDEX_FILE_PREFIX + i;
        const indexFile = await storage.getCacheFile(indexFileName, cacheId);
        if (indexFile) {
          files.set(indexFileName, indexFile);
        }
      }
    }

    return new CacheFiles(files);
  }

  static fromMap(files: Map<string, ArrayBuffer>): CacheFiles {
    return new CacheFiles(files);
  }

  constructor(readonly files: Map<string, ArrayBuffer>) {}

  getIndexCount(): number {
    const metaFile = this.files.get(META_FILE_NAME);
    if (metaFile) {
      return metaFile.byteLength / SectorCluster.SIZE;
    }

    let count = 0;
    for (const name of this.files.keys()) {
      if (name.startsWith(INDEX_FILE_PREFIX) && name !== META_FILE_NAME) {
        count++;
      }
    }
    return count;
  }

  hasDataFile(): boolean {
    return this.files.has(DAT2_FILE_NAME) || this.files.has(DAT_FILE_NAME);
  }

  isDat2(): boolean {
    return this.files.has(DAT2_FILE_NAME);
  }
}
