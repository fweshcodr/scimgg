import type { NpcActor } from '../../core/actors/NpcActor';
import type { PlayerActor } from '../../core/actors/PlayerActor';
import { canReceiveNewAttack } from '../../core/npcDeath';
import type { WorldState } from '../../core/WorldState';

// Ready-action reacquisition model: docs/encounters/zuk-policy.md (Glyph damage and destruction).
export function resolveReadyTarget(actor: NpcActor, world: WorldState): PlayerActor | NpcActor | null {
  const targetId = actor.combat.targetId;
  if (targetId === null) return null;
  const target = world.getPlayers().find((player) => player.id === targetId) ?? world.getNpc(targetId);
  if (target !== undefined && target !== null && canReceiveNewAttack(target)) return target;
  const player = world.getPlayer();
  if (!player?.alive) return null;
  actor.combat.targetId = player.id;
  return player;
}
