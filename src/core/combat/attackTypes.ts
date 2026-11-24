export type DamageType = 'melee' | 'range' | 'magic' | 'typeless';

/** Whether range-1 melee also reaches diagonally adjacent tiles. */
export type MeleeReach = 'cardinal' | 'diagonal';

export type AttackKind =
  | 'melee_slash'
  | 'melee_stab'
  | 'melee_crush'
  | 'range_arrow'
  | 'range_shadow'
  | 'magic_fire'
  | 'magic_shadow'
  | 'magic_air'
  | 'magic_water'
  | 'typeless';
