export type DamageValue = number | [number, number];

/**
 * `roll` must be supplied from the engine's seeded combat stream by anything a
 * replay reconstructs (see `SimulationEngine.rollCombat`). The `Math.random`
 * default only serves callers outside a run — leaving it in a simulated path
 * makes the same seed produce a different fight.
 */
export function resolveDamage(value: DamageValue, roll: () => number = Math.random): number {
  if (typeof value === 'number') return value;
  const [min, max] = value;
  if (min >= max) return min;
  return min + Math.floor(roll() * (max - min + 1));
}

import { PrayerType } from '../../types/simulation';
import type { DamageType } from '../actors/types';
import type { PrayerReduction } from './CombatSystem';

export function didPrayCorrectly(
  attackType: Exclude<DamageType, 'typeless'>,
  activePrayer: PrayerType | null,
): boolean {
  if (!activePrayer) return false;
  return (
    (attackType === 'magic' && activePrayer === PrayerType.ProtectMagic) ||
    (attackType === 'range' && activePrayer === PrayerType.ProtectRange) ||
    (attackType === 'melee' && activePrayer === PrayerType.ProtectMelee)
  );
}

export function calculatePrayerDamage(
  baseDamage: number,
  attackType: DamageType | undefined,
  activePrayer: PrayerType | null | undefined,
  prayerReduction?: PrayerReduction,
): number {
  if (baseDamage === 0) return 0;
  if (!attackType || !activePrayer || attackType === 'typeless') return baseDamage;

  const correctPrayer = didPrayCorrectly(attackType, activePrayer);
  if (!correctPrayer) return baseDamage;

  const reduction = prayerReduction ?? { type: 'block' as const };
  switch (reduction.type) {
    case 'block':
      return 0;
    case 'cap':
      return Math.min(reduction.value ?? 0, baseDamage);
    case 'reduce': {
      // `floor(damage * penetration)` — the penetrating share, floored. NOT the roll minus the
      // floored BLOCKED share. The two differ only in rounding and only at low rolls, but that
      // difference is the entire shape of the mechanic: this form lets every roll below
      // `100 / rate` read 0, where subtracting the blocked share can only ever zero a roll of 0.
      //
      // Measured: 20 of 59 prayed phase-3 autos read 0 on base Yama with NO ARMOUR, where the
      // accuracy roll accounts for only ~10%. This form predicts 34%; the other predicts 12%.
      // Full derivation and capture evidence in `docs/encounters/yama-facts-spec.md` §5.
      //
      // Do NOT restore the subtract-blocked form. Every rate in `contractConfig` is calibrated
      // to THIS arithmetic and silently becomes wrong under the other. Rates must be whole
      // percents: 0.125 silently becomes 13%.
      return Math.floor((baseDamage * Math.round((reduction.value ?? 0) * 100)) / 100);
    }
    case 'bypass':
      return baseDamage;
    default: {
      const _exhaustive: never = reduction.type;
      void _exhaustive;
      return 0;
    }
  }
}

/**
 * Protection-prayer reduction that lets a hit land at full damage even when the
 * matching overhead is active. Use for mechanic damage the player must dodge or
 * parry — the encounter has already decided the hit connects, so the engine must
 * not block it by prayer a second time.
 */
export const BYPASS_PROTECTION_PRAYER: PrayerReduction = { type: 'bypass' };
