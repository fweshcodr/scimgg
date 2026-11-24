/**
 * Shared projectile aiming contract.
 *
 * OSRS projectiles are fired at an *entity*, not at a tile: a projectile follows
 * its target's current position every client cycle, so it bends mid-flight to keep
 * hitting a target that walks after the shot was fired.
 *
 * {@link ProjectileAim} encodes that distinction once so every projectile
 * renderer — the player's `ProjectileController`, encounter-owned controllers,
 * and anything added later — homes by default and opts out explicitly.
 */

/** SW-corner tile position of a footprint, in float tile units. */
export type ProjectileAimPosition = readonly [number, number];

/**
 * Resolves an actor id to its CURRENT interpolated visual SW position — the
 * position that actor's model is rendered at this frame, not its simulation
 * snapshot. Returns null when the actor has no live render instance (not
 * loaded yet, despawned, or dead).
 */
export type ActorVisualPositionResolver = (actorId: string) => ProjectileAimPosition | null;

/** A projectile destination, resolved for the current frame. */
export interface ProjectileAimPoint {
  /** SW corner of the destination footprint. */
  readonly sw: ProjectileAimPosition;
  /** Footprint width/height in tiles; drives the destination's XY center. */
  readonly size: number;
  /** Destination height in tiles; drives the Z offset. Ground tiles use 0. */
  readonly height: number;
}

export class ProjectileAim {
  private constructor(
    /** Actor this projectile homes onto, or null for a fixed destination. */
    readonly actorId: string | null,
    private point: ProjectileAimPoint,
  ) {}

  /**
   * Home onto an actor — the default for any attack aimed at a creature.
   *
   * `launchPoint` seeds the destination and supplies the footprint size/height,
   * which do not change while the projectile is in flight; only the position
   * re-resolves.
   */
  static atActor(actorId: string, launchPoint: ProjectileAimPoint): ProjectileAim {
    return new ProjectileAim(actorId, launchPoint);
  }

  /**
   * Fixed destination, for non-targeted attacks that must NOT follow anything:
   * AoE meteors, tile-marked ground effects, and special attacks aimed at a
   * square rather than a creature.
   */
  static atPoint(point: ProjectileAimPoint): ProjectileAim {
    return new ProjectileAim(null, point);
  }

  /** True when this aim re-resolves against a live actor each frame. */
  get isHoming(): boolean {
    return this.actorId !== null;
  }

  /**
   * Destination for the current frame.
   *
   * Entity aims re-read the live visual position. When the actor cannot be
   * resolved — it died, despawned, or its model is not loaded — the last
   * successfully resolved position is kept, so the projectile finishes its arc
   * where the target last stood instead of snapping back to the launch tile.
   */
  resolve(resolveActor: ActorVisualPositionResolver | null | undefined): ProjectileAimPoint {
    if (this.actorId === null || !resolveActor) return this.point;
    const sw = resolveActor(this.actorId);
    if (sw) this.point = { sw, size: this.point.size, height: this.point.height };
    return this.point;
  }
}
