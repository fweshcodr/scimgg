import type { NpcActor } from '../../actors/NpcActor';

/** A square around the primary target's true tile, and how many targets it takes, the primary included. */
export interface AreaTargetSelection {
  readonly radius: number;
  readonly maxTargets: number;
}

/**
 * The secondary targets of an area attack: an Ancient Burst or Barrage, or a chinchompa. `canTarget`
 * is the caller's life rule: the two differ on a neighbor on its kill tick (`canReceiveKillTickSpell`).
 */
export function selectSecondarySpellTargets(
  primary: NpcActor,
  candidates: readonly NpcActor[],
  area: AreaTargetSelection,
  canTarget: (candidate: NpcActor) => boolean,
): readonly NpcActor[] {
  const [centerX, centerY] = primary.position;
  const secondaries: NpcActor[] = [];
  for (const candidate of candidates) {
    if (
      candidate.id === primary.id ||
      !canTarget(candidate) ||
      Math.abs(candidate.position[0] - centerX) > area.radius ||
      Math.abs(candidate.position[1] - centerY) > area.radius
    ) {
      continue;
    }
    secondaries.push(candidate);
    if (secondaries.length === area.maxTargets - 1) break;
  }
  return secondaries;
}
