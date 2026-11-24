import { ByteBuffer } from '../../io/ByteBuffer';
import type { ApiType } from '../ApiType';
import { DAT_FILE_NAME, DAT2_FILE_NAME, INDEX_FILE_PREFIX, META_FILE_NAME } from '../CacheFiles';
import type { CacheStore } from './CacheStore';
import { Sector } from './Sector';
import { SectorCluster } from './SectorCluster';

export const META_INDEX_ID = 255;

const IS_BROWSER_DEV =
  typeof window !== 'undefined' &&
  typeof import.meta !== 'undefined' &&
  (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

const warnedMissingArchives = new Set<string>();

function warnMissingArchive(indexId: number, archiveId: number): void {
  const key = `${indexId}:${archiveId}`;
  if (warnedMissingArchives.has(key)) return;
  warnedMissingArchives.add(key);
  console.error(
    `[cache] Missing archive: indexId=${indexId} archiveId=${archiveId}. ` +
      `The build-time trim (scripts/trim-cache.ts) did not include this archive, ` +
      `so something at runtime is reading an id the static scanner did not discover. ` +
      `Declare it as a *_NPC_ID / *_SPOTANIM_ID / *_SPRITE_ID / *_SEQ_ID / *_ITEM_ID ` +
      `constant, or as an inline npcTypeId: / spotAnimId: / itemId: literal in src/, ` +
      `then run \`npx tsx scripts/trim-cache.ts --force\`. ` +
      `(See scripts/discoverCacheUsage.ts for the convention contract.)`,
  );
}

export class MemoryStore implements CacheStore<ApiType.SYNC> {
  static fromFiles(files: Map<string, ArrayBuffer>, indicesToLoad: number[] = []): MemoryStore {
    const indexFiles: ArrayBuffer[] = [];
    const indicesSet = new Set(indicesToLoad);
    for (const [name, data] of files.entries()) {
      if (name !== META_FILE_NAME && name.startsWith(INDEX_FILE_PREFIX)) {
        const indexId = parseInt(name.slice(INDEX_FILE_PREFIX.length), 10);
        if (indicesSet.size === 0 || indicesSet.has(indexId)) {
          indexFiles[indexId] = data;
        }
      }
    }

    const dataFile = files.get(DAT2_FILE_NAME) || files.get(DAT_FILE_NAME);
    if (!dataFile) {
      throw new Error('main_file_cache data file not found');
    }
    const metaFile = files.get(META_FILE_NAME);
    return new MemoryStore(dataFile, indexFiles, metaFile);
  }

  constructor(
    readonly dataFile: ArrayBuffer,
    readonly indexFiles: (ArrayBuffer | undefined)[],
    readonly metaFile?: ArrayBuffer,
  ) {}

  getIndexFile(indexId: number): ArrayBuffer | undefined {
    if (indexId === META_INDEX_ID) {
      return this.metaFile;
    }
    return this.indexFiles[indexId];
  }

  getSectorIndexId(indexId: number): number {
    if (this.metaFile) {
      return indexId;
    }
    return indexId + 1;
  }

  read(indexId: number, archiveId: number): Int8Array {
    if (indexId < 0) {
      throw new Error('Index id cannot be lower than 0');
    }
    const indexFile = this.getIndexFile(indexId);
    if (!indexFile) {
      throw new Error(`Index ${indexId} not found`);
    }

    const sectorIndexId = this.getSectorIndexId(indexId);

    const clusterPtr = archiveId * SectorCluster.SIZE;
    if (clusterPtr < 0 || clusterPtr + SectorCluster.SIZE > indexFile.byteLength) {
      throw new Error(
        `Invalid ptr: ${clusterPtr}, fileSize: ${indexFile.byteLength}, indexId: ${indexId}, archiveId: ${archiveId}`,
      );
    }

    const extended = archiveId > 65535;

    const sectorClusterBuf = new ByteBuffer(new Int8Array(indexFile, clusterPtr, SectorCluster.SIZE));
    const sectorCluster = SectorCluster.decode(sectorClusterBuf);

    if (IS_BROWSER_DEV && sectorCluster.size === 0 && sectorCluster.sector === 0) {
      warnMissingArchive(indexId, archiveId);
    }

    const data = new Int8Array(sectorCluster.size);
    let chunk = 0;
    let remaining = sectorCluster.size;
    let sectorPtr = sectorCluster.sector * Sector.SIZE;

    const sectorBuffer = new ByteBuffer(0);
    const sector = new Sector();

    while (remaining > 0) {
      const headerSize = extended ? Sector.EXTENDED_HEADER_SIZE : Sector.HEADER_SIZE;
      const dataSize = extended ? Sector.EXTENDED_DATA_SIZE : Sector.DATA_SIZE;

      const actualDataSize = Math.min(dataSize, remaining);

      sectorBuffer._data = new Int8Array(this.dataFile, sectorPtr, headerSize + actualDataSize);
      sectorBuffer.offset = 0;

      if (extended) {
        Sector.decodeExtended(sector, sectorBuffer, actualDataSize);
      } else {
        Sector.decode(sector, sectorBuffer, actualDataSize);
      }
      if (remaining > dataSize) {
        data.set(sector.data, sectorCluster.size - remaining);

        if (sector.indexId !== sectorIndexId) {
          throw new Error(`Sector index id mismatch. expected: ${sectorIndexId} got: ${sector.indexId}`);
        }

        if (sector.archiveId !== archiveId) {
          throw new Error(`Sector archive id mismatch. expected: ${archiveId} got: ${sector.archiveId}`);
        }

        if (sector.chunk !== chunk) {
          throw new Error('Sector chunk mismatch');
        }

        chunk++;

        sectorPtr = sector.nextSector * Sector.SIZE;
      } else {
        data.set(sector.data.subarray(0, remaining), sectorCluster.size - remaining);
      }
      remaining -= dataSize;
    }

    return data;
  }
}
