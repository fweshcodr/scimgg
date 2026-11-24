# Movement & Facing

The rendering model follows Jagex's
[Movement in RuneScape](https://secure.runescape.com/m=news/dev-blog---movement-in-runescape):
tick positions are appended to a pending route that the renderer walks at fixed speed, catching up
when updates arrive late.

## Two layers

1. **Simulation (authoritative, 600 ms ticks).** [`SimulationEngine`](../../src/core/SimulationEngine.ts)
   updates `player.position`, `player.movementPath` (tiles stepped this tick) and `player.facing`.
   Facing comes from the last step's **integer tile delta** (`calculateAngleFromDelta`), or towards
   the target while attacking (below). It reaches the renderer as `playerFacingAngle`.
2. **Visual tracker (per frame).** [`PlayerVisualTracker`](../../src/render/core/interpolation.ts)
   interpolates position and facing. **The orientation you see is the tracker's `facingAngle`**, not
   the sim's facing.

[`RenderViewport3D`](../../src/render/components/RenderViewport3D.tsx) wires them each new tick:
`enqueueTickMovement(tick, playerMovementPath, isRunning)`, then (only when stationary)
`setTargetAngle(playerFacingAngle)`, then `setInteracting(!!attackTarget)` and
`setForcedFacingAngle` (sim facing while an attack target is held, else `null`).

## Angles

An actor carries two angles, matching RuneLite's `Actor.getOrientation()` /
`getCurrentOrientation()`: the **target** (`forcedFacing ?? _targetAngle`) and the **visual**
`_renderAngle`, rotated towards it at `turnSpeed` = 32 units per client cycle. The 32 is unsourced;
no permitted source gives a turn rate.

The walk turn penalty and the locomotion animation bucket both derive from
`(target - visual) & 2047`; keep them on the same angle pair or body and feet disagree. Convention:
`0=S, 256=SW, 512=W, 768=NW, 1024=N, 1280=NE, 1536=E, 1792=SE`; 2048 is a full circle
(RuneLite `coords/Angle`).

## Pitfalls

- **The visual lags the sim while walking.** A tile is 128 sub-units at speed 4 = 32 cycles =
  640 ms, but a tick is 30 cycles, so `pathQueue` builds a ~1-tile backlog and facing (from
  `pathQueue[0]`) can show the previous tile's direction. OSRS catch-up (`pathLength > 2` → speed 6,
  `> 3` → 8) bounds the lag; it does not remove it.
- **Sub-unit residue reads a cardinal as a diagonal.** The pop fires on
  `trunc(worldXFloat) === tileX`, so a walk can end at `tile + 0.5`, and the next walk's
  `calculateAngleFromDelta(-0.5, -128)` returns SW instead of S. Snap `worldXFloat/worldYFloat` to
  the tile on every pop, and derive post-pop direction from completed tile coordinates.
- **Direction comes from integer tile deltas**, never the float; float noise flips cardinals.
- **Three clocks.** `retargetToPathHead` runs per tick, the visual-angle step per 20 ms cycle inside
  `advance()`, and `interpolateAlongPath` per frame. The target angle is set per tick and on path
  pop, never per render frame.
- **An interacting player faces the target every tick, overriding movement.** While an attack
  interaction is active the player faces the target NPC's center each tick, even while moving
  (`PlayerAutoAttackSystem` calls `facePlayerTowardNpc` unconditionally). This is the OSRS
  `faceEntity` mask: the rev-228 `EntityEvent` re-applies `setFaceEntity(target)` in both `process()`
  and `processAfterMovement()` within 15 tiles. Movement-direction facing applies only with no live
  interaction.

## Countdown start positioning

For encounters that opt in, a fresh fight start (entry, Restart, an encounter's fresh restart)
lets ground clicks choose where the run starts. The sole gate is the encounter's run-setup hook
(`EncounterCoreModule.countdownMovement` in [`modules.ts`](../../src/encounters/modules.ts)), read from
the restarted engine when the countdown starts and kept current with tick-0 setup edits. Currently
only Inferno waves 1–68 opt in; Yama, Sol and Inferno wave 69 keep their opening positions. Future
encounters can opt in through the same hook. It is positioning, not early ticks: the numbered
count starts after any landing intro, and at each full countdown interval strictly before GO the
wiring ([`useSimulationWiring`](../../src/hooks/useSimulationWiring.ts)) delivers arrived inputs and
calls `SimulationEngine.prepareStartPosition(target)`. That walks one ordinary walk/run step
(`playerMoveAutopath`, terrain and LOC collision including dynamic walls, the run preference tick 1
will apply) and changes nothing else: tick, NPCs, encounter schedules, combat, prayer, run energy,
timers, RNG and queued inputs all wait, and no tick bus, Prayer Flick window, timing or recording
happens. NPC clicks clear the target, so the player stands still rather than chasing.

Before any live execution (GO, the countdown turned off, manual stepping, replay viewing, a
fast-forward) the wiring commits once: `finalizeStartPosition()` makes the tile the run's start as a
fresh build there would have it (start position, stationary opening locomotion and facing, entity
collision flags rebuilt), keeping seeds, loadout, mechanics and queued inputs, and
`ReplayRecorder.finalizeUnadvancedStart` moves the recording's bootstrap start and frame 0 onto it
(intro completed) and restarts ancillary capture there. GO then runs the ordinary first tick once.
Leaving or replacing the run drops the walk uncommitted. Restored (takeover/practice) countdowns never
move, even at tick 0. This is sound only because no encounter derives opening NPC state from the
player start ([encounters](encounters.md#determinism-and-run-setup)).

The same hook also keeps worn gear through restarts: `restartFight` (Restart, Ctrl+R and the
encounter's practice restarts) asks for it, and `resetRun` carries the gear worn at the restart into
the new run (`carryWornEquipment` in [`loadoutUtils.ts`](../../src/util/loadoutUtils.ts)) when the
reset engine's setup offers countdown movement and the configured equipment and inventory still
match the baseline the replaced run started from (`runLoadoutBaselineRef`: set on a new engine and
by each reset, cleared by a replay takeover). The carried loadout is what the engine is seeded with,
so the recording's bootstrap holds it. Rules: [Inferno policy](../encounters/inferno-policy.md).

A live restart onto the tile the 3D model's in-flight step already ends on (a restart where the
player stands) lets that step finish instead of snapping (`PlayerVisualTracker.routeEndsOn`); any other
rewind, a timeline change and replay seeks still snap. The minimap dot still snaps.

The tick stays 0 throughout, so viewports cannot key these steps on it. A live-only
`StartPositionPreparation` descriptor (boundary identity, step sequence, step and its time) feeds
each step once to `PlayerVisualTracker.enqueueSteps` in 3D, and the 2D view interpolates the latest
step over one interval. It never enters `SimulationState`, the replay timeline key or a recording.

## NPC crawl presentation and replay retention

An accepted adjacent NPC step may request `movementSpeed: 'crawl'`. Authoritative position
still advances to the destination on that simulation tick: routing, collision, damage and
encounter corner schedules do not wait for the visual. The actor and snapshot retain the
optional `crawlMovement: { from, to, startTick }` segment through unchanged ticks, including
the second half where `previousPosition === position`. A later ordinary move, teleport or
replacement crawl supersedes that presentation history; completed segments may remain inert.

NPC presentation samples this segment **statelessly** at `currentTick + fraction`, using
`clamp((currentTick + fraction - startTick) / 2, 0, 1)` to interpolate `from` → `to`.
Both the drawn actor and replay projectile aim use the same position sample, so seeking or
pausing in the second tick needs no accumulated renderer queue. The
two-tick linear velocity is a **MODEL**, not a recovered exact client velocity law.
Captured Solarflare I/II updates explicitly crawl; III updates walk.

The recorder's ordinary snapshot clone retains the optional segment, so playback samples it
exactly as the live view does. A snapshot without a segment slides from `previousPosition`
to `position` over one tick, or walks its published `movementPath`
(`src/render/npc/npcRenderPosition.ts`). Crawl history is excluded from authoritative
takeover comparison (`src/replay/resumableState.ts`), like other render history; actual
position, HP and damage state still have to match.

## NPC-before-player tick phases

`SimulationEngine.advanceTick` processes NPC movement and combat before player movement, so a
chasing NPC reads the player's start-of-tick tile, not the destination chosen that tick. NPC-targeted
queues (pending hits, burns, poison) drain before NPCs move, player-targeted queues before the player
moves. Full order: [per-tick pipeline](encounters.md#per-tick-pipeline).

RSMod and LostCity corroborate NPC-before-player processing and the per-owner queue band:

- **RSMod** at `fa13b3f`: [`GameCycle`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/GameCycle.kt#L37-L67)
  orders [`NpcMain`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/npc/NpcMainProcess.kt#L30-L45)
  before [`PlayerMain`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/game-process/src/main/kotlin/org/rsmod/api/game/process/player/PlayerMainProcess.kt#L33-L52),
  and `NpcMainProcess` runs `processQueues` before `processModes` and `processInteractions`. A hit
  on an NPC is one of those queues
  ([`NpcExtensions`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/npc/src/main/kotlin/org/rsmod/api/npc/hit/NpcExtensions.kt)
  queues `hit_queues.standard`, dispatched by
  [`NpcHitScript`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/hit-plugin/src/main/kotlin/org/rsmod/api/hit/plugin/NpcHitScript.kt));
  [`PlayerAttackManager`](https://github.com/rsmod/rsmod/blob/fa13b3f67172ef36e15d6b1514358aee61411796/api/combat/combat-manager/src/main/kotlin/org/rsmod/api/combat/manager/PlayerAttackManager.kt#L1479-L1492)
  queues retaliation ahead of the hit.
- **LostCity Engine-TS** at `274`: [`World.processNpcs`](https://github.com/LostCityRS/Engine-TS/blob/274/src/engine/World.ts)
  (stat regen, timer, queue, movement, modes) runs before `processPlayers`.

This is evidence of those engines, not proof of the live OSRS server's pipeline. Update-packet order
is a separate concern that Scim.GG does not model.

Due NPC attacks from any encounter emit in the pre-player NPC phase as
`EncounterTickResult.npcAttacks`. An encounter whose attack choice depends on the player's post-move
tile can decide in post-player work and queue the attack to emit pre-player on the next tick.
Example (Yama): mechanic beats **4/11/18** (`DEFAULT_YAMA_ATTACK_PATTERN` `beatStartTick: 4`, `beatIntervalTicks: 7`) pick
the style post-player, and the attack emits from `processTick` on **5/12/19** (`T+1`); fireball and
void-flare beats are unaffected.

## Debugging and tests

`PlayerVisualTracker` is pure logic: reproduce facing/position bugs with a standalone `tsx` script
that mimics the `RenderViewport3D` per-tick → per-frame loop, not a browser. `PlayerVisualState`
(`facingAngle`, `targetAngle`, `position`, `isRunning`, `locomotionState`, `simIsMoving`) is enough
to diagnose.

```ts
// repro.ts — run: npx tsx repro.ts  (delete when done)
import { PlayerVisualTracker } from './src/render/core/interpolation';
const FRAME_MS = 1000 / 60, FRAMES = Math.round(600 / FRAME_MS);
const t = new PlayerVisualTracker(10, 10);
t.facingAngle = 0;
function tick(n: number, path: Array<[number, number]>, simFacing: number, isRunning = false) {
  t.enqueueTickMovement(n, path, isRunning);
  if (path.length === 0) t.setTargetAngle(simFacing); // RenderViewport3D: only when stationary
  t.setInteracting(false);
  t.setForcedFacingAngle(null);
  let s = t.advance(FRAME_MS, 1);
  for (let f = 1; f < FRAMES; f++) s = t.advance(FRAME_MS, 1);
  console.log(`tick ${n} face=${s.facingAngle} tgt=${s.targetAngle} pos=[${s.position}]`);
}
tick(1, [[9, 9]], 256); // walk SW
tick(2, [], 256);       // stationary
tick(3, [[9, 8]], 0);   // walk S: must face S (0), not SW
```

- Force the residue pitfall with a non-frame-aligned budget: `t.advance(637.5, 1)` = 31.875 cycles
  × speed 4 = 127.5 of 128 sub-units, so the pop lands at `tile + 0.5`.
- Production caps frame deltas at 50 ms (`RenderViewport3D`); prefer many small `advance()` calls.

Add the regression as a pure-logic test in
[`PlayerVisualTracker.test.ts`](../../src/render/core/__tests__/PlayerVisualTracker.test.ts) (NPC
turning: [`NpcVisualTracker.test.ts`](../../src/render/core/__tests__/NpcVisualTracker.test.ts)),
not Playwright.
