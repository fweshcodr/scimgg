import { describe, expect, it } from 'vitest';
import { isAmmoCompatible } from '../../core/combat/ammoCompatibility';
import { canCastSpell } from '../../core/combat/runeAvailability';
import type { EncounterPreset } from '../../types/player';
import { findEquipmentCatalogItem } from '../equipmentCatalog';
import { describeWeaponVerificationGaps } from '../equipmentSupport';
import { findInventoryItem } from '../inventoryItemCatalog';
import { EQUIPMENT_PRESETS } from '../playerPresets';

const YAMA_PRESETS = [
  { encounter: 'yama_p3', key: 'max-mage' },
  { encounter: 'yama_p3', key: 'melee' },
  { encounter: 'yama_p3', key: 'hybrid' },
  { encounter: 'yama_p3', key: 'learner-mage' },
  { encounter: 'yama_p3_forfeit_breath', key: 'mage' },
  { encounter: 'yama_p3_glyphic', key: 'melee' },
  { encounter: 'yama_p3_sensory', key: 'mage' },
  { encounter: 'yama_p3_divine', key: 'mage' },
  { encounter: 'yama_p3_bloodied', key: 'mage' },
] as const;

type YamaPreset = (typeof YAMA_PRESETS)[number];

/** The only verification gaps a Yama set may carry; each is explained beside the item in the preset. */
const ACCEPTED_WEAPON_GAPS: Readonly<Record<number, readonly string[]>> = {
  24417: ['Spike attacks unverified.'], // Inquisitor's mace: Glyphic leaves its stab style unused
  27665: ['Landed attacks unverified.'], // Accursed sceptre: carried for its verified Condemn special
};

const RESTORES: ReadonlySet<number> = new Set([3024, 10925]); // Super restore(4), Sanfew serum(4)
const BREWS: ReadonlySet<number> = new Set([6685, 29183]); // Saradomin brew(4), Snowy knight mix(2)

/** Zig-zag click order for a two-row switch: down column 1, across to row 1 of column 2, down again. */
const ZIG_ZAG = [0, 4, 1, 5, 2, 6, 3, 7] as const;

function presetOf({ encounter, key }: YamaPreset): EncounterPreset {
  return EQUIPMENT_PRESETS[encounter][key];
}

function itemName(id: number): string | undefined {
  return findInventoryItem(id)?.name ?? findEquipmentCatalogItem(id)?.name;
}

function names(entry: YamaPreset, slots: readonly number[]): (string | undefined)[] {
  const inventory = presetOf(entry).inventory;
  return slots.map((slot) => {
    const item = inventory[slot];
    return item ? itemName(item.id) : undefined;
  });
}

/** Names from slot 28 backwards, as far as `count` slots. */
function tail(entry: YamaPreset, count: number): (string | undefined)[] {
  return names(
    entry,
    Array.from({ length: count }, (_, index) => 27 - index),
  );
}

const label = ({ encounter, key }: YamaPreset) => `${encounter}/${key}`;
const CASES = YAMA_PRESETS.map((entry) => ({ ...entry, label: label(entry) }));
const find = (encounter: YamaPreset['encounter'], key: string) =>
  CASES.find((entry) => entry.encounter === encounter && entry.key === key)!;

describe('Yama loadouts', () => {
  it('keeps the four base presets, one per contract, and the automatic fallbacks', () => {
    expect(Object.keys(EQUIPMENT_PRESETS.yama_p3)).toEqual(['max-mage', 'melee', 'hybrid', 'learner-mage', 'naked']);
    for (const encounter of new Set(YAMA_PRESETS.map((entry) => entry.encounter))) {
      expect(EQUIPMENT_PRESETS[encounter].naked.isFallback).toBe(true);
    }
    for (const encounter of [
      'yama_p3_forfeit_breath',
      'yama_p3_glyphic',
      'yama_p3_sensory',
      'yama_p3_divine',
      'yama_p3_bloodied',
    ]) {
      expect(Object.keys(EQUIPMENT_PRESETS[encounter])).toHaveLength(2);
    }
  });

  it.each(CASES)('$label has cataloged gear and inventory, fits in 28 slots, and is usable at 99', (entry) => {
    const preset = presetOf(entry);
    expect(preset.inventory).toHaveLength(28);
    for (const [slot, id] of Object.entries(preset.equipment)) {
      expect(findEquipmentCatalogItem(id as number), `equipment ${slot} (${id})`).toBeDefined();
    }
    for (const item of preset.inventory) {
      if (item) expect(itemName(item.id), `inventory item ${item.id}`).toBeDefined();
    }
    for (const supply of [
      preset.supplies?.equippedAmmo,
      preset.supplies?.quiverAmmo,
      preset.supplies?.blowpipe,
      ...(preset.supplies?.runePouch?.slots ?? []),
    ]) {
      if (supply) expect(itemName(supply.id), `supply ${supply.id}`).toBeDefined();
    }
    for (const [stat, required] of Object.entries(preset.requirements ?? {})) {
      expect(required, `requires ${required} ${stat}`).toBeLessThanOrEqual(99);
    }
  });

  it.each(CASES)('$label has only verified weapons, bar the accepted gaps', (entry) => {
    const preset = presetOf(entry);
    const weapons = [
      preset.equipment.weapon,
      ...preset.inventory.map((item) => item?.id).filter((id) => findEquipmentCatalogItem(id ?? -1)?.slot === 'weapon'),
    ];
    for (const id of weapons) {
      expect(describeWeaponVerificationGaps(id as number), `weapon ${id}`).toEqual(ACCEPTED_WEAPON_GAPS[id!] ?? []);
    }
  });

  it.each(CASES)('$label leaves one free slot only when a two-handed switch drops the off-hand', (entry) => {
    const preset = presetOf(entry);
    const dropsOffHand =
      preset.equipment.shield !== undefined &&
      preset.inventory.some((item) => item && findEquipmentCatalogItem(item.id)?.isTwoHanded);
    // No contract placeholder: a contract is used up when the fight starts.
    expect(preset.inventory.filter((item) => item === null)).toHaveLength(dropsOffHand ? 1 : 0);
  });

  it.each(CASES)('$label keeps restores in columns 3-4 and brews in columns 1-2', (entry) => {
    presetOf(entry).inventory.forEach((item, slot) => {
      const column = slot % 4;
      if (item && RESTORES.has(item.id)) expect(column, `restore in slot ${slot + 1}`).toBeGreaterThanOrEqual(2);
      if (item && BREWS.has(item.id)) expect(column, `brew in slot ${slot + 1}`).toBeLessThan(2);
    });
  });

  it.each(CASES)('$label casts from the Arceuus divine pouch and can Dark Demonbane the void flares', (entry) => {
    const preset = presetOf(entry);
    expect(preset.supplies?.spellbook).toBe('arceuus');
    expect(preset.supplies?.runePouch?.kind).toBe('divine');
    expect(preset.supplies?.blowpipe).toBeNull();
    expect(preset.supplies?.quiverAmmo).toBeNull();
    const ctx = {
      equipment: preset.equipment,
      inventory: preset.inventory,
      runePouch: preset.supplies?.runePouch ?? null,
      magicLevel: 99,
    };
    expect(canCastSpell('Dark Demonbane', ctx)).toBe(true);
    // Ammo only where a bow is carried, and then ammo the bow fires.
    const bow = preset.inventory.find((item) => item?.id === 29591);
    if (bow) {
      expect(isAmmoCompatible(29591, preset.supplies?.equippedAmmo?.id ?? -1)).toBe(true);
    } else {
      expect(preset.supplies?.equippedAmmo).toBeNull();
    }
  });

  it.each(CASES)('$label keeps the pouch and Book of the dead bottom-right', (entry) => {
    expect(tail(entry, 2)).toEqual(['Divine rune pouch', 'Book of the Dead']);
  });

  describe('base fight', () => {
    it('max mage wears the mage gear and leaves the shadow switch a free slot for the ward', () => {
      const entry = find('yama_p3', 'max-mage');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29594, shield: 27251, body: 21021, ring: 28313 });
      expect(names(entry, [0, 1])).toEqual(["Tumeken's shadow", 'Saradomin godsword']);
      // The ward drops into the first free slot: the next zig-zag stop after the one-piece switch.
      expect(presetOf(entry).inventory.indexOf(null)).toBe(ZIG_ZAG[1]);
      expect(tail(entry, 3)).toEqual(['Divine rune pouch', 'Book of the Dead', 'Saturated heart']);
    });

    it('melee wears the melee gear, zig-zags the magic switch and leaves the next stop for the defender', () => {
      const entry = find('yama_p3', 'melee');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29589, shield: 22322, body: 30779 });
      expect(names(entry, ZIG_ZAG.slice(0, 3))).toEqual(['Purging staff', 'Occult necklace', 'Confliction gauntlets']);
      expect(presetOf(entry).inventory.indexOf(null)).toBe(ZIG_ZAG[3]);
      expect(names(entry, [2, 3, 6, 7])).toEqual([
        'Elder maul',
        'Burning claws',
        'Saradomin godsword',
        'Divine super combat potion(4)',
      ]);
    });

    it('hybrid wears the melee gear and fills rows 1-2 with the magic switch in zig-zag order', () => {
      const entry = find('yama_p3', 'hybrid');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29589, shield: 22322, body: 30779 });
      expect(names(entry, ZIG_ZAG)).toEqual([
        'Purging staff',
        'Occult necklace',
        'Confliction gauntlets',
        'Ancestral robe top',
        'Ancestral robe bottom',
        'Imbued Saradomin cape',
        'Magus ring',
        'Ancestral hat',
      ]);
      // Row 3: the defender's free slot (the next zig-zag stop), the specials, then the shadow in column 4.
      expect(presetOf(entry).inventory.indexOf(null)).toBe(8);
      expect(names(entry, [9, 10, 11])).toEqual(['Elder maul', 'Saradomin godsword', "Tumeken's shadow"]);
      expect(tail(entry, 3)).toEqual(['Divine rune pouch', 'Book of the Dead', 'Saturated heart']);
    });

    it('learner wears the mage gear and carries supplies only', () => {
      const entry = find('yama_p3', 'learner-mage');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29594, shield: 6889, body: 29013 });
      expect(names(entry, [0, 1, 2, 3])).toEqual([
        'Saradomin brew(4)',
        'Saradomin brew(4)',
        'Super restore(4)',
        'Super restore(4)',
      ]);
      expect(tail(entry, 3)).toEqual(['Divine rune pouch', 'Book of the Dead', 'Antidote++(4)']);
    });
  });

  describe('contracts', () => {
    it('Forfeit Breath answers the run-energy drain with energy potions and a Ring of endurance', () => {
      const entry = find('yama_p3_forfeit_breath', 'mage');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29594, ring: 24736 });
      expect(names(entry, [0, 3])).toEqual(['Saradomin godsword', 'Eye of Ayak']);
      expect(presetOf(entry).inventory.indexOf(null)).toBe(ZIG_ZAG[1]);
      // The run-energy potions are the first supplies.
      expect(names(entry, [1, 2, 5, 6])).toEqual([
        'Extended stamina potion(4)',
        'Extreme energy potion(4)',
        'Extreme energy potion(4)',
        'Extreme energy potion(4)',
      ]);
      expect(tail(entry, 4)).toEqual(['Divine rune pouch', 'Book of the Dead', 'Saturated heart', 'Nature rune']);
    });

    it('Glyphic Attenuation wears a crush weapon and carries the crush special', () => {
      const entry = find('yama_p3_glyphic', 'melee');
      const preset = presetOf(entry);
      expect(preset.equipment).toMatchObject({ weapon: 24417, shield: 22322 });
      expect(itemName(preset.equipment.weapon!)).toBe("Inquisitor's mace");
      expect(names(entry, [0, 1, 3])).toEqual(['Elder maul', 'Saradomin godsword', 'Purging staff']);
      expect(preset.inventory.indexOf(null)).toBe(ZIG_ZAG[1]);
    });

    it('Sensory Clouding carries the Scorching bow bind in column 4, with arrows it fires', () => {
      const entry = find('yama_p3_sensory', 'mage');
      const preset = presetOf(entry);
      expect(preset.equipment).toMatchObject({ weapon: 29594, ring: 25975 });
      expect(names(entry, [0, 1, 3])).toEqual(['Saradomin godsword', 'Accursed sceptre', 'Scorching bow']);
      // The bow is two-handed: the ward drops into the slot below the specials.
      expect(preset.inventory.indexOf(null)).toBe(ZIG_ZAG[1]);
      expect(preset.supplies?.equippedAmmo).toEqual({ id: 11212 });
      expect(tail(entry, 4)).toEqual(['Divine rune pouch', 'Book of the Dead', 'Saturated heart', 'Nature rune']);
    });

    it('Divine Severance carries the Condemn sceptre beside the Demonbane staff', () => {
      const entry = find('yama_p3_divine', 'mage');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29594, shield: 27251 });
      expect(names(entry, [0, 1])).toEqual(['Saradomin godsword', 'Accursed sceptre']);
      expect(presetOf(entry).inventory.indexOf(null)).toBe(ZIG_ZAG[1]);
      expect(tail(entry, 4)).toEqual(['Divine rune pouch', 'Book of the Dead', 'Saturated heart', 'Nature rune']);
    });

    it('Bloodied Blows carries the Locator orb and rock cake that hold hitpoints low', () => {
      const entry = find('yama_p3_bloodied', 'mage');
      expect(presetOf(entry).equipment).toMatchObject({ weapon: 29594, shield: 27251 });
      expect(names(entry, [0, 3])).toEqual(['Saradomin godsword', 'Eye of Ayak']);
      expect(presetOf(entry).inventory.indexOf(null)).toBe(ZIG_ZAG[1]);
      expect(tail(entry, 6)).toEqual([
        'Divine rune pouch',
        'Book of the Dead',
        'Saturated heart',
        'Nature rune',
        'Dwarven rock cake',
        'Locator orb',
      ]);
    });
  });
});
