import { canReplacePrimary, type PrimarySample, type PrimarySpec, primaryPhase } from '../core/replayPrimaryIndex';
import {
  type AnimationSignal,
  type AnimClipRef,
  type AnimPlayMode,
  type AttackSignal,
  CLIENT_TICK_MS,
  type FrameClipRef,
  type NpcAnimationSet,
  type NpcAnimationUpdateInput,
  type NpcAnimModelAdapter,
  type NpcAnimState,
  type SkeletalClipRef,
  type TriggerAttackOptions,
} from './animationTypes';

interface AnimTrack {
  state: NpcAnimState;
  clip: AnimClipRef;
  mode: AnimPlayMode;
  elapsedTicks: number;
  durationClientTicks: number;
  /**
   * Client ticks remaining before this clip starts playing. The clip already owns
   * the sequence slot, but the base pose is shown until the countdown reaches zero.
   */
  delayClientTicks: number;
}

interface ResolvedAnimation {
  state: NpcAnimState;
  clip: AnimClipRef;
}

export function npcPrimarySpec(clip: AnimClipRef, options: TriggerAttackOptions = {}): PrimarySpec<AnimClipRef> {
  return {
    clip,
    priority: clip.seqType.forcedPriority,
    duration: normalizeDurationTicks(options.durationClientTicks ?? clipDurationTicks(clip)),
    delay: Math.max(0, Math.floor(options.delayClientTicks ?? 0)),
    replaces: false,
  };
}

function normalizeDurationTicks(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

function clipDurationTicks(clip: AnimClipRef): number {
  return clip.kind === 'skeletal'
    ? Math.max(1, clip.skeletalEnd - clip.skeletalStart)
    : Math.max(
        1,
        clip.frameIds.reduce((total, _, index) => total + normalizeDurationTicks(clip.frameLengths[index] ?? 1), 0),
      );
}

export class NpcAnimationController {
  private static readonly TURN_RELEASE_TICKS = 10;

  private readonly animationSet: NpcAnimationSet;
  private readonly modelAdapter: NpcAnimModelAdapter;
  private readonly signalQueue: AnimationSignal[] = [];

  // Base movement/pose track (idle/walk/turn) — always advancing, even under an
  // attack. OSRS composes the primary (attack) over the movement pose every frame
  // (NPC.getModel → NPCComposition.getModel), so the lower/unmasked body stays in
  // the pose while the attack drives the rest. Null only while a set with no idle
  // clip has no base to play; the model then rests unanimated.
  private baseTrack: AnimTrack | null;
  // Optional one-shot primary track (attack/death) layered over the base.
  private primaryTrack: AnimTrack | null = null;
  private restoredRemainderMs: number | undefined;

  private tickRemainderMs = 0;
  private lastPoseKey: string | null = null;
  private _turnReleaseCount = 0;

  constructor(params: { animationSet: NpcAnimationSet; modelAdapter: NpcAnimModelAdapter }) {
    this.animationSet = params.animationSet;
    this.modelAdapter = params.modelAdapter;
    this.baseTrack = this.makeIdleTrack();
  }

  private makeIdleTrack(): AnimTrack | null {
    const idle = this.animationSet.idle;
    return idle ? this.makeTrack('idle', idle, this.baseModeFor('idle')) : null;
  }

  /**
   * Drop all transient cross-tick animation state so the next update rebuilds
   * the pose from the snapshot. Called on a replay timeline discontinuity
   * (rewind / forward-jump / timeline-change) where a one-shot attack/death
   * clip or queued signal would otherwise persist past or freeze on the wrong
   * frame. The base/idle clip is re-resolved by the next update().
   *
   * PERF: a scrub fires one discontinuity per animation frame, for EVERY live
   * NPC. `lastPoseKey` is derived purely from (clipId, frameId), so update()
   * already rebuilds exactly when the resolved pose differs — clearing the key
   * here only forced a redundant resetPose + applyFrame + commitPose on every
   * frame of a scrub. For the same reason an already-idle base track is left
   * alone: re-making it would rewind the free-running idle loop to frame 0 each
   * frame, both freezing it visually and changing the pose key.
   */
  reset(): void {
    this.signalQueue.length = 0;
    this.tickRemainderMs = 0;
    this._turnReleaseCount = 0;
    this.primaryTrack = null;
    this.restoredRemainderMs = undefined;
    if (this.baseTrack?.state !== 'idle') {
      this.baseTrack = this.makeIdleTrack();
    }
  }

  private makeTrack(state: NpcAnimState, clip: AnimClipRef, mode: AnimPlayMode): AnimTrack {
    return {
      state,
      clip,
      mode,
      elapsedTicks: 0,
      durationClientTicks: this.getClipDurationClientTicks(clip),
      delayClientTicks: 0,
    };
  }

  restorePrimaryAt(primary: PrimarySample<AnimClipRef> | null): void {
    this.signalQueue.length = 0;
    this.primaryTrack = primary
      ? {
          state: 'attack',
          mode: 'oneshot',
          clip: primary.clip,
          elapsedTicks: primary.elapsedTicks,
          durationClientTicks: primary.duration,
          delayClientTicks: primary.delayClientTicks,
        }
      : null;
    this.restoredRemainderMs = primary?.remainderMs ?? 0;
    this._turnReleaseCount = 0;
  }

  restoreBaseAt(elapsedCycles: number, isMoving: boolean, initialAdvanceCycles = 0): void {
    const base = isMoving ? this.resolveWalkOrIdle() : this.resolveIdle();
    this.baseTrack = null;
    if (base) {
      this.baseTrack = this.makeTrack(base.state, base.clip, this.baseModeFor(base.state));
      this.baseTrack.elapsedTicks = Math.max(
        0,
        Math.floor(elapsedCycles) - (base.state === 'walk' ? Math.floor(initialAdvanceCycles) : 0),
      );
    }
    this.tickRemainderMs = (elapsedCycles - Math.floor(elapsedCycles)) * CLIENT_TICK_MS;
    this.restoredRemainderMs = this.tickRemainderMs;
    this._turnReleaseCount = 0;
  }

  restoreDeathAt(elapsedCycles: number, deathClip?: AnimClipRef): void {
    this.restorePrimaryAt(null);
    this.triggerDeath(deathClip);
    if (this.primaryTrack) this.primaryTrack.elapsedTicks = Math.floor(elapsedCycles);
    this.restoreBaseAt(elapsedCycles, false);
  }

  update(input: NpcAnimationUpdateInput): void {
    const scaledDeltaMs = Math.max(0, input.deltaMs) * Math.max(0, input.speedMultiplier);
    this.tickRemainderMs += scaledDeltaMs;
    const wholeTicks = Math.min(Math.floor(this.tickRemainderMs / CLIENT_TICK_MS), 50);
    this.tickRemainderMs -= wholeTicks * CLIENT_TICK_MS;

    // Advance both tracks. The base keeps running underneath the attack so it
    // is at the correct pose frame when the attack composites over it.
    if (this.baseTrack) this.baseTrack.elapsedTicks += wholeTicks;
    if (this.restoredRemainderMs === undefined) this.advancePrimary(wholeTicks);
    else {
      this.tickRemainderMs = this.restoredRemainderMs;
      this.restoredRemainderMs = undefined;
    }

    // Death is terminal — play the death clip alone, no state transitions.
    if (this.primaryTrack && this.primaryTrack.state === 'death') {
      this.applyPose();
      return;
    }

    // Retire a finished one-shot attack; the base track continues seamlessly.
    // A clip still counting down its start delay has not begun playing, so it is
    // never retired here — it holds the slot until it has actually played out.
    if (
      this.primaryTrack &&
      this.primaryTrack.state === 'attack' &&
      this.primaryTrack.delayClientTicks === 0 &&
      this.primaryTrack.elapsedTicks >= this.primaryTrack.durationClientTicks
    ) {
      this.primaryTrack = null;
    }

    this.consumeSignalQueue();

    this.updateBaseTrack(input, wholeTicks);

    this.applyPose();
  }

  private updateBaseTrack(input: NpcAnimationUpdateInput, wholeTicks: number): void {
    const base = this.resolveBaseAnimation(input);
    let shouldTransition = true;
    if (this.baseTrack && this.isTurnState(this.baseTrack.state) && !this.isTurnState(base?.state)) {
      this._turnReleaseCount += wholeTicks;
      shouldTransition = wholeTicks > 0 && this._turnReleaseCount >= NpcAnimationController.TURN_RELEASE_TICKS;
    } else {
      this._turnReleaseCount = 0;
    }

    if (shouldTransition) {
      this.setBase(base);
    }
  }

  enqueueSignal(signal: AnimationSignal): void {
    this.signalQueue.push(signal);
  }

  triggerAttack(options?: TriggerAttackOptions): void {
    this.enqueueSignal({
      type: 'attack',
      clip: options?.clip,
      durationClientTicks: options?.durationClientTicks,
      delayClientTicks: options?.delayClientTicks,
      source: options?.source,
    });
  }

  /** Play `deathClip` (default: the set's own death clip) as the terminal primary. */
  triggerDeath(deathClip = this.animationSet.death): void {
    if (!deathClip) return;
    this.setPrimary('death', deathClip, 'oneshot', this.getClipDurationClientTicks(deathClip));
  }

  getActiveState(): NpcAnimState {
    return this.activePrimary()?.state ?? this.baseTrack?.state ?? 'idle';
  }

  getAnimationHeightOffset(): number {
    const primary = this.activePrimary();
    const base = this.baseTrack;
    if (!primary) {
      return base?.clip.seqType.heightOffset ?? 0;
    }
    if (primary.state === 'attack' && base && base.clip.seqId !== this.animationSet.idle?.seqId) {
      return base.clip.seqType.heightOffset;
    }
    return primary.clip.seqType.heightOffset;
  }

  getFrameState(): {
    seqId: number;
    seqType: import('../../rs/config/seqtype/SeqType').SeqType;
    currentFrameIndex: number;
  } | null {
    const track = this.activePrimary() ?? this.baseTrack;
    if (!track) return null;
    const clip = track.clip;
    if (clip.kind === 'skeletal') {
      const frameIndex = this.sampleSkeletalFrame(clip, track.elapsedTicks, track.mode);
      return { seqId: clip.seqId, seqType: clip.seqType, currentFrameIndex: frameIndex };
    }
    const frameId = this.sampleFrameId(clip, track.elapsedTicks, track.mode);
    if (frameId === null) return null;
    const idx = clip.frameIds.indexOf(frameId);
    return { seqId: clip.seqId, seqType: clip.seqType, currentFrameIndex: idx >= 0 ? idx : 0 };
  }

  private consumeSignalQueue(): void {
    while (this.signalQueue.length > 0) {
      const signal = this.signalQueue.shift();
      if (!signal) {
        continue;
      }

      if (signal.type === 'attack') {
        this.activateAttackSignal(signal);
      }
    }
  }

  private activateAttackSignal(signal: AttackSignal): void {
    const clip = signal.clip ?? this.animationSet.attack;
    if (!clip) {
      return;
    }
    if (!this.canReplacePrimary(clip)) {
      return;
    }
    const spec = npcPrimarySpec(clip, signal);
    this._turnReleaseCount = 0;
    this.setPrimary('attack', clip, 'oneshot', spec.duration, spec.delay);
  }

  /**
   * OSRS animation arbitration, as modeled here: ONE primary sequence slot, handed
   * to an incoming sequence only when
   * `incoming.forcedPriority >= current.forcedPriority` (seq config opcode 5,
   * default 5). A losing sequence is discarded outright: it does not restart the
   * current clip, and it does not cancel one still counting down its start delay.
   *
   * This is what stops a boss's block/defend clip from cutting off its own attack
   * — JalTok-Jad's `jaltokjad_defend` (4) loses to `jaltokjad_attack_ranged` (10),
   * TzKal-Zuk's `zuk_defend` (6) loses to `zuk_attack` (10). The servers arbitrate
   * the same way for same-tick contention, which is why the wave-69 Inferno
   * capture never sends an attack and a defend sequence to one NPC on one tick
   * (0 of 459 attack ticks), even on 62 ticks where that NPC was hit.
   *
   * A retired primary leaves the slot empty, so the next signal always wins.
   */
  private canReplacePrimary(clip: AnimClipRef): boolean {
    const current = this.primaryTrack;
    if (!current) {
      return true;
    }
    // Death is terminal: it owns the slot for the rest of the instance's life.
    if (current.state === 'death') {
      return false;
    }
    return canReplacePrimary(current.clip.seqType.forcedPriority, clip.seqType.forcedPriority);
  }

  /** The primary track only once its start delay elapsed; until then the base pose shows. */
  private activePrimary(): AnimTrack | null {
    const primary = this.primaryTrack;
    return primary && primary.delayClientTicks === 0 ? primary : null;
  }

  /**
   * Advance the primary track, burning its start delay before its elapsed ticks
   * so a large `deltaMs` cannot skip past the start of a delayed clip. Runs
   * before the signal queue is consumed, so a clip enqueued this frame is not
   * decremented on its arrival frame.
   */
  private advancePrimary(wholeTicks: number): void {
    const primary = this.primaryTrack;
    if (!primary || wholeTicks <= 0) {
      return;
    }
    const phase = primaryPhase(primary.delayClientTicks, wholeTicks);
    primary.delayClientTicks = phase.delayClientTicks;
    primary.elapsedTicks += phase.elapsedTicks;
  }

  private resolveBaseAnimation(input: NpcAnimationUpdateInput): ResolvedAnimation | null {
    const { turn, movement } = input;

    if (turn.isTurning) {
      if (turn.turnDeltaSigned < 0 && this.animationSet.turnLeft) {
        return { state: 'turnLeft', clip: this.animationSet.turnLeft };
      }
      if (turn.turnDeltaSigned > 0 && this.animationSet.turnRight) {
        return { state: 'turnRight', clip: this.animationSet.turnRight };
      }
      // No dedicated turn clip — fall back to walk clip (standard OSRS behavior).
      // Use a turn state so the grace-period (TURN_RELEASE_TICKS) still prevents
      // walk↔idle oscillation when isTurning flickers.
      if (this.animationSet.walk) {
        const turnState = turn.turnDeltaSigned < 0 ? 'turnLeft' : 'turnRight';
        return { state: turnState, clip: this.animationSet.walk };
      }
    }

    if (movement.isMoving) {
      return this.resolveWalkOrIdle();
    }

    return this.resolveIdle();
  }

  private resolveWalkOrIdle(): ResolvedAnimation | null {
    if (this.animationSet.walk) {
      return { state: 'walk', clip: this.animationSet.walk };
    }
    return this.resolveIdle();
  }

  private resolveIdle(): ResolvedAnimation | null {
    const idle = this.animationSet.idle;
    return idle ? { state: 'idle', clip: idle } : null;
  }

  private isTurnState(state: NpcAnimState | undefined): boolean {
    return state === 'turnLeft' || state === 'turnRight';
  }

  private setBase(base: ResolvedAnimation | null): void {
    if (!base) {
      this.baseTrack = null;
      return;
    }
    const { state, clip } = base;
    if (!this.baseTrack) {
      this.baseTrack = this.makeTrack(state, clip, this.baseModeFor(state));
      return;
    }
    const changed = this.baseTrack.state !== state || this.baseTrack.clip.id !== clip.id;
    this.baseTrack.state = state;
    this.baseTrack.clip = clip;
    this.baseTrack.mode = this.baseModeFor(state);
    this.baseTrack.durationClientTicks = this.normalizeDurationTicks(this.getClipDurationClientTicks(clip));
    if (changed) {
      this.baseTrack.elapsedTicks = 0;
    }
  }

  private setPrimary(
    state: NpcAnimState,
    clip: AnimClipRef,
    mode: AnimPlayMode,
    durationClientTicks: number,
    delayClientTicks = 0,
  ): void {
    this.primaryTrack = {
      state,
      clip,
      mode,
      elapsedTicks: 0,
      durationClientTicks: this.normalizeDurationTicks(durationClientTicks),
      delayClientTicks: Math.max(0, Math.floor(delayClientTicks)),
    };
  }

  private applyPose(): void {
    const primary = this.activePrimary();
    const base = this.baseTrack;

    if (primary && primary.state === 'death') {
      this.applyTrackAlone(primary);
      return;
    }
    if (!primary) {
      if (base) this.applyTrackAlone(base);
      else this.applyRestPose();
      return;
    }

    // Attack over the base pose. Skeletal or mixed skeletal/legacy pairs are not
    // interleave-blendable here — play the attack alone (matches keeping the
    // primary-only path rather than sequentially applying two animations).
    if (!base || primary.clip.kind === 'skeletal' || base.clip.kind === 'skeletal') {
      this.applyTrackAlone(primary);
      return;
    }

    const primaryClip: FrameClipRef = primary.clip;
    const primaryFrameId = this.sampleFrameId(primaryClip, primary.elapsedTicks, primary.mode);
    if (primaryFrameId === null) {
      this.applyTrackAlone(base);
      return;
    }

    const masks = primaryClip.seqType.masks;
    if (masks && masks.length > 0 && base.clip.seqId !== this.animationSet.idle?.seqId) {
      const baseFrameId = this.sampleFrameId(base.clip, base.elapsedTicks, base.mode);
      if (baseFrameId !== null) {
        const poseKey = `${primaryClip.id}:${primaryFrameId}+${base.clip.id}:${baseFrameId}`;
        if (poseKey === this.lastPoseKey) {
          return;
        }
        this.modelAdapter.resetPose();
        this.modelAdapter.applyFrameInterleaved(primaryFrameId, baseFrameId, masks);
        this.modelAdapter.commitPose();
        this.lastPoseKey = poseKey;
        return;
      }
    }

    const poseKey = `${primaryClip.id}:${primaryFrameId}`;
    if (poseKey === this.lastPoseKey) {
      return;
    }
    this.modelAdapter.resetPose();
    this.modelAdapter.applyFrame(primaryFrameId);
    this.modelAdapter.commitPose();
    this.lastPoseKey = poseKey;
  }

  private applyTrackAlone(track: AnimTrack): void {
    const clip = track.clip;

    if (clip.kind === 'skeletal') {
      const frame = this.sampleSkeletalFrame(clip, track.elapsedTicks, track.mode);
      const poseKey = `${clip.id}:${frame}`;
      if (poseKey === this.lastPoseKey) {
        return;
      }

      this.modelAdapter.resetPose();
      this.modelAdapter.applySkeletal(clip.seq, frame);
      this.modelAdapter.commitPose();
      this.lastPoseKey = poseKey;
      return;
    }

    const frameId = this.sampleFrameId(clip, track.elapsedTicks, track.mode);
    if (frameId === null) {
      return;
    }

    const poseKey = `${clip.id}:${frameId}`;
    if (poseKey === this.lastPoseKey) {
      return;
    }

    this.modelAdapter.resetPose();
    this.modelAdapter.applyFrame(frameId);
    this.modelAdapter.commitPose();
    this.lastPoseKey = poseKey;
  }

  /** The unanimated model, for a set with no base clip and nothing playing. A null key means at rest. */
  private applyRestPose(): void {
    if (this.lastPoseKey === null) return;
    this.modelAdapter.resetPose();
    this.modelAdapter.commitPose();
    this.lastPoseKey = null;
  }

  private sampleSkeletalFrame(clip: SkeletalClipRef, elapsedTicks: number, mode: AnimPlayMode): number {
    const duration = this.getSkeletalDurationTicks(clip);
    if (mode === 'loopFrameStep') {
      const frameStep = clip.seqType.frameStep;
      if (frameStep < 0) {
        return clip.skeletalStart + Math.min(elapsedTicks, duration - 1);
      }
      if (elapsedTicks < duration) {
        return clip.skeletalStart + elapsedTicks;
      }
      const loopStart = Math.max(0, duration - frameStep);
      const loopDuration = duration - loopStart;
      if (loopDuration <= 0) {
        return clip.skeletalStart + (elapsedTicks % duration);
      }
      return clip.skeletalStart + loopStart + ((elapsedTicks - duration) % loopDuration);
    }
    if (mode === 'loop') {
      return clip.skeletalStart + (elapsedTicks % duration);
    }
    return clip.skeletalStart + Math.min(elapsedTicks, duration - 1);
  }

  private sampleFrameId(clip: FrameClipRef, elapsedTicks: number, mode: AnimPlayMode): number | null {
    if (clip.frameIds.length === 0) {
      return null;
    }

    const totalDuration = this.getFrameDurationTicks(clip);
    const localTick =
      mode === 'loopFrameStep'
        ? this.frameStepLocalTick(clip, elapsedTicks, totalDuration)
        : mode === 'loop'
          ? elapsedTicks % totalDuration
          : Math.min(elapsedTicks, totalDuration - 1);

    let accumulated = 0;
    for (let i = 0; i < clip.frameIds.length; i++) {
      accumulated += this.getFrameLengthTicks(clip, i);
      if (localTick < accumulated) {
        return clip.frameIds[i];
      }
    }

    return clip.frameIds[clip.frameIds.length - 1];
  }

  private baseModeFor(state: NpcAnimState): AnimPlayMode {
    return state === 'idle' ? (this.animationSet.idlePlayMode ?? 'loop') : 'loop';
  }

  /**
   * Local tick for the 'loopFrameStep' mode of a frame-based clip: respect the seq's
   * `frameStep` (OSRS loop-back). frameStep < 0 → play once and hold the last frame;
   * frameStep >= 0 → play the intro once, then loop back by `frameStep` frames (loop
   * only the tail) instead of force-looping the whole seq from frame 0.
   */
  private frameStepLocalTick(clip: FrameClipRef, elapsedTicks: number, totalDuration: number): number {
    const frameStep = clip.seqType.frameStep;
    if (frameStep < 0) {
      return Math.min(elapsedTicks, totalDuration - 1);
    }
    if (elapsedTicks < totalDuration) {
      return elapsedTicks;
    }
    const loopStartFrame = Math.max(0, clip.frameIds.length - frameStep);
    let loopStartTick = 0;
    for (let i = 0; i < loopStartFrame; i++) {
      loopStartTick += this.getFrameLengthTicks(clip, i);
    }
    const loopDuration = totalDuration - loopStartTick;
    if (loopDuration <= 0) {
      return elapsedTicks % totalDuration;
    }
    return loopStartTick + ((elapsedTicks - totalDuration) % loopDuration);
  }

  private getClipDurationClientTicks(clip: AnimClipRef): number {
    return clipDurationTicks(clip);
  }

  private getSkeletalDurationTicks(clip: SkeletalClipRef): number {
    return Math.max(1, clip.skeletalEnd - clip.skeletalStart);
  }

  private getFrameDurationTicks(clip: FrameClipRef): number {
    let total = 0;
    for (let i = 0; i < clip.frameIds.length; i++) {
      total += this.getFrameLengthTicks(clip, i);
    }
    return Math.max(1, total);
  }

  private getFrameLengthTicks(clip: FrameClipRef, index: number): number {
    const length = clip.frameLengths[index] ?? 1;
    if (!Number.isFinite(length)) {
      return 1;
    }
    return Math.max(1, Math.floor(length));
  }

  private normalizeDurationTicks(value: number): number {
    return normalizeDurationTicks(value);
  }
}
