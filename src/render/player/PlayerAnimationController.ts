import type { PlayerModelData } from '../../rs/model/PlayerModelLoader';
import {
  faceTextureLayer,
  modelHasTextures,
  type TextureLayerResolver,
  writeFaceTextureAttributes,
} from '../../rs/model/textureUv';
import { writeUnitNormal } from '../../rs/model/VertexNormal';
import type { AnimationSequence } from '../core/animation';
import { type FaceSortInput, type SorterProjection, sortModelFaces } from '../core/FacePrioritySorter';
import type { PlayerPrimaryClip } from '../core/replayPrimaryCues';
import { canReplacePrimary, type PrimarySample } from '../core/replayPrimaryIndex';
import {
  CLIENT_TICK_MS,
  type PlayerAnimationSet,
  type PlayerAnimationSignal,
  type PlayerAnimationUpdateInput,
  type PlayerAnimModelAdapter,
  type PlayerAnimState,
  type PlayerDirectionalState,
  type PlayerPoseSet,
} from './playerAnimationTypes';

export interface PlayerAnimatedMeshData {
  positions: Float32Array;
  normals: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  faceBias: Float32Array;
  /** Interleaved `(u, v)` per vertex; only present when the equipped models are textured. */
  uvs?: Float32Array;
  /** Texture-array layer per vertex; 0 = untextured. Paired with {@link PlayerAnimatedMeshData.uvs}. */
  textureIds?: Float32Array;
}

export interface PlayerAnimatedMeshPair {
  opaque: PlayerAnimatedMeshData | null;
  transparent: PlayerAnimatedMeshData | null;
}

export interface ConsumeAnimSnapshot {
  primaryAnimFrame: number;
  primaryAnimFrameTick: number;
  primaryAnimTickAccumulatorMs: number;
}

const TRIG_EPSILON = 1e-6;

// Must match PlayerVisualTracker.DEFAULT_TURN_SPEED; the value itself is unsourced.
const PLAYER_TURN_STEP_UNITS = 32;

export class PlayerAnimationController {
  private playerModelData: PlayerModelData;
  private modelAdapter: PlayerAnimModelAdapter;
  private readonly signalQueue: PlayerAnimationSignal[] = [];

  private currentPlayerSequence;
  private playerMovementState: PlayerAnimState = 'idle';
  private playerAnimFrame = 0;
  private playerAnimFrameTick = 0;
  private playerAnimTickAccumulatorMs = 0;
  private primarySequence: AnimationSequence | null = null;
  private primaryAnimFrame = 0;
  private primaryAnimFrameTick = 0;
  private primaryAnimTickAccumulatorMs = 0;
  private primaryAnimCompleted = true;
  private primaryIsConsume = false;
  private primaryIsIntro = false;
  private primaryRestored = false;
  private introAnimStarted = false;
  private introAnimCompleted = false;
  private idleTurnCounter = 0;
  private lastPlayerAnimTime = 0;
  private lastPoseKey: string | null = null;
  private sorterProjection: SorterProjection | null = null;
  private meshOutputFaceCapacity = 0;
  // Separate output buffers for opaque and transparent — avoids .slice() allocations
  private meshOutputOpaquePositions = new Float32Array(0);
  private meshOutputOpaqueNormals = new Float32Array(0);
  private meshOutputOpaqueHslColors = new Float32Array(0);
  private meshOutputOpaqueAlphas = new Float32Array(0);
  private meshOutputOpaqueFaceBias = new Float32Array(0);
  private meshOutputTransparentPositions = new Float32Array(0);
  private meshOutputTransparentNormals = new Float32Array(0);
  private meshOutputTransparentHslColors = new Float32Array(0);
  private meshOutputTransparentAlphas = new Float32Array(0);
  private meshOutputTransparentFaceBias = new Float32Array(0);
  private meshOutputOpaqueUvs = new Float32Array(0);
  private meshOutputOpaqueTextureIds = new Float32Array(0);
  private meshOutputTransparentUvs = new Float32Array(0);
  private meshOutputTransparentTextureIds = new Float32Array(0);
  private meshOutputHasTextures = false;
  private readonly resolveTextureLayer: TextureLayerResolver | undefined;

  private projectionDirty = false;
  /**
   * Set by {@link reset}. Forces the next `updatePlayerAnimation` to resolve and
   * commit a pose even when it is handed a zero delta — which is exactly the
   * case on a paused replay seek, where the compositor passes `deltaMs: 0`.
   */
  private poseRebuildPending = false;

  constructor(params: {
    playerModelData: PlayerModelData;
    animationSet: PlayerAnimationSet;
    modelAdapter: PlayerAnimModelAdapter;
    resolveTextureLayer?: TextureLayerResolver;
  }) {
    this.resolveTextureLayer = params.resolveTextureLayer;
    this.playerModelData = params.playerModelData;
    this.animationSet = params.animationSet;
    this.modelAdapter = params.modelAdapter;
    this.currentPlayerSequence = this.animationSet.idle;
    this.rebuildMeshScratchBuffers();
  }

  private animationSet: PlayerAnimationSet;

  private get activePoseSet(): PlayerPoseSet {
    if (!this.primaryAnimCompleted && this.primaryIsConsume && this.animationSet.unarmed) {
      return this.animationSet.unarmed;
    }
    return this.animationSet;
  }

  private poseSeqFor(state: PlayerAnimState): AnimationSequence | null {
    return this.activePoseSet[state];
  }

  private applyMovementState(newState: PlayerAnimState, seq: AnimationSequence): void {
    if (this.playerMovementState === newState && this.currentPlayerSequence === seq) {
      return;
    }
    this.playerMovementState = newState;
    this.currentPlayerSequence = seq;
    if (this.playerAnimFrame >= seq.frameIds.length) {
      this.playerAnimFrame = 0;
      this.playerAnimFrameTick = 0;
    }
    this.lastPoseKey = null;
  }

  private resolveTrailState(preferRun: boolean): { state: PlayerAnimState; seq: AnimationSequence } | null {
    const candidates: PlayerAnimState[] = preferRun ? ['run', 'walk'] : ['walk', 'run'];
    for (const state of candidates) {
      const seq = this.poseSeqFor(state);
      if (seq) {
        return { state, seq };
      }
    }
    return null;
  }

  private refreshCurrentPoseSequence(): void {
    const newSeq = this.poseSeqFor(this.playerMovementState);
    if (newSeq && newSeq !== this.currentPlayerSequence) {
      this.currentPlayerSequence = newSeq;
      if (this.playerAnimFrame >= newSeq.frameIds.length) {
        this.playerAnimFrame = 0;
        this.playerAnimFrameTick = 0;
      }
      this.lastPoseKey = null;
    }
  }

  updateModel(params: {
    playerModelData: PlayerModelData;
    animationSet: PlayerAnimationSet;
    modelAdapter: PlayerAnimModelAdapter;
  }): void {
    this.playerModelData = params.playerModelData;
    this.animationSet = params.animationSet;
    this.modelAdapter = params.modelAdapter;
    this.rebuildMeshScratchBuffers();

    this.refreshCurrentPoseSequence();
    this.lastPoseKey = null;
  }

  private rebuildMeshScratchBuffers(): void {
    const model = this.playerModelData?.mergedModel;
    const faceCount = model?.faceCount ?? 0;
    const hasTextures =
      this.resolveTextureLayer !== undefined && !!model && modelHasTextures(model.faceTextures, faceCount);
    if (faceCount === this.meshOutputFaceCapacity && hasTextures === this.meshOutputHasTextures) {
      return;
    }
    this.meshOutputFaceCapacity = faceCount;
    this.meshOutputHasTextures = hasTextures;
    this.meshOutputOpaquePositions = new Float32Array(faceCount * 9);
    this.meshOutputOpaqueNormals = new Float32Array(faceCount * 9);
    this.meshOutputOpaqueHslColors = new Float32Array(faceCount * 3);
    this.meshOutputOpaqueAlphas = new Float32Array(faceCount * 3);
    this.meshOutputOpaqueFaceBias = new Float32Array(faceCount * 3);
    this.meshOutputTransparentPositions = new Float32Array(faceCount * 9);
    this.meshOutputTransparentNormals = new Float32Array(faceCount * 9);
    this.meshOutputTransparentHslColors = new Float32Array(faceCount * 3);
    this.meshOutputTransparentAlphas = new Float32Array(faceCount * 3);
    this.meshOutputTransparentFaceBias = new Float32Array(faceCount * 3);
    this.meshOutputOpaqueUvs = new Float32Array(hasTextures ? faceCount * 6 : 0);
    this.meshOutputOpaqueTextureIds = new Float32Array(hasTextures ? faceCount * 3 : 0);
    this.meshOutputTransparentUvs = new Float32Array(hasTextures ? faceCount * 6 : 0);
    this.meshOutputTransparentTextureIds = new Float32Array(hasTextures ? faceCount * 3 : 0);
  }

  /**
   * Drop every piece of cross-tick animation state so the next
   * `updatePlayerAnimation` rebuilds the pose purely from the frame it is given.
   *
   * Called on a replay-timeline discontinuity (rewind / forward-jump / timeline
   * change). Without it, a seek keeps whatever primary animation was mid-flight
   * — the player stays frozen in a half-finished attack/eat swing from the tick
   * you jumped away from, and any queued signal fires a tick later on the new
   * timeline. The model/pose caches are intentionally kept: they are static
   * per-model data, not timeline state.
   *
   * PERF: a scrub produces one discontinuity per animation frame, so this runs
   * at frame rate. It must stay allocation-free, and it must NOT invalidate
   * `lastPoseKey` — that key is what lets `updatePlayerAnimation` skip the
   * expensive rebuild (vertex normals + full face sort + buffer refill) when the
   * resolved pose is unchanged. We only request a forced rebuild when the reset
   * actually dropped something the committed pose depends on.
   */
  reset(): void {
    this.primaryRestored = false;
    const hadPrimary = !this.primaryAnimCompleted || this.primarySequence !== null;
    const hadQueuedSignal = this.signalQueue.length > 0;
    const wasMoving = this.playerMovementState !== 'idle';

    this.signalQueue.length = 0;
    this.primarySequence = null;
    this.primaryAnimFrame = 0;
    this.primaryAnimFrameTick = 0;
    this.primaryAnimTickAccumulatorMs = 0;
    this.primaryAnimCompleted = true;
    this.primaryIsConsume = false;
    this.primaryIsIntro = false;
    this.introAnimStarted = false;
    this.introAnimCompleted = false;
    this.idleTurnCounter = 0;
    this.lastPlayerAnimTime = 0;

    // Only rewind the looping movement pose when it was NOT already idle.
    // Rewinding an already-idle loop to frame 0 changes the pose key, which both
    // pins the idle animation to its first frame and forces a full rebuild on
    // every frame of a scrub.
    if (wasMoving) {
      this.playerMovementState = 'idle';
      this.currentPlayerSequence = this.animationSet.idle;
      this.playerAnimFrame = 0;
      this.playerAnimFrameTick = 0;
      this.playerAnimTickAccumulatorMs = 0;
    }

    // Only a reset that actually invalidated the on-screen pose needs the
    // zero-delta fall-through (paused replay seek). An idle player mid-scrub
    // resolves to the same pose key and costs nothing.
    this.poseRebuildPending = this.poseRebuildPending || hadPrimary || hadQueuedSignal || wasMoving;
  }

  enqueueSignal(signal: PlayerAnimationSignal): void {
    this.signalQueue.push(signal);
  }

  restorePrimaryAt(primary: PrimarySample<PlayerPrimaryClip> | null): void {
    this.signalQueue.length = 0;
    this.primarySequence = primary?.clip.sequence ?? null;
    this.primaryAnimFrame = 0;
    this.primaryAnimFrameTick = primary?.elapsedTicks ?? 0;
    this.primaryAnimTickAccumulatorMs = primary?.remainderMs ?? 0;
    this.primaryAnimCompleted = primary === null;
    this.primaryIsConsume = primary?.clip.kind === 'consume';
    this.primaryIsIntro = primary?.clip.kind === 'intro';
    if (this.primaryIsIntro) {
      this.introAnimStarted = true;
      this.introAnimCompleted = false;
    }
    if (this.primarySequence) {
      while (
        this.primaryAnimFrame < this.primarySequence.frameIds.length &&
        this.primaryAnimFrameTick >= this.primarySequence.frameLengths[this.primaryAnimFrame]
      ) {
        this.primaryAnimFrameTick -= this.primarySequence.frameLengths[this.primaryAnimFrame];
        this.primaryAnimFrame++;
      }
    }
    this.refreshCurrentPoseSequence();
    this.primaryRestored = true;
    this.poseRebuildPending = true;
  }

  triggerAttack(): void {
    this.enqueueSignal({ type: 'attack' });
  }

  triggerAttackWithSequence(sequence: AnimationSequence): void {
    this.enqueueSignal({ type: 'attack', overrideSequence: sequence });
  }

  triggerConsume(): void {
    this.enqueueSignal({ type: 'consume' });
  }

  triggerBlock(): void {
    this.enqueueSignal({ type: 'block' });
  }

  /**
   * OSRS animation arbitration for the player's single primary slot: an incoming
   * sequence may only take it when `incoming.forcedPriority >= current.forcedPriority`
   * (seq config opcode 5). A losing sequence is discarded outright — it does not
   * restart the clip that is playing.
   *
   * Only the flinch is gated. Attack/consume/intro are player-initiated actions
   * that always claim the slot, and with real cache values gating them would be a
   * no-op anyway: every weapon attack seq explicitly sets `forcedPriority` 6
   * (`human_sword_slash`, `human_bow`, `scythe_of_vitur_attack`,
   * `human_atlatl_attack_ranged_01`, ...) while every block seq omits opcode 5 and
   * defaults to 5 (`human_unarmedblock`, `human_shield_defence`,
   * `human_staff_block`, `human_scythe_block`, ...). So a flinch can never cut off
   * an attack, but an attack replaces a flinch.
   *
   * This is also why the wave-69 Inferno capture never carries a block sequence on a tick
   * where the player attacked (0 of 285): the attack is set at priority 6 first, so the
   * block at 5 is rejected.
   */
  private canReplacePrimaryWith(sequence: AnimationSequence): boolean {
    if (this.primaryAnimCompleted || !this.primarySequence) {
      return true;
    }
    return canReplacePrimary(this.primarySequence.forcedPriority, sequence.forcedPriority);
  }

  setSorterProjection(proj: SorterProjection | null): void {
    const prev = this.sorterProjection;

    if (prev === null && proj === null) {
      return;
    }

    if (prev === null || proj === null) {
      this.sorterProjection = proj;
      this.projectionDirty = true;
      return;
    }

    if (
      prev.orientation !== proj.orientation ||
      prev.cameraX !== proj.cameraX ||
      prev.cameraY !== proj.cameraY ||
      prev.cameraZ !== proj.cameraZ ||
      prev.modelX !== proj.modelX ||
      prev.modelY !== proj.modelY ||
      prev.modelZ !== proj.modelZ ||
      Math.abs(prev.yawSin - proj.yawSin) > TRIG_EPSILON ||
      Math.abs(prev.yawCos - proj.yawCos) > TRIG_EPSILON ||
      Math.abs(prev.pitchSin - proj.pitchSin) > TRIG_EPSILON ||
      Math.abs(prev.pitchCos - proj.pitchCos) > TRIG_EPSILON
    ) {
      this.sorterProjection = proj;
      this.projectionDirty = true;
    }
  }

  refreshSorterModelY(modelY: number): void {
    if (this.sorterProjection === null || this.sorterProjection.modelY === modelY) {
      return;
    }
    this.setSorterProjection({ ...this.sorterProjection, modelY });
    this.rebuildMeshOnly();
  }

  isIntroAnimComplete(): boolean {
    return this.introAnimStarted && this.introAnimCompleted;
  }

  /**
   * Animation time left in the playing intro, in ms at 1x speed: the client ticks its remaining
   * frames still hold, less the time already accumulated toward the next one. Null when no intro
   * holds the primary slot (not started yet, finished, or never queued).
   */
  getIntroRemainingAnimMs(): number | null {
    const sequence = this.primarySequence;
    if (!this.primaryIsIntro || this.primaryAnimCompleted || !sequence) return null;
    let remainingTicks = -this.primaryAnimFrameTick;
    for (let frame = this.primaryAnimFrame; frame < sequence.frameIds.length; frame++) {
      remainingTicks += sequence.frameLengths[frame];
    }
    return Math.max(0, remainingTicks * CLIENT_TICK_MS - this.primaryAnimTickAccumulatorMs);
  }

  getFrameState(): { seqId: number; currentFrameIndex: number } | null {
    if (!this.primaryAnimCompleted && this.primarySequence) {
      return { seqId: this.primarySequence.id, currentFrameIndex: this.primaryAnimFrame };
    }
    const seq = this.currentPlayerSequence;
    if (!seq) return null;
    return { seqId: seq.id, currentFrameIndex: this.playerAnimFrame };
  }

  getAnimationHeightOffset(): number {
    const primary = !this.primaryAnimCompleted ? this.primarySequence : null;
    const movement = this.currentPlayerSequence ?? this.poseSeqFor('idle');
    const idle = this.activePoseSet.idle;
    const movementIsSuppressed = primary !== null && idle !== null && movement?.id === idle.id;
    return (movementIsSuppressed ? primary : (movement ?? primary))?.heightOffset ?? 0;
  }

  /**
   * Returns whether the current primary animation blocks walk/run movement.
   * Based on precedenceAnimating (bh/chatPriority) and priority (bl/mainHandPriority).
   */
  getPrimaryAnimMovementBlock(): { blocksRunning: boolean; blocksWalking: boolean } {
    if (!this.primaryAnimCompleted && this.primarySequence) {
      return {
        blocksRunning: this.primarySequence.precedenceAnimating === 0,
        blocksWalking: this.primarySequence.priority === 0,
      };
    }
    return { blocksRunning: false, blocksWalking: false };
  }

  getConsumeAnimSnapshot(): ConsumeAnimSnapshot | null {
    if (this.primaryAnimCompleted || !this.primaryIsConsume) return null;
    return {
      primaryAnimFrame: this.primaryAnimFrame,
      primaryAnimFrameTick: this.primaryAnimFrameTick,
      primaryAnimTickAccumulatorMs: this.primaryAnimTickAccumulatorMs,
    };
  }

  restoreConsumeAnim(snapshot: ConsumeAnimSnapshot): void {
    const eatSeq = this.animationSet.eat;
    if (!eatSeq) return;
    if (snapshot.primaryAnimFrame >= eatSeq.frameIds.length) return;
    this.primarySequence = eatSeq;
    this.primaryAnimFrame = snapshot.primaryAnimFrame;
    this.primaryAnimFrameTick = snapshot.primaryAnimFrameTick;
    this.primaryAnimTickAccumulatorMs = snapshot.primaryAnimTickAccumulatorMs;
    this.primaryAnimCompleted = false;
    this.primaryIsConsume = true;
    this.primaryIsIntro = false;
    this.refreshCurrentPoseSequence();
  }

  applyInitialAnimationFrame(): void {
    if (!this.playerModelData?.mergedModel) {
      return;
    }

    const seq = this.currentPlayerSequence ?? this.poseSeqFor('idle');
    if (!seq || seq.frameIds.length === 0) {
      return;
    }

    const poseFrameId = seq.frameIds[0];
    let poseKey = `pose:${seq.id}:${poseFrameId}`;

    let primaryFrameId: number | null = null;
    if (!this.primaryAnimCompleted && this.primarySequence) {
      primaryFrameId = this.primarySequence.frameIds[this.primaryAnimFrame];
      poseKey += `+primary:${this.primarySequence.id}:${primaryFrameId}`;
    }

    this.modelAdapter.resetPose();
    const hasPrimary = primaryFrameId !== null;
    const idleSeq = this.activePoseSet.idle;
    if (hasPrimary && this.primarySequence?.masks && idleSeq != null && seq.id !== idleSeq.id) {
      this.modelAdapter.applyFrameInterleaved(primaryFrameId!, poseFrameId, this.primarySequence.masks);
    } else if (hasPrimary) {
      this.modelAdapter.applyFrame(primaryFrameId!);
    } else {
      this.modelAdapter.applyFrame(poseFrameId);
    }
    this.modelAdapter.commitPose();
    this.lastPoseKey = poseKey;
    this.projectionDirty = false;
  }

  updatePlayerAnimation(input: PlayerAnimationUpdateInput): void {
    if (!this.playerModelData?.mergedModel) {
      return;
    }

    while (this.signalQueue.length > 0) {
      const signal = this.signalQueue.shift();
      if (!signal) {
        continue;
      }

      if (signal.type === 'consume') {
        const eatSeq = this.animationSet.eat;
        if (eatSeq) {
          this.primarySequence = eatSeq;
          this.primaryAnimFrame = 0;
          this.primaryAnimFrameTick = 0;
          this.primaryAnimTickAccumulatorMs = 0;
          this.primaryAnimCompleted = false;
          this.primaryIsConsume = true;
          this.primaryIsIntro = false;
          this.refreshCurrentPoseSequence();
        }
      } else if (signal.type === 'attack') {
        const attackSeq = signal.overrideSequence ?? this.animationSet.attack;
        if (attackSeq) {
          this.primarySequence = attackSeq;
          this.primaryAnimFrame = 0;
          this.primaryAnimFrameTick = 0;
          this.primaryAnimTickAccumulatorMs = 0;
          this.primaryAnimCompleted = false;
          this.primaryIsConsume = false;
          this.primaryIsIntro = false;
          this.refreshCurrentPoseSequence();
        }
      } else if (signal.type === 'intro') {
        this.primarySequence = signal.overrideSequence;
        this.primaryAnimFrame = 0;
        this.primaryAnimFrameTick = 0;
        this.primaryAnimTickAccumulatorMs = 0;
        this.primaryAnimCompleted = false;
        this.primaryIsConsume = false;
        this.primaryIsIntro = true;
        this.introAnimStarted = true;
        this.introAnimCompleted = false;
        this.refreshCurrentPoseSequence();
      } else if (signal.type === 'block') {
        const blockSeq = this.animationSet.block;
        if (blockSeq && this.canReplacePrimaryWith(blockSeq)) {
          this.primarySequence = blockSeq;
          this.primaryAnimFrame = 0;
          this.primaryAnimFrameTick = 0;
          this.primaryAnimTickAccumulatorMs = 0;
          this.primaryAnimCompleted = false;
          this.primaryIsConsume = false;
          this.primaryIsIntro = false;
          this.refreshCurrentPoseSequence();
        }
      }
    }

    let rawDeltaMs = input.deltaMs;
    if (rawDeltaMs === undefined || !Number.isFinite(rawDeltaMs)) {
      const now = performance.now();
      if (this.lastPlayerAnimTime === 0) {
        this.lastPlayerAnimTime = now;
      }
      rawDeltaMs = now - this.lastPlayerAnimTime;
      this.lastPlayerAnimTime = now;
    }

    // When only projection changed (camera moved but no time elapsed),
    // we must still rebuild the mesh with updated face sorting. So we only early-return
    // if BOTH rawDeltaMs is bad AND there's no projection-only rebuild needed.
    if (rawDeltaMs <= 0 || rawDeltaMs >= 1000) {
      // A replay seek resets us and then hands us `deltaMs: 0` for as long as
      // playback stays paused. Fall through once (with zero elapsed time) so the
      // seeked tick's pose is resolved and committed instead of leaving the
      // pre-seek pose — e.g. a half-finished attack swing — on screen.
      if (!this.poseRebuildPending) {
        if (this.projectionDirty) {
          this.rebuildMeshOnly();
        }
        return;
      }
      rawDeltaMs = 0;
    }
    this.poseRebuildPending = false;

    const deltaMs = rawDeltaMs * input.speedMultiplier;
    this.playerAnimTickAccumulatorMs += deltaMs;
    const playerTicksElapsed = Math.min(Math.floor(this.playerAnimTickAccumulatorMs / CLIENT_TICK_MS), 50);
    this.playerAnimTickAccumulatorMs -= playerTicksElapsed * CLIENT_TICK_MS;

    this.primaryAnimTickAccumulatorMs += this.primaryRestored ? 0 : deltaMs;
    this.primaryRestored = false;
    const primaryTicksElapsed = Math.min(Math.floor(this.primaryAnimTickAccumulatorMs / CLIENT_TICK_MS), 50);
    this.primaryAnimTickAccumulatorMs -= primaryTicksElapsed * CLIENT_TICK_MS;

    if (!this.primaryAnimCompleted && this.primarySequence && primaryTicksElapsed > 0) {
      this.primaryAnimFrameTick += primaryTicksElapsed;

      while (
        this.primaryAnimFrame < this.primarySequence.frameIds.length &&
        this.primaryAnimFrameTick >= this.primarySequence.frameLengths[this.primaryAnimFrame]
      ) {
        this.primaryAnimFrameTick -= this.primarySequence.frameLengths[this.primaryAnimFrame];
        this.primaryAnimFrame++;
      }

      if (this.primaryAnimFrame >= this.primarySequence.frameIds.length) {
        if (this.primaryIsIntro) {
          this.introAnimCompleted = true;
        }
        this.primarySequence = null;
        this.primaryAnimFrame = 0;
        this.primaryAnimFrameTick = 0;
        this.primaryAnimTickAccumulatorMs = 0;
        this.primaryAnimCompleted = true;
        this.primaryIsConsume = false;
        this.primaryIsIntro = false;
        this.refreshCurrentPoseSequence();
      }
    }

    if (input.simIsMoving) {
      const directionalState = this.resolveDirectionalState(input);
      let newState: PlayerAnimState = directionalState;

      if (input.isRunning && newState === 'walk') {
        newState = 'run';
      }

      const directionalSeq = this.poseSeqFor(newState);
      if (directionalSeq) {
        this.applyMovementState(newState, directionalSeq);
      } else {
        const fallback = this.resolveTrailState(input.isRunning);
        if (fallback) {
          this.applyMovementState(fallback.state, fallback.seq);
        } else {
          const idleSeq = this.poseSeqFor('idle');
          if (idleSeq) {
            this.applyMovementState('idle', idleSeq);
          }
        }
      }

      this.idleTurnCounter = 0;
    } else if (input.isMoving) {
      const fallback = this.resolveTrailState(input.isRunning);
      if (fallback) {
        this.applyMovementState(fallback.state, fallback.seq);
      }
      this.idleTurnCounter = 0;
    } else {
      if (input.isTurning) {
        this.idleTurnCounter += playerTicksElapsed;

        const delta = (input.targetAngle - input.visualAngle) & 2047;
        const absDelta = delta > 1024 ? 2048 - delta : delta;
        const isSustainedTurn = absDelta > PLAYER_TURN_STEP_UNITS;
        const turnDirection = delta > 1024 ? 'left' : 'right';
        const idleTurnState: PlayerAnimState = turnDirection === 'left' ? 'idleTurnLeft' : 'idleTurnRight';

        // Latch idleTurn: once we've switched to it during this turn, keep it
        // until the turn completes. This prevents mid-turn flicker back to idle
        // as absDelta shrinks below the sustained threshold near the end.
        const shouldUseIdleTurn =
          this.playerMovementState === 'idleTurnLeft' ||
          this.playerMovementState === 'idleTurnRight' ||
          isSustainedTurn ||
          this.idleTurnCounter > 25;

        if (shouldUseIdleTurn) {
          if (this.playerMovementState !== idleTurnState) {
            const idleTurnSeq = this.poseSeqFor(idleTurnState);
            if (idleTurnSeq) {
              this.applyMovementState(idleTurnState, idleTurnSeq);
            } else {
              const walkSeq = this.poseSeqFor('walk');
              if (walkSeq) {
                this.applyMovementState('walk', walkSeq);
              } else if (this.playerMovementState !== 'idle') {
                const idleSeq = this.poseSeqFor('idle');
                if (idleSeq) {
                  this.applyMovementState('idle', idleSeq);
                }
              }
            }
          }
        } else {
          // Not yet sustained — but still must exit any lingering walk/run/etc
          // pose that persisted from the previous tick. A stationary body should
          // never be in a movement pose.
          if (this.playerMovementState !== 'idle') {
            const idleSeq = this.poseSeqFor('idle');
            if (idleSeq) {
              this.applyMovementState('idle', idleSeq);
            }
          }
        }
      } else {
        this.idleTurnCounter = 0;
        if (this.playerMovementState !== 'idle') {
          const idleSeq = this.poseSeqFor('idle');
          if (idleSeq) {
            this.applyMovementState('idle', idleSeq);
          }
        }
      }
    }

    const seq = this.currentPlayerSequence ?? this.animationSet.idle;
    if (!seq) {
      return;
    }

    if (playerTicksElapsed > 0) {
      this.playerAnimFrameTick += playerTicksElapsed;

      while (
        this.playerAnimFrame < seq.frameIds.length &&
        this.playerAnimFrameTick >= seq.frameLengths[this.playerAnimFrame]
      ) {
        this.playerAnimFrameTick -= seq.frameLengths[this.playerAnimFrame];
        this.playerAnimFrame++;
      }

      if (this.playerAnimFrame >= seq.frameIds.length) {
        this.playerAnimFrame = 0;
        this.playerAnimFrameTick = 0;
      }
    }

    const poseFrameId = seq.frameIds[this.playerAnimFrame];
    let poseKey = `pose:${seq.id}:${poseFrameId}`;

    let primaryFrameId: number | null = null;
    if (!this.primaryAnimCompleted && this.primarySequence) {
      primaryFrameId = this.primarySequence.frameIds[this.primaryAnimFrame];
      poseKey += `+primary:${this.primarySequence.id}:${primaryFrameId}`;
    }

    if (poseKey === this.lastPoseKey) {
      if (this.projectionDirty) {
        this.rebuildMeshOnly();
      }
      return;
    }

    this.modelAdapter.resetPose();
    const hasPrimary = primaryFrameId !== null;
    const idleSeq = this.activePoseSet.idle;
    if (hasPrimary && this.primarySequence?.masks && idleSeq != null && seq.id !== idleSeq.id) {
      this.modelAdapter.applyFrameInterleaved(primaryFrameId!, poseFrameId, this.primarySequence.masks);
    } else if (hasPrimary) {
      this.modelAdapter.applyFrame(primaryFrameId!);
    } else {
      this.modelAdapter.applyFrame(poseFrameId);
    }
    this.modelAdapter.commitPose();
    this.lastPoseKey = poseKey;
    this.projectionDirty = false;
  }

  private resolveDirectionalState(input: PlayerAnimationUpdateInput): PlayerDirectionalState {
    if (input.locomotionState) {
      return input.locomotionState;
    }

    const angleDiff = (input.targetAngle - input.visualAngle) & 2047;
    const signedDiff = angleDiff > 1024 ? angleDiff - 2048 : angleDiff;

    if (signedDiff >= -256 && signedDiff <= 256) {
      return 'walk';
    }
    if (signedDiff > 256 && signedDiff < 768) {
      return 'turnRight';
    }
    if (signedDiff < -256 && signedDiff >= -768) {
      return 'turnLeft';
    }
    return 'walkBack';
  }

  /**
   * Rebuild mesh without re-applying the pose.
   * Used when only projection changed (camera moved) but animation frame is the same.
   * Skips resetPose/applyFrame/commitPose — vertices are already in the right position.
   */
  private rebuildMeshOnly(): void {
    const mesh = this.buildPlayerAnimatedMesh();
    if (mesh) {
      this.modelAdapter.applyMesh(mesh);
    }
    this.projectionDirty = false;
  }

  buildPlayerAnimatedMesh(): PlayerAnimatedMeshPair | null {
    if (!this.playerModelData?.mergedModel || !this.playerModelData.litColors) {
      return null;
    }

    const model = this.playerModelData.mergedModel;
    const litColors = this.playerModelData.litColors;
    const hideWeaponShield = !this.primaryAnimCompleted && this.primaryIsConsume;
    const faceMask = this.playerModelData.weaponShieldFaceMask;

    model.calculateVertexNormals();

    const sortInput: FaceSortInput = {
      verticesX: model.verticesX,
      verticesY: model.verticesY,
      verticesZ: model.verticesZ,
      verticesCount: model.verticesCount,
      indices1: model.indices1,
      indices2: model.indices2,
      indices3: model.indices3,
      faceCount: model.faceCount,
      faceRenderPriorities: model.faceRenderPriorities ?? null,
      priority: model.priority,
      faceAlphas: model.faceAlphas ?? null,
      faceColors3: litColors.faceColors3,
    };
    const sorted = sortModelFaces(sortInput, this.sorterProjection);

    // The sorter already separates faces by alpha — building them separately
    // avoids a second splitTriangleSoupByAlpha() traversal in
    // applyPlayerAnimatedMesh().
    if (sorted.opaqueFaces.length === 0 && sorted.transparentFaces.length === 0) {
      // All faces culled (near-plane clip, backface, diameter overflow).
      // Return null to keep previous frame's mesh rather than flashing invisible.
      return null;
    }

    const opaque = this.buildMeshFromFaces(sorted.opaqueFaces, model, litColors, hideWeaponShield, faceMask, 'opaque');
    const transparent = this.buildMeshFromFaces(
      sorted.transparentFaces,
      model,
      litColors,
      hideWeaponShield,
      faceMask,
      'transparent',
    );

    return { opaque, transparent };
  }

  private buildMeshFromFaces(
    faces: number[],
    model: PlayerAnimationController['playerModelData']['mergedModel'],
    litColors: NonNullable<PlayerAnimationController['playerModelData']['litColors']>,
    hideWeaponShield: boolean,
    faceMask: PlayerAnimationController['playerModelData']['weaponShieldFaceMask'],
    target: 'opaque' | 'transparent',
  ): PlayerAnimatedMeshData | null {
    if (faces.length === 0) return null;

    const isOpaque = target === 'opaque';
    const outPositions = isOpaque ? this.meshOutputOpaquePositions : this.meshOutputTransparentPositions;
    const outNormals = isOpaque ? this.meshOutputOpaqueNormals : this.meshOutputTransparentNormals;
    const outHslColors = isOpaque ? this.meshOutputOpaqueHslColors : this.meshOutputTransparentHslColors;
    const outAlphas = isOpaque ? this.meshOutputOpaqueAlphas : this.meshOutputTransparentAlphas;
    const outFaceBias = isOpaque ? this.meshOutputOpaqueFaceBias : this.meshOutputTransparentFaceBias;
    const hasTextures = this.meshOutputHasTextures;
    const outUvs = isOpaque ? this.meshOutputOpaqueUvs : this.meshOutputTransparentUvs;
    const outTextureIds = isOpaque ? this.meshOutputOpaqueTextureIds : this.meshOutputTransparentTextureIds;

    let posIdx = 0;
    let normalIdx = 0;
    let hslIdx = 0;
    let alphaIdx = 0;
    let biasIdx = 0;

    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      const vertexBase = hslIdx;

      const hslA = litColors.faceColors1[f];
      let hslB = litColors.faceColors2[f];
      let hslC = litColors.faceColors3[f];

      if (hslC === -1) {
        hslC = hslB = hslA;
      }

      if (hideWeaponShield && faceMask[f]) {
        const hideIdx = model.indices1[f];
        const hx = model.verticesX[hideIdx];
        const hy = model.verticesY[hideIdx];
        const hz = model.verticesZ[hideIdx];
        const faceAlpha = model.faceAlphas ? (255 - (model.faceAlphas[f] & 0xff)) / 255 : 1.0;
        const fb = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : 0;
        for (let v = 0; v < 3; v++) {
          outPositions[posIdx++] = hx;
          outPositions[posIdx++] = hy;
          outPositions[posIdx++] = hz;

          outNormals[normalIdx++] = 0;
          outNormals[normalIdx++] = 0;
          outNormals[normalIdx++] = 1;

          outHslColors[hslIdx++] = hslA & 0xffff;
          outAlphas[alphaIdx++] = faceAlpha;
          outFaceBias[biasIdx++] = fb;
        }
        if (hasTextures) {
          writeFaceTextureAttributes(model, f, 0, outUvs, outTextureIds, vertexBase);
        }
        continue;
      }
      const i1 = model.indices1[f];
      const i2 = model.indices2[f];
      const i3 = model.indices3[f];
      const faceAlpha = model.faceAlphas ? (255 - (model.faceAlphas[f] & 0xff)) / 255 : 1.0;
      const fb = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : 0;
      if (hasTextures) {
        const layer = faceTextureLayer(model.faceTextures, f, this.resolveTextureLayer);
        writeFaceTextureAttributes(model, f, layer, outUvs, outTextureIds, vertexBase);
      }

      const i1x = model.verticesX[i1],
        i1y = model.verticesY[i1],
        i1z = model.verticesZ[i1];
      const i2x = model.verticesX[i2],
        i2y = model.verticesY[i2],
        i2z = model.verticesZ[i2];
      const i3x = model.verticesX[i3],
        i3y = model.verticesY[i3],
        i3z = model.verticesZ[i3];

      outPositions[posIdx++] = i1x;
      outPositions[posIdx++] = i1y;
      outPositions[posIdx++] = i1z;
      outPositions[posIdx++] = i2x;
      outPositions[posIdx++] = i2y;
      outPositions[posIdx++] = i2z;
      outPositions[posIdx++] = i3x;
      outPositions[posIdx++] = i3y;
      outPositions[posIdx++] = i3z;

      writeUnitNormal(model.normals, i1, outNormals, normalIdx);
      writeUnitNormal(model.normals, i2, outNormals, normalIdx + 3);
      writeUnitNormal(model.normals, i3, outNormals, normalIdx + 6);
      normalIdx += 9;

      outHslColors[hslIdx++] = hslA & 0xffff;
      outHslColors[hslIdx++] = hslB & 0xffff;
      outHslColors[hslIdx++] = hslC & 0xffff;
      outAlphas[alphaIdx++] = faceAlpha;
      outAlphas[alphaIdx++] = faceAlpha;
      outAlphas[alphaIdx++] = faceAlpha;
      outFaceBias[biasIdx++] = fb;
      outFaceBias[biasIdx++] = fb;
      outFaceBias[biasIdx++] = fb;
    }

    return {
      positions: outPositions.subarray(0, posIdx),
      normals: outNormals.subarray(0, normalIdx),
      hslColors: outHslColors.subarray(0, hslIdx),
      alphas: outAlphas.subarray(0, alphaIdx),
      faceBias: outFaceBias.subarray(0, biasIdx),
      ...(hasTextures ? { uvs: outUvs.subarray(0, hslIdx * 2), textureIds: outTextureIds.subarray(0, hslIdx) } : {}),
    };
  }
}
