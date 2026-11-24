import { describe, expect, it } from 'vitest';
import { findInventoryItem, getInventoryCatalog } from '../inventoryItemCatalog';
import { ITEM_ACTIONS } from '../itemEffects';
import { EQUIPMENT_PRESETS } from '../playerPresets';
import { isRunePouchItem, SUPPORTED_RUNES } from '../runePouch';

describe('inventoryItemCatalog', () => {
  it('groups drinks by item presentation rather than their eating cooldown', () => {
    expect(findInventoryItem(4417)?.category).toBe('potions');
    expect(findInventoryItem(3144)?.category).toBe('food');
    expect(findInventoryItem(22081)?.category).toBe('other');
    expect(findInventoryItem(20997)?.category).toBe('gear');
  });
  it('offers every consumable the engine simulates', () => {
    const offered = new Set(getInventoryCatalog().map((item) => item.id));
    const missing = Object.keys(ITEM_ACTIONS)
      .map(Number)
      .filter((id) => !offered.has(id));

    expect(missing).toEqual([]);
  });

  it('names consumables the way the game does', () => {
    expect(findInventoryItem(13441)?.name).toBe('Anglerfish');
    expect(findInventoryItem(6685)?.name).toBe('Saradomin brew(4)');
    expect(findInventoryItem(6691)?.name).toBe('Saradomin brew(1)');
    expect(findInventoryItem(229)?.name).toBe('Vial');
  });

  it('carries gear too, because a loadout brings switches as well as supplies', () => {
    expect(findInventoryItem(20997)?.name).toBe('Twisted bow');
  });

  it('includes Eclipse atlatl among verified inventory switches', () => {
    expect(getInventoryCatalog().filter((item) => item.verified)).toContainEqual(
      expect.objectContaining({ id: 29000, category: 'gear', verified: true }),
    );
  });

  it('has nothing to say about an item outside both catalogs', () => {
    expect(findInventoryItem(999999)).toBeUndefined();
  });

  it('reads in name order, with no id offered twice', () => {
    const items = getInventoryCatalog();
    const sorted = [...items].sort((left, right) => left.name.localeCompare(right.name));

    expect(items.map((item) => item.name)).toEqual(sorted.map((item) => item.name));
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });

  it('names both rune pouches rather than showing them as unsupported items', () => {
    expect(findInventoryItem(12791)).toEqual({ id: 12791, name: 'Rune pouch', verified: true, category: 'runes' });
    expect(findInventoryItem(27281)).toEqual({
      id: 27281,
      name: 'Divine rune pouch',
      verified: true,
      category: 'runes',
    });
  });

  it('names every rune a pouch can hold, because a loose rune is a loadout item too', () => {
    for (const rune of SUPPORTED_RUNES) {
      expect(findInventoryItem(rune.id), `rune ${rune.id} is not in the inventory catalog`).toEqual({
        id: rune.id,
        name: rune.name,
        category: 'runes',
        verified: true,
      });
    }
    expect(findInventoryItem(560)?.name).toBe('Death rune');
    expect(findInventoryItem(30843)?.name).toBe('Aether rune');
  });

  // Scoped to pouches and runes: widening it to every preset inventory id would collide
  // with the surge-potion gap above, which is deliberate.
  it('names every pouch and rune the shipped sets place', () => {
    const uncataloged: string[] = [];
    for (const [encounter, presets] of Object.entries(EQUIPMENT_PRESETS)) {
      for (const [key, preset] of Object.entries(presets)) {
        const packed = (preset.supplies?.runePouch?.slots ?? []).flatMap((slot) => (slot ? [slot.id] : []));
        const carried = preset.inventory.flatMap((slot) => (slot && isRunePouchItem(slot.id) ? [slot.id] : []));
        for (const id of [...carried, ...packed]) {
          if (findInventoryItem(id)?.verified !== true) uncataloged.push(`${encounter}/${key}: ${id}`);
        }
      }
    }

    expect(uncataloged).toEqual([]);
  });
});
