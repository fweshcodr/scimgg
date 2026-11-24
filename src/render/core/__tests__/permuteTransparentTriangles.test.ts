import { describe, expect, it } from 'vitest';
import {
  buildTransparentFaceMap,
  type PermuteOutputBuffers,
  permuteTransparentTriangles,
  type TransparentFaceMap,
} from '../splitMeshByAlpha';

interface TransparentFixture {
  faceMap: TransparentFaceMap;
  sortedModelFaces: number[];
  positions: Float32Array;
  normals: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias: Float32Array;
}

function createFixture(): TransparentFixture {
  const triToModelFace = new Uint32Array([30, 10, 40, 20]);
  const faceMap = buildTransparentFaceMap(triToModelFace);
  const sortedModelFaces = [40, 20, 10, 30];

  const positions = new Float32Array(triToModelFace.length * 9);
  const normals = new Float32Array(triToModelFace.length * 9);
  const hslColors = new Float32Array(triToModelFace.length * 3);
  const alphas = new Float32Array(triToModelFace.length * 3);
  const faceBias = new Float32Array(triToModelFace.length * 3);

  for (let tri = 0; tri < triToModelFace.length; tri++) {
    const posBase = tri * 9;
    const attrBase = tri * 3;
    for (let i = 0; i < 9; i++) {
      positions[posBase + i] = tri * 100 + i + 1;
      normals[posBase + i] = tri * 1000 + i + 1;
    }
    for (let i = 0; i < 3; i++) {
      hslColors[attrBase + i] = tri * 10 + i + 1;
      alphas[attrBase + i] = tri * 10 + i + 4;
      faceBias[attrBase + i] = tri * 10 + i + 7;
    }
  }

  return {
    faceMap,
    sortedModelFaces,
    positions,
    normals,
    hslColors,
    alphas,
    faceBias,
  };
}

function collectExpectedBySortedFaces(
  sortedModelFaces: number[],
  faceMap: TransparentFaceMap,
  source: Float32Array,
  valuesPerFace: number,
): number[] {
  const out: number[] = [];
  for (const modelFace of sortedModelFaces) {
    const tri = faceMap.modelFaceToTri.get(modelFace);
    if (tri === undefined) {
      continue;
    }
    const base = tri * valuesPerFace;
    for (let i = 0; i < valuesPerFace; i++) {
      out.push(source[base + i]);
    }
  }
  return out;
}

describe('permuteTransparentTriangles', () => {
  it('permutes faces into the sorted model-face order', () => {
    const fixture = createFixture();

    const result = permuteTransparentTriangles(
      fixture.sortedModelFaces,
      fixture.faceMap,
      fixture.positions,
      fixture.normals,
      fixture.hslColors,
      fixture.alphas,
      fixture.faceBias,
    );

    expect(Array.from(result.positions)).toEqual(
      collectExpectedBySortedFaces(fixture.sortedModelFaces, fixture.faceMap, fixture.positions, 9),
    );
    expect(Array.from(result.normals)).toEqual(
      collectExpectedBySortedFaces(fixture.sortedModelFaces, fixture.faceMap, fixture.normals, 9),
    );
    expect(Array.from(result.hslColors)).toEqual(
      collectExpectedBySortedFaces(fixture.sortedModelFaces, fixture.faceMap, fixture.hslColors, 3),
    );
    expect(Array.from(result.alphas)).toEqual(
      collectExpectedBySortedFaces(fixture.sortedModelFaces, fixture.faceMap, fixture.alphas, 3),
    );
    expect(Array.from(result.faceBias ?? [])).toEqual(
      collectExpectedBySortedFaces(fixture.sortedModelFaces, fixture.faceMap, fixture.faceBias, 3),
    );
  });

  it('permutes every other attribute identically when there are no normals to permute', () => {
    const fixture = createFixture();
    const permute = (normals: Float32Array | undefined) =>
      normals
        ? permuteTransparentTriangles(
            fixture.sortedModelFaces,
            fixture.faceMap,
            fixture.positions,
            normals,
            fixture.hslColors,
            fixture.alphas,
            fixture.faceBias,
          )
        : permuteTransparentTriangles(
            fixture.sortedModelFaces,
            fixture.faceMap,
            fixture.positions,
            undefined,
            fixture.hslColors,
            fixture.alphas,
            fixture.faceBias,
            {
              positions: new Float32Array(1),
              hslColors: new Float32Array(0),
              alphas: new Float32Array(0),
              faceBias: undefined,
            },
          );

    const { normals, ...lit } = permute(fixture.normals);
    const unlit = permute(undefined);

    expect(normals).toHaveLength(fixture.normals.length);
    expect(unlit.normals).toBeUndefined();
    expect({ ...unlit, normals: undefined }).toEqual({ ...lit, normals: undefined });
  });

  it('reuses pre-allocated out buffers when capacity is sufficient', () => {
    const fixture = createFixture();
    const faceCount = fixture.sortedModelFaces.length;
    const vertCount = faceCount * 3;

    const out: PermuteOutputBuffers = {
      positions: new Float32Array(faceCount * 9 + 32),
      normals: new Float32Array(faceCount * 9 + 32),
      hslColors: new Float32Array(vertCount + 16),
      alphas: new Float32Array(vertCount + 16),
      faceBias: new Float32Array(vertCount + 16),
    };

    const result = permuteTransparentTriangles(
      fixture.sortedModelFaces,
      fixture.faceMap,
      fixture.positions,
      fixture.normals,
      fixture.hslColors,
      fixture.alphas,
      fixture.faceBias,
      out,
    );

    expect(result.positions.buffer).toBe(out.positions.buffer);
    expect(result.normals.buffer).toBe(out.normals.buffer);
    expect(result.hslColors.buffer).toBe(out.hslColors.buffer);
    expect(result.alphas.buffer).toBe(out.alphas.buffer);
    expect(result.faceBias?.buffer).toBe(out.faceBias?.buffer);
  });

  it('allocates fresh arrays when out buffers are too small', () => {
    const fixture = createFixture();
    const faceCount = fixture.sortedModelFaces.length;
    const vertCount = faceCount * 3;

    const out: PermuteOutputBuffers = {
      positions: new Float32Array(faceCount * 9 - 1),
      normals: new Float32Array(faceCount * 9 - 1),
      hslColors: new Float32Array(vertCount - 1),
      alphas: new Float32Array(vertCount - 1),
      faceBias: new Float32Array(vertCount - 1),
    };

    const result = permuteTransparentTriangles(
      fixture.sortedModelFaces,
      fixture.faceMap,
      fixture.positions,
      fixture.normals,
      fixture.hslColors,
      fixture.alphas,
      fixture.faceBias,
      out,
    );

    expect(result.positions.buffer).not.toBe(out.positions.buffer);
    expect(result.normals.buffer).not.toBe(out.normals.buffer);
    expect(result.hslColors.buffer).not.toBe(out.hslColors.buffer);
    expect(result.alphas.buffer).not.toBe(out.alphas.buffer);
    expect(result.faceBias?.buffer).not.toBe(out.faceBias?.buffer);
  });

  it('returns exact-length subarray views from oversized buffers', () => {
    const fixture = createFixture();
    const sortedSubset = fixture.sortedModelFaces.slice(0, 2);
    const faceCount = sortedSubset.length;
    const vertCount = faceCount * 3;

    const out: PermuteOutputBuffers = {
      positions: new Float32Array(99),
      normals: new Float32Array(99),
      hslColors: new Float32Array(99),
      alphas: new Float32Array(99),
      faceBias: new Float32Array(99),
    };

    const result = permuteTransparentTriangles(
      sortedSubset,
      fixture.faceMap,
      fixture.positions,
      fixture.normals,
      fixture.hslColors,
      fixture.alphas,
      fixture.faceBias,
      out,
    );

    expect(result.positions.length).toBe(faceCount * 9);
    expect(result.normals.length).toBe(faceCount * 9);
    expect(result.hslColors.length).toBe(vertCount);
    expect(result.alphas.length).toBe(vertCount);
    expect(result.faceBias?.length).toBe(vertCount);
  });

  it('returns undefined faceBias when source faceBias is undefined', () => {
    const fixture = createFixture();
    const faceCount = fixture.sortedModelFaces.length;
    const vertCount = faceCount * 3;

    const out: PermuteOutputBuffers = {
      positions: new Float32Array(faceCount * 9),
      normals: new Float32Array(faceCount * 9),
      hslColors: new Float32Array(vertCount),
      alphas: new Float32Array(vertCount),
      faceBias: new Float32Array(vertCount),
    };

    const result = permuteTransparentTriangles(
      fixture.sortedModelFaces,
      fixture.faceMap,
      fixture.positions,
      fixture.normals,
      fixture.hslColors,
      fixture.alphas,
      undefined,
      out,
    );

    expect(result.faceBias).toBeUndefined();
  });
});
