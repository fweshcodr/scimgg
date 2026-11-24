import { log } from '../../util/Logger';
import type { SeqType } from '../config/seqtype/SeqType';
import type { SeqTypeLoader } from '../config/seqtype/SeqTypeLoader';
import type { SpotAnimType } from '../config/spotanimtype/SpotAnimType';
import type { SpotAnimTypeLoader } from '../config/spotanimtype/SpotAnimTypeLoader';
import { ModelData } from './ModelData';
import type { ModelLoader } from './ModelLoader';
import { modelDataToMesh, type UnlitNpcMeshData } from './NpcModelLoader';
import type { SeqFrameLoader } from './seq/SeqFrameLoader';
import type { SkeletalSeq } from './skeletal/SkeletalSeq';

export interface SpotAnimModelData {
  spotAnimId: number;
  modelId: number;
  sequenceId: number;
  model: ModelData;
  litColors: LitColors | null;
  widthScale: number;
  heightScale: number;
  orientation: number;
}

interface LitColors {
  faceColors1: Int32Array;
  faceColors2: Int32Array;
  faceColors3: Int32Array;
}

/** Spotanims draw with scene-base, which reads no normals, so their meshes carry none. */
export type SpotAnimMeshData = UnlitNpcMeshData;

function spotAnimModelToMesh(model: ModelData, litColors?: LitColors): SpotAnimMeshData {
  return modelDataToMesh(model, litColors, { renderTexturedAsBlack: true, normals: false });
}

export interface AnimatedSpotAnimData {
  spotAnimId: number;
  frames: SpotAnimMeshData[];
  seqType: SeqType;
  frameLengths: number[];
}

export interface SkeletalSpotAnimModel {
  readonly spotAnimId: number;
  readonly model: ModelData;
  readonly restVerticesX: Int32Array;
  readonly restVerticesY: Int32Array;
  readonly restVerticesZ: Int32Array;
  readonly restFaceAlphas: Int8Array | null;
  readonly seqType: SeqType;
  readonly widthScale: number;
  readonly heightScale: number;
  readonly orientation: number;
  readonly ambient: number;
  readonly contrast: number;
}

export class SpotAnimModelLoader {
  private static readonly MODEL_CACHE_LIMIT = 128;
  private spotAnimTypeLoader: SpotAnimTypeLoader;
  private modelLoader: ModelLoader;
  private seqTypeLoader: SeqTypeLoader | null;
  private seqFrameLoader: SeqFrameLoader | null;

  private modelCache: Map<number, SpotAnimModelData | null> = new Map();
  private generation = 0;

  constructor(
    spotAnimTypeLoader: SpotAnimTypeLoader,
    modelLoader: ModelLoader,
    seqTypeLoader?: SeqTypeLoader,
    seqFrameLoader?: SeqFrameLoader,
  ) {
    this.spotAnimTypeLoader = spotAnimTypeLoader;
    this.modelLoader = modelLoader;
    this.seqTypeLoader = seqTypeLoader ?? null;
    this.seqFrameLoader = seqFrameLoader ?? null;
  }

  loadSpotAnimType(spotAnimId: number): SpotAnimType | undefined {
    try {
      return this.spotAnimTypeLoader.load(spotAnimId);
    } catch (e) {
      log.error('SpotAnimLoader', `Failed to load SpotAnim type ${spotAnimId}:`, e);
      return undefined;
    }
  }

  loadSpotAnimModelData(spotAnimId: number): SpotAnimModelData | null {
    const cached = this.modelCache.get(spotAnimId);
    if (cached !== undefined) {
      this.modelCache.delete(spotAnimId);
      this.modelCache.set(spotAnimId, cached);
      return cached;
    }

    const spotAnimType = this.loadSpotAnimType(spotAnimId);
    if (!spotAnimType) {
      return this.cacheMissingModel(spotAnimId);
    }

    const modelId = spotAnimType.modelId;
    if (modelId < 0) {
      log.warn('SpotAnimLoader', `SpotAnim ${spotAnimId} has no model (modelId: ${modelId})`);
      return this.cacheMissingModel(spotAnimId);
    }

    const model = this.modelLoader.getModel(modelId);
    if (!model) {
      log.warn('SpotAnimLoader', `Failed to load model ${modelId} for SpotAnim ${spotAnimId}`);
      return this.cacheMissingModel(spotAnimId);
    }

    const hasRecolor = spotAnimType.recolorFrom !== undefined && spotAnimType.recolorTo !== undefined;
    const hasRetexture = spotAnimType.retextureFrom !== undefined && spotAnimType.retextureTo !== undefined;
    const hasScale = spotAnimType.widthScale !== 128 || spotAnimType.heightScale !== 128;
    const hasOrientation = spotAnimType.orientation !== 0;
    const workingModel =
      hasRecolor || hasRetexture || hasScale || hasOrientation
        ? ModelData.copyFrom(model, true, false, !hasRecolor, !hasRetexture, true)
        : model;
    if (hasRecolor) {
      this.applyRecoloring(workingModel, spotAnimType.recolorFrom, spotAnimType.recolorTo);
    }
    if (hasScale) {
      workingModel.resize(spotAnimType.widthScale, spotAnimType.heightScale, spotAnimType.widthScale);
    }
    this.applyOrientation(workingModel, spotAnimType.orientation);
    if (hasRetexture) {
      this.applyRetexturing(workingModel, spotAnimType.retextureFrom, spotAnimType.retextureTo);
    }

    const ambient = spotAnimType.ambient + 64;
    const contrast = spotAnimType.contrast + 850;
    const litColors = workingModel.computeLitColors(ambient, contrast, -30, -50, -30);

    const result: SpotAnimModelData = {
      spotAnimId,
      modelId,
      sequenceId: spotAnimType.sequenceId,
      model: workingModel,
      litColors,
      widthScale: spotAnimType.widthScale,
      heightScale: spotAnimType.heightScale,
      orientation: spotAnimType.orientation,
    };

    this.modelCache.set(spotAnimId, result);
    this.evictOldestModelEntries();
    return result;
  }

  loadSpotAnimMesh(spotAnimId: number): SpotAnimMeshData | null {
    const modelData = this.loadSpotAnimModelData(spotAnimId);
    if (!modelData) {
      return null;
    }

    return spotAnimModelToMesh(modelData.model, modelData.litColors ?? undefined);
  }

  getSequenceId(spotAnimId: number): number {
    const spotAnimType = this.loadSpotAnimType(spotAnimId);
    return spotAnimType?.sequenceId ?? -1;
  }

  /**
   * Without `frameIds`, `loadAnimatedSpotAnim` falls through to the model's rest pose, which is not a neutral
   * stand-in for an explosion. Unposed particles lie in a lattice across the arena floor, so route these to
   * `loadSkeletalSpotAnimModel` instead.
   */
  isSkeletalOnly(spotAnimId: number): boolean {
    const spotAnimType = this.loadSpotAnimType(spotAnimId);
    if (!spotAnimType || spotAnimType.sequenceId < 0 || !this.seqTypeLoader) {
      return false;
    }
    const seqType = this.seqTypeLoader.load(spotAnimType.sequenceId);
    if (!seqType?.isSkeletalSeq()) {
      return false;
    }
    return !seqType.frameIds || seqType.frameIds.length === 0;
  }

  /**
   * Everything that does not depend on the animation frame is baked in once here — recoloring and
   * retexturing touch face data the pose never rewrites — and the rest vertices are snapshotted so
   * `poseSkeletalSpotAnimMesh` can restore them before each pose. Skeletal posing needs the model's
   * `animMayaGroups`, which only survive on a deep vertex copy, so this cannot share the cached
   * model that `loadSpotAnimModelData` hands out.
   */
  loadSkeletalSpotAnimModel(spotAnimId: number): SkeletalSpotAnimModel | null {
    const spotAnimType = this.loadSpotAnimType(spotAnimId);
    if (!spotAnimType || spotAnimType.sequenceId < 0 || !this.seqTypeLoader) {
      return null;
    }
    const seqType = this.seqTypeLoader.load(spotAnimType.sequenceId);
    if (!seqType?.isSkeletalSeq()) {
      return null;
    }
    const source = this.modelLoader.getModel(spotAnimType.modelId);
    if (!source) {
      log.warn('SpotAnimLoader', `Failed to load model ${spotAnimType.modelId} for skeletal SpotAnim ${spotAnimId}`);
      return null;
    }

    const hasRecolor = spotAnimType.recolorFrom !== undefined && spotAnimType.recolorTo !== undefined;
    const hasRetexture = spotAnimType.retextureFrom !== undefined && spotAnimType.retextureTo !== undefined;
    const model = ModelData.copyFrom(source, true, false, !hasRecolor, !hasRetexture, false);
    if (hasRecolor) {
      this.applyRecoloring(model, spotAnimType.recolorFrom, spotAnimType.recolorTo);
    }
    if (hasRetexture) {
      this.applyRetexturing(model, spotAnimType.retextureFrom, spotAnimType.retextureTo);
    }
    model.computeAnimationTables();

    return {
      spotAnimId,
      model,
      restVerticesX: new Int32Array(model.verticesX),
      restVerticesY: new Int32Array(model.verticesY),
      restVerticesZ: new Int32Array(model.verticesZ),
      restFaceAlphas: model.faceAlphas ? new Int8Array(model.faceAlphas) : null,
      seqType,
      widthScale: spotAnimType.widthScale,
      heightScale: spotAnimType.heightScale,
      orientation: spotAnimType.orientation,
      ambient: spotAnimType.ambient + 64,
      contrast: spotAnimType.contrast + 850,
    };
  }

  /**
   * Restores the rest pose first because `animateSkeletal` and `resize` both write the model's
   * vertices in place, so posing frame N on top of frame N-1 compounds the transforms. Face alphas
   * get the same treatment for sequences carrying an alpha curve. The transform order matches the
   * frame-based path in `loadAnimatedSpotAnim` — pose, then scale, then orient.
   */
  poseSkeletalSpotAnimMesh(data: SkeletalSpotAnimModel, skeletalSeq: SkeletalSeq, frame: number): SpotAnimMeshData {
    const model = data.model;
    model.verticesX.set(data.restVerticesX);
    model.verticesY.set(data.restVerticesY);
    model.verticesZ.set(data.restVerticesZ);
    if (data.restFaceAlphas && model.faceAlphas) {
      model.faceAlphas.set(data.restFaceAlphas);
    }

    model.animateSkeletal(skeletalSeq, frame);
    if (data.widthScale !== 128 || data.heightScale !== 128) {
      model.resize(data.widthScale, data.heightScale, data.widthScale);
    }
    this.applyOrientation(model, data.orientation);

    const litColors = model.computeLitColors(data.ambient, data.contrast, -30, -50, -30);
    return spotAnimModelToMesh(model, litColors);
  }

  getModelId(spotAnimId: number): number {
    const spotAnimType = this.loadSpotAnimType(spotAnimId);
    return spotAnimType?.modelId ?? -1;
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

  private applyRetexturing(model: ModelData, from: number[], to: number[]): void {
    for (let i = 0; i < from.length; i++) {
      const sourceTexture = from[i];
      const targetTexture = to[i];
      if (sourceTexture !== undefined && targetTexture !== undefined) {
        model.retexture(sourceTexture, targetTexture);
      }
    }
  }

  private applyOrientation(model: ModelData, orientation: number): void {
    if (orientation === 90) {
      model.rotate90();
    } else if (orientation === 180) {
      model.rotate180();
    } else if (orientation === 270) {
      model.rotate270();
    }
  }

  /**
   * Bakes every frame afresh and retains nothing. `SpotAnimRenderer` owns the cached, alpha-split
   * form of these frames; caching the unsplit intermediate here as well would hold a second copy of
   * every effect's geometry. Callers that only need a frame's extent should ask the renderer.
   */
  loadAnimatedSpotAnim(spotAnimId: number): AnimatedSpotAnimData | null {
    const spotAnimType = this.loadSpotAnimType(spotAnimId);
    if (!spotAnimType || spotAnimType.sequenceId < 0 || !this.seqTypeLoader) {
      return null;
    }

    const seqType = this.seqTypeLoader.load(spotAnimType.sequenceId);
    if (!seqType) {
      log.warn('SpotAnimLoader', `No seqType for seqId ${spotAnimType.sequenceId}`);
      return null;
    }

    if (!this.seqFrameLoader || !seqType.frameIds || seqType.frameIds.length === 0) {
      return this.loadStaticAnimatedFallback(spotAnimId, seqType);
    }

    const model = this.modelLoader.getModel(spotAnimType.modelId);
    if (!model) {
      return null;
    }

    model.computeAnimationTables();

    const ambient = spotAnimType.ambient + 64;
    const contrast = spotAnimType.contrast + 850;
    const hasRecolor = spotAnimType.recolorFrom !== undefined && spotAnimType.recolorTo !== undefined;
    const hasRetexture = spotAnimType.retextureFrom !== undefined && spotAnimType.retextureTo !== undefined;
    const hasScale = spotAnimType.widthScale !== 128 || spotAnimType.heightScale !== 128;

    const frames: SpotAnimMeshData[] = [];
    const frameLengths: number[] = [];

    for (let i = 0; i < seqType.frameIds.length; i++) {
      const frameId = seqType.frameIds[i];
      const seqFrame = this.seqFrameLoader.load(frameId);

      const shallowAlphas = seqFrame ? !seqFrame.hasAlphaTransform : true;
      const modelCopy = ModelData.copyFrom(model, true, false, !hasRecolor, !hasRetexture, shallowAlphas);

      if (hasRecolor) {
        this.applyRecoloring(modelCopy, spotAnimType.recolorFrom, spotAnimType.recolorTo);
      }

      if (seqFrame) {
        modelCopy.animate(seqFrame);
      }

      if (hasScale) {
        modelCopy.resize(spotAnimType.widthScale, spotAnimType.heightScale, spotAnimType.widthScale);
      }

      this.applyOrientation(modelCopy, spotAnimType.orientation);
      if (hasRetexture) {
        this.applyRetexturing(modelCopy, spotAnimType.retextureFrom, spotAnimType.retextureTo);
      }

      const litColors = modelCopy.computeLitColors(ambient, contrast, -30, -50, -30);
      const meshData = spotAnimModelToMesh(modelCopy, litColors);
      frames.push(meshData);
      frameLengths.push(seqType.frameLengths[i] || 1);
    }

    log.info(
      'SpotAnimLoader',
      `Loaded ${frames.length} animation frames for SpotAnim ${spotAnimId} (seqId ${spotAnimType.sequenceId})`,
    );
    return { spotAnimId, frames, seqType, frameLengths };
  }

  private loadStaticAnimatedFallback(spotAnimId: number, seqType: SeqType): AnimatedSpotAnimData | null {
    const mesh = this.loadSpotAnimMesh(spotAnimId);
    if (!mesh) {
      return null;
    }
    const frameLengths =
      seqType.frameLengths && seqType.frameLengths.length > 0
        ? [...seqType.frameLengths]
        : [Math.max(seqType.getSkeletalDuration(), 1)];
    return { spotAnimId, frames: [mesh], seqType, frameLengths };
  }

  /**
   * Bumped by `clearCache`. Caches built from this loader's output elsewhere (the renderer's baked
   * spotanim geometry) compare it on lookup and drop everything baked under an older generation,
   * so this one call stays the loader's whole invalidation contract.
   */
  get cacheGeneration(): number {
    return this.generation;
  }

  clearCache(): void {
    this.modelCache.clear();
    this.generation++;
  }

  private cacheMissingModel(spotAnimId: number): null {
    this.modelCache.set(spotAnimId, null);
    this.evictOldestModelEntries();
    return null;
  }

  private evictOldestModelEntries(): void {
    while (this.modelCache.size > SpotAnimModelLoader.MODEL_CACHE_LIMIT) {
      const oldestKey = this.modelCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.modelCache.delete(oldestKey);
    }
  }
}
