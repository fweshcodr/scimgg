import { profiler } from '../../util/Profiler';
import type { ApiType } from './ApiType';
import { CacheFiles } from './CacheFiles';
import { type CacheIndex, CacheIndexDat, CacheIndexDat2 } from './CacheIndex';
import type { CacheType } from './CacheType';
import { MemoryStore } from './store/MemoryStore';

export class CacheSystem<A extends ApiType = ApiType.SYNC> {
  static loadIndicesFromStore(cacheType: 'dat' | 'dat2', store: MemoryStore) {
    profiler.start('CacheSystem.loadIndicesFromStore');
    const result = store.indexFiles.map((indexFile, id) => {
      if (!indexFile) {
        return undefined;
      }
      if (cacheType === 'dat') {
        return CacheIndexDat.fromStore(id, store, indexFile);
      } else {
        return CacheIndexDat2.fromStore(id, store);
      }
    });
    profiler.end('CacheSystem.loadIndicesFromStore');
    return result;
  }

  static fromFiles(cacheType: CacheType, cacheFiles: CacheFiles, indicesToLoad: number[] = []): CacheSystem {
    profiler.start('CacheSystem.fromFiles');
    switch (cacheType) {
      case 'legacy':
        profiler.end('CacheSystem.fromFiles');
        throw new Error('Legacy cache format not supported');
      case 'dat':
      case 'dat2': {
        profiler.start('CacheSystem.MemoryStore.fromFiles');
        const store = MemoryStore.fromFiles(cacheFiles.files, indicesToLoad);
        profiler.end('CacheSystem.MemoryStore.fromFiles');
        const indices = CacheSystem.loadIndicesFromStore(cacheType, store);
        profiler.end('CacheSystem.fromFiles');
        return new CacheSystem(indices);
      }
    }
    profiler.end('CacheSystem.fromFiles');
    throw new Error('Not implemented');
  }

  static fromMap(cacheType: CacheType, files: Map<string, ArrayBuffer>, indicesToLoad: number[] = []): CacheSystem {
    profiler.start('CacheSystem.fromMap');
    const cacheFiles = CacheFiles.fromMap(files);
    const result = CacheSystem.fromFiles(cacheType, cacheFiles, indicesToLoad);
    profiler.end('CacheSystem.fromMap');
    return result;
  }

  constructor(readonly indices: (CacheIndex<A> | undefined)[]) {}

  indexExists(indexId: number): boolean {
    return !!this.indices[indexId];
  }

  getIndex(indexId: number): CacheIndex<A> {
    const index = this.indices[indexId];
    if (!index) {
      throw new Error(`Index not found: ${indexId}`);
    }
    return index;
  }

  getIndexCount(): number {
    return this.indices.filter(Boolean).length;
  }
}
