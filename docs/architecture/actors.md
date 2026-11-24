# Actors

Actors are plain data in `WorldState.actors`, discriminated by `kind: 'player' | 'npc'`
([`src/core/actors/`](../../src/core/actors/)). Behavior lives in systems (`SimulationEngine`,
`CombatSystem`, encounters, NPC definitions), never in actor methods. Narrow on `kind`; no cast is
needed. Read the interfaces rather than a summary of their fields.

Pure data is load-bearing: `ReplayRecorder` clones simulation state every frame, and tests build
actors from literals. Keep actor state free of methods and closures.

## NPC identity and state

- `archetypeId` is the encounter-semantic/render key (e.g. `'yama'`, `'zuk_mager'`); `role`
  (`'boss' | 'minion' | 'npc'`) is the coarser lifecycle/UI class. They are not interchangeable.
  See [Encounters](encounters.md#npc-definitions-and-identity) for the full identity list.
- `history` lets interpolation and the pending-hit pass ask where an NPC stood on an earlier tick.
- `state` is the NPC definition's own type; core sees only an opaque object. Access it through the
  matching definition's `getState` / `isActor`. `definition` carries only an id, never behavior.
- Two NPCs of one species have independent latches, child ownership and charge timers. Do not
  add an encounter-side map for those fields. Retaliation policy and pending reactions live
  in `combat`.
- Effects whose lifetime has detached from their source use a separate pending-effect owner:
  deleting a charging NPC is not the same operation as canceling an already-launched impact.
- Live actors are not the render DTO. `WorldState` projects snapshots (which exclude definition
  identity); replay takeover rebuilds live actors through their definitions from the saved run
  configuration and inputs, never from a raw clone.

## Lifecycle

1. **Creation.** NPCs come from definition factories under `src/npcs/` and are registered with
   `ctx.spawnNpc(actor)`. Encounters never write `world.actors`; a duplicate id throws.
2. **Death.** The first lethal hit clears `alive`, creates the death record and emits `actor_died`
   once; scripted deaths use `markNpcDead(npc, tick)`. An `immediate` NPC (bosses, scripted adds)
   starts its death then. A `queued` one may still take that tick's turn, starts its death at K+1 (or
   K when promoted) and plays its death clip at `deathAnimationTick`, standing until then. See
   [NPC hit queue and deferred death](npc-hit-queue-and-death.md#3-life-state).
3. **Pruning.** A dead NPC is deleted `DEAD_ACTOR_PRUNE_GRACE_TICKS` after its death (for a queued
   death, after the later of the kill and `deathAnimationTick`). `role: 'boss'` NPCs are never pruned,
   so a defeated boss stays inspectable.
4. **Despawn without death.** `ctx.despawnNpc(id)` removes the actor outright (OSRS `del`): no
   `alive: false`, no `actor_died`, no death clip. Pick deliberately.

Occupancy is not actor state: `WorldState.occupancy` holds the entity collision flags that NPC
steps check. The engine's steps, `registerNpc` and `removeActor` update them, and placements are
reconciled at turn boundaries ([contract](npc-combat-movement.md#entity-collision-flags)). `blocksNpcMovement: false` keeps an actor
out of them; `passThruNpcs` lets an NPC ignore them.

Binds are a window, not a countdown: `isNpcBound(npc, tick)` tests the half-open
`[boundFromTick, boundUntilTick)` range recorded when the binding attack fired.
