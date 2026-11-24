import { CUSTOMIZABLE_GEAR_SLOTS, getGearCatalog } from './customEquipmentPresets';
import { INFOBOX_ITEM_IDS } from './infoboxItemIds';
import { getInventoryCatalog } from './inventoryItemCatalog';
import { ITEM_ACTIONS } from './itemEffects';
import { EQUIPMENT_PRESETS } from './playerPresets';

/**
 * Every item id a surface can ask {@link getItemSpriteUrl} for, ascending.
 *
 * Sole input to `scripts/fetch-item-icons.ts`, which mirrors these sprites into
 * `public/assets/items/`. There is no runtime fallback to an upstream CDN, so an id
 * reachable by the UI but absent from this union renders a broken image — which is why
 * every source here is a catalog the pickers themselves read.
 */
export function collectItemIconIds(): number[] {
  const ids = new Set<number>();

  const add = (id: unknown) => {
    if (typeof id === 'number' && id > 0) ids.add(id);
  };

  for (const slot of CUSTOMIZABLE_GEAR_SLOTS) {
    for (const item of getGearCatalog(slot)) add(item.id);
  }

  for (const item of getInventoryCatalog()) add(item.id);

  for (const [id, action] of Object.entries(ITEM_ACTIONS)) {
    add(Number(id));
    if (action.consume.type === 'replace') add(action.consume.withId);
  }

  for (const encounterPresets of Object.values(EQUIPMENT_PRESETS)) {
    for (const preset of Object.values(encounterPresets)) {
      for (const itemId of Object.values(preset.equipment)) add(itemId);
      for (const slot of preset.inventory) add(slot?.id);
    }
  }

  for (const id of Object.values(INFOBOX_ITEM_IDS)) add(id);

  return [...ids].sort((a, b) => a - b);
}
