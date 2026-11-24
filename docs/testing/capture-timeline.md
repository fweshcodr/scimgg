# Capture Replay

Test-only replay ranges, read by the capture-conformance tests. The captures (`*-packet-data.txt`,
cited by file name) are private gameplay captures. Each range file holds one replayed tick range of
one capture stream: the state the range starts from and every record the replay reads in it,
nothing else. Read [Capture fixtures](../agent-reference.md#capture-fixtures) before deriving
behavior from one. The Inferno replay findings below are also indexed, with the unexplained,
contradicted and unsupported behavior around them, in
[`inferno-open-questions.md`](../encounters/inferno-open-questions.md).

| File | Role |
| --- | --- |
| [`src/test/capture/types.ts`](../../src/test/capture/types.ts) | The record contract (`ReplayRange`, its lives, start state and events) |
| [`src/encounters/inferno/__tests__/replayRange.ts`](../../src/encounters/inferno/__tests__/replayRange.ts) | The range-file reader: `loadReplayRange(path)`, `parseReplayRange`, `lifeKey`, `INFERNO_ORIGIN` |
| [`src/encounters/inferno/__tests__/captureFixtures.ts`](../../src/encounters/inferno/__tests__/captureFixtures.ts) | The committed ranges per capture (`INFERNO_CAPTURE_FIXTURES`) and the varbit allowlist |
| `src/encounters/inferno/__tests__/fixtures/replay/*.replay.txt` | The range files |
| [`src/npcs/inferno/__tests__/fixtures/infernoWaveProjectilesCapture.ts`](../../src/npcs/inferno/__tests__/fixtures/infernoWaveProjectilesCapture.ts) | Every ordinary-wave profile projectile of both captures, grouped by identical values, for `projectileProfiles.test.ts` |

Nothing under `src/test/capture` may be imported by production code, and range files never go in
`public/` (both enforced by `src/test/capture/__tests__/importBoundary.test.ts`).
`captureFixtures.test.ts` checks each capture's ranges for the varbit allowlist, account and session
terms, messages other than waves, and digests, and that the directory holds exactly the listed files.

Other capture-backed tests read smaller, purpose-built fixtures of extracted facts, each next to
its test with a header naming its capture.

## Replay ranges

The range files and the projectile table are derived from the private captures and are fixed
evidence. A range file is named `<capture>.s<stream>.t<first>-<last>.replay.txt` and spans the
capture ticks of the conformance windows it serves; nested windows share one range. A window
replays inside the range of its capture stream that holds its last tick, so a new window case may
start at any wave whose spawn lies in a range and end at any tick inside it.

A range holds only what the replay reads: actor additions, removals and moves; every NPC
animation and the player's attack animations; the ice-impact and failed-spell graphics on NPCs; NPC
projectiles and the player's Ice Burst; every hitsplat; NPC deaths (health bar at zero); Jal-Zek
facing and resurrection graphics; the "Wave: N" messages; and the protection-prayer and
pillar-damage varbits (`INFERNO_CAPTURE_VARBITS`). There are no player names, chat, varps, other
varbits, interface or input records, and no index or session state of the recording player.

### Grammar

```text
capture <capture file> stream <n> ticks <first>-<last>
life <actor> <first update tick> <removal tick | open>
start <first - 1>
  player <x>,<y>
  npc <actor> <x>,<y>
  varbit <id> <value>
t<tick>
  add <actor> <x>,<y> @<line>
  del <actor> <x>,<y> @<line>
  walk|run|crawl|teleport|telejump <actor> <x>,<y> -> <x>,<y>[ via <x>,<y> ...] @<line>
  seq <actor> <animation id> @<line>
  gfx <actor> <graphic id>[ delay <client cycles>] @<line>
  hit <actor> <hitsplat type> <value> @<line>
  dead <actor> @<line>
  face <actor> <x>,<y> @<line>
  face <actor> <target actor> <x>,<y> @<line>
  proj <id> <x>,<y> -> <actor>|tile <x>,<y> [<start>,<end>,<slope>,<progress>,<start height>,<end height>] @<line>
  mapgfx <graphic id> <x>,<y> @<line>
  wave <n> @<line>
  varbit <id> <value> @<line>
```

- **Header.** The first line names the capture file, its 1-based stream and the inclusive tick
  range, in the capture's own tick counter.
- **Actors.** `player` is the recording player. An NPC is `<species>#<npc index>#<generation>`:
  indices are reused, so `generation` counts earlier lives of that index in the stream. Species map
  to NPC ids: `nibbler` 7691, `bat` 7692, `blob` 7693, `blob_mage` 7694, `blob_range` 7695,
  `blob_melee` 7696, `meleer` 7697, `ranger` 7698, `mager` 7699, `jad` 7700, `healer` 7701,
  `pillar` 7709, `collapse` 7710. Every NPC a range names has one `life` line: the tick of its first
  update in the stream and the tick of its removal, or `open` when the stream ends first.
- **Tiles.** `x,y` is local to the arena, `local = world - (2240, 5312)`, on plane 0.
- **Start state.** `start` is the end of the tick before the range: the player's tile, each present
  NPC's tile, and each allowlisted varbit's latest value, in the order the capture first set them.
- **Ticks and lines.** A `t<tick>` line opens a tick and is followed by its records in capture order;
  ticks increase and a tick with no records is omitted. `@<line>` is the record's line in the
  capture.
- **Records.** `add` and `del` give the NPC's tile. A move goes from the start tile to the
  destination; `via` lists the tiles between for a move of more than one step, and a player run
  prints no steps. `seq` is an animation, `-1` clearing it. `gfx` is a graphic on an NPC (363 ice
  impact; 85 failed-spell impact, with its delay). `hit` is a hitsplat by RuneLite `HitsplatID` type.
  `dead` is an NPC's health bar reaching zero. `face` turns an NPC towards a tile, or towards another
  actor on its tile. `proj` is a projectile from its source tile to its target actor (`tile` when the
  target resolves to no actor) and target tile, with its packet fields: start and end in client
  cycles, launch slope, progress, start and end height. `mapgfx` is a graphic on a tile (444,
  resurrection). `wave` is the "Wave: N" game message. `varbit` is a varbit's new value.

Reading is strict: any other line, spacing or field, a record without its `@<line>`, a tick out of
order or outside the range, or an actor without a `life` line throws a `ReplayRangeError` naming the
file and line (`replayRange.test.ts`).

## Decision randomness

[`src/core/decisionRandom.ts`](../../src/core/decisionRandom.ts) is the one production seam:
`DecisionRandom { next(); chance(key, p); int(key, low, high); choose(key, options) }` with
`DecisionKey { site, tick, actorId?, targetId?, ordinal? }`.

- The default (`generatorDecisionRandom`) turns **exactly one** generator draw into each decision
  with the arithmetic of an unlabeled draw (`next() < p`,
  `low + floor(next() * (high - low + 1))`, the weighted walk `chooseWeighted`). Uniform integer
  weights equal `floor(next() * n)`; the Jad thresholds use weights of 1/3 and 1/2, which equal
  the `< 1/3, < 2/3` and `< 0.5` comparisons exactly.
- Eligibility stays at the call site: an ineligible decision (no corpse, a prayer-determined blob
  style, a lone eligible attack) is not drawn; one with a forced or singleton outcome (a lone
  standing pillar) still draws.
- Labels do not change the streams. `NpcDefinitionContext.decisions` (read through `contextDecisions`) shares
  `random`'s stream; contexts without it label draws of `random`. The Inferno encounter takes
  `decisionRandom(stream, wave, next)` per seeded stream (`layout`, `nibbler_target`, `npc`); the
  engine takes `combatDecisions(next)` over its combat stream. Both are constructor options, never
  persisted, and replay formats do not carry them.
- Labeled sites: `inferno.layout.slot|jad|nibbler_x|nibbler_y`, `inferno.nibbler.pillar`,
  `inferno.nibbler.damage`, `inferno.blob.style`, `inferno.blob.melee`,
  `inferno.meleer.dig_interval`, `inferno.mager.rez`, `inferno.mager.rez.corpse`,
  `inferno.mager.rez.tile`, `inferno.jad.style`, `inferno.jad_healer.tile`, `npc.attack.select`,
  `npc.attack.accuracy`, `npc.attack.damage`, `npc.movement.overlap_escape`. Player attack rolls
  stay unlabeled draws of the combat stream.
- Parity: `src/encounters/inferno/__tests__/decisionParity.test.ts` replays 3 run seeds x 8
  start waves x 260 ticks against digests of the same runs drawn **without** labels
  (`fixtures/decision-parity.golden.json`), and again with every stream wrapped, asserting each
  labeled site is reached.

## Replay

[`src/test/capture/constrainedRandom.ts`](../../src/test/capture/constrainedRandom.ts) forces a
captured outcome only when the decision's support allows it (`chance` cannot be forced true at
p <= 0 or false at p >= 1; `int` within its bounds; `choose` among positive-weight offered values),
still consuming one backing draw per replaced decision. A refused constraint is a recorded
violation; unmatched decisions are drawn freely and recorded as such; required constraints never
used are reported. A resolver supplies constraints that depend on the sim's own actor ids.

[`src/test/capture/replay.ts`](../../src/test/capture/replay.ts) `replayCapture(case, session)` is a
single pass: `applyInputs(tick)` (player inputs and labeled conditioning only), `advance()`,
then `observe(tick)` (sim) against `expected(tick)` (capture), per declared channel, as multisets.
No seed search, backtracking or resync. Each actor and channel reports its first divergence (with
the capture line and recent decisions); later ones are counted. The session's `explain` marks a
divergence inconclusive when it follows something that is not evidence (a free draw, an earlier
divergence of the actor, a player input the sim could not reproduce); a case's
`expectedDivergences` / `expectedViolations` mark known findings. Outcome: `conformant`,
`divergence` (any unexplained divergence or violation) or `inconclusive`; a pass that observed
nothing is never conformant.

### Inferno adapter

[`captureAdapter.ts`](../../src/encounters/inferno/__tests__/captureAdapter.ts) replays P and
Q windows (`captureConformance.test.ts`) on the cache-baked arena
(`fixtures/inferno-arena.json.gz`, re-checked by `infernoArena.test.ts` when the test cache exists).

- Frame: `local = world - (2240, 5312)`; the window's first wave spawns at the encounter's start
  delay (`startWaveDelayTicks`: sim tick 11 for wave 1, sim tick 1 for a later start wave, a
  practice convenience), so a window starts at sim tick 1 and nothing but the player is compared
  before the spawn.
- Mapping: a sim NPC is bound to the capture life added on the same tick with the same type and
  tile, else (one of a type on each side) by type; never by nearest position.
- Witnesses: the slot shuffle (a Fisher-Yates swap witness for the captured assignment, batch in
  NPC index order), nibbler tiles, the wave pillar (nibbler facing, else first steps), blob
  style/melee from releases, mager rez/corpse/tile, Jad tells, healer tiles, attack selection, the
  overlap-escape step, the meleer dig chain (a local search that reaches every captured dig, from
  the previous dig's down+6 or the first check, with every hidden check between suppressed by a
  captured swing; dig-check draws never excuse a divergence, since they only schedule the next
  check) and NPC hit rolls (the captured splat on the attack's target at its
  impact tick, accurate when non-zero).
- Conditioning (stated in every report): captured player-dealt splats (12/16/43, burn 74) land on
  their tick through the hit queue, retaliation notified at the latest player attack animation;
  splashes (failed-spell graphic 85, no splat) notified as magic misses with no damage; captured ice
  freezes; infinite HP; prayer points and run energy held full; captured prayers;
  window-start pillars and damage varbits; movement clicks on the captured end-of-tick tile.
- Channels: spawn, despawn, move (destination and run path), attack (action sequences), projectile
  (id, target and the six packet fields), projectile_origin (launch tile), hit (by target), pillar
  (damage varbits), player.

### Findings

Implemented, each conformant in the replays. Ratios counted over a whole capture (for example
872/886 kills, 5,324 steps or 743/819 ranger volleys) were measured on the private captures; the
committed ranges hold only the replayed windows and do not reproduce them.

| Id | Rule | Owner | Evidence |
|---|---|---|---|
| R1 (F5) | Removal happens in the removed NPC's own turn: lower-index NPCs stay blocked on the removal tick, higher-index ones may enter. | `Encounter.removeNpcIfDue` (engine, step 0 of each turn); Inferno and Zuk | Q t4119/t4120, Q t4180/t4181, P t7626/t7627, P t7687 |
| F2 | Waves 67-68 Yt-HurKot first move/heal at add+1 (wave 69's still act on the add tick). | `createJadHealer({ firstTurnTick })`, waves spawner | 0/28 act on their add tick; W69 t877 |
| F3 | Inferno NPCs regenerate 1 HP per 100 ticks from add+101; revived NPCs start at `floor(maxHp / 2) + 1`. | `enableNpcHitpointRegen` in the Inferno encounter's spawn; `createInfernoWaveNpc` | 872/886 kills end at 0 HP (806 without); every revival fits |
| F4 | Resurrection footprints may overlap living NPCs (not corpses, pillars or the player). | `resurrection.ts` (`canReviveAt`) | 12/34 overlap living NPCs, 0 corpses |
| N1 | A melee hit on the player from an NPC killed earlier that tick lands nothing; NPC-on-NPC swings still land. | `CombatSystem.commitAttack` | 14/14 swings at the player no splat; 15/15 nibbler swings damage the pillar |
| F6 | Bat launches from its SW tile; ranger muzzles by facing octant. | `bat.ts`, `demonstrateSet` | 143/143 bat; 743/819 ranger |
| N6 | A resurrecting Jal-Zek takes no step before rez+7 (an NPC it overlaps waits with it). | `setMonsters.ts` (`stillUntilTick`) | 8/8 movers first step at rez+7 or later, 4 exactly +7 (P t4869, t4931, Q t1966, t3459) |
| F1 | Two perpendicular run steps complete in one tick. | player-movement lane (`movement.ts`) | 161 runs; every replayed player tile matches |
| F8 | An ice spell freezes from the tick after the cast. | player-spell lane (`CombatSystem.applyFreezeAtLaunch`) | P t581 cast, NPCs stop t582. The replays still supply freezes, as they supply the player's attacks |
| Dig | A Jal-ImKot resurfaces around the player's tile from the start of its dig-down tick (NE corner, else SW, else the rest). | `meleer.ts` (`state.dig.target`) | 42/42 (25 NE, 16 SW, 1 (1,1) at P t1145); P t3017, t8079, t9074, Q t1654 discriminate. Table-driven in `meleerResurface.test.ts` |
| F7 | Revived NPCs step from add+1 but attack, read or resurrect from add+7 (value: policy within add+4..add+7). | `waveNpcs.ts` (`REVIVED_FIRST_ACTION_TICKS`) | 25/25 revived attackers at add+7 or later (Q t708 bat +7); Q t3459 ranger, P t4931 blob (read t5023, shot t5026) |
| N5 | Untagged Yt-HurKot step with the generic combat movement toward the Jad (contact destination), wave 69 included. | `jadHealer.ts` -> `standardNpcCombatMove(actor, context, parent)` | 63/64 untagged P+Q steps; P t9815, R t130-132, Q t4792-4794; wave 69's one untagged step fits |
| N10 | Yt-HurKot use standard retaliation (speed 4): first swing splat + 2 after a hit, cast + 3 after a splash. | `createJadHealer` (`createNpcRetaliation()`) | 6/6 hits (Q t4803, t5016, t5133 x2, P t9833, R t405); splash P t9822; wave 69's 6 splashes turn at cast + 1 |
| N5d | From its Jad's death sequence to removal an untagged Yt-HurKot still walks to it and casts heal, restoring nothing. | `jadHealer.ts` (`supportedParent`) | Q t4842-4843 (with the Jad's 444), t4944-4945, t5065; wave 69's healers are all tagged by then |
| Splash | The replay adapter notifies a splashed NPC (graphic 85, no splat) as a magic miss, with no damage. | `captureAdapter.ts` (conditioning) | P t9819 healer 62227 turns on the player at t9820 |
| N5r, N8 | Entity collision flags: one blocked flag per tile, set on entering, cleared on leaving even when another actor remains; the player's steps (run middle tile included) and NPC steps update them in processing order, in every encounter. | `TileOccupancy` (`npcOccupancy.ts`), `WorldState.occupancy`, engine steps | 5,324 Inferno combat-NPC steps: no entry into a blocked tile once splits are ordered as below (34 counting occupants); all 11 healer stacks; P t9831-9837, R t401, Q t4842-4843, t4944, t5065, N8 P t7627/t7670 match |
| Order | The replay maps same-tick Yt-HurKot to the sim's draw order by NPC index, the game's turn order, not by printed add order. | `captureAdapter.ts` (`inferno.jad_healer.tile`) | P t9814 prints 62229 before 62227; at t9843 62229 enters the tile 62227 just left |
| Add tick | An NPC added during the NPC turns takes its turn that tick; one added before or after them (wave spawns, Zuk sets, commands) first moves and acts next tick, for every species. The add packet's tile for a split child or revived NPC is where that first step ended. | `SimulationEngine` (`addedOutsideNpcTurns`) | 198/198 child add tiles and 34/34 revived add tiles reproduced; P t774, P t4886 (N2), Q t895, Q t2646, Q t2993 match |
| Split | Children born at Xil (1,1), Ket (0,0), Mej (2,2) from the parent's SW, added in that order before the parent's removal clears its 3×3; born in combat, ready at add+3. | `blob.ts` (`SPLIT_BLOB_OFFSETS`, `createSplitBlob`), `removeInfernoNpcIfDue(addSplit)` | 198/198 add tiles; 0/66 parents move while dying; P t610 hit and splash before add+3 do not delay (P:2540-2600) |
| Revive | Birth SW uniform over local x 31-37, y 28-34; the caster faces it; graphic 444 at birth + (size − 2); the revived NPC steps that tick. The replay constrains the drawn tile to the birth tile (graphic − offset, else the caster's facing), not the add tile. | `resurrection.ts`, `captureAdapter.ts` (`inferno.mager.rez.tile`) | 34/34 births in the box, all 49 tiles legal in every scene; P t4869 (P:85377-85383) |

Still open (declared in `captureConformance.test.ts`):

| Id | Finding | Evidence |
|---|---|---|
| F6r | 76/819 ranger volleys leave from a pair that does not face the target. | |
| N5r | Two ticks after a player run cleared a healer's tile, the healer behind it still does not step in; every other stack fits the flags. | R t400 run, t402 (and t412 in the same chase) |
| Jad step | Healer steps after the sim Jad's extra underfoot escape (an unwitnessed draw) differ. In R the healers' different tiles after t402 free a Jad escape at t425 that the capture does not take (inconclusive, a free draw); its later projectiles and splats follow it (R 264/297 projectiles). | P t9844-9845, R t425 |
| N7 | 14/886 kills overkill by 1 with no regeneration window. | P t755, t7684 |
| N9 | 15 single-splat kills (P 9, Q 6, mostly Jal-Ak) animate on the kill tick, not K+1. No player projectile accounts for it (240/249 P kills with one launched in the 4 ticks before animate at K+1), so it is classified inconclusive. | P t847, t8246 |
| N9 split | A parent Jal-Ak animated on its kill tick (N9) is removed a tick early, so its children are added a tick before the sim's. | P t849 (after t847), P t8248 (after t8246) |
| D10 | Children given lower NPC indices than earlier NPCs (index wrap) turn before them and stay on their birth tiles that tick; not modeled. | Q t4300 (P t6752 is in no window) |
| Q new | Unanalyzed divergences in the split windows: a hit after a blob release masked by a defend, a blob step a tick late. | Q t888, t2896, t2909 |
| Jad K | A Jad animates its death on its last-hit tick, as N9; unexplained. | Q t5060 |
| Meleer flinch | A Jal-ImKot hit for 0 while walking in swings the tick it reaches the player (splat + 1). The sim's standard flinch, `floor(4 / 2)`, holds it a tick longer. Its later swings and the player's later splats are folded into the finding. | P t9037-9038 (atlatl launched t9034) |

N3 (Jad steps toward the player and back) are underfoot escapes once the healers engage on time,
with N5 and the splash input (P t9843 and R t744 match); N4's Jad death ticks (R t263, Q t4839,
t4940) match. One later Jad escape step (P t9844) follows an unwitnessed overlap-escape draw and is
inconclusive.

The adapter attributes melee splats with the player's start-of-tick tile (Q t3449, the meleer's 9
matches) and projectiles only to NPC types that launch them (P t8053). Nibbler first swings match
arrival+1 wherever both sides observe them (the only differences are sim swings on ticks where the
capture sent a defend, which masks the swing sequence).

### Coverage ledger

Matched / expected observations per window (`CAPTURE_REPORT=1` prints the full report):

| Window | Ticks | Spawn | Despawn | Move | Attack | Projectile | Origin | Hit | Pillar | Player | Replay |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| P wave 4 | 53 | 7/7 | 7/7 | 14/14 | 18/18 | 10/10 | 10/10 | 14/14 | — | 53/53 | 45 ms |
| P wave 5 | 60 | 8/8 | 8/8 | 37/37 | 17/17 | 8/8 | 8/8 | 10/10 | — | 60/60 | 16 ms |
| P wave 9 | 37 | 4/4 | 4/4 | 20/20 | 10/10 | — | — | 6/6 | 1/1 | 37/37 | 11 ms |
| P waves 1-10 | 554 | 47/65 | 46/65 | 243/302 | 110/143 | 75/82 | 75/82 | 95/107 | 7/8 | 554/554 | 133 ms |
| P wave 46 | 253 | 16/16 | 15/16 | 90/92 | 67/68 | 40/40 | 40/40 | 48/48 | — | 253/253 | 48 ms |
| P wave 58 | 217 | 8/8 | 8/8 | 69/69 | 78/78 | 57/57 | 57/57 | 70/70 | — | 217/217 | 32 ms |
| P wave 59 | 211 | 9/9 | 9/9 | 71/71 | 80/80 | 76/76 | 72/76 | 71/71 | 7/7 | 211/211 | 33 ms |
| P wave 61 | 309 | 9/12 | 8/12 | 79/80 | 79/88 | 82/87 | 78/87 | 73/80 | — | 309/309 | 49 ms |
| P wave 64 | 265 | 8/8 | 8/8 | 98/100 | 83/102 | 60/60 | 60/60 | 64/81 | 17/17 | 265/265 | 37 ms |
| P wave 67 | 366 | 6/6 | 6/6 | 37/41 | 64/64 | 24/63 | 24/63 | 41/54 | — | 366/366 | 43 ms |
| P wave 68 (R) | 890 | 12/12 | 12/12 | 129/149 | 219/223 | 264/297 | 264/297 | 189/204 | — | 890/890 | 86 ms |
| Q wave 38 | 77 | 8/8 | 8/8 | 48/48 | 22/22 | 12/12 | 12/12 | 15/16 | 1/1 | 77/77 | 10 ms |
| Q wave 54 | 126 | 10/10 | 10/10 | 67/67 | 49/49 | 46/46 | 44/46 | 41/41 | — | 126/126 | 16 ms |
| Q wave 56 | 195 | 13/13 | 13/13 | 73/74 | 82/84 | 76/89 | 74/89 | 72/75 | — | 195/195 | 25 ms |
| Q wave 59 | 216 | 10/10 | 10/10 | 103/104 | 82/82 | 83/83 | 81/83 | 71/71 | 4/4 | 216/216 | 27 ms |
| Q wave 63 | 211 | 11/14 | 14/14 | 53/56 | 74/74 | 52/52 | 52/52 | 62/62 | — | 211/211 | 21 ms |
| Q wave 67 | 88 | 6/6 | 6/6 | 17/17 | 32/32 | 21/21 | 21/21 | 22/22 | — | 88/88 | 9 ms |
| Q wave 68 | 330 | 12/12 | 8/12 | 54/54 | 126/127 | 87/87 | 87/87 | 105/105 | — | 330/330 | 31 ms |

Continuous runs drift where a divergence changes an NPC's death (P waves 1-10 lose later waves after
the N9 kill-tick deaths shift a split by a tick). On the private captures, the longest runs, P waves
1-67 (9590 ticks) and Q waves 28-68 (5219 ticks), replay in about 1.2 s and 1.0 s.
