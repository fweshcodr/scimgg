import type { ActorId } from '../../core/actors/types';
import { NpcVisualTracker } from '../core/interpolation';

export interface NpcFacingStep {
  readonly actorId: ActorId;
  /** Angle a freshly created tracker is seeded at (the NPC's current facing). */
  readonly seedAngle: number;
  readonly targetAngle: number;
  readonly turnSpeed: number | undefined;
  /** Elapsed scaled ms for a smooth step; ignored by {@link NpcFacingController.snapTo}. */
  readonly deltaMs: number;
}

/**
 * Actor-keyed owner of per-NPC {@link NpcVisualTracker}s. All turning math
 * delegates to the tracker; this keeps each actor's fractional client-cycle
 * accumulator alive across frames and seeds a fresh tracker from the NPC's
 * current facing the first time it is seen. Lifecycle drop/reset keep tracker
 * identity aligned with the instance registry so a reused actor id re-seeds.
 */
export class NpcFacingController {
  private readonly trackers = new Map<ActorId, NpcVisualTracker>();

  private ensure(actorId: ActorId, seedAngle: number, turnSpeed: number | undefined): NpcVisualTracker {
    let tracker = this.trackers.get(actorId);
    if (!tracker) {
      tracker = new NpcVisualTracker(seedAngle);
      this.trackers.set(actorId, tracker);
    }
    if (turnSpeed !== undefined) {
      tracker.setTurnSpeed(turnSpeed);
    }
    return tracker;
  }

  /** Snap straight to the target, discarding in-flight turn (fixed intent / timeline reset). */
  snapTo(step: NpcFacingStep): number {
    const tracker = this.ensure(step.actorId, step.seedAngle, step.turnSpeed);
    tracker.snap(step.targetAngle);
    return tracker.advance(0).facingAngle;
  }

  /** Smoothly step toward the target by `deltaMs`, retaining fractional-cycle state. */
  smoothTo(step: NpcFacingStep): number {
    const tracker = this.ensure(step.actorId, step.seedAngle, step.turnSpeed);
    tracker.setTarget(step.targetAngle);
    return tracker.advance(step.deltaMs).facingAngle;
  }

  drop(actorId: ActorId): void {
    this.trackers.delete(actorId);
  }

  reset(): void {
    this.trackers.clear();
  }

  get(actorId: ActorId): NpcVisualTracker | undefined {
    return this.trackers.get(actorId);
  }
}
