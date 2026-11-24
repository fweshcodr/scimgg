import type { SeqType } from '../../rs/config/seqtype/SeqType';
import type { SkeletalSeq } from '../../rs/model/skeletal/SkeletalSeq';

export const CLIENT_TICK_MS = 20;

export type NpcAnimState = 'idle' | 'walk' | 'turnLeft' | 'turnRight' | 'attack' | 'death';
export type AnimPlayMode = 'loop' | 'oneshot' | 'loopFrameStep';

export interface SkeletalClipRef {
  kind: 'skeletal';
  id: string;
  seqId: number;
  seqType: SeqType;
  seq: SkeletalSeq;
  skeletalStart: number;
  skeletalEnd: number;
}

export interface FrameClipRef {
  kind: 'frame';
  id: string;
  seqId: number;
  seqType: SeqType;
  frameIds: readonly number[];
  frameLengths: readonly number[];
}

export type AnimClipRef = SkeletalClipRef | FrameClipRef;

export interface NpcAnimationSet {
  /**
   * Base pose clip. Absent for a type whose cache idle is -1 and that only plays configured
   * one-shot clips (e.g. a spawn clip): with no primary playing it shows its unanimated model.
   */
  idle?: AnimClipRef;
  walk?: AnimClipRef;
  attack?: AnimClipRef;
  attackClips?: Record<string, AnimClipRef>;
  death?: AnimClipRef;
  /** Death clips keyed by snapshot `deathCause`, played instead of `death` for that cause. */
  deathClips?: Record<string, AnimClipRef>;
  /**
   * One-shot clip played from the NPC's snapshot `spawnTick` before it settles into its base
   * pose. Sampled by `NpcInstanceManager` from the spawn tick, never triggered by a cue.
   */
  spawn?: AnimClipRef;
  turnLeft?: AnimClipRef;
  turnRight?: AnimClipRef;
  /**
   * Play mode for the base idle clip. Defaults to 'loop' (loop the whole seq).
   * 'loopFrameStep' respects the seq's `frameStep`: play the intro once, then loop
   * only the tail (or hold the last frame when frameStep is -1) — the authentic OSRS
   * loop behavior, for effect NPCs whose idle has a distinct one-time intro.
   */
  idlePlayMode?: AnimPlayMode;
}

export interface TurnState {
  isTurning: boolean;
  /** Signed shortest-angle delta [-1024, 1024]. Negative = left, positive = right. */
  turnDeltaSigned: number;
}

export interface MovementState {
  isMoving: boolean;
}

export interface NpcAnimationUpdateInput {
  deltaMs: number;
  speedMultiplier: number;
  turn: TurnState;
  movement: MovementState;
}

export interface AttackSignal {
  type: 'attack';
  clip?: AnimClipRef;
  durationClientTicks?: number;
  delayClientTicks?: number;
  source?: string;
}

export type AnimationSignal = AttackSignal;

export interface TriggerAttackOptions {
  clip?: AnimClipRef;
  durationClientTicks?: number;
  delayClientTicks?: number;
  source?: string;
}

export interface NpcAnimModelAdapter {
  resetPose(): void;
  applySkeletal(seq: SkeletalSeq, frame: number): void;
  applyFrame(frameId: number): void;
  /** Interleave a primary (attack) frame over a secondary (pose) frame using the primary's masks. */
  applyFrameInterleaved(primaryFrameId: number, secondaryFrameId: number, masks: number[]): void;
  resize(): void;
  commitPose(): void;
}
