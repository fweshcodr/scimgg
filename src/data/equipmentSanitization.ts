import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import { type EquipmentSlot, findEquipmentCatalogItem } from './equipmentCatalog';

export const CUSTOMIZABLE_GEAR_SLOTS = [
  'head',
  'cape',
  'amulet',
  'weapon',
  'body',
  'shield',
  'legs',
  'hands',
  'boots',
  'ring',
] as const satisfies readonly (keyof PlayerEquipment)[];

export type CustomizableGearSlot = (typeof CUSTOMIZABLE_GEAR_SLOTS)[number];

export const CATALOG_SLOT_BY_GEAR_SLOT: Record<CustomizableGearSlot, EquipmentSlot> = {
  head: 'head',
  cape: 'cape',
  amulet: 'neck',
  weapon: 'weapon',
  body: 'body',
  shield: 'shield',
  legs: 'legs',
  hands: 'hands',
  boots: 'feet',
  ring: 'ring',
};

export function isTwoHandedWeapon(itemId: number | undefined): boolean {
  return itemId !== undefined && findEquipmentCatalogItem(itemId)?.isTwoHanded === true;
}

/**
 * Drop equipment ids the catalog cannot name at all.
 *
 * Deliberately keyed on catalog membership rather than on `verified`: a saved loadout or a
 * shipped preset may hold an unverified piece, and silently deleting the player's gear
 * because the simulator runs it imperfectly would be far worse than running it imperfectly.
 * The picker marks such a piece; it never removes it.
 */
export function sanitizeEquipmentAgainstCatalog(equipment: PlayerEquipment): PlayerEquipment {
  const sanitized: PlayerEquipment = {};
  for (const slot of CUSTOMIZABLE_GEAR_SLOTS) {
    const itemId = equipment[slot];
    if (itemId !== undefined && findEquipmentCatalogItem(itemId)?.slot === CATALOG_SLOT_BY_GEAR_SLOT[slot]) {
      sanitized[slot] = itemId;
    }
  }
  if (isTwoHandedWeapon(sanitized.weapon)) {
    delete sanitized.shield;
  }
  return sanitized;
}
