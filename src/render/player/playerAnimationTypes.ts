import type { AnimationSequence } from '../core/animation';

export const CLIENT_TICK_MS = 20;

export type PlayerAnimState =
  | 'idle'
  | 'walk'
  | 'run'
  | 'turnLeft'
  | 'turnRight'
  | 'walkBack'
  | 'idleTurnLeft'
  | 'idleTurnRight';
export type PlayerDirectionalState = 'walk' | 'turnLeft' | 'turnRight' | 'walkBack';

export interface PlayerPoseSet {
  idle: AnimationSequence | null;
  walk: AnimationSequence | null;
  run: AnimationSequence | null;
  turnLeft: AnimationSequence | null;
  turnRight: AnimationSequence | null;
  walkBack: AnimationSequence | null;
  idleTurnLeft: AnimationSequence | null;
  idleTurnRight: AnimationSequence | null;
}

export interface PlayerAnimationSet extends PlayerPoseSet {
  attack?: AnimationSequence | null;
  block?: AnimationSequence | null;
  eat?: AnimationSequence | null;
  unarmed?: PlayerPoseSet;
}

export interface PlayerAnimationUpdateInput {
  deltaMs?: number;
  isMoving: boolean;
  /** Simulation-level pathLength > 0 — drives animation state machine, not visual interpolation. */
  simIsMoving: boolean;
  locomotionState?: PlayerDirectionalState | null;
  isRunning: boolean;
  visualAngle: number;
  targetAngle: number;
  speedMultiplier: number;
  isTurning: boolean;
}

export interface PlayerAttackSignal {
  type: 'attack';
  overrideSequence?: AnimationSequence;
}

export interface PlayerConsumeSignal {
  type: 'consume';
}

export interface PlayerIntroSignal {
  type: 'intro';
  overrideSequence: AnimationSequence;
}

/**
 * Flinch. Sent by the attacker in OSRS, on every
 * incoming hit including zero-damage ones — it is NOT gated on damage.
 */
export interface PlayerBlockSignal {
  type: 'block';
}

export type PlayerAnimationSignal = PlayerAttackSignal | PlayerConsumeSignal | PlayerIntroSignal | PlayerBlockSignal;

export interface PlayerAnimModelAdapter {
  resetPose(): void;
  applyFrame(frameId: number): void;
  applyFrameInterleaved(primaryFrameId: number, secondaryFrameId: number, interleaveOrder: number[]): void;
  commitPose(): void;
  applyMesh(meshPair: import('./PlayerAnimationController').PlayerAnimatedMeshPair): void;
}
