/**
 * Test-only reference implementations of `modelDataToMesh` and `locModelDataToMesh` that build
 * their arrays incrementally rather than writing straight into preallocated typed arrays. The
 * equivalence tests pin the production functions to these byte for byte; do not change them to
 * follow production changes. `legacyNormalAt` reads the model's normals from their compact storage (see
 * `VertexNormal.ts`) as per-vertex objects.
 */
import {
  type LitColors as LocLitColors,
  type LocMeshData,
  PositiveModelHeight,
} from '../../config/loctype/LocModelLoader';
import type { ModelData } from '../ModelData';
import type { ModelToMeshOptions, NpcMeshData } from '../NpcModelLoader';
import {
  computeFaceTextureUv,
  type FaceTextureGeometry,
  faceTextureLayer,
  modelHasTextures,
  type TextureLayerResolver,
} from '../textureUv';
import { VERTEX_NORMAL_STRIDE } from '../VertexNormal';

/**
 * The object-shaped normal this reference reads, rebuilt from the compact sums `ModelData` stores:
 * present for exactly the vertices that have stored sums.
 */
function legacyNormalAt(model: ModelData, idx: number): { x: number; y: number; z: number } | undefined {
  const normals = model.normals;
  const at = idx * VERTEX_NORMAL_STRIDE;
  if (!normals || !(at >= 0 && at < normals.length)) return undefined;
  return { x: normals[at], y: normals[at + 1], z: normals[at + 2] };
}

interface LitColors {
  faceColors1: Int32Array;
  faceColors2: Int32Array;
  faceColors3: Int32Array;
}

export function legacyModelDataToMesh(
  model: ModelData,
  litColors?: LitColors,
  options?: ModelToMeshOptions & { sortedFaceOrder?: number[] },
): NpcMeshData {
  const faceCount = model.faceCount;

  model.calculateVertexNormals();

  const positionsList: number[] = [];
  const normalsList: number[] = [];
  const hslColorsList: number[] = [];
  const alphasList: number[] = [];
  const faceBiasList: number[] = [];
  const modelFaceIndicesList: number[] = [];
  const hasTextures = options?.resolveTextureLayer !== undefined && modelHasTextures(model.faceTextures, faceCount);
  const uvsList: number[] | undefined = hasTextures ? [] : undefined;
  const textureIdsList: number[] | undefined = hasTextures ? [] : undefined;
  const faceUv = new Float32Array(6);

  const faceOrder = options?.sortedFaceOrder;
  const iterCount = faceOrder ? faceOrder.length : faceCount;

  for (let i = 0; i < iterCount; i++) {
    const f = faceOrder ? faceOrder[i] : i;

    let hslA = litColors?.faceColors1[f] ?? model.faceColors[f];
    let hslB = litColors?.faceColors2[f] ?? model.faceColors[f];
    let hslC = litColors?.faceColors3[f] ?? model.faceColors[f];

    if (hslC === -2) {
      if (options?.renderTexturedAsBlack) {
        hslA = hslB = hslC = 0;
      } else {
        continue;
      }
    }

    if (hslC === -1) {
      hslC = hslB = hslA;
    }

    const i1 = model.indices1[f];
    const i2 = model.indices2[f];
    const i3 = model.indices3[f];

    const faceAlpha = model.faceAlphas ? (255 - (model.faceAlphas[f] & 0xff)) / 255 : 1.0;
    const fb = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : 0;
    let textureLayer = 0;
    if (hasTextures) {
      textureLayer = faceTextureLayer(model.faceTextures, f, options?.resolveTextureLayer);
      if (textureLayer > 0) {
        computeFaceTextureUv(model, f, faceUv, 0);
      } else {
        faceUv.fill(0);
      }
    }

    const indices = [i1, i2, i3];
    const colors = [hslA, hslB, hslC];
    for (let v = 0; v < 3; v++) {
      const idx = indices[v];
      positionsList.push(model.verticesX[idx]);
      positionsList.push(model.verticesY[idx]);
      positionsList.push(model.verticesZ[idx]);

      const n = legacyNormalAt(model, idx);
      if (n) {
        const mag = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
        normalsList.push(n.x / mag);
        normalsList.push(n.y / mag);
        normalsList.push(n.z / mag);
      } else {
        normalsList.push(0);
        normalsList.push(1);
        normalsList.push(0);
      }

      hslColorsList.push(colors[v] & 0xffff);
      alphasList.push(faceAlpha);
      faceBiasList.push(fb);
      if (uvsList && textureIdsList) {
        uvsList.push(faceUv[v * 2], faceUv[v * 2 + 1]);
        textureIdsList.push(textureLayer);
      }
    }
    modelFaceIndicesList.push(f);
  }

  return {
    positions: new Float32Array(positionsList),
    normals: new Float32Array(normalsList),
    hslColors: new Float32Array(hslColorsList),
    alphas: new Float32Array(alphasList),
    faceBias: new Float32Array(faceBiasList),
    modelFaceIndices: new Uint32Array(modelFaceIndicesList),
    ...(uvsList && textureIdsList
      ? { uvs: new Float32Array(uvsList), textureIds: new Float32Array(textureIdsList) }
      : {}),
  };
}

export function legacyLocModelDataToMesh(
  model: ModelData,
  litColors: LocLitColors,
  resolveTextureLayer?: TextureLayerResolver,
): LocMeshData {
  const faceCount = model.faceCount;

  model.calculateVertexNormals();
  model.calculateBounds();

  const positionsList: number[] = [];
  const normalsList: number[] = [];
  const hslColorsList: number[] = [];
  const alphasList: number[] = [];
  const faceBiasList: number[] | undefined = model.faceBias ? [] : undefined;
  const verticesY = model.contourVerticesY ?? model.verticesY;
  let hasTransparency = false;
  const hasTextures = resolveTextureLayer !== undefined && modelHasTextures(model.faceTextures, faceCount);
  const uvsList: number[] | undefined = hasTextures ? [] : undefined;
  const textureIdsList: number[] | undefined = hasTextures ? [] : undefined;
  const faceUv = new Float32Array(6);
  const uvGeometry: FaceTextureGeometry = {
    verticesX: model.verticesX,
    verticesY,
    verticesZ: model.verticesZ,
    indices1: model.indices1,
    indices2: model.indices2,
    indices3: model.indices3,
    textureCoords: model.textureCoords,
    textureMappingP: model.textureMappingP,
    textureMappingM: model.textureMappingM,
    textureMappingN: model.textureMappingN,
  };

  for (let f = 0; f < faceCount; f++) {
    const hslA = litColors.faceColors1[f];
    let hslB = litColors.faceColors2[f];
    let hslC = litColors.faceColors3[f];

    if (hslC === -2) {
      continue;
    }

    if (hslC === -1) {
      hslC = hslB = hslA;
    }

    const i1 = model.indices1[f];
    const i2 = model.indices2[f];
    const i3 = model.indices3[f];

    const perVertexColors = [hslA, hslB, hslC];
    const indices = [i1, i2, i3];
    const faceBias = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : undefined;

    let faceAlpha = 1.0;
    if (model.faceAlphas) {
      faceAlpha = (0xff - (model.faceAlphas[f] & 0xff)) / 255.0;
      if (faceAlpha < 1.0) {
        hasTransparency = true;
      }
    }
    let textureLayer = 0;
    if (hasTextures) {
      textureLayer = faceTextureLayer(model.faceTextures, f, resolveTextureLayer);
      if (textureLayer > 0) {
        computeFaceTextureUv(uvGeometry, f, faceUv, 0);
      } else {
        faceUv.fill(0);
      }
    }

    for (let v = 0; v < 3; v++) {
      const idx = indices[v];
      positionsList.push(model.verticesX[idx]);
      positionsList.push(verticesY[idx]);
      positionsList.push(model.verticesZ[idx]);

      const n = legacyNormalAt(model, idx);
      if (n) {
        const mag = Math.sqrt(n.x * n.x + n.y * n.y + n.z * n.z) || 1;
        normalsList.push(n.x / mag);
        normalsList.push(n.y / mag);
        normalsList.push(n.z / mag);
      } else {
        normalsList.push(0);
        normalsList.push(1);
        normalsList.push(0);
      }

      hslColorsList.push(perVertexColors[v] & 0xffff);
      alphasList.push(faceAlpha);
      if (faceBiasList && faceBias !== undefined) {
        faceBiasList.push(faceBias);
      }
      if (uvsList && textureIdsList) {
        uvsList.push(faceUv[v * 2], faceUv[v * 2 + 1]);
        textureIdsList.push(textureLayer);
      }
    }
  }

  return {
    mesh: {
      positions: new Float32Array(positionsList),
      normals: new Float32Array(normalsList),
    },
    hslColors: new Float32Array(hslColorsList),
    alphas: new Float32Array(alphasList),
    ...(faceBiasList ? { faceBias: new Float32Array(faceBiasList) } : {}),
    ...(uvsList && textureIdsList
      ? { uvs: new Float32Array(uvsList), textureIds: new Float32Array(textureIdsList) }
      : {}),
    hasTransparency,
    modelHeight: PositiveModelHeight.fromBounds(model.height),
  };
}
