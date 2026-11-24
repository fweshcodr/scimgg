import type { ActorId } from '../../core/actors/types';
import type { NpcSnapshot } from '../../types/simulation';

/**
 * How the renderer should aim one NPC this frame.
 *
 * This is render policy, not simulation state: the simulation publishes facts
 * (`lockedFacing`, `actionFacing`, `combatTargetId`, `facingAngle`) and this layer decides what
 * to do with them, so replay snapshots stay free of renderer concerns.
 *
 * - `fixed`: hold this exact OSRS angle, no smoothing (e.g. Zuk's shield).
 * - `turn-to-angle`: smooth toward this angle.
 * - `track-actor`: smooth toward the live bearing to `targetId`'s visual center.
 */
export type NpcRenderFacingIntent =
  | { readonly kind: 'fixed'; readonly angle: number }
  | { readonly kind: 'turn-to-angle'; readonly angle: number }
  | { readonly kind: 'track-actor'; readonly targetId: ActorId };

/**
 * Resolve a snapshot's facing facts into this frame's aiming behavior.
 */
export function deriveNpcRenderFacingIntent(
  npc: Pick<NpcSnapshot, 'facingAngle' | 'lockedFacing' | 'actionFacing' | 'combatTargetId'>,
): NpcRenderFacingIntent {
  if (npc.lockedFacing !== undefined) {
    return { kind: 'fixed', angle: npc.lockedFacing };
  }
  if (npc.actionFacing !== undefined) {
    return { kind: 'turn-to-angle', angle: npc.actionFacing };
  }
  if (npc.combatTargetId != null) {
    return { kind: 'track-actor', targetId: npc.combatTargetId };
  }
  return { kind: 'turn-to-angle', angle: npc.facingAngle };
}
