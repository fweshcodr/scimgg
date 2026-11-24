import type { Coordinate } from '../../types/simulation';
import type { StartPositionPreparation } from '../../types/startPositionPreparation';

/**
 * OSRS 2048-unit facing angle for a movement delta: 0=south, 512=west, 1024=north,
 * 1536=east, and the four diagonals between them.
 */
function calculateAngleFromDelta(dx: number, dy: number, fallbackAngle: number): number {
  if (dx === 0 && dy === 0) return fallbackAngle;

  if (dx === 0) {
    if (dy > 0) return 1024;
    if (dy < 0) return 0;
  } else if (dx > 0) {
    if (dy > 0) return 1280;
    if (dy < 0) return 1792;
    return 1536;
  } else {
    if (dy > 0) return 768;
    if (dy < 0) return 256;
    return 512;
  }
  return fallbackAngle;
}

const TILE_UNITS = 128;
const CLIENT_CYCLE_MS = 20;
const SNAP_THRESHOLD = 288;
const BASE_WALK_SPEED = 4;
const TURNING_WALK_SPEED = 2;
const ANGLE_FULL = 2048;
const ANGLE_MASK = 2047;
const ANGLE_HALF = 1024;
const DEFAULT_TURN_SPEED = 32;

interface PathEntry {
  x: number;
  y: number;
  isRunning: boolean;
}

export type PlayerLocomotionState = 'walk' | 'turnRight' | 'turnLeft' | 'walkBack';

export interface PlayerVisualState {
  position: [number, number];
  isVisuallyMoving: boolean;
  /** Whether the simulation had a non-empty path this tick (drives animation state machine). */
  simIsMoving: boolean;
  locomotionState: PlayerLocomotionState | null;
  isRunning: boolean;
  facingAngle: number;
  targetAngle: number;
  isTurning: boolean;
}

/**
 * Interpolates simulation tiles through a pending route. Rotation advances per 20ms client
 * cycle while position advances per render frame. Sub-tile units preserve the integer
 * truncation used to decide when a route entry completes.
 */
export class PlayerVisualTracker {
  private worldXFloat: number;
  private worldYFloat: number;
  private worldX: number;
  private worldY: number;
  private pathQueue: PathEntry[];
  private pathHead = 0;
  private _targetAngle: number;
  private _renderAngle: number;
  private _forcedFacingAngle: number | null;
  private _isInteracting: boolean;
  private _pendingInteractionClear: boolean;
  private turnSpeed: number;

  lastProcessedTick: number;
  private _isMoving: boolean;
  private _isRunning: boolean;
  private movementDelay: number;
  private _primaryAnimBlocksRunning: boolean;
  private _primaryAnimBlocksWalking: boolean;
  private turnRemainderMs: number;

  get facingAngle(): number {
    return this._renderAngle;
  }

  set facingAngle(angle: number) {
    const normalized = angle & ANGLE_MASK;
    this._targetAngle = normalized;
    this._renderAngle = normalized;
  }

  setTargetAngle(angle: number): void {
    if (this.pathLength > 0) return;
    this._targetAngle = angle & ANGLE_MASK;
  }

  setForcedFacingAngle(angle: number | null): void {
    this._forcedFacingAngle = angle !== null ? angle & ANGLE_MASK : null;
  }

  setInteracting(value: boolean): void {
    if (value) {
      this._isInteracting = true;
      this._pendingInteractionClear = false;
    } else if (this._isInteracting) {
      // Not cleared the moment the caller drops it: the actor finishes turning to face
      // the target first, otherwise it visibly abandons the turn mid-swing.
      this._pendingInteractionClear = true;
    }
  }

  private isEffectivelyInteracting(): boolean {
    return this._isInteracting && !this._pendingInteractionClear;
  }

  constructor(startX: number, startY: number) {
    this.worldXFloat = startX * TILE_UNITS;
    this.worldYFloat = startY * TILE_UNITS;
    this.worldX = this.worldXFloat;
    this.worldY = this.worldYFloat;
    this.pathQueue = [];
    this.lastProcessedTick = -1;
    this._targetAngle = 0;
    this._renderAngle = 0;
    this._forcedFacingAngle = null;
    this._isInteracting = false;
    this._pendingInteractionClear = false;
    this.turnSpeed = DEFAULT_TURN_SPEED;
    this._isMoving = false;
    this._isRunning = false;
    this.movementDelay = 0;
    this._primaryAnimBlocksRunning = false;
    this._primaryAnimBlocksWalking = false;
    this.turnRemainderMs = 0;
  }

  /**
   * Set whether the current primary animation blocks walk/run visual interpolation.
   * While blocked, movementDelay accumulates so the actor catches up at higher speed once
   * the animation releases it.
   */
  setPrimaryAnimBlocking(blocksRunning: boolean, blocksWalking: boolean): void {
    this._primaryAnimBlocksRunning = blocksRunning;
    this._primaryAnimBlocksWalking = blocksWalking;
  }

  enqueueTickMovement(tick: number, stepTiles: readonly Coordinate[] = [], isRunning: boolean): void {
    if (tick === this.lastProcessedTick) {
      return;
    }
    this.lastProcessedTick = tick;
    this.enqueueSteps(stepTiles, isRunning);
  }

  /**
   * Queue steps taken outside the tick stream (countdown start positioning, whose tick stays 0).
   * The caller feeds each step once; `lastProcessedTick` is left alone, so the tick that follows
   * still enqueues its own movement and never replays these.
   */
  enqueueSteps(stepTiles: readonly Coordinate[], isRunning: boolean): void {
    for (const [tileX, tileY] of stepTiles) {
      this.pathQueue.push({ x: tileX, y: tileY, isRunning });
    }

    this.retargetToPathHead();
  }

  /**
   * Snap onto the simulation's tile when the queued route does not end on it: the player was
   * placed there without walking (a teleport), so there is no route to interpolate and waiting
   * for one would leave them drawn on the old tile. Call after the tick's movement is queued.
   * Returns whether it snapped.
   */
  snapToUnwalkedPlacement([tileX, tileY]: Coordinate, facingAngle: number): boolean {
    if (this.routeEndsOn([tileX, tileY])) return false;
    const processedTick = this.lastProcessedTick;
    this.reset(tileX, tileY);
    this.lastProcessedTick = processedTick;
    this.facingAngle = facingAngle;
    return true;
  }

  /** Whether the queued route ends on `tile`, or, with none queued, the actor stands on it. */
  routeEndsOn([tileX, tileY]: Coordinate): boolean {
    const end = this.pathLength > 0 ? this.pathQueue[this.pathQueue.length - 1] : null;
    const endSubX = end ? end.x * TILE_UNITS : this.worldXFloat;
    const endSubY = end ? end.y * TILE_UNITS : this.worldYFloat;
    return endSubX === tileX * TILE_UNITS && endSubY === tileY * TILE_UNITS;
  }

  private get pathLength(): number {
    return this.pathQueue.length - this.pathHead;
  }

  private consumePathHead(): void {
    this.pathHead++;
    if (this.pathHead * 2 >= this.pathQueue.length) {
      this.pathQueue = this.pathQueue.slice(this.pathHead);
      this.pathHead = 0;
    }
  }

  private retargetToPathHead(): void {
    while (this.pathLength > 0) {
      const entry = this.pathQueue[this.pathHead];
      const targetSubX = entry.x * TILE_UNITS;
      const targetSubY = entry.y * TILE_UNITS;

      const dx = targetSubX - this.worldXFloat;
      const dy = targetSubY - this.worldYFloat;
      this._targetAngle = calculateAngleFromDelta(dx, dy, this._targetAngle);
      this._isRunning = this.computeMovementSpeed(entry) >= 8;

      const chebyshev = Math.max(Math.abs(dx), Math.abs(dy));
      if (chebyshev > SNAP_THRESHOLD) {
        this.worldX = targetSubX;
        this.worldY = targetSubY;
        this.worldXFloat = targetSubX;
        this.worldYFloat = targetSubY;
        this.consumePathHead();
      } else if (targetSubX === this.worldX && targetSubY === this.worldY) {
        this.consumePathHead();
      } else {
        return;
      }
    }
    this.movementDelay = 0;
  }

  advance(deltaMs: number, speedMultiplier: number): PlayerVisualState {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return this.buildState();
    }

    const safeSpeedMultiplier = Number.isFinite(speedMultiplier) && speedMultiplier > 0 ? speedMultiplier : 1;
    const scaledDeltaMs = deltaMs * safeSpeedMultiplier;
    const cycles = scaledDeltaMs / CLIENT_CYCLE_MS;

    this.turnRemainderMs += scaledDeltaMs;
    const turnCycles = Math.floor(this.turnRemainderMs / CLIENT_CYCLE_MS);
    this.turnRemainderMs -= turnCycles * CLIENT_CYCLE_MS;

    // Rotation continues while position is animation-blocked. Stepping the visual angle here
    // keeps the turn penalty and locomotion bucket on the same per-cycle source of truth.
    for (let i = 0; i < turnCycles; i++) {
      if (this.isMovementBlockedByAnim()) {
        this.movementDelay++;
      } else if (this.movementDelay > 0 && this.pathLength > 1) {
        this.movementDelay--;
      }
      const turnTarget = this.currentTurnTarget();
      this.stepRenderAngleSingle(turnTarget);
      if (this._pendingInteractionClear && this._renderAngle === turnTarget) {
        this._pendingInteractionClear = false;
        this._isInteracting = false;
      }
    }

    if (!this.isMovementBlockedByAnim()) {
      this.interpolateAlongPath(cycles);
    }

    this._isMoving = this.pathLength > 0;
    if (!this._isMoving) {
      this._isRunning = false;
    }

    return this.buildState();
  }

  /**
   * Whether the primary animation currently blocks positional movement. Tracked separately
   * for walking and running because an animation may block one without blocking the other.
   */
  private isMovementBlockedByAnim(): boolean {
    if (this.pathLength === 0) return false;
    const entry = this.pathQueue[this.pathHead];
    if (entry.isRunning && this._primaryAnimBlocksRunning) return true;
    if (!entry.isRunning && this._primaryAnimBlocksWalking) return true;
    return false;
  }

  /**
   * One cycle's step of the visual angle toward `target`, taking the shorter way round and
   * snapping exactly onto the target once it is within a single step.
   */
  private stepRenderAngleSingle(target: number): void {
    const delta = (target - this._renderAngle) & ANGLE_MASK;
    if (delta === 0) return;
    const direction = delta > ANGLE_HALF ? -1 : 1;
    this._renderAngle = (this._renderAngle + direction * this.turnSpeed) & ANGLE_MASK;
    if (delta < this.turnSpeed || delta > ANGLE_FULL - this.turnSpeed) {
      this._renderAngle = target;
    }
  }

  private interpolateAlongPath(remainingCycles: number): void {
    while (this.pathLength > 0 && remainingCycles > 0) {
      const cycleBudget = remainingCycles;
      const entry = this.pathQueue[this.pathHead];
      const prevXFloat = this.worldXFloat;
      const prevYFloat = this.worldYFloat;

      const targetSubX = entry.x * TILE_UNITS;
      const targetSubY = entry.y * TILE_UNITS;

      const segDx = targetSubX - prevXFloat;
      const segDy = targetSubY - prevYFloat;
      // The target angle is deliberately NOT recomputed mid-segment: direction is set only
      // when a route entry is taken or completed. Recomputing it here from the fractional
      // mid-segment position caused a cardinal-snap jitter near diagonal arrival.

      const speed = this.computeMovementSpeed(entry);

      const budget = speed * cycleBudget;
      let leftover = 0;

      if (prevXFloat < targetSubX) {
        this.worldXFloat += budget;
        if (this.worldXFloat > targetSubX) {
          leftover = (this.worldXFloat - targetSubX) / speed;
          this.worldXFloat = targetSubX;
        }
      } else if (prevXFloat > targetSubX) {
        this.worldXFloat -= budget;
        if (this.worldXFloat < targetSubX) {
          leftover = (targetSubX - this.worldXFloat) / speed;
          this.worldXFloat = targetSubX;
        }
      }

      if (prevYFloat < targetSubY) {
        this.worldYFloat += budget;
        if (this.worldYFloat > targetSubY) {
          leftover = Math.max(leftover, (this.worldYFloat - targetSubY) / speed);
          this.worldYFloat = targetSubY;
        }
      } else if (prevYFloat > targetSubY) {
        this.worldYFloat -= budget;
        if (this.worldYFloat < targetSubY) {
          leftover = Math.max(leftover, (targetSubY - this.worldYFloat) / speed);
          this.worldYFloat = targetSubY;
        }
      }

      remainingCycles = leftover;

      this.worldX = Math.trunc(this.worldXFloat);
      this.worldY = Math.trunc(this.worldYFloat);

      if (segDx !== 0 || segDy !== 0) {
        this._isRunning = speed >= 8;
      }

      if (targetSubX === this.worldX && targetSubY === this.worldY) {
        // Settle exactly on the completed tile. The pop only requires trunc(float)===tile,
        // so the float can keep a sub-unit residue (e.g. 1152.5). Snapping it prevents that
        // residue from later being read as a diagonal (south -> SW) by the next move's
        // direction computation in retargetToPathHead / on the next pop.
        this.worldXFloat = targetSubX;
        this.worldYFloat = targetSubY;
        this.consumePathHead();
        // The next direction is computed from the TILE just completed, not from the
        // fractional position. The float can sit a hair past the tile (the pop only requires
        // trunc(worldXFloat) === targetSub), which would turn a clean cardinal delta
        // (0, -128) into a diagonal (-0.3, -128) and mis-face south as south-west.
        const next = this.pathQueue[this.pathHead];
        if (next) {
          this._targetAngle = calculateAngleFromDelta(
            next.x * TILE_UNITS - targetSubX,
            next.y * TILE_UNITS - targetSubY,
            this._targetAngle,
          );
        }
      }
    }
  }

  private computeMovementSpeed(entry: PathEntry): number {
    let speed = BASE_WALK_SPEED;
    if (this.currentTurnTarget() !== this._renderAngle && this.turnSpeed !== 0 && !this.isEffectivelyInteracting()) {
      speed = TURNING_WALK_SPEED;
    }
    if (this.pathLength > 2) speed = 6;
    if (this.pathLength > 3) speed = 8;
    // Decrement is handled per-client-cycle in advance(), not here.
    if (this.movementDelay > 0 && this.pathLength > 1) {
      speed = 8;
    }
    if (entry.isRunning) speed <<= 1;
    return speed;
  }

  reset(x: number, y: number): void {
    this.worldXFloat = x * TILE_UNITS;
    this.worldYFloat = y * TILE_UNITS;
    this.worldX = this.worldXFloat;
    this.worldY = this.worldYFloat;
    this.pathQueue = [];
    this.pathHead = 0;
    this.lastProcessedTick = -1;
    this._targetAngle = 0;
    this._renderAngle = 0;
    this._forcedFacingAngle = null;
    this._isInteracting = false;
    this._pendingInteractionClear = false;
    this._isMoving = false;
    this._isRunning = false;
    this.movementDelay = 0;
    this._primaryAnimBlocksRunning = false;
    this._primaryAnimBlocksWalking = false;
    this.turnRemainderMs = 0;
  }

  private buildState(): PlayerVisualState {
    const turnTarget = this.currentTurnTarget();
    return {
      position: [this.worldXFloat / TILE_UNITS, this.worldYFloat / TILE_UNITS],
      isVisuallyMoving: this._isMoving,
      simIsMoving: this.pathLength > 0,
      locomotionState: this.computeLocomotionState(),
      isRunning: this._isRunning,
      facingAngle: this._renderAngle,
      targetAngle: turnTarget,
      isTurning: this._renderAngle !== turnTarget,
    };
  }

  private currentTurnTarget(): number {
    return this._forcedFacingAngle ?? this._targetAngle;
  }

  private computeLocomotionState(): PlayerLocomotionState | null {
    if (this.pathLength === 0) {
      return null;
    }

    const angleDiff = (this.currentTurnTarget() - this._renderAngle) & ANGLE_MASK;
    const signedDiff = angleDiff > ANGLE_HALF ? angleDiff - ANGLE_FULL : angleDiff;

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
}

export interface NpcVisualState {
  facingAngle: number;
  targetAngle: number;
  /** True when the NPC is actively turning and the angle delta won't resolve in a single step. */
  isTurning: boolean;
  turnDeltaSigned: number;
}

export class NpcVisualTracker {
  private static readonly SUSTAINED_TURN_THRESHOLD = 25;

  private _visualAngle: number;
  private _targetAngle: number;
  private turnSpeed: number;
  private _remainderMs = 0;
  private _isTurning = false;
  private _turnDeltaSigned = 0;
  private _consecutiveTurnTicks = 0;

  constructor(initialAngle = 0, turnSpeed = DEFAULT_TURN_SPEED) {
    const normalized = initialAngle & ANGLE_MASK;
    this._visualAngle = normalized;
    this._targetAngle = normalized;
    this.turnSpeed = turnSpeed;
  }

  setTurnSpeed(speed: number): void {
    this.turnSpeed = speed;
  }

  setTarget(targetAngle: number): void {
    this._targetAngle = targetAngle & ANGLE_MASK;
  }

  /**
   * Snap the visual angle straight to the target (no interpolation) and clear
   * turning state. Called on a replay timeline discontinuity so the NPC faces
   * the seeked tick's direction immediately instead of turning the long way
   * from a stale visual angle.
   */
  snap(targetAngle?: number): void {
    if (targetAngle !== undefined) {
      this._targetAngle = targetAngle & ANGLE_MASK;
    }
    this._visualAngle = this._targetAngle;
    this._remainderMs = 0;
    this._isTurning = false;
    this._turnDeltaSigned = 0;
    this._consecutiveTurnTicks = 0;
  }

  advance(deltaMs: number): NpcVisualState {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
      return this.buildState();
    }

    this._remainderMs += deltaMs;
    let wholeCycles = Math.floor(this._remainderMs / CLIENT_CYCLE_MS);
    this._remainderMs -= wholeCycles * CLIENT_CYCLE_MS;
    wholeCycles = Math.min(wholeCycles, 50);

    for (let i = 0; i < wholeCycles; i++) {
      this.stepVisualAngle();
    }

    return this.buildState();
  }

  private stepVisualAngle(): void {
    const delta = (this._targetAngle - this._visualAngle) & ANGLE_MASK;

    if (delta === 0) {
      this._consecutiveTurnTicks = 0;
      this._isTurning = false;
      this._turnDeltaSigned = 0;
      return;
    }

    this._consecutiveTurnTicks++;
    this._turnDeltaSigned = delta > ANGLE_HALF ? delta - ANGLE_FULL : delta;
    const direction = delta > ANGLE_HALF ? -1 : 1;
    this._visualAngle = (this._visualAngle + direction * this.turnSpeed) & ANGLE_MASK;

    const snapped = delta < this.turnSpeed || delta > ANGLE_FULL - this.turnSpeed;
    if (snapped) {
      this._visualAngle = this._targetAngle;
    }

    this._isTurning = !snapped || this._consecutiveTurnTicks > NpcVisualTracker.SUSTAINED_TURN_THRESHOLD;
  }

  private buildState(): NpcVisualState {
    return {
      facingAngle: this._visualAngle,
      targetAngle: this._targetAngle,
      isTurning: this._isTurning,
      turnDeltaSigned: this._turnDeltaSigned,
    };
  }
}

export function calculateVisualPlayerPosition(
  previousPos: Coordinate | undefined,
  movementPath: readonly Coordinate[] | undefined,
  currentPos: Coordinate,
  tickProgress: number,
  fallbackAngle = 0,
): { position: [number, number]; isVisuallyMoving: boolean; facingAngle: number } {
  if (!previousPos || !movementPath || movementPath.length === 0) {
    return { position: [currentPos[0], currentPos[1]], isVisuallyMoving: false, facingAngle: fallbackAngle };
  }

  const totalSteps = movementPath.length;
  const clampedProgress = Math.max(0, Math.min(tickProgress, 1));

  if (clampedProgress >= 1) {
    return { position: [currentPos[0], currentPos[1]], isVisuallyMoving: false, facingAngle: fallbackAngle };
  }

  const progressPerStep = 1 / totalSteps;
  const currentStepIndex = Math.min(Math.floor(clampedProgress / progressPerStep), totalSteps - 1);
  const stepProgress = Math.min((clampedProgress - currentStepIndex * progressPerStep) / progressPerStep, 1);

  const fromPos = currentStepIndex === 0 ? previousPos : movementPath[currentStepIndex - 1];
  const toPos = movementPath[currentStepIndex];

  if (!fromPos || !toPos) {
    return { position: [currentPos[0], currentPos[1]], isVisuallyMoving: false, facingAngle: fallbackAngle };
  }

  const visualX = fromPos[0] + (toPos[0] - fromPos[0]) * stepProgress;
  const visualY = fromPos[1] + (toPos[1] - fromPos[1]) * stepProgress;

  const dx = toPos[0] - fromPos[0];
  const dy = toPos[1] - fromPos[1];
  const facingAngle = calculateAngleFromDelta(dx, dy, fallbackAngle);

  return { position: [visualX, visualY], isVisuallyMoving: true, facingAngle };
}

/**
 * The interpolated (2D) pose of the latest countdown positioning step at active-clock `nowMs`: the
 * step plays over one tick interval from when it was taken, independently of the tick (still 0).
 */
export function startPositionPreparationVisual(
  preparation: StartPositionPreparation,
  nowMs: number,
  tickIntervalMs: number,
): PlayerVisualState {
  const { from, stepTiles, to, isRunning } = preparation.step;
  const progress =
    tickIntervalMs > 0 ? Math.max(0, Math.min((nowMs - preparation.steppedAtMs) / tickIntervalMs, 1)) : 1;
  const last = stepTiles[stepTiles.length - 1] ?? to;
  const beforeLast = stepTiles.length > 1 ? stepTiles[stepTiles.length - 2] : from;
  const arrivalFacing = calculateAngleFromDelta(last[0] - beforeLast[0], last[1] - beforeLast[1], 0);
  const visual = calculateVisualPlayerPosition(from, stepTiles, to, progress, arrivalFacing);
  return {
    ...visual,
    targetAngle: visual.facingAngle,
    simIsMoving: visual.isVisuallyMoving,
    isRunning: visual.isVisuallyMoving && isRunning,
    isTurning: false,
    locomotionState: null,
  };
}
