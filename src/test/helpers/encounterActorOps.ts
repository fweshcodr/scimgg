import type { NpcActor } from '../../core/actors/NpcActor';
import type { ActorId } from '../../core/actors/types';
import type { EncounterContext } from '../../core/encounters/types';
import type { WorldState } from '../../core/WorldState';
import type { Coordinate } from '../../types/simulation';

/**
 * The engine-owned actor lifecycle operations, for tests that build an `EncounterContext` by
 * hand instead of driving a real `SimulationEngine`.
 *
 * These MUST stay behaviorally identical to `SimulationEngine.spawnEncounterNpc` /
 * `despawnEncounterNpc` — including the duplicate-id throw and the current-tick history seed —
 * or a harness would let an encounter get away with something the engine forbids.
 *
 * Combat-cooldown cleanup (`CombatSystem.forgetActor`) is deliberately omitted: harnesses that
 * own a `CombatSystem` are free to wrap these, but the maps it clears are unobservable to
 * encounter logic, so a harness without one behaves the same.
 */
export function createEncounterActorOps(world: WorldState): Pick<EncounterContext, 'spawnNpc' | 'despawnNpc'> {
  return {
    spawnNpc: (actor: NpcActor): void => {
      if (world.actors.has(actor.id)) {
        throw new Error(`spawnNpc: duplicate actor id '${actor.id}'`);
      }
      world.registerNpc(actor);
      actor.history.set(world.tick, [...actor.position] as Coordinate);
    },
    despawnNpc: (npcId: ActorId): void => {
      world.removeActor(npcId);
    },
  };
}
