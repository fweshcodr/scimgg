import type { NpcActor } from '../../actors/NpcActor';
import type { PlayerActor } from '../../actors/PlayerActor';

export function facePlayerTowardNpc(player: PlayerActor, npc: NpcActor): void {
  const npcCenterX = npc.position[0] + npc.size / 2;
  const npcCenterY = npc.position[1] + npc.size / 2;
  const playerCenterX = player.position[0] + 0.5;
  const playerCenterY = player.position[1] + 0.5;
  const faceDx = npcCenterX - playerCenterX;
  const faceDy = npcCenterY - playerCenterY;
  if (faceDx === 0 && faceDy === 0) return;

  const radians = Math.atan2(-faceDx, -faceDy);
  player.facing = ((Math.round(radians * (2048 / (2 * Math.PI))) % 2048) + 2048) % 2048;
}
