import { createEmptyStats, type EquipmentStats } from '../../types/equipmentStats';
import { type DecisionKey, type DecisionRandom, generatorDecisionRandom } from '../decisionRandom';
import {
  type CombatFormulaStyle,
  calculateAccuracy,
  calculateMaxHit,
  type NpcFormulaActor,
  type PlayerFormulaActor,
  type PrayerMultipliers,
} from './formulas';

/**
 * Labels the two draws (`npc.attack.accuracy`, then `npc.attack.damage`) when the caller has a
 * decision stream; without one they are plain draws of `random`, mapped identically.
 */
export interface NpcAttackDecisions {
  readonly decisions: DecisionRandom;
  readonly key: Omit<DecisionKey, 'site'>;
}

interface NpcTargetRequest {
  readonly attacker: NpcFormulaActor;
  readonly target: NpcFormulaActor;
  readonly style: CombatFormulaStyle;
  readonly random: () => number;
  readonly labelled?: NpcAttackDecisions;
  readonly maxHitOverride?: number;
}

interface PlayerTargetRequest {
  readonly attacker: NpcFormulaActor;
  readonly target: PlayerFormulaActor;
  readonly targetEquipmentStats: EquipmentStats;
  readonly targetPrayerMultipliers?: PrayerMultipliers;
  readonly style: CombatFormulaStyle;
  readonly random: () => number;
  readonly labelled?: NpcAttackDecisions;
  readonly maxHitOverride?: number;
}

export type NpcAttackResolutionRequest = NpcTargetRequest | PlayerTargetRequest;

export interface NpcAttackRoll {
  readonly accuracy: number;
  readonly accuracySucceeded: boolean;
  readonly maxHit: number;
  readonly rolledDamage: number;
}

export function resolveNpcAttack(request: NpcAttackResolutionRequest): NpcAttackRoll {
  let equipmentStats: EquipmentStats;
  let prayerMultipliers: PrayerMultipliers | undefined;
  if ('targetEquipmentStats' in request) {
    equipmentStats = request.targetEquipmentStats;
    prayerMultipliers = request.targetPrayerMultipliers;
  } else {
    equipmentStats = createEmptyStats();
  }
  const accuracy = calculateAccuracy(
    request.attacker,
    request.target,
    request.style,
    equipmentStats,
    prayerMultipliers,
  );
  const maxHit = request.maxHitOverride ?? calculateMaxHit(request.attacker, request.style, equipmentStats);
  const decisions = request.labelled?.decisions ?? generatorDecisionRandom(request.random);
  const key = request.labelled?.key ?? { tick: -1 };
  const accuracySucceeded = decisions.chance({ ...key, site: 'npc.attack.accuracy' }, accuracy);
  const rolledDamage = decisions.int({ ...key, site: 'npc.attack.damage' }, 0, Math.max(0, Math.trunc(maxHit)));
  return { accuracy, accuracySucceeded, maxHit, rolledDamage };
}
