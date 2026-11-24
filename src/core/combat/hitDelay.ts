export type HitDelayModel = 'melee' | 'bow' | 'thrown' | 'magic' | 'magic_slow';

export function calculateHitDelay(model: HitDelayModel, distance: number): number {
  switch (model) {
    case 'melee':
      return 1;
    case 'bow':
      return 1 + Math.floor((distance + 3) / 6);
    case 'thrown':
      return 1 + Math.floor(distance / 6);
    case 'magic':
      return 1 + Math.floor((distance + 1) / 3);
    case 'magic_slow':
      return 2 + Math.floor((distance + 1) / 3);
  }
}

/**
 * OSRS ProjAnimType cache fields that control projectile flight timing.
 * endTime (client cycles) = delay + lengthAdjustment + stepMultiplier * distance
 * hitDelay (game ticks) = 1 + floor(endTime / 30)
 */
export interface ProjAnimTiming {
  /** Base delay in client cycles (20ms each). Also used as startTime. */
  delay: number;
  /** Signed additive offset to flight duration in client cycles. */
  lengthAdjustment: number;
  /** Client cycles added per tile of Chebyshev distance. */
  stepMultiplier: number;
  /** Local-unit horizontal launch offset toward the target on emit (128 = 1 tile). */
  progress: number;
}

/** Known projectile timing profiles from the OSRS cache. */
export const PROJ_ANIM_TIMINGS: Record<string, ProjAnimTiming> = {
  magic_spell: { delay: 51, lengthAdjustment: -5, stepMultiplier: 10, progress: 64 },
  tumekens_shadow: { delay: 56, lengthAdjustment: 16, stepMultiplier: 10, progress: 40 },
  // `endtime = 46 + 5 * distance` on 486/487 `vfx_ayak_normal_projectile` launches, distance to the
  // target's footprint, across capture tob-*-packet-data*.txt. Not `magic_spell`: half the step.
  eye_of_ayak: { delay: 51, lengthAdjustment: -5, stepMultiplier: 5, progress: 64 },
  arrow: { delay: 41, lengthAdjustment: 5, stepMultiplier: 5, progress: 11 },
  thrown: { delay: 32, lengthAdjustment: 0, stepMultiplier: 5, progress: 11 },
};

export function calculateProjectileEndTime(timing: ProjAnimTiming, distance: number): number {
  return timing.delay + timing.lengthAdjustment + timing.stepMultiplier * distance;
}

export function hitDelayFromEndTime(endTimeClientCycles: number): number {
  return 1 + Math.floor(endTimeClientCycles / 30);
}

/**
 * Hit delay (game ticks) for an attack whose TARGET is processed AFTER the attacker.
 *
 * OSRS adds one tick only when the target is processed before the attacker, and NPCs are
 * processed before players. So a player attacking an NPC gets the `1 +` form above, while
 * an NPC attacking the player does NOT — the player is processed later in the same tick.
 * See https://oldschool.runescape.wiki/w/Hit_delay ("Attacks onto NPCs are one tick later").
 */
export function npcHitDelayFromEndTime(endTimeClientCycles: number): number {
  return Math.floor(endTimeClientCycles / 30);
}
