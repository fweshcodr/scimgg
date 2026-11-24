/**
 * Infrastructure for the runtime cache-coverage check (`scripts/cache-runtime.check.ts`).
 *
 * The check runs production loading code against the trimmed artifact that ships and records
 * every archive those loaders read. A trimmed-out archive is a zero-length entry, and loaders that
 * swallow the failure still made the read, so any recorded read that comes back empty or does not
 * decode the way production decodes it (stored or gzip, never bzip2) is an asset the trim lost.
 * It deliberately shares nothing with the trimmer's root collection (`scripts/cacheRoots.ts`,
 * `scripts/discoverCacheUsage.ts`, `scripts/trim-cache.ts`): it is an independent witness, so a
 * root the trimmer forgets cannot also be forgotten here.
 *
 * Everything in this module is environment-light so the synthetic self-tests in
 * `scripts/__tests__/cacheRuntimeFixture.test.ts` can exercise it without a cache.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { vi } from 'vitest';
import { type CacheMeta, CacheStorage } from '../src/cache/CacheStorage';
import { type CacheInfo, type DownloadedCache, type KeysData, OpenRS2Client } from '../src/cache/OpenRS2Client';
import { CacheSystem } from '../src/rs/cache/CacheSystem';
import { Container } from '../src/rs/cache/Container';
import type { MemoryStore } from '../src/rs/cache/store/MemoryStore';
import { TracingStore } from '../src/rs/cache/store/TracingStore';
import { CompressionType } from '../src/rs/compression/CompressionType';
import { ByteBuffer } from '../src/rs/io/ByteBuffer';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_TRIMMED_DIR = path.join(REPO_ROOT, 'public', 'osrs-cache');

/** `<dir>/manifest.json`: the mirror manifest production reads as its `CacheInfo`. */
export function readTrimmedManifest(trimmedDir: string): CacheInfo {
  const manifestPath = path.join(trimmedDir, 'manifest.json');
  if (!existsSync(manifestPath)) throw new Error(`[cache-runtime] Missing trimmed manifest ${manifestPath}`);
  return JSON.parse(readFileSync(manifestPath, 'utf-8')) as CacheInfo;
}

export interface ObservedArchiveRead {
  readonly indexId: number;
  readonly archiveId: number;
  /** Label of the scenario that first requested the archive. */
  readonly scenario: string;
  /** Source frames of the first request, innermost first. */
  readonly stack?: string;
}

export const archiveKey = (indexId: number, archiveId: number): string => `${indexId}:${archiveId}`;

/**
 * Collects every archive read made through a {@link RecordingStore}, attributed to the scenario
 * that was running when the archive was first requested. Reads are cumulative across scenarios:
 * loaders cache what they decode, so a later scenario reaching an already-read archive adds nothing.
 */
export class ArchiveReadRecorder {
  currentScenario = 'cache bootstrap';
  private readonly reads = new Map<string, ObservedArchiveRead>();

  constructor(private readonly captureStacks = true) {}

  record(indexId: number, archiveId: number): void {
    const key = archiveKey(indexId, archiveId);
    if (this.reads.has(key)) return;
    this.reads.set(key, {
      indexId,
      archiveId,
      scenario: this.currentScenario,
      ...(this.captureStacks ? { stack: requestStack() } : {}),
    });
  }

  get size(): number {
    return this.reads.size;
  }

  has(indexId: number, archiveId: number): boolean {
    return this.reads.has(archiveKey(indexId, archiveId));
  }

  get(indexId: number, archiveId: number): ObservedArchiveRead | undefined {
    return this.reads.get(archiveKey(indexId, archiveId));
  }

  entries(): ObservedArchiveRead[] {
    return [...this.reads.values()].sort((a, b) => a.indexId - b.indexId || a.archiveId - b.archiveId);
  }
}

const STACK_FRAME_LIMIT = 6;

function requestStack(): string {
  const frames = (new Error().stack ?? '').split('\n').slice(1);
  const relevant = frames.filter(
    (frame) =>
      frame.includes('/src/') &&
      !frame.includes('/src/rs/cache/') &&
      !frame.includes('node_modules') &&
      !frame.includes('cacheRuntimeFixture'),
  );
  return relevant
    .slice(0, STACK_FRAME_LIMIT)
    .map((frame) => frame.trim().replace(/^at /, '').replace(`${REPO_ROOT}/`, ''))
    .join(' <- ');
}

/** A {@link TracingStore} that also reports each read to a shared recorder. */
export class RecordingStore extends TracingStore {
  constructor(
    delegate: MemoryStore,
    private readonly recorder: ArchiveReadRecorder,
  ) {
    super(delegate);
  }

  override read(indexId: number, archiveId: number): Int8Array {
    this.recorder.record(indexId, archiveId);
    return super.read(indexId, archiveId);
  }
}

/**
 * Wraps every store the production cache stack opens while installed, so reads by the real
 * `CacheManager` are recorded without changing how it builds its `CacheSystem`. The returned
 * `sources` are the unwrapped stores the reads were served from.
 */
export function installArchiveReadTracing(recorder: ArchiveReadRecorder): {
  readonly sources: MemoryStore[];
  restore(): void;
} {
  const original = CacheSystem.loadIndicesFromStore.bind(CacheSystem);
  const sources: MemoryStore[] = [];
  const spy = vi.spyOn(CacheSystem, 'loadIndicesFromStore').mockImplementation((cacheType, store) => {
    sources.push(store);
    return original(cacheType, new RecordingStore(store, recorder));
  });
  return { sources, restore: () => spy.mockRestore() };
}

/** Serves one in-memory cache zip in place of the network, as the mirror would. */
export class LocalCacheTransport extends OpenRS2Client {
  constructor(
    private readonly info: CacheInfo,
    private readonly zipBytes: ArrayBuffer,
    private readonly keys: KeysData = [],
  ) {
    super('local-cache-transport');
  }

  override async getManifest(): Promise<CacheInfo> {
    return this.info;
  }

  override async downloadCache(
    id: number,
    onProgress?: (percent: number, receivedBytes: number) => void,
  ): Promise<DownloadedCache> {
    if (id !== this.info.id) throw new Error(`LocalCacheTransport only serves cache ${this.info.id}, not ${id}`);
    onProgress?.(100, this.zipBytes.byteLength);
    return { data: this.zipBytes, matchesManifest: true };
  }

  override async downloadKeys(): Promise<KeysData> {
    return this.keys;
  }
}

/** Browser storage held in memory, starting empty so the manager takes its download path. */
export class InMemoryCacheStorage extends CacheStorage {
  private readonly files = new Map<string, ArrayBuffer>();
  private readonly metas = new Map<number, CacheMeta>();
  private readonly parsed = new Map<string, unknown>();

  override async storeCacheFile(name: string, data: ArrayBuffer, cacheId = 0): Promise<void> {
    this.files.set(`${cacheId}/${name}`, data);
  }
  override async getCacheFile(name: string, cacheId = 0): Promise<ArrayBuffer | null> {
    return this.files.get(`${cacheId}/${name}`) ?? null;
  }
  override async getCacheFilesParallel(names: string[], _onProgress?: unknown, cacheId = 0) {
    const out = new Map<string, ArrayBuffer>();
    for (const name of names) {
      const file = this.files.get(`${cacheId}/${name}`);
      if (file) out.set(name, file);
    }
    return out;
  }
  override async hasCacheFile(name: string, cacheId = 0): Promise<boolean> {
    return this.files.has(`${cacheId}/${name}`);
  }
  override async storeCacheMeta(meta: CacheMeta): Promise<void> {
    this.metas.set(meta.cacheId, meta);
  }
  override async getCacheMeta(cacheId: number): Promise<CacheMeta | null> {
    return this.metas.get(cacheId) ?? null;
  }
  override async storeParsed(cacheId: number, kind: string, id: number, data: unknown): Promise<void> {
    this.parsed.set(`${cacheId}/${kind}/${id}`, data);
  }
  override async getParsed(cacheId: number, kind: string, id: number): Promise<unknown> {
    return this.parsed.get(`${cacheId}/${kind}/${id}`);
  }
  override async deleteCache(cacheId: number): Promise<void> {
    for (const key of [...this.files.keys()]) if (key.startsWith(`${cacheId}/`)) this.files.delete(key);
    this.metas.delete(cacheId);
  }
  override async deleteCacheMeta(cacheId: number): Promise<void> {
    this.metas.delete(cacheId);
  }
  override async deleteOlderCaches(installedCacheId: number): Promise<void> {
    for (const key of [...this.files.keys()]) {
      if (Number(key.slice(0, key.indexOf('/'))) < installedCacheId) this.files.delete(key);
    }
    for (const id of [...this.metas.keys()]) if (id < installedCacheId) this.metas.delete(id);
  }
  override async close(): Promise<void> {}
}

export interface ArchiveReader {
  read(indexId: number, archiveId: number): Int8Array;
}

export interface ArchiveProblem {
  readonly read: ObservedArchiveRead;
  readonly reason: string;
}

/** Container compressions production decodes: stored and gzip (see gzipCacheContainers.ts). */
const PRODUCTION_COMPRESSIONS: ReadonlySet<number> = new Set([CompressionType.None, CompressionType.Gzip]);

/** Why `store` cannot serve `indexId:archiveId` to production, or undefined when it can. */
function archiveProblem(store: ArchiveReader, indexId: number, archiveId: number): string | undefined {
  let raw: Int8Array;
  try {
    raw = store.read(indexId, archiveId);
  } catch (error) {
    return `unreadable: ${error instanceof Error ? error.message : String(error)}`;
  }
  if (raw.length === 0) return 'missing (empty entry)';
  if (!PRODUCTION_COMPRESSIONS.has(raw[0])) {
    return `undecodable: ${CompressionType[raw[0]] ?? `compression ${raw[0]}`} container; production decodes only stored and gzip`;
  }
  try {
    Container.decode(new ByteBuffer(raw));
  } catch (error) {
    return `undecodable: ${error instanceof Error ? error.message : String(error)}`;
  }
  return undefined;
}

/**
 * Every recorded read must come back from `store` non-empty and decoding as production decodes
 * it. Production code that catches a failed load does not hide the loss: this re-reads what was
 * recorded rather than trusting whether the workload threw.
 */
export function findArchiveProblems(reads: Iterable<ObservedArchiveRead>, store: ArchiveReader): ArchiveProblem[] {
  const problems: ArchiveProblem[] = [];
  for (const read of reads) {
    const reason = archiveProblem(store, read.indexId, read.archiveId);
    if (reason) problems.push({ read, reason });
  }
  return problems;
}

export function formatArchiveProblems(problems: readonly ArchiveProblem[], limit = 200): string {
  const lines = problems.slice(0, limit).map(({ read, reason }) => {
    const at = read.stack ? `\n      first requested from ${read.stack}` : '';
    return `  [${read.scenario}] ${archiveKey(read.indexId, read.archiveId)} ${reason}${at}`;
  });
  if (problems.length > limit) lines.push(`  ... and ${problems.length - limit} more`);
  return lines.join('\n');
}

export class ScenarioNotExercisedError extends Error {}

export interface ScenarioContext {
  /** Records that the scenario's intended action or branch really ran. */
  confirm(evidence: string): void;
  /** Fails the scenario unless `condition` holds, recording `evidence` when it does. */
  require(condition: unknown, evidence: string): void;
}

export interface ScenarioResult {
  readonly label: string;
  readonly family: string;
  readonly evidence: readonly string[];
  readonly newArchiveReads: number;
  readonly durationMs: number;
}

/**
 * Runs labeled workload scenarios, attributing archive reads to each. Loaders log and swallow
 * their own failures, so returning without throwing proves nothing: a scenario must confirm the
 * action it exists to exercise, and one that confirms nothing fails.
 */
export class ScenarioRunner {
  readonly results: ScenarioResult[] = [];

  constructor(private readonly recorder: ArchiveReadRecorder) {}

  async run(family: string, label: string, body: (context: ScenarioContext) => unknown): Promise<ScenarioResult> {
    if (this.results.some((result) => result.label === label)) throw new Error(`duplicate scenario label ${label}`);
    const evidence: string[] = [];
    const context: ScenarioContext = {
      confirm: (what) => {
        evidence.push(what);
      },
      require: (condition, what) => {
        if (!condition) throw new ScenarioNotExercisedError(`[${label}] expected: ${what}`);
        evidence.push(what);
      },
    };
    const previous = this.recorder.currentScenario;
    const readsBefore = this.recorder.size;
    const started = Date.now();
    this.recorder.currentScenario = label;
    try {
      await body(context);
    } finally {
      this.recorder.currentScenario = previous;
    }
    if (evidence.length === 0) {
      throw new ScenarioNotExercisedError(`[${label}] completed without confirming its action ran`);
    }
    const result: ScenarioResult = {
      label,
      family,
      evidence,
      newArchiveReads: this.recorder.size - readsBefore,
      durationMs: Date.now() - started,
    };
    this.results.push(result);
    return result;
  }

  ran(label: string): boolean {
    return this.results.some((result) => result.label === label);
  }
}

/**
 * Encounter-specific dynamic-asset coverage: the scenarios that exercise each encounter kind's own
 * runtime assets. A kind with no entry, or a listed scenario that did not run, fails the check.
 */
export function findUncoveredEncounterKinds(
  kinds: readonly string[],
  coverage: Readonly<Record<string, readonly string[]>>,
  ran: (label: string) => boolean,
): string[] {
  const uncovered: string[] = [];
  for (const kind of kinds) {
    const scenarios = coverage[kind] ?? [];
    if (scenarios.length === 0) uncovered.push(`${kind}: no workload coverage declared`);
    for (const label of scenarios) if (!ran(label)) uncovered.push(`${kind}: scenario "${label}" did not run`);
  }
  return uncovered;
}
