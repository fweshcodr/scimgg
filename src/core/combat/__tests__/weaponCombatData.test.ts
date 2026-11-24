import { describe, expect, it } from 'vitest';
import { findEquipmentCatalogItem } from '../../../data/equipmentCatalog';
import { EQUIPMENT_COMBAT_FAMILIES } from '../../../data/equipmentCombatFamilies';
import { passesWeaponCapabilityChecks } from '../../../data/equipmentSupport';
import {
  DEFAULT_ANIMATION_SET,
  getWeaponAnimationSetWithFallbacks,
  getWeaponStyleAttackAnimation,
} from '../../../data/weaponAnimations';
import { getWeaponCombatVisuals } from '../../../data/weaponCombatVisuals';
import {
  findWeaponCategoryKey,
  getDefaultAttackStyleIndex,
  getWeaponCategory,
  getWeaponCategoryKey,
} from '../../../types/attackStyles';
import { calculateProjectileEndTime, hitDelayFromEndTime } from '../hitDelay';
import { SPECIAL_ATTACK_REGISTRY } from '../player/specialAttacks/registry';
import {
  formulaStyleToAttackKind,
  getEffectiveCombatParams,
  getFormulaStyle,
  getHitDelayModel,
  getPoweredStaffBaseMaxHit,
  getProjectileTiming,
  getRangedDefenceType,
} from '../weaponCombatData';

describe.each(EQUIPMENT_COMBAT_FAMILIES)('combat family $baseId', ({ baseId, variantIds }) => {
  it.each(variantIds)('inherits category and default stance when item %i is cosmetic', (variantId) => {
    const expectedCategory = findWeaponCategoryKey(baseId);
    expect(findWeaponCategoryKey(variantId)).toBe(expectedCategory);
    expect(getWeaponCategory(variantId)).toEqual(getWeaponCategory(baseId));
    expect(getDefaultAttackStyleIndex(variantId)).toBe(getDefaultAttackStyleIndex(baseId));
  });

  it.each(variantIds)('inherits combat timing and charged max hit when item %i is cosmetic', (variantId) => {
    const styles = getWeaponCategory(baseId).styles;
    for (const [styleIndex] of styles.entries()) {
      expect(getFormulaStyle(variantId, styleIndex)).toBe(getFormulaStyle(baseId, styleIndex));
      expect(getEffectiveCombatParams(5, 7, variantId, styleIndex)).toEqual(
        getEffectiveCombatParams(5, 7, baseId, styleIndex),
      );
    }
    expect(getHitDelayModel(variantId)).toBe(getHitDelayModel(baseId));
    expect(getProjectileTiming(variantId)).toEqual(getProjectileTiming(baseId));
    expect(getProjectileTiming(variantId, true)).toEqual(getProjectileTiming(baseId, true));
    expect(getPoweredStaffBaseMaxHit(variantId, 99)).toBe(getPoweredStaffBaseMaxHit(baseId, 99));
  });
});

describe('burning claws visuals', () => {
  const BURNING_CLAWS = 29577;

  it('animates the ordinary swing per style rather than with the special clip', () => {
    expect(getWeaponStyleAttackAnimation(BURNING_CLAWS, 'melee_slash')).toBe(393);
    expect(getWeaponStyleAttackAnimation(BURNING_CLAWS, 'melee_stab')).toBe(1067);
  });

  it('keeps the special attack clip and spotanim off the ordinary swing', () => {
    // The generated table files the SPECIAL's 11140/2814 in this weapon's ordinary-attack fields,
    // so without the override every auto paints the spec's spotanim. Regenerating that table
    // without the override would bring that back silently.
    const visuals = getWeaponCombatVisuals(BURNING_CLAWS);

    expect(visuals?.castSpotanim).toBe(-1);
    expect(visuals?.attackAnimation).not.toBe(11140);
    expect(SPECIAL_ATTACK_REGISTRY[BURNING_CLAWS]?.animationId).toBe(11140);
    expect(SPECIAL_ATTACK_REGISTRY[BURNING_CLAWS]?.graphicId).toBe(2814);
  });
});

describe('capture-backed projectile timing', () => {
  // Each arrives at `starttime + (endtime - starttime)`, fitted against the target's footprint.
  it.each([
    // Eye of Ayak: 46 + 5d on 486/487 launches across the ToB captures.
    ['Eye of Ayak', 31113, false, [51, 56, 61, 86]],
    // Scorching bow special: 50 + 4d on 10/10 specs across the Yama sensory captures.
    ['Scorching bow special', 29591, true, [54, 58, 62, 82]],
  ] as const)('lands the %s at its captured end cycle', (_what, weaponId, special, expected) => {
    const timing = getProjectileTiming(weaponId, special);
    if (!timing) expect.fail('expected a projectile timing');
    expect([1, 2, 3, 8].map((distance) => calculateProjectileEndTime(timing, distance))).toEqual(expected);
  });
});

describe('getHitDelayModel', () => {
  it('should return melee for unarmed', () => {
    expect(getHitDelayModel(undefined)).toBe('melee');
  });

  it('should return magic for powered_staff category', () => {
    // Tumeken's shadow (27275) has item override, test a generic powered_staff
    // by passing formulaStyle='magic' with no category
    expect(getHitDelayModel(undefined, 'magic')).toBe('magic');
  });

  it('should return magic_slow for tumekens shadow (item override)', () => {
    expect(getHitDelayModel(27275)).toBe('magic_slow');
  });

  it('should return magic when formulaStyle is magic and no category hit delay defined', () => {
    // Using an unknown weapon ID with no category entry:
    expect(getHitDelayModel(99999, 'magic')).toBe('magic');
  });

  it('should return melee when formulaStyle is melee_stab', () => {
    expect(getHitDelayModel(99999, 'melee_stab')).toBe('melee');
  });

  it('should return category hit delay even when formulaStyle differs', () => {
    // Tumeken's shadow has item override 'magic_slow' regardless of formulaStyle:
    expect(getHitDelayModel(27275, 'ranged')).toBe('magic_slow');
  });
});

// /w/Attack_types § Ranged types: thrown weapons and the blowpipe are light, bows and the atlatl
// standard, crossbows heavy.
describe('getRangedDefenceType', () => {
  it.each([
    { weapon: 'Toxic blowpipe', weaponId: 12926, expected: 'light' },
    { weapon: 'Rune crossbow', weaponId: 9185, expected: 'heavy' },
    { weapon: 'Armadyl crossbow', weaponId: 11785, expected: 'heavy' },
    { weapon: 'Zaryte crossbow', weaponId: 26374, expected: 'heavy' },
    { weapon: 'Twisted bow', weaponId: 20997, expected: 'standard' },
    { weapon: 'Dark bow', weaponId: 11235, expected: 'standard' },
    { weapon: 'Crystal bow', weaponId: 23983, expected: 'standard' },
    { weapon: 'Bow of faerdhinen', weaponId: 25865, expected: 'standard' },
    { weapon: 'Eclipse atlatl', weaponId: 29000, expected: 'standard' },
    { weapon: 'Chinchompa', weaponId: 10033, expected: 'heavy' },
    { weapon: 'Red chinchompa', weaponId: 10034, expected: 'heavy' },
    { weapon: 'Black chinchompa', weaponId: 11959, expected: 'heavy' },
  ] as const)('$weapon rolls against $expected ranged defence', ({ weaponId, expected }) => {
    expect(getRangedDefenceType(weaponId)).toBe(expected);
  });

  it('defaults to standard when the weapon has no ranged category', () => {
    expect(getRangedDefenceType(undefined)).toBe('standard');
    expect(getRangedDefenceType(4151)).toBe('standard');
  });
});

describe('getFormulaStyle', () => {
  it('should return melee_crush for unarmed', () => {
    expect(getFormulaStyle(undefined)).toBe('melee_crush');
  });
});

describe('maximum attack range', () => {
  const TWISTED_BOW = 20997; // cache range 10, speed 6
  const CRYSTAL_BOW = 23983; // a bow, given a 7-tile base below
  const LONGRANGE = 2;

  it('stops Longrange at 10 tiles: the Twisted bow reaches 10, not 12', () => {
    expect(getEffectiveCombatParams(6, 10, TWISTED_BOW, LONGRANGE)).toEqual({ attackSpeed: 6, attackRange: 10 });
    expect(getEffectiveCombatParams(6, 10, TWISTED_BOW, 0)).toEqual({ attackSpeed: 6, attackRange: 10 });
  });

  it('still adds Longrange in full below the cap', () => {
    expect(getEffectiveCombatParams(5, 7, CRYSTAL_BOW, LONGRANGE).attackRange).toBe(9);
    expect(getEffectiveCombatParams(5, 8, CRYSTAL_BOW, LONGRANGE).attackRange).toBe(10);
    expect(getEffectiveCombatParams(5, 9, CRYSTAL_BOW, LONGRANGE).attackRange).toBe(10);
  });

  it('caps every style, not only Longrange', () => {
    expect(getEffectiveCombatParams(4, 12, CRYSTAL_BOW, 0).attackRange).toBe(10);
    expect(getEffectiveCombatParams(4, 12, 4151, 0).attackRange).toBe(10);
  });
});

describe.each([10033, 10034, 11959])('chinchompa %i', (weaponId) => {
  // The cache's 4-tick speed and 9-tile range for every color.
  const BASE_SPEED = 4;
  const BASE_RANGE = 9;

  it('throws Short, Medium and Long fuses as ranged Accurate, Rapid and Longrange', () => {
    expect(findWeaponCategoryKey(weaponId)).toBe('chinchompa');
    expect(getWeaponCategory(weaponId).styles.map(({ name, combatStyle }) => [name, combatStyle])).toEqual([
      ['Short fuse', 'Accurate'],
      ['Medium fuse', 'Rapid'],
      ['Long fuse', 'Longrange'],
    ]);
    for (const styleIndex of [0, 1, 2]) expect(getFormulaStyle(weaponId, styleIndex)).toBe('ranged');
  });

  it.each([
    { fuse: 'Short', styleIndex: 0, attackSpeed: 4, attackRange: 9 },
    { fuse: 'Medium', styleIndex: 1, attackSpeed: 3, attackRange: 9 },
    // Longrange's usual +2 would reach 11.
    { fuse: 'Long', styleIndex: 2, attackSpeed: 4, attackRange: 10 },
  ])('$fuse fuse attacks every $attackSpeed ticks from $attackRange tiles', ({
    styleIndex,
    attackSpeed,
    attackRange,
  }) => {
    expect(getEffectiveCombatParams(BASE_SPEED, BASE_RANGE, weaponId, styleIndex)).toEqual({
      attackSpeed,
      attackRange,
    });
  });

  it('times its grenade by the captured 32 + 5 * distance, so it lands 2 ticks out at 4 tiles and 3 at 9', () => {
    const timing = getProjectileTiming(weaponId);
    if (!timing) expect.fail('expected a projectile timing');
    expect([4, 9].map((distance) => calculateProjectileEndTime(timing, distance))).toEqual([52, 77]);
    // Not the thrown-weapon fallback, `1 + floor(distance / 6)`, which gives 1 and 2.
    expect([4, 9].map((distance) => hitDelayFromEndTime(calculateProjectileEndTime(timing, distance)))).toEqual([2, 3]);
    // The grenade leaves at the captured `starttime=21` that the renderer draws from.
    expect(timing.delay).toBe(getWeaponCombatVisuals(weaponId)?.projectileStartDelay);
  });

  it('throws the captured chinchompa animation rather than the bare-fist punch', () => {
    expect(getWeaponCombatVisuals(weaponId)?.attackAnimation).toBe(7618);
    expect(getWeaponAnimationSetWithFallbacks(weaponId).find((set) => set.attack !== undefined)?.attack).toBe(7618);
    expect(passesWeaponCapabilityChecks(weaponId)).toBe(true);
  });
});

describe('getPoweredStaffBaseMaxHit', () => {
  it.each([
    { itemId: 11907, expected: 28 },
    { itemId: 12899, expected: 31 },
    { itemId: 22323, expected: 33 },
    { itemId: 25731, expected: 33 },
    { itemId: 27275, expected: 34 },
    { itemId: 28585, expected: 47 },
    { itemId: 22555, expected: 25 },
    { itemId: 27665, expected: 27 },
    { itemId: 28796, expected: 38 },
    { itemId: 23898, expected: 23 },
    { itemId: 23899, expected: 31 },
    { itemId: 23900, expected: 39 },
  ])('resolves item $itemId at 99 Magic', ({ itemId, expected }) => {
    expect(getPoweredStaffBaseMaxHit(itemId, 99)).toBe(expected);
  });

  it('applies the Sanguinesti minimum at low visible Magic', () => {
    expect(getPoweredStaffBaseMaxHit(22323, 1)).toBe(6);
  });

  it('returns undefined for a non-powered weapon', () => {
    expect(getPoweredStaffBaseMaxHit(4587, 99)).toBeUndefined();
  });

  it.each([
    22481, 22552, 25733, 27277, 27662, 28549, 28583, 31115,
  ])('returns undefined for uncharged staff %s', (itemId) => {
    expect(getPoweredStaffBaseMaxHit(itemId, 99)).toBeUndefined();
  });
});

const MELEE_WEAPON_PROFILES = [
  {
    id: 11889,
    name: 'Zamorakian hasta',
    categoryKey: 'spear',
    twoHanded: false,
    styles: ['Lunge', 'Swipe', 'Pound', 'Block'],
    formulaStyles: ['melee_stab', 'melee_slash', 'melee_crush', 'melee_stab'],
    styleAnimations: [381, 440, 419, 381],
    specEnergyCost: 25,
  },
  {
    id: 23528,
    name: 'Sarachnis cudgel',
    categoryKey: 'spiked',
    twoHanded: false,
    styles: ['Pound', 'Pummel', 'Spike', 'Block'],
    formulaStyles: ['melee_crush', 'melee_crush', 'melee_stab', 'melee_crush'],
    styleAnimations: [401, 401, 400, 401],
    specEnergyCost: undefined,
  },
  {
    id: 13263,
    name: 'Abyssal bludgeon',
    categoryKey: 'bludgeon',
    twoHanded: true,
    styles: ['Pound', 'Pummel', 'Smash'],
    formulaStyles: ['melee_crush', 'melee_crush', 'melee_crush'],
    styleAnimations: [3298, 3298, 3298],
    specEnergyCost: undefined,
  },
] as const;

describe.each(MELEE_WEAPON_PROFILES)('$name ($id)', (profile) => {
  it('resolves to its OSRS weapon category', () => {
    expect(getWeaponCategoryKey(profile.id)).toBe(profile.categoryKey);
    expect(getWeaponCategory(profile.id).styles.map((style) => style.name)).toEqual([...profile.styles]);
  });

  it('rolls each style against the accuracy formula the wiki lists', () => {
    const resolved = profile.formulaStyles.map((_, index) => getFormulaStyle(profile.id, index));
    expect(resolved).toEqual([...profile.formulaStyles]);
  });

  // Reads as a tautology and is not one: `getEffectiveCombatParams` shifts speed and range on
  // Rapid/Longrange styles, so this fails the moment a category's styles take a ranged shape.
  it('leaves the cache speed and range untouched for every style', () => {
    for (let index = 0; index < profile.styles.length; index++) {
      expect(getEffectiveCombatParams(4, 1, profile.id, index)).toEqual({ attackSpeed: 4, attackRange: 1 });
    }
  });

  it('passes the automatic weapon capability checks', () => {
    const piece = findEquipmentCatalogItem(profile.id);
    expect(piece).toMatchObject({ name: profile.name, slot: 'weapon', isTwoHanded: profile.twoHanded });
    if (piece === undefined) {
      throw new Error(`Missing equipment catalog item ${profile.id}`);
    }
    expect(passesWeaponCapabilityChecks(piece.id)).toBe(true);
  });

  it('swings its own animation rather than the bare-fist punch', () => {
    const attack = getWeaponAnimationSetWithFallbacks(profile.id).find((set) => set.attack !== undefined)?.attack;
    expect(attack).toBeDefined();
    expect(attack).not.toBe(DEFAULT_ANIMATION_SET.attack);
  });

  it('charges the special attack energy the weapon actually costs', () => {
    expect(SPECIAL_ATTACK_REGISTRY[profile.id]?.energyCost).toBe(profile.specEnergyCost);
  });

  it('swings the captured clip for the style each button rolls', () => {
    const category = getWeaponCategory(profile.id);
    const resolved = profile.formulaStyles.map((formulaStyle) =>
      getWeaponStyleAttackAnimation(profile.id, formulaStyleToAttackKind(formulaStyle)),
    );
    expect(resolved).toEqual([...profile.styleAnimations]);
    expect(resolved).toHaveLength(category.styles.length);
  });
});

it.each([1249, 1263, 5716, 5730, 11824, 11889])('charges 25%% energy for Shove weapon %i', (weaponId) => {
  expect(SPECIAL_ATTACK_REGISTRY[weaponId]).toMatchObject({ animationId: 1064, energyCost: 25 });
});
