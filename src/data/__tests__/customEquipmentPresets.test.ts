import { describe, expect, it } from 'vitest';
import { findWeaponCategoryKey } from '../../types/attackStyles';
import { createEmptyCombatSupplies, type EncounterLoadout } from '../../types/encounterLoadout';
import {
  CUSTOMIZABLE_GEAR_SLOTS,
  deleteCustomEquipmentPreset,
  findMatchingCustomEquipmentPreset,
  getGearCatalog,
  normalizeCustomEquipmentPresetMap,
  sanitizeEquipmentAgainstCatalog,
  saveCustomEquipmentPreset,
  updateCustomEquipmentPreset,
} from '../customEquipmentPresets';
import {
  describeWeaponVerificationGaps,
  getEquipmentVerificationStatus,
  passesWeaponCapabilityChecks,
} from '../equipmentSupport';
import { findWeaponVerification, WEAPON_VERIFICATION_LIMITATIONS } from '../equipmentVerification';
import { EQUIPMENT_PRESETS } from '../playerPresets';

const maxMage = EQUIPMENT_PRESETS.yama_p3['max-mage'];
const maxMageLoadout = {
  equipment: maxMage.equipment,
  inventory: maxMage.inventory,
  supplies: maxMage.supplies ?? createEmptyCombatSupplies(),
};

describe('custom equipment presets', () => {
  it('preserves verification issues attached to an imported preset', () => {
    const normalized = normalizeCustomEquipmentPresetMap({
      yama_p3: [
        {
          id: 'imported',
          name: 'Imported',
          loadout: maxMageLoadout,
          verificationIssues: [{ id: 123, name: 'Unknown item 123', reason: 'unsupported' }],
        },
      ],
    });

    expect(normalized.presets.yama_p3?.[0]?.verificationIssues).toEqual([
      { id: 123, name: 'Unknown item 123', reason: 'unsupported', omitted: false },
    ]);
  });

  it('forks a stock loadout without mutating the stock preset', () => {
    const stockEquipment = { ...maxMage.equipment };

    const result = saveCustomEquipmentPreset({}, 'yama_p3', 'my-mage', 'My Mage', {
      equipment: { ...maxMage.equipment, weapon: 11806 },
      inventory: maxMageLoadout.inventory,
      supplies: maxMageLoadout.supplies,
    });

    expect(result.kind).toBe('saved');
    expect(maxMage.equipment).toEqual(stockEquipment);
    expect(result.kind === 'saved' ? result.presets.yama_p3?.[0]?.loadout.equipment.weapon : undefined).toBe(11806);
  });

  it('rejects duplicate names without replacing the existing custom preset', () => {
    const first = saveCustomEquipmentPreset({}, 'yama_p3', 'first', 'Mage set', {
      ...maxMageLoadout,
    });
    if (first.kind !== 'saved') throw new Error('Expected initial custom preset to save');

    const duplicate = saveCustomEquipmentPreset(first.presets, 'yama_p3', 'second', ' mage SET ', {
      equipment: { ...maxMage.equipment, weapon: 11806 },
      inventory: maxMageLoadout.inventory,
      supplies: maxMageLoadout.supplies,
    });

    expect(duplicate).toMatchObject({ kind: 'duplicate-name', name: 'Mage set' });
    expect(first.presets.yama_p3).toHaveLength(1);
  });

  it('deletes only the requested custom preset', () => {
    const first = saveCustomEquipmentPreset({}, 'yama_p3', 'first', 'First', {
      ...maxMageLoadout,
    });
    if (first.kind !== 'saved') throw new Error('Expected first preset to save');
    const second = saveCustomEquipmentPreset(first.presets, 'yama_p3', 'second', 'Second', {
      ...maxMageLoadout,
    });
    if (second.kind !== 'saved') throw new Error('Expected second preset to save');

    const remaining = deleteCustomEquipmentPreset(second.presets, 'yama_p3', 'first');

    expect(remaining.yama_p3?.map((preset) => preset.id)).toEqual(['second']);
  });

  it('updates only an existing id in its encounter, preserving name, order and import notes', () => {
    const saved = {
      id: 'mine',
      name: 'My kit',
      loadout: maxMageLoadout,
      verificationIssues: [{ id: 123, name: 'Unknown', reason: 'unsupported', omitted: true } as const],
    };
    const other = { id: 'other', name: 'Other kit', loadout: maxMageLoadout };
    const presets = { yama_p3: [saved, other], zuk: [saved] };
    const edited: EncounterLoadout = {
      ...maxMageLoadout,
      equipment: { ...maxMage.equipment, head: undefined, weapon: 99999999 },
      inventory: maxMageLoadout.inventory.map(() => null),
      supplies: { ...maxMageLoadout.supplies, spellbook: 'ancient' },
    };
    const updated = updateCustomEquipmentPreset(presets, 'yama_p3', 'mine', edited);
    expect(updated?.yama_p3).toHaveLength(2);
    expect(updated?.yama_p3[0]).toMatchObject({
      id: 'mine',
      name: 'My kit',
      verificationIssues: saved.verificationIssues,
    });
    expect(updated?.yama_p3[0].loadout).toEqual({
      ...edited,
      equipment: sanitizeEquipmentAgainstCatalog(edited.equipment),
    });
    expect(updated?.yama_p3[1]).toEqual(other);
    expect(updated?.zuk).toEqual([saved]);
    expect(presets.yama_p3[0].loadout).toBe(maxMageLoadout);
    edited.inventory[0] = { id: 6685, quantity: 1 };
    expect(updated?.yama_p3[0].loadout.inventory[0]).toBeNull();
  });

  it('cannot update a missing id, a built-in preset or a different encounter', () => {
    const presets = { yama_p3: [{ id: 'mine', name: 'My kit', loadout: maxMageLoadout }] };
    expect(updateCustomEquipmentPreset(presets, 'yama_p3', 'max-mage', maxMageLoadout)).toBeNull();
    expect(updateCustomEquipmentPreset(presets, 'zuk', 'mine', maxMageLoadout)).toBeNull();
    expect(updateCustomEquipmentPreset(presets, 'yama_p3', 'missing', maxMageLoadout)).toBeNull();
  });

  it('drops unsupported stored gear while preserving the usable parts of the preset', () => {
    const normalized = normalizeCustomEquipmentPresetMap({
      yama_p3: [
        {
          id: 'stale',
          name: 'Stale Mage',
          loadout: {
            equipment: { ...maxMage.equipment, weapon: 999999999 },
            inventory: maxMageLoadout.inventory,
            supplies: maxMageLoadout.supplies,
          },
        },
      ],
    });

    expect(normalized.repaired).toBe(true);
    expect(normalized.presets.yama_p3?.[0]?.loadout.equipment.weapon).toBeUndefined();
    expect(normalized.presets.yama_p3?.[0]?.loadout.equipment.head).toBe(maxMage.equipment.head);
  });

  it('offers the wearable Torva, not the retro models the cache gives a wear position but no Wear op', () => {
    const offered = (slot: Parameters<typeof getGearCatalog>[0], id: number) =>
      getGearCatalog(slot).some((item) => item.id === id);

    expect(offered('head', 26382)).toBe(true);
    expect(offered('body', 26384)).toBe(true);
    expect(offered('legs', 26386)).toBe(true);
    expect(offered('head', 30302)).toBe(false);
    expect(offered('body', 30303)).toBe(false);
    expect(offered('legs', 30304)).toBe(false);
    expect(sanitizeEquipmentAgainstCatalog({ head: 30302, body: 30303, legs: 30304 })).toEqual({});
  });
});

describe('custom equipment presets saved under a retired encounter kind', () => {
  const lunarLoadout: EncounterLoadout = {
    ...maxMageLoadout,
    supplies: { ...maxMageLoadout.supplies, spellbook: 'lunar' },
  };
  const preset = (id: string, name: string, loadout: EncounterLoadout = maxMageLoadout) => ({ id, name, loadout });
  const summary = (presets: readonly { id: string; name: string }[] | undefined) =>
    presets?.map(({ id, name }) => ({ id, name }));

  it("moves a Zuk-only player's sets onto the Inferno and asks for the repair to be saved", () => {
    const normalized = normalizeCustomEquipmentPresetMap({ zuk: [preset('mine', 'My kit')] });

    expect(normalized.repaired).toBe(true);
    expect(Object.keys(normalized.presets)).toEqual(['inferno']);
    expect(summary(normalized.presets.inferno)).toEqual([{ id: 'mine', name: 'My kit' }]);
  });

  it('keeps the Zuk copy of a shared id and every distinct set, whatever the stored key order', () => {
    const owned = [
      preset('shared', 'Inferno copy'),
      preset('kit', 'Kit'),
      preset('kit-2', 'Kit (2)'),
      preset('own', 'Own'),
    ];
    const retired = [
      preset('shared', 'Zuk copy', lunarLoadout),
      preset('zuk-kit', 'kit'),
      preset('zuk-only', 'Zuk only'),
    ];
    expect(maxMageLoadout.supplies.spellbook).not.toBe('lunar');
    const expected = [
      { id: 'shared', name: 'Zuk copy' },
      { id: 'kit', name: 'Kit (3)' },
      { id: 'kit-2', name: 'Kit (2)' },
      { id: 'own', name: 'Own' },
      { id: 'zuk-kit', name: 'kit' },
      { id: 'zuk-only', name: 'Zuk only' },
    ];

    for (const raw of [
      { inferno: owned, zuk: retired },
      { zuk: retired, inferno: owned },
    ]) {
      const normalized = normalizeCustomEquipmentPresetMap(raw);
      expect(normalized.repaired).toBe(true);
      expect(Object.keys(normalized.presets)).toEqual(['inferno']);
      expect(summary(normalized.presets.inferno)).toEqual(expected);
      expect(normalized.presets.inferno?.[0]?.loadout.supplies.spellbook).toBe('lunar');
    }
  });

  it('is idempotent', () => {
    const once = normalizeCustomEquipmentPresetMap({
      inferno: [preset('kit', 'Kit')],
      zuk: [preset('zuk-kit', 'Kit')],
    });
    const twice = normalizeCustomEquipmentPresetMap(once.presets);

    expect(twice).toEqual({ presets: once.presets, repaired: false });
  });
});

describe('findMatchingCustomEquipmentPreset', () => {
  const saved = { id: 'saved', name: 'Saved', loadout: maxMageLoadout };

  it('matches a saved set only on complete identity, supplies included', () => {
    expect(findMatchingCustomEquipmentPreset([saved], maxMageLoadout)).toBe(saved);

    // Gear and inventory are untouched; only the spellbook differs. A saved set is the
    // complete loadout, so this must not match it.
    const spellbookFlipped: EncounterLoadout = {
      ...maxMageLoadout,
      supplies: { ...maxMageLoadout.supplies, spellbook: 'ancient' },
    };
    expect(findMatchingCustomEquipmentPreset([saved], spellbookFlipped)).toBeUndefined();
  });
});

/**
 * The catalog and the verified set answer two different questions. These lock the distinction:
 * the catalog is what can be named, `verified` includes explicitly accepted limitations.
 */
describe('gear catalog verification', () => {
  /** Category `bulwark` with no attack animation anywhere: resolves to the unarmed punch. */
  const DINHS_BULWARK = 21015;
  /** Powered staff with no projectile visuals: animation resolves, the shot draws nothing. */
  const ACCURSED_SCEPTRE = 27662;
  /** Mapped, animated, and its arrow comes from ammo, which is exempt. */

  function weapon(id: number) {
    const found = getGearCatalog('weapon').find((item) => item.id === id);
    if (!found) {
      throw new Error(`catalog no longer carries weapon ${id}; pick a new fixture`);
    }
    return found;
  }

  it('requires a weapon category, because an unmapped weapon fights as unarmed', () => {
    const weapons = getGearCatalog('weapon');
    for (const weapon of weapons) {
      if (weapon.verified) {
        expect(findWeaponCategoryKey(weapon.id)).toBeDefined();
      }
    }
    expect(weapons.some((weapon) => !weapon.verified)).toBe(true);
  });

  /**
   * Named fixtures rather than "some weapon fails": each of the three checks has to be
   * independently load-bearing. An existential assertion stays green when one check is deleted,
   * because the others still leave mapped weapons unverified, so it locks nothing.
   */
  it('rejects a mapped weapon whose swing falls through to the bare-fist punch', () => {
    expect(describeWeaponVerificationGaps(DINHS_BULWARK)).toContain('Attack animation missing.');
    expect(weapon(DINHS_BULWARK).verified).toBe(false);
  });

  it('rejects a mapped weapon that would fire nothing', () => {
    expect(weapon(ACCURSED_SCEPTRE).verified).toBe(false);
  });

  it('accepts a weapon we have verified end to end', () => {
    expect(weapon(23528).verified).toBe(true); // Sarachnis cudgel
  });

  it('includes Eclipse atlatl in the verified filter without losing its limitation notice', () => {
    expect(getGearCatalog('weapon').filter((item) => item.verified)).toContainEqual(weapon(29000));
    expect(describeWeaponVerificationGaps(29000)).toEqual(['Special attack unavailable.']);
  });

  it('preserves every other weapon status, including cosmetics and unchecked weapons', () => {
    for (const item of getGearCatalog('weapon')) {
      if (WEAPON_VERIFICATION_LIMITATIONS[item.id] !== undefined) continue;
      const verified = findWeaponVerification(item.id) !== undefined && passesWeaponCapabilityChecks(item.id);
      expect(item.verified, String(item.id)).toBe(verified);
      expect(getEquipmentVerificationStatus({ id: item.id, slot: 'weapon' }), String(item.id)).toBe(
        verified ? 'verified' : 'unverified',
      );
    }
  });

  it('rejects a weapon that clears all three checks but that nobody has verified', () => {
    expect(weapon(23987).verified).toBe(false); // Crystal halberd
  });

  it('verifies every non-weapon slot with first-party equipment support', () => {
    for (const slot of CUSTOMIZABLE_GEAR_SLOTS) {
      if (slot === 'weapon') continue;
      expect(getGearCatalog(slot).every((item) => item.verified)).toBe(true);
    }
  });

  it('keeps the catalog wider than the verified set, so held gear can still be named', () => {
    const weapons = getGearCatalog('weapon');
    expect(weapons.filter((weapon) => weapon.verified).length).toBeLessThan(weapons.length);
  });

  it('never drops an unverified piece out of a saved loadout', () => {
    const unverified = getGearCatalog('weapon').find((weapon) => !weapon.verified);
    if (!unverified) {
      throw new Error('expected the catalog to carry an unverified weapon');
    }
    // Sanitizing is about ids the catalog cannot name at all. Running a piece imperfectly is
    // never a reason to delete the player's gear from under them.
    expect(sanitizeEquipmentAgainstCatalog({ weapon: unverified.id }).weapon).toBe(unverified.id);
  });
});
