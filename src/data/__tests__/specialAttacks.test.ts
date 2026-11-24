import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { EnumTypeLoader } from '../../rs/config/enumtype/EnumTypeLoader';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { loadCacheLoaders, REAL_CACHE_TEST_TIMEOUT_MS, skipWithoutRealCache } from '../../test/helpers/real-cache';
import { _resetSpecCache, getSpecialAttackCost, weaponHasSpecialAttack } from '../specialAttacks';

describe('specialAttacks (without loader)', () => {
  it('should return 0 cost without enumTypeLoader', () => {
    expect(getSpecialAttackCost(11802)).toBe(0);
    expect(getSpecialAttackCost(undefined)).toBe(0);
  });

  it('should return false without enumTypeLoader', () => {
    expect(weaponHasSpecialAttack(11802)).toBe(false);
    expect(weaponHasSpecialAttack(undefined)).toBe(false);
  });
});

const WEAPONS_WITH_SPEC: { id: number; name: string; expectedCost: number }[] = [
  { id: 11802, name: 'Armadyl godsword', expectedCost: 50 },
  { id: 11806, name: 'Saradomin godsword', expectedCost: 50 },
  { id: 29594, name: 'Purging staff', expectedCost: 25 },
  { id: 4151, name: 'Abyssal whip', expectedCost: 50 },
  { id: 13652, name: 'Dragon claws', expectedCost: 50 },
  { id: 1215, name: 'Dragon dagger', expectedCost: 25 },
  { id: 27665, name: 'Accursed sceptre', expectedCost: 50 },
];

const WEAPONS_WITHOUT_SPEC: { id: number; name: string }[] = [
  { id: 27275, name: "Tumeken's shadow" },
  { id: 4675, name: 'Ancient staff' },
];

describe.skipIf(skipWithoutRealCache('pinned'))('specialAttacks (real cache - enum 906)', () => {
  let objTypeLoader: ObjTypeLoader;
  let enumTypeLoader: EnumTypeLoader;

  beforeAll(async () => {
    const loaders = await loadCacheLoaders('pinned');
    objTypeLoader = loaders.objTypeLoader;
    enumTypeLoader = loaders.enumTypeLoader;
  }, REAL_CACHE_TEST_TIMEOUT_MS);

  afterAll(() => {
    _resetSpecCache();
  });

  it(
    'should load items from cache',
    () => {
      const gold = objTypeLoader.load(995);
      expect(gold.name).toBe('Coins');
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );

  describe('spec weapons detected from enum 906', () => {
    for (const weapon of WEAPONS_WITH_SPEC) {
      it(
        `${weapon.name} (${weapon.id}) has spec with cost ${weapon.expectedCost}%`,
        () => {
          const obj = objTypeLoader.load(weapon.id);
          expect(obj.name).toBe(weapon.name);
          expect(weaponHasSpecialAttack(weapon.id, enumTypeLoader)).toBe(true);
          expect(getSpecialAttackCost(weapon.id, enumTypeLoader)).toBe(weapon.expectedCost);
        },
        REAL_CACHE_TEST_TIMEOUT_MS,
      );
    }
  });

  describe('non-spec weapons excluded by enum 906', () => {
    for (const weapon of WEAPONS_WITHOUT_SPEC) {
      it(
        `${weapon.name} (${weapon.id}) has no spec`,
        () => {
          const obj = objTypeLoader.load(weapon.id);
          expect(obj.name).toBe(weapon.name);
          expect(weaponHasSpecialAttack(weapon.id, enumTypeLoader)).toBe(false);
        },
        REAL_CACHE_TEST_TIMEOUT_MS,
      );
    }
  });

  it(
    'enum 906 contains many weapons (not just our hardcoded few)',
    () => {
      const specEnum = enumTypeLoader.load(906);
      expect(specEnum.keys.length).toBeGreaterThan(50);
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );
});
