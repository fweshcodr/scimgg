import type { EnumTypeLoader } from '../rs/config/enumtype/EnumTypeLoader';

/**
 * Special attack energy costs are defined in the OSRS cache as enum 906.
 * The equipped weapon's entry in this enum says whether it has a special
 * attack and what the cost is.
 *
 * Values are stored as tenths of a percent (e.g., 500 = 50%, 250 = 25%).
 * A value of -1 (the enum default) means no special attack.
 */
const SPECIAL_ATTACK_ENUM_ID = 906;

let cachedSpecMap: ReadonlyMap<number, number> | null = null;
let cachedEnumLoader: EnumTypeLoader | null = null;

function getSpecMap(enumTypeLoader: EnumTypeLoader): ReadonlyMap<number, number> {
  if (cachedSpecMap && cachedEnumLoader === enumTypeLoader) {
    return cachedSpecMap;
  }

  const specEnum = enumTypeLoader.load(SPECIAL_ATTACK_ENUM_ID);
  const map = new Map<number, number>();

  if (specEnum.keys && specEnum.intValues) {
    for (let i = 0; i < specEnum.keys.length; i++) {
      const weaponId = specEnum.keys[i];
      const cost = specEnum.intValues[i];
      if (cost > 0) {
        map.set(weaponId, cost);
      }
    }
  }

  cachedSpecMap = map;
  cachedEnumLoader = enumTypeLoader;
  return map;
}

/**
 * Get the special attack energy cost for a weapon (in percent, e.g., 50 for 50%).
 */
export function getSpecialAttackCost(weaponId: number | undefined, enumTypeLoader?: EnumTypeLoader): number {
  if (weaponId === undefined || !enumTypeLoader) return 0;

  try {
    const map = getSpecMap(enumTypeLoader);
    const costTenths = map.get(weaponId);
    if (costTenths === undefined) return 0;
    return Math.round(costTenths / 10);
  } catch {
    return 0;
  }
}

export function weaponHasSpecialAttack(weaponId: number | undefined, enumTypeLoader?: EnumTypeLoader): boolean {
  if (weaponId === undefined || !enumTypeLoader) return false;

  try {
    const map = getSpecMap(enumTypeLoader);
    return map.has(weaponId);
  } catch {
    return false;
  }
}

/**
 * Reset the cached spec map. Useful for testing.
 */
export function _resetSpecCache(): void {
  cachedSpecMap = null;
  cachedEnumLoader = null;
}
