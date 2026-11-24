import { describe, expect, expectTypeOf, it } from 'vitest';
import type { OsrsSpell } from '../../../data/spellCatalog';
import {
  getAutocastableSpells,
  getSpellCastInfo,
  isAutocastableSpell,
  spellIconName,
} from '../../../data/spellCatalog';
import { getSpellVisuals } from '../../../data/spellVisuals';
import { resolveActiveSpell } from '../../../types/attackStyles';
import {
  cloneCombatSupplies,
  combatSuppliesEqual,
  createEmptyCombatSupplies,
  normalizeCombatSupplies,
} from '../../../types/encounterLoadout';
import { getPlayerEffectiveCombatParams } from '../weaponCombatData';

const PURGING_STAFF = 29594;
const DRAGON_HUNTER_WAND = 30070;
const DRAGON_SCIMITAR = 4587;
const TUMEKENS_SHADOW = 27275;

// Staff category indices: 0=Bash, 1=Pound, 2=Focus, 3=Casting, 4=Defensive Casting
const BASH_INDEX = 0;
const CASTING_INDEX = 3;
const DEFENSIVE_CASTING_INDEX = 4;

function makePlayer(weaponId: number | undefined, styleIndex: number, selectedSpell: string | null) {
  return {
    equipmentStats: { attackSpeed: 4, attackRange: 1 },
    equipment: { weapon: weaponId },
    selectedAttackStyleIndex: styleIndex,
    combatSupplies: { selectedSpell, spellbook: 'ancient' as const },
  };
}

describe('resolveActiveSpell', () => {
  it('prefers the explicitly selected spell over the weapon default', () => {
    const spell = resolveActiveSpell({
      weaponId: PURGING_STAFF,
      selectedStyleIndex: CASTING_INDEX,
      selectedSpell: 'Ice Barrage',
      spellbook: 'ancient',
    });
    expect(spell?.name).toBe('Ice Barrage');
    expect(spell?.spellbook).toBe('ancient');
  });

  it('falls back to the weapon default when no spell is selected', () => {
    expect(
      resolveActiveSpell({
        weaponId: PURGING_STAFF,
        selectedStyleIndex: CASTING_INDEX,
        selectedSpell: null,
        spellbook: 'arceuus',
      })?.name,
    ).toBe('Dark Demonbane');
    expect(
      resolveActiveSpell({
        weaponId: DRAGON_HUNTER_WAND,
        selectedStyleIndex: CASTING_INDEX,
        selectedSpell: undefined,
        spellbook: 'ancient',
      })?.name,
    ).toBe('Blood Barrage');
  });

  it('falls back to the weapon default when the selected spell is unknown', () => {
    expect(
      resolveActiveSpell({
        weaponId: PURGING_STAFF,
        selectedStyleIndex: CASTING_INDEX,
        selectedSpell: 'Not A Spell',
        spellbook: 'arceuus',
      })?.name,
    ).toBe('Dark Demonbane');
  });

  it('applies on defensive casting too', () => {
    expect(
      resolveActiveSpell({
        weaponId: PURGING_STAFF,
        selectedStyleIndex: DEFENSIVE_CASTING_INDEX,
        selectedSpell: 'Blood Barrage',
        spellbook: 'ancient',
      })?.name,
    ).toBe('Blood Barrage');
  });

  it('returns null on a non-casting style even with a spell selected', () => {
    expect(
      resolveActiveSpell({
        weaponId: PURGING_STAFF,
        selectedStyleIndex: BASH_INDEX,
        selectedSpell: 'Ice Barrage',
        spellbook: 'ancient',
      }),
    ).toBeNull();
    expect(
      resolveActiveSpell({
        weaponId: DRAGON_SCIMITAR,
        selectedStyleIndex: 0,
        selectedSpell: 'Ice Barrage',
        spellbook: 'ancient',
      }),
    ).toBeNull();
  });

  it("does not cast a selected spell through Tumeken's shadow", () => {
    expect(
      resolveActiveSpell({
        weaponId: TUMEKENS_SHADOW,
        selectedStyleIndex: 1,
        selectedSpell: 'Blood Barrage',
        spellbook: 'ancient',
      }),
    ).toBeNull();
  });

  it('carries the fixed hit delay only for spells that have one', () => {
    expect(
      resolveActiveSpell({
        weaponId: PURGING_STAFF,
        selectedStyleIndex: CASTING_INDEX,
        selectedSpell: 'Dark Demonbane',
        spellbook: 'arceuus',
      })?.fixedHitDelay,
    ).toBe(2);
    expect(
      resolveActiveSpell({
        weaponId: PURGING_STAFF,
        selectedStyleIndex: CASTING_INDEX,
        selectedSpell: 'Ice Barrage',
        spellbook: 'ancient',
      })?.fixedHitDelay,
    ).toBeUndefined();
  });
});

describe('effective combat params follow the selected spell', () => {
  it('uses spell range when a spell is selected on a weapon with no default autocast', () => {
    // Dragon scimitar has no casting stance, so range stays melee regardless.
    expect(getPlayerEffectiveCombatParams(makePlayer(DRAGON_SCIMITAR, 0, 'Ice Barrage')).attackRange).toBe(1);
  });

  it('gives a selected spell 10-tile range on a casting stance', () => {
    expect(getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, CASTING_INDEX, 'Ice Barrage')).attackRange).toBe(
      10,
    );
  });

  it('keeps melee range on a melee stance even with a spell selected', () => {
    expect(getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, BASH_INDEX, 'Ice Barrage')).attackRange).toBe(1);
  });
});

describe('spell catalog', () => {
  it('exposes autocast entries as readonly first-party spell records', () => {
    expectTypeOf(getAutocastableSpells('standard')).toEqualTypeOf<readonly OsrsSpell[]>();
  });

  it('offers all 16 Ancient combat spells as autocasts', () => {
    const ancient = getAutocastableSpells('ancient');
    expect(ancient).toHaveLength(16);
    expect(ancient.map((s) => s.name)).toContain('Ice Barrage');
    expect(ancient.map((s) => s.name)).toContain('Blood Barrage');
  });

  it('marks only Burst and Barrage spells as nine-target true-tile casts', () => {
    const multiTargetSpells = [
      'Smoke Burst',
      'Shadow Burst',
      'Blood Burst',
      'Ice Burst',
      'Smoke Barrage',
      'Shadow Barrage',
      'Blood Barrage',
      'Ice Barrage',
    ];

    for (const spell of multiTargetSpells) {
      expect(getSpellCastInfo(spell)?.multiTarget, spell).toEqual({ radius: 1, maxTargets: 9 });
    }
    expect(getSpellCastInfo('Ice Blitz')?.multiTarget).toBeUndefined();
    expect(getSpellCastInfo('Fire Surge')?.multiTarget).toBeUndefined();
  });

  it('excludes Arceuus utility casts from the autocast list', () => {
    const arceuusNames = getAutocastableSpells('arceuus').map((s) => s.name);
    expect(arceuusNames).toContain('Dark Demonbane');
    expect(arceuusNames).not.toContain('Dark Lure');
    expect(isAutocastableSpell('Greater Corruption')).toBe(false);
  });

  it('derives interface icon names that match the setup-generated sprites', () => {
    expect(spellIconName('Ice Barrage')).toBe('ice_barrage');
    expect(spellIconName('Dark Demonbane')).toBe('dark_demonbane');
    expect(getSpellCastInfo('Shadow Rush')?.icon).toBe('shadow_rush');
  });

  it('uses packet-captured visuals for Ancient spells', () => {
    expect(getSpellVisuals('Ice Burst')).toMatchObject({
      castAnimationId: 10092,
      hitSpotanimId: 363,
      projectileId: 366,
    });
    expect(getSpellVisuals('Ice Barrage')).toMatchObject({
      castAnimationId: 10092,
      hitSpotanimId: 369,
      projectileId: 368,
    });
  });
});

describe('spellbook persistence', () => {
  it('defaults to Arceuus for loadouts saved without a spellbook', () => {
    expect(createEmptyCombatSupplies().spellbook).toBe('arceuus');
    expect(normalizeCombatSupplies({ selectedSpell: 'Ice Burst' }).spellbook).toBe('arceuus');
  });

  it('round-trips a stored spellbook and rejects an unknown one', () => {
    expect(normalizeCombatSupplies({ spellbook: 'ancient' }).spellbook).toBe('ancient');
    expect(normalizeCombatSupplies({ spellbook: 'runic' }).spellbook).toBe('arceuus');
  });

  it('clones and compares the spellbook', () => {
    const supplies = { ...createEmptyCombatSupplies(), spellbook: 'ancient' as const };
    expect(cloneCombatSupplies(supplies).spellbook).toBe('ancient');
    expect(combatSuppliesEqual(supplies, createEmptyCombatSupplies())).toBe(false);
    expect(combatSuppliesEqual(supplies, cloneCombatSupplies(supplies))).toBe(true);
  });
});
