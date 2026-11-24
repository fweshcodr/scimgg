import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { CacheSystem } from '../../src/rs/cache/CacheSystem';
import { MemoryStore } from '../../src/rs/cache/store/MemoryStore';
import { CompressionType } from '../../src/rs/compression/CompressionType';
import {
  ArchiveReadRecorder,
  findArchiveProblems,
  findUncoveredEncounterKinds,
  installArchiveReadTracing,
  RecordingStore,
  ScenarioNotExercisedError,
  ScenarioRunner,
} from '../cacheRuntimeFixture';

interface Entry {
  readonly indexId: number;
  readonly archiveId: number;
  readonly container: Uint8Array;
}

/** A minimal dat2 cache: sector 0 reserved, idx255 present, archives below 65536 only. */
function buildCacheFiles(entries: readonly Entry[]): Map<string, ArrayBuffer> {
  const sectors: Uint8Array[] = [new Uint8Array(520)];
  const indexLengths = new Map<number, number>();
  for (const { indexId, archiveId } of entries) {
    indexLengths.set(indexId, Math.max(indexLengths.get(indexId) ?? 0, archiveId + 1));
  }
  const indexFiles = new Map([...indexLengths].map(([indexId, count]) => [indexId, new Uint8Array(count * 6)]));
  for (const { indexId, archiveId, container } of entries) {
    const first = sectors.length;
    const chunks = Math.max(1, Math.ceil(container.length / 512));
    for (let chunk = 0; chunk < chunks; chunk++) {
      const sector = new Uint8Array(520);
      const view = new DataView(sector.buffer);
      const next = chunk + 1 < chunks ? sectors.length + 1 : 0;
      view.setUint16(0, archiveId);
      view.setUint16(2, chunk);
      sector[4] = next >> 16;
      view.setUint16(5, next & 0xffff);
      sector[7] = indexId;
      sector.set(container.subarray(chunk * 512, (chunk + 1) * 512), 8);
      sectors.push(sector);
    }
    const index = indexFiles.get(indexId)!;
    const at = archiveId * 6;
    index[at] = container.length >> 16;
    index[at + 1] = (container.length >> 8) & 0xff;
    index[at + 2] = container.length & 0xff;
    index[at + 3] = first >> 16;
    index[at + 4] = (first >> 8) & 0xff;
    index[at + 5] = first & 0xff;
  }
  const dat2 = new Uint8Array(sectors.length * 520);
  sectors.forEach((sector, i) => {
    dat2.set(sector, i * 520);
  });
  const files = new Map<string, ArrayBuffer>([
    ['main_file_cache.dat2', dat2.buffer],
    ['main_file_cache.idx255', new ArrayBuffer(6)],
  ]);
  for (const [indexId, index] of indexFiles) files.set(`main_file_cache.idx${indexId}`, index.buffer);
  return files;
}

/** A copy of `files` whose `indexId:archiveId` entry is a sparse hole, as the trimmer leaves one. */
function withArchiveRemoved(
  files: ReadonlyMap<string, ArrayBuffer>,
  indexId: number,
  archiveId: number,
): Map<string, ArrayBuffer> {
  const name = `main_file_cache.idx${indexId}`;
  const index = files.get(name);
  if (!index) throw new Error(`no ${name} to remove ${indexId}:${archiveId} from`);
  const copy = index.slice(0);
  new Uint8Array(copy, archiveId * 6, 6).fill(0);
  return new Map(files).set(name, copy);
}

function storedContainer(data: Uint8Array, revision = 7): Uint8Array {
  const out = new Uint8Array(5 + data.length + 2);
  const view = new DataView(out.buffer);
  out[0] = CompressionType.None;
  view.setUint32(1, data.length);
  out.set(data, 5);
  view.setUint16(5 + data.length, revision);
  return out;
}

function compressedContainer(type: CompressionType, payload: Uint8Array, size: number, revision = 7): Uint8Array {
  const out = new Uint8Array(9 + payload.length + 2);
  const view = new DataView(out.buffer);
  out[0] = type;
  view.setUint32(1, payload.length);
  view.setUint32(5, size);
  out.set(payload, 9);
  view.setUint16(9 + payload.length, revision);
  return out;
}

const gzipContainer = (data: Uint8Array, revision = 7) =>
  compressedContainer(CompressionType.Gzip, gzipSync(data), data.length, revision);

const DATA = Uint8Array.from({ length: 700 }, (_, i) => (i * 31) & 0xff);
const store = (entries: readonly Entry[]) => MemoryStore.fromFiles(buildCacheFiles(entries));
const read = (indexId: number, archiveId: number, scenario = 'scenario') => ({ indexId, archiveId, scenario });

describe('findArchiveProblems', () => {
  const served = (container: Uint8Array) => store([{ indexId: 7, archiveId: 3, container }]);

  it('passes archives served stored or gzip', () => {
    expect(findArchiveProblems([read(7, 3)], served(storedContainer(DATA)))).toEqual([]);
    expect(findArchiveProblems([read(7, 3)], served(gzipContainer(DATA)))).toEqual([]);
  });

  it('fails an archive the trim left as an empty entry', () => {
    const files = buildCacheFiles([{ indexId: 7, archiveId: 3, container: storedContainer(DATA) }]);
    const problems = findArchiveProblems([read(7, 3)], MemoryStore.fromFiles(withArchiveRemoved(files, 7, 3)));
    expect(problems).toMatchObject([{ reason: 'missing (empty entry)' }]);
  });

  it('fails a read past the end of the index', () => {
    expect(findArchiveProblems([read(7, 999)], served(storedContainer(DATA)))[0]?.reason).toMatch(/^unreadable/);
  });

  it('fails a container that does not decode', () => {
    const corrupt = compressedContainer(CompressionType.Gzip, Uint8Array.from([1, 2, 3, 4]), 10);
    expect(findArchiveProblems([read(7, 3)], served(corrupt))[0]?.reason).toMatch(/^undecodable/);
  });

  it('refuses a bzip2 container production cannot decode, without decoding it', () => {
    const bzip2 = compressedContainer(CompressionType.Bzip2, DATA, DATA.length);
    expect(findArchiveProblems([read(7, 3)], served(bzip2))[0]?.reason).toMatch(/^undecodable: Bzip2 container/);
  });

  it('still fails when the production code that made the read swallowed its error', () => {
    const files = buildCacheFiles([{ indexId: 7, archiveId: 3, container: storedContainer(DATA) }]);
    const trimmed = MemoryStore.fromFiles(withArchiveRemoved(files, 7, 3));
    const recorder = new ArchiveReadRecorder();
    try {
      new RecordingStore(trimmed, recorder).read(7, 3);
      throw new Error('decode failed');
    } catch {
      // A loader logging and moving on, as the model and spotanim loaders do.
    }
    expect(findArchiveProblems(recorder.entries(), trimmed)).toHaveLength(1);
  });

  it('detects the Surge potion graphic model being dropped, from the reads alone', () => {
    const files = buildCacheFiles([{ indexId: 7, archiveId: 48339, container: storedContainer(DATA) }]);
    const recorder = new ArchiveReadRecorder();
    recorder.currentScenario = 'item action 30875';
    new RecordingStore(MemoryStore.fromFiles(files), recorder).read(7, 48339);
    expect(findArchiveProblems(recorder.entries(), MemoryStore.fromFiles(files))).toEqual([]);
    expect(
      findArchiveProblems(recorder.entries(), MemoryStore.fromFiles(withArchiveRemoved(files, 7, 48339))),
    ).toMatchObject([{ reason: 'missing (empty entry)', read: { indexId: 7, archiveId: 48339 } }]);
  });
});

describe('ScenarioRunner', () => {
  it('fails a scenario that never confirms its action ran', async () => {
    const runner = new ScenarioRunner(new ArchiveReadRecorder());
    await expect(runner.run('family', 'idle', () => {})).rejects.toBeInstanceOf(ScenarioNotExercisedError);
  });

  it('fails a scenario whose required action did not happen', async () => {
    const runner = new ScenarioRunner(new ArchiveReadRecorder());
    await expect(
      runner.run('family', 'refused', (scenario) => scenario.require(false, 'attack started')),
    ).rejects.toThrow('[refused] expected: attack started');
  });

  it('attributes each first read to the running scenario', async () => {
    const recorder = new ArchiveReadRecorder(false);
    const runner = new ScenarioRunner(recorder);
    const traced = new RecordingStore(
      store([{ indexId: 7, archiveId: 3, container: storedContainer(DATA) }]),
      recorder,
    );
    const result = await runner.run('family', 'first', (scenario) => {
      traced.read(7, 3);
      scenario.confirm('read');
    });
    await runner.run('family', 'second', (scenario) => {
      traced.read(7, 3);
      scenario.confirm('read again');
    });
    expect(result.newArchiveReads).toBe(1);
    expect(recorder.entries()).toEqual([{ indexId: 7, archiveId: 3, scenario: 'first' }]);
  });
});

describe('installArchiveReadTracing', () => {
  let restore: (() => void) | undefined;
  afterEach(() => {
    restore?.();
    restore = undefined;
  });

  it('records reads made through a CacheSystem the production code builds itself', () => {
    const recorder = new ArchiveReadRecorder(false);
    const tracing = installArchiveReadTracing(recorder);
    restore = tracing.restore;
    const files = buildCacheFiles([{ indexId: 7, archiveId: 3, container: storedContainer(DATA) }]);
    // The synthetic cache has no reference table for index 7, so opening it throws - after the read.
    expect(() => CacheSystem.fromMap('dat2', files, [7])).toThrow();
    expect(tracing.sources).toHaveLength(1);
    expect(recorder.has(255, 7)).toBe(true);
  });
});

describe('findUncoveredEncounterKinds', () => {
  const coverage = { boss: ['boss fight'] };

  it('fails a new encounter kind without workload coverage', () => {
    expect(findUncoveredEncounterKinds(['boss', 'new_boss'], coverage, () => true)).toEqual([
      'new_boss: no workload coverage declared',
    ]);
  });

  it('fails a declared scenario that did not run', () => {
    expect(findUncoveredEncounterKinds(['boss'], coverage, () => false)).toEqual([
      'boss: scenario "boss fight" did not run',
    ]);
  });
});
