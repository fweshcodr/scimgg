import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { InventorySlot } from '../types/inventory';

const HOLY_WRENCH_ID = 6714;
const IMBUED_RING_OF_THE_GODS_IDS = [13202, 25252, 26764] as const;
const PRAYER_AND_MAX_CAPE_IDS = [9759, 9760, 13280, 13342] as const;

export const PRAYER_RESTORE_FORMULAS = {
  super_restore: { basePercent: 0.25, enhancedPercent: 0.27, flat: 8 },
  sanfew: { basePercent: 0.3, enhancedPercent: 0.32, flat: 4 },
  // /w/Prayer_potion: 7 + 25% of the Prayer level, or 27% with a holy wrench, prayer cape or ring of the gods (i).
  prayer_potion: { basePercent: 0.25, enhancedPercent: 0.27, flat: 7 },
  // https://oldschool.runescape.wiki/w/Forgotten_brew?oldid=15191164: 10% of base Prayer + 2. The
  // holy wrench family is not known to enhance it, so it keeps the unenhanced amount it always had.
  forgotten_brew: { basePercent: 0.1, enhancedPercent: 0.1, flat: 2 },
} as const;

export type PrayerRestoreFormula = keyof typeof PRAYER_RESTORE_FORMULAS;

export type PrayerRestorationSourceContext = {
  readonly equipment: Readonly<PlayerEquipment>;
  readonly inventory: readonly InventorySlot[];
};

function isEligibleCape(itemId: number | undefined): boolean {
  return itemId !== undefined && PRAYER_AND_MAX_CAPE_IDS.some((capeId) => capeId === itemId);
}

export function hasPrayerRestorationEnhancement({ equipment, inventory }: PrayerRestorationSourceContext): boolean {
  if (IMBUED_RING_OF_THE_GODS_IDS.some((ringId) => ringId === equipment.ring) || isEligibleCape(equipment.cape)) {
    return true;
  }

  return inventory.some((item) => item !== null && (item.id === HOLY_WRENCH_ID || isEligibleCape(item.id)));
}

export function prayerRestoreAmount(formula: PrayerRestoreFormula, prayerLevel: number, enhanced: boolean): number {
  const policy = PRAYER_RESTORE_FORMULAS[formula];
  const percent = enhanced ? policy.enhancedPercent : policy.basePercent;
  return Math.floor(prayerLevel * percent) + policy.flat;
}
