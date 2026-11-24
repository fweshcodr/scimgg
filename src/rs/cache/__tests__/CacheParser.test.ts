import { describe, expect, it } from 'vitest';
import { ByteBuffer } from '../../io/ByteBuffer';
import { CacheFiles, DAT2_FILE_NAME, INDEX_FILE_PREFIX, META_FILE_NAME } from '../CacheFiles';
import { CacheIndexDat2 } from '../CacheIndex';
import { CacheSystem } from '../CacheSystem';
import { ReferenceTable } from '../ref/ReferenceTable';
import { MemoryStore } from '../store/MemoryStore';
import { SectorCluster } from '../store/SectorCluster';

describe('CacheParser', () => {
  describe('CacheFiles', () => {
    it('should create CacheFiles from map', () => {
      const files = createMinimalCacheFiles();
      const cacheFiles = CacheFiles.fromMap(files);

      expect(cacheFiles.hasDataFile()).toBe(true);
      expect(cacheFiles.isDat2()).toBe(true);
    });

    it('should detect dat2 format', () => {
      const files = new Map<string, ArrayBuffer>();
      files.set(DAT2_FILE_NAME, new ArrayBuffer(1024));
      files.set(META_FILE_NAME, new ArrayBuffer(SectorCluster.SIZE * 5));

      const cacheFiles = CacheFiles.fromMap(files);

      expect(cacheFiles.isDat2()).toBe(true);
      expect(cacheFiles.getIndexCount()).toBe(5);
    });

    it('should count indices from meta file', () => {
      const files = new Map<string, ArrayBuffer>();
      files.set(DAT2_FILE_NAME, new ArrayBuffer(1024));
      files.set(META_FILE_NAME, new ArrayBuffer(SectorCluster.SIZE * 25));

      const cacheFiles = CacheFiles.fromMap(files);

      expect(cacheFiles.getIndexCount()).toBe(25);
    });
  });

  describe('MemoryStore', () => {
    it('should create from files map', () => {
      const files = createMinimalCacheFiles();
      const store = MemoryStore.fromFiles(files);

      expect(store.dataFile).toBeDefined();
      expect(store.metaFile).toBeDefined();
    });

    it('should filter indices when indicesToLoad is provided', () => {
      const files = createMinimalCacheFiles();
      const store = MemoryStore.fromFiles(files, [0, 2]);

      expect(store.indexFiles[0]).toBeDefined();
      expect(store.indexFiles[1]).toBeUndefined();
      expect(store.indexFiles[2]).toBeDefined();
    });
  });

  describe('SectorCluster', () => {
    it('should decode sector cluster', () => {
      const buffer = new ArrayBuffer(SectorCluster.SIZE);
      const view = new DataView(buffer);
      view.setUint8(0, 0x00);
      view.setUint8(1, 0x01);
      view.setUint8(2, 0x00);
      view.setUint8(3, 0x00);
      view.setUint8(4, 0x00);
      view.setUint8(5, 0x05);

      const byteBuffer = new ByteBuffer(new Int8Array(buffer));
      const cluster = SectorCluster.decode(byteBuffer);

      expect(cluster.size).toBe(256);
      expect(cluster.sector).toBe(5);
    });
  });

  describe('ByteBuffer', () => {
    it('should read unsigned bytes', () => {
      const data = new Int8Array([0xff, 0x80, 0x00, 0x7f]);
      const buffer = new ByteBuffer(data);

      expect(buffer.readUnsignedByte()).toBe(255);
      expect(buffer.readUnsignedByte()).toBe(128);
      expect(buffer.readUnsignedByte()).toBe(0);
      expect(buffer.readUnsignedByte()).toBe(127);
    });

    it('should read medium (3 bytes)', () => {
      const data = new Int8Array([0x01, 0x02, 0x03]);
      const buffer = new ByteBuffer(data);

      expect(buffer.readMedium()).toBe(0x010203);
    });

    it('should read int (4 bytes)', () => {
      const data = new Int8Array([0x01, 0x02, 0x03, 0x04]);
      const buffer = new ByteBuffer(data);

      expect(buffer.readInt()).toBe(0x01020304);
    });

    it('should read string', () => {
      const str = 'hello';
      const data = new Int8Array([...str.split('').map((c) => c.charCodeAt(0)), 0]);
      const buffer = new ByteBuffer(data);

      expect(buffer.readString()).toBe('hello');
    });
  });

  describe('CacheIndexDat2', () => {
    it('names the index and archive when a trimmed-away archive reads back empty', () => {
      // A zeroed idx entry is how the production trim leaves an untraced archive.
      const store = MemoryStore.fromFiles(createMinimalCacheFiles());
      const modelIndex = new CacheIndexDat2(7, ReferenceTable.fromArchiveCount(10), store);

      expect(() => modelIndex.getFile(3, 0)).toThrow('Empty container 7:3');
    });

    // The production mirror is gzip-only and never loads bzip2, so one left behind must say which.
    it('names the archive when a bzip2 container is reached without the bzip2 decoder', () => {
      const store = storeWithOneContainer(7, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0x31]);
      const modelIndex = new CacheIndexDat2(7, ReferenceTable.fromArchiveCount(1), store);

      expect(() => modelIndex.getFile(0, 0)).toThrow(
        expect.objectContaining({
          name: 'Bzip2UnavailableError',
          message: expect.stringContaining('Cache archive 7:0 is bzip2-compressed'),
        }),
      );
    });

    it('names the reference table when it is bzip2 and the decoder is not loaded', () => {
      const store = storeWithOneContainer(255, [1, 0, 0, 0, 1, 0, 0, 0, 1, 0x31]);

      expect(() => CacheIndexDat2.fromStore(0, store)).toThrow(
        'Failed to decode index: 0 (Cache archive 255:0 is bzip2-compressed',
      );
    });
  });

  describe('CacheSystem', () => {
    it('should throw for legacy cache format', () => {
      const files = createMinimalCacheFiles();

      expect(() => CacheSystem.fromMap('legacy', files)).toThrow('Legacy cache format not supported');
    });
  });
});

/** A store whose only container is archive 0 of `indexId`. */
function storeWithOneContainer(indexId: number, container: readonly number[]): MemoryStore {
  const dataFile = new ArrayBuffer(528 + container.length);
  new DataView(dataFile).setUint8(527, indexId);
  new Uint8Array(dataFile, 528).set(container);
  const indexFile = new ArrayBuffer(6);
  new DataView(indexFile).setUint16(1, container.length);
  new DataView(indexFile).setUint8(5, 1);
  const indexFiles: ArrayBuffer[] = [];
  if (indexId !== 255) indexFiles[indexId] = indexFile;
  return new MemoryStore(dataFile, indexFiles, indexId === 255 ? indexFile : new ArrayBuffer(0));
}

function createMinimalCacheFiles(): Map<string, ArrayBuffer> {
  const files = new Map<string, ArrayBuffer>();

  files.set(DAT2_FILE_NAME, new ArrayBuffer(1024 * 100));
  files.set(META_FILE_NAME, new ArrayBuffer(SectorCluster.SIZE * 25));

  for (let i = 0; i < 25; i++) {
    files.set(INDEX_FILE_PREFIX + i, new ArrayBuffer(SectorCluster.SIZE * 10));
  }

  return files;
}
