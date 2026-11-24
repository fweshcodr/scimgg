import type { Archive } from '../../../rs/cache/Archive';
import type { CacheIndex } from '../../../rs/cache/CacheIndex';
import type { CacheInfo } from '../../../rs/cache/CacheInfo';
import type { SeqType } from '../../../rs/config/seqtype/SeqType';
import { ArchiveSeqTypeLoader, type SeqTypeLoader } from '../../../rs/config/seqtype/SeqTypeLoader';
import { COSINE, SINE } from '../../../rs/MathConstants';
import type { ModelData } from '../../../rs/model/ModelData';
import { IndexSeqBaseLoader, type SeqBaseLoader } from '../../../rs/model/seq/SeqBaseLoader';
import type { SeqFrame } from '../../../rs/model/seq/SeqFrame';
import { Dat2SeqFrameLoader, type SeqFrameLoader } from '../../../rs/model/seq/SeqFrameLoader';
import { SeqTransformType } from '../../../rs/model/seq/SeqTransformType';
import type { SkeletalSeq } from '../../../rs/model/skeletal/SkeletalSeq';
import { IndexSkeletalSeqLoader, type SkeletalSeqLoader } from '../../../rs/model/skeletal/SkeletalSeqLoader';
import { log } from '../../../util/Logger';
import {
  type AnimatedModel,
  type AnimationSequence,
  GAME_TICK_MS,
  type AnimationSystem as IAnimationSystem,
} from '../../core/animation';

export type { AnimatedModel, AnimationSequence } from '../../core/animation';
export { GAME_TICK_MS };

export class AnimationSystem implements IAnimationSystem {
  private seqFrameLoader: SeqFrameLoader | null = null;
  private seqTypeLoader: SeqTypeLoader | null = null;
  private skeletalSeqLoader: SkeletalSeqLoader | null = null;
  private seqBaseLoader: SeqBaseLoader | null = null;
  private animIndex: CacheIndex | null = null;
  private frameCache: Map<number, SeqFrame | undefined> = new Map();
  private seqTypeCache: Map<number, SeqType | undefined> = new Map();
  private skeletalSeqCache: Map<number, SkeletalSeq | undefined> = new Map();
  private lastTickTime: number = 0;
  private currentGameTick: number = 0;
  private currentCycle: number = 0;

  initialize(
    cacheInfo: CacheInfo,
    animIndex: CacheIndex,
    skeletonIndex: CacheIndex,
    seqArchive?: Archive,
    animKeyFramesIndex?: CacheIndex,
  ): void {
    this.animIndex = animIndex;
    this.seqBaseLoader = new IndexSeqBaseLoader(cacheInfo, skeletonIndex);
    this.seqFrameLoader = new Dat2SeqFrameLoader(cacheInfo, animIndex, this.seqBaseLoader);

    const skeletalIndex = animKeyFramesIndex ?? animIndex;
    this.skeletalSeqLoader = new IndexSkeletalSeqLoader(skeletalIndex, this.seqBaseLoader);
    log.info(
      'AnimationSystem',
      `Initialized with skeletalSeqLoader (using ${animKeyFramesIndex ? 'animKeyFrames' : 'anim'} index)`,
    );

    if (seqArchive) {
      this.seqTypeLoader = new ArchiveSeqTypeLoader(cacheInfo, seqArchive);
      log.info('AnimationSystem', `Initialized with seqTypeLoader (archive fileCount=${seqArchive.fileCount})`);
    } else {
      log.warn('AnimationSystem', 'Initialized without seqTypeLoader (no seqArchive provided)');
    }

    this.frameCache.clear();
    this.seqTypeCache.clear();
    this.skeletalSeqCache.clear();
    this.lastTickTime = performance.now();
    this.currentGameTick = 0;
    this.currentCycle = 0;
  }

  isInitialized(): boolean {
    return this.seqFrameLoader !== null;
  }

  getCurrentTick(): number {
    return this.currentGameTick;
  }

  getCurrentCycle(): number {
    return this.currentCycle;
  }

  getSeqFrameLoader(): SeqFrameLoader | null {
    return this.seqFrameLoader;
  }

  getSkeletalSeqLoader(): SkeletalSeqLoader | null {
    return this.skeletalSeqLoader;
  }

  getAnimIndex(): CacheIndex | null {
    return this.animIndex;
  }

  loadSkeletalSeq(skeletalId: number): SkeletalSeq | undefined {
    if (!this.skeletalSeqLoader) {
      log.warn('AnimationSystem', 'loadSkeletalSeq: skeletalSeqLoader is null');
      return undefined;
    }

    if (this.skeletalSeqCache.has(skeletalId)) {
      return this.skeletalSeqCache.get(skeletalId);
    }

    try {
      const skeletalSeq = this.skeletalSeqLoader.load(skeletalId);
      log.debug('AnimationSystem', `loadSkeletalSeq(${skeletalId}) loaded successfully`);
      this.skeletalSeqCache.set(skeletalId, skeletalSeq);
      return skeletalSeq;
    } catch (e) {
      log.warn('AnimationSystem', `Failed to load SkeletalSeq ${skeletalId}`, e);
      this.skeletalSeqCache.set(skeletalId, undefined);
      return undefined;
    }
  }

  loadSeqType(seqId: number): SeqType | undefined {
    if (!this.seqTypeLoader) {
      log.warn('AnimationSystem', 'loadSeqType: seqTypeLoader is null');
      return undefined;
    }

    if (this.seqTypeCache.has(seqId)) {
      return this.seqTypeCache.get(seqId);
    }

    try {
      const seqType = this.seqTypeLoader.load(seqId);
      log.debug(
        'AnimationSystem',
        `loadSeqType(${seqId}) loaded, frameIds=${seqType.frameIds?.length ?? 0}, frameLengths=${seqType.frameLengths?.length ?? 0}, skeletalId=${seqType.skeletalId}`,
      );
      if (seqType.frameIds && seqType.frameIds.length > 0) {
        log.trace('AnimationSystem', `frameIds[0..2]: ${seqType.frameIds.slice(0, 3).join(', ')}`);
        log.trace('AnimationSystem', `frameLengths[0..2]: ${seqType.frameLengths.slice(0, 3).join(', ')}`);
      }
      if (seqType.skeletalId >= 0) {
        log.trace('AnimationSystem', `skeletalStart=${seqType.skeletalStart}, skeletalEnd=${seqType.skeletalEnd}`);
      }
      this.seqTypeCache.set(seqId, seqType);
      return seqType;
    } catch (e) {
      log.warn('AnimationSystem', `Failed to load SeqType ${seqId}`, e);
      this.seqTypeCache.set(seqId, undefined);
      return undefined;
    }
  }

  createSequenceFromSeqType(seqType: SeqType): AnimationSequence | undefined {
    if (!seqType.frameIds || seqType.frameIds.length === 0) {
      return undefined;
    }

    return {
      id: seqType.id,
      frameIds: seqType.frameIds,
      frameLengths: seqType.frameLengths,
      looping: seqType.frameStep !== -1,
      heightOffset: seqType.heightOffset,
      masks: seqType.masks,
      precedenceAnimating: seqType.precedenceAnimating,
      priority: seqType.priority,
      forcedPriority: seqType.forcedPriority,
    };
  }

  loadFrame(frameId: number): SeqFrame | undefined {
    if (!this.seqFrameLoader) {
      return undefined;
    }

    if (this.frameCache.has(frameId)) {
      return this.frameCache.get(frameId);
    }

    try {
      const frame = this.seqFrameLoader.load(frameId);
      this.frameCache.set(frameId, frame);
      return frame;
    } catch (e) {
      log.warn('AnimationSystem', `Failed to load animation frame ${frameId}`, e);
      this.frameCache.set(frameId, undefined);
      return undefined;
    }
  }

  createAnimatedModel(model: ModelData): AnimatedModel {
    return {
      originalModel: model,
      verticesX: new Int32Array(model.verticesX),
      verticesY: new Int32Array(model.verticesY),
      verticesZ: new Int32Array(model.verticesZ),
      animationState: null,
    };
  }

  startAnimation(animatedModel: AnimatedModel, sequence: AnimationSequence): void {
    animatedModel.animationState = {
      sequence,
      currentFrameIndex: 0,
      frameTickProgress: 0,
      elapsedMs: 0,
      completed: false,
    };
  }

  stopAnimation(animatedModel: AnimatedModel): void {
    animatedModel.animationState = null;
    animatedModel.verticesX.set(animatedModel.originalModel.verticesX);
    animatedModel.verticesY.set(animatedModel.originalModel.verticesY);
    animatedModel.verticesZ.set(animatedModel.originalModel.verticesZ);
  }

  update(deltaMs: number): boolean {
    const now = performance.now();
    const tickOccurred = now - this.lastTickTime >= GAME_TICK_MS;
    if (tickOccurred) {
      this.lastTickTime = now;
      this.currentGameTick++;
    }
    this.currentCycle += deltaMs / 20;
    return tickOccurred;
  }

  updateAnimation(animatedModel: AnimatedModel, ticksElapsed: number): void {
    const state = animatedModel.animationState;
    if (!state || state.completed || ticksElapsed <= 0) {
      return;
    }

    state.frameTickProgress += ticksElapsed;

    const frameLengths = state.sequence.frameLengths;
    while (state.frameTickProgress >= frameLengths[state.currentFrameIndex] && !state.completed) {
      state.frameTickProgress -= frameLengths[state.currentFrameIndex];
      state.currentFrameIndex++;

      if (state.currentFrameIndex >= state.sequence.frameIds.length) {
        if (state.sequence.looping) {
          state.currentFrameIndex = 0;
        } else {
          state.completed = true;
          state.currentFrameIndex = state.sequence.frameIds.length - 1;
          state.frameTickProgress = 0;
        }
      }
    }

    this.applyFrame(animatedModel);
  }

  private applyFrame(animatedModel: AnimatedModel): void {
    const state = animatedModel.animationState;
    if (!state) {
      return;
    }

    const frameId = state.sequence.frameIds[state.currentFrameIndex];
    const frame = this.loadFrame(frameId);
    if (!frame) {
      return;
    }
    animatedModel.verticesX.set(animatedModel.originalModel.verticesX);
    animatedModel.verticesY.set(animatedModel.originalModel.verticesY);
    animatedModel.verticesZ.set(animatedModel.originalModel.verticesZ);
    this.applyFrameTransforms(animatedModel, frame);
  }

  private applyFrameTransforms(animatedModel: AnimatedModel, frame: SeqFrame): void {
    const model = animatedModel.originalModel;
    const vertexLabels = model.vertexLabels;

    if (!vertexLabels) {
      return;
    }

    let originX = 0;
    let originY = 0;
    let originZ = 0;

    const base = frame.base;

    for (let i = 0; i < frame.transformCount; i++) {
      const group = frame.transformGroups[i];
      const type = base.types[group];
      const labels = base.labels[group];
      const tx = frame.transformX[i];
      const ty = frame.transformY[i];
      const tz = frame.transformZ[i];

      const resetOriginGroup = frame.resetOriginGroups[i];
      if (resetOriginGroup !== -1) {
        const resetLabels = base.labels[resetOriginGroup];
        const origin = this.calculateOrigin(animatedModel, resetLabels, vertexLabels);
        originX = origin.x;
        originY = origin.y;
        originZ = origin.z;
      }

      switch (type) {
        case SeqTransformType.ORIGIN: {
          const newOrigin = this.calculateOrigin(animatedModel, labels, vertexLabels);
          originX = tx + newOrigin.x;
          originY = ty + newOrigin.y;
          originZ = tz + newOrigin.z;
          break;
        }

        case SeqTransformType.TRANSLATE:
          this.applyTranslation(animatedModel, labels, vertexLabels, tx, ty, tz);
          break;

        case SeqTransformType.ROTATE:
          this.applyRotation(animatedModel, labels, vertexLabels, tx, ty, tz, originX, originY, originZ);
          break;

        case SeqTransformType.SCALE:
          this.applyScale(animatedModel, labels, vertexLabels, tx, ty, tz, originX, originY, originZ);
          break;
      }
    }
  }

  private calculateOrigin(
    animatedModel: AnimatedModel,
    labels: number[],
    vertexLabels: Int32Array[],
  ): { x: number; y: number; z: number } {
    let sumX = 0;
    let sumY = 0;
    let sumZ = 0;
    let count = 0;

    for (const label of labels) {
      if (label < vertexLabels.length) {
        for (const v of vertexLabels[label]) {
          sumX += animatedModel.verticesX[v];
          sumY += animatedModel.verticesY[v];
          sumZ += animatedModel.verticesZ[v];
          count++;
        }
      }
    }
    if (count === 0) {
      return { x: 0, y: 0, z: 0 };
    }

    return {
      x: Math.floor(sumX / count),
      y: Math.floor(sumY / count),
      z: Math.floor(sumZ / count),
    };
  }

  private applyTranslation(
    animatedModel: AnimatedModel,
    labels: number[],
    vertexLabels: Int32Array[],
    tx: number,
    ty: number,
    tz: number,
  ): void {
    for (const label of labels) {
      if (label < vertexLabels.length) {
        for (const v of vertexLabels[label]) {
          animatedModel.verticesX[v] += tx;
          animatedModel.verticesY[v] += ty;
          animatedModel.verticesZ[v] += tz;
        }
      }
    }
  }

  private applyRotation(
    animatedModel: AnimatedModel,
    labels: number[],
    vertexLabels: Int32Array[],
    rx: number,
    ry: number,
    rz: number,
    originX: number,
    originY: number,
    originZ: number,
  ): void {
    const angleX = (rx & 0xff) * 8;
    const angleY = (ry & 0xff) * 8;
    const angleZ = (rz & 0xff) * 8;

    for (const label of labels) {
      if (label < vertexLabels.length) {
        for (const v of vertexLabels[label]) {
          let vx = animatedModel.verticesX[v] - originX;
          let vy = animatedModel.verticesY[v] - originY;
          let vz = animatedModel.verticesZ[v] - originZ;

          if (angleZ !== 0) {
            const sin = SINE[angleZ];
            const cos = COSINE[angleZ];
            const temp = (sin * vy + cos * vx) >> 16;
            vy = (cos * vy - sin * vx) >> 16;
            vx = temp;
          }

          if (angleX !== 0) {
            const sin = SINE[angleX];
            const cos = COSINE[angleX];
            const temp = (cos * vy - sin * vz) >> 16;
            vz = (sin * vy + cos * vz) >> 16;
            vy = temp;
          }

          if (angleY !== 0) {
            const sin = SINE[angleY];
            const cos = COSINE[angleY];
            const temp = (sin * vz + cos * vx) >> 16;
            vz = (cos * vz - sin * vx) >> 16;
            vx = temp;
          }

          animatedModel.verticesX[v] = vx + originX;
          animatedModel.verticesY[v] = vy + originY;
          animatedModel.verticesZ[v] = vz + originZ;
        }
      }
    }
  }

  private applyScale(
    animatedModel: AnimatedModel,
    labels: number[],
    vertexLabels: Int32Array[],
    sx: number,
    sy: number,
    sz: number,
    originX: number,
    originY: number,
    originZ: number,
  ): void {
    for (const label of labels) {
      if (label < vertexLabels.length) {
        for (const v of vertexLabels[label]) {
          animatedModel.verticesX[v] -= originX;
          animatedModel.verticesY[v] -= originY;
          animatedModel.verticesZ[v] -= originZ;

          animatedModel.verticesX[v] = Math.floor((sx * animatedModel.verticesX[v]) / 128);
          animatedModel.verticesY[v] = Math.floor((sy * animatedModel.verticesY[v]) / 128);
          animatedModel.verticesZ[v] = Math.floor((sz * animatedModel.verticesZ[v]) / 128);

          animatedModel.verticesX[v] += originX;
          animatedModel.verticesY[v] += originY;
          animatedModel.verticesZ[v] += originZ;
        }
      }
    }
  }

  createIdleSequence(idleSeqId: number, frameIds: number[], frameLengths: number[]): AnimationSequence {
    return {
      id: idleSeqId,
      frameIds,
      frameLengths,
      looping: true,
      heightOffset: 0,
      precedenceAnimating: 2,
      priority: 2,
      forcedPriority: 5,
    };
  }

  interpolateFrames(animatedModel: AnimatedModel, frame1: SeqFrame, frame2: SeqFrame, t: number): void {
    if (t < 0.5) {
      this.applyFrameTransforms(animatedModel, frame1);
    } else {
      this.applyFrameTransforms(animatedModel, frame2);
    }
  }

  clearCache(): void {
    this.frameCache.clear();
    this.seqTypeCache.clear();
    this.skeletalSeqCache.clear();
    if (this.seqFrameLoader) {
      this.seqFrameLoader.clearCache();
    }
    if (this.skeletalSeqLoader) {
      this.skeletalSeqLoader.clearCache();
    }
  }

  dispose(): void {
    this.clearCache();
    this.seqFrameLoader = null;
    this.skeletalSeqLoader = null;
    this.seqBaseLoader = null;
    this.animIndex = null;
  }
}

export function createAnimationSystem(): AnimationSystem {
  return new AnimationSystem();
}
