import type { LitColors } from '../../rs/config/loctype/LocModelLoader';
import type { ModelData } from '../../rs/model/ModelData';
import {
  type FaceTextureGeometry,
  faceTextureLayer,
  modelHasTextures,
  writeFaceTextureAttributes,
} from '../../rs/model/textureUv';
import type { ResidentMesh3DCommand } from '../core/commands';
import type { ImmutableMeshSource, MeshUploadData } from '../core/meshSource';
import { sharedModelTextureIndex } from '../core/modelTextures';
import { indexingPays, SoupCompactor, StreamingSoupIndexer } from '../core/soupIndexing';

const LIGHT_X = -50;
const LIGHT_Y = -10;
const LIGHT_Z = -50;
const Z_LOC = 1;

export type StaticLocRenderModel = {
  readonly model: ModelData;
  readonly modelMatrix: Float32Array;
  readonly ambient: number;
  readonly contrast: number;
};

/**
 * Merged static scenery draws from a resident source with scene-base, which reads neither normals
 * (lighting is baked into the HSL colors before this) nor, for an all-opaque batch, per-vertex alpha.
 */
export type StaticLocMesh3DCommand = ResidentMesh3DCommand;

/** Part indices of a merged static LOC source, in the order {@link finalizeStaticLocModels} returns them. */
export const STATIC_LOC_OPAQUE_PART = 0;
export const STATIC_LOC_TRANSPARENT_PART = 1;

type FinalBuffers = {
  readonly positions: Float32Array;
  readonly hslColors: Float32Array;
  /** Transparent batch only; every opaque face has alpha exactly 1. */
  readonly alphas?: Float32Array;
  readonly faceBias?: Float32Array;
  readonly uvs?: Float32Array;
  readonly textureIds?: Float32Array;
};

type CachedLighting = {
  readonly ambient: number;
  readonly contrast: number;
  readonly colors: LitColors;
};

function allocateBuffers(
  vertexCount: number,
  hasFaceBias: boolean,
  hasTextures: boolean,
  transparent: boolean,
): FinalBuffers {
  return {
    positions: new Float32Array(vertexCount * 3),
    hslColors: new Float32Array(vertexCount),
    ...(transparent ? { alphas: new Float32Array(vertexCount) } : {}),
    ...(hasFaceBias ? { faceBias: new Float32Array(vertexCount) } : {}),
    ...(hasTextures ? { uvs: new Float32Array(vertexCount * 2), textureIds: new Float32Array(vertexCount) } : {}),
  };
}

/** A batch's attribute arrays in a fixed order, with floats per vertex: the tuple a corner is. */
function attributeList(buffers: FinalBuffers): { arrays: Float32Array[]; sizes: number[] } {
  const entries: [Float32Array | undefined, number][] = [
    [buffers.positions, 3],
    [buffers.hslColors, 1],
    [buffers.alphas, 1],
    [buffers.faceBias, 1],
    [buffers.uvs, 2],
    [buffers.textureIds, 1],
  ];
  const present = entries.filter((entry): entry is [Float32Array, number] => entry[0] !== undefined);
  return { arrays: present.map(([array]) => array), sizes: present.map(([, size]) => size) };
}

function wordsOf(arrays: readonly Float32Array[]): Uint32Array[] {
  return arrays.map((array) => new Uint32Array(array.buffer, array.byteOffset, array.length));
}

/** Writes corners as a plain soup, for a batch that indexing would not shrink. */
class SoupWriter {
  private corners = 0;

  constructor(
    private readonly sizes: readonly number[],
    private readonly output: readonly Uint32Array[],
  ) {}

  add(corner: readonly Uint32Array[], row: number): void {
    for (let attribute = 0; attribute < this.sizes.length; attribute++) {
      const size = this.sizes[attribute] as number;
      const from = corner[attribute] as Uint32Array;
      const to = this.output[attribute] as Uint32Array;
      for (let component = 0; component < size; component++) {
        to[this.corners * size + component] = from[row * size + component] as number;
      }
    }
    this.corners++;
  }
}

function faceAlpha(model: ModelData, face: number): number {
  return model.faceAlphas ? (0xff - (model.faceAlphas[face] & 0xff)) / 255 : 1;
}

type Batch = {
  readonly faces: number;
  readonly scratch: FinalBuffers;
  readonly sizes: number[];
  nonZeroFaceBias: boolean;
};

/**
 * Lights, transforms and merges the staged models into the upload arrays of an opaque and a
 * transparent batch, indexed by {@link STATIC_LOC_OPAQUE_PART} and {@link STATIC_LOC_TRANSPARENT_PART}. Either may be empty.
 *
 * Each batch comes out already indexed, exactly as the renderer would index its soup (see
 * `soupIndexing.ts`), without the soup ever existing: a first pass streams the corners to number
 * their distinct vertices, and a second streams them again to write those vertices into arrays of
 * exactly the counted size. A batch that indexing would not shrink is written as the soup instead.
 */
export function finalizeStaticLocModels(
  staged: readonly StaticLocRenderModel[],
): readonly [opaque: MeshUploadData, transparent: MeshUploadData] {
  const litColorsByModel: LitColors[] = [];
  const litColorsCache = new Map<ModelData, CachedLighting>();
  let opaqueFaces = 0;
  let transparentFaces = 0;
  let maximumVertexCount = 0;
  for (const entry of staged) {
    const cachedLighting = litColorsCache.get(entry.model);
    const lightingMatches = Boolean(
      cachedLighting && cachedLighting.ambient === entry.ambient && cachedLighting.contrast === entry.contrast,
    );
    const litColors =
      cachedLighting && lightingMatches
        ? cachedLighting.colors
        : entry.model.computeLitColors(entry.ambient, entry.contrast, LIGHT_X, LIGHT_Y, LIGHT_Z);
    if (!lightingMatches) {
      litColorsCache.set(entry.model, { ambient: entry.ambient, contrast: entry.contrast, colors: litColors });
    }
    litColorsByModel.push(litColors);
    maximumVertexCount = Math.max(maximumVertexCount, entry.model.usedVertexCount);
    for (let face = 0; face < entry.model.faceCount; face++) {
      if (litColors.faceColors3[face] === -2) continue;
      if (faceAlpha(entry.model, face) >= 0.999) opaqueFaces++;
      else transparentFaces++;
    }
  }

  const hasFaceBias = staged.length > 0 && staged.every((entry) => entry.model.faceBias);
  const hasTextures = staged.some((entry) => modelHasTextures(entry.model.faceTextures, entry.model.faceCount));
  // Each face is written as three corners into its batch's one-face scratch, then streamed.
  const batches = ([false, true] as const).map((transparent): Batch => {
    const scratch = allocateBuffers(3, hasFaceBias, hasTextures, transparent);
    return {
      faces: transparent ? transparentFaces : opaqueFaces,
      scratch,
      sizes: attributeList(scratch).sizes,
      nonZeroFaceBias: false,
    };
  }) as [Batch, Batch];
  const scratchWords = batches.map((batch) => wordsOf(attributeList(batch.scratch).arrays));
  const worldPositions = new Float32Array(maximumVertexCount * 3);
  type Sink = { add(corner: readonly Uint32Array[], row: number): void };

  const streamCorners = (sinks: readonly [Sink, Sink]) => {
    for (let entryIndex = 0; entryIndex < staged.length; entryIndex++) {
      const entry = staged[entryIndex];
      const litColors = litColorsByModel[entryIndex];
      if (!entry || !litColors) continue;
      const { model, modelMatrix } = entry;
      const verticesY = model.contourVerticesY ?? model.verticesY;
      // UVs come from the same (possibly contoured) vertices the positions do.
      const uvGeometry: FaceTextureGeometry | null = hasTextures
        ? {
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
          }
        : null;
      const isCanonicalLocMatrix =
        modelMatrix[2] === 0 && modelMatrix[4] === 0 && modelMatrix[5] === 0 && modelMatrix[10] === 0;
      for (let vertex = 0; vertex < model.usedVertexCount; vertex++) {
        const base = vertex * 3;
        const x = Math.fround(model.verticesX[vertex]);
        const y = Math.fround(verticesY[vertex]);
        const z = Math.fround(model.verticesZ[vertex]);
        worldPositions[base] = isCanonicalLocMatrix
          ? modelMatrix[0] * x + modelMatrix[8] * z + modelMatrix[12]
          : modelMatrix[0] * x + modelMatrix[4] * y + modelMatrix[8] * z + modelMatrix[12];
        worldPositions[base + 1] = isCanonicalLocMatrix
          ? modelMatrix[1] * x + modelMatrix[9] * z + modelMatrix[13]
          : modelMatrix[1] * x + modelMatrix[5] * y + modelMatrix[9] * z + modelMatrix[13];
        worldPositions[base + 2] = isCanonicalLocMatrix
          ? modelMatrix[6] * y + modelMatrix[14]
          : modelMatrix[2] * x + modelMatrix[6] * y + modelMatrix[10] * z + modelMatrix[14];
      }
      for (let face = 0; face < entry.model.faceCount; face++) {
        const hslA = litColors.faceColors1[face];
        let hslB = litColors.faceColors2[face];
        let hslC = litColors.faceColors3[face];
        if (hslC === -2) continue;
        if (hslC === -1) hslC = hslB = hslA;
        const alpha = model.faceAlphas ? (0xff - (model.faceAlphas[face] & 0xff)) / 255 : 1;
        const isOpaque = alpha >= 0.999;
        const part = isOpaque ? STATIC_LOC_OPAQUE_PART : STATIC_LOC_TRANSPARENT_PART;
        const batch = batches[part];
        const buffers = batch.scratch;
        const bias = model.faceBias ? (model.faceBias[face] === -1 ? 0 : model.faceBias[face] & 0xff) : 0;
        if (bias !== 0) batch.nonZeroFaceBias = true;
        buffers.hslColors[0] = hslA & 0xffff;
        buffers.hslColors[1] = hslB & 0xffff;
        buffers.hslColors[2] = hslC & 0xffff;
        if (buffers.alphas) buffers.alphas.fill(alpha);
        if (buffers.faceBias) buffers.faceBias.fill(bias);
        if (uvGeometry && buffers.uvs && buffers.textureIds) {
          // Untextured models inside a textured batch land here too: faceTextureLayer
          // returns 0 for them, which writes zeroed uvs and the untextured layer.
          const layer = faceTextureLayer(model.faceTextures, face, sharedModelTextureIndex.resolve);
          writeFaceTextureAttributes(uvGeometry, face, layer, buffers.uvs, buffers.textureIds, 0);
        }
        for (let vertex = 0; vertex < 3; vertex++) {
          const index =
            vertex === 0 ? model.indices1[face] : vertex === 1 ? model.indices2[face] : model.indices3[face];
          const sourceBase = index * 3;
          buffers.positions[vertex * 3] = worldPositions[sourceBase];
          buffers.positions[vertex * 3 + 1] = worldPositions[sourceBase + 1];
          buffers.positions[vertex * 3 + 2] = worldPositions[sourceBase + 2];
        }
        const sink = sinks[part];
        const words = scratchWords[part] as Uint32Array[];
        for (let vertex = 0; vertex < 3; vertex++) sink.add(words, vertex);
      }
    }
  };

  // Pass 1: each corner's distinct vertex, and how many there are.
  const indexers = batches.map((batch) => new StreamingSoupIndexer(batch.sizes, batch.faces * 3)) as [
    StreamingSoupIndexer,
    StreamingSoupIndexer,
  ];
  streamCorners(indexers);

  // Pass 2: into exactly sized arrays, indexed when that is smaller, as the renderer decides it. The
  // renderer uploads no face bias that is all +0, so neither does the size comparison count it.
  const outputs = batches.map((batch, part) => {
    const corners = batch.faces * 3;
    const indexer = indexers[part] as StreamingSoupIndexer;
    const distinct = indexer.distinct;
    const uploadedFloats =
      batch.sizes.reduce((sum, size) => sum + size, 0) - (batch.scratch.faceBias && !batch.nonZeroFaceBias ? 1 : 0);
    const indexed = corners > 1 && indexingPays(distinct, corners, uploadedFloats);
    const buffers = allocateBuffers(indexed ? distinct : corners, hasFaceBias, hasTextures, part === 1);
    const arrays = attributeList(buffers).arrays;
    if (!indexed) return { buffers, sink: new SoupWriter(batch.sizes, wordsOf(arrays)) };
    return {
      buffers,
      indices: indexer.uploadIndices(),
      sink: new SoupCompactor(batch.sizes, indexer.indices, arrays),
    };
  });
  streamCorners([outputs[0]!.sink, outputs[1]!.sink]);

  return [uploadData(outputs[0]!.buffers, outputs[0]!.indices), uploadData(outputs[1]!.buffers, outputs[1]!.indices)];
}

function uploadData(buffers: FinalBuffers, indices?: Uint16Array | Uint32Array): MeshUploadData {
  return {
    positions: buffers.positions,
    ...(indices ? { indices } : {}),
    perVertexHslColors: buffers.hslColors,
    ...(buffers.alphas ? { perVertexAlphas: buffers.alphas } : {}),
    ...(buffers.faceBias ? { perVertexFaceBias: buffers.faceBias } : {}),
    ...(buffers.uvs && buffers.textureIds ? { uvs: buffers.uvs, perVertexTextureIds: buffers.textureIds } : {}),
  };
}

/** The draws of a merged static LOC source: its opaque, then its transparent part, each only when non-empty. */
export function createStaticLocCommands(source: ImmutableMeshSource): StaticLocMesh3DCommand[] {
  const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const command = (part: number, meshId: string, transparent: boolean): StaticLocMesh3DCommand => ({
    kind: 'mesh3d',
    meshId,
    materialId: 'osrs-npc',
    modelMatrix: identity,
    meshSource: source,
    meshSourcePart: part,
    ...(transparent ? { depth: 'read' as const, blend: 'normal' as const } : {}),
    zIndex: Z_LOC,
    cullFace: 'back',
  });
  const commands: StaticLocMesh3DCommand[] = [];
  if ((source.parts[STATIC_LOC_OPAQUE_PART]?.vertexCount ?? 0) > 0) {
    commands.push(command(STATIC_LOC_OPAQUE_PART, 'merged-static-locs-opaque', false));
  }
  if ((source.parts[STATIC_LOC_TRANSPARENT_PART]?.vertexCount ?? 0) > 0) {
    commands.push(command(STATIC_LOC_TRANSPARENT_PART, 'merged-static-locs-transparent', true));
  }
  return commands;
}
