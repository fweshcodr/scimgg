/**
 * Applied before any accuracy or damage roll.
 *
 * The monster dataset models a boss in its ordinary form. Anything that restats a boss for one run — a Yama contract, a Colosseum
 * modifier, an invocation-style toggle — has no row there and never will, so the encounter
 * supplies the delta instead of the dataset carrying a variant per combination.
 *
 * Declared here, in a leaf module, so encounter and combat code can share the type.
 */

export interface MonsterDefensiveOverride {
  readonly stab?: number;
  readonly slash?: number;
  readonly crush?: number;
  readonly magic?: number;
  readonly light?: number;
  readonly standard?: number;
  readonly heavy?: number;
  readonly flat_armour?: number;
}

export interface MonsterSkillsOverride {
  readonly atk?: number;
  readonly str?: number;
  readonly def?: number;
  readonly magic?: number;
  readonly ranged?: number;
  readonly hp?: number;
}

export interface MonsterStatOverride {
  readonly defensive?: MonsterDefensiveOverride;
  readonly skills?: MonsterSkillsOverride;
}

/** Keyed by NPC type id. */
export type MonsterStatOverrides = Readonly<Record<number, MonsterStatOverride>>;
