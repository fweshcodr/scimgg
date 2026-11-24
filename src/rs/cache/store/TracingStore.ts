import { MemoryStore } from './MemoryStore';

export class TracingStore extends MemoryStore {
  private readonly _traces = new Set<string>();
  private readonly _missing = new Set<string>();

  constructor(delegate: MemoryStore) {
    // Share the delegate's underlying buffers (zero-copy).
    super(delegate.dataFile, delegate.indexFiles, delegate.metaFile);
  }

  override read(indexId: number, archiveId: number): Int8Array {
    if (!Number.isInteger(archiveId) || archiveId < 0) {
      throw new Error('Archive id must be a non-negative integer');
    }
    this._traces.add(`${indexId}:${archiveId}`);
    const result = super.read(indexId, archiveId);
    // Empty result == sparse hole (size=0, sector=0) in the idx file. We track
    // these so the trim's self-validation can detect when a trimmed cache is
    // missing an archive that production loaders genuinely need.
    if (result.length === 0) {
      this._missing.add(`${indexId}:${archiveId}`);
    }
    return result;
  }

  /** Sorted by indexId then archiveId for deterministic output across runs. */
  getTrace(): Array<{ indexId: number; archiveId: number }> {
    return parseAndSort(this._traces);
  }

  getTraceCount(): number {
    return this._traces.size;
  }

  /**
   * Returns (indexId, archiveId) pairs whose underlying idx entry was a sparse
   * hole (size=0, sector=0) - i.e. `MemoryStore.read` returned an empty
   * `Int8Array`. Build-time validation uses this to detect missing data.
   */
  getMissingArchives(): Array<{ indexId: number; archiveId: number }> {
    return parseAndSort(this._missing);
  }

  clearTrace(): void {
    this._traces.clear();
    this._missing.clear();
  }
}

function parseAndSort(keys: Set<string>): Array<{ indexId: number; archiveId: number }> {
  return Array.from(keys)
    .map((key) => {
      const [indexId, archiveId] = key.split(':').map(Number);
      return { indexId, archiveId };
    })
    .sort((a, b) => a.indexId - b.indexId || a.archiveId - b.archiveId);
}
