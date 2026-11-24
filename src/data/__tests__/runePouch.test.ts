import { describe, expect, it } from 'vitest';
import type { RunePouch } from '../../types/encounterLoadout';
import { createEmptyInventory, type Inventory } from '../../types/inventory';
import {
  DIVINE_RUNE_POUCH_ITEM_ID,
  findSupportedRune,
  isRunePouchItem,
  RUNE_GROUPS,
  RUNE_POUCH_ITEM_ID,
  RUNE_POUCH_ITEMS,
  runePouchKindOf,
  SUPPORTED_RUNES,
  syncRunePouchWithInventory,
} from '../runePouch';
import { COMBINATION_RUNE, RUNE } from '../spellRunes';

describe('rune pouch items', () => {
  it('names both pouches the way the game does, against their kinds', () => {
    expect(RUNE_POUCH_ITEMS.map((item) => [item.id, item.name, item.kind])).toEqual([
      [12791, 'Rune pouch', 'standard'],
      [27281, 'Divine rune pouch', 'divine'],
    ]);
    expect(RUNE_POUCH_ITEM_ID).toBe(12791);
    expect(DIVINE_RUNE_POUCH_ITEM_ID).toBe(27281);
  });

  it('recognizes a pouch item and nothing else', () => {
    expect(isRunePouchItem(RUNE_POUCH_ITEM_ID)).toBe(true);
    expect(isRunePouchItem(DIVINE_RUNE_POUCH_ITEM_ID)).toBe(true);
    expect(isRunePouchItem(RUNE.death)).toBe(false);
    expect(isRunePouchItem(undefined)).toBe(false);
  });

  it('reads a kind off a pouch item id', () => {
    expect(runePouchKindOf(RUNE_POUCH_ITEM_ID)).toBe('standard');
    expect(runePouchKindOf(DIVINE_RUNE_POUCH_ITEM_ID)).toBe('divine');
    expect(runePouchKindOf(RUNE.blood)).toBeUndefined();
  });
});

describe('SUPPORTED_RUNES', () => {
  it('offers every base and combination rune the cast checker knows', () => {
    const offered = new Set(SUPPORTED_RUNES.map((rune) => rune.id));
    const known = [...Object.values(RUNE), ...Object.values(COMBINATION_RUNE)];

    expect(known.filter((id) => !offered.has(id))).toEqual([]);
    expect(SUPPORTED_RUNES).toHaveLength(21);
    expect(offered.size).toBe(SUPPORTED_RUNES.length);
  });

  // One name, in full. The pouch slots paint a sprite and carry this on their accessible name,
  // so a second abbreviated name is a value with no reader.
  it('names each rune in full, under the name the game gives it', () => {
    expect(findSupportedRune(RUNE.death)).toEqual({ id: 560, name: 'Death rune', verified: true });
    expect(findSupportedRune(COMBINATION_RUNE.aether)).toEqual({ id: 30843, name: 'Aether rune', verified: true });
    expect(findSupportedRune(RUNE.wrath)?.name).toBe('Wrath rune');
  });

  it('states every rune as verified, because the cast checker resolves all of them', () => {
    expect(SUPPORTED_RUNES.filter((rune) => !rune.verified)).toEqual([]);
  });

  // Every other catalog the panel can show is name-ordered. The picker reads `RUNE_GROUPS`
  // instead, so this order is for readers, not for the tray.
  it('reads in name order', () => {
    const names = SUPPORTED_RUNES.map((rune) => rune.name);

    expect(names).toEqual([...names].sort((left, right) => left.localeCompare(right)));
    expect(names[0]).toBe('Aether rune');
  });

  it('has nothing to say about an item that is not a rune', () => {
    expect(findSupportedRune(RUNE_POUCH_ITEM_ID)).toBeUndefined();
  });
});

describe('RUNE_GROUPS', () => {
  // The table is hand-written, so a rune left out of all three families is simply unpickable,
  // and a rune listed twice appears in the tray twice.
  it('covers the whole catalog exactly once', () => {
    const grouped = RUNE_GROUPS.flatMap((group) => group.runes.map((rune) => rune.id));

    expect(new Set(grouped)).toEqual(new Set(SUPPORTED_RUNES.map((rune) => rune.id)));
    expect(grouped).toHaveLength(SUPPORTED_RUNES.length);
  });

  it('reads by family, in the order the tray draws its rows', () => {
    expect(RUNE_GROUPS.map((group) => [group.id, group.runes.map((rune) => rune.name)])).toEqual([
      ['elemental', ['Air rune', 'Water rune', 'Earth rune', 'Fire rune']],
      ['combination', ['Mist rune', 'Dust rune', 'Mud rune', 'Smoke rune', 'Steam rune', 'Lava rune']],
      [
        'catalytic',
        [
          'Mind rune',
          'Body rune',
          'Cosmic rune',
          'Chaos rune',
          'Nature rune',
          'Law rune',
          'Death rune',
          'Blood rune',
          'Soul rune',
          'Wrath rune',
          'Aether rune',
        ],
      ],
    ]);
  });
});

describe('syncRunePouchWithInventory', () => {
  const STANDARD: RunePouch = { kind: 'standard', slots: [{ id: RUNE.death }, { id: RUNE.fire }, null] };
  const DIVINE: RunePouch = {
    kind: 'divine',
    slots: [{ id: RUNE.death }, { id: RUNE.fire }, { id: RUNE.blood }, { id: COMBINATION_RUNE.aether }],
  };

  function inventoryWith(...itemIds: readonly number[]): Inventory {
    const inventory = createEmptyInventory();
    itemIds.forEach((id, index) => {
      inventory[index] = { id };
    });
    return inventory;
  }

  it('drops the pouch when the inventory no longer carries one', () => {
    expect(syncRunePouchWithInventory(createEmptyInventory(), DIVINE)).toBeNull();
    expect(syncRunePouchWithInventory(inventoryWith(RUNE.death), STANDARD)).toBeNull();
  });

  it('creates an empty pouch of the kind the inventory just gained', () => {
    expect(syncRunePouchWithInventory(inventoryWith(RUNE_POUCH_ITEM_ID), null)).toEqual({
      kind: 'standard',
      slots: [null, null, null],
    });
    expect(syncRunePouchWithInventory(inventoryWith(DIVINE_RUNE_POUCH_ITEM_ID), null)).toEqual({
      kind: 'divine',
      slots: [null, null, null, null],
    });
  });

  it('keeps the runes already packed when the pouch kind does not change', () => {
    expect(syncRunePouchWithInventory(inventoryWith(DIVINE_RUNE_POUCH_ITEM_ID), DIVINE)).toEqual(DIVINE);
  });

  it('carries the first three runes across an upgrade, and opens the fourth slot empty', () => {
    expect(syncRunePouchWithInventory(inventoryWith(DIVINE_RUNE_POUCH_ITEM_ID), STANDARD)).toEqual({
      kind: 'divine',
      slots: [{ id: RUNE.death }, { id: RUNE.fire }, null, null],
    });
  });

  it('drops only the fourth rune on the way back down to a standard pouch', () => {
    expect(syncRunePouchWithInventory(inventoryWith(RUNE_POUCH_ITEM_ID), DIVINE)).toEqual({
      kind: 'standard',
      slots: [{ id: RUNE.death }, { id: RUNE.fire }, { id: RUNE.blood }],
    });
  });

  it('lets the first pouch in inventory order decide, so the result never depends on scan order', () => {
    expect(syncRunePouchWithInventory(inventoryWith(RUNE_POUCH_ITEM_ID, DIVINE_RUNE_POUCH_ITEM_ID), null)?.kind).toBe(
      'standard',
    );
    expect(syncRunePouchWithInventory(inventoryWith(DIVINE_RUNE_POUCH_ITEM_ID, RUNE_POUCH_ITEM_ID), null)?.kind).toBe(
      'divine',
    );
  });
});
