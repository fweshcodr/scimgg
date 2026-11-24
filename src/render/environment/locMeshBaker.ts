import { type LocMeshData, PositiveModelHeight } from '../../rs/config/loctype/LocModelLoader';
import type { NpcMesh3DCommand } from '../core/commands';
import { splitTriangleSoupByAlpha } from '../core/splitMeshByAlpha';
import { contourLocPositions } from './locContour';
import type { LocFootprint } from './locPlacement';

/**
 * Identifies the frames `LocModelLoader` loads for a LOC: they depend only on these. The loc
 * type's models, recolors, retextures, mirroring, resize, offset and lighting all follow from
 * `locId`, and the loader resolves no multilocs or varbits. Un-contoured bakes with the same key
 * are identical, so placements may share one; each renderer prefixes its own mesh-id namespace.
 */
export function locFrameGeometryKey(locId: number, modelType: number, rotation: number, seqId: number): string {
  return `${locId}:${modelType}:${rotation}:${seqId}`;
}

/**
 * One baked frame part in LOC model space: every field of its draw command except where and how
 * it is placed. Without contouring nothing here depends on the placement, so callers may share one
 * baked geometry (arrays and mesh ids) between every placement with the same bake inputs.
 */
export type LocFrameMeshPart = Omit<NpcMesh3DCommand, 'modelMatrix' | 'zIndex' | 'depthBias' | 'normals'> & {
  /** Frames draw with scene-base, which bakes lighting into the colors and reads no normals. */
  readonly normals?: undefined;
};

export type LocFrameGeometry = readonly (readonly LocFrameMeshPart[])[];

export interface BakeLocFrameGeometryInput {
  readonly frames: readonly LocMeshData[];
  /** Mesh id prefix; it must identify every input that shaped the vertices, contouring included. */
  readonly locKey: string;
  /** Terrain contouring bakes the placement into the vertices; omit it for placement-free geometry. */
  readonly contour?: {
    readonly terrainHeights: Int32Array[] | null;
    readonly terrainLocalX: number;
    readonly terrainLocalY: number;
    readonly footprint: LocFootprint;
    readonly contouredGround: number;
  };
  /**
   * Multiplies every vertex alpha before the opaque/transparent split, so a faded LOC draws entirely
   * in the transparent pass. Omitted or 1 leaves the model's own alphas. `locKey` must reflect it.
   */
  readonly alphaScale?: number;
}

export function bakeLocFrameGeometry(input: BakeLocFrameGeometryInput): LocFrameMeshPart[][] {
  const contour = input.contour;
  const alphaScale = input.alphaScale ?? 1;
  const frameParts: LocFrameMeshPart[][] = [];

  for (let frameIdx = 0; frameIdx < input.frames.length; frameIdx++) {
    const frameMeshData = input.frames[frameIdx];
    if (!frameMeshData) {
      continue;
    }
    const framePositions = contour
      ? contourLocPositions({
          positions: frameMeshData.mesh.positions,
          terrainHeights: contour.terrainHeights,
          localX: contour.terrainLocalX,
          localY: contour.terrainLocalY,
          footprint: contour.footprint,
          contouredGround: contour.contouredGround,
          modelHeight: frameMeshData.modelHeight ?? PositiveModelHeight.fromPositions(frameMeshData.mesh.positions),
        })
      : frameMeshData.mesh.positions;
    // The split carries no normals even when the frame mesh has them: see LocFrameMeshPart.
    const split = splitTriangleSoupByAlpha({
      positions: framePositions,
      hslColors: frameMeshData.hslColors,
      alphas: alphaScale === 1 ? frameMeshData.alphas : frameMeshData.alphas.map((alpha) => alpha * alphaScale),
      ...(frameMeshData.faceBias ? { faceBias: frameMeshData.faceBias } : {}),
      ...(frameMeshData.uvs && frameMeshData.textureIds
        ? { uvs: frameMeshData.uvs, textureIds: frameMeshData.textureIds }
        : {}),
    });
    const parts: LocFrameMeshPart[] = [];
    if (split.opaque) {
      parts.push({
        kind: 'mesh3d',
        meshId: `${input.locKey}-frame-${frameIdx}-opaque`,
        materialId: 'osrs-npc',
        positions: split.opaque.positions,
        perVertexHslColors: split.opaque.hslColors,
        perVertexAlphas: split.opaque.alphas,
        ...(split.opaque.faceBias ? { perVertexFaceBias: split.opaque.faceBias } : {}),
        ...(split.opaque.uvs && split.opaque.textureIds
          ? { uvs: split.opaque.uvs, perVertexTextureIds: split.opaque.textureIds }
          : {}),
        // Real OSRS backface-culls every model face (RuneLite GpuPlugin glEnable(GL_CULL_FACE),
        // default BACK/CCW; rs-map-viewer cullBackFace=true). Culling here matches the NPC/player
        // paths and drops the flat down-facing base cap at model Y=0 that z-fights the floor.
        cullFace: 'back',
      });
    }
    if (split.transparent) {
      parts.push({
        kind: 'mesh3d',
        meshId: `${input.locKey}-frame-${frameIdx}-transparent`,
        materialId: 'osrs-npc',
        positions: split.transparent.positions,
        perVertexHslColors: split.transparent.hslColors,
        perVertexAlphas: split.transparent.alphas,
        ...(split.transparent.faceBias ? { perVertexFaceBias: split.transparent.faceBias } : {}),
        ...(split.transparent.uvs && split.transparent.textureIds
          ? { uvs: split.transparent.uvs, perVertexTextureIds: split.transparent.textureIds }
          : {}),
        depth: 'read',
        blend: 'normal',
        cullFace: 'back',
      });
    }
    frameParts.push(parts);
  }

  return frameParts;
}

export interface LocFramePlacement {
  readonly modelMatrix: Float32Array;
  readonly zIndex: number;
  readonly depthBias?: number;
}

/** Draw commands for one placement of baked geometry; the vertex arrays are shared, not copied. */
export function placeLocFrameGeometry(geometry: LocFrameGeometry, placement: LocFramePlacement): NpcMesh3DCommand[][] {
  const depthBiasFields = placement.depthBias !== undefined ? { depthBias: placement.depthBias } : {};
  return geometry.map((parts) =>
    parts.map((part) => ({
      ...part,
      modelMatrix: placement.modelMatrix,
      zIndex: placement.zIndex,
      ...depthBiasFields,
    })),
  );
}
