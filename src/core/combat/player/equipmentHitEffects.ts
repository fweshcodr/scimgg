import { getCanonicalEquipmentItemId } from '../../../data/equipmentCatalog';
import type { PlayerEquipment } from '../../../rs/model/PlayerModelLoader';
import type { NpcActor } from '../../actors/NpcActor';
import type { ActorId } from '../../actors/types';
import { type BurnSeverity, canLayBurnStack, layBurnStack } from '../burnStacks';
import type { CombatFormulaStyle } from '../formulas';

const ECLIPSE_ATLATL = 29000;
const ECLIPSE_BODY = 29004;
const ECLIPSE_HELM = 29010;
const ECLIPSE_LEGS = 29007;
const ECLIPSE_BURN_CHANCE = 0.2;
const ECLIPSE_BURN_PULSES = 10;
/**
 * "Strong burns, sometimes called sunfire burns (inflicted by the eclipse moon armour set...)"
 * (/w/Burn). Not `normal`: a monster immune only to normal burns still takes these.
 */
const ECLIPSE_BURN_SEVERITY: BurnSeverity = 'strong';

export interface EquipmentHitEffectsSnapshot {
  readonly eclipseBurn: boolean;
}

export interface ResolveEquipmentHitEffectsInput {
  readonly snapshot: EquipmentHitEffectsSnapshot;
  readonly accurate: boolean;
  readonly target: NpcActor;
  readonly sourceId: ActorId;
  readonly impactTick: number;
  readonly roll: () => number;
}

function canonicalItemId(itemId: number | undefined): number | undefined {
  return itemId === undefined ? undefined : getCanonicalEquipmentItemId(itemId);
}

export function captureEquipmentHitEffects(
  equipment: Readonly<PlayerEquipment>,
  formulaStyle: CombatFormulaStyle,
): EquipmentHitEffectsSnapshot {
  return {
    eclipseBurn:
      formulaStyle === 'ranged' &&
      canonicalItemId(equipment.weapon) === ECLIPSE_ATLATL &&
      canonicalItemId(equipment.head) === ECLIPSE_HELM &&
      canonicalItemId(equipment.body) === ECLIPSE_BODY &&
      canonicalItemId(equipment.legs) === ECLIPSE_LEGS,
  };
}

export function resolveEquipmentHitEffects(input: ResolveEquipmentHitEffectsInput): void {
  if (!input.snapshot.eclipseBurn || !input.accurate) return;
  if (!canLayBurnStack(input.target, ECLIPSE_BURN_SEVERITY)) return;
  if (input.roll() >= ECLIPSE_BURN_CHANCE) return;

  layBurnStack({
    target: input.target,
    sourceId: input.sourceId,
    origin: 'eclipse',
    severity: ECLIPSE_BURN_SEVERITY,
    pulses: ECLIPSE_BURN_PULSES,
    tick: input.impactTick,
  });
}
