/**
 * Splits non-indexed triangle-soup mesh data into opaque and transparent buckets
 * based on per-vertex alpha values. Mirrors RuneLite's FacePrioritySorter and
 * rs-map-viewer's SceneBuffer.addModelAnimFrame approach for two-pass rendering.
 */

export interface TriangleSoup {
  positions: Float32Array;
  normals: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias?: Float32Array;
  /** Interleaved `(u, v)` per vertex. Present only when the model has textured faces. */
  uvs?: Float32Array;
  /** Texture-array layer per vertex; 0 = untextured. Paired with {@link TriangleSoup.uvs}. */
  textureIds?: Float32Array;
  /** Model face index for each triangle (from modelDataToMesh). */
  modelFaceIndices?: Uint32Array;
}

/**
 * A soup for a program that reads no normals (scene-base bakes its lighting into the colors).
 * Splitting and permuting one carries no normals, so none are allocated or retained.
 */
export type UnlitTriangleSoup = Omit<TriangleSoup, 'normals'> & { normals?: undefined };

export interface SplitResult<Soup extends TriangleSoup | UnlitTriangleSoup = TriangleSoup> {
  opaque: Soup | null;
  transparent: Soup | null;
  /** Maps each transparent triangle index → model face index. Only present when input has modelFaceIndices. */
  transparentModelFaceIndices?: Uint32Array;
}

export interface FaceSplitMap {
  opaqueTriIndices: Uint32Array;
  transparentTriIndices: Uint32Array;
  opaqueVertCount: number;
  transparentVertCount: number;
}

// Grow-only classification scratch. Animated NPCs rebuild their split map every posed frame, and
// collecting indices in plain arrays first made this one of the largest per-frame allocators.
let opaqueScratch = new Uint32Array(0);
let transparentScratch = new Uint32Array(0);

/** Test-only: drops the grown scratch, so a test starts from the cold path. */
export function resetFaceSplitScratchForTests(): void {
  opaqueScratch = new Uint32Array(0);
  transparentScratch = new Uint32Array(0);
}

export function buildFaceSplitMap(
  alphas: Float32Array,
  totalVertexCount: number,
  opaqueThreshold: number = 0.999,
): FaceSplitMap {
  const triangleCount = totalVertexCount / 3;
  // ceil: a vertex count that is not a multiple of 3 still visits its partial last triangle.
  const capacity = Math.ceil(triangleCount);
  if (opaqueScratch.length < capacity) {
    opaqueScratch = new Uint32Array(capacity);
    transparentScratch = new Uint32Array(capacity);
  }
  let opaqueCount = 0;
  let transparentCount = 0;

  for (let tri = 0; tri < triangleCount; tri++) {
    const v0 = tri * 3;
    if (alphas[v0] >= opaqueThreshold) {
      opaqueScratch[opaqueCount++] = tri;
    } else {
      transparentScratch[transparentCount++] = tri;
    }
  }

  // slice(), not subarray(): the map outlives this call, and the next call overwrites the scratch.
  return {
    opaqueTriIndices: opaqueScratch.slice(0, opaqueCount),
    transparentTriIndices: transparentScratch.slice(0, transparentCount),
    opaqueVertCount: opaqueCount * 3,
    transparentVertCount: transparentCount * 3,
  };
}

export interface SplitMapBuffers {
  opaquePositions: Float32Array;
  opaqueNormals: Float32Array;
  opaqueHslColors: Float32Array;
  opaqueAlphas: Float32Array;
  opaqueFaceBias?: Float32Array;
  opaqueUvs?: Float32Array;
  opaqueTextureIds?: Float32Array;
  transparentPositions: Float32Array;
  transparentNormals: Float32Array;
  transparentHslColors: Float32Array;
  transparentAlphas: Float32Array;
  transparentFaceBias?: Float32Array;
  transparentUvs?: Float32Array;
  transparentTextureIds?: Float32Array;
}

export interface SplitTextureAttributes {
  uvs: Float32Array;
  textureIds: Float32Array;
}

export function createSplitMapBuffers(splitMap: FaceSplitMap, hasTextures: boolean = false): SplitMapBuffers {
  return {
    opaquePositions: new Float32Array(splitMap.opaqueVertCount * 3),
    opaqueNormals: new Float32Array(splitMap.opaqueVertCount * 3),
    opaqueHslColors: new Float32Array(splitMap.opaqueVertCount),
    opaqueAlphas: new Float32Array(splitMap.opaqueVertCount),
    opaqueFaceBias: splitMap.opaqueVertCount > 0 ? new Float32Array(splitMap.opaqueVertCount) : undefined,
    opaqueUvs: hasTextures && splitMap.opaqueVertCount > 0 ? new Float32Array(splitMap.opaqueVertCount * 2) : undefined,
    opaqueTextureIds:
      hasTextures && splitMap.opaqueVertCount > 0 ? new Float32Array(splitMap.opaqueVertCount) : undefined,
    transparentPositions: new Float32Array(splitMap.transparentVertCount * 3),
    transparentNormals: new Float32Array(splitMap.transparentVertCount * 3),
    transparentHslColors: new Float32Array(splitMap.transparentVertCount),
    transparentAlphas: new Float32Array(splitMap.transparentVertCount),
    transparentFaceBias:
      splitMap.transparentVertCount > 0 ? new Float32Array(splitMap.transparentVertCount) : undefined,
    transparentUvs:
      hasTextures && splitMap.transparentVertCount > 0
        ? new Float32Array(splitMap.transparentVertCount * 2)
        : undefined,
    transparentTextureIds:
      hasTextures && splitMap.transparentVertCount > 0 ? new Float32Array(splitMap.transparentVertCount) : undefined,
  };
}

export function applySplitMap(
  splitMap: FaceSplitMap,
  positions: Float32Array,
  normals: Float32Array,
  hslColors: Float32Array,
  alphas: Float32Array,
  faceBias: Float32Array | undefined,
  out?: SplitMapBuffers,
  textures?: SplitTextureAttributes,
): SplitMapBuffers {
  const opaquePositions = out?.opaquePositions ?? new Float32Array(splitMap.opaqueVertCount * 3);
  const opaqueNormals = out?.opaqueNormals ?? new Float32Array(splitMap.opaqueVertCount * 3);
  const opaqueHslColors = out?.opaqueHslColors ?? new Float32Array(splitMap.opaqueVertCount);
  const opaqueAlphas = out?.opaqueAlphas ?? new Float32Array(splitMap.opaqueVertCount);
  const opaqueFaceBias =
    out?.opaqueFaceBias ?? (splitMap.opaqueVertCount > 0 ? new Float32Array(splitMap.opaqueVertCount) : undefined);
  const transparentPositions = out?.transparentPositions ?? new Float32Array(splitMap.transparentVertCount * 3);
  const transparentNormals = out?.transparentNormals ?? new Float32Array(splitMap.transparentVertCount * 3);
  const transparentHslColors = out?.transparentHslColors ?? new Float32Array(splitMap.transparentVertCount);
  const transparentAlphas = out?.transparentAlphas ?? new Float32Array(splitMap.transparentVertCount);
  const transparentFaceBias =
    out?.transparentFaceBias ??
    (splitMap.transparentVertCount > 0 ? new Float32Array(splitMap.transparentVertCount) : undefined);
  const opaqueUvs = textures ? (out?.opaqueUvs ?? new Float32Array(splitMap.opaqueVertCount * 2)) : out?.opaqueUvs;
  const opaqueTextureIds = textures
    ? (out?.opaqueTextureIds ?? new Float32Array(splitMap.opaqueVertCount))
    : out?.opaqueTextureIds;
  const transparentUvs = textures
    ? (out?.transparentUvs ?? new Float32Array(splitMap.transparentVertCount * 2))
    : out?.transparentUvs;
  const transparentTextureIds = textures
    ? (out?.transparentTextureIds ?? new Float32Array(splitMap.transparentVertCount))
    : out?.transparentTextureIds;

  for (let i = 0; i < splitMap.opaqueTriIndices.length; i++) {
    const srcTri = splitMap.opaqueTriIndices[i];
    const srcBase = srcTri * 9;
    const dstBase = i * 9;
    for (let j = 0; j < 9; j++) {
      opaquePositions[dstBase + j] = positions[srcBase + j];
      opaqueNormals[dstBase + j] = normals[srcBase + j];
    }
    for (let v = 0; v < 3; v++) {
      const srcVertex = (srcBase + v * 3) / 3;
      const dstVertex = (dstBase + v * 3) / 3;
      opaqueHslColors[dstVertex] = hslColors[srcVertex];
      opaqueAlphas[dstVertex] = alphas[srcVertex];
      if (opaqueFaceBias && faceBias) {
        opaqueFaceBias[dstVertex] = faceBias[srcVertex];
      }
      if (textures && opaqueUvs && opaqueTextureIds) {
        opaqueUvs[dstVertex * 2] = textures.uvs[srcVertex * 2];
        opaqueUvs[dstVertex * 2 + 1] = textures.uvs[srcVertex * 2 + 1];
        opaqueTextureIds[dstVertex] = textures.textureIds[srcVertex];
      }
    }
  }

  for (let i = 0; i < splitMap.transparentTriIndices.length; i++) {
    const srcTri = splitMap.transparentTriIndices[i];
    const srcBase = srcTri * 9;
    const dstBase = i * 9;
    for (let j = 0; j < 9; j++) {
      transparentPositions[dstBase + j] = positions[srcBase + j];
      transparentNormals[dstBase + j] = normals[srcBase + j];
    }
    for (let v = 0; v < 3; v++) {
      const srcVertex = (srcBase + v * 3) / 3;
      const dstVertex = (dstBase + v * 3) / 3;
      transparentHslColors[dstVertex] = hslColors[srcVertex];
      transparentAlphas[dstVertex] = alphas[srcVertex];
      if (transparentFaceBias && faceBias) {
        transparentFaceBias[dstVertex] = faceBias[srcVertex];
      }
      if (textures && transparentUvs && transparentTextureIds) {
        transparentUvs[dstVertex * 2] = textures.uvs[srcVertex * 2];
        transparentUvs[dstVertex * 2 + 1] = textures.uvs[srcVertex * 2 + 1];
        transparentTextureIds[dstVertex] = textures.textureIds[srcVertex];
      }
    }
  }

  return {
    opaquePositions,
    opaqueNormals,
    opaqueHslColors,
    opaqueAlphas,
    opaqueFaceBias,
    opaqueUvs,
    opaqueTextureIds,
    transparentPositions,
    transparentNormals,
    transparentHslColors,
    transparentAlphas,
    transparentFaceBias,
    transparentUvs,
    transparentTextureIds,
  };
}

// The lit overload comes last so `ReturnType<typeof splitTriangleSoupByAlpha>` stays the lit result.
export function splitTriangleSoupByAlpha(
  mesh: UnlitTriangleSoup,
  opaqueThreshold?: number,
): SplitResult<UnlitTriangleSoup>;
export function splitTriangleSoupByAlpha(mesh: TriangleSoup, opaqueThreshold?: number): SplitResult;
export function splitTriangleSoupByAlpha(
  mesh: TriangleSoup | UnlitTriangleSoup,
  opaqueThreshold: number = 0.999,
): SplitResult<TriangleSoup | UnlitTriangleSoup> {
  const vertexCount = mesh.positions.length / 3;
  const triangleCount = vertexCount / 3;

  if (triangleCount === 0) {
    return { opaque: null, transparent: null };
  }

  let opaqueTriCount = 0;
  let transparentTriCount = 0;

  for (let tri = 0; tri < triangleCount; tri++) {
    const v0 = tri * 3;
    if (mesh.alphas[v0] >= opaqueThreshold) {
      opaqueTriCount++;
    } else {
      transparentTriCount++;
    }
  }

  if (transparentTriCount === 0) {
    return { opaque: mesh, transparent: null };
  }
  if (opaqueTriCount === 0) {
    const transparentModelFaceIndices = mesh.modelFaceIndices ? new Uint32Array(mesh.modelFaceIndices) : undefined;
    return { opaque: null, transparent: mesh, transparentModelFaceIndices };
  }

  const opaqueVerts = opaqueTriCount * 3;
  const transparentVerts = transparentTriCount * 3;

  const oPositions = new Float32Array(opaqueVerts * 3);
  const oNormals = mesh.normals ? new Float32Array(opaqueVerts * 3) : undefined;
  const oHslColors = new Float32Array(opaqueVerts);
  const oAlphas = new Float32Array(opaqueVerts);
  const oFaceBias = mesh.faceBias ? new Float32Array(opaqueVerts) : undefined;
  const oUvs = mesh.uvs ? new Float32Array(opaqueVerts * 2) : undefined;
  const oTextureIds = mesh.textureIds ? new Float32Array(opaqueVerts) : undefined;

  const tPositions = new Float32Array(transparentVerts * 3);
  const tNormals = mesh.normals ? new Float32Array(transparentVerts * 3) : undefined;
  const tHslColors = new Float32Array(transparentVerts);
  const tAlphas = new Float32Array(transparentVerts);
  const tFaceBias = mesh.faceBias ? new Float32Array(transparentVerts) : undefined;
  const tUvs = mesh.uvs ? new Float32Array(transparentVerts * 2) : undefined;
  const tTextureIds = mesh.textureIds ? new Float32Array(transparentVerts) : undefined;
  const tModelFaceIndices = mesh.modelFaceIndices ? new Uint32Array(transparentTriCount) : undefined;

  let oi = 0;
  let ti = 0;

  for (let tri = 0; tri < triangleCount; tri++) {
    const v0 = tri * 3;
    const isOpaque = mesh.alphas[v0] >= opaqueThreshold;

    const positions = isOpaque ? oPositions : tPositions;
    const normals = isOpaque ? oNormals : tNormals;
    const hslColors = isOpaque ? oHslColors : tHslColors;
    const alphas = isOpaque ? oAlphas : tAlphas;
    const faceBias = isOpaque ? oFaceBias : tFaceBias;
    const uvs = isOpaque ? oUvs : tUvs;
    const textureIds = isOpaque ? oTextureIds : tTextureIds;
    const idx = isOpaque ? oi : ti;

    for (let v = 0; v < 3; v++) {
      const srcVert = v0 + v;
      const dstVert = idx + v;

      positions[dstVert * 3] = mesh.positions[srcVert * 3];
      positions[dstVert * 3 + 1] = mesh.positions[srcVert * 3 + 1];
      positions[dstVert * 3 + 2] = mesh.positions[srcVert * 3 + 2];

      if (mesh.normals && normals) {
        normals[dstVert * 3] = mesh.normals[srcVert * 3];
        normals[dstVert * 3 + 1] = mesh.normals[srcVert * 3 + 1];
        normals[dstVert * 3 + 2] = mesh.normals[srcVert * 3 + 2];
      }

      hslColors[dstVert] = mesh.hslColors[srcVert];
      alphas[dstVert] = mesh.alphas[srcVert];
      if (mesh.faceBias && faceBias) {
        faceBias[dstVert] = mesh.faceBias[srcVert];
      }
      if (mesh.uvs && uvs) {
        uvs[dstVert * 2] = mesh.uvs[srcVert * 2];
        uvs[dstVert * 2 + 1] = mesh.uvs[srcVert * 2 + 1];
      }
      if (mesh.textureIds && textureIds) {
        textureIds[dstVert] = mesh.textureIds[srcVert];
      }
    }

    if (isOpaque) {
      oi += 3;
    } else {
      if (tModelFaceIndices && mesh.modelFaceIndices) {
        tModelFaceIndices[ti / 3] = mesh.modelFaceIndices[tri];
      }
      ti += 3;
    }
  }

  // The normals are present exactly when the input's were, which is what the overloads promise.
  return {
    opaque: {
      positions: oPositions,
      normals: oNormals as Float32Array,
      hslColors: oHslColors,
      alphas: oAlphas,
      faceBias: oFaceBias,
      uvs: oUvs,
      textureIds: oTextureIds,
    },
    transparent: {
      positions: tPositions,
      normals: tNormals as Float32Array,
      hslColors: tHslColors,
      alphas: tAlphas,
      faceBias: tFaceBias,
      uvs: tUvs,
      textureIds: tTextureIds,
    },
    transparentModelFaceIndices: tModelFaceIndices,
  };
}

/**
 * Built once at load time from the split result.
 */
export interface TransparentFaceMap {
  /** transparent tri index → model face index */
  triToModelFace: Uint32Array;
  /** model face index → transparent tri index (sparse, only valid for faces in triToModelFace) */
  modelFaceToTri: Map<number, number>;
}

export function buildTransparentFaceMap(transparentModelFaceIndices: Uint32Array): TransparentFaceMap {
  const modelFaceToTri = new Map<number, number>();
  for (let i = 0; i < transparentModelFaceIndices.length; i++) {
    modelFaceToTri.set(transparentModelFaceIndices[i], i);
  }
  return {
    triToModelFace: transparentModelFaceIndices,
    modelFaceToTri,
  };
}

/** Pre-allocated output buffers for permuteTransparentTriangles. */
export interface PermuteOutputBuffers {
  positions: Float32Array;
  normals: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias: Float32Array | undefined;
  uvs?: Float32Array;
  textureIds?: Float32Array;
}

/** Output buffers for permuting an {@link UnlitTriangleSoup}, which has no normals to permute. */
export type UnlitPermuteOutputBuffers = Omit<PermuteOutputBuffers, 'normals'> & { normals?: undefined };

interface PermutedTriangles {
  positions: Float32Array;
  normals: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias: Float32Array | undefined;
  uvs?: Float32Array;
  textureIds?: Float32Array;
}

type UnlitPermutedTriangles = Omit<PermutedTriangles, 'normals'> & { normals?: undefined };

export function permuteTransparentTriangles(
  sortedModelFaces: number[],
  faceMap: TransparentFaceMap,
  positions: Float32Array,
  normals: undefined,
  hslColors: Float32Array,
  alphas: Float32Array,
  faceBias: Float32Array | undefined,
  out?: UnlitPermuteOutputBuffers,
  textures?: SplitTextureAttributes,
): UnlitPermutedTriangles;
export function permuteTransparentTriangles(
  sortedModelFaces: number[],
  faceMap: TransparentFaceMap,
  positions: Float32Array,
  normals: Float32Array,
  hslColors: Float32Array,
  alphas: Float32Array,
  faceBias: Float32Array | undefined,
  out?: PermuteOutputBuffers,
  textures?: SplitTextureAttributes,
): PermutedTriangles;
export function permuteTransparentTriangles(
  sortedModelFaces: number[],
  faceMap: TransparentFaceMap,
  positions: Float32Array,
  normals: Float32Array | undefined,
  hslColors: Float32Array,
  alphas: Float32Array,
  faceBias: Float32Array | undefined,
  out?: PermuteOutputBuffers | UnlitPermuteOutputBuffers,
  textures?: SplitTextureAttributes,
): PermutedTriangles | UnlitPermutedTriangles {
  const faceCount = sortedModelFaces.length;
  const vertCount = faceCount * 3;

  const outPositions = out && out.positions.length >= faceCount * 9 ? out.positions : new Float32Array(faceCount * 9);
  const outNormals = normals
    ? out?.normals && out.normals.length >= faceCount * 9
      ? out.normals
      : new Float32Array(faceCount * 9)
    : undefined;
  const outHslColors = out && out.hslColors.length >= vertCount ? out.hslColors : new Float32Array(vertCount);
  const outAlphas = out && out.alphas.length >= vertCount ? out.alphas : new Float32Array(vertCount);
  const outFaceBias = faceBias
    ? out?.faceBias && out.faceBias.length >= vertCount
      ? out.faceBias
      : new Float32Array(vertCount)
    : undefined;
  const outUvs = textures
    ? out?.uvs && out.uvs.length >= vertCount * 2
      ? out.uvs
      : new Float32Array(vertCount * 2)
    : undefined;
  const outTextureIds = textures
    ? out?.textureIds && out.textureIds.length >= vertCount
      ? out.textureIds
      : new Float32Array(vertCount)
    : undefined;

  for (let i = 0; i < faceCount; i++) {
    const modelFace = sortedModelFaces[i];
    const srcTriIdx = faceMap.modelFaceToTri.get(modelFace);
    if (srcTriIdx === undefined) continue;

    const srcPosBase = srcTriIdx * 9;
    const dstPosBase = i * 9;
    for (let j = 0; j < 9; j++) {
      outPositions[dstPosBase + j] = positions[srcPosBase + j];
    }
    if (normals && outNormals) {
      for (let j = 0; j < 9; j++) {
        outNormals[dstPosBase + j] = normals[srcPosBase + j];
      }
    }

    const srcAttrBase = srcTriIdx * 3;
    const dstAttrBase = i * 3;
    for (let v = 0; v < 3; v++) {
      outHslColors[dstAttrBase + v] = hslColors[srcAttrBase + v];
      outAlphas[dstAttrBase + v] = alphas[srcAttrBase + v];
      if (outFaceBias && faceBias) {
        outFaceBias[dstAttrBase + v] = faceBias[srcAttrBase + v];
      }
      if (textures && outUvs && outTextureIds) {
        outUvs[(dstAttrBase + v) * 2] = textures.uvs[(srcAttrBase + v) * 2];
        outUvs[(dstAttrBase + v) * 2 + 1] = textures.uvs[(srcAttrBase + v) * 2 + 1];
        outTextureIds[dstAttrBase + v] = textures.textureIds[srcAttrBase + v];
      }
    }
  }

  // Return exact-length subarray views (zero allocation when using pre-allocated buffers)
  return {
    positions: outPositions.subarray(0, faceCount * 9),
    normals: outNormals?.subarray(0, faceCount * 9) as Float32Array,
    hslColors: outHslColors.subarray(0, vertCount),
    alphas: outAlphas.subarray(0, vertCount),
    faceBias: outFaceBias?.subarray(0, vertCount),
    uvs: outUvs?.subarray(0, vertCount * 2),
    textureIds: outTextureIds?.subarray(0, vertCount),
  };
}
