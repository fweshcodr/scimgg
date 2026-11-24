import type { EquipmentStats } from '../../types/equipmentStats';
import {
  magicAttackEffectiveLevel,
  meleeAttackEffectiveLevel,
  playerDefenceEffectiveLevel,
  playerMagicDefenceEffectiveLevel,
  rangedAttackEffectiveLevel,
} from './effectiveLevels';
import {
  type CombatFormulaStyle,
  DEFAULT_PRAYER_MULTIPLIERS,
  type FormulaTarget,
  type NpcDefensiveBonuses,
  type NpcFormulaActor,
  type PlayerFormulaActor,
  type PrayerMultipliers,
  type RangedDefenceType,
} from './formulaTypes';

export function hitChance(attackRoll: number, defenceRoll: number): number {
  return attackRoll > defenceRoll
    ? 1 - (defenceRoll + 2) / (2 * (attackRoll + 1))
    : attackRoll / (2 * (defenceRoll + 1));
}

export function doubleRollHitChance(attackRoll: number, defenceRoll: number): number {
  return attackRoll >= defenceRoll
    ? 1 - ((defenceRoll + 2) * (2 * defenceRoll + 3)) / (6 * (attackRoll + 1) ** 2)
    : (attackRoll * (4 * attackRoll + 5)) / (6 * (attackRoll + 1) * (defenceRoll + 1));
}

export function steadyStateHitChance(singleRoll: number, doubleRoll: number): number {
  if (singleRoll === 1) return 1;
  const pendingProbability = (1 - singleRoll) / (doubleRoll + 1 - singleRoll);
  return (1 - pendingProbability) * singleRoll + pendingProbability * doubleRoll;
}

export type PlayerNpcRollDetails = {
  readonly attackRoll: number;
  readonly defenceRoll: number;
  readonly chance: number;
};

export function calculatePlayerNpcRollDetails(
  attacker: PlayerFormulaActor,
  target: NpcFormulaActor,
  style: CombatFormulaStyle,
  equipmentStats: EquipmentStats,
  prayerMultipliers: PrayerMultipliers = DEFAULT_PRAYER_MULTIPLIERS,
  defenceStyle: CombatFormulaStyle = style,
  rangedDefenceType: RangedDefenceType = 'standard',
): PlayerNpcRollDetails {
  const attackRoll = playerAttackRoll(attacker, style, equipmentStats, prayerMultipliers);
  const defenceRoll = npcDefenceRoll(target, defenceStyle, rangedDefenceType);
  return { attackRoll, defenceRoll, chance: hitChance(attackRoll, defenceRoll) };
}

/**
 * An NPC's hit chance. Player accuracy goes through {@link calculatePlayerNpcRollDetails}, which
 * needs the attacking weapon's ranged defence type that an NPC attacker does not have.
 */
export function calculateAccuracy(
  attacker: NpcFormulaActor,
  target: FormulaTarget,
  style: CombatFormulaStyle,
  equipmentStats: EquipmentStats,
  prayerMultipliers: PrayerMultipliers = DEFAULT_PRAYER_MULTIPLIERS,
): number {
  const attackRoll = npcAttackRoll(attacker, style);
  switch (target.kind) {
    case 'npc':
      // No NPC attacker has a weapon to pick light or heavy ranged defence.
      return hitChance(attackRoll, npcDefenceRoll(target, style, 'standard'));
    case 'player':
      return hitChance(attackRoll, playerDefenceRoll(target, style, equipmentStats, prayerMultipliers));
    default:
      return target;
  }
}

function playerAttackRoll(
  attacker: PlayerFormulaActor,
  style: CombatFormulaStyle,
  equipmentStats: EquipmentStats,
  prayers: PrayerMultipliers,
): number {
  switch (style) {
    case 'melee_stab':
      return Math.floor(meleeAttackEffectiveLevel(attacker, prayers) * (equipmentStats.attackStab + 64));
    case 'melee_slash':
      return Math.floor(meleeAttackEffectiveLevel(attacker, prayers) * (equipmentStats.attackSlash + 64));
    case 'melee_crush':
      return Math.floor(meleeAttackEffectiveLevel(attacker, prayers) * (equipmentStats.attackCrush + 64));
    case 'ranged':
      return Math.floor(rangedAttackEffectiveLevel(attacker, prayers) * (equipmentStats.attackRanged + 64));
    case 'magic':
      return Math.floor(magicAttackEffectiveLevel(attacker, prayers) * (equipmentStats.attackMagic + 64));
    default:
      return style;
  }
}

export function npcAttackRoll(attacker: NpcFormulaActor, style: CombatFormulaStyle): number {
  switch (style) {
    case 'melee_stab':
    case 'melee_slash':
    case 'melee_crush':
      return Math.floor((attacker.levels.attack + 9) * (attacker.offensive.atk + 64));
    case 'ranged':
      return Math.floor((attacker.levels.ranged + 9) * (attacker.offensive.ranged + 64));
    case 'magic':
      return Math.floor((attacker.levels.magic + 9) * (attacker.offensive.magic + 64));
    default:
      return style;
  }
}

export function playerDefenceRoll(
  target: PlayerFormulaActor,
  style: CombatFormulaStyle,
  equipmentStats: EquipmentStats,
  prayers: PrayerMultipliers,
): number {
  let effectiveLevel: number;
  switch (style) {
    case 'magic':
      effectiveLevel = playerMagicDefenceEffectiveLevel(target, prayers);
      break;
    case 'melee_stab':
    case 'melee_slash':
    case 'melee_crush':
    case 'ranged':
      effectiveLevel = playerDefenceEffectiveLevel(target, prayers);
      break;
    default:
      return style;
  }
  return Math.floor(effectiveLevel * (playerDefenceBonus(style, equipmentStats) + 64));
}

function npcDefenceRoll(
  target: NpcFormulaActor,
  style: CombatFormulaStyle,
  rangedDefenceType: RangedDefenceType,
): number {
  let level: number;
  switch (style) {
    case 'magic':
      level = target.levels.magic;
      break;
    case 'melee_stab':
    case 'melee_slash':
    case 'melee_crush':
    case 'ranged':
      level = target.levels.defence;
      break;
    default:
      return style;
  }
  return Math.floor((level + 9) * (npcDefenceBonus(style, rangedDefenceType, target.defensive) + 64));
}

function playerDefenceBonus(style: CombatFormulaStyle, equipmentStats: EquipmentStats): number {
  switch (style) {
    case 'melee_stab':
      return equipmentStats.defenceStab;
    case 'melee_slash':
      return equipmentStats.defenceSlash;
    case 'melee_crush':
      return equipmentStats.defenceCrush;
    case 'ranged':
      return equipmentStats.defenceRanged;
    case 'magic':
      return equipmentStats.defenceMagic;
    default:
      return style;
  }
}

function npcDefenceBonus(
  style: CombatFormulaStyle,
  rangedDefenceType: RangedDefenceType,
  defensive: NpcDefensiveBonuses,
): number {
  switch (style) {
    case 'melee_stab':
      return defensive.stab;
    case 'melee_slash':
      return defensive.slash;
    case 'melee_crush':
      return defensive.crush;
    case 'ranged':
      return npcRangedDefenceBonus(rangedDefenceType, defensive);
    case 'magic':
      return defensive.magic;
    default:
      return style;
  }
}

function npcRangedDefenceBonus(type: RangedDefenceType, defensive: NpcDefensiveBonuses): number {
  switch (type) {
    case 'light':
      return defensive.rangedLight;
    case 'standard':
      return defensive.rangedStandard;
    case 'heavy':
      return defensive.rangedHeavy;
    default:
      return type;
  }
}
