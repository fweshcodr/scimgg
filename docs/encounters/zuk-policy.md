# TzKal-Zuk — simulator policy

Models for behavior the [facts spec](./zuk-facts-spec.md) does not settle. None of these is a claim
of OSRS parity, and tests of them prove the simulator contract, not a game rule.
Anything without a cited fact or an entry here stays unimplemented; the capture that would settle
each gap is in [`zuk-open-questions.md`](./zuk-open-questions.md).

## Phase thresholds

Jad when Zuk drops **strictly below 480**, enrage and healers **strictly below 240**, latched by
positive non-lethal player hits. Natural healing back above a boundary does not undo its latch.
Simulator policy; the captures do not distinguish these alternatives (they skip both equality
values, and the Wiki pages disagree: facts § 2).

Practice raw HP slider: sets the Jad (<480) and healer (<240) latches from the edited HP without
firing phase callbacks or spawning actors. Raising HP to or above a boundary re-arms that phase for
the next qualifying hit. Existing actors stay, and an established enrage clock is kept.

Practice presets: Start restores full HP and resets the set clock to 72; Pre-Jad starts at 480 and
pauses the set clock at 350 until Jad adds 175; Pre-Healers starts at 240 with Jad cleared and a
525-tick baseline that already includes the bonus. Every preset clears minions, NPC hits and queued
sparks and re-phases Zuk's cast clock to the glyph's spawn tick. A living glyph is healed in place;
a dead or missing one is recreated at the patrol center in the run's remembered direction.

## Glyph start direction

`zukShieldStart`: `random` (default), `left` or `right`, as seen from Zuk's default camera yaw 0
(left = west endpoint 0, right = east endpoint 1); unknown persisted values mean random. Random is an
equal-weight simulator policy: the Wiki establishes east-west travel and a remembered initial
direction, not the distribution. The low bit of `fmix32(runSeed)` picks the endpoint without
advancing any decision stream, so it follows the run seed: Go to the same wave keeps it, and
Retry, which draws a new run seed on wave 69, redraws it ([seeds](./inferno-policy.md#seeds)).
`configureRunStart` prepares the wave-69 director, side included, before the opening actors are
created; a tick-zero edit that keeps wave 69 only re-sides the existing glyph. Live runs, reset and
replay therefore agree before the first move. Mid-fight edits apply from the next attempt. A Take
Over keeps the recorded choice (`runStartMechanicsKeys`), even at tick zero. Manual glyph respawn
restarts from the center in the remembered direction.

## Automatic sets

`zukSets` (on by default), [`setScheduler.ts`](../../src/encounters/zuk/setScheduler.ts):

- Opening set 72 ticks after the current start (the one recorded observation), then every 350.
- The clock pauses the first time Zuk drops below 600 (exactly 600 keeps running) and stays paused
  while healing returns him to exactly 600. The scheduler resumes when it observes the Jad latch,
  adding 175 once. A qualifying hit sets the latch in normal play; a raw HP edit can set it without
  a spawn. Show Jad alone does not set it. Then 350 repeats for the rest of the fight.
- **Skipped opening** (below 600 before the opening set): the surviving clock is the ordinary
  350-tick period with the elapsed opening time already spent, so the next set lands
  `525 − elapsed` after Jad rather than `247 − elapsed`. Simulator policy; the captures do not
  distinguish these alternatives ([open questions § 2](./zuk-open-questions.md#2-set-schedule-branches--opening-skipped-opening-recovery-cap)).
- **Unsupported path**: healing above 600 while paused before Jad admits no further sets and
  publishes a null countdown until reset.
- Admissions follow the player phase, are uncapped, and never replace or release surviving actors.
  No population cap is modeled; that is not a claim the game has none.
- Toggling `zukSets` off freezes the countdown while HP and the Jad flag are still observed. Manual
  spawn, replace, clear and glyph reset never start or re-arm the clock. The `zukSetTimer` overlay
  is a player-driven practice clock and never reads the scheduler's countdown.

## Healing

- **Jal-MejJak**: first cast 4 ticks after spawn, then every 3; each heal lands 4 ticks after its
  cast. Amount 15-24 (published range) drawn uniformly from the seeded RNG; uniform is the model.
  A tagged healer stops new heal casts; already-cast heals still land.
- **Tagged Jal-MejJak lockout**: on a healer's first engagement only (the tick a player attack first
  lands on it), new player attacks on that healer are refused for that one tick; later engagements
  never block. A player attack interaction on it during the refused tick is canceled, so attacking
  it again needs a fresh click. Other healers are unaffected, so alternating clicks between two
  healers keep attacking. Pinned by the "Zuk healer incoming lockout integration" tests in
  [`ZukEncounter.test.ts`](../../src/encounters/zuk/__tests__/ZukEncounter.test.ts) (first impact
  18, unblocked from 19). Simulator policy; the captures do not distinguish these alternatives: the
  W69 t1086 repeat special (facts § 6) bounds the refusal, but does not establish a one-tick rule or
  equal treatment of ordinary and special attacks.
- **Yt-HurKot**: a fixed **10 per action** every 4 ticks (the packet fit in facts § 5, not a
  transmitted rule and not "proved exactly 10"), applied on the cast tick, first on the healer's
  first tick in range. Heals only while **untagged** and adjacent to its parent (the TzTok-Jad
  JalTok-Jad paragraph); a tagged healer pursues and melees without healing. From its Jad's death
  sequence to removal it still walks to and heals it, restoring nothing (waves 67-68, Q t4842-4843;
  wave 69's healers are all tagged by then).
- **Yt-HurKot retaliation** is the standard mode at speed 4: first swing at splat + 2 after a hit,
  cast + 3 after a splash (waves 67-68, 6/6 and P t9822). Wave 69's captured engagements are splashes
  whose healers turn at cast + 1 and swing on arrival (W69 t881 -> t882, t886), consistent with it.
- A pending supplied heal is canceled when its caster dies or despawns. This is simulator policy;
  the game's boundary is unobserved.

## Jad-healer placement

Jad's three healers spawn on distinct tiles drawn uniformly without replacement from the open tiles
of a 3×4 box north of him, towards Zuk: x = Jad.x..Jad.x+2, y = Jad.y+5..Jad.y+8 (`[30-32, 40-43]` for
Jad at `[30,35]`), never on the player's tile. Should fewer than three box tiles be open, the whole
box is used. The draws come from their own stream derived from the attempt's NPC seed
([seeds](./inferno-policy.md#seeds)), so they shift no other wave-69 draw. Basis:
[JalTok-Jad](https://oldschool.runescape.wiki/w/JalTok-Jad)
("always spawn north of it") and both captures' six healers, all in the box on distinct tiles (W69 t877
`[30,41] [31,40] [30,40]`; tbow t300 `[32,40] [30,43] [31,40]`). The box is fitted to those six
samples and is not a verified game rule ([open questions § 6](./zuk-open-questions.md#6-jad-healer-placement--n2)).

## Jad-healer return

Player tags persist regardless of distance while the player is alive and present, including while
frozen. A distance-based Inferno reset is not modeled without Inferno-specific evidence, which does
not establish that none exists. A dead or missing player releases aggression: the target and
last-incoming timestamp clear, pending incoming attacks are kept so a later impact can re-engage. An
unengaged healer takes the standard combat step towards its parent (its contact destination, with NPC occupancy), stopping in adjacent healing range; under its
parent it stays. Waves 67-68 captures fit this in 63/64 untagged steps, and wave 69's one untagged step
(tbow capture t301) fits it (inferno facts spec, Yt-HurKot). Binds stop movement, not
target bookkeeping.

## Live Jad combat

Executor [`jad.ts`](../../src/npcs/inferno/jad.ts); the Inferno registers one JalTok-Jad with `LIVE_JAD_EXECUTION` for waves 67-69 (ordinary Jads carry their own opening).

- Seeded equal magic/ranged odds at distance; equal odds among magic/ranged/melee when the footprint
  melee predicate allows melee. Not measured probabilities.
- Opening at spawn + 8; provisional footprint-edge reach 15. Movement uses the standard
  [NPC pursuit and overlap escape](../architecture/npc-combat-movement.md); attack clocks and
  targeting are unchanged by it.
- Ranged/magic release at cue + 3 with protection checked at release; melee is immediate. Magic
  keeps its distance-dependent projectile profile.
- Initial glyph attacks deal real damage. Retaliation changes later targeting; a pending windup
  keeps its target and cancels if that target dies; the next action can reacquire the player.
- Rock 451 lands on the pre-movement target tile at release with additional delay modeled as zero
  (the capture omits it); height 92 is recorded. Graphic 157 stays disabled: its height is unknown.
- Jad and his children are removed at `deathAnimationTick + 6`. The death animation tick follows the
  queued-death rule ([`npc-hit-queue-and-death.md`](../architecture/npc-hit-queue-and-death.md)), so
  it is not a fixed delay after the killing hit. Example, the one observation: W69 zero headbar t983,
  death sequence t984, removal t990.
- Jad, the set members and both healer families die as queued NPCs
  ([`npc-hit-queue-and-death.md`](../architecture/npc-hit-queue-and-death.md)): one killed in its own hit
  pass still takes that tick's turn, a released attack still lands, an unreleased Jad windup is
  canceled, and a dying healer never heals.

## Set melee

Ranger crush and mager stab use their published stats through the shared formulas, so 19/52 are not
duplicated as overrides. When melee and the primary attack are both reachable the species profiles
weigh them equally, a seeded 50/50; with only the primary reachable no style draw occurs. Melee
resolves on the action tick with ordinary protection-prayer handling, the zero-delay melee model of
[Hit delay](https://oldschool.runescape.wiki/w/Hit_delay); no species-specific windup is established.
Both styles share the four-tick clock. Opening guards (+6 mager, +8 ranger), retaliation, targeting
and primary-style pursuit are unaffected by it; proximity does not steal an attack from the glyph, and
adjacent glyph attacks use the same selection (unobserved). Melee emits its own animation and event,
no projectile, no mager impact 131, and no sound (none identified; the distance-attack 598 is not
reused). Configured reach: magers 15, rangers 16. Simulator policy: W69 bounds reach only from below
(facts § 4); an anonymous community report that wave-69 rangers outreach the ordinary 15 is the only
indication for 16 and does not verify it.

Set members use the standard [retaliation policy](../architecture/npc-retaliation.md) with the
separate recorded opening guards.

## Glyph damage and destruction

A living glyph protects the player only inside its [shadow](./zuk-facts-spec.md#shadow). The glyph
takes real minion damage through the shared NPC-target accuracy/damage pipeline with
**assumed** defence inputs: combat levels 1 and zero bonuses (no published or cache stats). Zuk's
blasts never damage it; the player cannot attack it. A dead glyph stops patrolling and protecting;
Zuk keeps his cadence and attacks the player. Set members and Jad recover a dead or missing target
on their next ready action. No automatic replacement; the manual reset restores a 600-HP glyph at
the patrol center without stealing actors already on the player, and before enrage re-phases Zuk's
cast clock to it. In-flight source/target-death rules are the shared ones. At very close range
Zuk's arrival cycle can precede the normal visual launch at cycle 50; the visual start is clamped to
the arrival cycle without changing hit timing.

## Autonomous sparks

Tagged Jal-MejJak cast one volley per action through
[`generateSparkVolley`](../../src/encounters/zuk/sparks.ts), sharing the landing queue with the
replayable `emit-spark-volley` command:

- Targets follow the three-strip candidate in facts § 6; the first strip containing the
  pre-movement player tile targets it, others pick uniformly within their strip. The source-relative
  footprint is applied off the recorded row as well; off-row parity is not established.
- Each spark independently draws damage 5..10, slope 40..50 and landing delay 0..5 cycles; landing
  height is zero. Draw order per spark: tile X, tile Y (both skipped for a forced player tile),
  damage, slope, landing delay. Duplicate destinations stay separate sparks.
- Landings damage at cast + 3 on the pre-movement 3×3; protection prayer does not block them. They
  survive source death, removal and Clear minions; reset and Zuk's defeat clear the queue.

## Presentation

Asset identity alone does not establish a mechanic.

- **Hit sounds**: one sound per resolved damage callback, including zero, burn and lethal damage,
  never healing; same-tick hits stay separate. Jad/Zuk 410, set members 600, Jad healers 610
  (transferred from regular healer 7701 to 7705), enrage healers 900; Jad melee 408 (transferred
  from challenge 10623 to 7704). Distance suppression and exceptional duplicates are not reproduced.
- **Death sounds**: 599 set members, 409 Jad, one 899 per enrage-healer death (the recording omits
  it once, on a distant burn-lethal death), each on its death-animation tick under the queued-death
  rule, not a fixed delay after the kill (W69 examples t155 -> t156, t983 -> t984, t1138 -> t1139).
  No Zuk, glyph or Jad-healer death sound, and no separate Yt-HurKot heal sound, is identified; none
  is invented.
- **Enrage-healer cast 155**: area range 8, delay 51 (W69 t1069/t1073, lines 18033/18160). A tagged
  healer's volley uses that same cast event; each landing keeps its own 659 and 156.
- **Heal graphic 444** belongs to the healed parent at height 256, one per parent per application
  tick, with additional delay modeled as zero.
- Configured defend clips react to nonlethal hits through the animation priority path,
  which does not reproduce the server's delayed-defend ordering.
- **Ranger pair**: facing snaps to eight directions and a separated pair launches from the actor's
  center. This matches 104/120 recorded origins (52/60 pairs); t126, t146, t508, t536, t588, t1249,
  t1265 and t1277 differ, and t126/t130 give different origins for the same target position. Timing
  and other fields match all 120. At projectile distance 0-1 the arrival cycle (46/54) precedes the
  launch at 60, so the visual start is clamped to arrival.
- Mager impact 131 (height 124, end cycle), glyph 7568 on Zuk's blast end cycle, healer spawn 2864
  on automatic and manual spawns.
- Cache 2686/2695 rev 240 decodes all seven NPCs, their 46 sequences and the effects; melee clips
  7604/7612 are populated. Sounds 410/600/610 were synthesized from the full sound cache. Available
  is not the same as preloaded or emitted.

## Simulator contracts

- Boss defeat enters a 6-tick `resolving` phase (`ZUK_VICTORY_COMPLETION_DELAY_TICKS`, the cache
  length of seq 7562 plus one) before `victory`.
- Seeds are the Inferno's ([seeds](./inferno-policy.md#seeds)). Wave 69 uses them for the random
  glyph side ([above](#glyph-start-direction)) and the independent Jad-healer stream
  ([above](#jad-healer-placement)); the director's other decisions use the attempt's NPC seed.
- Demonstrations create inert actors with no damage or healing. Manual layouts are the recorded
  ones; Jad's healers follow [Jad-healer placement](#jad-healer-placement), also when spawned manually.
- Fields the capture omits are never defaulted, except where a model above explicitly sets zero.
