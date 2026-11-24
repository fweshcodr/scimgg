import { PRAYER_STAT_MULTIPLIERS, type PrayerType } from '../../types/simulation';
import { DEFAULT_PRAYER_MULTIPLIERS, type PrayerMultipliers } from './formulaTypes';

export function lookupPrayerMultipliers(activePrayers: readonly (PrayerType | null | undefined)[]): PrayerMultipliers {
  let multipliers = DEFAULT_PRAYER_MULTIPLIERS;

  for (const prayer of activePrayers) {
    if (prayer === null || prayer === undefined) continue;
    const boost = PRAYER_STAT_MULTIPLIERS[prayer];
    if (boost === undefined) continue;
    multipliers = {
      attack: Math.max(multipliers.attack, boost.attack ?? multipliers.attack),
      strength: Math.max(multipliers.strength, boost.strength ?? multipliers.strength),
      defence: Math.max(multipliers.defence, boost.defence ?? multipliers.defence),
      ranged: Math.max(multipliers.ranged, boost.ranged ?? multipliers.ranged),
      rangedStrength: Math.max(multipliers.rangedStrength, boost.rangedStrength ?? multipliers.rangedStrength),
      magic: Math.max(multipliers.magic, boost.magic ?? multipliers.magic),
      magicDamage: Math.max(multipliers.magicDamage, boost.magicDamage ?? multipliers.magicDamage),
    };
  }

  return multipliers;
}

export function lookupPrayerMultipliersFromState(
  activePrayer: PrayerType | null,
  offensivePrayer: PrayerType | null,
): PrayerMultipliers {
  return lookupPrayerMultipliers([activePrayer, offensivePrayer]);
}
