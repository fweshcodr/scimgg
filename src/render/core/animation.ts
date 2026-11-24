import type { Archive } from '../../rs/cache/Archive';
import type { CacheIndex } from '../../rs/cache/CacheIndex';
import type { CacheInfo } from '../../rs/cache/CacheInfo';
import type { SeqType } from '../../rs/config/seqtype/SeqType';
import type { ModelData } from '../../rs/model/ModelData';
import type { SeqFrame } from '../../rs/model/seq/SeqFrame';
import type { SeqFrameLoader } from '../../rs/model/seq/SeqFrameLoader';
import type { SkeletalSeq } from '../../rs/model/skeletal/SkeletalSeq';

export const GAME_TICK_MS = 600;

/**
 * The client runs at 50 FPS, meaning each client tick is exactly 20ms.
 * Animation frame lengths are specified in client ticks.
 */
export const CLIENT_TICK_MS = 20;

export interface AnimationSequence {
  id: number;
  frameIds: number[];
  frameLengths: number[];
  looping: boolean;
  heightOffset: number;
  // OSRS interleaveOrder (opcode 3): bone groups the movement anim controls; others → primary
  masks?: number[];
  precedenceAnimating: number;
  priority: number;
  /**
   * OSRS seq config opcode 5 (default 5). This is the field compared when deciding
   * whether an incoming sequence may take the primary slot:
   * `incoming.forcedPriority >= current.forcedPriority`. Distinct from
   * `priority` (opcode 10) and `precedenceAnimating` (opcode 9), which drive
   * movement blocking rather than replacement.
   */
  forcedPriority: number;
}

export interface AnimationState {
  sequence: AnimationSequence;
  currentFrameIndex: number;
  frameTickProgress: number;
  elapsedMs: number;
  completed: boolean;
}

export interface AnimatedModel {
  originalModel: ModelData;
  verticesX: Int32Array;
  verticesY: Int32Array;
  verticesZ: Int32Array;
  animationState: AnimationState | null;
}

export type DrawRange = [number, number, number];

export interface AnimationFrames {
  frames: DrawRange[];
  framesAlpha?: DrawRange[];
}

export interface AnimationSystem {
  initialize(
    cacheInfo: CacheInfo,
    animIndex: CacheIndex,
    skeletonIndex: CacheIndex,
    seqArchive?: Archive,
    animKeyFramesIndex?: CacheIndex,
  ): void;

  isInitialized(): boolean;
  getCurrentTick(): number;
  getCurrentCycle(): number;
  getSeqFrameLoader(): SeqFrameLoader | null;
  getAnimIndex(): CacheIndex | null;

  loadSkeletalSeq(skeletalId: number): SkeletalSeq | undefined;
  loadSeqType(seqId: number): SeqType | undefined;
  createSequenceFromSeqType(seqType: SeqType): AnimationSequence | undefined;
  loadFrame(frameId: number): SeqFrame | undefined;

  createAnimatedModel(model: ModelData): AnimatedModel;
  startAnimation(animatedModel: AnimatedModel, sequence: AnimationSequence): void;
  stopAnimation(animatedModel: AnimatedModel): void;

  update(deltaMs: number): boolean;
  updateAnimation(animatedModel: AnimatedModel, ticksElapsed: number): void;

  createIdleSequence(idleSeqId: number, frameIds: number[], frameLengths: number[]): AnimationSequence;

  interpolateFrames(animatedModel: AnimatedModel, frame1: SeqFrame, frame2: SeqFrame, t: number): void;

  clearCache(): void;
  dispose(): void;
}

export interface LocAnimation {
  seqType: SeqType | undefined;
  frame: number;
  cycleStart: number;

  update(seqFrameLoader: SeqFrameLoader, cycle: number): number;
  getCurrentFrame(): DrawRange | undefined;
  getCurrentAlphaFrame(): DrawRange | undefined;
}
