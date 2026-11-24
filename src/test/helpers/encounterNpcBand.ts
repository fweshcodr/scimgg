import type {
  Encounter,
  EncounterContext,
  EncounterTickResult,
  EnvironmentalDamage,
  NpcAttackRequest,
} from '../../core/encounters/types';
import type { MechanicsConfig } from '../../types/simulation';

/**
 * The encounter's own half of the engine's NPC band, for tests that drive an encounter by hand
 * without a `SimulationEngine`: `prepareNpcBand`, each registered NPC's local effects and action in
 * processing order, then `completeNpcBand`. Movement, the hit queues and attack commitment are the
 * engine's and are not run; the attacks are returned instead, with all the damage, in band order.
 */
export function runEncounterNpcActions(
  encounter: Encounter,
  ctx: EncounterContext,
  mechanics: Partial<MechanicsConfig>,
): Required<EncounterTickResult> {
  const npcAttacks: NpcAttackRequest[] = [];
  const environmentalDamages: EnvironmentalDamage[] = [];
  encounter.prepareNpcBand?.(ctx, mechanics);
  const roster = ctx.world.getNpcs().sort((left, right) => (left.processingOrder ?? 0) - (right.processingOrder ?? 0));
  for (const npc of roster) {
    if (ctx.world.actors.get(npc.id) !== npc) continue;
    environmentalDamages.push(...(encounter.resolveNpcLocalEffects?.(npc, ctx, mechanics) ?? []));
    const result = encounter.processNpcTick?.(npc, ctx, mechanics);
    if (!result) continue;
    npcAttacks.push(...(result.npcAttacks ?? []));
    environmentalDamages.push(...result.environmentalDamages);
  }
  environmentalDamages.push(...(encounter.completeNpcBand?.(ctx, mechanics) ?? []));
  return { npcAttacks, environmentalDamages };
}
