import type { NpcSnapshot } from '../../types/simulation';

/**
 * Whether an NPC is still drawn standing at presentation `cycle` (`tick * 30`): alive, or killed with
 * its death animation not yet started. A queued death (`docs/architecture/npc-hit-queue-and-death.md`,
 * section 3) reports `alive: false` from the killing tick but keeps moving and attacking through its
 * permitted turn, and only falls at `deathAnimationTick`.
 */
export function isNpcStandingAt(npc: Pick<NpcSnapshot, 'alive' | 'deathAnimationTick'>, cycle: number): boolean {
  return npc.alive || (npc.deathAnimationTick !== undefined && cycle < npc.deathAnimationTick * 30);
}
