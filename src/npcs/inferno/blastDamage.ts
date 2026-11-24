import { hitChance, npcAttackRoll, playerDefenceRoll } from '../../core/combat/accuracy';
import {
  DEFAULT_PRAYER_MULTIPLIERS,
  type NpcFormulaActor,
  type PlayerFormulaActor,
  type PrayerMultipliers,
} from '../../core/combat/formulaTypes';
import { calculateMaxHit } from '../../core/combat/maxHit';
import type { NpcAttackRoll } from '../../core/combat/npcAttackResolution';
import type { EquipmentStats } from '../../types/equipmentStats';

type ZukBlastInput = {
  readonly attacker: NpcFormulaActor;
  readonly target: PlayerFormulaActor;
  readonly targetEquipmentStats: EquipmentStats;
  readonly targetPrayerMultipliers?: PrayerMultipliers;
  readonly random: () => number;
};

// Average rolls, not chances; one damage draw: https://oldschool.runescape.wiki/w/TzKal-Zuk#Fight_overview
export function rollZukBlast(input: ZukBlastInput): NpcAttackRoll {
  const { attacker, target, targetEquipmentStats, random } = input;
  const prayers = input.targetPrayerMultipliers ?? DEFAULT_PRAYER_MULTIPLIERS;
  const attackRoll = Math.floor((npcAttackRoll(attacker, 'ranged') + npcAttackRoll(attacker, 'magic')) / 2);
  const defenceRoll = Math.floor(
    (playerDefenceRoll(target, 'ranged', targetEquipmentStats, prayers) +
      playerDefenceRoll(target, 'magic', targetEquipmentStats, prayers)) /
      2,
  );
  const accuracy = hitChance(attackRoll, defenceRoll);
  const maxHit = Math.floor(
    (calculateMaxHit(attacker, 'ranged', targetEquipmentStats) +
      calculateMaxHit(attacker, 'magic', targetEquipmentStats)) /
      2,
  );
  const accuracySucceeded = random() < accuracy;
  const rolledDamage = Math.floor(random() * (maxHit + 1));
  return { accuracy, accuracySucceeded, maxHit, rolledDamage };
}
