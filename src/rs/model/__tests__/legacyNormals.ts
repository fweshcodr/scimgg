/**
 * Test-only object-based reference implementations of `ModelData`'s normal code, independent of its
 * compact typed storage: `calculateVertexNormals`, `getNormalMergeVertexIndex`,
 * `mergeNormals` and the normal-reading half of `computeLitColors`. Normals live in a side table
 * keyed by model, so a reference run never touches the model's own normal fields. Only the model's
 * vertices, faces, render types and bounds are read, and `mergeNormals` writes render types as the
 * production code does. Do not change these to follow production changes.
 */
import { ModelData } from '../ModelData';

export class LegacyVertexNormal {
  x = 0;
  y = 0;
  z = 0;
  magnitude = 0;

  static copy(other: LegacyVertexNormal): LegacyVertexNormal {
    const normal = new LegacyVertexNormal();
    normal.x = other.x;
    normal.y = other.y;
    normal.z = other.z;
    normal.magnitude = other.magnitude;
    return normal;
  }
}

export class LegacyFaceNormal {
  constructor(
    readonly x: number,
    readonly y: number,
    readonly z: number,
  ) {}
}

export interface LegacyNormalState {
  normals?: LegacyVertexNormal[];
  faceNormals?: LegacyFaceNormal[];
  mergedNormals?: LegacyVertexNormal[];
}

const states = new WeakMap<ModelData, LegacyNormalState>();
const indexCache = new WeakMap<ModelData, Map<number, number[]>>();

export function legacyState(model: ModelData): LegacyNormalState {
  let state = states.get(model);
  if (!state) {
    state = {};
    states.set(model, state);
  }
  return state;
}

export function legacyCalculateVertexNormals(model: ModelData): void {
  const state = legacyState(model);
  if (!state.normals) {
    state.normals = new Array(model.usedVertexCount);

    for (let i = 0; i < model.usedVertexCount; i++) {
      state.normals[i] = new LegacyVertexNormal();
    }

    const verticesY = model.contourVerticesY || model.verticesY;

    for (let i = 0; i < model.faceCount; i++) {
      const var2 = model.indices1[i];
      const var3 = model.indices2[i];
      const var4 = model.indices3[i];
      const var5 = model.verticesX[var3] - model.verticesX[var2];
      const var6 = verticesY[var3] - verticesY[var2];
      const var7 = model.verticesZ[var3] - model.verticesZ[var2];
      const var8 = model.verticesX[var4] - model.verticesX[var2];
      const var9 = verticesY[var4] - verticesY[var2];
      const var10 = model.verticesZ[var4] - model.verticesZ[var2];
      let var11 = var6 * var10 - var9 * var7;
      let var12 = var7 * var8 - var10 * var5;
      let var13 = var5 * var9 - var8 * var6;

      while (var11 > 8192 || var12 > 8192 || var13 > 8192 || var11 < -8192 || var12 < -8192 || var13 < -8192) {
        var11 >>= 1;
        var12 >>= 1;
        var13 >>= 1;
      }

      let var14 = Math.sqrt(var11 * var11 + var12 * var12 + var13 * var13) | 0;
      if (var14 <= 0) {
        var14 = 1;
      }

      var11 = ((var11 * 256) / var14) | 0;
      var12 = ((var12 * 256) / var14) | 0;
      var13 = ((var13 * 256) / var14) | 0;
      let type: number;
      if (!model.faceRenderTypes) {
        type = 0;
      } else {
        type = model.faceRenderTypes[i];
      }

      if (type === 0) {
        let normal = state.normals[var2];
        normal.x += var11;
        normal.y += var12;
        normal.z += var13;
        normal.magnitude++;
        normal = state.normals[var3];
        normal.x += var11;
        normal.y += var12;
        normal.z += var13;
        normal.magnitude++;
        normal = state.normals[var4];
        normal.x += var11;
        normal.y += var12;
        normal.z += var13;
        normal.magnitude++;
      } else if (type === 1) {
        if (!state.faceNormals) {
          state.faceNormals = new Array(model.faceCount);
        }

        state.faceNormals[i] = new LegacyFaceNormal(var11, var12, var13);
      }
    }
  }
}

function normalMergeVertexHash(x: number, y: number, z: number): number {
  return Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663) ^ Math.imul(z, 83_492_791);
}

export function legacyGetNormalMergeVertexIndex(model: ModelData, verticesY: Int32Array): Map<number, number[]> {
  const cached = indexCache.get(model);
  if (cached) return cached;
  const index = new Map<number, number[]>();
  for (let vertex = 0; vertex < model.usedVertexCount; vertex++) {
    const hash = normalMergeVertexHash(model.verticesX[vertex], verticesY[vertex], model.verticesZ[vertex]);
    const matches = index.get(hash) ?? [];
    matches.push(vertex);
    index.set(hash, matches);
  }
  indexCache.set(model, index);
  return index;
}

/** The reference `invalidate` effect on the normals: drops them, the merged normals and the merge index. */
export function legacyInvalidate(model: ModelData): void {
  states.delete(model);
  indexCache.delete(model);
}

/** The index `legacyMergeNormals` built for `model`, if it built one. */
export function legacyCachedNormalMergeVertexIndex(model: ModelData): Map<number, number[]> | undefined {
  return indexCache.get(model);
}

let mergeModelNormalsCount = 0;
const mergedNormalsModel0Cache = new Int32Array(10000);
const mergedNormalsModel1Cache = new Int32Array(10000);

export function legacyMergeNormals(
  model0: ModelData,
  model1: ModelData,
  offsetX: number,
  offsetY: number,
  offsetZ: number,
  hideOccludedFaces: boolean,
): void {
  model0.calculateBounds();
  legacyCalculateVertexNormals(model0);
  model1.calculateBounds();
  legacyCalculateVertexNormals(model1);
  const state0 = legacyState(model0);
  const state1 = legacyState(model1);

  if (!state0.normals || !state1.normals) {
    return;
  }

  mergeModelNormalsCount++;

  const verticesY0 = model0.contourVerticesY || model0.verticesY;
  const verticesY1 = model1.contourVerticesY || model1.verticesY;
  const model1VertexIndex =
    model1.usedVertexCount >= 16 && model0.usedVertexCount * model1.usedVertexCount >= 1024
      ? legacyGetNormalMergeVertexIndex(model1, verticesY1)
      : undefined;

  let mergedCount = 0;

  for (let v0 = 0; v0 < model0.usedVertexCount; v0++) {
    const normal0 = state0.normals[v0];
    if (normal0.magnitude === 0) {
      continue;
    }
    const y = verticesY0[v0] - offsetY;
    if (y > model1.minHeight) {
      continue;
    }
    const x = model0.verticesX[v0] - offsetX;
    if (x < model1.minX || x > model1.maxX) {
      continue;
    }
    const z = model0.verticesZ[v0] - offsetZ;
    if (z < model1.minZ || z > model1.maxZ) {
      continue;
    }

    const matchingVertices = model1VertexIndex?.get(normalMergeVertexHash(x, y, z));
    const candidateCount = model1VertexIndex ? (matchingVertices?.length ?? 0) : model1.usedVertexCount;
    for (let candidate = 0; candidate < candidateCount; candidate++) {
      const v1 = model1VertexIndex ? (matchingVertices?.[candidate] ?? -1) : candidate;
      const normal1 = state1.normals[v1];
      if (x !== model1.verticesX[v1] || z !== model1.verticesZ[v1] || y !== verticesY1[v1] || normal1.magnitude === 0) {
        continue;
      }

      if (!state0.mergedNormals) {
        state0.mergedNormals = new Array(model0.usedVertexCount);
      }
      if (!state1.mergedNormals) {
        state1.mergedNormals = new Array(model1.usedVertexCount);
      }

      let mergedNormal0 = state0.mergedNormals[v0];
      if (!mergedNormal0) {
        mergedNormal0 = state0.mergedNormals[v0] = LegacyVertexNormal.copy(normal0);
      }
      let mergedNormal1 = state1.mergedNormals[v1];
      if (!mergedNormal1) {
        mergedNormal1 = state1.mergedNormals[v1] = LegacyVertexNormal.copy(normal1);
      }

      mergedNormal0.x += normal1.x;
      mergedNormal0.y += normal1.y;
      mergedNormal0.z += normal1.z;
      mergedNormal0.magnitude += normal1.magnitude;
      mergedNormal1.x += normal0.x;
      mergedNormal1.y += normal0.y;
      mergedNormal1.z += normal0.z;
      mergedNormal1.magnitude += normal0.magnitude;

      mergedCount++;

      mergedNormalsModel0Cache[v0] = mergeModelNormalsCount;
      mergedNormalsModel1Cache[v1] = mergeModelNormalsCount;
    }
  }

  if (mergedCount >= 3 && hideOccludedFaces) {
    for (let i = 0; i < model0.faceCount; i++) {
      if (
        mergedNormalsModel0Cache[model0.indices1[i]] === mergeModelNormalsCount &&
        mergedNormalsModel0Cache[model0.indices2[i]] === mergeModelNormalsCount &&
        mergedNormalsModel0Cache[model0.indices3[i]] === mergeModelNormalsCount
      ) {
        if (!model0.faceRenderTypes) {
          model0.faceRenderTypes = new Int8Array(model0.faceCount);
        }

        model0.faceRenderTypes[i] = 2;
      }
    }
    for (let i = 0; i < model1.faceCount; i++) {
      if (
        mergedNormalsModel1Cache[model1.indices1[i]] === mergeModelNormalsCount &&
        mergedNormalsModel1Cache[model1.indices2[i]] === mergeModelNormalsCount &&
        mergedNormalsModel1Cache[model1.indices3[i]] === mergeModelNormalsCount
      ) {
        if (!model1.faceRenderTypes) {
          model1.faceRenderTypes = new Int8Array(model1.faceCount);
        }

        model1.faceRenderTypes[i] = 2;
      }
    }
  }
}

/** The reference `computeLitColors`, reading the reference normals instead of the model's. */
export function legacyComputeLitColors(
  model: ModelData,
  ambient: number,
  contrast: number,
  lightX: number,
  lightY: number,
  lightZ: number,
): { faceColors1: Int32Array; faceColors2: Int32Array; faceColors3: Int32Array } {
  legacyCalculateVertexNormals(model);
  const state = legacyState(model);
  const normals = state.normals;
  if (!normals) {
    throw new Error('Failed to calculate normals');
  }
  const litBrightness = (base: number, dot: number, denominator: number) => base + Math.trunc(dot / denominator);
  const pick = (vertex: number) => {
    const merged = state.mergedNormals?.[vertex];
    return merged ? merged : normals[vertex];
  };

  const magnitude = Math.sqrt(lightZ * lightZ + lightX * lightX + lightY * lightY) | 0;
  const lightIntensity = (magnitude * contrast) >> 8;

  const faceColors1 = new Int32Array(model.faceCount);
  const faceColors2 = new Int32Array(model.faceCount);
  const faceColors3 = new Int32Array(model.faceCount);

  for (let i = 0; i < model.faceCount; i++) {
    let type = model.faceRenderTypes ? model.faceRenderTypes[i] : 0;
    const alpha = model.faceAlphas ? model.faceAlphas[i] : 0;
    const texture = model.faceTextures ? model.faceTextures[i] : -1;
    if (alpha === -2) type = 3;
    if (alpha === -1) type = 2;

    if (texture === -1) {
      if (type === 0) {
        const color = model.faceColors[i] & 0xffff;
        let normal = pick(model.indices1[i]);
        let var14 =
          litBrightness(
            ambient,
            lightY * normal.y + lightZ * normal.z + lightX * normal.x,
            lightIntensity * normal.magnitude,
          ) << 17;
        faceColors1[i] = var14 | ModelData.adjustLightness(color, var14 >> 17);
        normal = pick(model.indices2[i]);
        var14 =
          litBrightness(
            ambient,
            lightY * normal.y + lightZ * normal.z + lightX * normal.x,
            lightIntensity * normal.magnitude,
          ) << 17;
        faceColors2[i] = var14 | ModelData.adjustLightness(color, var14 >> 17);
        normal = pick(model.indices3[i]);
        var14 =
          litBrightness(
            ambient,
            lightY * normal.y + lightZ * normal.z + lightX * normal.x,
            lightIntensity * normal.magnitude,
          ) << 17;
        faceColors3[i] = var14 | ModelData.adjustLightness(color, var14 >> 17);
      } else if (type === 1 && state.faceNormals) {
        const normal = state.faceNormals[i];
        const var14 =
          litBrightness(
            ambient,
            lightY * normal.y + lightZ * normal.z + lightX * normal.x,
            (lightIntensity >> 1) + lightIntensity,
          ) << 17;
        faceColors1[i] = var14 | ModelData.adjustLightness(model.faceColors[i] & 0xffff, var14 >> 17);
        faceColors3[i] = -1;
      } else if (type === 3) {
        faceColors1[i] = 128;
        faceColors3[i] = -1;
      } else {
        faceColors3[i] = -2;
      }
    } else if (type === 0) {
      let normal = pick(model.indices1[i]);
      let var14 = litBrightness(
        ambient,
        lightY * normal.y + lightZ * normal.z + lightX * normal.x,
        lightIntensity * normal.magnitude,
      );
      faceColors1[i] = ModelData.clampLightness(var14);
      normal = pick(model.indices2[i]);
      var14 = litBrightness(
        ambient,
        lightY * normal.y + lightZ * normal.z + lightX * normal.x,
        lightIntensity * normal.magnitude,
      );
      faceColors2[i] = ModelData.clampLightness(var14);
      normal = pick(model.indices3[i]);
      var14 = litBrightness(
        ambient,
        lightY * normal.y + lightZ * normal.z + lightX * normal.x,
        lightIntensity * normal.magnitude,
      );
      faceColors3[i] = ModelData.clampLightness(var14);
    } else if (type === 1 && state.faceNormals) {
      const normal = state.faceNormals[i];
      const var14 = litBrightness(
        ambient,
        lightY * normal.y + lightZ * normal.z + lightX * normal.x,
        (lightIntensity >> 1) + lightIntensity,
      );
      faceColors1[i] = ModelData.clampLightness(var14);
      faceColors3[i] = -1;
    } else {
      faceColors3[i] = -2;
    }
  }

  return { faceColors1, faceColors2, faceColors3 };
}
