import { describe, expect, it } from 'vitest';
import { getSpellVisuals } from '../../../data/spellVisuals';
import {
  getAutocastSpell,
  getDefaultAttackStyleIndex,
  getWeaponCategory,
  ITEM_WEAPON_CATEGORY,
} from '../../../types/attackStyles';
import { calculateHitDelay } from '../hitDelay';
import { getFormulaStyle, getHitDelayModel, getPlayerEffectiveCombatParams } from '../weaponCombatData';

const PURGING_STAFF = 29594;
const DRAGON_SCIMITAR = 4587;
const EMBERLIGHT = 29589;
const TUMEKENS_SHADOW = 27275;

const BASH_INDEX = 0;
const POUND_INDEX = 1;
const FOCUS_INDEX = 2;
const CASTING_INDEX = 3;
const DEFENSIVE_CASTING_INDEX = 4;

function makePlayer(weaponId: number | undefined, styleIndex: number) {
  return {
    equipmentStats: { attackSpeed: 4, attackRange: 1 },
    equipment: { weapon: weaponId },
    selectedAttackStyleIndex: styleIndex,
  };
}

describe('Autocast spell selection', () => {
  it('returns Dark Demonbane for Purging Staff on Casting', () => {
    const spell = getAutocastSpell(PURGING_STAFF, CASTING_INDEX);
    expect(spell).not.toBeNull();
    expect(spell!.name).toBe('Dark Demonbane');
  });

  it('returns Dark Demonbane for Purging Staff on Defensive Casting', () => {
    const spell = getAutocastSpell(PURGING_STAFF, DEFENSIVE_CASTING_INDEX);
    expect(spell).not.toBeNull();
    expect(spell!.name).toBe('Dark Demonbane');
  });

  it('returns null for Purging Staff on Bash (melee)', () => {
    expect(getAutocastSpell(PURGING_STAFF, BASH_INDEX)).toBeNull();
  });

  it('returns null for Purging Staff on Pound (melee)', () => {
    expect(getAutocastSpell(PURGING_STAFF, POUND_INDEX)).toBeNull();
  });

  it('returns null for Purging Staff on Focus (melee)', () => {
    expect(getAutocastSpell(PURGING_STAFF, FOCUS_INDEX)).toBeNull();
  });

  it('returns null for weapon without autocast config', () => {
    expect(getAutocastSpell(DRAGON_SCIMITAR, 0)).toBeNull();
  });

  it('returns null for undefined weapon', () => {
    expect(getAutocastSpell(undefined, CASTING_INDEX)).toBeNull();
  });

  it('returns null for out-of-bounds style index', () => {
    expect(getAutocastSpell(PURGING_STAFF, 99)).toBeNull();
  });

  it('spell info has correct spellbook', () => {
    const spell = getAutocastSpell(PURGING_STAFF, CASTING_INDEX)!;
    expect(spell.spellbook).toBe('arceuus');
  });

  it('spell info has attack range of 10', () => {
    const spell = getAutocastSpell(PURGING_STAFF, CASTING_INDEX)!;
    expect(spell.attackRange).toBe(10);
  });

  it('spell info has fixed hit delay of 2', () => {
    const spell = getAutocastSpell(PURGING_STAFF, CASTING_INDEX)!;
    expect(spell.fixedHitDelay).toBe(2);
  });

  it('spell info carries the interface sprite base name', () => {
    const spell = getAutocastSpell(PURGING_STAFF, CASTING_INDEX)!;
    expect(spell.icon).toBe('dark_demonbane');
  });
});

describe('Autocast attack range', () => {
  it('Purging Staff melee style → weapon range (1)', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, BASH_INDEX));
    expect(params.attackRange).toBe(1);
  });

  it('Purging Staff Casting style → spell range (10)', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, CASTING_INDEX));
    expect(params.attackRange).toBe(10);
  });

  it('Purging Staff Defensive Casting → spell range (10)', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, DEFENSIVE_CASTING_INDEX));
    expect(params.attackRange).toBe(10);
  });

  it('weapon without autocast on casting-like style retains base range', () => {
    // Dragon scimitar is slash_sword, no casting styles — all melee
    const params = getPlayerEffectiveCombatParams(makePlayer(DRAGON_SCIMITAR, 0));
    expect(params.attackRange).toBe(1);
  });

  it('unarmed retains base range', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(undefined, 0));
    expect(params.attackRange).toBe(1);
  });
});

describe('Autocast attack speed', () => {
  it('Purging Staff Casting style → speed 5 (standard cast speed)', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, CASTING_INDEX));
    expect(params.attackSpeed).toBe(5);
  });

  it('Purging Staff Defensive Casting → speed 5', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, DEFENSIVE_CASTING_INDEX));
    expect(params.attackSpeed).toBe(5);
  });

  it('Purging Staff Bash → weapon base speed (4)', () => {
    const params = getPlayerEffectiveCombatParams(makePlayer(PURGING_STAFF, BASH_INDEX));
    expect(params.attackSpeed).toBe(4);
  });
});

describe('Autocast formula style', () => {
  it('Purging Staff Casting → magic', () => {
    expect(getFormulaStyle(PURGING_STAFF, CASTING_INDEX)).toBe('magic');
  });

  it('Purging Staff Defensive Casting → magic', () => {
    expect(getFormulaStyle(PURGING_STAFF, DEFENSIVE_CASTING_INDEX)).toBe('magic');
  });

  it('Purging Staff Bash → melee_crush', () => {
    expect(getFormulaStyle(PURGING_STAFF, BASH_INDEX)).toBe('melee_crush');
  });
});

describe('Autocast hit delay', () => {
  it('Dark Demonbane uses fixed 2-tick delay regardless of distance', () => {
    const spell = getAutocastSpell(PURGING_STAFF, CASTING_INDEX)!;
    expect(spell.fixedHitDelay).toBe(2);

    // fixedHitDelay is constant regardless of distance
    expect(spell.fixedHitDelay).toBe(2);
  });

  it('standard magic formula is distance-based: 1 + floor((distance + 1) / 3)', () => {
    expect(calculateHitDelay('magic', 1)).toBe(1);
    expect(calculateHitDelay('magic', 2)).toBe(2);
    expect(calculateHitDelay('magic', 5)).toBe(3);
    expect(calculateHitDelay('magic', 8)).toBe(4);
    expect(calculateHitDelay('magic', 10)).toBe(4);
  });

  it('melee is always 1 tick regardless of distance', () => {
    expect(calculateHitDelay('melee', 1)).toBe(1);
    expect(calculateHitDelay('melee', 10)).toBe(1);
  });

  it('uses the bow hit-delay distance bands', () => {
    expect(Array.from({ length: 10 }, (_, index) => calculateHitDelay('bow', index + 1))).toEqual([
      1, 1, 2, 2, 2, 2, 2, 2, 3, 3,
    ]);
  });

  it('staff category without autocast uses melee hit delay model', () => {
    // Staff category defaults to 'melee' in CATEGORY_HIT_DELAY
    expect(getHitDelayModel(PURGING_STAFF)).toBe('melee');
  });

  it('staff with autocast and magic formula style → magic hit delay model', () => {
    expect(getHitDelayModel(PURGING_STAFF, 'magic')).toBe('melee');
    // Category 'staff' explicitly maps to 'melee', so it takes priority.
    // The autocast system uses fixedHitDelay directly, bypassing the model.
  });
});

describe('Spell visuals registry', () => {
  it('Dark Demonbane has correct cast animation', () => {
    const visuals = getSpellVisuals('Dark Demonbane')!;
    expect(visuals.castAnimationId).toBe(8977);
  });

  it('Dark Demonbane has correct cast spotanim', () => {
    const visuals = getSpellVisuals('Dark Demonbane')!;
    expect(visuals.castSpotanimId).toBe(1869);
  });

  it('Dark Demonbane has correct hit spotanim', () => {
    const visuals = getSpellVisuals('Dark Demonbane')!;
    expect(visuals.hitSpotanimId).toBe(1870);
  });

  it('Dark Demonbane has no projectile', () => {
    const visuals = getSpellVisuals('Dark Demonbane')!;
    expect(visuals.projectileId).toBe(-1);
  });

  it('all Demonbane spells share cast animation 8977', () => {
    for (const name of ['Inferior Demonbane', 'Superior Demonbane', 'Dark Demonbane']) {
      const visuals = getSpellVisuals(name)!;
      expect(visuals.castAnimationId).toBe(8977);
    }
  });

  it('each Demonbane spell has unique cast spotanim', () => {
    const ids = new Set([
      getSpellVisuals('Inferior Demonbane')!.castSpotanimId,
      getSpellVisuals('Superior Demonbane')!.castSpotanimId,
      getSpellVisuals('Dark Demonbane')!.castSpotanimId,
    ]);
    expect(ids.size).toBe(3);
  });

  it('each Demonbane spell has unique hit spotanim', () => {
    const ids = new Set([
      getSpellVisuals('Inferior Demonbane')!.hitSpotanimId,
      getSpellVisuals('Superior Demonbane')!.hitSpotanimId,
      getSpellVisuals('Dark Demonbane')!.hitSpotanimId,
    ]);
    expect(ids.size).toBe(3);
  });

  it('all Demonbane spells are direct-hit (no projectile)', () => {
    for (const name of ['Inferior Demonbane', 'Superior Demonbane', 'Dark Demonbane']) {
      expect(getSpellVisuals(name)!.projectileId).toBe(-1);
    }
  });

  it('returns undefined for unknown spell', () => {
    expect(getSpellVisuals('Unknown Spell')).toBeUndefined();
  });

  it('Inferior Demonbane spotanims: cast=1865, hit=1866', () => {
    const v = getSpellVisuals('Inferior Demonbane')!;
    expect(v.castSpotanimId).toBe(1865);
    expect(v.hitSpotanimId).toBe(1866);
  });

  it('Superior Demonbane spotanims: cast=1867, hit=1868', () => {
    const v = getSpellVisuals('Superior Demonbane')!;
    expect(v.castSpotanimId).toBe(1867);
    expect(v.hitSpotanimId).toBe(1868);
  });
});

describe('Weapon category mapping', () => {
  it('Purging Staff maps to staff category', () => {
    const category = getWeaponCategory(PURGING_STAFF);
    expect(category.name).toBe('Staff');
  });

  it('staff category has 5 styles (3 melee + 2 casting)', () => {
    const category = getWeaponCategory(PURGING_STAFF);
    expect(category.styles).toHaveLength(5);
  });

  it('staff Casting style has Magic attack type', () => {
    const category = getWeaponCategory(PURGING_STAFF);
    expect(category.styles[CASTING_INDEX].attackType).toBe('Magic');
    expect(category.styles[CASTING_INDEX].combatStyle).toBe('Casting');
  });

  it('staff Defensive Casting style has Magic attack type', () => {
    const category = getWeaponCategory(PURGING_STAFF);
    expect(category.styles[DEFENSIVE_CASTING_INDEX].attackType).toBe('Magic');
    expect(category.styles[DEFENSIVE_CASTING_INDEX].combatStyle).toBe('Defensive Casting');
  });

  it('staff melee styles have Crush attack type', () => {
    const category = getWeaponCategory(PURGING_STAFF);
    for (const idx of [BASH_INDEX, POUND_INDEX, FOCUS_INDEX]) {
      expect(category.styles[idx].attackType).toBe('Crush');
    }
  });

  it.each([
    22325, 22486, 25736, 25738, 25739, 25741, 28543, 28545,
  ])('maps Scythe variant %i to the generated catalog category', (weaponId) => {
    expect(ITEM_WEAPON_CATEGORY[weaponId]).toBe('scythe');
  });

  it.each([28997, 29850])('maps Dual macuahuitl variant %i to the generated catalog category', (weaponId) => {
    expect(ITEM_WEAPON_CATEGORY[weaponId]).toBe('spiked');
  });
});

describe('Default attack style index', () => {
  it('defaults an Arceuus staff to Casting with Dark Demonbane', () => {
    expect(getDefaultAttackStyleIndex(PURGING_STAFF, 'arceuus')).toBe(CASTING_INDEX);
    expect(getAutocastSpell(PURGING_STAFF, CASTING_INDEX, 'arceuus')?.name).toBe('Dark Demonbane');
  });

  // Kodai wand, then the Nightmare, Volatile and Eldritch Nightmare staves.
  it.each([21006, 24422, 24424, 24425])('defaults Ancient staff %i to Casting with Blood Barrage', (weaponId) => {
    expect(getDefaultAttackStyleIndex(weaponId, 'ancient')).toBe(CASTING_INDEX);
    expect(getAutocastSpell(weaponId, CASTING_INDEX, 'ancient')?.name).toBe('Blood Barrage');
  });

  it.each([11791, 22296])('does not grant Ancient autocast to unsupported staff %i', (weaponId) => {
    expect(getDefaultAttackStyleIndex(weaponId, 'ancient')).toBe(POUND_INDEX);
    expect(getAutocastSpell(weaponId, CASTING_INDEX, 'ancient')).toBeNull();
  });

  it('slash sword defaults to Slash (index 1)', () => {
    expect(getDefaultAttackStyleIndex(DRAGON_SCIMITAR)).toBe(1);
    expect(getDefaultAttackStyleIndex(EMBERLIGHT)).toBe(1);
  });

  it('undefined weapon defaults to 0', () => {
    expect(getDefaultAttackStyleIndex(undefined)).toBe(0);
  });

  it('unknown weapon ID defaults to 0', () => {
    expect(getDefaultAttackStyleIndex(99999)).toBe(0);
  });

  it('autocast weapon returns first Casting style, not Defensive Casting', () => {
    const defaultIndex = getDefaultAttackStyleIndex(PURGING_STAFF, 'arceuus');
    const category = getWeaponCategory(PURGING_STAFF);
    expect(category.styles[defaultIndex].combatStyle).toBe('Casting');
  });

  it("does not expose autocast for Tumeken's shadow and defaults it to Longrange", () => {
    const category = getWeaponCategory(TUMEKENS_SHADOW);

    expect(category.styles.map(({ combatStyle }) => combatStyle)).toEqual(['Accurate', 'Longrange']);
    expect(category.styles[getDefaultAttackStyleIndex(TUMEKENS_SHADOW, 'ancient')].combatStyle).toBe('Longrange');
  });

  it('gives the whip Accurate Flick, Controlled Lash and Defensive Deflect, defaulting to Flick', () => {
    const category = getWeaponCategory(4151);

    expect(category.styles.map(({ name, combatStyle }) => [name, combatStyle])).toEqual([
      ['Flick', 'Accurate'],
      ['Lash', 'Controlled'],
      ['Deflect', 'Defensive'],
    ]);
    expect(category.styles[getDefaultAttackStyleIndex(4151)].name).toBe('Flick');
  });

  it('applies the default-style priority to every mapped weapon', () => {
    const expectedByCategory: Readonly<Record<string, number>> = {
      '2h_sword': 1,
      axe: 1,
      blunt: 1,
      bludgeon: 0,
      bow: 1,
      bulwark: 0,
      chinchompa: 1, // Medium fuse (Rapid)
      claw: 1,
      crossbow: 1,
      partisan: 1,
      pickaxe: 1,
      polearm: 1,
      powered_staff: 1,
      scythe: 1,
      slash_sword: 1,
      spear: 0,
      spiked: 1,
      stab_sword: 1,
      staff: 1,
      thrown: 1,
      whip: 0, // Flick (Accurate): the explicit whip default, not the Strength ranking
    };

    for (const [weaponId, categoryKey] of Object.entries(ITEM_WEAPON_CATEGORY)) {
      expect(getDefaultAttackStyleIndex(Number(weaponId), 'standard'), `${weaponId} (${categoryKey})`).toBe(
        expectedByCategory[categoryKey],
      );
    }
  });
});
