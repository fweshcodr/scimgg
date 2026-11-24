import type { MeshData } from '../../../render/core/assets';
import { log } from '../../../util/Logger';
import type { Archive } from '../../cache/Archive';
import type { CacheIndex } from '../../cache/CacheIndex';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ModelData } from '../../model/ModelData';
import { IndexModelLoader, type ModelLoader } from '../../model/ModelLoader';
import { IndexSeqBaseLoader } from '../../model/seq/SeqBaseLoader';
import { Dat2SeqFrameLoader, type SeqFrameLoader } from '../../model/seq/SeqFrameLoader';
import {
  type FaceTextureGeometry,
  faceTextureLayer,
  modelHasTextures,
  type TextureLayerResolver,
  writeFaceTextureAttributes,
} from '../../model/textureUv';
import { writeUnitNormal } from '../../model/VertexNormal';
import type { SeqType } from '../seqtype/SeqType';
import { ArchiveSeqTypeLoader, type SeqTypeLoader } from '../seqtype/SeqTypeLoader';
import { LocModelType } from './LocModelType';
import type { LocType } from './LocType';
import { ArchiveLocTypeLoader, type LocTypeLoader } from './LocTypeLoader';

export interface LocMesh {
  locId: number;
  mesh: MeshData;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias?: Float32Array;
  uvs?: Float32Array;
  textureIds?: Float32Array;
  worldX: number;
  worldY: number;
  worldZ: number;
  sizeX: number;
  sizeY: number;
  modelHeight?: PositiveModelHeight;
}

export function getRotatedLocFootprint(
  sizeX: number,
  sizeY: number,
  rotation: number,
): readonly [sizeX: number, sizeY: number] {
  return (rotation & 1) === 0 ? [sizeX, sizeY] : [sizeY, sizeX];
}

export interface LocMeshData {
  mesh: MeshData;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias?: Float32Array;
  uvs?: Float32Array;
  textureIds?: Float32Array;
  hasTransparency: boolean;
  modelHeight?: PositiveModelHeight;
}

export class PositiveModelHeight {
  private constructor(readonly value: number) {}

  static fromBounds(height: number): PositiveModelHeight {
    return new PositiveModelHeight(Math.max(1, height));
  }

  static fromPositions(positions: Float32Array): PositiveModelHeight {
    let height = 0;
    for (let index = 1; index < positions.length; index += 3) {
      height = Math.max(height, -(positions[index] ?? 0));
    }
    return PositiveModelHeight.fromBounds(height);
  }
}

export interface LitColors {
  faceColors1: Int32Array;
  faceColors2: Int32Array;
  faceColors3: Int32Array;
}

/**
 * Pass `{ normals: false }` for a mesh drawn only by programs that read no normals (scene-base
 * bakes lighting into the colors): `mesh.normals` is then omitted. The lit colors already carry
 * the model's normals either way.
 */
export function locModelDataToMesh(
  model: ModelData,
  litColors: LitColors,
  resolveTextureLayer?: TextureLayerResolver,
  options?: { readonly normals?: boolean },
): LocMeshData {
  const faceCount = model.faceCount;
  const withNormals = options?.normals !== false;

  if (withNormals) model.calculateVertexNormals();
  model.calculateBounds();

  // Sized up front so the soup is written straight into its typed arrays with no intermediate
  // garbage. Must skip exactly the faces the write loop skips: textured faces (third color -2).
  let emittedFaces = 0;
  for (let f = 0; f < faceCount; f++) {
    if (litColors.faceColors3[f] !== -2) emittedFaces++;
  }

  const vertexCount = emittedFaces * 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = withNormals ? new Float32Array(vertexCount * 3) : undefined;
  const hslColors = new Float32Array(vertexCount);
  const alphas = new Float32Array(vertexCount);
  const faceBias = model.faceBias ? new Float32Array(vertexCount) : undefined;
  const verticesY = model.contourVerticesY ?? model.verticesY;
  let hasTransparency = false;
  const hasTextures = resolveTextureLayer !== undefined && modelHasTextures(model.faceTextures, faceCount);
  const uvs = hasTextures ? new Float32Array(vertexCount * 2) : undefined;
  const textureIds = hasTextures ? new Float32Array(vertexCount) : undefined;
  // UVs are derived from vertex positions, so the contoured Y must be the one used.
  const uvGeometry: FaceTextureGeometry | undefined = hasTextures
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
    : undefined;

  const { verticesX, verticesZ, indices1, indices2, indices3 } = model;
  let face = 0;
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

    const fb = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : 0;

    let faceAlpha = 1.0;
    if (model.faceAlphas) {
      faceAlpha = (0xff - (model.faceAlphas[f] & 0xff)) / 255.0;
      if (faceAlpha < 1.0) {
        hasTransparency = true;
      }
    }
    const firstVertex = face * 3;
    if (uvGeometry && uvs && textureIds) {
      const textureLayer = faceTextureLayer(model.faceTextures, f, resolveTextureLayer);
      writeFaceTextureAttributes(uvGeometry, f, textureLayer, uvs, textureIds, firstVertex);
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
      if (faceBias) {
        faceBias[vertex] = fb;
      }
    }
    face++;
  }

  return {
    mesh: normals ? { positions, normals } : { positions },
    hslColors,
    alphas,
    ...(faceBias ? { faceBias } : {}),
    ...(uvs && textureIds ? { uvs, textureIds } : {}),
    hasTransparency,
    modelHeight: PositiveModelHeight.fromBounds(model.height),
  };
}

/** Animated LOC frames draw with scene-base, which reads no normals, so their meshes carry none. */
const ANIMATED_FRAME_MESH = { normals: false } as const;

export interface AnimatedLocMeshData {
  frames: LocMeshData[];
  seqType: SeqType;
}

export class LocModelLoader {
  private locTypeLoader: LocTypeLoader;
  private modelLoader: ModelLoader;
  private modelDataCache: Map<number, ModelData> = new Map();
  private seqTypeLoader: SeqTypeLoader | null = null;
  private seqFrameLoader: SeqFrameLoader | null = null;
  private resolveTextureLayer: TextureLayerResolver | undefined;

  constructor(
    cacheInfo: CacheInfo,
    locConfigArchive: Archive,
    modelIndex: CacheIndex,
    seqArchive?: Archive,
    animIndex?: CacheIndex,
    skeletonIndex?: CacheIndex,
  ) {
    this.locTypeLoader = new ArchiveLocTypeLoader(cacheInfo, locConfigArchive);
    this.modelLoader = new IndexModelLoader(modelIndex);

    if (seqArchive) {
      this.seqTypeLoader = new ArchiveSeqTypeLoader(cacheInfo, seqArchive);
    }

    if (animIndex && skeletonIndex) {
      const baseLoader = new IndexSeqBaseLoader(cacheInfo, skeletonIndex);
      this.seqFrameLoader = new Dat2SeqFrameLoader(cacheInfo, animIndex, baseLoader);
    }
  }

  /**
   * Bind the OSRS-texture-id → GPU-texture-array-layer mapping. Loc meshes baked
   * before this is set carry no texture attributes and render untextured.
   */
  setTextureLayerResolver(resolver: TextureLayerResolver | undefined): void {
    this.resolveTextureLayer = resolver;
  }

  getSeqTypeLoader(): SeqTypeLoader | null {
    return this.seqTypeLoader;
  }

  getSeqFrameLoader(): SeqFrameLoader | null {
    return this.seqFrameLoader;
  }

  loadLocType(locId: number): LocType | undefined {
    try {
      return this.locTypeLoader.load(locId);
    } catch (e) {
      log.error('LocLoader', `Failed to load loc type ${locId}:`, e);
      return undefined;
    }
  }

  private getModelData(id: number, mirrored: boolean): ModelData | undefined {
    let key = id;
    if (mirrored) key += 0x10000;

    let model = this.modelDataCache.get(key);
    if (!model) {
      model = this.modelLoader.getModel(id);
      if (model && mirrored) {
        model = ModelData.copyFrom(model, false, false, true, true);
        model.mirror();
      }
      if (model) {
        this.modelDataCache.set(key, model);
      }
    }
    return model;
  }

  getLocModelData(locType: LocType, type: LocModelType, rotation: number): ModelData | undefined {
    let modelIds: number[] | undefined;
    const isMirrored = locType.isRotated || (type === LocModelType.WALL_CORNER && rotation > 3);

    if (!locType.models || locType.models.length === 0) {
      return undefined;
    }

    if (!locType.types) {
      if (type !== LocModelType.NORMAL) {
        return undefined;
      }
      modelIds = locType.models[0];
    } else {
      let index = -1;
      for (let i = 0; i < locType.types.length; i++) {
        if (locType.types[i] === type) {
          index = i;
          break;
        }
      }
      if (index === -1) {
        return undefined;
      }
      modelIds = locType.models[index];
    }

    if (!modelIds || modelIds.length === 0) {
      return undefined;
    }

    const models: ModelData[] = [];
    for (const modelId of modelIds) {
      const model = this.getModelData(modelId, isMirrored);
      if (!model) {
        return undefined;
      }
      models.push(model);
    }

    let result: ModelData;
    if (models.length === 1) {
      result = ModelData.copyFrom(models[0], false, false, false, false);
    } else {
      result = ModelData.merge(models, models.length);
    }

    if (locType.recolorFrom && locType.recolorTo) {
      for (let i = 0; i < locType.recolorFrom.length; i++) {
        result.recolor(locType.recolorFrom[i], locType.recolorTo[i]);
      }
    }

    if (locType.retextureFrom && locType.retextureTo) {
      for (let i = 0; i < locType.retextureFrom.length; i++) {
        result.retexture(locType.retextureFrom[i], locType.retextureTo[i]);
      }
    }

    if (type === LocModelType.WALL_DECORATION_INSIDE && rotation > 3) {
      result.rotate(256);
      result.translate(45, 0, -45);
    }

    const rot = rotation & 3;
    if (rot === 1) {
      result.rotate90();
    } else if (rot === 2) {
      result.rotate180();
    } else if (rot === 3) {
      result.rotate270();
    }

    const hasResize = locType.modelSizeX !== 128 || locType.modelSizeHeight !== 128 || locType.modelSizeY !== 128;
    if (hasResize) {
      result.resize(locType.modelSizeX, locType.modelSizeHeight, locType.modelSizeY);
    }

    const hasOffset = locType.offsetX !== 0 || locType.offsetHeight !== 0 || locType.offsetY !== 0;
    if (hasOffset) {
      result.translate(locType.offsetX, locType.offsetHeight, locType.offsetY);
    }

    return result;
  }

  loadLocMesh(
    locId: number,
    type: LocModelType,
    rotation: number,
    worldX: number,
    worldY: number,
    worldZ: number,
  ): LocMesh | undefined {
    const locType = this.loadLocType(locId);
    if (!locType) {
      return undefined;
    }

    const modelData = this.getLocModelData(locType, type, rotation);
    if (!modelData) {
      return undefined;
    }
    if (type === LocModelType.NORMAL && rotation > 3) {
      modelData.rotate(256);
    }

    const ambient = locType.ambient + 64;
    const contrast = locType.contrast + 768;
    const lightX = -50;
    const lightY = -10;
    const lightZ = -50;

    const litColors = modelData.computeLitColors(ambient, contrast, lightX, lightY, lightZ);
    const { mesh, hslColors, alphas, faceBias, uvs, textureIds, modelHeight } = locModelDataToMesh(
      modelData,
      litColors,
      this.resolveTextureLayer,
    );

    const [sizeX, sizeY] = getRotatedLocFootprint(locType.sizeX, locType.sizeY, rotation);
    return {
      locId,
      mesh,
      hslColors,
      alphas,
      ...(faceBias ? { faceBias } : {}),
      ...(uvs && textureIds ? { uvs, textureIds } : {}),
      worldX,
      worldY,
      worldZ,
      sizeX,
      sizeY,
      modelHeight,
    };
  }

  loadSeqType(seqId: number): SeqType | undefined {
    if (!this.seqTypeLoader) {
      return undefined;
    }
    try {
      return this.seqTypeLoader.load(seqId);
    } catch (e) {
      log.warn('LocLoader', `Failed to load SeqType ${seqId}:`, e);
      return undefined;
    }
  }

  loadAnimatedLocMeshFrames(
    locId: number,
    type: LocModelType,
    rotation: number,
    seqId: number,
  ): AnimatedLocMeshData | undefined {
    const locType = this.loadLocType(locId);
    if (!locType) {
      return undefined;
    }

    const seqType = this.loadSeqType(seqId);
    if (!seqType) {
      log.warn('LocLoader', `No seqType for seqId ${seqId}`);
      return undefined;
    }

    const baseModelData = this.getLocModelData(locType, type, rotation);
    if (!baseModelData) {
      return undefined;
    }

    baseModelData.computeAnimationTables();

    if (!baseModelData.vertexLabels || baseModelData.vertexLabels.length === 0) {
      log.warn('LocLoader', `No vertexLabels for locId ${locId} after computeAnimationTables`);
    }

    const ambient = locType.ambient + 64;
    const contrast = locType.contrast + 768;

    if (!seqType.frameIds || seqType.frameIds.length === 0) {
      if (type === LocModelType.NORMAL && rotation > 3) {
        baseModelData.rotate(256);
      }
      const litColors = baseModelData.computeLitColors(ambient, contrast, -50, -10, -50);
      return {
        frames: [locModelDataToMesh(baseModelData, litColors, this.resolveTextureLayer, ANIMATED_FRAME_MESH)],
        seqType,
      };
    }

    const frames: LocMeshData[] = [];
    let framesWithAnimation = 0;
    for (let i = 0; i < seqType.frameIds.length; i++) {
      const frameId = seqType.frameIds[i];
      const seqFrame = this.seqFrameLoader?.load(frameId);

      const shallowAlphas = seqFrame ? !seqFrame.hasAlphaTransform : true;
      const modelCopy = ModelData.copyFrom(baseModelData, true, false, true, true, shallowAlphas);

      if (seqFrame) {
        // Animate in the model's ORIGINAL orientation, then restore the loc rotation.
        // `baseModelData` is pre-rotated by `rotation` (getLocModelData), but seq-frame
        // TRANSLATE/ROTATE transforms act along the model's CURRENT axes, so animating a
        // pre-rotated model sends limbs the wrong way for rotations 1-3. Mirror
        // rs-map-viewer's LocModelLoader.transformModel: un-rotate -> animate -> re-rotate.
        const rot = rotation & 3;
        if (rot === 1) {
          modelCopy.rotate270();
        } else if (rot === 2) {
          modelCopy.rotate180();
        } else if (rot === 3) {
          modelCopy.rotate90();
        }
        modelCopy.animate(seqFrame);

        if (rot === 1) {
          modelCopy.rotate90();
        } else if (rot === 2) {
          modelCopy.rotate180();
        } else if (rot === 3) {
          modelCopy.rotate270();
        }
        framesWithAnimation++;
      }
      if (type === LocModelType.NORMAL && rotation > 3) {
        modelCopy.rotate(256);
      }

      const litColors = modelCopy.computeLitColors(ambient, contrast, -50, -10, -50);
      const meshData = locModelDataToMesh(modelCopy, litColors, this.resolveTextureLayer, ANIMATED_FRAME_MESH);
      frames.push(meshData);
    }

    if (framesWithAnimation === 0) {
      log.warn(
        'LocLoader',
        `No seqFrames loaded for locId ${locId}, seqId ${seqId} (seqFrameLoader: ${!!this.seqFrameLoader})`,
      );
    }

    return {
      frames,
      seqType,
    };
  }
}
