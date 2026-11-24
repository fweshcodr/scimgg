import { describe, expect, it } from 'vitest';
import { EQUIPMENT_COMBAT_FAMILIES } from '../../../data/equipmentCombatFamilies';
import { importInventorySetup } from '../../../data/inventorySetupIO';
import { RUNE } from '../../../data/spellRunes';
import type { CombatSupplies } from '../../../types/encounterLoadout';
import { createEmptyCombatSupplies } from '../../../types/encounterLoadout';
import { createEmptyInventory } from '../../../types/inventory';
import { isAmmoCompatible, isQuiverStorableAmmo, weaponRequiresExternalAmmo } from '../ammoCompatibility';
import { resolveAttackResources } from '../attackResources';
import type { CombatFormulaStyle } from '../formulas';

function supplies(overrides: Partial<CombatSupplies>): CombatSupplies {
  return { ...createEmptyCombatSupplies(), ...overrides };
}

function resolve(weaponId: number | undefined, combatSupplies: CombatSupplies, formulaStyle: CombatFormulaStyle) {
  return resolveAttackResources({
    weaponId,
    equipment: { weapon: weaponId },
    inventory: createEmptyInventory(),
    formulaStyle,
    supplies: combatSupplies,
  });
}

function inventoryWithRunes(runeIds: readonly number[]) {
  const inventory = createEmptyInventory();
  runeIds.forEach((runeId, index) => {
    inventory[index] = { id: runeId };
  });
  return inventory;
}

describe('resolveAttackResources', () => {
  it.each(EQUIPMENT_COMBAT_FAMILIES)('preserves ammunition routing for family $baseId', ({ baseId, variantIds }) => {
    const combatSupplies = supplies({ equippedAmmo: { id: 9242 }, quiverAmmo: { id: 20389 }, blowpipe: { id: 11230 } });
    const expected = resolve(baseId, combatSupplies, 'ranged');
    for (const variantId of variantIds) {
      expect(resolve(variantId, combatSupplies, 'ranged')).toEqual(expected);
      expect(weaponRequiresExternalAmmo(variantId)).toBe(weaponRequiresExternalAmmo(baseId));
      for (const ammoId of [9242, 21944, 20389, 33553, 28991]) {
        expect(isAmmoCompatible(variantId, ammoId)).toBe(isAmmoCompatible(baseId, ammoId));
      }
    }
  });

  it.each([
    33553, 33559, 33565, 33571, 33577, 33583, 33589, 33595, 33601,
  ])('fires seeking arrow %i from supported bows and stores it in the quiver', (ammoId) => {
    const combatSupplies = supplies({ equippedAmmo: { id: 22947 }, quiverAmmo: { id: ammoId } });

    const results = [11235, 20997, 29591].map((weaponId) => resolve(weaponId, combatSupplies, 'ranged'));

    expect(results).toEqual(Array.from({ length: 3 }, () => ({ kind: 'ammo', source: 'quiver', ammoId })));
    expect(isQuiverStorableAmmo(ammoId)).toBe(true);
    expect([9185, 11785, 26374, 12926, 25865, 4587, 27275].some((weaponId) => isAmmoCompatible(weaponId, ammoId))).toBe(
      false,
    );
  });

  it('uses compatible equipped arrows before Dizana quiver arrows for Twisted bow', () => {
    const combatSupplies = supplies({
      equippedAmmo: { id: 11212 },
      quiverAmmo: { id: 21326 },
    });

    const result = resolve(20997, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'equipped', ammoId: 11212 });
  });

  it('does not let a stored selected spell override a ranged Twisted bow launch', () => {
    const combatSupplies = supplies({
      equippedAmmo: { id: 11212 },
      selectedSpell: 'Fire Surge',
    });

    const result = resolve(20997, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'equipped', ammoId: 11212 });
  });

  it.each([
    {
      weaponId: 9185,
      combatSupplies: supplies({ equippedAmmo: { id: 9242 }, selectedSpell: 'Fire Surge' }),
      expected: { kind: 'ammo', source: 'equipped', ammoId: 9242 },
    },
    {
      weaponId: 29000,
      combatSupplies: supplies({ equippedAmmo: { id: 28991 }, selectedSpell: 'Fire Surge' }),
      expected: { kind: 'ammo', source: 'equipped', ammoId: 28991 },
    },
    {
      weaponId: 12926,
      combatSupplies: supplies({
        blowpipe: { id: 11230 },
        selectedSpell: 'Fire Surge',
      }),
      expected: { kind: 'ammo', source: 'blowpipe', ammoId: 11230 },
    },
  ])('keeps ranged weapon $weaponId ammo-resolved when a selected spell is stored', ({
    weaponId,
    combatSupplies,
    expected,
  }) => {
    const result = resolve(weaponId, combatSupplies, 'ranged');

    expect(result).toEqual(expected);
  });

  it('falls back to compatible Dizana quiver arrows when equipped ammo is incompatible', () => {
    const combatSupplies = supplies({
      equippedAmmo: { id: 9242 },
      quiverAmmo: { id: 11212 },
    });

    const result = resolve(20997, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'quiver', ammoId: 11212 });
  });

  it('falls back to compatible Dizana quiver bolts when the worn ammo slot is empty', () => {
    const combatSupplies = supplies({
      equippedAmmo: null,
      quiverAmmo: { id: 9242 },
    });

    const result = resolve(9185, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'quiver', ammoId: 9242 });
  });

  it('requires compatible ammo for a profiled crossbow (Armadyl crossbow)', () => {
    const result = resolve(11785, createEmptyCombatSupplies(), 'ranged');

    expect(result).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('uses compatible ammo for a profiled crossbow (Armadyl crossbow)', () => {
    const combatSupplies = supplies({ equippedAmmo: { id: 9242 } });

    const result = resolve(11785, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'equipped', ammoId: 9242 });
  });

  it('rejects dragon bolts from a rune crossbow', () => {
    const result = resolve(9185, supplies({ equippedAmmo: { id: 21944 } }), 'ranged');

    expect(result).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('accepts dragon bolts in an Armadyl crossbow', () => {
    const result = resolve(11785, supplies({ equippedAmmo: { id: 21944 } }), 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'equipped', ammoId: 21944 });
  });

  it('keeps the Bow of Faerdhinen self-contained', () => {
    expect(weaponRequiresExternalAmmo(25865)).toBe(false);
    expect(resolve(25865, createEmptyCombatSupplies(), 'ranged')).toEqual({ kind: 'none', source: 'none' });
  });

  it('recognizes Scorching bow arrows without accepting an ammo-slot blessing', () => {
    expect(isAmmoCompatible(29591, 11212)).toBe(true);
    expect(isAmmoCompatible(29591, 22947)).toBe(false);
  });

  it('requires Eclipse atlatl darts in the equipped ammo slot', () => {
    const combatSupplies = supplies({ quiverAmmo: { id: 28991 } });

    const result = resolve(29000, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('requires equipped atlatl darts for Eclipse atlatl aliases', () => {
    const combatSupplies = supplies({ equippedAmmo: { id: 28991 } });

    expect(resolve(29851, combatSupplies, 'ranged')).toEqual({
      kind: 'ammo',
      source: 'equipped',
      ammoId: 28991,
    });
  });

  it('always uses dragon darts for the toxic blowpipe', () => {
    const combatSupplies = supplies({
      equippedAmmo: { id: 11212 },
      blowpipe: { id: 25849 },
    });

    const result = resolve(12926, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'blowpipe', ammoId: 11230 });
  });

  it('keeps a blowpipe launch available without imported dart metadata', () => {
    const combatSupplies = createEmptyCombatSupplies();

    const result = resolve(12926, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'blowpipe', ammoId: 11230 });
  });

  it('fires dragon darts from an imported blowpipe setup with no contained-ammo field', () => {
    const equipment = new Array(14).fill(null);
    equipment[3] = { id: 12926 };
    const imported = importInventorySetup(
      JSON.stringify({ setup: { name: 'Blowpipe', inv: new Array(28).fill(null), eq: equipment }, layout: [] }),
    );
    if (imported.kind !== 'success') {
      throw new Error(imported.message);
    }

    expect(imported.loadout.supplies.blowpipe).toBeNull();
    expect(
      resolveAttackResources({
        weaponId: imported.loadout.equipment.weapon,
        equipment: imported.loadout.equipment,
        inventory: imported.loadout.inventory,
        formulaStyle: 'ranged',
        supplies: imported.loadout.supplies,
      }),
    ).toEqual({ kind: 'ammo', source: 'blowpipe', ammoId: 11230 });
  });

  it('marks a selected spell unavailable when the runes are not carried', () => {
    const combatSupplies = supplies({ selectedSpell: 'Fire Surge' });

    const result = resolve(21006, combatSupplies, 'magic');

    expect(result).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('resolves the selected spell without treating it as ammo when the runes are carried', () => {
    const combatSupplies = supplies({ selectedSpell: 'Fire Surge' });

    // Kodai wand supplies water; Fire Surge still needs its fire, air and wrath runes.
    const result = resolveAttackResources({
      weaponId: 21006,
      equipment: { weapon: 21006 },
      inventory: inventoryWithRunes([RUNE.fire, RUNE.air, RUNE.wrath]),
      formulaStyle: 'magic',
      supplies: combatSupplies,
    });

    expect(result.kind).toBe('spell');
    expect(result).toMatchObject({ source: 'none', spellId: 'Fire Surge' });
  });

  it('treats an explicitly null active spell as authoritative when a selected spell is stored', () => {
    const combatSupplies = supplies({ selectedSpell: 'Dark Demonbane' });

    const result = resolveAttackResources({
      weaponId: 27275,
      equipment: { weapon: 27275 },
      inventory: inventoryWithRunes([RUNE.fire, RUNE.soul]),
      formulaStyle: 'magic',
      supplies: combatSupplies,
      activeSpell: null,
    });

    expect(result).toEqual({ kind: 'none', source: 'none' });
  });

  it('falls back to the selected spell when a caller omits activeSpell', () => {
    const combatSupplies = supplies({ selectedSpell: 'Dark Demonbane' });

    const result = resolveAttackResources({
      weaponId: 21006,
      equipment: { weapon: 21006 },
      inventory: inventoryWithRunes([RUNE.fire, RUNE.soul]),
      formulaStyle: 'magic',
      supplies: combatSupplies,
    });

    expect(result).toMatchObject({ kind: 'spell', source: 'none', spellId: 'Dark Demonbane' });
  });

  it('fails closed for a spell with no rune requirement data', () => {
    const combatSupplies = supplies({ selectedSpell: 'Not A Real Spell' });

    const result = resolve(21006, combatSupplies, 'magic');

    expect(result).toEqual({ kind: 'unavailable', source: 'none' });
  });

  it('returns a no-resource result for ordinary melee weapons', () => {
    const result = resolve(4151, createEmptyCombatSupplies(), 'melee_slash');

    expect(result).toEqual({ kind: 'none', source: 'none' });
  });

  it('keeps an unprofiled ranged weapon fail-open', () => {
    const result = resolve(999_999, createEmptyCombatSupplies(), 'ranged');

    expect(result).toEqual({ kind: 'none', source: 'none' });
  });
});

/**
 * Ranged strength is NOT a property of the worn loadout: `PlayerEquipment` has ten
 * worn slots and no ammunition slot, so `computeTotalEquipmentStats` cannot see the
 * arrow, bolt or dart that supplies most of it. It is composed per swing as
 * `wornSlotsTotal + rstr(resolved ammoId)`, which makes WHICH ammo resolves the
 * thing that decides a ranged max hit.
 */
describe('which ammunition supplies ranged strength', () => {
  it('draws only dragon darts when a blowpipe is equipped, ignoring stored supplies', () => {
    const combatSupplies = supplies({
      blowpipe: { id: 811 },
      equippedAmmo: { id: 11212 },
      quiverAmmo: { id: 21326 },
    });

    const result = resolve(12926, combatSupplies, 'ranged');

    expect(result).toEqual({ kind: 'ammo', source: 'blowpipe', ammoId: 11230 });
  });

  it('reports no ammunition for a thrown weapon, so its strength is never counted twice', () => {
    // A rune thrownaxe carries its ranged strength in the WEAPON slot, where the worn
    // total already picks it up. Returning an ammo resource here would add it again.
    const combatSupplies = supplies({ equippedAmmo: { id: 11212 }, quiverAmmo: { id: 21326 } });

    const result = resolve(805, combatSupplies, 'ranged');

    expect(result.kind).not.toBe('ammo');
  });
});

describe('infinite ammunition', () => {
  it('resolves the same equipped ammo on every launch and never touches the supplies', () => {
    const combatSupplies = supplies({ equippedAmmo: { id: 11212 } });
    const before = structuredClone(combatSupplies);

    const results = Array.from({ length: 50 }, () => resolve(20997, combatSupplies, 'ranged'));

    for (const result of results) {
      expect(result).toEqual({ kind: 'ammo', source: 'equipped', ammoId: 11212 });
    }
    expect(combatSupplies).toEqual(before);
  });

  it('resolves a blowpipe launch identically every time - darts are modeled as infinite', () => {
    const combatSupplies = supplies({ blowpipe: { id: 11230 } });

    const first = resolve(12926, combatSupplies, 'ranged');
    const second = resolve(12926, combatSupplies, 'ranged');

    expect(first).toEqual({ kind: 'ammo', source: 'blowpipe', ammoId: 11230 });
    expect(second).toEqual(first);
  });
});
