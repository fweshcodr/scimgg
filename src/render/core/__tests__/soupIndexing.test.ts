import { describe, expect, it } from 'vitest';
import { expectSameBytes } from '../../../test/helpers/sameBytes';
import {
  createIndexArray,
  type IndexedSoup,
  indexingPays,
  indexTriangleSoup,
  MAX_INDEXED_CORNERS,
  MAX_UINT16_INDEXED_VERTICES,
  type SoupAttribute,
  SoupCompactor,
  SoupIndexingScratch,
  StreamingSoupIndexer,
} from '../soupIndexing';

/** The raw bits of every float, so -0, +0 and NaN payloads compare as the GPU sees them. */
function bits(data: Float32Array): number[] {
  return Array.from(new Uint32Array(data.buffer, data.byteOffset, data.length));
}

/** The soup an indexed mesh draws: each attribute fetched corner by corner through the indices. */
function expand(indexed: IndexedSoup, sizes: readonly number[]): Float32Array[] {
  return indexed.attributes.map((attribute, index) => {
    const size = sizes[index] as number;
    const soup = new Float32Array(indexed.indices.length * size);
    const from = new Uint32Array(attribute.buffer, attribute.byteOffset, attribute.length);
    const to = new Uint32Array(soup.buffer);
    for (let corner = 0; corner < indexed.indices.length; corner++) {
      for (let component = 0; component < size; component++) {
        to[corner * size + component] = from[(indexed.indices[corner] as number) * size + component] as number;
      }
    }
    return soup;
  });
}

function expectExactExpansion(attributes: readonly SoupAttribute[], indexed: IndexedSoup | null): IndexedSoup {
  if (!indexed) throw new Error('Expected the soup to be indexed');
  const expanded = expand(
    indexed,
    attributes.map(({ size }) => size),
  );
  for (const [index, { data }] of attributes.entries()) {
    expectSameBytes(expanded[index], data, `attribute ${index}`);
  }
  return indexed;
}

/** Floats from raw bits, so tests can place exact NaN payloads and signed zeros. */
function fromBits(words: readonly number[]): Float32Array {
  return new Float32Array(new Uint32Array(words).buffer);
}

const NEGATIVE_ZERO = 0x80000000;
const QUIET_NAN = 0x7fc00000;
const OTHER_NAN = 0x7fc00001;
const ONE = 0x3f800000;

describe('indexTriangleSoup', () => {
  it('stores each distinct vertex once, in order of first use, and keeps every corner in order', () => {
    // A quad as two triangles: corners 0 1 2 and 2 1 3 share two vertices.
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0]);
    const colours = new Float32Array([10, 11, 12, 12, 11, 13]);
    const attributes = [
      { data: positions, size: 3 },
      { data: colours, size: 1 },
    ];
    const indexed = expectExactExpansion(attributes, indexTriangleSoup(attributes, 6));

    expect(indexed.indices).toBeInstanceOf(Uint16Array);
    expect(Array.from(indexed.indices)).toEqual([0, 1, 2, 2, 1, 3]);
    expect(indexed.vertexCount).toBe(4);
    expect(Array.from(indexed.attributes[1] as Float32Array)).toEqual([10, 11, 12, 13]);
  });

  it('keeps vertices apart when any attribute differs, even by the sign of zero or a NaN payload', () => {
    // Six corners with identical positions; their second attribute differs only in bits.
    const positions = new Float32Array(18).fill(5);
    const marks = fromBits([0, NEGATIVE_ZERO, QUIET_NAN, OTHER_NAN, QUIET_NAN, 0]);
    const attributes = [
      { data: positions, size: 3 },
      { data: marks, size: 1 },
    ];
    const indexed = expectExactExpansion(attributes, indexTriangleSoup(attributes, 6));

    // +0 matches only +0, and a NaN only the same payload.
    expect(Array.from(indexed.indices)).toEqual([0, 1, 2, 3, 2, 0]);
    expect(bits(indexed.attributes[1] as Float32Array)).toEqual([0, NEGATIVE_ZERO, QUIET_NAN, OTHER_NAN]);
  });

  it('leaves a soup with no repeated vertex, or one indexing would not shrink, as it is', () => {
    const distinct = new Float32Array(18).map((_, index) => index);
    expect(indexTriangleSoup([{ data: distinct, size: 3 }], 6)).toBeNull();
    // One vertex repeated: five distinct floats and six two-byte indices take 32 bytes, the soup 24.
    const scalars = fromBits([ONE, 0, ONE, NEGATIVE_ZERO, QUIET_NAN, OTHER_NAN]);
    expect(indexTriangleSoup([{ data: scalars, size: 1 }], 6)).toBeNull();
    expect(indexTriangleSoup([{ data: new Float32Array(3), size: 3 }], 1)).toBeNull();
  });

  it.each([
    [MAX_UINT16_INDEXED_VERTICES, Uint16Array],
    [MAX_UINT16_INDEXED_VERTICES + 1, Uint32Array],
  ] as const)('indexes %i distinct vertices with %o, never using the restart index 0xFFFF in 16 bits', (distinct, type) => {
    // Every distinct vertex used three times, consecutively.
    const corners = distinct * 3;
    const positions = new Float32Array(corners * 3);
    for (let corner = 0; corner < corners; corner++) positions[corner * 3] = Math.floor(corner / 3);
    const attributes = [{ data: positions, size: 3 }];
    const indexed = expectExactExpansion(attributes, indexTriangleSoup(attributes, corners));

    expect(indexed.indices).toBeInstanceOf(type);
    expect(indexed.vertexCount).toBe(distinct);
    expect(Math.max(...indexed.indices.subarray(corners - 3))).toBe(distinct - 1);
    if (type === Uint16Array) expect(indexed.indices.includes(0xffff)).toBe(false);
  });

  it('matches repeats within windows of 8192 triangles, storing a repeat across windows again', () => {
    // 8193 triangles: every triangle is corners (0,0,0) (1,0,0) (2,0,0); the last starts a new window.
    const corners = 3 * 8193;
    const positions = new Float32Array(corners * 3);
    for (let corner = 0; corner < corners; corner++) positions[corner * 3] = corner % 3;
    const attributes = [{ data: positions, size: 3 }];
    const indexed = expectExactExpansion(attributes, indexTriangleSoup(attributes, corners));

    expect(indexed.vertexCount).toBe(6);
    expect(Array.from(indexed.indices.subarray(0, 3))).toEqual([0, 1, 2]);
    expect(Array.from(indexed.indices.subarray(corners - 6))).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('reads attributes from views at an offset into a larger buffer', () => {
    const backing = new Float32Array(4 + 18);
    const positions = backing.subarray(4);
    positions.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const attributes = [{ data: positions, size: 3 }];
    const indexed = expectExactExpansion(attributes, indexTriangleSoup(attributes, 6));
    expect(Array.from(indexed.indices)).toEqual([0, 1, 2, 0, 1, 2]);
  });
});

describe('StreamingSoupIndexer', () => {
  /** Streams the soup's corners twice, numbering then writing, as a producer without the soup would. */
  function streamed(attributes: readonly SoupAttribute[], corners: number): IndexedSoup {
    const sizes = attributes.map(({ size }) => size);
    const words = attributes.map(({ data }) => new Uint32Array(data.buffer, data.byteOffset, data.length));
    // One corner at a time from a separate one-vertex buffer, as a producer hands them over.
    const scratch = sizes.map((size) => new Uint32Array(size));
    const handOver = (add: (corner: readonly Uint32Array[], row: number) => void) => {
      for (let corner = 0; corner < corners; corner++) {
        for (const [index, size] of sizes.entries()) {
          (scratch[index] as Uint32Array).set(
            (words[index] as Uint32Array).subarray(corner * size, corner * size + size),
          );
        }
        add(scratch, 0);
      }
    };
    const indexer = new StreamingSoupIndexer(sizes, corners);
    handOver((corner, row) => indexer.add(corner, row));
    const output = sizes.map((size) => new Float32Array(indexer.distinct * size));
    const compactor = new SoupCompactor(sizes, indexer.indices, output);
    handOver((corner, row) => compactor.add(corner, row));
    return { indices: indexer.uploadIndices(), attributes: output, vertexCount: indexer.distinct };
  }

  it.each([
    ['one window, with signed zeros and NaN payloads', 600, 3],
    ['several windows, with repeats across their boundaries', 3 * 8192 * 2 + 300, 7],
  ])('gives exactly what indexTriangleSoup gives: %s', (_label, corners, seed) => {
    // Corners draw from a small pool of tuples, so they repeat both nearby and far apart.
    let state = seed;
    const next = () => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
      return state;
    };
    const pool = [0, NEGATIVE_ZERO, QUIET_NAN, OTHER_NAN, ONE, 0x40000000];
    const positions = fromBits(Array.from({ length: corners * 3 }, () => pool[next() % pool.length] as number));
    const colours = fromBits(Array.from({ length: corners }, () => pool[next() % 2] as number));
    const attributes = [
      { data: positions, size: 3 },
      { data: colours, size: 1 },
    ];
    const expected = indexTriangleSoup(attributes, corners);
    if (!expected) throw new Error('Expected the soup to index');
    const actual = streamed(attributes, corners);

    expect(actual.indices.constructor).toBe(expected.indices.constructor);
    expect(Array.from(actual.indices)).toEqual(Array.from(expected.indices));
    expect(actual.attributes.map(bits)).toEqual(expected.attributes.map(bits));
    expectExactExpansion(attributes, actual);
  });

  it('shares the pays rule and index type with indexTriangleSoup', () => {
    expect(indexingPays(4, 6, 4)).toBe(true);
    expect(indexingPays(5, 6, 1)).toBe(false);
    expect(createIndexArray(MAX_UINT16_INDEXED_VERTICES, MAX_UINT16_INDEXED_VERTICES)).toBeInstanceOf(Uint16Array);
    expect(createIndexArray(MAX_UINT16_INDEXED_VERTICES + 1, MAX_UINT16_INDEXED_VERTICES + 1)).toBeInstanceOf(
      Uint32Array,
    );
  });
});

describe('index limits', () => {
  it('rejects corner and vertex counts 32-bit indices cannot name, before allocating anything', () => {
    // Past the limit the restart index 0xFFFFFFFF, or the matcher's row + 1, would be reached.
    const tooMany = MAX_INDEXED_CORNERS + 1;
    expect(() => indexTriangleSoup([], tooMany)).toThrow(RangeError);
    expect(() => new StreamingSoupIndexer([3], tooMany)).toThrow(RangeError);
    expect(() => createIndexArray(1, tooMany)).toThrow(RangeError);
    expect(() => createIndexArray(tooMany, tooMany)).toThrow(RangeError);
    for (const invalid of [-1, 1.5, Number.NaN]) {
      expect(() => indexTriangleSoup([], invalid)).toThrow(RangeError);
      expect(() => new StreamingSoupIndexer([3], invalid)).toThrow(RangeError);
    }
    // More distinct vertices than corners is a caller's bug, not a size to allocate.
    expect(() => createIndexArray(7, 6)).toThrow(RangeError);
  });
});

describe('SoupIndexingScratch', () => {
  it('gives the same result as fresh arrays, for soup after soup, growing only to the largest', () => {
    const scratch = new SoupIndexingScratch();
    const soups = [9, 3, 6].map((triangles, seed) => {
      // Each triangle repeats the previous one's last two corners, so a third of the corners are new.
      const positions = new Float32Array(triangles * 9);
      for (let corner = 0; corner < triangles * 3; corner++) {
        positions[corner * 3] = seed * 100 + Math.floor(corner / 3) + (corner % 3);
      }
      const colours = new Float32Array(triangles * 3).fill(seed);
      return [
        { data: positions, size: 3 },
        { data: colours, size: 1 },
      ];
    });
    for (const attributes of soups) {
      const corners = attributes[0]!.data.length / 3;
      const expected = indexTriangleSoup(attributes, corners);
      const actual = indexTriangleSoup(attributes, corners, scratch);
      if (!expected || !actual) throw new Error('Expected both to index');
      expect(actual.indices.constructor).toBe(expected.indices.constructor);
      expect(Array.from(actual.indices)).toEqual(Array.from(expected.indices));
      expect(actual.attributes.map(bits)).toEqual(expected.attributes.map(bits));
      expectExactExpansion(attributes, actual);
    }
    // The views share one buffer per kind, sized for the largest soup.
    const largest = indexTriangleSoup(soups[0]!, 27, scratch);
    const smallest = indexTriangleSoup(soups[1]!, 9, scratch);
    expect(smallest?.indices.buffer).toBe(largest?.indices.buffer);
  });
});
