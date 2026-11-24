import { describe, expect, it } from 'vitest';
import {
  findEquipmentCatalogItem,
  getCanonicalEquipmentItemId,
  getEquipmentCatalog,
  resolveEquipmentItemName,
} from '../equipmentCatalog';

describe('equipmentCatalog', () => {
  it.each([
    [33639, 'null', 'Necklace of rupture'],
    [33639, '', 'Necklace of rupture'],
    [33639, undefined, 'Necklace of rupture'],
    [33639, 'Cache name', 'Cache name'],
    [-1, 'null', 'Item'],
    [-1, 'Shark', 'Shark'],
  ] as const)('resolves item %i with cache name %s', (itemId, cacheName, expected) => {
    const name = resolveEquipmentItemName(itemId, cacheName);

    expect(name).toBe(expected);
  });

  it('expands generated id groups into unique catalog entries', () => {
    const catalog = getEquipmentCatalog();

    expect(catalog.length).toBeGreaterThan(5_000);
    expect(new Set(catalog.map((item) => item.id)).size).toBe(catalog.length);
  });

  it('normalizes two-handed equipment into the weapon slot', () => {
    expect(findEquipmentCatalogItem(20997)).toMatchObject({
      name: 'Twisted bow',
      slot: 'weapon',
      isTwoHanded: true,
    });
  });

  it('keeps one-handed weapons distinct from two-handed weapons', () => {
    expect(findEquipmentCatalogItem(9185)).toMatchObject({
      name: 'Rune crossbow',
      slot: 'weapon',
      isTwoHanded: false,
    });
  });

  it('includes manual repairs omitted from generated rows', () => {
    expect(findEquipmentCatalogItem(28951)).toMatchObject({ name: "Dizana's quiver", slot: 'cape' });
  });

  // The wiki lists broken copies on the wearable item's page, at a lower id. They cannot be
  // equipped (no worn model, no bonuses in the cache), and as a family's canonical id the picker
  // equipped them in place of the real item. The sync drops every id the cache cannot equip.
  it.each([
    [28828, 28957, 28955], // Blessed Dizana's quiver
    [28830, 28906, 28902], // Dizana's max cape
    [21287, 24224, 21295], // Infernal cape
    [28238, 28473, 28260], // Blood ancient sceptre
    [21841, 21847, 21847], // Snow imp costume head: event copy is unwearable, reward copy is not
  ])('drops unequippable %i and resolves %i to the wearable %i', (unwearableId, variantId, wearableId) => {
    expect(findEquipmentCatalogItem(unwearableId)).toBeUndefined();
    expect(getCanonicalEquipmentItemId(variantId)).toBe(wearableId);
    expect(getCanonicalEquipmentItemId(wearableId)).toBe(wearableId);
  });
});
