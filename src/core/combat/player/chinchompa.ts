import { getEquipmentCombatBaseId } from '../../../data/equipmentCombatFamilies';
import type { CombatStyle } from '../../../types/attackStyles';
import type { FormulaRatio } from '../playerAttackProfiles';
import type { AreaTargetSelection } from './spellAreaTargets';

/**
 * A thrown chinchompa explodes over the 3x3 around its primary target's true tile, hitting up to
 * `maxTargets` NPCs, the primary included, in multi-way combat. Each rule's source or status is in
 * docs/research/chinchompas.md.
 */
const CHINCHOMPA_AREAS: ReadonlyMap<number, AreaTargetSelection> = new Map([
  [10033, { radius: 1, maxTargets: 11 }], // Chinchompa
  [10034, { radius: 1, maxTargets: 11 }], // Red chinchompa
  [11959, { radius: 1, maxTargets: 12 }], // Black chinchompa
]);

export function getChinchompaArea(weaponId: number | undefined): AreaTargetSelection | undefined {
  return weaponId === undefined ? undefined : CHINCHOMPA_AREAS.get(getEquipmentCombatBaseId(weaponId));
}

/**
 * Each fuse's attack-roll percentage at 0-3, 4-6 and 7+ tiles from the target's nearest tile:
 * Short fuse (Accurate) favors close throws, Medium (Rapid) the middle band, Long (Longrange) far.
 */
const FUSE_ACCURACY_PERCENT: Readonly<Partial<Record<CombatStyle, readonly [number, number, number]>>> = {
  Accurate: [100, 75, 50],
  Rapid: [75, 100, 75],
  Longrange: [50, 75, 100],
};

/**
 * The fuse's distance modifier as one more attack-roll stage, or null at 100%. Like every other
 * stage it floors, `floor(roll * percent / 100)`; the rounding is our choice, not a cited one.
 */
export function chinchompaFuseAccuracy(
  weaponId: number | undefined,
  combatStyle: CombatStyle | undefined,
  distance: number,
): FormulaRatio | null {
  if (getChinchompaArea(weaponId) === undefined || combatStyle === undefined) return null;
  const percents = FUSE_ACCURACY_PERCENT[combatStyle];
  if (percents === undefined) return null;
  const percent = distance <= 3 ? percents[0] : distance <= 6 ? percents[1] : percents[2];
  return percent === 100 ? null : { numerator: percent, denominator: 100 };
}
