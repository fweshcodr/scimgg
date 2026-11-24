import { log } from '../../util/Logger';
import { Bzip2UnavailableError } from '../compression/Bzip2';
import { ByteBuffer } from '../io/ByteBuffer';
import { StringUtil } from '../util/StringUtil';
import type { ApiReturnType, ApiType } from './ApiType';
import { Archive } from './Archive';
import type { ArchiveFile } from './ArchiveFile';
import { Container } from './Container';
import { IndexType } from './IndexType';
import type { ArchiveReference } from './ref/ArchiveReference';
import { ReferenceTable } from './ref/ReferenceTable';
import type { CacheStore } from './store/CacheStore';
import { SectorCluster } from './store/SectorCluster';

export abstract class CacheIndex<A extends ApiType = ApiType.SYNC> {
  static META_INDEX_ID = 255;

  constructor(
    readonly id: number,
    readonly table: ReferenceTable,
  ) {}

  getArchiveIds(): Int32Array {
    return this.table.archiveIds;
  }

  getArchiveCount(): number {
    return this.table.archiveCount;
  }

  getLastArchiveId(): number {
    return this.table.lastArchiveId;
  }

  getArchiveReference(archiveId: number): ArchiveReference | undefined {
    return this.table.getArchiveReference(archiveId);
  }

  getArchiveId(name: string): number {
    return this.table.getArchiveId(name) ?? -1;
  }

  getFileIds(archiveId: number): Int32Array | undefined {
    return this.getArchiveReference(archiveId)?.fileIds;
  }

  archiveExists(archiveId: number): boolean {
    return this.table.archiveExists(archiveId);
  }

  getFileCount(archiveId: number): number {
    return this.table.getArchiveReference(archiveId)?.fileCount ?? 0;
  }

  abstract getArchive(archiveId: number, key?: number[]): ApiReturnType<A, Archive>;

  abstract getFile(archiveId: number, fileId: number, key?: number[]): ApiReturnType<A, ArchiveFile | undefined>;

  getFileSmart(id: number, key?: number[]): ApiReturnType<A, ArchiveFile | undefined> {
    if (this.getArchiveCount() === 1) {
      return this.getFile(0, id, key);
    } else if (this.getFileCount(id) === 1) {
      return this.getFile(id, 0, key);
    }
    throw new Error('Invalid archive');
  }
}

export abstract class CacheStoreIndex<A extends ApiType> extends CacheIndex<A> {
  constructor(
    id: number,
    table: ReferenceTable,
    readonly store: CacheStore<A>,
  ) {
    super(id, table);
  }

  read(archiveId: number): ApiReturnType<A, Int8Array> {
    return this.store.read(this.id, archiveId);
  }
}
export abstract class CacheStoreIndexSync extends CacheStoreIndex<ApiType.SYNC> {
  override getFile(archiveId: number, fileId: number, key?: number[]): ArchiveFile | undefined {
    return this.getArchive(archiveId, key).getFile(fileId);
  }
}

export class CacheIndexDat extends CacheStoreIndexSync {
  static fromStore(id: number, store: CacheStore<ApiType.SYNC>, indexFile: ArrayBuffer): CacheIndexDat {
    const table = ReferenceTable.fromArchiveCount(indexFile.byteLength / SectorCluster.SIZE);
    return new CacheIndexDat(id, table, store);
  }

  override getArchive(id: number, _key?: number[]): Archive {
    const data = this.read(id);
    return Archive.decodeOld(id, data, this.id === IndexType.DAT.configs);
  }
}

/** `Container.decode`, naming the archive when it needs a bzip2 decoder that is not loaded. */
function decodeContainer(archive: string, data: Int8Array, key?: number[]): Container {
  try {
    return Container.decode(new ByteBuffer(data), key);
  } catch (e) {
    if (e instanceof Bzip2UnavailableError) {
      throw new Bzip2UnavailableError(`Cache archive ${archive} is bzip2-compressed: ${e.message}`);
    }
    throw e;
  }
}

function decodeTable(id: number, data: Int8Array): ReferenceTable {
  if (data.length) {
    const container = decodeContainer(`${CacheIndex.META_INDEX_ID}:${id}`, data);
    return ReferenceTable.decode(new ByteBuffer(container.data));
  }
  return ReferenceTable.INVALID_TABLE;
}

function decodeArchiveData<A extends ApiType>(
  index: CacheIndex<A>,
  id: number,
  data: Int8Array,
  key?: number[],
): Archive {
  const archiveRef = index.getArchiveReference(id);
  if (!archiveRef) {
    throw new Error(`Archive reference not found for: ${id}`);
  }
  // Production serves a trimmed cache whose untraced archives read back empty (scripts/trim-cache.ts).
  // Naming the archive is what makes an error report actionable; Container.decode cannot.
  if (data.length === 0) {
    throw new Error(`Empty container ${index.id}:${id}`);
  }
  const container = decodeContainer(`${index.id}:${id}`, data, key);
  return Archive.decode(
    id,
    archiveRef.lastFileId,
    archiveRef.fileCount,
    archiveRef.fileIds,
    archiveRef.fileNameHashes,
    new ByteBuffer(container.data),
  );
}

export class CacheIndexDat2 extends CacheStoreIndexSync {
  static fromStore(id: number, store: CacheStore<ApiType.SYNC>): CacheIndexDat2 {
    const data = store.read(CacheIndex.META_INDEX_ID, id);
    try {
      const table = decodeTable(id, data);
      return new CacheIndexDat2(id, table, store);
    } catch (e) {
      log.error('Cache', 'Failed to decode index table', id, data, e);
      throw new Error(`Failed to decode index: ${id}${e instanceof Bzip2UnavailableError ? ` (${e.message})` : ''}`);
    }
  }

  override getArchive(id: number, key?: number[] | undefined): Archive {
    const data = this.read(id);
    return decodeArchiveData(this, id, data, key);
  }
}

export class LegacyCacheIndex extends CacheIndex {
  constructor(
    readonly id: number,
    readonly archives: Archive[],
    readonly archiveNameHashes: Map<number, number> = new Map(),
  ) {
    super(id, ReferenceTable.INVALID_TABLE);
  }

  override getArchive(archiveId: number, _key?: number[]): Archive {
    return this.archives[archiveId];
  }

  override getArchiveId(name: string): number {
    return this.archiveNameHashes.get(StringUtil.hashOld(name)) ?? -1;
  }

  override getFile(archiveId: number, fileId: number, _key?: number[]): ArchiveFile | undefined {
    return this.archives[archiveId]?.getFile(fileId);
  }
}
