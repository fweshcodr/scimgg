import type { CollisionLocPlacement } from '../../core/arena/collisionSpec';

// Literal inventory also keeps every cosmetic variant in the production cache trim.
export const SOL_BOUNDARY_LOC_IDS = [50753, 50754, 50755, 50756, 50757, 50758] as const;

/**
 * Packet-spawned shield warriors, not NPC actors. K:3998 records all 48 at player control;
 * M records the same tiles, shape 10 and rotations, with different cosmetic variants.
 * Reproduce K's observed variant arrangement rather than invent a random selection rule.
 * These placements are shared by runtime scene objects and cache collision baking.
 */
export const SOL_BOUNDARY_WARRIORS: readonly CollisionLocPlacement[] = [
  ...[4, 1, 1, 1, 4, 4, 2, 5, 2, 1, 1, 2].map((variant, index) => ({
    locId: SOL_BOUNDARY_LOC_IDS[variant - 1],
    localX: 27 + index,
    localY: 42,
    rotation: 0,
    type: 10,
    level: 0,
  })),
  ...[4, 5, 4, 3, 6, 5, 2, 1, 1, 5, 6, 3].map((variant, index) => ({
    locId: SOL_BOUNDARY_LOC_IDS[variant - 1],
    localX: 40,
    localY: 29 + index,
    rotation: 1,
    type: 10,
    level: 0,
  })),
  ...[6, 1, 1, 4, 1, 6, 1, 1, 1, 4, 4, 1].map((variant, index) => ({
    locId: SOL_BOUNDARY_LOC_IDS[variant - 1],
    localX: 27 + index,
    localY: 27,
    rotation: 2,
    type: 10,
    level: 0,
  })),
  ...[1, 6, 1, 5, 2, 1, 2, 6, 6, 5, 4, 2].map((variant, index) => ({
    locId: SOL_BOUNDARY_LOC_IDS[variant - 1],
    localX: 25,
    localY: 29 + index,
    rotation: 3,
    type: 10,
    level: 0,
  })),
];
