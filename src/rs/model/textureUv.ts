/**
 * Port of RuneLite's `ModelDefinition.computeTextureUVCoordinates()`
 * (`RuneLite ModelDefinition.java:155-283`),
 * which is byte-for-byte the same math as the GPU plugin's per-frame
 * `SceneUploader.computeFaceUvs()`
 * (`RuneLite SceneUploader.java:871-990`).
 *
 * A textured face names a *texture triangle* (`textureCoords[face]`, an index into
 * `textureMappingP/M/N`). The texture triangle's three vertices define an affine
 * basis over the model; the face's own three vertices are projected into that basis
 * to yield UVs. When `textureCoords[face] === -1` the cache has already collapsed
 * the texture triangle onto the face triangle, so the projection reduces to the
 * constant `(0,0) (1,0) (0,1)`.
 *
 * UVs are derived from vertex positions, so callers that pose a model (animation,
 * ground contouring) must pass the same vertex arrays they used for positions.
 */

/** Maps an OSRS texture id to a GPU texture-array layer. 0 means "not textured". */
export type TextureLayerResolver = (osrsTextureId: number) => number;

export interface FaceTextureGeometry {
  verticesX: ArrayLike<number>;
  verticesY: ArrayLike<number>;
  verticesZ: ArrayLike<number>;
  indices1: ArrayLike<number>;
  indices2: ArrayLike<number>;
  indices3: ArrayLike<number>;
  textureCoords?: ArrayLike<number> | null;
  textureMappingP?: ArrayLike<number> | null;
  textureMappingM?: ArrayLike<number> | null;
  textureMappingN?: ArrayLike<number> | null;
}

export function modelHasTextures(faceTextures: ArrayLike<number> | null | undefined, faceCount: number): boolean {
  if (!faceTextures) return false;
  const limit = Math.min(faceCount, faceTextures.length);
  for (let face = 0; face < limit; face++) {
    if (faceTextures[face] !== -1) return true;
  }
  return false;
}

/**
 * Layer 0 is the white placeholder that `TextureArrayManager` reserves;
 * `scene-base.vert`/`scene.frag` treat `a_textureId <= 0` as "shade from HSL instead of sampling".
 */
export function faceTextureLayer(
  faceTextures: ArrayLike<number> | null | undefined,
  face: number,
  resolver: TextureLayerResolver | null | undefined,
): number {
  if (!faceTextures || !resolver) return 0;
  const osrsTextureId = faceTextures[face];
  if (osrsTextureId === undefined || osrsTextureId < 0) return 0;
  const layer = resolver(osrsTextureId);
  return layer > 0 ? layer : 0;
}

function writeDefaultUv(out: Float32Array, offset: number): void {
  out[offset] = 0;
  out[offset + 1] = 0;
  out[offset + 2] = 1;
  out[offset + 3] = 0;
  out[offset + 4] = 0;
  out[offset + 5] = 1;
}

export function computeFaceTextureUv(
  geometry: FaceTextureGeometry,
  face: number,
  out: Float32Array,
  outOffset: number,
): void {
  const { textureCoords, textureMappingP, textureMappingM, textureMappingN } = geometry;

  if (!textureCoords || !textureMappingP || !textureMappingM || !textureMappingN || textureCoords[face] === -1) {
    writeDefaultUv(out, outOffset);
    return;
  }

  const textureFace = textureCoords[face] & 0xff;
  const texA = textureMappingP[textureFace];
  const texB = textureMappingM[textureFace];
  const texC = textureMappingN[textureFace];
  if (texA === undefined || texB === undefined || texC === undefined) {
    writeDefaultUv(out, outOffset);
    return;
  }

  const { verticesX, verticesY, verticesZ, indices1, indices2, indices3 } = geometry;
  const triangleA = indices1[face];
  const triangleB = indices2[face];
  const triangleC = indices3[face];

  const originX = verticesX[texA];
  const originY = verticesY[texA];
  const originZ = verticesZ[texA];

  const edgeBx = verticesX[texB] - originX;
  const edgeBy = verticesY[texB] - originY;
  const edgeBz = verticesZ[texB] - originZ;
  const edgeCx = verticesX[texC] - originX;
  const edgeCy = verticesY[texC] - originY;
  const edgeCz = verticesZ[texC] - originZ;

  const faceAx = verticesX[triangleA] - originX;
  const faceAy = verticesY[triangleA] - originY;
  const faceAz = verticesZ[triangleA] - originZ;
  const faceBx = verticesX[triangleB] - originX;
  const faceBy = verticesY[triangleB] - originY;
  const faceBz = verticesZ[triangleB] - originZ;
  const faceCx = verticesX[triangleC] - originX;
  const faceCy = verticesY[triangleC] - originY;
  const faceCz = verticesZ[triangleC] - originZ;

  const normalX = edgeBy * edgeCz - edgeBz * edgeCy;
  const normalY = edgeBz * edgeCx - edgeBx * edgeCz;
  const normalZ = edgeBx * edgeCy - edgeBy * edgeCx;

  // uAxis = edgeC x normal — perpendicular to edgeC, so it isolates the edgeB component
  let axisX = edgeCy * normalZ - edgeCz * normalY;
  let axisY = edgeCz * normalX - edgeCx * normalZ;
  let axisZ = edgeCx * normalY - edgeCy * normalX;

  let scale = 1.0 / (axisX * edgeBx + axisY * edgeBy + axisZ * edgeBz);
  const u0 = (axisX * faceAx + axisY * faceAy + axisZ * faceAz) * scale;
  const u1 = (axisX * faceBx + axisY * faceBy + axisZ * faceBz) * scale;
  const u2 = (axisX * faceCx + axisY * faceCy + axisZ * faceCz) * scale;

  // vAxis = edgeB x normal — perpendicular to edgeB, isolating the edgeC component
  axisX = edgeBy * normalZ - edgeBz * normalY;
  axisY = edgeBz * normalX - edgeBx * normalZ;
  axisZ = edgeBx * normalY - edgeBy * normalX;

  scale = 1.0 / (axisX * edgeCx + axisY * edgeCy + axisZ * edgeCz);
  const v0 = (axisX * faceAx + axisY * faceAy + axisZ * faceAz) * scale;
  const v1 = (axisX * faceBx + axisY * faceBy + axisZ * faceBz) * scale;
  const v2 = (axisX * faceCx + axisY * faceCy + axisZ * faceCz) * scale;

  // Degenerate texture triangles (collinear or zero-area) divide by zero. Cache data
  // is external input, and a NaN in the UV buffer poisons every fragment of the face.
  if (
    !Number.isFinite(u0) ||
    !Number.isFinite(u1) ||
    !Number.isFinite(u2) ||
    !Number.isFinite(v0) ||
    !Number.isFinite(v1) ||
    !Number.isFinite(v2)
  ) {
    writeDefaultUv(out, outOffset);
    return;
  }

  out[outOffset] = u0;
  out[outOffset + 1] = v0;
  out[outOffset + 2] = u1;
  out[outOffset + 3] = v1;
  out[outOffset + 4] = u2;
  out[outOffset + 5] = v2;
}

export function writeFaceTextureAttributes(
  geometry: FaceTextureGeometry,
  face: number,
  layer: number,
  uvs: Float32Array,
  textureIds: Float32Array,
  vertexOffset: number,
): void {
  if (layer > 0) {
    computeFaceTextureUv(geometry, face, uvs, vertexOffset * 2);
  } else {
    uvs[vertexOffset * 2] = 0;
    uvs[vertexOffset * 2 + 1] = 0;
    uvs[vertexOffset * 2 + 2] = 0;
    uvs[vertexOffset * 2 + 3] = 0;
    uvs[vertexOffset * 2 + 4] = 0;
    uvs[vertexOffset * 2 + 5] = 0;
  }
  textureIds[vertexOffset] = layer;
  textureIds[vertexOffset + 1] = layer;
  textureIds[vertexOffset + 2] = layer;
}
