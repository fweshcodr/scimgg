/**
 * Turns a triangle soup into an indexed mesh with identical shader input: each distinct vertex is
 * stored once, and the index list names, corner by corner, the vertex the soup had there.
 *
 * The rule, owned here for every producer: corners are taken in soup order, in windows of
 * {@link WINDOW_CORNERS}; a corner reuses the distinct vertex of an earlier corner in its window
 * whose every attribute is bitwise identical (so -0 and +0, and NaNs with different payloads, stay
 * apart), and otherwise becomes the next distinct vertex. Distinct vertices keep the order of their
 * first use, and the indices keep the soup's triangle order, corner order and winding, so every
 * draw fetches the same values in the same order, including the last corner a `flat` varying takes.
 *
 * {@link indexTriangleSoup} applies it to a soup in memory; {@link StreamingSoupIndexer} and
 * {@link SoupCompactor} apply it to corners as they are produced, so a producer never holds the
 * whole soup. Both give the same result for the same corners.
 */

/** One per-vertex attribute: `size` floats per vertex. */
export interface SoupAttribute {
  readonly data: Float32Array;
  readonly size: number;
}

export interface IndexedSoup {
  /** See {@link createIndexArray}. */
  readonly indices: Uint16Array | Uint32Array;
  /** Each attribute's distinct vertices, in order of first use, in the order they were given. */
  readonly attributes: Float32Array[];
  readonly vertexCount: number;
}

/**
 * Corners matched against each other at a time: 8192 whole triangles. Soups list each model's
 * triangles together, so a vertex repeats close to where it first appears; matching within windows
 * finds nearly every repeat while the hash table stays small enough to sit in cache and its size
 * stays bounded however large the soup. A repeat across windows is stored twice, which costs bytes,
 * never exactness.
 */
export const WINDOW_CORNERS = 3 * 8192;

/** Most distinct vertices 16-bit indices can name without using the restart index 0xFFFF. */
export const MAX_UINT16_INDEXED_VERTICES = 0xffff;

/**
 * Most corners a soup can be indexed with. 32-bit indices must stay below WebGL2's restart index
 * 0xFFFFFFFF, and the matcher stores a row plus one in 32 bits, so no row may reach 0xFFFFFFFF.
 */
export const MAX_INDEXED_CORNERS = 0xffffffff;

/** Throws unless `count` is a whole number of corners (or distinct vertices) the rule can index. */
function assertIndexable(count: number, what: string): void {
  if (!Number.isInteger(count) || count < 0 || count > MAX_INDEXED_CORNERS) {
    throw new RangeError(`Cannot index ${count} ${what}: at most ${MAX_INDEXED_CORNERS}`);
  }
}

/** Whether `distinct` vertices plus the index buffer take fewer bytes than the soup of `corners`. */
export function indexingPays(distinct: number, corners: number, floatsPerVertex: number): boolean {
  const indexBytes = distinct <= MAX_UINT16_INDEXED_VERTICES ? 2 : 4;
  return distinct * floatsPerVertex * 4 + corners * indexBytes < corners * floatsPerVertex * 4;
}

/**
 * The index array for `corners` corners over `distinct` vertices: 16-bit when the vertices fit
 * below WebGL2's fixed primitive-restart index 0xFFFF, otherwise 32-bit. Drawn from offset 0.
 */
export function createIndexArray(distinct: number, corners: number): Uint16Array | Uint32Array {
  assertIndexable(corners, 'corners');
  assertIndexable(distinct, 'distinct vertices');
  if (distinct > corners) throw new RangeError(`${distinct} distinct vertices from ${corners} corners`);
  return distinct <= MAX_UINT16_INDEXED_VERTICES ? new Uint16Array(corners) : new Uint32Array(corners);
}

function wordsOf(data: Float32Array): Uint32Array {
  return new Uint32Array(data.buffer, data.byteOffset, data.length);
}

/**
 * The matching itself. Rows name stored tuples and only ever increase; a hash slot holds a row plus
 * one, and a row before the current window's first row counts as empty, so the table never needs
 * clearing. At most 1.25 to 2.5 four-byte slots per corner of a window: 128 KiB.
 */
class WindowedMatcher {
  private readonly table: Uint32Array;
  private readonly mask: number;
  private corner = 0;
  private windowStartRow = 0;

  constructor(
    private readonly sizes: readonly number[],
    cornerCount: number,
    scratch?: SoupIndexingScratch,
  ) {
    const capacity = 2 ** Math.ceil(Math.log2(Math.min(cornerCount, WINDOW_CORNERS) * 1.25 + 1));
    this.table = scratch ? scratch.clearedTable(capacity) : new Uint32Array(capacity);
    this.mask = capacity - 1;
  }

  /** The first row of the current window. */
  get windowStart(): number {
    return this.windowStartRow;
  }

  /**
   * Starts the next corner, whose row will be `nextRow` if it is new; call before {@link match}.
   * Returns true when the corner opens a new window.
   */
  begin(nextRow: number): boolean {
    const opens = this.corner > 0 && this.corner % WINDOW_CORNERS === 0;
    if (opens) this.windowStartRow = nextRow;
    this.corner++;
    return opens;
  }

  /**
   * The row in the current window whose tuple in `stored` (row `r` at `r - storedBase`) equals the
   * tuple of `incoming` at `incomingRow`, or -1 after recording `newRow` for it.
   */
  match(
    incoming: readonly Uint32Array[],
    incomingRow: number,
    stored: readonly Uint32Array[],
    storedBase: number,
    newRow: number,
  ): number {
    const sizes = this.sizes;
    let hash = 0x811c9dc5;
    for (let attribute = 0; attribute < sizes.length; attribute++) {
      const size = sizes[attribute] as number;
      const view = incoming[attribute] as Uint32Array;
      for (let component = 0, base = incomingRow * size; component < size; component++) {
        hash = Math.imul(hash ^ (view[base + component] as number), 0x01000193);
      }
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    const table = this.table;
    for (let slot = hash & this.mask; ; slot = (slot + 1) & this.mask) {
      const entry = table[slot] as number;
      if (entry <= this.windowStartRow) {
        table[slot] = newRow + 1;
        return -1;
      }
      const row = entry - 1;
      let same = true;
      for (let attribute = 0; attribute < sizes.length && same; attribute++) {
        const size = sizes[attribute] as number;
        const from = incoming[attribute] as Uint32Array;
        const to = stored[attribute] as Uint32Array;
        const a = incomingRow * size;
        const b = (row - storedBase) * size;
        for (let component = 0; component < size; component++) {
          if (from[a + component] !== to[b + component]) {
            same = false;
            break;
          }
        }
      }
      if (same) return row;
    }
  }
}

/**
 * Working memory for {@link indexTriangleSoup}, for a caller that is done with each result before
 * indexing the next, as an uploader is once `bufferData` has copied it. Each buffer grows only past
 * its own high-water mark (possibly set by different soups) and is released with its owner, so a
 * run of uploads stops allocating backing storage once the largest soups have been seen.
 */
export class SoupIndexingScratch {
  private table = new Uint32Array(0);
  private remap = new Uint32Array(0);
  private shortIndices = new Uint16Array(0);
  private floats = new Float32Array(0);

  /** The matcher's table, zeroed: rows restart at 0 for every soup. */
  clearedTable(capacity: number): Uint32Array {
    if (this.table.length < capacity) this.table = new Uint32Array(capacity);
    const table = this.table.subarray(0, capacity);
    table.fill(0);
    return table;
  }

  corners(count: number): Uint32Array {
    if (this.remap.length < count) this.remap = new Uint32Array(count);
    return this.remap.subarray(0, count);
  }

  shortCorners(count: number): Uint16Array {
    if (this.shortIndices.length < count) this.shortIndices = new Uint16Array(count);
    return this.shortIndices.subarray(0, count);
  }

  /** One float array per size, each `count` vertices long, laid out back to back. */
  vertices(sizes: readonly number[], count: number): Float32Array[] {
    const total = sizes.reduce((sum, size) => sum + size, 0) * count;
    if (this.floats.length < total) this.floats = new Float32Array(total);
    let offset = 0;
    return sizes.map((size) => {
      const view = this.floats.subarray(offset, offset + size * count);
      offset += size * count;
      return view;
    });
  }
}

/**
 * The indexed form of a soup of `vertexCount` vertices, or null when it would not take fewer bytes
 * than the soup, index buffer included. Scratch, all typed: the matcher's table and one 32-bit index
 * per vertex. With `scratch`, the result and the working memory are views into it, valid until it
 * indexes the next soup; without, everything is allocated and nothing is kept.
 */
export function indexTriangleSoup(
  attributes: readonly SoupAttribute[],
  vertexCount: number,
  scratch?: SoupIndexingScratch,
): IndexedSoup | null {
  assertIndexable(vertexCount, 'corners');
  if (vertexCount < 2) return null;
  const words = attributes.map(({ data }) => wordsOf(data));
  const sizes = attributes.map(({ size }) => size);
  const floatsPerVertex = sizes.reduce((sum, size) => sum + size, 0);

  // Rows are soup corners: a match names the corner that first had the tuple.
  const matcher = new WindowedMatcher(sizes, vertexCount, scratch);
  const remap = scratch ? scratch.corners(vertexCount) : new Uint32Array(vertexCount);
  let distinct = 0;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    matcher.begin(vertex);
    const first = matcher.match(words, vertex, words, 0, vertex);
    remap[vertex] = first < 0 ? distinct++ : (remap[first] as number);
  }
  if (!indexingPays(distinct, vertexCount, floatsPerVertex)) return null;

  // Distinct vertices were numbered in order of first use, so the first vertex mapping to each
  // next number is its source. Copied as raw bits, so NaN payloads survive.
  const compacted = scratch
    ? scratch.vertices(sizes, distinct)
    : attributes.map(({ size }) => new Float32Array(distinct * size));
  const compactedWords = compacted.map(wordsOf);
  for (let vertex = 0, next = 0; vertex < vertexCount && next < distinct; vertex++) {
    if (remap[vertex] !== next) continue;
    for (let attribute = 0; attribute < words.length; attribute++) {
      const size = sizes[attribute] as number;
      const from = words[attribute] as Uint32Array;
      const to = compactedWords[attribute] as Uint32Array;
      for (let component = 0; component < size; component++) {
        to[next * size + component] = from[vertex * size + component] as number;
      }
    }
    next++;
  }
  let indices: Uint16Array | Uint32Array = remap;
  if (distinct <= MAX_UINT16_INDEXED_VERTICES) {
    indices = scratch ? scratch.shortCorners(vertexCount) : createIndexArray(distinct, vertexCount);
    indices.set(remap);
  }
  return { indices, attributes: compacted, vertexCount: distinct };
}

/**
 * The same rule over corners handed over one at a time, so a producer never holds the soup: it
 * numbers each corner's distinct vertex into {@link indices}. Its scratch is that index per corner
 * plus one window of distinct tuples and the matcher's table, however large the soup. The distinct
 * vertices themselves are written by a second pass, {@link SoupCompactor}, into arrays sized from
 * {@link distinct}.
 */
export class StreamingSoupIndexer {
  /** Each corner's distinct vertex, in order of first use. */
  readonly indices: Uint32Array;
  private readonly matcher: WindowedMatcher;
  /** The current window's distinct tuples, row `r` at `r - windowStart`. */
  private readonly window: Uint32Array[];
  private corners = 0;
  private distinctCount = 0;

  constructor(
    private readonly sizes: readonly number[],
    cornerCount: number,
  ) {
    assertIndexable(cornerCount, 'corners');
    this.indices = new Uint32Array(cornerCount);
    this.matcher = new WindowedMatcher(sizes, cornerCount);
    const windowRows = Math.min(cornerCount, WINDOW_CORNERS);
    this.window = sizes.map((size) => new Uint32Array(windowRows * size));
  }

  get distinct(): number {
    return this.distinctCount;
  }

  /** Adds the corner at `row` of `corner`, one word array per attribute in the constructor's order. */
  add(corner: readonly Uint32Array[], row: number): void {
    const matcher = this.matcher;
    matcher.begin(this.distinctCount);
    const windowStart = matcher.windowStart;
    let index = matcher.match(corner, row, this.window, windowStart, this.distinctCount);
    if (index < 0) {
      index = this.distinctCount++;
      copyTuple(this.sizes, corner, row, this.window, index - windowStart);
    }
    this.indices[this.corners++] = index;
  }

  /** The index array to upload: these indices, in 16 bits when they fit (see {@link createIndexArray}). */
  uploadIndices(): Uint16Array | Uint32Array {
    if (this.distinctCount > MAX_UINT16_INDEXED_VERTICES) return this.indices;
    const indices = createIndexArray(this.distinctCount, this.indices.length);
    indices.set(this.indices);
    return indices;
  }
}

/**
 * The second pass over the same corners: writes each corner whose index first names its distinct
 * vertex into `output`, one array per attribute, sized for {@link StreamingSoupIndexer.distinct}.
 */
export class SoupCompactor {
  private readonly outputWords: Uint32Array[];
  private corner = 0;
  private next = 0;

  constructor(
    private readonly sizes: readonly number[],
    private readonly indices: Uint32Array,
    output: readonly Float32Array[],
  ) {
    this.outputWords = output.map(wordsOf);
  }

  add(corner: readonly Uint32Array[], row: number): void {
    if (this.indices[this.corner++] !== this.next) return;
    copyTuple(this.sizes, corner, row, this.outputWords, this.next++);
  }
}

/** Copies one tuple as raw bits, so NaN payloads survive. */
function copyTuple(
  sizes: readonly number[],
  from: readonly Uint32Array[],
  fromRow: number,
  to: readonly Uint32Array[],
  toRow: number,
): void {
  for (let attribute = 0; attribute < sizes.length; attribute++) {
    const size = sizes[attribute] as number;
    const source = from[attribute] as Uint32Array;
    const target = to[attribute] as Uint32Array;
    for (let component = 0; component < size; component++) {
      target[toRow * size + component] = source[fromRow * size + component] as number;
    }
  }
}
