import { describe, expect, it } from 'vitest';
import spells from '../osrs/spells.json';
import { getAutocastableSpells } from '../spellCatalog';
import { getSpellVisuals, SPELL_VISUALS } from '../spellVisuals';

describe('spell visual profiles', () => {
  it.each([
    ['Wind Strike', 1162, 90, 91, 92],
    ['Water Strike', 1162, 93, 94, 95],
    ['Earth Strike', 1162, 96, 97, 98],
    ['Fire Strike', 1162, 99, 100, 101],
    ['Wind Bolt', 1162, 117, 118, 119],
    ['Water Bolt', 1162, 120, 121, 122],
    ['Earth Bolt', 1162, 123, 124, 125],
    ['Fire Bolt', 1162, 126, 127, 128],
    ['Wind Blast', 1162, 132, 133, 134],
    ['Water Blast', 1162, 135, 136, 137],
    ['Fire Blast', 1162, 129, 130, 131],
    ['Earth Blast', 1162, 138, 139, 140],
    ['Fire Wave', 1167, 155, 156, 157],
    ['Wind Wave', 1167, 158, 159, 160],
    ['Water Wave', 1167, 161, 162, 163],
    ['Earth Wave', 1167, 164, 165, 166],
    ['Wind Surge', 7855, 1455, 1456, 1457],
    ['Water Surge', 7855, 1458, 1459, 1460],
    ['Earth Surge', 7855, 1461, 1462, 1463],
    ['Fire Surge', 7855, 1464, 1465, 1466],
    ['Iban Blast', 708, 87, 88, 89],
    ['Crumble Undead', 1166, 145, 146, 147],
  ] as const)('uses named identities when casting %s', (name, animation, cast, travel, impact) => {
    const profile = getSpellVisuals(name);

    expect(profile).toMatchObject({
      castAnimationId: animation,
      castSpotanimId: cast,
      projectileId: travel,
      hitSpotanimId: impact,
    });
  });

  it.each(['Strike', 'Bolt', 'Blast', 'Wave', 'Surge'])('covers four elements when the tier is %s', (tier) => {
    const family = spells.filter((spell) => spell.element !== null && spell.name.endsWith(` ${tier}`));

    const profiles = family.map((spell) => getSpellVisuals(spell.name));

    expect(family).toHaveLength(4);
    expect(profiles.every((profile) => profile !== undefined)).toBe(true);
    expect(new Set(profiles.map((profile) => profile?.projectileId)).size).toBe(4);
  });

  it('uses the documented generic geometry with corroborated spotanim defaults for elemental spells', () => {
    const elementalSpells = spells.filter((spell) => spell.element !== null);

    const profiles = elementalSpells.map((spell) => getSpellVisuals(spell.name));

    for (const profile of profiles) {
      expect(profile).toMatchObject({
        projectileStartHeight: 172,
        projectileEndHeight: 124,
        projectileSlope: 16,
        projectileStartDelay: 51,
        // rsmod (ISC, fa13b3f) ElementalSpells.kt corroborates these defaults;
        // target-dependent impact adjustment remains unresolved in our captures.
        castSpotanimHeight: 92,
        hitSpotanimHeight: 124,
      });
    }
  });

  it.each([
    ['Smoke Rush', 10091, -1, 384, 'caster', 385, 124],
    ['Shadow Rush', 10091, -1, 378, 'caster', 379, 0],
    ['Blood Rush', 10091, -1, -1, 'caster', 373, 0],
    ['Ice Rush', 10091, -1, 360, 'caster', 361, 0],
    ['Smoke Burst', 10092, -1, 388, 'target', 389, 124],
    ['Shadow Burst', 10092, -1, -1, 'caster', 382, 0],
    ['Blood Burst', 10092, -1, -1, 'caster', 376, 0],
    ['Ice Burst', 10092, -1, 366, 'target', 363, 0],
    ['Smoke Blitz', 10091, -1, 386, 'caster', 387, 124],
    ['Shadow Blitz', 10091, -1, 380, 'caster', 381, 0],
    ['Blood Blitz', 10091, -1, 374, 'caster', 375, 0],
    ['Ice Blitz', 10091, 366, -1, 'caster', 367, 0],
    ['Smoke Barrage', 10092, -1, 390, 'target', 391, 124],
    ['Shadow Barrage', 10092, -1, -1, 'caster', 383, 0],
    ['Blood Barrage', 10092, -1, -1, 'caster', 377, 0],
    ['Ice Barrage', 10092, -1, 368, 'target', 369, 0],
  ] as const)('uses captured presentation when casting %s', (name, animation, cast, travel, origin, impact, height) => {
    const profile = getSpellVisuals(name);

    expect(profile).toEqual({
      castAnimationId: animation,
      castSpotanimId: cast,
      castSpotanimHeight: cast === 366 ? 124 : 0,
      hitSpotanimId: impact,
      hitSpotanimHeight: height,
      hitSpotanimHeightMode: 'actor',
      projectileId: travel,
      projectileOrigin: origin,
      projectileStartHeight: 172,
      projectileEndHeight: height,
      projectileSlope: 16,
      projectileStartDelay: 51,
      impactTiming: { delay: 51, lengthAdjustment: -5, stepMultiplier: 10, progress: 64 },
    });
  });

  it.each([
    ['Inferior Demonbane', 1865, 1866],
    ['Superior Demonbane', 1867, 1868],
    ['Dark Demonbane', 1869, 1870],
  ] as const)('preserves direct effects when casting %s', (name, cast, impact) => {
    const profile = getSpellVisuals(name);

    expect(profile).toEqual({
      castAnimationId: 8977,
      fallbackAnimationId: 1162,
      castSpotanimId: cast,
      hitSpotanimId: impact,
      hitSpotanimHeight: 0,
      projectileId: -1,
      projectileStartHeight: 0,
      projectileEndHeight: 0,
      projectileSlope: 0,
      projectileStartDelay: 0,
    });
  });

  it('uses nonnegative IDs or the explicit none sentinel when enumerating profiles', () => {
    const profiles = Object.keys(SPELL_VISUALS).map((name) => getSpellVisuals(name));

    for (const profile of profiles) {
      expect(profile).toBeDefined();
      if (profile === undefined) continue;
      expect(Number.isInteger(profile.castAnimationId) && profile.castAnimationId >= 0).toBe(true);
      if (profile.fallbackAnimationId !== undefined) {
        expect(Number.isInteger(profile.fallbackAnimationId) && profile.fallbackAnimationId >= 0).toBe(true);
      }
      for (const id of [profile.castSpotanimId, profile.projectileId, profile.hitSpotanimId]) {
        expect(Number.isInteger(id) && id >= -1).toBe(true);
      }
    }
  });

  it('counts actual selectable catalog entries when reporting coverage', () => {
    const books = ['standard', 'ancient', 'arceuus', 'lunar'] as const;
    const selectable = books.flatMap((book) => getAutocastableSpells(book));

    const covered = spells.filter((spell) => getSpellVisuals(spell.name) !== undefined);

    expect(spells).toHaveLength(48);
    expect(selectable.map((spell) => spell.name)).toEqual(spells.map((spell) => spell.name));
    expect(covered).toHaveLength(41);
    expect(Object.keys(SPELL_VISUALS).sort()).toEqual(covered.map((spell) => spell.name).sort());
    expect(spells.filter((spell) => getSpellVisuals(spell.name) === undefined).map((spell) => spell.name)).toEqual([
      'Saradomin Strike',
      'Claws of Guthix',
      'Flames of Zamorak',
      'Magic Dart',
      'Ghostly Grasp',
      'Skeletal Grasp',
      'Undead Grasp',
    ]);
  });

  it.each(['Magic Dart', 'Not a spell'])('returns undefined when %s has no verified profile', (name) => {
    const profile = getSpellVisuals(name);

    expect(profile).toBeUndefined();
  });
});
