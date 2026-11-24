import type { NpcActor } from '../actors/NpcActor';
import { canReceiveHealing } from '../npcDeath';

/** /w/Hitpoints#Regeneration and /w/Combat: hitpoints regenerate 1 point per minute (100 ticks). */
export const NPC_HITPOINT_REGEN_INTERVAL_TICKS = 100;

/**
 * Opts an NPC into natural hitpoint regeneration. Opt-in because enabling it on NPCs whose
 * encounters already ship would change their recorded replays.
 *
 * The clock starts the tick after the NPC is added: Sol Heredit, added on each fight's control
 * tick, heals at add+101, +201, +301... in all three captures (K:4099/4199, M:8374/8474,
 * N:7503/7603/7703; N's +101 is invisible only because he was still at full HP).
 */
export function enableNpcHitpointRegen(npc: NpcActor, addedTick: number): void {
  npc.hitpointRegenNextTick = addedTick + 1 + NPC_HITPOINT_REGEN_INTERVAL_TICKS;
}

/**
 * Advances the regen clock. It runs on a fixed cadence whether or not the NPC is hurt, so a heal
 * that lands at full HP is simply lost (N:7403 at 1500/1500, then 7503 heals as usual).
 */
export function advanceNpcHitpointRegen(npc: NpcActor, tick: number): void {
  if (npc.hitpointRegenNextTick === undefined || !canReceiveHealing(npc) || tick < npc.hitpointRegenNextTick) return;
  npc.hitpointRegenNextTick += NPC_HITPOINT_REGEN_INTERVAL_TICKS;
  if (npc.vitals.hp > 0 && npc.vitals.hp < npc.vitals.maxHp) npc.vitals.hp++;
}
