import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import * as combatFamilies from '../../data/equipmentCombatFamilies';
import { ObjType } from '../../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { loadCacheLoaders, skipWithoutRealCache } from '../../test/helpers/real-cache';
import {
  applyEquipmentStatOverrides,
  computeTotalEquipmentStats,
  createEmptyStats,
  getItemStats,
  loadItemStats,
} from '../equipmentStats';

describe('applyEquipmentStatOverrides', () => {
  afterEach(() => vi.restoreAllMocks());

  it('applies base corrections before exact corrections when both are configured', () => {
    vi.spyOn(combatFamilies, 'getEquipmentCombatBaseId').mockReturnValue(29801);
    const cacheStats = { ...createEmptyStats(), attackStab: 3, attackRanged: 4, meleeStrength: 5, attackSpeed: 7 };

    const stats = applyEquipmentStatOverrides(28951, cacheStats);

    expect(stats).toMatchObject({
      attackStab: 25,
      attackRanged: 18,
      rangedStrength: 3,
      meleeStrength: 12,
      attackSpeed: 7,
    });
    expect(cacheStats).toMatchObject({ attackStab: 3, attackRanged: 4, meleeStrength: 5 });
  });

  it.each([
    28688, 25731, 27253, 28254, 33434,
  ])('retains raw cache stats when item %i belongs to a combat family', (itemId) => {
    const obj = new ObjType(itemId, {
      name: 'test',
      game: 'oldschool',
      environment: 'live',
      revision: 232,
      timestamp: '',
      size: 0,
    });
    obj.params = new Map([
      [0, 17],
      [14, 7],
      [299, 43],
    ]);

    const stats = getItemStats(obj);

    expect(stats).toMatchObject({ attackStab: 17, attackSpeed: 7, magicDamage: 4.3 });
    expect(obj.id).toBe(itemId);
  });

  it.each([
    [33553, 7],
    [33559, 10],
    [33565, 16],
    [33571, 22],
    [33577, 31],
    [33583, 49],
    [33589, 55],
    [33595, 60],
    [33601, 28],
  ])('loads seeking arrow %i bonuses when the cache has no item params', (itemId, rangedStrength) => {
    const obj = new ObjType(itemId, {
      name: 'test',
      game: 'oldschool',
      environment: 'live',
      revision: 232,
      timestamp: '',
      size: 0,
    });

    const stats = getItemStats(obj);

    expect(stats).toEqual({ ...createEmptyStats(), attackRanged: 20, rangedStrength });
  });
  it.each([
    [28951, { attackRanged: 18, rangedStrength: 3 }],
    [
      29801,
      {
        attackStab: 25,
        attackSlash: 25,
        attackCrush: 25,
        attackMagic: -6,
        attackRanged: -8,
        meleeStrength: 12,
        prayer: 2,
      },
    ],
    [29806, { attackMagic: 5, attackRanged: 6, meleeStrength: 4, prayer: 1 }],
    [
      31097,
      {
        attackStab: 5,
        attackSlash: 5,
        attackCrush: 5,
        attackMagic: 11,
        attackRanged: 15,
        defenceStab: 21,
        defenceSlash: 25,
        defenceCrush: 25,
        defenceMagic: 10,
        defenceRanged: 10,
        meleeStrength: 6,
        rangedStrength: 3,
        magicDamage: 2,
      },
    ],
    [
      29037,
      {
        attackMagic: 30,
        defenceCrush: 51,
        defenceMagic: 28,
        meleeStrength: 2,
        magicDamage: 1,
      },
    ],
    [27624, { magicDamage: 10 }],
    [24417, { attackCrush: 102, meleeStrength: 96 }],
    [27679, { attackSpeed: 5 }],
    [29031, { attackMagic: -15, attackRanged: 31, meleeStrength: 3 }],
    [29035, { attackMagic: -6, attackRanged: 8, meleeStrength: 3 }],
    [29033, { attackMagic: -15, attackRanged: 17, meleeStrength: 1 }],
    [
      30076,
      {
        attackMagic: -15,
        attackRanged: 30,
        defenceStab: 55,
        defenceSlash: 47,
        defenceCrush: 60,
        defenceMagic: 56,
        defenceRanged: 55,
        prayer: 3,
      },
    ],
    [
      30079,
      {
        attackMagic: -10,
        attackRanged: 17,
        defenceStab: 31,
        defenceSlash: 25,
        defenceCrush: 33,
        defenceMagic: 30,
        defenceRanged: 31,
        prayer: 2,
      },
    ],
    [33639, { attackRanged: 20, rangedStrength: 8, prayer: 3 }],
  ] as const)('supplies item %i stats missing from cache revision 232', (itemId, expected) => {
    expect(applyEquipmentStatOverrides(itemId, createEmptyStats())).toMatchObject(expected);
  });

  it('leaves cache stats unchanged for ordinary equipment', () => {
    const stats = { ...createEmptyStats(), attackRanged: 15, rangedStrength: 2 };

    expect(applyEquipmentStatOverrides(19547, stats)).toBe(stats);
  });
});

describe('loadItemStats', () => {
  const TRIDENT_OF_THE_SWAMP = 12899;
  const TRIDENT_OF_THE_SWAMP_ORNAMENT = 33314;
  const SOULREAPER_AXE = 28338;
  const SOULREAPER_AXE_ORNAMENT = 33335;
  const cacheInfo = {
    name: 'test',
    game: 'oldschool',
    environment: 'live',
    revision: 232,
    timestamp: '',
    size: 0,
  } as const;
  const loaderOf = (params: Record<number, ReadonlyMap<number, number> | undefined>): ObjTypeLoader =>
    ({
      load: (id: number) => {
        const obj = new ObjType(id, cacheInfo);
        const itemParams = params[id];
        if (itemParams !== undefined) obj.params = new Map(itemParams);
        return obj;
      },
    }) as unknown as ObjTypeLoader;
  const swamp = new Map([
    [3, 25],
    [13, 7],
    [14, 4],
  ]);

  it("gives a family variant the cache has no combat params for its base's stats", () => {
    const loader = loaderOf({ [TRIDENT_OF_THE_SWAMP]: swamp, [TRIDENT_OF_THE_SWAMP_ORNAMENT]: undefined });
    expect(loadItemStats(TRIDENT_OF_THE_SWAMP_ORNAMENT, loader)).toEqual(loadItemStats(TRIDENT_OF_THE_SWAMP, loader));
    expect(loadItemStats(TRIDENT_OF_THE_SWAMP_ORNAMENT, loader)).toMatchObject({
      attackMagic: 25,
      attackRange: 7,
      attackSpeed: 4,
    });
  });

  it('keeps every value a variant carries itself, never blending in the base', () => {
    const own = new Map([
      [3, 30],
      [13, 8],
    ]);
    const loader = loaderOf({ [TRIDENT_OF_THE_SWAMP]: swamp, [TRIDENT_OF_THE_SWAMP_ORNAMENT]: own });
    expect(loadItemStats(TRIDENT_OF_THE_SWAMP_ORNAMENT, loader)).toEqual({
      ...createEmptyStats(),
      attackMagic: 30,
      attackRange: 8,
      attackSpeed: 4, // the default, not the base's param
    });
  });

  it('reads an item outside any family as the cache gives it, statless or not', () => {
    const loader = loaderOf({ 4151: undefined });
    expect(loadItemStats(4151, loader)).toEqual(createEmptyStats());
  });

  describe.skipIf(skipWithoutRealCache())('against the mirrored cache', () => {
    let loader: ObjTypeLoader;
    beforeAll(async () => {
      loader = (await loadCacheLoaders()).objTypeLoader;
    }, 120_000);

    it.each([
      [TRIDENT_OF_THE_SWAMP_ORNAMENT, TRIDENT_OF_THE_SWAMP],
      [33322, 11907], // Trident of the seas (o)
      [SOULREAPER_AXE_ORNAMENT, SOULREAPER_AXE],
    ])('gives ornament %i, which this cache predates, the stats of %i', (ornamentId, baseId) => {
      expect(getItemStats(loader.load(ornamentId))).toEqual(createEmptyStats()); // the gap itself
      expect(loadItemStats(ornamentId, loader)).toEqual(loadItemStats(baseId, loader));
    });

    it('reaches 7 tiles at speed 4 with a trident (o), and swings every 5 ticks with the axe (o)', () => {
      expect(loadItemStats(TRIDENT_OF_THE_SWAMP_ORNAMENT, loader)).toMatchObject({ attackRange: 7, attackSpeed: 4 });
      expect(loadItemStats(SOULREAPER_AXE_ORNAMENT, loader)).toMatchObject({ attackSpeed: 5 });
      expect(computeTotalEquipmentStats({ weapon: SOULREAPER_AXE_ORNAMENT }, loader)).toEqual(
        computeTotalEquipmentStats({ weapon: SOULREAPER_AXE }, loader),
      );
    });
  });
});
