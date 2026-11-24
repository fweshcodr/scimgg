import type { LocWithType } from '../../cache/CacheManager';
import { GRID_SIZE, getArenaBounds } from '../../core/constants';
import type { LocModelLoader } from '../../rs/config/loctype/LocModelLoader';
import type { LocType } from '../../rs/config/loctype/LocType';
import type { LocExclusionRegion, LocRenderOptions, LocReplacement } from './locRenderOptions';

/**
 * Default bounding margin (tiles) around the playable arena. Locs farther
 * out are skipped to avoid loading the entire surrounding map square for
 * encounters whose arena IS the playable area (e.g. Yama).
 */
const DEFAULT_ARENA_MARGIN = 5;

const DEFAULT_LEVEL_SET: ReadonlySet<number> = new Set([0]);

export interface ResolvedLocRenderFilter {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
  readonly levels: ReadonlySet<number>;
  readonly excludedLocIds: ReadonlySet<number>;
  readonly excludedRegions: ReadonlyArray<LocExclusionRegion>;
  /** `localX:localY:locId` keys of {@link LocRenderOptions.excludedLocs}. */
  readonly excludedLocs: ReadonlySet<string>;
  readonly replacements: ReadonlyMap<string, LocReplacement>;
}

/** Effective loc chosen for rendering after filtering and exact replacement. */
export interface ResolvedRenderLoc {
  readonly location: LocWithType['location'];
  readonly locType: LocType;
}

function locReplacementKey(localX: number, localY: number, sourceLocId: number): string {
  return `${localX}:${localY}:${sourceLocId}`;
}

function isInExcludedRegion(regions: ReadonlyArray<LocExclusionRegion>, localX: number, localY: number): boolean {
  for (const region of regions) {
    if (localX >= region.minX && localX <= region.maxX && localY >= region.minY && localY <= region.maxY) {
      return true;
    }
  }
  return false;
}

export function resolveLocRenderFilter(options: LocRenderOptions | undefined): ResolvedLocRenderFilter {
  const margin = options?.marginTiles ?? DEFAULT_ARENA_MARGIN;
  const explicitBounds = options?.bounds;
  // Three states: undefined => fall back to the global arena bounds (self-contained-arena default);
  // null => render the full map square (encounter embedded in a larger scene); object => explicit window.
  const sourceBounds = explicitBounds === undefined ? getArenaBounds() : explicitBounds;
  const minX = sourceBounds ? sourceBounds.minX - margin : 0;
  const maxX = sourceBounds ? sourceBounds.maxX + margin : GRID_SIZE;
  const minY = sourceBounds ? sourceBounds.minY - margin : 0;
  const maxY = sourceBounds ? sourceBounds.maxY + margin : GRID_SIZE;
  const levels = options?.levels ? new Set(options.levels) : DEFAULT_LEVEL_SET;
  const excludedLocIds = new Set(options?.excludedLocIds);
  const excludedRegions = options?.excludedRegions ?? [];
  const excludedLocs = new Set(
    (options?.excludedLocs ?? []).map((loc) => locReplacementKey(loc.localX, loc.localY, loc.locId)),
  );
  const replacements = new Map<string, LocReplacement>();
  for (const replacement of options?.replacements ?? []) {
    replacements.set(locReplacementKey(replacement.localX, replacement.localY, replacement.sourceLocId), replacement);
  }
  return { minX, maxX, minY, maxY, levels, excludedLocIds, excludedRegions, excludedLocs, replacements };
}

/**
 * Apply the resolved filter to a single cache loc: drop it (returns `null`) when
 * excluded by level, id, bounds, or region; otherwise return the effective loc,
 * substituting the packet-final id/rotation and target LocType for an exact
 * replacement match (and dropping it if the replacement LocType fails to load).
 */
export function resolveRenderLoc(
  locWithType: LocWithType,
  filter: ResolvedLocRenderFilter,
  locModelLoader: LocModelLoader,
): ResolvedRenderLoc | null {
  const { location: sourceLocation, locType: sourceLocType } = locWithType;

  if (!filter.levels.has(sourceLocation.level)) {
    return null;
  }

  if (filter.excludedLocIds.has(sourceLocation.id)) {
    return null;
  }

  if (
    sourceLocation.localX < filter.minX ||
    sourceLocation.localX > filter.maxX ||
    sourceLocation.localY < filter.minY ||
    sourceLocation.localY > filter.maxY
  ) {
    return null;
  }

  if (isInExcludedRegion(filter.excludedRegions, sourceLocation.localX, sourceLocation.localY)) {
    return null;
  }

  if (filter.excludedLocs.has(locReplacementKey(sourceLocation.localX, sourceLocation.localY, sourceLocation.id))) {
    return null;
  }

  const replacement = filter.replacements.get(
    locReplacementKey(sourceLocation.localX, sourceLocation.localY, sourceLocation.id),
  );
  if (!replacement) {
    return { location: sourceLocation, locType: sourceLocType };
  }

  const replacementLocType = locModelLoader.loadLocType(replacement.targetLocId);
  if (!replacementLocType) {
    return null;
  }
  return {
    location: { ...sourceLocation, id: replacement.targetLocId, rotation: replacement.targetRotation },
    locType: replacementLocType,
  };
}

/**
 * The locs an encounter actually renders, in cache-entry form: entries the filter
 * drops are absent, and exact replacements carry their packet-final id/rotation and
 * target LocType. Viewport interaction (hover tooltips, context menus, click picking)
 * consumes this list so excluded statics — a loc the encounter respawns as a runtime
 * NPC — cannot offer phantom targets the rendered scene does not contain.
 */
export function resolveEffectiveLocs(
  locs: ReadonlyArray<LocWithType>,
  options: LocRenderOptions | undefined,
  locModelLoader: LocModelLoader,
): LocWithType[] {
  const filter = resolveLocRenderFilter(options);
  const effective: LocWithType[] = [];
  for (const entry of locs) {
    const resolved = resolveRenderLoc(entry, filter, locModelLoader);
    if (resolved) {
      effective.push({ ...entry, location: resolved.location, locType: resolved.locType });
    }
  }
  return effective;
}
