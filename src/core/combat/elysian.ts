export const ELYSIAN_SPIRIT_SHIELD_ID = 12817;

const ELYSIAN_PROC_CHANCE = 0.7;
const ELYSIAN_DAMAGE_MULTIPLIER = 0.75;

export function applyElysianDamageMitigation(damage: number, roll: number): number {
  return roll < ELYSIAN_PROC_CHANCE ? Math.floor(damage * ELYSIAN_DAMAGE_MULTIPLIER) : damage;
}
