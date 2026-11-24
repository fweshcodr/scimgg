import type { DamageType } from '../../actors/types';

export const AMULET_OF_BLOOD_FURY = 24780;

export const BLOOD_FURY_PROC_CHANCE = 0.2;

export const BLOOD_FURY_HEAL_FRACTION = 0.3;

/**
 * The proc graphic, played once on the TARGET on the swing tick whenever any of the swing's hits
 * procs, whether or not it heals: `spotanim id=sanguinesti_staff_heal (1542), height=92` in the
 * target NPC's block on all 49 captured procs across the three Sol captures (e.g. N 7572).
 */
export const BLOOD_FURY_SPOTANIM = { spotAnimId: 1542, height: 92 } as const;

export interface BloodFuryHit {
  readonly amuletId: number | undefined;
  readonly attackType: DamageType;
  readonly damage: number;
  readonly roll: () => number;
}

/**
 * Rolls one hitsplat: "a passive 20% chance to heal 30% of the damage dealt on any hit"
 * (/w/Amulet_of_blood_fury, rev 15318464). Returns the heal when it procs, or null. A proc on a
 * small hit still procs, even though its heal floors to 0.
 *
 * Multi-hit weapons roll each hitsplat independently. All 49 captured procs heal exactly the sum
 * of floor(30%) over some subset of the swing's hitsplats, e.g. N 7630: 46-11-6 heals 16 = 13 + 3.
 */
export function rollBloodFury(hit: BloodFuryHit): number | null {
  if (hit.amuletId !== AMULET_OF_BLOOD_FURY) return null;
  if (hit.attackType !== 'melee') return null;
  if (hit.damage <= 0) return null;
  if (hit.roll() >= BLOOD_FURY_PROC_CHANCE) return null;
  return Math.floor(hit.damage * BLOOD_FURY_HEAL_FRACTION);
}
