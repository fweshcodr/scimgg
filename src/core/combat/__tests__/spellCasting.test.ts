import { describe, expect, it } from 'vitest';
import { RUNE } from '../../../data/spellRunes';
import { createEmptyCombatSupplies } from '../../../types/encounterLoadout';
import type { Inventory } from '../../../types/inventory';
import { createEmptyInventory } from '../../../types/inventory';
import { resolveAttackResources } from '../attackResources';

const KODAI_WAND = 21006;
const DRAGON_SCIMITAR = 4587;

function inventoryOf(...items: Array<{ id: number; quantity?: number }>): Inventory {
  const inventory = createEmptyInventory();
  items.forEach((item, index) => {
    inventory[index] = item;
  });
  return inventory;
}

function iceBarrageInventory() {
  return inventoryOf({ id: RUNE.water }, { id: RUNE.blood }, { id: RUNE.death });
}

describe('autocast rune gating', () => {
  it('resolves a spell attack when the runes are there', () => {
    const resources = resolveAttackResources({
      weaponId: KODAI_WAND,
      equipment: { weapon: KODAI_WAND },
      inventory: iceBarrageInventory(),
      formulaStyle: 'magic',
      supplies: { ...createEmptyCombatSupplies(), selectedSpell: 'Ice Barrage' },
    });
    expect(resources.kind).toBe('spell');
  });

  it('reports the attack as unavailable when a rune type is missing', () => {
    const resources = resolveAttackResources({
      weaponId: KODAI_WAND,
      equipment: { weapon: KODAI_WAND },
      // Kodai covers the water; blood is not carried at all.
      inventory: inventoryOf({ id: RUNE.death }),
      formulaStyle: 'magic',
      supplies: { ...createEmptyCombatSupplies(), selectedSpell: 'Ice Barrage' },
    });
    expect(resources).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('does not resolve a spell on a non-magic style', () => {
    const resources = resolveAttackResources({
      weaponId: DRAGON_SCIMITAR,
      equipment: { weapon: DRAGON_SCIMITAR },
      inventory: iceBarrageInventory(),
      formulaStyle: 'melee_slash',
      supplies: { ...createEmptyCombatSupplies(), selectedSpell: 'Ice Barrage' },
    });
    expect(resources.kind).not.toBe('spell');
  });

  it('fails closed for a spell with no rune data rather than casting it free', () => {
    const resources = resolveAttackResources({
      weaponId: KODAI_WAND,
      equipment: { weapon: KODAI_WAND },
      inventory: createEmptyInventory(),
      formulaStyle: 'magic',
      supplies: { ...createEmptyCombatSupplies(), selectedSpell: 'Not A Real Spell' },
    });
    expect(resources).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('gates a standard-book spell on carrying its runes', () => {
    const resources = resolveAttackResources({
      weaponId: KODAI_WAND,
      equipment: { weapon: KODAI_WAND },
      inventory: createEmptyInventory(),
      formulaStyle: 'magic',
      supplies: { ...createEmptyCombatSupplies(), selectedSpell: 'Fire Surge' },
    });
    expect(resources).toEqual({ kind: 'unavailable', source: 'none' });
  });
});

describe('manual cast resolution', () => {
  it('casts from a melee weapon on a melee style', () => {
    const resources = resolveAttackResources({
      weaponId: DRAGON_SCIMITAR,
      equipment: { weapon: DRAGON_SCIMITAR },
      inventory: iceBarrageInventory(),
      formulaStyle: 'magic',
      supplies: createEmptyCombatSupplies(),
      manualCastSpell: 'Ice Barrage',
    });
    expect(resources).toMatchObject({ kind: 'spell', spellId: 'Ice Barrage' });
  });

  it('wins over the selected autocast spell', () => {
    const resources = resolveAttackResources({
      weaponId: KODAI_WAND,
      equipment: { weapon: KODAI_WAND },
      inventory: inventoryOf({ id: RUNE.blood }, { id: RUNE.death }),
      formulaStyle: 'magic',
      supplies: { ...createEmptyCombatSupplies(), selectedSpell: 'Ice Barrage' },
      manualCastSpell: 'Blood Blitz',
    });
    expect(resources).toMatchObject({ kind: 'spell', spellId: 'Blood Blitz' });
  });

  it('is unavailable when the manual cast has no runes behind it', () => {
    const resources = resolveAttackResources({
      weaponId: DRAGON_SCIMITAR,
      equipment: { weapon: DRAGON_SCIMITAR },
      inventory: createEmptyInventory(),
      formulaStyle: 'magic',
      supplies: createEmptyCombatSupplies(),
      manualCastSpell: 'Ice Barrage',
    });
    expect(resources).toEqual({ kind: 'unavailable', source: 'none' });
  });
});

describe('runes never deplete', () => {
  it('resolves the same cast from an unchanged inventory, however many casts go out', () => {
    const inventory = iceBarrageInventory();
    const supplies = { ...createEmptyCombatSupplies(), selectedSpell: 'Ice Barrage' };
    const before = structuredClone(inventory);

    const resolve = () =>
      resolveAttackResources({
        weaponId: KODAI_WAND,
        equipment: {},
        inventory,
        formulaStyle: 'magic',
        supplies,
      });

    for (let cast = 0; cast < 100; cast++) {
      expect(resolve()).toMatchObject({ kind: 'spell', spellId: 'Ice Barrage' });
    }
    expect(inventory).toEqual(before);
  });
});
