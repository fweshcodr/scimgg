import { assert, describe, expect, it, vi } from 'vitest';
import { npcAttackRoll } from '../../../core/combat/accuracy';
import {
  DEFAULT_PRAYER_MULTIPLIERS,
  type NpcFormulaActor,
  type PlayerFormulaActor,
} from '../../../core/combat/formulaTypes';
import { getMonsterFormulaStats } from '../../../data/monsterData';
import { createEmptyStats } from '../../../types/equipmentStats';
import { rollZukBlast } from '../blastDamage';

const zukStats = getMonsterFormulaStats(7706);
assert.isDefined(zukStats);
const ZUK: NpcFormulaActor = { kind: 'npc', id: 7706, ...zukStats };
const TARGET: PlayerFormulaActor = {
  kind: 'player',
  levels: { attack: 99, strength: 99, defence: 99, ranged: 99, magic: 99 },
};

describe('rollZukBlast', () => {
  it('uses the 174376 averaged attack roll when Zuk has baseline stats', () => {
    const input = { attacker: ZUK, target: TARGET, targetEquipmentStats: createEmptyStats(), random: () => 0 };

    const result = rollZukBlast(input);

    expect(npcAttackRoll(ZUK, 'ranged')).toBe(251126);
    expect(npcAttackRoll(ZUK, 'magic')).toBe(97626);
    expect(result.accuracy).toBe(1 - (6816 + 2) / (2 * (174376 + 1)));
  });

  it.each([
    { sample: 0, damage: 0 },
    { sample: 0.25, damage: 37 },
    { sample: 1 - Number.EPSILON, damage: 148 },
  ])('rolls $damage with one damage draw when the sample is $sample', ({ sample, damage }) => {
    const random = vi.fn<() => number>().mockReturnValueOnce(0).mockReturnValueOnce(sample);

    const result = rollZukBlast({
      attacker: ZUK,
      target: TARGET,
      targetEquipmentStats: createEmptyStats(),
      random,
    });

    expect(result.maxHit).toBe(148);
    expect(result.rolledDamage).toBe(damage);
    expect(result.accuracySucceeded).toBe(true);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it.each([
    { rangedArmour: 200, magicArmour: 0, defencePrayer: 1, magicPrayer: 1, defenceRoll: 17516 },
    { rangedArmour: 0, magicArmour: 50, defencePrayer: 1, magicPrayer: 1, defenceRoll: 9466 },
    { rangedArmour: 200, magicArmour: 50, defencePrayer: 1.25, magicPrayer: 1, defenceRoll: 23733 },
    { rangedArmour: 200, magicArmour: 50, defencePrayer: 1, magicPrayer: 1.25, defenceRoll: 21135 },
    { rangedArmour: 200, magicArmour: 50, defencePrayer: 1.25, magicPrayer: 1.25, defenceRoll: 24702 },
  ])('uses averaged defence $defenceRoll when armour and prayers change', ({
    rangedArmour,
    magicArmour,
    defencePrayer,
    magicPrayer,
    defenceRoll,
  }) => {
    const targetEquipmentStats = { ...createEmptyStats(), defenceRanged: rangedArmour, defenceMagic: magicArmour };
    const targetPrayerMultipliers = { ...DEFAULT_PRAYER_MULTIPLIERS, defence: defencePrayer, magic: magicPrayer };

    const result = rollZukBlast({
      attacker: ZUK,
      target: TARGET,
      targetEquipmentStats,
      targetPrayerMultipliers,
      random: () => 0,
    });

    expect(result.accuracy).toBe(1 - (defenceRoll + 2) / (2 * (174376 + 1)));
  });

  it('averages rolls rather than probabilities when the two styles have different accuracy', () => {
    const targetEquipmentStats = { ...createEmptyStats(), defenceRanged: 200, defenceMagic: 50 };
    const averageChance = (1 - 28250 / 502254 + (1 - 12086 / 195254)) / 2;

    const result = rollZukBlast({ attacker: ZUK, target: TARGET, targetEquipmentStats, random: () => 0 });

    expect(result.accuracy).toBe(1 - 20168 / 348754);
    expect(result.accuracy).not.toBeCloseTo(averageChance, 6);
  });

  it('floors averaged rolls when current stats and bonuses produce odd sums', () => {
    const attacker = { ...ZUK, offensive: { ...ZUK.offensive, ranged: 551 } };
    const target: PlayerFormulaActor = {
      ...TARGET,
      levels: { ...TARGET.levels, defence: 80, magic: 70 },
      stance: 'Controlled',
    };
    const targetEquipmentStats = { ...createEmptyStats(), defenceRanged: 1 };

    const result = rollZukBlast({ attacker, target, targetEquipmentStats, random: () => 0 });

    expect(result.accuracy).toBe(1 - (5516 + 2) / (2 * (174580 + 1)));
  });

  it('recalculates both accuracy and maximum damage when Zuk current levels change', () => {
    const attacker = { ...ZUK, levels: { ...ZUK.levels, ranged: 200, magic: 100 } };

    const result = rollZukBlast({
      attacker,
      target: TARGET,
      targetEquipmentStats: createEmptyStats(),
      random: () => 0,
    });

    expect(result.accuracy).toBe(1 - (6816 + 2) / (2 * (97626 + 1)));
    expect(result.maxHit).toBe(87);
  });

  it.each([
    { accuracySample: 1 - 6818 / 348754 - Number.EPSILON, succeeded: true },
    { accuracySample: 1 - 6818 / 348754, succeeded: false },
    { accuracySample: 1 - Number.EPSILON, succeeded: false },
  ])('keeps independent damage with accuracySucceeded=$succeeded when sample=$accuracySample', ({
    accuracySample,
    succeeded,
  }) => {
    const random = vi.fn<() => number>().mockReturnValueOnce(accuracySample).mockReturnValueOnce(0.5);

    const result = rollZukBlast({ attacker: ZUK, target: TARGET, targetEquipmentStats: createEmptyStats(), random });

    expect(result.accuracySucceeded).toBe(succeeded);
    expect(result.rolledDamage).toBe(74);
    expect(random).toHaveBeenCalledTimes(2);
  });
});
