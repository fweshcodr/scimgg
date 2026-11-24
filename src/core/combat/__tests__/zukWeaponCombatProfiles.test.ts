import { describe, expect, it } from 'vitest';
import { findEquipmentCatalogItem, getEquipmentCatalog } from '../../../data/equipmentCatalog';
import { getEquipmentCombatBaseId } from '../../../data/equipmentCombatFamilies';
import { passesWeaponCapabilityChecks } from '../../../data/equipmentSupport';
import { getSpellVisuals } from '../../../data/spellVisuals';
import { getWeaponAnimationSetWithFallbacks } from '../../../data/weaponAnimations';
import { getWeaponCombatVisuals } from '../../../data/weaponCombatVisuals';
import { WEAPON_ANIMATION_SETS, WEAPON_COMBAT_VISUALS } from '../../../data/weaponCombatVisuals.generated';
import {
  getAutocastSpell,
  getDefaultAttackStyleIndex,
  getWeaponCategory,
  getWeaponCategoryKey,
  ITEM_WEAPON_CATEGORY,
} from '../../../types/attackStyles';
import { calculateProjectileEndTime, hitDelayFromEndTime, PROJ_ANIM_TIMINGS } from '../hitDelay';
import { getEffectiveCombatParams, getFormulaStyle, getHitDelayModel, getProjectileTiming } from '../weaponCombatData';

const RANGED_WEAPONS = [
  { id: 20997, categoryKey: 'bow', baseSpeed: 6, baseRange: 10, twoHanded: true },
  { id: 23983, categoryKey: 'bow', baseSpeed: 5, baseRange: 10, twoHanded: true },
  { id: 25865, categoryKey: 'bow', baseSpeed: 5, baseRange: 10, twoHanded: true },
  { id: 25867, categoryKey: 'bow', baseSpeed: 5, baseRange: 10, twoHanded: true },
  { id: 25888, categoryKey: 'bow', baseSpeed: 5, baseRange: 10, twoHanded: true },
  { id: 9185, categoryKey: 'crossbow', baseSpeed: 6, baseRange: 7, twoHanded: false },
  { id: 29000, categoryKey: 'bow', baseSpeed: 4, baseRange: 6, twoHanded: true },
  { id: 12926, categoryKey: 'thrown', baseSpeed: 3, baseRange: 5, twoHanded: true },
  { id: 28688, categoryKey: 'thrown', baseSpeed: 3, baseRange: 5, twoHanded: true },
  { id: 11785, categoryKey: 'crossbow', baseSpeed: 6, baseRange: 8, twoHanded: false },
] as const;

const MAGIC_WEAPONS = [
  { id: 21006, baseSpeed: 4, twoHanded: false },
  { id: 30070, baseSpeed: 5, twoHanded: false },
  { id: 27624, baseSpeed: 5, twoHanded: false },
  { id: 6914, baseSpeed: 5, twoHanded: false },
  // Mage Tank's barrage switch: one-handed, 5 ticks (/w/Eldritch_Nightmare_staff).
  { id: 24425, baseSpeed: 5, twoHanded: false },
] as const;

const ZUK_WEAPON_PROFILES = [
  ...RANGED_WEAPONS.map(({ id, categoryKey }) => ({
    id,
    categoryKey,
    styleIndexes: [0, 1, 2],
    formulaStyle: 'ranged',
  })),
  ...MAGIC_WEAPONS.map(({ id }) => ({
    id,
    categoryKey: 'staff',
    styleIndexes: [3, 4],
    formulaStyle: 'magic',
  })),
] as const;

describe('Zuk preset weapon profiles', () => {
  it.each(ZUK_WEAPON_PROFILES)('maps item $id to its verified category', ({ id, categoryKey }) => {
    expect(getWeaponCategoryKey(id)).toBe(categoryKey);
  });

  it.each(ZUK_WEAPON_PROFILES)('resolves item $id attack styles to $formulaStyle', ({
    id,
    styleIndexes,
    formulaStyle,
  }) => {
    expect(styleIndexes.map((styleIndex) => getFormulaStyle(id, styleIndex))).toEqual(
      styleIndexes.map(() => formulaStyle),
    );
  });
});

describe('Zuk preset ranged weapon profiles', () => {
  it.each(RANGED_WEAPONS)('applies Rapid timing to item $id', ({ id, baseSpeed, baseRange }) => {
    expect(getEffectiveCombatParams(baseSpeed, baseRange, id, 1).attackSpeed).toBe(baseSpeed - 1);
  });

  it.each(RANGED_WEAPONS)('applies Longrange distance, up to 10 tiles, to item $id', ({ id, baseSpeed, baseRange }) => {
    expect(getEffectiveCombatParams(baseSpeed, baseRange, id, 2).attackRange).toBe(Math.min(baseRange + 2, 10));
  });

  it.each(RANGED_WEAPONS)('uses category hit timing for item $id', ({ id, categoryKey }) => {
    expect(getHitDelayModel(id)).toBe(categoryKey === 'thrown' ? 'thrown' : 'bow');
  });

  it.each(RANGED_WEAPONS)('exposes the weapon-specific projectile launch offset for item $id', ({ id }) => {
    expect(getProjectileTiming(id)?.progress).toBe(id === 12926 || id === 28688 ? 105 : 11);
  });

  it('changes only the blowpipe muzzle offset, not its damage timing or ordinary thrown darts', () => {
    expect(getProjectileTiming(12926)).toEqual({ delay: 32, lengthAdjustment: 0, stepMultiplier: 5, progress: 105 });
    expect(PROJ_ANIM_TIMINGS.thrown).toEqual({ delay: 32, lengthAdjustment: 0, stepMultiplier: 5, progress: 11 });
  });

  it.each([
    { weaponId: 28688, distance: 3, endTime: 53, hitDelay: 2, projectileId: 2599, attackAnimation: 10656 },
    { weaponId: 12926, distance: 5, endTime: 67, hitDelay: 3, projectileId: 1043, attackAnimation: 5061 },
  ])('matches the captured special for blowpipe $weaponId at distance $distance', ({
    weaponId,
    distance,
    endTime,
    hitDelay,
    projectileId,
    attackAnimation,
  }) => {
    // Stream 321 tick 116; inferno-waves-69-zuk-packet-data.txt ticks 1086/1088.
    const timing = getProjectileTiming(weaponId, true);
    if (!timing) throw new Error('Missing blowpipe special timing');

    expect(calculateProjectileEndTime(timing, distance)).toBe(endTime);
    expect(hitDelayFromEndTime(endTime)).toBe(hitDelay);
    expect(timing.progress).toBe(105);
    expect(getWeaponCombatVisuals(weaponId, 25849, true)).toMatchObject({
      attackAnimation,
      projectileId,
      projectileStartDelay: 32,
      projectileStartHeight: 142,
      projectileEndHeight: 146,
      projectileSlope: 15,
    });
  });

  // /w/Hit_delay § Bows and crossbows: 1 + floor((3 + distance) / 6), plus the tick the wiki adds
  // for attacks onto NPCs (§ Processing order delay), as the Bowfa capture below shows at distance 3.
  it.each([
    [1, 1],
    [2, 1],
    [3, 2],
    [8, 2],
    [9, 3],
    [10, 3],
  ])('lands a crystal bow shot at distance %i after the wiki %i ticks onto an NPC', (distance, wikiTicks) => {
    expect(getHitDelayModel(23983)).toBe('bow');
    const timing = getProjectileTiming(23983);
    if (!timing) throw new Error('Missing crystal bow timing');
    expect(hitDelayFromEndTime(calculateProjectileEndTime(timing, distance))).toBe(wikiTicks + 1);
  });

  it('fires the crystal bow glow arrow on the Bowfa launch profile', () => {
    // docs/research/crystal-bow.md#shot
    expect(getWeaponCombatVisuals(23983)).toMatchObject({
      attackAnimation: 426,
      castSpotanim: 250,
      castSpotanimHeight: 96,
      projectileId: 249,
      projectileStartDelay: 41,
      projectileStartHeight: 163,
      projectileEndHeight: 146,
      projectileSlope: 15,
    });
  });

  it('matches the captured Trahaearn Bowfa launch and arrival', () => {
    // capture blowpipe-spec-bowfa-attacks-packet-data.txt: tick 123, hit at tick 126.
    const timing = getProjectileTiming(25888);
    if (!timing) throw new Error('Missing Bowfa timing');

    expect(calculateProjectileEndTime(timing, 3)).toBe(61);
    expect(hitDelayFromEndTime(61)).toBe(3);
    expect(timing.progress).toBe(11);
    expect(getWeaponCombatVisuals(25888)).toMatchObject({
      attackAnimation: 426,
      castSpotanim: 1929,
      castSpotanimHeight: 96,
      projectileId: 1928,
      projectileStartDelay: 41,
      projectileStartHeight: 163,
      projectileEndHeight: 146,
      projectileSlope: 15,
    });
  });
});

describe('Zuk preset magic weapon profiles', () => {
  it.each(MAGIC_WEAPONS)('exposes shared staff casting styles for item $id', ({ id }) => {
    expect(getWeaponCategory(id).styles.map(({ combatStyle }) => combatStyle)).toEqual([
      'Accurate',
      'Aggressive',
      'Defensive',
      'Casting',
      'Defensive Casting',
    ]);
  });

  it.each(MAGIC_WEAPONS)('uses the magic formula on item $id casting styles', ({ id }) => {
    expect([3, 4].map((styleIndex) => getFormulaStyle(id, styleIndex))).toEqual(['magic', 'magic']);
  });

  it.each(MAGIC_WEAPONS)('uses standard cast timing for item $id', ({ id, baseSpeed }) => {
    expect(getEffectiveCombatParams(baseSpeed, 1, id, 3)).toEqual({ attackSpeed: 5, attackRange: 1 });
  });

  it('defaults the Dragon hunter wand to Blood Barrage on Ancient Magicks', () => {
    expect(getDefaultAttackStyleIndex(30070, 'ancient')).toBe(3);
    expect(getAutocastSpell(30070, 3, 'ancient')).toEqual({
      name: 'Blood Barrage',
      icon: 'blood_barrage',
      spellbook: 'ancient',
      attackRange: 10,
      multiTarget: { radius: 1, maxTargets: 9 },
      secondaryEffect: { kind: 'leech_hp', percentOfDamage: 25 },
    });
    expect(getAutocastSpell(30070, 4, 'ancient')?.name).toBe('Blood Barrage');
  });

  it('defaults the Eclipse atlatl to Rapid for the captured three-tick cadence', () => {
    expect(getDefaultAttackStyleIndex(29000, 'ancient')).toBe(1);
    expect(getEffectiveCombatParams(4, 6, 29000, getDefaultAttackStyleIndex(29000, 'ancient'))).toEqual({
      attackSpeed: 3,
      attackRange: 6,
    });
  });

  it('uses the selected spellbook for Kodai wand defaults', () => {
    expect(getAutocastSpell(21006, 3, 'ancient')?.name).toBe('Blood Barrage');
    expect(getAutocastSpell(21006, 4, 'arceuus')?.name).toBe('Dark Demonbane');
  });

  it('uses standard magic projectile timing for the Dragon hunter wand', () => {
    expect(getProjectileTiming(30070)).toEqual({ delay: 51, lengthAdjustment: -5, stepMultiplier: 10, progress: 64 });
  });
});

describe('Zuk preset weapon equipment metadata', () => {
  it.each([...RANGED_WEAPONS, ...MAGIC_WEAPONS])('retains handedness for item $id', ({ id, twoHanded }) => {
    expect(findEquipmentCatalogItem(id)?.isTwoHanded).toBe(twoHanded);
  });
});

describe('Zuk preset generated weapon visuals', () => {
  it.each([
    [33553, 882],
    [33559, 884],
    [33565, 886],
    [33571, 888],
    [33577, 890],
    [33583, 892],
    [33589, 21326],
    [33595, 11212],
    [33601, 4160],
  ])('reuses base arrow visuals for seeking arrow %i', (ammoId, baseId) => {
    const visuals = getWeaponCombatVisuals(20997, ammoId);

    if (baseId !== 4160) expect(visuals).toBeDefined();
    expect(visuals).toEqual(getWeaponCombatVisuals(20997, baseId));
  });
  it('covers every capable catalog weapon family that launches a projectile', () => {
    const projectileCategories = new Set(['bow', 'crossbow', 'thrown', 'powered_staff']);
    const supportedIds = getEquipmentCatalog()
      .filter((piece) => piece.slot === 'weapon' && passesWeaponCapabilityChecks(piece.id))
      .filter((piece) => projectileCategories.has(getWeaponCategoryKey(piece.id)))
      .map((piece) => piece.id);
    const supportedBaseIds = [...new Set(supportedIds.map(getEquipmentCombatBaseId))].sort(
      (left, right) => left - right,
    );

    expect(supportedBaseIds).toEqual([
      9185, 11235, 11785, 11905, 11907, 12899, 12926, 20997, 22288, 22292, 22323, 23983, 24123, 25865, 25867, 26374,
      27275, 27610, 27665, 29000, 29591, 31113,
    ]);
    for (const weaponId of supportedIds) {
      expect(getWeaponCombatVisuals(weaponId, 11212)?.projectileId, String(weaponId)).toBeGreaterThanOrEqual(0);
      expect(getProjectileTiming(weaponId), String(weaponId)).toBeDefined();
    }
  });

  it('uses the launched dragon arrow when a Twisted bow shot supplies ammunition', () => {
    const visuals = getWeaponCombatVisuals(20997, 11212);

    expect(visuals).toMatchObject({
      attackAnimation: 426,
      projectileId: 1120,
      castSpotanim: 1116,
      projectileStartDelay: 41,
      projectileStartHeight: 163,
      projectileEndHeight: 146,
      projectileSlope: 15,
    });
  });

  it.each([
    { family: 'bow', weaponId: 20997, ammoId: 882, projectileId: 10, attackAnimation: 426 },
    { family: 'bow', weaponId: 20997, ammoId: 11212, projectileId: 1120, attackAnimation: 426 },
    { family: 'bow alias ammo', weaponId: 20997, ammoId: 20389, projectileId: 1120, attackAnimation: 426 },
    { family: 'bow', weaponId: 29591, ammoId: 21326, projectileId: 1384, attackAnimation: 426 },
    { family: 'crossbow', weaponId: 9185, ammoId: 9144, projectileId: 27, attackAnimation: 7552 },
    { family: 'crossbow', weaponId: 11785, ammoId: 21905, projectileId: 1468, attackAnimation: 7552 },
    { family: 'crossbow', weaponId: 26374, ammoId: 21905, projectileId: 1468, attackAnimation: 9168 },
    { family: 'blowpipe', weaponId: 12926, ammoId: 806, projectileId: 226, attackAnimation: 5061 },
    { family: 'blowpipe', weaponId: 12926, ammoId: 11230, projectileId: 1122, attackAnimation: 5061 },
    { family: 'blowpipe', weaponId: 12926, ammoId: 25849, projectileId: 1936, attackAnimation: 5061 },
    { family: 'Blazing blowpipe', weaponId: 28688, ammoId: 25849, projectileId: 1936, attackAnimation: 10656 },
  ])('uses the launched $family ammunition for weapon $weaponId and ammo $ammoId', ({
    weaponId,
    ammoId,
    projectileId,
    attackAnimation,
  }) => {
    expect(findEquipmentCatalogItem(ammoId)).toBeDefined();
    expect(getWeaponCombatVisuals(weaponId, ammoId)).toMatchObject({ projectileId, attackAnimation });
  });

  it.each([
    { family: 'self-contained bow', weaponId: 25865, unrelatedAmmoId: 11212, projectileId: 1887 },
    { family: 'self-contained bow', weaponId: 23983, unrelatedAmmoId: 11212, projectileId: 249 },
    { family: 'self-contained bow', weaponId: 24123, unrelatedAmmoId: 11212, projectileId: 249 },
    { family: 'atlatl', weaponId: 29000, unrelatedAmmoId: 882, projectileId: 2795 },
    { family: 'powered staff', weaponId: 11907, unrelatedAmmoId: 11212, projectileId: 1252 },
    { family: 'powered staff', weaponId: 12899, unrelatedAmmoId: 11212, projectileId: 1040 },
    { family: 'powered staff', weaponId: 22323, unrelatedAmmoId: 11212, projectileId: 1539 },
    { family: 'powered staff', weaponId: 25731, unrelatedAmmoId: 11212, projectileId: 1899 },
    { family: 'powered staff', weaponId: 27275, unrelatedAmmoId: 11212, projectileId: 2126 },
    { family: 'powered staff', weaponId: 31113, unrelatedAmmoId: 11212, projectileId: 3367 },
  ])('keeps the $family projectile for weapon $weaponId', ({ weaponId, unrelatedAmmoId, projectileId }) => {
    expect(getWeaponCombatVisuals(weaponId, unrelatedAmmoId)?.projectileId).toBe(projectileId);
  });

  it('keeps the Dark bow special projectile instead of replacing it with its arrow', () => {
    expect(getWeaponCombatVisuals(11235, 11212, true)?.projectileId).toBe(1101);
    expect(getWeaponCombatVisuals(11235, 11212, false)?.projectileId).toBe(1120);
  });

  it.each([9185, 20997, 21006])('retains the generated animation entry for item %i', (id) => {
    expect(WEAPON_ANIMATION_SETS[id]).toBeDefined();
  });

  it('retains the generated toxic blowpipe combat visual entry', () => {
    expect(WEAPON_COMBAT_VISUALS[12926]).toBeDefined();
  });

  it.each([9185, 11785])('reuses the RuneLite crossbow bolt visual profile for item %i', (id) => {
    expect(getWeaponCombatVisuals(id)?.projectileId).toBe(27);
  });

  it('uses the captured Armadyl crossbow attack animation', () => {
    // capture weapon-attacks-sgs-…-dragon-pickaxe-packet-data.txt tick 1018.
    expect(getWeaponCombatVisuals(11785)).toEqual({
      ...WEAPON_COMBAT_VISUALS[9144],
      attackAnimation: 7552,
      projectileStartHeight: 155,
      projectileEndHeight: 146,
      sourceName: 'Armadyl crossbow normal shot',
    });
  });

  it('uses the captured plain toxic blowpipe attack animation', () => {
    expect(getWeaponCombatVisuals(12926)?.attackAnimation).toBe(5061);
  });

  it.each([undefined, 806, 11230, 25849])('keeps blowpipe launch heights when selecting dart ammo %s', (ammoId) => {
    expect(getWeaponCombatVisuals(12926, ammoId)).toMatchObject({
      projectileStartHeight: 142,
      projectileEndHeight: 146,
      projectileStartDelay: 32,
      projectileSlope: 15,
      attackAnimation: 5061,
    });
  });

  it('gives hand-thrown dragon darts the thrown launch profile, not the blowpipe muzzle', () => {
    // rsmod (ISC) `ProjAnimBuilds.thrown` is 163/146; the blowpipe's lower 142/146 muzzle is
    // captured separately and must not leak onto darts thrown by hand.
    expect(getWeaponCombatVisuals(11230)).toMatchObject({ projectileStartHeight: 163, projectileEndHeight: 146 });
    expect(getWeaponCombatVisuals(12926)).toMatchObject({ projectileStartHeight: 142, projectileEndHeight: 146 });
  });

  it('does not approximate visuals for an unaudited crossbow', () => {
    const unauditedCrossbowId = 99999;
    ITEM_WEAPON_CATEGORY[unauditedCrossbowId] = 'crossbow';
    try {
      expect(getWeaponCombatVisuals(unauditedCrossbowId)).toBeUndefined();
    } finally {
      delete ITEM_WEAPON_CATEGORY[unauditedCrossbowId];
    }
  });

  it('uses packet-captured Eclipse atlatl combat visuals', () => {
    expect(WEAPON_ANIMATION_SETS[29000]).toBeUndefined();
    expect(WEAPON_COMBAT_VISUALS[29000]).toBeUndefined();
    expect(getWeaponCombatVisuals(29000)).toEqual({
      attackAnimation: 11057,
      castSpotanim: -1,
      castSpotanimHeight: 0,
      projectileId: 2795,
      projectileStartHeight: 163,
      projectileEndHeight: 146,
      projectileSlope: 15,
      projectileStartDelay: 41,
      hitSpotanim: -1,
      hitSpotanimHeight: 0,
      sourceName: 'Eclipse atlatl',
    });
  });

  it('uses the captured Eclipse atlatl pose set', () => {
    expect(getWeaponAnimationSetWithFallbacks(29000)[0]).toEqual({
      idle: 813,
      walk: 1205,
      run: 1210,
      walkBack: 1206,
      turnLeft: 1207,
      turnRight: 1208,
      turn180: 1209,
      attack: 11057,
      block: 424,
    });
  });

  it('uses packet-captured Ice Burst spell visuals for the Dragon hunter wand', () => {
    expect(WEAPON_ANIMATION_SETS[30070]).toBeUndefined();
    expect(WEAPON_COMBAT_VISUALS[30070]).toBeUndefined();
    expect(getSpellVisuals('Ice Burst')).toMatchObject({
      castAnimationId: 10092,
      castSpotanimId: -1,
      hitSpotanimId: 363,
      hitSpotanimHeight: 0,
      projectileId: 366,
      projectileStartHeight: 172,
      projectileEndHeight: 0,
      projectileSlope: 16,
      projectileStartDelay: 51,
    });
  });
});

/**
 * The simulation and the renderer each resolve a weapon's projectile independently: the
 * simulation takes flight timing from `getProjectileTiming` to schedule the hit, and the
 * renderer takes the arc's start from the visuals' `projectileStartDelay`. Both ultimately
 * describe the same OSRS projanim, so the moment they disagree the projectile leaves at one
 * time and lands at another.
 *
 * Nothing in the types forces them to agree, so this asserts it. If it ever fails, the fix is
 * not to edit the expectation: it is to carry one resolved timeline from the simulation to
 * the renderer instead of resolving it twice.
 */
describe('projectile timing and visuals agree on when the shot leaves', () => {
  it('matches projectileStartDelay to the timing profile delay for every weapon carrying both', () => {
    const mismatches = getEquipmentCatalog()
      .filter((piece) => piece.slot === 'weapon')
      .map((piece) => ({
        piece,
        visuals: getWeaponCombatVisuals(piece.id),
        timing: getProjectileTiming(piece.id),
      }))
      .filter(({ visuals, timing }) => visuals !== undefined && timing !== undefined)
      .filter(({ visuals, timing }) => visuals?.projectileStartDelay !== timing?.delay)
      .map(
        ({ piece, visuals, timing }) =>
          `${piece.name} (${piece.id}): ${visuals?.projectileStartDelay} vs ${timing?.delay}`,
      );

    expect(mismatches).toEqual([]);
  });
});
