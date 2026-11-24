# Default NPC combat movement

## Definition contract

- Omit `move` to inherit standard combat movement.
- Set `move: false` to disable definition-owned movement.
- Supply a `move` callback to replace the default with scripted movement.

Only registered NPC definitions inherit the default; raw demonstration actors remain inert.
An encounter's `moveNpc(actor, ...)` owns that NPC's step in its turn. Without that override, the
engine dispatches the actor's registered definition itself. Turns run in processing order, so each
step is applied before the next actor plans. Zuk forwards those same definitions; Sol gates his
modifier NPCs; Yama keeps its encounter-owned pursuit.

Standard movement reads the actor's current live combat target, footprint, and configured attack
range. It does not acquire targets, change retaliation state, or reset attack clocks. Missing or
dead targets produce no movement; species target-reacquisition rules still run in their own
action phase. A normal pursuit tick requests at most one tile, independently of attack cooldown.

Movement stopping and NPC attacks share `hasNpcAttackReach`: non-overlapping footprints,
configured reach, and target-to-attacker LOS. Overlapping combat targets instead cause one
random cardinal escape attempt. Binds and the [Red-X][wiki-red-x] hold suppress this before it
consumes randomness. The hold applies while the NPC is targeting the player, the player stands
under its footprint, and the player has an active red-X interaction: an attack on any NPC that
eating, equipping or drinking has not canceled, or a pending Take. It gates every movement
path through `isNpcMovementSuppressed`; Warband NPCs opt out with `movesWithAttackerUnder`.

Immediately before each NPC's movement, after that actor's hit and timer stages, the engine
samples footprint overlap with its live combat target. The sample is taken in that actor's turn,
so an NPC earlier in the processing order may already have moved. `canNpcAttack` suppresses new
initiation for a turn that started overlapped, even if escape exposes the target. This is separate
from `hasNpcAttackReach` and action readiness: ordinary approach can still move and attack in one
turn, blocked initiation consumes no attack RNG or cooldown, and pending windup releases,
queued hits, healing, and despawn callbacks continue. NPC actions still precede player movement;
an exposed player can be attacked next turn before stepping back under. The transient
`startedTurnOverlappingTarget` combat field is refreshed in every turn the actor keeps, including
turns without movement, so it never carries over from an earlier tick. Fresh spawns have no
inherited turn state.

This overlap rule is simulator policy, corresponding to RSMod's [overlap early return][overlap]
(ISC, revision `fa13b3f`).

The default checks [entity collision flags](#entity-collision-flags) along the leading edge, so
an already-overlapping spawn can leave its stack without being allowed to enter new blockers.
Sol's breadth-first pursuit checks the same flags. `passThruNpcs` bypasses them, not terrain, and
does not make that actor nonblocking to other movers.

Zuk, enrage healers, Yama's definition, and void flares explicitly disable default movement.
Glyph patrol keeps its callback. Jad healers delegate both engaged player pursuit and their
unengaged return to the parent (`standardNpcCombatMove(actor, context, parent)`) to the standard
mover, keeping their own target cleanup and staying put under the parent. Zuk magers
and rangers inherit the default using their 15- and 16-tile ranges. Live Jad also inherits
the default once its execution configures its 15-tile range at the end of its opening guard.

## Entity collision flags

`TileOccupancy` in [`npcOccupancy.ts`](../../src/core/npcOccupancy.ts) is the single occupancy layer
NPC steps check; `WorldState.occupancy` holds the world's.

- **One flag per tile.** An actor entering a tile sets its footprint's flags. Leaving clears them,
  even if another actor still stands there, so stacks form and a stacked actor stops blocking the
  cleared tiles until it moves again.
- **Who sets them.** The player and every NPC, unless `blocksNpcMovement` is false. Only NPC steps
  check them, and only the tiles the footprint newly covers (a size-1 diagonal also needs both side
  tiles). Players walk through NPCs, and `passThruNpcs` movers ignore the flags.
- **Order.** The engine applies each step as it happens: an NPC's path tile by tile in its turn
  (processing order), then the player's steps, a run's middle tile included. An NPC planning later
  in the band sees every earlier step.
- **Spawns and removals update them as they happen.** `WorldState.registerNpc` sets a spawn's
  footprint and `WorldState.removeActor` (despawn, pruning) clears the removed actor's, in mutation
  order. A Jal-Ak's children are registered first in its removal turn; the parent's removal then
  clears the shared flags, including the children's birth tiles.
- **Placements are reconciled at turn boundaries.** At the start of each NPC's movement and before the
  player's steps, the engine reconciles positions changed without a step (a resurface, a teleport, a
  scripted placement): in world order, such an actor leaves its old footprint and enters the new one.
  Predicates only read the flags; they never update them.
- **Membership, not life.** A corpse keeps its flags until it is removed, and removal happens in
  the removed NPC's own turn (R1): NPCs earlier in that tick's order stay blocked, later ones may
  enter (Inferno wave 59, P:140314-140366).

Evidence (`docs/encounters/inferno-facts-spec.md`, Tile occupancy): over 5,324 Inferno combat-NPC
steps in four captures (5,627 including 303 lobby/town NPC steps recorded before entering), the flags leave no step into a blocked tile once a Jal-Ak's children are added
before its removal and NPCs added during the NPC turns take their first step that tick; counting
occupants instead gives 34. Every one of the 11 Yt-HurKot stacks follows a player run over the occupied
tile or a stack partner leaving it. In the Colosseum and Sol captures (4357 blocking-NPC steps; no stacks among combat NPCs, the stacking modifiers being non-blocking) both models
agree: 2 entries into blocked tiles, a beam crystal onto the player and a Javelin Colossus onto an NPC.
Yama's 27 entries (23 into a void flare, 1 by a thrall, 3 by a thrall into Yama) do not apply: Yama
keeps its own pursuit.

**Add-tick turns** (`SimulationEngine.processNpcBand`): an NPC registered during the NPC turns takes its
turn that tick, after every NPC registered before it; one registered before them (a command,
`prepareNpcBand`) or after them (a wave spawn, Zuk's sets, Sol's and Yama's add-ons) first moves and
acts next tick. Species keep only their own attack and readiness delays.

## Source boundary

The references below are permissively licensed server reimplementations, not Jagex's server
code. They establish the source model for ordinary combat pursuit; they do not establish every
boss-specific exception. Target acquisition, retaliation, encounter scripts, and attack clocks
remain separate responsibilities under [NPC behavior ownership](./npc-behaviors.md).

## Movement evidence

RSMod's hostile interaction path installs a `RouteRequestPathingEntity`, rather than using its
player-follow mode. The latter includes follower teleport behavior and is not a combat model.

- [AiPlayerInteractions.kt:20-46][interaction] installs the interaction and its entity route.
- [NpcMovementProcessor.kt:121-137][movement] supplies both southwest anchors and both footprint
  sizes to `RouteFinding.naiveDestination`.
- [RouteFinding.kt:1746-1807][destination] chooses a footprint contact destination. This is not
  nearest-point clamping or a breadth-first route search.
- [StepFactory.kt:63-123][step] attempts diagonal, horizontal, then vertical movement, validating
  the whole moving footprint. The same priority applies to large NPCs.
- [NpcInteractionProcessor.kt][process] checks interaction before and after movement. Its ranged
  approach check requires non-overlapping footprints, range, and reverse target-to-NPC LOS. Its
  overlap branch attempts one randomly selected cardinal step unless the player is busy.

Attack cooldown does not itself suspend pursuit. RSMod processes movement separately from the
interaction callback. In 2004Scape, the [generic attack][attack] checks `npc_action_delay`, and
the [ranged attack][ranged] preserves combat mode while cooling down. They do not use `npc_delay`
to suspend the NPC for an ordinary attack cooldown.

2004Scape's [large-actor stepping][old-step] is cardinal-only. That is a difference from the
modern RSMod reference, not a rule to transplant into an OSRS default. The Wiki's
[Monster combat features][wiki] independently describes ranged/magic pursuit when the target
leaves missile range or goes behind a wall; it does not specify all timing or path tie-breaks.

The Wiki's [Pathfinding article][wiki-pathfinding] separates player route calculation from NPC
stepping: player routes use breadth-first search, whereas NPC-style follow mode "naively paths
diagonally to the end tile and then straight if there's no diagonals left." Its player BFS
neighbor order and route-search bounds are not the default NPC chase algorithm.

No follower teleport, arbitrary leash, return-home behavior, or target-reset timer follows from
these movement decisions. License notices for these references are in
[`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md).

[interaction]: https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/npc/src/main/kotlin/org/rsmod/api/npc/interact/AiPlayerInteractions.kt#L20-L46
[movement]: https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/npc/NpcMovementProcessor.kt#L121-L137
[destination]: https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/engine/routefinder/src/main/kotlin/org/rsmod/routefinder/RouteFinding.kt#L1746-L1807
[step]: https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/route/src/main/kotlin/org/rsmod/api/route/StepFactory.kt#L63-L123
[process]: https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/npc/NpcInteractionProcessor.kt
[overlap]: https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/npc/NpcInteractionProcessor.kt#L62-L80
[attack]: https://github.com/2004Scape/Server/blob/647886c42f8a22c0f18e5dbe79c2697f052f8d2e/data/src/scripts/skill_combat/scripts/npc/npc_combat.rs2#L34-L53
[ranged]: https://github.com/2004Scape/Server/blob/647886c42f8a22c0f18e5dbe79c2697f052f8d2e/data/src/scripts/skill_combat/scripts/npc/npc_combat_ranged.rs2#L18-L47
[old-step]: https://github.com/2004Scape/Server/blob/647886c42f8a22c0f18e5dbe79c2697f052f8d2e/src/engine/entity/PathingEntity.ts#L638-L680
[wiki]: https://oldschool.runescape.wiki/w/Monster?oldid=15264774#Combat_features
[wiki-pathfinding]: https://oldschool.runescape.wiki/w/Pathfinding?oldid=14947485#The_checkpoint_tiles_and_destination_tile
[wiki-red-x]: https://oldschool.runescape.wiki/w/Red-X?oldid=15144408
