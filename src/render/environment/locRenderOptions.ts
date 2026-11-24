/**
 * Per-encounter loc-render filter.
 *
 * OSRS encounters fall into two structural categories with respect to scenery:
 *
 * 1. **Self-contained arena** — the playable area IS the scene; outside the
 *    arena is void (instance dungeons, raid rooms with no surrounding world).
 *    Default filter applies. Leave `locRender` undefined.
 *
 * 2. **Arena embedded in a larger world scene** — the playable area is a
 *    small island inside a much larger architectural / wilderness scene
 *    (open-world bosses, Colosseum-style amphitheaters, towns, etc.). Set
 *    `locRender: FULL_MAP_SQUARE_GROUND_LEVEL` for a ground-level scene, or
 *    `FULL_MAP_SQUARE_ALL_LEVELS` when upper-floor locs are part of the scene.
 *
 * Kept separate from the LocRenderer implementation so it can be referenced
 * from {@link import('../scene/encounterRenderConfig').EncounterRenderConfig}
 * without dragging the whole renderer into the encounter type graph.
 */
export interface LocRenderOptions {
  /**
   * Per-encounter bounding window in map-square local tiles. Set to `null`
   * to render the full 64x64 map square. Defaults to the global
   * `getArenaBounds()` widened by {@link LocRenderOptions.marginTiles}.
   */
  bounds?: { minX: number; maxX: number; minY: number; maxY: number } | null;
  /** Margin (tiles) added to {@link LocRenderOptions.bounds}. Default: 5. */
  marginTiles?: number;
  /** Map-square levels to render (0 = ground, 1/2 = upper floors). Default: [0]. */
  levels?: ReadonlyArray<number>;
  /**
   * Cache LOC IDs omitted from this encounter's rendered scenery — for static locs
   * the encounter respawns as a runtime actor. Keep in step with the collision
   * bake's `excludedStaticLocIds` so the scene and the collision map agree.
   */
  excludedLocIds?: ReadonlyArray<number>;
  /**
   * Inclusive map-square-local rectangles whose enclosed LOC anchors are dropped
   * from the scene. Coordinate-scoped clutter removal that, unlike
   * {@link LocRenderOptions.excludedLocIds}, does not depend on cache ids — for an
   * encounter that owns the arena floor at runtime but keeps the surrounding world.
   */
  excludedRegions?: ReadonlyArray<LocExclusionRegion>;
  /**
   * Exact cache LOCs (id at its anchor tile) left out of the static scene, for scenery an encounter's
   * `SceneObjectController` draws instead because it changes mid-run. Unlike
   * {@link LocRenderOptions.excludedLocIds} it spares the same id elsewhere in the map square, and
   * unlike {@link LocRenderOptions.excludedRegions} the other LOCs on that tile.
   */
  excludedLocs?: ReadonlyArray<LocAnchor>;
  /** Exact source-to-target LOC substitutions applied before model loading. */
  replacements?: ReadonlyArray<LocReplacement>;
}

/**
 * Inclusive map-square-local tile rectangle. Any LOC whose anchor tile falls
 * inside (all four edges inclusive) is dropped from the rendered scene.
 */
export interface LocExclusionRegion {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/** One cache LOC: its id at its map-square-local anchor tile. */
export interface LocAnchor {
  readonly localX: number;
  readonly localY: number;
  readonly locId: number;
}

/**
 * Exact source-to-target LOC substitution. A cache LOC anchored at
 * (`localX`, `localY`) with cache id `sourceLocId` renders instead as
 * `targetLocId` at `targetRotation`, its model loaded from the target LocType —
 * pinning scenery to a specific packet-captured final state with no runtime
 * animation.
 */
export interface LocReplacement {
  readonly localX: number;
  readonly localY: number;
  readonly sourceLocId: number;
  readonly targetLocId: number;
  readonly targetRotation: number;
}

/** Render the entire 64x64 map square using only ground-level scenery. */
export const FULL_MAP_SQUARE_GROUND_LEVEL: LocRenderOptions = {
  bounds: null,
  levels: [0],
};

/**
 * Render the entire 64x64 map square across the three populated OSRS levels
 * (ground + two upper floors). Use for any encounter embedded in a larger
 * world scene where the arena clip would hide the surrounding architecture.
 */
export const FULL_MAP_SQUARE_ALL_LEVELS: LocRenderOptions = {
  bounds: null,
  levels: [0, 1, 2],
};
