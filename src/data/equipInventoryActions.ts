/**
 * Inventory ops that put an item into an equipment slot, as the cache spells them. One set for
 * both the catalog (`scripts/sync-osrs-data.ts` drops a wearable id with none of these) and the
 * inventory's click handling, so nothing the pickers offer is left without a way to equip it.
 *
 * Surveyed over every cache item with a wear position (cache 2772, build 242): Wear, Wield and
 * Equip are the common labels; Hold (greegrees, handeggs) and Ride (sleds) are the rest. Labels
 * are matched rather than op slots: Wear and Wield also sit in op1 or op4 on some items. The
 * Hand fan's op2 "Chill" is left out, since nothing establishes that it equips the fan
 * (/w/Hand_fan lists only Chill and Destroy).
 *
 * Kept free of imports: the sync script reads it while regenerating the data that
 * `equipmentCatalog.ts` parses on load.
 */
export const EQUIP_INVENTORY_ACTIONS: ReadonlySet<string> = new Set(['Wear', 'Wield', 'Equip', 'Hold', 'Ride']);

/** Case-sensitive: cache op labels are capitalized, and the catalog filter matches them as such. */
export function isEquipInventoryAction(action: string | null | undefined): boolean {
  return action !== undefined && action !== null && EQUIP_INVENTORY_ACTIONS.has(action);
}
