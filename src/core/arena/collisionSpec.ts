/**
 * Encounter-agnostic collision declaration.
 *
 * By default every encounter auto-derives its arena collision from the cache
 * map square declared on its `EncounterDescriptor`: walls, pillars, and any
 * other clipping locs block automatically via their cache `clipType`. An
 * encounter can additionally declare dynamic sim-layer loc spawns that are absent
 * from the static map-square loc list so those block too — and opt out with
 * `mode: 'custom'` to supply its own hand-built `ArenaConfig` via
 * `Encounter.getArenaConfig()`.
 */
import type { CollisionLocInput, ExcludedStaticLocIds } from '../../rs/collision/WalkabilityAnalyzer';
import { LocModelType } from '../../rs/config/loctype/LocModelType';

export type ArenaCollisionMode = 'auto' | 'custom';

/**
 * A single loc placement to bake into the collision map, in the encounter's
 * local (map-square) tile coordinates — which equal simulation tile coords.
 * Mirrors the fields `analyzeWalkability` reads from static map-square locs.
 */
export interface CollisionLocPlacement {
  readonly locId: number;
  readonly localX: number;
  readonly localY: number;
  readonly rotation: number;
  /** OSRS loc model type (shape). Defaults to NORMAL (10). */
  readonly type?: number;
  /** Map level. Defaults to 0. */
  readonly level?: number;
}

export interface EncounterCollisionSpec {
  /** How the arena collision is built. Defaults to `'auto'`. */
  readonly mode?: ArenaCollisionMode;
  /**
   * Known-walkable interior tile used to flood-fill the reachable arena region.
   * Defaults to the descriptor's `playerStart`.
   */
  readonly seed?: readonly [number, number];
  /**
   * Extra sim-layer loc placements baked into the collision map on top of the
   * static cache map-square locs — for dynamic/packet-spawned locs that are not
   * present in the cache map data.
   */
  readonly dynamicLocs?: readonly CollisionLocPlacement[];
  /**
   * Cache loc ids omitted from the baked static collision, for scenery the
   * encounter replaces with a runtime actor (see {@link ExcludedStaticLocIds}).
   */
  readonly excludedStaticLocIds?: ExcludedStaticLocIds;
}

export function toCollisionLocInput(placement: CollisionLocPlacement): CollisionLocInput {
  return {
    id: placement.locId,
    localX: placement.localX,
    localY: placement.localY,
    type: placement.type ?? LocModelType.NORMAL,
    rotation: placement.rotation,
    level: placement.level ?? 0,
  };
}
