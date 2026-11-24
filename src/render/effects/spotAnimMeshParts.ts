import type { SpotAnimMeshData } from '../../rs/model/SpotAnimModelLoader';
import type { Mesh3DCommand } from '../core/commands';
import type { FaceSortInput } from '../core/FacePrioritySorter';
import { type ImmutableMeshSource, type MeshBounds, type MeshUploadData, positionBounds } from '../core/meshSource';
import { buildTransparentFaceMap, splitTriangleSoupByAlpha, type TransparentFaceMap } from '../core/splitMeshByAlpha';

/**
 * Sorter input for a transparent part. The part is a triangle soup, so sort face `f` is the soup's
 * vertices `3f..3f+2` and transparent triangle `f`. Vertex coordinates are not copied in here: the
 * renderer transforms them straight out of the part's `positions` before every sort. The index,
 * alpha and face-id arrays depend only on the face count, so they are views of shared, read-only
 * identity buffers. The sorter and permuter only read them; never write through these views.
 */
export interface SpotAnimTransparentSort {
  readonly model: Omit<FaceSortInput, 'verticesX' | 'verticesY' | 'verticesZ'>;
  /** Transparent triangle index → sort face index, which is the identity. */
  readonly triToModelFace: Uint32Array;
}

/** Where a resident part's geometry lives: a part of a source the renderer keeps on the GPU. */
export interface SpotAnimResidentGeometry {
  readonly source: ImmutableMeshSource;
  readonly part: number;
}

/**
 * One drawable piece of a spotanim: render state plus its geometry. Spotanims draw with scene-base,
 * which bakes lighting into the HSL colors and reads no normals, so parts carry none; a spotanim
 * drawn with a program that reads them (scene-effects) would need them kept through the permute.
 *
 * A part either embeds its arrays or is `resident`: the renderer owns a resident part's geometry and
 * rebuilds it from the source's recipe. Transparent parts always embed theirs, because the
 * visibility check and the full transparent sort read them every frame.
 */
export interface SpotAnimMeshPart
  extends Pick<Mesh3DCommand, 'meshId' | 'materialId' | 'depth' | 'blend' | 'cullFace' | 'zIndex' | 'depthBias'> {
  /** A posed skeletal part: new arrays under one mesh id, so the renderer re-uploads them. */
  readonly animated?: boolean;
  /** Absent exactly when the part is {@link resident}. */
  readonly positions?: Float32Array;
  readonly perVertexHslColors?: Float32Array;
  readonly perVertexAlphas?: Float32Array;
  readonly perVertexFaceBias?: Float32Array;
  readonly resident?: SpotAnimResidentGeometry;
  readonly transparentSort?: SpotAnimTransparentSort;
  /**
   * Set on a baked part every one of whose triangles has two corners with bit-identical position
   * and face bias. scene-base places a vertex by those two alone, so each such triangle has zero
   * area and the part draws no pixel. A proof for that program only; posed parts never carry it.
   */
  readonly hasOnlyRepeatedCornerTriangles?: true;
}

/** A part that carries its own arrays, as {@link createSpotAnimMeshParts} builds them. */
export type SpotAnimEmbeddedPart = SpotAnimMeshPart & { readonly positions: Float32Array };

let identityCapacity = 0;
let identityFaces = new Uint32Array(0);
let firstVertices = new Int32Array(0);
let secondVertices = new Int32Array(0);
let thirdVertices = new Int32Array(0);
let transparentFlags = new Int8Array(0);

/**
 * Grows the shared identity buffers. Views handed out earlier keep their (smaller) old buffers, so
 * replacing these never disturbs an existing part.
 */
function ensureIdentityCapacity(faceCount: number): void {
  if (faceCount <= identityCapacity) return;
  const capacity = Math.max(faceCount, identityCapacity * 2);
  identityFaces = new Uint32Array(capacity);
  firstVertices = new Int32Array(capacity);
  secondVertices = new Int32Array(capacity);
  thirdVertices = new Int32Array(capacity);
  transparentFlags = new Int8Array(capacity).fill(1);
  for (let face = 0; face < capacity; face++) {
    identityFaces[face] = face;
    firstVertices[face] = face * 3;
    secondVertices[face] = face * 3 + 1;
    thirdVertices[face] = face * 3 + 2;
  }
  identityCapacity = capacity;
}

function createTransparentSort(hslColors: Float32Array, faceCount: number): SpotAnimTransparentSort {
  ensureIdentityCapacity(faceCount);
  const faceColors3 = new Float32Array(faceCount);
  for (let face = 0; face < faceCount; face++) {
    faceColors3[face] = hslColors[face * 3 + 2];
  }
  return {
    model: {
      verticesCount: faceCount * 3,
      indices1: firstVertices.subarray(0, faceCount),
      indices2: secondVertices.subarray(0, faceCount),
      indices3: thirdVertices.subarray(0, faceCount),
      faceCount,
      faceRenderPriorities: null,
      priority: 0,
      faceAlphas: transparentFlags.subarray(0, faceCount),
      faceColors3,
    },
    triToModelFace: identityFaces.subarray(0, faceCount),
  };
}

const faceMaps = new WeakMap<SpotAnimTransparentSort, TransparentFaceMap>();

/**
 * The face map `permuteTransparentTriangles` needs, built on first use. Only a full transparent
 * sort permutes, and that path is off by default, so most parts never pay for the map's
 * per-face entries.
 */
export function spotAnimTransparentFaceMap(sort: SpotAnimTransparentSort): TransparentFaceMap {
  let faceMap = faceMaps.get(sort);
  if (!faceMap) {
    faceMap = buildTransparentFaceMap(sort.triToModelFace);
    faceMaps.set(sort, faceMap);
  }
  return faceMap;
}

/**
 * Whether every triangle of the soup has two bit-identical corners, position and effective face
 * bias (an absent buffer is +0) alike. Exact: `Object.is` on finite values, no tolerance, so -0 and
 * +0 differ. Anything it cannot vouch for (no whole triangle, a bias buffer of another length, a
 * non-finite value) is not certified.
 */
export function hasOnlyRepeatedCornerTriangles(positions: Float32Array, faceBias: Float32Array | undefined): boolean {
  if (positions.length === 0 || positions.length % 9 !== 0) return false;
  const vertexCount = positions.length / 3;
  if (faceBias !== undefined && faceBias.length !== vertexCount) return false;
  for (let index = 0; index < positions.length; index++) if (!Number.isFinite(positions[index])) return false;
  if (faceBias) for (let index = 0; index < vertexCount; index++) if (!Number.isFinite(faceBias[index])) return false;
  const sameCorner = (left: number, right: number): boolean =>
    Object.is(positions[left * 3], positions[right * 3]) &&
    Object.is(positions[left * 3 + 1], positions[right * 3 + 1]) &&
    Object.is(positions[left * 3 + 2], positions[right * 3 + 2]) &&
    Object.is(faceBias ? faceBias[left] : 0, faceBias ? faceBias[right] : 0);
  for (let first = 0; first < vertexCount; first += 3) {
    if (!sameCorner(first, first + 1) && !sameCorner(first + 1, first + 2) && !sameCorner(first, first + 2)) {
      return false;
    }
  }
  return true;
}

/** `animated` marks posed skeletal parts, rebuilt every frame: they are never checked or certified. */
export function createSpotAnimMeshParts(
  meshId: string,
  mesh: SpotAnimMeshData,
  animated = false,
): SpotAnimEmbeddedPart[] {
  const split = splitTriangleSoupByAlpha({
    positions: mesh.positions,
    hslColors: mesh.hslColors,
    alphas: mesh.alphas,
    faceBias: mesh.faceBias,
    uvs: mesh.uvs,
    textureIds: mesh.textureIds,
    modelFaceIndices: mesh.modelFaceIndices,
  });
  const parts: SpotAnimEmbeddedPart[] = [];
  for (const [bucket, geometry] of [
    ['opaque', split.opaque],
    ['transparent', split.transparent],
  ] as const) {
    if (!geometry) continue;
    // Zero-alpha transparent geometry discards every fragment and writes no depth. Drop the
    // whole part before allocating sort metadata, but retain any nonzero or unknown alpha.
    if (
      bucket === 'transparent' &&
      geometry.alphas.length === geometry.positions.length / 3 &&
      geometry.alphas.every((alpha) => alpha === 0)
    ) {
      continue;
    }
    // Sort only the emitted transparent soup: opaque/hidden vertices must not reject
    // this part at the near plane. Spotanims use depth order, not model priorities.
    const transparentSort =
      bucket === 'transparent' ? createTransparentSort(geometry.hslColors, geometry.positions.length / 9) : undefined;
    parts.push({
      meshId: `${meshId}-${bucket}`,
      materialId: 'osrs-npc',
      positions: geometry.positions,
      perVertexHslColors: geometry.hslColors,
      perVertexAlphas: geometry.alphas,
      perVertexFaceBias: geometry.faceBias,
      depth: bucket === 'opaque' ? 'readwrite' : 'read',
      blend: bucket === 'transparent' ? 'normal' : undefined,
      animated,
      transparentSort,
      ...(!animated && hasOnlyRepeatedCornerTriangles(geometry.positions, geometry.faceBias)
        ? { hasOnlyRepeatedCornerTriangles: true as const }
        : {}),
    });
  }
  return parts;
}

/**
 * The upload arrays of every opaque part of `frames`, in frame order: the parts of a spotanim's
 * resident source. A rebuild runs the same bake and this same function again.
 */
export function spotAnimOpaqueUploads(frames: readonly (readonly SpotAnimEmbeddedPart[])[]): MeshUploadData[] {
  const uploads: MeshUploadData[] = [];
  for (const parts of frames) {
    for (const part of parts) {
      if (part.blend === 'normal') continue;
      uploads.push({
        positions: part.positions,
        perVertexHslColors: part.perVertexHslColors,
        perVertexAlphas: part.perVertexAlphas,
        perVertexFaceBias: part.perVertexFaceBias,
      });
    }
  }
  return uploads;
}

/**
 * Replaces each opaque part of `frames` with one drawn from `source`, whose parts are those opaque
 * parts in the same order ({@link spotAnimOpaqueUploads}). The replacements keep no arrays, so once
 * the renderer has uploaded the source nothing on the CPU holds the opaque geometry.
 */
export function withResidentOpaqueParts(
  frames: readonly (readonly SpotAnimEmbeddedPart[])[],
  source: ImmutableMeshSource,
): SpotAnimMeshPart[][] {
  let next = 0;
  return frames.map((parts) =>
    parts.map((part): SpotAnimMeshPart => {
      if (part.blend === 'normal') return part;
      const { positions: _positions, perVertexHslColors, perVertexAlphas, perVertexFaceBias, ...state } = part;
      return { ...state, resident: { source, part: next++ } };
    }),
  );
}

/** Axis-aligned bounds of every part of `frames`, from the resident descriptors and embedded arrays. */
export function spotAnimPartBounds(frames: readonly (readonly SpotAnimMeshPart[])[]): MeshBounds | null {
  let union: MeshBounds | null = null;
  for (const parts of frames) {
    for (const part of parts) {
      const bounds = part.resident
        ? (part.resident.source.parts[part.resident.part]?.bounds ?? null)
        : part.positions
          ? positionBounds(part.positions)
          : null;
      if (!bounds) continue;
      union = union
        ? {
            minX: Math.min(union.minX, bounds.minX),
            minY: Math.min(union.minY, bounds.minY),
            minZ: Math.min(union.minZ, bounds.minZ),
            maxX: Math.max(union.maxX, bounds.maxX),
            maxY: Math.max(union.maxY, bounds.maxY),
            maxZ: Math.max(union.maxZ, bounds.maxZ),
          }
        : bounds;
    }
  }
  return union;
}
