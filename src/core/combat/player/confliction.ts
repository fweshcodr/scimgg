import { findEquipmentCatalogItem } from '../../../data/equipmentCatalog';
import type { PlayerEquipment } from '../../../rs/model/PlayerModelLoader';
import { getWeaponCategoryKey } from '../../../types/attackStyles';
import type { ActorId } from '../../actors/types';
import type { ResolvedAttackResources } from '../attackResources';
import type { CombatFormulaStyle } from '../formulas';
import type { StandardAccuracyMode } from '../playerAttackProfiles';

const CONFLICTION_GAUNTLETS = 31106;

export type PendingConflictionAttack =
  | { readonly kind: 'spell'; readonly spellId: string; readonly targetId: ActorId }
  | { readonly kind: 'charged_staff'; readonly weaponId: number; readonly targetId: ActorId };

export type ConflictionAttackContext = {
  readonly equipment: PlayerEquipment;
  readonly formulaStyle: CombatFormulaStyle;
  readonly attackResources: ResolvedAttackResources;
  readonly targetId: ActorId;
};

export type ConflictionEligibilityContext = Omit<ConflictionAttackContext, 'targetId'>;
export type ConflictionAccuracyMode = Exclude<StandardAccuracyMode, 'steady_state'>;

export function isConflictionAttackEligible(context: ConflictionEligibilityContext): boolean {
  if (context.equipment.hands !== CONFLICTION_GAUNTLETS) return false;

  const weaponId = context.equipment.weapon;
  const weapon = weaponId === undefined ? undefined : findEquipmentCatalogItem(weaponId);
  if (weapon?.isTwoHanded) return false;

  if (context.attackResources.kind === 'spell') {
    return true;
  }

  if (weapon?.version?.includes('Uncharged')) return false;

  return (
    context.formulaStyle === 'magic' && weaponId !== undefined && getWeaponCategoryKey(weaponId) === 'powered_staff'
  );
}

export function resolveConflictionAttackIdentity(context: ConflictionAttackContext): PendingConflictionAttack | null {
  if (!isConflictionAttackEligible(context)) return null;
  if (context.attackResources.kind === 'spell') {
    return { kind: 'spell', spellId: context.attackResources.spellId, targetId: context.targetId };
  }

  const weaponId = context.equipment.weapon;
  return weaponId === undefined ? null : { kind: 'charged_staff', weaponId, targetId: context.targetId };
}

function identitiesMatch(left: PendingConflictionAttack, right: PendingConflictionAttack): boolean {
  if (left.kind !== right.kind || left.targetId !== right.targetId) return false;
  if (left.kind === 'spell') return right.kind === 'spell' && left.spellId === right.spellId;
  return right.kind === 'charged_staff' && left.weaponId === right.weaponId;
}

export function getConflictionAccuracyMode(
  pending: PendingConflictionAttack | null,
  current: PendingConflictionAttack | null,
): ConflictionAccuracyMode {
  return pending !== null && current !== null && identitiesMatch(pending, current) ? 'double_roll' : 'single_roll';
}

export function updatePendingConflictionAttack(
  pending: PendingConflictionAttack | null,
  current: PendingConflictionAttack | null,
  accuracySucceeded: boolean,
): PendingConflictionAttack | null {
  if (current === null || (pending !== null && !identitiesMatch(pending, current))) return pending;
  return accuracySucceeded ? null : current;
}
