# Sensory Clouding — what is still unsettled

What the captures pin is in [`yama-facts-spec.md`](./yama-facts-spec.md) (§ 2.4). This
file lists what shipped on inference, and what would settle each item.

Captures (fixture modules `sensory1` and `sensory2`, see the
[capture index](./yama-facts-spec.md#capture-index)):

- `yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt` — contiguous ticks 8380-9108,
  P1→P3, phase-3 control **8839**, ending in the player's death at 9088. The only P1→P3 capture with
  the player at range throughout. No melee swing was identified in these Sensory samples, although
  the recorded end-of-tick positions put Yama's footprint within distance 1 of the player
  (`captureConformance.test.ts`, "Yama closes to melee range"). Phase 3 is 249 ticks rather than a
  kill.
- `yama-contract-of-sensory-clouding-p3-contributed-packet-data(incomplete).txt` — phase 3 only;
  backs the scorching-shackles entries and a second pursuit expectation.

## 1. Max hit 56 is a floor shipped as a ceiling

**Shipped:** `rangedMagicDamage: [0, 56]` in `SENSORY_CLOUDING_CONFIG`
([`contractConfig.ts`](../../src/encounters/yamaP3/contractConfig.ts)).

An unprayed magic auto landed 56 at t9029 as an ordinary `hit id=16`; no `DAMAGE_MAX_ME` (id 43)
splat appears, so 56 is a draw and the true ceiling is ≥ 56. The Wiki's flat 53 for every contract is
falsified here. **Would settle it:** an id-43 splat from Yama under this contract.

## 2. Prayer penetration 0.17 is fitted, coupled to entry 1

**Shipped:** `INCREASED_PRAYER_PENETRATION` = `{ type: 'reduce', value: 0.17 }` for ranged/magic. The
Wiki says only "increased prayer penetration".

The leak is `floor(roll × rate)`, so the ceiling is `floor(56 × rate)`. 17% is the fitted rate if 56
and 9 are the two ceilings (16% gives 8, 18% gives 10); the samples establish lower bounds on both.
Both captures reach 9 (capture 2 t1648: Protect from Missiles up two ticks before impact,
`tracking_damage_taken_from_npcs` +9, single hitsplat).

Pooled data: 38 strict single-hitsplat prayed phase-3 landings (24 + 14); ten read 0 and the
positives are `1 2 2 3 3 4 4 4 4 4 4 4 4 5 5 6 6 6 7 7 7 7 7 7 8 8 9 9`. Zeros mix accuracy misses
with rolls below `100/17 ≈ 5.9`, so they are not a miss-rate estimate.

**Uncertain:** a true max above 56 lowers the rate (max 60 at 0.15 also gives 9); the two cannot be
fitted independently. **Would settle it:** an id-43 splat from Yama.

## 3. Melee is untested on this contract

**Shipped:** the sigil melee baseline, `meleeDamage` `[0, 53]` at 48% penetration; this contract
overrides only ranged/magic. No melee swing was identified in these Sensory samples, so neither
number is observed here. **Would settle it:** a Yama melee swing that connects under this contract.

## 4. Yama's melee spawns a flare, and pursuit makes that constant

**Shipped:** every Yama melee queues a void flare (`didMeleeThisTick` in
[`voidFlareCoordinator.ts`](../../src/encounters/yamaP3/voidFlareCoordinator.ts)).

**Why uncertain:** under pursuit Yama swings on nearly every beat. Over 210 simulated ticks the
contract produced 29 single flares where a stationary contract produced 6 in pairs, and the singles
fill `voidFlares.maxActive` so the beat pair never spawns. That emerges from two independently
sourced rules and may be right, but no melee swing was identified in the Sensory captures. Across
contracts no melee-flare detonation is measured (one Glyphic E=360 single ends without detonating).
`captureConformance.test.ts` runs its flare-beat check with pursuit disabled for this reason.
**Would settle it:** Yama meleeing under any contract, or a Wiki statement about flares during melee.

## 5. Pursuit

[`npcPursuit.ts`](../../src/core/npcPursuit.ts) routes through
[`npcRouteFinding.ts`](../../src/core/npcRouteFinding.ts). In production it is reachable through Yama
under this contract, the only variant whose phase-3 Yama leaves his spawn tile, and through Sol
Heredit, whose profile differs (§ 5.3).

| Behavior | Authority |
|---|---|
| Neighbor order W, E, S, N, SW, SE, NW, NE; arrival tested on dequeue | RSMod `RouteFinding.kt` at `fa13b3f` (ISC); capture conformance below |
| Destination ring is the 4 orthogonal neighbors, never diagonals | RuneLite `runelite-api/.../coords/WorldArea.java:175-194` (`isInMeleeDistance`: axis distances sum to exactly 1) |
| Per-step wall and footprint-edge legality | [`npcMovementCollision.ts`](../../src/core/npcMovementCollision.ts), using the client `CollisionFlag` masks |

### 5.1 Movements the model does not reproduce

**Shipped:** 119 of 120 deterministic phase-3 movements in capture 1 and 46 of 50 in the contributed
capture; `SENSORY_PURSUIT_EXPECTATIONS` pins the considered counts and each divergent tick. Bind
windows and random under-footprint sidesteps are excluded by construction. The alternatives score
42/120 (other neighbor order) and 97/120 (eight-neighbor destination ring).

**Capture 1, t8888 (shifted t49):** the player stepped south off Yama's row and Yama carried straight
**east** towards the tile north of the player, where the model cuts the **diagonal**. A one-tick-staler
target scored 64.5% against 99.2% and was rejected. Leading hypothesis: the arena forbids the
diagonal — Yama's SW corner never drops below **y=21** in phase 3 while the player reaches y=20, and
the tests use a permissive `canOccupy` where production uses `YAMA_PURSUIT.canOccupy`, which requires
every tile of the 5×5 footprint to be walkable in the cache-derived set. If so, the app already
reproduces it; it cannot be checked offline (no cache fixture).

**Contributed capture:** four more at shifted ticks 19, 20, 89 and 90, in adjacent pairs; whether
they share that cause is open. They are pinned as literal ticks.

**Would settle it:** evaluating `YAMA_PURSUIT.canOccupy` at `(23, 20)` against the real arena; if
unoccupiable, capture 1's divergence list would be empty.

### 5.2 The under-footprint step

**Shipped (`underFootprint: 'random-cardinal'`, Yama and Sol):** with the player beneath the
footprint, one cardinal tile chosen by two rolls (first `< 0.5` picks the horizontal axis, second
`< 0.5` the positive direction), with **no reroll** — a blocked choice means the boss stays still
that tick. The scheme never grants mobility a normal step would not.

- **Yama:** no discriminating underfoot sample. The conformance test excludes these ticks because
  they are not deterministic.
- **Sol:** two cardinal steps (N:7389 north, N:7754 west; see
  [`sol-heredit-unverified.md`](./sol-heredit-unverified.md), "Underneath escape"), insufficient to
  establish a distribution; both also fit deterministic alternatives.

Simulator policy; the captures do not distinguish these alternatives. **Would settle it:** a player
standing under a pursuing boss for 20+ ticks, two or three times, including against a wall.

### 5.3 The unreachable-destination fallback

The two profiles use different unreachable-target policies:

- **Yama** selects `unreachable: 'nearest-reachable'` (`YAMA_PURSUIT` in
  [`YamaEncounter.ts`](../../src/encounters/yamaP3/YamaEncounter.ts)). When the search exhausts
  without reaching the ring, the route goes to the reachable tile within a radius-10 square of the
  target, under BFS distance 100, minimizing squared distance to the target and then BFS distance.
- **Sol** selects `unreachable: 'hold'` (`solPursuitProfile` in
  [`sol.ts`](../../src/npcs/colosseum/sol.ts)): no route, no step.

Direct route-finder calls use the fallback unless `moveNear: false`; pursuit profiles choose
explicitly. Both arenas are open rectangles and no capture contains an unreachable player, so
neither choice is observed. **Would settle it:** a pursuing NPC separated from the player by
impassable terrain.

## 6. Scorching shackles: the bind is 21 ticks where the Wiki says 20

**Shipped:** `delayTicks: 2, durationTicks: 21` — Yama cannot move on cast+2 through cast+22 and steps
again on cast+23. Six burn pulses, four ticks apart (five burns in capture 1 each run exactly six
splats: t8846-8866, 8902-8922, 8932-8952, 9046-9066), where /w/Burn says five.

The Wiki says 20 ticks. Both captures say 21 on all eight casts that no later cast rebinds through,
with no spread (`nextStep − (cast + 2)` = 21). **Would settle it:** a cast whose bind lasts other
than 21 ticks.

`isNpcBound` is half-open over `[boundFromTick, boundUntilTick)`, so the release tick is
`cast + delayTicks + durationTicks`; duration moves the release and the blocked count together, and
the tests assert both.

## 6b. Scorching shackles: the hit delay is flat over every observed distance

**Shipped:** `hitDelayTicks: 3` on the registry entry, and the bind as a separate `delayTicks: 2`.

Of ten casts, eight have the player as the only thing hitting Yama in the window (capture 2's magic
thrall owns some splats); all eight land on cast+3 across footprint distances **1, 2, 3 and 4**, and
five of them splat `hit id=12, value=0` yet still bind and burn. A formula flat over 1-4 fits
equally well — `1 + floor((3 + D) / 6) + 1` on center distance `D = distance + 2` gives 3 for 1-6
and 4 from 7. The bow's maximum range is 10.

The bind is its own constant, not `hitDelayTicks − 1`: cast+2 is measured two-sided on the **seven**
casts that catch Yama mid-chase, whereas "the bind lands on arrival and the hitsplat adds the
[processing-order tick](https://oldschool.runescape.wiki/w/Hit_delay#Processing_order_delay)" only
explains the difference. **Would settle it:** a cast at distance 7 or beyond.

The weapon's projectile timing does not give the hit delay:

- `PROJ_ANIM_TIMINGS.arrow` gives `1 + floor((46 + 5 × distance) / 30)` = **2** at distances 1-2,
  where the captures show 3 (capture 1 t8929, contributed t1564 and t1634).
- The captured profile (`starttime=46`, `endtime = 50 + 4 × distance`, exact on all ten casts) gives
  `1 + floor(54 / 30) = 2` at distance 1.
- No profile can: the same bow's ordinary dragon arrow lands a tick earlier from the same tile
  (capture 1 t8929 spec at distance 2 splats on +3; t8933 arrow at distance 2 on +2) with a *higher*
  `endtime` (56 against 54).

**Also unobserved:** the bind is written at the swing, so it survives a player death in the three
ticks before the projectile lands, although `CombatSystem` discards the pending damage.

## 7. Scorching shackles: whether a refused special costs energy

**Shipped:** fully refused against a non-demon (`targetAttribute: 'demon'`) — no energy spent, no
effects, the swing resolves as an ordinary attack. The Wiki documents the message *"Scorching
shackles won't work against a non-demon enemy."* but not whether the 25% is consumed. **Would settle
it:** the special attack energy before and after the special is refused against a non-demon.
