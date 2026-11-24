import { YAMA_START_POS } from '../../encounters/yamaP3/constants';
import type { MeshData } from '../../render/core/assets';
import { log } from '../../util/Logger';
import { profiler } from '../../util/Profiler';
import type { CacheIndex } from '../cache/CacheIndex';
import type { CacheInfo } from '../cache/CacheInfo';
import type { NpcType } from '../config/npctype/NpcType';
import { IndexNpcTypeLoader, type NpcTypeLoader } from '../config/npctype/NpcTypeLoader';
import { ModelData } from './ModelData';
import { IndexModelLoader, type ModelLoader } from './ModelLoader';
import { faceTextureLayer, modelHasTextures, type TextureLayerResolver, writeFaceTextureAttributes } from './textureUv';
import { writeUnitNormal } from './VertexNormal';

export const YAMA_NPC_ID = 14176;

export const YAMA_WORLD_POSITION = {
  x: 1504,
  y: 10078,
  z: 0,
};

/** SW corner of Yama's footprint. */
export const YAMA_SIMULATOR_POSITION = {
  x: YAMA_START_POS[0],
  y: YAMA_START_POS[1],
};

export interface NpcModelData {
  npcId: number;
  npcName: string;
  modelIds: number[];
  models: ModelData[];
  mergedModel: ModelData | null;
  litColors: LitColors | null;
  /** Lighting parameters for recomputing litColors after animation alpha transforms */
  lighting: { ambient: number; contrast: number; lightX: number; lightY: number; lightZ: number };
  size: number;
  widthScale: number;
  heightScale: number;
  rotationSpeed: number;
  walkSeqId: number;
  turnLeftSeqId: number;
  turnRightSeqId: number;
}

export interface NpcMesh {
  npcId: number;
  mesh: MeshData;
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface NpcMeshData {
  positions: Float32Array;
  normals: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias: Float32Array;
  /** Model face index for each emitted triangle (maps soup tri → original model face). */
  modelFaceIndices: Uint32Array;
  /** Interleaved `(u, v)` per vertex. Only present when the model has textured faces. */
  uvs?: Float32Array;
  /** Texture-array layer per vertex; 0 = untextured. Paired with {@link NpcMeshData.uvs}. */
  textureIds?: Float32Array;
}

/**
 * {@link NpcMeshData} without render normals, for meshes drawn only by programs that read none
 * (scene-base bakes lighting into the colors). The model's own normals still light it.
 */
export type UnlitNpcMeshData = Omit<NpcMeshData, 'normals'> & { normals?: undefined };

interface LitColors {
  faceColors1: Int32Array;
  faceColors2: Int32Array;
  faceColors3: Int32Array;
}

export interface ModelToMeshOptions {
  renderTexturedAsBlack?: boolean;
  /**
   * Maps an OSRS texture id to a GPU texture-array layer. Omit to render textured
   * faces with their per-vertex lightness only.
   */
  resolveTextureLayer?: TextureLayerResolver;
}

type ModelToMeshCallOptions = ModelToMeshOptions & {
  sortedFaceOrder?: number[];
  /** `false` omits the render normals: see {@link UnlitNpcMeshData}. */
  normals?: boolean;
};

export function modelDataToMesh(
  model: ModelData,
  litColors: LitColors | undefined,
  options: ModelToMeshCallOptions & { normals: false },
): UnlitNpcMeshData;
export function modelDataToMesh(
  model: ModelData,
  litColors?: LitColors,
  options?: ModelToMeshCallOptions & { normals?: true },
): NpcMeshData;
/** A `normals` flag known only at run time may go either way. */
export function modelDataToMesh(
  model: ModelData,
  litColors: LitColors | undefined,
  options: ModelToMeshCallOptions,
): NpcMeshData | UnlitNpcMeshData;
export function modelDataToMesh(
  model: ModelData,
  litColors?: LitColors,
  options?: ModelToMeshCallOptions,
): NpcMeshData | UnlitNpcMeshData {
  const faceCount = model.faceCount;
  const withNormals = options?.normals !== false;

  if (withNormals) model.calculateVertexNormals();

  const faceOrder = options?.sortedFaceOrder;
  const iterCount = faceOrder ? faceOrder.length : faceCount;
  const texturedAsBlack = options?.renderTexturedAsBlack;
  const resolveTextureLayer = options?.resolveTextureLayer;

  // Sized up front so the soup is written straight into its typed arrays with no intermediate
  // garbage (this runs for every spotanim frame and pose). Must skip exactly the faces the write
  // loop skips: textured faces (third color -2) unless they render black.
  let emittedFaces = 0;
  for (let i = 0; i < iterCount; i++) {
    const f = faceOrder ? faceOrder[i] : i;
    if (texturedAsBlack || (litColors?.faceColors3[f] ?? model.faceColors[f]) !== -2) emittedFaces++;
  }

  const vertexCount = emittedFaces * 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = withNormals ? new Float32Array(vertexCount * 3) : undefined;
  const hslColors = new Float32Array(vertexCount);
  const alphas = new Float32Array(vertexCount);
  const faceBias = new Float32Array(vertexCount);
  const modelFaceIndices = new Uint32Array(emittedFaces);
  const hasTextures = resolveTextureLayer !== undefined && modelHasTextures(model.faceTextures, faceCount);
  const uvs = hasTextures ? new Float32Array(vertexCount * 2) : undefined;
  const textureIds = hasTextures ? new Float32Array(vertexCount) : undefined;

  const { verticesX, verticesY, verticesZ, indices1, indices2, indices3 } = model;
  let face = 0;
  for (let i = 0; i < iterCount; i++) {
    const f = faceOrder ? faceOrder[i] : i;

    let hslA = litColors?.faceColors1[f] ?? model.faceColors[f];
    let hslB = litColors?.faceColors2[f] ?? model.faceColors[f];
    let hslC = litColors?.faceColors3[f] ?? model.faceColors[f];

    if (hslC === -2) {
      if (texturedAsBlack) {
        hslA = hslB = hslC = 0;
      } else {
        continue;
      }
    }

    if (hslC === -1) {
      hslC = hslB = hslA;
    }

    const faceAlpha = model.faceAlphas ? (255 - (model.faceAlphas[f] & 0xff)) / 255 : 1.0;
    const fb = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : 0;
    const firstVertex = face * 3;
    if (uvs && textureIds) {
      const textureLayer = faceTextureLayer(model.faceTextures, f, resolveTextureLayer);
      writeFaceTextureAttributes(model, f, textureLayer, uvs, textureIds, firstVertex);
    }

    for (let v = 0; v < 3; v++) {
      const idx = v === 0 ? indices1[f] : v === 1 ? indices2[f] : indices3[f];
      const vertex = firstVertex + v;
      positions[vertex * 3] = verticesX[idx];
      positions[vertex * 3 + 1] = verticesY[idx];
      positions[vertex * 3 + 2] = verticesZ[idx];
      if (normals) writeUnitNormal(model.normals, idx, normals, vertex * 3);
      hslColors[vertex] = (v === 0 ? hslA : v === 1 ? hslB : hslC) & 0xffff;
      alphas[vertex] = faceAlpha;
      faceBias[vertex] = fb;
    }
    modelFaceIndices[face] = f;
    face++;
  }

  return {
    positions,
    ...(normals ? { normals } : {}),
    hslColors,
    alphas,
    faceBias,
    modelFaceIndices,
    ...(uvs && textureIds ? { uvs, textureIds } : {}),
  };
}

export class NpcModelLoader {
  private npcTypeLoader: NpcTypeLoader;
  private modelLoader: ModelLoader;

  constructor(npcTypeLoader: NpcTypeLoader, modelLoader: ModelLoader) {
    this.npcTypeLoader = npcTypeLoader;
    this.modelLoader = modelLoader;
  }

  static fromIndices(cacheInfo: CacheInfo, npcConfigIndex: CacheIndex, modelIndex: CacheIndex): NpcModelLoader {
    const npcTypeLoader = new IndexNpcTypeLoader(cacheInfo, npcConfigIndex);
    const modelLoader = new IndexModelLoader(modelIndex);
    return new NpcModelLoader(npcTypeLoader, modelLoader);
  }

  loadNpcType(npcId: number): NpcType | undefined {
    try {
      return this.npcTypeLoader.load(npcId);
    } catch (e) {
      log.error('ModelLoader', `Failed to load NPC type ${npcId}:`, e);
      return undefined;
    }
  }

  loadNpcModelData(npcId: number): NpcModelData | undefined {
    profiler.start(`NpcModelLoader.loadNpcModelData(${npcId})`);
    const npcType = this.loadNpcType(npcId);
    if (!npcType) {
      profiler.end(`NpcModelLoader.loadNpcModelData(${npcId})`);
      return undefined;
    }

    const modelIds = npcType.modelIds || [];
    if (modelIds.length === 0) {
      log.warn('ModelLoader', `NPC ${npcId} (${npcType.name}) has no model IDs`);
      profiler.end(`NpcModelLoader.loadNpcModelData(${npcId})`);
      return undefined;
    }

    profiler.start(`NpcModelLoader.loadModels(${npcId})`);
    const models: ModelData[] = [];
    for (const modelId of modelIds) {
      const model = this.modelLoader.getModel(modelId);
      if (model) {
        log.debug(
          'ModelLoader',
          `model ${modelId} loaded, vertexSkins: ${!!model.vertexSkins}, faceSkins: ${!!model.faceSkins}, animMayaGroups: ${!!model.animMayaGroups}, mayaGroupCount: ${model.animMayaGroups?.filter((g) => g && g.length > 0).length ?? 0}`,
        );
        if (npcType.recolorFrom && npcType.recolorTo) {
          this.applyRecoloring(model, npcType.recolorFrom, npcType.recolorTo);
        }
        if (npcType.retextureFrom && npcType.retextureTo) {
          for (let i = 0; i < npcType.retextureFrom.length; i++) {
            model.retexture(npcType.retextureFrom[i], npcType.retextureTo[i]);
          }
        }
        models.push(model);
      } else {
        log.warn('ModelLoader', `Failed to load model ${modelId} for NPC ${npcId}`);
      }
    }
    profiler.end(`NpcModelLoader.loadModels(${npcId})`);

    if (models.length === 0) {
      log.warn('ModelLoader', `No models loaded for NPC ${npcId}`);
      profiler.end(`NpcModelLoader.loadNpcModelData(${npcId})`);
      return undefined;
    }

    profiler.start(`NpcModelLoader.mergeModels(${npcId})`);
    const mergedModel = models.length === 1 ? models[0] : ModelData.merge(models, models.length);

    log.debug(
      'ModelLoader',
      `merged model vertexSkins: ${!!mergedModel.vertexSkins}, length: ${mergedModel.vertexSkins?.length ?? 0}, animMayaGroups: ${!!mergedModel.animMayaGroups}, mayaGroupCount: ${mergedModel.animMayaGroups?.filter((g) => g && g.length > 0).length ?? 0}, totalVertices: ${mergedModel.verticesCount}`,
    );

    profiler.end(`NpcModelLoader.mergeModels(${npcId})`);

    const ambient = npcType.ambient + 64;
    const contrast = npcType.contrast + 850;
    const lightX = -30;
    const lightY = -50;
    const lightZ = -30;
    const litColors = mergedModel.computeLitColors(ambient, contrast, lightX, lightY, lightZ);

    profiler.end(`NpcModelLoader.loadNpcModelData(${npcId})`);
    return {
      npcId,
      npcName: npcType.name,
      modelIds,
      models,
      mergedModel,
      litColors,
      lighting: { ambient, contrast, lightX, lightY, lightZ },
      size: npcType.size,
      widthScale: npcType.widthScale,
      heightScale: npcType.heightScale,
      rotationSpeed: npcType.rotationSpeed,
      walkSeqId: npcType.walkSeqId,
      turnLeftSeqId: npcType.turnLeftSeqId,
      turnRightSeqId: npcType.turnRightSeqId,
    };
  }

  private applyRecoloring(model: ModelData, from: number[], to: number[]): void {
    for (let i = 0; i < model.faceCount; i++) {
      const color = model.faceColors[i];
      const idx = from.indexOf(color);
      if (idx !== -1) {
        model.faceColors[i] = to[idx];
      }
    }
  }

  loadNpcMesh(npcId: number, worldX: number, worldY: number, worldZ: number): NpcMesh | undefined {
    const modelData = this.loadNpcModelData(npcId);
    if (!modelData || !modelData.mergedModel) {
      return undefined;
    }

    const mesh = modelDataToMesh(modelData.mergedModel);

    return {
      npcId,
      mesh,
      worldX,
      worldY,
      worldZ,
    };
  }

  loadYamaMesh(): NpcMesh | undefined {
    return this.loadNpcMesh(YAMA_NPC_ID, YAMA_WORLD_POSITION.x, YAMA_WORLD_POSITION.y, YAMA_WORLD_POSITION.z);
  }
}
