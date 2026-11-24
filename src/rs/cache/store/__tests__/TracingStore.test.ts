import { beforeEach, describe, expect, it } from 'vitest';

import { MemoryStore } from '../MemoryStore';
import { TracingStore } from '../TracingStore';

const SECTOR_SIZE = 520;
const HEADER_SIZE = 8;
const IDX_ENTRY_SIZE = 6;
const TEST_INDEX_ID = 7;

function writeMedium(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 16) & 0xff;
  buf[offset + 1] = (value >>> 8) & 0xff;
  buf[offset + 2] = value & 0xff;
}

function writeUint16BE(buf: Uint8Array, offset: number, value: number): void {
  buf[offset] = (value >>> 8) & 0xff;
  buf[offset + 1] = value & 0xff;
}

interface ArchiveSpec {
  archiveId: number;
  size: number;
  sector: number;
  payload: Uint8Array;
}

function buildIdx(
  archives: Array<{ archiveId: number; size: number; sector: number }>,
  totalArchives: number,
): ArrayBuffer {
  const buf = new Uint8Array(totalArchives * IDX_ENTRY_SIZE);
  for (const { archiveId, size, sector } of archives) {
    const offset = archiveId * IDX_ENTRY_SIZE;
    writeMedium(buf, offset, size);
    writeMedium(buf, offset + 3, sector);
  }
  return buf.buffer;
}

function buildDat2(archives: ArchiveSpec[], totalSectors: number): ArrayBuffer {
  const buf = new Uint8Array(totalSectors * SECTOR_SIZE);
  for (const { archiveId, sector, payload } of archives) {
    const offset = sector * SECTOR_SIZE;
    writeUint16BE(buf, offset, archiveId);
    writeUint16BE(buf, offset + 2, 0);
    writeMedium(buf, offset + 4, 0);
    buf[offset + 7] = TEST_INDEX_ID;
    buf.set(payload, offset + HEADER_SIZE);
  }
  return buf.buffer;
}

let store: MemoryStore;

beforeEach(() => {
  const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
  const dat2 = buildDat2([{ archiveId: 0, size: 4, sector: 1, payload }], 2);
  const idx = buildIdx(
    [
      { archiveId: 0, size: 4, sector: 1 },
      { archiveId: 5, size: 0, sector: 0 },
    ],
    6,
  );
  const indexFiles: (ArrayBuffer | undefined)[] = [];
  indexFiles[TEST_INDEX_ID] = idx;
  const metaFile = new ArrayBuffer(0);
  store = new MemoryStore(dat2, indexFiles, metaFile);
});

describe('TracingStore', () => {
  it('records every (indexId, archiveId) read', () => {
    const tracing = new TracingStore(store);

    tracing.read(TEST_INDEX_ID, 0);
    tracing.read(TEST_INDEX_ID, 5);

    expect(tracing.getTrace()).toEqual([
      { indexId: TEST_INDEX_ID, archiveId: 0 },
      { indexId: TEST_INDEX_ID, archiveId: 5 },
    ]);
    expect(tracing.getTraceCount()).toBe(2);
  });

  it('rejects negative archive ids before tracing', () => {
    const tracing = new TracingStore(store);

    expect(() => tracing.read(TEST_INDEX_ID, -1)).toThrow(/non-negative integer/);
    expect(tracing.getTrace()).toEqual([]);
  });

  it('rejects non-integer archive ids before tracing', () => {
    const tracing = new TracingStore(store);

    expect(() => tracing.read(TEST_INDEX_ID, 1.5)).toThrow(/non-negative integer/);
    expect(tracing.getTrace()).toEqual([]);
  });

  it('deduplicates repeat reads of the same archive', () => {
    const tracing = new TracingStore(store);

    tracing.read(TEST_INDEX_ID, 0);
    tracing.read(TEST_INDEX_ID, 0);
    tracing.read(TEST_INDEX_ID, 0);

    expect(tracing.getTraceCount()).toBe(1);
    expect(tracing.getTrace()).toEqual([{ indexId: TEST_INDEX_ID, archiveId: 0 }]);
  });

  it('returns the actual archive bytes from the underlying store', () => {
    const tracing = new TracingStore(store);

    const result = tracing.read(TEST_INDEX_ID, 0);

    expect(Array.from(result)).toEqual([0xde - 0x100, 0xad - 0x100, 0xbe - 0x100, 0xef - 0x100]);
  });

  it('records sparse-hole reads (size=0, sector=0) as missing archives', () => {
    const tracing = new TracingStore(store);

    const result = tracing.read(TEST_INDEX_ID, 5);

    expect(result.length).toBe(0);
    expect(tracing.getMissingArchives()).toEqual([{ indexId: TEST_INDEX_ID, archiveId: 5 }]);
  });

  it('does NOT record non-empty archives as missing', () => {
    const tracing = new TracingStore(store);

    tracing.read(TEST_INDEX_ID, 0);

    expect(tracing.getMissingArchives()).toEqual([]);
  });

  it('separates trace and missing tracking - missing archives still appear in trace', () => {
    const tracing = new TracingStore(store);

    tracing.read(TEST_INDEX_ID, 0);
    tracing.read(TEST_INDEX_ID, 5);

    expect(tracing.getTrace()).toHaveLength(2);
    expect(tracing.getMissingArchives()).toHaveLength(1);
  });

  it('sorts trace output by indexId then archiveId for deterministic results', () => {
    const tracing = new TracingStore(store);

    tracing.read(TEST_INDEX_ID, 5);
    tracing.read(TEST_INDEX_ID, 0);

    expect(tracing.getTrace()).toEqual([
      { indexId: TEST_INDEX_ID, archiveId: 0 },
      { indexId: TEST_INDEX_ID, archiveId: 5 },
    ]);
  });

  it('clearTrace resets both traces and missing archives', () => {
    const tracing = new TracingStore(store);
    tracing.read(TEST_INDEX_ID, 0);
    tracing.read(TEST_INDEX_ID, 5);

    tracing.clearTrace();

    expect(tracing.getTrace()).toEqual([]);
    expect(tracing.getMissingArchives()).toEqual([]);
    expect(tracing.getTraceCount()).toBe(0);
  });

  it('shares the delegate store buffers (zero-copy)', () => {
    const tracing = new TracingStore(store);

    expect(tracing.dataFile).toBe(store.dataFile);
    expect(tracing.indexFiles).toBe(store.indexFiles);
    expect(tracing.metaFile).toBe(store.metaFile);
  });

  it('still routes reads through MemoryStore.read (sparse holes return empty Int8Array)', () => {
    const tracing = new TracingStore(store);

    const sparse = tracing.read(TEST_INDEX_ID, 5);
    const real = tracing.read(TEST_INDEX_ID, 0);

    expect(sparse).toBeInstanceOf(Int8Array);
    expect(sparse.length).toBe(0);
    expect(real).toBeInstanceOf(Int8Array);
    expect(real.length).toBe(4);
  });

  it('does not record invalid archive ids as cache trace entries', () => {
    const tracing = new TracingStore(store);

    expect(() => tracing.read(TEST_INDEX_ID, Number.NaN)).toThrow('Archive id must be a non-negative integer');

    expect(tracing.getTrace()).toEqual([]);
    expect(tracing.getMissingArchives()).toEqual([]);
  });
});
