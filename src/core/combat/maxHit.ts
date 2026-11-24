import type { EquipmentStats } from '../../types/equipmentStats';
import { meleeStrengthEffectiveLevel, rangedStrengthEffectiveLevel } from './effectiveLevels';
import {
  type CombatFormulaStyle,
  DEFAULT_PRAYER_MULTIPLIERS,
  type FormulaAttacker,
  type NpcFormulaActor,
  type PlayerFormulaActor,
  type PrayerMultipliers,
} from './formulaTypes';

export function calculateMaxHit(
  attacker: FormulaAttacker,
  style: CombatFormulaStyle,
  equipmentStats: EquipmentStats,
  prayerMultipliers: PrayerMultipliers = DEFAULT_PRAYER_MULTIPLIERS,
): number {
  switch (attacker.kind) {
    case 'npc':
      return npcMaxHit(attacker, style);
    case 'player':
      return playerMaxHit(attacker, style, equipmentStats, prayerMultipliers);
    default:
      return attacker;
  }
}

function npcMaxHit(attacker: NpcFormulaActor, style: CombatFormulaStyle): number {
  switch (style) {
    case 'melee_stab':
    case 'melee_slash':
    case 'melee_crush':
      return maxHitFromStrength(attacker.levels.strength + 9, attacker.offensive.str);
    case 'ranged':
      return maxHitFromStrength(attacker.levels.ranged + 9, attacker.offensive.rangedStr);
    case 'magic':
      return maxHitFromStrength(attacker.levels.magic + 9, attacker.offensive.magicStr);
    default:
      return style;
  }
}

function playerMaxHit(
  attacker: PlayerFormulaActor,
  style: CombatFormulaStyle,
  equipmentStats: EquipmentStats,
  prayers: PrayerMultipliers,
): number {
  switch (style) {
    case 'melee_stab':
    case 'melee_slash':
    case 'melee_crush':
      return maxHitFromStrength(meleeStrengthEffectiveLevel(attacker, prayers), equipmentStats.meleeStrength);
    case 'ranged':
      return maxHitFromStrength(rangedStrengthEffectiveLevel(attacker, prayers), equipmentStats.rangedStrength);
    case 'magic': {
      const baseMaxHit = Math.floor(attacker.magicBaseMaxHit ?? 0);
      const equipmentDamage = equipmentStats.magicDamage / 100;
      const prayerDamage = prayers.magicDamage - 1;
      const voidDamage = attacker.voidSet === 'elite_magic' ? 0.05 : 0;
      return Math.floor(baseMaxHit * (1 + equipmentDamage + prayerDamage + voidDamage));
    }
    default:
      return style;
  }
}

function maxHitFromStrength(effectiveStrength: number, strengthBonus: number): number {
  return Math.floor((effectiveStrength * (strengthBonus + 64) + 320) / 640);
}
