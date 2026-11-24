import { describe, expect, it } from 'vitest';
import { EQUIPMENT_COMBAT_FAMILIES } from '../equipmentCombatFamilies';
import { isVerifiedEquipmentPiece } from '../equipmentSupport';
import { getWeaponCombatVisuals } from '../weaponCombatVisuals';

describe('packet-backed weapon visuals', () => {
  it.each([undefined, 9144])('resolves Zaryte crossbow heights with ammo %s', (ammoId) => {
    expect(getWeaponCombatVisuals(26374, ammoId)).toMatchObject({
      projectileStartHeight: 155,
      projectileEndHeight: 146,
    });
  });

  it('resolves black chinchompa heights', () => {
    expect(getWeaponCombatVisuals(11959)).toMatchObject({
      projectileStartHeight: 163,
      projectileEndHeight: 146,
    });
  });

  it.each([
    { weaponId: 10033, projectileId: 908 },
    { weaponId: 10034, projectileId: 909 },
    { weaponId: 11959, projectileId: 1272 },
  ])('throws chinchompa $weaponId as the captured black throw with grenade $projectileId', ({
    weaponId,
    projectileId,
  }) => {
    expect(getWeaponCombatVisuals(weaponId)).toEqual({
      attackAnimation: 7618,
      castSpotanim: -1,
      castSpotanimHeight: 0,
      projectileId,
      projectileStartHeight: 163,
      projectileEndHeight: 146,
      projectileSlope: 15,
      projectileStartDelay: 21,
      hitSpotanim: 157,
      hitSpotanimHeight: 92,
    });
  });

  it.each([732, 800, 806, 11230, 25849, 825, 863, 6522])('resolves hand-thrown launch heights for %i', (weaponId) => {
    expect(getWeaponCombatVisuals(weaponId)).toMatchObject({
      projectileStartHeight: 163,
      projectileEndHeight: 146,
    });
  });

  it('keeps Shadow casting at the captured actor height', () => {
    expect(getWeaponCombatVisuals(27275)).toMatchObject({
      projectileStartHeight: 250,
      castSpotanimHeight: 0,
    });
  });

  it.each([
    { weaponId: 12926, projectileId: 1043, attackAnimation: 5061 },
    { weaponId: 28688, projectileId: 2599, attackAnimation: 10656 },
  ])('uses the special projectile before dart selection for $weaponId', ({
    weaponId,
    projectileId,
    attackAnimation,
  }) => {
    const visuals = getWeaponCombatVisuals(weaponId, 25849, true);

    expect(visuals).toMatchObject({
      projectileId,
      attackAnimation,
      castSpotanim: -1,
      hitSpotanim: -1,
      projectileStartHeight: 142,
      projectileEndHeight: 146,
      projectileStartDelay: 32,
      projectileSlope: 15,
    });
  });

  it.each([
    [25865, 1888, 1887],
    [25867, 1923, 1922],
    [25884, 1925, 1924],
    [25886, 1927, 1926],
    [25888, 1929, 1928],
    [25890, 1931, 1930],
    [25892, 1933, 1932],
    [25896, 1935, 1934],
  ])('uses named Bowfa launch/travel assets for %i', (weaponId, castSpotanim, projectileId) => {
    const visuals = getWeaponCombatVisuals(weaponId, 11212);

    expect(visuals).toMatchObject({
      attackAnimation: 426,
      castSpotanim,
      projectileId,
      castSpotanimHeight: 96,
      projectileStartHeight: 163,
      projectileEndHeight: 146,
      projectileStartDelay: 41,
      projectileSlope: 15,
    });
  });

  it('uses the verified state-base visuals when the Meilyr pair is unverified', () => {
    const visuals = getWeaponCombatVisuals(25894);

    expect(visuals).toEqual(getWeaponCombatVisuals(25867));
  });

  it.each([
    [806, 226],
    [11230, 1122],
    [25849, 1936],
  ])('uses actual dart %i in the Blazing blowpipe', (ammoId, projectileId) => {
    const visuals = getWeaponCombatVisuals(28688, ammoId);

    expect(visuals).toMatchObject({
      attackAnimation: 10656,
      projectileId,
      projectileStartHeight: 142,
      projectileEndHeight: 146,
    });
  });
});

describe('capture-backed shots', () => {
  it('launches the rune crossbow bolt at the Zuk capture heights, whatever bolt is loaded', () => {
    expect(getWeaponCombatVisuals(9185, 9244)).toMatchObject({
      attackAnimation: 7552,
      projectileId: 27,
      projectileStartHeight: 155,
      projectileEndHeight: 146,
      projectileStartDelay: 41,
      projectileSlope: 5,
    });
  });

  it('flies the Scorching bow special on its own projectile and impact, not the ordinary arrow', () => {
    expect(getWeaponCombatVisuals(29591, 11212, true)).toEqual({
      attackAnimation: 11133,
      castSpotanim: 2806,
      castSpotanimHeight: 0,
      projectileId: 2807,
      projectileStartHeight: 160,
      projectileEndHeight: 146,
      projectileSlope: 255,
      projectileStartDelay: 46,
      hitSpotanim: 2908,
      hitSpotanimHeight: 0,
    });
    expect(getWeaponCombatVisuals(29591, 11212, false)?.projectileId).not.toBe(2807);
  });

  // capture weapon-soulreaper-fang-dragonwarhammer-zombieaxe-noxhalberd-tridentoftheswamps-tridentoftheseas-packet-data.txt,
  // ticks 624-651: impact graphic at height 92, not the generated 60; the full trident has no generated row.
  it.each([
    { weaponId: 12899, castSpotanim: 665, projectileId: 1040, hitSpotanim: 1042 },
    { weaponId: 11905, castSpotanim: 1251, projectileId: 1252, hitSpotanim: 1253 },
    { weaponId: 11907, castSpotanim: 1251, projectileId: 1252, hitSpotanim: 1253 },
    { weaponId: 22288, castSpotanim: 1251, projectileId: 1252, hitSpotanim: 1253 },
    { weaponId: 22292, castSpotanim: 665, projectileId: 1040, hitSpotanim: 1042 },
  ])('casts trident $weaponId as captured', ({ weaponId, castSpotanim, projectileId, hitSpotanim }) => {
    expect(getWeaponCombatVisuals(weaponId)).toEqual({
      attackAnimation: 11430,
      castSpotanim,
      castSpotanimHeight: 92,
      projectileId,
      projectileStartHeight: 92,
      projectileEndHeight: 60,
      projectileSlope: 16,
      projectileStartDelay: 51,
      hitSpotanim,
      hitSpotanimHeight: 92,
    });
  });
});

describe('cosmetic visual inheritance', () => {
  it.each(EQUIPMENT_COMBAT_FAMILIES)('inherits supported state-base visuals for family $baseId', ({
    baseId,
    variantIds,
  }) => {
    if (!isVerifiedEquipmentPiece({ id: baseId, slot: 'weapon' })) return;
    for (const variantId of variantIds) {
      if (baseId === 25867 || variantId === 28688 || variantId === 25731) continue;
      expect(getWeaponCombatVisuals(variantId, 11212), String(variantId)).toEqual(
        getWeaponCombatVisuals(baseId, 11212),
      );
      expect(getWeaponCombatVisuals(variantId, 11212, true), String(variantId)).toEqual(
        getWeaponCombatVisuals(baseId, 11212, true),
      );
    }
  });

  it('falls back to the corrupted state for the Deadman Bowfa', () => {
    expect(getWeaponCombatVisuals(33021)).toEqual(getWeaponCombatVisuals(25867));
  });

  it('keeps the named Holy Sanguinesti assets over its base presentation', () => {
    expect(getWeaponCombatVisuals(25731)).toEqual({
      ...getWeaponCombatVisuals(22323),
      castSpotanim: 1900,
      projectileId: 1899,
      hitSpotanim: 1901,
    });
  });
});
