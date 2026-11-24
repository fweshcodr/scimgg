import { describe, expect, it } from 'vitest';
import { findEquipmentCatalogItem } from '../equipmentCatalog';
import { findInventoryItem } from '../inventoryItemCatalog';
import { EQUIPMENT_PRESETS } from '../playerPresets';

const SOL_KEYS = ['max', 'mid', 'budget', 'ironman'] as const;

function inventoryName(key: (typeof SOL_KEYS)[number], slot: number): string | undefined {
  const item = EQUIPMENT_PRESETS.sol_heredit[key].inventory[slot];
  return item ? (findInventoryItem(item.id)?.name ?? findEquipmentCatalogItem(item.id)?.name) : undefined;
}

describe('Sol Heredit loadouts', () => {
  it('offers only four real presets and the automatic fallback', () => {
    expect(Object.keys(EQUIPMENT_PRESETS.sol_heredit)).toEqual(['max', 'mid', 'budget', 'ironman', 'naked']);
    expect(EQUIPMENT_PRESETS.sol_heredit.naked.isFallback).toBe(true);
  });

  it.each(SOL_KEYS)('%s has cataloged gear and inventory, fits in 28 slots, and is usable at 99', (key) => {
    const preset = EQUIPMENT_PRESETS.sol_heredit[key];
    expect(preset.inventory).toHaveLength(28);
    expect(preset.inventory.filter(Boolean).length).toBeLessThanOrEqual(28);
    expect(preset.equipment.weapon).toBeDefined();
    for (const [slot, id] of Object.entries(preset.equipment)) {
      expect(findEquipmentCatalogItem(id as number), `${key} equipment ${slot} (${id})`).toBeDefined();
    }
    for (const item of preset.inventory) {
      if (!item) continue;
      expect(
        findInventoryItem(item.id) ?? findEquipmentCatalogItem(item.id),
        `${key} inventory item ${item.id}`,
      ).toBeDefined();
    }
    for (const supply of [
      preset.supplies?.equippedAmmo,
      preset.supplies?.quiverAmmo,
      preset.supplies?.blowpipe,
      ...(preset.supplies?.runePouch?.slots ?? []),
    ]) {
      if (supply) expect(findInventoryItem(supply.id) ?? findEquipmentCatalogItem(supply.id)).toBeDefined();
    }
    for (const [stat, required] of Object.entries(preset.requirements ?? {})) {
      expect(required, `${key} requires ${required} ${stat}`).toBeLessThanOrEqual(99);
    }
  });

  /** Zig-zag click order for a two-row switch: down column 1, across to row 1 of column 2, down again. */
  const ZIG_ZAG = [0, 4, 1, 5, 2, 6, 3, 7] as const;
  const names = (key: (typeof SOL_KEYS)[number], slots: readonly number[]) =>
    slots.map((slot) => inventoryName(key, slot));

  it('max wears the chosen melee gear and lays the twisted bow switch out in zig-zag order', () => {
    const preset = EQUIPMENT_PRESETS.sol_heredit.max;
    expect(preset.equipment).toMatchObject({
      head: 28254,
      cape: 21295,
      amulet: 29804,
      weapon: 22325,
      body: 30779,
      legs: 30781,
      hands: 22981,
      boots: 31097,
      ring: 28307,
    });
    expect(names('max', ZIG_ZAG.slice(0, 6))).toEqual([
      'Twisted bow',
      'Necklace of rupture',
      'Masori body (f)',
      'Masori chaps (f)',
      "Dizana's quiver",
      'Zaryte vambraces',
    ]);
    // Off-style weapons sit outside the zig-zag, in column 4.
    expect(names('max', [3, 7])).toEqual(['Venator bow', 'Eye of Ayak']);
    expect(names('max', [8, 9, 10, 11])).toEqual([
      'Dragon claws',
      'Saradomin godsword',
      'Elder maul',
      'Amulet of blood fury',
    ]);
    expect(preset.supplies?.equippedAmmo).toEqual({ id: 33595 });
    expect(preset.supplies?.quiverAmmo).toEqual({ id: 33595 });
  });

  it('mid lays the Bow of Faerdhinen switch out in zig-zag order, then the off-weapons', () => {
    const preset = EQUIPMENT_PRESETS.sol_heredit.mid;
    expect(preset.equipment).toMatchObject({ weapon: 28338, ring: 28307, boots: 13239 });
    expect(names('mid', ZIG_ZAG.slice(0, 6))).toEqual([
      'Bow of Faerdhinen',
      'Crystal body',
      'Crystal legs',
      'Necklace of anguish',
      'Crystal helm',
      'Toxic blowpipe',
    ]);
    expect(names('mid', [3, 7, 8, 9])).toEqual([
      'Eye of Ayak',
      'Dragon warhammer',
      'Dragon claws',
      'Saradomin godsword',
    ]);
    expect(preset.supplies?.equippedAmmo).toEqual({ id: 22947 });
    expect(preset.supplies?.blowpipe).toEqual({ id: 11230 });
  });

  it('budget zig-zags the Bowfa switch and leaves the next stop free for the defender', () => {
    const preset = EQUIPMENT_PRESETS.sol_heredit.budget;
    expect(names('budget', ZIG_ZAG.slice(0, 5))).toEqual([
      'Bow of Faerdhinen',
      'Crystal body',
      'Crystal legs',
      'Necklace of anguish',
      'Crystal helm',
    ]);
    expect(names('budget', [3, 7, 8])).toEqual(['Trident of the Swamp', 'Toxic blowpipe', 'Dragon warhammer']);
    // The dragon defender drops into the first free slot when the two-handed bow is equipped: the
    // next zig-zag stop after the five-piece ranged cluster, so swapping back ends on it.
    expect(preset.inventory.indexOf(null)).toBe(ZIG_ZAG[5]);
    expect(preset.inventory.filter((item) => item === null)).toHaveLength(1);
    expect(preset.equipment).toMatchObject({ shield: 12954, boots: 11840, weapon: 12006 });
    expect(names('budget', [9, 10, 11])).toEqual(["Osmumten's fang", 'Dragon claws', 'Saradomin godsword']);
    expect(preset.supplies?.blowpipe).toEqual({ id: 11230 });
  });

  it('ironman zig-zags the Bowfa switch without zenyte jewellery and leaves the next stop free for the defender', () => {
    const preset = EQUIPMENT_PRESETS.sol_heredit.ironman;
    expect(names('ironman', ZIG_ZAG.slice(0, 4))).toEqual([
      'Bow of Faerdhinen',
      'Crystal body',
      'Crystal legs',
      'Crystal helm',
    ]);
    expect(names('ironman', [3, 6, 7, 8, 9])).toEqual([
      'Trident of the Swamp',
      'Toxic blowpipe',
      'Dragon warhammer',
      'Burning claws',
      'Saradomin godsword',
    ]);
    // The four-piece ranged cluster ends at slot 6; the next zig-zag stop takes the dropped defender.
    expect(preset.inventory.indexOf(null)).toBe(ZIG_ZAG[4]);
    expect(preset.inventory.filter((item) => item === null)).toHaveLength(1);
    expect(preset.equipment).toMatchObject({ shield: 12954, boots: 11840, weapon: 28810, cape: 6570, amulet: 1712 });
    const ids = [...preset.inventory.map((item) => item?.id), ...Object.values(preset.equipment)];
    // Ironman tier: no blood fury (irons are "limited on blood shards"), no late-game fang, and no
    // zenyte jewellery (98 Crafting): the worn Amulet of glory serves every style.
    for (const lateGame of [24780, 26219, 19547, 19553, 19544, 19550, 29804]) expect(ids).not.toContain(lateGame);
    expect(preset.supplies?.blowpipe).toEqual({ id: 25849 });
    expect(preset.supplies?.equippedAmmo).toEqual({ id: 22945 });
  });

  it('puts the rune pouch bottom-right, Sanfew before it, and supplies below the switches', () => {
    for (const key of SOL_KEYS) {
      const preset = EQUIPMENT_PRESETS.sol_heredit[key];
      expect(preset.inventory[27]?.id).toBe(key === 'ironman' ? 12791 : 27281);
      expect(preset.inventory[26]?.id).toBe(10925);
      const firstSupply = preset.inventory.findIndex((item) => item?.id === 6685 || item?.id === 3024);
      expect(firstSupply).toBeGreaterThanOrEqual(12);
      expect(preset.supplies?.spellbook).toBe('arceuus');
      expect(preset.supplies?.runePouch?.kind).toBe(key === 'ironman' ? 'standard' : 'divine');
    }
  });
});
