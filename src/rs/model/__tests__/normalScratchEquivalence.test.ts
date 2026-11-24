import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocRenderer } from '../../../render/environment/LocRenderer';
import type { StagedStaticLoc } from '../../../render/environment/staticLocNormals';
import { skipWithoutRealCache } from '../../../test/helpers/real-cache';
import { ModelData } from '../ModelData';
import {
  allocateVertexNormalSums,
  MAX_INT32_NORMAL_COUNT,
  VERTEX_NORMAL_STRIDE,
  type VertexNormalSums,
} from '../VertexNormal';
import {
  encounterNpcIds,
  encounterSpotAnimIds,
  loadEncounterLocs,
  openLocModelLoader,
  openNpcModelLoader,
  openSpotAnimModelLoader,
  visitSpotAnimModels,
} from './encounterModelFixtures';
import {
  LegacyVertexNormal,
  legacyCachedNormalMergeVertexIndex,
  legacyCalculateVertexNormals,
  legacyComputeLitColors,
  legacyInvalidate,
  legacyMergeNormals,
  legacyState,
} from './legacyNormals';

/**
 * While set, `mergeStagedLocNormals` hands it each staged set before merging, and calls what it
 * returns afterwards with the `ModelData.mergeNormals` calls the merge made, so a reference can
 * replay them from the pre-merge geometry.
 */
let onStagedMerge: ((staged: readonly StagedStaticLoc[]) => (calls: MergeCall[]) => void) | null = null;
type MergeCall = Parameters<typeof ModelData.mergeNormals>;

vi.mock('../../../render/environment/staticLocNormals', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../render/environment/staticLocNormals')>();
  const { ModelData: Model } = await import('../ModelData');
  return {
    ...original,
    mergeStagedLocNormals: (staged: readonly StagedStaticLoc[]) => {
      if (!onStagedMerge) return original.mergeStagedLocNormals(staged);
      const afterMerge = onStagedMerge(staged);
      const calls: MergeCall[] = [];
      const merge = Model.mergeNormals;
      const spy = vi.spyOn(Model, 'mergeNormals').mockImplementation((...args: MergeCall) => {
        calls.push(args);
        merge.apply(Model, args);
      });
      try {
        original.mergeStagedLocNormals(staged);
      } finally {
        spy.mockRestore();
      }
      afterMerge(calls);
    },
  };
});

afterEach(() => {
  onStagedMerge = null;
  vi.restoreAllMocks();
});

const LIGHT = [-50, -10, -50] as const;

/** The model's geometry for the reference: its vertices, faces and render types, without lighting scratch. */
function referenceCopy(model: ModelData): ModelData {
  const copy = ModelData.copyFrom(model, false, false, false, false, false);
  copy.invalidate();
  if (model.faceRenderTypes) copy.faceRenderTypes = new Int8Array(model.faceRenderTypes);
  if (model.contourVerticesY) copy.contourVerticesY = new Int32Array(model.contourVerticesY);
  return copy;
}

function sameBytes(a: ArrayBufferView, b: ArrayBufferView): boolean {
  if (a.byteLength !== b.byteLength) return false;
  return Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));
}

/** Each sum's components as doubles, so values (not storage width) are compared. */
function asDoubles(sums: VertexNormalSums): Float64Array {
  return Float64Array.from(sums);
}

function legacySums(normals: readonly (LegacyVertexNormal | undefined)[], length: number): Float64Array {
  const sums = new Float64Array(length * VERTEX_NORMAL_STRIDE);
  for (let vertex = 0; vertex < length; vertex++) {
    const normal = normals[vertex];
    if (!normal) continue;
    sums.set([normal.x, normal.y, normal.z, normal.magnitude], vertex * VERTEX_NORMAL_STRIDE);
  }
  return sums;
}

/**
 * First difference between the model's lighting scratch and the reference's: plain normals, flat
 * face normals, merged seam normals (which vertices have one, and their sums) and render types.
 */
function scratchDifference(model: ModelData, reference: ModelData): string | null {
  const legacy = legacyState(reference);
  if (!model.normals || !legacy.normals) return `normals present: ${!!model.normals} vs ${!!legacy.normals}`;
  if (!sameBytes(asDoubles(model.normals), legacySums(legacy.normals, legacy.normals.length))) return 'normals differ';

  if (!!model.faceNormals !== !!legacy.faceNormals) return 'face normals presence differs';
  if (model.faceNormals && legacy.faceNormals) {
    for (let face = 0; face < model.faceCount; face++) {
      const expected = legacy.faceNormals[face];
      const actual = Array.from(model.faceNormals.subarray(face * 3, face * 3 + 3));
      if (expected ? !sameValues(actual, [expected.x, expected.y, expected.z]) : !sameValues(actual, [0, 0, 0])) {
        return `face ${face} normal differs`;
      }
    }
  }

  if (!!model.mergedNormals !== !!legacy.mergedNormals) return 'merged normals presence differs';
  if (model.mergedNormals && legacy.mergedNormals) {
    const merged = model.mergedNormals.sums;
    for (let vertex = 0; vertex < model.usedVertexCount; vertex++) {
      const present = merged[vertex * VERTEX_NORMAL_STRIDE + 3] !== 0;
      if (present !== !!legacy.mergedNormals[vertex]) return `vertex ${vertex} merged presence differs`;
    }
    const expected = legacySums(legacy.mergedNormals, model.usedVertexCount);
    if (!sameBytes(asDoubles(merged), expected)) return 'merged normals differ';
  }

  const types = model.faceRenderTypes;
  const expectedTypes = reference.faceRenderTypes;
  if (!!types !== !!expectedTypes || (types && expectedTypes && !sameBytes(types, expectedTypes))) {
    return 'render types differ';
  }
  return null;
}

function sameValues(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
}

/** The merge index as (hash, vertices) runs in hash order, from the new index or the reference's map. */
function indexRuns(model: ModelData): string | undefined {
  const index = (model as unknown as { normalMergeIndex?: { hashes: Int32Array; vertices: Int32Array } })
    .normalMergeIndex;
  if (!index) return undefined;
  const runs: string[] = [];
  for (let start = 0; start < index.hashes.length; ) {
    let end = start;
    while (end < index.hashes.length && index.hashes[end] === index.hashes[start]) end++;
    runs.push(`${index.hashes[start]}:${Array.from(index.vertices.subarray(start, end)).join(',')}`);
    start = end;
  }
  return runs.join(' ');
}

function legacyIndexRuns(index: Map<number, number[]> | undefined): string | undefined {
  if (!index) return undefined;
  return [...index.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hash, vertices]) => `${hash}:${vertices.join(',')}`)
    .join(' ');
}

function litDifference(model: ModelData, reference: ModelData, ambient: number, contrast: number): string | null {
  const actual = model.computeLitColors(ambient, contrast, ...LIGHT);
  const expected = legacyComputeLitColors(reference, ambient, contrast, ...LIGHT);
  for (const key of ['faceColors1', 'faceColors2', 'faceColors3'] as const) {
    if (!sameBytes(actual[key], expected[key])) return `${key} differ`;
  }
  return null;
}

/** Everything lighting reads or writes, plus the merge index, compared against the reference. */
function fullDifference(model: ModelData, reference: ModelData, ambient = 64, contrast = 768): string | null {
  const lit = litDifference(model, reference, ambient, contrast);
  if (lit) return lit;
  const scratch = scratchDifference(model, reference);
  if (scratch) return scratch;
  const runs = indexRuns(model);
  const expected = legacyIndexRuns(legacyCachedNormalMergeVertexIndex(reference));
  return runs === expected ? null : 'merge index differs';
}

/** Deterministic pseudo-random integers, so failures reproduce. */
function rng(seed: number): (bound: number) => number {
  let state = seed >>> 0;
  return (bound) => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % bound;
  };
}

interface ModelSpec {
  readonly vertices: readonly (readonly [number, number, number])[];
  readonly faces: readonly (readonly [number, number, number])[];
  readonly renderTypes?: readonly number[];
  readonly alphas?: readonly number[];
  readonly textures?: readonly number[];
  readonly contourY?: readonly number[];
}

function buildModel(spec: ModelSpec): ModelData {
  const model = new ModelData();
  model.verticesCount = spec.vertices.length;
  model.usedVertexCount = spec.vertices.length;
  model.faceCount = spec.faces.length;
  model.verticesX = Int32Array.from(spec.vertices.map(([x]) => x));
  model.verticesY = Int32Array.from(spec.vertices.map(([, y]) => y));
  model.verticesZ = Int32Array.from(spec.vertices.map(([, , z]) => z));
  model.indices1 = Int32Array.from(spec.faces.map(([a]) => a));
  model.indices2 = Int32Array.from(spec.faces.map(([, b]) => b));
  model.indices3 = Int32Array.from(spec.faces.map(([, , c]) => c));
  model.faceColors = Uint16Array.from(spec.faces.map((_, face) => (face * 977) & 0xffff));
  if (spec.renderTypes) model.faceRenderTypes = Int8Array.from(spec.renderTypes);
  if (spec.alphas) model.faceAlphas = Int8Array.from(spec.alphas);
  if (spec.textures) model.faceTextures = Int16Array.from(spec.textures);
  if (spec.contourY) model.contourVerticesY = Int32Array.from(spec.contourY);
  return model;
}

/**
 * A random model: vertices on a 3×3×3 lattice `spread` apart, so many coincide within and across
 * models, a few far out, with every face kind.
 */
function randomModel(seed: number, vertexCount: number, faceCount: number, spread: number): ModelSpec {
  const next = rng(seed);
  const coordinate = () => (next(3) - 1) * spread + (next(20) === 0 ? next(2_000_000) - 1_000_000 : 0);
  const vertices = Array.from({ length: vertexCount }, () => [coordinate(), coordinate(), coordinate()] as const);
  const faces = Array.from({ length: faceCount }, () => {
    const a = next(vertexCount);
    // Some faces repeat a vertex, so it sums the face normal more than once.
    return [a, next(4) === 0 ? a : next(vertexCount), next(vertexCount)] as const;
  });
  return {
    vertices,
    faces,
    renderTypes: faces.map(() => [0, 0, 0, 1, 2, 3][next(6)] ?? 0),
    alphas: faces.map(() => [0, 0, 0, -1, -2, 100][next(6)] ?? 0),
    textures: faces.map(() => (next(5) === 0 ? 7 : -1)),
    ...(next(2) === 0 ? { contourY: vertices.map(([, y]) => y - next(64)) } : {}),
  };
}

describe('lighting scratch equivalence with the object-based normals', () => {
  it.each([
    ['no faces', { vertices: [], faces: [] }],
    [
      'one smooth face',
      {
        vertices: [
          [0, 0, 0],
          [128, 0, 0],
          [0, -128, 64],
        ],
        faces: [[0, 1, 2]],
      },
    ],
    ['a degenerate face, all corners one vertex', { vertices: [[5, 5, 5]], faces: [[0, 0, 0]] }],
    [
      'products past 8192 and past Int32, which shift and wrap',
      {
        vertices: [
          [0, 0, 0],
          [1 << 30, 0, -(1 << 29)],
          [0, (1 << 30) - 1, 1 << 28],
        ],
        faces: [[0, 1, 2]],
      },
    ],
    [
      'only flat-shaded faces',
      {
        vertices: [
          [0, 0, 0],
          [64, 0, 0],
          [0, 64, 0],
          [0, 0, 64],
        ],
        faces: [
          [0, 1, 2],
          [1, 2, 3],
        ],
        renderTypes: [1, 1],
      },
    ],
    ['random, coincident vertices', randomModel(1, 40, 90, 64)],
    ['random, far-out vertices', randomModel(2, 60, 200, 4096)],
    ['random, contoured', randomModel(3, 25, 50, 32)],
  ] as const)('computes the same normals and lit colors: %s', (_label, spec) => {
    const model = buildModel(spec as ModelSpec);
    const reference = referenceCopy(model);
    legacyCalculateVertexNormals(reference);
    expect(fullDifference(model, reference)).toBeNull();
    expect(fullDifference(model, reference, 20, 1200)).toBeNull();
  });

  /** Merges every ordered pair of `specs` at the given offsets, on the models and on reference copies. */
  function mergeBoth(
    specs: readonly ModelSpec[],
    offsets: readonly (readonly [number, number, number])[],
    hide: boolean,
  ) {
    const models = specs.map(buildModel);
    const references = models.map(referenceCopy);
    for (let first = 0; first < models.length; first++) {
      for (let second = 0; second < models.length; second++) {
        if (first === second) continue;
        const [x, y, z] = offsets[(first + second) % offsets.length] ?? [0, 0, 0];
        ModelData.mergeNormals(models[first]!, models[second]!, x, y, z, hide);
        legacyMergeNormals(references[first]!, references[second]!, x, y, z, hide);
      }
    }
    return { models, references };
  }

  it.each([
    false,
    true,
  ])('merges coincident vertices identically, through the index and the linear scan (hide occluded %s)', (hide) => {
    // Small models take the linear scan, the larger ones the hash index; many vertices coincide.
    const specs = [randomModel(11, 8, 10, 64), randomModel(12, 48, 90, 64), randomModel(13, 70, 120, 64)];
    const { models, references } = mergeBoth(
      specs,
      [
        [0, 0, 0],
        [64, 0, -64],
        [0, 64, 0],
      ],
      hide,
    );
    expect(models.some((model) => model.mergedNormals)).toBe(true);
    for (const [index, model] of models.entries()) {
      expect(fullDifference(model, references[index]!), `model ${index}`).toBeNull();
    }
  });

  it.each([
    ['through the index', true],
    ['in the linear scan', false],
  ])('keeps a hash collision out of the merge %s', (_label, indexed) => {
    // (5, 0, 0) and (7, y, 0) hash alike: solve 73856093·7 ^ 19349663·y = 73856093·5 for y.
    const inverse = (value: bigint) => {
      let result = 1n;
      for (let bit = 0; bit < 31; bit++) result = (result * (2n - value * result)) & 0xffffffffn;
      return result;
    };
    const target = BigInt(Math.imul(5, 73_856_093) ^ Math.imul(7, 73_856_093)) & 0xffffffffn;
    const y = Number(BigInt.asIntN(32, (target * inverse(19_349_663n)) & 0xffffffffn));
    expect(Math.imul(7, 73_856_093) ^ Math.imul(y, 19_349_663)).toBe(Math.imul(5, 73_856_093));
    const lattice = randomModel(21, 40, 60, 64);
    const colliding: ModelSpec = {
      vertices: [[5, 0, 0], [7, y, 0], [5, 0, 64], ...lattice.vertices],
      faces: [[0, 2, 3], [1, 2, 4], ...lattice.faces.map(([a, b, c]) => [a + 3, b + 3, c + 3] as const)],
    };
    // Merging the near model into the colliding one uses the colliding model's index once the
    // near model has enough vertices (usedVertexCount product of at least 1024); with three it
    // scans every vertex instead.
    const padding = indexed ? randomModel(22, 30, 30, 64) : { vertices: [], faces: [] };
    const near: ModelSpec = {
      vertices: [[5, 0, 0], [5, 0, 64], [64, 0, 0], ...padding.vertices],
      faces: [[0, 1, 2], ...padding.faces.map(([a, b, c]) => [a + 3, b + 3, c + 3] as const)],
    };
    const { models, references } = mergeBoth([colliding, near], [[0, 0, 0]], false);
    const runs = indexRuns(models[0]!);
    if (indexed) {
      // Both colliding vertices sit in one hash run, so the lookup really sees the collision.
      expect(runs?.split(' ').some((run) => /:(.*,)?0,1(,|$)/.test(run))).toBe(true);
    } else {
      expect(runs).toBeUndefined();
    }
    expect(models[0]!.mergedNormals).toBeDefined();
    for (const [index, model] of models.entries()) {
      expect(fullDifference(model, references[index]!), `model ${index}`).toBeNull();
    }
  });

  it.each([
    ['through the index', 40],
    ['in the linear scan', 12],
  ])('merges a model with itself identically, including a vertex with itself, %s', (_label, vertexCount) => {
    const model = buildModel({ ...randomModel(31, vertexCount, 2 * vertexCount, 64), contourY: undefined });
    const reference = referenceCopy(model);
    ModelData.mergeNormals(model, model, 0, 0, 0, true);
    legacyMergeNormals(reference, reference, 0, 0, 0, true);
    expect(model.mergedNormals).toBeDefined();
    expect(indexRuns(model) !== undefined).toBe(vertexCount * vertexCount >= 1024);
    expect(fullDifference(model, reference)).toBeNull();
  });

  it('widens merged sums past the Int32 bound instead of wrapping', () => {
    const near: ModelSpec = {
      vertices: [
        [0, 0, 0],
        [64, 0, 0],
        [0, 0, 64],
      ],
      faces: [[0, 1, 2]],
    };
    const [first, second] = [buildModel(near), buildModel(near)];
    const count = 5_000_000;
    for (const model of [first!, second!]) {
      model.calculateVertexNormals();
      model.normals = new Int32Array(3 * VERTEX_NORMAL_STRIDE).fill(0);
      model.normals.set([256 * count, -256 * count, 7, count], 0);
    }
    ModelData.mergeNormals(first!, second!, 0, 0, 0, false);
    expect(first!.mergedNormals?.sums).toBeInstanceOf(Float64Array);
    expect(Array.from(first!.mergedNormals!.sums.subarray(0, 4))).toEqual([512 * count, -512 * count, 14, 2 * count]);
    expect(2 * count).toBeGreaterThan(MAX_INT32_NORMAL_COUNT);
  });

  it('widens seam normals a copy shares, so the original and the copy keep merging into the same sums', () => {
    const triangle: ModelSpec = {
      vertices: [
        [0, 0, 0],
        [64, 0, 0],
        [0, 0, 64],
      ],
      faces: [[0, 1, 2]],
    };
    const models = [triangle, triangle, triangle].map(buildModel);
    const references = models.map(referenceCopy);
    // Large preset counts on vertex 0, so the third merge into it outgrows the Int32 bound.
    const count = 3_000_000;
    for (const [index, model] of models.entries()) {
      const sums = [256 * count, -255 * count, index + 1, count];
      model.normals = new Int32Array(3 * VERTEX_NORMAL_STRIDE);
      model.normals.set(sums, 0);
      const normals = [new LegacyVertexNormal(), new LegacyVertexNormal(), new LegacyVertexNormal()];
      Object.assign(normals[0]!, { x: sums[0], y: sums[1], z: sums[2], magnitude: sums[3] });
      legacyState(references[index]!).normals = normals;
    }
    const [base, first, second] = models as [ModelData, ModelData, ModelData];
    const [baseReference, firstReference, secondReference] = references as [ModelData, ModelData, ModelData];

    ModelData.mergeNormals(base, first, 0, 0, 0, false);
    legacyMergeNormals(baseReference, firstReference, 0, 0, 0, false);
    // The copies share their originals' normals and seam normals, as `copyFrom` always has.
    const copy = ModelData.copyFrom(base, false, false, false, false);
    const copyReference = ModelData.copyFrom(baseReference, false, false, false, false);
    const baseState = legacyState(baseReference);
    Object.assign(legacyState(copyReference), { normals: baseState.normals, mergedNormals: baseState.mergedNormals });
    expect(copy.mergedNormals).toBe(base.mergedNormals);
    expect(base.mergedNormals?.sums).toBeInstanceOf(Int32Array);

    // Widened through the copy, then merged into again through the original.
    ModelData.mergeNormals(copy, second, 0, 0, 0, false);
    legacyMergeNormals(copyReference, secondReference, 0, 0, 0, false);
    ModelData.mergeNormals(base, first, 0, 0, 0, false);
    legacyMergeNormals(baseReference, firstReference, 0, 0, 0, false);

    expect(copy.mergedNormals).toBe(base.mergedNormals);
    expect(base.mergedNormals?.sums).toBeInstanceOf(Float64Array);
    expect(base.mergedNormals?.sums[3]).toBe(4 * count);
    for (const [label, model, reference] of [
      ['base', base, baseReference],
      ['copy', copy, copyReference],
      ['first', first, firstReference],
      ['second', second, secondReference],
    ] as const) {
      expect(fullDifference(model, reference), label).toBeNull();
    }
  });

  it('throws on a smooth face whose corner is not a used vertex, as the per-vertex normals did', () => {
    for (const corner of [3, -1]) {
      const spec: ModelSpec = {
        vertices: [
          [0, 0, 0],
          [64, 0, 0],
          [0, 0, 64],
        ],
        faces: [
          [0, 1, 2],
          [0, corner, 2],
        ],
      };
      const model = buildModel(spec);
      expect(() => model.calculateVertexNormals()).toThrow(RangeError);
      expect(model.normals).toBeUndefined();
      expect(() => model.computeLitColors(64, 768, ...LIGHT)).toThrow(RangeError);
      expect(() => legacyCalculateVertexNormals(referenceCopy(model))).toThrow(TypeError);

      // A flat-shaded face never touched the vertex normals, so it still does not throw.
      const flat = buildModel({ ...spec, renderTypes: [0, 1] });
      const flatReference = referenceCopy(flat);
      legacyCalculateVertexNormals(flatReference);
      expect(fullDifference(flat, flatReference)).toBeNull();
    }
  });

  it('chooses Int32 sums exactly while every component provably fits', () => {
    expect(allocateVertexNormalSums(2, MAX_INT32_NORMAL_COUNT)).toBeInstanceOf(Int32Array);
    expect(allocateVertexNormalSums(2, MAX_INT32_NORMAL_COUNT + 1)).toBeInstanceOf(Float64Array);
    expect(256 * MAX_INT32_NORMAL_COUNT).toBeLessThanOrEqual(0x7fffffff);
    expect(256 * (MAX_INT32_NORMAL_COUNT + 1)).toBeGreaterThan(0x7fffffff);
  });
});

describe('lighting scratch ownership', () => {
  it('shares normals with copies, and a copy that moves its vertices drops only its own', () => {
    const model = buildModel(randomModel(41, 20, 30, 64));
    model.calculateVertexNormals();
    const copy = ModelData.copyFrom(model, false, false, false, false);
    expect(copy.normals).toBe(model.normals);

    copy.translate(3, -5, 7);
    expect(copy.normals).toBeUndefined();
    expect(model.normals).toBeDefined();
    const reference = referenceCopy(copy);
    expect(fullDifference(copy, reference)).toBeNull();
  });

  it('rebuilds the merge index from the moved vertices after an invalidation', () => {
    const specs = [randomModel(51, 40, 60, 64), randomModel(52, 40, 60, 64)];
    const { models, references } = mergeBoth2(specs);
    expect(models[1]!.mergedNormals).toBeDefined();
    expect(indexRuns(models[1]!)).toBeDefined();
    for (const model of [...models, ...references]) model.rotate90();
    for (const reference of references) legacyInvalidate(reference);
    for (const model of models) expect(indexRuns(model)).toBeUndefined();
    ModelData.mergeNormals(models[0]!, models[1]!, 0, 0, 0, true);
    legacyMergeNormals(references[0]!, references[1]!, 0, 0, 0, true);
    for (const [index, model] of models.entries()) {
      expect(fullDifference(model, references[index]!), `model ${index}`).toBeNull();
    }
  });

  it('drops every piece of scratch on invalidation, and relights unmerged from the new vertices', () => {
    const specs = [randomModel(61, 40, 60, 64), randomModel(51, 40, 60, 64)];
    const { models } = mergeBoth2(specs);
    const model = models[1]!;
    model.computeLitColors(64, 768, ...LIGHT);
    const copy = ModelData.copyFrom(model, false, false, false, false);
    expect([model.mergedNormals, model.faceNormals, indexRuns(model)].every((piece) => piece !== undefined)).toBe(true);
    expect(model.isBoundsCalculated).toBe(true);

    model.translate(0, -8, 0);
    expect([model.normals, model.mergedNormals, model.faceNormals, indexRuns(model)]).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
    expect(model.isBoundsCalculated).toBe(false);
    // The copy keeps what it shared.
    expect(copy.mergedNormals).toBeDefined();
    expect(copy.normals).toBeDefined();
    const unmerged = referenceCopy(model);
    expect(fullDifference(model, unmerged)).toBeNull();
  });

  /**
   * One merge of the first model into the second, which builds the second's index. Uncontoured, so
   * the lattice vertices coincide.
   */
  function mergeBoth2(specs: readonly ModelSpec[]) {
    const models = specs.map((spec) => buildModel({ ...spec, contourY: undefined }));
    const references = models.map(referenceCopy);
    ModelData.mergeNormals(models[0]!, models[1]!, 0, 0, 0, true);
    legacyMergeNormals(references[0]!, references[1]!, 0, 0, 0, true);
    return { models, references };
  }
});

/**
 * The models Sol Heredit, Yama and Zuk light: every NPC, spotanim and LOC model whose colors are
 * computed, checked at `computeLitColors` against a reference copy of its geometry. Staged static
 * LOCs, whose normals merge across neighbors first, are checked after the merge instead, with the
 * reference replaying the same merges.
 */
/**
 * The NPC and spotanim cases compare against a reference computed from the same input, so they run
 * on the pinned cache setup downloads. The map case reads map squares with the golden cache's XTEA
 * keys (`ENCOUNTER_MAP_SQUARES`), so it needs that cache.
 */
const noPinnedCache = skipWithoutRealCache('pinned');
const noGoldenCache = skipWithoutRealCache('golden');

describe('lighting scratch equivalence on the real Sol, Yama and Zuk models', () => {
  const failures: string[] = [];
  let checked = 0;

  function checkEveryLighting(label: () => string): void {
    const original = ModelData.prototype.computeLitColors;
    vi.spyOn(ModelData.prototype, 'computeLitColors').mockImplementation(function (this: ModelData, ...args) {
      // Merged models are checked where they merge; a reference copy has no merges to replay.
      const reference = this.mergedNormals ? undefined : referenceCopy(this);
      const colors = original.apply(this, args);
      if (reference) {
        const expected = legacyComputeLitColors(reference, ...args);
        const lit = (['faceColors1', 'faceColors2', 'faceColors3'] as const).find(
          (key) => !sameBytes(colors[key], expected[key]),
        );
        const difference = lit ? `${lit} differ` : scratchDifference(this, reference);
        if (difference) failures.push(`${label()}: ${difference}`);
        checked++;
      }
      return colors;
    });
  }

  afterEach(() => {
    failures.length = 0;
    checked = 0;
  });

  it.skipIf(noPinnedCache)(
    'NPC models',
    async () => {
      const loader = await openNpcModelLoader('pinned');
      let current = '';
      checkEveryLighting(() => current);
      for (const npcId of encounterNpcIds()) {
        current = `NPC ${npcId}`;
        expect(loader.loadNpcModelData(npcId)?.mergedModel, current).toBeTruthy();
      }
      expect(failures.slice(0, 5)).toEqual([]);
      expect(checked).toBeGreaterThan(10);
    },
    120_000,
  );

  it.skipIf(noPinnedCache)(
    'spotanim models: static, frame-animated and every skeletal pose',
    async () => {
      const { loader, animation } = await openSpotAnimModelLoader('pinned');
      let current = '';
      checkEveryLighting(() => current);
      const ids = encounterSpotAnimIds();
      const poses = visitSpotAnimModels(loader, animation, ids, (label) => {
        current = label;
      });
      expect(failures.slice(0, 5)).toEqual([]);
      expect(poses).toBeGreaterThan(0);
      expect(checked).toBeGreaterThan(ids.size);
    },
    300_000,
  );

  it.skipIf(noGoldenCache)(
    'map LOC models: staged static LOCs after their normal merges, and every other LOC model lit',
    async () => {
      const { loader, maps } = await openLocModelLoader();
      let current = '';
      checkEveryLighting(() => current);
      let merges = 0;
      let stagedChecked = 0;
      onStagedMerge = (staged) => {
        // Taken before the merge hides faces; like the merge's own isolation, each copy owns its
        // render types and starts without merged normals.
        const references = new Map<ModelData, ModelData>();
        for (const { model } of staged) if (!references.has(model)) references.set(model, referenceCopy(model));
        return (calls) => afterMerge(staged, references, calls);
      };
      const afterMerge = (
        staged: readonly StagedStaticLoc[],
        references: Map<ModelData, ModelData>,
        calls: MergeCall[],
      ) => {
        for (const [model0, model1, x, y, z, hide] of calls) {
          legacyMergeNormals(references.get(model0)!, references.get(model1)!, x, y, z, hide);
        }
        merges += calls.length;
        for (const { model, ...entry } of staged) {
          const ambient = (entry as { ambient?: number }).ambient ?? 64;
          const contrast = (entry as { contrast?: number }).contrast ?? 768;
          const difference = fullDifference(model, references.get(model)!, ambient, contrast);
          if (difference) failures.push(`${current} staged ${entry.objectIndex}/${entry.partIndex}: ${difference}`);
          stagedChecked++;
        }
      };

      for (const { kind, locs, options } of await loadEncounterLocs(loader, maps)) {
        current = kind;
        const renderer = new LocRenderer();
        await renderer.load(loader, locs, options);
        renderer.dispose();
      }
      expect(failures.slice(0, 5)).toEqual([]);
      expect(merges).toBeGreaterThan(1000);
      expect(stagedChecked).toBeGreaterThan(1000);
      expect(checked).toBeGreaterThan(1000);
    },
    300_000,
  );
});
