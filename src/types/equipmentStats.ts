import { getEquipmentCombatBaseId } from '../data/equipmentCombatFamilies';
import { SEEKING_ARROWS } from '../data/seekingArrows';
import { equippedWeightItemId } from '../data/weightReducingClothing';
import type { ObjType } from '../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../rs/config/objtype/ObjTypeLoader';
import type { ParamsMap } from '../rs/config/Type';
import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { Inventory } from './inventory';

export interface EquipmentStats {
  attackStab: number;
  attackSlash: number;
  attackCrush: number;
  attackMagic: number;
  attackRanged: number;

  defenceStab: number;
  defenceSlash: number;
  defenceCrush: number;
  defenceMagic: number;
  defenceRanged: number;

  meleeStrength: number;
  rangedStrength: number;
  magicDamage: number; // percentage (15 = 15%)
  prayer: number;

  attackSpeed: number; // game ticks between attacks (default 4)
  attackRange: number; // tiles (default 1 for melee)
}

// Keys in the ObjType params map (opcode 249).
//
// Each id below is established by `scripts/verify-equipment-params.ts`, which reads the pinned
// setup cache and checks the value against the bonuses the OSRS Wiki publishes for the same item.
// Re-run it (`npx tsx scripts/verify-equipment-params.ts`) rather than trusting this table; adding
// an id means adding a witness item to it.
export const PARAM_ATTACK_STAB = 0;
export const PARAM_ATTACK_SLASH = 1;
export const PARAM_ATTACK_CRUSH = 2;
export const PARAM_ATTACK_MAGIC = 3;
export const PARAM_ATTACK_RANGED = 4;

export const PARAM_DEFENCE_STAB = 5;
export const PARAM_DEFENCE_SLASH = 6;
export const PARAM_DEFENCE_CRUSH = 7;
export const PARAM_DEFENCE_MAGIC = 8;
export const PARAM_DEFENCE_RANGED = 9;

export const PARAM_MELEE_STRENGTH = 10;
export const PARAM_PRAYER = 11;
export const PARAM_ATTACK_RANGE = 13;
export const PARAM_ATTACK_SPEED = 14;
/**
 * Ranged strength lives under EITHER of two param ids, and an item carries exactly one.
 * Worn gear uses param 189; ammunition and thrown weapons use 12.
 * Reading only 189 makes every arrow, dart, and thrown weapon report zero ranged strength.
 */
export const PARAM_RANGED_STRENGTH_WORN = 189;
export const PARAM_RANGED_STRENGTH_AMMO = 12;
/** Tenths of a percent: the ancestral hat's wiki-published +3% is stored here as 30. */
export const PARAM_MAGIC_DAMAGE = 299;

function getIntParam(params: ParamsMap | undefined, key: number, defaultValue = 0): number {
  if (!params) return defaultValue;
  const val = params.get(key);
  return typeof val === 'number' ? val : defaultValue;
}

export function createEmptyStats(): EquipmentStats {
  return {
    attackStab: 0,
    attackSlash: 0,
    attackCrush: 0,
    attackMagic: 0,
    attackRanged: 0,
    defenceStab: 0,
    defenceSlash: 0,
    defenceCrush: 0,
    defenceMagic: 0,
    defenceRanged: 0,
    meleeStrength: 0,
    rangedStrength: 0,
    magicDamage: 0,
    prayer: 0,
    attackSpeed: 4,
    attackRange: 1,
  };
}

const EQUIPMENT_STAT_OVERRIDES: Readonly<Record<number, Partial<EquipmentStats>>> = {
  24417: { attackCrush: 102, meleeStrength: 96 },
  27679: { attackSpeed: 5 },
  28951: { attackRanged: 18, rangedStrength: 3 },
  29031: {
    attackMagic: -15,
    attackRanged: 31,
    defenceStab: 15,
    defenceSlash: 18,
    defenceCrush: 57,
    defenceMagic: 55,
    defenceRanged: 32,
    meleeStrength: 3,
  },
  29033: {
    attackMagic: -15,
    attackRanged: 17,
    defenceStab: 9,
    defenceSlash: 13,
    defenceCrush: 37,
    defenceMagic: 31,
    defenceRanged: 17,
    meleeStrength: 1,
  },
  29035: {
    attackMagic: -6,
    attackRanged: 8,
    defenceStab: 2,
    defenceSlash: 3,
    defenceCrush: 14,
    defenceMagic: 10,
    defenceRanged: 4,
    meleeStrength: 3,
  },
  29037: {
    attackMagic: 30,
    defenceCrush: 51,
    defenceMagic: 28,
    meleeStrength: 2,
    magicDamage: 1,
  },
  29801: {
    attackStab: 25,
    attackSlash: 25,
    attackCrush: 25,
    attackMagic: -6,
    attackRanged: -8,
    meleeStrength: 12,
    prayer: 2,
  },
  29806: { attackMagic: 5, attackRanged: 6, meleeStrength: 4, prayer: 1 },
  30076: {
    attackMagic: -15,
    attackRanged: 30,
    defenceStab: 55,
    defenceSlash: 47,
    defenceCrush: 60,
    defenceMagic: 56,
    defenceRanged: 55,
    prayer: 3,
  },
  30079: {
    attackMagic: -10,
    attackRanged: 17,
    defenceStab: 31,
    defenceSlash: 25,
    defenceCrush: 33,
    defenceMagic: 30,
    defenceRanged: 31,
    prayer: 2,
  },
  31097: {
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
  27624: { magicDamage: 10 },
  33639: { attackRanged: 20, rangedStrength: 8, prayer: 3 },
};

export function applyEquipmentStatOverrides(itemId: number, stats: EquipmentStats): EquipmentStats {
  const seekingArrow = SEEKING_ARROWS[itemId];
  if (seekingArrow !== undefined) return { ...stats, attackRanged: 20, rangedStrength: seekingArrow.rangedStrength };
  const baseOverrides = EQUIPMENT_STAT_OVERRIDES[getEquipmentCombatBaseId(itemId)];
  const itemOverrides = EQUIPMENT_STAT_OVERRIDES[itemId];
  return baseOverrides === undefined && itemOverrides === undefined
    ? stats
    : { ...stats, ...baseOverrides, ...itemOverrides };
}

export function getItemStats(obj: ObjType): EquipmentStats {
  const p = obj.params;
  return applyEquipmentStatOverrides(obj.id, {
    attackStab: getIntParam(p, PARAM_ATTACK_STAB),
    attackSlash: getIntParam(p, PARAM_ATTACK_SLASH),
    attackCrush: getIntParam(p, PARAM_ATTACK_CRUSH),
    attackMagic: getIntParam(p, PARAM_ATTACK_MAGIC),
    attackRanged: getIntParam(p, PARAM_ATTACK_RANGED),

    defenceStab: getIntParam(p, PARAM_DEFENCE_STAB),
    defenceSlash: getIntParam(p, PARAM_DEFENCE_SLASH),
    defenceCrush: getIntParam(p, PARAM_DEFENCE_CRUSH),
    defenceMagic: getIntParam(p, PARAM_DEFENCE_MAGIC),
    defenceRanged: getIntParam(p, PARAM_DEFENCE_RANGED),

    meleeStrength: getIntParam(p, PARAM_MELEE_STRENGTH),
    rangedStrength: getIntParam(p, PARAM_RANGED_STRENGTH_WORN) || getIntParam(p, PARAM_RANGED_STRENGTH_AMMO),
    magicDamage: getIntParam(p, PARAM_MAGIC_DAMAGE) / 10,
    prayer: getIntParam(p, PARAM_PRAYER),

    attackSpeed: getIntParam(p, PARAM_ATTACK_SPEED, 4),
    attackRange: Math.max(1, getIntParam(p, PARAM_ATTACK_RANGE)),
  });
}

const COMBAT_PARAMS: readonly number[] = [
  PARAM_ATTACK_STAB,
  PARAM_ATTACK_SLASH,
  PARAM_ATTACK_CRUSH,
  PARAM_ATTACK_MAGIC,
  PARAM_ATTACK_RANGED,
  PARAM_DEFENCE_STAB,
  PARAM_DEFENCE_SLASH,
  PARAM_DEFENCE_CRUSH,
  PARAM_DEFENCE_MAGIC,
  PARAM_DEFENCE_RANGED,
  PARAM_MELEE_STRENGTH,
  PARAM_PRAYER,
  PARAM_ATTACK_RANGE,
  PARAM_ATTACK_SPEED,
  PARAM_RANGED_STRENGTH_WORN,
  PARAM_RANGED_STRENGTH_AMMO,
  PARAM_MAGIC_DAMAGE,
];

/**
 * `getItemStats` for an item id, except that a combat-family variant carrying no combat param at
 * all takes its family base's stats. That is an item newer than the loaded cache (the trident and
 * Soulreaper axe ornaments decode with no params), which would otherwise be statless with range 1.
 * A variant with any combat param of its own is read as the cache gives it.
 */
export function loadItemStats(itemId: number, objTypeLoader: ObjTypeLoader): EquipmentStats {
  const obj = objTypeLoader.load(itemId);
  const baseId = getEquipmentCombatBaseId(itemId);
  if (baseId === itemId || COMBAT_PARAMS.some((param) => obj.params?.has(param) === true)) {
    return getItemStats(obj);
  }
  // The base's own corrections, then any the variant has.
  return applyEquipmentStatOverrides(itemId, getItemStats(objTypeLoader.load(baseId)));
}

/** attackSpeed and attackRange come from the weapon slot only. */
export function computeTotalEquipmentStats(equipment: PlayerEquipment, objTypeLoader: ObjTypeLoader): EquipmentStats {
  const total = createEmptyStats();

  const slotKeys: (keyof PlayerEquipment)[] = [
    'head',
    'cape',
    'amulet',
    'weapon',
    'body',
    'shield',
    'legs',
    'hands',
    'boots',
    'ring',
  ];

  for (const slot of slotKeys) {
    const itemId = equipment[slot];
    if (itemId === undefined) continue;

    let stats: EquipmentStats;
    try {
      stats = loadItemStats(itemId, objTypeLoader);
    } catch {
      continue;
    }

    total.attackStab += stats.attackStab;
    total.attackSlash += stats.attackSlash;
    total.attackCrush += stats.attackCrush;
    total.attackMagic += stats.attackMagic;
    total.attackRanged += stats.attackRanged;

    total.defenceStab += stats.defenceStab;
    total.defenceSlash += stats.defenceSlash;
    total.defenceCrush += stats.defenceCrush;
    total.defenceMagic += stats.defenceMagic;
    total.defenceRanged += stats.defenceRanged;

    total.meleeStrength += stats.meleeStrength;
    total.rangedStrength += stats.rangedStrength;
    total.magicDamage += stats.magicDamage;
    total.prayer += stats.prayer;

    if (slot === 'weapon') {
      total.attackSpeed = stats.attackSpeed;
      total.attackRange = stats.attackRange;
    }
  }

  return total;
}

export function computeTotalWeight(
  equipment: PlayerEquipment,
  inventory: Inventory,
  objTypeLoader: ObjTypeLoader,
): number {
  let totalGrams = 0;

  const equipSlots: (keyof PlayerEquipment)[] = [
    'head',
    'cape',
    'amulet',
    'weapon',
    'body',
    'shield',
    'legs',
    'hands',
    'boots',
    'ring',
  ];

  for (const slot of equipSlots) {
    const itemId = equipment[slot];
    if (itemId === undefined) continue;
    try {
      const obj = objTypeLoader.load(equippedWeightItemId(itemId));
      // https://oldschool.runescape.wiki/w/Weight: stackable items are overridden to 0 kg.
      if (!obj.stackable) totalGrams += obj.weight;
    } catch {}
  }

  for (const slot of inventory) {
    if (!slot) continue;
    try {
      const obj = objTypeLoader.load(slot.id);
      const qty = slot.quantity ?? 1;
      if (!obj.stackable) totalGrams += obj.weight * qty;
    } catch {}
  }

  return totalGrams / 1000;
}
