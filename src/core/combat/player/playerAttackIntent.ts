import type { ActorBase } from '../../actors/ActorBase';
import { canInitiateAttackOnNpc } from '../../actors/NpcActor';
import type { PlayerActor } from '../../actors/PlayerActor';
import type { ActorId } from '../../actors/types';
import { canReceiveKillTickSpell, canReceiveNewAttack } from '../../npcDeath';
import type { WorldState } from '../../WorldState';

interface PlayerAttackIntent {
  readonly targetId: ActorId | null;
  readonly manualCastSpell: string | null;
}

/**
 * Whether the player's current attack may still start on `target`. Only a manual cast (the
 * spell-on-NPC op) reaches an NPC on its kill tick; autocast and every other attack do not.
 */
export function canPlayerStartAttackOn(player: PlayerActor, target: ActorBase): boolean {
  return player.manualCastSpell ? canReceiveKillTickSpell(target) : canReceiveNewAttack(target);
}

export function clearPlayerAttackIntent(player: PlayerActor): void {
  player.attackTarget = null;
  player.attackInteractionActive = false;
  player.manualCastSpell = null;
}

export function registerPlayerAttackIntent(player: PlayerActor, world: WorldState, intent: PlayerAttackIntent): void {
  const target = intent.targetId === null ? null : world.getNpc(intent.targetId);
  if (target && !canInitiateAttackOnNpc(target, world.tick)) {
    clearPlayerAttackIntent(player);
    return;
  }
  player.attackTarget = intent.targetId;
  if (target) player.lastAttackTarget = target.id;
  player.attackInteractionActive = intent.targetId !== null;
  player.manualCastSpell = intent.targetId === null ? null : intent.manualCastSpell;
}

export function cancelBlockedPlayerAttack(player: PlayerActor, world: WorldState): boolean {
  const target = player.attackTarget === null ? null : world.getNpc(player.attackTarget);
  if (!target || canInitiateAttackOnNpc(target, world.tick)) return false;
  clearPlayerAttackIntent(player);
  return true;
}
