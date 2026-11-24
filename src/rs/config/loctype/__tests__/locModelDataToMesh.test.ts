import { describe, expect, it } from 'vitest';
import { ModelData } from '../../../model/ModelData';
import { locModelDataToMesh } from '../LocModelLoader';

describe('locModelDataToMesh', () => {
  it('normalizes only the -1 faceBias sentinel while preserving other signed bytes as unsigned', () => {
    const model = new ModelData();
    model.verticesCount = 4;
    model.usedVertexCount = 4;
    model.faceCount = 2;
    model.verticesX = new Int32Array([0, 128, 0, 128]);
    model.verticesY = new Int32Array([0, 0, 0, 0]);
    model.verticesZ = new Int32Array([0, 0, 128, 128]);
    model.indices1 = new Int32Array([0, 1]);
    model.indices2 = new Int32Array([1, 3]);
    model.indices3 = new Int32Array([2, 2]);
    model.faceBias = new Int8Array([-1, -2]);

    const meshData = locModelDataToMesh(model, {
      faceColors1: new Int32Array([100, 200]),
      faceColors2: new Int32Array([101, 201]),
      faceColors3: new Int32Array([102, 202]),
    });

    expect(Array.from(meshData.faceBias ?? [])).toEqual([0, 0, 0, 254, 254, 254]);
  });

  it('emits per-vertex uvs and texture layers only when a resolver is supplied', () => {
    const model = new ModelData();
    model.verticesCount = 4;
    model.usedVertexCount = 4;
    model.faceCount = 2;
    model.verticesX = new Int32Array([0, 128, 0, 128]);
    model.verticesY = new Int32Array([0, 0, 0, 0]);
    model.verticesZ = new Int32Array([0, 0, 128, 128]);
    model.indices1 = new Int32Array([0, 1]);
    model.indices2 = new Int32Array([1, 3]);
    model.indices3 = new Int32Array([2, 2]);
    model.faceTextures = new Int16Array([40, -1]);
    const litColors = {
      faceColors1: new Int32Array([100, 200]),
      faceColors2: new Int32Array([101, 201]),
      faceColors3: new Int32Array([102, 202]),
    };

    const withoutResolver = locModelDataToMesh(model, litColors);
    expect(withoutResolver.uvs).toBeUndefined();
    expect(withoutResolver.textureIds).toBeUndefined();

    const withResolver = locModelDataToMesh(model, litColors, (textureId) => (textureId === 40 ? 7 : 0));

    // textureCoords is absent, so the textured face falls back to the constant
    // (0,0) (1,0) (0,1) basis; the untextured face gets layer 0 and zeroed uvs.
    expect(Array.from(withResolver.textureIds ?? [])).toEqual([7, 7, 7, 0, 0, 0]);
    expect(Array.from(withResolver.uvs ?? [])).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
  });
});
