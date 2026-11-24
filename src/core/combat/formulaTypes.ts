export type CombatFormulaStyle = 'melee_slash' | 'melee_stab' | 'melee_crush' | 'ranged' | 'magic';

export type CombatFormulaStance =
  | 'Accurate'
  | 'Aggressive'
  | 'Defensive'
  | 'Controlled'
  | 'Longrange'
  | 'Casting'
  | 'Defensive Casting'
  | 'Manual Cast'
  | 'Other';

export type PlayerVoidSet = 'none' | 'melee' | 'ranged' | 'elite_ranged' | 'magic' | 'elite_magic';

export type CombatLevels = {
  readonly attack: number;
  readonly strength: number;
  readonly defence: number;
  readonly ranged: number;
  readonly magic: number;
};

export type NpcOffensiveBonuses = {
  readonly atk: number;
  readonly ranged: number;
  readonly magic: number;
  readonly str: number;
  readonly rangedStr: number;
  readonly magicStr: number;
};

/**
 * Which of an NPC's three ranged defence bonuses a ranged attack rolls against; the attacking
 * weapon decides it, not the ammunition. https://oldschool.runescape.wiki/w/Attack_types#Ranged_types
 */
export type RangedDefenceType = 'light' | 'standard' | 'heavy';

export type NpcDefensiveBonuses = {
  readonly stab: number;
  readonly slash: number;
  readonly crush: number;
  readonly rangedLight: number;
  readonly rangedStandard: number;
  readonly rangedHeavy: number;
  readonly magic: number;
};

export type PlayerFormulaActor = {
  readonly kind: 'player';
  readonly levels: CombatLevels;
  readonly rangedStrengthLevel?: number;
  readonly stance?: CombatFormulaStance;
  readonly magicBaseMaxHit?: number;
  readonly voidSet?: PlayerVoidSet;
  /** Whole percent added to the prayer Strength multiplier (Soulreaper axe soul stacks). */
  readonly meleeStrengthBonusPercent?: number;
};

export type NpcFormulaActor = {
  readonly kind: 'npc';
  readonly id?: number;
  readonly levels: CombatLevels;
  readonly offensive: NpcOffensiveBonuses;
  readonly defensive: NpcDefensiveBonuses;
  readonly maxHit?: number;
};

export type FormulaAttacker = PlayerFormulaActor | NpcFormulaActor;
export type FormulaTarget = PlayerFormulaActor | NpcFormulaActor;

export type PrayerMultipliers = {
  readonly attack: number;
  readonly strength: number;
  readonly defence: number;
  readonly ranged: number;
  readonly rangedStrength: number;
  readonly magic: number;
  readonly magicDamage: number;
};

export const DEFAULT_PRAYER_MULTIPLIERS: PrayerMultipliers = {
  attack: 1,
  strength: 1,
  defence: 1,
  ranged: 1,
  rangedStrength: 1,
  magic: 1,
  magicDamage: 1,
};
