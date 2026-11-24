import { isNpcTargetable } from '../../core/actors/NpcActor';
import type { NpcSnapshot } from '../../types/simulation';

/**
 * Fill of an NPC's despawn timer bar at `tick`: empty when the NPC becomes targetable, full
 * `despawnTimerLeadTicks` before `despawnTick`, and held full after that. Null while the NPC has
 * no bar: dead, without a future despawn, or not yet targetable. Shared by the 3D overlay and the
 * 2D void flare charge bar so the two never disagree.
 */
export function npcDespawnTimerRatio(npc: NpcSnapshot, tick: number): number | null {
  if (!npc.alive || npc.spawnTick === undefined || npc.despawnTick === undefined) return null;
  if (npc.despawnTick <= npc.spawnTick || !isNpcTargetable(npc, tick)) return null;
  const startTick = npc.targetableFromTick ?? npc.spawnTick;
  const endTick = npc.despawnTick - (npc.despawnTimerLeadTicks ?? 0);
  if (endTick <= startTick) return 1;
  return Math.min(1, Math.max(0, (tick - startTick) / (endTick - startTick)));
}
