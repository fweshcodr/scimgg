import { describe, expect, it } from 'vitest';
import { isAmmoCompatible, weaponRequiresExternalAmmo } from '../../core/combat/ammoCompatibility';
import { canCastSpell } from '../../core/combat/runeAvailability';
import { getDefaultAttackStyleIndex, getWeaponCategoryKey, resolveActiveSpell } from '../../types/attackStyles';
import { isDizanasQuiver } from '../dizanasQuiver';
import { findEquipmentCatalogItem } from '../equipmentCatalog';
import { describeWeaponVerificationGaps, getEquipmentVerificationStatus } from '../equipmentSupport';
import { findInventoryItem } from '../inventoryItemCatalog';
import { EQUIPMENT_PRESETS } from '../playerPresets';
import { COMBINATION_RUNE, RUNE } from '../spellRunes';

/** Wiki-sourced house sets: these follow every layout rule in docs/design/loadout-presets.md. */
const ZUK_KEYS = ['max_tbow', 'bowfa', 'atlatl_eclipse', 'budget_rcb', 'mage_tank'] as const;
/** Slot-for-slot replicas of community screenshots: exempt from the house layout rules. */
const COMMUNITY_KEYS = ['s65_ancients', 's50_ancients', 's45_arceuus', 'first_cape_tbow'] as const;
const ALL_KEYS = [...ZUK_KEYS, ...COMMUNITY_KEYS] as const;
type ZukKey = (typeof ALL_KEYS)[number];
const RANGED_KEYS = ZUK_KEYS.filter((key) => key !== 'mage_tank');

const SARADOMIN_BREW = 6685;
const SUPER_RESTORE = 3024;
const ELDRITCH_NIGHTMARE_STAFF = 24425;
/** Potions that are neither brew nor restore: they go before the brews. */
const BOOST_POTIONS = new Set([22461, 30125, 12625, 31638, 12695]);

/** Zig-zag click order for a two-row switch: down column 1, across to row 1 of column 2, down again. */
const ZIG_ZAG = [0, 4, 1, 5, 2, 6, 3, 7] as const;

const preset = (key: ZukKey) => EQUIPMENT_PRESETS.zuk[key];
const itemName = (id: number) => findInventoryItem(id)?.name ?? findEquipmentCatalogItem(id)?.name;
const names = (key: ZukKey, slots: readonly number[]) =>
  slots.map((slot) => {
    const item = preset(key).inventory[slot];
    return item ? itemName(item.id) : null;
  });
const carriedIds = (key: ZukKey) => preset(key).inventory.flatMap((slot) => (slot ? [slot.id] : []));
const slotsOf = (key: ZukKey, id: number) =>
  preset(key).inventory.flatMap((slot, index) => (slot?.id === id ? [index] : []));
const weaponIds = (key: ZukKey) =>
  [preset(key).equipment.weapon, ...carriedIds(key)].filter(
    (id): id is number => id !== undefined && findEquipmentCatalogItem(id)?.slot === 'weapon',
  );

describe('Zuk loadouts', () => {
  it('keeps the house sets first, then the community replicas, with the automatic fallback last', () => {
    expect(Object.keys(EQUIPMENT_PRESETS.zuk)).toEqual([...ALL_KEYS, 'naked']);
    expect(ALL_KEYS.map((key) => preset(key).name)).toEqual([
      'Max Tbow',
      'Bowfa',
      'Atlatl / RCB (Eclipse)',
      'Budget (Rune xbow)',
      'Mage Tank',
      'S65 Ancients',
      'S50 Ancients',
      'S45 Arceuus',
      'First cape: Tbow',
    ]);
    expect(EQUIPMENT_PRESETS.zuk.naked.isFallback).toBe(true);
  });

  it('lists the community replicas under the Speedrun section and the house sets unsectioned', () => {
    for (const key of ZUK_KEYS) expect(preset(key).section, key).toBeUndefined();
    for (const key of COMMUNITY_KEYS) expect(preset(key).section, key).toBe('Speedrun');
  });

  it.each(ALL_KEYS)('%s has cataloged gear, inventory and supplies, and is usable at 99', (key) => {
    const { equipment, inventory, supplies, requirements } = preset(key);
    expect(inventory).toHaveLength(28);
    for (const [slot, id] of Object.entries(equipment)) {
      expect(findEquipmentCatalogItem(id as number), `${key} equipment ${slot} (${id})`).toBeDefined();
    }
    for (const id of carriedIds(key)) expect(itemName(id), `${key} inventory item ${id}`).toBeDefined();
    for (const supply of [
      supplies?.equippedAmmo,
      supplies?.quiverAmmo,
      supplies?.blowpipe,
      ...(supplies?.runePouch?.slots ?? []),
    ]) {
      if (supply) expect(itemName(supply.id), `${key} supply ${supply.id}`).toBeDefined();
    }
    for (const [stat, required] of Object.entries(requirements ?? {})) {
      expect(required, `${key} requires ${required} ${stat}`).toBeLessThanOrEqual(99);
    }
  });

  it.each(ZUK_KEYS)('%s carries only verified weapons', (key) => {
    for (const id of weaponIds(key)) {
      expect(getEquipmentVerificationStatus({ id, slot: 'weapon' }), `${key} weapon ${id}`).not.toBe('unverified');
      // The atlatl's and the Eldritch staff's specials are their one accepted gap; no Zuk set relies on them.
      expect(describeWeaponVerificationGaps(id), `${key} weapon ${id}`).toEqual(
        id === 29000 || id === ELDRITCH_NIGHTMARE_STAFF ? ['Special attack unavailable.'] : [],
      );
    }
  });

  it('wears the main style: ranged for the ranged sets, Shadow and Ancestral for Mage Tank', () => {
    expect(RANGED_KEYS.map((key) => preset(key).equipment.weapon)).toEqual([20997, 25865, 9185, 9185]);
    for (const key of RANGED_KEYS) {
      expect(['bow', 'crossbow']).toContain(getWeaponCategoryKey(preset(key).equipment.weapon));
    }
    expect(preset('mage_tank').equipment).toMatchObject({ weapon: 27275, head: 21018, body: 21021, legs: 21024 });
  });
});

describe('Zuk threats', () => {
  it.each(ALL_KEYS)('%s can damage Zuk and the ranger and mager sets with its worn weapon', (key) => {
    const { equipment, supplies } = preset(key);
    const weapon = equipment.weapon ?? -1;
    expect(getEquipmentVerificationStatus({ id: weapon, slot: 'weapon' })).not.toBe('unverified');
    if (weaponRequiresExternalAmmo(weapon)) {
      const ammo = [supplies?.equippedAmmo?.id, supplies?.quiverAmmo?.id].filter((id) => id !== undefined);
      expect(ammo.some((id) => isAmmoCompatible(weapon, id as number))).toBe(true);
    }
  });

  it.each(ZUK_KEYS)('%s carries the prayer and healing to stand under Jad and the sets', (key) => {
    const ids = carriedIds(key);
    expect(ids.filter((id) => id === SUPER_RESTORE).length).toBeGreaterThanOrEqual(7);
    expect(ids.filter((id) => id === SARADOMIN_BREW).length).toBeGreaterThanOrEqual(7);
  });

  it.each(ZUK_KEYS)('%s can freeze the healers with its Ancient spell and a magic weapon', (key) => {
    const { equipment, inventory, supplies } = preset(key);
    const spell = supplies?.selectedSpell;
    expect(['Ice Barrage', 'Ice Burst']).toContain(spell);
    expect(supplies?.spellbook).toBe('ancient');
    const ctx = { equipment, inventory, runePouch: supplies?.runePouch ?? null, magicLevel: 99 };
    expect(canCastSpell(spell ?? '', ctx)).toBe(true);
    expect(weaponIds(key).some((id) => ['staff', 'powered_staff'].includes(getWeaponCategoryKey(id)))).toBe(true);
  });

  it('mage_tank carries the wiki Eldritch Nightmare staff to autocast its barrages', () => {
    const { equipment, inventory, supplies } = preset('mage_tank');
    expect(carriedIds('mage_tank')).toContain(ELDRITCH_NIGHTMARE_STAFF);
    // The Shadow and the Eye of Ayak fire their own built-in spells, so only the staff can barrage.
    const autocasters = weaponIds('mage_tank').filter((id) => getWeaponCategoryKey(id) === 'staff');
    expect(autocasters).toEqual([ELDRITCH_NIGHTMARE_STAFF]);
    const casting = getDefaultAttackStyleIndex(ELDRITCH_NIGHTMARE_STAFF, supplies?.spellbook);
    expect(
      resolveActiveSpell({
        weaponId: ELDRITCH_NIGHTMARE_STAFF,
        selectedStyleIndex: casting,
        selectedSpell: supplies?.selectedSpell,
        spellbook: supplies?.spellbook ?? 'standard',
      })?.name,
    ).toBe('Ice Barrage');
    // Wielded in the Shadow's place, the pouch alone pays for either barrage.
    const wielded = { ...equipment, weapon: ELDRITCH_NIGHTMARE_STAFF };
    const ctx = { equipment: wielded, inventory, runePouch: supplies?.runePouch ?? null, magicLevel: 99 };
    expect(canCastSpell('Ice Barrage', ctx)).toBe(true);
    expect(canCastSpell('Blood Barrage', ctx)).toBe(true);
  });

  it.each(ALL_KEYS)('%s can feed every ammo-using weapon it carries', (key) => {
    const { supplies } = preset(key);
    const ammo = [supplies?.equippedAmmo?.id, supplies?.quiverAmmo?.id, ...carriedIds(key)].filter(
      (id): id is number => id !== undefined,
    );
    for (const weapon of weaponIds(key)) {
      if (!weaponRequiresExternalAmmo(weapon)) continue;
      expect(
        ammo.some((id) => isAmmoCompatible(weapon, id)),
        `no ammo for ${weapon}`,
      ).toBe(true);
    }
    if (supplies?.quiverAmmo) expect(isDizanasQuiver(preset(key).equipment.cape)).toBe(true);
    if (carriedIds(key).some((id) => id === 12926 || id === 28688)) expect(supplies?.blowpipe).not.toBeNull();
  });

  it('keeps dragon bolts out of the rune crossbow sets', () => {
    // Ruby / Diamond dragon bolts (e) need a Dragon crossbow or better; a Rune crossbow cannot fire them.
    for (const key of ['atlatl_eclipse', 'budget_rcb'] as const) {
      const carried = [preset(key).supplies?.equippedAmmo?.id, ...carriedIds(key)];
      expect(carried).not.toContain(21944);
      expect(carried).not.toContain(21946);
    }
  });
});

describe('Zuk inventory layout', () => {
  it('max_tbow zig-zags the Kodai switch and keeps the blowpipe in column 4', () => {
    expect(names('max_tbow', ZIG_ZAG.slice(0, 5))).toEqual([
      'Kodai wand',
      'Confliction gauntlets',
      'Virtus robe top',
      'Virtus robe bottom',
      'Elysian spirit shield',
    ]);
    expect(names('max_tbow', [3])).toEqual(['Toxic blowpipe']);
    expect(preset('max_tbow').inventory).not.toContain(null);
  });

  it('bowfa zig-zags the Ancient sceptre switch and keeps the blowpipe in column 4', () => {
    expect(names('bowfa', ZIG_ZAG.slice(0, 5))).toEqual([
      'Ancient sceptre',
      'Occult necklace',
      "Ahrim's robetop",
      "Ahrim's robeskirt",
      'Crystal shield',
    ]);
    expect(names('bowfa', [3])).toEqual(['Toxic blowpipe']);
    expect(preset('bowfa').inventory).not.toContain(null);
  });

  it('atlatl_eclipse zig-zags the magic switch, then the atlatl and darts, and frees the next stop', () => {
    expect(names('atlatl_eclipse', ZIG_ZAG.slice(0, 6))).toEqual([
      'Master wand',
      'Occult necklace',
      "Ahrim's robetop",
      "Ahrim's robeskirt",
      'Eclipse atlatl',
      'Atlatl dart',
    ]);
    // The Crystal shield drops into the first free slot when a two-hander is wielded: the next
    // zig-zag stop, so swapping back ends on it. The blowpipe sits past it in column 4.
    expect(preset('atlatl_eclipse').inventory.indexOf(null)).toBe(ZIG_ZAG[6]);
    expect(preset('atlatl_eclipse').inventory.filter((item) => item === null)).toHaveLength(1);
    expect(names('atlatl_eclipse', [ZIG_ZAG[7]])).toEqual(['Toxic blowpipe']);
  });

  it('budget_rcb zig-zags the magic switch, frees the next stop, and keeps ranged swaps in column 4', () => {
    expect(names('budget_rcb', ZIG_ZAG.slice(0, 4))).toEqual([
      'Master wand',
      'Occult necklace',
      'Bloodbark body',
      'Bloodbark legs',
    ]);
    expect(preset('budget_rcb').inventory.indexOf(null)).toBe(ZIG_ZAG[4]);
    expect(preset('budget_rcb').inventory.filter((item) => item === null)).toHaveLength(1);
    expect(names('budget_rcb', [3, 7])).toEqual(['Toxic blowpipe', 'Diamond bolts (e)']);
  });

  it('mage_tank zig-zags the tank switch, keeps the Eldritch staff in column 4, and needs no free slot', () => {
    expect(names('mage_tank', ZIG_ZAG.slice(0, 5))).toEqual([
      'Eye of Ayak',
      'Bandos chestplate',
      "Verac's plateskirt",
      'Justiciar faceguard',
      "Elidinis' ward (f)",
    ]);
    expect(slotsOf('mage_tank', ELDRITCH_NIGHTMARE_STAFF)).toEqual([3]);
    expect(preset('mage_tank').equipment.shield).toBeUndefined();
    expect(preset('mage_tank').inventory).not.toContain(null);
  });

  it.each(ZUK_KEYS)('%s puts its utilities bottom-right', (key) => {
    const { inventory } = preset(key);
    // The Ice Burst sets carry a standard pouch; the Ice Barrage sets a divine one.
    const burst = key === 'atlatl_eclipse' || key === 'budget_rcb';
    expect(inventory[27]?.id).toBe(burst ? 12791 : 27281);
    if (key === 'mage_tank') expect(inventory[26]?.id).toBe(27641);
  });

  it.each(ZUK_KEYS)('%s keeps brews in columns 1-2 and restores in columns 3-4, after the boosts', (key) => {
    const brews = slotsOf(key, SARADOMIN_BREW);
    const restores = slotsOf(key, SUPER_RESTORE);
    for (const slot of brews) expect(slot % 4, `${key} brew in slot ${slot + 1}`).toBeLessThan(2);
    for (const slot of restores) expect(slot % 4, `${key} restore in slot ${slot + 1}`).toBeGreaterThanOrEqual(2);
    const boosts = preset(key).inventory.flatMap((slot, index) => (slot && BOOST_POTIONS.has(slot.id) ? [index] : []));
    expect(boosts.length).toBeGreaterThan(0);
    expect(Math.max(...boosts)).toBeLessThan(Math.min(...brews));
  });
});

describe('Zuk community replicas', () => {
  const BLACK_CHINCHOMPA = 11959;
  const TWISTED_BOW = 20997;
  const ELYSIAN_SPIRIT_SHIELD = 12817;
  const STAMINA = 12625;
  const EXTENDED_STAMINA = 31638;
  const DRAGON_ARROW = 11212;
  const SEEKING_DRAGON_ARROW = 33595;
  const AVERNIC_TREADS_MAX = 31097;
  const KODAI = 21006;
  const ANCIENT_KEYS = ['s65_ancients', 's50_ancients', 'first_cape_tbow'] as const;

  it.each(COMMUNITY_KEYS)('%s runs only verified weapons, carrying the chinchompas unworn', (key) => {
    const unverified = weaponIds(key).filter(
      (id) => getEquipmentVerificationStatus({ id, slot: 'weapon' }) === 'unverified',
    );
    expect(unverified, key).toEqual([]);
    expect(preset(key).equipment.weapon).not.toBe(BLACK_CHINCHOMPA);
  });

  it('s45_arceuus wears the Twisted bow in place of the chinchompas, which keep its inventory slot', () => {
    expect(preset('s45_arceuus').equipment.weapon).toBe(TWISTED_BOW);
    expect(preset('s45_arceuus').equipment.shield).toBeUndefined();
    expect(carriedIds('s45_arceuus')).not.toContain(TWISTED_BOW);
    expect(slotsOf('s45_arceuus', BLACK_CHINCHOMPA)).toEqual([5]);
  });

  it('s65_ancients wears the Twisted bow and carries an Elysian spirit shield for the Kodai in its slot', () => {
    expect(preset('s65_ancients').equipment.weapon).toBe(TWISTED_BOW);
    expect(preset('s65_ancients').equipment.shield).toBeUndefined();
    expect(carriedIds('s65_ancients')).not.toContain(TWISTED_BOW);
    expect(carriedIds('s65_ancients')).not.toContain(BLACK_CHINCHOMPA);
    expect(slotsOf('s65_ancients', ELYSIAN_SPIRIT_SHIELD)).toEqual([6]);
  });

  it.each(COMMUNITY_KEYS)('%s carries an Extended stamina potion, not a plain Stamina potion', (key) => {
    expect(slotsOf(key, EXTENDED_STAMINA)).toHaveLength(1);
    expect(carriedIds(key)).not.toContain(STAMINA);
  });

  it.each(COMMUNITY_KEYS)('%s fires Seeking dragon arrows wherever it carries arrows', (key) => {
    const { supplies } = preset(key);
    const arrows = [supplies?.equippedAmmo?.id, supplies?.quiverAmmo?.id].filter(
      (id) => id !== undefined && id !== 22947, // Rada's blessing 4
    );
    expect(arrows).not.toContain(DRAGON_ARROW);
    expect(arrows.every((id) => id === SEEKING_DRAGON_ARROW)).toBe(true);
    if (weaponIds(key).includes(TWISTED_BOW)) {
      expect(arrows.some((id) => isAmmoCompatible(TWISTED_BOW, id as number))).toBe(true);
    }
  });

  it.each(['s65_ancients', 's50_ancients', 's45_arceuus'] as const)('%s wears Avernic treads (max)', (key) => {
    expect(preset(key).equipment.boots).toBe(AVERNIC_TREADS_MAX);
  });

  it.each(COMMUNITY_KEYS)('%s keeps the screenshot layout: a full 28 with the pouch in slot 4', (key) => {
    expect(preset(key).inventory).not.toContain(null);
    expect(preset(key).inventory[3]?.id).toBe(27281);
    expect(preset(key).supplies?.runePouch?.kind).toBe('divine');
  });

  it.each(ANCIENT_KEYS)('%s can Ice and Blood Barrage from its pouch alone, without the Kodai worn', (key) => {
    const { equipment, inventory, supplies } = preset(key);
    expect(supplies?.spellbook).toBe('ancient');
    expect(supplies?.selectedSpell).toBe('Ice Barrage');
    expect(weaponIds(key)).toContain(KODAI);
    // A Twisted bow stands in for any worn weapon, so the Kodai's unlimited water cannot count.
    const withoutKodai = { ...equipment, weapon: TWISTED_BOW };
    delete withoutKodai.shield;
    const ctx = { equipment: withoutKodai, inventory, runePouch: supplies?.runePouch ?? null, magicLevel: 99 };
    expect(canCastSpell('Ice Barrage', ctx)).toBe(true);
    expect(canCastSpell('Blood Barrage', ctx)).toBe(true);
  });

  it('s45_arceuus packs Death Charge and Mark of Darkness runes beside the Book of the Dead', () => {
    const { equipment, inventory, supplies } = preset('s45_arceuus');
    expect(supplies?.spellbook).toBe('arceuus');
    expect(supplies?.selectedSpell).toBeNull();
    expect(carriedIds('s45_arceuus')).toContain(25818);
    expect(supplies?.runePouch?.slots.map((slot) => slot?.id)).toEqual([
      RUNE.blood,
      RUNE.death,
      COMBINATION_RUNE.smoke,
      RUNE.cosmic,
    ]);
    const ctx = { equipment, inventory, runePouch: supplies?.runePouch ?? null, magicLevel: 99 };
    expect(canCastSpell('Death Charge', ctx)).toBe(true);
    expect(canCastSpell('Mark of Darkness', ctx)).toBe(true);
  });
});
