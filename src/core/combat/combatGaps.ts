export const CALC_GAPS = {
  // /w/Eclipse_atlatl describes "magic-based" but gives no special accuracy/max-hit formula.
  ECLIPSE_SPECIAL_FORMULA: 'eclipse_special_formula',
  ANIMATION_ONLY_SPECIAL: 'animation_only_special',
  PLAYER_POISON: 'player_poison',
  RAID_SCALING: 'raid_scaling',
  PVP: 'pvp',
} as const;

export type CalcGap = (typeof CALC_GAPS)[keyof typeof CALC_GAPS];
