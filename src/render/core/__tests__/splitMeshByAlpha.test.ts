import { afterEach, describe, expect, it } from 'vitest';
import {
  applySplitMap,
  buildFaceSplitMap,
  createSplitMapBuffers,
  resetFaceSplitScratchForTests,
  splitTriangleSoupByAlpha,
  type TriangleSoup,
} from '../splitMeshByAlpha';

afterEach(resetFaceSplitScratchForTests);

function makeMesh(
  alphaPerTriangle: number[],
  opts: { faceBias?: boolean; modelFaceIndices?: boolean } = {},
): TriangleSoup {
  const triCount = alphaPerTriangle.length;
  const vertCount = triCount * 3;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const hslColors = new Float32Array(vertCount);
  const alphas = new Float32Array(vertCount);
  const faceBias = opts.faceBias ? new Float32Array(vertCount) : undefined;
  const modelFaceIndices = opts.modelFaceIndices ? new Uint32Array(triCount) : undefined;

  for (let tri = 0; tri < triCount; tri++) {
    for (let v = 0; v < 3; v++) {
      const vert = tri * 3 + v;
      positions[vert * 3] = tri * 10 + v;
      positions[vert * 3 + 1] = tri * 10 + v + 0.5;
      positions[vert * 3 + 2] = tri * 10 + v + 0.25;
      normals[vert * 3] = -tri;
      normals[vert * 3 + 1] = v;
      normals[vert * 3 + 2] = tri + v;
      hslColors[vert] = tri * 3 + v;
      alphas[vert] = alphaPerTriangle[tri];
      if (faceBias) faceBias[vert] = tri * 0.125 + v;
    }
    if (modelFaceIndices) modelFaceIndices[tri] = tri * 7 + 3;
  }

  return { positions, normals, hslColors, alphas, faceBias, modelFaceIndices };
}

/** The derivation NpcInstanceManager now performs instead of a second split. */
function derive(mesh: TriangleSoup) {
  const splitMap = buildFaceSplitMap(mesh.alphas, mesh.positions.length / 3);
  const buffers = createSplitMapBuffers(splitMap);
  applySplitMap(splitMap, mesh.positions, mesh.normals, mesh.hslColors, mesh.alphas, mesh.faceBias, buffers);

  const triIndices = splitMap.transparentTriIndices;
  const hasTransparent = triIndices.length > 0;
  let modelFaceIndices: Uint32Array | undefined;
  if (hasTransparent && mesh.modelFaceIndices) {
    modelFaceIndices = new Uint32Array(triIndices.length);
    for (let i = 0; i < triIndices.length; i++) {
      modelFaceIndices[i] = mesh.modelFaceIndices[triIndices[i]];
    }
  }
  return {
    hasTransparent,
    modelFaceIndices,
    hslColors: hasTransparent ? buffers.transparentHslColors : undefined,
    alphas: hasTransparent ? buffers.transparentAlphas : undefined,
    faceBias: hasTransparent && mesh.faceBias ? buffers.transparentFaceBias : undefined,
    positions: hasTransparent ? buffers.transparentPositions : undefined,
    normals: hasTransparent ? buffers.transparentNormals : undefined,
  };
}

const OPAQUE = 1;
const CLEAR = 0.4;

const cases: { name: string; alphas: number[]; faceBias: boolean; modelFaceIndices: boolean }[] = [
  {
    name: 'mixed opaque and transparent',
    alphas: [OPAQUE, CLEAR, OPAQUE, CLEAR, CLEAR],
    faceBias: true,
    modelFaceIndices: true,
  },
  { name: 'all transparent', alphas: [CLEAR, CLEAR, CLEAR], faceBias: true, modelFaceIndices: true },
  { name: 'all opaque', alphas: [OPAQUE, OPAQUE], faceBias: true, modelFaceIndices: true },
  { name: 'mixed without faceBias', alphas: [OPAQUE, CLEAR, CLEAR], faceBias: false, modelFaceIndices: true },
  { name: 'mixed without modelFaceIndices', alphas: [OPAQUE, CLEAR], faceBias: true, modelFaceIndices: false },
  { name: 'single transparent triangle', alphas: [CLEAR], faceBias: true, modelFaceIndices: true },
  {
    name: 'alpha exactly at the opaque threshold',
    alphas: [0.999, 0.9989, OPAQUE],
    faceBias: true,
    modelFaceIndices: true,
  },
  { name: 'empty mesh', alphas: [], faceBias: true, modelFaceIndices: true },
];

describe('split-map derivation matches splitTriangleSoupByAlpha', () => {
  for (const { name, alphas, faceBias, modelFaceIndices } of cases) {
    it(name, () => {
      const mesh = makeMesh(alphas, { faceBias, modelFaceIndices });
      const reference = splitTriangleSoupByAlpha(mesh);
      const derived = derive(mesh);

      expect(derived.hasTransparent).toBe(reference.transparent !== null);

      if (!reference.transparent) {
        expect(derived.modelFaceIndices).toBeUndefined();
        return;
      }

      if (reference.transparentModelFaceIndices) {
        expect(derived.modelFaceIndices).toBeInstanceOf(Uint32Array);
        expect(Array.from(derived.modelFaceIndices!)).toEqual(Array.from(reference.transparentModelFaceIndices));
      } else {
        expect(derived.modelFaceIndices).toBeUndefined();
      }

      expect(Array.from(derived.hslColors!)).toEqual(Array.from(reference.transparent.hslColors));
      expect(Array.from(derived.alphas!)).toEqual(Array.from(reference.transparent.alphas));

      if (reference.transparent.faceBias) {
        expect(Array.from(derived.faceBias!)).toEqual(Array.from(reference.transparent.faceBias));
      } else {
        expect(derived.faceBias).toBeUndefined();
      }

      expect(Array.from(derived.positions!)).toEqual(Array.from(reference.transparent.positions));
      expect(Array.from(derived.normals!)).toEqual(Array.from(reference.transparent.normals));
    });
  }

  it('keeps opaque buffers in agreement too', () => {
    const mesh = makeMesh([OPAQUE, CLEAR, OPAQUE, CLEAR], { faceBias: true, modelFaceIndices: true });
    const reference = splitTriangleSoupByAlpha(mesh);
    const splitMap = buildFaceSplitMap(mesh.alphas, mesh.positions.length / 3);
    const buffers = createSplitMapBuffers(splitMap);
    applySplitMap(splitMap, mesh.positions, mesh.normals, mesh.hslColors, mesh.alphas, mesh.faceBias, buffers);

    expect(reference.opaque).not.toBeNull();
    expect(Array.from(buffers.opaquePositions)).toEqual(Array.from(reference.opaque!.positions));
    expect(Array.from(buffers.opaqueNormals)).toEqual(Array.from(reference.opaque!.normals));
    expect(Array.from(buffers.opaqueHslColors)).toEqual(Array.from(reference.opaque!.hslColors));
    expect(Array.from(buffers.opaqueAlphas)).toEqual(Array.from(reference.opaque!.alphas));
  });

  it('produces exact-length transparent buffers, so the reuse check stays valid', () => {
    const mesh = makeMesh([OPAQUE, CLEAR, CLEAR], { faceBias: true, modelFaceIndices: true });
    const splitMap = buildFaceSplitMap(mesh.alphas, mesh.positions.length / 3);
    const buffers = createSplitMapBuffers(splitMap);

    expect(buffers.transparentHslColors.length).toBe(splitMap.transparentVertCount);
    expect(buffers.transparentAlphas.length).toBe(splitMap.transparentVertCount);
    expect(buffers.transparentPositions.length).toBe(splitMap.transparentVertCount * 3);
  });
});

describe('splitTriangleSoupByAlpha', () => {
  function makeSoup() {
    return {
      positions: new Float32Array([
        // Triangle 1
        0, 0, 0, 1, 0, 0, 0, 1, 0,
        // Triangle 2
        0, 0, 0, 1, 0, 0, 0, 1, 1,
        // Triangle 3
        0, 0, 0, 1, 1, 0, 1, 0, 1,
      ]),
      normals: new Float32Array(27),
      hslColors: new Float32Array(9),
      alphas: new Float32Array([1, 1, 1, 0.2, 0.2, 0.2, 1, 1, 1]),
    };
  }

  it('separates mixed meshes into opaque and transparent buckets', () => {
    const result = splitTriangleSoupByAlpha(makeSoup());

    expect(result.opaque).toBeTruthy();
    expect(result.transparent).toBeTruthy();
    expect(result.opaque?.positions.length).toBe(18);
    expect(result.opaque?.normals.length).toBe(18);
    expect(result.opaque?.hslColors.length).toBe(6);
    expect(result.opaque?.alphas.length).toBe(6);
    expect(result.transparent?.positions.length).toBe(9);
    expect(result.transparent?.normals.length).toBe(9);
    expect(result.transparent?.hslColors.length).toBe(3);
    expect(result.transparent?.alphas.length).toBe(3);
    expect(result.opaque?.alphas.every((value) => value >= 0.999)).toBe(true);
    expect(result.transparent?.alphas.every((value) => value < 0.999)).toBe(true);
  });

  it('returns whole mesh as opaque when no transparent triangles exist', () => {
    const mesh = makeSoup();
    mesh.alphas.fill(1);

    const result = splitTriangleSoupByAlpha(mesh);

    expect(result.transparent).toBeNull();
    expect(result.opaque).toBe(mesh);
  });

  it('splits a soup without normals into the same buckets, carrying no normals', () => {
    const lit = makeMesh([1, 0.2, 1, 0.5], { faceBias: true, modelFaceIndices: true });
    const { normals: _normals, ...unlit } = lit;

    const reference = splitTriangleSoupByAlpha(lit);
    const result = splitTriangleSoupByAlpha(unlit);

    for (const bucket of ['opaque', 'transparent'] as const) {
      const { normals, ...expected } = reference[bucket] ?? expect.fail(`missing ${bucket}`);
      expect(normals).toHaveLength(18);
      expect(result[bucket]?.normals).toBeUndefined();
      expect({ ...result[bucket], normals: undefined }).toEqual({ ...expected, normals: undefined });
    }
    expect(result.transparentModelFaceIndices).toEqual(reference.transparentModelFaceIndices);
  });

  it('returns whole mesh as transparent when no opaque triangles exist', () => {
    const mesh = makeSoup();
    mesh.alphas.fill(0.5);

    const result = splitTriangleSoupByAlpha(mesh);

    expect(result.opaque).toBeNull();
    expect(result.transparent).toBe(mesh);
  });
});

describe('buildFaceSplitMap', () => {
  /** The original allocation-per-call derivation, kept as the oracle for the scratch-reusing one. */
  function referenceSplitMap(alphas: Float32Array, totalVertexCount: number, opaqueThreshold = 0.999) {
    const opaque: number[] = [];
    const transparent: number[] = [];
    for (let tri = 0; tri < totalVertexCount / 3; tri++) {
      (alphas[tri * 3] >= opaqueThreshold ? opaque : transparent).push(tri);
    }
    return {
      opaqueTriIndices: new Uint32Array(opaque),
      transparentTriIndices: new Uint32Array(transparent),
      opaqueVertCount: opaque.length * 3,
      transparentVertCount: transparent.length * 3,
    };
  }

  function expectSameMap(actual: ReturnType<typeof buildFaceSplitMap>, expected: ReturnType<typeof referenceSplitMap>) {
    expect(actual).toEqual(expected);
    // Exact-length arrays of their own, never views of the scratch.
    expect(actual.opaqueTriIndices.buffer.byteLength).toBe(expected.opaqueTriIndices.byteLength);
    expect(actual.transparentTriIndices.buffer.byteLength).toBe(expected.transparentTriIndices.byteLength);
  }

  function alphasFor(opaque: readonly boolean[]): Float32Array {
    return new Float32Array(opaque.flatMap((isOpaque) => (isOpaque ? [1, 1, 1] : [0.5, 0.5, 0.5])));
  }

  it('builds from a cold scratch, grows it, and reuses it without leaking a longer call into a shorter one', () => {
    const calls = [
      alphasFor([true, false]), // cold: the scratch is allocated
      alphasFor([false, true, true, false, true]), // grows
      alphasFor([true]), // reuses the grown scratch; the earlier indices past its count must not show
      alphasFor([false, false, true]),
    ];
    const maps = calls.map((alphas) => buildFaceSplitMap(alphas, alphas.length));
    calls.forEach((alphas, index) => {
      expectSameMap(maps[index]!, referenceSplitMap(alphas, alphas.length));
    });
  });

  it('matches the per-call derivation byte for byte across a shared, rewritten alphas buffer', () => {
    // One buffer rewritten between calls, as the NPC posing scratch is shared by every alpha-animated NPC.
    const scratch = new Float32Array(3 * 64);
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    const earlier: [ReturnType<typeof buildFaceSplitMap>, ReturnType<typeof referenceSplitMap>][] = [];
    for (let call = 0; call < 200; call++) {
      const triangles = 1 + Math.floor(random() * 64);
      const alphas = scratch.subarray(0, triangles * 3);
      for (let tri = 0; tri < triangles; tri++) {
        alphas.fill(random() < 0.7 ? 1 - random() * 0.0009 : random() * 0.998, tri * 3, tri * 3 + 3);
      }
      const threshold = call % 17 === 0 ? 0.5 : 0.999;
      const map = buildFaceSplitMap(alphas, alphas.length, threshold);
      const expected = referenceSplitMap(alphas, alphas.length, threshold);
      expectSameMap(map, expected);
      earlier.push([map, expected]);
    }
    // A map, once returned, never changes under later calls.
    for (const [map, expected] of earlier) expectSameMap(map, expected);
  });

  it('visits a partial last triangle as the per-call derivation did', () => {
    const alphas = new Float32Array([1, 1, 1, 0.5, 0.5]);
    expectSameMap(buildFaceSplitMap(alphas, 5), referenceSplitMap(alphas, 5));
  });

  it('handles an empty soup', () => {
    expectSameMap(buildFaceSplitMap(new Float32Array(0), 0), referenceSplitMap(new Float32Array(0), 0));
  });
});
