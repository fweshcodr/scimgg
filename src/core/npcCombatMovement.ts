import type { Coordinate } from '../types/simulation';
import type { ActorBase } from './actors/ActorBase';
import { isNpcBound, type NpcActor } from './actors/NpcActor';
import type { PlayerActor } from './actors/PlayerActor';
import { isUnderNpc } from './combat/distance';
import { hasNpcAttackReach } from './combat/npcAttackRequest';
import { contextDecisions, uniformOptions } from './decisionRandom';
import type { NpcMovementRequest } from './encounters/types';
import { canNpcActThisTurn } from './npcDeath';
import { canNpcTakeStep } from './npcMovementCollision';
import { createNpcStepOccupancyPredicate, npcFootprintsOverlap } from './npcOccupancy';
import type { NpcDefinitionContext } from './npcs/types';

// An attack canceled by eating/equipping/drinking is no longer active; a walk click clears both.
function hasActiveRedXInteraction(player: PlayerActor): boolean {
  return (player.attackTarget !== null && player.attackInteractionActive) || player.pendingItemPickup !== null;
}

// Red-X hold: docs/architecture/npc-combat-movement.md.
export function isNpcMovementSuppressed(npc: NpcActor, player: PlayerActor | null, tick: number): boolean {
  return (
    isNpcBound(npc, tick) ||
    (player !== null &&
      npc.movesWithAttackerUnder !== true &&
      isUnderNpc(player.position, npc.position, npc.size) &&
      npc.combat.targetId === player.id &&
      hasActiveRedXInteraction(player))
  );
}

// RSMod's contact destination is not nearest-point clamping: docs/architecture/npc-combat-movement.md#movement-evidence.
function naiveCombatDestination(
  source: Pick<NpcActor, 'position' | 'size'>,
  target: Pick<NpcActor, 'position' | 'size'>,
): Coordinate {
  const deltaX = source.position[0] - target.position[0];
  const deltaY = source.position[1] - target.position[1];
  const diagonal = deltaX + deltaY;
  const anti = deltaX - deltaY;
  const southWestClockwise = anti < 0;
  const northWestClockwise = diagonal >= target.size - source.size;
  const northEastClockwise = anti > 0;
  const southEastClockwise = diagonal <= target.size - source.size;
  const [targetX, targetY] = target.position;

  if (southWestClockwise && !northWestClockwise) {
    const offsetY =
      diagonal >= -source.size
        ? Math.min(diagonal + source.size, target.size - 1)
        : anti > -source.size
          ? -(source.size + anti)
          : 0;
    return [targetX - source.size, targetY + offsetY];
  }
  if (northWestClockwise && !northEastClockwise) {
    const offsetX =
      anti >= -target.size
        ? Math.min(anti + target.size, target.size - 1)
        : diagonal < target.size
          ? Math.max(diagonal - target.size, -(source.size - 1))
          : 0;
    return [targetX + offsetX, targetY + target.size];
  }
  if (northEastClockwise && !southEastClockwise) {
    const offsetY =
      anti <= target.size
        ? target.size - anti
        : diagonal < target.size
          ? Math.max(diagonal - target.size, -(source.size - 1))
          : 0;
    return [targetX + target.size, targetY + offsetY];
  }
  const offsetX =
    diagonal > -source.size
      ? Math.min(diagonal + source.size, target.size - 1)
      : anti < source.size
        ? Math.max(anti - source.size, -(source.size - 1))
        : 0;
  return [targetX + offsetX, targetY - source.size];
}

/**
 * One combat step toward the NPC's living combat target, stopping once it has reach. A support NPC
 * passes the ally it walks to instead (Yt-HurKot to its Jad, dying or not); the caller vets that ally.
 */
export function standardNpcCombatMove(
  actor: NpcActor,
  context: NpcDefinitionContext,
  ally?: ActorBase,
): NpcMovementRequest[] {
  if (
    !canNpcActThisTurn(actor, context.tick) ||
    (actor.spawnTick !== undefined && actor.spawnTick > context.tick) ||
    actor.combat.attackRange <= 0
  ) {
    return [];
  }
  const combatTarget = actor.combat.targetId === null ? undefined : context.world.actors.get(actor.combat.targetId);
  const target = ally ?? (combatTarget?.alive ? combatTarget : undefined);
  if (!target || isNpcMovementSuppressed(actor, context.world.getPlayer(), context.tick)) return [];

  const overlapsTarget = npcFootprintsOverlap(actor, target);
  if (!overlapsTarget && hasNpcAttackReach(actor, target, actor.combat.attackRange)) return [];
  const canEnterActors = createNpcStepOccupancyPredicate(context.world.occupancy);
  const canStep = (candidate: Coordinate): boolean =>
    canNpcTakeStep(actor.position, candidate, { width: actor.size, height: actor.size }) &&
    (actor.passThruNpcs === true || canEnterActors(actor.position, candidate, actor.size));

  if (overlapsTarget) {
    // Four equal weights reproduce the `roll < 0.25 / 0.5 / 0.75` thresholds exactly (r * 4 is exact).
    const offset = contextDecisions(context).choose(
      { site: 'npc.movement.overlap_escape', tick: context.tick, actorId: actor.id, targetId: target.id },
      uniformOptions<Coordinate>([
        [0, -1],
        [0, 1],
        [-1, 0],
        [1, 0],
      ]),
    );
    const candidate: Coordinate = [actor.position[0] + offset[0], actor.position[1] + offset[1]];
    return canStep(candidate) ? [{ npcId: actor.id, path: [candidate] }] : [];
  }

  const destination = naiveCombatDestination(actor, target);
  const stepX = Math.sign(destination[0] - actor.position[0]);
  const stepY = Math.sign(destination[1] - actor.position[1]);
  const candidates: readonly Coordinate[] = [
    [actor.position[0] + stepX, actor.position[1] + stepY],
    [actor.position[0] + stepX, actor.position[1]],
    [actor.position[0], actor.position[1] + stepY],
  ];
  const nextStep = candidates.find(canStep);
  return nextStep ? [{ npcId: actor.id, path: [nextStep] }] : [];
}
