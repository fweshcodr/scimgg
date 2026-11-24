import type { CombatSystem, SourceDeathPolicy } from '../../core/combat/CombatSystem';
import type { SimulationEngine } from '../../core/SimulationEngine';
import type { PendingHit, PendingHitDraft, WorldState } from '../../core/WorldState';

/**
 * A hand-built hit. `sourceDeathPolicy` defaults as `CombatSystem.commitAttack` does for an
 * unclassified attack: a player's persists, an NPC's cancels.
 */
export type TestPendingHitDraft = Omit<PendingHitDraft, 'sourceDeathPolicy'> & {
  readonly sourceDeathPolicy?: SourceDeathPolicy;
};

/**
 * Queues a hand-built hit through the production enqueue, so it gets a queue position and is bound
 * to the source and target instances currently registered under its ids. Tests must not push into
 * `world.pendingHits` directly: the drain rejects entries without that identity.
 */
export function enqueueTestPendingHit(
  world: WorldState,
  combatSystem: CombatSystem,
  hit: TestPendingHitDraft,
): PendingHit {
  const source = world.actors.get(hit.sourceId);
  const target = world.actors.get(hit.targetId);
  if (source === undefined || target === undefined) {
    throw new Error(`enqueueTestPendingHit: ${hit.sourceId}->${hit.targetId} needs both actors registered first`);
  }
  const sourceDeathPolicy = hit.sourceDeathPolicy ?? (source.kind === 'player' ? 'persist' : 'cancel-before-impact');
  return combatSystem.queuePendingHit(world, { ...hit, sourceDeathPolicy }, { source, target });
}

/** {@link enqueueTestPendingHit} against a running engine's own world and combat system. */
export function enqueueEnginePendingHit(engine: SimulationEngine, hit: TestPendingHitDraft): PendingHit {
  return enqueueTestPendingHit(
    Reflect.get(engine, 'worldState') as WorldState,
    Reflect.get(engine, 'combatSystem') as CombatSystem,
    hit,
  );
}
