import { afterEach, describe, expect, it } from 'vitest';
import {
  applySplitMap,
  buildFaceSplitMap,
  buildTransparentFaceMap,
  createSplitMapBuffers,
  permuteTransparentTriangles,
  resetFaceSplitScratchForTests,
  splitTriangleSoupByAlpha,
  type TriangleSoup,
} from '../splitMeshByAlpha';

afterEach(resetFaceSplitScratchForTests);

/** Float32 round-trip makes exact array equality unusable for UV comparisons. */
function expectNumbersClose(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 6);
  }
}

/**
 * Three triangles: opaque, transparent, opaque. Each vertex carries a distinct
 * UV so a mis-indexed copy is visible, and a per-triangle texture layer.
 */
function texturedSoup(): TriangleSoup {
  const vertexCount = 9;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const textureIds = new Float32Array(vertexCount);
  const hslColors = new Float32Array(vertexCount);
  const alphas = new Float32Array(vertexCount);

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    positions[vertex * 3] = vertex;
    normals[vertex * 3 + 1] = 1;
    uvs[vertex * 2] = vertex / 10;
    uvs[vertex * 2 + 1] = 1 - vertex / 10;
    hslColors[vertex] = vertex;
    const triangle = Math.floor(vertex / 3);
    textureIds[vertex] = triangle === 1 ? 0 : triangle + 1;
    alphas[vertex] = triangle === 1 ? 0.5 : 1;
  }

  return { positions, normals, hslColors, alphas, uvs, textureIds, modelFaceIndices: new Uint32Array([0, 1, 2]) };
}

describe('splitTriangleSoupByAlpha texture attributes', () => {
  it('routes each triangle UV/layer to the matching alpha bucket', () => {
    const split = splitTriangleSoupByAlpha(texturedSoup());

    expect(Array.from(split.opaque!.textureIds!)).toEqual([1, 1, 1, 3, 3, 3]);
    expect(Array.from(split.transparent!.textureIds!)).toEqual([0, 0, 0]);
    // Opaque bucket keeps triangles 0 and 2 → source vertices 0,1,2 and 6,7,8.
    expectNumbersClose(split.opaque!.uvs!, [0, 1, 0.1, 0.9, 0.2, 0.8, 0.6, 0.4, 0.7, 0.3, 0.8, 0.2]);
    // Transparent bucket keeps triangle 1 → source vertices 3,4,5.
    expectNumbersClose(split.transparent!.uvs!, [0.3, 0.7, 0.4, 0.6, 0.5, 0.5]);
  });

  it('omits texture attributes for a soup that has none', () => {
    const soup = texturedSoup();
    const split = splitTriangleSoupByAlpha({ ...soup, uvs: undefined, textureIds: undefined });

    expect(split.opaque!.uvs).toBeUndefined();
    expect(split.opaque!.textureIds).toBeUndefined();
    expect(split.transparent!.textureIds).toBeUndefined();
  });
});

describe('applySplitMap texture attributes', () => {
  it('matches the full-split result when texture attributes are supplied', () => {
    const soup = texturedSoup();
    const splitMap = buildFaceSplitMap(soup.alphas, soup.positions.length / 3);
    const buffers = createSplitMapBuffers(splitMap, true);
    applySplitMap(splitMap, soup.positions, soup.normals, soup.hslColors, soup.alphas, undefined, buffers, {
      uvs: soup.uvs!,
      textureIds: soup.textureIds!,
    });

    const reference = splitTriangleSoupByAlpha(soup);
    expect(Array.from(buffers.opaqueUvs!)).toEqual(Array.from(reference.opaque!.uvs!));
    expect(Array.from(buffers.opaqueTextureIds!)).toEqual(Array.from(reference.opaque!.textureIds!));
    expect(Array.from(buffers.transparentUvs!)).toEqual(Array.from(reference.transparent!.uvs!));
    expect(Array.from(buffers.transparentTextureIds!)).toEqual(Array.from(reference.transparent!.textureIds!));
  });

  it('leaves texture buffers unallocated when no attributes are supplied', () => {
    const soup = texturedSoup();
    const splitMap = buildFaceSplitMap(soup.alphas, soup.positions.length / 3);
    const result = applySplitMap(splitMap, soup.positions, soup.normals, soup.hslColors, soup.alphas, undefined);

    expect(result.opaqueUvs).toBeUndefined();
    expect(result.transparentTextureIds).toBeUndefined();
  });
});

describe('permuteTransparentTriangles texture attributes', () => {
  it('reorders UVs and layers with the triangles', () => {
    const vertexCount = 6;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const hslColors = new Float32Array([0, 1, 2, 3, 4, 5]);
    const alphas = new Float32Array(vertexCount).fill(0.5);
    const uvs = new Float32Array([0, 0, 0, 1, 0, 2, 1, 0, 1, 1, 1, 2]);
    const textureIds = new Float32Array([7, 7, 7, 9, 9, 9]);
    const faceMap = buildTransparentFaceMap(new Uint32Array([0, 1]));

    // Draw order reversed: model face 1 first, then 0.
    const permuted = permuteTransparentTriangles(
      [1, 0],
      faceMap,
      positions,
      normals,
      hslColors,
      alphas,
      undefined,
      {
        positions: new Float32Array(vertexCount * 3),
        normals: new Float32Array(vertexCount * 3),
        hslColors: new Float32Array(vertexCount),
        alphas: new Float32Array(vertexCount),
        faceBias: undefined,
        uvs: new Float32Array(vertexCount * 2),
        textureIds: new Float32Array(vertexCount),
      },
      { uvs, textureIds },
    );

    expect(Array.from(permuted.textureIds!)).toEqual([9, 9, 9, 7, 7, 7]);
    expect(Array.from(permuted.uvs!)).toEqual([1, 0, 1, 1, 1, 2, 0, 0, 0, 1, 0, 2]);
  });

  it('omits texture attributes when none are supplied', () => {
    const faceMap = buildTransparentFaceMap(new Uint32Array([0]));
    const permuted = permuteTransparentTriangles(
      [0],
      faceMap,
      new Float32Array(9),
      new Float32Array(9),
      new Float32Array(3),
      new Float32Array(3),
      undefined,
    );

    expect(permuted.uvs).toBeUndefined();
    expect(permuted.textureIds).toBeUndefined();
  });
});
