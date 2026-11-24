import type { DamageType, NpcCombatState } from '../actors/types';

// Normative delay, reaction origin and readiness predicate: docs/architecture/npc-retaliation.md.
export function flinchCooldownTicks(attackSpeed: number): number {
  return Math.floor(attackSpeed / 2);
}

export function flinchWindowStartTick(hit: {
  readonly style: DamageType;
  readonly accuracySucceeded: boolean;
  readonly launchTick: number;
  readonly impactTick: number;
}): number {
  const splashed = hit.style === 'magic' && !hit.accuracySucceeded;
  return splashed ? hit.launchTick + 1 : hit.impactTick;
}

export const NPC_COMBAT_TIMEOUT_TICKS = 8;

export function isInCombat(combat: NpcCombatState, tick: number, playerId: string): boolean {
  return combat.targetId === playerId && combat.nextActionTick + NPC_COMBAT_TIMEOUT_TICKS >= tick;
}

export function isFlinchable(combat: NpcCombatState, tick: number, playerId: string): boolean {
  return !isInCombat(combat, tick, playerId);
}

export function applyFlinch(combat: NpcCombatState, tick: number, playerId: string): boolean {
  if (!isFlinchable(combat, tick, playerId)) return false;
  combat.nextActionTick = Math.max(combat.nextActionTick, tick + flinchCooldownTicks(combat.attackSpeed));
  return true;
}
