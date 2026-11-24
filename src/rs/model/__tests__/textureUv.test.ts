import { describe, expect, it } from 'vitest';
import { ModelData } from '../ModelData';
import { modelDataToMesh } from '../NpcModelLoader';
import {
  computeFaceTextureUv,
  type FaceTextureGeometry,
  faceTextureLayer,
  modelHasTextures,
  writeFaceTextureAttributes,
} from '../textureUv';

function planarGeometry(overrides: Partial<FaceTextureGeometry> = {}): FaceTextureGeometry {
  return {
    // 0..2 are the texture triangle, 3..5 are the face triangle.
    verticesX: [0, 2, 0, 1, 0, 2],
    verticesY: [0, 0, 2, 0, 1, 0],
    verticesZ: [0, 0, 0, 0, 0, 0],
    indices1: [3],
    indices2: [4],
    indices3: [5],
    textureCoords: [0],
    textureMappingP: [0],
    textureMappingM: [1],
    textureMappingN: [2],
    ...overrides,
  };
}

function uvOf(geometry: FaceTextureGeometry, face = 0): number[] {
  const out = new Float32Array(6);
  computeFaceTextureUv(geometry, face, out, 0);
  return Array.from(out);
}

/** Float32 round-trip and signed zero make exact array equality unusable here. */
function expectNumbersClose(actual: ArrayLike<number>, expected: readonly number[]): void {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 6);
  }
}

describe('modelHasTextures', () => {
  it('is false without a faceTextures array', () => {
    expect(modelHasTextures(undefined, 4)).toBe(false);
    expect(modelHasTextures(null, 4)).toBe(false);
  });

  it('is false when every face is untextured', () => {
    expect(modelHasTextures(new Int16Array([-1, -1, -1]), 3)).toBe(false);
  });

  it('is true when any face within faceCount carries a texture', () => {
    expect(modelHasTextures(new Int16Array([-1, 7, -1]), 3)).toBe(true);
  });

  it('ignores entries past faceCount', () => {
    expect(modelHasTextures(new Int16Array([-1, -1, 7]), 2)).toBe(false);
  });
});

describe('faceTextureLayer', () => {
  const resolver = (id: number) => (id === 7 ? 3 : -1);

  it('returns 0 without faceTextures or a resolver', () => {
    expect(faceTextureLayer(undefined, 0, resolver)).toBe(0);
    expect(faceTextureLayer(new Int16Array([7]), 0, undefined)).toBe(0);
  });

  it('returns 0 for untextured faces', () => {
    expect(faceTextureLayer(new Int16Array([-1]), 0, resolver)).toBe(0);
  });

  it('returns the resolved texture-array layer', () => {
    expect(faceTextureLayer(new Int16Array([7]), 0, resolver)).toBe(3);
  });

  it('returns 0 when the texture is not resident in the array', () => {
    expect(faceTextureLayer(new Int16Array([99]), 0, resolver)).toBe(0);
  });
});

describe('computeFaceTextureUv', () => {
  it('projects the face triangle onto the texture triangle basis', () => {
    expectNumbersClose(uvOf(planarGeometry()), [0.5, 0, 0, 0.5, 1, 0]);
  });

  it('maps the texture triangle onto itself as (0,0) (1,0) (0,1)', () => {
    const geometry = planarGeometry({ indices1: [0], indices2: [1], indices3: [2] });
    expectNumbersClose(uvOf(geometry), [0, 0, 1, 0, 0, 1]);
  });

  it('is invariant under a rigid transform of the whole model', () => {
    // Translating both the texture triangle and the face by the same offset must
    // not move the UVs — this is what keeps posed/animated models stable.
    const base = planarGeometry();
    const shifted = planarGeometry({
      verticesX: Array.from(base.verticesX, (x) => x + 37),
      verticesY: Array.from(base.verticesY, (y) => y - 11),
      verticesZ: Array.from(base.verticesZ, (z) => z + 5),
    });
    expectNumbersClose(uvOf(shifted), uvOf(base));
  });

  it('falls back to (0,0) (1,0) (0,1) when the face has no texture triangle', () => {
    // textureCoords === -1 means the cache collapsed the texture triangle onto
    // the face triangle (RuneLite ModelDefinition.computeTextureUVCoordinates).
    expectNumbersClose(uvOf(planarGeometry({ textureCoords: [-1] })), [0, 0, 1, 0, 0, 1]);
  });

  it('falls back when the texture mapping arrays are absent', () => {
    expectNumbersClose(uvOf(planarGeometry({ textureMappingP: undefined })), [0, 0, 1, 0, 0, 1]);
  });

  it('masks the texture-triangle index to a byte, as the RuneLite port does', () => {
    // textureCoords is a signed byte in the cache; 0x81 decodes to -127.
    const geometry = planarGeometry({
      textureCoords: new Int8Array([-127]),
      textureMappingP: new Int16Array(130).fill(0),
      textureMappingM: new Int16Array(130).fill(1),
      textureMappingN: new Int16Array(130).fill(2),
    });
    expectNumbersClose(uvOf(geometry), [0.5, 0, 0, 0.5, 1, 0]);
  });

  it('falls back instead of emitting NaN for a degenerate texture triangle', () => {
    // Collinear P/M/N: the basis has zero area and the ported math divides by zero.
    const geometry = planarGeometry({
      verticesX: [0, 1, 2, 1, 0, 2],
      verticesY: [0, 0, 0, 0, 1, 0],
    });
    const uv = uvOf(geometry);
    expect(uv.every(Number.isFinite)).toBe(true);
    expectNumbersClose(uv, [0, 0, 1, 0, 0, 1]);
  });
});

describe('writeFaceTextureAttributes', () => {
  it('writes the UV triple and repeats the layer across all three vertices', () => {
    const uvs = new Float32Array(6);
    const textureIds = new Float32Array(3);
    writeFaceTextureAttributes(planarGeometry(), 0, 4, uvs, textureIds, 0);

    expectNumbersClose(uvs, [0.5, 0, 0, 0.5, 1, 0]);
    expect(Array.from(textureIds)).toEqual([4, 4, 4]);
  });

  it('zeroes both attributes for an untextured face', () => {
    const uvs = new Float32Array([9, 9, 9, 9, 9, 9]);
    const textureIds = new Float32Array([9, 9, 9]);
    writeFaceTextureAttributes(planarGeometry(), 0, 0, uvs, textureIds, 0);

    expectNumbersClose(uvs, [0, 0, 0, 0, 0, 0]);
    expect(Array.from(textureIds)).toEqual([0, 0, 0]);
  });

  it('writes at the requested vertex offset without touching earlier vertices', () => {
    const uvs = new Float32Array(12);
    const textureIds = new Float32Array(6);
    writeFaceTextureAttributes(planarGeometry(), 0, 2, uvs, textureIds, 3);

    expectNumbersClose(uvs.subarray(0, 6), [0, 0, 0, 0, 0, 0]);
    expectNumbersClose(uvs.subarray(6), [0.5, 0, 0, 0.5, 1, 0]);
    expect(Array.from(textureIds)).toEqual([0, 0, 0, 2, 2, 2]);
  });
});

function texturedTriangleModel(): ModelData {
  const model = new ModelData();
  model.verticesCount = 3;
  model.usedVertexCount = 3;
  model.faceCount = 1;
  model.verticesX = new Int32Array([0, 128, 0]);
  model.verticesY = new Int32Array([0, 0, 0]);
  model.verticesZ = new Int32Array([0, 0, 128]);
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([0x03bf]);
  model.faceTextures = new Int16Array([42]);
  model.textureCoords = new Int8Array([-1]);
  return model;
}

describe('modelDataToMesh texture attributes', () => {
  it('emits no texture attributes without a resolver', () => {
    const mesh = modelDataToMesh(texturedTriangleModel());
    expect(mesh.uvs).toBeUndefined();
    expect(mesh.textureIds).toBeUndefined();
  });

  it('emits no texture attributes for a model with no textured faces', () => {
    const model = texturedTriangleModel();
    model.faceTextures = new Int16Array([-1]);
    const mesh = modelDataToMesh(model, undefined, { resolveTextureLayer: () => 5 });
    expect(mesh.uvs).toBeUndefined();
    expect(mesh.textureIds).toBeUndefined();
  });

  it('emits per-vertex UVs and the resolved layer for textured faces', () => {
    const mesh = modelDataToMesh(texturedTriangleModel(), undefined, {
      resolveTextureLayer: (id) => (id === 42 ? 5 : 0),
    });

    expect(Array.from(mesh.textureIds!)).toEqual([5, 5, 5]);
    expectNumbersClose(mesh.uvs!, [0, 0, 1, 0, 0, 1]);
    expect(mesh.uvs!.length).toBe((mesh.positions.length / 3) * 2);
    expect(mesh.textureIds!.length).toBe(mesh.positions.length / 3);
  });

  it('leaves texture attributes zeroed for faces whose texture is not resident', () => {
    const mesh = modelDataToMesh(texturedTriangleModel(), undefined, { resolveTextureLayer: () => 0 });

    expect(Array.from(mesh.textureIds!)).toEqual([0, 0, 0]);
    expectNumbersClose(mesh.uvs!, [0, 0, 0, 0, 0, 0]);
  });
});
