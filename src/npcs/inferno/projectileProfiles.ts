import type { ProjAnimTiming } from '../../core/combat/hitDelay';

// capture inferno-waves-69-zuk-packet-data.txt: attacker center tile to target SW, not visual endpoints.
export const JAL_ZEK_PROJECTILE_TIMING = {
  delay: 28,
  lengthAdjustment: 0,
  stepMultiplier: 8,
  progress: 32,
} as const satisfies ProjAnimTiming;

export const JAL_XIL_PROJECTILE_TIMING = {
  delay: 60,
  lengthAdjustment: -14,
  stepMultiplier: 8,
  progress: 0,
} as const satisfies ProjAnimTiming;

export const JALTOK_JAD_PROJECTILE_TIMING = {
  delay: 2,
  lengthAdjustment: 0,
  stepMultiplier: 8,
  progress: 32,
} as const satisfies ProjAnimTiming;

/** One ordinary-wave projectile: its projectile record fields beside the timing that sets its hit tick. */
export type InfernoWaveProjectile = {
  readonly spotAnimId: number;
  readonly timing: ProjAnimTiming;
  readonly slope: number;
  readonly startHeight: number;
  readonly endHeight: number;
};

// docs/encounters/inferno-facts-spec.md (Projectiles): every endtime fits exactly (P+Q, 0 residual
// against the packet source tile). The bat's source tile is its SW tile, not `projectileDistance`'s
// center, so the bat measures its own distance (`bat.ts`).
export const JAL_MEJRAH_PROJECTILE = {
  spotAnimId: 1382,
  timing: { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 128 },
  slope: 16,
  startHeight: 200,
  endHeight: 124,
} as const satisfies InfernoWaveProjectile;

export const JAL_AK_RANGED_PROJECTILE = {
  spotAnimId: 1378,
  timing: { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 32 },
  slope: 16,
  startHeight: 160,
  endHeight: 124,
} as const satisfies InfernoWaveProjectile;

export const JAL_AK_MAGIC_PROJECTILE = {
  spotAnimId: 1380,
  timing: { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 },
  slope: 16,
  startHeight: 160,
  endHeight: 124,
} as const satisfies InfernoWaveProjectile;

export const JAL_AKREK_XIL_PROJECTILE = {
  spotAnimId: 1379,
  timing: { delay: 10, lengthAdjustment: 22, stepMultiplier: 8, progress: 32 },
  slope: 16,
  startHeight: 80,
  endHeight: 124,
} as const satisfies InfernoWaveProjectile;

export const JAL_AKREK_MEJ_PROJECTILE = {
  spotAnimId: 1381,
  timing: { delay: 28, lengthAdjustment: 0, stepMultiplier: 8, progress: 32 },
  slope: 16,
  startHeight: 80,
  endHeight: 124,
} as const satisfies InfernoWaveProjectile;
