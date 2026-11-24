import { describe, expect, it } from 'vitest';
import { createEmptyStats } from '../../../types/equipmentStats';
import type { NpcFormulaActor, PlayerFormulaActor } from '../formulas';
import { resolveNpcAttack } from '../npcAttackResolution';

const ATTACKER: NpcFormulaActor = {
  kind: 'npc',
  levels: { attack: 100, strength: 100, defence: 100, ranged: 100, magic: 100 },
  offensive: { atk: 100, str: 100, ranged: 100, rangedStr: 100, magic: 100, magicStr: 100 },
  defensive: { stab: 100, slash: 100, crush: 100, rangedLight: 100, rangedStandard: 100, rangedHeavy: 100, magic: 100 },
};

const NPC_TARGET: NpcFormulaActor = {
  kind: 'npc',
  levels: { attack: 1, strength: 1, defence: 100, ranged: 1, magic: 100 },
  offensive: { atk: 0, str: 0, ranged: 0, rangedStr: 0, magic: 0, magicStr: 0 },
  defensive: { stab: 80, slash: 80, crush: 80, rangedLight: 80, rangedStandard: 80, rangedHeavy: 80, magic: 80 },
};

const PLAYER_TARGET: PlayerFormulaActor = {
  kind: 'player',
  levels: { attack: 1, strength: 1, defence: 99, ranged: 1, magic: 99 },
  stance: 'Defensive',
};

describe('resolveNpcAttack', () => {
  it('resolves NPC-vs-NPC accuracy and damage from injected random values', () => {
    const samples = [0, 0.999999];
    let sampleIndex = 0;

    const result = resolveNpcAttack({
      attacker: ATTACKER,
      target: NPC_TARGET,
      style: 'melee_crush',
      random: () => samples[sampleIndex++] ?? 0,
    });

    expect(result.accuracySucceeded).toBe(true);
    expect(result.rolledDamage).toBe(result.maxHit);
    expect(result.accuracy).toBeGreaterThan(0);
  });

  it('resolves NPC-vs-player defence using the target equipment and injected RNG', () => {
    const equipmentStats = createEmptyStats();
    equipmentStats.defenceRanged = 200;

    const result = resolveNpcAttack({
      attacker: ATTACKER,
      target: PLAYER_TARGET,
      targetEquipmentStats: equipmentStats,
      style: 'ranged',
      random: () => 0.999999,
    });

    expect(result.accuracy).toBeGreaterThan(0);
    expect(result.accuracy).toBeLessThan(1);
    expect(result.accuracySucceeded).toBe(false);
    expect(result.rolledDamage).toBeGreaterThanOrEqual(0);
    expect(result.rolledDamage).toBeLessThanOrEqual(result.maxHit);
  });
});
